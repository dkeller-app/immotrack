# Partage par SCI — isolation Storage · Realtime · membres · config · écritures (rapport de chantier)

**Dates** : 2026-09-17 → 2026-09-18 · **Type** : sécurité (isolation multi-tenant intra-espace, anti-élévation)
**Branche** : `feat/partage-isolation-sci` (worktree `Immo-wt-partage-secu`, base `origin/main` `7088789` v15.633)
**Spec** : `docs/superpowers/specs/2026-09-17-partage-isolation-sci-design.md`
**Statut** : 4 migrations écrites et prouvées (0050→0053). **AUCUNE n'est appliquée en prod** — GO Didier requis.

## 1. Objectif

Lever le verrou écrit dans `supabase/migrations/0030_p1_partage_sci_rls.sql` l. 34-41 (« NE PAS créer de membre scopé · NE PAS activer le partage » tant que Storage et Realtime restent filtrés au niveau espace). Un membre **scopé** (`espace_members.full_espace=false` + octroi `entite_membre` sur UNE SCI) ne doit ni lister/télécharger les fichiers d'une autre SCI, ni recevoir ses données par Realtime/re-pull. Un membre **plein** (`full_espace=true`) continue de tout voir.

## 2. État réel de la base hébergée (lu dans `pg_policies` / `pg_proc`, pas déduit des fichiers)

| Surface | Policy en prod | Origine | Verdict |
|---|---|---|---|
| `storage.objects` bucket `espace-files` (4 commandes) | `has_entite_access` / `has_entite_write( safe_uuid(seg1), safe_uuid(seg2) )` | 0031 | **par-SCI** — le commentaire de 0030 est périmé |
| `realtime.messages` canal `espace:<id>` | `is_full_member(...)` SELECT + INSERT | 0048 | scopé **exclu** du canal |
| 12 tables métier + `candidats` — LECTURE | `has_entite_access` sur l'entité de la ligne | 0030 / 0034 / 0037 / 0042 | par-SCI |
| idem — **ÉCRITURE** | `has_entite_write(coalesce(entite_id, entité du logement, entité de l'immeuble))` | 0030 / 0034 / 0037 | **FAILLE** (§3-M1) : le premier rattachement non NULL gagne |
| **`espace_config` via RPC `espace_config_scoped`** | filtre 8 clés connues, renvoie **tout le reste** | 0043 / 0044 | **FAILLE BLOQUANTE** (§3-B1) |
| `espace_config_private`, `audit_log` SELECT, `invitations` | `is_full_member` / `is_full_manager` | 0035 / 0047 / 0032 | membres pleins seulement |
| `entite_membre` SELECT | `is_full_manager OR user_id = auth.uid()` | 0029 | un scopé ne voit que ses octrois |
| **`espace_members` SELECT** | `is_member(espace_id)` | 0003 | **FUITE** : liste des membres + emails |

Fonctions d'autorisation : toutes `SECURITY DEFINER` + `search_path=''`. **Mais** `anon` a `EXECUTE` sur toutes (grants par défaut Supabase, que `revoke … from public` ne retire pas — lu dans `pg_proc.proacl`).

**Realtime — ce qui transite** : le broadcast `changed` a un payload vide (`supabase-entry.js` l. 1049) ; le récepteur déclenche `_repullSoon()` (l. 1317) qui rejoue `fetchTable` sous RLS. Aucune donnée métier ne passe par Realtime. Le client ne s'abonne qu'au canal de son espace propre.

**Storage — convention de chemin** : `<espace_id>/<entite_id>/files/<clé>` (client `__immoCloudUpload` + `__immoEntiteUuid`, `supabase-entry.js` l. 372-418 ; `index.html` l. 7116-7156, 8337) ; `<espace_id>/_orphelin/files/…` si SCI non résolue ; `<espace_id>/files/…` = legacy d'avant 0031. Seg2 non-uuid → membres pleins seulement. **Le chemin encode déjà la SCI : aucune décision d'architecture n'était à prendre.**

