# PARAM-BAILLEUR-AUTOMATISATIONS — Panneau centralisé automatisations par bailleur

**Status** : ⬜ À faire — RE-PRIORISÉ P2 2026-05-13 · **Prio** : P2 · **Taille** : M-L (5-7h)

## ⚠️ Verdict honnête 2026-05-13
Filtre 4 critères : 2/4 (centralise des features qui existent déjà, UX pure). Vraie valeur émerge à partir de 5+ baux à gérer en parallèle. Re-prio P2 — pas P1.
**Détecté** : 2026-05-13 (capture Qalimo V2 — différenciant UX majeur)
**Lié à** : EMAIL-AUTO (livré v14.97) · QUIT-EMAIL · AVIS-ECHEANCE · RAPPEL-IMPAYE · IRL-VALIDATION (livré) · GESTION-CRG · EQUIP-CONTROLES-PERIODIQUES

## Contexte
Demande utilisateur 2026-05-13 (capture Qalimo V2 onglet Automatisation dans fiche bailleur).

**Pattern UX très puissant** : centraliser TOUTES les automatisations d'un bailleur dans 1 panneau avec toggles on/off simples. ImmoTrack a 60% des fonctionnalités sous-jacentes mais **dispersées** dans l'app — manque le panneau unifié.

## Référence Qalimo V2 — Fiche Bailleur > Automatisation

9 toggles organisés en 2 colonnes :

**Colonne 1 (5 toggles)** :
1. Envoyer automatiquement la quittance au locataire
2. M'avertir pour la révision du loyer à la date anniversaire du bail
3. Demander automatiquement l'attestation d'entretien du chauffage
4. Envoyer automatiquement un email de relance en cas d'impayé
5. Compte rendu de gestion

**Colonne 2 (4 toggles)** :
6. Générer automatiquement les avis d'échéance
7. Demander automatiquement au locataire l'assurance multirisque
8. M'avertir de la date butoir pour résilier le bail
9. M'avertir en cas de virement

Note Qalimo : « Créez ici les templates d'automatisation. Les nouveaux locataires seront créés avec les automatisations sélectionnées activées par défaut. »

