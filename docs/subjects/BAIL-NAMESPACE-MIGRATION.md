# BAIL-NAMESPACE-MIGRATION — Migration onclick inline → addEventListener + retrait alias globaux

**Status** : ⏳ En attente · **Prio** : P3 · **Taille** : XL (>3 jours)
**Détecté** : 2026-04-26 (notes phase 3d)
**Lié à** : V3-VISUEL · V3-REFONTE-* · phase 3d (livrée v12.56)
**Bloquant** : commercialisation V1 (mais peut être livré post-V1)

## Contexte

La phase 3d (livrée v12.56) a créé le namespace `Bail.*` (~45 entrées : `Bail.open`, `Bail.save`, `Bail.delete`, `Bail.document`, `Bail.renderActifs`, etc.). Mais pour préserver la compatibilité descendante, **les fonctions globales originales (openBail, saveBail, etc.) sont conservées comme alias**.

État actuel (vérifié 2026-04-29) :
- **355 occurrences `onclick="..."`** dans `index.html`
- **~35 onclick** directement liés au bail (Bail.*) :
  - `goBailStep`, `prevBailStep`, `nextBailStep` (wizard 4 étapes)
  - `openBail`, `saveBail`, `delBail`, `copyBailFrom`
  - `previewBail`, `previewBailRef`, `previewBailLocataireRef`, `previewSignedBailRef`
  - `previewBailHist`, `exportBailHistWord`, `delBailHist`, `openBailHist`
  - `openBailClore`, `saveBailClore`, `terminerBail`
  - `previewBailTemplate`, `saveBailTemplate`, `resetBailTemplate`
  - `resetBailSignatures`
  - `addLocataire`, `removeLocataire`, `addGarant`, `removeGarant`
  - `addImmForm`, `cancelImmForm`, `removeImm` (immeubles dans entité)
  - `_toggleBailTemplateAdvanced`, `_toggleLocAdrPrecSame` (helpers internes)
  - Et autres handlers conditionnels dans render template strings (onclick inline dans innerHTML)

## Objectif

1. **Retirer les alias globaux** : `openBail` doit devenir uniquement `Bail.open`, plus de `window.openBail`.
2. **Migrer les onclick HTML inline → addEventListener JS** : les boutons reçoivent des classes ou data-attributes, les listeners sont attachés au render.
3. **Améliorer la sécurité** : moins d'XSS surface (innerHTML avec onclick = potentiel injection si un placeholder mal échappé).
4. **Améliorer la testabilité** : event delegation centralisée → plus facile à mocker.

## Pourquoi XL (> 3 jours)

