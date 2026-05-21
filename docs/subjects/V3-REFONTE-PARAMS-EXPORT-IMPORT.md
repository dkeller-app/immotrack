# V3-REFONTE-PARAMS-EXPORT-IMPORT — Refonte de la zone "données/admin" (Paramètres + Sauvegarde + Import)

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : L (~8-12h, 3 onglets)
**Détecté** : 2026-05-17 (user : « il faudra absolument revoir les onglets paramètres et sauvegarde et l'import de données (biens…) »)
**Lié à** : V3-REFONTE-IMPORTS-UI (Sprint 19E) · BANK-IMPORT-XLSX (2 moteurs à unifier) · IMPORT-CONCURRENTS · BUG-BANK-IMPORT-DEDUP · PARAM-BAILLEUR-AUTOMATISATIONS · NAV-LOGEMENT-BAIL-CLARIF (refonte nav globale)

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs — ces 3 onglets = la « tuyauterie » de l'app (config + sauvegarde + entrée de données). Mal fichus = friction onboarding + risque perte de données.
2. **Règles** : simplicité + design consistency + ne rien casser (sauvegarde = critique)
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 : « il faudra absolument revoir les onglets paramètres et sauvegarde et l'import de données »
   - 🧑 Cas user antérieur : « paramètres et export (on a ajouté plein de choses qui ne sont plus valables) » + « imports : on mélange tout, 3 onglets qui se répètent »
   - 💻 Code existant : 2 moteurs d'import bancaire concurrents (cf BANK-IMPORT-XLSX), Paramètres = 9 sous-tabs hétérogènes, Export = 8 cards à auditer
   - 📋 Backlog : croise V3-REFONTE-IMPORTS-UI + BANK-IMPORT-XLSX + IMPORT-CONCURRENTS
4. **5 vues 360°** : UX (clarté) + technique (unification moteurs) + commercial (onboarding/migration depuis concurrents) + sécurité (sauvegarde fiable)

## Les 3 onglets à revoir

### A — ⚙️ Paramètres
- **Problème** : 9 sous-tabs hétérogènes, certains obsolètes (« plein de choses plus valables »)
- **À faire** : audit d'obsolescence (cf Sprint 19I V3-REFONTE-PARAMS-AUDIT — inventaire AVANT suppression, validation user)
- 9 sous-tabs actuels : Catégories / Pièces EDL / Modèle bail / Règles import / Thème / Mandataire / Partage / Profil utilisateur / Préférences
- Décision : quoi garder / fusionner / supprimer (avec OK user, rien de destructif sans validation)

### B — 💾 Sauvegarde / Export
- **Problème** : ajouts empilés, lisibilité à revoir, distinction sauvegarde vs export pas claire
- **À clarifier** : 
  - **Sauvegarde** = filet de sécurité (export complet DB JSON pour restauration) — CRITIQUE
  - **Export** = sortie de données pour usage externe (CSV comptable, xlsx, PDF) — pratique
  - Ce sont 2 besoins différents souvent mélangés
- **À faire** : séparer clairement Sauvegarde (backup/restore intégral) de Export (extraits métier), auditer les 8 cards d'action actuelles

### C — 📥 Import de données (biens, baux…)
- **Problème** : « on mélange tout » — import référentiel (Excel) + import bancaire (CSV/OFX) + 2 moteurs concurrents
- **À faire** (cf V3-REFONTE-IMPORTS-UI Sprint 19E + BANK-IMPORT-XLSX) :
  - 3 sous-tabs clairs : 📋 Référentiel (entités/immeubles/logements/baux) · 💳 Bancaire · 🔄 Concurrents (Rentila/BailFacile/Qalimo)
  - **Unifier les 2 moteurs d'import bancaire** (cf BANK-IMPORT-XLSX : un seul moteur CSV+OFX+XLSX)
  - Tableau simple et rapide pour import bases concurrentes (cf IMPORT-CONCURRENTS)

## Découpage en sprints (proposé)

Ce sujet chapeaute 3 chantiers déjà partiellement spec'és :

| Onglet | Sprint dédié | Statut |
|---|---|---|
| Import (3 sous-tabs + unif moteurs) | V3-REFONTE-IMPORTS-UI (Sprint 19E) + BANK-IMPORT-XLSX | spec'é |
| Paramètres (audit obsolescence) | V3-REFONTE-PARAMS-AUDIT (Sprint 19I) | spec'é (inventaire d'abord) |
| Sauvegarde/Export (séparer backup vs export) | **à spec'er** (nouveau, ce sujet) | ⬜ |

→ **Reco** : traiter dans l'ordre Import (le plus cassé) → Sauvegarde (critique sécurité) → Paramètres (nettoyage). Chacun = sprint séparé, ce sujet sert de fil rouge.

## Décisions à arbitrer

- [ ] **D1** : 3 sprints séparés (Import / Sauvegarde / Paramètres) ou 1 gros sprint « zone admin » ?
  - → Reco : 3 séparés (moins risqué, la sauvegarde est critique et mérite son focus)
- [ ] **D2** : Sauvegarde — auto-backup périodique (ex : 1×/semaine dans Drive) en plus de l'export manuel ?
- [ ] **D3** : Paramètres — quels sous-tabs sont obsolètes ? (inventaire Sprint 19I, validation user)
- [ ] **D4** : ces onglets restent-ils en top-level sidebar ou regroupés dans un hub « ⚙️ Configuration » ?

## Notes utilisateur

> 💬 2026-05-17 : « il faudra absolument revoir les onglets paramètres et sauvegarde et l'import de données (biens…) »
> 💬 (antérieur) : « paramètres et export (on a ajouté plein de choses qui ne sont plus valables maintenant) »
> 💬 (antérieur) : « imports : il faut revoir on mélange tout : import bancaire et de données de base ! 3 onglets qui se répètent »

## Journal

- 2026-05-17 : créé · sujet chapeau de la zone données/admin (Paramètres + Sauvegarde + Import) · relie V3-REFONTE-IMPORTS-UI + BANK-IMPORT-XLSX + IMPORT-CONCURRENTS + V3-REFONTE-PARAMS-AUDIT · reco 3 sprints séparés (Import → Sauvegarde → Paramètres) · Sauvegarde à spec'er (séparer backup intégral vs export métier)
