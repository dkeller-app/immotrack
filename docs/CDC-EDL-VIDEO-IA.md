# CDC — État des lieux filmé (vidéo + IA) · EDL-VIDEO-IA

> Statut : **GO Didier le 14/10/2026 (relayé par le Pilotage)**, code sur `feat/edl-video-ia` (v15.734 provisoire).
> Maquette validée : `mockups/EDL-VIDEO-IA/maquette.html` (12 écrans, 3 formats, thèmes sobre et dark).
> Prototype d'extraction sur la vidéo de référence : `mockups/EDL-VIDEO-IA/prototype/` (9 recadrages faits à la
> main retrouvés sur 9 dans les images choisies automatiquement).
> **ÉTEINT EN PRODUCTION** : la bêta tourne sur les offres gratuites ; la vidéo s'ouvre plus tard (§ 7).

## 1. Le principe

« **L'IA lit, la loi décide.** » Filmer une pièce en la commentant produit un **brouillon** : les propositions de
la dictée (v15.733, inchangée) et des **photos tirées de la vidéo** avec leur **instant**. Rien n'entre dans l'EDL
sans validation humaine ; l'EDL reste contradictoire et signé ; si la vidéo ou l'IA échoue, la dictée et la saisie
à la main restent. Différenciant : contradictoire complet (accord, relecture commune), **preuve indexée**
(photo + instant + empreinte SHA-256 de la vidéo non retouchée), chaîne entrée → sortie.

## 2. Décisions de Didier (14/10/2026)

| # | Décision |
|---|---|
| 1 | Base légale : **intérêt légitime** (preuve) + **accord préalable de chaque locataire présent** (case non cochée, cochée par lui) ; refus = pas de vidéo. **À faire valider par l'avocat dans l'AIPD.** |
| 2 | Une case par locataire présent ; le représentant coche pour le représenté. |
| 3 | Copie au locataire : cible = **espace locataire** (chantier à venir). Point d'accroche : `EdlVideo.mediasEDL(edl)`. En attendant : mention PDF « copie remise sur demande ». Aucun lien signé temporaire. |
| 4 | L'IA d'image **ne propose jamais d'état** (ni responsabilité). |
| 5 | « Accepter » garde aussi les photos non écartées. |
| 6 | Quota d'images séparé `AI_QUOTA_IMAGES`. |
| 7 | Migration 0058 : table des médias, suppression interdite d'une vidéo d'EDL signé, purge **automatique** par tâche serveur à restitution du DG + 3 ans, alerte « Ce qui presse » 30 j avant, prolongeable si litige. |
| 8 | 720p (valeur souhaitée), ~1 Mbit/s, 3 min par prise, plusieurs prises par pièce. |
| 9 | Sortie comparée : **lot suivant**, hors de ce chantier (§ 8). |
| 12 | Galerie : 3 min, taille max = celle du plan (50 Mo en gratuit, 200 Mo visés en payant), fichier gardé tel quel. |
| 13 | Client TUS maison testé, sans dépendance. |
| 14 | Horodatages Voxtral inchangés ; « Entendu à mm:ss » seulement si une mesure réelle le valide plus tard. |
| — | **Plans** : bêta sur offres gratuites ; tout le code vidéo derrière un interrupteur éteint par défaut ; activation = plans payants + variables, sans redéploiement de code. |

## 3. Parcours

1. **Pièce** : « Filmer la pièce » + « Dicter seulement » si le relais annonce `video.actif` ; sinon la barre de la
   dictée seule (v15.733). PC : deux boutons dans l'en-tête de pièce.
2. **Accord** (une fois par EDL) : notice (`IaTransparence.noticeVideo()`), une case par locataire présent,
   « Indiquer absent », champ « Représenté par » ; « Filmer » désactivé tant qu'un présent n'a pas coché ;
   « Continuer sans vidéo ». Accords horodatés + version du texte dans l'EDL (`videoAccords`).
