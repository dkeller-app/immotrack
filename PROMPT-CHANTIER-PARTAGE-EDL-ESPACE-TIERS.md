# PROMPT CHANTIER — BUG-PARTAGE-EDL-ESPACE-TIERS (P1)

> À coller tel quel dans une NOUVELLE session Claude Code ouverte sur `C:\Users\Did_K\Desktop\Immo`.

---

Tu attaques le chantier **BUG-PARTAGE-EDL-ESPACE-TIERS** (P1) : un membre invité d'un espace partagé ne voit pas les EDL (et probablement d'autres données) de cet espace dans l'app, alors que la base et les droits RLS sont corrects.

## 0. Setup obligatoire

- **La vraie prod = `origin/main`** (lignée cloud v15.494+). Le clone `Desktop\Immo` est une branche locale STALE : ne travaille JAMAIS dessus, ne pousse jamais son `main`. Crée un **worktree frais depuis `origin/main`** (skill `superpowers:using-git-worktrees`).
- Lis d'abord : `docs/subjects/BUG-PARTAGE-EDL-ESPACE-TIERS.md` (diagnostic complet du 08/08) · `docs/subjects/P0-SUPABASE-PAUSE.md` (contexte panne, résolue) · la ligne QUEUE `feat/partage-sci-solide` dans `.index-queue/QUEUE.md` (chantier socle livré v15.483 + ses RESTES documentés).
- Migrations à connaître : `supabase/migrations/0029` (helpers `has_entite_access`/`has_entite_write`, table `entite_membre`) · `0030` (policies par table dont `edl_select` via `entite_of_logement`) · `0042`/`0043` (D3 documents + D2 config scopée RPC `espace_config_scoped`).
- Un `.env` local existe à la racine du clone stale (`C:\Users\Did_K\Desktop\Immo\.env`) avec `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (lecture/admin — prudence, données réelles).

## 1. Faits DÉJÀ vérifiés le 08/08 (ne pas re-prouver, base service-role)

- L'EDL manquant **existe au cloud, intact** : table `edl`, `legacy_id=1784120562200`, type Entrée, `date_edl=2026-07-15`, maj `2026-07-18T09:16Z`, `signed_at=null`, logement **FERRETTE 001** = `d211273b-fc6c-583a-8f47-718f8985d8fd`.
- Il vit dans l'espace de **Marion** `2e5c49db-156b-4d12-aa15-1313369f3daf` (« Mon patrimoine », owner `920818c9…` = marion.raimbeaux@gmail.com). C'est NORMAL : architecture inversée 14/07, la SCI SMARTOSAURUS vit chez elle.
- **Didier** (didierkeller@gmail.com, uid `606d2048-306e-4d44-8777-b315ab66e3e1`) est membre `espace_members` de cet espace : role espace `lecture_seule`, `full_espace=false`, actif — **ET** a un octroi `entite_membre` role **`gestionnaire`** sur l'entité **SCI SMARTOSAURUS** `6afe1b64-b4f2-5a02-b19a-f0a85e01b350` (seule entité de cet espace).
- Donc la policy `edl_select` (`has_entite_access` → `entite_of_logement`) lui **autorise la lecture ET l'écriture** de cet EDL. **RLS = hors de cause.**
- Côté client : `resolveEspaces()` (`js/app/supabase-boot.js:81`) liste bien l'espace de Marion (membership actif) et `wireStores({espaces,…})` (`js/app/supabase-entry.js:826`) monte 1 store par espace. Le boot DEVRAIT donc hydrater l'EDL. **Le bug est côté client** (fetch/hydratation/fusion/affichage).
- Symptôme user : connecté sur SON compte (PC, post-restauration Supabase), la liste EDL ne montre pas l'EDL de juillet.

## 2. Pistes principales (dans l'ordre)

1. **Follow-on documenté jamais traité** (fiche QUEUE partage-sci) : « store-multi ne fusionne pas encore le sous-blob config filtré des espaces TIERS (config = espace propre uniquement aujourd'hui) ». Vérifie si l'hydratation des espaces tiers fetch TOUTES les tables (dont `edl`) ou un sous-ensemble, et si le résultat est réellement fusionné dans `DB.edl`/`DB.logements` de la vue du membre scopé.
2. **Homonymie / collision** : Didier possède dans SON espace une **ARCHIVE FIGÉE** de SMARTOSAURUS (Option C, décision user — À PRÉSERVER) avec les MÊMES refs (`FERRETTE 001`…). Le mécanisme `espTag='@@'+_espaceId` (D1) désambiguïse le diff sync — mais vérifie la **liste EDL UI** et les résolutions par `ref` (`edl.logement` est une ref texte !) : un EDL de l'espace tiers rattaché à la ref « FERRETTE 001 » peut être absorbé/masqué par le logement homonyme local.
3. Erreur silencieuse pendant l'hydratation de l'espace tiers (RPC config `espace_config_scoped` vs SELECT durcie, promesse avalée…).

## 3. Méthode imposée

- **Repro locale AVANT tout fix** : ne débogue PAS sur les comptes réels. Monte la repro avec des comptes de test (`didierkeller+test0@gmail.com` existe, uid `abdbbc80…` ; crée un 2ᵉ compte test via l'API admin + `.env` si besoin) : espace A owner avec 1 entité/1 logement/1 EDL → membre B scopé `entite_membre gestionnaire` → connecte-toi en B (app déployée ou harness) → constate ce que B voit. Le bug doit être **reproduit puis fixé puis re-vérifié** sur cette repro.
- **TDD** (`superpowers:test-driven-development`) sur la couche store (`js/core/store-*.js` : tests offline Vitest) + si policies/RPC touchées, suite **RLS vrai Postgres** (`supabase/tests/`, `.env` requis).
- **DRY absolu** (`feedback_dry_reuse_no_copy`) : réutilise `espTag`/mécanismes D1-D3 existants, ne recopie rien.
- **Périmètre** : le fix doit couvrir l'EDL **et** les autres collections du même chemin (si le fetch tiers est partiel, il l'est pour tout) — mais ne touche NI au fiscal (`_compute2044` Σ211), NI au moteur loyers (`duMois()`), NI à l'archive figée de Didier (aucune purge/fusion des homonymes locaux).
- **Audit `superpowers:code-reviewer` OBLIGATOIRE** avant tout « prêt à tester » (`feedback_audits_par_agents`) — chantier sync/partage = catégorie sensible.
- **`index.html`** : si tu dois le toucher → CRLF préservé, bump version aux 5 spots (title + `<em>` + `IMMOTRACK_VERSION` + récap diag + `sw.js` CACHE_VER), et **jamais de push direct sur main** : inscris-toi dans `C:\Users\Did_K\Desktop\Immo\.index-queue\QUEUE.md` (protocole `docs/INDEX-COMMIT-PROTOCOL.md`). Les fichiers `js/core/*`/`js/app/*` suivent le même circuit (branche + QUEUE) si la session maître intègre.
- **Backlog temps réel** : à chaque jalon, mets à jour `docs/subjects/BUG-PARTAGE-EDL-ESPACE-TIERS.md` + `BACKLOG.md` + commit `Pilotage : …` (`feedback_pilotage_realtime`).

## 4. Definition of done

1. Repro test : membre scopé voit l'EDL (et les collections sœurs) de l'espace tiers, dans la limite de ses octrois — et RIEN au-delà (pas de fuite d'une entité non octroyée).
2. Pas de régression mono-espace (suite offline complète verte, ~2180 tests) ni de doublon FERRETTE avec l'archive figée locale de Didier.
3. Audit code-reviewer SÛR.
4. **E2E réel avec le user en dernière étape** (c'est le « RESTE » historique du chantier partage) : Didier se connecte → voit l'EDL du 15/07 de FERRETTE 001 ; Marion (owner) le voit aussi ; smoke des deux côtés. Prévois les instructions console F12 à donner au user si la repro test ne reproduit PAS le symptôme (dans ce cas, diagnostic sur son poste AVANT de coder).

## 5. Contexte produit (pour ne pas dériver)

- Partage par SCI = **non négociable** (`project_partage_sci`) ; le WHY de Propryo = la simplicité (`project_propryo_why`).
- Pense SaaS : le fix doit marcher pour N espaces / N entités / rôles lecture_seule ET gestionnaire, pas juste le cas Didier↔Marion (`feedback_deploy_commercialize`).
- Contournement actuel communiqué au user : passer par le compte de Marion. Pas de pression de délai légal, mais l'EDL d'entrée du bail Baysang (18/07) dépend de cette visibilité → qualité d'abord, pas de solution passable (`feedback_no_compromise`).
