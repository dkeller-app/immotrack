# SECU-INNERHTML — Inventaire & plan de fix

**Date** : 2026-05-11
**Sandbox auditée** : `index-test.html` v14.79 (32k lignes)
**Source** : grep `\.innerHTML\s*=`

---

## Synthèse

| Indicateur | Valeur |
|---|---|
| Total occurrences `.innerHTML=` | **157** |
| Sites utilisant `escHtml` sur la ligne | 14 (safe) |
| Sites sans `escHtml` ni interpolation `${}` | 75 (safe — strings statiques ou empty) |
| Sites sans `escHtml` mais avec interpolation `${}` | 16 (à auditer ligne par ligne) |
| Lignes interpolant `${X.nom|ref|locataire|cat|lib|qui|adresse|...}` sans `escHtml` | **68** |
| Sites HAUT-RISQUE confirmés XSS-exploitable | **~12** |
| Helper `escHtml` existant | ✅ ligne 5699 |

---

## Approche choisie

**Ajout de 2 helpers** (cf `__tests__/helpers/sanitize.js`) :
- `_esc(s)` = alias `escHtml`, raccourci
- `_h\`...\`` = tag function template literal qui escape automatiquement chaque `${...}`
- `_raw(s)` = marqueur "trusted HTML" pour bypass volontaire (composition de sous-templates)

Pattern de migration :
```js
// Avant (vulnérable)
el.innerHTML = `<b>${log.locataire}</b>`;

// Après (option A : escHtml explicite, conserve template literal natif)
el.innerHTML = `<b>${escHtml(log.locataire)}</b>`;

// Après (option B : tag function, plus compact pour gros templates)
el.innerHTML = _h`<b>${log.locataire}</b>`;
```

**Stratégie pragmatique** : on garde `escHtml(...)` partout où il est déjà utilisé (uniformité), on l'ajoute aux sites manquants. `_h` est disponible pour les nouveaux templates.

---

## Sites HAUT-RISQUE (XSS exploitable réellement)

| # | Ligne | Fonction | Variable user non échappée | Type d'attaque |
|---|---|---|---|---|
| 1 | 10732 | `drillEntOps` cat list | `cat` (DB.categories) | `title="${cat}">${cat}` |
| 2 | 10746-50 | `drillEntOps` recent tbody | `m.lib`, `m.qui`, `m.cat`, `m.date` | `<td>${m.lib||'–'}</td>` |
| 3 | 10767-94 | `rAlertsSection` alertes | `l.ref`, `l.locataire` | msg HTML re-injecté ligne 10828 |
| 4 | 10802, 10811 | `rAlertsSection` MRH/vacant | `l.ref`, `l.imm` | msg HTML re-injecté |
| 5 | 10959 | `fillMvQui` select | `e.nom`, `l.ref`, `l.locataire` | options select |
| 6 | 11757-68 | tableau baux footer | `dataset.savedHtml` | pattern store HTML → injectivité indirecte |
| 7 | 13321, 16226 | composition contrats bail | `l.nom`, `l.ddn`, `l.lieuNaiss`, `_adrPrec` | injection dans PDF/HTML bail |
| 8 | 16445, 17500 | cellules tableau mrh/quit | `m.locataire`, `q.locataire` | `<td>${m.locataire||'–'}</td>` |
| 9 | 16751-54, 16853-54 | irl tbody | `l.ref`, `l.locataire` | cellules |
| 10 | 17262, 17398, 17435, 17448 | régul charges | `r.ref`, `d.lib`, `d.repartition` | régul doc HTML |
| 11 | 17037-38 | irl historique | `h.ref`, `h.locataire` | tbody |
| 12 | 28080-87 | `rParamsPieces` | `nom` (clé pièces EDL) | **🔴 onclick="delPieceEDL('${nom}')" → XSS via attribut** |

## Sites SAFE (à laisser)

- 75 sites sans interpolation `${...}` (strings statiques `<p class="mu">...</p>` ou vides `''`)
- 14 sites utilisant `escHtml` correctement sur la ligne
- ~30 sites interpolant des nombres formatés (`fmt`, `fmtN`, `cashFlow`, `mvs.length`) → safe
- ~10 sites interpolant des valeurs internes (refs immeubles, couleurs CSS, classes booléennes) → safe

## Sites D — popups inline (à ignorer)

Lignes 5740, 11258, 14990, 15070, 15181, 15242, 15822 : strings JS construites pour popup HTML inline (script tags). Pas de risque innerHTML direct.

---

## Plan de fix par lots

| Lot | Fichier:lignes | Fonctions | Sites | Estim |
|---|---|---|---|---|
| Lot 1 | 5699-5710 | helpers `_esc/_h/_raw` | nouveau | 30 min (avec 12 tests) |
| Lot 2 | 10720-10760 | `drillEntOps` | 5 sites | 15 min |
| Lot 3 | 10760-10830 | `rAlertsSection` | 7 sites | 20 min |
| Lot 4 | 10950-10960 | `fillMvQui` | 1 site (2 vars) | 5 min |
| Lot 5 | 11750-11770 | tableau baux footer | 2 sites | 10 min |
| Lot 6 | 13320, 16220 | composition bail | 2 sites | 10 min |
| Lot 7 | 16440-16470, 17498-17502 | mrh/quit tbody | 4 sites | 10 min |
| Lot 8 | 16750-16860, 17030-17040 | IRL tbody + histo | 6 sites | 15 min |
| Lot 9 | 17260, 17390-17450 | régul charges | 4 sites | 15 min |
| Lot 10 | 28080-28090 | `rParamsPieces` (HIGH) | 1 site (XSS onclick) | 10 min |
| Lot 11 | Audit transverse functions | `_renderBailleurCard`, etc. | vérif | 15 min |
| Lot 12 | Re-grep final + test XSS | — | — | 15 min |

**Total estimé** : 3-4h

---

## Test d'attaque XSS prévu (Phase 5)

Après fix, créer une entité avec nom :
```
<img src=x onerror="window.__xss=1">
```
Et vérifier :
1. ✅ Affichage dans dashboard alerts → texte brut, pas d'exécution
2. ✅ Affichage dans select fillMvQui → texte brut
3. ✅ Affichage dans drillEntOps → texte brut
4. ✅ `window.__xss` reste undefined

---

**Dernière mise à jour** : 2026-05-11
