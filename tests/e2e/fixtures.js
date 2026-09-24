// Fixtures de Playwright: Supabase local y un usuario nuevo con sesión ya iniciada en cada test.
// El login real es con Google; aquí se crea un usuario con contraseña (API de admin del Supabase local)
// y se deja su sesión en localStorage, donde supabase-js la busca al arrancar.
import { test as base, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

/** URL y claves del Supabase local: variables de entorno o `supabase status`. */
function localSupabase() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_KEY) {
    return { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_KEY };
  }
  const s = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  return { url: s.API_URL, anon: s.ANON_KEY, service: s.SERVICE_ROLE_KEY };
}
const SB = localSupabase();
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(SB.url)) throw new Error(`Los tests solo corren contra un Supabase local, no ${SB.url}`);

async function api(path, { key = SB.service, method = 'GET', body } = {}) {
  const res = await fetch(SB.url + path, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

/** Crea un usuario confirmado y devuelve su sesión (la misma forma que guarda supabase-js). */
async function newUserSession(name) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = 'e2e-password-123';
  const user = await api('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password, email_confirm: true, user_metadata: { full_name: name } },
  });
  const session = await api('/auth/v1/token?grant_type=password', { key: SB.anon, method: 'POST', body: { email, password } });
  return { user, session };
}

export const test = base.extend({
  /** Página con la app apuntando al Supabase local (sin sesión). */
  page: async ({ page }, use) => {
    await page.route('**/js/config.js', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `export const SUPABASE_URL = '${SB.url}';
        export const SUPABASE_ANON_KEY = '${SB.anon}';
        export const DONATION_URL = 'https://buymeacoffee.com/toniruiz';
        export const SUPPORTER_MIN_AMOUNT = 5;`,
    }));
    await use(page);
  },

  /** Opciones del usuario de cada test (se pueden cambiar con test.use). */
  onboarded: [true, { option: true }],
  admin: [false, { option: true }],

  /** Usuario nuevo con la sesión iniciada; `onboarded` salta la bienvenida. */
  account: async ({ page, onboarded, admin }, use) => {
    const { user, session } = await newUserSession('Prueba E2E');
    if (admin) await api(`/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', body: { is_admin: true } });
    const storageKey = `sb-${new URL(SB.url).hostname.split('.')[0]}-auth-token`;
    await page.addInitScript(([key, value, skip]) => {
      if (sessionStorage.getItem('e2e.init')) return;   // solo la primera carga: luego manda la app
      sessionStorage.setItem('e2e.init', '1');
      localStorage.setItem(key, value);
      if (skip) localStorage.setItem('edm.onboarded', '1');
    }, [storageKey, JSON.stringify(session), onboarded]);
    await use({ user, session });
    // Ningún flujo debe dejar errores de JavaScript registrados (salvo los provocados a propósito, «e2e: …»)
    const errors = await api(`/rest/v1/client_errors?user_id=eq.${user.id}&select=kind,message,source`).catch(() => []);
    await api(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }).catch(() => {});
    const unexpected = errors.filter((e) => !e.message.includes('e2e:'));
    if (unexpected.length) throw new Error(`La app registró errores durante el test: ${JSON.stringify(unexpected)}`);
  },
});

export { expect, SB, api };
