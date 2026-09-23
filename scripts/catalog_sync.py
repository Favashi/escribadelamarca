#!/usr/bin/env python3
"""
Genera una migración SQL que sincroniza el catálogo con data/catalogo_marca_del_este.csv.

Uso:
    python3 scripts/catalog_sync.py                # crea supabase/migrations/<timestamp>_catalog_sync.sql
    python3 scripts/catalog_sync.py --name import  # nombre personalizado
    python3 scripts/catalog_sync.py --stdout       # solo imprime el SQL

Reglas de la sincronización (idempotente, se puede repetir):
  * Cada fila se identifica por `ref`: la clave de Sombra o, si no hay, `codex:<codigo_publicacion>`.
  * Filas nuevas → se insertan (categoría según SERIES_CATEGORY).
  * Filas existentes con source='csv' → se actualizan sus datos, EXCEPTO la categoría y la portada
    (se respetan los cambios hechos por el admin en la app).
  * Libros creados desde la app (source='app') no se tocan.
  * Códigos de barras: solo EAN-13 con checksum válido; se añaden como source='sombra', sin verificar.
    Nunca se borran códigos ni libros: eso se hace a mano (ver MEJORAS.md).
"""
import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "catalogo_marca_del_este.csv"
MIGRATIONS = ROOT / "supabase" / "migrations"

# Serie → slug de categoría (tabla public.categories). Series no listadas → DEFAULT_CATEGORY.
SERIES_CATEGORY = {
    "CR": "reglamento", "LB": "reglamento",
    "B": "aventuras-b",
    "H": "historicas",
    "G": "ambientacion", "MP": "ambientacion",
    "BS": "bestiarios",
    "D": "suplementos", "PS": "suplementos", "SP": "suplementos",
    "CC": "otros", "AP": "otros", "CS": "otros", "HO": "otros",
}
DEFAULT_CATEGORY = "aventuras"


def q(value):
    """Literal SQL (NULL si vacío)."""
    if value is None or value == "":
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def ean_ok(code):
    if len(code) != 13 or not code.isdigit():
        return False
    s = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(code[:12]))
    return (10 - s % 10) % 10 == int(code[12])


def ref_of(row):
    return row["clave_sombra"].strip() or f"codex:{row['codigo_publicacion'].strip()}"


def build_sql(rows):
    refs = [ref_of(r) for r in rows]
    dupes = {x for x in refs if refs.count(x) > 1}
    if dupes:
        sys.exit(f"ERROR: refs duplicadas en el CSV: {sorted(dupes)}")

    out = [
        "-- Generado por scripts/catalog_sync.py desde data/catalogo_marca_del_este.csv",
        f"-- {datetime.now(timezone.utc).isoformat(timespec='seconds')} · {len(rows)} publicaciones",
        "-- No editar a mano: modifica el CSV y vuelve a generar.",
        "",
        "insert into public.catalog as c (ref, code, series, number, title, author, kind, category_id,",
        "  pages, binding, interior, price_eur, catalog_date, isbn_published, sombra_key, tesoros_sku,",
        "  meta, status, source)",
        "values",
    ]
    values = []
    for r in rows:
        series = r["serie"].strip()
        cat = SERIES_CATEGORY.get(series, DEFAULT_CATEGORY)
        meta = {k: v for k, v in {
            "estado_codigo": r["estado_codigo"],
            "estado_sku_tesoros": r["estado_sku_tesoros"],
            "nota_isbn": r["nota_isbn"],
            "fuente_sombra": r["fuente_sombra"],
            "fuente_codigo": r["fuente_codigo"],
            "fuente_codex": r["fuente_codex"],
        }.items() if v}
        number = r["numero"].strip()
        values.append("  (" + ", ".join([
            q(ref_of(r)), q(r["codigo_publicacion"].strip()), q(series),
            number if number.isdigit() else "null",
            q(r["titulo"].strip()), q(r["autor"].strip()), q(r["tipo"].strip()),
            f"(select id from public.categories where slug = {q(cat)})",
            q(r["paginas"].strip()), q(r["encuadernacion"].strip()), q(r["interior"].strip()),
            r["pvp_eur"].strip() or "null",
            q(r["fecha_catalogo"].strip()),
            q(r["isbn_publicado"].strip()), q(r["clave_sombra"].strip()), q(r["sku_tesoros"].strip()),
            q(json.dumps(meta, ensure_ascii=False)) + "::jsonb",
            "'approved'", "'csv'",
        ]) + ")")
    out.append(",\n".join(values))
    out += [
        "on conflict (ref) do update set",
        "  code = excluded.code, series = excluded.series, number = excluded.number,",
        "  title = excluded.title, author = excluded.author, kind = excluded.kind,",
        "  pages = excluded.pages, binding = excluded.binding, interior = excluded.interior,",
        "  price_eur = excluded.price_eur, catalog_date = excluded.catalog_date,",
        "  isbn_published = excluded.isbn_published, sombra_key = excluded.sombra_key,",
        "  tesoros_sku = excluded.tesoros_sku, meta = excluded.meta",
        "where c.source = 'csv';",
        "",
    ]

    barcodes = []
    for r in rows:
        code = r["codigo_barras_ean13"].strip()
        if code and ean_ok(code):
            barcodes.append(f"  ({q(code)}, {q(ref_of(r))})")
    if barcodes:
        out += [
            "insert into public.catalog_barcodes (code, catalog_id, source, status, verified)",
            "select v.code, c.id, 'sombra', 'approved', false",
            "from (values",
            ",\n".join(barcodes),
            ") as v(code, ref)",
            "join public.catalog c on c.ref = v.ref",
            "on conflict (code, catalog_id) do nothing;",
            "",
        ]
    return "\n".join(out), len(barcodes)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", default="catalog_sync")
    ap.add_argument("--stdout", action="store_true")
    args = ap.parse_args()

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r.get("titulo", "").strip()]

    sql, n_barcodes = build_sql(rows)
    if args.stdout:
        print(sql)
        return
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    path = MIGRATIONS / f"{stamp}_{args.name}.sql"
    path.write_text(sql, encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {len(rows)} publicaciones, {n_barcodes} códigos de barras")


if __name__ == "__main__":
    main()
