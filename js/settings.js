// Ajustes de la app (feature flags) guardados en app_settings. Se leen al arrancar; el admin los cambia en Admin → Ajustes.
import { supabase } from './supabase.js';

const DEFAULTS = {
  covers_enabled: true,
  suggestions_enabled: true,
  donations_enabled: true,
  feedback_enabled: true,
  announcement: { enabled: false, text: '', level: 'info' },
};

export const settings = { ...DEFAULTS };

/** Carga los ajustes; si falla (sin conexión, sin migración) se quedan los valores por defecto. */
export async function loadSettings() {
  try {
    const { data, error } = await supabase.from('app_settings').select('key, value');
    if (error) throw error;
    for (const { key, value } of data) if (key in DEFAULTS) settings[key] = value;
  } catch { /* valores por defecto */ }
  return settings;
}

export async function saveSetting(key, value) {
  const { error } = await supabase.from('app_settings').upsert({ key, value });
  if (error) throw error;
  settings[key] = value;
}
