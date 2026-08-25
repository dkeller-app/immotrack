# CDC — ÉTAT DES LIEUX TERRAIN (V1 LIGHT)

**Revue du 20/08/2026** · session dédiée EDL · Didier + Claude
**Maquettes** : `mockups/EDL-TERRAIN/edl-terrain.html` (9 écrans × 3 formats × 2 thèmes)
**Page de décisions** : `mockups/EDL-TERRAIN/decisions.html` (40 cartes, verdicts à copier)
**Base** : `docs/CDC-V1-LIGHT.md` §5 « État des lieux » · gate de sortie §6 · règles de solidité §5bis

> Ce document est le seul fichier écrit par la session hors mockups HTML.
> Aucun code de l'app n'a été modifié, aucun commit, ni `BACKLOG.md` ni `docs/CDC-*.md`.

---

## 0. Ce qui a été mesuré

Tout ce qui suit repose sur des mesures, pas sur des estimations.

### 0.1 Le volume réel — EDL d'entrée Ferrette-101 du 03/05/2026

Source : `_import/BACKUP-cloud-patrimoine-2026-08-19T05-28-55-831Z.json`.

| Mesure | Valeur |
|---|---|
| Pièces | **8** |
| Éléments | **110** (dont 90 avec un état saisi) |
| Photos | **77** (jusqu'à **8** sur un seul élément — « Séjour > Murs ») |
| Observation la plus longue | **277 caractères**, sur 5 lignes |
| Poids du record JSON | **49 ko** (métadonnées seules — les photos sont en IndexedDB) |
| Un EDL neuf part de | **127 éléments** / 7 pièces (`EDL_TPL`, `index.html:30526`) |
| Autre EDL réel (F3, 04/06) | 6 pièces, 90 éléments, **98 photos**, mobilier 11 éléments |

Le brief supposait « 8 pièces, ~35 éléments, ~40 photos ». La réalité est **3× supérieure**.

L'usage réel consiste largement à **élaguer** (WC de 16 à 4 éléments, cuisine de 27 à 15) et à
**ajouter du libre** : « Escalier en bois », « Fenêtre et volet », « Sous-bassement lavabo / vasque ».
« Extérieurs / Communs » reste intégralement vide (11 éléments, 0 renseigné).

### 0.2 Le défilement, mesuré dans la maquette

110 éléments réels, CSS mobile actuel (`css/main.css:3070`), les 7 sections administratives
repliées à une ligne chacune — donc une version **optimiste** de la réalité.

| Format | Aujourd'hui | Après | Ce qui change |
|---|---:|---:|---|
| Téléphone 375 | **29 781 px** (39 écrans) | **3 182 px** (la plus grosse pièce) | une pièce à l'écran |
| Tablette 768 | — | **11 878 px** | vue complète, 2 colonnes |
| PC 1280 | — | **8 102 px** | vue complète, 3 colonnes |

### 0.3 Les trous confirmés dans le code

- `edlAutosave` / `_edlDraft` / `edl-draft` → **0 occurrence** dans tout le dépôt.
- `addEventListener('online'|'offline')` → **0 occurrence**. `navigator.onLine` → **1 seule** occurrence dans tout le dépôt (`js/app/supabase-entry.js:685`), et uniquement pour libeller l'indicateur de synchronisation après un échec de flush. **Aucun écran, aucune action, aucun message de l'app ne dépend de l'état du réseau.**
- Aucun des **145** fichiers de `__tests__/helpers/` ne contient « edl ».
- Aucun module `js/core/edl-*.js` : les **1 410** occurrences d'EDL sont inline dans le monolithe.
- Aucun `<link rel="manifest">` ni balise iOS dans l'en-tête : **l'app n'est pas installable**.

### 0.4 Le piège de synchronisation à connaître

`saveEDL` écrit par **remplacement d'objet** (`DB.edl[i] = record`, `index.html:33329`).
C'est le geste qui a détruit l'EDL d'entrée Ferrette-001 de l'espace de Marion le **18/07/2026 à 09:16 UTC** :
le tag `_espaceId` perdu au remplacement → le diff voyait « clé disparue » (softDelete) + « clé nue apparue ».
Le filet est la réadoption D1b, qui vit **dans `store-sync`** (`js/core/store-sync.js:173`).

**Un autosave, c'est ce remplacement déclenché toutes les 2 secondes au lieu d'une fois.**
Tout ce qui suit passe par `saveDB` — jamais à côté.

---

## 1. Le brouillon — décision B.1

**Décision : il n'y a pas de brouillon. L'état des lieux s'autosauve.**

La question « localStorage ou IndexedDB à cause des photos » se referme d'elle-même : `saveEDL` ne
sérialise que les métadonnées via `_phMeta` (`index.html:33239`), le binaire vit déjà en IndexedDB
dès la prise (`index.html:32600`). Un EDL réel pèse 49 ko. **Aucun second magasin n'est nécessaire.**

### Ce qui change
- Dès que le logement et la date sont saisis, l'EDL **existe** dans `DB.edl`.
- Chaque saisie terminée réarme un minuteur de **2 secondes** qui appelle
  `saveEDL({keepOpen:true, silent:true})` — la fonction **existe déjà** (`index.html:32509`).
- Déclencheurs : sortie d'un champ, clic sur un bouton d'état, ajout/suppression de photo,
  d'élément ou de pièce. **Jamais à la frappe** (110 éléments × frappes = centaines d'écritures de 49 ko).
- L'en-tête affiche « Enregistré à 14h32 ».
- La ligne de la liste porte un marqueur **« Brouillon »** tant qu'aucune signature n'existe.
- Fermer la modale (croix ou retour) **enregistre**.

### Ce qui disparaît
- Le bouton **Annuler** du formulaire (`index.html:4055`) : il n'a plus de sens quand tout est déjà écrit.
  Supprimer reste possible depuis la liste, avec sa confirmation (`delEDL`, `index.html:33355`).
