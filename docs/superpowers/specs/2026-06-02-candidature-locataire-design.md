# Design — LOG-CANDIDATS : candidature locataire en ligne + conversion directe en bail

**Date** : 2026-06-02
**Sujet** : `docs/subjects/LOG-CANDIDATS.md` (P1, créé 2026-05-13 ; ce design **remplace** le schéma de mai qui reportait le lien partagé en V2 SaaS + fallback PDF)
**Dépend de** : `docs/subjects/BAIL-SIGNATURE-DISTANCE.md` + `docs/superpowers/plans/2026-06-02-bail-signature-relais.md` (le relais Cloudflare est la **fondation partagée** — voir §3)
**Lié à** : LOG-FICHE-360 · LOG-ANNONCE · BAIL (wizard + `copyBailFrom`) · EMAIL-AUTO · PORTAIL-LOCATAIRE (projet suivant, même serveur) · IA-V2 (OCR justificatifs)

**Prio** : P1 · **Taille** : L (réduite vs estimation initiale car le relais est mutualisé) · **Statut** : design en cours de validation user. **Pas encore de mockups** → à produire avant tout code prod (règle mockup-first).

---

## 1. Objectif

Permettre à un bailleur de **recevoir le dossier complet d'un candidat locataire en ligne** (identité, situation, garant, pièces) pour un logement vacant, puis de **basculer le candidat retenu directement en bail** sans ressaisie.

Demande user d'origine (2026-05-13) :
> « candidats on n'a pas et on m'a dit que c'est une bonne chose. Tu transmets un lien aux personnes intéressées par le logement et quand tu fais le bail tu bascules direct en locataire »

Le parcours cible, bout en bout :

```
Annonce (LOG-ANNONCE) ──► Candidature (CE SUJET) ──► Bail (wizard existant) ──► Signature à distance (BAIL-SIGNATURE-DISTANCE)
```

**La valeur = zéro double saisie.** Le candidat saisit son dossier une fois ; à la conversion, tout (état civil, garant, pièces) atterrit dans le bail et dans la GED du bien.

---

## 2. État des lieux de l'existant (ce sur quoi on s'appuie)

| Brique existante | Emplacement | Réutilisation |
|---|---|---|
| **Modèle locataire** | `getBailLocs()` (index.html ~14871-14959) — `bail.locataires[]` : `civilite, nom, prenom, dateNaissance, lieuNaissance, tel, email, adressePrecedente` | Le candidat **réutilise exactement ces champs d'identité** → mapping 1:1 à la conversion, pas de transformation. |
| **Pré-remplissage bail** | `copyBailFrom` (~14022) + `openBail` (~14070) + `getBailDataFromForm` (~15292) | Mécanique de pré-remplissage du wizard réutilisée pour « créer le bail depuis ce candidat ». |
| **GED / pièces jointes** | `DB.documents[]` (~12039) + `_attachmentSaveForEntity` (~12177) — métadonnées + IndexedDB binaire + backup Drive bidir | Les pièces du candidat vivent ici sous un **nouveau `parentType: 'candidat'`**, puis migrent vers le bien à la conversion. |
| **Onglet Locataires** | `rBaux()` (~13717) groupe les logements par immeuble, clic ligne = `openLogFiche(ref)` | L'onglet **Candidats** sera un frère transversal de Locataires (voir §8). |
| **Sync logement ↔ bail** | `syncBailToLog` (~35383) | À la conversion, le logement passe automatiquement « loué ». |
| **Relais Cloudflare** | `relay/` (en cours de build, branche `relay-bail-sign`) — Worker Hono + R2 + KV, tokens HMAC, sessions inguessables, pages autonomes sans compte | **Fondation mutualisée** : la candidature ajoute un modèle + des routes + une page `dossier.html`, elle ne reconstruit rien (voir §3). |

**Ce qui n'existe pas et qu'on crée** : entité `DB.candidats[]`, onglet Candidats, page publique `dossier.html`, routes candidature sur le relais, scoring « Confiance », flux de conversion candidat → bail.

---

