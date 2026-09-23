// Router por hash: #/ruta/param
const routes = [];
let current = null;

export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ re, keys, handler });
}

export const navigate = (path) => { location.hash = '#' + path; };

export async function resolve() {
  const path = location.hash.slice(1) || '/biblioteca';
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    if (current?.cleanup) await current.cleanup();
    current = (await r.handler(params)) ?? null;
    return path;
  }
  navigate('/biblioteca');
}

export function start() {
  window.addEventListener('hashchange', resolve);
  return resolve();
}
