#!/usr/bin/env python3
"""
Lleva al CSV fuente (data/catalogo_marca_del_este.csv) lo que se ha corregido en la app, para que el CSV siga
siendo la fuente completa del catálogo.

Uso (la clave service_role está en Supabase → Project Settings → API Keys; NO la guardes en ningún fichero):
    SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/catalog_export.py --dry-run   # solo muestra los cambios
    SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/catalog_export.py             # escribe el CSV

Qué hace:
  * Campos corregidos en la app (catalog.locked_fields: ediciones del admin o sugerencias validadas) de título,
    autor, páginas y código de publicación → se copian a la fila correspondiente del CSV.
  * Códigos de barras: la columna codigo_barras_ean13 pasa a ser el código aprobado en la app (con preferencia
    por uno verificado). Si el admin quitó el código del CSV (p. ej. un duplicado), se vacía.
  * Lo que no cabe en el CSV fuente (libros creados en la app, datos de juego corregidos) se deja en
    data/correcciones_app.csv para revisarlo a mano.
Después: revisa el diff, haz commit y, si quieres, genera la migración con catalog_sync.py.
"""
import argparse
import csv
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "catalogo_marca_del_este.csv"
REPORT_PATH = ROOT / "data" / "correcciones_app.csv"

# Campo de la app → columna del CSV
FIELD_COLUMN = {"title": "titulo", "author": "autor", "pages": "paginas", "code": "codigo_publicacion"}
GAME_FIELDS = ["min_level", "max_level", "min_players", "max_players", "sessions", "tags", "summary"]


def supabase_url():
    cfg = (ROOT / "js" / "config.js").read_text(encoding="utf-8")
    m = re.search(r"SUPABASE_URL = '([^']+)'", cfg)
    if not m:
        sys.exit("No se encontró SUPABASE_URL en js/config.js")
    return m.group(1)


def fetch(table, select, key, url):
    rows, start, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{url}/rest/v1/{table}?select={select}",
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Range": f"{start}-{start + page - 1}"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            chunk = json.loads(r.read())
        rows += chunk
        if len(chunk) < page:
            return rows
        start += page


def ean_ok(code):
    if not code or len(code) != 13 or not code.isdigit():
        return False
    s = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(code[:12]))
    return (10 - s % 10) % 10 == int(code[12])


def ref_of(row):
    return row["clave_sombra"].strip() or f"codex:{row['codigo_publicacion'].strip()}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="muestra los cambios sin escribir ficheros")
    args = ap.parse_args()

    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        sys.exit("Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API Keys).")
    url = supabase_url()

    books = fetch("catalog", "id,ref,code,series,number,title,author,pages,locked_fields,source,status,"
                  + ",".join(GAME_FIELDS) + ",created_at", key, url)
    codes = fetch("catalog_barcodes", "code,catalog_id,status,verified,source", key, url)
    codes_by_book = {}
    for c in codes:
        if c["status"] == "approved":
            codes_by_book.setdefault(c["catalog_id"], []).append(c)

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames
        rows = list(reader)
    by_ref = {ref_of(r): r for r in rows}

    changes, report = [], []
    for b in books:
        row = by_ref.get(b.get("ref") or "")
        locked = set(b.get("locked_fields") or [])
        label = f"{b.get('code') or ''} {b['title']}".strip()

        if row is None:
            if b["source"] == "app" and b["status"] == "approved":
                report.append({"tipo": "libro creado en la app", "codigo": b.get("code") or "", "titulo": b["title"],
                               "detalle": json.dumps({k: b.get(k) for k in ["author", "pages"] + GAME_FIELDS}, ensure_ascii=False)})
            continue

        # 1) Campos corregidos en la app
        for field, col in FIELD_COLUMN.items():
            if field not in locked:
                continue
            new = "" if b.get(field) is None else str(b[field])
            if row[col] != new:
                changes.append((label, col, row[col], new))
                row[col] = new
                if field == "code":
                    for c2, v2 in (("serie", b.get("series") or ""), ("numero", "" if b.get("number") is None else str(b["number"]))):
                        if row[c2] != v2:
                            changes.append((label, c2, row[c2], v2))
                            row[c2] = v2

        # 2) Código de barras
        approved = sorted(codes_by_book.get(b["id"], []), key=lambda c: (not c["verified"], c["code"]))
        current = row["codigo_barras_ean13"].strip()
        target = current if any(c["code"] == current for c in approved) else (approved[0]["code"] if approved else "")
        if approved and current and any(c["code"] == current for c in approved) and not next(c for c in approved if c["code"] == current)["verified"]:
            verified = [c for c in approved if c["verified"]]
            if verified:
                target = verified[0]["code"]
        if target != current:
            changes.append((label, "codigo_barras_ean13", current, target))
            row["codigo_barras_ean13"] = target
            if target:
                row["isbn_publicado"] = row["isbn_publicado"] or target
                row["ean13_checksum_valido"] = "true" if ean_ok(target) else "false"
                row["isbn13_formato_valido"] = "true" if ean_ok(target) and target[:3] in ("978", "979") else "false"
            if target and any(c["code"] == target and c["verified"] for c in approved):
                row["nota_isbn"] = "Verificado escaneando un ejemplar (app)"
            elif not target:
                row["nota_isbn"] = "Código retirado en la app (no coincidía con el ejemplar)"

        # 3) Datos de juego corregidos: no hay columnas en el CSV fuente → al informe
        game_locked = [f for f in GAME_FIELDS if f in locked]
        if game_locked:
            report.append({"tipo": "datos de juego corregidos", "codigo": b.get("code") or "", "titulo": b["title"],
                           "detalle": json.dumps({f: b.get(f) for f in game_locked}, ensure_ascii=False)})

    for label, col, old, new in changes:
        print(f"  {label}: {col}: «{old}» → «{new}»")
    print(f"\n{len(changes)} cambios en el CSV · {len(report)} entradas para revisar a mano")

    if args.dry_run:
        print("(--dry-run: no se ha escrito nada)")
        return
    if changes:
        with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=columns)
            w.writeheader()
            w.writerows(rows)
        print(f"Escrito {CSV_PATH.relative_to(ROOT)}")
    if report:
        with REPORT_PATH.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["tipo", "codigo", "titulo", "detalle"])
            w.writeheader()
            w.writerows(report)
        print(f"Escrito {REPORT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
