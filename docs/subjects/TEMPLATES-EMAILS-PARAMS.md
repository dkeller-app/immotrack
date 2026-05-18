# TEMPLATES-EMAILS-PARAMS — Éditeur de templates email dans Paramètres

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M-L (~8-12h)
**Détecté** : 2026-05-18 (user : « comment on fait pour modifier le template du mail ? tu ajoutes ça qq part dans paramètres ? »)
**Lié à** : EMAIL-MODAL-UX-REFONTE, DOC-CIVILITE, EMAIL-AUTO, V3-REFONTE-PARAMS-AUDIT

## Contexte

Les 28 templates d'email sont actuellement **codés en dur** dans [js/core/email-compose.js](js/core/email-compose.js) (~770 lignes). Pour les modifier : éditer le fichier JS + commit + déploiement.

User demande : un éditeur dans **Paramètres > Templates emails** pour modifier sujet + corps + PJ + note légale de chaque type, avec persistance en DB (override sur les défauts JS) + reset possible.

Crucial pour V1 commercial : chaque bailleur SaaS doit pouvoir personnaliser ses templates (ton, formules, mentions légales spécifiques, signature).

## Vision V1

Section **Paramètres > Communications > Templates emails** :
- Table des 28 types avec preview sujet + statut (`défaut` / `personnalisé`)
- Edition d'un template : modale full-screen avec
  - Champ « Sujet » (avec preview interpolé en live)
  - Champ « Corps » (textarea avec liste de variables dispos cliquables)
  - Champs « PJ » (liste de noms PDF avec variables)
  - Champ « Note légale »
- Bouton « Réinitialiser au défaut »
- Bouton « Prévisualiser avec un bail-exemple » (rendu interpolé)
- Multi-bailleur SaaS V2 : par entité

## Scope (4 phases)

### Phase 0 — Mockups (~1h)
- [ ] `mockups/templates-emails/`
  - Vue liste PC + Tablette + Mobile
  - Vue édition PC + Tablette + Mobile
  - Vue preview interpolé
- [ ] Validation user

### Phase 1 — Persistance DB (~1h)
- [ ] Schéma : `DB.emailTemplatesCustom[type] = { subject, body, attachments, legalNote }`
- [ ] Fonction `_emailComposeWithOverride(type, ctx)` qui lit DB.emailTemplatesCustom[type] || TEMPLATES[type] par défaut
- [ ] Migration : champ vide = utilise défaut JS
- [ ] Refactor `_emailCompose` pour intégrer l'override

### Phase 2 — UI Paramètres > Templates (~4-6h)
- [ ] Section dans page Paramètres
- [ ] Table 28 types (filtres : tous / personnalisés / défauts)
- [ ] Modale d'édition avec :
  - Sidebar : liste variables dispos (cliquable → insère `{{xxx}}` au curseur)
  - Aperçu live (interpolé avec bail-exemple)
  - Boutons : Enregistrer / Réinitialiser / Annuler
- [ ] Multi-bailleur (V2) : sélecteur entité

### Phase 3 — Tests + doc (~1h)
- [ ] Tests Vitest persistance + override + reset
- [ ] Documentation utilisateur dans la page (tooltip ? aide ?)

### Phase 4 — Migration V2 SaaS (~2h)
- [ ] Chaque entité a ses templates (vs templates globaux)
- [ ] Import / export JSON pour migration
- [ ] Sauvegarde Drive

## Décisions à prendre

- **D1** : 28 types affichés ensemble ou regroupés par catégorie (Signature / Entrée / Vie bail / Fin / Sortie / Charges) ?
- **D2** : Persistance Solo (`DB.emailTemplatesCustom`) puis Gestionnaire (`entité.emailTemplates`) — vue unique avec sélecteur OU vue Solo simple en V1 et migration V2 ?
- **D3** : Mode WYSIWYG (HTML formatté) ou texte brut uniquement ? (V1 : texte brut suffit)
- **D4** : Variables dispos : liste statique exhaustive OU dynamique (introspection contexte runtime) ?
- **D5** : Reset = restaurer défaut JS instantanément OU avec confirmation ?

## Variables à documenter (extrait)

Communes à tous types :
- `{{locataire.nom}}` / `{{locataire.civilite}}` / `{{locataire.civNom}}` (cf DOC-CIVILITE)
- `{{locataire.email}}` / `{{locataire.tel}}`
- `{{bail.adrBien}}` / `{{bail.debut}}` / `{{bail.hc}}` / `{{bail.ch}}` / `{{bail.dg}}` / `{{bail.jpay}}`
- `{{logement.ref}}` / `{{logement.adresse}}` / `{{logement.surface}}`
- `{{entite.gerant}}` / `{{entite.nom}}` / `{{entite.siege}}` / `{{entite.iban}}` / `{{entite.bic}}`
- `{{garant.nom}}` (si applicable)

Spécifiques par type : `{{quittance.mois}}`, `{{periode}}`, `{{montant}}`, `{{ancienHC}}`, `{{nouveauHC}}`, `{{dateEDL}}`, etc.

## Notes utilisateur

> 💬 2026-05-18 : « comment on fait pour modifier le template du mail ? tu ajoutes ça qq part dans paramètres ? par exemple, là il faut prendre aussi (Monsieur / Madame du bail) »

## Journal

- 2026-05-18 : créé · P2 · 4 phases · attente arbitrage D1-D5