→ Les automatisations sont **paramétrées au niveau bailleur** (= s'appliquent à tous les baux/locataires de ce bailleur), avec possibilité d'override par locataire (cf Qalimo workflow).

## Scope

### Phase 1 — Modèle de données (~30min)
- Nouveau champ `entity.automatisations` : objet avec 9 clés booléennes (+ extensible)
```js
entity.automatisations = {
  envoiQuittanceAuto: false,
  avisEcheanceAuto: false,
  alerteRevisionIRL: true,  // recommandé par défaut
  demandeMRHAuto: false,
  demandeAttestEntretienChauf: false,
  alerteFinBail: true,  // recommandé par défaut
  relanceImpayeAuto: false,
  alerteVirement: false,
  crgMensuelAuto: false
}
```
- Default à la création d'une entité : alerteRevisionIRL + alerteFinBail à true, reste false (opt-in)
- Override possible par bail/locataire : `bail.automatisations` (sinon hérité de entity)

### Phase 2 — UI panneau Automatisation (~2h)
Dans ENT-FICHE-360, ajouter un sous-onglet "Automatisation" :
- Layout 2 colonnes responsive (1 col mobile)
- 9 cartes avec toggle on/off + label + accordéon pour paramètres avancés
- Chaque toggle :
  - Label clair
  - Toggle switch (réutilise pattern existant)
  - Bouton accordéon "v" qui révèle des paramètres (ex : RAPPEL-IMPAYE → "Délai 1er rappel : 5j / 2e rappel : 15j / 3e rappel : 30j")
- Bouton "Appliquer à tous les baux de ce bailleur" (override en cascade) avec modale confirmation
- Bouton "Revenir aux paramètres par défaut" (reset)

### Phase 3 — Backend : déclencheurs automatisations (~2-3h)
Pour chaque toggle activé, implémenter le déclencheur :

1. **envoiQuittanceAuto** : à la génération mensuelle de la quittance → appeler `_emailCompose('quittance')` + envoi via modale ou propose si V1 (cf EMAIL-AUTO)
2. **avisEcheanceAuto** : cron logique au login (1×/jour) → si bail avec date paiement < 5j → générer avis échéance
3. **alerteRevisionIRL** : déjà géré par IRL-VALIDATION popup mois anniversaire (livré v13.33)
4. **demandeMRHAuto** : cron logique → si MRH expire < 30j → email locataire "Merci de fournir attestation MRH renouvelée"
5. **demandeAttestEntretienChauf** : cron logique → si dernier entretien > 11 mois → email locataire "Merci de fournir attestation entretien chaudière"
6. **alerteFinBail** : cron logique → si fin bail < 90j → toast/alerte dashboard
7. **relanceImpayeAuto** : cron logique → si quittance impayée > 5j/15j/30j → email de relance (cf RAPPEL-IMPAYE)
8. **alerteVirement** : si nouveau mouvement entrant détecté lors d'un import bancaire (V1.1+) → toast/notification
9. **crgMensuelAuto** : à la fin de chaque mois → générer CRG PDF et envoyer au bailleur si activé (cf GESTION-CRG V1.1)

**Implémentation V1** :
- Déclencheurs synchrones au login (1× par session) : checkAlertes() qui scanne tous les toggles activés
- Cron logique : `Date.now() - localStorage.lastAutomationsCheck > 86400000` → relancer
- V2 SaaS : vrai cron backend (Cloudflare Worker scheduled)

### Phase 4 — Historique exécutions (~1h)
- `DB.automationsHistory[]` : `{id, type, entityId, bailRef?, triggeredAt, status: 'success'|'pending'|'failed', details}`
- Affichage dans onglet "Historique automatisations" (sous panneau Automatisation)
- Permet à l'utilisateur de voir ce qui a été déclenché récemment

### Phase 5 — Tests Vitest (~1h)
- `__tests__/helpers/automatisations.test.js` :
  - `_shouldTriggerAutomation(type, entity, bail, dateRef)` cas nominal + edge
  - `_calculerProchaineExecution(type, lastTrigger)` pour les périodiques
- Cible 20+ tests

### Phase 6 — Mobile + responsive (~30min)
- 2 colonnes desktop → 1 colonne mobile (stack vertical)
- Toggles touch ≥ 44px
- Accordéons paramètres avancés en bottom-sheet sur mobile

## Décisions à prendre
- [ ] **Position du panneau** : sous-onglet "Automatisation" dans ENT-FICHE-360 (parité Qalimo) OU sous-section dans Paramètres globaux ?
  - Recommandation : **sous-onglet dédié dans ENT-FICHE-360** (cohérence Qalimo + localité par bailleur)
- [ ] **Hérédité bail** : par défaut hérite du bailleur, override possible par bail ?
  - Recommandation : oui, hérédité par défaut + champ `bail.automatisationsOverride` si différent
- [ ] **Cron V1** : synchrone au login uniquement OU déclencheur à chaque action UI ?
  - Recommandation : **login + visibilitychange** (cohérent avec gestion token Drive)
- [ ] **Application rétroactive** : activer un toggle s'applique-t-il aux baux existants ou seulement aux nouveaux ?
  - Recommandation : **aux existants** (sinon UX déroutante), bouton "Réappliquer à tous les baux" dispo

## Différenciant marché
| Solution | Automatisations centralisées |
|---|---|
| Rentila | dispersé dans réglages |
| BailFacile | dispersé |
| Qalimo V2 | ⭐ panneau dédié 9 toggles |
| Smovin | partial |
| ICS / Crypto (pro) | configurable mais complexe |
| **ImmoTrack après PARAM-BAILLEUR-AUTOMATISATIONS** | parité Qalimo + historique exécutions |

## Notes utilisateur
> 💬 2026-05-13 : capture Qalimo V2 fiche bailleur sous-onglet Automatisation avec 9 toggles

## Journal
- 2026-05-13 : créé · centralisation automatisations par bailleur = différenciant UX majeur Qalimo V2, P1 pour parité commerciale
