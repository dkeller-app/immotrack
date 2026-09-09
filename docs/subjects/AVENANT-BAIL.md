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
- **Charges — art. 23 / 23-1** : provisions (régularisation annuelle sur justificatifs) vs forfait (non régularisable).
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
- **Forfait de charges (art. 23-1) ↔ régularisation** : l'avenant enregistre `bail.chForfait` mais le **moteur de régularisation ne le lit pas encore** → un forfait posé par avenant serait aujourd'hui quand même régularisé. Câblage régul (honorer `chForfait`) = suite à faire (chantier Charges). Le dû mensuel, lui, est correct.

## §6 — Gate

`npx vitest run` (4025 tests, dont 21 avenant) · `node scripts/check-inline-js.mjs` = 5|0 · CRLF index.html = 0 bare LF · smoke 3 formats. Livrable sensible (légal + argent) → audit `code-reviewer` **+ 2ᵉ passe adversariale** (money) : 1er audit = base légale/forfait/XSS + clamp date d'effet manquant ; 2ᵉ passe = clamp fidèle à `saveBail`, aucune fausseté, seul reste `chForfait` inerte.