3. **Filmer** : viseur plein écran, caméra arrière, 3 min par prise, pause / reprise ; conseils calculés sur
   l'appareil (« Plus lentement : image floue », « Trop sombre ») ; deux fois par seconde, mesure d'une petite
   image grise et capture de l'image la plus nette de chaque vue (`EdlVideoImages.creerSelecteur`) ; le son part
   dans un 2e enregistreur audio (dictée existante).
4. **Traitement** : empreinte SHA-256, vidéo gardée sur l'appareil (IndexedDB `propryo_medias/videos`), file
   d'analyse (`IaFileAttente`, étape `images` : lots de 8, reprise au lot suivant), envoi de la vidéo à part
   (TUS, barre, reprise). Rien entendu → photos quand même ; vidéo éteinte côté relais → propositions de la voix.
5. **Propositions** : cartes de la dictée + vignettes (instant mm:ss, « Écarter »), « Vu à l'image », cartes
   « vu, pas dit » (photos seulement, aucun état). Photo en grand : cadre proposé déplaçable / redimensionnable,
   image voisine, « Garder cette photo ». « Accepter » inscrit l'observation et ajoute les photos gardées à
   l'élément par le pipeline photo existant (`_edlIngestPhoto` → IndexedDB → cloud), avec
   `video:{videoId, piece, prise, t, cadre}` ; « Annuler » les retire.
6. **Import de la galerie** (caméra refusée ou absente) : 3 min au plus, taille ≤ plan ; images tirées en
   relisant la vidéo ; son décodé et réencodé en WAV 16 kHz (fichier ≤ 60 Mo), sinon photos seules.
