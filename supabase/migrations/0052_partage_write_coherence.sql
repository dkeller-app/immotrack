-- 0052 — Partage par SCI : ÉCRITURE et LECTURE exigent le droit sur CHAQUE rattachement de la ligne (pas le premier).
--
-- FAILLE (audit adversarial 2026-09-18, M1) : les write-policies de baux / baux_historique / quittances /
-- agenda (0030) et candidats (0034) autorisaient sur `coalesce(entite_id, entite_of_logement(...), …)` :
-- le PREMIER rattachement non NULL gagnait, sans cohérence avec les autres. Une gestionnaire SCOPÉE de
-- SCI-A pouvait donc insérer { entite_id: SCI-A, logement_id: <logement de SCI-B> } (la FK composite ne
-- vérifie que l'espace). Conséquences : squat de l'index « un bail actif par logement » / « une quittance
-- par (logement, mois) » d'une SCI non octroyée (le propriétaire ne peut plus créer la vraie ligne, conflit
-- 23505 côté sync), ORACLE d'occupation/paiement (23505 = « SCI-B a déjà un bail actif / une quittance
-- ce mois »), pollution de l'agenda et des candidats de SCI-B. Les UUID de logement sont déterministes
-- (detUuid(owner)('logement', ref)) → devinables.
--
-- FIX : helper `has_entite_write_all` = manager PLEIN (inchangé, court-circuit) OU, pour un scopé :
--   • au moins un rattachement non NULL (sinon fail-closed, comme avant), ET
--   • droit d'écriture sur l'entité de CHAQUE rattachement non NULL (entite_id, logement_id, immeuble_id).
-- Un logement/immeuble qui ne se résout pas → entité NULL → has_entite_write faux → refus (fail-closed).
-- Appliqué à TOUTES les write-policies (INSERT check, UPDATE using+check, DELETE using) des 5 tables.
-- + `mouvements` (0037) : qui_exclusif n'interdit que logement+entité ; immeuble_id peut coexister avec l'un
--   des deux → même trou (entité A + immeuble de B). + `logements` : entite_id A + immeuble_id d'un immeuble
--   de B (le logement apparaîtrait sous l'immeuble d'une SCI non octroyée).
-- LECTURE (ajout après contre-audit + contrôle des données de prod, 2026-09-18) : les SELECT gardaient le
-- même `coalesce` → une ligne dont l'entite_id est PÉRIMÉE (prod : 190 lignes d'agenda dont l'entite_id ne
-- correspond ni à leur immeuble ni à leur logement) serait VISIBLE d'un scopé de l'entité périmée alors
-- qu'elle décrit un logement d'une AUTRE SCI. → `has_entite_access_all` : un scopé ne lit une ligne que s'il
-- a accès à l'entité de CHAQUE rattachement non NULL (fail-closed). Membre plein : inchangé (court-circuit).
-- `edl` / `assurances` (résolution par logement seul) ne sont pas concernés.
-- ⚠ Avant d'inviter un GESTIONNAIRE scopé dans un espace : vérifier qu'aucune ligne n'y a de rattachements
--   incohérents (requêtes de contrôle dans docs/subjects/PARTAGE-ISOLATION-SCI.md §6) — sinon ses écritures
--   sur ces lignes seraient refusées (42501) et la sync les retenterait.
--
-- Pas SECURITY DEFINER : le helper ne lit aucune table, il compose des helpers déjà DEFINER (moindre
-- privilège). search_path='' + noms qualifiés. Idempotente (create or replace + drop if exists).
-- Dépend de 0029 (has_entite_write, is_full_manager), 0030 (entite_of_logement / entite_of_immeuble).

begin;

