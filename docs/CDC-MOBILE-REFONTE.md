# CDC — Refonte mobile (téléphone / tablette) — figé 04/09/2026

> Cap validé par Didier : **mettre en prod la refonte mobile conçue en session** (Accueil, Logements,
> Immeubles, Bailleurs, Bail, EDL, Quittance). **PC inchangé** — la refonte ne touche que le **< 1024 px**
> (téléphone + tablette), comme le parcours EDL. « tu codes, tu audites et tu merges » → worktree
> `Immo-wt-mobile-refonte`, **lot par lot**, audit `code-reviewer` + **smoke user 3 formats** + **GO** avant
> chaque merge prod. Jamais de commit depuis `Desktop\Immo` (hook auto-push).

## Spec visuelle = les books (source de vérité)
Books autonomes dans `mockups/MOBILE-UX/` (gitignorés) + artifacts en ligne, sombre + clair :
- **Accueil** — `ACCUEIL-LIVE.html` (accueil calme : marque, « Bonjour », pulse une colonne — encaissé YTD neutre, mois barre verte, occupation jauge neutre, dépôts, carte « À regarder »).
- **Logements** — `BOOK-LOGEMENTS.html` (22 stations : liste, fiche 4 onglets + états loué/vacant/archivé, diagnostics + éditeur DPE, entretien/assurance/mouvement, modifier/ajout, pop-ups en **pages plein écran**).
- **Immeubles** — `BOOK-IMMEUBLES.html` (liste, fiche Logements liste/frise + Charges communes + poste/relevé, ajout, pop-ups).
- **Bailleurs** — `BOOK-BAILLEURS.html` (liste, fiche Immeubles + Identité, 2044, ajout, pop-ups).
- **Bail** — `BOOK-BAIL.html` (wizard 3 étapes Personnes/Conditions/Récap + Garant + écrans conditionnels Mobilier/Garage + signature matrice+chacun son tour).
- **EDL** — `BOOK-EDL.html` (parcours 12 étapes + rail, mode sortie 2 bandes, relecture, engagement conditionnel, signatures 2 pavés) — voir aussi `docs/subjects/…` + `CDC-EDL-TELEPHONE.md`.
- **Quittance** — `QUITTANCE-LIVE.html` (reproduction fidèle prod + logo).

## Invariants non négociables (charte mobile + spécifiques)
1. **PC (≥ 1024) strictement inchangé** — aucun codepath desktop modifié. Tout est derrière `< 1024`.
2. **Donnée utile ≈ 2/3 de l'écran** ; entête/nav = chrome ~1/3.
3. **Pages plein écran, jamais de pop-up partiel** (Modifier/Ajout/Filtrer/Trier/menu ⋮/Renommer/confirmations) — barre retour+titre / corps scroll / pied d'action collant, jamais occulté par la nav (M-16).
4. **Nom jamais tronqué** (M-14) : nom sur une ligne, bulle statut/occupation **sur la photo**, pas dans la ligne du nom.
5. **Doctrine couleur (M-15)** : **corail = seule couleur de sélection / action / importance**, remplace le rouge ; vert = positif ; neutre = totaux/occupation. **Exception EDL** : l'échelle d'états des éléments garde ses couleurs sémantiques (N vert / B bleu / U ambre / M rouge / – neutre) — c'est de la donnée, pas une alerte.
6. **Saisie ≥ 16 px** sur mobile (zéro zoom iOS), à la source.
7. **Textes légaux verbatim** repris des constantes de l'app (engagements EDL `EDL_ENGAGEMENT_*`, clauses bail) — jamais paraphrasés.
8. **EDL** : aucun montant / dépôt nulle part ; entrée signée ni modifiable ni supprimable ; mobilier saisi à l'EDL (annexé au bail, pas ressaisi) ; 109 éléments modèle ; verdict = `verdictDe()` non stocké.
9. **Line-icons `currentColor`**, pas d'emoji dans le chrome ; on garde les pastilles teintées par catégorie.
10. **Bottom-nav = 4 favoris (onglets OU actions rapides) + Plus** (liste plate), configurée via « Plus → Personnaliser ma barre » (modèle nav validé « GO nav »).

## Réutiliser, ne pas réinventer (DRY)
Chaque écran mobile **appelle le même moteur** que le PC (mêmes fonctions de données, mêmes formulaires,
mêmes textes) — on change l'**emballage** (layout téléphone), pas la logique. Auditer TOUT le code d'une
feature avant de la coder (cf. leçon book EDL : diff mockup ↔ code exhaustif).

## Plan par lots (un lot = un merge après smoke + GO)
0. **Socle** — breakpoint < 1024, tokens de la charte (sombre/clair), pattern « page plein écran », bottom-nav favoris. (dépend de l'audit archi)
1. **Accueil mobile** (le plus simple, validé tôt) — proof du socle.
2. **Logements** — liste + fiche + onglets + pop-ups + ajout/modifier + éditeurs (diagnostics/DPE, entretien, assurance, mouvement).
3. **Immeubles** — liste + fiche (Logements liste/frise + Charges) + pop-ups + ajout.
4. **Bailleurs** — liste + fiche (Immeubles + Identité + 2044) + pop-ups + ajout.
5. **Bail** — wizard 3 étapes + garant + conditionnels + signature.
6. **EDL** — parcours 12 étapes (le plus gros ; cf. CDC-EDL-TELEPHONE).
7. **Quittance** — alignement mobile.

## Gate (à chaque lot)
Audit `superpowers:code-reviewer` → non-régression PC vérifiée → **smoke user 3 formats** (téléphone /
tablette / PC) → **GO Didier** → bump `v15.x` (title + footer) → merge `feat/mobile-refonte` → prod.
