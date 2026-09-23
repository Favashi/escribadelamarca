#!/usr/bin/env python3
"""
Descarga las fichas del Codex LMDE (https://github.com/diacritica/codexlmde) y guarda sus
metadatos de juego en data/codex_modulos.csv, para que catalog_sync.py los fusione con el catálogo.

Uso:
    python3 scripts/codex_fetch.py

Campos extraídos del front matter de cada ficha: título, código, niveles, personajes, sesiones,
etiquetas, resumen y URL de la ficha. El cruce con el catálogo se hace por código de publicación.
"""
import csv
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "codex_modulos.csv"
API = "https://api.github.com/repos/diacritica/codexlmde/contents/codex/content/es/posts"
RAW = "https://raw.githubusercontent.com/diacritica/codexlmde/master/codex/content/es/posts/"
SITE = "https://github.com/diacritica/codexlmde/blob/master/codex/content/es/posts/"

FIELDS = ["codigo", "titulo", "nivel_min", "nivel_max", "personajes_min", "personajes_max",
          "sesiones", "etiquetas", "resumen", "fichero", "url"]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "escribadelamarca"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def front_matter(text):
    text = text.lstrip("\ufeff").replace("\r\n", "\n")
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
    if not m:
        return {}
    data, key = {}, None
    for line in m.group(1).splitlines():
        if re.match(r"^\s*-\s+", line) and key:            # elemento de lista
            if not isinstance(data.get(key), list):
                data[key] = []
            data[key].append(line.split("-", 1)[1].strip().strip('"'))
            continue
        kv = re.match(r"^([A-Za-z_]+):\s*(.*)$", line)
        if kv:
            key, val = kv.group(1), kv.group(2).strip()
            data[key] = val.strip('"') if val else []
    return data


def num(v):
    v = str(v or "").strip()
    m = re.match(r"^\d+", v)
    return m.group(0) if m else ""


def code_of(title, filename):
    # "B2 - La isla misteriosa" o fichero "b2-la-isla-misteriosa.md"
    m = re.match(r"^\s*([A-Za-z]{1,3}\d{0,3})\s*[-–:]\s+", title or "")
    if m:
        return m.group(1).upper()
    m = re.match(r"^([A-Za-z]{1,3}\d{1,3})-", filename)
    return m.group(1).upper() if m else ""


def main():
    listing = json.loads(get(API))
    files = sorted(x["name"] for x in listing if x["name"].endswith(".md"))
    rows = []
    for i, name in enumerate(files, 1):
        fm = front_matter(get(RAW + urllib.parse.quote(name)))
        if not fm or str(fm.get("draft", "")).lower() == "true":
            continue
        tags = fm.get("tags") if isinstance(fm.get("tags"), list) else []
        title = fm.get("title", "") if isinstance(fm.get("title"), str) else ""
        rows.append({
            "codigo": code_of(title, name),
            "titulo": re.sub(r"^\s*[A-Za-z]{1,3}\d{0,3}\s*[-–:]\s+", "", title).strip(),
            "nivel_min": num(fm.get("minlevels")), "nivel_max": num(fm.get("maxlevels")),
            "personajes_min": num(fm.get("mincharacters")), "personajes_max": num(fm.get("maxcharacters")),
            "sesiones": num(fm.get("session")),
            "etiquetas": "|".join(t for t in tags if t),
            "resumen": fm.get("summary", "") if isinstance(fm.get("summary"), str) else "",
            "fichero": name,
            "url": SITE + urllib.parse.quote(name),
        })
        print(f"\r{i}/{len(files)}", end="", file=sys.stderr)
    print(file=sys.stderr)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"{OUT.relative_to(ROOT)}: {len(rows)} fichas ({sum(1 for r in rows if r['codigo'])} con código)")


if __name__ == "__main__":
    main()
