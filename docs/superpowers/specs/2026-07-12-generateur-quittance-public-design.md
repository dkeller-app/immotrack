# Design — Générateur de quittance de loyer public (aimant SEO)

> **Spec validée le 2026-07-12** (session brainstorming). 1er des 3 générateurs gratuits publics (piste #1 acquisition). Ordre programme : **Quittance → IRL → Bail**. Le générateur EDL-photos-avec-inscription est **reporté** à la mise en ligne réelle de l'app.
>
> Contexte stratégique : [docs/strategie/BENCHMARK-CONCURRENCE-2026-07.md](../../strategie/BENCHMARK-CONCURRENCE-2026-07.md) (onglets Marketing/Lancement du xlsx). Les concurrents (BailFacile, ImmobilierLoyer…) utilisent les générateurs gratuits comme aimant SEO n°1 ; Propryo a déjà le moteur de documents mais ne l'expose pas publiquement.

## 1. Objectif

Exposer publiquement le moteur de génération de quittance de l'app comme **outil gratuit sans inscription**, pour :
1. **Ranker** sur « quittance de loyer », « modèle de quittance », « quittance de loyer gratuite ».
2. **Capturer** des prospects via CTA doux vers le compte gratuit (« automatise-la chaque mois »).
3. Le faire **sans trahir le positionnement souveraineté** : génération 100 % côté navigateur, zéro donnée envoyée au serveur.

## 2. Décisions validées

| Sujet | Décision |
|---|---|
| Mise en page | **Variante B** : générateur au-dessus de la flottaison + contenu SEO riche dessous (mockup `mockups/generateur-quittance/quittance-layout.html`) |
| Architecture | **Extraction DRY** : le constructeur de doc devient un module pur réutilisé par l'app ET la page publique (pas de copie) |
| Périmètre V1 | **Quittance uniquement** ; IRL et Bail = specs/plans séparés réutilisant le même patron |
| Compte | Aucun. Génération client-side. CTA doux uniquement. |
| EDL-photos | Reporté (post mise en ligne app) |

## 3. Architecture

### 3.1 — Module pur extrait
Créer `js/core/doc-quittance.js` exposant une fonction **sans dépendance à `DB` ni à l'état de l'app** :

```
buildQuittanceDoc(input) -> { html: string, filename: string }
```

- `input` = objet plat auto-suffisant : `{ bailleur:{nom,adresse,qualite}, locataire:{nom}, bien:{adresse}, loyerHC, charges, periode:{mois,annee}, datePaiement, paiementPartiel?:{montantRecu} }`.
- La fonction produit le **HTML de quittance conforme loi 6 juillet 1989** (mentions obligatoires, cas paiement partiel = « reçu »), identique au rendu actuel de l'app.
- Aucune I/O, aucune lecture de `DB`, aucun accès DOM global → testable en isolation.

### 3.2 — Refactor de l'app (réutilisation, pas copie)
`index.html` (`_buildQuittanceHtml`) est **refactoré pour appeler `buildQuittanceDoc`** en lui passant un `input` construit depuis `DB`. Le rendu app doit rester **byte-identique** (garanti par test de parité + tests quittance existants). C'est le cœur du principe DRY : **un seul moteur** nourrit l'app et la page publique → impossible que les deux divergent légalement.

### 3.3 — Pipeline PDF
Réutiliser le pipeline PDF existant de la quittance (rendu HTML → `html2canvas` → jsPDF, cf sprint EM-2d). Extraire au besoin un helper `pdfFromQuittanceHtml(html) -> Blob`. **jsPDF + html2canvas vendorés localement** (`js/vendor/`), aucun CDN au runtime (règle projet).

## 4. La page publique

`outils/quittance-de-loyer.html` — page **statique autonome** :
- Charge **uniquement** `doc-quittance.js` + le helper PDF + vendored jsPDF/html2canvas — **pas** le monolithe app (perf + SEO).
- Structure (variante B) : `<h1>` + accroche → **formulaire générateur** (au-dessus de la flottaison) → aperçu + bouton « Générer + Télécharger le PDF » → **encart CTA doux** (compte gratuit) → **contenu SEO** (qu'est-ce qu'une quittance, obligatoire/gratuite/délai, quittance vs reçu partiel, FAQ) → maillage interne vers futurs outils (IRL, bail) + l'app.
- Déployée sur le site public (github.io aujourd'hui, propryo.fr à la mise en ligne).
- Précédent architectural : la page publique **candidature** (`relay-client.js`) = même patron « page publique réutilisant la logique app ».

## 5. Flux de données

```
Utilisateur remplit le formulaire
   → JS construit l'objet input (client-side)
   → buildQuittanceDoc(input) → aperçu HTML
   → « Télécharger PDF » → pdfFromQuittanceHtml(html) → download
Rien ne quitte le navigateur. CTA → deep-link onboarding app (params préremplis, optionnel V1.1).
```

## 6. SEO & conformité

- URL propre `/outils/quittance-de-loyer`, `<title>`/meta description/`<h1>` dédiés.
- Données structurées **FAQPage** (JSON-LD).
- Contenu statique server-rendered (HTML statique = crawlable immédiatement).
- Maillage interne entre outils + vers l'app.
- **Conformité légale** : mentions loi 1989 strictement identiques à l'app (même template via le module partagé).

## 7. Gestion des erreurs

- Validation formulaire : champs requis, montants numériques, période valide.
- Repli PDF : si `html2canvas` échoue → fallback jsPDF texte natif (quittance sobre mais valide), jamais d'échec silencieux.
- Cas paiement partiel : bascule « quittance » → « reçu » avec montant reçu (règle loi 1989 déjà gérée par le moteur).

## 8. Tests

- **Vitest** sur `doc-quittance.js` : présence des mentions légales obligatoires, cas nominal, cas paiement partiel, cas charges = 0.
- **Test de parité** : pour un même `input`, sortie du module === sortie historique de l'app (garantit le refactor sans régression).
- **Audit `superpowers:code-reviewer`** obligatoire avant « prêt à tester » (document légal = sujet sensible, règle non négociable).

## 9. Périmètre & YAGNI

**Dans V1** : module `doc-quittance.js` + refactor app + page publique quittance + contenu SEO + tests + audit.

**Hors V1 (specs séparées)** :
- Générateurs IRL puis Bail (réutilisent le patron).
- Capture serveur de leads / programme d'affiliation.
- Deep-link prérempli onboarding (V1.1).
- Générateur EDL-photos-avec-inscription → **reporté à la mise en ligne réelle de l'app**.

## 10. Note d'implémentation (contrainte repo)

Ce clone local est en retard sur `origin/main` (lignée prod). **Le build se fera sur un worktree depuis `origin/main`** ; les noms de fonctions/lignes cités ici (`_buildQuittanceHtml`, pipeline EM-2d) sont indicatifs et à re-vérifier sur la prod réelle avant extraction. Le commit d'`index.html` passe par le protocole de file d'attente habituel (une ouvrière ne pousse pas `index.html` sur main).
