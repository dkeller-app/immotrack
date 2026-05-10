# AGENTS.md — ImmoTrack

> **Pour les agents Claude qui démarrent une session sur ce repo.**
> Lis CE fichier en premier, puis `BACKLOG.md` pour le travail à faire, puis le sujet précis dans `docs/subjects/{CODE}.md`.

---

## 🎯 Le projet en 3 lignes

ImmoTrack est une **app web vanilla JS de gestion locative immobilière**, monolithe HTML+CSS+JS dans un seul fichier `index.html` (~31 000 lignes). Architecture **offline-first** (IndexedDB + localStorage) avec sync **Google Drive optionnelle** (OAuth GIS browser-only). Pas de backend, pas de framework, pas de bundler. Maintenue en solo par Didier Keller (dev solo) et destinée à devenir un **SaaS commercial** (V1 prévue Q4 2026).

---

## 🛠 Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 (variables CSS, mode sombre, responsive) |
| Storage | localStorage (DB JSON ~700 Ko) + IndexedDB (`immotrack_photos` pour photos EDL) |
| Sync | Google Drive API v3 + OAuth Google Identity Services (GIS), scope `drive.file` |
| PDF | jsPDF + html2canvas (inlinés en base64 dans `index.html` pour bypass CORS file://) |
| Excel | SheetJS (xlsx) embarqué |
| Charts | SVG natif + helpers `_mkSparkline`, `_mkMultiLineChart` |
| PWA | Service Worker (`sw.js`) + manifest |
| Build | **Aucun** — pas de bundler, pas de transpilation. `index.html` est servi tel quel. |
| Déploiement | Statique (Vercel / Cloudflare Pages compatibles, fonctionne aussi en `file://` local) |

---

## 📁 Structure du repo

```
Immo/
├── index.html              ← PROD (31k lignes monolithe). NE PAS toucher sans validation user.
├── index-test.html         ← SANDBOX bac à sable. C'est ICI qu'on modifie.
├── sw.js                   ← Service Worker PWA
├── package.json            ← Minimal (pas de deps npm, juste métadonnées)
├── AGENTS.md               ← CE FICHIER (à lire en premier)
├── BACKLOG.md              ← Hub central de pilotage (sujets, priorités, statuts)
├── docs/
│   ├── PILOTAGE.md         ← Guide du workflow pilotage
│   ├── subjects/           ← 1 fichier MD par sujet (BUG-*, FEAT-*, etc.)
│   │   ├── DASH-PROFILES.md
│   │   ├── DRIVE-ARBORESCENCE.md
│   │   ├── AUDIT-GLOBAL.md
│   │   └── ... (50+ sujets)
│   └── strategie/          ← Livrables stratégiques
│       ├── BIZPLAN.md
│       ├── CARTE_POSITIONNEMENT.md
│       ├── PROJECTIONS.md
│       ├── PLAN_ACTIONS.md
│       └── EFFORT_DEPLOIEMENT.md
├── Sauvegardes/            ← Backups manuels JSON (ne PAS toucher)
└── .claude/                ← Settings Claude Code locaux
```

**Fichiers à IGNORER** (legacy / temporaires) :
- `index 20260422.html`, `index - V12.32 20260424.html`, `index - github 20260421.html`, `index_6.html`, `index-AS- CHATGPT.html` → vieilles versions, ne pas modifier
- `Sauvegardes/*.json` → backups manuels, ne pas toucher
- `EDL (1)/` → données utilisateur de test
- `*.xlsx` à la racine → données métier, pas du code

---

## 🚦 Workflow obligatoire (règles non négociables)

### 1. Sandbox-first (cf `feedback_sandbox_first.md`)
**Toute modification de code se fait d'abord dans `index-test.html`**. On ne touche `index.html` (prod) **qu'après validation explicite de l'utilisateur**. Bascule sandbox → prod en commit séparé.

```
1. Modifier index-test.html
2. Bumper version dans index-test.html (title + footer)
3. Vérifier (cf modify_verify ci-dessous)
4. Tester (utilisateur sur index-test.html)
5. ↓ user valide ↓
6. Copier vers index.html
7. Commit séparé "vX.Y : merge sandbox → prod"
```

### 2. Modification + vérification toujours (cf `feedback_modify_verify.md`)
Après chaque modif :
- Grep le symbole modifié → tous les sites collatéraux ont le même fix ?
- Si guard de mode (`_isTestMode`, `_appReadOnly`) → tous les sites de modification protégés ?
- Si nouveau state → reset, persistance, propagation Drive vérifiés ?
- Si nouveau bouton/UX → 3 formats testés (PC / tablette / mobile) ?

### 3. Workflow par phases (cf `feedback_workflow.md`)
Phase par phase. 1 phase = 1 commit. Tester avant de passer à la suivante. Pas de commit géant.

### 4. Bump version à chaque commit livré (cf `feedback_versioning.md`)
À chaque livraison : incrémenter `v14.X` dans `index.html` (title + footer) ET dans le message de commit.

### 5. Pas de solution passable (cf `feedback_no_compromise.md`)
Refonte complète plutôt que compromis temporaire. Si trop gros → planifier une session dédiée.

### 6. Constance visuelle (cf `feedback_design_consistency.md`)
Toute UI respecte le design system existant. Variables CSS uniquement, pas de hex en dur. Mode sombre testé.

### 7. Mobile irréprochable (cf `feedback_responsive.md`)
3 formats (PC / tablette / téléphone). Touch ≥ 44 px. Texte ≥ 16 px dans les inputs. Pas de scroll horizontal involontaire.

### 8. Penser commercial / SaaS (cf `feedback_deploy_commercialize.md`)
Chaque feature pensée pour le SaaS commercial : tous statuts juridiques (particulier/SCI/SAS/LMNP/mandataire), tous profils, mécanisme d'extension UI. Pas "pour mon besoin uniquement".

### 9. Pas d'idées non motivées (cf `feedback_no_bullshit.md`)
Une proposition valide s'appuie sur : 1/ cas réel user, 2/ obligation légale citée, 3/ code existant, 4/ backlog. Sinon → silence ou question.

### 10. Mise à jour BACKLOG en temps réel (cf `feedback_pilotage_realtime.md`)
À chaque livraison d'un sujet pendant une session, BACKLOG.md DOIT être mis à jour immédiatement (statut + version + commit `Pilotage : ...`), PAS en fin de session.

### 11. Wrapping de fonction (cf `feedback_wrapping_context.md`)
Avant tout `_undoOp` ou hook : lire close modal + redirect fiche 360 + refresh + propagation Drive (tombstone). Lire TOUT le contexte UX avant de wrapper.

---

## ⚙️ Conventions de code

### Naming
| Préfixe | Usage |
|---|---|
| `_` | Helper privé (ex `_drvSync`, `_loyerHCAtDate`) |
| `r` | Render (ex `rDashboard`, `rBiens`) |
| `go(...)` | Navigation onglet (ex `go('biens')`, `go('dashboard')`) |
| `Bail.*` | Namespace Bail (en cours de migration, cf `BAIL-NAMESPACE-MIGRATION`) |
| `_drv*` | Drive helpers (`_drvSync`, `_drvFolderEnsure`, `_drvUpload`) |
| `_idb*` | IndexedDB helpers (`_idbPut`, `_idbGet`) |

### Variables CSS clés
```css
--color-primary, --color-bg, --color-text, --color-border
--font-size-*, --font-weight-*
--shadow-card, --shadow-card-hover
--radius-*
```
Utiliser systématiquement les variables CSS, **jamais de hex en dur dans des règles localisées**.

### State global
- `DB` = objet localStorage parsé (entités, immeubles, logements, baux, mouvements, etc.)
- `_modifiedAt` sur chaque entité Drive-syncable
- `_isTestMode` / `_SANDBOX_MODE` = flag sandbox actif
- `_appReadOnly` = blocage écriture en mode read-only

### Fonctions critiques (à maîtriser)
- `saveDB()` — persiste localStorage. Bloqué si `_appReadOnly`.
- `_stamp(entity)` — met à jour `_modifiedAt` (CRITIQUE pour Drive merge)
- `_drvSync()` — push/pull Drive avec OCC
- `go(tabId)` — navigation onglet
- `initDB()` — bootstrap au démarrage (peut injecter SCI Dupont en sandbox)

---

## 📦 Commands courantes

### Git
```bash
git status --short
git log --oneline -10
git diff index-test.html
git add index-test.html && git commit -m "v14.X : ... (sandbox)"
```

### Test local
```bash
# Ouvrir dans Chrome (file://)
start index-test.html        # Windows
open index-test.html         # Mac

# Devtools : Ctrl+Shift+I
# Mode device : Ctrl+Shift+M
# Test responsive : 320 / 390 / 768 / 1280 px
```

### Métriques rapides
```bash
wc -l index.html index-test.html
diff index.html index-test.html | head
git log --oneline | head -20
```

### Recherche dans le code
- **Préférer Grep tool** (built-in, ripgrep) plutôt que `grep` shell
- Pour les agents : utiliser `Agent` avec `subagent_type: "Explore"` pour cartographies multi-symboles

---

## 🎯 Quels agents/skills utiliser quand

| Situation | Outil recommandé |
|---|---|
| Cartographier un namespace ou suivre les usages d'une fonction | Agent `Explore` |
| Designer un plan d'implémentation pour une feature | Agent `Plan` |
| Question Claude Code / Anthropic SDK | Agent `claude-code-guide` |
| Brainstorm une feature avant de coder | Skill `superpowers:brainstorming` |
| Écrire un plan multi-étapes | Skill `superpowers:writing-plans` |
| Exécuter un plan déjà écrit | Skill `superpowers:executing-plans` ou `subagent-driven-development` |
| Debug un comportement inattendu | Skill `superpowers:systematic-debugging` |
| Audit sécurité ou XSS | Slash `/security-review` |
| Code review avant merge | Agent `superpowers:code-reviewer` |
| Création UI/composant visuel | Skill `frontend-design` |
| Lecture xlsx (ex `ImmoTrack_Comparatif_Concurrents_2026.xlsx`) | Skill `anthropic-skills:xlsx` |
| Démarrer ou reprendre une session pilotage | Slash `/pilotage` |
| Vérifier un fait avant claim "c'est livré" | Skill `superpowers:verification-before-completion` |

---

## 📚 Documents à lire selon ton rôle dans la session

### Si tu démarres une session **pilotage** (classement remarques, génération prompts)
1. `BACKLOG.md` (état + sujets actifs)
2. `docs/PILOTAGE.md` (workflow méta)
3. Listing `docs/subjects/*.md` pour avoir l'inventaire

### Si tu démarres une session **dédiée à un sujet** (ex DRIVE-ARBORESCENCE)
1. `docs/subjects/{SUJET}.md` (spec complète + décisions arbitrées)
2. `BACKLOG.md` (sujets liés)
3. Mémoires auto-loaded (cf `MEMORY.md`)
4. `index.html` (grep zones concernées)

### Si tu démarres une session **AUDIT-GLOBAL** ou **ARCHI-MODULAR**
1. `docs/subjects/AUDIT-GLOBAL.md` (7 phases) ou `ARCHI-MODULAR.md`
2. `BACKLOG.md` (vue d'ensemble)
3. Toutes les mémoires `feedback_*.md` (règles)
4. `index.html` (cartographie complète, agent Explore)

### Si tu démarres une session **stratégie / business**
1. `docs/strategie/BIZPLAN.md` (livré)
2. `docs/strategie/CARTE_POSITIONNEMENT.md`
3. `docs/strategie/EFFORT_DEPLOIEMENT.md`

---

## 🔥 Anti-patterns connus (à NE JAMAIS faire)

1. ❌ **Modifier `index.html` directement** (prod) sans validation user → casse données réelles
2. ❌ **Commit géant fourre-tout** → impossible à revert proprement
3. ❌ **`innerHTML=` avec input user non échappé** → XSS (~107 sites existants à fixer dans SECU-INNERHTML)
4. ❌ **Hex en dur dans CSS localisé** → casse le design system + dark mode
5. ❌ **Oublier `_stamp(entity)` après modification d'une entité Drive-syncable** → cf BUG-DRIVE-OVERWRITE v13.38
6. ❌ **Modifier un guard de mode (`_isTestMode`) sans grep ALL usages** → cf v14.62-67 cascade de bugs
7. ❌ **Livrer une UI sans tester mobile** → cf MOBILE-AUDIT-ONGLETS, cible utilisateur 50% mobile
8. ❌ **Bumper version sans tester** → cf feedback_modify_verify
9. ❌ **Proposer une feature sans justification** (cas user / obligation légale / code existant / backlog) → cf feedback_no_bullshit
10. ❌ **Marquer un sujet "✅ Livré" sans avoir testé en local** → cf verification-before-completion

---

## 📊 État au 2026-05-10

- **Version actuelle** : v14.76+ (sandbox), v14.63 (prod la dernière taggée, vraisemblablement à resync)
- **`index.html`** : 31 190 lignes
- **Sujets actifs** : ~55 (15 P1 / 30 P2 / 10 P3)
- **Sessions pilotage** : voir BACKLOG.md section "Vue par onglet"
- **V1 commerciale prévue** : Q4 2026
- **Dossiers stratégie livrés** : BIZPLAN, CARTE_POSITIONNEMENT, PROJECTIONS, PLAN_ACTIONS, EFFORT_DEPLOIEMENT (dans `docs/strategie/`)

---

## 🆘 Si tu es bloqué

- **Question floue** → Skill `superpowers:brainstorming` ou demande à l'utilisateur
- **Sujet ambigu** → Lire `docs/subjects/{CODE}.md` complet
- **Conflit Git ou worktree confus** → STOP, demander à l'utilisateur, ne pas force-push
- **Modification cassante** → `git revert` immédiat, pas de patch sur patch
- **Décision juridique (bail, loyer, fiscalité)** → ne PAS inventer, citer source ou demander
- **Tu ne sais pas si c'est sandbox ou prod** → c'est sandbox par défaut. Si doute, demander.

---

**Dernière mise à jour** : 2026-05-10
**Mainteneur** : sessions pilotage (auto-update depuis le BACKLOG)
