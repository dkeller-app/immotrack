# CDC — Bail garage / box / local de stockage (droit commun) — VALIDÉ

_Figé le 2026-09-04. Validé par Didier (contenu + trame + pagination). Source unique de vérité pour
le chantier. Aucune invention hors de ce document ; audit d'appui :
`AUDIT-BAIL-GARAGE-STOCKAGE.md`._

## 0. Objet & périmètre

Permettre de créer proprement un **bail de droit commun** (Code civil, art. 1708 et suivants) pour un
**emplacement de stationnement, un box fermé ou un local de stockage** loué **isolément** (contrat
autonome, hors loi n° 89-462).

**Inclus** : structure de document dédiée, wizard épuré, PDF natif + signature (réutilisés),
pagination par pages pleines avec paraphes.
**Exclu** : bail commercial (statut 3-6-9) ; garage **accessoire** à un logement du même bailleur
(déjà couvert par le bail d'habitation via « locaux accessoires à usage privatif »,
`index.html:1803`).
**Lot 2 (chantier séparé)** : état des lieux garage simplifié.
**Backlog fiscal (hors périmètre)** : TVA sur loyer de garage (loyer HT/TTC).

## 1. Régime juridique (sources officielles)

- Emplacement loué **isolément** → **Code civil art. 1708 et s.** (louage de droit commun) : durée,
  préavis, dépôt de garantie **libres** ; **aucun** DDT/DPE, **aucune** notice d'information, pas de
  clause résolutoire loi 89, pas de MRH habitation obligatoire.
- Loi 89-462 ne s'applique **que** si l'emplacement est accessoire à un logement du même bailleur
  (jurisprudence Cass. Civ. III, 5 mars 1997 n° 95-14588 ; 30 sept. 2009 n° 08-18.626).

## 2. Vocabulaire — décision : UN type, nature interne

- **Une seule** entrée au sélecteur « Type de bail » : `garage` (déjà présente, `index.html:1616`),
  libellé « 🚗 Garage / parking / box (Code civil libre) ».
- Un champ **Nature de l'emplacement** (nouveau) : `place` (place de stationnement numérotée) ·
  `box` (box fermé, surface + serrure) · `stockage` (local de rangement). La nature adapte le titre,
  la désignation (§1) et la destination (§2). Persistance : `bail.natureEmplacement`.
- Champ « choix prédéfini + ajout libre » pour le descriptif (règle
  [[feedback_choix_plus_ajout_libre]]).

## 3. Document — structure validée (16 sections + annexes)

Titre : « CONTRAT DE LOCATION D'UN(E) {PLACE DE STATIONNEMENT | BOX FERMÉ | LOCAL DE STOCKAGE} ».
Sous-titre : « Code civil — Art. 1708 et suivants — Location de droit commun (hors loi n° 89-462) ».

