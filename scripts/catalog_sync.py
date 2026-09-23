#!/usr/bin/env python3
"""
Genera una migración SQL que sincroniza el catálogo con data/catalogo_marca_del_este.csv.

Si existe data/codex_modulos.csv (generado por scripts/codex_fetch.py), añade los datos de juego
del Codex LMDE (niveles, personajes, sesiones, etiquetas, resumen) cruzando por código de publicación.

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
import difflib
import unicodedata
import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "catalogo_marca_del_este.csv"
CODEX_PATH = ROOT / "data" / "codex_modulos.csv"
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


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", " ", s).strip()


def load_codex():
    """Datos del Codex por código; si hay varias fichas con el mismo código se elige por parecido del título."""
    if not CODEX_PATH.exists():
        return {}
    by_code = {}
    with CODEX_PATH.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r["codigo"]:
                by_code.setdefault(r["codigo"].upper(), []).append(r)
    # Etiquetas canónicas: misma etiqueta con distinta capitalización → la forma más frecuente
    counts = {}
    for rows in by_code.values():
        for r in rows:
            for t in filter(None, r["etiquetas"].split("|")):
                counts.setdefault(norm(t), {}).setdefault(t.strip(), 0)
                counts[norm(t)][t.strip()] += 1
    canon = {k: max(v, key=v.get) for k, v in counts.items()}
    for rows in by_code.values():
        for r in rows:
            r["tags"] = sorted({canon[norm(t)] for t in r["etiquetas"].split("|") if t.strip()})
    return by_code


def codex_for(row, codex):
    cands = codex.get(row["codigo_publicacion"].strip().upper(), [])
    if not cands:
        return None
    return max(cands, key=lambda c: difflib.SequenceMatcher(None, norm(c["titulo"]), norm(row["titulo"])).ratio())


def q_array(items):
    return "array[" + ", ".join(q(x) for x in items) + "]::text[]" if items else "'{}'::text[]"


def ref_of(row):
    return row["clave_sombra"].strip() or f"codex:{row['codigo_publicacion'].strip()}"


def codex_values(c):
    if not c:
        return ["null"] * 5 + ["'{}'::text[]", "null", "null"]
    def n(v):
        return v if str(v).isdigit() else "null"
    lo, hi = n(c["nivel_min"]), n(c["nivel_max"])
    if lo != "null" and hi != "null" and int(lo) > int(hi):
        lo, hi = hi, lo
    plo, phi = n(c["personajes_min"]), n(c["personajes_max"])
    if plo != "null" and phi != "null" and int(plo) > int(phi):
        plo, phi = phi, plo
    return [lo, hi, plo, phi, n(c["sesiones"]), q_array(c["tags"]), q(c["resumen"].strip()), q(c["url"])]


def build_sql(rows, codex):
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
        "  meta, status, source, min_level, max_level, min_players, max_players, sessions, tags, summary, codex_url)",
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
            *codex_values(codex_for(r, codex)),
        ]) + ")")
    out.append(",\n".join(values))
    out += [
        "on conflict (ref) do update set",
        "  code = excluded.code, series = excluded.series, number = excluded.number,",
        "  title = excluded.title, author = excluded.author, kind = excluded.kind,",
        "  pages = excluded.pages, binding = excluded.binding, interior = excluded.interior,",
        "  price_eur = excluded.price_eur, catalog_date = excluded.catalog_date,",
        "  isbn_published = excluded.isbn_published, sombra_key = excluded.sombra_key,",
        "  tesoros_sku = excluded.tesoros_sku, meta = excluded.meta,",
        # Datos de juego: solo se sobrescriben si el Codex trae valor (se respeta lo editado a mano por el admin)
        "  min_level = coalesce(excluded.min_level, c.min_level), max_level = coalesce(excluded.max_level, c.max_level),",
        "  min_players = coalesce(excluded.min_players, c.min_players), max_players = coalesce(excluded.max_players, c.max_players),",
        "  sessions = coalesce(excluded.sessions, c.sessions),",
        "  tags = case when cardinality(excluded.tags) > 0 then excluded.tags else c.tags end,",
        "  summary = coalesce(excluded.summary, c.summary), codex_url = coalesce(excluded.codex_url, c.codex_url)",
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

    codex = load_codex()
    sql, n_barcodes = build_sql(rows, codex)
    if args.stdout:
        print(sql)
        return
    # La migración debe ordenarse después de todas las existentes (si no, `supabase db push` la rechaza)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    existing = sorted(p.name[:14] for p in MIGRATIONS.glob("*.sql") if p.name[:14].isdigit())
    if existing and stamp <= existing[-1]:
        stamp = str(int(existing[-1]) + 1)
    path = MIGRATIONS / f"{stamp}_{args.name}.sql"
    path.write_text(sql, encoding="utf-8")
    n_codex = sum(1 for r in rows if codex_for(r, codex))
    print(f"{path.relative_to(ROOT)}: {len(rows)} publicaciones, {n_barcodes} códigos de barras, {n_codex} con datos del Codex")


if __name__ == "__main__":
    main()
