# IRL-REVISION — CDC « la validation d'une révision IRL applique vraiment »

> Validé dans le chat par Didier le 2026-09-24. Worktree `Immo-wt-irl-valid` (branche `fix/irl-validation`, base `origin/main` 7b7eca6 = v15.678). Pas de bump : le pilotage intègre.

## 0. Le bug (prod v15.678)

Loyers → Révisions → `Réviser` → `Valider la révision` : le pop-up se ferme, la ligne reste « en retard · jamais appliqué », aucun document.

**Cause racine (prouvée par le code)** : la date d'effet pré-remplie est toujours FUTURE (en retard → 1er du mois suivant la validation ; à préparer → date de l'anniversaire). `_applyIRLValidated` crée alors une entrée `pendingApply` dans `DB.irlHistorique` + une période au barème, mais ne pose `irlDerniereApplication` que si l'effet est déjà atteint (`_baremeRecordRevision`, `applyNow`). Or `IrlCalendrier.etatRevision` ne connaît le cycle « fait » QUE par ce champ → ligne inchangée, à chaque fois. L'état « validée, effet à venir » n'existe pas dans le modèle. Aucune génération de lettre dans `_applyIRLValidated`.

Les 12 `window.X` du chemin sont exposés (js/main.js) — ce n'est PAS un wrapper `undefined`. `saveDB` est bien appelé.

### Inventaire complet de l'audit (tous traités par ce chantier)

| # | Constat | Lieu |
|---|---|---|
| 1 | Validation à effet futur → cycle jamais marqué, ligne reste « en retard » | `_applyIRLValidated` / `_baremeRecordRevision` / `etatRevision` |
| 2 | Liste, frise, badge, alertes, pilotage, Accueil ne lisent que `irlDerniereApplication` ; seul `_collectIRLRappels` lit le journal → surfaces contradictoires | `_lyRevisionsTriees`, `irlClassifier`, `_pilIrlDot`, widget irl |
| 3 | Aucune lettre produite à la validation | `_applyIRLValidated` |
| 4 | Double validation possible → 2ᵉ entrée `pendingApply` éternelle | `_applyPendingIRLRevisions` (garde divergence) |
| 5 | « Renoncer » offert après une validation → renonciation + révision appliquée quand même | `skipIRL` |
| 6 | Aucune annulation d'une révision validée ; `resetIRLApply` = code mort et ne retire pas la période du barème | `resetIRLApply` |
| 7 | Application différée en date UTC (J+1) et seulement au boot | `_applyPendingIRLRevisions` |
| 8 | « Revoir la lettre » recalcule sur le loyer DÉJÀ révisé → 2ᵉ révision affichée | `genIRLLetter`, timeline `:41815` |
| 9 | Lettre : « prend effet au mois anniversaire » même si l'effet réel diffère | `_buildIRLLetterHtml` |
| 10 | Lot sans DPE confirmé : PDF / partage / envoi refusés quand même (contraire D23) | `envoyerLettreIRLParEmail`, `_shareIRLLetterWithPdf`, `_genPdfIrlRevision` |
| 11 | Pop-up : date d'effet descendable sous la date de la demande (rétroactif) | `_irlValidConfirm` |
| 12 | Menu `…` = `skipIRL` direct, rien d'autre | `_lyLigneRev` |
| 13 | Fiche du bien non rafraîchie après validation | `refreshAllIRL` / `_rPeriodPage` |
| 14 | `_auditLog` : le détail « ancien→nouveau » est passé dans `entityRef` | `_applyIRLValidated` |
| 15 | Aucune date de révision saisissable au bail ; clause figée « date anniversaire » | wizard bail `#b-irl`, clause 5.2 |
| 16 | D12 « 1er du mois de l'anniversaire » AVANCE la révision (bail du 15/09 → effet 01/09) | `IrlCalendrier.effetDuCycle` |
| 17 | = 11 : borne basse = anniversaire, pas la demande | `_baremeClampDateEffet` appelé sans la date de demande |
| 18 | Clause du bail « sans notification préalable » contraire à « prend effet à compter de sa demande » | modèle bail 5.2 (`:5333`, `:21567`) |

## 1. Base légale (textes vérifiés)

- **Art. 17-1 I, loi 89-462** (version en vigueur depuis le 24/08/2022) — [Légifrance](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000043977085) :
  - « Lorsque le contrat prévoit la révision du loyer, celle-ci intervient chaque année à la date convenue entre les parties ou, à défaut, au terme de chaque année du contrat. »
  - « A défaut de manifester sa volonté d'appliquer la révision du loyer dans un délai d'un an suivant sa date de prise d'effet, le bailleur est réputé avoir renoncé au bénéfice de cette clause pour l'année écoulée. »
  - « Si le bailleur manifeste sa volonté de réviser le loyer dans le délai d'un an, cette révision de loyer prend effet à compter de sa demande. »