| § | Section | Contenu clé / fondement |
|---|---------|--------------------------|
| — | En-tête | `brandzone` (Propryo) + table récap (bailleur, locataire, adresse, emplacement, prise d'effet, durée, loyer/charges, DG) |
| — | Entre les soussignés | Le Bailleur (société/personne physique) · Le(s) Locataire(s) |
| 1 | Désignation de l'emplacement | N° / box / m² + niveau + descriptif ; lot copro si applicable ; **pas** de Carrez/pièces/DPE |
| 2 | **Destination — usage exclusif** ⭐ | Stationnement **ou** remisage/stockage selon nature ; **interdictions** : habiter/séjourner, activité pro/commerciale, matières dangereuses/illicites, raccordements ; infraction = motif de résiliation (§13) |
| 3 | Durée — Reconduction — Congé | Durée **libre** (art. 1709) ; tacite reconduction ; **préavis 1 mois** par défaut (LRAR), congé non motivé |
| 4 | Loyer et révision | 4.1 montant + virement · **4.2 révision : loyer FIXE par défaut, indexation ICC OPTIONNELLE** (décochée) · 4.3 intérêts de retard (art. 1231-6) |
| 5 | Charges | **Conditionnelle** : quote-part copro parking, sinon « Aucune charge — loyer forfaitaire » |
| 6 | Dépôt de garantie | Libre ; **imputation interdite** sur le loyer |
| 7 | **Garanties de paiement** | **Conditionnelle** (si garant) : caution solidaire art. 2288+ **avec mention art. 2297** ; mention que **GLI/Visale non applicables** |
| 8 | Assurance et responsabilité | RC + locataire assure son contenu (bailleur non gardien) ; **présomption d'incendie art. 1733** ; **pas** de MRH habitation |
| 9 | État des lieux | EDL simplifié entrée/sortie (Annexe 1) |
| 10 | Entretien et usage | Usage paisible, menues réparations locataire ; grosses réparations bailleur (art. 1719-1720) |
| 11 | Cession et sous-location | Interdites sans accord écrit (art. 1717) |
| 12 | **Restitution et biens laissés** ⭐ | Restitution vidée + moyens d'accès ; **biens abandonnés** (mise en demeure + 1 mois → enlèvement aux frais du locataire) ; **accession art. 555** (installations fixes : au choix du bailleur, remise en état ou conservation sans indemnité) |
| 13 | Clause résolutoire | **Droit commun art. 1224-1230** (impayé / défaut assurance / destination), mise en demeure 1 mois |
| 14 | Clause pénale — indemnité d'occupation | Art. 1231-5 (2× loyer journalier) |
| 15 | Dispositions diverses | **Solidarité** si pluralité (art. 1310) · **tolérance/non-renonciation** · élection de domicile · **état des risques conditionnel** (voir §Annexes) · RGPD · compétence (rappel légal, pas de dérogation) |
| 16 | Signatures | `.sig-bloc` bailleur + locataire(s) — chaîne signature réutilisée |
| — | Annexes | Voir §4 |

⭐ = clauses de sécurité centrales pour le bailleur.

**Ton neutre** (infinitif / générique — particulier comme agence), règle
[[feedback_ton_neutre_generique]].

## 4. Annexes / documents à remettre

**Aucune annexe obligatoire de type logement** (ni DPE, ni DDT, ni notice, ni règlement de copro,
ni grille de vétusté, ni décrets 87-712/713).

| N° | Annexe | Condition |
|----|--------|-----------|
| 1 | État des lieux simplifié | Toujours (établi lot 2) |
| 2 | **État des risques (ERP)** — art. L125-5 C. env. | **Uniquement si l'adresse est en zone à risque** (PPR/sismicité/radon, Géorisques). L'obligation tient à la localisation, pas au caractère logement. |
| 3 | Acte de cautionnement solidaire | Si un garant est saisi |

## 5. Wizard épuré (formulaire de création)

**Retirés pour `garage`** (masqués) : diagnostics logement (DPE/GES/plomb/amiante/élec/gaz/bruit),
surface Carrez, pièces, chauffage/ECS/cuisine/sanitaires, zone tendue/encadrement/complément,
dépenses énergétiques, précédent locataire, travaux inter-locatifs, inventaire mobilier, notice,
DAAF, grille de vétusté, animaux, MRH habitation.
**Conservés** : identité des parties (bailleur société/personne physique, locataire, garant),
entité propriétaire, IBAN/BIC, ville de signature, **chaîne de signature (présentiel/distance) et
PDF natif inchangés**.
**Nouveaux/adaptés** : champ **Nature** (place/box/stockage) ; désignation (n°/surface/niveau/
descriptif + destination) ; **case indexation décochée par défaut** (indice **ICC**, alternatives
ILC/ILAT ; IRL exclu) ; **ERP conditionnel** si zone à risque.
Comportement `onBailTypeChange` pour `garage` : durée libre (déjà géré), **pas** de suggestion DG,
masquage des rubriques logement (nouveau).

## 6. Réutilisation du code existant (DRY — on ne réinvente pas)

Le bail garage **route `buildBailStructure` (`index.html:19581`) vers une branche `isGarage`
dédiée** qui appelle les **mêmes helpers** et **omet/remplace** uniquement les blocs loi 89.

**Réutilisés tels quels** : moteur `blockToHTML` (`:19365`), `brandzone`
(`DocBrand.brandzoneHtml`), table d'en-tête, blocs identité (`locsDetailBlocks`, `garantBlocks`,
`mandataireBlocks`), **signatures + `resolveBailleurSigners` + PDF natif** (`:20375`), clause pénale,
LRE, élection de domicile, RGPD, acte de caution (mention art. 2297).
**Réutilisés reformulés (réfs loi 89 retirées)** : cession/sous-location → art. 1717 ; dépôt de
garantie (branche `isGarage` déjà présente `:20071`) ; assurance → RC + art. 1733 ; clause
résolutoire → art. 1224-1230.
**Remplacés (impossible à réutiliser — loi 89 intrinsèque)** : §1 désignation logement, §2 DDT, §3
destination habitation, révision IRL, charges 87-713, grille vétusté, entretien 87-712, abandon
logement art. 14-1, DAAF/cotitularité 1751, Annexes A/B, notice.

