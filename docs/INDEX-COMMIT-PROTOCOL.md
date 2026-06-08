# 🚦 Protocole de coordination des commits `index.html` (multi-sessions)

> **Pourquoi** : ImmoTrack est piloté en **plusieurs sessions Claude parallèles** (worktrees séparés).
> Toutes finissent par écrire dans `index.html` — un monolithe de ~30 000 lignes. Deux sessions qui
> intègrent `index.html` dans `main` en même temps = conflits de merge ingérables + risque de perte.
>
> **Solution** : une **session maître** est le **seul intégrateur** de `index.html` vers `main`.
> Les sessions ouvrières committent sur leur propre branche puis s'inscrivent dans une **file partagée**.
> Le maître intègre dans l'ordre (FIFO, ou priorité imposée par l'utilisateur), résout les conflits
> à un seul endroit, puis pousse `main`.

---

## Acteurs

- **Session maître** : une seule à la fois. Tient la file, intègre `index.html` → `main`, pousse, met à jour le BACKLOG.
- **Sessions ouvrières** : toutes les autres. Bossent sur leur branche, ne touchent JAMAIS `main` pour `index.html`.

## La file partagée

- **Chemin canonique unique (absolu)** : `C:\Users\Did_K\Desktop\Immo\.index-queue\QUEUE.md`
- Visible par tous les worktrees (même filesystem). **Non versionnée** (gitignorée) — coordination pure, n'entre dans aucune branche.
- Toute session la lit/écrit par ce chemin absolu, quel que soit son worktree courant.

---

## 🪤 PIÈGE CRITIQUE — l'arbre principal partagé n'isole PAS (incident 2026-06-08, v15.261)

> **À lire avant tout commit `index.html`.** C'est la cause de l'incident du push direct non sérialisé.

Dans ce setup, plusieurs sessions partagent **le même dépôt `.git`** et, souvent, **le même arbre de
travail principal** `C:\Users\Did_K\Desktop\Immo`. Conséquence : **créer une branche locale NE vous isole
PAS**, car le `HEAD` de l'arbre principal est partagé entre toutes les sessions qui y opèrent.

**Scénario d'incident réel (54fd084, v15.261)** : une session crée la branche `chantier-...-prod`, fait
ses edits sur `index.html`, mais **une autre session fait `git checkout main`** dans le même arbre entre
les edits et le `git commit`. Résultat : le commit tombe sur **`main`** (pas sur la branche), et le
**hook post-commit le pousse sur `origin/main`** → déploiement prod **non sérialisé**, hors file.
Historique resté linéaire ce jour-là par chance, mais le risque réel = écrasement / collision de versions.

**Règle qui en découle (NON négociable)** :

- **Ne JAMAIS committer `index.html` depuis l'arbre principal partagé.**
- Une ouvrière travaille `index.html` **dans un worktree dédié** : `git worktree add ../Immo-<feat> -b <feat>`
  (ou `.claude/worktrees/<feat>`), commit + push **depuis ce worktree**, jamais depuis `C:\...\Immo`.
- Le **maître** intègre toujours dans un **worktree jetable** créé sur `origin/main`
  (`git worktree add ../Immo-integ -b integ-<x> origin/main`), résout, teste, push en fast-forward,
  puis supprime le worktree. Il ne touche jamais l'arbre principal pour pousser `index.html`.

---

## Protocole OUVRIER (avant de livrer `index.html` en prod)