- Le bouton **💾 Enregistrer** du pied de page sur téléphone (l'enregistrement est automatique).
  Il reste sur PC et tablette.
- Toute popup « voulez-vous enregistrer ? » — elle n'est jamais introduite.

### Ce qui ne change pas
- Un EDL **signé** n'est jamais autosauvé : le verrou `_edlIsSigned` (`index.html:33013`) reste maître.
- Un EDL en cours devient visible dans l'espace partagé dès la première écriture. **C'est voulu** :
  c'est ce qui garantit le zéro perte, et un EDL en cours vu par un associé est une information, pas un problème.

### Alternative écartée
Un magasin local séparé (clé localStorage propre à l'appareil), promu au premier « Enregistrer » :
écarté parce qu'il constitue un second moteur de persistance, **hors du filet D1b**, et qu'un brouillon
resté sur le téléphone est invisible de tout autre appareil.

---

## 2. Les photos — décision B.2

**Décision : envoi continu pendant la visite, compteur visible en permanence.**

### Ce qui ne change pas
Le redimensionnement **1600 px max / JPEG qualité 0,8** est le bon calibre pour une preuve d'EDL,
et il est déjà **uniforme sur les 4 chemins** (pièces `index.html:32584`, mobilier `:30269`,
compteurs, clés `:31690`). Aucun arbitrage n'est ouvert dessus.

### Ce qui change
- Chaque photo part **dès qu'elle est prise**, une à la fois, en tâche de fond,
  **découplée de l'autosave** — sinon l'envoi post-enregistrement (`index.html:33347`) deviendrait
  une tentative permanente avec l'autosave à 2 s.
- L'en-tête porte un compteur permanent « **34 / 77 photos à l'abri** », qui devient « 77/77 à l'abri ».
  Il reste visible sur la ligne de l'EDL dans la liste tant que tout n'est pas monté.
- Un échec ne fait pas de bruit mais **laisse la photo dans la file**, retentée au retour du réseau
  et à la prochaine ouverture de l'EDL.
- **Le drapeau `synced` n'est plus lu par la collecte.** Une photo est à l'abri **si et seulement si**
  elle porte un `cloudKey`. `synced` est un héritage de Google Drive, retiré depuis : une photo
  marquée `synced:true` sans `cloudKey` est aujourd'hui **exclue à vie** de l'envoi
  (filtre `!ph.synced`, `index.html:32705`).
- **Le chemin de relecture est aligné sur le chemin d'écriture.** L'envoi écrit
  `<espace>/<entité>/files/<clé>` (`supabase-entry.js:265`), la relecture sans `cloudKey` vise
  `<espace>/files/<clé>` (`supabase-entry.js:243`) : deux chemins qui ne se croisent pas.
  Le `cloudKey` retourné est **toujours stocké**.
- **Mémoire pleine** : message explicite (« Ton téléphone n'a plus de place. Envoie les N photos
  en attente ou libère de l'espace. ») au lieu de « QuotaExceededError ». Les photos déjà écrites
  ne sont jamais perdues, et le reste du lot n'est pas abandonné en silence.
- **Le bloc de redimensionnement, recopié 4 fois, est factorisé** en un point unique
  (règle DRY non négociable du projet).

### La copie locale — décision du 20/08

**Le local n'est pas une option, c'est le socle.** La photo est redimensionnée puis écrite en
IndexedDB **avant tout** (`index.html:32600`), et la chaîne de prise de vue est entièrement locale
(`URL.createObjectURL` + `<canvas>` + IndexedDB, aucun appel réseau) : c'est ce qui rend un EDL
possible dans une cave. Non soumis au vote.

Ce qui a été tranché, c'est **l'après** : que devient la copie sur l'appareil une fois la photo
confirmée dans le cloud. Chiffre de référence : le F3 à 98 photos ≈ **60 Mo** sur le téléphone
(les photos sont gardées en base64, +37 % par rapport au binaire).

**Deux commandes, qui ne se contredisent pas — le réglage est le défaut, la clôture est la décision :**

1. **Un réglage, dans l'onglet Préférences qui existe déjà** (`index.html:986`) :
   « Conserver les photos d'état des lieux sur cet appareil » — **activé par défaut**, avec l'espace
   occupé affiché en clair. Sa raison d'être n'est pas seulement technique : aujourd'hui **rien ne dit
   à l'utilisateur que ses photos sont stockées sur son téléphone**. Le réglage le lui apprend.
   Réglage **par appareil** : il rejoint `LOCAL_USER_PARAM_KEYS` (`js/core/store-supabase.js:62`),
   le mécanisme qui garde un paramètre **hors de la synchro cloud** — « garder sur cet appareil »
   n'a aucun sens sur un autre appareil.
2. **À la clôture d'un EDL signé**, la question est posée pour **cet EDL** : « Garder les 77 photos
   sur cet appareil (45 Mo), ou les libérer — elles sont à l'abri dans le cloud ? », avec la valeur
   du réglage **pré-sélectionnée**. La réponse appartient à l'EDL.

**Il n'existe AUCUN bouton global de libération.** Motif, mot pour mot (Didier, 20/08) :
« *on va accidentellement supprimer toutes les photos du téléphone de tous les EDL déjà faits* ».
Libérer se fait toujours depuis un EDL précis.

**Garde-fou dur** : l'option de libération n'est proposée que si **100 %** des photos de cet EDL
portent un `cloudKey` confirmé. S'il en manque une seule, l'option est indisponible et la raison
est affichée (« 3 photos ne sont pas encore dans le cloud »). C'est l'application de la règle gravée
« pas d'auto-suppression : preuves légales », déjà tenue par `cache-purge.js` qui refuse de purger
l'IndexedDB tant qu'il reste des binaires sans copie cloud (`listIdbOnlyBinaries`).

**Jamais de suppression automatique**, quel que soit le volume atteint.

Une photo libérée se **retélécharge à la demande** quand on la rouvre, avec réseau.

### Hors périmètre — décision explicite du 20/08
Le rattrapage des photos **déjà prises** (94 avec un `driveFileId` sur un Drive retiré, 78 en local seul,
**0 sur 182 avec un `cloudKey`**) est écarté : « on ne prend pas en compte ce qui a déjà été fait,
on fait pour l'avenir ». Le constat est consigné ici, il n'est pas au planning.

---

## 3. Le hors-ligne — décision B.3

**Décision : les trois verrous sautent ensemble — installable, identité, données locales.**

Aujourd'hui « hors ligne » ne veut pas dire dégradé, mais **inutilisable** : `initDB` ne lit **jamais**
le miroir localStorage en mode cloud (`let raw = _CLOUD_BOOT ? null : localStorage.getItem(KEY)`,
`index.html:5550`). Ce blocage vient de l'incident RGPD du 12/07 (Marion voyait Zito/Fric après
révocation) et **ne doit pas être levé bêtement**.

### Verrou 1 — la coquille : **déjà acquis**
Le service worker est enregistré sur `github.io` (`index.html:55048`), précache `index.html`
(`sw.js:24`) et sert HTML/JS/CSS depuis le cache quand le réseau tombe (`sw.js:76`).
Polices et SheetJS sont vendorés. **Rien à faire.**

### Verrou 2 — l'identité  *(cause trouvée le 20/08, question de Didier)*

**La ligne exacte :**

```
js/app/supabase-boot.js:53
async function currentUser() { const { data } = await client.auth.getUser(); return (data && data.user) || null }
```

`getUser()` est un **appel réseau** au serveur Supabase, et c'est lui qui décide au boot si on passe
ou si on voit l'écran de connexion (`supabase-entry.js:427`). Sans réseau il échoue → `null` →
formulaire de connexion → qui a besoin du réseau lui aussi. **Cul-de-sac.**

La fonction qui lit la session **en local** existe : `client.auth.getSession()`. Elle n'est utilisée
que pour le jeton du worker de signature (`supabase-entry.js:160`), **jamais au démarrage**.

**La règle retenue :**

> On ne peut pas **se connecter** hors ligne. On peut **rester connecté** hors ligne.

Séquence de démarrage :

1. `getUser()` — le serveur, la vérité. S'il répond : comportement actuel, strictement inchangé.
2. S'il échoue **faute de réseau** (et seulement pour ça — pas parce que le jeton est refusé) :
   lecture locale de `getSession()`.
3. Une session existe **et** `classifyMirrorTag` rend `'same'` pour son `userId` → l'app s'ouvre
   en mode hors ligne, sur les données du miroir.
4. Au retour du réseau, `getUser()` tourne pour de vrai : si le compte a été révoqué, la purge
   se déclenche comme aujourd'hui.

Rien de nouveau n'est divulgué : ces données sont **déjà** sur l'appareil, écrites par `saveDB`.
On autorise leur lecture, on ne les fait pas apparaître.

**Ce qui reste impossible, et doit être dit clairement à l'utilisateur :**
- **Premier lancement sur un appareil neuf sans réseau** → rien n'est stocké, il n'y a rien à lire.
- **Après une déconnexion** → le logout purge miroir et jeton, volontairement (`supabase-entry.js:182`).
  Comportement RGPD, non modifié.

**Conséquence terrain** : on ouvre Propryo **une fois avant de partir**. Le verrou 4 (installable)
est ce qui rend cette garantie durable — sinon Safari purge tout à 7 jours.

### Verrou 3 — les données
Au démarrage, si l'hydratation cloud échoue **et** que `classifyMirrorTag` rend `'same'`
(`js/core/cache-purge.js:25` — le tag `{userId, espaceId}` posé au login), l'app démarre sur le
miroir local. Les verdicts `'other-user'` et `'untagged'` **gardent le comportement actuel** (écran vide) :
la fuite RGPD de juillet reste fermée.

### Verrou 4 — installable (sans quoi les trois autres ne tiennent pas dans la durée)
Aucun `<link rel="manifest">`, aucun fichier manifeste, aucune balise `apple-mobile-web-app-capable`.
Sur iPhone, un site **non installé** voit Safari purger localStorage et IndexedDB après **7 jours**
sans visite — exactement là où vivent les photos et le miroir. Manifeste PWA + balises iOS + icônes,
et une invitation à ajouter à l'écran d'accueil au premier lancement sur téléphone.

### Le périmètre du hors ligne — décision du 20/08

Question de Didier : « *est-ce qu'on peut figer le hors ligne qu'aux éléments nécessaires ?* »
Oui, et c'est le bon réflexe : plus la surface est petite, plus le risque l'est.

#### Ce qu'on peut ÉCRIRE hors ligne

| | Hors ligne | Motif |
|---|---|---|
| Saisie de l'EDL, photos, autosave | ✅ | c'est la raison d'être du chantier |
| Composition des pièces, entrée/sortie | ✅ | partie intégrante de l'EDL |
| **Signature de l'EDL — en présentiel** | ✅ | deux canvas + `saveEDL`, aucun appel réseau |
| **Signature du bail** | ❌ | **refusée hors ligne — cf. 3.1** |
| Signature **à distance** (bail ou EDL) | ❌ | le relais **est** le réseau, par nature |
| Tout le reste de l'app | ❌ | **grisé, avec la raison affichée** |

Rien d'autre n'a besoin d'écrire hors ligne : compteurs, clés, mobilier et détecteur de fumée
sont **déjà dans l'EDL**. Tout ce qui se constate debout y est.

#### Ce qu'on peut CONSULTER hors ligne

| Onglet | Hors ligne |
|---|---|
| État des lieux · Biens · Locataires · Baux | ✅ **ouverts**, estampillés « données du 19/08 à 08h12 » |
| Finances · Loyers · Quittances · Accueil/KPI | ❌ **fermés**, message « disponible dès que tu as du réseau » |

Motif du refus : ce sont des chiffres qui bougent avec les imports bancaires. **Un montant périmé
lu hors ligne, c'est une décision prise sur une donnée fausse** — et ça ne sert à rien dans un
appartement vide. Ce qui sert sur place (nom du locataire, téléphone, adresse, date de début,
composition du logement) reste accessible.

Bandeau permanent : « **Hors ligne — tes données du 19/08 à 08h12** ».
**Aucun bouton ne reste actif pour ne rien faire.**

### 3.1 La signature du bail hors ligne — REFUSÉE

**Décision de Didier, 20/08 :** « *on peut refuser le bail ! on a l'option d'envoi and co,
ce qui est pour moi suffisant.* »

Signer un bail hors ligne est **refusé en V1**. Le bouton est grisé avec sa raison, et l'app
renvoie vers ce qui existe déjà : **envoyer le bail pour signature à distance**, ou le signer
au retour, avec du réseau. Le bail n'a pas besoin d'être signé dans l'appartement vide.

**Ce que ça évite, et c'est la vraie raison :**

- Un bail signé est **immuable côté synchro** — `immutable: r => !!(r && r.signatures && r.signatures.locked)`
  (`store-sync.js:68`) : *« le moteur ne le ré-upserte/supprime JAMAIS (le trigger DB refuserait → conflit) »*.
- Un conflit sur un bail signé **n'a aucune porte de sortie** : ni « le serveur gagne »
  (`supabase-entry.js:681`), ni « garder les deux versions » comme pour l'EDL (§7) — deux baux
  signés pour un même logement, c'est juridiquement absurde.
- L'empreinte légale `bailContentHash` est figée au scellement. On ne l'expose pas à une
  resynchronisation hasardeuse pour un confort dont on peut se passer.

**Correction d'une affirmation faite plus tôt dans la revue.** Il avait été écrit que le PDF
du bail signé « disparaît sans un mot » hors ligne. **C'est faux** : `__immoCloudUpload` est
défini dès que l'entry a démarré, l'envoi échoue en renvoyant `null`, et
`_downloadSignedBailFallback` se déclenche bien (`index.html:6606`) — le PDF est téléchargé sur
l'appareil avec son avertissement (« *conserve ce fichier précieusement (preuve légale)* »,
`index.html:6597`). Le retour silencieux de `index.html:6603` ne concerne que le cas où le module
n'a pas chargé du tout. **Il n'y a donc aucun correctif à faire sur ce chemin**, et l'argument
qui plaidait pour la signature hors ligne tombe.

**Conséquence sur le périmètre** : la file d'envoi ne concerne que les **photos d'EDL**.
Le compteur « à l'abri » ne couvre pas de PDF de bail. Un module de conflit sur bail signé
n'entre pas dans ce chantier.

---

## 3bis. Le rechargement au défilement — BUG DE PRODUCTION (signalé par Didier le 20/08)

> « lors de mon dernier EDL, l'app se rafraîchissait dès que je faisais un défilement trop important
> (du haut vers le bas). Et je sortais de l'app. »

**Non soldé.** Cause trouvée.

### Le mécanisme

```
overscroll-behavior dans css/ et index.html  →  0 occurrence
```

Le **pull-to-refresh du navigateur est entièrement actif**. La modale EDL a un défilement imbriqué :
un `<div style="overflow-y:auto;flex:1">` (`index.html:3723`) à l'intérieur de `.ov` qui a lui-même
`overflow-y:auto` (`css/main.css:2406`).

Enchaînement : le défilement interne atteint son haut → le doigt continue vers le bas → **le
défilement se chaîne au parent puis au `body`** → le navigateur déclenche son rechargement de page.

Puis :

1. La page recharge → le boot-gate masque tout le body derrière l'overlay de connexion (`index.html:48`).
2. `getUser()` part sur le réseau (§3, verrou 2), puis l'hydratation Supabase — plusieurs secondes.
3. L'app revient **sur l'Accueil**. La modale EDL n'existe plus.
4. **Tout ce qui n'était pas enregistré est perdu** — c'est-à-dire tout, faute d'autosave.

Si le signal était faible dans l'appartement, `getUser()` échoue et on atterrit vraiment sur l'écran
de connexion : la variante exacte du symptôme décrit.

### Facteur aggravant, indépendant du geste

`_edlPreloadPhotos` charge **toutes** les photos de l'EDL en base64 dans `_photoCache`
(`index.html:30694`). Pour le F3 à 98 photos : ≈ **60 Mo de chaînes en mémoire JS**.
iOS Safari décharge un onglet sous pression mémoire — **même symptôme, sans aucun geste**.

### Le correctif

- `overscroll-behavior-y: contain` sur `.ov`, sur le défilement de la modale et sur `body`.
  **Une ligne CSS par endroit**, aucun risque de régression.
- L'**autosave** (lot 1) rend un rechargement **survivable**, quelle qu'en soit la cause :
  mémoire, appel entrant, mise à jour iOS, geste involontaire.
- Le préchargement des photos passe **à la demande** : seules les vignettes visibles sont montées
  en mémoire, pas les 98 d'un coup.

**Classé lot 0** : bug de production, il a coûté un EDL réel, le correctif tient en trois lignes.

---

## 3ter. Double-check du hors ligne — 13 failles (audit du 20/08)

Demande de Didier : « *je veux un double check sur le hors ligne (connexion, déconnexion,
rechargement et écrasement des données) — je veux que tu vérifies toutes les failles* ».

Chaque point ci-dessous a été vérifié dans le code, pas déduit du CDC. **Trois failles cassent
le mode hors ligne tel qu'il était spécifié en §3** — elles sont bloquantes pour le lot 4.

### 🔴 F1 — Le travail hors ligne est détruit à la reconnexion  *(invalide le §3 tel qu'écrit)*

Le miroir localStorage est **en écriture seule** en mode cloud. Les seuls lecteurs de `KEY` :
`initDB` (`index.html:5550`) qui rend `null` en boot cloud (`_CLOUD_BOOT ? null : …`), et une
vérification du dataset démo (`index.html:4218`). **Rien ne relit jamais le miroir.**

Séquence réelle : EDL hors ligne → fermeture de l'app → retour à la maison → réouverture **avec
réseau** → `getUser()` réussit → hydratation → `__immoSetDB(cloudDB)` remplace le DB en mémoire.
**L'EDL hors ligne n'a jamais existé.**

L'invariant « la file locale est poussée AVANT toute ré-hydratation » (§3) parlait du DB **en
mémoire**. App fermée entre-temps ⇒ plus de mémoire, seulement le miroir, que personne ne lit.

**Correctif obligatoire** : au démarrage EN LIGNE, si le miroir est taggé `'same'` ET porte des
écritures postérieures au dernier flush réussi → **charger le miroir en mémoire, le flusher, PUIS
hydrater**. Sans ça, tout le lot 4 est un trompe-l'œil.

### 🔴 F2 — La déconnexion détruit le travail hors ligne

`logout()` (`js/app/supabase-boot.js:40`) tente un flush ; hors ligne il échoue **toujours**, et le
code se contente d'un `console.warn` — son propre commentaire l'admet : « *la modif restée à quai
est perdue à la fermeture (pas de file persistée avant P2.3)* ». Puis `_teardownSession` purge le
miroir **inconditionnellement** (`js/app/supabase-entry.js:182`).

Les photos survivent en IndexedDB (la purge épargne les binaires sans `cloudKey`) mais deviennent
**orphelines** : plus aucun enregistrement ne les référence.

**Correctif** : refuser la déconnexion tant qu'il reste des écritures non synchronisées, en le disant.

### 🔴 F3 — `saveDB` n'écrit rien si `__immoSupabaseMode` n'est pas posé

Ordre des branches de `saveDB` : `__immoSupabaseMode` d'abord (écrit le miroir), **puis**
`_CLOUD_BOOT` qui sort en n'écrivant **rien**. Or le drapeau n'est posé qu'à
`js/app/supabase-entry.js:864`, dans `onLoggedIn`, après hydratation.

Le mode hors ligne doit le poser **avant tout `saveDB`**, sinon chaque autosave est un no-op et la
visite disparaît au premier rechargement, sans un message.

### 🟠 F4 — La bannière « session expirée » peut s'afficher hors ligne, et elle est fausse

`api.onAuthChange((session, evt) => { … if (evt === 'SIGNED_OUT' || !session) _sessionDead() })`
(`js/app/supabase-entry.js:801`). `_sessionDead()` pose un bandeau rouge **non fermable** :
« *Ta session a expiré : tes modifications ne sont plus enregistrées dans le cloud* » — **faux hors
ligne** (elles le sont, en local) — avec un bouton « Se reconnecter » qui fait `location.reload()`,
impasse sans réseau.

**Point rassurant, à PROUVER par un test réel** : supabase-js 2.110.2 embarque
`AuthRetryableFetchError` / `isAuthRetryableFetchError` — il distingue une panne réseau d'un jeton
refusé et devrait réessayer sans émettre `SIGNED_OUT`. **C'est la charnière de tout le mode hors
ligne** : si ce comportement n'est pas celui-là, le lot 4 ne tient pas.

### 🟠 F5 — Tempête de requêtes réseau hors ligne

Le backoff existe (2 s → 60 s, `js/core/store-sync.js:356`) mais il est **neutralisé** : la garde de
`js/app/supabase-entry.js:697` ne protège qu'un *retry* contre un timer plus proche. Un `markDirty`
frais — **donc chaque autosave** — efface le timer et replanifie à 800 ms.

Autosave toutes les 2 s pendant une heure hors ligne ≈ **1 800 requêtes en échec**, chacune devant
expirer. Batterie, et indicateur qui clignote entre « Enregistrement… » et « Hors ligne ».

### 🟠 F6 — L'autosave clone tout le DB toutes les 2 secondes

`_undoOnSaveDBSuccess` appelle `_undoSnapshot()` = **`structuredClone(DB)`** (`index.html:6274`) à
**chaque** `saveDB`, et la pile en conserve jusqu'à `UNDO_MAX = 20`.

DB réel ≈ 1 à 2 Mo (dernier export : 1 004 Ko) → **jusqu'à ~40 Mo retenus**, par-dessus les ~60 Mo
de `_photoCache` pour 98 photos. Sur téléphone, c'est l'onglet qui se fait tuer — **le symptôme
même du §3bis**. Effet de bord : les 20 emplacements se remplissent de « Modification » d'une seule
visite → **l'historique d'annulation utile est effacé**.

### 🟠 F7 — L'autosave noie la piste d'audit

`saveEDL` appelle `_auditLog('update','edl',…)` à chaque enregistrement. Plafond : 10 000 entrées,
élaguées à 5 000 (`_auditFlushPending`). Une heure de visite ≈ **1 800 entrées = 18 % du plafond**.
Dix visites le remplissent → **les vraies traces (signatures, suppressions) sont élaguées par le
bruit de l'EDL**. À ~300 octets pièce : jusqu'à 3 Mo dans un budget localStorage de 5 Mo.

### 🟠 F8 — L'échec d'écriture du miroir est avalé

`saveDB` attrape `QuotaExceededError`, affiche « ⚠️ Stockage plein. » et **renvoie `true` quand
même**. L'app croit avoir enregistré. Combiné à F7 : **perte silencieuse au rechargement**.

### 🟡 F9 — La fenêtre de 2 secondes
Photo prise puis app tuée avant l'autosave → photo en IndexedDB, référencée par rien. Orpheline à vie.

### 🟡 F10 — Le rideau de démarrage
`data-lpboot` masque tout sauf l'écran de connexion ; `_liftDriveGate()` n'est appelé que sur le
chemin overlay / `onLoggedIn` (`js/app/supabase-entry.js:95`). Le chemin hors ligne doit le lever,
sinon : app blanche.

### 🟡 F11 — `__immoSetDB` n'a aucun garde-fou
Il valide la **forme** de l'objet (`baux` + `logements`), puis `DB = cloudDB`. Rien ne l'empêche
d'écraser un travail local non synchronisé.

### 🟡 F12 — Le retour de visibilité
`REPULL_STALE_MS = 5 min` : un appel téléphonique pendant la visite arme un re-pull. Il est
correctement différé tant qu'une modale `.ov` est ouverte — mais il part **dès la fermeture de la
modale**, et si le flush donne un conflit, le chemin conflit re-hydrate **sans flusher**.
Cohérent seulement si §7 (« les deux versions vivent ») est implémenté.

### 🟡 F13 — Le tag du miroir en multi-espace
`classifyMirrorTag` compare à l'espace **propre primaire**, résolu par `resolveEspaces()` dont le
code avertit lui-même : « *1 espace aujourd'hui ; durcir (sélecteur d'espace explicite) avant le
vrai multi-espace* ». Si l'ordre de résolution change, le verdict passe à `'other-espace'` → **le
miroir est purgé au login** (`js/app/supabase-entry.js:820`), c'est-à-dire au moment précis du
retour en ligne avec l'EDL dedans.

