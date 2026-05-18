# DOC-CIVILITE — Formules de politesse : reprendre civilité du locataire

**Status** : ✅ **Livré v15.90** (EM-3 du sprint email UX) · **Prio** : P2 · **Taille** : XS
**Détecté** : 2026-04-28
**Lié à** : V3-REFONTE-BAIL · IRL-LETTRE-REVISION · BAIL-PRINT-POLISH

## Contexte
Dans les formules de politesse des courriers (lettre IRL, quittances, courriers cautionnement, etc.), la **civilité du locataire** (M., Mme, Mlle…) doit être reprise dynamiquement, pas en dur.

Aujourd'hui, certains templates utilisent "Madame, Monsieur" générique au lieu de la civilité réelle.

## Scope
- [ ] Identifier tous les templates de courrier (IRL, quittances, courriers générés depuis app)
- [ ] Pour chacun, remplacer "Madame, Monsieur" générique par `{civilite} {nom}` ou "Madame [Nom]" / "Monsieur [Nom]"
- [ ] Cas plusieurs locataires (colocation) : `Madame X, Monsieur Y,` dans la formule

## Décisions à prendre
- [ ] Si la civilité est manquante en DB → fallback "Madame, Monsieur" générique ou avertissement utilisateur ?

## Notes utilisateur
> 💬 2026-04-28 : "Dans formule de politesse reprendre la civilité du locataire"

## Journal
- 2026-04-28 : créé
- 2026-05-18 : ✅ **Livré v15.90** (EM-3 du sprint email UX) :
  - Helper `_enrichContextCivilite(ctx)` dans [js/core/email-compose.js](js/core/email-compose.js) qui calcule sur `locataire` ET `garant` :
    - `civNom` = "Monsieur Dupont" / "Madame Martin" / "Dupont" (fallback si civilité absente)
    - `civSalut` = "Monsieur," / "Madame," / "Madame, Monsieur," (fallback)
    - `civilitePolitesse` = "Monsieur" / "Madame" / ""
    - Idempotent : si déjà fourni dans le contexte (override custom), ne recalcule pas
  - 28 templates : `{{locataire.nom}}` → `{{locataire.civNom}}` et `{{garant.nom}}` → `{{garant.civNom}}` (replace_all global)
  - Tests Vitest : 7 nouveaux tests civilité dans `email-compose.test.js` (M./Mme/absent/formel rappel-impaye-3/garant/civNom déjà fourni/ctx absent) → 69/69 verts (62 + 7)
  - Verif preview JS v15.90 :
    - M. DUPONT → "Bonjour Monsieur DUPONT," ✅
    - Mme MARTIN → "Bonjour Madame MARTIN," ✅
    - Sans civilité → "Bonjour SANS-CIV," ✅ (fallback gracieux)
  - **Total : 915/915 tests verts** (908 + 7)
  - Couvre les courriers via templates email + déjà fait dans les PJ PDF EM-2c v15.89 (via `_civNom` helper interne)
- ⏸️ **Cas colocation (multi-locataires)** non couvert en V1 : le caller passe le 1er locataire seul. Si besoin "Madame X, Monsieur Y" dans le mail → demande un caller updated qui construit un locataire synthétique avec civNom composite. Reporté V1.1 si demande user.
