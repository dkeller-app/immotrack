# CDC — Circuit d'un incident : locataire → artisan → fin

**Version 2 — 14/10/2026 — GO de Didier sur les recommandations D1 à D18 (relayé par le pilotage le 14/10). Document de référence du chantier, versionné dans le dépôt** (la maquette reste dans le dossier gitignoré `mockups/INCIDENT-CIRCUIT/` de `DesktopImmo`).
Chantier `feat/incident-circuit` (worktree `Desktop\Immo-wt-incident-circuit`, base `origin/main` 62721002 = v15.736). Remplace et précise le § 8 de `docs/CDC-PROPRYO.md`.
Maquette : `mockups/INCIDENT-CIRCUIT/maquette.html` (écrans locataire, propriétaire, artisan, schéma ; 3 formats ; sobre et dark). Captures : `mockups/INCIDENT-CIRCUIT/captures/` (58 PNG + `_mesures.json`).

---

## 1. Ce qui existe (audit du 14/10, fichiers et lignes)

| Brique | Fait établi |
|---|---|
| Registre | Table `incidents` (0057) : colonnes `statut` (`signale`/`en_cours`/`resolu`, contrainte l.43) + `legacy_raw` jsonb qui porte tout l'incident ; RLS forcée par SCI (l.62-73). Forme : `nouvelIncident` (`js/core/incidents.js:39-69`). |
| Moteur | `js/core/qui-paie.js` : entrée `{element, nature, intervention, cause, urgences[], contexte}` (`_norm` l.189-206) ; sortie `{payeur, regle, confiance, resume, textes[], lectures[], pieces, metier…}` (l.251-259). **Aucun montant, aucune « part »** : le payeur prend toute la facture ou rien ; zone grise = 2 lectures, le propriétaire choisit (`_incDecider`, `app-part2.js:15925`). |
| Formulaire actuel | `_incSaisieHtml` (`app-part2.js:15693-15743`) : demande cause (dont « Faute ou négligence du locataire »), « ce qui semble nécessaire », âge, contexte. C'est ce que le smoke v15.732 juge trop compliqué. |
| Qui appeler | `_incAppelerHtml` (`app-part2.js:15966-16011`) : carnet (8 max), annuaire officiel **par code postal, tri alphabétique** (`annuaireUrl`/`lireAnnuaire`, `incidents.js:131-164`), RGE ADEME par code postal (`rgeUrl`/`lireRge`, l.167-186), assistance MRH/PNO, saisie libre. `_incNoterArtisan` pose `inc.artisan = {nom, siret, tel, source, metier}`. |
| Carnet d'artisans | **Aucun stockage** : `carnetArtisans()` le **calcule** (incidents.js:194-215) depuis `inc.artisan` et `DB.equipements[..].interv`. Champs : nom, siret, tel, metier, date. **Pas d'e-mail, pas d'adresse, pas de métier pour les intervenants d'entretien.** |
| Facture → Finances | `_incEnregistrerFacture` (`app-part2.js:16120-16155`) → `_mvCreate(mv,{save:false})` (`app-part1.js:3477`, `js/core/mv-create.js:37`). **`_mvCreate` n'a pas d'idempotence** ; le seul garde est `btn.disabled` (l.16128) + l'exclusivité `incidentId` (`mouvementsRattachables`, incidents.js:287-302). |
| Espace locataire | 0059 : `locataire_signalements` (l.160-178 : `piece`, `element` = clé de `PROBLEMES`, `urgence` faible/importante/urgente, description, ≤ 6 photos, `incident_legacy_id`). `el_signaler` (l.797, 10 / 24 h). `el_signalements` (l.823-850) ne renvoie que statut et dates — « JAMAIS le verdict, le payeur, l'artisan ». Import : `importerSignalements()` (`js/app/espace-locataire-app.js:544-594`) crée l'incident avec `element:'autre'`. |
| Lien public | Patron `/l` : jeton 32 octets tiré dans le navigateur du propriétaire, **dans le fragment** `#`, seule l'empreinte SHA-256 en base (`locataire_acces_jeton`), relais = identité technique sans clé de service, RPC filtrées `^el_[a-z_]+$` (`relay/src/el-supabase.js:53`), CSP stricte (`relay/src/espace-locataire.js:21-26`). **`Permissions-Policy: microphone=()`** (l.26) : la dictée est aujourd'hui **interdite** sur `/l`. |
| Socle IA | `makeAiProvider` (`relay/src/ai/provider.js:122`, Voxtral mini + Mistral Small), registre `relay/src/ai/tasks/index.js` (`edl-piece`, `edl-photos`), quota KV par **utilisateur connecté** (`quota.js` : 3 600 s audio, 200 appels, 2 000 images / jour), routes `/ai/*` **toutes derrière `requireSupabaseUser`** : rien n'est appelable depuis un lien public aujourd'hui. Mentions : `ia-transparence.js` (`MENTION_PROPOSITION`, `RETENTION_ZERO=false`). |
| Envoi | `EMAIL_MODE="dev"` (aucun envoi réel), pas de SMS. `_openShareModal` (`app-part1.js:4218`) : e-mail, SMS, WhatsApp, QR, partage natif. |
| CDC Travaux | `mockups/TRAVAUX-QUI-PAIE/CDC-TRAVAUX-QUI-PAIE.md` **introuvable sur le disque** (worktree supprimé). Substituts lus : `PROMPT-CHANTIER-TRAVAUX-QUI-PAIE.md` (refacturation au locataire « hors périmètre : aucun mécanisme n'existe hors retenue sur dépôt de garantie ») et le rapport `DOSSIER-BP/reports/EDL visio travaux et dossiers.md` (étape 6 : « plafond d'auto-validation configurable par catégorie »). |

