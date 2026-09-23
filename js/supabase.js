import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isConfigured = !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.startsWith('TU-');

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
