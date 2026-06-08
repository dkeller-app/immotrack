-- P0-C2 — Tâche 3/5 : helpers de résolution des droits (§12-3, invariant 13, §17-13).
-- HOOK seulement : ces fonctions LISENT le plan effectif d'un espace ; AUCUN trigger ne
-- les appelle pour bloquer en P0 (les triggers de quota à l'INSERT arrivent en P5 et
-- s'appuieront dessus → zéro retrofit). SECURITY DEFINER + search_path='' (pattern is_member).
--
-- Note précédence comp (invariant 13) : « comp prime sur Stripe » est une invariante
-- d'ÉCRITURE (le webhook P5 ne réécrit jamais le plan_id/source d'un espace source='comp').
-- Côté LECTURE, le plan effectif est simplement espaces.plan_id → plans : pas de cas
-- particulier ici.

-- Plan effectif d'un espace (ligne plans complète). NULL si espace introuvable.
create or replace function public.espace_plan(p_espace_id uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.espaces e
  join public.plans p on p.id = e.plan_id
  where e.id = p_espace_id;
$$;

-- Une feature booléenne du plan effectif (false si absente/espace introuvable).
create or replace function public.espace_has_feature(p_espace_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(((public.espace_plan(p_espace_id)).features ->> p_feature)::boolean, false);
$$;
