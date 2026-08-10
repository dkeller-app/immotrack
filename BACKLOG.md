# Propryo — Backlog actif

> **Hub de pilotage court.** Document maître : [docs/CDC-V1-LIGHT.md](docs/CDC-V1-LIGHT.md) (règles + périmètre + CDC par onglet + modèles).
> Historique complet : [docs/archive/BACKLOG-integral-2026-08-10.md](docs/archive/BACKLOG-integral-2026-08-10.md) · branches archivées : tags `archive-20260810/*` · ancienne lignée pilotage : branche `backup/pilotage-pre-realign-2026-08-10`.
> Règle : valider dans le chat → figer en UNE écriture. Une session de chantier à la fois.

## 🎯 CAP — V1 light au 31/08/2026

Blindage connexion + partage AVANT tout · CDC + mockup 3 formats + validation user avant tout code · gate = smoke téléphone + tablette + PC · gel du monolithe (toute logique en module `js/`).

## 🔄 En cours

| Quoi | État | Reste |
|---|---|---|
| **Blindage partage** — session partage-EDL (`Immo-wt-partage-edl`, `fix/partage-edl-espace-tiers`) | fix D1b construit, repro E2E 7/7 | suite RLS · audit code-reviewer · un-delete EDL Marion · **E2E réel Didier↔Marion** · intégration puis destruction du worktree |
| **Fil rouge création** — session (`Immo-wt-filrouge-complet`, `feat/fil-rouge-complet`) | étape 2/8 | étapes 3-8 · rebase v15.498+ · intégration puis destruction du worktree |
| **Blindage connexion** | keep-alive poussé | vérifier le keep-alive actif · E2E réel login PC + iPhone (post-pause Supabase) |

## 🧪 Smoke user en attente (Didier)

- **Historique bail** (v15.496) : onglet Bail — accordéons, DG, popup modif financière, correction IRL.
- **Relay-401** (v15.498, 10/08) : onglet Candidats — console propre, plus de 401 en boucle, liens échus clos.
- **Barème/suivi Fric** : plus de faux 50 € d'avance (reste 5 €/mois réel + jan/fév sans paiement = données, pas bugs).
- **Nav sous-menus** (v15.490) + **écrans fil rouge propres** (v15.494, vider le cache PWA si besoin).

## 📋 Onglets V1 — à traiter un par un (CDC détaillé + mockups 3 formats d'abord)

Biens (simplification mapping — gros morceau) · Bail · Candidature · Signature à distance (fix relais) · EDL (+ mobile terrain) · Import bancaire · Quittances · Suivi · Finances P&L · Accueil/KPI. Ordre décidé au fil de l'eau en session pilotage.

## 🧊 Après V1 (gelé — détail dans docs/subjects/ et l'archive)

Charges/régularisation · Agenda (à redéfinir) · Annonces (supprimées de la cible) · OTP email signature (branche `relay-otp`, attend domaine propryo.fr) · sealSigned · CFE-GESTION-2044 · sync P2 robuste (seuil commercialisation) · import bancaire API auto (DSP2) · générateur quittance public · marketing/recrutement bêta · reporting bailleur/CRG.

## ✅ Livré récemment

- **v15.498** (10/08) : relay-401 candidatures — liens expirés clos localement, fin de la boucle 401.
- **v15.497** (10/08) : revert SC1 pièces obligatoires (retrait complet demandé user).
- **v15.496** (10/08) : historique bail en onglet (timeline, DG, popup modif → barème).
- **10/08 — grand nettoyage** : CDC V1 light figé · ~60 worktrees supprimés (bureau = Immo + 2 chantiers) · clone pilotage réaligné sur origin/main (push direct rétabli) · 83 branches archivées en tags puis purgées (reste 4 sur origin) · fin de la triple copie index* (sandbox = `index.html?sandbox=1`) · BACKLOG allégé (intégral en archive) · file QUEUE fermée.
