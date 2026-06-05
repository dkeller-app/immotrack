# V3-REFONTE-LOYERS — Refonte fonctionnelle onglet Mouvements + import bancaire

**Status** : 🔄 En cours (design) · **Prio** : P2 · **Taille** : M-L
**Détecté** : backlog historique (2e priorité après Bail) · **Session design** : 2026-06-04
**Lié à** : BANK-IMPORT-V2 (pointeur par compte, livré v15.163), MVT-SCIND-CAT, MVT-RECURRENT

---

## ⚠️ Garde-fous (rejets de la session 2026-06-04 — à NE PAS refaire)

1. **On ne réinvente pas la poudre.** Le « sélecteur de périmètre » bailleur→immeuble→logement que j'avais inventé **existe déjà** : pastilles entité globale (`_setActiveEntity` l.5948), dropdown immeuble par page (`initFilters` l.5905), champ `qui` (`fillMvQui`). Le « Suivi des loyers » existe déjà (Pilotage → 💰 Suivi comptable, `_rPilCompta` l.41524). → Partir de l'écran réel, corriger ce qui est cassé, pas d'une page blanche.
2. **Ordre logique = sens du flux** : on commence par l'**import** (le début), puis l'**affichage**.
3. **CSV : si mal géré, on ne le propose pas.** Pas de mapping manuel de colonnes (béquille rejetée). « On prend le format le mieux géré » = OFX/QFX (structuré, auto-décrit). Voir question ouverte Q1.
4. **L'affectation à plat (`fillMvQui`) « est de la merde »** : liste de logements longue comme le bras, et on ne peut affecter qu'à UN bien. Or les charges ne sont pas toujours sur un bien. → modèle 3 niveaux (ci-dessous).

---

## Étoile polaire : sortir le 2044 sans retouche

La sortie cible validée par le user (2026-06-04) = **la déclaration de revenus fonciers (2044)** doit sortir remplie en un clic. **Le générateur existe déjà** : `js/core/legal-2044.js` (`_compute2044` / `_format2044Recap` / `_2044ToCsv`, testé `__tests__/helpers/legal-2044.test.js`). `STD_CATEGORIES` (index.html l.3920-3963) mappe chaque catégorie sur sa ligne CERFA (211/213/221/223/224/224bis/225/226/227/229/230/250) + un `type` (recette/charge/interet/special). **On ne réécrit pas le 2044** — la refonte ne fait que lui fournir des données propres (garbage in → 2044 faux).

## Problème central : l'affectation est le contrat de données du 2044

Aujourd'hui l'affectation (`fillMvQui` l.12983) demande toujours **« quel logement ? »** (liste à plat de tous les logements). Inadapté : beaucoup d'écritures ne visent pas un logement.

**Modèle de données réel** (3 voies, déjà en place) :
- `qui = "SCI:<nom>"` → niveau entité/SCI (frais de compte, comptable). **Compté par le 2044.**
- `qui = <ref logement>` → niveau logement (loyer, DG, travaux). **Compté.**
- `qui = ""` + `imm` rempli → niveau immeuble. **❌ IGNORÉ par `_compute2044`** (le filtre de scope ne lit que `m.qui`, jamais `m.imm`, cf legal-2044.js l.39-50).
- `compteurCcId` (exclusif avec `qui`) → charge récupérable rattachée à un **compteur collectif**, réparti sur les logements par clé (tantièmes/surface/sous-compteurs/proportionnel/forfait). Module existant `index.html:31085+`.

**Insight clé (2026-06-04, sur indication user « pour les charges on a aussi un module »)** : au niveau immeuble il y a **deux espèces de charges, destins opposés** :
| Type | Destination | État |
|---|---|---|
| **Récupérable** (eau, ascenseur, chauffage, entretien PC) | → compteur collectif → réparti sur **locataires** → régularisation. **Hors 2044** (se neutralisent) | ✅ géré (module CC) |
| **Déductible de propriété** (taxe foncière, PNO, syndic part proprio, ravalement) | → **2044** (lignes 227/223/224/229) | ❌ tombe dans le trou immeuble |

