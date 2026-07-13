-- RESET-CLOUD UX (2026-07-13) — « ⚠️ Vider mon espace cloud » depuis les Réglages de l'app.
-- purge_espace (0023) reste RÉSERVÉE à service_role (offboarding admin / démontage de test).
-- Ici : la MÊME purge, exposée aux utilisateurs authentifiés via une RPC GARDÉE — le serveur
-- re-vérifie TOUT (le client ne décide de rien, jamais de service key côté navigateur) :
--   1) le demandeur (JWT) est OWNER ACTIF de l'espace visé → sinon PURGE_NOT_OWNER ;
--   2) double confirmation : le nom EXACT de l'espace doit être fourni (btrim) → sinon
--      PURGE_CONFIRM_MISMATCH. Rien n'est supprimé si une garde échoue.
-- Après purge, l'espace n'existe plus : au login suivant, resolveEspaces() en recrée un
-- vierge (« Mon patrimoine ») et les défauts v15.461 (_applyDataDefaults) s'appliquent.
-- NOTE Storage : comme purge_espace, cette RPC ne touche PAS les objets Storage (reliquat
-- orphelin consigné P2 — les chemins par-espace ne sont plus référencés par aucune ligne).

create or replace function public.purge_mon_espace(p_espace_id uuid, p_confirm_nom text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom text;
begin
  -- 1) GARDE OWNER — auth.uid() vient du JWT vérifié par PostgREST ; null (anon/service
  --    sans claims) ou non-owner → refus. La garde tombe AVANT toute lecture du nom :
  --    pas d'oracle d'existence d'espace pour un tiers.
  if auth.uid() is null or not exists (
    select 1 from public.espace_members
    where espace_id = p_espace_id
      and user_id = auth.uid()
      and role = 'owner'
      and invite_status = 'active'
  ) then
    raise exception 'PURGE_NOT_OWNER';
  end if;

  -- 2) DOUBLE CONFIRMATION SERVEUR — nom exact (btrim, sensible à la casse). Un nom
  --    d'espace vide/blanc ne peut jamais être confirmé (fail-safe).
  select nom into v_nom from public.espaces where id = p_espace_id;
  if v_nom is null or btrim(v_nom) = '' or btrim(v_nom) <> btrim(coalesce(p_confirm_nom, '')) then
    raise exception 'PURGE_CONFIRM_MISMATCH';
  end if;

  -- 3) Purge — réutilise la primitive 0023 (GUC échappatoires prevent_locked_mutation +
  --    protect_last_owner, neutralisation des FK RESTRICT, cascade espaces). Autorisé car
  --    exécuté en tant qu'owner de purge_espace (definer), pas en tant qu'authenticated.
  perform public.purge_espace(p_espace_id);
end;
$$;

comment on function public.purge_mon_espace(uuid, text) is
  'Purge un espace ENTIER à la demande de son owner (JWT) avec confirmation du nom exact. Gardes serveur : owner actif + btrim(nom). Wrapper user-facing de purge_espace (0023).';

-- Supabase accorde par défaut EXECUTE à anon + authenticated sur les fonctions public :
-- on révoque tout puis on n'accorde qu'à authenticated (la garde owner fait le reste).
revoke execute on function public.purge_mon_espace(uuid, text) from public, anon, authenticated;
grant  execute on function public.purge_mon_espace(uuid, text) to authenticated;
