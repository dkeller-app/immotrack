# V1-LIGHT-FIN-AOUT — Cap stratégique : V1 light livrée au 31 août 2026

> **Statut** : 🔄 En cours (décision user 10/08/2026)
> **Priorité** : CAP — prime sur tout le backlog
> **Origine** : audit complet du 10/08 (session pilotage) + mapping user `C:\Users\Did_K\Desktop\Propryo mapping.pptx`

## Décision

Le user tranche après l'audit du 10/08 :
- **PAS de repart-de-zéro** (option A rejetée : re-payer les règles métier acquises, backend sain).
- **V1 light pour fin août** : uniquement les features consolidées, nettoyées, avec un **cahier des charges par onglet, un par un**, et une **validation obligatoire sur téléphone + tablette + PC** avant de passer à l'onglet suivant.
- **En premier lieu : connexion et partage BLINDÉS** — rien d'autre ne démarre avant.

## Contexte d'audit (mesures 10/08)

- `index.html` prod (origin/main v15.496) : **54 161 lignes / 6,85 MB, 95 % de JS inline**, 1 329 fonctions globales, 22 écrans.
- Code modulaire `js/` : 74 fichiers, ~700 KB (≈10 % du code).
- **3 copies divergentes** : `index.html`, `index-test.html`, `index-test-loyer.html`.
- **~70 worktrees**, clone pilotage `Desktop\Immo` divergé de la prod : **609 commits derrière / 108 devant origin/main**.
- Filet : ~2 200 tests offline + RLS vrai Postgres, 45 migrations Supabase propres.
- Diagnostic : le métier est sain (mapping user = « reprendre fonctionnement actuel » sur le cycle locatif) ; la douleur vient du monolithe front + triple copie + process git + couche sync/partage.

## Le mapping user (PPTX, décodé 10/08) = cahier des charges cible

- **Bailleur** : garder onglet Immeubles uniquement + documents dans l'entête.
- **Immeuble** : garder Logements + Charges communes (fonctionnement à revoir) + documents dans l'entête. Doublon à résoudre : régime juridique vs année construction/type habitat.
- **Logement** : supprimer boutons annonce ×2, onglets Général, Compteurs, Présentation, Description (fusionnée dans Équipements : type T2/T3 = nb pièces principales, chambres ajoutables avec équipements). Déplacer n° identifiant fiscal + case charges communes.
- **Bail / Candidature / EDL** : reprendre fonctionnement actuel (EDL : reprendre nb chambres/détails depuis Logement ?).
- **Révisions** : IRL à revoir avec historique bail (✅ livré barème v15.489 + historique onglet v15.496) ; charges « cahier des charges à refaire ! » (→ OUT V1).
- **Import bancaire** : OFX, doublons, **aucun import auto sans règle**, tri/recherche comme existant.
- **Finances** : P&L ligne par ligne, « Import et bail sont les entrées ! » (→ refonte OUT V1, actuel conservé).
- **Quittances** : dispo si loyer payé, déplacées onglet global locataire + page génération, pas d'historique complet, case rappel dans bail.
- **KPI** : garder actuel (encaissement, cash flow, occupation, rendement brut, DG, perçu vs potentiel, payés/impayés par logement).
- **Suivi / Agenda** : « à redéfinir ! » (→ OUT V1, sessions mockup dédiées après).

## Préalable absolu — semaine 1 : BLINDAGE

### Connexion
- [ ] Keep-alive Supabase vérifié actif (workflow CI poussé 10/08 — contrôler qu'il tourne)
- [ ] Re-test login iPhone (reste P0-SUPABASE-PAUSE)
- [ ] Session stable 2 appareils — E2E réel (bounce v15.457 et login-double v15.473 déjà fixés → preuve terrain)

### Partage
- [ ] BUG-PARTAGE-EDL-ESPACE-TIERS : finir suite RLS + audit code-reviewer + QUEUE + un-delete EDL
- [ ] **E2E réel Didier ↔ Marion** (jamais exécuté — cause racine du bug ; ne pas ré-enregistrer l'EDL depuis le compte Didier avant)
- [ ] Écrans invitation 4-7 (front)
- [ ] E2E partage SCI réel : Marion invite → Didier accepte → voit SA SCI sans collision → attache un document → elle le voit

### Nettoyage repo
- [ ] Clone pilotage réaligné sur origin/main (divergence 609/108 résorbée, stratégie : repartir d'origin/main, rejouer les commits pilotage utiles)
- [ ] Purge des ~65 worktrees morts (garder 2-3 vivants : partage-edl en cours + 1 chantier actif)
- [ ] Archivage des branches mortes
- [ ] Fin de la triple copie index* : un seul code + mode sandbox intégré (clé `_test_immotrack_v4` conservée)
- [ ] **Règle de gel gravée** : plus aucune nouvelle fonction dans index.html — toute feature naît en module `js/` testé (extraction progressive au fil des chantiers)

## Périmètre V1 light

### IN (8 onglets, consolidés)
| Onglet | Base | Travail V1 |
|---|---|---|
| Accueil / KPI | garder actuel | CDC + validation 3 formats |
| Biens (bailleur/immeuble/logement) | actuel | **simplification mapping** (purge/fusion onglets) — seul gros chantier UI |
| Bail | actuel + historique v15.496 | CDC + smoke (accordéons, DG, popup modif, IRL) |
| Candidature | actuel | CDC + validation |
| État des lieux | actuel (PC/tablette) | CDC + validation |
| Import bancaire | actuel | CDC + règle « aucun import auto sans règle » |
| Quittances | actuel | simplification mapping (onglet locataire + page génération) |
| Connexion + partage | blindés S1 | — |

### OUT (après V1)
Charges/régularisation · Suivi (à redéfinir) · Agenda (à redéfinir) · Annonces (supprimées dans la cible) · Signature à distance + OTP email · EDL mobile terrain (refonte autosave/offline) · Fil rouge acte de vente (chantier prêt, différé) · Refonte P&L finances (mockup validé, différé).

## Pipeline par onglet (gate non négociable)

1. **Cahier des charges** (depuis le mapping + existant)
2. **Mockup 3 formats** (téléphone / tablette / PC — règle mockup-first)
3. **Validation user** explicite
4. **Chantier TDD** (worktree depuis origin/main)
5. **Audit code-reviewer** (règle audits par agents)
6. **Déploiement** github.io
7. **Smoke user 3 formats** → onglet VALIDÉ. Pas de chantier suivant avant.

## Timeline

| Semaine | Contenu |
|---|---|
| S1 · 11–17/08 | Blindage connexion + partage · nettoyage repo · CDC Biens |
| S2 · 18–24/08 | Biens simplifiés livrés · CDC + validation Bail, Candidature, EDL |
| S3 · 25–31/08 | Import, Quittances, KPI · stabilisation · smoke global 3 formats |

## Risques identifiés

- La semaine 1 (blindage) conditionne tout : si l'E2E réel Didier↔Marion révèle d'autres trous partage, la timeline glisse — on coupe alors sur le périmètre (Quittances simplifiées peuvent rester « actuel »), jamais sur la qualité du blindage.
- La simplification Biens touche le monolithe : extraction en module au passage (règle de gel), audit obligatoire.
- Réalignement du clone pilotage = opération délicate (108 commits locaux à trier) — à faire en session dédiée avec sauvegarde.

## Journal

- **10/08** : décision user (chat pilotage) après audit + lecture PPTX. Visuel roadmap montré et validé implicitement par la demande. Section CAP ajoutée au BACKLOG. Sujet créé.
