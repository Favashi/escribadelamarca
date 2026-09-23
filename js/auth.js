import { supabase } from './supabase.js';

export async function signInWithGoogle() {
  const redirectTo = location.origin + location.pathname; // funciona en https://usuario.github.io/repo/
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

/** scope 'local' solo borra la sesión de este navegador, sin llamar al servidor (útil si la cuenta ya no existe). */
export async function signOut(scope = 'global') {
  await supabase.auth.signOut({ scope });
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  // Limpia ?code=… de la URL tras volver de Google
  if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
  return data.session;
}

export const onAuthChange = (cb) => supabase.auth.onAuthStateChange((_event, session) => cb(session));
