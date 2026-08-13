# Propryo — Backlog actif

> **Hub de pilotage court.** Document maître : [docs/CDC-V1-LIGHT.md](docs/CDC-V1-LIGHT.md) (règles + périmètre + CDC par onglet + modèles).
> Historique complet : [docs/archive/BACKLOG-integral-2026-08-10.md](docs/archive/BACKLOG-integral-2026-08-10.md) · branches archivées : tags `archive-20260810/*` · ancienne lignée pilotage : branche `backup/pilotage-pre-realign-2026-08-10`.
> Règle : valider dans le chat → figer en UNE écriture. Une session de chantier à la fois.

## 🎯 CAP — V1 light au 31/08/2026

Blindage connexion + partage AVANT tout · CDC + mockup 3 formats + validation user avant tout code · gate = smoke téléphone + tablette + PC · gel du monolithe (toute logique en module `js/`).

## 🔄 En cours

| Quoi | État | Reste |
|---|---|---|
| **Blindage partage** — partage-EDL | ✅ **fix D1b INTÉGRÉ + DÉPLOYÉ v15.499** (audits ×2 SÛR, EDL 15/07 restauré, worktree détruit) | **E2E réel Didier↔Marion** : chacun recharge l'app (v15.499) → voit l'EDL 15/07 → Didier le ré-enregistre (test du fix) → l'EDL survit des 2 côtés. Follow-ons : migration 0044 à appliquer (feu vert user) · upsert-D2-en-ambiguïté (homonymes SMARTOSAURUS, fiche sujet) |
| **Fil rouge création** — session (`Immo-wt-filrouge-complet`, `feat/fil-rouge-complet`) | ✅ **CHANTIER COMPLET 11/08 — audité « SÛR À TESTER »** : 18 commits rebasés sur v15.499 (0 conflit), **v15.500**, tête `4c92a44`. Acte→rapprochement bailleur (choix inline + ignore tombstones) & immeuble (NOUVEAU, adresse canon, jamais auto)→création directe vérif (récap supprimé, synthèse live)→transition→complétion ACCORDÉON (tâches/%, écrans existants, ✓ Vérifié bail repris / Vacant assumé)→reprise persistée + bandeau Biens. Fixes audit : garde P2 scopée hors completion + seed loyerHcRef bail repris + uniqueRef « base - 2 » (les « (2) » cassaient la regex réf). Gates 2249/2249 · inline-js 5/0 · CRLF pur · E2E vrai clic complet + non-régression fil manuel. Doc : spec/plan 2026-08-08, mockup `mockups/fil-rouge-complet/` | **🚀 GO user 11/08 → PUSHÉ + DÉPLOYÉ v15.500** (`65e944b` sur origin/main, rebase final trivial sur c48c0b3, gates re-vertes 2249/2249, version live vérifiée sur github.io). **Reste : smoke user 3 formats (⚠ cache PWA) → puis destruction du worktree.** Follow-ons : vérif prod one-liner lots « (N) » (uniqueRef « (i) » déployé depuis v15.247, récupérable ✏️ Renommer) · réfs saisies dans la vérif acte non validées contre la regex sécu · select entités `openNewLog` sans filtre tombstones (famille homonymes) · dark mode `fr-comp-*` · slot reprise unique (nouvel import écrase un fil inachevé) · a11y accordéon |
| **Onglet Biens** — CDC détaillé ✅ VALIDÉ 10/08 (cf CDC-V1-LIGHT §5) | mockups CONSTRUITS (`mockups/BIENS-SIMPLIFIES/`, entrée `arbitrages.html`) | **validation user des mockups** → chantier code |
| **Signature à distance — FINITION** | ✅ **CONSTRUIT 13/08** sur 2 branches : app `fix/signature-finition` (wt `Immo-wt-signature`, **v15.502** : §6 accès perdu récupérable + pré-vol sans jeton + liste blanche destruction + purge « ImmoTrack » sorties tiers) · worker `Immo-wt-relay` (page locataire Propryo + §6 reclaim + journal KV + page candidat HC/rebrand). **Gates re-vérifiés pilotage 13/08 : app 2263/2263 + inline 5/0 · worker 179/179.** Mockups `mockups/SIGNATURE-PAGE-LOCATAIRE/` | ✅ worker DÉPLOYÉ 13/08 (`d4c33e96`) · ✅ app INTÉGRÉE v15.502 (`0f4272c` origin/main, go user 13/08) → **reste : smoke E2E compte frais** (badge stable → signer via lien design Propryo → 🔒+PDF+cert → poussée cloud) → destruction des 2 worktrees |
| **Blindage connexion** | keep-alive poussé | vérifier le keep-alive actif · E2E réel login PC + iPhone (post-pause Supabase) |

## 🧪 Smoke user en attente (Didier)

