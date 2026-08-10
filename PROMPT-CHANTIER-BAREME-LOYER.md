# PROMPT — Nouvelle session : CHANTIER « BARÈME DE LOYER » (post-audit suivi des loyers)

Tu reprends **Propryo** (ex-ImmoTrack), PWA **vanilla JS** : `index.html` (~50 000 lignes, inline)
+ modules ES dans `js/core/`. Déployée sur `https://dkeller-app.github.io/immotrack/` (Pages sert `main`).
**Livraison** : worktree `C:/tmp/wt-finbuild` rebasé sur `origin/main` → `git push origin HEAD:main`.
Le clone `C:\Users\Did_K\Desktop\Immo` est **périmé** : ne JAMAIS y pousser `main`.

## À lire EN PREMIER (dans cet ordre)
1. `docs/subjects/AUDIT-SUIVI-LOYERS-2026-07-14.md` — l'audit complet (4 P0 reproduits, 16 constats,
   modèle du loyer dans le temps, données cassées). **Tout ce chantier en découle.**
2. `mockups/historique-loyer/B-timeline.html` — l'écran « Historique du loyer » VALIDÉ par l'utilisateur
   (variante B Timeline, 14/07). `index.html` du même dossier pour le contexte des variantes.
3. `_import/repro-audit-suivi-loyers.mjs` — le harness de repro (CAS 0-6). **Chaque CAS doit devenir
   un test Vitest vert à la fin du chantier.**
4. La mémoire projet (`MEMORY.md`) + `BACKLOG.md` entrée AUDIT-SUIVI-LOYERS.

## DÉCISIONS ACTÉES (ne pas rediscuter, ne pas réinventer)
- **Mockup : variante B « Timeline » validée** (14/07). Le journal EST l'écran ; loyer en vigueur sur
  le rail entre les événements ; bandeau « migration à valider » ; modale « Corriger une période »
  avec motif obligatoire.
- **Q1 (décision user 14/07) : chaque révision IRL porte une DATE D'EFFET EXPLICITE, stockée** —
  « il faut ajouter une date dans IRL pour faire un vrai suivi ». Règles :
  - Pré-remplissage : validation **avant ou au** premier anniversaire de l'année → effet au
    **1er du mois de l'anniversaire** ; validation **après** → effet au **1er du mois suivant la validation**.
  - La date est **affichée et modifiable** dans le flux de validation IRL (et visible sur l'écran Historique).
  - **Jamais rétroactive** : garde-fou ≥ 1er du mois de l'anniversaire de l'année en cours ET
    jamais antérieure à un mois déjà quittancé. Le passé quittancé ne se recalcule JAMAIS.
- **Barème historisé** : nouvelle collection `DB.loyerBareme[]` = périodes
  `{ref, debut, fin|null, hc, ch, source:'bail'|'irl'|'manuel'|'cloture', note, bailDebut}`,
  append-only + tombstones (sync cloud). **Toute écriture de loyer passe par lui** — plus aucun
  changement de `hc`/`ch` sans période. C'est LA source de vérité du dû d'un mois.
- **Résolveur unique `duMois(ref, ym)`** (module pur `js/core/`) consommé par les 5 surfaces
  (P&L, Suivi des loyers, Accueil, fiche/pilotage, quittance) avec LES MÊMES politiques :
  bornage 1er versement du lot · tolérance <10 partagée · **netting avance↔retard** (une avance
  couvre les mois suivants avant de laisser naître un retard — fin des retard+avance simultanés) ·
  retard par mois = résidu, annuel = somme · dû d'un mois **quittancé** = la quittance émise (figée).
- **Clôture obligatoire au re-bail** : `archiverBail` pose `finEffective = veille du nouveau bail`
  (fix C4 dû doublé) · tombstones filtrés (`_isAlive`) partout (C10) · suppression des 3 filtres
  `.logement` morts (C11) · refs tolérantes partout (inline 4330 compris).

## LES 4 ÉTAPES (1 session = 1-2 étapes max, commit + test user entre chaque)
1. **Moteur `duMois()` pur en TDD** (+ netting avance/retard). Les CAS 0-6 du harness = les premiers
   tests rouges. Remplace à terme les 4 moteurs divergents.
2. **`loyerBareme` + branchement des writers** (`saveBail`, `applyIRL` + date d'effet Q1,
   `_applyPendingIRLRevisions`, batch pilotage, clôture, imports) + fixes C4/C10/C11.
3. **Migration + écran « Historique du loyer »** (variante B). La migration reconstruit le barème
   depuis l'existant (§5 de l'audit : entrées IRL re-datées selon Q1, baux archivés tronqués,
   désyncs log.hc≠baux.hc resynchronisées) et **présente les incohérences à valider** (bandeau).
4. **Quittance figée** (plus de recalcul à l'affichage) + rebranchement des 5 surfaces sur `duMois()`.

## RÈGLES GRAVÉES (non négociables — voir mémoire)
- **Audit `superpowers:code-reviewer` obligatoire AVANT tout « prêt à tester »** (Vitest/grep ne suffisent jamais).
- **TDD** (test rouge d'abord) · **pas de solution passable** · **DRY** (réutiliser, jamais recopier).
- **Fiscal intouchable** : la base 2044 est à l'encaissement (Σ 211 brut) — indépendante du split dû/imputation.
- Versioning : bump `v15.X` dans index.html (title+footer) **et** `sw.js` (`immotrack-v15.X`) à **origin+1**.
- **Scan noncaractères OBLIGATOIRE avant push** (U+FFFF/FFFE/FDD0-FDEF cassent Jekyll → site figé).
- Livraison : `git fetch origin -q ; git rebase --autostash origin/main ; git push origin HEAD:main`
  (collisions de version fréquentes — sessions parallèles).
- Si une autre session maître intègre index.html : file `.index-queue/QUEUE.md` (protocole
  `docs/INDEX-COMMIT-PROTOCOL.md`).
- **BACKLOG.md à jour en TEMPS RÉEL** (commit `Pilotage : …`) à chaque étape livrée.
- Preview navigateur intégré instable (screenshots timeout) → harness Node pour les moteurs purs +
  vérification visuelle par l'utilisateur sur l'app déployée.
- Le WHY produit = **la simplicité** — l'écran Historique doit se lire sans mode d'emploi.

**Commence par l'étape 1 (moteur `duMois()` TDD). Montre les tests rouges avant d'implémenter.**
