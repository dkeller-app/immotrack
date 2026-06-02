# Design — IMPORT-ACTE-VENTE (extension) : bail repris, extraction enrichie, stockage de l'acte & fil rouge de complétion

**Date** : 2026-06-02
**Spec de base** : `docs/superpowers/specs/2026-06-01-import-acte-vente-design.md` (wizard de création entité/immeuble/logements/annexes — phases A/B/D codées en sandbox ; C/E restantes)
**Mockups validés (vrai navigateur)** :
- `mockups/import-acte-vente/bail-dpe-guide.html` — bloc Occupation (vérif) + charges (validé « ok c'est bien »)
- `mockups/import-acte-vente/fil-rouge-completion.html` — fil rouge post-import, **variante B « Fil rouge + détail »** (timeline B × détail tâches de A), responsive PC/tablette/téléphone corrigé

**Prio** : P2 · **Taille** : M · **Statut** : design validé en mockup, en attente OK user + reprise des infos de la session parallèle avant code prod.

---

## 1. Objectif

Étendre le wizard d'import d'acte (déjà capable de créer bailleur + immeuble + logements + annexes) pour qu'**un seul dépôt de PDF** capte davantage de l'acte et **enchaîne sur la mise en route locative** :

1. **Bail repris** — si l'acte décrit un bien loué (locataire, loyer, charges, date de début), pré-remplir l'**occupation du logement** dès l'étape de vérification, puis inviter à finaliser le **bail** via l'écran existant.
2. **Extraction enrichie** — récupérer le **prix de vente**, le **régime de copropriété + nombre de lots**, l'**année/période de construction** (opportuniste), le **syndic** et le **type d'habitat**, chacun mappé sur un champ immeuble **existant**.
3. **Stockage de l'acte** — joindre le PDF de l'acte aux « 📁 Documents communs » de l'immeuble.
4. **Fil rouge de complétion** — après import, un parcours guidé invite à compléter **tout** ce qui manque (bailleur + immeuble + chaque bien), avec option « plus tard », sans rien d'obligatoire.

**Principe inchangé (gravé)** : aucune écriture aveugle. Toute valeur extraite est `✨ suggéré · à vérifier` (ambre) et n'est persistée qu'après validation explicite à l'étape 2 du wizard.

**Réutilisation, pas réinvention** : on s'appuie sur les modules existants (Bail `openBail`/`saveBail`, Diagnostics/DPE `openLogModalOnTab(ref,'diagnostics')` + ADEME, GED `_attachmentSaveForEntity`). On ne construit aucun mécanisme parallèle.

---

## 2. Décisions verrouillées (en plus de D1–D6 de la spec de base)

| # | Décision | Justification |
|---|---|---|
| **D7** | **Bail repris = pré-remplissage du cache d'occupation du logement** (`log.locataire/hc/ch/debut/fin/dg`), pas création d'un objet `DB.baux[ref]` complet à l'import. | Le bail complet exige état civil + clauses + signatures, absents/partiels dans l'acte. On pré-remplit l'occupation (suffisant pour le tableau de bord / vacance) et le fil rouge renvoie vers `openBail` pour finaliser. Évite tout bail « bidon » non signé. |
| **D8** | **Bloc Occupation dans l'étape Vérification**, par logement, avec bascule 🔑 Loué / 🏠 Vacant. Champs suggérés : locataire, loyer HC, **charges**, date d'effet (+ DG si présent). Tous `✨ à vérifier`. | Réutilise la sémantique d'occupation existante. Charges ajoutées sur demande explicite user (« il manque les charges »). |
| **D9** | **Extraction enrichie ancrée sur des champs immeuble EXISTANTS uniquement.** Aucune donnée sans champ d'accueil (date d'acquisition, vendeur, notaire, servitudes, hypothèques, quote-part charges) n'est extraite — pour ne pas créer de bruit. Réf. cadastrales / contenance restent en `imm.notes` (déjà fait). | Évite des champs orphelins et la dérive du modèle. Chaque donnée extraite a une cible identifiée (§4). |
| **D10** | **Prix de vente → `imm.valeurEstimee`** (et non un nouveau champ `prixAchat`). | Aucun champ prix/date d'achat n'existe ; `valeurEstimee` alimente déjà les calculs de rendement/rentabilité. On réutilise. À vérifier (prix d'acquisition ≈ valeur de départ). |
| **D11** | **Année/période de construction = extraction opportuniste** (best-effort), **révise D6** : si l'acte la mentionne (rare — absente des 4 actes étudiés), on la suggère ; sinon le champ reste vide et **le DPE demeure l'autorité**. | D6 disait « non extraite ». On tente quand même quand c'est présent, sans en faire une attente. Faible rendement assumé. |
| **D12** | **Fil rouge post-import = variante B « Fil rouge + détail »** (timeline verticale connectée Bailleur → Immeuble → chaque Bien, qui se remplit selon l'avancement + pastille « à compléter », et chaque nœud déplie la liste détaillée des tâches ✓/!/○). Les fiches complètes restent repliées. **Non bloquant** : « plus tard » possible, reprise depuis chaque fiche. | Choix user (fusion B×A validée en mockup). « Un vrai fil rouge pour que l'utilisateur suit. » |
| **D13** | **Acte PDF joint à l'immeuble** via `_attachmentSaveForEntity`, catégorie `documents`, nommé `Acte de vente — <nom immeuble>.pdf`. | Infra GED existante (IndexedDB + `DB.documents[]` + sync Drive bidir). L'immeuble est déjà un `parentType` valide de bout en bout, et sa fiche 360° affiche déjà « 📁 Documents communs ». Réutilisation pure. |

---

## 3. Périmètre d'extraction enrichie

**À extraire (chacun mappé §4, tous `✨ à vérifier`)** :
- Prix de vente · Régime « Copropriété » + nombre de lots · Année/période de construction (opportuniste) · Syndic (nom, tél, adresse si présents) · Type d'habitat · **Occupation/bail repris** (locataire, loyer, charges, date début, DG).

**Hors-scope (pas de champ d'accueil → ignoré pour éviter le bruit)** : date d'acquisition, références cadastrales section/parcelle (restent en `imm.notes`), vendeur, notaire, servitudes, hypothèques, quote-part de charges de copropriété.

---

## 4. Mapping vers le modèle (extension du §6 de la base)

| Donnée extraite | Cible | Champ(s) | Fiabilité |
|---|---|---|---|
| **Prix de vente** | immeuble (`im` dans `_acteApply`) | `valeurEstimee` (D10) | forte (toujours énoncé dans l'acte) |
| **Régime copropriété** | immeuble | `regimeJuridique = 'copropriete'` (affine l'heuristique actuelle « >1 logement ») | forte (EDD / règlement de copro cités) |
| **Nombre de lots** | immeuble | `nbLots` (remplace le compte de logements quand l'acte donne le total EDD) | moyenne |
| **Année / période** | immeuble | `annee` (number) et/ou `periodeConstr` (select : Avant 1949 / 1949-1974 / 1975-1989 / 1990-2005 / Depuis 2005) | **faible / opportuniste (D11)** |
| **Syndic** | immeuble | `syndic.nom`, `syndic.tel`, `syndic.adr` (objet `syndic`, aujourd'hui `null`) | faible/moyenne |
| **Type d'habitat** | immeuble | `typeHabitat` (Immeuble collectif / Maison individuelle ; copro → collectif par défaut) | moyenne |
| **Occupation — locataire** | logement (`mkLog`) | `locataire` (nom) | moyenne |
| **Occupation — loyer HC** | logement | `hc` (number) | moyenne |
| **Occupation — charges** | logement | `ch` (number) — provision pour charges (D8) | moyenne |
| **Occupation — date d'effet** | logement | `debut` (date) | moyenne |
| **Occupation — DG** | logement | `dg` (number, si l'acte le mentionne) | faible |

Les champs immeuble cibles existent déjà dans l'objet construit par `_acteApply` (lignes 36009-36021 : `annee:0, periodeConstr:'', regimeJuridique, typeHabitat:'', nbLots, valeurEstimee:0, syndic:null`) — il s'agit de **les renseigner depuis le brouillon extrait** au lieu des valeurs par défaut. Idem pour l'occupation : `mkLog` initialise déjà `locataire/hc/ch/debut/fin/dg` (36036-36040) → on les remplit depuis l'extraction.

---

## 5. Bail repris & bloc Occupation (étape Vérification)

### 5.1 Extraction (`_acteExtract` / module `acte-extract.js`)
Nouvelle section « bien loué » : ancrer sur les clauses d'état locatif de l'acte (ex. `DECLARATIONS … BAUX`, `ÉTAT LOCATIF`, « les biens sont actuellement loués », « bail en date du … », « moyennant un loyer de … € … outre une provision pour charges de … € … dépôt de garantie de … € »). Extraire par logement quand l'acte le permet, sinon au niveau immeuble (l'user ventile à la vérification). Défensif : ancre absente → occupation vide (logement = vacant par défaut).

### 5.2 UI (mockup `bail-dpe-guide.html`, validé)
Dans l'étape Vérification, sous chaque logement : carte `.occ` avec
- en-tête : titre + segment 🔑 Loué / 🏠 Vacant ;
- corps (si Loué) : Locataire · Loyer HC (€) · **Charges (€/mois)** · Date d'effet (+ DG si extrait), tous en `.acte-sg` `✨ à vérifier` ;
- phrase source de l'acte affichée (repliable) ;
- si Vacant : message « Aucun bail repris — tu pourras créer un bail plus tard ».

### 5.3 Application (`_acteApply`)
Pour chaque logement validé « Loué » : renseigner `log.locataire/hc/ch/debut/dg` (D7). **On ne crée pas** d'objet `DB.baux[ref]`. Le fil rouge (D12) propose ensuite « 📋 Bail » → `openBail(ref)`, qui pré-remplit déjà `b-hc/b-ch/b-dg` depuis le logement (14329, 14768-14773) ; à l'enregistrement, `saveBail()` resynchronise `log.hc/ch/dg/debut/fin/locataire` (15433-15446). Aucune divergence de modèle.

**Garde-fou légal** : aucun bail signé n'est généré à l'import ; on ne fait que pré-remplir une occupation « à vérifier ». L'immutabilité du bail signé (règle gravée) n'est pas concernée.

---

## 6. Stockage de l'acte PDF (D13)

1. **Retenir le dataURL** : dans `_acteProcessPdf(dataUrl, name)` (35639), `dataUrl` (= `rd.result`, base64) est aujourd'hui ignoré ; le conserver sur le brouillon : `_acteDraft.fileDataB64 = dataUrl; _acteDraft.fileSize = <octets>` (ligne 35650, l'`Object.assign`).
2. **Joindre après création** : dans `_acteApply`, après `saveDB()` et la création de l'immeuble (~36084), appeler
   ```
   _attachmentSaveForEntity(
     { type:'immeuble', id: im.id, category:'documents' },
     { name:`Acte de vente — ${im.nom}.pdf`, mime:'application/pdf', size:_acteDraft.fileSize, dataB64:_acteDraft.fileDataB64 }
   )
   ```
   → écrit en IndexedDB (`_idbPut`), pousse dans `DB.documents[]`, upload Drive en tâche de fond, `_auditLog('create','attachment',…)`.
3. **Rendu** : la fiche 360° immeuble affiche déjà la section « 📁 Documents communs » (`_renderAttachmentSection({parentType:'immeuble', category:'documents'})`, ~34445) — l'acte y apparaît sans code d'affichage supplémentaire.

Défensif : si `_attachmentSaveForEntity` échoue (quota IndexedDB, etc.), l'import reste réussi (try/catch, toast d'avertissement non bloquant).

---

## 7. Fil rouge de complétion post-import (D12)

### 7.1 Déclenchement
À l'étape Succès du wizard (`_acteRenderSucces` / `_acteSetStep('succes')`, ~36090), proposer « Compléter les fiches » qui ouvre l'écran fil rouge (modale dédiée). « Plus tard » ferme le wizard ; le fil rouge reste accessible (au minimum implicitement, chaque fiche étant éditable depuis la page Biens).

### 7.2 Modèle de complétion (calculé, pas figé)
Groupes dans l'ordre du fil : **Bailleur → Immeuble → chaque Bien créé**. Pour chaque groupe, une liste de tâches dont le **statut est calculé sur l'état réel des champs** :
- `done` (✓) : champ rempli ;
- `warn` (!) : manquant **et important** (ex. *N° fiscal du logement — obligatoire depuis 2024*, *bail repris à finaliser*) ;
- `todo` (○) : manquant, optionnel (DPE, équipements communs, risques/ERP…).

Tâches types (depuis le modèle réel) :
- **Bailleur** : identité société (done), gérant, coordonnées, IBAN.
- **Immeuble** : adresse/cadastre, prix, copropriété+syndic, année (done si extraits) ; équipements communs, DPE collectif (todo).
- **Bien** : caractéristiques (done) ; N° fiscal (warn, obligatoire 2024) ; pièces & équipements (todo) ; **bail repris** (warn si occupé : « loyer + charges — état civil, clauses ») ; DPE (todo) ; risques ERP (todo). Lot vacant → pas de ligne bail.

### 7.3 Handoffs vers l'existant (aucun écran réinventé)
| Action | Ouvre |
|---|---|
| Compléter le bailleur | `openEntFiche(entId)` (28146) |
| Compléter l'immeuble | `openImmFiche(entId, immId)` (34383) — note : signature à 2 args (entité + immeuble) |
| Compléter le logement | `openLogFiche(ref)` (29356) |
| 📋 Bail | `openBail(ref)` (14267) |
| 📊 DPE | `openLogModalOnTab(ref, 'diagnostics')` (36683) → dépôt PDF → n° → ADEME (`_logDiagFetchAdeme`) |
| ⚠️ Risques (ERP) | onglet diagnostics/risques du logement (`openLogModalOnTab(ref, 'diagnostics')`) |

Au retour d'une fiche, le fil rouge se recalcule (statuts + % global) et « ré-attend » l'utilisateur à l'endroit suivant.

### 7.4 UI (mockup `fil-rouge-completion.html`, variante B validée)
Hero « Configuration de ton patrimoine » + barre de % global + note « 💡 Rien d'obligatoire tout de suite ». Timeline `.fr-*` : ligne verticale remplie à `globalPct`, pastilles numérotées (done/part/here), tag « à compléter » sur le premier nœud incomplet, nœud final « 🎉 Configuration terminée ». Chaque nœud incomplet déplie la liste `.task` (icône statut + libellé + description + chips d'action). Responsive : sur téléphone les chips d'action sont compacts auto-largeur (corrigé), le bouton « Compléter … → » reste pleine largeur.

---

## 8. Ancres techniques (sandbox `index-test.html`, lecture seule à ce stade)

| Élément | Ligne | Usage dans l'extension |
|---|---|---|
| `_acteHandleFile` | 35627 | dépôt fichier (inchangé) |
| `rd.onload → _acteProcessPdf(rd.result,…)` | 35634-35635 | `rd.result` = dataURL base64 de l'acte |
| `_acteProcessPdf(dataUrl,name)` | 35639 | **retenir** `dataUrl` sur le brouillon |
| `_acteDraft = Object.assign({fileName,rawText,logements:[]}, ex)` | 35650 | ajouter `fileDataB64`, `fileSize` |
| `_acteApply` | 35973 | orchestration : renseigner champs immeuble (36009-36021), occupation des logements (36036-36053), joindre l'acte (~36084) |
| objet immeuble créé | 36009-36021 | `valeurEstimee/regimeJuridique/nbLots/annee/periodeConstr/typeHabitat/syndic` à remplir depuis l'extraction |
| `mkLog` (init occupation) | 36036-36040 | `locataire/hc/ch/debut/fin/dg` à remplir |
| `_acteRenderSucces` / step succès | 36090-36114 | point d'accroche du fil rouge |
| `_attachmentSaveForEntity(parent, fileData)` | 12376 | joindre l'acte à l'immeuble |
| section « 📁 Documents communs » immeuble | ~34445 | rendu (déjà en place) |
| `openBail(ref)` / `saveBail()` | 14267 / 15308 | finaliser le bail (sync occupation 15433-15446) |
| `openLogModalOnTab(ref,'diagnostics')` | 36683 | DPE / risques |
| `openEntFiche(entId)` | 28146 | handoff fiche bailleur (fil rouge) |
| `openImmFiche(entId, immId)` | 34383 | handoff fiche immeuble (fil rouge — 2 args) |
| `openLogFiche(ref)` | 29356 | handoff fiche logement (fil rouge) |
| `_renderOccupationDonut` | 34414 | (référence sémantique occupation) |

Module ES6 miroir : `__tests__/helpers/acte-extract.js` (+ `acte-extract.test.js`) — y ajouter la section « bien loué » et le prix.

---

## 9. Garde-fous & gestion d'erreurs

1. **Aucune écriture aveugle** : tout `✨ à vérifier` jusqu'à validation à l'étape 2.
2. **Pas de bail signé à l'import** (D7) : on ne pré-remplit que l'occupation ; le bail se crée/signe via `openBail`/`saveBail`. Respect de l'immutabilité du bail signé.
3. **DPE = ADEME autoritaire** : l'import ne touche jamais classe/date DPE (cf. `_logDiagApplySuggestions` qui exclut déjà `dpe`). Le fil rouge renvoie vers le flux ADEME existant.
4. **Extraction défensive** : ancre introuvable → champ vide, jamais d'exception. Occupation absente → logement vacant.
5. **Pièce jointe non bloquante** : échec `_attachmentSaveForEntity` → import quand même réussi (toast d'avertissement).
6. **Fil rouge non bloquant** : « plus tard » toujours possible ; reprise depuis chaque fiche.
7. **Sécurité** : assainir les valeurs extraites avant injection (réf logement déjà validée par regex existant) ; nom de fichier acte assaini.
8. **RGPD** : l'acte ne quitte pas le navigateur pour l'extraction ; le PDF stocké suit la sync Drive du bailleur (comme toute pièce jointe). Fixtures de test anonymisées.
9. **Audit `superpowers:code-reviewer` OBLIGATOIRE** avant tout test user (création multi-entités + occupation + pièce jointe + handoffs = sensible).

---

## 10. Tests

- **Vitest `acte-extract.js`** : extraction « bien loué » (loyer + charges + date + DG + locataire ; cas absent → vacant), prix de vente, régime copro + nb lots, syndic, type habitat, année opportuniste. Cas dégradés (ancre absente, texte vide). Fixtures **anonymisées** (SCI DEMO IMMO, 16 rue des Tilleuls 68100 Mulhouse, montants fictifs).
- **Intégration `_acteApply`** : champs immeuble renseignés depuis le brouillon ; occupation posée sur les bons logements ; acte joint (`DB.documents` contient l'entrée immeuble nommée correctement) ; non-régression annexes.
- **Fil rouge** : statuts calculés corrects (done/warn/todo) selon l'état des champs ; % global ; handoffs ouvrent le bon écran ; recalcul au retour.
- **Visuel (vrai navigateur)** : parcours complet sur les 4 actes réels (`actes/`, non commités), 3 formats, light/dark ; abandon (« plus tard ») à chaque étape ; vérifier que `openBail` pré-remplit bien depuis l'occupation importée.
- **Non-régression** : aucune entité/immeuble/logement existant altéré ; localStorage sandbox isolé.

---

## 11. Découpage en phases (à détailler dans le plan)

> Pré-requis : reprendre les infos de la session parallèle (état de `index-test.html`) avant tout code prod, puis sandbox-first → OK user → prod.

- **Phase F — extraction enrichie** : `acte-extract.js` (+ index-test) : prix, copro+nbLots, syndic, type habitat, année opportuniste, section « bien loué ». Tests Vitest. *Cœur de risque.*
- **Phase G — `_acteApply` enrichi** : renseigner les champs immeuble + occupation des logements depuis le brouillon ; joindre l'acte PDF (`_attachmentSaveForEntity`). Tests intégration.
- **Phase H — bloc Occupation (vérif)** : carte `.occ` par logement (Loué/Vacant + charges), `✨ à vérifier`, phrase source. (UI validée en mockup.)
- **Phase I — fil rouge de complétion** : modèle de tâches calculé + UI variante B + handoffs `openEntFiche/openImmFiche/openLogFiche/openBail/openLogModalOnTab`. (UI validée en mockup.)
- **Phase J — audit code-reviewer + tests visuels 4 actes + responsive**, puis déploiement prod après OK user + bump de version + MAJ BACKLOG.

---

## 12. Hors-scope (YAGNI)

- Création d'un objet bail complet à l'import (D7 : occupation seulement).
- Champs sans cible immeuble (date d'acquisition, vendeur, notaire, servitudes, hypothèques, quote-part charges).
- Modification du DPE par l'import (ADEME autoritaire).
- Refonte de la dette ARCHI-DB-DOUBLONS (liens par chaîne) — on suit le modèle existant.
- Import multi-actes en lot.
- **OCR local (Tesseract.js)** : différé. Les actes notariaux récents ont une couche texte (`pdf.js` les lit ; Phase A validée 4/4). L'OCR ne servirait qu'en **repli** pour actes scannés, avec risque d'erreurs sur les chiffres critiques (SIREN, surfaces, prix, tantièmes) et lenteur (minutes sur 30-60 pages). À ajouter plus tard *uniquement si* des actes sans texte se présentent, avec bandeau « lecture incertaine, tout vérifier ».
- **LLM navigateur (Voie B)** : différé/parqué. Bloqueurs actuels — taille du modèle (Go), `window.ai`/Gemini Nano Chrome-only expérimental (casse responsive/mobile/multi-navigateurs), hallucination sur les nombres juridiques (dangereux même en « ✨ à vérifier »), fenêtre de contexte < acte 40 pages. Un LLM serveur lèverait taille/mobile mais casserait le différenciant RGPD (« l'acte ne quitte jamais le navigateur »). À ré-ouvrir seulement si le brouillon regex s'avère trop grossier au retour terrain.
