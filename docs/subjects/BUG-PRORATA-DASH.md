# BUG-PRORATA-DASH — Calculs loyer prorata intra-mois (P0)

> **Statut** : ✅ Livré v15.19 (Phase A1, session 2026-05-15)
> **Prio** : P0 (bloquait toute monétisation V1)
> **Taille** : S (~3h effectif)

---

## Symptôme

Locataire entré en cours de mois (entre le 1er et le 15) → marqué « **impayé** » dans le dashboard / Hero / Quittances alors qu'il avait payé son loyer **au prorata** des jours d'occupation.

**Exemple concret** (cas Marion / scénario user) :
- Bail commence 10/03/2026
- Loyer HC+CH = 1 000 €/mois
- Locataire paye son prorata : 1 000 × (22/31) = **709,68 €**
- Dashboard affiche : « 🚨 Loyers impayés — 1 logement — 290,32 € en attente »

→ Bug bloquant : impossible de vendre un SaaS dont les chiffres du dashboard sont faux.

## Cause racine

`_getActiveBailHcCh(ref, yr, monthIdx0)` (index-test.html ligne 6287) testait si le bail était actif **au 15 du mois** :

```js
const monthIso = yr + '-' + String(monthIdx0+1).padStart(2,'0') + '-15';
const active = bails.find(b => b.debut <= monthIso && monthIso <= fin);
if(active) return (hcAtDate + active.ch);   // ← loyer PLEIN, pas de prorata
```

Conséquence :
- Bail entré entre le **1er et le 15** → marqué actif au 15 → loyer plein attendu → impayé à tort si payé prorata
- Bail entré entre le **16 et le 31** → marqué inactif au 15 → 0 attendu → pas d'impayé (chance), mais aucun loyer prorata compté dans la progression annuelle
- Transition de bail mi-mois (Bail A finit 15/03 + Bail B commence 16/03) → un seul des deux baux compté

## Cadre légal

**Loi du 6 juillet 1989** + **jurisprudence Cass. 3e civ.** : le loyer est dû **au prorata du temps d'occupation** pour entrée et sortie intra-mois.

Le fix attendu :
```
loyer_mois = (hc + ch) × (jours_occupation_dans_mois / nombre_jours_mois)
```

## Fix livré v15.19

### 1. Nouveau helper testable `_loyerProrataMois`
`js/core/utils.js` (~ligne 280).
Signature : `_loyerProrataMois(log, yr, mi, bails, irlHistorique, todayRef)`.
- Boucle sur tous les baux du logement
- Pour chaque bail qui chevauche le mois :
  - `debutEff = max(bail.debut, 1er du mois)`
  - `finEff = min(bail.fin || ∞, dernier du mois)`
  - `joursOcc = (finDay - debutDay) + 1`
  - `hc` via `_loyerHCAtDate(log, debutEff)` si bail courant, sinon `bail.hc` figé (bail historique clos)
  - Accumule `(hc + ch) × joursOcc / joursDansMois`
- Retourne le total prorata pour le mois

### 2. Wrapper inline `_getActiveBailHcChProrated(ref, yr, mi)`
`index-test.html` ligne 6325.
Récupère le log + les baux depuis DB et appelle `_loyerProrataMois`.

### 3. Refactor des 3 callsites de calcul d'attendu

| Fonction | Ligne | Avant | Après |
|---|---|---|---|
| `_computeExpectedRent` | 6341 | `_getActiveBailHcCh(ref, yr, mi)` | `_getActiveBailHcChProrated(ref, yr, mi)` |
| `_buildProgDrill` | 6374 | `_getActiveBailHcCh(l.ref, yr, mi)` | `_getActiveBailHcChProrated(l.ref, yr, mi)` |
| `_computeImpayes` | 6935 | `(l.hc\|\|0) + (l.ch\|\|0)` direct | `_getActiveBailHcChProrated(l.ref, refY, refM-1)` |

### 4. Conservation de `_getActiveBailHcCh` (non touché)
Utilisé par :
- `_buildBailSegments` ligne 6253 (Gantt visuel — boolean check actif au 15 reste pertinent)
- `_buildProgDrill` ligne 6493 (`monthsActive > 0` — compteur visuel)

Si un mois "actif" sémantiquement = "bail tourne au moins une moitié de mois", on garde le test au 15. Si plus tard la métrique paraît incohérente avec l'attendu proraté, on alignera.

### 5. Tests Vitest (31 nouveaux)
`__tests__/helpers/dashboard-temporel.test.js` :
- 4 tests mois pleins (régression : 31/30/28/29j)
- 6 tests entrée mi-mois (15/03, 01/03, 31/03, 10/03 cas user, mois précédant, mois suivant)
- 5 tests sortie mi-mois
- 3 tests transition de 2 baux mi-mois (avec ou sans vacance entre les deux)
- 3 tests révisions IRL (avant/après révision, bail clos figé)
- 7 tests edge cases (null safety, mi invalide, bail.ch absent…)
- 3 tests SCENARIO USER (reproduction exacte du cas Marion, avant/après fix)

**Total tests Vitest projet** : 713 → **744** (+31, zéro régression).

## Validation visuelle attendue (par user)

1. Charger `index-test.html`
2. Aller au Dashboard
3. Vérifier que :
   - ✅ Locataires entrés mi-mois (1-15) ne sont **plus marqués impayés** quand ils ont payé leur prorata
   - ✅ La card "Loyers attendus vs encaissés" reflète le bon attendu prorata
   - ✅ Le drill "Progression annuelle" affiche le bon cumul attendu
4. Vérifier qu'aucun locataire qui était bien marqué impayé avant (faux négatif) n'est désormais à tort montré comme à jour

## Impact commercial

Bug bloquant levé → conditions remplies pour Phase D (Stripe paywall V1).

Sans ce fix : 1er client souscrit à 14,90 €/mois → voit faux chiffres → refund + mauvais avis → mort prématurée du SaaS.
