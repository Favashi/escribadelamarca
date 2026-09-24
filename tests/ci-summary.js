// Resumen de los tests en Markdown para la página del run de GitHub Actions ($GITHUB_STEP_SUMMARY).
// Lee reports/pgtap/*.tap (salida TAP de cada fichero pgTAP) y reports/playwright.json (reporter JSON).
// Uso: node tests/ci-summary.js >> "$GITHUB_STEP_SUMMARY"
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const REPORTS = new URL('../reports/', import.meta.url).pathname;
const out = [];
const icon = (ok) => (ok ? '✅' : '❌');
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

// ---------- pgTAP ----------
function pgtap() {
  const dir = REPORTS + 'pgtap/';
  if (!existsSync(dir)) return null;
  return readdirSync(dir).filter((f) => f.endsWith('.tap')).sort().map((f) => {
    const lines = readFileSync(dir + f, 'utf8').split('\n');
    const planned = Number(lines.map((l) => l.match(/^1\.\.(\d+)/)).find(Boolean)?.[1] ?? 0);
    const tests = lines.map((l) => l.match(/^(not ok|ok) \d+ - (.*)$/)).filter(Boolean)
      .map(([, st, name]) => ({ ok: st === 'ok', name }));
    const errors = lines.filter((l) => /^(psql:.*)?ERROR:/.test(l));
    const ok = tests.length > 0 && tests.length === planned && tests.every((t) => t.ok) && !errors.length;
    return { file: f.replace(/\.tap$/, ''), planned, tests, errors, ok };
  });
}

// ---------- Playwright ----------
function playwright() {
  const file = REPORTS + 'playwright.json';
  if (!existsSync(file)) return null;
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const tests = [];
  const walk = (suite, path) => {
    for (const s of suite.suites || []) walk(s, s.title && !s.title.endsWith('.js') ? [...path, s.title] : path);
    for (const spec of suite.specs || []) {
      for (const t of spec.tests) {
        const last = t.results.at(-1) ?? {};
        tests.push({
          name: [...path, spec.title].join(' › '),
          status: t.status,   // expected | unexpected | flaky | skipped
          ms: t.results.reduce((a, r) => a + (r.duration || 0), 0),
          retries: t.results.length - 1,
          error: last.error?.message?.split('\n')[0],
        });
      }
    }
  };
  for (const s of json.suites) walk(s, []);
  return { tests, ms: json.stats?.duration ?? 0 };
}

const db = pgtap();
const e2e = playwright();

out.push('## 🧪 Resultados de los tests', '');
out.push('| Suite | Resultado | Pruebas | Tiempo |', '|---|---|---|---|');
if (db) {
  const total = db.reduce((a, f) => a + f.tests.length, 0);
  const failed = db.reduce((a, f) => a + f.tests.filter((t) => !t.ok).length + f.errors.length, 0);
  out.push(`| Base de datos (pgTAP) | ${icon(db.every((f) => f.ok))} | ${total - failed} de ${total} en ${db.length} ficheros | — |`);
} else {
  out.push('| Base de datos (pgTAP) | ⚠️ sin resultados | — | — |');
}
if (e2e) {
  const bad = e2e.tests.filter((t) => t.status === 'unexpected').length;
  const flaky = e2e.tests.filter((t) => t.status === 'flaky').length;
  out.push(`| Flujo principal (Playwright) | ${icon(!bad)} | ${e2e.tests.length - bad} de ${e2e.tests.length}${flaky ? ` (${flaky} a la segunda)` : ''} | ${secs(e2e.ms)} |`);
} else {
  out.push('| Flujo principal (Playwright) | ⚠️ sin resultados | — | — |');
}
out.push('');

if (e2e) {
  out.push('### Flujo principal', '');
  for (const t of e2e.tests) {
    const mark = t.status === 'expected' ? '✅' : t.status === 'flaky' ? '⚠️' : t.status === 'skipped' ? '⏭️' : '❌';
    out.push(`- ${mark} ${t.name} · ${secs(t.ms)}${t.retries ? ` · ${t.retries} reintento(s)` : ''}${t.error ? `\n  \`${t.error.slice(0, 200)}\`` : ''}`);
  }
  out.push('', 'Informe completo (con trazas si algo falla): artefacto **informe-tests** al final de esta página.', '');
}

if (db) {
  out.push('### Base de datos', '');
  for (const f of db) {
    const failed = f.tests.filter((t) => !t.ok);
    out.push(`<details${f.ok ? '' : ' open'}><summary>${icon(f.ok)} <b>${f.file}</b> · ${f.tests.length - failed.length} de ${f.planned}</summary>`, '');
    for (const t of f.tests) out.push(`- ${icon(t.ok)} ${t.name}`);
    for (const e of f.errors) out.push(`- ❌ \`${e.slice(0, 200)}\``);
    if (f.tests.length !== f.planned) out.push(`- ❌ Se planearon ${f.planned} pruebas y se ejecutaron ${f.tests.length}`);
    out.push('', '</details>', '');
  }
}

console.log(out.join('\n'));
