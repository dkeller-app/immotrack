# Stratégie persistance / sync — Architecture SaaS multi-tenant

- **Date** : 2026-06-04
- **Statut** : Design validé (stratégie) — implémentation découpée en plans par phase
- **Périmètre** : refonte fondamentale de la couche de persistance et de synchronisation, en vue de la commercialisation (beta 2-3 mois → commercialisation).
- **Règle de cette session** : aucune modification de code. On définit la stratégie.

---

## 1. Problème

L'app actuelle est **local-first** : `DB` en mémoire, persistée en bloc dans `localStorage` (`immotrack_v4`), synchronisée entre devices via des fichiers Google Drive (par-entité + global) avec un merge **last-write-wins (LWW) au niveau objet** (`_drvWins` compare `_modifiedAt`).

Cette architecture est **structurellement incompatible** avec l'objectif commercial.

### 1.1 Diagnostic du bug d'alias (cas concret qui valide tout)
L'« alias » est l'adresse d'envoi Gmail (send-as) stockée **sur l'objet entité**. Le merge Drive est un LWW **objet entier**. Donc :
1. PC modifie l'alias de l'entité X à T1 → `X._modifiedAt = T1`.
2. Téléphone (pas encore pull T1) modifie **un autre champ** de X à T2 > T1 → son objet X porte encore l'**ancien** alias.
3. Au merge, l'objet X du téléphone (T2, « plus récent ») **écrase** celui du PC → l'ancien alias **ressuscite**.

Ce n'est pas un bug isolé : c'est **intrinsèque** au LWW fichier au niveau objet. On peut le patcher indéfiniment, la classe de bug demeure. C'est pourquoi les itérations précédentes (timestamps, protection signature défensive…) n'ont jamais satisfait : on patchait les symptômes d'un défaut architectural.

### 1.2 Limites bloquantes pour la commercialisation
- **Pas de concurrence multi-utilisateur** : un parc partagé édité par plusieurs employés d'agence en simultané est impossible avec une sync de fichiers LWW.
- **Intégrité non garantie** : aucune contrainte référentielle ; un mouvement peut pointer un bail inexistant ; perte de données silencieuse au merge.
- **Offline-first global = source de fragilité** : rechargements, résurrections, divergences entre devices.
- **Pas d'isolation multi-tenant** : aucune frontière de sécurité entre jeux de données.

---

## 2. Décisions validées