## 3. Architecture — réutilisation du relais (décision structurante)

Le sujet de mai reportait le lien partagé en « V2 SaaS » faute de backend. **Ce n'est plus vrai** : le relais Cloudflare de BAIL-SIGNATURE-DISTANCE est en cours de construction et fournit exactement la « couche publique pour utilisateurs sans compte » dont la candidature a besoin.

**Conséquence : la candidature devient faisable en V1**, et son périmètre rétrécit à trois morceaux :

1. **Côté app (index.html)** — modèle `DB.candidats[]`, onglet Candidats, fiche candidat, scoring, conversion → bail. *Constructible en parallèle du relais.*
2. **Côté relais** — un module candidature (modèle de dossier + routes) **ajouté au projet `relay/` existant**, réutilisant ses briques génériques : `crypto-utils` (sha256/randomHex), `tokens` (HMAC create/verify), `storage` (KV métadonnées + R2 blobs), `validate` (magic bytes PDF/images, taille max). Seul `sessions.js` est spécifique à la signature ; la candidature aura son équivalent `candidatures.js`.
3. **Page publique `dossier.html`** — servie par le relais comme `sign.html`, autonome, sans compte.

**Seule dépendance d'ordre** : la **fondation** du relais (crypto-utils, tokens, storage, validate, wrangler, déploiement) doit atterrir avant que le lien candidat fonctionne réellement. Tout le côté app peut être développé et testé en parallèle (avec un dossier candidat saisi manuellement en attendant).

> **Principe (gravé)** : réutilisation, pas réinvention. La candidature ne crée aucun mécanisme de transport, de chiffrement ou de stockage parallèle — elle étend le relais.

---

## 4. Décisions verrouillées

