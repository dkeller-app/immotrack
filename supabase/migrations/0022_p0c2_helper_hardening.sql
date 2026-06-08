-- P0-C2 — Tâche 5 (durcissement post-audit code-reviewer 2026-06-08).
-- Deux constats Minor de l'audit, traités proprement (pas laissés en dette) :
--
-- 1. espace_has_feature levait une EXCEPTION sur une valeur features non castable en
--    booléen (ex. '{"x":"maybe"}' ->> 'x' ::boolean → erreur). coalesce(...,false) ne
--    rattrapait que le NULL (clé absente), pas l'échec de cast. Foot-gun latent pour P5
--    quand d'autres features seront semées. Parse défensif : toute valeur « vraie » connue
--    → true, tout le reste (y compris non-booléen / clé absente) → false, sans jamais lever.
--
-- 2. EXECUTE était accordé à anon (défaut Postgres/Supabase). Ces helpers résolvent les
--    droits d'un espace — aucun usage anon légitime (l'UI plans est derrière login).
--    Moindre privilège : on retire anon, on garde authenticated. (espace_plan est aussi
--    appelée en interne par espace_has_feature, mais en SECURITY DEFINER → pas besoin du
--    droit de l'appelant pour l'appel imbriqué.)

create or replace function public.espace_has_feature(p_espace_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- jamais d'exception : valeurs « vraies » reconnues → true ; NULL / non-booléen → false.
  select coalesce(
    lower((public.espace_plan(p_espace_id)).features ->> p_feature)
      in ('true','t','yes','y','on','1'),
    false);
$$;

revoke execute on function public.espace_plan(uuid)               from anon;
revoke execute on function public.espace_has_feature(uuid, text)  from anon;
