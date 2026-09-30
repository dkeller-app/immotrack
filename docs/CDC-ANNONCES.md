# CDC ANNONCES — génération d'annonces de location conformes

> **Statut : FIGÉ et INTÉGRÉ en v15.702 (30/09/2026 — renuméroté : v15.701 pris par « Annexes avant signature »).** Décisions D1 → D10 + P-1 à P-3 + révisions R1 → R7 (maquette v2) tranchées par Didier du 25 au 29/09/2026. Branche `feat/annonces` (lots 1-6), audit + contre-audit code-reviewer traités, testé dans l'app réelle (PC / tablette / téléphone, sobre / dark). Reste : smoke Didier téléphone.
> Pièces jointes : `docs/subjects/ANNONCES-AUDIT.md` (ex-`AUDIT.md`) (audit du générateur + textes de loi cités mot pour mot) · maquettes locales (non versionnées) `mockups/ANNONCES/index.html` (v1) et `mockups/ANNONCES/v2-texte-unique.html` (v2, fait foi).
> Lignes `index.html` relevées sur `main` @ `711d6f33` (29/09) ; elles bougent, **les noms de fonctions font foi**.

---

## 0. Le besoin en une phrase

Rebrancher le générateur d'annonces existant sur le modèle de biens épuré, pour qu'il produise **un texte factuel, sans rien inventer, qui contient toutes les mentions obligatoires** d'une annonce de location, et le signale quand une donnée manque.

Cible : tout bailleur (particulier, SCI, LMNP) et le mandataire configuré dans le Référentiel. Usage : logement **vacant** (pas de bail en cours).

---

## 1. Décisions

| # | Décision | Tranché |
|---|---|---|
| **D1** | L'annonce affiche **toujours le loyer souhaité** de la fiche (`loyerHcRef`, `chargesRef`, `dgRef`), jamais celui de l'ancien bail. **Étape 1 « Confirmer le loyer »** (loyer HC + charges) avant la rédaction ; une modification **met à jour la fiche du logement**. Champs vides → « Continuer » grisé. | 25/09 |
| **D2** | **Un seul texte factuel + l'affiche PDF.** Les 4 tons et le format SMS sont retirés. La description ne lit que des données saisies. | 27/09 |
| **D3** | Mention obligatoire manquante : **rien n'est bloqué.** Le trou est **marqué en rouge dans le texte** (et part avec le copier), compteur « N mentions manquantes », lien « Compléter → » vers le champ. | 28/09 |
| **D4** | *Sans objet en V1 (voir D5).* Pour plus tard : montants d'encadrement en €/mois, €/m² rappelé entre parenthèses. | 28/09 |
| **D5** | **Encadrement des loyers non géré dans l'annonce en V1** : ni bloc, ni ligne de contrôle, ni champ au logement. Les champs restent au bail seul. | 28/09 |
| **D6** | **Classe G : avertir, pas bloquer.** Confirmation avec rappel légal, puis annonce générée avec la mention « classe G. » et un bandeau rouge permanent. | 28/09 |
| **D7** | **Années de référence des prix** : nouveau champ texte de la fiche DPE, **lu automatiquement dans le PDF du DPE déposé** avec la fourchette de dépenses (badge « ✨ à vérifier »), saisie manuelle sinon. La fourchette du PDF prime sur le chiffre unique ADEME. | 28/09 |
| **D8** | Honoraires : champ facultatif **« Honoraires d'état des lieux à la charge du locataire »** ; si un **mandataire** est configuré, champ **« Honoraires charge locataire (TTC) »** requis au contrôle. La ligne « Honoraires : aucun » disparaît. | 28/09 |
| **D9** | Dossier : les **4 catégories autorisées** (`PIECES_REQUISES`) + DossierFacile **cité par son nom, sans adresse web** dans le texte copié (leboncoin). Interrupteur pour l'inclure. | 29/09 |
| **D10** | **Phrase Géorisques dans toutes les annonces**, mot pour mot, en texte simple. Aucune autre adresse web ajoutée par l'app. | 29/09 |

### 1bis. Révisions du 29/09 après maquette v2 (`v2-texte-unique.html`) — elles PRIMENT sur §2.3, §3.2-3.4

