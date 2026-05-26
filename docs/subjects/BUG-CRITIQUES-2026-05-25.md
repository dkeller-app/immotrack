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

### 🎯 Décision user 2026-05-25 : éradication totale des génériques + base démo séparée

> 💬 « je pense qu'il faut supprimer toutes les infos génériques de l'app et créer une base générique (ou même une app générique) avec des données de démonstration »

→ **Approche radicale retenue** :
1. **Supprimer TOUTES les références aux données génériques** du code de l'app (initDB injection, SCI Dupont id=1001, DEMO-F2, Pierre/Marie Demo, mvts 9000001-9000003, et tout ce qui traîne). Audit code complet requis (pas juste `initDB`).
2. La **base démo vit dans un fichier séparé** (`demo-data.json`), chargée UNIQUEMENT sur action explicite (bouton "Charger démo" dans onboarding/paramètres). Cf DEMO-DATA-JSON.
3. **Cleanup migration** : au boot v15.X+, si on détecte des entités/logements/baux portant les IDs/noms des anciennes démos auto-injectées → purge silencieuse (tombstones propres).
4. **App démo séparée** (optionnel) : URL distincte ou mode `?demo=1` pour communication commerciale, captures, prospects → cf nouveau sujet **APP-DEMO-SEPAREE**.

Cette décision **résout aussi le BUG 2** (impossibilité supprimer démos) puisque plus aucune démo n'est injectée en prod.

---

## 🚨 BUG 2 — Impossibilité de supprimer (P1) — PRÉCISÉ 2026-05-25

> 💬 « 1 : les démos et j'ai essayé sur le mac et le téléphone »

**Précisé** : c'est l'**impossibilité de supprimer les démos auto-injectées** (SCI Dupont / DEMO-F2 / Pierre/Marie Demo). Le user a confirmé que le BUG 1 (injection démos) touche **TOUS ses devices** (PC + Mac + téléphone). Pas de bug séparé de suppression sur ses VRAIES données.

**Conséquence** : BUG 2 se résout en même temps que BUG 1 — si on retire l'injection auto, plus de démos polluantes. + un cleanup au prochain boot pour purger les démos déjà injectées sur tous ses devices.

**Action** : couplé au fix BUG 1 (Task #2).

---

## 🚨 BUG 3 — Bouton "Créer bail" mal câblé + dispatch infos bien/bail à revoir (P1) — PRÉCISÉ 2026-05-25

> 💬 « dans logement le bouton créé bail dirige vers le bien. en plus on a bcp d'infos dans biens qui sont liés au locataire. avoir le loyer théorique me choque pas mais le reste on a un gros boulot pour dispatcher les bonnes infos au bon endroit. En plus quand on créé un immeuble ou bien, il faudrait avoir une suite logique (immeuble -> biens -> baux) pour que l'utilisateur puisse avoir une vraie expérience et utilisation »

**3 problèmes en un** :

### 3.A — Bouton "Créer bail" dirige vers le bien (régression UX) ✅ FIXÉ v15.190
- Sur la fiche bien (logement), le bouton « Créer un bail » ne lance pas le wizard bail → revient sur le bien (boucle)
- **Cause exacte** : l.31450, bouton appelait `openNewLog(ref)` (éditeur logement) au lieu de `openBail(ref)` (formulaire bail)
- **Fix v15.190** (commit `afb924c`) : `openBail(ref)` — le formulaire bail s'ouvre pré-rempli avec le logement et dropdown verrouillé.

### 3.B — Dispatch des infos bien vs bail/locataire à revoir
Sur le screenshot « Modifier RDC gauche » : la modale Identité contient une section **« BAIL COURANT (LEGACY — À MIGRER PHASE 4) »** avec :
- Loyer HC, Charges → ✅ user OK pour rester côté bien (loyer **théorique** acceptable)
- **Locataires, Tél, Mail** → ❌ user veut que ça parte côté locataire/bail (« on a bcp d'infos dans biens qui sont liés au locataire »)

→ Croise directement **ARCHI-DB-DOUBLONS** (séparation log/bail) et **NAV-LOGEMENT-BAIL-CLARIF** (« le mur » vs « la personne »).

### 3.C — Suite logique de création manquante : Immeuble → Bien → Bail
> « quand on créé un immeuble ou bien, il faudrait avoir une suite logique (immeuble → biens → baux) »

Aujourd'hui chaque création est isolée (créer immeuble seul, puis devoir aller créer un bien, puis aller créer un bail). User veut un **flow guidé séquentiel** après création d'immeuble/bien → propose de créer le suivant.

→ **Nouveau sujet créé** : `WIZARD-CREATION-SEQUENTIEL.md`.

**Action** : 3.A en correction de bug (immédiat) + 3.B en refonte (couvert par ARCHI-IMM-LOG-DEDUP + NAV-LOGEMENT-BAIL-CLARIF) + 3.C en nouveau sujet wizard.

---

## 🚨 BUG 4 — Infos redondantes entre Immeuble et Bien (P1) — PRÉCISÉ 2026-05-25

> 💬 « 2 : il y a bcp d'infos redondantes entre immeuble et bien (adresse, année de construction, régime juridique...) »

**Précisé** : duplication de saisie entre la fiche **Immeuble** et la fiche **Bien** :
- Adresse
- Année de construction
- Régime juridique
- Probablement d'autres (à inventorier)

Sur le screenshot « Modifier RDC gauche » : l'**adresse** « 15 rue des pèlerins - 68790 MORSCHWILLER LE BAS » est saisie côté **bien** alors qu'elle vient logiquement de l'**immeuble** parent (Morschwiller-le-bas) — c'est exactement la redondance pointée.

**Conséquences** :
- Double saisie pénible
- Risque d'incohérence (adresse modifiée d'un côté, pas de l'autre)
- Schéma de données impropre

**Fix structurel** : les infos communes vivent côté **immeuble**, le **bien hérite** par référence. Le bien ne porte que ce qui lui est propre (étage, surface, type, exposition…).

→ **Nouveau sujet créé** : `ARCHI-IMM-LOG-DEDUP.md`.

**Action** : refonte schéma, dans le cadre de la même refonte que ARCHI-DB-DOUBLONS (log/bail) et NAV-LOGEMENT-BAIL-CLARIF. À planifier conjointement.

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