- **Historique bail** (v15.496) : onglet Bail — accordéons, DG, popup modif financière, correction IRL.
- **Relay-401** (v15.498, 10/08) : onglet Candidats — console propre, plus de 401 en boucle, liens échus clos.
- **Barème/suivi Fric** : plus de faux 50 € d'avance (reste 5 €/mois réel + jan/fév sans paiement = données, pas bugs).
- **Nav sous-menus** (v15.490) + **écrans fil rouge propres** (v15.494, vider le cache PWA si besoin).
- **Fil rouge COMPLET** (v15.500, 11/08) : + Ajouter un bien → Importer l'acte → vérif (2 bandeaux rattachement + synthèse live) → « ✓ Tout est bon — créer » (plus d'écran récap) → transition → complétion accordéon (tâches/%, ✓ Vérifié bail repris, Vacant assumé) → « Plus tard » → bandeau reprise page Biens → reprendre → 100 %. 3 formats.

## 📋 Onglets V1 — à traiter un par un (CDC détaillé + mockups 3 formats d'abord)

Biens (simplification mapping — gros morceau) · Bail · Candidature · Signature à distance (fix relais) · EDL (+ mobile terrain) · Import bancaire · Quittances · Suivi · Finances P&L · Accueil/KPI. Ordre décidé au fil de l'eau en session pilotage.

**Transverse V1 (ajouts user 10/08)** :
- **DOCS-UNIFIÉS** — gabarit de document unique Propryo (logo + charte + code PROPRYO) pour tous les documents émis : quittance, avis/courrier IRL, décomptes… → à traiter avec les CDC Quittances et Révisions/Bail.
- **LIENS-LOCATAIRE-VISUEL** — refonte visuelle des pages publiques côté locataire : lien candidature en ligne + lien signature bail à distance → à traiter avec les CDC Candidature et Signature.

## 🧊 Après V1 (gelé — détail dans docs/subjects/ et l'archive)

Charges/régularisation · Agenda (à redéfinir) · Annonces (supprimées de la cible) · OTP email signature (branche `relay-otp`, attend domaine propryo.fr) · sealSigned · CFE-GESTION-2044 · sync P2 robuste (seuil commercialisation) · import bancaire API auto (DSP2) · générateur quittance public · marketing/recrutement bêta · reporting bailleur/CRG.

## ✅ Livré récemment

- **v15.501** (11/08) : **RELAY-401 enfin réglé — SMOKE USER OK (console propre)**. Le fix v15.498 avait construit/testé/exposé `partitionCandidatLinks` sans JAMAIS la brancher dans `_relayPullCandidatures` (inerte en prod) → 13 liens échus re-tirés en 401 toutes les 3 min. v15.501 : partition branchée (échus+7j clos SANS réseau, toast pull manuel) + 401-sur-lien-échu clos / 401-sur-vivant retenté (token désync ≠ mort) + fix persistance clôtures 404. Audit SÛR, 2250/2250. Worktree relay401 détruit. Mineurs follow-on : auto-pull réveille le timer à vide (brancher la partition dans `shouldAutoPull`) · toast partiel si import+clôture simultanés. **Leçon consignée : un fix « livré » doit prouver son CÂBLAGE, pas seulement sa logique — l'audit v15.498 a validé le module sans vérifier l'appelant.**
- **v15.500** (11/08) : **FIL ROUGE COMPLET** — acte → rapprochement bailleur (choix inline, ignore tombstones) & immeuble (NOUVEAU, adresse canon `acte-rapprochement`, jamais auto) → création directe depuis la vérif (récap supprimé, synthèse live) → transition → complétion ACCORDÉON (`completionModel`, écrans existants reliés, ✓ Vérifié / Vacant assumé) → reprise persistée + bandeau Biens. 18 commits, audit code-reviewer SÛR, 2249/2249, E2E vrai clic. Fixes audit : garde P2 hors completion, seed loyerHcRef bail repris, uniqueRef « base - 2 ».
- **v15.499** (10/08) : fix partage/EDL (D1b réadoption du tag d'espace, `store-sync.js`) — ré-enregistrer un EDL ne détruit plus la ligne cloud (cause de l'EDL 15/07 FERRETTE 001 soft-deleted le 18/07, restauré) ; removes suspendus en ambiguïté d'homonymie. ⚠️ ménage restant : `legal-2044.test.js`/`data-defaults.test.js` réfèrent les `index-test*.html` supprimés au nettoyage → 3 rouges + 18 skipped préexistants sur main.
- **v15.498** (10/08) : relay-401 candidatures — liens expirés clos localement, fin de la boucle 401.
- **v15.497** (10/08) : revert SC1 pièces obligatoires (retrait complet demandé user).
- **v15.496** (10/08) : historique bail en onglet (timeline, DG, popup modif → barème).
- **10/08 — grand nettoyage** : CDC V1 light figé · ~60 worktrees supprimés (bureau = Immo + 2 chantiers) · clone pilotage réaligné sur origin/main (push direct rétabli) · 83 branches archivées en tags puis purgées (reste 4 sur origin) · fin de la triple copie index* (sandbox = `index.html?sandbox=1`) · BACKLOG allégé (intégral en archive) · file QUEUE fermée.
