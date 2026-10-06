-- 0056 — Journal des baux : type 'manque_accepte' (FINANCES-SUIVI-UNIQUE P2).
--
-- POURQUOI : le « manque accepté » (geste du bailleur qui solde ce qui manque sur un mois, avec un
-- motif obligatoire, sans toucher au bail, au barème ni aux mouvements) est une entrée du journal du
-- bail `baux_evenements` (docs/subjects/FINANCES-SUIVI-UNIQUE-MOTEUR.md §D) : concurrence ligne par
-- ligne gardée par version, RLS par entité déjà en place (entite_of_bail, 0030 / 0053), même sens que
-- le journal (« événement rattaché au bail, sans toucher la ligne signée », en-tête de 0054).
-- Sans cette migration le client rangerait le type en 'autre' (store-mapping.js) : fonctionnel (l'objet
-- entier est dans legacy_raw) mais illisible côté serveur. Le client qui envoie 'manque_accepte' exige
-- donc cette migration : ORDRE DE DÉPLOIEMENT = migration AVANT le client (sinon le CHECK refuse
-- l'insertion : erreur par enregistrement, retentée, aucune perte locale, mais rien n'arrive au cloud).
--
-- CE QUI CHANGE (additif) : la contrainte type_evenement accepte en plus 'manque_accepte'.
-- INCHANGÉ : colonnes (legacy_raw, legacy_id, bail_debut de 0054), RLS par entité, triggers touch_row /
-- freeze_espace_id (0017), FK composite RESTRICT vers baux, index.
-- Idempotente (drop if exists / add). Dépend de 0017, 0054.

begin;

alter table public.baux_evenements drop constraint if exists baux_evenements_type_evenement_check;
alter table public.baux_evenements
  add constraint baux_evenements_type_evenement_check
  check (type_evenement in ('resiliation','conge','renouvellement','revision_loyer','autre','modification','avenant','manque_accepte'));

commit;
