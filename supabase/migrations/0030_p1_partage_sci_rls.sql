-- P1 — Partage par SCI (scope intra-espace). RÉÉCRITURE DES POLICIES RLS par-entité.
-- Dépend de 0029 (backfill entite_id + entite_membre + has_entite_access/has_entite_write).
--
-- ⚠ CRITIQUE SÉCURITÉ. Pour CHAQUE table métier on remplace les 4 policies P0 (SELECT/INSERT/
-- UPDATE/DELETE, qui s'arrêtaient à is_member/has_role au niveau ESPACE) par des policies qui
-- exigent en plus has_entite_access (lecture) / has_entite_write (écriture) sur l'entité de la
-- LIGNE. Un membre PLEIN (full_espace=true) passe toujours ces helpers → comportement P0 strictement
-- inchangé pour le propriétaire. Un membre SCOPÉ ne passe que pour les SCIs octroyées.
--
-- RÉSOLUTION DE L'ENTITÉ DE LA LIGNE — par des helpers SECURITY DEFINER qui CONTOURNENT la RLS
-- (comme is_member/has_role) : la résolution est déterministe et ne dépend PAS de la visibilité
-- RLS des tables jointes (pas de récursion policy↔table, pas de NULL « accidentel » qui
-- masquerait une ligne à un membre plein). L'AUTORISATION reste faite par has_entite_access /
-- has_entite_write. Étanchéité intra-espace : chaque resolver filtre par p_espace.
--
-- Tables couvertes (10 métier + baux_evenements + baux_historique) :
--   entites          → id (l'entité, c'est la ligne elle-même)
--   immeubles        → entite_id (NOT NULL)
--   logements        → entite_id (NOT NULL)
--   baux             → entite_id si présent, sinon via logement_id→logements.entite_id
--   baux_historique  → idem baux
--   baux_evenements  → via bail_id→baux (→entite_id, même fallback)
--   quittances       → entite_id si présent, sinon via logement_id
--   mouvements       → entite_id si présent, sinon via logement_id ; sinon NULL (fail-closed)
--   edl              → via logement_id→logements.entite_id (logement_id NOT NULL)
--   assurances       → via logement_id→logements.entite_id (logement_id NULLABLE → NULL si absent)
--   agenda           → entite_id, sinon via logement_id, sinon via immeuble_id ; sinon NULL
--   documents        → polymorphe via (parent_type, parent_id) → entité du parent
--
-- espace_config N'EST PAS couverte : c'est de la CONFIG d'espace (params/catégories/templates),
-- pas une donnée par-SCI. Elle reste en is_member/has_role (visible des membres pleins). Un membre
-- scopé n'a pas accès à la config globale — c'est volontaire (cf rapport).
--
-- 🛑 GAP SÉCURITÉ CONNU — STORAGE + REALTIME ENCORE AU NIVEAU ESPACE (audit code-reviewer 2026-06-18).
-- Cette migration scope les TABLES par-SCI, mais le bucket Storage `espace-files` (policies 0024) et
-- le canal Realtime `espace:<id>` (0025) restent gatés sur is_member → un membre SCOPÉ (= membre
-- actif) peut lister/télécharger les FICHIERS (PDF baux, photos EDL, justificatifs) de TOUTES les SCIs,
-- et recevoir les events Realtime de SCIs non octroyées. Tant que ce n'est pas corrigé :
--   ⛔ NE PAS créer de membre SCOPÉ en prod (pas d'UI d'invitation scopée), ⛔ NE PAS activer le partage.
-- Correctif requis avant activation : chemin Storage par entité `<espace>/<entite>/files/<key>` +
-- policies has_entite_access/has_entite_write (+ Realtime par-SCI). Un membre PLEIN n'est pas concerné.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- A) RESOLVERS d'entité (SECURITY DEFINER, search_path='') — bypass RLS pour la RÉSOLUTION.
--    Tous bornés à p_espace (étanchéité tenant). Renvoient NULL si non résoluble → fail-closed.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.entite_of_logement(p_espace_id uuid, p_logement_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.entite_id
  from public.logements l
  where l.id = p_logement_id
    and l.espace_id = p_espace_id;
$$;
revoke all on function public.entite_of_logement(uuid, uuid) from public;
grant execute on function public.entite_of_logement(uuid, uuid) to authenticated;

create or replace function public.entite_of_immeuble(p_espace_id uuid, p_immeuble_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select im.entite_id
  from public.immeubles im
  where im.id = p_immeuble_id
    and im.espace_id = p_espace_id;
$$;
revoke all on function public.entite_of_immeuble(uuid, uuid) from public;
grant execute on function public.entite_of_immeuble(uuid, uuid) to authenticated;

-- bail → entite_id direct sinon entité de son logement.
create or replace function public.entite_of_bail(p_espace_id uuid, p_bail_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(b.entite_id, l.entite_id)
  from public.baux b
  left join public.logements l
    on l.id = b.logement_id and l.espace_id = b.espace_id
  where b.id = p_bail_id
    and b.espace_id = p_espace_id;
$$;
revoke all on function public.entite_of_bail(uuid, uuid) from public;
grant execute on function public.entite_of_bail(uuid, uuid) to authenticated;

-- document polymorphe → entité du parent selon parent_type. Résout pour les 5 types autorisés
-- (0026 : mouvement|immeuble|logement|entite|bail). Un parent_type/parent_id non résoluble → NULL.
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
    )
    when 'immeuble' then public.entite_of_immeuble(p_espace_id, p_parent_id)
    when 'logement' then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'bail' then public.entite_of_bail(p_espace_id, p_parent_id)
    when 'mouvement' then (
      select coalesce(mv.entite_id, public.entite_of_logement(p_espace_id, mv.logement_id))
      from public.mouvements mv
      where mv.id = p_parent_id and mv.espace_id = p_espace_id
    )
    else null
  end;
$$;
revoke all on function public.entite_of_document(uuid, text, uuid) from public;
grant execute on function public.entite_of_document(uuid, text, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- B) RÉÉCRITURE DES POLICIES. Pour chaque table : DROP les 4 policies P0 + CREATE les 4 nouvelles.
--    On garde la convention de nommage P0 (<table>_select/_insert/_update/_delete) → idempotence
--    de re-drop et lisibilité. INSERT.with_check + UPDATE/DELETE.using portent sur l'entité de la
--    ligne (NEW pour insert, existant pour update/delete) ; UPDATE.with_check vérifie AUSSI
--    l'entité cible après modif (anti-déplacement d'une ligne vers une SCI non autorisée).
-- ════════════════════════════════════════════════════════════════════════════

-- ── entites : l'entité de la ligne = id ───────────────────────────────────────
drop policy if exists entites_select on public.entites;
drop policy if exists entites_insert on public.entites;
drop policy if exists entites_update on public.entites;
drop policy if exists entites_delete on public.entites;

create policy entites_select on public.entites
  for select to authenticated
  using ( public.has_entite_access(espace_id, id) );
-- INSERT d'une entité : seul un manager PLEIN peut créer une SCI (la créer = en définir le
-- périmètre ; un membre scopé ne crée pas de nouvelle SCI). has_entite_write(espace, new.id)
-- serait toujours faux pour un scopé (l'octroi n'existe pas encore) → is_full_manager direct.
create policy entites_insert on public.entites
  for insert to authenticated
  with check ( public.is_full_manager(espace_id) );
create policy entites_update on public.entites
  for update to authenticated
  using      ( public.has_entite_write(espace_id, id) )
  with check ( public.has_entite_write(espace_id, id) );
-- DELETE d'une entité : manager PLEIN uniquement (supprimer une SCI = acte structurant).
create policy entites_delete on public.entites
  for delete to authenticated
  using ( public.is_full_manager(espace_id) );

-- ── immeubles : entite_id (NOT NULL) ──────────────────────────────────────────
drop policy if exists immeubles_select on public.immeubles;
drop policy if exists immeubles_insert on public.immeubles;
drop policy if exists immeubles_update on public.immeubles;
drop policy if exists immeubles_delete on public.immeubles;

create policy immeubles_select on public.immeubles
  for select to authenticated
  using ( public.has_entite_access(espace_id, entite_id) );
create policy immeubles_insert on public.immeubles
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, entite_id) );
create policy immeubles_update on public.immeubles
  for update to authenticated
  using      ( public.has_entite_write(espace_id, entite_id) )
  with check ( public.has_entite_write(espace_id, entite_id) );
