# BUG-CRITIQUES-2026-05-25 — 4 bugs critiques signalés en session pilotage

**Status** : 🚨 P0/P1 — bloquants V1 commerciale · **Détecté** : 2026-05-25
**Lié à** : sync Drive · ARCHI-DB-DOUBLONS (log/bail) · DEMO-DATA-JSON

## Justification (4 critères pré-vol)

1. **Cible** : TOUS bailleurs sur multi-device + tout nouvel utilisateur (V1 commerciale = livraison impossible avec ces bugs)
2. **Règles** : ne rien casser de plus, investigation factuelle avant fix
3. **Justifications** :
   - 🧑 Cas user 2026-05-25 (4 remarques en rafale, frustration manifeste)
   - 💻 Code suspect : `initDB()` l. 3928 injecte des démos (SCI Dupont, DEMO-F2, Pierre/Marie Demo) si DB vide
   - 📋 Backlog : bloque la V1 commerciale, prioritaire sur les refontes UX
4. **5 vues 360°** : technique (sync + init) + UX (frustration) + commercial (V1 livrable) + cycle de vie (multi-device)

---

## 🚨 BUG 1 — Import de données génériques sur autre PC (P0)

> 💬 « Pourquoi import des données génériques quand j'ouvre mon compte sur un autre PC ? »

**Diagnostic probable** (à confirmer) : `initDB()` (l. 3928+) injecte des **démos** (SCI Dupont Immobilier id=1001, logement DEMO-F2, Pierre/Marie Demo, mouvements 9000001-9000003) quand le localStorage est vide. Sur un nouveau PC, le localStorage est vide → injection démos AVANT que la sync Drive ramène les vraies données → l'user voit les démos.

⚠️ **Risque GRAVE** : si la sauvegarde Drive auto se déclenche AVANT le pull initial, les démos peuvent **écraser** ou **se mélanger** aux vraies données sur Drive → pollution irréversible.

**Investigation à mener** :
- Vérifier le timing : initDB() → injection démos → save Drive ?  OU  initDB() → pull Drive → si rien → injection démos ?
- Vérifier la cohabitation : si Drive contient déjà SCI Dupont (de la sandbox passée) + vraies entités, les 2 cohabitent-elles ?
- Cas du user 2026-05-25 : sa DB sur l'autre PC est-elle vide ou polluée ?

**Fix proposé** :
1. **NE PLUS injecter de démos en prod** (jamais). Si DB vide → l'utilisateur voit un onboarding qui propose explicitement « Charger des données de démo » (cf DEMO-DATA-JSON + ONBOARDING).
2. Sur nouveau PC : `initDB()` doit ATTENDRE la sync Drive avant de juger la DB « vide ». Race condition à éliminer.
3. Cleanup automatique des démos polluantes au prochain boot si détectées avec de vraies données à côté.

**Prio** : **P0** (bloquant V1 + risque pollution Drive).

---

## 🚨 BUG 2 — Impossibilité de supprimer (P1)

> 💬 « Impossibilité de supprimer »

**À préciser** : supprimer quoi exactement ?
- Les données démo génériques (SCI Dupont / Pierre Demo / Marie Demo) ?
- Un logement / immeuble / bail / mouvement réel ?
- Tout ?

**Pistes** :
- Si données démo : peut-être protégées par flag (`_demo: true`) ou ID spécifique
- Si données réelles : régression dans `_softDeleteEntity` / cascade tombstones
- Vérifier l'audit-trail + cascade tombstones (BUG-DRIVE-RESURRECTION v14.30-32 livré → mais possible régression depuis)

**Prio** : **P1**. À préciser par l'user (cas exact + capture d'écran si possible).

---

## 🚨 BUG 3 — Import de logement plus existant (P1)

> 💬 « Import de logement plus existant »

**À préciser** :
- Quel import : référentiel xlsx (onglet Import) ou autre ?
- « Plus existant » = bouton disparu de l'UI ? Fonction qui plante ? Régression récente ?

**Pistes** :
- IMPORT-EXCEL-LOG était livré (template xlsx avec onglet Logements)
- Vérifier `handleImportRef` (l. ~36435+) et `imp-ref-file` (l. 265)
- Régression possible suite à une refonte Import récente ?

**Prio** : **P1**. À préciser (chemin UI exact où le bouton/fonction manque).

---

## 🚨 BUG 4 — Impossible de créer un bail depuis un logement (P1)

> 💬 « Gros boulot niveau immeuble et appartement et bail : impossible de créer un nouveau bail depuis logement par exemple »

**Diagnostic** :
- Le flow attendu = depuis la fiche logement → bouton « + Nouveau bail » → wizard bail pré-rempli avec le logement
- Ce bouton existe-t-il ? Est-il branché correctement ?
- Croise **ARCHI-DB-DOUBLONS** (P1 — refonte structurelle log/bail) qui justement traite la séparation log/bail

**Pistes** :
- Vérifier la fiche logement 360° : présence du bouton « + Nouveau bail »
- Vérifier `openNewBailChoix()` / `openBail()` et le passage de paramètre logement
- Sur l'onglet Baux il y a `+ Nouveau bail` (l. 343) mais sans pré-remplissage du logement

**Prio** : **P1**. À résoudre dans le cadre de **NAV-LOGEMENT-BAIL-CLARIF** + **ARCHI-DB-DOUBLONS** (refonte des flows de création).

---

## Plan d'action proposé

| Ordre | Action | Effort |
|---|---|---|
| 1 | **Investigation BUG 1** (initDB + sync Drive timing) — sans toucher au code, juste tracer le flow | ~30min |
| 2 | **Fix BUG 1** : retirer l'injection auto démos en prod + onboarding propose démo opt-in (cf DEMO-DATA-JSON livré) | ~1-2h |
| 3 | **Préciser BUG 2 et 3** avec user (cas exacts + captures) | discussion |
| 4 | **Fix BUG 2 et 3** selon précisions | ~variable |
| 5 | **BUG 4** : couplé à NAV-LOGEMENT-BAIL-CLARIF (mockup-first) + ARCHI-DB-DOUBLONS | ~M |

## Décisions / précisions attendues du user

- [ ] **Pour BUG 2** : qu'est-ce qui ne se supprime pas ? (logement réel, démo, bail, mouvement…)
- [ ] **Pour BUG 3** : où exactement le bouton/fonction d'import logement n'est plus accessible ?
- [ ] **Pour BUG 4** : depuis quelle vue (fiche logement 360° ? carte logement ?) le bouton « créer un bail » devrait être disponible ?

## Coordination

⚠️ L'autre session pilote des sprints (modifie `index.html`). Bug 1 = fix critique à coordonner. Ne pas modifier le code de mon côté sans avoir le feu vert + une fenêtre libre sur `index.html`.

## Notes utilisateur

> 💬 2026-05-25 :
> - « Pourquoi import des données génériques quand j'ouvre mon compte sur un autre pc ? »
> - « Impossibilité de supprimer »
> - « Import de logement plus existant »
> - « Gros boulot niveau immeuble et appartement et bail : impossible de créer un nouveau bail depuis logement par exemple »

## Journal

- 2026-05-25 : créé · 4 bugs critiques signalés en rafale par user · BUG 1 P0 (risque pollution Drive multi-device) · BUG 2/3/4 P1 à préciser · investigation factuelle d'abord (sans toucher au code, autre session active sur index.html)
