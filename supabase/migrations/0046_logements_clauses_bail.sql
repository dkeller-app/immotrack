-- 0045 — LOGEMENTS : colonnes typées pour les deux clauses de bail générées depuis la fiche du bien.
--
-- CONTEXTE (chantier BIENS, étapes 5 et 6 — décisions 8 et 9 du 11-13/08). La modale logement
-- devient le point de saisie direct de la LISTE DES PIÈCES (`log.edlTemplate.pieces`, l'emplacement
-- qui existait déjà et n'était alimenté qu'en enregistrant un EDL comme modèle). Cette liste cesse
-- d'être un confort d'état des lieux : elle génère désormais la clause « Désignation des pièces »
-- du bail (mention obligatoire, art. 3 loi 89-462) et sert de structure de départ à chaque EDL.
-- Symétriquement, « Parties communes » devient une clause générée depuis imm.equipementsCommuns,
-- `log.partiesCommunes` n'étant plus qu'une SURCHARGE pour le cas rare (accès privatif différent).
--
-- Ces deux champs n'avaient pas de colonne typée : ils ne voyageaient que dans `legacy_raw`
-- (le jsonb de fidélité que l'hydrate relit — la donnée n'était donc PAS perdue en pratique,
-- rectification par rapport à impacts.html qui les disait « hors synchronisation cloud »). Une
-- clause contractuelle mérite néanmoins sa colonne : requêtable, typée, alignée sur npp / lot /
-- num_fiscal, et exploitable par l'ETL relationnel qui, lui, ne lit pas legacy_raw.
--
-- `pieces_desc` existe depuis 0010 mais n'était mappée par personne : on la branche au passage
-- (c'est la surcharge libre, ex-« Description libre » de l'onglet Description).
--
-- ADDITIF et RÉVERSIBLE : aucune colonne supprimée, aucune donnée réécrite, aucune RLS touchée
-- (les policies de `logements` portent sur la ligne, pas sur la colonne). `if not exists` →
-- ré-application sans effet.

begin;

alter table public.logements
  add column if not exists edl_template     jsonb,
  add column if not exists parties_communes text;

comment on column public.logements.edl_template is
  'Structure de référence du bien : { pieces:[{nom, elements:[{nom,…}]}], cles:[…] }. Saisie dans la modale logement (onglet Équipements) OU écrasée par « Sauv. template » depuis un EDL rempli. Source de la clause de bail « Désignation des pièces » et point de départ de chaque état des lieux. Vocabulaire = EDL_TPL/EDL_EXTRA verbatim.';

comment on column public.logements.parties_communes is
  'SURCHARGE de la clause « Parties communes » du bail (cas rare : accès privatif différent d''un lot à l''autre). Vide = la clause est générée depuis immeubles.equipementsCommuns, qui est le vrai niveau de saisie.';

comment on column public.logements.pieces_desc is
  'SURCHARGE libre de la clause « Désignation des pièces » (ex-« Description libre »). Vide = la clause est générée depuis edl_template.pieces.';

commit;