- **Meublé** : art. 25-9 renvoie à l'art. 17-1 I — [Légifrance](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000037670681/).
- **Bail mobilité** : révision interdite pendant le bail — [service-public](https://www.service-public.gouv.fr/particuliers/vosdroits/F36511/1).
- Confirmations : [service-public F36511](https://www.service-public.gouv.fr/particuliers/vosdroits/F36511/0), [ANIL](https://www.anil.org/votre-besoin/louer/le-loyer/modalites-de-revision-du-loyer-en-cours-de-bail/) (« le nouveau loyer s'applique à partir du jour de la demande »).

## 2. Règles validées

- **R1 — Date de révision du bail** = jour + mois, stockée sur le bail. Défaut calculé depuis la date de début : si le bail ne commence pas le 1er, **report au 1er du mois suivant** (bail du 15/09 → révision chaque 01/10). Jamais de révision en cours de mois. Remplace D12.
- **R2 — Date d'effet d'une révision** : validée avant ou le jour de la date de révision → effet = date de révision ; validée après → **1er du mois suivant la demande** (le jour même si la demande est un 1er). Jamais sur un mois déjà quittancé. **Jamais rétroactive** : le pop-up ne peut pas descendre sous ce minimum.
- **R3 — Révision possible toute l'année** : le cycle reste ouvert 12 mois après la date de révision. Au-delà : perdu (art. 17-1), applicable pour l'avenir via le garde-fou existant.
- **R4 — Alerte un mois avant** : le 1er du mois précédant la date de révision, le lot passe « à préparer » (Accueil, badge, bloc Révisions). Valider à l'avance → la lettre part → effet à la date de révision : aucun mois perdu (D13 conservé).
- **R5 — États** : à préparer → **programmée au JJ/MM** → appliquée ; + en retard, perdue, renoncée. Source de vérité = l'entrée du cycle dans `DB.irlHistorique` (en attente ou appliquée), plus seulement `irlDerniereApplication`. Tranché dans le module pur `js/core/irl-calendrier.js`, lu par TOUTES les surfaces.
- **R6 — Valider = acter + produire la lettre** : après « Valider », la lettre s'ouvre (Télécharger / Partager / Imprimer, chaîne existante). Construite depuis l'entrée validée (ancien HC, nouveau HC, indices, date d'effet réelle) — jamais recalculée sur le loyer courant. Texte : « prend effet le {date d'effet} ».
- **R7 — Menu `…`** : avant validation → aperçu de la lettre, renoncer. Après → revoir la lettre, corriger la date d'effet (existant, timeline), annuler la révision programmée (tant que l'effet n'est pas atteint ; retire l'entrée d'historique ET la période du barème).
- **R8 — Pas de double validation** : un cycle validé ne se revalide pas ; « Réviser » devient « Voir la lettre ».
- **R9 — Application à la date d'effet** en date LOCALE, au boot et au rendu.
- **R10 — Champ bail « Date de révision annuelle »** dans le wizard, à côté du trimestre IRL ; pré-rempli (R1 ou R11), modifiable. Imprimé dans la clause 5.2 (« révisé chaque année le 1er octobre »). **Bail signé = figé, point.** Pas d'avenant pour changer cette date.
- **R11 — Option bailleur** « Date de révision commune » (facultative) : pré-remplit les NOUVEAUX baux de ce bailleur ; modifiable bail par bail ; ne touche jamais un bail existant.
- **R12 — Jamais bloquant** : première révision à moins d'un an du début du bail (cas date commune) → autorisée, avec avertissement + case à cocher dans la fenêtre garde-fou existante (« Bail de moins d'un an — valider quand même l'augmentation ? »).
- **R13 — Clause du bail** : retrait de « sans notification préalable » du modèle 5.2 (nouveaux baux uniquement ; les signés ne changent pas).
- **R14 — Exclusions / invariants** : bail mobilité = aucune révision. Inchangés : gel DPE F/G, prescription 1 an, aucun loyer passé recalculé (I-1), mois quittancé intouchable.
- **R15 — Aucune migration** : un bail sans le champ utilise R1 calculé, rien n'est réécrit. Les révisions déjà validées gardent leurs dates. Effet visible assumé : un bail du 15/09 affichait son cycle au 01/09, il l'affichera au 01/10.
- **Persistance** : bail et bailleur voyagent entiers dans `legacy_raw` (`js/core/store-mapping.js:59`) → **aucune colonne cloud**.

Hors périmètre : avenant de changement de date de révision (refusé).

## 3. Lots (1 lot = 1 commit)

1. **Moteur pur** (`irl-calendrier.js` + `loyer-bareme.js`) : date de révision (R1/R10/R11), date d'effet (R2), état « programmée » depuis le journal (R5), fenêtre (R3), mobilité (R14). TDD.
2. **Validation** : état juste sur toutes les surfaces (1, 2), lettre depuis l'entrée (3, 8, 9), anti-double (4), application locale au rendu (7), pop-up borné (11, 17).
3. **Menu `…`** : lettre, correction, annulation (5, 6, 12).
4. **Champ bail + clause 5.2 + option bailleur** (15, 16, R12, R13).
5. **Annexes** : DPE absent confirmé (10), fiche du bien (13), audit log (14).

## 4. Gate

`npx vitest run` vert · `check-inline-js` 5|0 / 6|0 · `index.html` CRLF, 0 LF nu · repro AVANT/APRÈS dans le navigateur (valider → ligne « programmée au JJ/MM » ou « appliquée » + lettre ouverte) · smoke PC / tablette / téléphone · audit `superpowers:code-reviewer` (légal) · intégration sous GO Didier.