→ Le « vrai bug » = uniquement les charges de propriété **déductibles** posées au niveau immeuble disparaissent du 2044. Les récupérables ont déjà leur maison.

## UX cible : la catégorie pilote l'affectation

On inverse la question. Pas « choisis un bien » d'abord, mais **« qu'est-ce que c'est »** (la catégorie, déjà 2044-mappée et typée). La catégorie connaît sa destination → l'app pose **une seule** question ciblée :
- recette / charge logement → « quel logement ? »
- charge déductible immeuble → « quel immeuble ? » → remonte au 2044
- charge récupérable → « quel compteur collectif ? » → module CC, réparti sur locataires
- frais SCI → « quelle entité ? » (pastilles entité existantes)

Plus aucune liste à plat. Réutilise tout l'existant (catégories, compteurs collectifs, pastilles entité).

---

## Périmètre de la refonte

### 1. Import bancaire (le début du flux)
- Garder le wizard 5 étapes existant (`_bankImportFileLoaded` l.42368, `_bankImportConfirm` l.42877) et le pointeur par compte (BANK-IMPORT-V2, déjà livré).
- **Format** : privilégier OFX/QFX (fiable). Pas de mapping CSV manuel. → Q1.
- **Étape Aperçu/affectation** : remplacer la sélection logement-à-plat par le drill-down 3 niveaux ci-dessus.

### 2. Affichage (onglet Mouvements, `rMv` l.13589, `#p-loyers`)
- Partir de l'écran réel actuel (filtres, dropdowns Excel, 3 onglets de vue) — corriger, pas remplacer.
- Ne PAS recréer le « Suivi des loyers » (existe en Pilotage).
- Détail à cadrer une fois l'import + affectation validés.

---

## Questions ouvertes

- **Q1 — Formats d'export des banques de Did_K** : quelles banques, quels formats dispo (OFX/QFX/CSV) ? Décide si OFX-only suffit ou s'il faut des templates CSV par banque (pas de mapping manuel dans tous les cas). *(question posée puis écartée en session — à reprendre)*
- **Q2 — Découpe d'un mouvement sur plusieurs biens** : un virement CAF / un loyer groupé peut concerner plusieurs logements. La feature Split ✂️ existe déjà — vérifier qu'elle couvre le cas et s'articule avec le drill-down.
- **Q3 — Normalisation du niveau immeuble** dans le modèle (`imm` + `qui=""` ?) à figer avant implé.

---

## Décisions prises (2026-06-04)
- Approche globale : **Refonte analyste** (Option A), import-first. Étoile polaire = **2044 en un clic**.
- Drop du mapping CSV manuel ; import OFX, + modèle CSV par banque si une banque ne fait que du CSV.
- **L'affectation est pilotée par la catégorie** : on choisit *ce que c'est* avant *où ça va*. Une seule question contextuelle, jamais de liste à plat.
- **Charges immeuble déductibles = un seul mouvement au niveau immeuble** (pas de ventilation par logement) : le 2044 veut un total par ligne. La ventilation par logement reste possible via le module CC si besoin futur (compte de résultat par logement), hors scope 2044.
- Réutiliser sans réécrire : `_compute2044`, module compteurs collectifs, pastilles entité.

## ⚠️ Découverte audit 2026-06-05 : le 2044 existe en DOUBLE (collision de noms)

Deux fonctions `_compute2044` distinctes, même nom, logiques différentes :

| | **Wizard inline** (`index.html:29643`, `openWizard2044`) | **Module** (`js/core/legal-2044.js`, `openLegal2044` sur `#p-export`) |
|---|---|---|
| Signature | `_compute2044(ent, year, activeLogs)` | `_compute2044(mouvements, stdCategories, opts)` |
| Lit `m.imm` (charges immeuble) | ✅ oui (l.29655) | ❌ non (filtre l.39-50, `m.qui` seul) |
| Part bailleur ligne 225 (via `computeRegul`) | ✅ oui (l.29698) | ❌ non |
| Forfait légal 222 (20 €/local) | ✅ oui (l.29685) | ❌ non |
| Testé (Vitest) / récent | ❌ non, v14.78-79 | ✅ 180 tests, v14.90 (Sprint 3B/3C) |

