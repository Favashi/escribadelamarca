// Rellena con los datos de tu proyecto Supabase (Project Settings → Data API y API Keys).
// La anon key es pública por diseño: la seguridad la garantiza RLS (supabase/migrations/).
export const SUPABASE_URL = 'https://fuhchwedoxopzcybccrj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_4AVacDrpDt6z3sZzAWkeQQ_g4xgr9k1';

// Página de donaciones (Buy Me a Coffee, compartida con OSR Manager)
export const DONATION_URL = 'https://buymeacoffee.com/toniruiz';

// Donación mínima (en la moneda del pago) para desbloquear Mecenas: un café de Buy Me a Coffee (5 €).
// Debe coincidir con el secreto SUPPORTER_MIN_AMOUNT de la Edge Function y con public.supporter_min_amount().
export const SUPPORTER_MIN_AMOUNT = 5;