create policy immeubles_delete on public.immeubles
  for delete to authenticated
  using ( public.has_entite_write(espace_id, entite_id) );

-- ── logements : entite_id (NOT NULL) ──────────────────────────────────────────
drop policy if exists logements_select on public.logements;
drop policy if exists logements_insert on public.logements;
drop policy if exists logements_update on public.logements;
drop policy if exists logements_delete on public.logements;

create policy logements_select on public.logements
  for select to authenticated
  using ( public.has_entite_access(espace_id, entite_id) );
create policy logements_insert on public.logements
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, entite_id) );
create policy logements_update on public.logements
  for update to authenticated
  using      ( public.has_entite_write(espace_id, entite_id) )
  with check ( public.has_entite_write(espace_id, entite_id) );
create policy logements_delete on public.logements
  for delete to authenticated
  using ( public.has_entite_write(espace_id, entite_id) );

-- ── baux : entite_id sinon via logement_id ────────────────────────────────────
drop policy if exists baux_select on public.baux;
drop policy if exists baux_insert on public.baux;
drop policy if exists baux_update on public.baux;
drop policy if exists baux_delete on public.baux;

create policy baux_select on public.baux
  for select to authenticated
  using ( public.has_entite_access(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy baux_insert on public.baux
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy baux_update on public.baux
  for update to authenticated
  using      ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) )
  with check ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy baux_delete on public.baux
  for delete to authenticated
  using ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );

