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

## ✅ Décision user 2026-05-17 : Niveau B + sync AUTOMATIQUE CONTINUE

> 💬 « b. si l'utilisateur a confirmé qu'il voulait pousser l'agenda immotrack il attend que ce soit fait tt le temps »

**Exigence clé** : le push n'est PAS un one-shot manuel. Une fois l'utilisateur a activé "Connecter Google Calendar", la sync doit être **permanente et automatique** :
- Toute **création** d'échéance (révision IRL validée, diagnostic ajouté, entretien planifié, bail créé, assurance renouvelée…) → push auto vers Google Calendar
- Toute **modification** (date reportée, montant changé) → mise à jour de l'event Google correspondant
- Toute **suppression** (échéance annulée, bail clôturé) → suppression de l'event Google
- **Zéro action manuelle** après l'activation initiale

→ A (ICS export) reste utile comme **fallback/complément** (export ponctuel hors connexion Google), mais l'attendu principal = **B en sync auto continue**.

### Mécanisme de sync automatique (architecture)

```
Activation opt-in (1 fois) → consentement OAuth scope calendar.events
    ↓
Hook sur TOUTES les mutations d'échéances :
  - validation révision IRL  → upsert event
  - ajout/maj diagnostic     → upsert event
  - planif entretien EQUIP   → upsert event
  - création/clôture bail    → upsert/delete event
  - renouvellement assurance → upsert event
    ↓
File d'attente _gcalQueue[] (persistée localStorage) :
  - push immédiat si token valide + online
  - si offline / token expiré → mis en queue, flush au retour
    ↓
Mapping app↔Google : event.extendedProperties.private.immotrackId = <échéanceId>
  → permet de retrouver/mettre à jour/supprimer le bon event Google
```

**Points techniques critiques** :
- **Token OAuth** : access_token expire (~1h). Gérer le refresh silencieux (GIS) ou re-demander si refresh impossible. Si la sync échoue par token expiré → re-prompt discret + flush de la queue après reconnexion.
- **Idempotence** : un re-push ne doit pas créer de doublon (clé `immotrackId` dans extendedProperties → upsert, pas insert systématique).
- **Offline-first** : la queue persiste les ops en attente, flush au retour de connexion (cohérent avec l'architecture Drive existante).
- **Désactivation** : toggle off → arrêt des hooks. Choix : conserver ou supprimer les events Google déjà poussés (à demander).

## Scope (proposé)

### Phase 1 — Export ICS (Niveau A, ~1h) ← quick win recommandé
- Helper `_agendaToICS(events)` : génère un fichier `.ics` (RFC 5545) depuis les échéances app
- Bouton "📅 Exporter l'agenda (.ics)" dans l'onglet Agenda
- Compatible Google Calendar / Apple Calendar / Outlook (import manuel)
- VEVENT par échéance : titre + date + description + rappel (VALARM j-7)
- Module pur testable `js/core/agenda-ics.js` + tests Vitest

### Phase 2 — Push one-way OAuth + SYNC AUTO CONTINUE (Niveau B, ~4-5h) ← RETENU
- Étendre le scope OAuth Google : ajouter `calendar.events`
- Toggle opt-in dans Paramètres : "Connecter Google Calendar" (activation 1 fois)
- Création d'un calendrier dédié "ImmoTrack" (ou choix d'un calendrier existant)
- **Hooks sur toutes les mutations d'échéances** (IRL/diagnostics/entretiens/baux/assurances) → upsert/delete event auto
- **File d'attente `_gcalQueue[]` persistée** : push immédiat si online+token OK, sinon flush au retour
- Mapping `extendedProperties.private.immotrackId` pour idempotence (upsert, pas doublon)
- Refresh token silencieux (GIS) + re-prompt si expiré + flush queue après reconnexion
- **Sync permanente après activation = zéro action manuelle** (exigence user 2026-05-17)

### Phase 3 — Tests + RGPD (~1h)
- Tests `_agendaToICS` (format VEVENT valide, échappement, VALARM)
- Mention RGPD : "vos échéances sont envoyées à Google Calendar"
- Révocation propre : déconnexion → arrêt sync (events Google conservés ou supprimés selon choix)

## Décisions arbitrées / à arbitrer

- [x] **D1** : Niveau **B (push OAuth) en sync auto continue** retenu (user 2026-05-17). A (ICS) = complément fallback.
- [x] **D2** : scope `calendar.events` (events only, moins intrusif que `calendar` complet).
- [ ] **D3** : calendrier dédié "ImmoTrack" auto-créé, ou laisser l'user choisir un calendrier existant ?
  - → Reco : calendrier dédié "ImmoTrack" auto-créé (isolation propre + suppression facile à la désactivation)
- [ ] **D4** : quelles échéances pousser ? toutes (IRL, diagnostics, entretiens, fins de bail, assurances) ou sélection par l'user ?
  - → Reco : toutes par défaut + toggles fins par catégorie en option
- [ ] **D5** : à la désactivation du toggle → conserver ou supprimer les events Google déjà poussés ?

## Différenciant marché

| Solution | Sync calendrier |
|---|---|
| Rentila | ❌ |
| BailFacile | ❌ |
| Qalimo V2 | ❌ (agenda interne seulement) |
| **ImmoTrack avec AGENDA-GOOGLE-SYNC** | ✅ ICS export (universel) + push Google (opt-in) |

## Notes utilisateur

> 💬 2026-05-17 : « possible de connecter (en option demander à l'utilisateur) le calendrier de l'app à celui de google ? »
> 💬 2026-05-17 : « b. si l'utilisateur a confirmé qu'il voulait pousser l'agenda immotrack il attend que ce soit fait tt le temps »

## Journal

- 2026-05-17 : créé · sync agenda app ↔ Google Calendar · 3 niveaux (A ICS export universel / B push one-way OAuth / C bidirectionnel V2) · réutilise OAuth Google GIS déjà en place pour Drive · point d'attention : ajout scope = re-consentement
- 2026-05-17 : **décision user — Niveau B + sync AUTO CONTINUE**. Une fois activé, push permanent automatique (hooks sur toutes les mutations d'échéances + file d'attente persistée + idempotence via extendedProperties.immotrackId + refresh token + flush offline). Zéro action manuelle après activation. A (ICS) = complément fallback. Effort revu ~4-5h. Décisions D1/D2 tranchées, D3/D4/D5 à confirmer.
