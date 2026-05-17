# TOOLING-MOCKUP-DEVICE-TOGGLE — Toggle device fiable dans nos mockups responsive

**Status** : ⏳ En attente (dette technique) · **Prio** : P2 · **Taille** : S (1-2h)
**Détecté** : 2026-05-17 (session UX-GROUP-BY-IMMEUBLE drill-downs, ~2h perdues à debug)
**Lié à** : règle gravée `feedback_mockup_first.md` (3 formats obligatoires)

## Contexte

La règle `feedback_mockup_first.md` exige que tout mockup couvre les 3 formats (PC/Tablette/Mobile). Pour ne pas faire 3 fichiers HTML séparés, on a tenté plusieurs implémentations de toggle device dans 1 fichier :

| Tentative | Problème |
|---|---|
| 1. CSS `[data-d="mobile"]` sur frame parent | `getComputedStyle` ignore `max-width` quoi que je fasse (bug Chrome ?) |
| 2. CSS `.is-mobile` (classes) | Idem (probablement même cause) |
| 3. JS inline `frame.style.width = '390px'` | Le navigateur ignore le inline width — soit override par flex shrink, soit cache, soit bug |
| 4. `<iframe src="_inner.html">` redimensionné | L'iframe interne ne réagit pas non plus au width parent — comportement nested aberrant |
| 5. ✅ Mockup responsive natif sans toggle, user utilise DevTools F12 | Fonctionne mais l'user trouve l'UX "pas optimale" |

Conclusion : il faut un **vrai mécanisme de prévisualisation device** standalone et fiable, réutilisable pour tous les mockups futurs.

## Scope (à attaquer en session dédiée)

- [ ] Investiguer si le problème vient du **service worker `sw.js`** d'ImmoTrack qui pourrait intercepter les requêtes même sur les fichiers `docs/strategie/mockups/`
- [ ] Tester avec un dossier mockup **HORS** racine app (genre `mockups-standalone/` à la racine du repo, hors emprise SW)
- [ ] OU implémenter une solution `transform: scale()` propre :
  - Frame fixe à 1280×800
  - Pour "tablette", on scale à 768/1280 = 60%
  - Pour "mobile", on scale à 390/1280 = 30%
  - Avantage : le contenu DOM reste viewport 1280, mais visuellement on voit la taille relative
  - Inconvénient : les media queries internes ne se déclenchent PAS (puisque viewport reste 1280)
- [ ] OU mockup **standalone** chacun pour chaque device dans `docs/strategie/mockups/<sujet>/{desktop,tablet,mobile}.html` (3 fichiers, DRY violation mais 100% fiable)
- [ ] OU framework de prévisualisation type **Storybook-lite** maison (overkill pour un solo)

## Décisions à prendre

- **D1** : on garde le pattern actuel (1 fichier responsive natif + DevTools F12) ou on change ?
- **D2** : si on change, on prend quelle approche (iframe externe / 3 fichiers / scale) ?
- **D3** : automatisation `genMockup.sh` qui prend un template + remplit 3 fichiers ?

## Notes utilisateur

> 💬 2026-05-17 : *« je ne comprends pas ce que tu as fait. on continue parce que là on perd du temps mais il faudra fixer ça ! »*

## Journal

- 2026-05-17 : ~2h perdues à essayer 5 approches différentes sur le mockup UX-GROUP-BY-IMMEUBLE drill-downs. Solution actuelle = responsive natif + DevTools F12. À reprendre en session dédiée tooling.