---

## 2. Le circuit cible (schéma : écran « Schéma » de la maquette)

| # | Qui | Ce qui se passe | Niveau (CDC § 5.2) |
|---|---|---|---|
| 0 | Propriétaire | Fixe **une fois** le plafond d'intervention directe de chaque structure (SCI, nom propre). | 1 clic, une fois |
| 1 | Locataire | Décrit dans `/l` avec ses mots (voix ou texte) + photos. L'IA reformule, pose **au plus 2 questions**, déduit élément, nature, urgence. Urgence : **seulement** les consignes de `QuiPaie.consignesUrgence`. | — |
| 2 | Propryo | Élément → métier (`elementDef(k).metier`). Un artisan du carnet couvre le métier → il reçoit son lien (copie au propriétaire). Sinon → alerte au propriétaire + liste suggérée. | Auto |
| 2 bis | Propriétaire | Seulement si aucun artisan au carnet : choisit dans la liste, saisit le téléphone, envoie. | 1 clic |
| 3 | Artisan | Page `/a` sans compte : plafond, description, photos, accès, contact (avec accord). Propose un créneau ; le locataire le confirme. Dépose le **devis avant d'intervenir** : ≤ plafond → accepté automatiquement ; > plafond → au propriétaire. Explique à la voix ce qu'il a constaté et fait ; l'IA propose un **constat neutre**, l'artisan le confirme ; dépose facture et photos. | Auto (≤ plafond) |
| 3 bis | Propriétaire | Devis > plafond : accepter / refuser. | 1 clic |
| 3 ter | Propriétaire | Lien non utilisé : dépose la facture, l'IA la lit (montant, TVA, SIRET, travaux, constat probable), il confirme. | Rattrapage |
| 4 | Propryo | Constat → entrée du moteur (§ 5) → verdict **inchangé** de `qui-paie.js`, textes cités. | Auto |
| 5 | Propriétaire | **Valide** (engagement financier) : verdict (zone grise : choisit une lecture), dépense créée **une fois** dans Finances (`_mvCreate`, ou rattachement d'un mouvement bancaire existant). | 1 clic |
| 6 | Locataire | Voit le résultat expliqué : constat, « à la charge du bailleur » ou « à la charge du locataire : montant », textes cités, facture ; peut contester par message. | Auto après 5 |

**Avant l'étape 5, rien sur la cause ni sur « qui paie »**, ni au locataire, ni au propriétaire (le devis montre le constat, pas la répartition), ni à l'artisan (jamais). Le locataire voit seulement : **Signalé → Intervention prévue → Terminé** (correspondance : `signale` / `en_cours` / `resolu`, contrainte 0057 inchangée).

---

## 3. Plafond d'intervention (décidé)

- **Réglage par structure** (chaque SCI a le sien ; les associés en écriture le voient et le modifient), **défaut proposé 300 € TTC, déplacement compris**, avec surcharge facultative **par métier** (exemple maquetté : chauffage et eau chaude 450 €).
- **Actif seulement après validation explicite une fois** (c'est un engagement financier, principe 1 du CDC). Avant : plafond 0, tout devis passe par le propriétaire — le circuit fonctionne quand même.
- **Urgence** : mise en sécurité (couper, colmater, sécuriser une porte) toujours autorisée, limitée aux « pièces de rechange et travaux strictement nécessaires pour répondre à l'urgence » (L221-28 8°), **dans la limite du même plafond** ; la réparation au-delà passe par un devis (D2).
- **Devis toujours déposé avant les travaux, même sous le plafond** : il est accepté automatiquement au nom du propriétaire et horodaté. C'est ce qui rend le plafond compatible avec l'arrêté de 2017 (devis préalable remis au client). Jamais bloquant : sans devis déposé, l'intervention reste enregistrée avec la mention « sans devis déposé » (D3).
- **Le serveur décide** (fonction `ar_*`) : montant TTC déclaré par l'artisan ≤ plafond figé à l'émission du lien → « accepté automatiquement » ; sinon « en attente ». L'IA relit le PDF : si le montant lu dépasse le montant déclaré, alerte au propriétaire avant la validation finale.
- **Ce que voit l'artisan** : « Intervention directe autorisée jusqu'à 300 € TTC, déplacement compris, sans attendre de réponse. Au-delà : déposer un devis, réponse du propriétaire en 1 clic. »
- **Pièces remplacées** (annexe 2 de l'arrêté) : réglage « ne pas conserver, mais photo de chaque pièce remplacée » par défaut (la photo sert de preuve du constat) ou « conserver » (D4).

---

## 4. Réglementation du dépannage (Légifrance, relevé le 14/10/2026)

**Titre exact** : *Arrêté du 24 janvier 2017 relatif à la publicité des prix des prestations de dépannage, de réparation et d'entretien dans le secteur du bâtiment et de l'équipement de la maison* (NOR ECFC1701378A, JORF n° 0024 du 28/01/2017, en vigueur depuis le 01/04/2017). Le titre cité dans le prompt (« relatif à l'information des consommateurs… ») est inexact ; c'est l'objet de la notice. Sources : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000033935513 (texte) et https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000033959893 (art. 4, version en vigueur depuis le 01/04/2017).

**Art. 2** : « En application des articles L. 112-1 et L. 112-3 du code de la consommation, le professionnel communique au consommateur préalablement à la conclusion d'un contrat de prestation de services visés à l'article 1er, les informations suivantes : - le ou les taux horaires de main-d'œuvre toutes taxes comprises (TTC) ; - les modalités de décompte du temps estimé ; - le cas échéant, les prix TTC des différentes prestations forfaitaires proposées, notamment les prix au mètre linéaire ou au mètre carré ; - le cas échéant, les frais de déplacement ; - le caractère payant ou gratuit du devis et, le cas échéant, le coût d'établissement du devis ; - le cas échéant, toute autre condition de rémunération. »

**Art. 4, I** : « Préalablement à l'exécution de toute prestation visée à l'article 1er, conclue en établissement commercial, le professionnel remet au client un devis détaillé, qui comporte, outre les mentions des articles L. 111-1 et L. 111-2 du code de la consommation, les mentions suivantes : - la date de rédaction ; - le nom et l'adresse de l'entreprise ; - le nom du client ; - le lieu d'exécution de l'opération ; - la nature exacte des réparations à effectuer ; - le décompte détaillé, en quantité et en prix, de chaque prestation et produit nécessaire à l'opération prévue : dénomination, prix unitaire et désignation de l'unité à laquelle il s'applique (notamment l'heure de main-d'œuvre, le mètre linéaire ou le mètre carré) et la quantité prévue ; - le cas échéant, les frais de déplacement ; - la somme globale à payer hors taxes et toutes taxes comprises, en précisant le taux de TVA ; - la durée de validité de l'offre ; - l'indication du caractère payant ou gratuit du devis. »

**Art. 4, II** : « Lorsque le contrat est conclu hors établissement au sens de l'article L. 221-1, le devis détaillé revêt la forme du contrat déterminée aux articles L. 221-5 et L. 221-9 du code de la consommation. […] »

**Art. 4, III** : « Dans le devis visé au I précité ou dans le contrat conclu hors établissement commercial visé au II précité, le consommateur doit être informé qu'il peut conserver les pièces, les éléments ou appareils remplacés. Cette information s'effectue selon un modèle-type figurant en annexe du présent arrêté. »

**Art. 5** : « Toute prestation visée au présent arrêté doit faire l'objet dès qu'elle est exécutée et, en tout état de cause avant le paiement du prix, de la délivrance d'une note dans les conditions prévues par l'arrêté du 3 octobre 1983 modifié. »

**Code de la consommation, art. L221-28, 8°** (version en vigueur depuis le 28/05/2022) — le droit de rétractation ne peut être exercé pour les contrats : « De travaux d'entretien ou de réparation à réaliser en urgence au domicile du consommateur et expressément sollicités par lui, dans la limite des pièces de rechange et travaux strictement nécessaires pour répondre à l'urgence ; » — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563170

**Code de la consommation, art. L221-10, al. 1 et 4°** (en vigueur depuis le 01/07/2016) : « Le professionnel ne peut recevoir aucun paiement ou aucune contrepartie, sous quelque forme que ce soit, de la part du consommateur avant l'expiration d'un délai de sept jours à compter de la conclusion du contrat hors établissement. » ; exception : « 4° Les contrats ayant pour objet des travaux d'entretien ou de réparation à réaliser en urgence au domicile du consommateur et expressément sollicités par lui, dans la limite des pièces de rechange et travaux strictement nécessaires pour répondre à l'urgence. » — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226864

**Loi n° 89-462, art. 7 e)** (version en vigueur depuis le 15/06/2025), extraits utiles au rendez-vous : « Avant le début des travaux, le locataire est informé par le bailleur de leur nature et des modalités de leur exécution par une notification de travaux qui lui est remise en main propre ou par lettre recommandée avec demande d'avis de réception. Aucuns travaux ne peuvent être réalisés les samedis, dimanches et jours fériés sans l'accord exprès du locataire. » — https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000051748585

**Qui est le « client »** : le **propriétaire** (personne physique ou SCI) qui commande et paie ; le logement loué est le « lieu d'exécution de l'opération » — l'art. 4 I distingue lui-même « le nom du client » et « le lieu d'exécution ». Le locataire n'est pas partie au contrat ; il donne l'accès (art. 7 e). Le devis et la facture sont donc **à l'ordre du propriétaire**. Point à confirmer par l'avocat : une **SCI** (personne morale) n'est pas un « consommateur » ; Propryo applique les mêmes règles quel que soit le statut (option conservatrice).

---

## 5. Constat neutre → entrée du moteur (règles de `qui-paie.js` inchangées)

L'élément et la nature viennent du signalement (IA locataire, corrigeables par l'artisan) ; le contexte de `contexteDe({bail, imm})`. Le constat et l'ampleur viennent de l'artisan (ou de la facture lue, confirmée par le propriétaire).

| Constat (affiché) | `cause` | Remarque |
|---|---|---|
| Pièce usée par le temps + petite réparation | `usage_normal` | Menue réparation : locataire si l'élément est dans la liste du décret 87-712, bailleur sinon (R1 / R4) |
| Pièce usée par le temps + remplacement complet | `vetuste` | Élément en fin de vie : bailleur (R2, art. 7 d + art. 1755) — D9 |
| Entretien courant non fait | `defaut_entretien` | |
| Pièce cassée (choc, mauvais usage) | `faute_locataire` | Libellé jamais montré : « dégradation pendant le bail (art. 7 c) », présomption avec ses exceptions citées — D10 |
| Défaut de l'appareil ou de l'installation | `malfacon_vice` | |
| Cause extérieure — un voisin, une personne | `tiers` | Zone grise R5 (tiers introduit ou non) |
| Cause extérieure — intempérie, événement | `force_majeure` | |
| Sinistre (assurance) | `sinistre` | Circuit assurance R15, checklist existante |

| Ampleur | `intervention` |
|---|---|
| Petite réparation | `petite_piece` |
| Remplacement complet | `remplacement_complet` |
| Entretien ou réglage (proposée, D11) | `entretien` (le moteur a des règles propres : chaudière R6, liste du décret) |

Module pur nouveau `js/core/incident-circuit.js` (TDD) : `entreeMoteur(constat, ampleur, signalement, contexte)`, `etapeLocataire(inc)`, `decisionDevis(montant, plafond)`, `artisanDuCarnet(carnet, metier)`, `trierSuggestions(liste, logementLatLon, dejaUtilises)`, `lienArtisanExpire(...)`.

---

## 6. Artisans suggérés : ce que les sources permettent réellement (vérifié le 14/10)

**API Recherche d'entreprises** (`https://recherche-entreprises.api.gouv.fr/openapi.json`, déjà dans la CSP, CORS ouvert `*`) :
- `GET /near_point?lat&long&radius` (rayon **≤ 50 km**) + `activite_principale` (code NAF, liste séparée par des virgules) + `per_page` **≤ 25** + `page`. **Pas de filtre `etat_administratif` documenté sur `/near_point`** ; **résultats non triés par distance**. Chaque unité légale porte `date_creation`, `etat_administratif`, `complements.est_rge`, et `matching_etablissements[]` avec `latitude`, `longitude`, `etat_administratif` (des établissements fermés `F` remontent : test réel), `liste_rge`, `date_creation`.
- `GET /search` : `activite_principale` (**s'applique à l'unité légale, pas à l'établissement**), `code_postal` / `code_commune` / `departement` (filtrent les établissements), `etat_administratif=A`, `est_rge=true`, `per_page ≤ 25`. C'est ce qu'utilise le code actuel (par code postal).
- **Aucun téléphone ni e-mail** dans l'annuaire. Limite : **7 requêtes/s par IP**.
- Test réel (Mulhouse, plomberie 43.22A, 5 km) : **208** unités légales ; à 10 km : 282. Impossible de tout trier côté serveur → stratégie : rayon 2 km, puis 5, puis 10 tant qu'il y a moins de 8 établissements actifs ; 2 pages (50) au plus par rayon ; distance calculée dans le navigateur (haversine depuis les coordonnées BAN du logement, API déjà dans la CSP) ; tri par distance ; 10 affichés + « Élargir ».
- Note : le champ `activite_principale_naf25` apparaît dans les réponses (nouvelle nomenclature NAF 2025) : garder la table `NAF_METIERS` (NAF rév. 2) et la doubler quand l'INSEE basculera.

**Liste RGE ADEME** (data-fair, `data.ademe.fr`, déjà dans la CSP, CORS `*`, Licence Ouverte ; jeu `liste-des-entreprises-rge-2` mis à jour le 14/10/2026, ~158 000 lignes) :
- Filtre **`geo_distance=lon,lat,Rkm`** (résultats **triés par distance**, `_geo_distance` en mètres) + `qs=domaine:"…"` ; champs **`telephone`, `email`, `site_internet`**, `domaine`, `lien_date_fin` (validité), `organisme`.
- 31 domaines (ex. « Chaudière condensation ou micro-cogénération gaz ou fioul », « Pompe à chaleur : chauffage », « Chauffe-Eau Thermodynamique », « Fenêtres, volets, portes donnant sur l'extérieur », « Ventilation mécanique »). Pertinent pour chauffage, eau chaude, menuiserie extérieure, ventilation, isolation — pas pour un dépannage de plomberie ou de serrurerie.
- C'est la **seule source publique avec un téléphone** : quand une entreprise suggérée est RGE, son téléphone est prérempli.

**Critères affichés** (validés) : métier (NAF) · entreprise active · distance · RGE pour l'énergie · ancienneté · en tête, artisans déjà utilisés par le propriétaire ou ses associés (date de la dernière intervention). Mention : « Propryo liste selon des faits publics et ne recommande personne. Pas d'avis de clients ni d'assurance décennale : non vérifiables. Pas de commission. »

---

## 7. Lien artisan, données, migration 0060

- **Patron `/l` recopié** : page `GET /a`, jeton dans le fragment, empreinte seule (`artisan_acces_jeton` illisible), RPC `ar_*` réservées à l'identité technique du relais (élargir le filtre de `el-supabase.js` à `^(el|ar)_[a-z_]+$`), CSP identique, limites de débit, dépôts par ticket (octets magiques, 10 Mo).
- **Un lien par incident et par artisan**, révocable, **expire 30 jours après la validation finale** (pour déposer une facture tardive), 90 jours au plus (D14).
- **L'artisan voit** : adresse, accès, prénom et nom du locataire, **téléphone seulement si le locataire l'a accepté** (D13), description reformulée, photos, plafond, réponse à ses devis. **Il ne voit pas** : bail, loyer, autres biens, verdict, « qui paie ».
- **0060** (SQL + simulation `supabase/tests/sim/0060-incident-circuit.sim.mjs` + `node scripts/check-rls-coverage.mjs`) :
  - `artisans` (carnet réel par SCI : nom, SIRET, métiers[], téléphone, e-mail, adresse, « prévenir directement ») — alimentée par migration du carnet dérivé actuel (D5) ;
  - `incident_reglages` (par entité : plafond TTC, plafonds par métier, pièces remplacées, validé le / par) ;
  - `artisan_acces` + `artisan_acces_jeton` + `artisan_depots` (devis, facture, photos, constat ; statut du devis `auto_accepte` / `en_attente` / `accepte` / `refuse`, décidé le / par) ;
  - `locataire_signalements` : colonnes `ia` (résumé, élément, nature, urgence, questions-réponses), `tel_partage`, `acces_info`, `presence`, `creneau` (+ confirmation, accord week-end), `resultat` + `resultat_publie_le` ; `el_signalements` renvoie `resultat` **seulement** une fois publié.
- **Relais** : `Permissions-Policy` de `/l` et `/a` passe à `microphone=(self)` (aujourd'hui `microphone=()` bloque la dictée).
- **Envoi** : tant que `EMAIL_MODE="dev"` et sans SMS, « prévenir directement » = notification dans l'app + **un bouton** « Envoyer la demande à X » qui ouvre `_openShareModal` (SMS prérempli) ; automatique dès l'activation de Resend / Octopush (D6).
- **Argent** : la dépense est créée **une seule fois**, au clic « Valider » (étape 5), par `_mvCreate` ou par rattachement d'un mouvement existant (`mouvementsRattachables`). Ajouter un garde d'idempotence dans le chemin incident (refus si `inc.mouvementIds` non vide sans geste explicite). Relecture Fable ciblée prévue.

---

## 8. IA : tâches, quotas, coût par incident

Nouvelles tâches du registre `relay/src/ai/tasks/` (même adaptateur `makeAiProvider`) :
- `incident-locataire` : transcription + photos → `{resume, piece, element, nature, urgence, questions[≤2]}` ; jamais de cause.
- `constat-artisan` : transcription + photos → `{constat (6 valeurs), sousType tiers|evenement, ampleur, resumeTravaux, citations}` ; l'artisan confirme.
- `lecture-facture` (sert aussi au devis) : PDF/photo → `{entreprise, siret, date, numero, montantHT, tva, montantTTC, lignes[], constatProbable}` ; SIRET vérifié dans l'annuaire (`employeur.js`, `normaliserIdentifiant`).

Routes publiques nouvelles (`/api/el/ia/*`, `/api/ar/ia/*`) authentifiées par le jeton du lien, **quota par lien** imputé au compte du propriétaire (proposé : 6 appels + 5 min d'audio par signalement ; 10 appels + 10 min par lien artisan) (D15). Mention AI Act art. 50 avant la dictée ; voix non conservée.

**Coût** (tarifs docs.mistral.ai relevés le 14/10/2026 : Voxtral Mini Transcribe 2 = 0,003 $/min ; Mistral Small 4 = 0,15 $ / 0,60 $ par million de jetons ; OCR 4.1 = 4 $ / 1 000 pages) :

| Tâche | Hypothèse | Coût |
|---|---|---|
| Locataire | 45 s de dictée ; 2 tours avec 3 photos (~11 000 jetons d'entrée, 400 de sortie par tour) | ≈ 0,006 $ |
| Artisan | 90 s de dictée ; 1 tour avec 3 photos + devis (~10 000 / 500) | ≈ 0,006 $ |
| Lecture du devis ou de la facture | 1-2 pages en image (~7 500 / 400) | ≈ 0,002 $ |
| **Total typique** | | **≈ 0,015 $, soit 1 à 2 centimes d'euro par incident** |
| Pire cas (6 photos, 3 min de dictée chacun, relances) | | ≈ 0,05 $ |

---

## 9. RGPD (inscrit au registre `docs/legal/RGPD-REGISTRE.md`)

Nouveau traitement « Incidents et interventions » : finalité entretien du logement (obligation du bailleur, art. 6 c) ; données du locataire transmises à l'artisan **minimisées** (prénom, nom, adresse, accès, téléphone seulement avec accord) ; artisan = nouveau destinataire, accès par lien limité à son incident, **30 jours après la fin** ; Mistral AI (sous-traitant, UE) pour la transcription et la lecture, voix non conservée, `RETENTION_ZERO=false` tant que non confirmé ; données des artisans (entreprises, données publiques ou fournies) ; durée de conservation de l'incident alignée sur le dossier du bail (preuves).

---

## 10. Décisions arrêtées (GO de Didier le 14/10 : recommandations retenues telles quelles)

1. **D1 — Plafond** : défaut **300 € TTC par structure, actif après une validation unique**, surcharge par métier facultative. (Alternative : aucun défaut, le propriétaire saisit.)
2. **D2 — Urgence** : **mise en sécurité toujours autorisée dans la limite du même plafond** ; au-delà, devis en 1 clic. (Alternative : plafond d'urgence distinct, plus haut.)
3. **D3 — Devis toujours déposé avant les travaux, même sous le plafond (accepté automatiquement)** — conformité arrêté 2017 art. 4 ; jamais bloquant.
4. **D4 — Pièces remplacées : « ne pas conserver + photo de la pièce » par défaut**, modifiable.
5. **D5 — Créer une vraie table `artisans`** (carnet par SCI avec métiers, téléphone, e-mail), alimentée par migration du carnet dérivé. Sans elle, « prévenir directement » est impossible (pas d'e-mail, métier inconnu pour les intervenants d'entretien).
6. **D6 — Avant l'activation des e-mails et SMS : un bouton « Envoyer la demande » (fenêtre d'envoi existante)** ; automatique ensuite.
7. **D7 — Liste suggérée triée par distance**, déjà utilisés en tête (le code actuel trie par ordre alphabétique).
8. **D8 — Contact d'une entreprise suggérée : téléphone prérempli seulement s'il vient de la liste RGE ; sinon lien vers la fiche officielle + saisie** par le propriétaire.
9. **D9 — « Pièce usée par le temps » : petite réparation = usage normal (locataire si l'élément est dans la liste du décret) ; remplacement complet = vétusté (bailleur).**
10. **D10 — « Pièce cassée (choc, mauvais usage) » → règle de l'art. 7 c (présomption, exceptions citées), libellé « dégradation pendant le bail », jamais « faute ».** (Alternative : cause « inconnue » → toujours « à arbitrer ».)
11. **D11 — Ajouter une 3e ampleur « entretien ou réglage »** (le moteur la distingue).
12. **D12 — Le locataire voit le nom de l'entreprise et le créneau dès « Intervention prévue »** (nécessaire pour ouvrir ; modifie le § 1.3 pt 5 du CDC Espace locataire) ; **il confirme le créneau ; accord exprès coché si samedi, dimanche ou jour férié** (art. 7 e).
13. **D13 — Téléphone du locataire transmis à l'artisan seulement avec son accord coché au signalement.**
14. **D14 — Lien artisan : un par incident, expire 30 jours après la validation finale (90 jours au plus), révocable.**
15. **D15 — IA depuis les liens publics : routes dédiées, quota par lien imputé au compte du propriétaire** (6 appels + 5 min / signalement ; 10 appels + 10 min / lien artisan).
16. **D16 — Réparation à la charge du locataire** : la dépense est enregistrée une fois ; **lot 1 = montant affiché au locataire avec la facture et les textes, suivi « remboursé oui / non » ; le remboursement arrive par l'import bancaire** ; son traitement dans Finances et la 2044 (dépense refacturée) **à trancher avec le comptable** avant le code. (Alternative : hors périmètre, comme dans le chantier Travaux.)
17. **D17 — Simplifier aussi la saisie côté propriétaire** (v15.732) : mêmes champs que le locataire (où, quoi, description, photos, urgence) ; cause, ampleur et âge déplacés à la fin.
18. **D18 — Questions avocat** (à joindre à la liste T1-T7) : SCI = client non consommateur ? acceptation automatique d'un devis par plafond = mandat valable ? notification de travaux de l'art. 7 e pour un dépannage demandé par le locataire ? réclamer au locataire une réparation locative faite par le bailleur en cours de bail.

---

## 11. Lots de la phase 2 (1 lot = 1 commit, TDD)

a) `js/core/incident-circuit.js` + tests (mapping § 5, étapes locataire, décision devis, carnet, tri des suggestions, expiration). b) Migration 0060 + simulation + couverture RLS. c) Relais `/a`, `ar_*`, dépôts, Permissions-Policy micro. d) Tâches IA + routes publiques + quotas par lien. e) Espace locataire : assistant, urgence, suivi, créneau, résultat. f) App propriétaire : plafond, prévenance, liste suggérée, devis, lecture de facture, validation finale, saisie simplifiée. g) Registre RGPD. Puis phase 3 (gates, parcours au geste réel des 3 acteurs, charte mesurée, audit Opus de tout le diff, Fable ciblé : frontière du lien artisan, plafond et `_mvCreate`, 0060 + RLS) et phase 4 (branche poussée, ordre : migration 0060 → relais → front).

---

## 12. Mesures de la maquette

`captures/_mesures.json` (58 captures) : aucun débordement horizontal, champs ≥ 16 px, cibles ≥ 44 px, une seule action corail par écran, aucun emoji. **Écart hérité, non propre au chantier** : le bouton corail du thème sobre (texte blanc sur `#ff5a3c`) mesure **3,1:1**, et la pastille corail (`--acc2` sur `--acc-bg`) **4,0:1**, sous les 4,5:1 de M-17 — mêmes jetons que l'app et que la page `/l` en production (`relay/public/el.css:11,88,115`). À signaler au pilotage (jeton global), pas corrigé ici.

---

## 13. Avis clients des artisans (point en attente de Didier — comportement par défaut)

En attendant l'arbitrage, deux choses seulement :
- **(a)** un lien « Voir les avis en ligne » sur chaque entreprise (carnet ou liste suggérée) qui ouvre une **recherche Google Maps** sur « nom + commune » (`https://www.google.com/maps/search/?api=1&query=…`). Aucune API, **aucune donnée récupérée, stockée ni affichée par Propryo** ;
- **(b)** une **note privée** du propriétaire sur chaque artisan de son carnet, visible de lui et des associés de la SCI seulement (RLS par SCI de la table `artisans`), jamais publiée ni partagée entre comptes.

**Exclu** : API Google Places, avis partagés entre utilisateurs de Propryo (régime des avis en ligne, art. L111-7-2 du code de la consommation). Si Didier tranche autrement, le pilotage relaie.

## 14. Architecture retenue pour le code (phase 2)

| Couche | Fichier | Rôle |
|---|---|---|
| Module pur | `js/core/incident-circuit.js` | Constats, ampleurs, constat → entrée du moteur (§ 5), étapes vues du locataire, décision du devis (plafond), plafond par métier, carnet (couverture d'un métier, migration du carnet calculé, artisans déjà utilisés), suggestions (URL `/near_point`, lecture, distance, tri), RGE par géolocalisation, accord exprès (week-end et jours fériés, dont Alsace-Moselle), lien d'avis, demande minimisée envoyée à l'artisan, expiration du lien, résultat publié au locataire. TDD Vitest. |
| Migration | `supabase/migrations/0060_incident_circuit.sql` + `supabase/tests/sim/0060-incident-circuit.sim.mjs` | Tables `artisans` (carnet synchronisé), `artisan_acces` + `artisan_acces_jeton` + `artisan_depots` + `artisan_ouvertures` ; colonnes nouvelles de `locataire_signalements` ; fonctions `ar_*` (côté artisan : identité technique du relais ; côté propriétaire : RLS par SCI) ; `el_signalements` enrichie (entreprise et créneau, résultat publié) ; `el_creneau_confirmer`, `el_ia_autorise`, `ar_ia_autorise` ; politiques du seau pour les dépôts de l'artisan. |
| Synchro | `store-mapping.js`, `store-supabase.js`, `store-sync.js`, `store-multi.js`, `offline-boot.js` | Collection `artisans` (lecture tolérante : le front peut précéder la migration). |
| Relais | `relay/src/espace-artisan.js`, `relay/public/ar.js` ; `relay/src/espace-locataire.js`, `relay/public/el.js` ; `relay/src/ai/tasks/*` ; `relay/src/ai/public.js` | Page `/a` et API `/api/ar/*` ; assistant IA et suivi enrichi de `/l` ; tâches `incident-locataire`, `constat-artisan`, `lecture-facture` ; routes IA des liens publics avec quota par lien imputé au propriétaire ; `Permissions-Policy` : `microphone=(self)` sur `/l` et `/a`. |
| App | `js/app/incident-circuit-app.js` (module chargé après la connexion, comme l'espace locataire) + crochets minimes dans `app-part2.js` | Carte « Circuit » de la fiche incident, carnet et note privée, plafond, envoi de la demande, liste suggérée, devis, lecture de facture, constat, validation finale (dépense une seule fois), publication du résultat au locataire, suivi du remboursement ; saisie propriétaire simplifiée. |

Hors ligne ou sans cloud, le circuit se réduit à : constat saisi par le propriétaire (ou lu sur la facture), validation, dépense. Jamais bloquant.
