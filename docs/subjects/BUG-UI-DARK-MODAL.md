# BUG-UI-DARK-MODAL — Mode sombre : fond modale trop transparent

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : XS
**Détecté** : 2026-04-29
**Lié à** : V3-VISUEL

## Contexte
En mode sombre, le fond des modales est trop transparent : on voit le contenu de la page derrière transparaître à travers la modale, ce qui rend la lecture difficile (texte de la page derrière qui se mélange avec les champs et labels de la modale).

Reproduit par utilisateur sur la modale "Bail — F-001" (étape 1 wizard, formulaire Locataires) — capture d'écran fournie 2026-04-29.

## Cause probable
- Soit le `background-color` de la modale en dark mode utilise une valeur trop transparente (ex `rgba(20,30,40,0.7)` au lieu de `rgba(20,30,40,0.97)`)
- Soit l'overlay sous la modale n'est pas assez opaque
- Soit `backdrop-filter: blur()` n'est pas appliqué en dark mode

## Scope
- [ ] Inspecter le CSS dark mode des modales (`.modal-content` / `.modal-body` / overlay)
- [ ] Augmenter l'opacité du fond modale en dark mode (passer à 95%+)
- [ ] Vérifier que toutes les modales sont concernées (pas juste Bail)
- [ ] Tester aussi en light mode pour ne rien casser

## Décisions à prendre
- [ ] Garder un léger backdrop-filter blur (pour effet visuel premium) ou opacité pleine pure ?

## Notes utilisateur
> 💬 2026-04-29 : "le fond en mode sombre est un peu transparent." (capture modale Bail F-001)

## Journal
- 2026-04-29 : créé