| Facteur | Impact |
|---|---|
| Volume | ~35 onclick bail directs + ~10-15 helpers indirects = 45-50 listeners à migrer |
| Cas dynamiques | `renderBailLocs`, `renderBailGarants`, `rBaux` (cartes), `rBauxHistorique` génèrent du HTML avec onclick inline → besoin d'event delegation au parent |
| Templates strings | Beaucoup d'`onclick` sont dans des strings injectées via `innerHTML` → migration nécessite refactor du render pattern |
| Tests manuels | Pas de suite de tests automatisés → chaque migration nécessite test manuel sur 4 surfaces (carte, formulaire, modale, popup preview) |
| Risques | Casser un onclick = bouton inactif sans alerte → besoin de tests systématiques |
| Coordination | Migration partielle (juste bail) vs globale (toute l'app) à arbitrer (cf. V3-REFONTE-* ?) |

## Scope (proposé)

### Phase 1 — Cartographie complète (~3-4h)

- Lister TOUS les onclick bail (script de détection automatique)
- Identifier les patterns de génération : statique (HTML direct) vs dynamique (innerHTML via render)
- Identifier les listeners qui appellent des fonctions globales (openBail, saveBail) vs Bail.* déjà migrés
- Identifier les listeners avec arguments complexes (e.g., `onclick="openBail('${l.ref}')"`)
- Documenter le résultat dans un fichier de mapping

### Phase 2 — Migration des onclick statiques (~1 jour)

Pour les boutons HTML directement dans le source (pas dans innerHTML strings) :
- Remplacer `<button onclick="openBail()">` par `<button id="btn-bail-new">`
- Ajouter à l'init de l'app : `document.getElementById('btn-bail-new').addEventListener('click', () => Bail.open());`
- Cas avec arguments fixes : OK
- Cas avec arguments dynamiques (onclick="openBail('${l.ref}')") → reportés en phase 3

### Phase 3 — Migration des onclick dynamiques (~1-2 jours)

Pour les boutons générés via innerHTML (rBaux, renderBailLocs, etc.) :
- Approche **event delegation** au parent (e.g., `#bail-list`)
- Boutons reçoivent des classes + data-attributes (`<button class="btn-bail-open" data-ref="F-001">`)
- Au render : 1 seul listener au parent, dispatch via `e.target.classList.contains('btn-bail-open')`
- Refactor des fonctions de render concernées (rBaux, renderBailLocs, renderBailGarants, rBauxHistorique, etc.)

### Phase 4 — Retrait des alias globaux (~0.5 jour)

- Identifier les fonctions encore appelées hors namespace (callers internes JS, autres modules)
- Migrer ces appels vers `Bail.*`
- Supprimer les fonctions globales (`function openBail() { return Bail.open(); }`)
- Tester : aucune régression, aucun ReferenceError dans la console

### Phase 5 — Tests systématiques (~0.5 jour)

- Surface 1 : carte du bail (Modifier, Aperçu, Voir signé, Réinitialiser, Phase 2 locataire)
- Surface 2 : formulaire Modifier bail (Wizard 4 étapes, ajout/suppression locataires/garants/signataires)
- Surface 3 : modale clôture bail
- Surface 4 : popup d'aperçu (Démarrer signature, PDF natif, Fermer)
- Surface 5 : historique des baux
- Surface 6 : Paramètres > Bail (éditeur template, mode avancé)

### Phase 6 — Documentation (~0.5 jour)

- Mettre à jour `project_bail_phase3.md` (marquer namespace complet)
- Documenter le pattern d'event delegation pour servir de modèle aux autres modules (V3-REFONTE-*)
- Mémo dans `feedback_workflow.md` ou nouveau pattern

## Estimation totale : ~3-4 jours

## Décisions à prendre

- [ ] **Périmètre** : juste bail, ou élargir à toute l'app en une seule session ?
  - Reco : juste bail d'abord, puis pattern à dupliquer module par module dans V3-REFONTE-*

- [ ] **Compat HTML inline** : doit-on AJOUTER des classes à tous les boutons ou juste utiliser des sélecteurs CSS existants ?
  - Reco : ajouter des `data-action` attributs explicites (`<button data-action="bail-open" data-ref="F-001">`)

- [ ] **Event delegation au parent ou au document** ?
  - Reco : au parent (`#bail-list`, `#ov-bail`, etc.) — plus efficace, plus précis. Document seulement si vraiment global.

- [ ] **Quand attaquer** ?
  - Reco : **après V3-VISUEL** terminé (sinon on refait 2 fois la migration sur les boutons restylés)
  - Et **après V3-REFONTE-BAIL** complet (sinon les renames de fonctions cassent la migration)

## Bénéfices attendus

- Code plus propre, plus testable
- Moins de surface XSS (HTML inline = source classique d'injections)
- Plus facile à auditer (security-review skill plus efficace)
- Pattern réutilisable pour les autres modules (V3-REFONTE-LOYERS, V3-REFONTE-QUIT, etc.)
- Préparation à un futur framework si besoin (React/Vue migration plus simple si DOM event-driven)

## Risques

| Risque | Mitigation |
|---|---|
| Bouton silencieusement cassé | Tests manuels systématiques sur les 6 surfaces |
| Listener attaché plusieurs fois (multi-render) | Vérifier idempotence du binding (flag `_bound`) |
| Fonction globale appelée encore depuis l'extérieur | Cartographie exhaustive Phase 1 |
| Régression sur les baux signés / wizard | Tester wizard signature complet en post-migration |

## Pourquoi P3 (pas P1)

- Aucun bug fonctionnel actuel
- Code marche correctement avec onclick inline
- Migration = qualité technique / sécurité, pas critique pour V1 commercial
- Investissement temps (3-4j) pas justifié avant V3 visuelle terminée

## Prompt de démarrage de session

```
On attaque BAIL-NAMESPACE-MIGRATION.
Lis : BACKLOG.md, docs/subjects/BAIL-NAMESPACE-MIGRATION.md, project_bail_phase3.md.

Workflow :
1. Confirme le périmètre (juste bail ou global ?)
2. Phase 1 cartographie : génère la liste exhaustive des onclick bail
3. Confirme avec moi avant de commencer la migration
4. Migrer phase par phase (statiques d'abord, dynamiques ensuite, alias en dernier)
5. Tests manuels après chaque phase
6. Commit par phase

Estimation : 3-4 jours.
Important : ne pas attaquer avant V3-VISUEL terminé.
```

## Notes utilisateur

> 💬 2026-04-29 : "BAIL-NAMESPACE-MIGRATION P3 XL Post-V3 : faire une description de ce qui est prévu"

## Journal

- 2026-04-26 : créé en marge de la phase 3d livrée. Note "à retirer progressivement quand on migre les onclick → addEventListener (autre étape, pas dans cette session)".
- 2026-04-29 : description détaillée écrite. Confirmé XL (3-4 jours), à attaquer après V3-VISUEL et V3-REFONTE-BAIL complet.