7. **PDF** : légende « Élément · vidéo Pièce à mm:ss » sous chaque photo de la vidéo ; cadre « Vidéos de l'état
   des lieux » (pièce, durée, date, **empreinte SHA-256 entière**, à l'abri / en attente), accords, conservation
   et copie sur demande ; mention après les signatures étendue « aide à la dictée et à l'image ».
8. **Conservation** : échéance d'après le bail qui couvre l'EDL (`echeanceVideosEDL`), transmise au registre ;
   bandeau dans l'EDL et ligne « Ce qui presse » (famille Documents) 30 j avant ; « Garder : litige en cours »
   (gel d'un an, prolongeable, jamais raccourci).

## 4. Architecture (monolithe gelé, DRY)

| Couche | Fichier | Rôle |
|---|---|---|
| Relais | `relay/src/ai/video.js` | interrupteur `AI_VIDEO`, limites annoncées par `/ai/status` (`video`) |
| Relais | `relay/src/ai/tasks/edl-photos.js` | tâche du registre (images `image_url`, schéma strict, validation : éléments et images connus, cadres bornés, 3 images max, constat sans état ni responsabilité) — même adaptateur `makeAiProvider`, même modèle `mistral-small-latest` |
| Relais | `quota.js`, `routes.js`, `fake.js` | quota `images`, plafond de corps propre à la tâche (4 Mio, seulement vidéo ouverte), faux fournisseur |
| App | `js/core/edl-video-images.js` | mesure, sélecteur continu, lots, mm:ss, cadres |
| App | `js/core/edl-video.js` | accord, fichier, prises, photos, `mediasEDL`, PDF, conservation, WAV |
| App | `js/core/tus-client.js` | envoi reprenable (création, morceaux de 6 Mo, reprise, expiration) |
| App | `js/core/audio-capture.js` | mode vidéo (caméra + 2e enregistreur audio) |
| App | `js/core/ia-file-attente.js` | étape `images` |
| App | `js/core/edl-video-vues.js` | vues ; `edl-voix-vues.js` étendu (vignettes dans les cartes) |
| App | `js/app/app-part2.js` | câblage `_edlVideo…` ; `supabase-entry.js` : `__immoCloudUploadResumable`, `__immoEdlMediaRegister`, `__immoEdlMediaEcheance` |
| Base | `supabase/migrations/0058_edl_medias.sql` | registre, scellé, garde, politiques storage, liste de purge |
| Serveur | `supabase/functions/purge-medias-edl/` | purge planifiée (rôle service) |

## 5. Coûts et volumes (estimations, à confirmer par `mockups/EDL-VIDEO-IA/prototype/mesure-mistral.mjs`)

IA ≈ 0,11 à 0,18 $ par EDL filmé de 7 pièces (~8 min), contre 0,04 $ pour la dictée ; ~65 Mo par EDL filmé ;
~200 Mo par logement en régime établi ; 0,0213 $/Go/mois au-delà des 100 Go du plan Supabase Pro.

## 6. Conservation (sources relevées mot pour mot le 14/10/2026)

Loi n° 89-462, art. 7-1 (LEGIARTI000028777184) : « Toutes actions dérivant d'un contrat de bail sont prescrites par
trois ans à compter du jour où le titulaire d'un droit a connu ou aurait dû connaître les faits lui permettant
d'exercer ce droit. » — art. 22 (délais de restitution d'un et deux mois) — CNIL, délibération n° 2021-057, § 53 et
54 (base active jusqu'à la clôture des comptes, puis archivage intermédiaire le temps de la prescription ; plus
longtemps en cas de contentieux). Décret n° 2016-382, art. 2 1° h (« illustré d'images ») et art. 3 3°.

## 7. Activation (plus tard, avec les premiers clients payants) — sans redéploiement de code

Prérequis : migration 0058 appliquée (pilotage), fonction Edge `purge-medias-edl` déployée, AIPD faite avec
l'avocat, rétention zéro Mistral confirmée (sinon la notice dit « 30 jours au plus », déjà le cas).
1. **Supabase → plan Pro** ; Storage → Settings → *Global file size limit* ≥ 200 Mo.
2. **Cloudflare → Workers Paid** (CPU : 30 s par requête au lieu de 10 ms).
3. **Variables du relais** (tableau de bord Cloudflare → Workers → `bail-sign-relay` → Settings → Variables) :
   `AI_VIDEO = "true"`, `AI_VIDEO_FILE_MAX_BYTES = "209715200"`, `AI_QUOTA_IMAGES = "2000"`.
   Les reporter aussi dans `relay/wrangler.toml` au déploiement suivant (sinon `wrangler deploy` les écrase ;
   ou `wrangler deploy --keep-vars`).
4. **Purge planifiée** (SQL, une fois) : secret `PURGE_CRON_SECRET` posé (`supabase secrets set`), puis
   `select cron.schedule('purge-medias-edl', '17 3 * * *', $$ select net.http_post(url := 'https://<projet>.supabase.co/functions/v1/purge-medias-edl', headers := jsonb_build_object('x-purge-secret', '<secret>')) $$);`
   (extensions `pg_cron` et `pg_net` à activer dans le tableau de bord).
5. Vérifier `GET /ai/status` → `video.actif: true` ; « Filmer la pièce » apparaît à l'ouverture suivante d'un EDL.
Pour éteindre : retirer `AI_VIDEO`. Les vidéos déjà prises restent (stockage, registre, PDF).

## 8. Lot suivant : sortie comparée (hors de ce chantier, décision 9)

À la sortie, pour chaque élément, la photo d'entrée (figée, signée) à côté de la photo de sortie proposée, au même
cadrage si possible (maquette écran 8). Base déjà posée : les photos des deux EDL portent `video.t` et `cadre` ;
`mediasEDL()` les liste ; la visionneuse entrée / sortie existe (`_edlPhotoSrc`). À faire : appariement des photos
par élément (pur, testé), vue côte à côte dans les cartes de sortie, option « recadrer comme à l'entrée ». Le
verdict reste déduit (`verdictDe`) ; l'IA ne dit jamais « dégradation » ni qui paie.