-- ── baux_historique : entite_id sinon via logement_id ─────────────────────────
drop policy if exists baux_historique_select on public.baux_historique;
drop policy if exists baux_historique_insert on public.baux_historique;
drop policy if exists baux_historique_update on public.baux_historique;
drop policy if exists baux_historique_delete on public.baux_historique;

create policy baux_historique_select on public.baux_historique
  for select to authenticated
  using ( public.has_entite_access(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy baux_historique_insert on public.baux_historique
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy baux_historique_update on public.baux_historique
  for update to authenticated
  using      ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) )
  with check ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy baux_historique_delete on public.baux_historique
  for delete to authenticated
  using ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );

-- ── baux_evenements : via bail_id→baux ────────────────────────────────────────
drop policy if exists baux_evenements_select on public.baux_evenements;
drop policy if exists baux_evenements_insert on public.baux_evenements;
drop policy if exists baux_evenements_update on public.baux_evenements;
drop policy if exists baux_evenements_delete on public.baux_evenements;

create policy baux_evenements_select on public.baux_evenements
  for select to authenticated
  using ( public.has_entite_access(espace_id, public.entite_of_bail(espace_id, bail_id)) );
create policy baux_evenements_insert on public.baux_evenements
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, public.entite_of_bail(espace_id, bail_id)) );
create policy baux_evenements_update on public.baux_evenements
  for update to authenticated
  using      ( public.has_entite_write(espace_id, public.entite_of_bail(espace_id, bail_id)) )
  with check ( public.has_entite_write(espace_id, public.entite_of_bail(espace_id, bail_id)) );
create policy baux_evenements_delete on public.baux_evenements
  for delete to authenticated
  using ( public.has_entite_write(espace_id, public.entite_of_bail(espace_id, bail_id)) );

-- ── quittances : entite_id sinon via logement_id ──────────────────────────────
drop policy if exists quittances_select on public.quittances;
drop policy if exists quittances_insert on public.quittances;
drop policy if exists quittances_update on public.quittances;
drop policy if exists quittances_delete on public.quittances;

create policy quittances_select on public.quittances
  for select to authenticated
  using ( public.has_entite_access(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy quittances_insert on public.quittances
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy quittances_update on public.quittances
  for update to authenticated
  using      ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) )
  with check ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy quittances_delete on public.quittances
  for delete to authenticated
  using ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );

-- ── mouvements : entite_id sinon via logement_id ; sinon NULL → fail-closed ───
drop policy if exists mouvements_select on public.mouvements;
drop policy if exists mouvements_insert on public.mouvements;
drop policy if exists mouvements_update on public.mouvements;
drop policy if exists mouvements_delete on public.mouvements;

