# CDC — Avenant au contrat de bail (loi 89-462)

**Statut** : figé 09/09/2026 après mockups validés (`mockups/AVENANT-BAIL/`). Manque légal de l'audit code. Branche `feat/avenant-bail`.

## §0 — Intention

Modifier un bail **en cours** par un **avenant** (acte modificatif signé par les parties), sans refaire le bail. Décision user : rédaction « de niveau avocat » et **exhaustivité** des causes de modification. On n'invente ni la formulation ni les règles : tout est calé sur la loi et des modèles rédigés.

## §1 — Périmètre : 12 objets de modification

Colocataire (départ seul / ajout / remplacement) · Garant-caution · **Loyer hors IRL** · **Charges** · Annexe-dépendance · Durée-prorogation · Destination des lieux · Travaux (autorisation) · Modalités de paiement / RIB · Sous-location / cession · Clause libre · Correction d'erreur matérielle. Objets combinables (un avenant = plusieurs articles).

**Hors avenant** (ne pas mélanger) : révision IRL annuelle (simple notification, déjà gérée) · achat d'un bien déjà loué · mariage du locataire · nu↔meublé (nouveau bail) · congé/résiliation (acte séparé, chantier distinct).

## §2 — Règles légales par objet

- **Colocataire — art. 8-1, VI** : la solidarité du sortant et de sa caution prennent fin à la date d'effet du congé si un colocataire entrant figure au bail, sinon **au plus tard 6 mois** après. Départ seul : le(s) restant(s) poursuit/poursuivent seul(s). Ajout/remplacement : l'entrant adhère au bail, devient solidaire, **nouvelle caution** requise.
- **Loyer travaux — art. 17-1, II (encadré)** : hausse en cours de bail seulement par accord exprès + **travaux d'amélioration** (apport d'un équipement/service nouveau ; exclus entretien, réparation, remise en état, mise aux normes). **Seuil** : coût des travaux ≥ ½ année de loyer (6 × loyer HC). **Plafond** : hausse annuelle ≤ **15 % du coût réel TTC** → hausse mensuelle max = 15 % × coût ÷ 12. **DPE F/G** : majoration **interdite** (passoire, art. 17). Ces garde-fous sont appliqués et **bloquants** (`loyerTravauxGuard`).
- **Cautionnement — art. 22-1** : acte de cautionnement distinct (mentions manuscrites) ; mainlevée décharge la caution.
- **Charges — art. 23 / forfait** : provisions (régularisation annuelle sur justificatifs, art. 23) vs forfait non régularisable — **art. 25-10** en meublé, **art. 8-1, V** en colocation (Légifrance, relevé le 01/10/2026). ⚠ Corrigé le 01/10 : l'app citait à tort l'**art. 23-1**, qui est la contribution du locataire au partage des économies de charges après travaux d'économie d'énergie. Source unique de la référence : `referenceForfaitCharges` (`js/core/avenant.js`). Les avenants déjà signés ne sont pas réécrits (document figé).
- **Sous-location — art. 8** : accord écrit du bailleur ; prix au m² ≤ loyer principal ; le locataire reste seul tenu.
- **Destination — art. 2** ; **Durée** : sans passer sous les minima légaux.

## §3 — Rédaction (registre juridique)

Document structuré : titre + rappel du bail ; **préambule** (« Entre les soussignés… », « Il a été préalablement exposé… », « Ceci exposé, il a été convenu… ») ; **articles numérotés** (chiffres romains) complets et **sourcés** (base légale) ; **Article Prise d'effet** ; **Article Stipulations inchangées** (tout indivisible, ni novation ni nouveau bail) ; clôture « en autant d'exemplaires originaux… » ; blocs de signature **« Lu et approuvé »** (bailleur + locataires + colocataire entrant le cas échéant).

## §4 — Architecture (réutilise l'existant — zéro réinvention)

