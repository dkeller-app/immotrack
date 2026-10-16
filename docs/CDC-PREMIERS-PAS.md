# CDC — Accueil d'un nouvel utilisateur : visite guidée + liste « Premiers pas » (option C)

**Statut : VALIDÉ — GO de Didier le 15/10/2026 sur TOUTES les recommandations D1 → D15 (§8).** Codé sur la branche `feat/premiers-pas` (worktree `Immo-wt-premiers-pas`), version provisoire **v15.748**. Module pur `js/core/premiers-pas.js` (TDD), module app `js/app/premiers-pas-app.js`, écran « Artisans » de Paramètres dans `js/app/incident-circuit-app.js`, statistiques `scripts/premiers-pas-stats.mjs`, registre RGPD traitement n° 11. Aucune migration.
Maquette : `mockups/PREMIERS-PAS/maquette.html` (captures de la **vraie app** `?sandbox=1`, prototype injecté, 3 formats × 2 thèmes, compte vide et compte à moitié configuré). Prototype : `mockups/PREMIERS-PAS/proto/pp-proto.js` (jamais chargé par l'app ; la phase 2 réécrit en TDD).

---

## 0. Faits établis par l'audit (main = v15.743)

| Sujet | Fait | Source |
|---|---|---|
| Premier lancement | **Aucun parcours d'accueil aujourd'hui.** Le questionnaire de départ (4 questions, `#ov-profile-wizard`) n'est plus ouvert au démarrage depuis v15.73 (« bloque l'écran au boot ») ; il reste derrière « Modifier mon profil ». Un commentaire réserve « un toast d'onboarding clean » au 1er boot. | `app-part3.js:1328-1344`, `app-part1.js:876-939`, `index.html:4994-5052` |
| Accueil d'un compte vide | Bandeau à 0, 8 bulles « À jour », matrice « Aucun lot » : rien n'invite à ajouter un logement (l'état vide n'existe que sur l'onglet Logements). CSS `.dash-onboarding` orphelin (JS supprimé). | `app-part1.js:8074-8150, 8269`, `css/main.css:4415-4476`, `app-part2.js:11910-11921` |
| Fil rouge « Ajouter un bien » | Porte `openBiensAdd()` → `_frStart('bien')` ; enchaîne structure → immeuble → logement → **bail** → complétude ; bandeau de reprise sur Logements. | `app-part2.js:9407, 25162, 25175, 25243, 25692` |
| Accueil PC / téléphone | PC : `#pil-root` (`#pil-strip`, `#pil-bulles` = « Ce qui presse », `#pil-matrice`). Téléphone : tout est masqué sauf `#accm-phone` (carte « À regarder » `.watch`). | `index.html:610-618`, `app-part1.js:7602-7628, 7714-7899` |
| Navigation | Barre latérale `.v4s-a[data-nav=…]` (Logements, Locataires, États des lieux…), Candidatures = sous-onglet de Locataires. Téléphone : barre du bas **personnalisable** (`immo_fav_bar`, défaut Accueil · Parc · Loyers · + EDL · Plus), z-index 999, masquée quand une couche `.ov` est ouverte. | `app-part1.js:6981, 5983, 6341-6409`, `css/main.css:4941, 8948` |
| Paramètres | Onglet « Mon profil » : bouton « Modifier mon profil » (place naturelle de « Relancer la visite guidée »). | `app-part2.js:26733-26780` |
| `DB.params` | Par **espace** (compte), synchronisé dans `espace_config` ; clés privées (`bankAccounts`, `userProfile`) dans `espace_config_private` (membres pleins seulement). **Aucun stockage par utilisateur.** | `js/core/store-supabase.js:75-110`, `store-multi.js` |
| Détection — logement / bail | `DB.logements[]`, `DB.baux{}` (tombstones `_deleted`). | `app-part2.js:9301, 9483` |
| Détection — relevé bancaire | Chaque mouvement importé porte `_source:'bank_import'` et `_importedAt`. | `app-part2.js:30942-30955` |
| Détection — espace locataire | Cloud seulement : table `locataire_acces` (0059), émis par `EspaceLoc.creer` → `el_acces_emettre` ; état chargé 1,5 s après la connexion dans le module. | `espace-locataire-app.js:66, 224, 670-683`, `supabase-entry.js:1991` |
| Détection — plafond | `entite.incidentReglages.valideLe` ; **réglable uniquement depuis un incident ouvert** (`vuePlafond(inc)`), aucun écran autonome. | `incident-circuit-app.js:483-513`, `js/core/incident-circuit.js:118-146` |
| Détection — carnet d'artisans | `DB.artisans[]` (table 0060) ; `migrerCarnet()` crée seul des artisans `source:'migration'` (à exclure) ; carnet **réglable uniquement depuis un incident**. | `incident-circuit-app.js:51, 63-73, 326-359` |
| Détection — associé | Table `invitations` (0032, lecture « manager ») ; aucune trace locale ; `__immoPartage.createInvite`. | `supabase-entry.js:793-850, 920` |
| Démo | `?demo=1` isolée (stockage `_demo_`, réseau fermé, horloge figée) ; **aucun bouton « Voir une démonstration »** dans l'app. | `index.html:19-83`, `app-part1.js:187-279` |
| Mesure / analytics | Aucune table d'événements, `monitoring.js` inerte, aucun traceur. Dernière migration : 0061. | `js/core/monitoring.js`, `supabase/migrations/` |
| Composants | Aucune visite/bulle existante. Réutilisables : couche `.ov .modal` (`openM/closeM`), piège de focus + Échap de `doc-express.js:300-319`, placement de `_openMenuPopover` (`app-part2.js:9354`). | — |

---

## 1. Principes

1. **Ne jamais bloquer** : la visite se passe d'un clic ou d'Échap ; la liste se masque ; aucune étape n'est obligatoire.
2. **Rien de manuel** : une étape se coche parce que la donnée existe (ou que l'action réelle vient d'avoir lieu), jamais par une case.
3. **On s'enchaîne, on ne double pas** : « Ajouter un logement » ouvre le fil rouge existant (qui enchaîne lui-même sur le bail) ; le questionnaire de départ n'est pas réactivé (D2).
4. **Ton neutre** (infinitif, générique), aucune promesse au-delà du code en production.
5. **Mesure minimale, chez nous** : quelques dates dans les données du compte, aucun outil tiers.

---

## 2. Déclenchement et enchaînement

- **Première ouverture d'un compte neuf** (aucun logement lors de la première évaluation, `premiersPas` absent) : à l'affichage de l'Accueil, la carte « Premiers pas » est rendue, puis la **bulle d'accueil de la visite** s'ouvre (après la fin du chargement, jamais pendant la connexion : aucun appel réseau dans le chemin critique).
- **Compte existant** (déjà des logements à la première évaluation) : pas de visite automatique ; la liste s'affiche (étapes déjà satisfaites marquées `avant`) — voir D1.
- **Reprise** : une visite interrompue par un rechargement reprend à la même étape au prochain affichage de l'Accueil. « Passer » ou Échap l'arrête pour de bon.
- **Relance** : Paramètres › Mon profil › « Relancer la visite guidée » ; et « Revoir la visite » dans la couche des étapes. La relance revient à l'Accueil et démarre à l'étape 1.
- **Associé invité sans structure propre** : la visite oui, la liste non (D11).

---

## 3. La visite (accueil + 6 étapes)

Bulle : titre, texte, points de progression, « Passer » (lien), « Précédent », « Suivant » / « Terminer » (primaire). La zone pointée est **percée** dans un voile et cerclée de corail ; le reste de l'écran est assombri, rien n'est cliquable dessous. Clavier : Échap = Passer, ← / → = précédent / suivant, focus piégé dans la bulle et rendu à l'élément d'origine à la fermeture. Si la zone n'est pas visible (menu personnalisé, barre du bas modifiée), la bulle s'affiche au centre sans flèche — jamais d'échec.

| # | Titre | Texte exact | Zone pointée PC / tablette | Zone pointée téléphone |
|---|---|---|---|---|
| 0 | Bienvenue sur Propryo | Six étapes, une minute : où regarder chaque jour, où se trouvent les logements, et ce que Propryo prend en charge entre le locataire, l'artisan et le propriétaire. — Boutons « Commencer la visite » / « Passer ». Lien : « Voir d'abord un parc rempli : ouvrir la démonstration (nouvel onglet, données fictives). » (D7) | aucune (centre) | aucune (centre) |
| 1 | Ce qui presse | Le premier endroit à regarder. Propryo trie ce qui demande une décision : loyer impayé, révision, dépôt à restituer, document à renouveler. Quand rien n'attend, chaque bulle affiche « À jour ». | `#pil-bulles` | carte « À regarder » (`#accm-phone .watch`) — texte : « « À regarder » rassemble ce qui demande une décision : … Quand rien n'attend, la carte affiche « tout est à jour ». » |
| 2 | Les logements | Tout part du logement. L'ajouter une fois, par l'adresse ou l'acte notarié en PDF : Propryo détecte les risques de l'adresse, retrouve le DPE par son numéro, puis prépare le bail au contrat type. | barre latérale « Logements » | barre du bas « Parc » (sinon « Plus ») |
| 3 | L'espace du locataire | Chaque locataire reçoit un lien personnel, sans mot de passe : bail et états des lieux signés, quittances, messages, signalement d'un incident. Les documents définitifs y sont déposés automatiquement. | pastille « Espace locataire » de la carte Premiers pas | carte Premiers pas |
| 4 | Les incidents, sans tout gérer soi-même | Le locataire signale l'incident, aidé par l'IA. Un artisan du carnet reçoit la demande et intervient sous le plafond fixé une fois ; au-delà, son devis attend une validation. La cause et « qui paie » s'affichent à la fin, avec le texte de loi. — mention « Proposé par l'IA, toujours relu par une personne. » | pastilles « Plafond » **et** « Artisan » (deux zones percées) | carte Premiers pas |
| 5 | L'état des lieux dicté | Dicter pièce par pièce : l'IA transcrit et propose l'état de chaque élément. Chaque ligne se relit, se corrige ou s'ignore, puis les deux parties signent sur place. — mention IA | barre latérale « États des lieux » | barre du bas « + EDL » (sinon « Plus ») |
| 6 | Les dossiers des candidats | Les candidats déposent leur dossier par un lien, sans compte. Propryo vérifie le code 2D-Doc des pièces et signale des constats factuels et datés, jamais une note sur la personne. La décision reste au propriétaire. | barre latérale « Locataires » (Candidatures en est le sous-onglet) | barre du bas « Plus » — texte préfixé « Dans « Plus », puis « Locataires » : … » |

« Terminer » ferme la visite et rend le focus au bouton d'action de la carte Premiers pas.

**Vérité des textes** (contrôlée contre le code et `docs/CDC-PROPRYO.md` §6-7) : acte notarié PDF, DPE ADEME interrogé **par numéro de DPE** (`app-part2.js:20560-20567`), risques Géorisques depuis l'adresse (BAN, `app-part2.js:20569`), contrat type 2026 ; espace locataire et publication automatique des documents définitifs (`espace-locataire-app.js` rôle 2) ; circuit incident v15.738 (plafond, devis au-dessus, verdict à la fin) ; EDL dicté v15.733 ; 2D-Doc v15.741. Réserve D12 sur « reçoit la demande ».

**Téléphone** : la bulle occupe la largeur (12 px de marge), se place **au-dessus ou au-dessous de la zone**, jamais sur la barre du bas ; boutons ≥ 44 px ; quand la zone est un bouton de la barre du bas, la barre reste visible (assombrie) et seul ce bouton est percé.

---

## 4. La liste « Premiers pas »

### 4.1 Étapes, ordre, détection

Ordre = chemin le plus court vers la valeur : **le dû** (logement → bail), puis **le payé** (relevé : Ce qui presse et Loyers deviennent vrais), puis **ce qui distingue Propryo** (espace locataire, puis plafond + artisan qui rendent le circuit d'incident autonome), enfin **le partage** (SCI seulement).

| # | Libellé (court sur la pastille) | Sous-texte | Fait quand… | Action (CTA) |
|---|---|---|---|---|
| 1 | Ajouter un logement (Logement) | Par l'adresse ou l'acte notarié en PDF ; risques et DPE retrouvés. | ≥ 1 logement vivant (`!_deleted`) | `openBiensAdd()` → fil rouge |
| 2 | Créer le bail ou reprendre un bail en cours (Bail) | Le loyer dû part du bail : quittances, révisions et relances en découlent. | ≥ 1 bail vivant dans `DB.baux` (bail repris compris) | `openBail(ref)` du 1er logement sans bail (sinon fil rouge) |
| 3 | Importer un relevé bancaire (Relevé bancaire) | Fichier OFX, QFX ou XLSX de la banque : les loyers reçus sont rapprochés du bail. | ≥ 1 mouvement vivant `_source === 'bank_import'` | `_bankImportOpen()` |
| 3 bis | Mémoriser une règle d'import (Règle d'import) — *D15* | Depuis une ligne du relevé : les lignes semblables seront classées seules aux prochains imports. | ≥ 1 règle vivante dans `DB.importRules` (Propryo n'en livre aucune) | `_bankRulesOpen()` |
| 4 | Ouvrir l'espace du locataire (Espace locataire) — *après le bail* | Un lien sans mot de passe : documents signés, quittances, messages, incidents. | ≥ 1 accès émis (`locataire_acces`), vu à l'action `EspaceLoc.creer` ou au chargement des accès | fiche du 1er bail en cours, onglet Bail (bloc « Espace locataire ») |
| 5 | Fixer le plafond d'intervention (Plafond) | Sous ce montant, un artisan intervient sans attendre de validation (300 € TTC proposés). | ≥ 1 structure avec `incidentReglages.valideLe` | Paramètres › Artisans (D3) |
| 6 | Ajouter un artisan au carnet (Artisan) | Plombier, électricien, chauffagiste : prévenu directement quand un incident le concerne. | ≥ 1 artisan vivant **hors** `source:'migration'` | Paramètres › Artisans (D3) |
| 7 | Inviter un associé de la SCI (Associé) — *seulement si une structure est une SCI* (« SCI » ou « société civile » dans `entite.type`, mot entier) | En lecture ou en écriture, SCI par SCI. | ≥ 1 invitation créée (à l'action `createInvite`, ou lecture différée du compte d'`invitations`) | Paramètres › Partage › « Inviter » |

Étapes **cloud seulement** (4, 7) : masquées hors cloud (sandbox), servies par le faux nuage en démo. Une étape bloquée (4 avant le bail) s'affiche « Après le bail », sans bouton.

**Hors liste (D13)** : état des lieux dicté et candidatures — ce ne sont pas des réglages de départ (ils dépendent d'une entrée de locataire ou d'un logement vacant) ; la visite les présente.

### 4.2 Rendu

- **PC / tablette** : carte en tête de l'Accueil (`#pil-root`, avant le bandeau) : titre + « N sur 7 faites » + barre verte (exception M-15 « barre de progression ») ; les 7 pastilles (cochées en vert, la prochaine cerclée de corail) ; **un** bouton primaire = l'action de la prochaine étape. Clic sur une pastille → couche des étapes. **Compte sans logement** : la carte prend la place du bandeau de chiffres (tous à 0) — mesuré à 1280 × 900 : Accueil vide = 790 px sans carte, 914 px avec carte et bandeau (déborde) ; carte à la place du bandeau : voir `captures/_mesures.json` (`debordContenuPx`). Avec des logements, le bandeau revient et la carte pousse l'Accueil de 124 px tant qu'elle est visible (l'Accueil au volume du jeu de démo fait déjà 1 003 px sans elle) — D9.
- **Téléphone** : carte dans `#accm-phone`, sous « Bonjour » : titre, « N sur 7 », barre, « Prochaine étape : … », bouton primaire pleine largeur, « Voir les étapes ».
- **Couche des étapes** (`.ov .modal`, page plein écran au téléphone, M-16) : les 7 lignes (rond vide / coché, titre numéroté, sous-texte, « Fait » ou bouton), pied : « Revoir la visite », « Masquer la liste », « Fermer ».
- **Repli** : toutes faites → la carte dit « Mise en route terminée. Tout est en place » avec « Masquer », puis disparaît seule **7 jours** après la dernière étape (D10). « Masquer » à tout moment ; Paramètres › Mon profil › « Afficher la liste sur l'accueil » la rend.
- **Coche en direct** : recalcul à chaque rendu de l'Accueil (pas de minuterie) ; les deux étapes cloud mettent à jour l'état à l'action.

---

## 5. Mesure pour la bêta (sans traceur)

**Stockage** : `DB.params.premiersPas` — clé ajoutée à `PRIVATE_PARAM_KEYS` → `espace_config_private` (membres pleins seulement, déjà chiffré au transport, aucune migration ; 0062 non utilisée) — D5.

```json
{ "v": 1,
  "creeLe": "2026-12-02T09:14:00Z",
  "visite": { "etat": "finie | passee | en_cours", "etape": 6, "le": "…", "relances": 0 },
  "etapes": { "logement": { "le": "…" }, "bail": { "le": "…" }, "releve": { "le": "…", "avant": true } },
  "termineLe": null, "masqueLe": null, "mesure": true }
```

- Date = **première fois** que l'app constate l'étape faite ; `avant: true` si elle l'était déjà à la première évaluation (compte antérieur à la fonction : exclu des statistiques).
- Écriture par le chemin d'enregistrement **sans entrée d'annulation** (`saveDB({autosave:true})` : un « Annuler » ne doit pas effacer une date) ; jamais bloquant hors ligne.
- **Comptage par le pilotage** : script en lecture seule `scripts/premiers-pas-stats.mjs` (connexion de `db-run.mjs`) : comptes de la `beta_allowlist` inscrits → étapes faites, dates, état de la visite, délai inscription → mise en route complète ; agrégats (n inscrits, n visite finie / passée, n mise en route complète, médiane). Segmentation **déduite des données** (nombre de lots, présence d'une SCI) sans question supplémentaire (D2).
- **RGPD** : traitement n° 11 au registre (`docs/legal/RGPD-REGISTRE.md`) — Propryo responsable ; finalité : mesurer la prise en main pendant la bêta et améliorer le parcours ; base : intérêt légitime (art. 6.1.f) ; données : identifiant de l'espace, étapes + dates, état de la visite (aucune donnée de locataire, aucun clic, aucun appareil) ; destinataire : Propryo (pilotage) ; conservation : durée du compte, purge **12 mois après la fin de la bêta** ; information : phrase dans Paramètres › Mon profil (« Propryo enregistre dans le compte les étapes de mise en route faites et leur date, pour mesurer la prise en main pendant la bêta. Aucun outil de mesure extérieur. ») + politique de confidentialité ; **opposition** : case « Partager la progression de mise en route » (D6).

---

## 6. Charte et accessibilité (gate de la phase 3)

M-4 (un seul primaire : le bouton de la carte ; la bulle est une couche), M-8 (≥ 44 px au téléphone, ≥ 40 px PC), M-10 (aucune icône seule ; pastilles avec libellé et `aria-label` « … : fait / à faire »), M-13 (ton neutre, test `ton-neutre`), M-14 (aucune troncature : libellés courts entiers), M-15 (barre verte, corail = action / prochaine étape), M-17 (contraste mesuré `sobre` et `dark`, cf. `captures/_mesures.json`), M-16 (couche des étapes plein écran ; **bulle de visite = exception D8**), M-3 (la bulle n'est jamais sur la barre du bas). Échap, focus visible (anneau corail 2 px), focus piégé et rendu.

---

## 7. Découpage phase 2 (après GO)

a) `js/core/premiers-pas.js` (pur, TDD) : `etapesPremiersPas(DB, ext)`, `prochaine`, `majProgression(etatPrecedent, etapes, maintenant)` (dates premières, `avant`), `doitLancerVisite`, `doitAfficherListe` (masqué, 7 jours), `zoneVisite(etape, format, dispo)` (repli), placement de bulle (`placerBulle(rectCible, rectBulle, viewport, rectBarreBas)`). b) Module app `js/app/premiers-pas-app.js` (chargé comme `incident-circuit-app.js`) : carte PC + téléphone (crochet minimal dans `rAccueil` / `_renderAccueilPhone`), couche, visite, relance Paramètres, `PRIVATE_PARAM_KEYS`. c) Getters : `EspaceLoc.nbAccesEmis()`, marquage à `createInvite`, lecture différée du compte d'invitations. d) Écran « Artisans et plafond » (si D3 = oui) réutilisant `vuePlafond` / `vueCarnet` hors incident. e) Script de statistiques + registre RGPD + CDC dans `docs/CDC-PREMIERS-PAS.md`. Puis phase 3 (tests, parcours au geste réel en Chrome headless sur compte neuf `?sandbox=1`, 3 formats, audit Opus) et phase 4 (branche poussée, smoke Didier sur app.propryo.fr avec un compte neuf).

---

## 8. Décisions (toutes les recommandations en gras ont été retenues par Didier le 15/10/2026)

1. **D1 — Qui voit quoi.** **Visite automatique pour les comptes neufs seulement (aucun logement à la première évaluation) ; liste affichée à tous tant qu'elle est incomplète, étapes déjà faites cochées.** Alternative : liste aussi réservée aux comptes neufs (les comptes existants ne découvrent alors ni le plafond ni le carnet).
2. **D2 — Questionnaire de départ.** **Ne pas le réactiver** (désactivé depuis v15.73 parce qu'il bloquait) ; la segmentation demandée par SEMIA se déduit des données (nombre de lots, SCI ou nom propre). Alternative : le proposer en option à la fin de la visite.
3. **D3 — Écran « Artisans et plafond ».** **Créer un onglet de Paramètres qui réutilise `vuePlafond` / `vueCarnet` du circuit d'incident hors d'un incident** (aujourd'hui inaccessibles sans incident ouvert). Sans lui, les étapes 5 et 6 n'ont pas de bouton → alternative : retirer ces deux étapes de la liste.
4. **D4 — Étapes cloud.** **Espace locataire et associé : cochées à l'action (`EspaceLoc.creer`, `createInvite`) + une lecture différée, non bloquante, après l'affichage** (comptes qui l'avaient fait avant). Masquées hors cloud.
5. **D5 — Stockage de la mesure.** **`DB.params.premiersPas` en clé privée (`espace_config_private`), aucune migration** (0062 non utilisée). Alternative : table dédiée 0062 (requêtes plus simples, mais migration + RLS).
6. **D6 — RGPD.** **Intérêt légitime ; phrase d'information dans Mon profil ; case « Partager la progression de mise en route » cochée par défaut (droit d'opposition) ; purge 12 mois après la fin de la bêta ; traitement n° 11 au registre.** Alternative : consentement explicite (case décochée par défaut) — mesure moins complète.
7. **D7 — Démonstration.** **Lien « ouvrir la démonstration » dans la bulle d'accueil, nouvel onglet `?demo=1`** (isolée : aucune donnée réelle visible, aucun risque d'écriture). Alternative : pas de lien.
8. **D8 — Charte M-16 au téléphone.** **Accepter la bulle de visite comme exception écrite à M-16** : elle doit laisser voir l'écran réel qu'elle commente ; pleine largeur, jamais sur la barre du bas, boutons 44 px. La couche des étapes reste, elle, plein écran.
9. **D9 — Hauteur PC.** **Carte de 2 lignes en tête de l'Accueil ; à la place du bandeau de chiffres tant qu'aucun logement n'existe** (tient dans 900 px) ; avec des logements, elle pousse l'Accueil de 124 px tant qu'elle est visible. Alternative : ligne unique sans pastilles (« 3 sur 7 · Prochaine étape · bouton »), la liste n'étant visible que dans la couche.
10. **D10 — Repli.** **Disparition automatique 7 jours après la dernière étape** ; « Masquer » à tout moment ; réaffichage depuis Mon profil. Alternative : disparition immédiate.
11. **D11 — Associé invité sans structure propre.** **Visite oui, liste non** (ses étapes concernent le propriétaire).
12. **D12 — Texte de l'étape 4.** **Garder « un artisan du carnet reçoit la demande »** : vrai aujourd'hui par lien sans compte (envoyé par e-mail une fois Resend activé, à partager à la main d'ici là). Alternative : « reçoit un lien de demande ».
13. **D13 — Hors liste.** **EDL dicté et candidatures restent hors liste** (dépendent d'une entrée de locataire ou d'un logement vacant) ; la visite les présente.
14. **D14 — Contraste du bouton corail (hors chantier).** Texte blanc sur `#ff5a3c` = 3,1:1 (sous les 4,5:1 de M-17 pour un texte de 14 px) : c'est le jeton commun `--cta` / `--cta-text` de toute l'app ; la carte l'utilise pour rester cohérente. **À traiter dans un chantier de charte séparé**, pas ici.
15. **D15 — Étape « Mémoriser une règle d'import » (nouveauté v15.744).** **L'ajouter juste après le relevé** : « Mémoriser une règle d'import » — sous-texte « Depuis une ligne du relevé : les lignes semblables seront classées seules aux prochains imports. » ; faite quand `DB.importRules` contient au moins une règle vivante (main ne livre aucune règle toute faite : `app-part2.js` `rParamsRules`, « Propryo ne livre aucune règle toute faite », donc la détection est franche) ; action `_bankRulesOpen()`. C'est ce qui rend l'import automatique (principe « Propryo agit »). La liste passe à 7 étapes (8 avec une SCI). Alternative : ne pas l'ajouter (la création reste proposée dans l'import lui-même). *Maquette non mise à jour pour cette étape tant que la décision n'est pas prise.*

---

## 9. Mesures de la maquette (`captures/_mesures.json`, 87 captures)

- Aucun débordement horizontal ; bulle toujours entière dans l'écran ; **jamais posée sur la barre du bas** ; **jamais sur la zone qu'elle commente** ; aucune cible < 44 px au téléphone ; aucune troncature dans la carte ; contraste ≥ 4,5:1 partout en sombre.
- Seul écart : texte blanc sur corail (3,1:1) en clair — jeton commun de l'app (D14).
- Deux boutons corail visibles quand la bannière « nouveau dossier de candidature » (existante) est affichée en même temps que la carte (M-4) : à régler en phase 2 (la carte passe son bouton en secondaire quand une bannière d'action est présente) — proposé, sans décision nécessaire.
- Hauteur de contenu PC 1280 × 900 : compte vide **0 px de débordement** (carte à la place du bandeau) ; compte à moitié configuré : 354 px (dont 124 px dus à la carte, le reste existe déjà sans elle).

---

## 10. Écarts et précisions de la mise en œuvre (v15.748)

- **Onglet « Artisans »** (et non « Artisans et plafond ») dans Paramètres : le libellé long faisait passer toute la barre d'onglets sur deux lignes à 1 280 px ; l'écran porte le titre complet « Artisans et plafond ».
- **Écran « Artisans et plafond »** : mêmes formulaires et mêmes enregistrements que dans un incident (`plafondCorps`, `formArtisan`, `appliquerPlafond`, `enregistrerArtisanDans`, `retirerArtisan`) ; à l'ajout, choix de la structure si plusieurs. Le texte du plafond dit désormais « le devis arrive sur la fiche de l'incident » (vrai dans les deux contextes).
- **`validePar` du plafond** : inchangé (lit `window.__immoUser`, jamais défini, donc vide) — défaut existant du circuit d'incident signalé au pilotage, hors de ce chantier (stocker l'e-mail sur la structure serait une donnée personnelle de plus à inscrire au registre).
- **Écran « Artisans et plafond » limité à l'espace propre** : structures et artisans dont `_espaceId` est celui du compte (une SCI partagée par un autre, peut-être en lecture seule, se règle par son propriétaire ; ses associés en écriture gardent le réglage depuis un incident). Recherche de la structure par nom, comme le reste du circuit.
- **Relecture adverse Opus (15/10)** : champs du formulaire d'artisan lus dans la couche (une fiche d'incident fermée garde ses champs aux mêmes id ; son corps est vidé à l'ouverture de la couche) ; carte réévaluée à la fin de `_bootDataJobs` (compte cloud neuf) ; « Annuler » garde `premiersPas` (opposition RGPD comprise) ; première évaluation cloud après les compteurs (accès locataire, invitations ; 12 s au plus) ; retour à la mesure = étapes déjà faites « avant » ; visite revérifiée au lancement, pas de double départ à la relance, voile replacé au défilement ; pastilles 40 px (44 px au toucher).
- **Seconde relecture Opus (15/10, « SÛR après corrections mineures »)** : lecture des invitations seulement une fois les données chargées, relue si l'espace n'est pas encore résolu ; restaurer une sauvegarde ou importer un JSON garde aussi `premiersPas` (utilitaire commun `_ppCourant` / `_ppReporter` avec « Annuler ») ; chaque étape de la visite est enregistrée (la visite reprend à l'étape en cours) ; opposition réglée après l'évaluation, sans effet si l'état ne change pas ; visite reproposée dans la séance si une couche l'a empêchée ; pas d'attente des accès locataire sans bail ; après opposition, « masquée / réaffichée » ne garde que le fait, pas l'heure.
- **Étape « Importer un relevé »** : même geste que le bouton d'import de l'onglet Mouvements (`go('mouvements')` puis `_bankImportOpen()`), quel que soit le style de ce bouton.
- **Carte indépendante de la matrice** : insérée en tête de `#pil-root` avant le bandeau ; sans `#pil-root`, en tête de `#p-accueil`. Sans logement, elle masque le bandeau de chiffres (tous à 0).
- **M-4** : si la bannière « nouveau dossier de candidature » est affichée, le bouton de la carte passe en secondaire.
- **Données prêtes** : la progression n'est créée qu'après le chargement des données du compte (`_bootDataJobsDone`), jamais hors ligne ; écriture par `saveDB({autosave:true, quoi:'premiers-pas'})` (sans entrée d'annulation), jamais en lecture seule.
- **Sandbox** : une base de test vide est remise à zéro à chaque chargement (comportement v14.66 du bac à sable) ; la progression d'un compte de test vide ne survit donc pas au rechargement. Sans effet sur un vrai compte.
- **Entrée « Premiers pas » (retour Didier 16/10, v15.749)** : barre latérale PC/tablette, zone « Aide » en fin de menu (toujours visible, hors menu personnalisé, à côté du compte) ; téléphone, 2e ligne de la feuille « Plus » sous « Personnaliser ma barre » (visible sans défiler). Le clic ouvre la liste des étapes même carte masquée ou repliée : « Revoir la visite guidée » en tête, « Masquer de l'accueil » / « Afficher sur l'accueil » au pied (aucun bouton pour un associé sans structure propre, D11). Mon profil inchangé.