create policy mouvements_select on public.mouvements
  for select to authenticated
  using ( public.has_entite_access(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy mouvements_insert on public.mouvements
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy mouvements_update on public.mouvements
  for update to authenticated
  using      ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) )
  with check ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy mouvements_delete on public.mouvements
  for delete to authenticated
  using ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );

-- ── edl : via logement_id (NOT NULL) ──────────────────────────────────────────
drop policy if exists edl_select on public.edl;
drop policy if exists edl_insert on public.edl;
drop policy if exists edl_update on public.edl;
drop policy if exists edl_delete on public.edl;

create policy edl_select on public.edl
  for select to authenticated
  using ( public.has_entite_access(espace_id, public.entite_of_logement(espace_id, logement_id)) );
create policy edl_insert on public.edl
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) );
create policy edl_update on public.edl
  for update to authenticated
  using      ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) )
  with check ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) );
create policy edl_delete on public.edl
  for delete to authenticated
  using ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) );

-- ── assurances : via logement_id (NULLABLE → NULL si absent → fail-closed) ────
drop policy if exists assurances_select on public.assurances;
drop policy if exists assurances_insert on public.assurances;
drop policy if exists assurances_update on public.assurances;
drop policy if exists assurances_delete on public.assurances;

create policy assurances_select on public.assurances
  for select to authenticated
  using ( public.has_entite_access(espace_id, public.entite_of_logement(espace_id, logement_id)) );
create policy assurances_insert on public.assurances
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) );
create policy assurances_update on public.assurances
  for update to authenticated
  using      ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) )
  with check ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) );
create policy assurances_delete on public.assurances
  for delete to authenticated
  using ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) );

-- ── agenda : entite_id, sinon via logement_id, sinon via immeuble_id (resolvers SECURITY
--    DEFINER → pas de sous-requête RLS-imbriquée). Premier non-NULL gagne.
drop policy if exists agenda_select on public.agenda;
drop policy if exists agenda_insert on public.agenda;
drop policy if exists agenda_update on public.agenda;
drop policy if exists agenda_delete on public.agenda;

create policy agenda_select on public.agenda
  for select to authenticated
  using ( public.has_entite_access(espace_id,
            coalesce(entite_id,
                     public.entite_of_logement(espace_id, logement_id),
                     public.entite_of_immeuble(espace_id, immeuble_id))) );
create policy agenda_insert on public.agenda
  for insert to authenticated
  with check ( public.has_entite_write(espace_id,
            coalesce(entite_id,
                     public.entite_of_logement(espace_id, logement_id),
                     public.entite_of_immeuble(espace_id, immeuble_id))) );
create policy agenda_update on public.agenda
  for update to authenticated
  using ( public.has_entite_write(espace_id,
            coalesce(entite_id,
                     public.entite_of_logement(espace_id, logement_id),
                     public.entite_of_immeuble(espace_id, immeuble_id))) )
  with check ( public.has_entite_write(espace_id,
            coalesce(entite_id,
                     public.entite_of_logement(espace_id, logement_id),
                     public.entite_of_immeuble(espace_id, immeuble_id))) );
create policy agenda_delete on public.agenda
  for delete to authenticated
  using ( public.has_entite_write(espace_id,
            coalesce(entite_id,
                     public.entite_of_logement(espace_id, logement_id),
                     public.entite_of_immeuble(espace_id, immeuble_id))) );

-- ── documents : polymorphe via (parent_type, parent_id) ───────────────────────
drop policy if exists documents_select on public.documents;
drop policy if exists documents_insert on public.documents;
drop policy if exists documents_update on public.documents;
drop policy if exists documents_delete on public.documents;

create policy documents_select on public.documents
  for select to authenticated
  using ( public.has_entite_access(espace_id, public.entite_of_document(espace_id, parent_type, parent_id)) );
create policy documents_insert on public.documents
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, public.entite_of_document(espace_id, parent_type, parent_id)) );
create policy documents_update on public.documents
  for update to authenticated
  using      ( public.has_entite_write(espace_id, public.entite_of_document(espace_id, parent_type, parent_id)) )
  with check ( public.has_entite_write(espace_id, public.entite_of_document(espace_id, parent_type, parent_id)) );
create policy documents_delete on public.documents
  for delete to authenticated
  using ( public.has_entite_write(espace_id, public.entite_of_document(espace_id, parent_type, parent_id)) );

commit;
