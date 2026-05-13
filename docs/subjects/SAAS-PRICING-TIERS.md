# SAAS-PRICING-TIERS — Gating des modules par abonnement payant

**Status** : ⬜ À faire (Phase commercialisation, post V1.2)
**Prio** : P2 (stratégique, pas bloquant V1)
**Taille** : M (3-5h) — quand l'infra back-end abonnement existera
**Détecté** : 2026-05-13 (suite livraison USER-PROFILE-FILTERS Sprint 6 V1.1)
**Lié à** : USER-PROFILE-FILTERS ✅ (l'infrastructure technique) · `project_commercialization.md` · `feedback_deploy_commercialize.md` · BIZPLAN-V2 · SAAS-MULTIUSERS · PORTAIL-LOC

## Contexte
Feedback utilisateur 2026-05-13 après livraison USER-PROFILE-FILTERS :
> 💬 « là comme ça je ne vois pas l'utilité. mais bon ça peut servir demain pour limiter ou ouvrir des accès en fonction du type d'abonnement »

**L'insight** : la matrice `_isModuleEnabled` + le système d'override `DB.params.modulesEnabled` constituent la base technique parfaite pour un système de **paywall par tier d'abonnement** quand on basculera ImmoTrack en SaaS commercial.

## Schéma de gating souhaité

```
[ Profil utilisateur ]  + [ Tier d'abonnement ]  ─→  Set de modules accessibles
   (déjà livré v15.04)         (à construire)            (= filtre sidebar/UI existant)
```

| Tier        | Prix indicatif | Profils débloqués       | Modules débloqués (en plus du CORE 12) |
|---|---|---|---|
| **Free**    | 0 € / mois    | Solo uniquement          | 0 module supplémentaire (pour découverte) |
| **Solo+**   | 9 € / mois    | Solo                     | charges-regul détaillé, export, equipements |
| **SCI**     | 19 € / mois   | Solo + SCI familiale     | dashboard-lentilles, bailleurs-multi, candidats, travaux, charges-regul full |
| **Pro**     | 39 € / mois   | + Pro                    | pilotage-matriciel, export-fec, audit-trail-ui, carnet-adresse, bank-integration |
| **Mandataire** | 79 € / mois | + Mandataire           | mandat-crg-sepa, multi-bailleurs facturation, RGPD avancé |

(Prix purement indicatifs — à arbitrer avec BIZPLAN-V2.)

## Scope technique (estimé ~3-5h quand backend prêt)

### Phase 1 — Modèle DB (1h)
- Champ `DB.params.subscription` : `{ tier: 'free'|'solo+'|'sci'|'pro'|'mandataire', renewAt: ISO, status: 'active'|'trial'|'expired' }`
- Helper `_currentTier()` qui renvoie 'free' si pas d'abonnement
- Mapping `TIER_MODULES` : `{ 'free': [...], 'solo+': [...], ... }`

### Phase 2 — Extension de `_isModuleEnabled` (1h)
- Nouvelle signature : `_isModuleEnabled(moduleKey, profile, overrides, tier)`
- Précédence : `override > tier > matrice profil > CORE`
- Si module hors tier → return false **MÊME si override true** (paywall infranchissable côté UI)

### Phase 3 — UI "Upgrade" sur modules verrouillés (1.5h)
- Au lieu de masquer purement, afficher l'onglet avec icône 🔒 + label "Pro"
- Click → modale "Cette fonctionnalité est incluse dans le plan Pro. [ Voir les plans ]"
- Pattern Notion/Linear : montrer la valeur, ne pas cacher la fonctionnalité

### Phase 4 — Section Paramètres "Mon abonnement" (1h)
- Badge tier actuel + date prochaine échéance
- Comparatif tiers (qu'est-ce que je débloque en upgradant ?)
- Bouton "Changer de plan" → redirection Stripe/Paddle

### Phase 5 — Trial period gestion (30min)
- Default trial 14 jours en tier "Pro" pour les nouveaux signups
- Toast J-3 / J-1 avant fin de trial
- Auto-downgrade vers Free à expiration (modules verrouillés mais data conservée)

## Décisions à arbitrer (en attente du go SaaS)

- [ ] **Backend abonnement** : Stripe / Paddle / Lemon Squeezy / custom ?
- [ ] **Modules verrouillés** : masqués sidebar OU visibles avec 🔒 + paywall modale ? → Recommandation **paywall visible** (driver d'upgrade)
- [ ] **Free tier** : payant dès J1 OU gratuit avec limites (3 logements max) ? → Recommandation **gratuit avec limite 3 logements**
- [ ] **Override "abonnement"** : un Solo peut-il payer juste l'unitaire `export-fec` ? OU forcer le tier ? → Recommandation **tier uniquement** (simplicité commerciale)

## Différenciant marché

| Solution | Free tier | Multi-tiers | Paywall fluide |
|---|---|---|---|
| Rentila | trial 30j puis payant | 1 plan unique | ❌ |
| BailFacile | gratuit limité | 2 plans | basique |
| Qalimo V2 | trial 14j | 3 plans (Easy/Pro/Premium) | overlay générique |
| Smovin | 14j gratuits | 1 plan unique | n/a |
| **ImmoTrack après SAAS-PRICING-TIERS** | ⭐ Gratuit 3 logements | ⭐ 5 tiers granulaires | ⭐ Paywall par feature (driver upgrade) |

## Bloqueur
SAAS-MULTIUSERS doit être livré avant. Sinon on a un abonnement payant sur une app monoutilisateur localStorage — incohérent.

## Notes utilisateur
> 💬 2026-05-13 : « ça peut servir demain pour limiter ou ouvrir des accès en fonction du type d'abonnement »

## Journal
- 2026-05-13 : créé suite feedback livraison USER-PROFILE-FILTERS v15.04. Sujet stratégique parking — à attaquer quand on bascule en SaaS commercial (V2+).
