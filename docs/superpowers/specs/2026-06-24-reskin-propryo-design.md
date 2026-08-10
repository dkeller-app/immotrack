# Re-skin Propryo — spec design (2026-06-24)

État : **design validé en maquette**, prêt pour plan d'implémentation.
Maquettes de référence (validées par l'utilisateur) : `mockups/redesign-app/dashboard-reel-propryo.html` (re-skin fidèle de l'écran Accueil réel, clair + sombre) + les 3 explorations `A/B/C` + `mockups/charte/index.html` (charte de marque validée). Tokens charte : `docs/charte-graphique-propryo.md`.

## 1. But & principe

Habiller l'app **ImmoTrack/Propryo** selon la charte de marque Propryo (corail = accent unique sur base neutre, typo Schibsted Grotesk + Inter, 2 modes Clair + Sombre **bien contrastés**). L'utilisateur a explicitement demandé « du contraste et de la lisibilité dans l'ensemble » — c'est le critère d'acceptation n°1, et le mode Sombre actuel (« Boursorama » `#0A0E27`, surfaces plates) est précisément ce qu'on corrige.

**Principe de mise en œuvre = re-skin par re-valorisation des tokens.** L'app définit déjà ses couleurs via des variables CSS (`--bg`, `--sur`, `--acc`, …) par thème dans `css/main.css`. On **change les VALEURS de ces variables** (par mode), on **ne renomme rien** → aucun site d'usage CSS/HTML n'a besoin de changer. C'est ce qui rend le re-skin sûr et « design seulement ».

## 2. Périmètre (accord explicite avec l'utilisateur)

**DANS le périmètre :**
- Re-valorisation des tokens de thème dans `css/main.css` (couleurs des 2 modes).
- Typo : ajout du `<link>` Google Fonts (Schibsted Grotesk + Inter) dans `index.html`, `--font`/`--display`, application du display aux titres + gros chiffres KPI.
- Quelques **overrides ciblés** là où la simple re-valorisation ne suffit pas (voir §5 : item de nav actif, ombres→halos en sombre, audit anti-aplat corail).
- Bascule **3 thèmes → 2 modes** (Clair/Sombre) : `toggleTheme` + labels (voir §6, décision à confirmer).
- Règle **« couleur = sens »** pour les graphes/sémantiques (validée en maquette, voir §7).
- Correctif **bouton Retour** (History API), inclus ici car il appartient au shell (voir §8). `persistSession:false` conservé (décision utilisateur 2026-06-24).

**HORS périmètre (NE change PAS) :**
- Aucun widget, graphe, drill-down, KPI, donnée ou logique JS métier. Le dashboard garde **tous** ses graphiques et drill-downs (jauge, cash-flow 12 mois, 12 sujets, rangée KPI + sparklines, ventilation par entité…). Re-skin ≠ refonte fonctionnelle.
- Aucune restructuration de layout ni de navigation (au-delà du câblage History du bouton Retour).
- Le rebrand « ImmoTrack »→« Propryo » (logo **ET** ~35 chaînes) est **entièrement reporté au chantier E1** (décision 2026-06-24). Le re-skin **ne touche pas le nom** : le logo reste « ImmoTrack » et hérite juste de la nouvelle typo/teinte comme le reste.

## 3. Identité visuelle (charte — non négociable)

