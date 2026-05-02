# FICHES-PARITE-360 — Parité totale onglets ↔ fiches 360°

**Status** : 🔄 **Session 1 ✅ Compta riche logement livrée v14.18** · 7 sessions restantes · **Prio** : P1 · **Taille** : XL (~27h, ~23h restantes)
**Détecté** : 2026-05-02
**Lié à** : ARCHI-DB-DOUBLONS (prérequis) · LOG-FICHE-360 · IMM-FICHE-360 · ENT-FICHE-360 · LOG-PHOTOS · EDL-TEMPLATE-PER-LOG

## Principe acté avec utilisateur

**Single source of truth** pour chaque action / vue / data. Une action de l'onglet X (Baux, Mouvements, Quittances, IRL, EDL, Régul, Équipements, Assurances, Agenda) doit être accessible depuis la fiche 360° correspondante (filtrée sur le bien/immeuble/bailleur), avec UX **identique**.

> Citation utilisateur 2026-05-02 :
> « tous les fonctions qu'on trouve dans les onglets doivent se retrouver dans le bien. Un vrai 360°. Qu'on fasse par l'onglet ou via biens ça doit être transparent. Donc vérifie ce qu'il existe à chaque fois dans les 2 sens pour que tout soit toujours égal »

## Pattern technique recommandé

Pour chaque onglet à factoriser :

```js
// AVANT (monolithique)
function rMv() {
  const list = DB.mouvements.filter(...);
  el('mv-tbody').innerHTML = list.map(m => `...`).join('');
}

// APRÈS (factorisé)
function _renderMvForLog(ref, opts = {}) {
  const filtered = (DB.mouvements||[]).filter(m =>
    (!ref || m.qui === ref) && (!opts.from || m.date >= opts.from)
  );
  return filtered.map(m => _renderMvRow(m, opts)).join('');
}

function rMv() {
  // Onglet : pas de filtre ref, full table
  el('mv-tbody').innerHTML = _renderMvForLog(null, {showFilters:true});
}

// Sous-onglet Compta de la fiche logement :
function _renderLogFichePanelCompta(log, ref) {
  return `<div class="logf-compta">
    <div class="compta-kpis">${_renderComptaKPIsForLog(ref)}</div>
    <div class="compta-mvts">${_renderMvForLog(ref)}</div>
    <div class="compta-quittances">${_renderQuitForLog(ref)}</div>
    <div class="compta-irl">${_renderIrlForLog(ref)}</div>
  </div>`;
}
```

## Inventaire — 9 onglets ImmoTrack et leur mapping fiche 360° logement

| Onglet | Fonction | Statut parité fiche LOG | Helper à extraire |
|---|---|---|---|
| 📜 Baux & Locataires | `rBaux` (l.9646) | ✅ **Fait en v14.13 A4** | (déjà OK) |
| 💰 Loyers & Mouvements | `rMv` (l.9319) | ❌ Sous-onglet Compta stub | `_renderMvForLog(ref)` |
| 🧾 Quittances | `rQuit` (l.15023) | ❌ Sous-onglet Compta stub | `_renderQuitForLog(ref)` |
| 📈 IRL | `rIRL` (l.14450) | ❌ Sous-onglet Compta stub | `_renderIrlForLog(ref)` |
| ⚖ Régularisation | `rRegulInit` (l.14776) | ❌ Sous-onglet Compta stub | `_renderRegulForLog(ref)` |
| 📋 EDL | `rEDLList` (l.15766) | ❌ Sous-onglet stub | `_renderEDLsForLog(ref)` |
| 🛡 Assurances | `rAss` (l.14155) | ❌ Pas de sous-onglet | `_renderAssForLog(ref)` |
| 🔧 Équipements | `rEquipements` (l.19920) | ❌ Sous-onglet Entretien stub | `_renderEquipForLog(ref)` |
| 📅 Agenda | `rAgenda` (l.19705) | ❌ Pas de sous-onglet | `_renderAgendaForLog(ref)` |

## Mapping cible fiche logement (8 sous-onglets)

```
📋 Général        ✅ Locataire actuel + Caractéristiques (post ARCHI-DB-DOUBLONS)
📜 Bail           ✅ parité complète avec rBaux (8 actions, timeline historique)
💰 Comptabilité   ❌ aggrège mvt + quittances + IRL + régul (4 sous-sections + KPIs annuels + cash-flow)
📋 EDL            ❌ liste EDL filtrés + bouton Nouvel EDL + accès aux PDFs
📁 Documents      ❌ tous PDFs liés (bail signé, EDL, lettres IRL, quittances) + LOG-PHOTOS
⚡ Compteurs      ❌ relevés conso (extraction des EDL) + graphique évolution annuelle
🛡 Entretien      ❌ équipements + assurances + agenda entretien filtrés ref
🆕 Template EDL   ❌ EDL-TEMPLATE-PER-LOG (sujet jumeau, session parallèle)
```

## Mapping cible fiche immeuble (6 sous-onglets)

```
🏠 Logements                    ✅ déjà OK
📅 Plan d'occupation Gantt      ❌ NEW — différenciant pour solutions immobilières (peu de concurrents le font)
                                   24 mois passés + 12 futurs, ligne par logement, barres = baux par locataire
📁 Documents communs            ❌ NEW (règlement copro, attestations communes)
⚡ Charges communes / Régul     ❌ alias rRegulInit filtré sur l'immeuble + répartition par tantièmes
🔧 Travaux & équipements        ❌ alias rEquipements filtré sur l'immeuble + compteurs collectifs
📊 Occupation historique        ❌ stats : taux occupation moyen, durée bail moyenne, top locataires
```