### Conséquence sur le chantier

- **F1, F2, F3 sont bloquantes** : sans elles, le lot 4 ne tient pas. Elles y entrent.
- **F4 est une condition de faisabilité** : à prouver par un test avant d'écrire le lot 4.
- **F5, F6, F7, F8 sont des effets de bord de l'autosave (lot 1)** que le CDC n'avait pas instruits.
  Elles remontent dans le **lot 1**, pas dans le lot 4 : l'autosave ne peut pas être livré sans elles.
- F6 explique en partie le plantage au défilement du §3bis.

---

## 3quater. AMENDEMENT DIDIER du 20/08 — trois retours sur maquette, qui priment

> Retours donnés captures à l'appui après lecture de `edl-terrain.html`. **Ils priment sur les décisions
> correspondantes ci-dessous** : partout où le CDC les contredit, ce sont ces trois lignes qui font foi.

### A.1 · La barre de pièces défilante est REJETÉE sur téléphone
> « dans le mockup EDL la side bar n'est pas pratique sur téléphone ! il faut une autre proposition »

Le défaut est structurel, pas cosmétique : à **8 pièces**, la barre de chips oblige à un défilement
**horizontal** pour atteindre une pièce, les libellés sont tronqués par les bords, et on perd la notion
de « où j'en suis ». C'est un geste à deux mains, sur un écran qui doit s'utiliser d'une seule.
**Rappel du §bug de prod** : tout défilement horizontal ou imbriqué de plus est un risque en soi.

**Cible à mockuper (au volume réel, 8 pièces / 110 éléments), recommandation du pilotage :**
- l'en-tête porte **le nom de la pièce courante + « 3 / 8 »** ; **un appui dessus ouvre la liste
  complète des pièces** (feuille qui monte du bas, chaque pièce avec son avancement et ses écarts) ;
- **avancer / reculer se fait par le pied de page**, dans la zone du pouce, jamais par une barre en haut ;
- **zéro défilement horizontal**, aucune cible sous 44 px.
✅ **TRANCHÉ PAR DIDIER le 20/08 : c'est la VARIANTE C — le rail du pouce.**
`[←] [⤒ Cuisine · 3 / 8] [→]`, **collé en bas de l'écran** (sticky, ~64 px), mesuré 52×48 / 231×48 / 52×48.
- **reculer, sauter et avancer sont au même endroit**, dans la zone du pouce, et **ne sont jamais emportés par le défilement** — c'est ce qui manquait à la variante A, dont le déclencheur était en haut d'un écran de 812 px, donc hors de portée : le reproche exact fait à la barre de chips ;
- le bouton du milieu **ouvre la feuille des 8 pièces** (avancement + écarts, 8 lignes de 56 px, sans défilement) — on peut donc **sauter directement** à n'importe quelle pièce, jamais balayer les 7 autres ;
- **coût assumé et accepté** : le bouton « suivant » perd son libellé (flèche seule).
Variantes **A et B écartées** — elles restent dans la maquette pour mémoire, jamais à implémenter.
⚠️ Vigilance héritée du bug de prod : le rail est **sticky, pas un second conteneur de défilement**. La feuille qui monte ne doit ajouter **aucun** défilement imbriqué non borné — `overscroll-behavior` du lot 0 s'applique aussi à elle. PC et tablette gardent la barre en sommaire d'ancres :
le rejet ne concerne **que** le téléphone.

### A.2 · AUCUN montant dans l'EDL — l'argent est à part
> « on ne met pas d'€ dans EDL c'est à part. surtout que dans ton exemple on a des dégradations et tu dis
> qu'on rend toute la caution ! »

Le bloc « Ce que ça déclenche » affichait **« Dépôt de garantie 1 100,00 € »** à côté de dégradations
constatées — donc un chiffre qui laisse croire à une restitution intégrale alors que le constat dit
l'inverse. **Deux fautes en une** : de l'argent dans un document qui n'en porte pas, et un montant
contredit par le constat au-dessus de lui.

**Décision :**
- **aucun montant, aucun €, nulle part dans l'EDL** — ni le dépôt de garantie, ni les retenues, ni un
  quelconque solde. L'EDL **constate**, il ne chiffre pas. Le chiffrage vit dans la restitution du dépôt
  et le décompte, qui sont d'autres surfaces ;