| # | Décision | Choix retenu |
|---|---|---|
| D1 | **Cible commerciale** | SaaS **multi-tenant** : agences (édition concurrente d'un parc partagé) **ET** bailleurs solo isolés. |
| D2 | **Backend** | **Supabase** : Postgres serveur-autoritaire + Auth + RLS + Realtime + Storage, région **EU**. |
| D3 | **Socle technique** | **Cache working-set en mémoire + écritures serveur-autoritaires + Realtime.** Fin du LWW / merge fichiers. |
| D4 | **Périmètre offline** | **Borné** à EDL + signature bail (capture terrain → outbox → push au retour réseau). **Tout le reste : online.** |
| D5 | **Chemin de transition** | **Migration incrémentale** vers la cible propre (strangler + modularisation Vite). Pas de rewrite big-bang. |
| D6 | **Stockage fichiers** | **Supabase Storage EU** (source de vérité) + **miroir sortant one-way** chez le client (souveraineté). |
| D7 | **Souveraineté / promesse data** | Export ZIP total à la demande (filet de sécurité, portabilité RGPD) + miroir auto comme **feature de commercialisation**. |
| D8 | **Scope miroir v1** | **Export ZIP universel + connecteur WebDAV** d'abord ; Google Drive / Dropbox / OneDrive **pilotés par la demande** ; agent desktop (local app-fermée) plus tard. |
| D9 | **Gating par abonnement** | Contrôle des quotas & features **enforced en base** (triggers Postgres), pilotés par une table `plans` extensible. Stripe = vérité de facturation. Dépassement = **bloquer la création + verrouiller, jamais détruire**. |
| D10 | **Unité de partage = `espace`** | Le partage se fait au niveau d'un **conteneur** (espace = partage + facturation + membres), pas par une ACL par immeuble. RLS triviale et identique partout → **non-fuite cross-tenant** maximisée. Multi-espaces par utilisateur + vue agrégée. |
| D11 | **Gratuités pilotables** | Essai gratuit 1 mois (`trial`) + **comptes offerts à vie** (`comp`, ex. beta testeurs) **octroyés par l'admin** ; `comp` prime sur Stripe. Débloquer = changer le plan effectif de l'espace, **zéro cas particulier** dans le code. |
| D12 | **Relais public Cloudflare = ingress éphémère, pas une 2ᵉ source de vérité** | Le Worker Cloudflare (signature bail à distance, lien candidature) gère **uniquement** les flux avec des tiers **sans compte** (R2/KV à TTL, jetons HMAC). Il est **permanent et complémentaire** à Supabase, **jamais** autoritaire : l'artefact produit (PDF signé, dossier) est **ingéré dans Supabase** par **webhook serveur-à-serveur dès la fin de la signature** (**reco par défaut** : entrée immédiate, fenêtre de double-stockage minimale ; le *poll* par l'app reste un fallback). **Rétention côté relais** : TTL aligné sur les classes de rétention (signature ~14 j ; **données candidature ≤ 3 mois** avec base légale = consentement) + **`DELETE` actif dès accusé d'ingestion** confirmé dans Supabase (ne pas dépendre du seul TTL passif). Durcissement : son auth passe du `APP_KEY` statique à la **vérification de l'ID token** (Auth Supabase/Google). |
| D13 | **Accès propriétaire (agence en gestion déléguée)** | Une **agence** = une **organisation** qui chapeaute **plusieurs espaces (un par propriétaire/mandant géré)**, et non un gros espace unique. Son **personnel** est membre de tous les espaces qu'il gère (vue agrégée = parc complet) ; chaque **propriétaire** est membre **de son seul espace** via un rôle `proprietaire` (consultation : EDL, documents, quittances, baux). L'isolation **propriétaire ↔ propriétaire** est donc **gratuite** : la règle RLS unique (« membre de l'espace de cette ligne ? ») ne bouge pas. **Rejeté : un gros espace agence + ACL par bien** (rouvrirait le risque de fuite cross-client n°1, §16). La couche **organisation/agence** (facturation regroupée de N espaces + propagation des accès du personnel) est **construite en P5** ; le modèle de données (1 espace par propriétaire) est **figé dès P0**. |

**Principe non négociable** : ce n'est pas un patch. L'état final ne contient **aucune trace** de l'ancien système (zéro localStorage comme source de vérité, zéro merge de fichiers, zéro LWW). La migration incrémentale est le *chemin*, pas une dégradation de la *destination*.

---

## 3. Architecture cible

```
Frontend modulaire (Vite — fin du mono-fichier 47k lignes)
        │  lectures SYNCHRONES sur le cache mémoire
        ▼
[ Cache working-set en mémoire ]  ◄── Realtime (modifs des autres membres de l'espace)
        │  écritures
        ▼
Supabase
  ├─ Postgres autoritaire (ACID, clés étrangères, contraintes, triggers, RLS)
  ├─ Auth (email/mot de passe + Google SSO)
  ├─ Realtime (canal par espace)
  └─ Storage EU (bucket par espace, URLs signées)
        │
        ▼ (sortie one-way, NON-AUTORITAIRE)
Export ZIP à la demande  +  Miroir auto (WebDAV v1)
```

Le serveur arbitre tout. Le client n'est qu'un **cache cohérent**. L'intégrité 100 % vient **du serveur** (Postgres), pas du code client.

**Topologie à deux backends (rôles disjoints, voir D12).** Un **relais Cloudflare** (Worker + R2 + KV, déjà spécifié pour la signature de bail à distance et le lien candidature) existe en parallèle de Supabase. Il n'est **pas** une seconde source de vérité : il sert **uniquement de point d'entrée éphémère pour les tiers sans compte** (un locataire qui signe une fois, un candidat qui dépose un dossier). Le résultat est ensuite **ingéré dans Supabase** (par **webhook serveur-à-serveur dès la signature** — reco par défaut, cf. D12), qui reste l'unique source autoritaire. Supabase = tout ce qui est authentifié ; le relais = la frontière « personne sans compte » que l'auth ne peut pas couvrir.

---

## 4. Modèle multi-tenant : l'« espace » comme unité de partage

**Le concept qui manque aujourd'hui.** L'app range la donnée par **entité** (bailleur / SCI) et **logement** (bien) — mais c'est un *rangement d'affichage*, pas un contrôle d'accès : tout est à toi, sur ton appareil. Le multi-utilisateur exige une notion nouvelle : **l'unité de partage**. C'est le rôle de l'**espace**.

- **`espace`** = conteneur de **partage + facturation + membres**. **Bailleur solo = espace de 1 membre. Agence = espace de N membres.** Un même utilisateur peut **appartenir à plusieurs espaces**.
- **`memberships`** (user ↔ espace + rôle) : `owner`/`admin`, `gestionnaire`, `lecture_seule`, **`proprietaire`** (consultation : EDL, documents, quittances, baux de **son** espace) (**extensible**). Ajout par **invitation email**.
- **Chaque table métier porte `espace_id`.** Hiérarchie : `espace` → `entites` → `logements` → (baux, quittances, mouvements, EDL…).
- **RLS (Row-Level Security)** : une ligne n'est lisible/modifiable que si l'utilisateur a une `membership` dans l'`espace` de la ligne (+ contrôle de rôle en écriture). **Une seule règle, identique sur toutes les tables.** Isolation entre clients **garantie en base**, indépendamment d'un éventuel bug applicatif.
- **Vue agrégée** : un utilisateur multi-espaces voit ses espaces réunis dans une vue d'ensemble ; le partage reste cloisonné par espace.

**Ton cas concret** : espace « Mon patrimoine » (tes SCI perso, solo) + espace « Didier & Compagne » (la SCI / l'immeuble commun). Tu invites ta compagne **dans le 2ᵉ espace seulement** → elle ne voit **que** l'immeuble commun ; toi tu vois les deux.

### Pourquoi « espace » plutôt qu'une liste de droits par immeuble (ACL) ?

Les deux donnent **exactement** le résultat demandé (ne partager que l'immeuble commun). La différence est **interne** — robustesse et risque de fuite :

| | **Espace (retenu)** | **ACL par immeuble** |
|---|---|---|
| Où vit le partage | Sur le **conteneur** : appartenance à 2-3 boîtes | Sur **chaque immeuble** : une liste d'invités par bien |
| Règle RLS | « suis-je membre de l'`espace` de cette ligne ? » — **1 test, identique partout** | « remonter ligne → logement → lire la liste du bien » — **sur chaque table** (baux, quittances, mouvements, EDL, docs…) |
| Risque | Faible : une frontière nette par ligne | Élevé : jointures multiples = multiples occasions de fuite cross-tenant |
| Souplesse | Bon grain pour l'immobilier (un immeuble = **un** groupe) | Permet de partager **le même** bien dans deux groupes — inutile ici, et ce surcroît crée le risque |

La **non-fuite cross-tenant étant le risque n°1** (§16), on choisit le modèle le plus simple à sécuriser. Besoin futur de groupes différents (immeuble A avec Anne, immeuble B avec Bob) ? → **un espace par groupe**, la règle RLS ne bouge pas.

### Agence en gestion déléguée : organisation = plusieurs espaces (décision D13)

Une **agence** qui gère le parc de plusieurs propriétaires n'est **pas** un gros espace unique, mais une **organisation qui chapeaute plusieurs espaces — un par propriétaire/mandant géré** :

- Le **personnel de l'agence** est membre (rôle `gestionnaire`) de **tous** les espaces qu'il gère → sa **vue agrégée** (déjà offerte par le multi-espaces) = le parc complet.
- Chaque **propriétaire** est membre **de son seul espace**, via le rôle **`proprietaire`** (consultation : il voit les EDL, documents, quittances, baux de **ses** biens, sans rien pouvoir modifier ni gérer les membres).
- L'isolation **propriétaire ↔ propriétaire** est donc **gratuite** : c'est exactement la règle RLS unique (« membre de l'espace de cette ligne ? »), aucune ligne de code spécifique. Un propriétaire ne peut **jamais** voir le parc d'un autre, même par bug applicatif.

**Rejeté : un seul espace « agence » + une ACL par bien** pour exposer chaque propriétaire à ses biens. Cela rouvrirait précisément le **risque de fuite cross-client n°1** (§16) que le modèle « espace » élimine.

La couche **organisation/agence** elle-même — facturation regroupée de N espaces sous un même contrat + propagation automatique des accès du personnel aux espaces gérés — est **construite en P5**. Mais le **modèle de données (1 espace par propriétaire) est figé dès P0** : le rôle `proprietaire` existe dans l'enum dès la première migration, pour ne pas avoir à rétro-ajouter un rôle (= migration de données + réécriture RLS).

---

## 5. Modèle de données relationnel

Toutes les collections actuelles deviennent des tables liées par clés étrangères :
`entites, logements, baux, baux_historique, mouvements, quittances, edl, edl_photos, assurances, mrh, candidats, documents, equipements, agenda, categories, templates, irl_table, irl_historique, audit_trail, params`.

**Colonnes communes** : `id (uuid)`, `espace_id`, `created_at`, `updated_at`, `version (int)`, `created_by`.

**Contraintes d'intégrité** (exemples) : un `mouvement` référence un `bail` existant ; une `quittance` ne peut exister sans `bail` ; un `logement` appartient à une `entite` du même `espace`. C'est l'**intégrité 100 %** recherchée — impossible avec localStorage + Drive.

> Le détail des colonnes structurantes (membership 1ʳᵉ classe, `espace_id` dénormalisé + contrainte parent/enfant, `version`, tombstones, classes de rétention, statut signé) est consolidé en **§17 — Invariants P0 du schéma**. Inventaire vérifié : **19 collections** aujourd'hui (6 globales de config + 13 métier) ; toutes doivent avoir une table cible ou un sort explicite à l'import (§13).

---

## 6. Flux lecture / écriture (le cœur)

- **Hydratation** : à la connexion, on charge en mémoire le working-set de l'espace (collections principales). Les grosses collections (`mouvements`) sont **paginées / chargées à la demande** par logement & période.
- **État `loading` par collection** : tant qu'une collection n'est pas hydratée, l'UI affiche un état de chargement explicite. Une lecture synchrone sur un cache vide/partiel ne doit **jamais** être confondue avec « pas de donnée » (sinon on réintroduit la classe de bug « affiche vide → l'utilisateur recrée → doublon »).
- **Lectures UI** : **synchrones** sur le cache → le gros du code UI existant ne change pas.
- **Écritures** : UI optimiste → appel serveur en **transaction** → succès = on conserve ; rejet = refetch + message clair (sans perdre la saisie, §7).
- **Cohérence inter-onglets (même device)** : deux onglets du même compte tiennent chacun leur cache. Un **`BroadcastChannel` par espace** propage chaque écriture locale aux onglets frères (ou un onglet « leader » détient la connexion Realtime et rediffuse). Sans ça, l'onglet B écrit avec une `version` périmée et se fait rejeter pour rien.
- **Realtime** : abonnement par espace → les modifs des autres membres **patchent le cache** → l'UI se rafraîchit en live. Patches **coalescés par tick** (un import/opération de masse ne doit pas noyer le cache).
- **Resync de sûreté** : un canal Realtime peut **manquer un événement** (socket coupée, onglet en veille). Donc au **retour de focus / reconnexion** → refetch delta. Le curseur de delta repose sur une **séquence monotone serveur** (pas seulement `updated_at`, dont l'égalité au curseur ferait rater des lignes) et **inclut les tombstones** (sinon une suppression survenue pendant la coupure est invisible). Au-delà d'un **seuil de coupure**, on bascule en **full-refetch**. Toute écriture reste de toute façon protégée par le `version` (§7). Le Realtime est un confort, **pas** la garantie de cohérence. Pour les grosses collections paginées (`mouvements`), on ne s'abonne qu'à la **fenêtre chargée**.

> La conversion vers l'asynchrone se limite aux **frontières** (hydratation login, écritures, abonnements Realtime), pas à chaque lecture. C'est ce qui rend le chantier faisable en solo sur 47k lignes.

---

## 7. Concurrence & conflits (fin du LWW)

**Concurrence optimiste par `version`** :
- L'update envoie la `version` lue.
- Le serveur fait `UPDATE … WHERE id = ? AND version = ? AND deleted_at IS NULL` (et incrémente `version`). La clause `deleted_at IS NULL` couvre le **conflit suppression-vs-édition** : si A supprime pendant que B édite, l'`UPDATE` de B touche 0 ligne et **ne ressuscite pas** un tombstone.
- **0 ligne touchée** = modifié **ou supprimé** entre-temps → refetch + message : *« X vient de modifier (ou supprimer) ce bail, voici l'état à jour. »*
- **La saisie en cours n'est jamais perdue** sur rejet : on conserve le diff local et on propose de le **réappliquer** sur la version fraîche, on n'écrase pas le formulaire avec le refetch.
- **Aucune perte silencieuse.** C'est la fin définitive du bug d'alias et de sa classe entière.

**Écritures multi-lignes = une seule transaction serveur.** Générer une quittance + son mouvement + l'incrément de solde sont **plusieurs lignes** : tout passe par une **fonction RPC Postgres unique et transactionnelle**, jamais par N appels client séparés (un crash réseau entre deux appels laisserait une quittance sans mouvement — l'intégrité qu'on prétend gagner serait reperdue). Le client n'a **pas le droit** d'orchestrer une écriture multi-lignes.

L'intégrité référentielle est garantie par Postgres, jamais par du code client défensif.

---

## 8. Offline borné (EDL + signature terrain)

- L'EDL / la signature se remplit dans un **état local dédié** (IndexedDB), **100 % offline** (photos, signatures, formulaire) — scénario terrain sans réseau (cave, parking, zone blanche).
- **Outbox** : au retour réseau, **push transactionnel** vers le serveur, **dans l'ordre** (FIFO par timestamp client) + dépendances explicites (un EDL et sa signature sont liés).
- Ces artefacts sont **neufs et immuables**, sans éditeur concurrent → **simple insert, aucun merge**. C'est le cas offline *facile*, sans rapport avec le local-first global qu'on abandonne.
- **Échec d'ingestion ≠ happy-path silencieux** : un EDL offline peut référencer un bail/logement **supprimé ou déplacé** côté serveur pendant la coupure → FK violée. L'item part alors en **quarantaine** (pas perdu, pas réessayé en boucle) avec un écran de **ré-affectation manuelle**.
- **Collision inter-devices** : deux devices hors-ligne créant un EDL pour le **même** logement/type/période → **contrainte d'unicité métier** côté serveur + résolution de doublon à l'ingestion (les UUID client seuls ne dédupliquent pas un doublon *métier*).
- **Budget IndexedDB** : photos EDL **compressées + plafonnées**, détection de `QuotaExceededError` et **alerte avant saturation** — l'écriture offline ne doit **jamais** échouer en silence sur le terrain (c'est le scénario même qu'on protège).
- UI : *« N EDL en attente de synchronisation »* + push automatique au retour réseau + **blocage du logout** tant que l'outbox n'est pas vidée.

---

## 9. Immutabilité légale (bail / EDL signé)

- À la signature : insert d'un **snapshot figé** + statut `signed` + **hash de contenu** (preuve d'intégrité opposable, détecte une altération même au niveau Storage).
- **Trigger Postgres** qui **REFUSE tout `UPDATE`/`DELETE`** sur une ligne signée. Correction = **nouvel artefact versionné**, jamais mutation.
- **Avenant / résiliation = nouveaux objets, jamais une mutation de l'original** :
  - **Avenant** (changement de loyer, ajout de locataire…) = nouveau bail signé portant `amends_id → bail original` + l'original passe `superseded` (statut, pas suppression). Le chaînage juridique est explicite.
  - **Résiliation** = **événement** dans une table `baux_evenements` (date, motif), **sans toucher** la ligne signée verrouillée. Le bail reste signé/immuable mais porte un état dérivé « résilié » lu via ses événements.
  - **Correction d'une faute de frappe** sur un signé : interdite par la loi → l'app propose un **avenant rectificatif**, pas une édition.
- **Quittances rattachées à un bail verrouillé** : une quittance se crée **après** la signature. Le trigger d'immutabilité ne s'applique **qu'à la ligne signée elle-même**, **jamais** à l'`INSERT` d'un enfant (quittance, mouvement) qui la référence.
- **Provenance de la signature** : `signature_source ∈ {immotrack, externe}`. Un PDF signé **ailleurs** puis importé entre verrouillé **sans** prétendre à une preuve d'intégrité ImmoTrack (pas de faux hash d'origine).
- **Pas de cascade à travers le signé** : un delete d'`entite`/`logement`/espace ne doit **jamais** détruire un bail/EDL signé. FK vers le signé en `ON DELETE RESTRICT` ; les parents se **soft-delete** (archive), ne se hard-delete pas.
- **Durées de rétention légales (FR/UE, réf. CNIL gestion locative)** — le signé survit **bien après** la relation : bail, état des lieux, quittances = **durée du bail + 3 ans** (gestion directe ; **+5 ans** en gestion déléguée / prescription civile) ; restitution dépôt de garantie = **3 ans** après fin de bail ; **données de candidature/solvabilité ≤ 3 mois**. Ces durées pilotent les **classes de rétention** (§11, §17).
- **Import-aware** : à la migration (§13), un bail/EDL déjà signé doit s'**insérer déjà verrouillé** avec sa **date de signature d'origine** — le trigger ne bloque pas l'insert d'import mais verrouille ensuite.
- Bien plus solide que la « protection signature » défensive actuelle (contournable côté client).

---

## 10. Stockage fichiers & souveraineté

- **Source de vérité** : Supabase **Storage**, **bucket par espace**, RLS, **URLs signées temporaires**, région **EU**.
- **Promesse « vous avez toujours accès à vos données »** matérialisée par un **export ZIP total à la demande** :
  - toutes les données structurées en **JSON + CSV** lisibles,
  - **tous les fichiers** (photos, PDF signés) dans une arborescence claire,
  - **résumés/relevés générés** (dossier par logement, relevé annuel…),
  - **visionneuse statique** (index.html) lisible **offline**, sans l'app.
  - Couvre aussi la **portabilité RGPD**.
- **Miroir sortant** : **one-way, dérivé, non-autoritaire**. L'app **pousse** une copie chez le client, ne **lit jamais** en retour → **aucun risque de résurrection/conflit** (différence fondamentale avec l'ancien Drive).
  - **v1** : connecteur **WebDAV** (couvre NAS Synology / Nextcloud / ownCloud / Box → « pas que Google » **et** « en local » via NAS, sans OAuth).
  - **Ensuite (demande réelle)** : Google Drive, Dropbox, OneDrive.
  - **Plus tard** : agent desktop pour le vrai local app-fermée.

Arborescence cible du miroir/export :
```
/ImmoTrack-Export/
  /Logement-F-001 - 12 rue X/
    /Baux/ bail-2026-signé.pdf
    /EDL/  edl-entrée-2026.pdf + /photos/
    /Quittances/ 2026-01.pdf …
    dossier-logement.pdf      ← résumé généré
  relevé-annuel-2026.pdf      ← relevé généré
  index.html                  ← visionneuse offline
```

---

## 11. Sécurité & RGPD

- **RLS = isolation tenant en base** → **point le plus critique**. Toute policy RLS et tout schéma multi-tenant **DOIT être audité par agent `superpowers:code-reviewer`** avant test (règle gravée). Tests d'isolation cross-tenant systématiques.
- **Qui est responsable de traitement ? (à corriger : ce n'est PAS nous)** En SaaS, le **client** (bailleur / agence) est **responsable de traitement** des données de ses locataires/candidats ; **nous (l'éditeur) sommes sous-traitant** ; Supabase/Cloudflare/Stripe sont **sous-traitants ultérieurs**. ⇒ il faut un **DPA où *nous* sommes le sous-traitant du client** (pas l'inverse), en plus du DPA Supabase. **Espace partagé entre deux bailleurs indépendants** = cas de **responsabilité conjointe** : la doc doit dire **qui répond** à une demande d'un locataire (par défaut : les co-owners de l'espace, solidairement).
- **Transferts hors-UE** : la promesse « région EU » couvre Supabase, **pas** Stripe (entité US → SCC / Data Privacy Framework), Google SSO, ni l'edge mondial Cloudflare. Chaque flux hors-UE doit figurer au **registre** avec sa **base de transfert** (SCC/DPF) avant go-live.
- **Droit à l'oubli ≠ tout effacer** : l'effacement RGPD **ne prime pas** sur l'obligation légale de conservation (§9). L'effacement est donc **sélectif** : on purge le superflu, on **conserve le set signé légalement requis** au titre de « l'obligation légale ». ⇒ chaque donnée porte une **classe de rétention / base légale** + un `retention_until` (candidature 3 mois purge auto, signé tenancy+3–5 ans). **Portabilité** : export ZIP.
- **Tiers = sujets de données aussi** : locataires, garants, candidats ont des droits RGPD propres, **même s'ils n'ont pas de compte**. Le modèle doit représenter ces sujets non-utilisateurs **et** offrir une **voie concrète d'exercice des droits sans compte** : canal de demande, identification du sujet, **RPC `SECURITY DEFINER`** qui extrait/anonymise *ses* lignes à travers les espaces, **sous contrainte de rétention** (on n'efface pas un bail signé encore sous obligation légale, on l'expose / on minimise).
- **Effacement / export en espace partagé** : les lignes d'un espace partagé appartiennent à **l'espace**, pas à un membre. La demande d'un membre ne peut pas effacer le bail signé commun ; export/effacement raisonnent à la **granularité espace**. Supprimer le **compte** du **seul owner** d'un espace partagé ≠ supprimer l'espace → force d'abord un **transfert d'ownership** (§17). **Si l'owner est injoignable / refuse / disparaît** : procédure **admin de réattribution** après délai d'inactivité (sinon l'espace — et l'accès de la compagne aux docs signés — reste orphelin indéfiniment).
- **Effacement de compte vs journal append-only** : le nom/email d'un membre supprimé figure dans `created_by`, les invitations et le **journal d'accès** (append-only) → tension directe avec le droit à l'effacement. ⇒ on **pseudonymise** `created_by`/journal (référence à un id anonymisé), on ne conserve pas le nom en clair.
- **Sous-traitants** à déclarer (RGPD) : Supabase, Stripe, cible du miroir (WebDAV/Drive…), relais Cloudflare. **Journal d'accès/export** append-only (accountability) — moins cher à poser dès le départ.
- **Tokens des providers de miroir** : chiffrés au repos. **Storage** : isolation **par préfixe `espace_id/` ancré** dans la policy (pas juste un nom de bucket) + **URLs signées courtes** (une URL signée survit à une révocation de membership — donc TTL bref).
- **XSS / injection** : non négociable en multi-tenant.

---

## 12. Gating / entitlements par abonnement

**Principe non négociable** : le contrôle d'abonnement est **enforced côté serveur (en base)**, exactement comme la RLS. Le contrôle client n'est qu'un **confort UX** (afficher « limite atteinte → upgrade » *avant* l'action), **jamais** la frontière de sécurité. Un gating uniquement client est contournable (appel API direct, bug) — exclu.

**1. Plans pilotés par la donnée (extensible)**
Table `plans` : `id, nom, limite_biens, limite_membres, limite_stockage, features (jsonb), prix…`. Ajouter un palier = **une ligne**, pas une modif de code.
Paliers prévus : **solo** (1 membre), **co-détenteur** (espace à **2+ owners** — ex. ta SCI partagée avec ta compagne ; `limite_membres ≥ 2`, droits d'administration partagés), **agence** (N gestionnaires). Le co-détenteur n'est **pas** un cas particulier de code : c'est **une ligne `plans`** de plus.

**2. Deux types de limites**
- **Quotas** (numériques) : nb de biens (`logements`), nb de membres de l'espace, stockage, nb d'EDL… *Exemple : Bailleur solo → `limite_biens = 1`, `limite_membres = 1`.*
- **Features** (booléens dans `features` jsonb) : multi-utilisateur agence, connecteurs miroir, rapports avancés, API…

**3. Enforcement en base (le point dur)**
**Trigger Postgres** sur l'insert. **Unité de quota = `logement`** (un immeuble = **1** `entite` portant **N** `logements` ; on ne gate **pas** la création d'`entite`, on compte les logements). Exemple : si `count(logements de l'espace WHERE deleted_at IS NULL) >= limite_biens du plan` → `RAISE EXCEPTION 'PLAN_LIMIT_BIENS'`. Le quota compte les lignes **vivantes** (soft-delete ne compte plus). Limite `NULL` = illimité. Contrôle **à l'INSERT uniquement** (jamais à l'UPDATE/lecture). Le client attrape le code d'erreur et affiche l'upsell. **Incontournable**, comme la RLS. Idem sur `memberships` (inviter un collègue est gated → c'est la frontière solo ↔ agence).

**4. Stripe = vérité de facturation**
Stripe gère l'abonnement. Un **webhook** (Edge Function) met à jour `espace.plan_id` + `statut_abonnement` dans Postgres. Postgres = cache synchronisé des droits ; les triggers le lisent.
- **Mapper TOUT le spectre de statuts Stripe** vers une entitlement (table statut→droits), pas seulement actif/annulé : `trialing`, `active`, `incomplete`, `incomplete_expired`, `past_due`, `unpaid`, `canceled`, `paused`. Sinon un `past_due`/`paused` laisse l'espace dans un état non défini (sur- ou sous-doté).
- **Changement de plan en cours de période** (`customer.subscription.updated` avec nouveau `price`) = simple mise à jour de `plan_id` (upgrade/downgrade mid-cycle, proration gérée par Stripe) — **distinct** d'une annulation/réactivation.
- **Remboursement / litige** (`charge.refunded`, `charge.dispute.created`) : mappés explicitement (un dispute peut suspendre l'accès) — décidés, pas ignorés par défaut.
- **Webhooks idempotents + réconciliation** : Stripe livre *at-least-once* et **dans le désordre** → dédup par `event.id` + on stocke `current_period_end` (un webhook manqué ne doit pas verrouiller instantanément un client à jour). **Réconciliation = cron quotidien** (Edge Function) qui resynchronise l'abonnement Stripe → Postgres pour rattraper tout event manqué. Re-souscription après annulation = se **ré-attache au même espace** (mapping client Stripe ↔ espace survit à l'annulation), pas un nouvel espace.
- **1 abonnement = 1 espace ; quotas STRICTEMENT par espace, jamais agrégés.** Un user dans 5 espaces dont il en paie 3 = 3 abonnements indépendants, 3 jeux de quotas. Plusieurs owners peuvent administrer, mais la facturation est **mono-sourcée** (sinon 2 owners = 2 abonnements pour 1 espace).
- **Agence = organisation qui chapeaute N espaces (un par propriétaire géré ; décision D13).** La couche **organisation** (construite en **P5**) facture l'agence sur un **contrat regroupé** parentant ses N espaces, mais **le quota reste calculé par espace** : on ne change **rien** au moteur d'enforcement (trigger à l'INSERT, compté par espace, §12-3). L'organisation est un **regroupement de facturation + propagation d'accès du personnel**, pas une nouvelle unité de quota. Le rôle **`proprietaire`** (consultation de son seul espace) n'occupe **pas** de siège « gestionnaire » payant — sa tarification éventuelle (ex. au bien géré) est une **ligne `plans`**, pas du code.
- **Espace co-détenu = un abonnement « co-détenteur », un payeur désigné.** L'espace partagé porte **un seul** abonnement (palier co-détenteur), réglé par **un** co-owner désigné. Le **partage du coût** entre co-owners se gère **entre eux** (Stripe facture un client par abonnement) ; un éventuel split-billing natif est un sur-scope explicite, repoussé tant qu'aucune demande réelle ne le justifie.
- **Départ / défaut du payeur** : déclenche « désigner un nouveau payeur ». **Pendant l'interrègne** (espace sans payeur valide) → **lock de création** (comme un dépassement de quota) mais **lecture + export garantis** (cohérent D9) — l'accès aux baux signés communs n'est **jamais** coupé.

**5. Dépassement de quota (downgrade / impayé alors que déjà au-dessus)** — **décision D9**
**Bloquer toute NOUVELLE création** au-delà de la limite + état verrouillé, mais **lecture + export + données existantes (dont baux signés) toujours intacts et accessibles**. **Jamais de destruction** (conforme à l'immutabilité légale, §9). L'utilisateur débloque en upgradant ou en archivant.

**6. Gratuités : essai gratuit + comptes offerts (toi, admin)**
La résolution des droits d'un espace lit une **`source`** : `stripe` | `trial` | `comp`.
- **Le palier gratuit `free` existe comme ligne `plans` dès P0** (`limite_biens`, `limite_membres`, `limite_stockage` définis) — sinon, à l'expiration d'un `trial`, le code n'a **aucun `plan_id` cible** et la résolution des droits (§17-13) casse.
- **Essai gratuit (1 mois)** : à la création, `source = trial`, `trial_ends_at = +30 j`, accès complet du palier choisi ; à l'échéance, bascule auto vers le **palier `free`** **sauf** abonnement Stripe actif. **Aucune destruction** (D9) — si l'essai expire **au-dessus** du quota gratuit, on **verrouille la création**, la donnée existante reste lisible/exportable. **0 jour de grâce** : le lock est **immédiat à l'échéance**, mais **jamais une surprise** → **alertes en amont** (J-15 / J-7 / J-1, in-app + email). Idem pour un `past_due` : on prévient avant, on ne laisse pas traîner un état flou.
- **Comptes offerts à vie (beta testeurs)** : `source = comp`, plan illimité, `expires = NULL`, `comp_reason` + `granted_by` + `granted_at`. **`comp` prime sur Stripe** → le webhook Stripe ne downgrade **jamais** un compte `comp`. **Révocation** d'un `comp` : transition explicite `comp → free` (ou `trial`) + **entrée au journal** append-only (qui, quand, pourquoi). Octrois/révocations **auditables**.
- **Octroi par toi** : action **back-office admin** (table protégée, RLS admin-only / Edge Function) — jamais exposée au client. Débloquer un abonnement = **changer le plan effectif de l'espace** ; les triggers de quota le respectent automatiquement, **zéro cas particulier** dans le code métier.

**7. Beta**
Tout le monde sur un plan **« beta illimité »** (`source = comp`). Les vrais paliers + Stripe arrivent à la commercialisation (P5).

**Place dans la roadmap** : les *hooks* de schéma (`espace.plan_id`, table `plans`, helper de check) sont prévus **dès P0** pour éviter un retrofit ; l'enforcement réel (triggers) + Stripe + écrans d'upsell arrivent en **P5**.

---

## 13. Migration de la donnée perso (tenant #1)

Script d'import **one-shot** : lecture d'un **export consolidé unique choisi explicitement** (voir ci-dessous) → mapping vers le schéma Postgres → création des **espaces du propriétaire** + lui en `owner`. La donnée réelle est préservée ; l'app est testée **en conditions réelles** avant le premier client.

Exigences d'import (les rater = perte de données ou clocks faux) :
- **Une seule source de vérité, choisie sciemment** : le bug historique = deux copies divergentes (PC vs téléphone). On **n'importe pas** « le localStorage courant » au hasard → on part d'**un export consolidé unique** désigné par l'utilisateur, avec **rapport de divergence par champ** présenté **avant** toute écriture.
- **Représenter les 19 collections** — y compris celles **historiquement non synchronisées** sur Drive (elles peuvent n'avoir qu'une seule copie locale) ; chacune a une table cible **ou** un sort explicite validé par l'utilisateur. Aucune omission silencieuse. **Inclure les photos EDL** (IndexedDB séparé) → Storage : ne pas les oublier.
- **Conserver les IDs et timestamps d'origine** (`created_at`/`updated_at`/`signed_at`) — pas de « now » : sinon les horloges de rétention (§9/§11) et les dates légales sont fausses.
- **`version = 1`** (ou l'historique réel) sur chaque ligne, sinon la 1ʳᵉ écriture optimiste échoue.
- **Idempotent, y compris après échec partiel** : `INSERT … ON CONFLICT (id) DO NOTHING` (réutiliser les IDs comme clés naturelles) **et** le re-run d'import est **exempté du trigger d'immutabilité** (§9) — sinon ré-insérer un signé déjà importé crashe au lieu d'être idempotent.
- **Affecter chaque entité/logement au bon espace** dès l'import (« Mon patrimoine » vs « Didier & Compagne ») — un mauvais espace = mauvaise visibilité RLS dès J1.
- **Signés importés déjà verrouillés** avec leur date d'origine (§9).
- **Rapport de réconciliation** (compté entrant vs sortant par collection) présenté **avant** mise en service.

---

## 14. Séquencement beta → commercialisation

**Plan business** : beta testeurs (2-3 mois) → commercialisation. Le **miroir Drive auto** est positionné comme **feature de commercialisation**.

### Beta (2-3 mois) — scope « beta-viable »
Objectif : faire éprouver le **risque réel** (concurrence multi-utilisateur agence + intégrité).
- **P0** : schéma + RLS + auth + import tenant #1. *Non négociable.*
- **P1→P3 sur collections CŒUR** : entités, logements, baux, mouvements, quittances, EDL.
- **Realtime sur le cœur** + **multi-membre minimal** (inviter un collègue dans un espace).
- **P4** : outbox offline EDL.
- **Export ZIP universel** : filet de sécurité + RGPD + promesse « tu as tes données ».
- **Hors scope beta** : facturation, miroir multi-provider, onboarding poli.
- **Beta mixte possible** : bailleurs solo + 1-2 petites agences (même backend dès J1).

### Commercialisation
- **P5** : facturation Stripe + rôles/équipes complets + onboarding soigné.
- **Miroir Drive/WebDAV auto** : feature de lancement (premium/différenciateur), construite **selon ce que les beta testeurs ont réclamé**.
- Migration des collections restantes (agenda, équipements…) si non faites.

**Bémol honnête** : 2-3 mois solo pour migrer 47k lignes en multi-tenant est **ambitieux**. Levier de tenue de délai = **réduire le nombre de collections en beta**, *jamais* l'intégrité / RLS / auth.

---

## 15. Roadmap (sizing relatif)

| Phase | Contenu | Sizing |
|---|---|---|
| **P0** | Schéma Postgres + RLS multi-tenant + Auth + import tenant #1 | M |
| **P1** | Couche `Store` synchrone (refacto pur, adossée localStorage, 0 régression, tests Vitest) | M |
| **P2** | Hydratation working-set + écritures serveur-autoritaires (cœur) | L |
| **P3** | Bascule collection par collection vers Supabase + Realtime | L |
| **P4** | Outbox offline EDL / signature | M |
| **P5** | Espaces/équipes/rôles + facturation (Stripe) + onboarding | L |
| **Export/Miroir** | Export ZIP + WebDAV (après P3) | M |
| **Vite** | Modularisation étalée P1→P5 (un domaine à la fois) | — |

Chaque livrable sensible **audité par agent `superpowers:code-reviewer`** avant annonce « prêt à tester ».

---

## 16. Risques principaux & mitigations

| Risque | Mitigation |
|---|---|
| **RLS mal écrite → fuite cross-tenant** | Audit agent obligatoire + tests d'isolation systématiques. Point n°1. `FORCE RLS` partout + garde CI « toute nouvelle table a RLS + ≥1 policy ». |
| **RLS récursive / privilège escaladé** | Lookup d'appartenance via helper `SECURITY DEFINER` minimal et **borné** (`is_member`, `search_path=''`, revoke public) ; policies **par commande** (lecture ≠ écriture) ; interdiction de modifier son propre rôle. |
| **Fuite via canal Realtime / Storage** | La RLS **ne couvre pas** Realtime ni Storage par défaut : policy Realtime privée par espace + policy Storage par préfixe `espace_id/` ancré + URL signée TTL court ; **tests cross-tenant dédiés** (§17-15/16). |
| **Responsable de traitement mal désigné** | Client = responsable, nous = sous-traitant (DPA dans ce sens) ; espace co-détenu = responsabilité conjointe ; voie d'exercice des droits pour tiers sans compte (§11/§17-23). |
| **Realtime manque un événement** | Le cache n'est **jamais** la garantie : resync delta (séquence monotone + tombstones) au focus/reconnexion + `version` sur chaque écriture (§6/§7). |
| **Écriture multi-lignes partiellement appliquée** | Toute opération multi-lignes (quittance+mouvement+solde) via **une RPC Postgres transactionnelle** ; le client n'orchestre jamais N appels (§7). |
| **Incohérence inter-onglets / saisie perdue** | `BroadcastChannel` par espace ; sur rejet de `version`, diff préservé + ré-application proposée, jamais d'écrasement du formulaire (§6/§7). |
| **Item offline orphelin (parent supprimé)** | Échec d'ingestion → **quarantaine** + ré-affectation manuelle ; unicité métier pour dédup EDL multi-devices (§8). |
| **Artefact offline perdu** (outbox jamais flushé, device perdu, logout avec items en attente) | Offline **borné** à EDL+signature ; outbox à **schéma versionné propre** + UUID idempotent client + snapshot auto-portant + timestamp serveur ; alerte forte sur items en attente, blocage du logout. |
| **Webhook Stripe désordonné/perdu** | Dédup `event.id` + `current_period_end` stocké + réconciliation par fetch ; pas de verrouillage instantané. |
| **Effacement RGPD vs rétention légale** | Classes de rétention/base légale + `retention_until` par donnée ; effacement sélectif (§9/§11). |
| **Perte à l'import** (11 collections jadis non-sync, dates écrasées) | Représenter les 19 collections, conserver IDs/timestamps/version, import idempotent, rapport de réconciliation avant go-live (§13). |
| **Conversion async (P2)** | Cache working-set : async aux frontières seulement, pas à chaque lecture. |
| **Sur-scope miroir** | Ordonné : ZIP + WebDAV d'abord, reste piloté par la demande. |
| **Délai beta 2-3 mois** | Réduire les collections en beta, jamais la solidité. |
| **Régression pendant migration** | Strangler : `Store` adossée localStorage d'abord (0 changement fonctionnel), bascule collection par collection, sandbox-first (`index-test.html`). |

---

## 17. Invariants P0 du schéma (punch-list à graver dans le SQL)

Ces invariants ne sont **pas** des choix d'implémentation : ce sont les contraintes qui doivent exister **dès la première migration**, parce que les rétro-ajouter coûte une migration de données + une réécriture RLS. Chaque ligne est un test à écrire.

**Appartenance & partage**
1. `espace_members` est une **table de première classe** (pas un champ tableau) : `(espace_id, user_id, role, invite_status, invite_email, created_at)`. Rôle **par appartenance**, pas par utilisateur. **Enum `espace_role` dès la 1ʳᵉ migration** : `owner`, `gestionnaire`, `lecture_seule`, **`proprietaire`** (consultation d'un seul espace = accès propriétaire en gestion déléguée, D13). Ajouter un rôle a posteriori = migration d'enum + réécriture RLS → on le pose dès P0. Statut d'invitation explicite (`pending` / `active` / `revoked`) + email d'invité pour les invitations avant création de compte.
2. **Invariant dernier propriétaire** : un `espace` a toujours ≥1 membre `role=owner` actif. Trigger refusant la suppression/rétrogradation du dernier owner.

**Isolation tenant**
3. `espace_id` est **estampillé sur chaque ligne métier** (dénormalisé jusqu'aux feuilles : quittances, mouvements, edl…), jamais résolu par jointure à la volée.
4. **Contrainte de cohérence parent/enfant** : l'`espace_id` d'un enfant doit égaler celui de son parent (FK composite ou trigger). Empêche une ligne de « changer d'espace » par effet de bord.
5. **Index composite** `(espace_id, …)` sur chaque table métier (la RLS filtre toujours par espace en premier).
6. **`FORCE ROW LEVEL SECURITY`** sur toutes les tables + **garde CI** : toute nouvelle table sans RLS + ≥1 policy fait échouer le build.
7. Lookup d'appartenance via **helper `SECURITY DEFINER`** minimal (`search_path` figé) pour casser la récursion policy ↔ `espace_members`. Policies **par commande** (`SELECT`/`INSERT`/`UPDATE`/`DELETE` distinctes). Authz du **canal Realtime** alignée sur la RLS.

**Concurrence**
8. Colonne `version bigint` sur chaque table mutable, incrémentée **atomiquement** (`UPDATE … WHERE id=? AND version=?`). 0 ligne affectée = périmé → refetch + notifier.

**Suppression & intégrité légale**
9. **Soft-delete / tombstone** explicite par table (pas de `DELETE` physique tant que la rétention court).
10. `signed_at` + flag `locked` sur bail/EDL ; **trigger d'immutabilité** refusant `UPDATE`/`DELETE` sur une ligne signée — mais **conscient de l'import** (un bail déjà signé importé entre verrouillé sans rejouer la signature). Hash de contenu stocké.
11. **Pas de cascade à travers un signé** : les FK vers un bail/EDL signé sont `ON DELETE RESTRICT`. On ne peut pas effacer un logement qui porte un bail signé sous rétention.

**Rétention & RGPD**
12. `retention_class` + `legal_basis` + `retention_until` par donnée concernée (bail/EDL/quittances = bail + 3 ans ; cautions 3 ans ; candidatures ≤ 3 mois). L'effacement RGPD est **sélectif**, piloté par ces colonnes.

**Facturation & gating**
13. Table **`plans`** data-driven (quotas) + mapping **statut Stripe → entitlement**. `subscription.source ∈ {stripe, trial, comp}` avec **précédence `comp`** (jamais rétrogradé par un webhook Stripe). Client Stripe **rattaché à l'espace** (pas à l'utilisateur). **Dédup webhook** par `event.id`. Contrôle de quota **à l'INSERT uniquement** ; au-delà du quota → **blocage de création + lock**, jamais de destruction.

**Offline borné**
14. Outbox IndexedDB à **schéma versionné propre** (indépendant du schéma serveur) : chaque item porte un **UUID idempotent généré client**, un **snapshot auto-portant**, et reçoit le **timestamp serveur** comme autorité à l'ingestion. Limité à EDL + signature. Flush **ordonné** (FIFO + dépendances) ; échec d'ingestion → **quarantaine** + ré-affectation manuelle ; **contrainte d'unicité métier** (logement+type+période) pour dédupliquer un EDL créé sur deux devices ; budget IndexedDB (photos compressées/plafonnées, gestion `QuotaExceededError`).

**Compléments issus de l'audit adversarial (2026-06-04)** — mêmes exigences P0, numérotés à la suite pour ne pas casser les renvois :

*Isolation (durcissement)*
15. **Policy Realtime explicite par espace** : la RLS Postgres **ne s'applique pas** automatiquement aux canaux Realtime — un client peut s'abonner au `topic` d'un autre tenant. Channels **privés** + policy `realtime.messages` par espace, **testée par un cas cross-tenant** (sinon le filtrage par espace n'est que déclaratif). *Comble le faux-sens du §17-7.*
16. **Isolation Storage par préfixe ancré** : policy `storage.objects` sur le chemin `espace_id/…` (préfixe **ancré**, pas un simple nom de bucket) + **URL signée à TTL court** (elle survit à une révocation de membership) + test cross-tenant.
17. **Helper d'appartenance borné** : signature exacte `is_member(espace_id) returns bool`, `SET search_path = ''`, `REVOKE … FROM public`. Ne retourne **que** l'appartenance — pas de surface d'API plus large (un `SECURITY DEFINER` trop permissif = vecteur d'escalade classique).

*Concurrence & cache*
18. **Écriture multi-lignes = RPC Postgres transactionnelle unique** ; le client ne peut pas orchestrer N appels séparés (quittance+mouvement+solde = une transaction).
19. **Curseur de resync = séquence monotone serveur** (pas `updated_at` seul) **incluant les tombstones** ; full-refetch au-delà d'un seuil de coupure.
20. **Cohérence inter-onglets** : `BroadcastChannel` par espace (ou onglet leader) pour propager les écritures aux onglets frères ; conflit de `version` ne doit **jamais** détruire la saisie en cours (diff préservé, ré-application proposée). Garde `deleted_at IS NULL` dans le `WHERE` versionné (conflit suppression-vs-édition).

*Intégrité légale (modélisation)*
21. **Chaînage des artefacts signés** : `amends_id` (avenant → bail superseded), table `baux_evenements` pour la **résiliation** (sans muter le signé), `signature_source ∈ {immotrack, externe}`. Le trigger d'immutabilité ne s'applique **qu'à la ligne signée**, jamais à l'`INSERT` d'un enfant (quittance) qui la référence.

*Facturation*
22. **Palier `free` existe comme ligne `plans` dès P0** (cible de bascule à l'expiration `trial`). Paliers `solo` / **`co-détenteur`** (espace 2+ owners) / `agence` = des lignes `plans`. **1 abonnement = 1 espace**, quotas **par espace, jamais agrégés** ; espace co-détenu = 1 abonnement, 1 payeur désigné. Quota compté sur les lignes **vivantes** (`deleted_at IS NULL`), à l'**INSERT** seulement. **0 jour de grâce + alertes J-15/J-7/J-1** (lock immédiat mais annoncé). **Réconciliation Stripe = cron quotidien** ; `comp` révocable avec journal ; `granted_at` tracé.

*RGPD*
23. **Désignation du responsable de traitement** : le **client** est responsable, **nous** sous-traitant (DPA dans ce sens) ; espace co-détenu = **responsabilité conjointe**. **RPC d'exercice des droits tiers** (sujet sans compte) sous contrainte de rétention. **Registre des transferts hors-UE** (Stripe US, Google, Cloudflare edge). **Pseudonymisation** de `created_by`/journal append-only (droit à l'effacement vs accountability).

> Règle de revue : **aucun de ces 23 invariants n'est négociable en P0**. La RLS, les policies Realtime/Storage et les triggers d'immutabilité passent par l'agent `superpowers:code-reviewer` (règle gravée) **avant** tout test utilisateur.

---

## 18. Matrice des cas limites couverts (par axe)

Condensé des cas que l'architecture doit gérer **dès le départ** — la demande explicite étant de « penser à toutes ces options dès le début ». Chaque cas est couvert par un invariant (§17) ou une décision (§2) ; rien ici n'est un ajout futur.

| Axe | Cas limites couverts |
|---|---|
| **Espace & partage** | Utilisateur dans plusieurs espaces ; partage sélectif (biens perso vs bien partagé avec l'associé) ; invitation **avant** que l'invité ait un compte ; révocation d'un membre ; un espace = frontière de partage **et** de facturation ; **owner unique injoignable → réattribution admin** ; **agence en gestion déléguée = organisation chapeautant N espaces (1 par propriétaire), personnel membre de tous, isolation propriétaire↔propriétaire gratuite (D13)**. |
| **Rôles & permissions** | Rôle par appartenance (≠ par utilisateur) ; dernier owner protégé ; impossible de modifier son propre rôle ; lecture ≠ écriture (policies par commande) ; **rôle `proprietaire` = consultation de son seul espace (EDL/docs/quittances/baux), aucune écriture ni gestion de membres** ; **isolation Realtime + Storage testée cross-tenant**. |
| **Concurrence** | Deux agents éditent la même fiche ; écriture périmée détectée (`version`) ; **suppression-vs-édition** (`deleted_at IS NULL`) ; **multi-lignes atomique (RPC)** ; **cohérence inter-onglets** ; **saisie préservée sur rejet** ; resync (séquence monotone + tombstones) ; Realtime manque un événement → le cache n'est jamais l'autorité. |
| **Offline** | EDL/signature saisis hors-ligne ; flush **ordonné** idempotent (UUID client) ; **parent supprimé → quarantaine + ré-affectation** ; **doublon multi-devices → unicité métier** ; **quota IndexedDB / photos plafonnées** ; device perdu ; logout bloqué tant que l'outbox n'est pas vidée. |
| **Facturation** | Palier `free` réel (cible de bascule) ; solo 1 logement (= unité de quota) → blocage création, données préservées ; **quotas par espace, jamais agrégés** ; downgrade/**départ du payeur** = lock (jamais destruction, lecture+export garantis) ; `comp` gratuit à vie **révocable** ; `trial` 1 mois + **grâce** ; **proration / remboursement / litige** mappés ; webhook désordonné/rejoué/perdu + **réconciliation cron**. |
| **Intégrité / immutabilité** | Bail/EDL signé non modifiable/supprimable ; **avenant (`amends_id`) / résiliation (`baux_evenements`)** sans muter l'original ; **signature externe importée** sans faux hash ; **quittance créée après signature** non bloquée par le trigger ; pas de cascade destructrice ; hash de contenu. |
| **RGPD / souveraineté** | Résidence UE + **transferts hors-UE déclarés** (Stripe US, Google, Cloudflare) ; **client = responsable / nous = sous-traitant** ; **espace co-détenu = responsabilité conjointe** ; effacement **sélectif** vs rétention ; **droits des tiers sans compte (RPC dédiée)** ; **pseudonymisation** du journal append-only ; export ZIP « vous avez toujours accès à vos données ». |
| **Migration** | **Source de vérité unique choisie** (fin de la divergence PC/téléphone) + rapport de divergence par champ ; 19 collections + **photos EDL** ; IDs/timestamps/version conservés ; **idempotent même après échec partiel** (`ON CONFLICT` + import exempté du lock) ; rapport de réconciliation avant go-live ; tenant #1 = données perso de Didier. |

---

## 19. Découpage en sous-projets (étapes suivantes)

Ce document est la **stratégie maîtresse**. Il est trop large pour un seul plan d'implémentation. Chaque phase fera l'objet de son propre plan (`writing-plans`), à commencer par **P0** (schéma + RLS + auth + import tenant #1), puisque tout en dépend.

**Hors périmètre de cette spec** (à traiter dans les plans dédiés) : choix exact du framework/outillage front au moment de la modularisation Vite, schéma SQL détaillé table par table, design des écrans d'auth/onboarding, intégration Stripe.
