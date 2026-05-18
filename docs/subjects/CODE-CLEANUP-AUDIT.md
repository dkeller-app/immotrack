# CODE-CLEANUP-AUDIT — Ménage codebase ImmoTrack (suppression code mort, dédoublonnage UI)

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : L (~6-10h)
**Détecté** : 2026-05-18 (user : « est-ce qu'on ne doit pas faire du ménage dans le code pour supprimer tout ce qui ne sert à rien et qui peut créer des problèmes ? »)
**Lié à** : AUDIT-GLOBAL ✅ v14.81 (mais limité), ARCHI-MODULAR 🔄 (en cours phases reportées), DASH-REFONTE-GLOBALE-V4

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs V1 commercial — bugs cachés par code mort + flash UX legacy + désync versions multiples
2. **Règles** : tests Vitest verts avant + après · 1 phase = 1 commit · audit transversal post-fix mandatory (`feedback_rigor_audit.md`)
3. **Justifications** :
   - 🧑 User 2026-05-18 : « rien de fonctionnel ! de plus tu ne mets pas à jour la version (qd j'ouvre l'app, j'ai l'ancien UX qui s'affiche puis le nouvel UX) »
   - 💻 Sidebar legacy + Sidebar V4 coexistent → flash UX + version désynchronisée (v15.73 hardcodée trouvée le 2026-05-18, sidebar V4 jamais bumpée depuis 7 versions)
   - 💻 Dashboard v1 + v2 coexistent (toggle via `DB.params.dashRenderV`) — ~500 lignes de code v1 maintenant inactives
   - 💻 Hub Communications `_openCommsHub` marqué `@deprecated` v15.16 mais code conservé en lecture seule (no callers)
   - 💻 Anciens widgets dashboard (`occ`, `rdt`, `donut`, `dg`, `flux` v1) plus jamais appelés en mode V4
   - 📋 BACKLOG entries DASH-REFONTE-GLOBALE-V4 listent explicitement « reports V3-VISUEL » : suppression CSS orphelins, nettoyage variables `top/maxV/rows`, suppression widgets v1 legacy
4. **5 vues 360°** : technique (codebase 30k+ lignes) + UX (flash legacy) + commercial (maintenance V2 SaaS) + cycle vie (V1 propre = onboarding plus rapide pour collab futur) + perf (- de code = boot plus rapide)

## Scope identifié

### Phase 1 — Audit transverse (~2h)
Liste exhaustive du code mort / dédoublonné :

| Catégorie | Identifié | Lignes estimées | Risque suppression |
|---|---|---|---|
| **Sidebar legacy** (`#sb` HTML statique) vs **Sidebar V4** (`_renderSidebarV4`) | coexistent, flash UI | ~150 HTML | M (cohabitent par design pour mode v1/v2) |
| **Dashboard v1 widgets** (`occ`, `rdt`, `donut`, `dg`, `flux` v1) | inactifs en mode V4 | ~500 JS | L (DASH-REFONTE-GLOBALE-V4 a documenté la liste) |
| **CSS `.cockpit-v2` / `.cockpit-v4`** orphelins anciens CP | orphelins | ~140 CSS | XS |
| **Hub Communications `_openCommsHub`** (l.19328+) | `@deprecated v15.16` | ~120 JS | XS (no caller) |
| **Variables mortes `top/maxV/rows`** dans widget `donut` v1 | 10 lignes harmless | ~10 JS | XS |
| **Backgrounds `#fff` hardcodés** résiduels | 3 sites (modales/print) | ~3 CSS | XS |
| **Versions hardcodées** (`v15.73` dans sidebar V4 ligne 5439) | désync risk | qq lignes | XS (fix v15.81 = constante `IMMOTRACK_VERSION`) |
| **`index-test.html`** (sandbox) | obsolète depuis bascule directe prod 2026-05-16 | 35 000 lignes | M (à vérifier si encore utilisé pour autre chose) |
| **`js/main.js` Sprint 3C log** | log info redondant à chaque module chargé | ~20 lignes | XS |
| **Code dual `cardsGrid` + `irl-tbody`** (vue cards + vue table legacy IRL) | toggle user `_irlView` | ~100 JS | M (user pourrait switcher) |
| **Helpers PJ legacy `m.pj.dataB64`** (v14.99 a migré vers attachments) | rétro-compat | ~30 JS | M (vérifier 0 user encore avec ancien format) |

### Phase 2 — Décisions de tri (~1h, STOP USER obligatoire)
User valide chaque catégorie : 🟢 Supprimer · 🟡 Garder + tagguer @deprecated · 🔴 Garder tel quel

### Phase 3 — Suppression catégorie par catégorie (~3-4h)
1 commit par catégorie validée. Test Vitest entre chaque pour zéro régression.

Ordre suggéré (par risque croissant) :
1. Versions hardcodées → constante `IMMOTRACK_VERSION` ✅ déjà fait v15.81
2. Variables mortes simples (top/maxV/rows, backgrounds #fff)
3. CSS `.cockpit-v2` orphelins
4. Hub Communications `_openCommsHub` (no caller)
5. Dashboard v1 widgets
6. `index-test.html` (sous réserve confirmation user)
7. Sidebar legacy (si décision : V4 uniquement → suppression structurelle)

### Phase 4 — Tests E2E manuels + bump version (~30min)
- 5 onglets prioritaires (Accueil, Dashboard, IRL, Quittances, Bail)
- Mode Solo + Gestionnaire
- Mobile + Desktop
- Bump version (constante) + commit final

## Décisions à prendre

- **D1** : on garde Dashboard v1 en mode "fallback" OU on supprime au profit de V4 only ?
- **D2** : on supprime `index-test.html` ou on garde comme sandbox future ?
- **D3** : on garde la vue Tableau IRL legacy (`_irlView='table'`) ou cards-only ?
- **D4** : Hub Communications `_openCommsHub` — on supprime ou on RÉACTIVE via le nouveau bouton 📧 fiche bail (sujet AUDIT-EMAIL-FLOW-COMPLET) ?
- **D5** : Ordre d'attaque — risque croissant (proposé ci-dessus) OU dans l'ordre du backlog DASH-REFONTE-GLOBALE-V4 (reports déjà identifiés) ?

## Notes utilisateur

> 💬 2026-05-18 : « est-ce qu'on ne doit pas faire du ménage dans le code pour supprimer tout ce qui ne sert à rien et qui peut créer des problèmes ? »

> Contexte du déclencheur : sidebar V4 affichait v15.73 hardcodée alors que prod en v15.80, flash UX legacy → V4 au boot, modale email v15.80 bugs.

## Journal

- 2026-05-18 : créé · P1 (qualité codebase + bugs cachés) · 5 décisions D1-D5 à arbitrer · ordre risque croissant proposé · Phase 0 fix `IMMOTRACK_VERSION` déjà livré v15.81 commit ci-dessous