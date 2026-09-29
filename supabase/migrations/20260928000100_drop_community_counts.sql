-- community_counts() ya no se usa: la portada pública usa landing_showcase() (migración 20260927000300), que da los
-- mismos recuentos. Se retira para no exponer a anon una función que nadie llama (aviso de Advisors).
drop function if exists public.community_counts();
