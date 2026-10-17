# CDC — Vérification des documents des candidats (2D-Doc + lecture IA)

> **Statut : VALIDÉ — GO de Didier le 14/10/2026 (relayé par le Pilotage) sur toutes les recommandations D1 à D17 ; codé (phase 2), vérifié (phase 3), livré en branche (phase 4).**
> Branche `feat/verif-documents` (worktree `Immo-wt-verif-documents`, base `origin/main` v15.736). Version provisoire **v15.741**. Migration : **aucune** (les résultats sont posés sur l'entrée `DB.documents` de la pièce ; 0062 non utilisée).
> Maquette : `mockups/VERIF-DOCUMENTS/maquette.html` (+ `captures/`, 54 captures : 9 écrans × 3 formats × 2 thèmes, `captures/mesures.json`).
> Prototype : `mockups/VERIF-DOCUMENTS/prototype/` (navigateur : `index.html` ; Node : `node/demo.mjs`, `node/official.mjs` ; matériel officiel : `officiel/`).
> Lit d'abord : `docs/CDC-PROPRYO.md` §1 (« l'IA lit, la loi décide », jamais de score), §7 (IA).

---

## 1. Objet et cadre (non négociable)

Donner au bailleur des **constats factuels vérifiables** sur les pièces d'un dossier de candidature :
1. **2D-Doc** : signature cryptographique du code (DGFiP pour les avis d'imposition ; émetteur privé certifié pour une facture), contrôlée sur l'appareil contre la liste de confiance de France Titres.
2. **Lecture IA des bulletins de salaire** (Mistral, UE) : l'IA **extrait** des champs ; des **règles écrites et testées** vérifient calculs et cohérences.
3. **Indices techniques des fichiers PDF** (sans IA) : logiciel, dates, texte superposé — présentés comme indices qui ne permettent pas de conclure.

Interdits : score, total d'alertes, classement, tri par alertes, refus automatique, mots « faux », « fraude », « suspect », couleur rouge/corail de verdict ; toute pièce supplémentaire demandée « pour vérifier » (liste fermée, décret 2015-1437) ; toute automatisation du service de vérification d'impots.gouv.

---

## 2. Faits établis

### 2.1 Code (worktree, HEAD 62721002 = v15.736)
| Fait | Où |
|---|---|
| Carte « **Points à vérifier** » (pas « Vérifications ») : données `_candPointsAVerifier`, rendu `_candPointsAVerifierHtml`, phrase-règle « Ces points sont des constats… » | `js/app/app-part1.js:13115`, `:13192-13202` ; appel dans `openFicheCandidat` `:13582` |
| Objet constat : `{code, icone, titre, detail, source, url, date, actionsHtml}` (C7 employeur, C1 hors liste) | `js/core/employeur.js:76-95`, `app-part1.js:13131-13135` |
| Pièces = entrées `DB.documents` (`parentType:'candidat'`, `pieceType`, `cloudKey`, `idbKey`, `mime`…) ; types fermés du décret (`I.D.1` avis, `I.D.2` bulletins, `I.C.1` contrat, `II.E.1`/`II.E.3` garant) | `app-part1.js:9914-9944`, `js/core/pieces-candidature.js:37-90` |
| Rendu des pièces par catégorie + sélecteur de type | `app-part2.js:17408-17450`, `_candSetPieceType` `:17476` |
| Rapatriement des pièces du relais (octets en mémoire) → `_attachmentSaveForEntity` | `app-part1.js:12948` |
| Purge J+30 des refusés : `DB.documents` (tombstones), IndexedDB, bucket `espace-files`, copie relais — **toute donnée posée sur l'entrée document est purgée avec elle** | `app-part1.js:12415-12474`, `js/core/candidature-purge.js` |
| Employeur : `fetch` direct de `recherche-entreprises.api.gouv.fr` (CSP `connect-src` l'autorise) | `app-part1.js:13143-13164`, `index.html:11` |
| pdf.js **3.11.174** vendorisé (base64, `ensurePdfLibs` → `_ensurePdfjsLoaded`), `getMetadata`, rendu canvas et texte déjà utilisés | `js/vendor/pdf-libs.b64.js`, `app-part2.js:20738-20792` |
| **Aucun** lecteur DataMatrix vendorisé ; **aucun** code ECDSA / X.509 / ASN.1 (WebCrypto : SHA-256 et HMAC seulement) | recherche exhaustive |
| CSP : `script-src 'self' 'unsafe-inline' blob:` — **pas de `'wasm-unsafe-eval'`** (un lecteur WebAssembly exigerait de l'ajouter) | `index.html:11` |
| Socle IA : `makeAiProvider(env)` → `transcrire`, `structurer` (chat, `json_schema` strict, température 0) ; registre `TACHES` (`nom, validerEntree, messages, jsonSchema, validerSortie`) ; images en data URL ; **pas d'entrée PDF, pas de `/v1/ocr`** ; modèle global `AI_MODEL_STRUCTURE` | `relay/src/ai/provider.js:122`, `tasks/index.js:8`, `tasks/edl-photos.js:30,100` |
| **Plafond du corps `/ai/structure` = 256 Kio** sauf si la vidéo est ouverte (choisi avant de connaître la tâche) → une tâche image serait refusée en 413 | `relay/src/ai/routes.js:20`, `:114-131` |
| Quota images compté seulement pour les tâches `video` ; journaux sans contenu (testé) | `routes.js:137`, `relay/test/ai-routes.test.js:144` |
| `RETENTION_ZERO = false` (constante app, pas une variable du relais) ; mention `MENTION_PROPOSITION = 'Proposé par l’IA, à vérifier'` | `js/core/ia-transparence.js:21`, `:26` |
| Texte RGPD du formulaire public : contrôle employeur seulement, rien sur l'IA ni le 2D-Doc ; `ASSET_VERSION` à monter si `dossier.js` change | `relay/public/dossier.js:182`, `relay/src/dossier-page.js:5` |
| **Registre RGPD §6 périmé** : décrit encore un « score de confiance » (`:109`, `:113`), la sync Drive (`:110`) ; Cloudflare « Worker + R2 + KV » alors que le relais n'utilise que KV (`:27`) | `docs/legal/RGPD-REGISTRE.md` |
| Relais : pièces candidat en KV (`cand-piece/{linkId}/{pieceId}`), 20 Mo max, JPEG/PNG/PDF avec contrôle des octets magiques | `relay/src/storage.js:102-132`, `relay/src/validate.js:43-67` |
| CORS relais : `PATCH` et `X-Cand-Token` absents d'`allowMethods`/`allowHeaders` (sans effet aujourd'hui, appels même origine) | `relay/src/index.js:34-35` |

### 2.2 2D-Doc (sources consultées le 14/10/2026)
- **Spécification officielle** : France Titres (ex-ANTS), « Spécifications Techniques des Codes à Barres 2D-DOC », **v3.3.9 du 22/07/2026**, 247 p. — page https://ants.gouv.fr/nos-missions/les-solutions-numeriques/2d-doc ; PDF https://pub.ants.gouv.fr/2D-DOC/DOCUMENTATION/04_Specifications_Techniques/FranceTitres_DCAT_2D-DOC_V1_04_Specifications_Techniques.pdf (copie : `prototype/officiel/`). Norme AFNOR XP Z42-101 à 104.
- **Format** (§3) : en-tête C40 `DC` + version + AC (4) + certificat (4) + date d'émission + date de signature (jours depuis 01/01/2000 en hexadécimal, `FFFF` = sans date) + type (2) [+ périmètre (2) en v03, + pays (2) en v04 : 26 caractères] ; champs `id(2)+valeur`, longueur variable terminée par GS (0x1D), tronquée par RS (0x1E) ; **US (0x1F) puis signature en Base32** ; annexe éventuelle après la signature, **non signée**. Ce qui est signé : tout depuis `DC` jusqu'au US exclu.
- **Signature** : ECDSA, P-256 / P-384 / P-521 (r‖s brut, 64/96/132 octets) ; exemple de la spec en SHA-256/P-256. Vérification (§5.1) : AC dans la liste de confiance → certificat par son identifiant → **révocation** → date de signature dans la validité du certificat → signature.
- **Liste de confiance (TSL)** : https://pub.ants.gouv.fr/2D-DOC/V1/PRD/01_TSL/tsl_signed.xml — ETSI TS 102 231, signée XAdES (« ANTS CACHET 2DDOC »), n° 23 du 11/05/2026, prochaine mise à jour 11/05/2027. **7 AC** (toutes RSA-4096) : FR01, FR03, FR04, FR05, FR06, FR07, FR09 (FR01 et FR04 expirées mais toujours listées → juger à la date de signature). Chaque AC publie un annuaire de certificats (multipart DER). **Aucun en-tête CORS** sur la TSL ni les annuaires, plusieurs en `http` → inaccessibles directement depuis le navigateur.
- **Certificats DGFiP** (avis d'impôt) : `FPE0`-`FPE9` sous FR04 (2019-2025, expirés) et `FPE0`-`FPE6` sous **FR06** (valides jusqu'en 2027-2028), P-256 — chaîne vérifiée par le prototype.
- **Types** (§6.1) : 00/01/02 justificatifs de domicile (dont factures énergie, téléphonie, internet, eau ; avis de taxe d'habitation), **04 et 28 avis d'impôt** (V1/V2), 18/24/27 avis de situation déclarative, **06 bulletin de salaire**, 10 contrat de travail, 03/05/11 bancaires, 07 identité… Pas de type pour attestation employeur, attestation CAF, quittance.
- **Champs de l'avis (type 28)** : 43 parts, 44 référence d'avis, 45 année des revenus, 46 déclarant 1, 4A date de mise en recouvrement (obligatoires), 41 RFR (facultatif), 47/49 numéros fiscaux, 48 déclarant 2, 4V/4W/4X/4Z montants, 4Y adresse.
- **Couverture** : avis d'impôt et ASDIR depuis avril 2022 (economie.gouv.fr, page du 13/05/2026 : https://www.economie.gouv.fr/particuliers/gerer-mon-argent/investir-dans-limmobilier/proprietaires-comment-vous-assurer-de-lauthenticite-des-justificatifs-de-revenus) ; factures EDF, Engie, Suez Eau, Free, Bouygues Telecom (certificats valides vus dans les annuaires) ; **bulletins de paie : type prévu, aucun émetteur de logiciel de paie identifié** → considérer qu'ils n'en portent presque jamais ; CAF : aucun certificat.
- **Spécimens officiels** : la spec (§16) publie un certificat de test (FR00/0001, P-256, 2012-2015) **et sa clé privée**, plus des codes valides pour chaque type → base de tests sans aucun document réel.

### 2.3 Services publics de vérification
- **Service de vérification des avis d'impôt (SVAIR)** : gratuit, ouvert à tous, saisie manuelle du numéro fiscal et de la référence d'avis (13 chiffres chacun), réponse « conforme / non conforme / situation partielle » (economie.gouv.fr, 13/05/2026) ; outil https://www.impots.gouv.fr/verifavis2-api/front ; **aucune API publique**, CGU non lisibles (site en maintenance jusqu'au 15/10/2026) → **lien + références à copier seulement**, jamais d'automatisation.
- **API Impôt particulier / API SFiP (DGFiP)** : réservées aux administrations et aux entreprises « dans le cadre de leurs obligations légales et réglementaires pour des missions d'intérêt général », habilitation DataPass (https://www.data.gouv.fr/dataservices/api-impot-particulier). **Pas ouvertes à un bailleur privé ni à un logiciel de gestion locative.** API Particulier : agents publics seulement (https://particulier.api.gouv.fr/).
- **DossierFacile** : décode le 2D-Doc des avis et contrôle la cohérence des bulletins (standards de validation) ; l'API partenaire historique est fermée depuis le 31/03/2025, seul **DossierFacile Connect** (OAuth, consentement, charte, gratuit) subsiste — chantier distinct (C14).

### 2.4 Mistral (consulté le 14/10/2026)
- **OCR 4.1** (16/07/2026) sur `POST /v1/ocr` : PDF ou image (URL ou base64), sélection de `pages`, **annotations structurées** (`document_annotation_format` en `json_schema`), scores de confiance par mot/bloc/page. **4 $ / 1 000 pages, 5 $ / 1 000 pages annotées** (https://docs.mistral.ai/models/ocr-4-1 ; hausse du 06/07/2026). Lot (batch) −50 % mais sans rétention zéro.
- Modèles de chat : Mistral Small 4 (`mistral-small-2603`) 0,15 $ / 0,60 $ par million de jetons (entrée image **non confirmée** sur la page du modèle) ; Mistral Medium 3.5 multimodal 1,5 $ / 7,5 $. Pixtral retiré.
- **Point d'accès UE** `api.eu.mistral.ai` : traitement dans l'UE garanti, prix × 1,1, plan de contrôle possiblement hors UE ; présence de `/v1/ocr` sur ce point d'accès **à vérifier avec la clé**.
- **Rétention zéro** : sur demande motivée, endpoints sans état, **`/v1/ocr` inclus** (https://docs.mistral.ai/admin/monitor-comply/zero-data-retention ; aide du 12/08/2026). Rétention par défaut 30 jours (source secondaire). Entraînement : CGV du 25/09/2026 §4.2 + interrupteur « Anonymous improvement data » à couper. DPA du 27/07/2026 (Mistral sous-traitant).

### 2.5 Droit (textes et sources)
- Décret n° 2015-1437, art. 1 I : la liste des pièces « pouvant être exigées par le bailleur » figure en annexe I (https://www.legifrance.gouv.fr/loda/id/JORFTEXT000031444493) ; annexe I, D : « 1. Le dernier ou avant-dernier avis d'imposition ou de non-imposition… » ; « 2. Trois derniers bulletins de salaires. »
- Loi 89-462, art. 22-2 : amende administrative « dont le montant ne peut être supérieur à 3 000 € pour une personne physique et à 15 000 € pour une personne morale » (https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000028806691).
- RGPD art. 22(1) : droit de ne pas faire l'objet d'une décision « fondée exclusivement sur un traitement automatisé ». CJUE C-634/21 (SCHUFA), 7/12/2023 : le calcul automatisé d'une valeur de probabilité est une décision automatisée lorsque le tiers « draws strongly » sur elle (https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62021CJ0634).
- AI Act (règl. 2024/1689) : **annexe III 5(b)** vise l'évaluation de la solvabilité / le score de crédit, « à l'exception des systèmes d'IA utilisés pour détecter la fraude financière » ; **art. 6(3)** : un système de l'annexe III n'est pas à haut risque s'il exécute une « tâche procédurale étroite » (a) ou « préparatoire » (d), **sauf profilage** ; art. 6(4) : analyse documentée par le fournisseur (+ enregistrement art. 49(2)). Projet de lignes directrices de la Commission (19/05/2026) : l'extraction d'informations de documents non structurés vers un format structuré, sans décision, relève de la tâche procédurale étroite. **Omnibus IA (règl. 2026/1744)** : obligations « haut risque » de l'annexe III au **2/12/2027** (confirmé). Art. 50 en vigueur depuis le 2/08/2026 : 50(2) (marquage du contenu synthétique) ne s'applique pas aux fonctions d'assistance qui n'altèrent pas substantiellement les données d'entrée ; la mention « Proposé par l'IA, à vérifier » est conservée par prudence et cohérence.
- CNIL : page « Location d'un bien immobilier : quels justificatifs ? » (10/10/2025) ; liste des traitements soumis à AIPD (délib. 2018-327) : profilage pouvant exclure du bénéfice d'un contrat, croisement de données ; AIPD conseillée « en cas de doute ». Recommandation crédit (mai 2026) : documenter l'intervention humaine significative dans l'AIPD.
- Code du travail **R3243-1** (mentions du bulletin, dont 9° impôt prélevé à la source : base, taux, montant ; 10° net versé) et **arrêté du 25/02/2016** (ordre des lignes : brut → cotisations → net social → net à payer avant impôt → net imposable → impôt prélevé → net à payer ; cumul annuel du net imposable du 1er janvier au 31 décembre).

---

## 3. Faisable / pas faisable

| Faisable | Pas faisable (ou interdit) |
|---|---|
| Lire un 2D-Doc depuis un PDF (image intégrée) ou une photo correcte, **dans le navigateur**, sans CDN | Interroger automatiquement le service de vérification d'impots.gouv (pas d'API, CGU non lues, CAPTCHA probable) |
| Vérifier chaîne de certificats (RSA) et signature (ECDSA) **avec WebCrypto** | Accéder aux API DGFiP / API Particulier (réservées aux acteurs publics ou obligations légales) |
| Comparer données signées / texte imprimé du PDF / identité déclarée | Prouver qu'un avis signé est **le dernier** émis (seul SVAIR le dit) ou qu'il appartient au déposant (seule la comparaison d'identité aide) |
| Lire les montants d'un bulletin (Mistral OCR) et appliquer des règles R3243-1 / arrêté 2016 | Vérifier un bulletin sans 2D-Doc **avec certitude** : seuls des écarts de cohérence sont détectables |
| Relever les métadonnées PDF (producteur, dates, révisions, texte superposé) | Conclure à une falsification à partir des métadonnées (un ré-enregistrement légitime produit les mêmes traces) |
| Vérifier l'employeur (déjà fait, C7) | Demander une pièce de plus au candidat « pour vérifier » (art. 22-2) |
| Récupérer la TSL et les certificats **via le relais** (pas de CORS) | Les récupérer directement depuis le navigateur |

---

## 4. Prototype (phase 1) — résultats

Tout est reproductible (`mockups/VERIF-DOCUMENTS/prototype/`), sans aucun document réel d'un tiers.

1. **Spécimens officiels** (spec v3.3.9 §16) : **39/39 signatures vérifiées** par WebCrypto ECDSA P-256 (31 types dont 04 et 28) ; spécimen d'avis type 28 : RFR 63 198 → 73 198 ⇒ **invalide**. Face à la liste de confiance de production, ce spécimen (AC FR00) ressort **« non vérifiable »** (AC absente) : un code de test ne peut jamais passer pour un vrai.
2. **Chaîne de production réelle** : TSL France Titres (7 AC) → annuaires → **230 certificats feuilles, 230 chaînes vérifiées** par WebCrypto (RSASSA-PKCS1-v1_5) ; 58 en cours de validité au 14/10/2026 ; certificats DGFiP FR06/FPE0-6 identifiés.
3. **Bout en bout dans le navigateur** (`prototype/index.html`, pdf.js 3.11.174 déjà vendorisé + @zxing/library 0.21.3, Apache-2.0, 336 Ko min / 100 Ko gzip, sans WebAssembly) : PDF fictif → image intégrée extraite → DataMatrix lu → **valide** en ~0,4 s ; PDF fictif **retouché** : signature toujours valide (le code n'a pas changé) mais **comparaison imprimé/signé : écart** (« 31540 » et « 41540 » superposés sur la ligne du RFR, RFR signé 31540) + métadonnées : producteur changé, modifié 77 jours après sa création ; PDF sans code → « absent ». Relecture d'une version « photo » (rotation 6°, réduction, flou) : réussie.
4. **Falsifications sur un 2D-Doc signé par une AC de test locale** (`node/demo.mjs`) : 12 cas (RFR, nom, type modifiés ; signature altérée, tronquée, absente ; clé non reconnue ; AC ou certificat inconnus ; faux certificat substitué ; date hors validité ; chaîne non 2D-Doc) → **0 « valide »**.
5. **Robustesse de lecture** (images dégradées synthétiques) : @zxing/library lit jusqu'à réduction ×0,45, rotation 12° et 90°, flou + bruit ; échoue à contraste faible + bruit et sur la « photo médiocre » combinée ; zxing-wasm (zxing-cpp, MIT/Apache) lit en plus le cas contraste faible, échoue aussi sur la photo médiocre — **c'est le premier verrou R&D** (§8).
6. **Piège relevé** : le rendu pdf.js en arrière-plan reste bloqué (requestAnimationFrame suspendu) → rendre avec `intent: 'print'`. Le détecteur DataMatrix échoue sur une page entière : passer d'abord par les **images intégrées** du PDF, puis par fenêtres.

---

## 5. Conception proposée (phase 2)

### 5.1 Où tourne chaque contrôle
| Contrôle | Lieu | Données envoyées |
|---|---|---|
| 2D-Doc (lecture + chaîne + signature + comparaison imprimé/déclaré) | **Navigateur** (module pur `js/core/deux-d-doc.js`, WebCrypto) | Aucune |
| Liste de confiance | **Relais** : route publique `GET /api/2ddoc/confiance` (TSL + annuaires + CRL, mise en cache KV 24 h, CORS ouvert) ; **ancrage** des 7 certificats d'AC revus à la main dans le code (pas de validation XAdES dans le Worker) ; repli : instantané embarqué | Aucune donnée personnelle |
| Indices techniques PDF | **Navigateur** (`js/core/indices-pdf.js` : `getMetadata`, nombre de révisions `startxref`/`%%EOF`, texte superposé) | Aucune |
| Lecture IA des bulletins (+ page 1 du contrat de travail) | **Relais** → Mistral OCR 4.1 annotations (point d'accès UE si disponible), nouvelle tâche `bulletin-paie` dans le registre, nouvelle méthode `lireDocument()` du **même** fournisseur `makeAiProvider` | Pages typées `I.D.2`/`II.E.3` (+ page 1 de `I.C.1`), rien d'autre |
| Règles de cohérence | **Navigateur** (`js/core/regles-bulletin.js`, pur, TDD) | Aucune |
| Employeur | Existant (C7) | Inchangé |

### 5.2 Constats (catalogue fermé, chacun = règle + source + date)
| Code | Constat (formulation) | Règle / source |
|---|---|---|
| V1 | Signature 2D-Doc vérifiée (« de la DGFiP » pour un avis signé FPE* sous FR04/FR06) — émetteur, certificat, AC, version de la TSL | Spec 2D-Doc §5.1 |
| V2 | Code 2D-Doc non conforme : la signature ne correspond pas aux données du code | idem |
| V3 | Code 2D-Doc présent mais certificat introuvable, révoqué ou hors validité : non vérifiable | idem |
| V4 | Aucun code 2D-Doc lisible (avis émis depuis avril 2022 : en portent un) + lien SVAIR et références | economie.gouv.fr 13/05/2026 |
| V5 | Donnée signée ≠ texte imprimé (champ, deux valeurs) — PDF texte : local ; photo : valeurs signées affichées pour comparaison visuelle | C4 |
| V6 | Nom signé / lu ≠ identité déclarée (comparaison sans accents ni tirets) | C11 |
| B1 | Net à payer ≠ net avant impôt − impôt prélevé (tolérance 0,02 €) | R3243-1 9°-10°, arrêté 2016 |
| B2 | Impôt prélevé ≠ base × taux (tolérance d'arrondi 0,10 €) | R3243-1 9° |
| B3 | ~~Net social > brut~~ **retirée le 16/10/2026** (§9) | BOSS, montant net social |
| B4 | Cumul net imposable(m) ≠ cumul(m−1) + net imposable(m) (même employeur, même année) | arrêté 2016, cumul annuel |
| B5 | Périodes non consécutives / bulletin le plus récent antérieur de plus de 3 mois à la réception | décret 2015-1437 annexe I D 2° |
| B6 | SIRET du bulletin ≠ SIRET déclaré, ou entreprise fermée / créée après la date d'entrée | C7, C8 (Annuaire) |
| B7 | Employeur ou date d'entrée du contrat ≠ bulletins | C10 |
| T1 | Fichier modifié après sa création (logiciels et dates) — « ne permet pas de conclure » | métadonnées PDF |
| T2 | Fichier ré-enregistré N fois (révisions) — idem | structure PDF |
| T3 | Deux textes superposés au même endroit | positions du texte |
| L1 | Lecture impossible (confiance OCR sous le seuil) — aucun constat | — |

Chaque valeur lue par l'IA porte « Proposé par l'IA, à vérifier » et est **corrigeable** (la correction relance les règles et est journalisée). Aucun compteur par dossier dans la liste des candidats ; pas de tri ; dans la fiche, les constats sont rangés par pièce.

### 5.3 Données
Résultats posés sur l'entrée `DB.documents` de la pièce (`verif: {etat, constats[], champsLus, verifieLe, versionRegles}`) → **purgés avec la pièce** par la purge v15.731 (aucune nouvelle table, **pas de migration**). Les valeurs lues se limitent aux champs utiles aux règles (pas de texte intégral, pas d'adresse, pas de numéro de sécurité sociale).

### 5.4 Écrans (maquette)
Fiche candidat : ligne « Vérification » sous chaque pièce (état + phrase + « Détail ») ; « Points à vérifier » enrichi ; détail 2D-Doc ; détail bulletin (valeurs corrigeables, règles, indices) ; écran « Lire avec l'IA » (liste exacte des envois) ; Paramètres › Candidatures ; information du candidat sur la page publique. 3 formats, sobre et dark, M-16 sur téléphone. Mesures : aucun débordement ; contrastes conformes sauf le **bouton corail existant** de l'app (blanc sur `#ff5a3c` = 3,10:1, hérité des tokens actuels, non introduit ici).

### 5.5 RGPD / AI Act (à valider par l'avocat)
- Finalité ajoutée au traitement n° 6 : « vérifier l'authenticité des pièces » ; base légale proposée : intérêt légitime du bailleur (prévention de la fraude documentaire) — **à confirmer (D3 de l'étude)**.
- Mise à jour du registre §6 (retirer le score, la sync Drive ; ajouter 2D-Doc, IA, Annuaire) et de la ligne Mistral (OCR).
- **AIPD à signaler pour l'avocat** : données financières de candidats + usage innovant (IA) + croisement de sources → probablement requise.
- AI Act : analyse documentée « pas à haut risque » (art. 6(3)(a)/(d) : extraction préparatoire, aucune évaluation de solvabilité, aucun profilage ; et exception « détection de la fraude financière » de l'annexe III 5(b)) — **à faire valider**.

### 5.6 Lots (phase 2, TDD)
1. `deux-d-doc.js` (en-tête, champs par type 04/28/06/00-02, Base32, DER/X.509, chaîne RSA/ECDSA, révocation, validité) + tests sur les **39 spécimens officiels** et les falsifications ; route relais `GET /api/2ddoc/confiance` ; vendorisation `@zxing/library` ; intégration à l'import des pièces ; ligne « Vérification » + détail.
2. `indices-pdf.js` + constats T1-T3.
3. Tâche IA `bulletin-paie` (OCR annotations, plafond de corps par tâche, quota en pages) + `regles-bulletin.js` (B1-B7) + écran « Lire avec l'IA » + corrections.
4. Réglages, texte du formulaire public (`ASSET_VERSION`), registre RGPD, notice IA.

---

## 6. Coût par dossier

| Poste | Coût |
|---|---|
| 2D-Doc, indices techniques, règles, Annuaire | **0 €** (sur l'appareil / API publique gratuite) |
| Relais (TSL mise en cache, route IA) | négligeable |
| Lecture IA : 3 bulletins + page 1 du contrat = **4 à 7 pages** (bulletins de 1-2 pages) × 5 $/1 000 × 1,1 (UE) | **0,02 à 0,04 $** |
| Avec un garant salarié (3 bulletins de plus) | **0,04 à 0,08 $** |

Soit **moins de 0,10 € par dossier** dans le pire cas. Quota proposé : 300 pages/compte/mois (≈ 40 dossiers).

---

## 7. Section R&D (base d'un dossier d'aide / incubateur)

**Ce qui est de l'intégration (pas de la R&D)** : vérification 2D-Doc selon la spécification publique ; appel de l'Annuaire des entreprises ; appel de l'OCR Mistral ; règles arithmétiques tirées de R3243-1 et de l'arrêté de 2016.

**Ce qui relève de la recherche (verrous scientifiques et techniques, résultat incertain)** :
1. **Lecture robuste du DataMatrix sur photo de téléphone** (flou, perspective, faible contraste, moirage d'écran) : le prototype montre l'échec des lecteurs libres au-delà d'une certaine dégradation. Piste : localisation du code (détection du motif en L), redressement de perspective, binarisation adaptative, super-résolution, avant décodage — en local, sans envoi.
2. **Extraction fiable de champs sur des bulletins hétérogènes** (centaines de logiciels de paie, mises en page libres) avec **mesure d'incertitude** : propagation de la confiance OCR jusqu'aux règles pour ne jamais produire un « écart » dû à une erreur de lecture (abstention calibrée).
2 bis. **Banc de mesure des bulletins** (REGLES-PAIE, §9) : générateur de bulletins synthétiques 2026 (11 profils), lecteur local pdf.js, simulation d'erreurs de lecture et de retouches — `mockups/REGLES-PAIE/` (hors git).
3. **Détection d'altérations sans code officiel** : indices structurels PDF (révisions, objets orphelins, texte recouvert, polices incohérentes, glyphes isolés), et sur images (incohérences locales de compression) — avec un taux de faux positifs maîtrisé sur des fichiers légitimement ré-enregistrés.
4. **Présentation non scorante** : démontrer qu'un ensemble de constats n'agit pas comme un score de fait (protocole utilisateur, cf. SCHUFA).

**Protocole d'évaluation** (pré-enregistré, jeu figé avant tout réglage) :
- **Corpus 100 % synthétique** : générateur de bulletins conformes à l'arrêté de 2016 (≥ 10 mises en page, polices et logiciels « producteurs » variés, identités et entreprises fictives, SIRET fictifs), d'avis fictifs signés par une AC de test, et les **spécimens officiels** de la spec. Jamais de document réel d'un tiers ; documents personnels de Didier seulement avec son accord écrit, hors jeu publié.
- **Variantes** : (a) authentiques ; (b) authentiques dégradés légitimement (impression PDF, compression, scan 150/300 dpi, photo à angles et éclairages contrôlés) ; (c) altérés — 8 familles (montant retapé, cumul incohérent, nom, SIRET, période, texte superposé, page recomposée, code 2D-Doc d'un autre avis).
- **Mesures** : taux de lecture 2D-Doc par niveau de dégradation ; exactitude par champ extrait (exact / à 0,01 €) ; par contrôle : **taux de détection** sur (c), **taux de faux positifs** sur (a)+(b), taux d'abstention ; intervalles de confiance à 95 %.
- **Seuils de décision fixés à l'avance** : un contrôle n'est affiché comme constat que si faux positifs ≤ 2 % par pièce ; sinon il reste « indice technique » replié ; 2D-Doc : **0 faux « valide »** exigé (bloquant).
- **Séparation** : jeu de réglage / jeu d'évaluation figé (empreinte SHA-256 publiée), script reproductible (`relay/src/ai/eval-*` existe déjà pour l'EDL : même patron).
- **Terrain** (bêta de décembre, avec accord des candidats) : part des constats jugés utiles par les bailleurs ; si > 50 % des constats B/T sont jugés inutiles, ils passent repliés par défaut (seuil repris de l'étude du dossier BP).

### 7.1 Verrou n° 1 — lecture du code sur photo : résultats (LECTURE-PHOTOS, 15-16/10/2026, v15.751)
- **Protocole appliqué** : 884 photos 100 % synthétiques (les 39 spécimens officiels « imprimés » sur une page fictive puis « photographiés » : 11 familles de dégradation × 5 niveaux + 195 photos à défauts combinés), jeu de réglage séparé, jeu d'évaluation figé (SHA-256 `05f99544…`) ; prototype et résultats : `mockups/LECTURE-PHOTOS/prototype/` (`node eval/banc.mjs`).
- **Méthode** (`js/core/lecture-photo.js`, sur l'appareil) : localisation des zones (texture dense, ~50 % d'encre), quadrilatère du code (deux segmentations), redressement de la perspective, **relecture de la grille module par module** ajustée sur le motif connu du DataMatrix, **égalisation** contre le flou, code redessiné net pour le décodeur.
- **Mesures** (codes lus) : lecteur de l'app v15.744 **5 %** → prétraitement **71 %** (photo correcte 33 → 100 % ; dégradations 5 → 81 % ; photos combinées sévères 1 → 32 %). zxing-wasm seul 58 % ; prétraitement + zxing-wasm 71 % : **aucun gain du WebAssembly** (CSP inchangée). **0 faux « valide »** ; un bogue du lecteur de l'app (lecture de codes-barres 1D dans du texte) corrigé.
- **Limites mesurées** (illisible par tous les lecteurs testés) : flou σ ≥ 2,2 px (≈ 0,6 module), bougé ≥ 7 px, page sur moins de la moitié de la hauteur de la photo, écart encre/papier < 30 niveaux. Elles sont couvertes côté usage par le viseur (code repéré en direct) et le contrôle immédiat de la page de dépôt.
- **Pistes restantes (R&D)** : déconvolution aveugle (estimation du flou sur le motif en L), fusion de plusieurs images du viseur (rafale, super-résolution), mesure sur photos réelles consenties (taille réelle d'un module d'avis, téléphones variés).

---

## 8. Décisions (arrêtées le 14/10/2026 : recommandations retenues)

Toutes les recommandations ci-dessous ont été retenues (GO du 14/10/2026). Écarts et précisions de mise en œuvre :
- **D5 (point d'accès UE)** : la disponibilité de `/v1/ocr` sur `api.eu.mistral.ai` n'a pas pu être vérifiée dans le chantier (clé Mistral détenue comme secret du relais seulement). La brique IA est donc **livrée éteinte** (`AI_OCR` absente) avec un script d'activation : `node relay/scripts/verif-ocr-ue.mjs` (liste les modèles d'OCR du point d'accès UE et fait une lecture d'essai sur une image blanche) ; si le point d'accès ne sert pas l'OCR, la brique reste éteinte (lots 1, 2 et 4 inchangés).
- **D8 (liste de confiance)** : 7 autorités ancrées (TSL n° 23 du 11/05/2026, empreintes SHA-256 testées) ; route `GET /api/2ddoc/confiance` (annuaires + listes de révocation, cache KV 24 h, copie de secours 8 jours) ; instantané `js/vendor/2ddoc-instantane.json` régénéré par `node tools/2ddoc-instantane.mjs`. Une liste de révocation périmée rend le contrôle « reporté », jamais « valide ».
- **D9 (contrat)** : la page 1 du contrat de travail (types I.C.1 / II.D.1) part avec les bulletins (I.D.2 / II.E.3).
- **D11 (corrections)** : valeurs corrigeables dans la couche Détail ; journal d'audit avec les seuls noms de champs (aucune valeur).
- **D15 (registre)** : `docs/legal/RGPD-REGISTRE.md` traitement n°6 corrigé (score, Drive, R2) et complété ; AIPD et analyse AI Act à mener avec l'avocat.
- **Sécurité (ajout du Pilotage)** : gestionnaires `on…=` des pièces de candidature passés en `'${_lyQ(id)}'` (garde-fou XSS de v15.740), identifiants comparés en chaîne.

Rappel des décisions :


Recommandations (toutes retenues) en **gras**.

1. **Maquette** (états, formulations, emplacement de la ligne « Vérification » et des constats) : **valider telle quelle.**
2. **Couleur** : vert seulement pour « Signature 2D-Doc vérifiée » (libellé corrigé après la relecture du 14/10 : l'État publie la liste de confiance, l'émetteur signe) (fait cryptographique) ; tout le reste neutre, y compris « Code 2D-Doc non conforme » et « Écart relevé » ; jamais de corail. **Oui.**
3. **Lancement de la lecture IA** : à la demande, dossier par dossier, ou automatiquement à la réception. **À la demande** (minimisation : seuls les dossiers étudiés partent ; coût maîtrisé). 2D-Doc et indices : automatiques à l'import (locaux, gratuits).
4. **Moteur de lecture** : Mistral OCR 4.1 avec annotations (`/v1/ocr`, 5 $/1 000 pages, rétention zéro possible) ou modèle de chat avec image. **OCR 4.1**, ajouté comme méthode du fournisseur existant (pas de second adaptateur).
5. **Point d'accès UE** : si `/v1/ocr` n'est pas servi sur `api.eu.mistral.ai`, **reporter la brique IA** plutôt que d'envoyer des bulletins sans garantie de traitement dans l'UE (à vérifier avec la clé au début du lot 3).
6. **Rétention zéro** : demander l'activation à Mistral maintenant (motif : pièces de candidats) ; en attendant, notice « 30 jours au plus » (`RETENTION_ZERO = false`). **Oui, et couper l'interrupteur d'entraînement.** → **Fait le 16/10/2026** (cf. §10).
7. **Lecteur DataMatrix** : @zxing/library (JS pur, Apache-2.0, aucun changement de CSP) ou zxing-wasm (plus robuste, impose `'wasm-unsafe-eval'` dans la CSP). **@zxing/library en V1**, zxing-wasm évalué dans le volet R&D.
8. **Liste de confiance** : route relais (TSL + annuaires + révocations, cache 24 h) avec les 7 AC ancrées dans le code, ou instantané embarqué seul (révocations non à jour). **Route relais + ancrage**, instantané en repli hors ligne (alors « non vérifiable » si le certificat n'y est pas).
9. **Contrat de travail** : envoyer sa première page à l'IA pour comparer employeur et date d'entrée (B7), ou renoncer à B7. **Envoyer la page 1 seulement.**
10. **Pièces du garant** (avis, bulletins) : mêmes vérifications. **Oui.**
11. **Correction des valeurs lues par le bailleur** : autorisée, relance les règles, journalisée. **Oui.**
12. **Indices techniques T1-T3** : affichés dans « Points à vérifier » avec la mention « ne permet pas de conclure », repliés par défaut si l'évaluation bêta les juge inutiles. **Oui.**
13. **Comparaison bulletins ↔ avis d'imposition** (net imposable annualisé vs revenus de l'avis, C10) : **hors V1** (faux positifs probables : changement d'emploi, augmentation).
14. **Pièce d'identité (2D-Doc de la nouvelle carte, validité)** : **hors V1** (donnée sensible, format du cachet de la CNIe non confirmé).
15. **Registre RGPD** : ce chantier met à jour le §6 (périmé : score, Drive) et la ligne Mistral ; **AIPD et analyse AI Act (art. 6(3)/6(4), exception fraude de l'annexe III 5(b)) transmises à l'avocat** avant l'ouverture publique ; base légale proposée : intérêt légitime. **Oui.**
16. **Section R&D** (§7) : à reporter par le Pilotage dans `docs/CDC-PROPRYO.md` (§7 IA) et dans le dossier SEMIA. **Oui.**
17. **Contraste du bouton corail** (blanc sur `#ff5a3c` = 3,10:1 < 4,5 exigé par M-17), présent dans toute l'app : **sujet séparé pour le Pilotage**, hors de ce chantier.

---

## 9. REGLES-PAIE (16/10/2026) : vérifier les chiffres des bulletins (règles françaises 2026)

> Branche `feat/regles-paie` (worktree `Immo-wt-regles-paie`), version provisoire **v15.752**. Décision de Didier (16/10) : **l'IA lit tous les bulletins, PDF ou photo** (tâche relais `bulletin-paie`, Mistral OCR, point d'accès UE, **brique toujours éteinte** : `AI_OCR` absente). Banc de mesure hors git : `mockups/REGLES-PAIE/`.

### 9.1 Valeurs 2026 vérifiées (consultées le 15/10/2026)
SMIC horaire 12,02 € (décret 2025-1228) puis **12,31 € au 01/06/2026** (arrêté du 22/05/2026) ; PMSS 4 005 € / PASS 48 060 € (arrêté du 22/12/2025) ; taux salariés Urssaf (page du 01/01/2026) : vieillesse 6,90 % plafonnée + 0,40 %, CSG 6,80 % déductible + 2,40 % non déductible, CRDS 0,50 %, sur 98,25 % du brut dans la limite de 4 PASS ; Alsace-Moselle 1,30 % (régime général ; 1,19 % au régime agricole dès le 01/07/2026, MSA) ; Agirc-Arrco 2026 (circulaire 2025-16, répartition « sauf dispositions particulières ») ; apprentis exonérés jusqu'à 50 % du SMIC (BOSS) ; heures sup. : réduction 11,31 % (Urssaf) ; montant net social : contributions patronales santé et prévoyance **intégrées** (BOSS) ; plafond : régularisation progressive mois par mois (BOSS, assiette générale ch. 6).

### 9.2 Règles (js/core/regles-bulletin.js) — trois issues par bulletin
Chaque règle sort au format `{code, ok, titre, detail, source}` : `ok: true` respectée, `ok: false` écart (« À vérifier »), **`ok: null` non conclue** (« Non lu : … » via `etatPiece`). Un bulletin dont une règle n'a pas conclu ne publie pas ses règles respectées : il s'affiche **« Non vérifiable »**, jamais « OK ». D'où, par bulletin : **OK** (tout concorde) · **Non vérifiable** (un calcul ne concorde pas : retouche, pratique particulière ou lecture incertaine — regarder la pièce) · **À vérifier** (écart à une règle légale sûre).

| Code | Règle | Issue si elle ne tient pas |
|---|---|---|
| B1 | net payé = net avant impôt − impôt prélevé (R3243-1) | non vérifiable (acompte, saisie ou 2e ligne d'impôt après le net avant impôt) |
| B2 | impôt = base × taux | non vérifiable (régularisation du prélèvement) |
| B3 | net social ≤ brut | **retirée** (le net social intègre les parts patronales santé/prévoyance, BOSS) |
| B4, CB | cumul net imposable / **cumul brut** = cumul précédent + mois | non vérifiable (colonne voisine du tableau des cumuls, bulletin complémentaire, période mal lue) |
| N1, L2 | brut − cotisations ± lignes = net avant impôt ; somme des lignes = total | ancres (quorum) |
| S1, L1, C2 | heures × taux ; base × taux par ligne ; cumul ≥ mois | non vérifiable |
| TL | taux salarial légal 2026 (Urssaf) | **À vérifier, seulement pour la CSG/CRDS** (6,80 / 2,40 / 0,50 / 2,90, taux effectif × 98,25 % accepté), bulletin du régime général (vieillesse plafonnée lue à 6,90 %), somme des lignes = total ; vieillesse, Alsace-Moselle, heures sup. → non vérifiable |
| CS | assiette CSG non déductible ≥ déductible (BOSS) | **À vérifier** si somme des lignes = total et taux des deux lignes conformes à leur libellé |
| B5, B6, B7 | périodes (cumuls à l'appui), nom / SIREN, contrat | **À vérifier** (constats de dossier préexistants, garde-fou de lecture ajouté) |
| — | plafond, Agirc-Arrco, assiette CSG / brut, net imposable recalculé, SMIC, taux global | **écartées** |

### 9.3 Garde-fou de lecture : une erreur de lecture ne produit jamais « À vérifier »
1. Quorum : règles appliquées seulement si **au moins 2 égalités d'ancrage** tiennent (B1, N1, L2, S1) ; sinon « Montants non contrôlés ».
2. Écart non conclu s'il s'explique par une lecture plausible d'**une** valeur sans casser une autre égalité qui tient : chiffre remplacé, inversion, chiffre en trop/en moins, virgule, signe ; valeur égale à une **case voisine** ou **zéro**, que rien d'autre ne confirme.
3. Lignes décalées ou colonne patronale (taux légal d'une autre ligne, taux patronal, taux de remplacement, plusieurs taux hors norme, somme des lignes ≠ total) : aucun constat de taux ni d'assiette.
4. Cumul égal au mois hors janvier : ignoré. Période : un mois qu'**un** chiffre rend consécutif est une lecture plausible, sauf si le cumul à la position corrigée est **inférieur** à cumul(A) + montant(B) (plus haut : bulletin complémentaire possible) ; un bulletin sans quorum compte comme reçu. Conséquence : un seul mois manquant n'est presque jamais relevé. Nom à deux caractères près après les confusions de l'OCR (rn↔m, cl↔d, ii↔u), SIREN ou date à un chiffre près, jour/mois inversés : pas de constat. B7 : dates d'entrée à moins de 3 mois → règle non conclue sur le contrat.
6. Affichage (`etatPiece`) : un bulletin lu dont une règle n'a pas conclu (hors B6), ou sans quorum, n'est **jamais « OK »**, même si le contrôle local du fichier n'a « rien relevé » (relecture finale du 16/10).
5. Relais : SIRET à clé de Luhn (La Poste : Luhn ou somme multiple de 5) ; **chaque nombre de l'annotation doit figurer dans le texte reconnu** de la page (sinon écarté ; texte reçu vide = tout montant non nul écarté ; journal txt=0/1) ; lignes ≤ 40 ; libellé, salarié ou employeur portant 13 chiffres ou plus (NIR, IBAN) écarté ; lignes entre le total et le net renvoyées sans libellé (minimisation) ; nombres collés par l'espace des milliers découpés ; texte reconnu jamais renvoyé ni journalisé. Limites connues (Fable) : petits entiers, zéro, signe, champs permutés et erreurs communes à l'OCR et à l'annotation ne sont pas vus par ce contrôle — rôle du garde-fou côté app.

### 9.4 Mesures (corpus 100 % synthétique, `node mockups/REGLES-PAIE/mesure-ia.mjs --essais 10`)
- **Bulletins légitimes lus parfaitement : 264 / 264 « OK »**, 0 constat.
- **10 080 erreurs de lecture simulées**, une par dossier, 12 familles (chiffre substitué, transposition, décimale, ligne sautée, libellés décalés, signe, ligne entre total et net sautée, case voisine, assiette voisine, colonne patronale, zéro, horaire du contrat) : **0 « À vérifier »** contre **7 072 (70,2 %) sans garde-fou** ; la pièce devient « Non vérifiable » dans 0 à 100 % des cas selon la famille.
- Relectures adverses Opus (2 passes, 45 cas) : 0 constat, sauf B7 « CDD puis CDI » (dates d'entrée différentes : constat préexistant, décision ouverte).
- **Retouches** (lecture parfaite, état affiché par `etatPiece` avec le contrôle local « Rien relevé dans le fichier » actif) : **0 % de faux « OK »** pour 15 familles sur 16, 9,1 % pour le cumul net imposable retouché ; « À vérifier » seulement pour un taux de CSG faux (91 %) ; toutes les autres → « Non vérifiable ».
- Phase 1 (lecteur local pdf.js, non retenu en V1) : 99,7 % de valeurs exactes sur 6 mises en page connues, lecture fausse sur mises en page inconnues → **banc de mesure R&D** (`mockups/REGLES-PAIE/`), cf. §7 verrou 2.

### 9.5 Coût et taille
Prix inchangé : l'OCR annoté est facturé **à la page** (§6) ; le schéma étendu ne change que la taille de la réponse (≈ 12 Ko au pire avec l'échappement JSON : 40 lignes, libellés ≤ 80 caractères ; ~3 Ko en pratique). À l'activation : essayer `maxItems` (40 / 8) en mode strict avec `relay/scripts/verif-ocr-ue.mjs`. Délai de la tâche inchangé (45 s).

---

## 10. Activation de la lecture IA (16/10/2026, v15.761)

> Branche `feat/activation-ia-ocr` (worktree `Immo-wt-activation-ia`), version provisoire **v15.761**.

Prérequis remplis le 16/10/2026 :
- point d'accès UE vérifié : `node relay/scripts/verif-ocr-ue.mjs` OK, `mistral-ocr-latest` servi par `api.eu.mistral.ai` ;
- **rétention zéro (Zero Data Retention) activée** sur le compte Mistral (Admin › Confidentialité). Elle couvre les **points d'accès sans état seulement** : `/v1/ocr`, `/v1/audio/transcriptions`, `/v1/chat/completions` — les trois qu'appelle le relais (`relay/src/ai/provider.js`). Tout appel futur à un autre point d'accès (lots, fichiers, agents) imposerait de repasser `RETENTION_ZERO` à `false` ;
- entraînement sur les données désactivé ;
- suivi de consommation et plafonds par compte (CONSO-IA, v15.756, migration 0062 appliquée).

Bascule :
- relais : `AI_OCR = "true"` dans `relay/wrangler.toml` → `/ai/status` annonce `ocr.actif=true` (avec `MISTRAL_API_KEY`) ;
- app : `RETENTION_ZERO = true` (`js/core/ia-transparence.js`) → les trois notices (dictée, vidéo, bulletins) disent « Mistral AI ne conserve ni … (rétention zéro) » ;
- page publique de dépôt (`relay/public/dossier.js`, `ASSET_VERSION` 7) : « rétention zéro : le contenu n'est pas conservé par Mistral AI, aucun entraînement » ;
- Paramètres › Candidatures : la ligne « Lecture des bulletins de salaire par l'IA » remplace « Bientôt disponible » dès que le relais annonce la lecture ouverte (aucun changement de code : `_candIaOcr`).

Reste à la charge de Didier : redéployer le relais, puis un premier essai réel sur un de ses propres bulletins (essai `maxItems` du §9.5 à cette occasion).
