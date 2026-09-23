// Métricas de uso mínimas: solo se registra el tipo de acción (sin contenido de búsquedas ni códigos).
// Cada usuario solo puede insertar sus eventos; se leen agregados desde el panel de admin.
import { supabase } from './supabase.js';

/** Registra un evento sin bloquear ni mostrar errores (las métricas nunca deben romper la app). */
export function track(type, detail = null) {
  try {
    supabase?.from('events').insert({ type, detail }).then(() => {}, () => {});
  } catch { /* sin conexión o sin sesión */ }
}

/** Una apertura de la app por usuario y día. */
export function trackOpen(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `edm.open.${userId}`;
  try {
    if (localStorage.getItem(key) === today) return;
    localStorage.setItem(key, today);
  } catch { /* sin storage: se registra igual */ }
  track('app_open');
}