Inventaire prod (comptage seul) : 6 espaces · 8 membres dont **1 scopé actif** · Storage **275 par-SCI · 53 legacy · 10 orphelins** · 0 ref de logement ambiguë · 0 immeuble homonyme multi-SCI · 0 invitation en attente · 1 bail dont `entite_id` ≠ entité de son logement (donnée d'un membre plein, sans effet).

## 3. Failles trouvées (deux audits adversariaux `superpowers:code-reviewer`, 2026-09-18, toutes re-vérifiées dans le code puis reproduites)

| # | Sévérité | Faille | Reproduite par | Fermée par |
|---|---|---|---|---|
| — | Majeur | `espace_members` lisible en entier par un scopé (user_id, rôle, `invite_email`) | sim 0050 + Vitest (Bob voit 3 lignes) | **0050** |
| B1 | **Bloquant** | `espace_config_scoped` = denylist : toute clé non listée part chez le scopé. En prod : `importRules` (33 règles bancaires : libellés ↔ logements de toutes les SCIs), `templates`, `edlTemplates`, `catMapping`, `params.mandataire`, `params.quittancesMeta`… + toute clé future (`bailEvents`, `params.bankPending`). **Exploitable aujourd'hui** par le scopé actif | sim + Vitest (`categories`, `importRules`, `params`, clé inconnue reçus par Bob) | **0051** |
| M1 | Majeur | Écriture croisée : une gestionnaire scopée de SCI-A insère `{entite_id: SCI-A, logement_id: <logement SCI-B>}` (ids déterministes → devinables). Squat des index uniques « bail actif par logement » / « quittance par (logement, mois) », oracle 23505 d'occupation/paiement, pollution agenda/candidats/mouvements, logement rangé sous un immeuble de SCI-B | sim + Vitest (8 écritures forgées acceptées) | **0052** |
| F2 | Majeur | Filtre de config contournable par **variante de casse** : créer `f-001` dans SCI-A donne la config de `F-001` de SCI-B (`lower(btrim())` vs unicité exacte) ; idem immeuble homonyme | sim + Vitest | **0053-A** |
| F4 | Mineur | Résolveurs `entite_of_*` = oracles d'existence (appelables par tout authentifié **et par anon**) | sim + Vitest (UUID de SCI-B révélé à Bob) | **0053-B** |
| m2 | Mineur | Octroi `entite_membre` survivant à la révocation de la seule ligne `espace_members` | sim (2 logements encore visibles) | **0053-C** |
| L1 | Majeur (latent) | **Lecture** croisée par `entite_id` périmée : les SELECT prenaient aussi le premier rattachement non NULL. Prod : **190 lignes d'agenda** (1 espace, 0 scopé) dont l'`entite_id` ne correspond ni à leur immeuble ni à leur logement → un scopé de l'entité périmée verrait des événements d'un logement d'une autre SCI | contrôle de données prod + sim + Vitest | **0052** (lecture fail-closed) + **0053-E** (`entite_of_bail`) |
| F6 | Mineur/Majeur | `accept_invitation` : lien au porteur **éternel**, non lié à l'email, course entre deux comptes, ré-activation d'une ancienne ligne « plein » en membre plein | sim | **0053-D** |

Points jugés **solides** par les deux audits : Storage 0031 (list racine, move, copy, upload signé, seg2 non-uuid, entité d'un autre espace), Realtime 0048 (topics dérivés, présence, payload), gel d'identité `entite_membre`, `purge_*`, anti-auto-élévation `espace_members`, et la migration 0050 elle-même (aucune régression trouvée).

## 4. Livré

1. **`0050_espace_members_select_scope.sql`** — `members_select` = membre plein OU sa propre ligne.
2. **`0051_espace_config_scoped_allowlist.sql`** — pour un scopé la RPC construit un objet **neuf** ne contenant que les 7 clés par-SCI filtrées ; tout le reste n'est plus renvoyé (fail-closed sur toute clé future). Impact fonctionnel nul : `store-multi.js` jette déjà la config d'un espace tiers (`else if (s.mine)`). Membre plein : blob intégral inchangé.
3. **`0052_partage_write_coherence.sql`** — helpers `has_entite_write_all` et `has_entite_access_all(espace, entite, logement, immeuble)` : membre plein inchangé (court-circuit) ; scopé = droit sur **chaque** rattachement non NULL, au moins un requis. Appliqués aux policies d'écriture **et de lecture** de `baux`, `baux_historique`, `quittances`, `candidats`, `agenda`, `mouvements`, `logements`.
4. **`0053_partage_durcissement.sql`** — (A) filtres de config fail-closed sur ambiguïté de clé normalisée · (B) résolveurs gardés par `has_entite_access` + `EXECUTE` retiré à `anon` · (C) branche scopée de `has_entite_access/write` conditionnée à `is_member` · (D) `accept_invitation` : `for update`, liaison à l'email **du compte** (`auth.users.email`) quand `invite_email` est renseigné, ré-activation forcée en scopé lecture **avec purge des octrois dormants**, retour idempotent avant le test d'expiration, `expires_at` par défaut 7 jours · (E) `entite_of_bail` exige l'accès à l'entité du bail **et** du logement ; `entite_of_document` branche `mouvement` : repli `immeuble_id`.
5. **Preuves** : `supabase/tests/sim/0050-espace-members-scope.sim.mjs`, `supabase/tests/sim/0051-0053-partage-durcissement.sim.mjs` (transactions **ROLLBACK**), `supabase/tests/p1-partage-isolation-scope.test.mjs` (Vitest, 3 utilisateurs réels).
6. **`scripts/db-run.mjs`** — runner pg versionné (process réel d'application des migrations, §6).
7. Aucune ligne du monolithe ni des modules `js/` modifiée → pas de bump de version (précédent : commits de traçabilité 0048/0049).

## 5. Preuve d'isolation

### 5.1 Simulations SQL (rollback) — base hébergée, 2026-09-18
`SIM 0050 OK` (6/6) · `SIM 0051-0053 OK` (tous contrôles, dont ceux ajoutés après le contre-audit), « espace de simulation persisté ? non », `has_entite_write_all` absent après rollback.

Mesures de la simulation 0051-0053 (Carol = gestionnaire scopée SCI-A) :

| Mesure | État actuel | Après 0051+0052 | Après 0053 |
|---|---|---|---|
| Clés de config reçues | `bailEvents, categories, importRules, params, templates, zzzCleInconnue` + 4 par-SCI | 4 par-SCI seulement | 4 par-SCI seulement |
| Trace de SCI-B dans sa config (variante de casse) | OUI | OUI | **non** |
| Écritures forgées acceptées | baux, quittances, candidats, baux_historique, agenda ×2, mouvement, logement | **aucune** | aucune |
| Oracle entité de SCI-B | révélée | révélée | **NULL** |
| Logements visibles après révocation de l'appartenance | 2 | 2 | **0** |
| Invitation nominative acceptée par un autre email | oui | oui | **non** |
| Ré-activation d'une ancienne ligne « plein gestionnaire » | redevient plein gestionnaire | idem | **scopé lecture_seule** |
| Ligne à `entite_id` périmée (entité A + logement B) vue par Carol | oui | **non** | non |
| Octroi dormant « gestionnaire SCI-B » après ré-activation par une invitation lecture SCI-A | réveillé | réveillé | **purgé** |
| Rouvrir son lien déjà accepté après expiration | « expirée » | « expirée » | **no-op** |

Non-régressions vérifiées : Alice (plein) reçoit le blob intégral, écrit sur SCI-B et sans rattachement ; Carol écrit normalement dans SCI-A (entité + logement, logement seul, mouvement d'immeuble, nouveau logement) ; le résolveur renvoie toujours l'entité de SCI-A ; l'invitation est acceptée par le bon email (insensible à la casse) et par lien porteur quand `invite_email` est NULL.

### 5.2 Suite Vitest à utilisateurs réels — base hébergée, **avant** tout déploiement : 30 passés / 7 échoués attendus (run du 2026-09-18 ; un 38ᵉ test « lecture fail-closed » a été ajouté ensuite, il échouera aussi jusqu'au déploiement de 0052)
| Bloc | Résultat |
|---|---|
| RE-PULL des 12 tables via le vrai `createSupabaseAdapter.fetchTable` + `baux_evenements` : Bob reçoit SCI-A, jamais SCI-B | ✅ 13/13 |
| STORAGE : `list` racine (Bob ne voit que le dossier SCI-A), `list` SCI-B vide, `createSignedUrl` SCI-B refusé / SCI-A téléchargé (HTTP 200), legacy + orphelin refusés (erreur applicative vérifiée), `remove` / `move` / `copy` / upload signé vers SCI-B refusés et fichier intact, `remove` SCI-A par Carol OK | ✅ 10/10 |
| REALTIME : Alice SUBSCRIBED · Bob SUBSCRIBED sur son espace **avant et après** ses refus (socket chaude, pas un faux vert) · Bob DENIED sur `espace:<A>` et `espace:<A>:x` · Carol DENIED | ✅ 5/5 |
| `espace_members` : Alice voit les 3 · Bob retrouve ses 2 espaces au boot | ✅ 2/2 |
| `espace_members` : Bob / Carol ne voient que leur ligne | ❌ ×2 → **0050** |
| Config : aucune clé hors allowlist pour Bob | ❌ → **0051** |
| Écritures forgées de Carol (baux ; quittances/candidats/agenda/mouvements/logements) | ❌ ×2 → **0052** |
| Oracle `entite_of_logement` · variante de casse | ❌ ×2 → **0053** |

Les 7 échecs sont la **démonstration des failles avec de vrais comptes** ; ils doivent passer au vert après déploiement (critère de recette).

Suite unitaire `npx vitest run` : 4053 passés ; 1 fichier en échec **préexistant sur origin/main** (`__tests__/helpers/biens-surfaces.test.js`, `TypeError: Failed to fetch`, dépend du réseau).

### 5.3 Contre-audit des migrations 0051→0053 (`superpowers:code-reviewer`, 2026-09-18)

Verdict : **aucun bloquant, les trois migrations sont déployables**. Intégré avant commit : purge des octrois dormants (M2), idempotence avant expiration (m2), email du compte plutôt que du JWT + en-tête qui ne sur-promet plus (M3), repli `immeuble_id` dans `entite_of_document` (m4), normalisation élargie de la branche « ambiguïté » (m3), mise à jour de l'assertion `categories` de `p1-partage-sci.test.mjs` cassée par 0051 (m1). Confirmé par le contre-audit : court-circuit membre plein partout, noms de policies réels, idempotence et ordre 0050→0053, `revoke … from anon` sans dépendance, pas de récursion, pas d'oracle 42501/23505 à l'INSERT forgé, impact fonctionnel nul de 0051.

**Contrôle des données de prod demandé par le contre-audit (lecture seule, 2026-09-18)** — lignes à rattachements incohérents :

| Contrôle | Lignes |
|---|---|
| logements : entité ≠ entité de leur immeuble | 0 |
| baux / candidats : `entite_id` ≠ entité du logement | 1 / 1 |
| quittances / baux_historique : idem | 0 / 0 |
| mouvements : `entite_id` ≠ entité de l'immeuble | 1 |
| agenda : `entite_id` ≠ entité de l'immeuble | **190** (1 seul espace, 143 supprimées, **0 membre scopé** dans cet espace ; immeuble et logement concordent entre eux → c'est l'`entite_id` de l'événement qui est périmée) |
| noms d'immeuble déclarés par plusieurs entités d'un même espace | 0 |

Impact aujourd'hui : nul (aucun scopé dans les espaces concernés ; membres pleins non affectés). **Règle à retenir** : avant d'inviter un membre scopé dans un espace, rejouer ces contrôles ; une ligne incohérente lui sera invisible et non modifiable (fail-closed), et la sync d'un gestionnaire scopé retenterait l'écriture refusée. La cause (l'app pose une `entite` périmée sur les événements d'agenda) est un sujet applicatif distinct.

## 6. Déploiement (process réel)

- Le suivi CLI (`npx supabase migration list --db-url …`) ne connaît en **remote** que 0001→0037 (sans 0033). 0033 et 0038→0049 ont été appliquées par un runner pg de scratchpad (commits `1787ac2`, `812c7bf`) **sans** enregistrement dans `supabase_migrations.schema_migrations`. → **`supabase db push` est interdit** (il rejouerait des `create table` non idempotents).
- Après **GO Didier**, depuis `Desktop\Immo` (là où vit `.env`), dans l'ordre :
  ```bash
  node scripts/db-run.mjs migrate supabase/migrations/0050_espace_members_select_scope.sql
  node scripts/db-run.mjs migrate supabase/migrations/0051_espace_config_scoped_allowlist.sql
  node scripts/db-run.mjs migrate supabase/migrations/0052_partage_write_coherence.sql
  node scripts/db-run.mjs migrate supabase/migrations/0053_partage_durcissement.sql
  ```
  Recette : `npm run test:rls` (suite complète : `rls-isolation`, `p1-invitations`, `p1-partage-sci`, `repro-partage-edl-tiers`, et les 37 tests de ce chantier au vert).
- Priorité si déploiement échelonné : **0051 d'abord** (fuite active pour le scopé en prod), puis 0050, 0052, 0053.
- Réalignement optionnel du suivi CLI : `npx supabase migration repair --status applied 0033 0038 0039 0040 0041 0042 0043 0044 0046 0047 0048 0049 --db-url …`.

## 7. Reste / hors périmètre (documenté, non fait)

1. **Empoisonnement de l'hydrate par `legacy_raw` (audit n°2, F3 côté client)** — `store-supabase.js` reconstruit la base mémoire depuis `legacy_raw` seul (`fetchTable` ne lit que `id, version, legacy_raw`). Une gestionnaire scopée peut écrire, dans SA SCI, une ligne dont le `legacy_raw` porte la clé naturelle d'un bien de SCI-B (`__key: 'F-001'`) : à l'hydrate du propriétaire, le faux bail peut remplacer le vrai en mémoire. 0052 ferme la voie SQL (colonnes), pas celle-ci. Correctif = l'hydrate lit aussi `entite_id / logement_id` et rejette toute ligne dont le `legacy_raw` contredit les colonnes. **Lot client dédié (TDD + audit), préalable à tout octroi « écriture » à un tiers qui n'est pas de confiance.** Sans objet pour un octroi « lecture ».
2. **Fichiers legacy** : 53 `<espace>/files/…` + 10 `_orphelin` restent invisibles d'un scopé (fail-closed voulu). À re-ranger sous leur SCI avant d'ouvrir une SCI dont les fichiers datent d'avant 0031. Chantier de données séparé.
3. `espaces` SELECT `is_member` + RPC `espace_plan` : un scopé lit le nom de l'espace (nécessaire) et les colonnes d'abonnement (`plan_id`, `stripe_customer_id`…).
4. `audit_log` INSERT `is_member` : un scopé lecture peut injecter des entrées (append-only, `user_id` forcé, lecture réservée aux pleins). Pollution, pas de fuite.
5. `espace_config` écriture et `espaces_update` gardés par `has_role` sans `full_espace` : sûr tant qu'un scopé garde le rôle d'espace `lecture_seule` (ce que fait `accept_invitation`).
6. `_revokeMember` (`supabase-entry.js` l. 529-531) exécuté par un gestionnaire plein non-owner : le delete `espace_members` touche 0 ligne sans erreur → « révoqué » affiché à tort. 0053-C n'y change rien (la ligne reste active) ; correctif client : vérifier le nombre de lignes supprimées.
7. Pas de bouton « Annuler l'invitation » côté client ; `entite_of_document` branche `mouvement` sans repli `immeuble_id` (justificatif d'un mouvement d'immeuble invisible du scopé — trou fonctionnel).
8. Une URL signée créée par un scopé sur SA SCI survit à sa révocation jusqu'à expiration (5 min par défaut) ; Realtime n'évalue l'autorisation qu'à l'entrée dans le canal.
9. Limite de la liaison email des invitations : la confirmation d'email est désactivée (`config.toml` `enable_confirmations=false`, en attente du domaine propryo.fr). Tant que l'invité n'a pas créé son compte, quelqu'un qui détient le lien **et** connaît l'adresse peut s'inscrire à sa place. À lever avec l'activation de la confirmation.
10. Clé de config orpheline : une ref présente dans `irlHistorique` / `loyerBareme` / `emailsSent` sans aucune ligne `logements` (bien supprimé avant l'import cloud) serait attribuée à une gestionnaire scopée qui recréerait cette ref dans sa SCI. Parade radicale possible : renvoyer `{}` à tout scopé (le client jette déjà cette config).
11. Oracle résiduel inhérent aux ids déterministes : une insertion légitime dans SA SCI avec un id ou une ref déjà pris ailleurs révèle son existence (23505). Le commentaire périmé de `store-supabase-adapter.js` l. 43-47 (« le scopé reçoit les clés d'app ») reste à corriger lors du prochain lot client.
12. Le commentaire « GAP SÉCURITÉ CONNU » de 0030 l. 34-41 est périmé ; on ne réécrit pas une migration appliquée — l'en-tête de 0050 et ce rapport font foi.
13. Smoke utilisateur (3 formats) + parcours partage réel Didier ↔ membre scopé après déploiement.

## 8. Verdict

Après déploiement de 0050→0053 et recette verte : le verrou peut être levé pour le partage **en lecture**, et pour le partage **en écriture avec un partenaire de confiance**. Il reste fermé pour un octroi « écriture » à un tiers quelconque tant que le point 7.1 n'est pas traité.