- **ce qui reste** : le **délai de restitution (1 ou 2 mois)** avec sa raison (art. 22 loi 89-462), parce
  que c'est une **échéance**, pas une somme, et qu'elle découle directement du constat. Toujours lu de
  `_calculerDelaiRestitution` (`index.html:28034`), jamais recalculé ;
- **la passerelle vers le décompte et la restitution reste** (lot 7) : un lien, pas un chiffre.
Si un montant devait un jour apparaître, ce serait une décision à reprendre avec Didier, pas un effet de bord.

### A.3 · Pas de « ＋ » pour les observations — le champ est TOUJOURS ouvert
> « dans EDL il ne faut pas un + pour observations ! ça ajoute plein de clics énervants ! on en met partout
> des observations ! »

Usage réel mesuré : l'observation n'est **pas** l'exception, c'est le geste courant — sur l'EDL réel,
l'observation la plus longue fait 277 caractères et il y en a sur une grande partie des éléments saisis.
Un « ＋ » qui révèle le champ, c'est **un clic par élément**, debout, une main prise.

**Décision : le champ d'observation est visible et éditable d'emblée sur chaque élément.** Une seule
ligne au repos, qui **grandit à la saisie** (pas de hauteur fixe, pas de modale, pas de bouton pour ouvrir).

**Conséquence assumée sur la compaction** : la « carte repliée à 127 px » de §4 reposait sur la ligne
« ＋ Observation ／ 📷 Photo ». Elle **tombe** pour l'observation. À la place : champ d'une ligne toujours
présent, et **la hauteur réelle est à re-mesurer au volume réel** dans les nouvelles maquettes — on ne
troque pas un clic par élément contre quelques pixels. Le « 📷 Photo », lui, **reste un bouton** :
prendre une photo est un geste ponctuel, pas une saisie.

---

### A.2 bis · AUCUNE mention de la restitution du dépôt dans l'EDL — durcissement du 20/08
> « on enlève tous les commentaires de restitution de dépôt de garantie de l'EDL c'est dans l'app. là tu donnes des choses au locataire pour te faire taper dessus ! »

A.2 avait conservé le **délai de restitution (1 ou 2 mois)** au motif que c'est une échéance et non une somme. **C'était une erreur d'analyse, et Didier a raison.** Le raisonnement qui manquait : **l'EDL est un document SIGNÉ et REMIS AU LOCATAIRE.** Y écrire le délai, c'est remettre au locataire, de sa propre main, l'échéance qui **contraint le bailleur** — et la qualifier à chaud, le jour du constat, avant toute vérification. Un délai annoncé à 1 mois puis tenu à 2 devient une contradiction écrite et signée, opposable.

**Décision, sans exception :**
- **zéro mention** du dépôt de garantie, de sa restitution, de son délai ou de ses retenues **dans l'EDL** — ni à l'écran, ni dans le PDF, ni dans un récapitulatif de fin de parcours ;
- **le bloc « Ce que ça déclenche » disparaît entièrement.** Ce n'est plus « le bloc sans les € » : il n'existe plus ;
- **ces informations vivent dans l'app, côté bailleur** : écran de restitution du dépôt, décompte, assistant Départ. C'est là que `_calculerDelaiRestitution` (`index.html:28034`) est lu, et nulle part ailleurs ;
- **la passerelle reste**, mais c'est un **déplacement vers un écran de l'app**, jamais une information imprimée dans le document. Elle ne doit pas apparaître sur le PDF remis.

**Règle générale qui en découle, opposable à tout le chantier** : avant d'ajouter quoi que ce soit à l'EDL, se demander *« est-ce que je remets ça au locataire, signé ? »*. L'EDL **constate l'état du logement**. Tout ce qui relève de la **conséquence** — argent, délais, obligations du bailleur — est une affaire de l'app, pas du document.

### A.0 · CORRECTION DE MÉTHODE — l'existant n'avait pas été lu (relevé par Didier, 20/08)
> « et tu as regardé ce qui existe déjà ? »

**Non. Ni la session de maquette, ni le pilotage.** Vérification faite après coup dans le code de prod — et elle change la nature de deux des trois retours :

| Ce que la maquette « proposait » | Ce que la PROD fait déjà |
|---|---|
| Une vue tableau dense sur PC (A.4) | **Elle existe.** `_edlPieceHTML` (`index.html:31819`) rend `<table class="tbl">` avec **Élément · État · Observations · 📷 · ✕**, et **7 colonnes en mode sortie** (État entrée · Obs. entrée · 📷 Entrée · État sortie · Obs. sortie · 📷 Sortie) |
| Un champ d'observation toujours ouvert (A.3) | **Il l'est déjà.** `_edlElemRow` (`index.html:31798`) rend un `<textarea>` éditable directement, `min-height:26px`, `resize:vertical` |
| Des cartes sur téléphone | **Elles existent déjà** : `css/main.css` (~3060-3120) convertit les tableaux EDL en cartes sous le point de rupture, avec pied collant et boutons à 44 px |

**Conclusion, qui vaut correction de cap :** les « bulles sur PC » et le « ＋ Observation » **n'existent pas dans l'app** — ce sont des inventions de la maquette, qui a redessiné par-dessus un existant déjà correct. Les retours A.3 et A.4 de Didier ne demandent donc pas de construire : ils demandent de **ne pas détruire**.

**A.3 et A.4 se relisent ainsi :**
- **A.4 → le tableau PC est CONSERVÉ tel quel** ; le chantier n'a rien à bâtir dessus. Améliorations admissibles et bornées : l'en-tête de tableau collant par pièce, le sommaire d'ancres qui passe à la ligne, l'ordre de tabulation, les couleurs d'état aux jetons sémantiques. **Aucune réécriture du rendu.**
- **A.3 → le `<textarea>` existant est CONSERVÉ**, avec pour seul ajout qu'il grandisse à la saisie. Il est **interdit** d'introduire un bouton qui le révèle : ce serait une **régression** inventée par la maquette.
- **Le vrai travail de conception restant** est ailleurs, et il est réel : le **parcours une-pièce-à-la-fois sur téléphone** avec le rail C, et surtout **le mode SORTIE à 7 colonnes sur téléphone** — comparer entrée et sortie élément par élément sur 375 px est le seul écran que l'existant ne résout pas.

**Règle rappelée, non négociable** (`feedback_ground_in_real_app`, `feedback_dry_reuse_no_copy`) : **on lit l'implémentation réelle AVANT de mocker une feature existante.** Une maquette qui redécrit ce qui marche déjà fait perdre un tour à tout le monde — et pire, elle fait valider des régressions.

---

### A.4 · Le PC n'est PAS le téléphone en plus large — deux usages, deux écrans
> « vraiment pas convaincu des bulles pour le PC ! on doit bien distinguer utilisation PC et téléphone / tablette ! »

Les maquettes rendaient les éléments en **cartes** (« bulles ») sur les trois formats, en changeant seulement le nombre de colonnes. C'est une grammaire **mobile** — conçue pour le pouce et le défilement vertical — posée sur un écran de bureau où elle **coûte** : chaque carte répète son cadre, ses marges et ses boutons, donc peu d'éléments à l'écran, aucun alignement d'une ligne à l'autre, et l'œil ne peut plus balayer une colonne d'états pour repérer ce qui manque.

**Les deux usages sont différents, et c'est le CDC lui-même qui le dit** : le téléphone, c'est **la visite** — debout, une main, une pièce à la fois. Le PC, c'est **la préparation et la relecture** — assis, au clavier, vue d'ensemble, on compare et on corrige.

