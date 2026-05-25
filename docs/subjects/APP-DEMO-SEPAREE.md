# APP-DEMO-SEPAREE — Mode/app dédié(e) à la démonstration commerciale

**Status** : ⬜ À faire · **Prio** : P2 (V1 commerciale) · **Taille** : S-M (~3-6h selon option retenue)
**Détecté** : 2026-05-25 (user : « créer une base générique (ou même une app générique) avec des données de démonstration »)
**Lié à** : BUG-CRITIQUES-2026-05-25 (BUG 1, éradication des génériques) · DEMO-DATA-JSON (la base démo) · ONBOARDING-PREMIERE-CONNEXION · commercialisation V1

## Justification (4 critères pré-vol)

1. **Cible** : prospects (testent sans engagement, sans créer compte) + équipe commerciale (démos en clientèle) + presse/captures marketing + tests
2. **Règles** : isolement total des vraies données utilisateurs (zéro risque pollution)
3. **Justifications** :
   - 🧑 Cas user 2026-05-25 : « créer une base générique (ou même une app générique) avec des données de démonstration »
   - 💻 Code existant : éradication en cours des démos auto-injectées de l'app principale (BUG-CRITIQUES BUG 1)
   - 📋 Backlog : utile site vitrine + onboarding + presse + tests E2E
4. **5 vues 360°** : commercial (démo sans friction) + technique (isolement) + marketing (URL dédiée partageable)

## 3 options pour matérialiser la démo séparée

| Option | Mécanisme | Isolation | Effort |
|---|---|---|---|
| **A — Mode démo dans l'app principale** | Flag URL `?demo=1` ou bouton « Mode démo » : charge `demo-data.json` dans un **localStorage namespace isolé** (clé distincte type `immotrack_db_demo`), désactive la sync Drive | ⭐⭐ Bonne (LS séparé, pas de Drive) | XS (~1-2h) |
| **B — URL distincte / build séparé** | `https://demo.immotrack.app` (ou `/demo/` path) qui sert l'app avec données démo chargées, sync Drive désactivée | ⭐⭐⭐ Maximale (URL différente, déploiement séparé) | M (~3-4h) |
| **C — Les deux** | A pour test/dev + B pour communication commerciale publique | ⭐⭐⭐ Maximale | M+S (~5-6h) |

→ **Reco** : **A en V1** (rapide, suffit pour onboarding + premières démos), **B en V1.1** quand le site vitrine sera prêt (URL marketing partageable).

## Caractéristiques communes

- **Banner permanent** en haut : « 🧪 Mode démo — données fictives, vos modifications ne sont pas sauvegardées »
- **Sync Drive désactivée** (pas de risque de pollution)
- **Bouton « Démarrer l'app pour de vrai »** redirige vers l'app standard
- **Reset facile** : bouton « Recharger les données démo » pour repartir propre
- Données fictives **réalistes mais non identifiables** (RGPD : aucun vrai nom)

## Scope Option A (V1, ~1-2h)

### Phase 1 — Détection du mode (~20min)
- Lire `?demo=1` dans l'URL au boot OU bouton « Activer mode démo » dans Paramètres
- Si actif : `_isDemoMode = true` + bascule clé localStorage (`immotrack_db` → `immotrack_db_demo`)

### Phase 2 — Chargement démo (~30min)
- Au 1ᵉʳ entry mode démo : `fetch('demo-data.json')` → injecter dans `immotrack_db_demo`
- Bouton « Recharger les données démo » (reset DB démo + re-fetch)

### Phase 3 — Désactivation sync Drive + banner (~20min)
- `_isDemoMode === true` → `_driveSave*` no-op + bouton Drive masqué/désactivé
- Banner sticky en haut : « 🧪 Mode démo… »

### Phase 4 — Tests (~20min)
- Activer mode démo : pas de pollution de `immotrack_db` (vraies données)
- Désactiver : retour propre aux vraies données
- Aucun appel Drive en mode démo

## Scope Option B (V1.1, ~3-4h)

- Path `/demo/` ou sous-domaine — déploiement séparé sur Vercel/Cloudflare Pages
- Build conditionnel : même code app, démarre forcément en mode démo (`_isDemoMode = true` baked)
- URL partageable : `https://immotrack.app/demo/` → 1 clic et le prospect voit l'app remplie

## Liens avec autres sujets

- **DEMO-DATA-JSON** : produit le fichier `demo-data.json` (cf sujet dédié, P1/M)
- **ONBOARDING-PREMIERE-CONNEXION** : depuis l'écran de bienvenue, bouton « 🧪 Explorer les données de démo » → bascule en mode démo (sans toucher la vraie DB)
- **BUG-CRITIQUES BUG 1** : ce sujet ne se déclenche QU'APRÈS éradication totale des démos auto-injectées de l'app principale (sinon doublon)

## Décisions à arbitrer

- [ ] **D1** : Option A en V1 puis B en V1.1, ou directement B ?
  - → Reco : A d'abord (rapide, débloque onboarding + tests prospects), B quand vitrine prête
- [ ] **D2** : sortie du mode démo automatique (timer 30 min ?) ou seulement manuel ?
- [ ] **D3** : Option B (URL séparée) : sous-domaine `demo.immotrack.app` ou path `/demo/` ?

## Notes utilisateur

> 💬 2026-05-25 : « il faut supprimer toutes les infos génériques de l'app et créer une base générique (ou même une app générique) avec des données de démonstration »

## Journal

- 2026-05-25 : créé · 3 options (mode A intégré / URL B séparée / les deux C) · reco A pour V1 (rapide) + B pour V1.1 (URL marketing partageable) · isolation localStorage namespace + sync Drive désactivée + banner + reset facile · dépend de DEMO-DATA-JSON (la base de données démo) et de l'éradication des démos auto-injectées (BUG-CRITIQUES BUG 1)