create or replace function public.has_entite_write_all(
  p_espace_id uuid, p_entite_id uuid, p_logement_id uuid, p_immeuble_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    public.is_full_manager(p_espace_id)
    or (
      (p_entite_id is not null or p_logement_id is not null or p_immeuble_id is not null)
      and (p_entite_id   is null or public.has_entite_write(p_espace_id, p_entite_id))
      and (p_logement_id is null or public.has_entite_write(p_espace_id, public.entite_of_logement(p_espace_id, p_logement_id)))
      and (p_immeuble_id is null or public.has_entite_write(p_espace_id, public.entite_of_immeuble(p_espace_id, p_immeuble_id)))
    );
$$;
revoke all on function public.has_entite_write_all(uuid, uuid, uuid, uuid) from public;
grant execute on function public.has_entite_write_all(uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.has_entite_access_all(
  p_espace_id uuid, p_entite_id uuid, p_logement_id uuid, p_immeuble_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    public.is_full_member(p_espace_id)
    or (
      (p_entite_id is not null or p_logement_id is not null or p_immeuble_id is not null)
      and (p_entite_id   is null or public.has_entite_access(p_espace_id, p_entite_id))
      and (p_logement_id is null or public.has_entite_access(p_espace_id, public.entite_of_logement(p_espace_id, p_logement_id)))
      and (p_immeuble_id is null or public.has_entite_access(p_espace_id, public.entite_of_immeuble(p_espace_id, p_immeuble_id)))
    );
$$;
revoke all on function public.has_entite_access_all(uuid, uuid, uuid, uuid) from public;
grant execute on function public.has_entite_access_all(uuid, uuid, uuid, uuid) to authenticated;

-- ── baux / baux_historique / quittances / candidats : rattachements = entite_id + logement_id ──────────
do $pol$
declare t text;
begin
  foreach t in array array['baux', 'baux_historique', 'quittances', 'candidats'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ( public.has_entite_access_all(espace_id, entite_id, logement_id, null) )', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) )', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) ) with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) )', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) )', t || '_delete', t);
  end loop;
end
$pol$;

-- ── agenda : rattachements = entite_id + logement_id + immeuble_id ─────────────────────────────────────
drop policy if exists agenda_select on public.agenda;
create policy agenda_select on public.agenda for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, logement_id, immeuble_id) );
drop policy if exists agenda_insert on public.agenda;
drop policy if exists agenda_update on public.agenda;
drop policy if exists agenda_delete on public.agenda;
create policy agenda_insert on public.agenda for insert to authenticated
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) );
create policy agenda_update on public.agenda for update to authenticated
  using      ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) )
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) );
create policy agenda_delete on public.agenda for delete to authenticated
  using ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) );

-- ── mouvements : entite_id + logement_id + immeuble_id (0037) ─────────────────────────────────────────
drop policy if exists mouvements_select on public.mouvements;
create policy mouvements_select on public.mouvements for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, logement_id, immeuble_id) );
drop policy if exists mouvements_insert on public.mouvements;
drop policy if exists mouvements_update on public.mouvements;
drop policy if exists mouvements_delete on public.mouvements;
create policy mouvements_insert on public.mouvements for insert to authenticated
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) );
create policy mouvements_update on public.mouvements for update to authenticated
  using      ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) )
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) );
create policy mouvements_delete on public.mouvements for delete to authenticated
  using ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) );

-- ── logements : entite_id (NOT NULL) + immeuble_id ────────────────────────────────────────────────────
drop policy if exists logements_select on public.logements;
create policy logements_select on public.logements for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, null, immeuble_id) );
drop policy if exists logements_insert on public.logements;
drop policy if exists logements_update on public.logements;
drop policy if exists logements_delete on public.logements;
create policy logements_insert on public.logements for insert to authenticated
  with check ( public.has_entite_write_all(espace_id, entite_id, null, immeuble_id) );
create policy logements_update on public.logements for update to authenticated
  using      ( public.has_entite_write_all(espace_id, entite_id, null, immeuble_id) )
  with check ( public.has_entite_write_all(espace_id, entite_id, null, immeuble_id) );
create policy logements_delete on public.logements for delete to authenticated
  using ( public.has_entite_write_all(espace_id, entite_id, null, immeuble_id) );

-- Helper réservé aux policies `to authenticated` : anon n'en a pas l'usage (grant par défaut Supabase retiré).
revoke execute on function public.has_entite_write_all(uuid, uuid, uuid, uuid) from anon;
revoke execute on function public.has_entite_access_all(uuid, uuid, uuid, uuid) from anon;

commit;