**Décision :**
- **PC (≥ 1024) : une VUE TABLEAU dense**, une ligne par élément, colonnes alignées (élément · état · observation · photos), lisible en balayage vertical, navigation **au clavier** (tabulation d'un champ au suivant), et **toutes les pièces** accessibles par le sommaire d'ancres. C'est aussi la forme d'un EDL tel qu'il s'imprime et se relit ;
- **téléphone ET tablette : les cartes**, une pièce à la fois, avec la navigation retenue en A.1. Didier range explicitement la tablette **avec** le téléphone : elle se tient en main sur le terrain ;
- **une seule source de données, deux rendus.** Pas de second modèle, pas de duplication de logique : la même structure d'éléments rendue de deux façons, comme le fait déjà le CSS existant de conversion tableau↔cartes (`css/main.css:2966`, `:3001`, `:3070`) — **qui est à réutiliser, pas à refaire** ;
- **à mockuper et à mesurer** au volume réel (110 éléments) : combien d'éléments tiennent à l'écran en tableau contre en cartes, sur un écran PC de 900 px de haut.

---

### A.5 · LE MÉNAGE DU MODÈLE — tranché par Didier le 20/08

Le modèle `EDL_TPL` (`index.html:30526`) compte **127 éléments sur 7 pièces**. Extrait et relu ligne par ligne avec Didier. **Ce qu'il garde est aussi important que ce qu'il retire** — les deux sont gravés ici.

#### Ce qu'il GARDE (propositions du pilotage ÉCARTÉES)
- **« Extérieurs / Communs » reste entièrement** (11 éléments), **malgré 0 renseigné** sur l'EDL réel. Ma proposition de ne plus la créer d'office est **rejetée**.
- **« Autres observations » reste** dans les 7 pièces : *« c'est un champ libre »*. Ce n'est pas un doublon du champ d'observation par élément — c'est la note de la pièce.
- **« Prise Internet (RJ45) » reste** dans les 4 pièces.
- **« Réfrigérateur » et « Lave-vaisselle » restent** en cuisine.

#### Ce qui est REGROUPÉ ou RETIRÉ — **17 lignes**
| Décision | Portée | Lignes |
|---|---|---|
| **Porte et clé/poignée = UNE seule ligne**, partout | les 6 pièces intérieures ; l'entrée passe de **4 lignes de porte à 1** | −8 |
| **Thermostat fusionné avec la ligne Radiateur** | Entrée, Séjour, Cuisine, Chambre | −4 |
| **Sangle volet fusionnée avec la ligne Volet** | Séjour, Chambre | −2 |
| **VMC / Aération seulement en Cuisine, Salle de bain, WC** | retirée d'Entrée, Séjour, Chambre | −3 |

**Résultat : 127 → 109 éléments** (110 après regroupements, moins la ligne DAAF ci-dessous). Par pièce : Entrée/Couloir **12** · Séjour/Salon **13** · Cuisine **25** · WC **15** · Salle de bain **20** · Chambre **14** · Extérieurs/Communs **10**.

#### Deux points d'exécution, non négociables
1. **Le modèle ne vaut que pour les NOUVEAUX EDL.** Les EDL existants gardent leurs éléments tels quels — ils sont signés ou en cours, **on n'y touche pas**, et surtout on ne fusionne **jamais** rétroactivement deux lignes qui portent chacune leur état, leur observation et leurs photos. Aucune migration de données.
2. **Un regroupement n'est pas une suppression** : la ligne fusionnée doit **nommer les deux objets** (ex. « Porte, clé et poignée », « Radiateur et thermostat », « Volet, sangle / chaîne ») pour que le constat reste opposable : on ne doit pas pouvoir dire plus tard que la poignée n'avait pas été constatée.

#### ✅ DÉTECTEUR DE FUMÉE — tranché : la ligne d'« Extérieurs » est RETIRÉE
> « on retire le detecteur de fumée d'extérieur »

La ligne « Détecteur de fumée (DAAF) » de « Extérieurs / Communs » (`index.html:30596`) **disparaît du modèle**. La **section dédiée** reste seule à porter le constat (`index.html:3809-3836`, trois états : présent et fonctionnel / présent mais à vérifier / absent).

Pourquoi ce point méritait d'être tranché et pas laissé : deux réponses possibles au même constat, sur un document **signé**, dont l'absence expose le bailleur à des **sanctions pénales** (loi 2010-238). En cas d'incendie, une ligne « DAAF » laissée vide au milieu du garage et des poubelles, à côté d'une section qui dit « présent et fonctionnel », est une contradiction écrite exploitable contre lui.

**Conséquences :** « Extérieurs / Communs » passe de **11 à 10** éléments, et le modèle de **110 à 109**. La règle d'exécution 1 s'applique : **les EDL existants ne sont pas touchés** — si un ancien EDL porte cette ligne renseignée, elle reste.

---

## A.6 · ÉCRAN DE SORTIE + VISIONNEUSE PHOTO — VALIDÉ EN PRINCIPE par Didier le 25/08

> « je suis ok sur le principe » (le mockup `mockups/EDL-TERRAIN/edl-global.html` avait des bugs de rendu ; il a servi à trancher, il ne fait PAS foi à la ligne près — c'est ce CDC qui fait foi).

### L'écran de sortie (le seul que l'app ne résout pas aujourd'hui)
- **PC et tablette** : le tableau **7 colonnes** existant (`_edlPieceHTML`, mode sortie) est **conservé** — élément · état entrée · obs. entrée · photos entrée | état sortie · obs. sortie · photos sortie. Il **défile dans son propre conteneur** (`overflow-x:auto`) si l'écran est étroit : **jamais la page**. Ajout : une **colonne verdict**.
- **Téléphone** : les 7 colonnes ne tiennent pas → **deux colonnes côte à côte**, entrée à gauche (grise, verrouillée, elle est signée), sortie à droite (éditable). L'état d'entrée est **une pastille en lecture seule**, pas les 5 lettres. Les 5 boutons d'état de sortie passent sur 2 rangs pour tenir la demi-largeur, cible tactile ≥ 44 px.
- **Le verdict est DÉDUIT, jamais saisi** : rien de constaté → *à constater* (ambre) ; même état → *conforme* ; état différent → *écart* (rouge). L'état de sortie reste **vide tant que rien n'est constaté** : on ne présume jamais « conforme ». **À trancher au chantier** : une observation de sortie non vide sans changement d'état déclenche-t-elle un avertissement « l'état est-il toujours le même ? » (reco pilotage : oui, prévenir sans décider).

### La visionneuse photo (entrée vs sortie)
- Les prises de vue d'entrée et de sortie **ne sont pas cadrées pareil** : **aucune superposition, aucun rideau avant/après** (rejeté en séance — c'était un trompe-l'œil). On montre les deux, on passe de l'une à l'autre.
- La grande image s'affiche **EN ENTIER, portrait comme paysage** (`contain`, fond neutre) — **jamais rognée**. C'est le retour explicite du 25/08 : le cadre était bloqué en 4/3 `cover` et coupait les photos verticales.
- **PC/tablette** : les deux colonnes (entrée | sortie), une vignette change la grande image de sa colonne. **Téléphone** : une grande image, la **pellicule des deux séries au-dessus** (entrée nommée, sortie nommée), on tape pour passer de l'une à l'autre. Les vignettes de liste restent carrées (`cover`) ; **le clic ouvre toujours l'entier**. Au-delà de 2–3 vignettes, un « +N » ouvre la série complète (un élément réel porte jusqu'à 8 photos).
- **Aucun montant, aucune mention de restitution du DG** nulle part (cf §A.2 bis, non négociable).

### Invariant testable ajouté
Le verdict d'un élément de sortie **égale toujours** `verdictDe(étatEntrée, étatSortie)` — il n'est jamais stocké ni saisi. Une photo portrait rend une image de hauteur > largeur **entièrement visible** (pas de recadrage). La page ne défile jamais horizontalement sur aucun format.

---

## 4. L'ergonomie à une main — décision B.4

**Décision : sur téléphone, une pièce à l'écran à la fois. PC et tablette gardent la vue complète.**

### Ce qui change sur téléphone (< 768 px)
- **Une seule pièce affichée** : 15 éléments au lieu de 110.
- **Barre de pièces** défilante en haut, chaque pièce portant sa progression (« Cuisine 12/15 »),
  avec la pièce courante toujours amenée dans le cadre. Barre fine dessous = progression globale.
- **Ligne de confiance** dans l'en-tête : « Enregistré à 14h32 » + « 34/77 photos à l'abri ».
- **Pied de page à deux boutons** : « ← » et « Pièce suivante · <nom> ».
- **La carte d'élément se replie** quand il n'y a ni observation ni photo : nom + états + une ligne
  fine « ＋ Observation   📷 Photo ». **127 px au lieu de 183 px**, mesuré sur les données réelles.
- **L'ordre du parcours suit la visite** : composition (si besoin) → **pièces** → relevés et clés →
  sécurité incendie → signatures. Chaque étape porte son état de remplissage et reste atteignable.

### Ce qui disparaît du terrain
Trois des quatre boutons du pied de page (`index.html:4055-3759`), qui prennent chacun une ligne
entière sous 480 px (`css/main.css:3201`) — soit **~190 px sur 812**, presque un quart de l'écran :
- **Annuler** → supprimé (cf. §1).
- **📥 Télécharger PDF** et **☁️ Enregistrer le PDF** → retirés du terrain. Ils **existent déjà**
  sur chaque ligne de la liste des EDL (`index.html:31022-29866`) : les dupliquer coûtait un quart
  de l'écran de visite pour des actions de bureau.

### Ce qui ne change pas
- Les 5 boutons d'état à 42 px de large minimum (`css/main.css:3113`) — cible tactile correcte.
- **Tout le travail CSS existant** de conversion des tableaux en cartes (compteurs `css/main.css:2966`,
  clés `:3001`, pièces `:3070`) est **conservé et replacé dans le parcours**, jamais refait.

### Sur tablette (768) et PC (1280)
Toutes les pièces affichées, en **2 et 3 colonnes**, la barre de pièces servant de sommaire d'ancres.
Le mode pièce-par-pièce ne s'active **que sous 768 px**. Le pied de page garde ses actions de bureau.

---

## 5. La reprise des pièces du logement — décision B.5

**Décision : étape de composition d'abord, puis écriture retour vers le bien.**

### Le sujet posé par le brief n'existe plus
L'écart de vocabulaire `DEFAULT_PIECES` ⇄ EDL est **résolu**. `js/core/biens-pieces.js` n'écrit
**aucun libellé** : il dérive le kit de `EDL_TPL`/`EDL_EXTRA` à l'exécution (`biens-pieces.js:46`),
et `__tests__/helpers/biens-pieces.test.js` verrouille l'absence de divergence. `_edlPrefill` charge
déjà `log.edlTemplate` quand l'EDL est vierge (`index.html:31186`). **Rien à décider.**

### La contradiction réelle
Deux écrans se contredisent pour la même situation « le bien n'a pas de liste » :
- la fiche du bien laisse la liste **vide** et propose un bouton pour charger le kit (`index.html:42364`) ;
- l'EDL **déverse les 127 éléments génériques** sans rien demander (`index.html:31039`).

### La reprise Biens → EDL : elle marche DÉJÀ (question de Didier, 20/08)

« *On est d'accord que si dans Biens on a complété la liste, elle est reprise dans EDL ?* » — **Oui**,
et ce n'est pas à construire. Chaîne vérifiée sur le fichier réel :

1. `openNewEDL()` (`index.html:31031`) remplit d'abord `_edlP` avec `EDL_TPL` — la structure
   générique — **avant** que le logement soit choisi.
2. Choisir le logement déclenche `onEDLLogChange()` → `_edlPrefill(ref, false)` (`index.html:31186`).
3. `_edlPrefill` appelle `loadLogEDLTemplate(ref)` **si** l'EDL est encore vierge :
   `!alreadyFilled && _tpl.pieces.length && !_edlAUneSaisie()`.
4. `loadLogEDLTemplate` (`index.html:41310`) **remplace intégralement** `_edlP`
   (`_edlP.length = 0; _edlP.push(...tpl.pieces)`) — et reprend aussi **les clés** (`tpl.cles`).

**« Vierge » ne veut pas dire « vide ».** `_edlAUneSaisie()` (`index.html:31170`) ne regarde que les
**états, observations et photos** — la simple présence des 127 lignes génériques ne compte pas.
Sur un EDL neuf le prédicat est donc faux, et la liste du bien **écrase** la générique. C'est le
comportement voulu ; il protège aussi contre l'écrasement d'une saisie déjà commencée.

**Le détecteur de fumée est préservé.** « Extérieurs / Communs » n'est pas une pièce du logement
(`SECTIONS_NON_PIECES`) : `loadLogEDLTemplate` la **ré-ajoute depuis `EDL_TPL`** si le template du
bien ne la porte pas, avec un anti-doublon sur forme normalisée (casse, accents, séparateurs) —
parce que les noms de pièces sont éditables dans l'EDL puis re-sauvables en template, et que deux
sections DAAF aux états contradictoires rendraient l'EDL inopposable. Repli **fail-closed** : le
code ne dépend pas de `window.BiensPieces`, un module absent ne peut pas faire partir un état des
lieux sans sa ligne détecteur de fumée.

Le second point d'entrée, `openNewEDLForLog` (`index.html:41202`), fait la même chose directement.

**Ce que le chantier ajoute** ne remplace donc rien de tout ça : il traite **le seul cas non couvert**,
celui du bien qui n'a **aucune** liste — aujourd'hui les 127 éléments génériques sont déversés sans
rien demander.

### Ce qui change
- Si le bien n'a pas de liste, la première étape du parcours EDL est
  « **De quoi se compose ce logement ?** » — **le même écran que la fiche du bien, réutilisé tel quel**
  (`_logPiecesInit`, `index.html:42355`), pré-rempli du kit à titre de proposition.
  On compose en 30 secondes assis, pas en élaguant 127 lignes debout.
- Au **premier enregistrement**, si le bien n'avait rien, l'EDL **écrit sa structure** dans
  `log.edlTemplate` — silencieusement. Le deuxième EDL du même bien et la clause
  « désignation des pièces » du bail la retrouvent sans rien redemander.
- **Jamais par-dessus une liste existante.** Le geste manuel avec confirmation
  (`saveLogEDLTemplate`, `index.html:41258`) reste la seule voie de remplacement.

### Ce qui ne change pas
« Extérieurs / Communs » n'est **pas** une pièce du logement (`SECTIONS_NON_PIECES`,
`biens-pieces.js:27`) : c'est la section où se constate le détecteur de fumée. L'EDL continue
de l'ajouter lui-même. **La perdre serait une régression réglementaire.**

---

## 6. Entrée / sortie — décision B.6

**Décision : l'entrée se charge d'office, l'écart se voit, la conséquence s'affiche.**

### Ce qui existe et qu'on garde
`edlLoadRef` (`index.html:31511`) reprend états, observations, photos et clés dans les deux sens,
en marquant la provenance des photos (`_source`, `_sourceDate`, badge bleu/orange, `index.html:31697`).
La mécanique est bonne. **On ne la réécrit pas.**

### Ce qui change
- **Le report devient automatique.** Choisir « Sortie » sur un logement qui a un EDL d'entrée le charge.
  Le bouton facultatif « 📥 EDL entrée » disparaît. S'il n'existe aucun EDL d'entrée, **l'app le dit
  clairement avant de continuer**, au lieu de laisser croire à une comparaison.
- **L'état de sortie reste vide.** On ne présume jamais un constat : un élément non visité doit
  rester « à constater », jamais « conforme à l'entrée ». Le document est contradictoire et signé.
