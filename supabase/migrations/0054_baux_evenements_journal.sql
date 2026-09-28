-- 0054 — Journal des baux signés : branche `baux_evenements` (0017) sur la synchro client.
--
-- POURQUOI (incident 28/09, bail Ferrette 101) : la ligne `baux` d'un bail SIGNÉ est verrouillée
-- (0014 prevent_locked_mutation, store-sync.js ne la pousse plus) → toute modification faite ensuite
-- (« Modifier le bail », avenant) était perdue au rechargement. Décision Didier : les modifications
-- sont ENREGISTRÉES à côté du bail, jamais dans la ligne signée (le document signé ne change pas).
-- `baux_evenements` a été créée pour ça (0017 : « événement rattaché au bail, SANS toucher la ligne
-- signée verrouillée ») mais jamais branchée : table vide en prod (vérifié le 28/09).
--
-- CE QUI CHANGE (additif, les clients actuels ne lisent pas cette table) :
--   A) legacy_raw jsonb : l'app hydrate une collection depuis legacy_raw (store-supabase.js) — patron 0026.
--   B) legacy_id text : identifiant client de l'entrée — patron 0034 / 0028.
--   C) bail_debut date : un logement garde le MÊME id de bail au fil des baux successifs
--      (detUuid('bail', ref)) → la date de début distingue le bail concerné.
--   D) type_evenement : + 'modification' (hors avenant) et 'avenant' (lot 2 de la refonte avenant).
-- INCHANGÉ : RLS par entité via entite_of_bail (0030, résolveur durci 0053), triggers touch_row /
-- freeze_espace_id (0017), FK composite RESTRICT (neutralisée dans purge_espace, 0023).

begin;

alter table public.baux_evenements add column if not exists legacy_raw jsonb;
alter table public.baux_evenements add column if not exists legacy_id  text;
alter table public.baux_evenements add column if not exists bail_debut date;

alter table public.baux_evenements drop constraint if exists baux_evenements_type_evenement_check;
alter table public.baux_evenements
  add constraint baux_evenements_type_evenement_check
  check (type_evenement in ('resiliation','conge','renouvellement','revision_loyer','autre','modification','avenant'));

create index if not exists baux_evenements_by_bail_debut
  on public.baux_evenements (espace_id, bail_id, bail_debut);

commit;
