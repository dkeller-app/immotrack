# REPORTING-BAILLEUR — Onglet Finances (analyse) + correctif widget Projection dashboard

**Status** : ✅ Spec validée (mockup validé user 2026-06-05) — prête pour plan d'implémentation · **Prio** : P1 · **Taille** : L (1 session, sandbox)
**Lié à** : DASH-REFONTE-GLOBALE-V4 (refonte visuelle, retire déjà la projection du bandeau KPI), LEGAL-2044, LEGAL-BILAN-ANNUEL, EXPORT-COMPTABLE, PILOTAGE-MATRICIEL, `project_dashboard_onescreen.md`
**Sandbox-first** : `index-test.html` uniquement, prod (`index.html`) après OK explicite user
**Référence mockup** : `mockups/finances/finances-tab.html` (mockup Finances ciblé, **validé user 2026-06-05**). Ancien `mockups/finances/global.html` = obsolète (contenait la refonte dashboard ABANDONNÉE — voir Genèse).

---

## Genèse

Brainstorming sur l'onglet « Finances ». Le dashboard a de la **donnée** financière mais pas de **vraie analyse** (compte de résultat, ratios, argent à récupérer). Trois variantes mockées (A comptable / B actionnable / C cockpit), puis arbitrage user :

> _« finances pour moi c'est la vue A. par contre les vue b et c peuvent servir au dashboard. tu comprends la logique ? un dashboard visuel qui pousse ensuite à aller creuser »_

J'ai alors produit un mockup « global » qui **refondait tout le dashboard** en thème sombre. **Rejeté** :

> _« attention tu m'as tout refondu. dans le dashboard actuel, j'ai les actions à faire et j'ai une visu sur le statut des appartements et tout rentre sur une page sans scroll (règle à appliquer). quand je clique sur une bulle (loyer impayé) j'atterri sur finances : ce n'est pas logique. idem pour IDL et charges. »_

→ **Recadrage** : le dashboard actuel fonctionne déjà (actions priorisées + statut des lots + 1 écran sans scroll + navigation opérationnelle logique). On n'y touche **quasiment pas**. La vraie nouveauté = l'onglet **Finances** (analyse). Le seul vrai défaut du dashboard = le widget **« Projection 2026 »** (extrapolation trompeuse).

### Navigation actuelle du dashboard (vérifiée dans le code, déjà logique)

| Clic sur… | Destination réelle (`_TODO_TYPE_META` / handlers) | Logique |
|---|---|---|
| Impayé | `_dashGoImpayes()` → suivi loyers / relances | ✅ opérationnel |
| Révision IRL | `go('irl')` | ✅ opérationnel |
| Régul charges | `go('regul')` | ✅ opérationnel |
| Logement vacant | `go('biens')` | ✅ opérationnel |
| KPI (occupation, rdt, charges/loyers…) | `_dashCardClick()` → `_openDD()` drill sur place | ✅ contextuel |

Le mockup global avait cassé cette logique en reroutant impayé/IRL/charges vers Finances. **Erreur abandonnée.**

---

## Principe directeur (le cœur de la spec)

- **Dashboard = opérationnel** → « qu'est-ce que je dois faire ce mois, où j'en suis ». 1 écran, sans scroll. **On y agit.**
- **Finances = analyse** → « comment va mon argent sur l'année ». On y va **exprès** pour comprendre.
- **Règle d'or de navigation** : une **alerte** (impayé, IRL, régul, vacance) → **page opérationnelle pour agir**. **Finances ne capte jamais un clic d'alerte.** On atteint Finances par : (1) une entrée de nav dédiée, (2) un teaser sur le dashboard, (3) le bouton « Analyser » du nouveau widget attendu/encaissé.
- **Finances vs Pilotage** : Pilotage = opérationnel « qui me doit quoi » (matrice par locataire). Finances = analyse « comment va mon argent ». Distincts.

---

## Scope

### Partie 1 — Dashboard : changement **minimal** (1 seul widget)

Le dashboard **garde tout** : jauge encaissement, cash-flow 12 mois, « actions priorisées » (nav opérationnelle inchangée), KPIs (occupation / rendement / DG / charges-loyers), grille statut des lots, **1 écran sans scroll**. Aucune autre modification.