| # | Décision | Justification |
|---|---|---|
| **D1** | **Le lien partagé est V1**, porté par le relais Cloudflare (plus de report « V2 SaaS », plus de fallback PDF). | Le relais est en build ; la candidature le mutualise. Le fallback PDF de mai devient inutile. |
| **D2** | **Identité candidat = mêmes champs que `bail.locataires[]`** (`civilite, nom, prenom, dateNaissance, lieuNaissance, tel, email, adressePrecedente`). | Mapping 1:1 à la conversion, zéro transformation, zéro perte. C'est le cœur du « pas de double saisie ». |
| **D3** | **Les données de *situation* (revenus, employeur, type de contrat) servent au scoring uniquement et ne sont PAS portées dans le bail.** | Le bail n'a pas de champ « revenus du locataire » ; ces données sont une aide à la décision, pas une clause. Évite des champs orphelins. Conservées sur la fiche candidat archivée pour la traçabilité. |
| **D4** | **Pièces demandables limitées au décret 2015-1437** (liste fermée des justificatifs qu'un bailleur peut exiger). | Obligation légale. Demander hors-liste expose à sanction. La page `dossier.html` ne propose que des cases conformes. |
| **D5** | **Pièces candidat stockées dans `DB.documents[]` avec `parentType: 'candidat'`**, puis **migrées vers le bien** (`parentType` bien/bail) à la conversion. | Infra GED existante (IndexedDB + Drive bidir). Pas de stockage parallèle. À la conversion, les pièces suivent le candidat devenu locataire. |
| **D6** | **Conversion = bouton « Créer le bail à partir de ce candidat »** → wizard bail pré-rempli via la mécanique `copyBailFrom`. À la sauvegarde : pièces migrées, candidat archivé « Converti en locataire », logement passé « loué » (`syncBailToLog`). | Réutilise le wizard et la sync existants. Le candidat ne devient locataire **qu'au moment où le bail est réellement créé** (pas de locataire fantôme). |
| **D7** | **Scoring « Confiance » transparent**, note 0-100 + voyant, **critères de solvabilité légaux uniquement** (ratio revenus/loyer, type de contrat, présence garant, complétude du dossier). Tooltip explicite les critères. **Jamais de critère discriminatoire** (origine, âge, situation familiale, etc.). | Anti-discrimination (loi). Le score est une aide, pas un verdict — formulé comme tel. |
| **D8** | **Score « déclaratif » tant que les pièces ne sont pas vérifiées.** Bascule manuelle « pièces vérifiées » par le bailleur ; OCR de vérification reporté en IA-V2. | On ne peut pas garantir l'honnêteté du candidat à la saisie ; on garantit la **complétude** (champs/formats/pièces obligatoires) et on **étiquette** clairement ce qui est déclaratif. |
| **D9** | **Onglet Candidats transversal** (frère de Locataires) **+ section Candidats sur la fiche d'un logement vacant** (LOG-FICHE-360). | Parité Qalimo + cohérence avec la fiche 360. Le bailleur voit les candidats globalement et par bien. |
| **D10** | **Refus = email de courtoisie optionnel** (template `candidat-refus` dans EMAIL-AUTO), jamais automatique. | Politesse marché, mais le bailleur garde la main. |
| **D11** | **RGPD** : lien à token inguessable, fichiers chiffrés au repos (R2), **purge des dossiers refusés après 30 jours**, relais = **sous-traitant RGPD** → registre des traitements à mettre à jour. | Données personnelles sensibles (revenus, pièces d'identité) de tiers non-clients. Obligation légale. Délai de 30 j tranché par user (2026-06-02). |
| **D12** | **Le lien candidat est générable depuis 3 points d'entrée** : (a) l'**annonce** (LOG-ANNONCE), (b) l'**onglet Candidats** (« Inviter un candidat »), (c) la **fiche d'un logement vacant**. Le lien ne dépend **pas** d'une annonce ImmoTrack. | User : « l'utilisateur ne va pas forcément créer une annonce ImmoTrack. » Depuis (a) et (c) le `logRef` (+ loyer pour le ratio) est connu → pré-rempli ; depuis (b) le bailleur choisit le bien dans la modale d'invitation. |
| **D13** | **Demande de complément de dossier supportée** : sur un candidat « En cours », le bailleur peut **rouvrir le lien** pour réclamer une pièce/info manquante → re-notification du candidat, qui complète sans tout ressaisir (le token et le dossier existant sont conservés). | User : « oui possibilité de demander des compléments. » Évite de refuser un bon dossier juste incomplet. |

---

## 5. Modèle de données — `DB.candidats[]`

```js
{
  id, ref,                       // identifiants internes
  logRef,                        // logement visé (vacant)
  dateCreation, _stamp, _modifiedAt, _archived,
  source: 'manuel' | 'lien' | 'annonce',

  // --- Identité : MÊMES champs que bail.locataires[] (D2) ---
  civilite, nom, prenom,
  dateNaissance, lieuNaissance,
  tel, email,
  adressePrecedente,

  // --- Situation (scoring uniquement, non portée au bail — D3) ---
  revenus,                       // mensuels déclarés
  employeur,
  contrat: 'CDI' | 'CDD' | 'Freelance' | 'Etudiant' | 'Retraite' | 'Autre',

  // --- Garant (optionnel) ---
  garant: { nom, adresse, dateNaissance, lieuNaissance },

  // --- Pipeline ---
  statut: 'recu' | 'enCours' | 'valide' | 'refuse' | 'converti',
  confianceScore,                // 0-100 (D7)
  piecesVerifiees: false,        // bascule manuelle (D8)
  notes,
  bailRef                        // renseigné à la conversion (lien candidat ↔ bail)
}
```

Pièces : pas de champ dans l'objet candidat — elles vivent dans `DB.documents[]` avec `parentType: 'candidat'` et `parentRef: candidat.ref` (D5).

**Champ « ajout libre »** (règle gravée « choix prédéfini + ajout libre ») : `contrat` propose les valeurs ci-dessus **+ saisie libre** ; idem pour la liste de pièces demandées côté bailleur (kit de démarrage du décret 2015-1437 + possibilité d'ajouter une demande hors-liste *à ses risques*, avec avertissement légal).

---

## 6. Page publique `dossier.html` (servie par le relais)

Formulaire candidat autonome, **sans compte**, accessible par le lien à token. 4 étapes :

1. **Identité** — civilité, nom, prénom, date & lieu de naissance, tél, email, adresse actuelle.
2. **Situation pro & revenus** — type de contrat (liste + libre), employeur, revenus mensuels.
3. **Garant** (optionnel) — nom, adresse, date & lieu de naissance.
4. **Pièces** — upload limité au **décret 2015-1437** (pièce d'identité, justificatif de domicile, justificatifs de situation pro, justificatifs de ressources ; idem pour le garant).

**Garde-fous de qualité (D8)** : champs obligatoires + formats validés (email, tél, date) + pièces obligatoires **avant** envoi. Étiquetage « déclaratif » sur les revenus. Validation côté relais en plus du client (magic bytes, taille max — modules `validate` réutilisés).

**Soumission** → crée/complète le `candidat` côté relais (KV) + stocke les pièces (R2) ; le bailleur récupère le dossier au prochain sync de l'app et reçoit une notification.

---

## 7. Pipeline & statuts

```
Reçu ──► En cours ──► Validé ──► Converti (bail créé)
            │  ▲
            │  └── complément réclamé (D13) ──► candidat re-notifié ──► complète ──► retour « En cours »
            └──► Refusé (email courtoisie optionnel)
```

- **Reçu** : dossier soumis via le lien, notification bailleur.
- **En cours** : bailleur examine ; peut **demander un complément** (D13) → réouverture du lien + re-notification du candidat, qui complète sans ressaisir ; le dossier revient « En cours ».
- **Validé** : dossier retenu → bouton de conversion actif.
- **Refusé** : sort du pipeline actif ; email `candidat-refus` proposé (D10) ; **purge RGPD à 30 jours** (D11).
- **Converti** : bail créé, candidat archivé, `bailRef` renseigné.

---

## 8. Conversion candidat → bail (le cœur)

1. Sur une fiche candidat **Validé** : bouton **« Créer le bail à partir de ce candidat »**.
2. Ouvre le **wizard bail existant**, pré-rempli via `copyBailFrom` :
   - `bail.locataires[0]` ← identité candidat (mapping 1:1, D2) ;
   - garant ← `garant` candidat si fourni ;
   - `logRef` pré-sélectionné.
3. Le bailleur complète ce qui manque (clauses, loyer, dates…) et sauvegarde.
4. **À la sauvegarde** :
   - pièces du candidat **migrées** `parentType: 'candidat'` → bien/bail (D5) ;
   - candidat → archivé, `statut: 'converti'`, `bailRef` renseigné ;
   - logement → « loué » via `syncBailToLog` ;
   - lien candidat ↔ bail conservé (audit-trail).
5. Enchaînement naturel possible vers **signature à distance** (BAIL-SIGNATURE-DISTANCE).

---

## 9. Scoring « Confiance » (D7)

Note 0-100 + voyant (vert / orange / rouge), **transparente** :

| Critère (solvabilité légale uniquement) | Points |
|---|---|
| Ratio revenus / loyer ≥ 3 | +30 |
| Ratio 2,5–3 | +20 |
| Ratio 2–2,5 | +10 |
| Ratio < 2 | 0 |
| Contrat CDI | +25 |
| Contrat CDD | +10 |
| Freelance / Étudiant / autre | 0 |
| Garant présent | +20 |
| Pièces complètes | +15 |
| RIB / justificatif ressources fourni | +10 |

Tooltip : « Score basé sur revenus, contrat, garant et complétude du dossier. Aide à la décision, pas un verdict. Données **déclaratives** tant que les pièces ne sont pas vérifiées. »

**Interdits** : aucun critère lié à l'origine, au nom, à l'âge, au sexe, à la situation familiale, à la santé, etc. (anti-discrimination).

Tant que `piecesVerifiees === false` : badge « déclaratif » à côté du score (D8).

---

## 10. Placement UI & points d'entrée du lien (D12)

- **Onglet Candidats** (transversal, frère de Locataires — D9), **positionné entre Locataires et Mouvements** (validé user) : tableau type Qalimo (Nom · Bien · Date de début souhaitée · Statut · Revenus déclarés · Garant · Confiance), tabs Actifs / Archivés, bouton primaire « + Ajouter un candidat » (saisie manuelle), bouton secondaire **« Inviter un candidat »** → modale d'invitation où le bailleur **choisit le bien** puis génère le lien relais.
- **Fiche logement vacant** (LOG-FICHE-360) : section « Candidats » listant les candidatures reçues pour ce bien + bouton **« Inviter un candidat »** (le bien est déjà connu → `logRef` + loyer pré-remplis), accès rapide à la conversion.
- **Annonce** (LOG-ANNONCE) : génération du lien candidat directement depuis l'annonce du bien.

> Les **3 points d'entrée produisent le même lien relais** (même modèle de dossier). Différence : depuis la fiche bien et l'annonce, le `logRef` (et le loyer pour le ratio de scoring) est déjà connu et embarqué ; depuis l'onglet Candidats, le bailleur sélectionne le bien dans la modale. **Le lien ne dépend jamais de l'existence d'une annonce ImmoTrack.**

---

## 11. Sécurité & RGPD (D11)

- Lien candidat = token **inguessable** (relais), jamais d'identifiant devinable dans l'URL.
- Pièces (identité, ressources) **chiffrées au repos** (R2).
- **Rétention limitée** : purge automatique des dossiers **refusés après 30 jours** (D11) ; dossiers convertis migrés vers le bien (cycle de vie du bail).
- Le relais traite des données personnelles de **tiers non-clients** → c'est un **sous-traitant RGPD** : mise à jour du **registre des traitements** + mention d'information sur `dossier.html` (finalité, durée, droits).

---

## 12. Périmètre & ordre de réalisation

**Dépendance dure** : fondation relais (crypto-utils, tokens, storage, validate, déploiement) avant lien candidat fonctionnel.

**Parallélisable dès maintenant (côté app)** :
- modèle `DB.candidats[]` + helpers (scoring, mapping vers bail, archivage) ;
- onglet Candidats + fiche candidat + saisie manuelle ;
- flux de conversion candidat → bail (testable avec un candidat saisi manuellement).

**Après fondation relais** :
- module candidature sur le relais (modèle + routes) ;
- page `dossier.html` ;
- bouton « Inviter un candidat » + récupération des dossiers au sync.

**Tests Vitest** : `_calculConfiance(candidat)` (nominaux + edge), `_candidatVersBail(candidat)` (mapping correct), `_archiveCandidatAuto(candidatId, bailRef)`, migration des pièces.

**Mockups d'abord (règle gravée)** : variantes A/B/C × PC/tablette/téléphone × tout artefact post-clic (modale d'invitation, fiche candidat, étapes `dossier.html`, confirmation de conversion), validés en vrai navigateur **avant** tout code prod.

---

## 13. Différenciant marché

| Solution | Pipeline candidats | Lien partagé | Conversion auto bail |
|---|---|---|---|
| Rentila | ❌ | ❌ | ❌ |
| BailFacile | partiel | ❌ | partiel |
| Qalimo V2 | ✅ | ✅ | ✅ |
| Smovin | ✅ | ✅ | ✅ |
| **ImmoTrack après ce sujet** | ✅ tableau + scoring transparent | ✅ (relais V1) | ✅ zéro double saisie |

---

## 14. Questions tranchées (2026-06-02)

- [x] **Délai de purge RGPD** des dossiers refusés → **30 jours** (D11).
- [x] **Position de l'onglet Candidats** → **entre Locataires et Mouvements** (D9, validé).
- [x] **Complément de dossier** → **oui** : réouverture du lien + re-notification du candidat, complète sans ressaisir (D13).
- [x] **Points d'entrée du lien** → **3 entrées** : annonce, onglet Candidats, fiche bien vacant. Le lien ne dépend pas d'une annonce ImmoTrack. Depuis l'annonce et la fiche bien, `logRef` + loyer pré-remplis ; depuis l'onglet, le bailleur choisit le bien (D12).
