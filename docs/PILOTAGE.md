# PILOTAGE — Guide du workflow

> **Pour l'utilisateur (Didier)** : tu n'as PAS besoin de lire ce fichier ni de l'éditer.
> Il sert de référence à Claude pour piloter le projet.
>
> **Pour Claude** : ce fichier décrit comment gérer le BACKLOG.md et les docs/subjects/*.md
> au cours d'une session.

---

## Architecture

```
Desktop\Immo\
├── BACKLOG.md                     ← Hub central (lu en début + après "où en est-on")
├── docs/
│   ├── PILOTAGE.md                ← Ce fichier (méta-guide)
│   └── subjects/
│       ├── BUG-LOG-001.md         ← 1 fichier détaillé par sujet
│       ├── DRIVE-2H.md
│       └── ...
└── (memory) project_pilotage.md   ← Pointe vers BACKLOG.md pour démarrage auto
```

## Workflow par scénario

### Scénario A — Démarrage de session

1. Claude lit `MEMORY.md` (auto-loaded en début de session) qui pointe vers `BACKLOG.md`
2. Claude lit `BACKLOG.md` complet
3. Claude initialise la `TodoWrite` avec les items pertinents (priorités hautes + en cours)
4. Claude affiche un résumé court à l'utilisateur

### Scénario B — Utilisateur note une remarque

```
User : "Note : bug onglet logement, ref non modifiable après save"
```

Claude doit :
1. Identifier la catégorie (bug → BUG-XXX-NNN, feature → SUJET-NNN, idée → IDEE-NNN)
2. Si sujet existant correspond → ajouter la remarque dans `docs/subjects/{SUJET}.md`
3. Sinon → créer un nouveau `docs/subjects/{NOUVEAU-CODE}.md` avec scope minimal
4. Ajouter une ligne dans `BACKLOG.md` (section "🔥 Priorité immédiate" ou "📝 Remarques en attente de classement")
5. Update la `TodoWrite`
6. Commit `BACKLOG.md` + nouveau `docs/subjects/*.md` avec message `Pilotage : note BUG-LOG-001`
7. Confirmer brièvement à l'utilisateur

### Scénario C — Utilisateur demande "où en est-on"

```
User : "où en est-on"
```

Claude doit :
1. Relire `BACKLOG.md`
2. Pour chaque sujet en cours, lire son `docs/subjects/*.md` pour vérifier le journal
3. Détecter les changements depuis dernier check (commits récents sur master)
4. Mettre à jour la `TodoWrite`
5. Donner un résumé clair des changements + état actuel

### Scénario D — Utilisateur dit "on attaque [SUJET]"

```
User : "on attaque DRIVE-2H"
```

Claude doit :
1. Lire `docs/subjects/DRIVE-2H.md`
2. Si scope clair → générer le prompt de démarrage de session sujet
3. Si scope incomplet → poser les questions nécessaires AVANT le prompt
4. Donner à l'utilisateur le prompt complet à coller dans une nouvelle session Claude Code
5. Mettre à jour le statut dans `BACKLOG.md` : ⬜ → 🔄 En cours
6. Commit
7. Indiquer à l'utilisateur : "Quand tu reviens dans cette session, dis 'où en est DRIVE-2H' pour que je sync"

### Scénario E — Session sujet termine son travail

La session sujet (autre Claude Code) :
1. À la fin de son chantier, met à jour `docs/subjects/{SUJET}.md` (status, journal d'avancement)
2. Met à jour le statut dans `BACKLOG.md` : 🔄 → ✅ Livré
3. Commit + push

Quand l'utilisateur revient dans la session maître :
1. User : "où en est-on"
2. Claude relit BACKLOG.md → détecte que DRIVE-2H est passé en ✅ Livré
3. Claude met à jour la TodoWrite

## Règles importantes

### 🔥 RÈGLE NON NÉGOCIABLE — BACKLOG en temps réel

> **À chaque livraison d'un sujet pendant une session, le BACKLOG.md DOIT être mis à jour
> immédiatement (statut + version + commit `Pilotage : ...`), PAS en fin de session.**

**Pourquoi** : ImmoTrack est piloté en multi-sessions parallèles (le user ouvre plusieurs
sessions Claude pour avancer en parallèle sur différents sujets). Si une session laisse
le BACKLOG dans un état périmé, les autres sessions repartent avec une fausse image et
peuvent dupliquer le travail ou créer des conflits.

**Trigger d'update obligatoire** :
- Commit livrant un sujet (`v14.X : SUJET`) → update BACKLOG **dans le même commit ou juste après**
- Création d'un nouveau sujet en session → ajout BACKLOG immédiat
- Détection d'un bug en cours de session → ajout BACKLOG + sujet `docs/subjects/*.md` immédiat
- Changement de statut (⬜ → 🔄 → ✅) → update BACKLOG immédiat

**Workflow correct** :
```
1. Livrer un fix (commit code v14.X)
2. Update BACKLOG.md (statut ✅ Livré v14.X + version + lien commit)
3. Update docs/subjects/{CODE}.md (journal d'avancement)
4. Commit pilotage : `Pilotage : {CODE} livré v14.X`
5. Continuer la session
```

**Workflow INCORRECT (à éviter)** :
```
1. Livrer un fix (commit code v14.X)
2. Livrer un autre fix (commit code v14.X+1)
3. Livrer un autre fix (commit code v14.X+2)
4. À la fin de session : update BACKLOG en bloc
   ↑ Si la session est interrompue ou si une autre session prend le relais entre 2 et 4,
   le BACKLOG est faux pendant tout ce temps.
```

**Exception acceptable** : si une session livre 2-3 fixes liés (ex : v14.51 + v14.52 + v14.53
sur le même chantier BUG-X), un commit pilotage à la fin du chantier (pas de la session) est
acceptable, à condition que le chantier dure < 1h et que les fixes soient fortement liés.

**Sanity check à appliquer en fin de session** : avant le récap final, faire un `git log --oneline -10`
+ `grep` du BACKLOG sur les codes des derniers commits → s'assurer que tous les statuts sont alignés.

### Codes de sujets
Format : `{CATEGORIE}-{NUMERO}` ou `{CATEGORIE}-{SOUS-CATEGORIE}-{NUMERO}`

Catégories existantes :
- `BUG-*` : bugs détectés
- `LEGAL-*` : sujets légaux/fiscaux
- `EDL-*` : état des lieux
- `BAIL-*` : bail
- `DRIVE-*` : Drive sync
- `AGENCE-*` : module agence
- `IRL-*` : indice IRL
- `QUIT-*` : quittances
- `IMPORT-*` : import données
- `V3-*` : refonte V3
- `DASH-*` : dashboard
- `ARCHI-*` : architecture / refacto technique
- `SAAS-*` : multi-utilisateurs / SaaS
- `SIGN-*` : signature électronique
- `PORTAIL-*` : portails
- `AVIS-*` : avis échéance / rappels
- `RAPPEL-*` : rappels automatiques

### Quand créer un doc sujet vs juste BACKLOG
- **Créer un doc sujet** quand le sujet a > 1 sous-tâche ou contexte > 5 lignes
- **Juste BACKLOG** quand c'est un one-liner trivial (et créer le doc sujet quand on attaque)

### Format minimum d'un doc sujet
```markdown
# {CODE} — {Titre}

**Status** : ⬜/⏳/🔄/✅ · **Prio** : P0-P3 · **Taille** : XS-XL
**Détecté** : YYYY-MM-DD
**Lié à** : autres sujets ou mémoires

## Contexte
[Pourquoi ce sujet existe]

## Scope
- [ ] Sous-tâche 1
- [ ] Sous-tâche 2

## Décisions à prendre
- [ ] Question 1

## Prompt de démarrage de session (généré quand "on attaque")
[à remplir au moment de l'attaque]

## Notes utilisateur
> 💬 [remarques au fur et à mesure]

## Journal
- YYYY-MM-DD : créé
```

### Commits
- Modification d'un seul item : `Pilotage : update {CODE}`
- Ajout d'un nouveau sujet : `Pilotage : ajout {CODE}`
- Migration / refacto pilotage : `Pilotage : refacto structure`
