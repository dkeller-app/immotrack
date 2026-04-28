# V3-VISUEL — V3 visuelle harmonisée (= "design")

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : L (3-5 sessions ~3-4h chacune)
**Lié à** : `project_v3_transition.md` (étape 2), `project_commercialization.md`, AUDIT-GLOBAL, V3-REFONTE-*
**Prérequis** : AUDIT-GLOBAL fortement recommandé avant

## Contexte

C'est ce que tu appelles communément le **"design"**.

Étape 2 de la transition V3 : appliquer le design system v2 (déjà en place sur le dashboard) à **toutes les pages de l'app**, **sans toucher à la structure fonctionnelle**.

État actuel :
- Dashboard `#p-dashboard` : design system v2 complet (tokens couleurs, dark mode, composants `.dw-*`, animations, responsive 4 breakpoints, a11y AA)
- Tous les autres onglets : ancien style hétérogène

Objectif : un visuel **dynamique et cohérent**, duplicable sur chaque onglet.

## Scope (toutes les pages SAUF dashboard)

### Phase V3V-1 : formulaires (tous onglets)
- [ ] `.inp` (inputs) : padding, border-radius, focus state, validation visuelle
- [ ] Labels : typo cohérente, espacement
- [ ] `<select>` : harmonisation Chrome/Safari/iOS
- [ ] Checkboxes / radios : custom v2
- [ ] Validation visuelle (messages d'erreur, success)
- [ ] Boutons : `.btn`, `.bp`, `.bs`, `.br`, `.bb` cohérents partout

### Phase V3V-2 : tableaux (tous onglets)
- [ ] `.tbl` : header sticky, hover row, alignement num
- [ ] Lignes alternées (zebra)
- [ ] Tri/filter visuels (icones, états actif)
- [ ] Responsive : scroll horizontal mobile

### Phase V3V-3 : modales (tous overlays `.ov`)
- [ ] Scope chip + bouton retour systématique
- [ ] Largeurs responsive (sm/md/lg/xl)
- [ ] Header / body / footer cohérents
- [ ] Close button accessibility (Escape, click outside)

### Phase V3V-4 : cartes (`.card`, `.dw`)
- [ ] Tokens v2 (sur, sur2, bor, t1, t2, t3)
- [ ] Padding cohérent
- [ ] Header de carte (`.ct`)
- [ ] States (hover, active, disabled)

### Phase V3V-5 : typo + espacement
- [ ] Typo cohérente partout (font sizes, weights, line-heights)
- [ ] Échelle d'espacement cohérente (4/8/12/16/24/32 px)

### Phase V3V-6 : interactions / affordance
- [ ] Hover/focus visuel cohérent partout
- [ ] Cursors (`pointer`, `not-allowed`)
- [ ] `:focus-visible` accessible
- [ ] Tooltips harmonisés
- [ ] Toasts harmonisés

### Phase V3V-7 : responsive
- [ ] 4 breakpoints (1280/1024/768/480) appliqués partout
- [ ] PWA Safari iOS testé
- [ ] Orientations portrait/paysage

### Phase V3V-8 : a11y étendue
- [ ] `aria-label` systématique (déjà partiel)
- [ ] `prefers-reduced-motion`, `prefers-contrast` étendus
- [ ] Focus visible sur tous les éléments interactifs
- [ ] Bouton A+ étendu à toutes les pages

## Décisions à prendre

- [ ] **Phasing** : toutes les phases dans 1 session ou 1 phase par session ?
  - **Reco** : 1 phase par session de 3-4h, 8 sessions au total
- [ ] **Test visuel** : screenshots avant/après chaque page modifiée ?
  - **Reco** : OUI, tester sur dashboard d'abord (déjà v2) pour confirmer non-régression
- [ ] **Page d'attaque en premier** : Bail (déjà partiellement fait via cartes v2 v12.43) ou Loyers (le plus utilisé) ?
  - **Reco** : Loyers en premier — c'est l'onglet le plus utilisé et le plus old-school visuellement

## Périmètre exclu

**NE PAS toucher à la logique métier** dans cette étape. Juste le visuel et les interactions d'affordance. La refonte fonctionnelle = V3-REFONTE-* (étape 3).

## Prompt de démarrage de session

```
On attaque V3-VISUEL — phase {N} : {titre phase}.
Lis : BACKLOG.md, docs/subjects/V3-VISUEL.md, docs/audit-2026-04.md (si AUDIT-GLOBAL fait).

Workflow :
1. Confirme la phase à attaquer
2. Inventaire des éléments à harmoniser (sites du code à modifier)
3. Implémentation avec retest user après chaque page modifiée
4. Commit phase par phase avec screenshots avant/après

Estimation : 3-4h par phase, 8 phases = ~24-32h total.
```

## Notes utilisateur

> 💬 _(rien pour le moment)_

## Journal

- 2026-04-28 : créé suite vérification mémoire `project_v3_transition.md` (étape 2 = "design", pas dans le BACKLOG initial)