1. **Sandbox d'abord** : développer + valider dans `index-test.html`. Ne jamais toucher `index.html` (prod) avant le « OK » explicite de l'utilisateur. *(règle `feedback_sandbox_first`)*
2. **OK utilisateur** + **audit `code-reviewer`** pour tout livrable sensible (PDF bail/quittance, schéma DB, migrations, Drive sync, refactos transverses). *(règle `feedback_audits_par_agents`)*
3. **Commit `index.html` depuis un WORKTREE DÉDIÉ, sur SA PROPRE branche** + push la branche. **Jamais depuis l'arbre principal partagé, jamais directement sur `main`.** *(cf 🪤 Piège ci-dessus)*
4. **S'inscrire dans la file** `QUEUE.md` : passer sa ligne à `✅ prêt à intégrer`, renseigner version visée, « Prêt depuis » (date+heure), dernier commit, base (`origin/main` au moment du commit). Si la branche n'a pas de ligne, en créer une.
5. **STOP.** Dire à l'utilisateur : « En file d'intégration `index.html`, va voir la session maître. » Ne pas merger soi-même.

## Protocole MAÎTRE (intégration)

1. **Lire la file** `QUEUE.md`. Sélectionner la tête : `✅ prêt à intégrer` la plus ancienne (FIFO), sauf priorité imposée par l'utilisateur.
2. **Pré-vol** : `git fetch`. Lire le diff `index.html` de la branche vs `origin/main`. Identifier le(s) seul(s) commit(s) qui touchent `index.html` (souvent un seul → cherry-pick isolé).
3. **Worktree jetable** : `git worktree add ../Immo-integ -b integ-<x> origin/main` (jamais l'arbre principal). Y faire le **cherry-pick isolé** du commit `index.html`. Résoudre les conflits — **un seul endroit, une seule fois**. Si chevauchement sémantique avec une intégration précédente, coordonner avec la session concernée avant de forcer.
4. **Bump version** si collision de numéro (`vX` déjà pris par un autre push entre-temps) — title + `<em>` + footer `index.html` + `IMMOTRACK_VERSION` const + `sw.js` CACHE_VER (les 5 spots, cohérents).
5. **Sanity** : `node scripts/check-inline-js.mjs` (4/0) + `node --check sw.js` + grep des symboles touchés + version cohérente aux 5 spots + 0 résidu de l'ancienne version. *(règle `feedback_modify_verify`)* Vitest si la logique a changé (inchangée si seul le n° de version diffère du commit déjà audité par l'ouvrière).
6. **Rebaser le worktree sur le dernier `origin/main`** (il bouge : autres sessions poussent du non-`index.html`) puis **pousser en fast-forward** (après feu vert utilisateur pour toute opération sur `main`/push).
7. **BACKLOG temps réel** : mettre à jour `BACKLOG.md` (statut ✅ Livré + version + commit) immédiatement, via un commit pilotage sur le worktree. *(règle `feedback_pilotage_realtime`)*
8. **File** : passer la ligne à `🔀 intégré vX`, ajouter une entrée au Journal d'intégration de `QUEUE.md`.
9. **Nettoyer** le worktree jetable (`git worktree remove`). **Notifier** : qui vient d'être intégré, qui est le prochain, et que **les autres branches doivent rebaser sur le nouveau `origin/main`** (et prendre vX+1) avant leur tour.

---

## Invariants

- **Une seule session maître** opère sur `main` pour `index.html` à un instant T.
- **`index.html` ne se commit JAMAIS depuis l'arbre principal partagé** — worktree dédié obligatoire (cf 🪤 Piège).
- Une ouvrière ne pousse jamais `index.html` sur `main` ; elle pousse une branche et laisse le maître cherry-pick.
- Le maître intègre dans un **worktree jetable sur `origin/main`**, push en **fast-forward** (jamais de force).
- La file est la **source de vérité** de l'ordre. En cas de doute, le maître relit `QUEUE.md`.
- Toute opération sur `main`/`origin` (merge, push, rebase) requiert le **feu vert explicite de l'utilisateur** (action à fort rayon d'impact — push `origin/main` = déploiement prod GitHub Pages).

## Voir aussi

- Mémoire : `feedback_index_commit_coordination` (chargée par toutes les sessions au démarrage)
- Règles liées : `feedback_sandbox_first`, `feedback_audits_par_agents`, `feedback_pilotage_realtime`, `feedback_modify_verify`
- Pilotage backlog : `docs/PILOTAGE.md`, `BACKLOG.md`
