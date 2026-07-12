-- 0040 — Élargit documents_parent_type_check aux types réellement émis par l'app.
--
-- CONTEXTE (audit sync cloud 2026-07-12, docs/subjects/AUDIT-SYNC-CLOUD-2026-07-12.md) :
-- la contrainte posée en 0026 n'autorise que 5 parent_type ('mouvement','immeuble','logement',
-- 'entite','bail') alors que l'app déployée (v15.457) en émet 10 — _renderAttachmentSection
-- attache aussi des documents à : 'assurance' (PNO/GLI bailleur), 'mrh' (attestation locataire),
-- 'equipement', 'quittance', 'candidat'. Conséquence PROD constatée : l'upsert documents renvoie
-- 23514 (CHECK violation) → l'adapter throw → _doFlush avorte AVANT les removes et la config →
-- LA SYNC ENTIÈRE DE LA SESSION EST MORTE, silencieusement (poison observé en console le 12/07 :
-- « insert documents: new row violates check constraint "documents_parent_type_check" »).
--
-- Ce fix DB débloque les flushs sans redéploiement de l'app. L'isolation d'erreur par
-- enregistrement dans _doFlush (pour qu'un poison ne tue plus jamais tout le flush) reste le
-- fix app P1 — les deux sont nécessaires, celui-ci est le plus urgent.
--
-- PORTÉE RLS : entite_of_document (0030) ne résout l'entité que pour les 5 types historiques ;
-- les 5 nouveaux donnent entité NULL → invisibles aux membres SCOPÉS par-SCI, visibles des
-- membres pleins/owner. FAIL-CLOSED, donc sûr. Étendre entite_of_document aux nouveaux types
-- (assurance/mrh/equipement/quittance → via logement ; candidat → via logement) = chantier
-- [AUDIT] étapes 5-7 (P2), PAS ce hotfix.
--
-- Idempotent (drop if exists + add). Élargissement STRICT (aucune valeur retirée) → aucune
-- ligne existante ne peut devenir invalide → pas de table-rewrite risqué ; ALTER valide les
-- lignes existantes sous ACCESS EXCLUSIVE bref (664 lignes aujourd'hui, négligeable).

alter table public.documents drop constraint if exists documents_parent_type_check;
alter table public.documents
  add constraint documents_parent_type_check
  check (parent_type is null or parent_type in (
    'mouvement','immeuble','logement','entite','bail',          -- 0026 (historiques)
    'assurance','mrh','equipement','quittance','candidat'       -- 0040 (émis par l'app, jamais couverts)
  ));
