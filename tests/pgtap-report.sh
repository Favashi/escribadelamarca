#!/usr/bin/env bash
# Salida TAP de cada fichero pgTAP (con el nombre de cada prueba) en reports/pgtap/, para el resumen del CI.
# `supabase test db` es quien decide si pasan; esto solo guarda el detalle. Necesita el Supabase local levantado.
set -u
DB="supabase_db_$(grep -m1 -oE '^project_id = "[^"]+"' supabase/config.toml | cut -d'"' -f2)"
mkdir -p reports/pgtap
for f in supabase/tests/database/*.test.sql; do
  docker exec -i "$DB" psql -U postgres -X -q -t -A < "$f" > "reports/pgtap/$(basename "$f" .test.sql).tap" 2>&1 || true
done
ls reports/pgtap
