-- 0045 — SC1 « Pièces obligatoires du bail » : tag reliant un fichier aux pièces qu'il satisfait.
--
-- CONTEXTE. Le chantier SC1 (moteur de complétude des pièces obligatoires du bail) doit savoir,
-- pour un logement + type de bail, quelles pièces-fichiers obligatoires (DDT : DPE, plomb, amiante,
-- gaz, élec, ERP, bruit… + règlement de copropriété) sont réellement JOINTES. Un même PDF couvre
-- souvent plusieurs diagnostics à la fois (un « dossier de diagnostics » = DPE + plomb + amiante +
-- gaz + élec). On étiquette donc chaque document (public.documents) avec la liste des clés de pièces
-- qu'il satisfait — ex. ["dpe","amiante","elec"]. Le mapper app (js/core/store-mapping.js `documents`)
-- écrit désormais cette liste dans `requirement_keys` ; sans cette colonne le tag resterait local
-- (IndexedDB) et la checklist apparaîtrait vide sur un second appareil.
--
-- SÉCURITÉ. Purement ADDITIVE : nouvelle colonne jsonb NOT NULL DEFAULT '[]' → les lignes existantes
-- reçoivent un tableau vide, aucun impact RLS (pas de policy touchée, la colonne ne participe à aucune
-- résolution d'entité), aucun impact sur l'hydrate (le document est reconstruit depuis legacy_raw).
-- Idempotente via IF NOT EXISTS.

alter table public.documents
  add column if not exists requirement_keys jsonb not null default '[]'::jsonb;

comment on column public.documents.requirement_keys is
  'SC1 : clés des pièces obligatoires du bail satisfaites par ce fichier (ex: ["dpe","amiante"]). Alimenté par le mapper documents (store-mapping) ; lu par le moteur bail-required-docs.';