| # | Décision (Didier, 29/09) |
|---|---|
| **R1** | **Un seul texte, entièrement modifiable.** Fin du bloc « mentions obligatoires » verrouillé. Le contrôle relit le texte à chaque frappe : mention présente ✓ ; emplacement « [À COMPLÉTER : …] » → à compléter (clic = sélection de l'emplacement, « Compléter → » vers la fiche) ; phrase absente → « retirée du texte · **Remettre** » (réinsère la phrase exacte à sa place). Rien n'est bloqué. |
| **R2** | **Format B, sans emojis** : accroche factuelle (« À louer à {commune} : {bien} de {surf} m² [meublé] [avec {extérieur}], au {étage} [avec ascenseur]. Disponible le … »), puis `LE LOGEMENT`, `POINTS FORTS` (puces « - »), `DOSSIER À PRÉPARER`, `INFORMATIONS` (les mentions du §3.3). |
| **R3** | **Plus de copropriété ni de période de construction** dans l'annonce. |
| **R4** | **Dossier court**, pièces de la liste autorisée (service-public F1169, vérifiée : le permis de conduire vaut pièce d'identité ; le contrat de travail est une pièce autorisée) : « Pièce d'identité · Justificatif de domicile · Contrat de travail (ou justificatif d'activité) · 3 dernières fiches de paie · Dernier avis d'imposition · Pour un garant : les mêmes pièces », puis garanties acceptées et « Le dossier peut être constitué sur DossierFacile, service public gratuit. » (remplace §3.4). |
| **R5** | **Affichage d'un manque** : emplacement « [À COMPLÉTER : …] » à l'endroit exact de la mention, surligné ambre + pointillés (calque derrière la zone de texte ; pas de rouge, M-15), bandeau de comptage au-dessus du texte, ligne du contrôle. Au retour de la fiche, seules les mentions sont remplacées ; les retouches restent. |
| **R7** | Usage **« Autre » conservé** et traité en **annonce courte** (comme garage / local : loyer, dépôt, surface, commune, Géorisques). « Autre » ne couvre aucun modèle de l'app (le bail affiche déjà « consultez un notaire ») ; sa suppression éventuelle = chantier séparé, non décidé. |
| **R6** | Champ « année(s) de référence des prix » : **le champ existant `dpe.anneePrix`** (contrat type 2026) est réutilisé et élargi à plusieurs années — pas de `prixRefAnnees` (remplace §5.2). |

---

## 2. Le parcours

### 2.1 Porte d'entrée
- Bouton **« Créer une annonce »** (libellé + icône ligne, jamais d'icône seule) dans la fiche logement, à côté de « Inviter un candidat », **seulement si `!_bienActiveBail(ref)`** et logement non archivé.
- Emplacement : là où il a été retiré (`index.html:45377-45381` à l'audit — commentaire « décision 7 du 11/08 »). La ligne de liste (`const annonceBtn = ''`, `index.html:38909`) reste **sans** bouton : une seule porte.
- Le test `__tests__/helpers/biens-migration.test.js:109-114` (qui verrouille « `openAnnonce` sans appelant ») est mis à jour en conséquence.

### 2.2 Étape 1 sur 2 — Confirmer le loyer (D1)
- Champs : **Loyer hors charges**, **Charges** (pré-remplis depuis `log.loyerHcRef` / `log.chargesRef`), total affiché « X € par mois charges comprises ».
- Texte : « Repris du loyer souhaité de la fiche {ref}. Toute modification ici met à jour la fiche du logement. »
- Écriture : `log.loyerHcRef` / `log.chargesRef` puis **`_logpPushLoyerRef(log, partial, false)`** (`js/core/logp-partial.js:61`, miroir `index.html:51314`) — même chemin que l'onglet Identité ; `_stamp(log)`, `saveDB()`, rescoring des candidats comme l'appelant existant (`saveParamLog`).
- Guard `_appReadOnly` / lecture seule : champs non modifiables, « Continuer » reste possible avec les valeurs existantes.
- Champs vides : « Continuer » grisé. Aucune reprise de l'ancien bail.
- Le dépôt de garantie n'est pas dans cette étape (lu depuis la fiche).

### 2.3 Étape 2 sur 2 — L'annonce *(remplacé par R1/R5 : un seul texte modifiable)*
- **Gauche** : Titre (modifiable) · Description (modifiable, pré-rédigée) · **Mentions obligatoires (verrouillé)** — « Ajoutées automatiquement — se corrigent dans la fiche du logement » · Pièces du dossier (option).
- **Droite** : le **contrôle** (§4) + interrupteur « Ajouter la liste des pièces du dossier » + sources légales en petit.
- **Pied** : « Inviter un candidat » (existant) · « Télécharger l'affiche PDF » · **« Copier le texte »** (primaire). Texte d'état : « Prêt à publier. » ou « N mentions à compléter avant de publier ».
- Les modifications du titre et de la description **ne sont pas persistées** (écran de lecture, comme aujourd'hui) — seule l'étape 1 écrit.

### 2.4 Formats (maquette `index.html` §1-§7)
- **PC ≥ 900 px** : modale 2 colonnes (texte | contrôle 320 px).
- **Tablette** : 1 colonne, contrôle **au-dessus**, replié en une ligne « Mentions obligatoires : N/N — Détail » quand tout est bon.
- **Téléphone** : **page plein écran** (M-16) : retour + titre, défilement, **pied collant** ; « Copier le texte » pleine largeur en premier ; cibles ≥ 44 px, champs ≥ 16 px.
- Gate : `docs/CHARTE-MOBILE.md` (M-1 → M-17), thèmes réels `sobre` et `dark`.

---

## 3. Le texte généré

### 3.1 Titre
`{Type} {surface} m²[ meublé][ avec {1er extérieur}] — {Commune}[ {n}e arrondissement]`
Ex. « Appartement T2 50 m² avec balcon — Strasbourg ». « Appartement » seulement si `imm.typeHabitat !== 'Maison individuelle'`, sinon « Maison ».

### 3.2 Description — ne lit que des données saisies *(structure remplacée par R2/R3 ; la règle « données saisies seulement » demeure)*
Ordre, chaque ligne **omise** si sa donnée est vide (aucun « undefined », aucun « 0 chambre », aucun adjectif) :
1. `{Type} de {surf} m²[ au {étage}][ avec ascenseur], dans {une copropriété | un immeuble | une maison}[ construit(e) {période}].` — période = `_periodeLegale()` : « avant 1949 » / « entre 1949 et 1997 » / « après 1997 ».
2. `Composition : …` — depuis la liste des pièces du logement (`log.edlTemplate.pieces` / `typeDeduit`, `js/core/biens-pieces.js`), pas `npp`.
3. Cuisine / sanitaires : uniquement les cases cochées (`equipements.cuisine.*`, `equipements.sanitaires.*`, `frigo` inclus).
4. `Extérieur : …` — balcon, terrasse, **loggia**, jardin (surface si > 0).
5. `Annexe(s) : …` — **toutes** les annexes cochées (cave, parking, garage, grenier, cellier, buanderie, local vélos, atelier, `customs`).
6. `Fibre optique.` si cochée.
7. `Disponible le {date}.` · `Garanties acceptées : …` (`locationInfo`).

**Supprimés du moteur** : banques `storytelling` / `convivial` / `haut-gamme`, format `sms`, lectures de `presentation.*` et `quartier.*`, `adjLifestyle`, phrases à valeur par défaut (« douche italienne », « cuisine équipée attenante »), section « Profil recherché », ligne « Honoraires : aucun ».

### 3.3 Bloc des mentions obligatoires — ordre et libellés
Libellés **verbatim** là où la loi en impose (sources : `AUDIT.md` partie 2).

```
Loyer : {HC + charges} € par mois charges comprises                    (arr. 21/04/2022, 1°)
Charges : {ch} € par mois — {provision avec régularisation annuelle | forfait}   (2°)
[Location meublée]                                                     (5° — typeUsage meublé, voir §5.4)
Dépôt de garantie : {dg} €                                             (4°)
[Honoraires d'état des lieux à la charge du locataire : {x} € TTC]     (6° — si renseigné)
[{x} € TTC honoraires charge locataire]                                (arr. 10/01/2017 4-I-6° — si mandataire)
Surface habitable : {surf} m²                                          (8°)
Commune : {ville}[ {n}e arrondissement]                                (7°)
Classe énergie : {E} · Classe climat : {G}                             (L126-33, R126-21/22)
[Logement à consommation énergétique excessive : classe F.|classe G.]  (R126-24, arr. 22/12/2021)
Montant estimé des dépenses annuelles d'énergie pour un usage standard : {fourchette}. {années}   (R126-23)
Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www.georisques.gouv.fr   (C. env. R125-25)
```
- `{années}` = texte lu sur le DPE, ex. « Prix moyens des énergies indexés sur les années 2021, 2022, 2023. »
- Donnée manquante → marqueur `[… à compléter]` en rouge à l'écran, **conservé tel quel** dans le texte copié et le PDF (D3).
- Arrondissement : Paris, Lyon, Marseille, déduit du code postal (750xx, 6900x, 130xx).

### 3.4 Pièces du dossier (interrupteur, activé par défaut) *(liste remplacée par R4)*
```
Pièces demandées (liste autorisée, décret n° 2015-1437) : une pièce d'identité, un justificatif de domicile, un justificatif de situation professionnelle, un ou plusieurs justificatifs de ressources.
Le dossier peut être constitué sur DossierFacile, service public gratuit.
```
Libellés dérivés de `PIECES_REQUISES` (`js/core/candidature.js:29`) — pas de liste recopiée. **Aucune adresse web** dans le texte copié ; l'adresse `https://www.dossierfacile.fr/` (celle déjà utilisée, `index.html:22514` à l'audit) figure seulement dans l'affiche PDF.

### 3.5 Affiche PDF
- Réutilise `_annoncePDF` (jsPDF natif + bandeau d'identité DOCS-UNIFIÉS, `MontantDoc.hardenJsPdfText`), **une page A4**.
- Loyer charges comprises en gros ; **échelles énergie et climat en couleur** (R126-22 « de façon lisible et en couleur »), couleurs = échelle officielle de l'arrêté DPE du 31 mars 2021 (la maquette est une approximation) ; mentions du §3.3 en taille ≥ texte courant (R126-21/23/24).

### 3.6 Mode « hors habitation » — garage, box, parking, local pro, autre (P-1, validé 29/09)
Déclenché par `log.typeUsage ∈ {garage, local-pro, autre}`. La loi 89-462 ne s'applique pas : même parcours (étape 1 loyer, étape 2 annonce, contrôle), contenu adapté.

| Mention | Logement | Garage / box / parking | Local pro / autre |
|---|---|---|---|
| Format loyer / charges / dépôt (arr. 21/04/2022) | obligatoire | libre | libre |
| Classes énergie et climat | obligatoire | **non concerné par défaut** (R126-15 f : « bâtiments ou parties de bâtiments non chauffés ») ; affichées si un DPE est saisi | **requis** (L126-33 vise « un bien immobilier ») |
| Dépenses d'énergie, mention F/G | obligatoire | non (L126-33 / R126-23 / R126-24 : « usage d'habitation ») | non |
| Géorisques (R125-25) | obligatoire | obligatoire | obligatoire |
| Pièces du dossier (décret 2015-1437) | encadrée, interrupteur | **interrupteur masqué** | **interrupteur masqué** |
| Honoraires charge locataire (mandataire) | requis | proposé si renseigné — applicabilité de l'arr. 10/01/2017 aux garages/locaux **à vérifier** | idem |

- **Titre** : `{log.type} {surf} m² — {Commune}` (ex. « Box 14 m² — Strasbourg »). `log.type` est le texte libre de la fiche.
- **Description** (uniquement la fiche) : `{log.type} de {surf} m²[ au niveau {etage}][, n° {numApt}], {adresse}, {commune}.` + `Disponible le …`.
- **Bloc** titré « Informations » (pas « mentions obligatoires ») : `Loyer : X € par mois[ + charges Y €]` · `[Dépôt de garantie : Z €]` · `Surface : S m²` · `Commune : …` · `[Classe énergie · Classe climat]` · phrase Géorisques.
- **Contrôle** : lignes Loyer, Surface, Commune, DPE (local pro : requis ; garage : « non concerné — non chauffé »), Géorisques.
- Sourcing : texte de R126-15 lu via un outil de lecture (Légifrance refusé au navigateur le 29/09) — **à relire mot pour mot au lot 1**.

---

## 4. Le contrôle

Une ligne par mention ; états **✓ présent** / **! manquant + « Compléter → »** / **— non concerné** (gris).

| Ligne | Présent si | Non concerné si | « Compléter → » ouvre |
|---|---|---|---|
| Loyer charges comprises | HC et charges > 0 | — | étape 1 |
| Charges et modalité | montant + `chargesModalite` | — | Identité › Loyer souhaité |
| Dépôt de garantie | `dgRef` renseigné (0 accepté) | — | Identité › Loyer souhaité |
| Surface habitable | `surf` > 0 | — | Identité |
| Commune (+ arrondissement) | `imm.ville` | — | fiche immeuble |
| Location meublée | usage meublé | usage vide | — |
| Classes énergie et climat | `dpe.classe` et `dpe.ges` | — | Diagnostics › DPE |
| Mention classe F / G | classe F ou G → ajoutée | autres classes (ligne masquée) | — |
| Dépenses + années des prix | fourchette et années | — | Diagnostics › DPE |
| Géorisques | toujours ajoutée | — | — |
| Honoraires d'état des lieux | renseignés | vide (facultatif) | — |
| Honoraires charge locataire | renseignés | pas de mandataire | Identité › Loyer souhaité |

Garde-fous (avertissement dans le contrôle, jamais bloquant) : dépôt > plafond (1 mois HC nu, art. 22 ; 2 mois meublé, art. 25-6 ; **aucun dépôt en bail mobilité**, art. 25-17) ; classe F → bandeau orange « interdite à la location au 1er janvier 2028 » ; classe G → D6.

---

## 5. Données

### 5.1 Nouveaux champs — logement (onglet Identité › bloc « Loyer souhaité », `logp-loc-*`)
| Champ | Type | Défaut | Libellé |
|---|---|---|---|
| `log.chargesModalite` | `'provision'` \| `'forfait'` \| `''` | `''` | Mode de règlement des charges (segment 2 choix) |
| `log.honorairesEdlRef` | nombre TTC \| `''` | `''` | Honoraires d'état des lieux (locataire) |
| `log.honorairesHclRef` | nombre TTC \| `''` | `''` | Honoraires charge locataire (TTC) — **affiché seulement si un mandataire est configuré** |

Lecture/écriture par `_logpReadFromForm` / `_logpFillFromLog` (lecture **partielle**, P0-1 : un champ absent de l'écran n'efface rien) ; `_stamp(log)` ; voyage cloud par le blob existant (`legacy_raw`, `js/core/store-mapping.js`) — **aucune colonne ni migration**.

### 5.2 Nouveau champ — DPE (onglet Diagnostics, `log.diagnostics.dpe`) *(remplacé par R6 : `dpe.anneePrix` existant)*
| Champ | Type | Libellé |
|---|---|---|
| `dpe.prixRefAnnees` | texte libre | Années de référence des prix |

`dpe.depensesEnergie` (existant, texte) reçoit désormais la **fourchette** « entre X € et Y € par an » quand elle est lue dans le PDF.

### 5.3 Lecture automatique dans le PDF du DPE (D7)
Extension de `_logDiagExtractSuggestions` (`index.html:48710` à l'audit), appelée par `_logDiagOnPdfUploaded` → `_logDiagApplySuggestions` : deux captures de plus, **uniquement si le champ est vide**, badge « ✨ à vérifier » + phrase source (mécanisme existant).
- Fourchette : `/entre\s+([\d\s  ]+)\s*€\s+et\s+([\d\s  ]+)\s*€\s+par an/i`
- Années : `/Prix moyens des énergies indexés sur les années\s+([\d ,et]+)/i` (repli : `indexés au 1er janvier (\d{4})`)
- Vérifié sur 3 DPE réels (Téléchargements, 2024-2025) : « entre 450 € et 670 € par an Prix moyens des énergies indexés sur les années 2021, 2022, 2023 (abonnements compris) ». Les tests unitaires utilisent ces phrases **anonymisées** (aucun PDF réel dans le dépôt).
- Priorité : fourchette PDF > chiffre ADEME (`cout_total_5_usages`, une seule valeur). L'import ADEME ne remplace pas une fourchette déjà lue.

### 5.4 Règles de lecture
- **Loyer** : `log.loyerHcRef` / `chargesRef` / `dgRef` uniquement (D1). `openAnnonce` ne copie plus `DB.baux[ref]`.
- **DPE** : via `_diagGet(log,'dpe')` (source canonique `log.diagnostics.dpe`) ; `valEner` (plus `valConv`).
- **Meublé** : `typeUsage ∈ {habitation-meuble, mobilite, etudiant}`.
- **Adresse** : `imm.ville` / `imm.codePostal` ; logement sans immeuble → `log.adr`.

---

## 6. Code — réutiliser, ne rien recréer

| Existant | Sort |
|---|---|
| `__tests__/helpers/annonce-generator.js` + miroir `js/helpers/annonce-generator.global.js` | **Réécrit** (module pur : `genererTitre`, `genererDescription`, `genererMentions`, `controlerMentions`, `genererDossier`) ; miroir régénéré par `node tools/sync-helpers-global-mirrors.mjs` ; `mirrors-a-jour.test.js` reste vert |
| Modale `#ov-annonce` (`index.html:2760-2836` à l'audit) | Refaite au gabarit §2 (boutons format/ton supprimés) |
| `openAnnonce`, `_annonceRegen`, `_annonceCopy`, `_annoncePDF`, `_annonceShowDpeWarn`, `_annonceToggleVerifie` | Réutilisés / adaptés. **Supprimés** : case « Je certifie l'exactitude » (`#an-verifie`, `_annonceToggleVerifie`) et `_annonceEmail` (P-2, P-3) |
| `_logpPushLoyerRef`, `_logpReadFromForm`, `_logpFillFromLog` | Réutilisés (étape 1, nouveaux champs) |
| `_logDiagExtractSuggestions` / `_logDiagApplySuggestions` | Étendus (§5.3) |
| `PIECES_REQUISES` | Réutilisé (§3.4) |
| `_initAnnonceSchemaIfNeeded` | **Inchangé** (`_migrateArchiV4bIfNeeded` en dépend) ; `presentation` / `quartier` conservés en base, plus lus |
| `confirm2` | Classe G (D6) |

Tests : réécriture complète de `annonce-generator.test.js` contre le modèle actuel, dont **tests anti-invention** (logement vide → aucune phrase d'équipement), **tests de verbatim** (chaque libellé légal comparé à la chaîne de l'AUDIT), cas D-103 (sortie de l'audit : plus aucun « undefined »), classe F, classe G, meublé Lyon 3e (arrondissement), mandataire (HCL requis), extraction PDF (§5.3), **box hors habitation** (aucune mention loi 89, DPE non concerné, Géorisques présent, pas de liste de pièces), **local pro sans DPE** (DPE manquant signalé).

---

## 7. Hors périmètre / limites connues

- **Encadrement des loyers (D5)** : l'arrêté du 21/04/2022 (3°) impose le bloc aux particuliers **aussi** dans les 9 territoires d'encadrement ; limite V1 assumée (parc cible hors zone ; expérimentation ELAN jusqu'au 24/11/2026 sauf prolongation).
- **DossierFacile Connect** (API OAuth2) : réservé aux partenaires avec volume minimum ; piste **onglet Candidats** pour le pilotage (le « lien simple » de partage est accessible sans condition).
- **Publication directe sur les sites d'annonces** : non (copier-coller + PDF).
- **Reprise de `chargesModalite` par le bail à sa création** : non décidé ici (le bail a son propre `chForfait`, posé par avenant).
- **Nature d'emplacement** (`bail.natureEmplacement` place/box/stockage) : reste au bail ; l'annonce hors habitation lit `log.type` (texte libre de la fiche).

## 8. Phasage (1 lot = 1 commit, worktree dédié)

1. **Moteur pur** + tests (réécriture, verbatim, anti-invention) + miroir.
2. **Données** : 3 champs logement + `prixRefAnnees` + extraction PDF DPE.
3. **Écran** : porte, étape 1, étape 2, contrôle, 3 formats × 2 thèmes.
4. **Affiche PDF** (échelles couleur, une page).
5. Audit `superpowers:code-reviewer` (légal + écriture fiche) → contre-audit → intégration pilotage → smoke Didier 3 formats.

## 9. Points tranchés en fin de conception (29/09)

- **P-1** ✅ Garage / box / parking / local pro / autre : **annonce possible**, en mode « hors habitation » (§3.6). La porte est visible pour tout logement vacant non archivé.
- **P-2** ✅ Case « Je certifie l'exactitude » : **retirée** (Copier / PDF toujours actifs, D3).
- **P-3** ✅ Bouton « Email » (`_annonceEmail`, `mailto:`) : **retiré**.

Aucun point ouvert : le CDC est prêt à être figé par le pilotage.