- **Un geste par pièce** : « Constater les N restants conformes à l'entrée » — la vitesse sans la présomption.
- **Trois états visibles** par élément : *à constater* (ambre), *conforme* (atténué), *écart* (rouge,
  badge « ÉCART »). Chaque pièce compte ses écarts dans la barre de pièces.
- **La conséquence s'affiche dans l'EDL.** En fin de parcours de sortie : éléments constatés,
  conformes, **dégradations retenues**, et le **délai de restitution du dépôt** (1 ou 2 mois) avec sa
  raison (art. 22 loi 89-462). Le calcul reste celui de `_calculerDelaiRestitution`
  (`index.html:28034`) — **on l'affiche, on ne le réécrit pas**.

### Le piège fermé
Une sortie enregistrée sans entrée chargée n'a aucun état d'entrée → `_calculerDelaiRestitution`
ne trouve aucune dégradation et annonce **1 mois au lieu de 2** (`index.html:28040`).
**Un oubli de clic déplaçait une échéance légale, en silence.**

### Jamais éprouvé
Les 4 EDL réels sont tous des **entrées**. Le mode sortie n'a jamais tourné sur des données réelles :
le smoke devra en produire un.

---

## 7. Deux appareils — décision du 20/08

**Question de Didier :** « si j'utilise une tablette sans 5G, je me connecte à la maison avant de partir,
je fais l'EDL hors ligne, en rentrant ça charge ? » · « est-ce qu'on ne peut pas tomber sur des problèmes
de versionnage ? » · « si je me connecte sur le PC avec la tablette qui a l'EDL, il se passe quoi ? »
« **on a déjà eu ce souci de gestion de version entre les appareils !** »

### 7.1 Le scénario tablette : oui, avec une nuance à énoncer

Connexion à la maison → visite hors ligne → retour. **Ça remonte, mais pas tout seul :**
il faut **rouvrir Propryo une fois rentré, sur le wifi**. Il n'y a pas de synchronisation en
arrière-plan et il ne peut pas y en avoir — **iOS ne supporte pas la Background Sync**.

La discipline est donc : rentré → ouvrir l'app → attendre « **77/77 photos à l'abri** ».
Le compteur du §2 est exactement l'indicateur de ce moment-là.

Côté jeton : le jeton d'accès expire en une heure, mais le **jeton de rafraîchissement** vit
bien plus longtemps et se renouvelle au retour du réseau. Ce n'est pas un point de blocage.

### 7.2 Ce que fait l'app aujourd'hui sur un conflit de version

```
js/app/supabase-entry.js:681
if (s && s.conflicts && s.conflicts.length) _repullCloud({ flushFirst: false, banner: true })
```

Commentaire du chantier de juillet, verbatim :

> « Un conflit de version = notre baseline est PÉRIMÉE (autre appareil / associé) […]
> **On re-hydrate TOUT (serveur gagne)**, on re-render, et la bannière avertit que la modif
> locale doit être revérifiée. »

Message affiché : *« Données actualisées — revérifie ta modif : une modification concurrente
a été conservée à ta place. »*

**Traduit : le serveur gagne, la saisie locale est écrasée, et on invite l'utilisateur à
« revérifier ».** Défendable pour une modification de 30 secondes sur un loyer.
**Inacceptable pour une heure de terrain — 110 éléments, 77 photos.**

### 7.3 Où le risque se trouve réellement

Un EDL **créé** hors ligne reçoit un identifiant local neuf (`nid()`, `index.html`) dont dérive
l'uuid de ligne (`detUuid('edl', id)`, `store-mapping.js:144`). Aucune ligne correspondante côté
serveur → l'écriture est un **INSERT**, et **un INSERT ne peut pas entrer en conflit**
(`store-supabase.js:186`). **Le cas le plus fréquent est déjà sûr.**

Les trois situations réelles, dans l'ordre de probabilité :

| # | Situation | Aujourd'hui |
|---|---|---|
| **①** | L'EDL de la tablette n'est pas monté, le PC ne le voit pas → **on le recrée** | **Doublon**, rien ne l'empêche |
| **②** | Le même EDL est ouvert sur deux appareils | Rien ne le signale |
| **③** | Le même EDL est **modifié** des deux côtés | **Le serveur écrase la tablette** |

Ouvrir simplement Propryo sur le PC pendant que la tablette détient un EDL non synchronisé
**ne casse rien** : le PC ne voit pas cet EDL, il n'est pas sur le serveur. Aucun conflit.

### 7.4 Ce qui est retenu

**① Le doublon — un avertissement à la création.**
Créer un EDL alors qu'il en existe déjà un pour **ce logement, ce type et cette date** déclenche
un avertissement nommant l'appareil et l'heure : « commencé sur la tablette à 14h32, pas encore
remonté ». Deux issues : attendre la synchronisation, ou créer quand même en connaissance de cause.

**② Ouvert ailleurs — annoncé, ouvert en lecture seule par défaut.**
Un EDL non signé porte l'appareil et l'heure de sa dernière écriture. Les autres appareils
l'ouvrent en **lecture seule**, avec un bouton **« Reprendre ici quand même »**.
**Le verrou n'est jamais bloquant** : tablette perdue, batterie morte, envie de finir au calme —
on peut toujours reprendre, on est simplement prévenu.

**③ Conflit réel — les deux versions vivent.**
Sur conflit de version d'un enregistrement `edl`, la règle « le serveur gagne » **ne s'applique
plus** : la version locale est **conservée comme une seconde ligne** de la liste, nommée
« *Ferrette-101 — version tablette du 20/08 16h12* ». La version serveur est acceptée normalement.
L'utilisateur compare deux lignes (« 110 éléments · 77 photos » vs « 96 éléments · 61 photos »),
garde celle qu'il veut, supprime l'autre.

**Aucune fusion automatique.** Fusionner deux saisies de 110 éléments donnerait un résultat faux
une fois sur deux, et **personne ne pourrait le vérifier** — sur un document contradictoire signé
par le locataire, c'est exclu.

### 7.5 Ce qui ne change pas

La règle « **le serveur gagne + bannière** » reste **inchangée pour toutes les autres collections**
(loyers, mouvements, baux, quittances…) : une modification de 30 secondes ne justifie pas un doublon.
Le traitement décrit ici ne concerne **que `DB.edl`**, parce qu'un état des lieux est **une heure
de terrain irremplaçable**.

La réadoption D1b de `store-sync.js:173` reste le filet en amont, inchangée.

---

## 7bis. Audit du parcours complet — entrée dans le logement → sortie du locataire

Demande de Didier (20/08) : auditer **tout le process**, de la création du bien jusqu'à la sortie
effective. Onze trous, vérifiés dans le code. **Deux sont juridiques.**

| # | Étape | Trou | Gravité |
|---|---|---|---|
| P1 | Pré-remplissage | Changer de logement garde la structure du bien précédent | 🔴 |
| P2 | Pré-remplissage | Rien ne distingue « préparé » de « visite en cours » | 🟡 |
| P3 | Saisie téléphone | iOS zoome à chaque focus (champs < 16 px) | 🔴 |
| P4 | Saisie téléphone | Clavier alphabétique pour les relevés de compteurs | 🔴 |
| P5 | Saisie téléphone | Le pied de page collant passe sous le clavier | 🟠 |
| P6 | Signature | **2 zones de signature seulement** — 2 locataires ne peuvent pas signer | 🔴 juridique |
| P7 | Signature | Aucun récapitulatif ni contrôle de complétude avant de signer | 🔴 juridique |
| P8 | Correction | La réinitialisation détruit `edlSnapshot` et ne laisse aucune trace | 🔴 juridique |
| P9 | Sortie | Le délai de restitution lit le **premier** EDL de sortie, pas le plus récent | 🔴 |
| P10 | Sortie | L'EDL de sortie ne renvoie ni au décompte ni à la restitution du dépôt | 🟡 |
| P11 | Ouverture | Toutes les photos sont montées en mémoire d'un coup | 🟡 |

### 🔴 P1 — Changer de logement sur un EDL pré-rempli garde la mauvaise structure

`onEDLLogChange()` = `_edlPrefill(v('edl-log'), false)` (`index.html:31479`). `_edlPrefill` ne
recharge le template **que si** `!_edlAUneSaisie()`. Dès qu'un seul état est saisi, la condition est
fausse : on change de logement, l'en-tête affiche le nouveau bien, **les pièces restent celles de
l'ancien**. Silencieux, et l'EDL peut partir signé avec la mauvaise composition.

**Correctif** : au changement de logement sur un EDL portant une saisie, **demander** — recharger la
structure du nouveau bien (en perdant la saisie) ou garder la saisie (en assumant la structure).
Jamais un choix implicite.

### 🟡 P2 — « Préparé » n'est pas « en cours »

Avec l'autosave, un EDL pré-rempli à la maison est une ligne comme une autre. Le marqueur
« Brouillon » du §1 le couvre, mais doit dire **lequel des deux** : préparé à l'avance, ou visite
en cours sur tel appareil (§7).

### 🔴 P3 — iOS zoome à chaque champ touché

`.inp` est à **13,5 px** (`css/main.css:2241`) ; le CSS mobile monte les noms d'éléments à 15 px et
les observations à 14 px — **toujours sous 16 px**. Safari iOS zoome sur tout champ sous 16 px, et
le `viewport` ne porte aucun `maximum-scale` (`index.html:5`). Sur 110 éléments : un zoom et un
dézoom manuel **à chaque saisie**. Probablement la gêne la plus continue du terrain.

**Correctif** : 16 px minimum sur tout champ saisissable de l'EDL en dessous de 768 px.
**Ne pas** utiliser `maximum-scale=1` : ça réglerait le zoom au prix de l'accessibilité (pincement
désactivé pour tout le monde).

### 🔴 P4 — Clavier alphabétique pour les relevés

`inputmode` et `pattern` : **0 occurrence** dans toute la modale EDL. Les relevés sont de simples
`<input class="inp">` sans `type` (`index.html:3861`, `:3877`, `:3891`).

**Correctif** : `inputmode="numeric"` (ou `decimal`) sur relevés, index, quantités de clés et
surfaces. Pas `type="number"` : il ajoute des flèches, casse la saisie décimale selon la locale et
avale les zéros de tête d'un numéro de compteur.

### 🟠 P5 — Le pied de page collant passe sous le clavier

`.m-foot` est en `position:sticky;bottom:0`. iOS ne redimensionne pas le viewport de mise en page à
l'ouverture du clavier : un élément collant en bas se retrouve **derrière le clavier**.

**Correctif** : la barre du bas du lot 5 suit le **visual viewport**, pas le bas de page.

### 🔴 P6 — Deux zones de signature, deux locataires  *(juridique)*

`edl-sig-bailleur` et `edl-sig-locataire` (`index.html:4041`, `:4046`) — **et rien d'autre dans tout
le code**. Or Ferrette-101 a **deux locataires** : « Elise ARSLAN, Nicolas HARNIST ». **L'un des deux
ne peut pas signer.**

Le **bail**, lui, gère N signataires avec une matrice présentiel/distant complète
(`_bailBailleurSigners`, `bail.locataires[i]`, `index.html:7996`). L'EDL est resté à deux cases.
L'article 3-2 de la loi 89-462 veut un état des lieux « établi contradictoirement et signé **par les
parties** » — au pluriel.

**Correctif** : N zones de signature, dérivées des **mêmes** signataires que le bail
(règle DRY : on réutilise `bail-signataires`, on ne recopie pas la matrice).

### 🔴 P7 — Aucun récapitulatif avant de signer  *(juridique)*

`saveEDL` pose `signedAt` dès que les deux canvas portent de l'encre (`index.html:33311`). **Aucune
vérification de complétude.** Sur Ferrette-101, **20 éléments sur 110 n'ont aucun état** — dont les
11 d'« Extérieurs / Communs ». Ils partent dans le PDF signé en cases vides.

