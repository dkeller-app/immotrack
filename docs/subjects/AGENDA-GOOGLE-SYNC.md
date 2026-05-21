# AGENDA-GOOGLE-SYNC — Connexion optionnelle de l'agenda app à Google Calendar

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M (~4-6h)
**Détecté** : 2026-05-17 (user : « possible de connecter (en option demander à l'utilisateur) le calendrier de l'app à celui de google ? »)
**Lié à** : onglet Agenda (existant) · LOG-FICHE-CONFORMITE-AGENDA · OAuth Google GIS (déjà en place pour Drive) · EQUIP-CONTROLES-PERIODIQUES (échéances entretien) · IRL/diagnostics (échéances)

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs qui vivent dans Google Agenda (rappels échéances IRL, diagnostics, entretiens, fins de bail dans leur calendrier habituel)
2. **Règles** : opt-in explicite (pas imposé) + RGPD (consentement scope calendar) + réutilisation OAuth existant
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 : « connecter (en option) le calendrier de l'app à celui de google ? »
   - 💻 Code existant : OAuth Google GIS **déjà en place** (pour Drive) → extension de scope possible · onglet Agenda existant avec échéances
   - 📋 Backlog : l'agenda app génère déjà des échéances (IRL, diagnostics, entretiens, baux) → les pousser dans Google Calendar = valeur directe
4. **5 vues 360°** : UX (rappels là où l'user regarde) + technique (réutilise OAuth) + cycle de vie (toutes les échéances locatives)

## Contexte

L'app a un onglet **Agenda** qui agrège des échéances (révisions IRL, diagnostics à renouveler, entretiens périodiques EQUIP, fins de bail, renouvellements assurance…). Aujourd'hui ces échéances vivent **uniquement dans l'app**. L'utilisateur veut, **en option**, les retrouver dans son **Google Calendar** habituel.

## Approche technique

L'app utilise déjà **OAuth Google GIS** pour Drive (scope `drive.file`). Pour le calendrier, il faut **ajouter le scope** `https://www.googleapis.com/auth/calendar.events` (ou `calendar` complet).

⚠️ **Point d'attention** : ajouter un scope = **re-consentement OAuth** de l'utilisateur (nouvel écran de permission Google) + potentiellement re-vérification Google si l'app est publiée. Le scope `calendar.events` (création/modif d'événements seulement) est moins intrusif que `calendar` complet.

### 3 niveaux d'intégration possibles

| Niveau | Description | Effort |
|---|---|---|
| **A — Export ICS (sans OAuth)** | Bouton "Exporter l'agenda (.ics)" → l'user importe manuellement dans Google/Apple/Outlook. **Zéro OAuth, zéro scope, marche partout.** | XS (~1h) |
| **B — Push one-way (OAuth)** | App → Google Calendar : crée/met à jour les événements d'échéance dans un calendrier dédié "ImmoTrack". Pas de retour. | M (~4h) |
| **C — Sync bidirectionnelle** | App ↔ Google : les events créés dans Google reviennent dans l'app. Complexe (conflits, dédup). | L (V2) |

→ **Reco** : commencer par **A (ICS export)** = quick win universel sans OAuth, puis **B (push one-way)** si demande. C (bidirectionnel) = V2.

## Scope (proposé)

### Phase 1 — Export ICS (Niveau A, ~1h) ← quick win recommandé
- Helper `_agendaToICS(events)` : génère un fichier `.ics` (RFC 5545) depuis les échéances app
- Bouton "📅 Exporter l'agenda (.ics)" dans l'onglet Agenda
- Compatible Google Calendar / Apple Calendar / Outlook (import manuel)
- VEVENT par échéance : titre + date + description + rappel (VALARM j-7)
- Module pur testable `js/core/agenda-ics.js` + tests Vitest

### Phase 2 — Push one-way OAuth (Niveau B, ~3h) — si demandé
- Étendre le scope OAuth Google : ajouter `calendar.events`
- Toggle opt-in dans Paramètres : "Connecter Google Calendar"
- Création d'un calendrier dédié "ImmoTrack" (ou choix d'un calendrier existant)
- Sync des échéances → events Google (avec `extendedProperties` pour retrouver le lien app↔event)
- Mise à jour si une échéance change (ex : révision IRL reportée)
- Suppression si l'échéance disparaît

### Phase 3 — Tests + RGPD (~1h)
- Tests `_agendaToICS` (format VEVENT valide, échappement, VALARM)
- Mention RGPD : "vos échéances sont envoyées à Google Calendar"
- Révocation propre : déconnexion → arrêt sync (events Google conservés ou supprimés selon choix)

## Décisions à arbitrer

- [ ] **D1** : commencer par ICS export (A) seul, ou directement push OAuth (B) ?
  - → Reco : **A d'abord** (universel, zéro OAuth, marche aussi Apple/Outlook), B ensuite si besoin
- [ ] **D2** : scope `calendar.events` (events only, moins intrusif) ou `calendar` complet ?
  - → Reco : `calendar.events`
- [ ] **D3** : calendrier dédié "ImmoTrack" auto-créé, ou laisser l'user choisir un calendrier existant ?
- [ ] **D4** : quelles échéances pousser ? (IRL, diagnostics, entretiens, fins de bail, assurances) — toutes ou sélection par l'user ?

## Différenciant marché

| Solution | Sync calendrier |
|---|---|
| Rentila | ❌ |
| BailFacile | ❌ |
| Qalimo V2 | ❌ (agenda interne seulement) |
| **ImmoTrack avec AGENDA-GOOGLE-SYNC** | ✅ ICS export (universel) + push Google (opt-in) |

## Notes utilisateur

> 💬 2026-05-17 : « possible de connecter (en option demander à l'utilisateur) le calendrier de l'app à celui de google ? »

## Journal

- 2026-05-17 : créé · sync agenda app ↔ Google Calendar · 3 niveaux (A ICS export universel / B push one-way OAuth / C bidirectionnel V2) · reco A d'abord (zéro OAuth, marche Apple/Outlook aussi) puis B opt-in · réutilise OAuth Google GIS déjà en place pour Drive · point d'attention : ajout scope = re-consentement
