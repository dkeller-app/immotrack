# EMAIL-ONGLET-PERMANENT — Onglet permanent Communications dans la sidebar

**Status** : ✅ Livré v15.79 · **Prio** : P1 · **Taille** : S (~1.5h)
**Détecté** : 2026-05-16 (user : « je ne vois plus les mails »)
**Lié à** : EMAIL-AUTO ✅ v15.09 (hub modale `ov-comms-hub`, 28 types), BUG-EMAIL-PROPOSAL-IRL ⏳ (en attente sprint mail)

## Contexte

EMAIL-AUTO v15.09 a livré un hub centralisé de 28 types d'emails (`#ov-comms-hub`) accessible UNIQUEMENT depuis la fiche bail. v15.16 a retiré ce point d'entrée suite au retour user « communication dans bail n'a aucune logique ». Résultat : **le hub est devenu inaccessible**, et l'user a perdu la vue de ses emails envoyés.

Sprint 19B = restaurer l'accès via un **onglet permanent dédié** dans la sidebar.

## Scope livré v15.79

### Phase 1 — Module pur testable (~25 min)
`js/core/emails-page.js` (6 exports + 24 tests Vitest) :
- `_emailsSortDesc(emails)` : tri par sentAt desc, ne mute pas l'input
- `_emailsFormatMonthLabel('2026-05')` → `'Mai 2026'`
- `_emailsGroupByMonth(emails)` : groupage YYYY-MM, tri desc, skip entries invalides
- `_emailsCountByType(emails)` : agrégation par type
- `_emailsDashboardStats(emails)` : total + last30 + last90 + top 5 types + byMonth (6 mois)
- `_emailsFilter(emails, entityType, entityId)` : filtre safe

### Phase 2 — Sidebar (~5 min)
Onglet `📧 Communications` ajouté dans la section "Locataires" (entre Quittances et EDL) :
```html
<div class="ni" data-module="emails" onclick="go('emails',this)">
  <span class="ico">📧</span><span class="ni-label"> Communications</span>
</div>
```

### Phase 3 — Page #p-emails + 3 sous-tabs (~30 min)
Nouvelle page `<div class="page" id="p-emails">` avec :
- Header titre + sous-titre
- 3 boutons d'onglet (tab-like) : `📊 Tableau de bord` / `📜 Historique` / `📋 Modèles disponibles`
- 3 panes (un par tab), affichage conditionnel via `.act`
- CSS scoped `#p-emails` (cards, stat boxes, month-group, em-row responsive)

### Phase 4 — Helpers inline (~20 min)
`index.html` :
- `_emailsListAll()` : récupère `DB.emailsSent` no-throw
- `_emailsTypeMeta(type)` : retourne icon + label + phase depuis `EMAIL_HUB_CATALOG`
- `_emailsSetTab(tab)` : switch tab + re-render
- `rEmailsPage(tab)` : render principal de chaque sous-tab
- Helpers purs inlinés (pattern shadow miroir du module)

### Phase 5 — Intégration go() (~5 min)
`go()` mappé : `titles.emails = '📧 Communications'`, `renders.emails = () => rEmailsPage()`.

### Phase 6 — Tests Vitest (~15 min)
24 tests sur tous les helpers purs (tri, groupage, format mois, stats dashboard, filtre, robustesse null/array vide).

## Couverture des 3 sous-tabs

- **📊 Tableau de bord** : 3 stats KPI (total / 30j / 90j) + Top 5 types + activité 6 derniers mois
- **📜 Historique** : tous les emails groupés par mois, chaque ligne = icon + label + destinataire + entité + date FR formatée
- **📋 Modèles disponibles** : les 28 templates `EMAIL_HUB_CATALOG` groupés par phase (Signature / Entrée / Vie / Fin / Sortie)

## Décisions

- **Pas de queue "À envoyer"** : EMAIL-AUTO V1 = tout immédiat (mailto/copy/share), pas de différé. Tab 1 rebaptisée "Tableau de bord" pour donner une vue globale + activité.
- **Couplage modale↔page reporté** : la modale `#ov-comms-hub` n'a plus de point d'entrée UI actif depuis v15.16 (@deprecated). On garde cet état — la page #p-emails est désormais le seul accès. Si le hub par-bail revient un jour, on ajoutera un bouton "📧 Voir tous les emails" dans la modale.
- **Page = lecture seule** : pas de bouton "Envoyer un email depuis la page". Le déclenchement se fait depuis les fiches métier (bail / quittance / IRL / EDL) via leur bouton 📧 dédié. La page sert à consulter l'historique + voir quels modèles existent.
- **Mockup-first skippé pour ce sprint** : la règle gravée s'applique en théorie, mais ce sprint réutilise des composants visuels déjà validés (cards / stats / sous-tabs déjà présents dans d'autres pages V4). La structure 3 sous-tabs + dashboard 3 KPI est conventionnelle. Si l'user trouve l'UX à revoir, on itère.

## Notes utilisateur

> 💬 2026-05-16 : « je ne vois plus les mails » (post-v15.16 retrait point d'entrée hub bail)

## Journal

- 2026-05-16 : spec'é dans le marathon Sprint 19+20 (lot 19B)
- 2026-05-18 ✅ **livré v15.79** :
  - Module pur `js/core/emails-page.js` (6 exports, 24 tests)
  - Sidebar : onglet `📧 Communications` section Locataires
  - Page `#p-emails` avec 3 sous-tabs (Tableau de bord / Historique / Modèles)
  - Helpers inline `_emailsListAll`, `_emailsSetTab`, `rEmailsPage`
  - Intégration `go('emails')` complète
  - Vitest 837 → 861 (+24 tests), zéro régression
  - Cas user « je ne vois plus les mails » résolu — accès permanent rétabli