**Collision** : `js/main.js:195` fait `window._compute2044 = <module>`. main.js est un module ES6 chargé en différé (`index.html:47645`), donc il **écrase** la fonction inline globale (non-IIFE, cf onclick globaux). Conséquences :
- L'écran **« Aide déclaration 2044 »** (#p-export, le seul branché sur le module) **oublie** charges immeuble + part bailleur + forfait → 2044 faux.
- Le bouton **« 📋 Wizard 2044 »** (fiche entité, `index.html:29435`) appelle `_compute2044(ent, year, activeLogs)` → reçoit le module (mauvaise signature) → `ent.filter is not a function` → **plante** (à confirmer d'un clic, mais le code le dit).
- `legal-bilan.js` consomme aussi le module → le **bilan annuel** oublie également les charges immeuble.

## Décision (user 2026-06-05 : « je n'ai jamais utilisé le 2044, tu es libre de faire ton choix et de nettoyer »)

**Un seul moteur 2044 = le module testé**, étendu pour porter les 3 comportements corrects du wizard :
1. lire `m.imm` (charges immeuble déductibles) dans le filtre de scope → via `opts.imms[]` passé par l'UI ;
2. injecter la part bailleur ligne 225 → via `opts.partBailleur225` (segments précalculés par l'UI qui appelle `computeRegul`, le helper reste pur) ;
3. forfait 222 → via `opts.nbLocaux`.
**+ tests** pour ces 3 cas. Puis **suppression de la fonction inline en double** (kill la collision) et rebranchement d'une porte d'entrée UI unique (garder la meilleure UI — éditeur de correspondance pour catégories custom — rebranchée sur le moteur unique). **Audit agent `code-reviewer` obligatoire** (modif fiscale sensible).

## Les 3 corrections à livrer (proposition pro 2026-06-05, validation user en attente)

**Principe** : toute la chaîne sert le 2044. On ne réécrit aucune brique qui marche (compréhension relevé `_bankMatchHeuristic`, répartition CC, régul `computeRegul`, FEC). On répare les 3 jointures cassées + on unifie le 2044.

- **🅰 Chantier A — 2044 unifié & juste** (backend pur, testable, sans maquette) : cf décision ci-dessus. Bug le plus grave + le plus rapide.
- **🅱 Chantier B — Affectation pilotée par la catégorie** (la racine) : remplacer `fillMvQui` (liste à plat) par 1 question ciblée selon la destination (logement / immeuble déductible / récupérable→CC / SCI). Réutilise catégories + compteurs + pastilles entité. **Mockups d'abord.**
- **🅲 Chantier C — Import → liste → compléter en ligne** (ergonomie réelle) : garder le wizard d'import ; à la sortie, liste (pas modale/ligne), pré-remplie quand reconnu, complétée **en place** via le sélecteur B ; split intégré (CAF multi-locataires + « séparer loyer/charges depuis le bail » via `bail.hc`/`bail.ch`) ; validation groupée des lignes « prêtes ». **Mockups d'abord.**

**Ordre proposé** : A → B → C (B est réutilisé par C). Fork ouvert au user : démarrer par A (code immédiat) ou par les maquettes B+C.

## Questions ouvertes (résolues / restantes)
- ~~Q1 formats banque~~ → tranché : OFX + modèle CSV par banque si besoin.
- **Q2 — Découpe multi-biens** : Split ✂️ existe — vérifier articulation avec le sélecteur piloté-catégorie.
- **Q3 — Normalisation niveau immeuble** dans le modèle (`imm` + `qui=""` vs un `qui="IMM:<nom>"` explicite ?) à figer avant implé, en lien avec le fix #2.

## Journal
- **2026-06-05 (suite 6 — audit pré-prod par 3 agents : ce qu'on a oublié)** : avant d'écrire le code prod, 3 agents lancés en parallèle (fiscal / complétude des mouvements / cohérence app réelle). Findings majeurs :
  - **🔴 Bug prod confirmé (ligne 230)** : `index.html:3969` type encore `'charge'` au lieu de `'deduction'` (fix présent seulement dans `index-test.html:3898`). Notice 2044 : `240 = (221..229) − 230` ; en prod la régul N-1 s'**ajoute** au lieu de se **retrancher** → résultat foncier faux d'≈2× la régul. À porter dans le Chantier A.
  - **🔴 « Compte = périmètre » : modèle de données absent + reconnaissance PAS par IBAN.** Bonne nouvelle : les comptes bancaires existent (`DB.params.bankAccounts[]`, objet `{id,label,type,identifiers[],createdAt,lastImport}` créé `index.html:42818`). MAIS aucun champ `scope`/rattachement → à ajouter + UI de réglage (le manager `_bankAccountsRender` l.42844 ne fait que renommer/reset/supprimer). Et la reconnaissance se fait par **ACCTID/BANKID** (OFX, `bank-import.js:463`, id `acct:<bankId>:<acctId>`) ou **hash d'en-têtes CSV** (`_bankCsvHeaderHash`), **jamais l'IBAN** (l'IBAN n'existe que sur `ent.iban`, jamais sur un compte ni dans l'import). → maquette + journal corrigés (« identifiant de compte », pas IBAN).
  - **🔴 Split réel mono-sens = incompatible avec le relevé de gérance.** Le vrai `confirmSplitMvList` (l.13571) force **toutes les lignes au même sens** que le mouvement (`_spMvSens`), équilibre sur somme à plat ; l'objet mouvement n'a **pas de champ `sens`** (dérivé de `db>0`). Le modèle maquette (N lignes signées, Σcr−Σdb=net) est la **bonne** direction mais c'est une **vraie refonte** de `_spMvRows`/`confirmSplitMvList`, pas un portage. À acter.
  - **🟠 CATMETA maquette = sous-ensemble (12 cat) du réel `STD_CATEGORIES` (≈30 cat, `index.html:3947`).** Beaucoup de cas crus « manquants » sont **déjà modélisés** (DG reçu/restitué/utilisé en `special`/213, capital de prêt `special`, indemnités sinistre/GLI/ANAH/éviction, arriérés…). Le trou est dans l'**UI de la maquette** : au câblage, pointer sur `STD_CATEGORIES`, ne pas réinventer une liste courte.
  - **🟠 Manques réels des DEUX côtés (à créer)** : (a) **Virement interne** entre 2 comptes du bailleur = 2 lignes à neutraliser → besoin d'une cat `special` « non déclarable » **+ rapprochement de 2 mouvements** (rien dans le code) ; (b) **Travaux de construction/agrandissement (non déductible)** — absent même de `STD_CATEGORIES` ; (c) **Acquisition/cession** (notaire, agence, prix de vente = hors résultat foncier, plus-value séparée) ; (d) **CCA / distribution SCI** (niche mais l'app vise les SCI) ; (e) **Échéance de prêt** capital+intérêts+assurance en 1 ligne → besoin d'un **seed split `prêt` alimenté par un échéancier** ; (f) **régularisation de solde** (remboursement/complément, sens variable) et **restitution partielle de DG** avec retenue.
  - **🟠 Réconciliation modèle de données pour le portage** : maquette = arbre `ENT[{imms:[{logs}]}]` ; réel = `DB.entites[]` (immeubles nichés `ent.immeubles[]`) + `DB.logements[]` **plat**, lié par **chaînes de noms** (`l.imm`/`l.entity`, pas d'ID) ; `loc`→`locataire`, `caf` n'existe pas (à dériver du bail/APL). Niveaux encodés `qui="SCI:<nom>"` / immeuble `qui=""`+`imm` / logement `qui=<ref>`. Compteurs : `cle`→`cleRepartition` (clés machine sans accent), dans `ent.immeubles[i].compteursCollectifs[]`, lié par `mv.compteurCcId` (exclusif avec `qui`).
  - **🟢 Confirmés OK** : catégorie pilote l'affectation (`STD_CATEGORIES` porte `ligne2044`+`type`) ; mécanique récupérable→compteur→régul (hors 2044) correspond au réel (`_calcCcRepartition` l.31176, `computeRegul`) ; `compteurCcId` déjà propagé au split ; comptes bancaires existent (socle réutilisable).
- **2026-06-05 (suite 5 — compte bancaire = périmètre, pré-filtre les choix à l'import)** : retour user — « ok, par contre dans import si on a défini une banque avec un bailleur ou immeuble ou bien, on peut réduire les choix ? pour moi **Crédit Agricole c'est pour un immeuble**. Quand je fais l'import Crédit Agricole (l'app sait faire la distinction par l'IBAN), je n'ai **que les données liées** ». Juste : un compte bancaire dédié à un périmètre **pré-filtre** les choix d'affectation. **Cadrage garde-fou « on ne peut pas créer de règle »** : ce n'est **pas** une règle d'auto-catégorisation (l'app ne décide pas de la catégorie/affectation à ta place) — c'est une **propriété du compte** (réglée une fois, reconnue par l'IBAN au moment de l'import) qui **restreint la liste proposée**, l'utilisateur confirme toujours chaque mouvement. **Fix** : `COMPTES{cic→Freyming(imm), ca→Tilleuls(imm), bp→SCI Keller(sci), none→non rattaché}`. Helpers `scopeLogs()/scopeImms()/scopeEnts()` filtrent **logements, immeubles ET entités** selon le périmètre du compte. (1) Le **picker logement** se base sur `scopeLogs()` + un **bandeau** « 📍 Limité au compte : 🏢 Les Tilleuls · [Voir tout le patrimoine] » ; (2) les **selects SCI/immeuble** (mode Affecter + lignes de split) sont scopés pareil, avec un mini-bandeau identique ; (3) **échappatoire** `toggleComboAll()` pour le mouvement exceptionnel (« Voir tout le patrimoine » ↔ « Revenir au compte »), qui se **ré-arme** au prochain picker ; (4) **puce de périmètre** dans l'en-tête du mouvement (`#m-scope` : 🏢 Freyming / 🏛️ SCI Keller / 🏦 Compte non rattaché). Chaque scénario démo porte son `acct` (loyer/taxe/eau/CAF/gérance → CIC·Freyming ; frais SCI + bail Forbach → Banque Pop·SCI Keller). Switcher de compte ajouté à la mk-bar pour démontrer. Vérifié Claude Preview : CA→Tilleuls = **180 logs / 1 imm / 1 ent**, chip « 🏢 Les Tilleuls » ; échappatoire = **185 / 4 imms** ; BP→SCI Keller = **184 logs / 3 imms** ; non rattaché = **185 / 4 / 2** chip `.none` ; CIC→Freyming = **3 logs**, cur recentré ; recherche `T-150` dans le scope OK ; **0 erreur console**. Commit `3a1b89f`. **À valider par user en vrai navigateur** : `mockups/loyer-refonte/affectation.html` — tester la mk-bar « Crédit Agricole→Tilleuls » puis ouvrir un picker logement (180 lots seuls + échappatoire).
- **2026-06-05 (suite 4 — sélecteur de logement scopé + cherchable, tient 180 lots)** : retour user — « ok c'est mieux, mais quand on sélectionne logement on a **tous les logements de partout**. Imagine une gérance qui a 180 lots… on fait comment ? ». Juste : un `<select>` à plat de tout le patrimoine est inutilisable à l'échelle (garde-fou #1 : hiérarchie **entité→immeuble→logement**, le picker doit être **scopé + cherchable**). **Fix** : combobox maison qui (1) **scope par défaut sur l'immeuble du mouvement** (`cur.imm` proposé en premier, badge 📍), (2) **recherche** par réf. (`T-150`) **ou** nom de locataire (`durand`), (3) **groupé par immeuble**, (4) **cap 30/groupe** avec « + N autres — précise ta recherche ». Même picker partout : mode **Affecter** (niveau logement) **et** chaque ligne de **split**. Données démo : immeuble « Les Tilleuls (parc géré) » **180 lots** générés → 185 logements au total pour prouver la montée en charge. **Frontière honnête rappelée au user** : personne ne découpe 180 lignes à la main → un gros relevé de gérance = **import du relevé structuré** (Chantier C), le split manuel reste le quotidien (2-10 lignes). Vérifié Claude Preview : empty = « 185 logement(s), immeuble du mouvement en premier », groupes [📍 Freyming(3), Forbach(1), Tilleuls(180→cap30 +150 autres), Metz(1)], recherche réf/nom OK, choix met à jour cible+badge, picker idem en Affecter, 3 scénarios split toujours équilibrés, **0 erreur console**. Commit `f96530c`. **À valider par user en vrai navigateur**.
- **2026-06-05 (suite 3 — split = N affectations, sens débit/crédit, relevé de gérance)** : retours user sur la 1ʳᵉ reconstruction du mode Découper — 3 manques **fondamentaux** : (1) une ligne de split pouvait n'aller qu'au **logement** alors qu'un poste peut viser **immeuble ou SCI** (ex. frais de gestion) ; (2) le split forçait tout en **crédit** → impossible de modéliser un **relevé de gérance** (loyers encaissés en crédit **−** frais gestion/GLI/PNO en débit, le virement reçu = le **net**) ; (3) rappel **« on ne peut pas créer de règle »**. → **Insight** capté : *un split n'est pas « 1 crédit → N crédits », c'est **N affectations qui se soldent au net bancaire** ; « Affecter à un poste » = le cas N=1 du même modèle.* Reconstruction : chaque ligne du split est une **mini-fiche** portant **sens (− Débit / + Crédit)** + **niveau SCI/immeuble/logement (badge suggéré)** + **cible** + **catégorie** + **badge destination 2044 par ligne**. Équilibre = **Σcrédits − Σdébits = net bancaire** (et non plus somme à plat). Changement de catégorie auto-règle le sens (recette→crédit, charge/intérêt→débit) et le niveau suggéré. Nouvelle méthode-seed **🏦 Relevé de gérance** (loyers crédit par logement + frais gestion 7 % / GLI en débit immeuble, net 1421 sur Freyming). Les seeds bail/CAF/gérance restent des **pré-remplissages one-shot**, jamais des règles persistantes. Vérifié Claude Preview : 5 cartes, gérance 1560cr − 139db = 1421 net ✅ équilibré, bail 700 ✅, CAF 390 ✅, badges par ligne corrects (`2044·211·recette·🚪`, `2044·221·charge·🏢`), changement catégorie recalcule sens+niveau+badge, addRow OK, **0 erreur console**. Commit `130b648`. **À valider par user en vrai navigateur** : `mockups/loyer-refonte/affectation.html` (scénario ✂️ Relevé gérance en particulier).
- **2026-06-05 (suite 2 — fenêtre « Renseigner ce mouvement » reconstruite)** : recadrage user — j'avais re-présenté par erreur les 4 anciens mockups comme « à valider » alors qu'il en avait **invalidé** plusieurs. Rappel garde-fous relu. Direction validée = **affectation uniquement**, avec raffinement : si l'affectation ne tient pas dans un tableau/vue synthétique → **clic sur la ligne ouvre une fenêtre pour renseigner**, sans oublier **les splits + autres options**. → `mockups/loyer-refonte/affectation.html` **reconstruit** en fenêtre unique ancrée sur la **vraie modale mouvement** (`ov-mv`) et le **vrai split** (`openSplitMvList`) : 2 modes **Affecter** (question pilotée catégorie + niveau SCI/immeuble/logement avec badge « suggéré » + récupérable/compteur + badge destination 2044/régul/compteur) et **Découper** (méthodes 📄 bail loyer/charges, 👨‍👩‍👧 CAF multi-locataire, ✏️ manuel ; barre d'équilibre reste/total ; badge destination par ligne) + **Autres options** (N° facture +Auto, justificatif PJ, récurrence). Nuance fiscale gérée : provision charges locataire ≠ ligne 229 (provisions copro bailleur) → nouvelle catégorie `Provision de charges (locataire)` → régularisation. Vérifié via Claude Preview : 6 scénarios OK (loyer/taxe/eau/SCI/✂️bail 620+80/✂️CAF 210+180), badges destination corrects, splits équilibrés, zéro erreur console. **Mockups rejetés supprimés** (`git rm`) : `loyer-refonte.html` (sélecteur réinventé), `import-wizard.html` (mapping CSV béquille), `split-mouvement.html` (superseded). Commit `4118b77`. **Reste à valider par user en vrai navigateur** : `mockups/loyer-refonte/affectation.html`.
- **2026-06-05 (suite — Chantier A engine livré sandbox)** : moteur 2044 unifié finalisé côté sandbox. Le module `legal-2044.js` étendu absorbe désormais les 3 oublis de l'ancien inline : charges niveau immeuble (qui vide + `imm` ∈ immeubles bailleur), forfait 222 (20 €/local via `nbLocaux`), part bailleur 225 (via `computeRegul`). **BLOQUANT trouvé par l'audit fiscal agent** : la ligne 230 (régul provisions copro N-1) était typée `'charge'` → s'ajoutait aux charges alors que la notice 2044 dit `ligne 240 = 221..229 − 230` (déduction). Erreur ~2× le montant de la régul sur le résultat foncier. **Fix** : nouveau type `'deduction'` dans le module (`lignes['230'] += amt` mais `totalCharges -= amt`), retypage STD_CATEGORIES (index-test.html), recap + CSV clarifiés « à déduire ». Aussi corrigé : `_legal2044BuildOpts` filtre `!l.archived` (logement vendu ne gonfle plus forfait 222 / refs). Re-audit agent : **CORRECT** (déduction OK, charges négatives = trop-perçu N-1 réel à ne pas plafonner, pas de double-compte CSV). Tests : +2 cas ligne 230 → suite legal-2044 27/27, suite complète **1440/1440**. Commits `3437054` (fix [sandbox]) + mockups B/C. **RESTE chantier A** (gated sur OK user sandbox) : dédup wizard inline mort (index.html 29624-29722) + port prod + bump v15.X. **Mockups B+C prêts à valider** : `mockups/loyer-refonte/` (affectation / import-wizard / loyer-refonte / split-mouvement).
- **2026-06-05** : audit exhaustif de l'existant (4 agents : import, écran Mouvements, charges/CC/régul, compta/2044/exports/pilotage) + lectures ciblées. **Découverte majeure** : le 2044 existe en double avec collision de noms (le bon — wizard inline, charges immeuble + part bailleur + forfait — est écrasé par le module testé qui, lui, oublie ces 3 choses ; l'écran Export utilise le module → 2044 faux ; le bouton Wizard 2044 plante). Carte complète présentée au user. User : « je n'ai jamais utilisé le 2044, tu es libre de faire ton choix et de nettoyer ». Décision dédup prise (moteur = module testé étendu + suppression de l'inline). Proposition pro en 3 chantiers A(2044)→B(affectation)→C(import-liste-inline). En attente : fork ordre de démarrage (A code direct, ou maquettes B+C d'abord).
- **2026-06-04** : session design. 2 mockups produits (`loyer-refonte.html` rejeté = réinventait l'existant ; `import-wizard.html` partiellement rejeté). Découverte : **le 2044 existe déjà** (`legal-2044.js`), et le bug central = charges immeuble déductibles ignorées par `_compute2044`. User a recadré (« vraie analyse et proposition, je veux que ça fonctionne », allergique aux questions-quiz). Modèle « catégorie pilote l'affectation » + 2 espèces de charges immeuble (récupérable→CC / déductible→2044) captés. Prochain pas : maquette de l'écran d'affectation (3 formats). Statut ⬜→🔄.
