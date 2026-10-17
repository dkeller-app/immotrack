-- 0063 — Durcissement avant la bêta : appartenance aux espaces, écriture de la config, droits par défaut.
--
-- 1) espace_members : plus aucune écriture directe du client (INSERT / UPDATE).
--    Avant : `members_insert` (0003) n'exigeait que le rôle owner sur l'espace visé, sans contrainte sur
--    user_id / role / full_espace / invite_status ; `members_update` laissait un owner modifier toute ligne
--    sauf la sienne. Une appartenance pouvait donc être créée ou élargie SANS le consentement du compte
--    concerné. Les seuls écrivains légitimes sont les fonctions SECURITY DEFINER `create_espace` (0004) et
--    `accept_invitation` (0053), qui s'exécutent avec les droits de leur propriétaire et ne dépendent pas
--    de ces policies. L'app ne fait jamais d'INSERT / UPDATE sur cette table : elle retire un membre par
--    DELETE (`members_delete`, conservée).
--
-- 2) espace_config : écriture réservée au membre PLEIN gestionnaire (`is_full_manager`), comme
--    `espace_config_private` (0035). Avant : `has_role(owner, gestionnaire)`, qui ignore `full_espace`.
--
-- 3) entite_of_document, branche 'mouvement' : droit exigé sur CHAQUE rattachement du mouvement
--    (`has_entite_access_all`), comme la branche 'incident' (0057) et la ligne mouvement elle-même (0052).
--
-- 4) Fonctions : EXECUTE retiré à PUBLIC et à anon là où il restait (helpers RLS, create_espace, plans,
--    is_app_admin, media_edl_protege), y compris pour les fonctions FUTURES (droits par défaut).
--    EXCLUSIONS VOLONTAIRES : `invitation_preview` est appelée AVANT connexion (parcours d'invitation) →
--    grant explicite à anon ; `accept_invitation` n'est pas touchée.
--
-- 5) Les deux policies sans rôle de 0038 sont restreintes à `authenticated`.
--
-- Idempotente. Aucune donnée modifiée. Préparée avec sa simulation
-- (supabase/tests/sim/0063-appartenance-durcissement.sim.mjs). Application : Didier, via
-- `node scripts/db-run.mjs migrate supabase/migrations/0063_appartenance_durcissement.sql`.

begin;

-- ── 1) espace_members ─────────────────────────────────────────────────────────────────────────
drop policy if exists members_insert on public.espace_members;
drop policy if exists members_update on public.espace_members;
revoke insert, update on table public.espace_members from anon, authenticated;

-- ── 2) espace_config : écriture = membre plein gestionnaire ───────────────────────────────────
drop policy if exists espace_config_insert on public.espace_config;
drop policy if exists espace_config_update on public.espace_config;
drop policy if exists espace_config_delete on public.espace_config;
create policy espace_config_insert on public.espace_config
  for insert to authenticated
  with check ( public.is_full_manager(espace_id) );
create policy espace_config_update on public.espace_config
  for update to authenticated
  using      ( public.is_full_manager(espace_id) )
  with check ( public.is_full_manager(espace_id) );
create policy espace_config_delete on public.espace_config
  for delete to authenticated
  using ( public.is_full_manager(espace_id) );

-- ── 3) entite_of_document : branche 'mouvement' alignée sur 'incident' ─────────────────────────
create or replace function public.entite_of_document(p_espace_id uuid, p_parent_type text, p_parent_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_parent_type
    when 'entite' then (
      select e.id from public.entites e
      where e.id = p_parent_id and e.espace_id = p_espace_id
        and public.has_entite_access(p_espace_id, e.id)
    )
    when 'immeuble' then public.entite_of_immeuble(p_espace_id, p_parent_id)
    when 'logement' then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'bail' then public.entite_of_bail(p_espace_id, p_parent_id)
    when 'mouvement' then (
      -- Droit exigé sur CHAQUE rattachement renseigné (entité, logement, immeuble) : un mouvement mixte
      -- hérité (SCI A + logement de SCI B) n'expose plus ses justificatifs à un membre scopé de A.
      select x.ent from (
        select coalesce(mv.entite_id, public.entite_of_logement(p_espace_id, mv.logement_id),
                        public.entite_of_immeuble(p_espace_id, mv.immeuble_id)) as ent,
               mv.entite_id as e, mv.logement_id as l, mv.immeuble_id as i
        from public.mouvements mv
        where mv.id = p_parent_id and mv.espace_id = p_espace_id
      ) x
      where public.has_entite_access_all(p_espace_id, x.e, x.l, x.i)
    )
    when 'assurance'  then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'mrh'        then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'equipement' then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'quittance'  then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'candidat'   then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'incident' then (
      select x.ent from (
        select coalesce(inc.entite_id, public.entite_of_logement(p_espace_id, inc.logement_id),
                        public.entite_of_immeuble(p_espace_id, inc.immeuble_id)) as ent,
               inc.entite_id as e, inc.logement_id as l, inc.immeuble_id as i
        from public.incidents inc
        where inc.id = p_parent_id and inc.espace_id = p_espace_id
      ) x
      where public.has_entite_access_all(p_espace_id, x.e, x.l, x.i)
    )
    else null
  end;
$$;
revoke all on function public.entite_of_document(uuid, text, uuid) from public, anon;
grant execute on function public.entite_of_document(uuid, text, uuid) to authenticated;

-- ── 4) EXECUTE : PUBLIC et anon retirés ───────────────────────────────────────────────────────
do $fx$
declare
  f text;
begin
  foreach f in array array[
    'public.is_member(uuid)',
    'public.has_role(uuid, public.espace_role[])',
    'public.is_full_member(uuid)',
    'public.is_full_manager(uuid)',
    'public.has_entite_access(uuid, uuid)',
    'public.has_entite_write(uuid, uuid)',
    'public.espace_plan(uuid)',
    'public.espace_has_feature(uuid, text)',
    'public.is_app_admin()',
    'public.media_edl_protege(text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
  -- create_espace : signature lue dans le catalogue (paramètres par défaut possibles).
  for f in
    select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'create_espace'
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  -- invitation_preview : appelée AVANT connexion → reste ouverte à anon, explicitement.
  for f in
    select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'invitation_preview'
  loop
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end
$fx$;

-- Fonctions FUTURES créées par le rôle qui applique les migrations : plus d'EXECUTE implicite pour
-- PUBLIC ni anon (authenticated et service_role gardent les droits par défaut de Supabase, posés au
-- niveau du schéma public). Le droit implicite de PUBLIC est un défaut GLOBAL : un « in schema » ne peut
-- pas le retirer, d'où la forme sans schéma. Une future fonction appelée avant connexion devra être
-- ouverte à anon EXPLICITEMENT.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- ── 5) policies de 0038 : rôle explicite ──────────────────────────────────────────────────────
drop policy if exists beta_allowlist_admin_all on public.beta_allowlist;
create policy beta_allowlist_admin_all on public.beta_allowlist
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists app_admins_self_read on public.app_admins;
create policy app_admins_self_read on public.app_admins
  for select to authenticated using (user_id = (select auth.uid()));

commit;
