# PROFILS-MATRICE-V2 — Refonte profils utilisateurs (5 profils proposés)

> **Statut** : 🔄 Proposition à valider · session 2026-05-15
> **Prio** : P1 (drive l'UX dashboard + sidebar + pricing Phase D)
> **Lié à** : DASH-PROFILES (livré v15.13) · STRIPE-PAYWALL-V1 · NAV-AUDIT-PROFILS · USER-PROFILE-FILTERS (v15.04)

---

## Constat user 2026-05-15

> *« je veux un profil gestionnaire qui est vraiment accès sur la gestion des biens (IRL, EDL, entretien...) et pas le financier. en gros : un profil comme le mien qui a pour but d'avoir les infos financière et de gestion, un profil juste gestion, un profil solo plus restreint (dans une logique de pricing) et un profil agence immo (idem au mien ?) et potentiellement un profil comptable »*

Les 3 profils actuels (Solo / Gestionnaire / Pro) sont **trop larges et mal différenciés**. Le profil Gestionnaire actuel inclut du financier qui ne correspond pas à la réalité métier d'un gestionnaire Hoguet sous mandat (le bailleur garde son financier).

---

## Proposition : 5 profils

### 1. 🪴 Solo Découverte (tier Free)

**Cible** : bailleur particulier qui découvre l'app, 1 logement (souvent un investissement récent).
**Usage** : prise en main, sauvegarder son bail, gérer son 1er locataire.
**Pricing** : **0 €** (freemium · porte d'entrée).
**Limite** : 1 logement actif. Le 2e logement déclenche un blocage doux + upsell.

**Dashboard widgets visibles** :
- Bandeau contextuel (compact)
- Hero simplifié (à recevoir · encaissé · 1 sparkline)
- À traiter (max 3 items)

**Sidebar (5 entrées max)** :
- 📊 Tableau de bord
- 🏠 Mon bien (singulier, pas "Mes biens")
- 💶 Loyers
- 📋 Mon locataire
- ⚙️ Paramètres

**Caché** : Pilotage · Assurances · IRL · Régul · Agenda séparé · Quittances séparées · multi-entités.

---

### 2. 🏠 Solo Premium (tier Solo — profil Didier)

**Cible** : bailleur particulier 2-10 lots, gère seul son patrimoine, suit ses chiffres au quotidien.
**Usage** : pilotage **financier + gestion + fiscal complet**. Préparation déclaration 2044. Vision cash-flow annuelle.
**Pricing** : **14,90 €/mois** (ou 149 €/an).

**Dashboard widgets visibles (preset Propriétaire actuel)** :
- ✅ Bandeau contextuel
- ✅ Cash-flow Hero (à recevoir · encaissé · solde net)
- ✅ À traiter
- ✅ **Finance** : Revenus vs Charges · Occupation · Rendement brut · Charges catégories · Dépôts garantie
- ✅ Progression annuelle
- ✅ Solde provisions par immeuble

**Sidebar (8 entrées)** :
- 📊 Tableau de bord
- 🏠 Mes biens
- 💶 Loyers & Mouvements
- 🧾 Quittances
- 📋 Baux & Locataires
- ⚙️ + Plus (Agenda, Révision IRL, Régul, Assurances, Paramètres)

---

### 3. 🛠 Gestionnaire (tier Gestion-only)

**Cible** : pro Hoguet (carte pro de gestion immobilière) **sous mandat** d'un ou plusieurs bailleurs particuliers. Le bailleur reste propriétaire de ses comptes — le gestionnaire ne voit **PAS le financier perso** du bailleur, juste les indicateurs métier de gestion.
**Usage** : suivi opérationnel des biens (échéances, IRL, EDL, entretien, sinistres, vacance), génération masse quittances/CRG, relances impayés.
**Pricing** : **24,90 €/user/mois** (logique métier ≠ financier).

**Dashboard widgets visibles (zéro financier perso)** :
- ✅ Bandeau contextuel (taux occupation, vacance, alertes critiques)
- ✅ **À traiter** (priorité absolue — c'est le quotidien)
- ✅ Pilotage matriciel (vue cœur métier)
- ✅ Agenda 30 prochains jours
- ✅ Échéances baux + révisions IRL
- ✅ Logements vacants + manque à gagner
- ✅ MRH manquantes / PNO échéances
- ✅ Régularisations dues
- ✅ Statut loyers (impayés gérés, pas chiffres perso bailleur)

**Caché** : Cash-flow personnel · Rendement brut · Solde provisions · Progression annuelle · Donut charges.

**Sidebar (10 entrées)** :
- 📊 Tableau de bord
- 🎛 Pilotage matriciel
- 🏠 Patrimoine (biens des bailleurs sous mandat)
- 📋 Baux & Locataires
- 🧾 Quittances
- 📅 Agenda
- 🔧 Équipements & contrôles
- 📈 Révision IRL
- 🛡 Assurances
- ⚙️ + Plus (Régul, Paramètres mandats)

**Différenciant clé vs Solo Premium** : **AUCUN widget financier** (cash-flow, rendement, solde provisions). Le gestionnaire gère un parc, pas un patrimoine.

---

### 4. 🏢 Agence immobilière (tier Pro)

**Cible** : agence/cabinet 50+ lots multi-bailleurs clients. Plusieurs gestionnaires salariés dans la même structure.
**Usage** : ≈ Gestionnaire **+ multi-portfolio** (basculer entre 5-20 bailleurs clients) **+ commissions** (frais Hoguet 6-8% sur loyers).
**Pricing** : **89 €/user/mois** (sur devis si > 5 users).

**Dashboard widgets visibles** :
- ✅ Tout le Gestionnaire (gestion biens, IRL, EDL, agenda, vacance)
- ✅ **Vue exécutive multi-portfolio** : revenus consolidés agence (commissions perçues), nombre de bailleurs actifs, taux de recouvrement global
- ✅ **Switcher de portfolio** en haut (bailleur A / bailleur B / agrégé)
- ✅ Top 10 bailleurs par CA (commissions)

**Sidebar (11 entrées)** :
- 📊 Dashboard (avec switcher portfolio)
- 👥 Mes bailleurs clients (nouveau)
- 🎛 Pilotage matriciel
- 🏠 Patrimoine
- 📋 Baux
- 🧾 Quittances + CRG (compte rendu gérance)
- 💶 Commissions Hoguet
- 📅 Agenda
- 🔧 Équipements
- 📈 IRL + Assurances
- ⚙️ Paramètres

**Différenciant clé vs Gestionnaire** : **multi-portfolio simulé en V1** (un bailleur = un compte ImmoTrack séparé synchronisé via Drive partagés différents). Vrai multi-tenant en V2.

**Différenciant clé vs Solo Premium** : voit **les commissions HC à toucher de l'agence**, pas le cash-flow du bailleur. Vue B2B fournisseur de service.

---

### 5. 📊 Comptable / Expert-comptable (tier Lecture+Export)

**Cible** : expert-comptable habilité (art. 100-B CGI) qui prépare la **comptabilité du bailleur** (2044, bilan, IS pour SCI à l'IS, FEC pour contrôle fiscal).
**Usage** : **consultation lecture seule** + **exports** (FEC, 2044, bilan annuel, journal, grand livre, balance). Pas de modification des données.
**Pricing** : **19,90 €/mois** (le bailleur invite son comptable · 1 invitation incluse dans Solo Premium · ou comptable s'abonne lui-même pour gérer 5-20 bailleurs clients à 4,90 €/bailleur).

**Dashboard widgets visibles** :
- ✅ Bandeau contextuel (recettes/dépenses YTD, statut conformité 2044)
- ✅ **Recettes annuelles ventilées** (ligne 211/213/229/230 du 2044)
- ✅ **Charges déductibles par catégorie** (ligne 222-230 du 2044)
- ✅ **Cash-flow YTD + projection fin d'année**
- ✅ Liste exports rapides (FEC · 2044 · Bilan · Journal)
- ✅ Alertes conformité (mouvements sans catégorie 2044, justificatifs manquants)

**Caché** : Tout l'opérationnel (Agenda, EDL, IRL, sinistres, équipements). Les actions UI sont **désactivées** (lecture seule).

**Sidebar (6 entrées)** :
- 📊 Dashboard comptable
- 📋 Mouvements (lecture)
- 🧾 Quittances (lecture)
- 📜 Baux (lecture pour ventilation TVA/régime fiscal)
- 📤 Exports (FEC · 2044 · Bilan · Journal · Grand livre)
- ⚙️ Paramètres comptes (catégories 2044, plan de comptes)

**Différenciant clé** : permissions **read-only** + exports puissants. Justifie la confiance bailleur-comptable.

---

## Matrice synthétique

| Profil | Cible principale | Volume lots | Focus | Pricing | Sidebar entrées |
|---|---|---|---|---|---|
| 🪴 **Solo Free** | Découverte / particulier débutant | 1 | Prise en main | 0 € | 5 |
| 🏠 **Solo Premium** | Bailleur particulier autonome | 2-10 | Finance + gestion + fiscal | 14,90 € | 8 |
| 🛠 **Gestionnaire** | Pro Hoguet sous mandat | 10-50 | **Gestion biens** (zéro financier perso) | 24,90 €/user | 10 |
| 🏢 **Agence** | Agence/cabinet multi-bailleurs | 50+ | Gestionnaire + multi-portfolio + commissions | 89 €/user | 11 |
| 📊 **Comptable** | Expert-comptable habilité | Variable | Lecture seule + exports fiscaux | 19,90 € | 6 |

## Réponses aux questions implicites du brief user

> *« un profil comme le mien qui a pour but d'avoir les infos financière et de gestion »*
→ **Solo Premium** (tier 14,90 €). Toi, c'est ça aujourd'hui.

> *« un profil juste gestion »*
→ **Gestionnaire** (tier 24,90 €/user). Zéro widget financier perso, focus IRL/EDL/entretien/Pilotage matriciel.

> *« un profil solo plus restreint (dans une logique de pricing) »*
→ **Solo Free** (tier 0 €, limite 1 lot). Conversion → Solo Premium au 2e bien.

> *« un profil agence immo (idem au mien ?) »*
→ **Agence** (tier 89 €/user). Ressemble à Solo Premium MAIS :
- Vision multi-portfolio (plusieurs bailleurs clients)
- Voit ses **commissions Hoguet** (sa rémunération, pas le cash-flow bailleur)
- Génère des **CRG** (compte rendu de gérance), pas du 2044
- Vrai multi-tenant nécessaire → V2 (V1 = Drives partagés séparés)

> *« potentiellement un profil comptable »*
→ **Comptable** (tier 19,90 €). Lecture seule + exports FEC/2044/bilan. Vrai positionnement métier qui n'existe nulle part chez Rentila/Qalimo (différenciant marché).

## Permissions matrice (vue système)

| Action | Solo Free | Solo Premium | Gestionnaire | Agence | Comptable |
|---|---|---|---|---|---|
| Créer logement | 1 max | ✅ illimité | ✅ illimité | ✅ illimité | ❌ |
| Voir finances perso bailleur | ✅ | ✅ | ❌ | ❌ (voit ses commissions) | ✅ |
| Voir mouvements bancaires | ✅ | ✅ | ❌ | ❌ | ✅ lecture |
| Saisir mouvement | ✅ | ✅ | ✅ (sur compte bailleur sous mandat) | ✅ | ❌ |
| Génér quittance | ✅ | ✅ | ✅ | ✅ | ❌ |
| Générer CRG | ❌ | ❌ | ✅ | ✅ | ❌ |
| Pilotage matriciel | ❌ | ❌ | ✅ | ✅ | ❌ |
| Multi-portfolio | ❌ | ❌ | ❌ | ✅ | ✅ |
| Exports FEC/2044/bilan | Limité | ✅ | ❌ | ✅ | ✅ |
| Signer bail | ✅ | ✅ | ✅ (mandataire) | ✅ | ❌ |
| Modifier paramètres généraux | ✅ | ✅ | ❌ | Lecture | ❌ |

## Cas hybrides à clarifier

### Cas A : Didier (toi) gère **lui-même** ET veut faire valider par son comptable
**Solution** : Solo Premium 14,90 € **+ invitation comptable** incluse (1 invité gratuit). Comptable connecte avec son propre compte Google, accès lecture seule. Coût pour toi : 0 € de plus.

### Cas B : Marion (ta compagne) co-gère avec toi
**Solution** : Pas un profil distinct. Tier **Co-gestion 19,90 €/mois** (couple/co-gestionnaire) ajoute 1 utilisateur supplémentaire avec les **mêmes droits Solo Premium** que toi. Workaround V1 via Drive partagé Google (cf. BUG-DRIVE-PARTAGE-TIERS.md).

### Cas C : Gestionnaire Hoguet qui veut quand même voir le financier
**Verdict** : il prend Solo Premium (pas Gestionnaire) ou Agence si multi-bailleurs. Le profil Gestionnaire est volontairement restreint (positionnement métier conforme au mandat).

### Cas D : Bailleur SCI à l'IS (régime BIC)
**Solution** : Solo Premium suffit. Le widget « Charges déductibles » bascule en mode BIC + amortissements automatiques (extension future). Pour la première version, on traite IR uniquement.

## Implémentation technique

### Stockage profil
```js
DB.user = {
  profile: 'solo-free' | 'solo' | 'gestionnaire' | 'agence' | 'comptable',
  invitations: [
    { email: 'compta@x.com', role: 'comptable', accepted: true, addedAt: '...' }
  ],
  tier: 'free' | 'solo' | 'cogest' | 'gest' | 'pro' | 'compta',
  tierValidUntil: '2027-05-15'  // depuis Stripe API
}
```

### Détection auto au boot
- Si `!DB.user.profile` → wizard de sélection au 1er login
- Heuristique de suggestion : 1 lot → solo-free · 2+ lots → solo · multi-entités → gestionnaire ou agence (demander)

### Helper de gating
```js
function _checkPermission(action) {
  const p = DB.user?.profile || 'solo';
  const allowed = PROFILE_PERMISSIONS[p][action];
  if (!allowed) {
    showUpgradeModal(action);
    return false;
  }
  return true;
}
```

### Dashboard widgets par profil
Étendre `DASH_TAB_PRESETS` :
```js
const DASH_TAB_PRESETS = {
  'solo-free':    { visible: new Set(['context-bar','hero-mini','todo-unified']), hide: new Set([...all_others]) },
  'solo':         { /* preset proprio actuel */ },
  'gestionnaire': { visible: new Set(['context-bar','todo-unified','pilotage','agenda-dash','vac','irl','bail','mrh']), hide: new Set(['flux','occ','rdt','donut','dg','prog','solde']) },
  'agence':       { visible: new Set(['context-bar-multibailleur','todo-unified','pilotage','agenda-dash','commissions-hoguet','top-bailleurs-ca']), hide: new Set([...]) },
  'comptable':    { visible: new Set(['context-bar-fiscal','recettes-2044','charges-2044','cf-ytd','exports-rapides']), hide: new Set([...]) }
};
```

## Effort implémentation

| Bloc | Effort | Détail |
|---|---|---|
| Étendre `DASH_TAB_PRESETS` 5 profils | 4-6h | refonte presets + 2 nouveaux widgets (commissions, recettes-2044) |
| Étendre sidebar `_renderSidebarFiltered` 5 profils | 3-4h | data-module par item + persist profil |
| Wizard sélection profil au 1er login | 3-4h | modal + heuristique suggestion |
| 2 nouveaux widgets dashboard (commissions, fiscal) | 6-8h | UI + données |
| Permissions matrice + `_checkPermission` | 4-6h | gating actions UI |
| Tests Vitest permissions + profils | 2-3h | matrice 5 × 11 actions = 55 tests |
| **Total** | **22-31h** | sur 1-2 mois |

## Décisions ouvertes (à valider user)

1. **5 profils OK ou simplification à 4 ?**
   - Variante A : merger Agence ↔ Solo Premium et Comptable rester séparé (4 profils)
   - Variante B : merger Solo Free ↔ Solo Premium (Free = juste limite 1 lot du Premium) (4 profils)
   - Variante C : garder les 5 comme proposé

2. **Pricing tiers à valider** :
   - Solo Free : 0 € — OK ?
   - Solo Premium : 14,90 € — confirmé
   - Co-gestion (Didier + Marion) : 19,90 € — confirmé
   - Gestionnaire 24,90 €/user — au lieu de 29,90 € précédent ? (moins cher car pas de financier)
   - Agence 89 €/user — confirmé
   - Comptable 19,90 € — nouveau (ou 4,90 €/bailleur si comptable s'abonne pour ses clients ?)

3. **Comptable invité gratuit dans Solo Premium ?** Argument vente fort (« partagez avec votre comptable, c'est inclus »). Comptable s'abonne séparément seulement s'il a 5+ bailleurs clients.

4. **Profil Agence en V1** vraiment livrable ? Multi-portfolio simulé via Drives partagés séparés = workaround mais expérience dégradée. Reporter à V2 ?

5. **Wizard de sélection au 1er login** : OK ou détection auto silencieuse + bouton « Changer de profil » ?
