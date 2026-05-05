# 📦 Lentilles archivées

Ces 6 mockups étaient initialement proposés dans la première version (V1) de DASH-PROFILES (1 mai 2026).

Après feedback utilisateur (5 mai 2026), ils ont été **abandonnés en tant que lentilles dashboard** :
- soit parce qu'ils étaient redondants avec une autre vue
- soit parce qu'ils étaient trop dépendants de données non capturées (data model fragile)
- soit parce qu'ils relèvent plus d'**outils dédiés** que d'un dashboard

| Fichier | Raison de l'archivage |
|---|---|
| `lentille-2-financier.html` | **Fusionnée** dans la nouvelle Vue Propriétaire (KPIs Finance + Revenus vs Charges + Progression annuelle déjà présents) |
| `lentille-4-fiscale.html` | **Reportée** comme outil dédié (sujet `LEGAL-2044` au backlog, P1) — pré-rempli 2044 + export PDF/CSV est plus un outil qu'un dashboard |
| `lentille-5-investisseur.html` | **Standby** — TRI / DSCR / cash-on-cash supposent des champs jamais saisis (`prixAchat`, `apport`, `mensualité`). Sans data model étendu : décoration creuse. À reprendre comme "outil Analyse rentabilité" si besoin. |
| `lentille-6-echeances.html` | **Absorbée** dans la Vue Gestionnaire (timeline 90 j ajoutée au layout Gestionnaire) — la lentille standalone était redondante avec le calendrier mensuel |
| `lentille-7-previsionnel.html` | **Standby** — calculs PV / SCI IS / ROI rénovation = sensibles, fausse précision si bâclé. À reprendre comme "outil Simulateur" séparé si besoin. |
| `lentille-8-patrimoine.html` | **Standby** — bilan + DPE OK si data complète, mais `valeurEstimée` et `capitalRestantDu` jamais saisis. À reprendre comme "outil Bilan & conformité" si besoin. |

## Statut

Aucune de ces lentilles n'est planifiée pour V1 (Q4 2026). Les fichiers HTML sont conservés pour :
- **Référence visuelle** : ne pas refaire le travail si l'idée revient sur le tapis
- **Audit historique** : trace de la décision et du contexte

## Comment les consulter

Les fichiers ouvrent toujours dans le navigateur, avec :
- Bandeau rouge "📦 ARCHIVÉ" en haut
- Bouton "← Retour à l'aperçu" qui ramène vers `../index.html`
- Pas de dropdown de navigation (ces vues ne sont plus dans le set actif)

## Voir aussi

- `../index.html` — Aperçu des 4 onglets actifs (Propriétaire / Gestionnaire / Complet / Custom)
- `../../DASH-PROFILES-SPEC.md` — Spec mise à jour
- `../../../subjects/DASH-PROFILES.md` — Journal de la décision