- **Corail = ACCENT SEULEMENT** : CTA/boutons primaires, liens, anneau de focus, point du logo, item de nav actif (liseré), **UN seul** chiffre clé par écran (l'encaissement). **JAMAIS** de fond/carte/panneau corail.
- **Neutres = la base** (fonds, surfaces, cartes, textes, bordures).
- Typo : **Schibsted Grotesk** (display 800, titres + chiffres KPI) + **Inter** (texte courant).
- **Mode Sombre** : surfaces **nettement détachées** du fond + **bordures visibles** ; ombres → bordures/halos ; contraste AA bloc par bloc.

## 4. Mapping des tokens (existant → charte), par mode

Source charte : `docs/charte-graphique-propryo.md`. Les noms de variables restent identiques ; seules les valeurs changent.

### Mode CLAIR — appliqué à `[data-theme="sobre"]` (et `colore` y est rabattu, cf §6)

| Variable (existante) | Valeur actuelle (sobre) | → Valeur Propryo CLAIR | Note |
|---|---|---|---|
| `--bg` | `#F4F6FB` | `#f4f5f8` | fond app |
| `--sur` | `#FFFFFF` | `#ffffff` | cartes/panneaux |
| `--sur2` | `#FAFBFD` | `#f7f8fb` | inputs/surfaces creusées |
| `--sur3` | `#F0F3F8` | `#eef1f6` | hover/alt (neutral-soft) |
| `--bor` | `rgba(20,25,54,.08)` | `#e4e7ee` | bordures (charte `--line`) |
| `--bor2` | `rgba(20,25,54,.04)` | `#eef0f5` | bordures fines (`--line-2`) |
| `--t1` | `#141936` | `#101521` | titres (`--ink`) |
| `--t2` | `#525B7A` | `#3c4658` | texte (`--ink-2`) |
| `--t3` | `#8A94B0` | `#6e7888` | secondaire (`--ink-3`) |
| `--acc` | `#0E73F6` (bleu) | **`#ff5a3c`** (corail) | ⚠ changement clé |
| `--acc2` | `#3A8EFB` | `#e8431f` | corail hover/foncé |
| `--cta` | `#00B5A6` (teal) | **`#ff5a3c`** | accent unique = corail |
| `--cta-h` | `#00CCBC` | `#e8431f` | |
| `--pos` | `#10B981` | `#1a8f6f` (`--good`) | sémantique conservée |
| `--neg` | `#EF4444` | `#d23f3f` (`--bad`) | sémantique conservée |
| `--warn` | `#F59E0B` | `#b27a12` (`--warn`) | sémantique conservée |
| `--info` | `#0E73F6` | `#42506a` (neutral-ink) | éviter un bleu résiduel — décision §6 |
| `--pur` | `#7C3AED` | `#7b6bb0` (neutre froid muté) | sert aux pastilles entité/catégories |
| alias `--blu` | `#0E73F6` | `#ff5a3c` | alias de l'accent → corail (audit §5) |
| alias `--grn` | `#10B981` | `#1a8f6f` | = `--good` |
| alias `--red` | `#EF4444` | `#d23f3f` | = `--bad` |
| alias `--ora` | `#F59E0B` | `#b27a12` | = `--warn` |

Ombres CLAIR : conserver les ombres douces existantes (la charte garde des ombres en clair).

### Mode SOMBRE — appliqué à `[data-theme="dark"]`

| Variable | Valeur actuelle (dark) | → Valeur Propryo SOMBRE | Note |
|---|---|---|---|
| `--bg` | `#0A0E27` (navy quasi noir) | `#14161d` | **pas noir pur** |
| `--sur` | `#141936` | `#1e222c` | surface **nettement > fond** |
| `--sur2` | `#1A1F36` | `#262b37` | carte/input encore + clair |
| `--sur3` | `#252b48` | `#2e3442` | hover (un cran + clair) |
| `--bor` | `rgba(255,255,255,.08)` | **`rgba(255,255,255,.12)`** | bordures **visibles** (vs .08 trop faible) |
| `--bor2` | `rgba(255,255,255,.05)` | `rgba(255,255,255,.08)` | |
| `--t1` | `#F3F5FA` | `#f2f5fa` | titres quasi-blanc |
| `--t2` | `#A0A8C3` | `#cdd6e3` | texte (plus lisible) |
| `--t3` | `#6B7395` | `#9aa6b8` | secondaire ≥ AA |
| `--acc` | `#0E73F6` (bleu) | **`#ff6a4a`** (corail sombre) | + lumineux pour le contraste |
| `--acc2` | `#3A8EFB` | `#ff8163` | |
| `--cta` | `#00CCBC` | `#ff6a4a` | accent unique |
| `--pos` | `#34D399` | `#3fd6a3` (`--good` sombre) | |
| `--neg` | `#F87171` | `#ff7a7a` (`--bad` sombre) | |
| `--warn` | `#FBB040` | `#f1bd55` (`--warn` sombre) | |
| `--info` | `#5C8AFF` | `#aeb9cb` (neutral-ink sombre) | décision §6 |
| `--pur` | `#7B5BFF` | `#8f7fc4` (muté) | pastilles |
| alias `--blu/--grn/--red/--ora` | — | corail / good / bad / warn (sombre) | audit §5 |

**Ombres → halos en SOMBRE** : re-valoriser `--shadow*` en bordures/halos (ex. `--shadow:0 0 0 1px rgba(255,255,255,.05)`, `--shadow-lg:0 0 0 1px rgba(255,255,255,.11), 0 40px 90px -40px rgba(0,0,0,.7)`) pour que chaque bloc se découpe (cf. charte). Conserver le correctif `select/option` dark déjà présent.

## 5. Overrides ciblés (au-delà de la re-valorisation)

La re-valorisation seule risque de créer des **aplats corail** là où `--acc`/`--blu`/`--cta` servaient de fond sur de grandes zones (l'accent était bleu/teal, neutre visuellement ; en corail vif ça crie). **Audit obligatoire** des usages de `--acc`/`--blu`/`--cta`/`--acc2` en `background`/`background-color` :
- **Item de nav actif** : aujourd'hui dégradé bleu plein → en charte = **fond neutre/transparent + liseré corail 3px** (cf. maquettes). Override la règle `.ni.act`.
- Tout **bandeau/en-tête/badge** qui prenait un grand fond accent → fond neutre (`--sur`/`--neutral-soft`) + accent réservé au texte/à l'icône.
- **Boutons primaires** (`.bp`/`.btn-primary`) : fond corail = OK (c'est un CTA, autorisé).
- Vérifier les **focus rings** : passer à `box-shadow:0 0 0 4px var(--accent-soft)` (halo corail discret).
- Audit final (grep) : `background(-color)?:var(--acc|--blu|--cta)` → chaque hit doit être un CTA/petit accent, jamais un aplat.

## 6. Décisions (actées 2026-06-24)

1. **3 thèmes → 2 modes : ACTÉ — supprimer « Coloré ».** `toggleTheme` cycle Clair↔Sombre, labels `🌞`/`🌙`, clé localStorage inchangée (`immotrack_theme_mode`) : `sobre`→Clair, `dark`→Sombre ; migration : une valeur `colore` stockée est lue comme Clair.
2. **Logo/wordmark : ACTÉ — garder « ImmoTrack ».** Aucun rename dans le re-skin ; le rebrand complet (logo + textes) = chantier **E1** séparé.
3. **`--info` / `--pur` : ACTÉ (défaut) — remappés en neutres** (pas de bleu/violet résiduel). À ajuster si un badge « info » en dépend (audit usages).
4. **`--cta` : ACTÉ (défaut) — fusionné dans le corail** (accent unique).

## 7. Règle « couleur = sens » (graphes & sémantique) — validée

Règle **globale et cohérente** (pas écran par écran) :
- **Vert/rouge UNIQUEMENT là où le signe EST l'information** : cash-flow +/−, résultat, écart, provisions vs charges, deltas ▲▼, montants négatifs, statuts payé/impayé. Tokens charte `--good`/`--bad` (plus calmes que le vif actuel).
- **Tendances simples** (sparklines occupation/rendement/dépôts/loyers) : **ligne neutre + point corail sur le mois courant**.
- **Corail** réservé à l'accent (CTA/liens/focus/actif/1 chiffre clé), jamais comme couleur de série.
- Exemple implémenté et vérifié dans `dashboard-reel-propryo.html` : cash-flow vert au-dessus de zéro / rouge sous zéro (creux en V rouge), 4 sparklines à point corail.

## 8. Bouton Retour — intégration History API (inclus)

Cause racine (diagnostiquée sur `origin/main`) : la nav de pages `go()` ne pousse rien dans l'historique + **aucun handler `popstate`** (seules les fiches poussent un hash `#log-fiche-…` avec routeur `hashchange`) → le Retour sort du document ; avec `persistSession:false`, tout rechargement de document → `boot()` sans session → réaffiche la connexion. Détail : `[[project_cloud_cutover_finition]]`.

**Fix (shell) :**
1. `go(page)` → `history.pushState({page}, '', '#'+page)` à chaque changement de page (et `replaceState` si on remplace l'état courant).
2. **Un seul handler `popstate`** → `go(state.page)` **sans re-pousser** (Retour/Suivant = same-document, pas de reload, jamais la connexion).
3. **Unifier le routeur fiches** (hash `#log-fiche-…`/`#imm-fiche-…`/`#ent-fiche-…`) dans ce même modèle (aujourd'hui pages et fiches sont incohérents).
4. `replaceState` au boot vers `#accueil` (ne pas retomber sur une URL d'auth).

`persistSession:false` **conservé** (mot de passe à chaque vrai rechargement = voulu). Livrable **JS pur**, indépendant du CSS → peut être livré en standalone plus tôt, ou bundlé au re-skin.

## 9. Découpage en lots (pour le plan)

- **Lot 1 — Tokens & modes** (`css/main.css`) : re-valoriser CLAIR + SOMBRE, ombres→halos sombre, bascule 3→2 modes (`index.html` `toggleTheme`/labels). Le gros du re-skin.
- **Lot 2 — Typo** (`index.html` head + règles titres) : link Google Fonts, `--font`/`--display`, application aux titres + chiffres KPI.
- **Lot 3 — Overrides anti-aplat** (`css/main.css`) : item nav actif, focus rings, audit `--acc/--blu/--cta` en fond.
- **Lot 4 — Couleur = sens** : appliquer aux graphes/sparklines réels (mapping `--pos/--neg` déjà fait via tokens ; ajuster les séries de tendance en neutre+point corail).
- **Lot 5 — Bouton Retour** (`index.html`, JS) : History API (peut être détaché).
- ~~Lot 6 — Logo/wordmark~~ : **retiré** (décision : garder « ImmoTrack », rebrand → chantier E1).

## 10. Coordination

`index.html` est partagé avec la **session Drive refonte** (chantier connexion/cutover). Tout changement `index.html` (font link, `toggleTheme`, History API, inline-style overrides) passe par la file `.index-queue` (protocole `docs/INDEX-COMMIT-PROTOCOL.md`). `css/main.css` est moins contendu mais se coordonne aussi. Livraison via **worktree depuis `origin/main`** (ce clone est stale).

## 11. Vérification (critères d'acceptation)

- **Parité fonctionnelle** : tous les écrans/pages rendent, aucun widget/graphe/drill-down perdu (revue page par page).
- **Identité** : accent 100 % corail, **zéro aplat corail** (grep `background(-color)?:var(--acc|--blu|--cta)` audité), typo Schibsted/Inter en place.
- **Contraste** : AA bloc par bloc, **les 2 modes**, surtout Sombre (surfaces détachées, bordures visibles) — vérif axe/manuelle.
- **Couleur = sens** : graphes conformes (signe = vert/rouge, tendance = neutre+corail).
- **Bouton Retour** : Retour/Suivant naviguent dans l'app (page→page, fiche→liste), **ne retombent jamais sur la connexion** ; un vrai F5 redemande le mot de passe (voulu).
- **Audit `code-reviewer`** avant « prêt à tester » (re-skin transverse = sujet sensible).