## Mapping cible fiche bailleur (6 sous-onglets)

```
🏢 Immeubles                    ✅ déjà OK
📁 Documents juridiques         ❌ NEW (statuts, K-bis, mandats, attestations)
💰 Comptabilité globale         ❌ alias agrégé sur tous les biens du bailleur (P&L mensuel)
👥 Associés / Mandats           ❌ NEW (lien ASSO-PARTAGE)
📊 Performance par immeuble     ❌ NEW (rendement comparé, top loyers, top vacance, graphique radar)
🧾 Quittances émises            ❌ alias rQuit filtré sur le bailleur
```

## Phasing par session dédiée (volume total ~27h)

Ordre par ROI décroissant :

| # | Session | Coût | Différenciant | Prérequis |
|---|---|---|---|---|
| 1 | **Compta riche logement** (mvt + quittances + IRL + régul + KPIs annuels + cash-flow) | ~4h | KPIs par bien — nouveau | ARCHI-DB-DOUBLONS Phase 2+3 livré |
| 2 | **Plan d'occupation Gantt immeuble** | ~3h | **Killer feature** vs Qalimo/BailFacile | ARCHI-DB-DOUBLONS Phase 2 livré |
| 3 | **EDL fiche logement + EDL-TEMPLATE-PER-LOG** | ~7h | Bundle session parallèle | (peut être en parallèle) |
| 4 | **Compteurs + graphique conso annuel** | ~2h | Différenciant énergie | EDL refacto (extraction relevés) |
| 5 | **Entretien (équipements + assurances + agenda)** | ~2h | Cohérence opérationnelle | (aucun) |
| 6 | **Documents agrégés** | ~1h | Quick win | (aucun) |
| 7 | **Performance + compta bailleur** | ~5h | Analytics premium | ARCHI-DB-DOUBLONS Phase 2+3 livré |
| 8 | **Plan immeuble : charges communes + travaux + docs** | ~3h | Apport unique vs concurrents | (aucun) |

= 8 sessions, ~27h cumulé.

## Critères d'acceptance pour chaque sous-onglet livré

- [ ] Fonction `_renderXForLog(ref)` ou `_renderXForImm(eid, iid)` extraite, utilisée à la fois par l'onglet et la fiche
- [ ] Toutes les actions de l'onglet correspondant accessibles depuis la fiche (parité 100%)
- [ ] Les **mêmes** données sont visibles dans les 2 vues (filtrage ref appliqué uniformément)
- [ ] Modifier une donnée depuis la fiche se reflète immédiatement dans l'onglet (et vice-versa)
- [ ] Mode sombre + responsive 4 breakpoints (1280/1024/768/600) OK
- [ ] A11y : aria-selected sur tabs internes, focus-visible
- [ ] Tests manuels : créer / modifier / supprimer chaque type d'objet depuis la fiche → vérifier dans l'onglet, et inverse

## Coordination avec sujets connexes

- **ARCHI-DB-DOUBLONS** : prérequis fort. Si on factorise `_renderXForLog(ref)` avant l'archi propre, les helpers liront `log.locataire / log.dg / log.fin` qui doivent disparaître. Risque double refacto.
- **EDL-TEMPLATE-PER-LOG** : peut être livré en parallèle (zone code distincte). À bundler avec session 3 (EDL fiche logement) si timing s'y prête.
- **LOG-PHOTOS** : alimente le hero des 3 fiches. Pas bloquant pour la parité mais améliore les sous-onglets Documents.
- **DASH-PROFILES** : indépendant, ne bloque pas.

## Volume estimé

| Sous-total | Coût |
|---|---|
| Compta logement | 4h |
| EDL logement (+ EDL-TEMPLATE-PER-LOG) | 7h |
| Compteurs | 2h |
| Entretien logement | 2h |
| Documents logement | 1h |
| Plan immeuble (Gantt + charges + travaux + docs) | 6h |
| Bailleur (compta globale + perfo + docs juridiques + associés + quittances) | 5h |
| **TOTAL** | **~27h** |

## Journal

- 2026-05-02 : créé · audit complet 9 onglets ↔ 3 fiches · pattern technique factorisation `_renderXForLog(ref)` · phasing 8 sessions par ROI · prérequis ARCHI-DB-DOUBLONS (sinon double refacto)
- 2026-05-02 (soir) : **Session 1 livrée v14.18** commit `a2ae89c` (~3h, +258/-6 lignes)
  - Sous-onglet "💰 Comptabilité" de LOG-FICHE-360 activé et fonctionnel (sortie du stub disabled)
  - 5 helpers factorisables créés : `_renderComptaKPIsForLog`, `_renderComptaCashFlowChart`, `_renderMvForLog`, `_renderQuitForLog`, `_renderIrlForLog`
  - 4 KPIs annuels : loyers encaissés, charges payées, solde net (vert/rouge), vacance estimée %
  - **Cash-flow mensuel SVG natif** : 12 barres colorées (vert/rouge/gris), marker mois courant, tooltip détaillé, échelle auto, ligne zéro pointillée
  - 3 sections listées : mouvements, quittances, IRL — lignes compactes grid 5 cols (date/lib/cat/amt/act)
  - Toolbar : sélecteur année (3 ans) + bouton "+ Mvt" + "+ Quittance" + "↗ Onglet Mouvements"
  - Section Régularisation = stub avec lien (logique régul complexe, session future dédiée)
  - State `_logFicheComptaYear` (default année courante)
  - CSS `.compta-*` : toolbar, cashflow card, liste rows responsive
  - **Sessions restantes** : 2 (Plan d'occupation Gantt) → 8 (Plan immeuble) — voir tableau ROI ci-dessus