**Correctif** : un écran de récapitulatif **avant** les signatures — pièces parcourues, éléments
sans état, photos non montées, compteurs manquants, détecteur de fumée non constaté. Il **avertit**,
il ne bloque pas (règle du projet : avertir sans bloquer), mais on ne signe plus à l'aveugle.

### 🔴 P8 — La réinitialisation détruit la preuve, sans trace  *(juridique)*

`_edlResetSignatureUI` supprime `signedAt` **et `edlSnapshot`** — le cliché légal de ce qui a été
signé — puis met les signatures à `null`. Si le locataire conteste, **on ne peut plus prouver ce
qu'il avait signé**. Et la fonction appelle `saveDB()` **sans aucun `_auditLog`** : l'action la plus
sensible de l'EDL est la seule sans trace, alors qu'une simple modification en laisse une.

**Correctif** : `edlSnapshot` est **archivé**, jamais supprimé (version signée conservée à côté,
horodatée) ; et la réinitialisation écrit une entrée d'audit dédiée.

### 🔴 P9 — Le délai de restitution lit le mauvais EDL de sortie

```
index.html:28038   const edlSortie = sourceEdls.find(e => … e.type === 'Sortie')
index.html:26517   const edlSortie = (DB.edl||[]).find(e => … e.type === 'Sortie') || null
```

**Aucun tri.** L'ordre du tableau = l'ordre d'insertion → **le plus ancien gagne**. Sur un logement
reloué, le délai de restitution du locataire actuel est calculé sur l'EDL de sortie **du locataire
précédent**. Et `edlLoadRef` trie, lui, par date décroissante (`index.html:31514`) : **deux lectures
contradictoires de la même donnée dans la même app**. Le doublon du §7 déclenche exactement ce cas.

**Correctif** : un résolveur unique « l'EDL de sortie qui fait foi pour ce bail » — le plus récent
**dans la fenêtre du bail concerné**, pas le premier trouvé. Source unique, comme `duMois` pour les loyers.

### 🟡 P10 — L'EDL de sortie ne mène nulle part
Une fois signé, rien à l'écran ne renvoie vers le décompte de départ ni vers la restitution du
dépôt. Le lien existe (`_dgOpenRestitution`) mais part d'une alerte d'accueil, pas de l'endroit où
le constat vient d'être fait.

### 🟡 P11 — Toutes les photos montées d'un coup
`_edlPreloadPhotos` (`index.html:30694`) charge les 77 à 98 photos en base64 à l'ouverture. Sur
place, ouvrir l'EDL de sortie qui reprend l'entrée, c'est ~60 Mo avant d'avoir touché un champ.
Même correctif que le lot 0 (chargement à la demande) — c'est ici qu'il fait la différence.

---

## 7ter. Conformité à la charte Propryo — logo, couleurs, police

Question de Didier (20/08) : « *est-ce que l'interface et le document PDF respectent les règles
Propryo avec logo, couleurs et police ?* » — **Le PDF oui, à deux réserves. L'interface non.**

### Le PDF — le bandeau de marque est bien là

`generateEDLPdfNative` appelle `_pdfDrawBrandzone` (`index.html:31884`), qui passe par le **même**
helper `DocBrand` que le bail et le certificat de cautionnement : logo du bailleur à gauche, marque
Propryo à droite, **tracée en vectoriel** (corail `#ff5a3c`, `rect` + `circle`) — nette à tout zoom,
sans police ni canvas. Conforme, rien à changer.

**Réserve 1 — la police, sujet GLOBAL et non EDL.** `setFont('helvetica')` : **31 occurrences dans
tout le dépôt, 0 police embarquée** (`addFileToVFS` / `addFont` : 0). Tous les PDF jsPDF de l'app
sortent en Helvetica, alors que les documents HTML (quittance via `doc-template.global.js`) utilisent
Schibsted Grotesk + Inter. **Deux familles de documents, deux typographies.** Hors périmètre EDL.

**Réserve 2 — les encres.** Le PDF de l'EDL écrit en gris **neutres** : `setTextColor(40,40,40)`,
`(110,110,110)`, `(120,120,120)`. La charte des documents prescrit des encres **bleutées** :
ENCRE `#1a2030` = (26,32,48), GRIS `#6e7888` = (110,120,136) (`doc-template.global.js:38`).
Plus un encadré légal ambre (255,248,225 / 201,160,0) absent de la charte.

**Nuance qui débloque le sujet** : le PDF de l'EDL est gaté avec la signature parce que sa
**typographie** est soudée aux coordonnées de signature. **Changer une couleur ne déplace aucune
coordonnée** — les encres sont donc corrigeables sans toucher au gate.

### L'interface — 23 couleurs en dur

Comptées sur la modale EDL : **23 valeurs hexadécimales codées en dur** pour 57 usages de tokens.
Comparaison à fenêtre égale : modale Bail 3 / 13, éditeur de Quittance 22 / 144. **L'EDL a le pire
rapport des trois.**

Les valeurs en dur sont des ambres et rouges de type Tailwind — `#fef3c7`, `#d97706`, `#92400e`,
`#78350f`, `#fee2e2`, `#7f1d1d`, `#f5d28e`, `#fffaf0`. Elles ne suivent **aucun thème** : en mode
sombre, les encadrés « Détecteur de fumée » et « Inventaire mobilier » restent des blocs jaune pâle
au milieu d'une interface foncée.

### Les 5 couleurs d'état — le point dur, mesuré

```js
const EDL_COLORS = {'Neuf':'#3fb950', "Bon état":'#58a6ff',
  "État d'usage":'#d29922', 'Mauvais état':'#f85149', 'Absent':'#8b949e'};
```

Ce sont les couleurs de **GitHub** : **0 occurrence dans `css/main.css`**. Elles sortent aussi dans
le PDF via `_edlHexRgb(EDL_COLORS[…])` (`index.html:32023`).

Contraste mesuré sur fond blanc, seuil WCAG AA = 4,5:1 :

| État | Actuel | Contraste | | Token de la charte | Contraste |
|---|---|---:|---|---|---:|
| Neuf | `#3fb950` | **2,54:1** ❌ | → | `--pos` `#16795e` | 5,34:1 ✅ |
| Bon état | `#58a6ff` | **2,53:1** ❌ | → | `--adv` `#2e6db1` | 5,33:1 ✅ |
| État d'usage | `#d29922` | **2,52:1** ❌ | → | `--warn` `#8f620e` | 5,36:1 ✅ |
| Mauvais état | `#f85149` | **3,35:1** ❌ | → | `--neg` `#c92f2f` | 5,34:1 ✅ |
| Absent | `#8b949e` | **3,08:1** ❌ | → | `--info` `#42506a` | 8,12:1 ✅ |

**Les cinq échouent.** La charte compte exactement **cinq** couleurs sémantiques, recalibrées le
18/08 pour passer 4,5:1 : la substitution est **une pour une**. Ce n'est pas une refonte, c'est un
renommage — et il respecte la règle « on garde la couleur pour tout ce qui différencie » :
cinq états, cinq couleurs distinctes, seules les valeurs changent.

Ces cinq couleurs sont les boutons **N / B / U / M / –** tapés ~110 fois par visite, et l'écart
entrée/sortie du PDF. **C'est l'endroit de l'app où un mauvais contraste coûte le plus cher.**

### Décision du 20/08 — le partage entre les deux chantiers

| Élément | Où | Motif |
|---|---|---|
| Les **5 couleurs d'état** | **Chantier EDL, lot 5** | Boutons tapés 110×/visite, les 5 échouent à 4,5:1, substitution 1:1, et le PDF est corrigé par le même changement (même constante) |
| Les **encres du PDF** | **Chantier EDL, lot 5** | Aucune coordonnée ne bouge → le gate de la signature n'est pas touché |
| Les **23 valeurs en dur** (DAAF, mobilier) | **Chantier design** | Travail de charte à faire avec les autres écrans, pas retouché isolément |
| La **police Helvetica** des PDF | **Sujet global à part** | 31 occurrences dans tout le dépôt — ce n'est pas un écart de l'EDL |

Vérifié dans la maquette : `--e-neuf: var(--pos)` etc. **suivent le thème** — `#2e6db1` en clair,
`#7ab6ea` en sombre pour « Bon état ». La palette GitHub, elle, était figée dans les deux thèmes.

---

## 8. Où vit le code

**Gel du monolithe : toute logique nouvelle vit dans un module `js/` testé (TDD), jamais inline.**

| Module | Responsabilité (pure, testable hors navigateur) |
|---|---|
| `js/core/edl-autosave.js` | Quand déclencher, quoi enregistrer, ne jamais toucher un EDL signé |
| `js/core/edl-photos.js` | Redimensionnement **unique** (fin de la quadruple recopie), file d'envoi, « à l'abri » = `cloudKey`, **droit de libérer** (100 % `cloudKey`, jamais en masse, jamais automatique) |
| `js/core/edl-parcours.js` | Étapes, progression par pièce, comptage des écarts entrée/sortie |
| `js/core/edl-conflit.js` | Détection de doublon (logement + type + date), verrou consultatif d'appareil, **conservation des deux versions** sur conflit |

Le rendu reste inline et **appelle** ces modules. Aucune duplication de `EDL_TPL`, `EDL_ETATS`,
`EDL_COLORS` : ils restent la source unique, passés en argument comme `biens-pieces.js` le fait déjà.

---

## 9. Les invariants testables

Ce sont les phrases que le chantier doit rendre vraies, et que les tests doivent vérifier.

### Brouillon
1. Un rechargement en pleine saisie ne perd **aucune** donnée déjà saisie.
2. Fermer la modale enregistre ; aucune popup ne demande confirmation d'enregistrement.
3. Un EDL **signé** n'est jamais réécrit par l'autosave, quel que soit le nombre de saisies.
4. L'autosave ne déclenche **jamais** plus d'une écriture par fenêtre de 2 secondes.
5. Ré-enregistrer un EDL ne le fait **jamais** disparaître de l'espace partagé (réadoption D1b).

### Photos
6. Une photo prise hors ligne se retrouve **après resynchronisation**, sur un autre appareil.
7. Une photo est déclarée « à l'abri » **si et seulement si** elle porte un `cloudKey`.
8. Le chemin écrit à l'envoi et le chemin lu à la relecture sont **le même**.
9. Une écriture IndexedDB refusée (mémoire pleine) ne perd **aucune** photo déjà écrite,
   et le message nomme ce qui n'a pas pu être ajouté.
10. Il n'existe **qu'un seul** bloc de redimensionnement dans tout le code.
11. Aucun chemin de code ne supprime une photo locale **automatiquement**, quel que soit le volume.
12. Libérer les photos d'un EDL est **impossible** tant qu'une seule d'entre elles n'a pas de `cloudKey`.
13. Aucune commande ne libère les photos de **plusieurs** EDL à la fois.
14. Le réglage « conserver sur cet appareil » n'est **jamais** poussé au cloud
    (présent dans `LOCAL_USER_PARAM_KEYS`).

