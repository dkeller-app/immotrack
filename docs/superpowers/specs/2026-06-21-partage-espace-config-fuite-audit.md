# Audit anti-fuite « vue partenaire scopé » + design du correctif — `espace_config`

> **Statut : AUDIT + PROPOSITION DE DESIGN (à valider par l'utilisateur).** Pas encore implémenté.
> Déclencheur : test du partage par-SCI avec une partenaire scopée (membre `full_espace=false`, accès à 1 SCI).
> Date : 2026-06-21. Lié à `project_partage_sci`, `project_cloud_cutover_finition`.

## TL;DR
Les 12 tables métier sont **bien cloisonnées par-SCI** (RLS, déjà audité). **MAIS** tout le reste du `DB`
legacy (params, candidats, cautions, auditTrail, templates, catégories…) est stocké dans **un seul blob
`espace_config.data`** dont la RLS est `is_member` (= **niveau espace**, pas par-SCI). Un membre **scopé
lit donc le blob ENTIER** → fuite de données d'autres SCI + de données privées du propriétaire, dont **un
secret** (clé API du relais de signature).

## Mécanique (preuves)
- `js/core/store-supabase.js` `hydrate()` : reconstruit `DB` depuis les 12 tables, **puis** injecte tout
  `espace_config.data` (`fetchConfig()`) dans `DB` pour les clés hors-tables (l.78-83).
- `extractConfig`/snapshot (store-supabase l.53, store-sync l.106) : écrit dans le blob **toute clé `DB.*`
  sauf les 12 tables + `_modifiedAt`** (`CONFIG_EXCLUDED`). Donc params, candidats, cautions, auditTrail,
  catMapping, customs, templates, categories, irlTable… y vont tous.
- `supabase/migrations/0027_espace_config.sql` : `select` policy = `is_member(espace_id)` → **tout membre lit**.
- `supabase/migrations/0030_…rls.sql` (commentaire) : « espace_config N'EST PAS couverte : config d'espace ».
  L'hypothèse « ce n'est que de la config » est fausse : le blob contient aussi des **données métier par-SCI**
  et un **secret**.
- `_relayCfg()` (index.html ~46462) lit `DB.params.bailSignAppKey` / `bailSignRelayUrl` → la clé du relais
  de signature est dans `params` → synchronisée dans le blob → **lue par tout membre scopé**.

## Inventaire des fuites (membre scopé sur 1 SCI)
| Donnée (clé `DB`) | Gravité | Pourquoi c'est un problème |
|---|---|---|
| `params.bailSignAppKey` (+ url) | 🔴 SECRET | Clé API du worker Cloudflare de signature. Un associé peut créer/forger des sessions de signature sur le relais du propriétaire. |
| `candidats` | 🟠 Vie privée | Tous les candidats de TOUTES les SCI (identité, contact, revenus, score). Confirmé par le test. |
| `cautions` | 🟠 Vie privée | Garants de toutes les SCI (données personnelles). |
| `auditTrail` | 🟡 | Journal d'activité du propriétaire, toutes SCI confondues. |
| `params` (identité/réglages) | 🟡 | `userName`/`mandataire`/`gerantDefaut`/`legal`… Une partie est l'info LÉGITIME de la SCI gérée (OK pour un co-gestionnaire de cette SCI), une partie est globale au propriétaire. À démêler. |
| `categories`,`catConfig`,`catMapping`,`customs`,`templates`,`edlTemplates`,`piecesEDL`,`importRules`,`equipements`,`irlTable`,`irlHistorique` | 🟢 OK | Config / gabarits / barème de référence — pas de données par-SCI. Partage acceptable. |

Note write : un scopé **ne peut pas écrire** `espace_config` (policy `has_role(owner|gestionnaire)`, or un
scopé est `lecture_seule` au niveau espace). Donc pas d'écrasement — mais lecture totale = la fuite. Effet
de bord : un partenaire **gestionnaire** d'une SCI ne peut pas non plus éditer candidats/cautions (read-only).

## Correction de la conclusion #4 précédente
Précédemment noté « #4 candidats = PAS une fuite, localStorage-only ». **FAUX.** 0021 dit qu'il n'y a pas de
*table* dédiée ; mais les candidats vivent dans le **blob `espace_config`** (cloud) → vraie fuite cloud.

## Design du correctif (proposition)
Principe : un membre ne doit pouvoir LIRE côté serveur (RLS) que ce qui le concerne. Le filtrage
côté client ne suffit pas (la donnée transiterait quand même vers son navigateur). → corrections **serveur**.

1. **🔴 Secret hors du blob synchronisé (urgent, contenu) :**
   - `bailSignAppKey` (et tout secret) ne doit JAMAIS partir dans `espace_config`. Le stocker en
     **local-only par appareil** (localStorage dédié, jamais synchronisé) — cohérent avec « l'APP_KEY reste
     locale » déjà écrit pour la candidature. `bailSignRelayUrl` (non secret) peut rester en config.
   - **Scrub** des blobs existants : migration `update espace_config set data = data - 'params'…` ciblée, ou
     filtre à l'écriture + ré-écriture. À cadrer (ne pas perdre les params légitimes).
   - Impact UX propriétaire : ressaisir la clé relais par appareil (acceptable pour un secret).

2. **🟠 candidats + cautions → vraies tables par-SCI :**
   - Nouvelles tables `candidats` / `cautions` (RLS par-SCI via `logement_id`→entité, comme `edl`), retirées
     du blob. Mappers store + résolveurs + wiring app. Donne aussi l'écriture aux gestionnaires de SCI.
   - Plus gros morceau ; migration + RLS + tests `test:rls` + audit `code-reviewer` (règle).

3. **🟡 auditTrail :** scoper par-SCI, ou réserver aux membres pleins (un scopé ne voit pas l'activité
   cross-SCI du propriétaire). Le plus simple : ne pas hydrater `auditTrail` pour un scopé.

4. **🟡 params :** séparer **config partageable** (templates/catégories/IRL → reste en `espace_config`) de
   **l'identité/préférences propriétaire**. Un scopé reçoit la config partageable + SA propre identité auth
   (déjà fait pour l'affichage en v15.320). À cadrer : quels champs `params` sont « globaux SCI légitimes »
   (mandataire/gérant/légal de la SCI gérée = OK) vs « propriétaire-privé ».

## Ordre proposé
1. (1) secret — le plus grave, le plus contenu.
2. (2) candidats/cautions — la fuite confirmée + le besoin fonctionnel (partage réel).
3. (3)+(4) auditTrail + split params — finition de l'isolation.

Chaque étape = migration + `test:rls` + audit `code-reviewer` AVANT « prêt » (règle non négociable).
À valider avant implémentation (brainstorm interactif quand l'utilisateur est dispo).
