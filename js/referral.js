// De dónde vienen los usuarios, para saber qué difusión funciona. Sin cookies ni datos personales:
// - Los enlaces que se comparten llevan ?ref=<canal> (reddit, jornadas, telegram…). Se guarda el primero que llega
//   (localStorage, 30 días) y se quita de la URL. Al registrarse, se apunta en profiles.signup_ref.
// - La portada suma una visita anónima por navegador y día a su canal (tabla landing_visits, solo el recuento).
import { supabase } from './supabase.js';

const REF_KEY = 'edm.ref';
const VISIT_KEY = 'edm.landingVisit';
const REF_TTL = 30 * 864e5;

/** Canal válido: minúsculas, letras, números y guiones. Lo demás cuenta como «otro». */
const clean = (s) => {
  const v = String(s ?? '').trim().toLowerCase();
  if (!v) return null;
  return /^[a-z0-9_-]{1,30}$/.test(v) ? v : 'otro';
};

/** Canal guardado (si no ha caducado). */
export function storedRef() {
  try {
    const r = JSON.parse(localStorage.getItem(REF_KEY) || 'null');
    return r && Date.now() - r.at < REF_TTL ? r.ref : null;
  } catch { return null; }
}

/** Guarda el canal si todavía no había ninguno (se queda el primero). */
export function rememberRef(ref) {
  const r = clean(ref);
  if (!r || storedRef()) return;
  try { localStorage.setItem(REF_KEY, JSON.stringify({ ref: r, at: Date.now() })); } catch { /* sin storage */ }
}

/** Lee ?ref= (o ?utm_source=) de la URL, lo guarda y lo quita de la barra de direcciones. */
export function captureRef() {
  const params = new URLSearchParams(location.search);
  if (!params.has('ref') && !params.has('utm_source')) return;
  rememberRef(params.get('ref') || params.get('utm_source'));
  for (const k of ['ref', 'utm_source', 'utm_medium', 'utm_campaign']) params.delete(k);
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash);
}

/** Una visita anónima por navegador y día (portada o lista de deseos compartida). */
export function trackLandingVisit() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(VISIT_KEY) === today) return;
    localStorage.setItem(VISIT_KEY, today);
  } catch { /* sin storage: se cuenta igual */ }
  supabase?.rpc('track_landing', { p_ref: storedRef() }).then(() => {}, () => {});
}

/** Tras entrar: si la cuenta es nueva (menos de 2 días) y no tiene canal, se apunta el guardado. Nunca lanza. */
export async function saveSignupRef(profile) {
  const ref = storedRef();
  if (!ref || !profile || profile.signup_ref) return;
  if (Date.now() - new Date(profile.created_at).getTime() > 2 * 864e5) return;
  try {
    const { error } = await supabase.from('profiles').update({ signup_ref: ref }).eq('id', profile.id);
    if (!error) profile.signup_ref = ref;
  } catch { /* sin conexión: no pasa nada */ }
}