### Hors ligne
15. Sans réseau, avec une session persistée et un miroir taggé `'same'`, l'app **s'ouvre sur les données**.
16. Sans réseau, avec un miroir taggé `'other-user'` ou `'untagged'`, l'app reste **vide** (RGPD).
17. Un échec de `getUser()` **faute de réseau** n'expulse pas ; un jeton **refusé** expulse toujours.
18. Au retour du réseau, la file locale est poussée **avant** toute ré-hydratation.
19. Aucune action nécessitant le réseau n'est cliquable sans afficher sa raison.
19a. Hors ligne, **aucune écriture** n'aboutit en dehors de l'EDL et des signatures présentielles.
19b. Hors ligne, les onglets Finances, Loyers, Quittances et Accueil sont **fermés**, pas affichés périmés.
19c. Tout écran ouvert hors ligne porte la date et l'heure des données affichées.
19d. Hors ligne, **signer un bail est impossible** : le bouton est grisé et affiche sa raison,
     avec le renvoi vers l'envoi pour signature à distance.
19e. La file d'envoi ne contient **que** des photos d'EDL — aucun PDF de bail.
19f. Un démarrage EN LIGNE avec un miroir `'same'` porteur d'écritures non flushées **pousse le
     miroir avant d'hydrater** — le travail hors ligne survit à une fermeture de l'app (F1).
19g. La déconnexion est **refusée**, avec son motif, tant qu'il reste des écritures non synchronisées (F2).
19h. Le mode hors ligne pose `__immoSupabaseMode` **avant** tout `saveDB` (F3).
19i. Une panne réseau ne déclenche **jamais** la bannière « session expirée » (F4).
19j. Hors ligne, le nombre de tentatives réseau suit le backoff — **pas une par autosave** (F5).
19k. L'autosave ne prend **aucune** capture d'annulation et n'écrit **aucune** entrée d'audit (F6, F7).
19l. Un `saveDB` qui échoue sur quota **renvoie faux** et le dit — il ne prétend jamais avoir écrit (F8).
19m. Le rideau `data-lpboot` est levé sur le chemin hors ligne (F10).

### Rechargement (lot 0)
20. Un défilement vers le bas, où qu'il parte dans la modale EDL, ne déclenche **jamais**
    le rechargement de la page.
21. Un rechargement de page en pleine saisie ne perd **aucune** donnée (conséquence de l'invariant 1).
22. Ouvrir un EDL de 98 photos ne monte pas les 98 binaires en mémoire d'un coup.

### Parcours
23. Sur téléphone, aucun écran ne présente plus d'une pièce à la fois.
24. La pièce courante est toujours visible dans sa barre, jamais coupée au bord.
25. Sur tablette et PC, **toutes** les pièces sont présentes sur un même écran.

### Pièces du logement
25a. La liste de pièces saisie dans Biens **remplace** la structure générique à la sélection
    du logement, tant qu'aucun état, observation ou photo n'a été saisi.
25b. « Extérieurs / Communs » est **toujours** présent dans l'EDL, même absent du template du bien.
26. Sur un bien sans liste, le premier enregistrement écrit `log.edlTemplate`.
27. Sur un bien **avec** liste, aucun enregistrement d'EDL ne l'écrase.
28. « Extérieurs / Communs » n'apparaît jamais dans la liste des pièces du bien,
    et apparaît toujours dans l'EDL.

### Deux appareils
29. Un conflit de version sur un `edl` ne détruit **jamais** la version locale : elle survit
    comme un enregistrement distinct, nommé et daté.
30. Créer un EDL alors qu'il en existe un pour le même logement, type et date déclenche
    un avertissement nommant l'appareil et l'heure.
31. Le verrou d'appareil n'empêche **jamais** de reprendre un EDL : il informe, il ne bloque pas.
32. Aucune fusion automatique de deux saisies d'EDL n'est jamais tentée.
33. La règle « serveur gagne » reste appliquée **à l'identique** pour toutes les collections
    autres que `edl`.
34. Un EDL créé hors ligne remonte par un INSERT (identifiant local neuf) — donc sans conflit possible.

### Parcours complet (audit du 20/08)
34a. Changer de logement sur un EDL portant une saisie **demande** quoi faire — jamais de choix implicite (P1).
34b. Tout champ saisissable de l'EDL fait **16 px minimum** sous 768 px, sans `maximum-scale` (P3).
34c. Relevés, index, quantités et surfaces ouvrent un **clavier numérique** (P4).
34d. La barre du bas suit le **visual viewport** : elle reste visible clavier ouvert (P5).
34e. Le nombre de zones de signature de l'EDL **égale** le nombre de parties du bail (P6).
34f. On ne peut pas atteindre les signatures sans passer par un **récapitulatif** qui nomme ce qui manque (P7).
34g. `edlSnapshot` n'est **jamais** supprimé ; toute réinitialisation de signature écrit une entrée d'audit (P8).
34h. Un seul résolveur donne « l'EDL de sortie qui fait foi » pour un bail — le plus récent de sa fenêtre (P9).
34i. Ouvrir un EDL ne monte en mémoire que les photos **visibles** (P11).
34j. Les 5 états de l'EDL utilisent les 5 couleurs **sémantiques de la charte** — chacune ≥ 4,5:1
     sur son fond, dans les deux thèmes, à l'écran **et** dans le PDF.
34k. Aucune couleur d'état n'est écrite en dur : elles viennent des tokens et **suivent le thème**.
34l. Les encres du PDF de l'EDL sont celles de `doc-template` — aucune coordonnée de signature
     n'est déplacée par ce changement.

### Entrée / sortie
35. Créer un EDL de sortie charge l'entrée du logement sans geste supplémentaire.
36. Un élément non constaté en sortie n'est **jamais** rendu comme « conforme à l'entrée ».
37. Le délai de restitution affiché dans l'EDL est **le même** que celui de `_calculerDelaiRestitution`.
38. Enregistrer une sortie sans EDL d'entrée disponible affiche la conséquence avant de continuer.

---

## 10. Ce qui est hors V1

Nommé maintenant pour ne pas y revenir :

- **Le PDF de l'EDL** — volontairement exclu du gabarit unique `js/helpers/doc-template.global.js`
  (typographie soudée aux coordonnées de signature). Chantier à part, **gaté avec la signature**. Non rouvert.
- **La signature à distance d'un EDL.**
- **Les 23 couleurs en dur des encadrés DAAF et mobilier** — chantier design (§7ter).
- **La police des PDF (Helvetica au lieu de Schibsted/Inter)** — sujet global, 31 occurrences (§7ter).
- **La signature d'un bail hors ligne** — refusée le 20/08 : l'envoi pour signature à distance,
  ou la signature au retour avec du réseau, suffisent (§3.1).
- **Le rattrapage des photos déjà prises** — décision du 20/08 : « on fait pour l'avenir ».
- **Le passage des photos de base64 à un format binaire** dans IndexedDB (−27 % de stockage,
  mais refonte transverse : `_photoCache`, PDF, envoi).
- **L'annotation d'une photo** (flèche, cercle sur la dégradation).
- **La reconnaissance automatique** du contenu d'une photo (relevé de compteur, etc.).
- **Le mode multi-appareils simultanés** sur le même EDL.
- **L'envoi par e-mail** — `DOC_ENVOI_ACTIF = false` : on télécharge, on n'envoie pas.

---

## 11. Ordre de chantier

Chaque lot est livrable et vérifiable seul. L'ordre suit le risque : ce qui protège la donnée d'abord.

| Lot | Contenu | Pourquoi à ce rang |
|---|---|---|
| **0** | `overscroll-behavior-y: contain` (modale, `.ov`, `body`) + préchargement des photos à la demande | **Bug de production signalé le 20/08.** Il a coûté un EDL réel. Trois lignes de CSS, aucune dépendance aux autres lots — livrable immédiatement. |
| **1** | Module `edl-autosave` + branchement + marqueur « Brouillon » + fermeture qui enregistre + retrait d'Annuler · **+ F5 à F8** : backoff non réarmé par l'autosave, aucune capture d'annulation, aucune entrée d'audit, `saveDB` qui avoue un quota plein | Le zéro perte est la raison d'être du chantier. Rien ne sert de soigner l'écran si la visite s'évapore. |
| **2** | Manifeste PWA + balises iOS + icônes + invitation à installer | Quelques lignes, et sans lui les photos et le miroir sont purgés à 7 jours : tout le reste repose dessus. |
| **3** | Module `edl-photos` : redimensionnement unique, `cloudKey` seul juge, alignement des chemins, file d'envoi, compteur en en-tête, message de mémoire pleine | Les preuves cessent de dépendre d'un seul appareil. |
| **4** | Hors ligne : identité qui survit au jeton périmé, miroir lu si `'same'`, bandeau, actions grisées avec leur raison, **file poussée avant ré-hydratation** · **+ F1 à F3 (bloquantes)** : relecture du miroir au démarrage EN LIGNE, déconnexion refusée si non synchronisé, `__immoSupabaseMode` posé avant tout `saveDB` · **F4 prouvée par un test AVANT d'écrire le lot** | Le lot le plus sensible (RGPD + risque d'écrasement) — il arrive après que la donnée locale est déjà sûre. |
| **4bis** | Module `edl-conflit` : avertissement de doublon, verrou consultatif d'appareil, **conservation des deux versions** sur conflit `edl` | Suit immédiatement le hors ligne : c'est le travail hors ligne qui crée le risque de conflit. Sans lui, le lot 4 peut faire perdre une visite. |
| **5** | Module `edl-parcours` + écran téléphone une-pièce-à-la-fois + pied de page à 2 boutons + carte repliée + vue complète 2/3 colonnes sur tablette et PC · **+ P3, P4, P5** : 16 px minimum, claviers numériques, barre du bas sur le visual viewport · **+ charte** : les 5 couleurs d'état passent aux tokens sémantiques (écran + PDF), encres du PDF alignées | Le gros du travail visuel, sur un socle de données devenu sain. |
| **6** | Étape de composition réutilisée + écriture retour dans `log.edlTemplate` · **+ P1, P2** : changement de logement explicite, marqueur « préparé » vs « visite en cours » | Dépend du parcours du lot 5. |
| **7** | Sortie : chargement d'office, trois états, comptage des écarts, récapitulatif du délai de restitution · **+ P9, P10** : résolveur unique de l'EDL de sortie qui fait foi, passerelle vers décompte et restitution | Dépend des lots 5 et 6, et exige un EDL de sortie réel pour le smoke (il n'en existe aucun). |
| **8** | **Signatures (P6, P7, P8)** : N signataires dérivés du bail (réutilisation de `bail-signataires`), récapitulatif avant signature qui avertit sans bloquer, `edlSnapshot` archivé et jamais supprimé, réinitialisation tracée à l'audit | Les **trois trous juridiques**. Séparé parce qu'il touche la valeur probante du document : audit dédié, et il ne doit pas être noyé dans le lot ergonomie. |

### Gate de sortie de l'onglet (`docs/CDC-V1-LIGHT.md` §6, non négociable)
Fonctionnel complet sur **téléphone + tablette + PC** · **0 erreur console** · **données réelles intactes**
· **tests verts** · **audit agent SÛR** · **smoke explicite de Didier**.

### Règles de solidité applicables (§5bis)
Parcours réel de bout en bout · smoke **au volume réel** (les 110 éléments de Ferrette-101, pas 3 lignes)
· audit avant intégration · **preuve d'atteignabilité de tout ce qui est retiré**
(Annuler, les deux boutons PDF du pied de page) · passe de vérification par un second agent.

### Conditions de travail
Chantier en **worktree dédié**, jamais un commit depuis `Desktop\Immo` (hook auto-push prod),
worktree détruit après intégration. Une session de chantier à la fois, pilotage seul intégrateur.

---

## 12. Demandes de modification de code notées pendant la revue

Une seule, et elle n'a **pas** été codée conformément à la règle de la session : le correctif
`overscroll-behavior` du **lot 0** (§3bis). Il est décrit ici, il sera fait par le chantier.

Aucun fichier de l'app n'a été modifié pendant la revue.
