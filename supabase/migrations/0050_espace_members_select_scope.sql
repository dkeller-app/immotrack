-- 0050 — Partage par SCI : la LISTE DES MEMBRES n'est plus lisible par un membre SCOPÉ.
--
-- CONTEXTE (chantier « isolation par-SCI du partage », 2026-09-17). État vérifié en prod (pg_policies) :
--   • Storage `espace-files`  → policies PAR ENTITÉ (0031) : has_entite_access/has_entite_write sur le
--     2e segment du chemin <espace>/<entite_id>/files/<clé>. Un scopé n'atteint que ses SCIs octroyées ;
--     legacy <espace>/files/… et <espace>/_orphelin/… = membres PLEINS seulement (fail-closed).
--   • Realtime `espace:<id>`  → is_full_member (0048) : un scopé ne rejoint pas le canal (ni signal, ni
--     présence). Le broadcast `changed` porte un payload VIDE ; la donnée revient par re-pull sous RLS.
--   • Tables métier          → has_entite_access/has_entite_write par ligne (0030/0034/0037/0042/0043).
--   ⇒ Le verrou « ne pas créer de membre scopé » (0030:34-41) est LEVÉ pour Storage/Realtime/tables.
--
-- MAILLON FAIBLE RESTANT (fermé ici) : `espace_members` SELECT = is_member (0003) → un membre SCOPÉ
-- lisait TOUTES les lignes de l'espace : user_id, rôle, full_espace, invite_email de chaque partenaire.
-- Fuite de PII (emails) + cartographie des membres vers un invité qui ne doit connaître que sa SCI.
--
-- FIX : SELECT = membre PLEIN (voit tout, comportement inchangé pour le propriétaire / gestionnaire /
-- lecteur plein) OU sa PROPRE ligne (indispensable au boot client : resolveEspaces lit
-- `espace_members … eq('user_id', uid)` pour trouver ses espaces). INSERT/UPDATE/DELETE inchangés (owner).
-- Aucun helper impacté : is_member / has_role / is_full_* sont SECURITY DEFINER (bypass RLS).
-- Client : _listMembers (écran « Partage & accès ») n'est appelé que par un manager plein.
--
-- Idempotente (drop if exists + create). Dépend de 0003 (policy d'origine), 0029 (is_full_member).

begin;

drop policy if exists members_select on public.espace_members;

create policy members_select on public.espace_members
  for select to authenticated
  using (
    public.is_full_member(espace_id)
    or user_id = (select auth.uid())
  );

commit;