## 7. Pagination — pages pleines + paraphes (réutilisation)

Réutilise `renderStructureAsHTML` + le moteur PDF natif (`PdfFlow`) : **le corps coule et remplit
chaque page** ; le filet + les cases de paraphe sont posés à Y fixe (`pdf-flow.global.js:30-31`) ;
`splitBlockAcrossPages` coupe un bloc trop long. **Saut de page dur uniquement** sur un bloc
`page-break` explicite → à insérer **avant Signatures** et **avant Annexes** (comme le bail actuel,
`index.html:20385`/`20443`). Résultat cible : ~6 pages pleines, page signatures **sans paraphe**.

**⚠️ Adaptation d'1 ligne requise** : `PdfFlow.SECTION_TITRES` (`pdf-flow.global.js:50`) détecte la
page signatures par un regex **numéroté loi 89** (`/^18\s*[—-]?\s*SIGNATURES/i`). Le bail garage
numérote signatures **§16** → **généraliser sur le mot** `/SIGNATURES/i` (sans le numéro), sinon la
page signatures serait paraphée à tort. Aucune autre modif de la mécanique.

## 8. Contraintes transverses (non négociables)

- **Aucun CDN au runtime**, **aucune nouvelle colonne cloud** ([[project_no_runtime_cdn]]).
- Un seul champ data nouveau : `bail.natureEmplacement` (+ champs désignation garage déjà
  couverts par les champs bien existants).
- Rétrocompatibilité : les baux `garage` existants (le cas échéant) restent lisibles ; migration
  nulle si `natureEmplacement` absent → défaut `box`.
- **TDD** : logique de branche `isGarage` + regex `SECTION_TITRES` couvertes par tests Vitest
  ([[feedback_sandbox_first]], [[feedback_modify_verify]]).
- **Audit `superpowers:code-reviewer` obligatoire** avant « prêt à tester »
  ([[feedback_audits_par_agents]]).
- Bump de version + `BACKLOG.md` à la livraison ([[feedback_versioning]],
  [[feedback_pilotage_realtime]]).
- Smoke user 3 formats sur github.io avant clôture.

## 9. Lots de livraison

1. **Bail garage — structure + wizard épuré + PDF/signature + pagination** (ce chantier).
2. **EDL garage simplifié** (chantier séparé, lot 2).
- Follow-on backlog : TVA garage (fiscal).

## 10. Découpage d'implémentation (worktree dédié)

1. `bail.natureEmplacement` + sélecteur Nature dans le wizard + masquage rubriques logement pour
   `garage` (`onBailTypeChange`).
2. Branche `isGarage` complète dans `buildBailStructure` (structure §1-16 + annexes conditionnelles
   ERP/caution), réutilisant les helpers ; `page-break` avant Signatures/Annexes.
3. Révision : loyer fixe par défaut, clause d'indexation ICC optionnelle.
4. `PdfFlow.SECTION_TITRES` : regex signatures généralisé sur le mot.
5. Tests Vitest (structure garage : absence des blocs loi 89, présence des clauses de protection,
   ERP conditionnel, pagination signatures sans paraphe).
6. Audit code-reviewer → bump version → BACKLOG → smoke 3 formats.