**Seul changement** : le KPI **« Projection 2026 »** (`k5`, `_openDD('projection')`, helper `_projectionLogement` — extrapolation linéaire `realiseYTD + reste`, libellé « EN RETARD / 75 % de l'objectif » = faux sentiment, montant jamais encaissé) →
remplacé par **« Loyers : attendu vs encaissé »** :

- Cumul sur l'année : **X € attendu / Y € encaissé**, écart affiché en clair (ex. −11 600 €).
- **Aucun montant futur inventé** : on compare un objectif connu à ce qui rentre vraiment.
- Réutilise les calculs déjà faits (`_loyerHCAtDate`, `_loyerProrataMois`, séries du hero `_heroCashflowSeries`). **Pas de nouvelle logique métier.**
- **Clic → drill-down impayés/encaissements qui explique l'écart** (vacance / impayés / IRL non appliqués), avec un bouton **« Analyser dans Finances → »**. ✅ **Tranché 2026-06-05** : drill opérationnel + bouton Finances (option a). Respecte la règle d'or (le clic reste opérationnel, ne capte pas vers Finances).
- Compatible avec DASH-REFONTE-GLOBALE-V4 qui prévoit déjà de retirer « Projection » du bandeau KPI (CP3 liste Vacance à la place).

### Partie 2 — Onglet Finances (= ta « vue A »)

Nouvelle page d'**analyse** qui **agrège des calculs existants** (valeur = consolidation lisible, **zéro nouvelle logique métier**). Référence visuelle : `mockups/finances/global.html` vue `#view-fin`.

1. **Résultat net** (hero) = loyers HC encaissés − charges propriétaire. Comparatif **vs N-1** (annuel ici — différent du dashboard qui compare vs mois-1). Marge %.
2. **Compte de résultat** (tableau) : loyers HC − charges propriétaire détaillées (intérêts d'emprunt, taxe foncière, travaux, honoraires/copro, assurance PNO) = résultat net. **Charges récupérables neutres** (le locataire rembourse → exclues du calcul, honnêteté comptable).
3. **Ratios de pilotage** (sans jargon, sans donnée nouvelle, pas de TRI/DSCR) : rendement net · taux d'occupation · taux de recouvrement · poids des charges.
4. **Argent à récupérer** : vacance · impayés · IRL non appliqués · régul à faire — chiffré (ex. 11 530 € au total). **Chaque ligne cliquable → page opérationnelle** correspondante (impayé→suivi, IRL→révision, régul→régul, vacance→biens). **Jamais de surplace dans Finances** = applique la règle d'or.
5. **Passerelles déclaratives** : 2044 / Bilan annuel / FEC. **Réutilise** `_compute2044`, `_computeBilanAnnuel`, `_buildEcritures`/`_toFEC` (déjà dans p-export). **Pas de recalcul.** ✅ **Tranché 2026-06-05 (via mockup)** : Finances affiche les **boutons appelant les mêmes fonctions** (option a) ; la page Export reste en parallèle. Pas de doublon de logique, pas de restructuration nav. Note UI dans le mockup : « Ces exports réutilisent les calculs déjà présents dans la page Export — Finances ne fait que les rassembler ici (pas de recalcul). »

### Partie 3 — Place dans la navigation

- Finances = onglet/page de premier niveau (à côté de Pilotage et Export).
- Entrées : (1) item de nav sidebar, (2) **teaser** en bas du dashboard (« Votre santé financière · résultat net +X · à récupérer Y → Ouvrir Finances »).

---

## Hors scope (YAGNI)

- **Pas de refonte du dashboard** (il marche, tient sur 1 écran, nav déjà logique).
- Pas de TRI / DSCR / simulateurs / « paillettes ».
- Pas de Coach IA / gamification.
- Finances **ne duplique pas** les actions du dashboard (elle pointe vers l'opérationnel).
- Le thème dark global / la refonte sidebar = sujet **DASH-REFONTE-GLOBALE-V4** séparé.

---

## Règles non-négociables (rappel mémoire user)

1. **Sandbox-first** : tout dans `index-test.html`, prod après « OK » explicite.
2. **Dashboard 1 écran sans scroll** : contrainte dure (`project_dashboard_onescreen.md`).
3. **23 drill-downs préservés** : `_build*Drill()` et `_DD[...]` intacts (le drill `projection` est remplacé, pas les autres).
4. **Helpers métier réutilisés, pas réécrits** : `_loyerHCAtDate`, `_loyerProrataMois`, `_heroCashflowSeries`, `_compute2044`, `_computeBilanAnnuel`, `_buildEcritures`, `_toFEC`.
5. **Navigation = règle d'or** : alerte → opérationnel ; Finances jamais cible d'un clic d'alerte.
6. **Comparaisons** : dashboard vs mois-1 ; Finances vs N-1 (annuel). Jamais mélanger.
7. **Responsive 3 formats** : desktop 1440×900 / tablette 1024×768 / mobile 375×800 — décliné après validation direction.
8. **Figures financières sensibles → audit `superpowers:code-reviewer`** avant « prêt à tester ».
9. **Modify + verify** : après chaque modif, grep sites collatéraux + état localStorage.
10. **BACKLOG temps réel** : MAJ statut/version/commit à chaque livraison.
11. **Choix prédéfini + ajout libre** partout où pertinent (catégories de charges, etc.).

---

## Décisions captées

- **Q (projection)** : remplacer « Projection 2026 » par quoi ? → **« Loyers : attendu vs encaissé »** (cumul année, pas d'extrapolation). ✅ tranché user.
- **Q1 (clic widget) ①** : drill + bouton Finances / direct Finances / drill seul ? → **drill opérationnel impayés/encaissements + bouton « Analyser dans Finances »**. ✅ tranché 2026-06-05.
- **Q2 (exports) ②** : boutons dans Finances / lien vers Export / absorption ? → **boutons dans Finances réutilisant les fonctions existantes** ; page Export conservée en parallèle. ✅ tranché 2026-06-05 (via mockup validé).
- **Q3 (Finances vs Pilotage)** : fusionner ? → **Non, distincts** (analyse vs opérationnel).

---

## Notes utilisateur

> 💬 _2026-06-05 : « finances pour moi c'est la vue A. par contre les vue b et c peuvent servir au dashboard… un dashboard visuel qui pousse ensuite à aller creuser »_
> 💬 _2026-06-05 : « attention tu m'as tout refondu… tout rentre sur une page sans scroll (règle à appliquer). quand je clique sur une bulle (loyer impayé) j'atterri sur finances : ce n'est pas logique. idem pour IDL et charges. »_

---

## Journal

- 2026-06-05 : spec écrite après recadrage user (abandon de la refonte dashboard du mockup global ; scope resserré à : 1 widget dashboard + onglet Finances analyse). Décision projection tranchée (attendu vs encaissé).
- 2026-06-05 : mockup Finances ciblé `mockups/finances/finances-tab.html` **validé user** (« ton mockup est bien je valide »). ① (clic widget → drill opérationnel + bouton Finances) et ② (exports = boutons dans Finances réutilisant les fonctions) **tranchés**. Spec passée en ✅ validée, prête pour writing-plans.
- 2026-06-05 : aparté CRG « mode gestionnaire » capturé séparément → `docs/subjects/GESTION-CRG.md` (P0 V1.1, distinct de ce sujet).
- 2026-06-05 : **implé SANDBOX terminée** (`index-test.html` + module pur `js/core/finances-summary.js`). PARTIE A (module pur + 11 tests Vitest), B (widget dashboard « Loyers attendu vs encaissé » + drill → bouton Finances), C (page Finances : hero résultat net + 3 ratios + compte de résultat N vs N-1 + drill par logement + « argent à récupérer » 4 lignes routant vers opérationnel + passerelles 2044/Bilan/FEC). Réutilise `_computeBilanAnnuel`/`_compute2044`/`computeIRLRevision`/`computeRegul`/`_listerImpayesActifs` (rien réécrit). 1462 tests verts. **Audit + re-audit `superpowers:code-reviewer`** : 0 blocker ; 2 Important corrigés (lot vacant gonflait « attendu écoulé » en cours d'année ; ratio recouvrement basé désormais sur théorique HC des mois occupés au lieu d'impayé cumulé CH lifetime). Commits sandbox `9db909c`→`4e041d6`. **EN ATTENTE : validation visuelle user dans le sandbox avant wiring PROD `index.html` (D5, gaté).**

---

## PROMPT DE DÉMARRAGE (à coller dans une nouvelle session Claude Code)

```
On attaque REPORTING-BAILLEUR — onglet Finances (analyse) + remplacement du widget « Projection » du dashboard.

LIRE EN PREMIER (dans cet ordre) :
1. C:\Users\Did_K\Desktop\Immo\BACKLOG.md
2. C:\Users\Did_K\Desktop\Immo\docs\subjects\REPORTING-BAILLEUR.md (ce sujet)
3. C:\Users\Did_K\Desktop\Immo\mockups\finances\finances-tab.html (mockup Finances VALIDÉ user)
4. C:\Users\Did_K\Desktop\Immo\index-test.html sections :
   - widget projection : grep "_projectionLogement", "_openDD('projection')", "k5" (≈ lignes 7702-7930)
   - hero / séries : "_heroCashflowSeries", "_loyerHCAtDate", "_loyerProrataMois"
   - exports : "_compute2044", "_computeBilanAnnuel", "_buildEcritures", "_toFEC" (p-export ≈ ligne 1137)
   - nav : "_TODO_TYPE_META", "_dashGoImpayes", "go('irl'", "go('regul'"

CONTEXTE / RÈGLES :
- Sandbox-first : index-test.html, prod après OK explicite
- Dashboard reste tel quel SAUF le widget projection → « Loyers : attendu vs encaissé » (cumul année, pas d'extrapolation)
- Dashboard 1 écran sans scroll (contrainte dure)
- Règle d'or nav : alerte → page opérationnelle ; Finances JAMAIS cible d'un clic d'alerte
- Finances = page d'analyse (résultat net, compte de résultat, 4 ratios, argent à récupérer cliquable→opérationnel, passerelles 2044/FEC/Bilan réutilisant les fonctions existantes)
- Comparaisons : dashboard vs mois-1 ; Finances vs N-1
- Réutiliser les helpers, ne rien réécrire
- Responsive 3 formats après validation direction
- Figures financières → audit code-reviewer avant « prêt à tester »
- Décisions déjà tranchées : ① clic widget attendu/encaissé → drill opérationnel impayés/encaissements + bouton « Analyser dans Finances » · ② exports = boutons DANS Finances réutilisant `_compute2044`/`_computeBilanAnnuel`/`_buildEcritures`/`_toFEC` (page Export conservée en parallèle)

Démarre par lire les fichiers/sections, fais un résumé 5 lignes (scope + plan), puis attends mon GO avant de coder.
```
