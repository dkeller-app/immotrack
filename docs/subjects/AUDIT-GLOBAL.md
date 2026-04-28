# AUDIT-GLOBAL — Audit global avant refonte V3

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (3-5h)
**Lié à** : `project_v3_transition.md` (étape 1), `project_commercialization.md`, V3-VISUEL, SECU-INNERHTML
**Bloquant** : V3 visuelle (devrait être fait avant pour prioriser intelligemment)

## Contexte

Avant d'attaquer V3-VISUEL puis V3-REFONTE-* onglet par onglet, faire un état des lieux complet de l'app pour :
- Cartographier le monofichier `index.html` (~17000 lignes vanilla JS)
- Inventaire pages/onglets et leur état UX
- Identifier les zones de duplication / dead code / scope leaks
- Repérer les vulnérabilités sécu (XSS, OAuth, PWA)
- Mesurer la perf (rendus, DB ops, Drive sync)

Output : un rapport priorisé qui guide les sessions suivantes.

## Scope

### Phase Audit-1 : cartographie code
- [ ] Architecture du monofichier (sections, fonctions principales, namespaces)
- [ ] Inventaire des pages/onglets (`#p-*` divs) et de leur état UX
- [ ] Liste des helpers réutilisables vs code spécifique
- [ ] Conventions de naming respectées ou pas (camelCase, PascalCase, magic strings)

### Phase Audit-2 : sécurité
- [ ] **XSS** : auditer les ~107 occurrences `innerHTML=` (10 wrappés en v12.33-40, le reste à classifier)
  - Renders tableaux/cartes/modales : `baux-hist-tbody`, `mv-tbody`, `quit-tbody`, `ass-tbody`, `mrh-tbody`, `edl-tbody`, etc.
  - Sites injection contrôlée vs sites avec input user
- [ ] **Injection** : localStorage (DB → JSON.parse), Drive (payload non vérifié)
- [ ] **OAuth** : flow Google Identity Services, expiration token, refresh, scopes
- [ ] **PWA** : SW cache, version bump, fallback offline

### Phase Audit-3 : performance
- [ ] Pages "lourdes" (rendu) : dashboard (déjà profilé), autres ?
- [ ] DB operations : `filter` massifs, indexation manuelle ?
- [ ] Drive sync : taille payloads, latence réseau, race conditions (cf DRIVE-2F)
- [ ] localStorage taille (DB JSON ~700 Ko vu, limite 5-10 Mo)

### Phase Audit-4 : code quality
- [ ] Duplication (helpers communs à extraire ?)
- [ ] Dead code (fonctions non appelées, branches mortes)
- [ ] Scope leaks (variables globales involontaires)
- [ ] Conventions ES5 vs ES6 (var/const/let, function/arrow)

### Phase Audit-5 : rapport priorisé
- [ ] Output : `docs/audit-2026-04.md` avec :
  - Top 5 risques sécu
  - Top 5 quick wins perf
  - Top 5 dettes techniques
  - Recommandations pour V3-VISUEL et V3-REFONTE

## Outils

- **Agent Explore** (Claude Code) pour cartographier rapidement
- **Slash commands** : `/review` (code review), `/security-review` (sécu)
- **Skill frontend-design** pour analyse UI

## Décisions à prendre

- [ ] Faire l'audit en 1 session 5h ou en 5 sessions 1h (par phase) ?
  - **Reco** : 1 session 3-5h pour avoir une vision globale cohérente
- [ ] Inclure ou non un audit accessibilité (a11y) ?
  - **Reco** : OUI sinon ça remontera plus tard, prefers-reduced-motion / contrast déjà en place sur dashboard

## Prompt de démarrage de session

```
On attaque AUDIT-GLOBAL.
Lis : BACKLOG.md, docs/subjects/AUDIT-GLOBAL.md, project_v3_transition.md.

Workflow :
1. Confirme le scope (5 phases d'audit)
2. Lance l'agent Explore pour la cartographie (Phase Audit-1)
3. Lance /security-review pour Phase Audit-2
4. Audit perf manuel + skill frontend-design pour UI
5. Output : docs/audit-2026-04.md priorisé

Estimation : 3-5h en session dédiée.
```

## Notes utilisateur

> 💬 _(rien pour le moment)_

## Journal

- 2026-04-28 : créé suite vérification mémoire `project_v3_transition.md` (j'avais oublié l'étape 1 audit dans le BACKLOG initial)