- **Module pur** `js/core/avenant.js` (testé) : `avenantArticle(k, data, ctx)`, `buildAvenantHtml(ctx)`, `loyerTravauxGuard(...)`, `romain(n)`.
- **UI inline** `index.html` : modale `#ov-avenant` (formulaire 12 objets + aperçu live), `_avenantOpen/_avenantSave/_avenantDocPageHtml/_avenantPrint`. Entrée « Créer un avenant… » dans `openBailMenu` (bail en cours).
- **Pré-remplissage** depuis le bail (bailleur/entité, `locataires[]`, `adrBien`, `hc`, date de signature).
- **DOCUMENT = trame Propryo** (rév. v15.615, retour user « boulot d'amateur ») : le corps `.pro-doc` (`buildAvenantHtml`) est habillé par **`_docPage(ent,{titre,ctx,corps,ref,date})`** — bandeau logos bailleur+Propryo, titre, table `pro-kv`, `h3` d'articles, `grid2/sig-bloc`, mentions — exactement comme l'acte de cautionnement / le bail. **Word SUPPRIMÉ** (retour user) : Impression / PDF seulement (`_avenantPrint` → fenêtre `_docCss()`), cohérent `genActeCautionnementDoc`.
- **PROPAGATION loyer/charges (rév. v15.615, demande user « pris en compte dans les calculs, charges surtout »)** : à l'enregistrement, un objet `loyer`/`charges` **date une période dans `DB.loyerBareme`** à la date d'effet — MÊME mécanisme que « Modifier le bail » : clamp de la date (`_baremeClampDateEffet` + `_bailModifBorneMinEffet` = 1ᵉʳ du mois, jamais avant le début du bail ni un mois quittancé), `_baremeGarantirCouverture` (passé au tarif précédent) puis `_baremeAppliquerNouvellePeriode` (source `manuel`). → `duMois()` et la **régularisation** recalculent à partir de la date d'effet. `bail.hc/ch` alignés. Vérifié : charges 80→95 au 01/10 → dû sept 730 / oct 745.
- **Persistance** : `bail.avenants[]` = `[{no, dateEffet, ville, objets:[{k,data}], html (doc habillé), createdAt}]` (blob bail, **aucune colonne cloud**) + trace `DB.bailEvents` (type `'avenant'` + `'modif'` sur loyer/charges) + `_auditLog`. `amends_id` (déjà en base) réservé à un futur chaînage bail↔bail.
- **Caution** : si l'avenant appelle une caution, offre de régénérer l'**acte de cautionnement** existant.

## §5 — Choix de périmètre V1 (portes ouvertes)

- **Signature in-app** de l'avenant (présentiel canvas + distant relais, même porte que le bail) = **phase 2** (le fil rouge de signature est couplé au document « bail » ; découplage + conteneur `signatures` dédié à faire). V1 = document (trame Propryo) à imprimer / signer.
- **Forfait de charges (art. 25-10 / 8-1, V) ↔ régularisation** : ✅ **CÂBLÉ** (chantier dédié, branche `claude/admiring-galileo-1fb6e1`, portée sur le registre des avenants de la refonte lot 2 — branche `feat/regul-forfait`). L'avenant enregistre `bail.chForfait` ; la régul l'honore désormais **par date**, pas en booléen brut. Primitif pur `bailForfaitActifLe(bail, dateIso)` (`js/core/avenant.js`, testé) reconstruit l'état forfait à une date depuis les avenants du bail — registre `baux_evenements` type 'avenant' + anciens `bail.avenants[]`, lus par `AvenantRegistre.listeAvenants` ; appliqués = signés, ou « À signer » d'avant le lot 3 (prédicat `avenantApplique`), date = `effetApplique` sinon date d'effet (mode charges daté ; fallback flag global si aucun avenant de charges). Un changement de régime (forfait ↔ provisions) compte comme « appliqué » : l'avenant ne s'annule plus, on revient en arrière par un nouvel avenant. `computeRegul` post-passe : exclut charges/provisions datées PENDANT le forfait, **sans toucher** une régul antérieure légitime (ex. N-1 régularisé après signature). L'estimation N-1 de départ (`_rgClotureCompute` + `_departEstimDu`) ne prorate que la fraction non-forfait (`_occNonForfaitJours`). Badge/notes UI + bandeau décompte PDF. Audit code-reviewer + 2 passes adversariales (fuite `_departEstimDu` trouvée+corrigée). **Limite assumée (option A)** : les provisions gardées restent en `bail.ch` plat (imprécision pré-existante sur l'année straddle si le montant a aussi changé). Spec : `docs/superpowers/specs/2026-09-10-regul-honore-forfait-charges-design.md`. Le dû mensuel, lui, était déjà correct.

## §6 — Gate

`npx vitest run` (4025 tests, dont 21 avenant) · `node scripts/check-inline-js.mjs` = 5|0 · CRLF index.html = 0 bare LF · smoke 3 formats. Livrable sensible (légal + argent) → audit `code-reviewer` **+ 2ᵉ passe adversariale** (money) : 1er audit = base légale/forfait/XSS + clamp date d'effet manquant ; 2ᵉ passe = clamp fidèle à `saveBail`, aucune fausseté, seul reste `chForfait` inerte.
