# EMAIL-ENVOI-DEPUIS-COMMUNICATION — Envoyer quittance/IRL/doc depuis l'onglet Communication (Chemin PULL)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M (~3-4h)
**Détecté** : 2026-05-17 (user : « depuis communication, on peut envoyer IRL, quittance ou autre document ? tu fais comment pour gérer le lien ? »)
**Lié à** : EMAIL-ONGLET-PERMANENT ✅ livré v15.79 (lecture seule) · EMAIL-AUTO ✅ v15.09 · NAV-LOGEMENT-BAIL-CLARIF

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs — gain réel sur les **envois groupés** (toutes les quittances du mois en 1 passage)
2. **Règles** : anti-duplication (réutiliser les générateurs existants, pas re-coder) + design consistency
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 : « depuis communication, on peut envoyer IRL, quittance ou autre document ? »
   - 💻 Code existant : EMAIL-AUTO v15.09 a déjà le modèle `{type, entityType, entityId, ctx}` + générateurs `genQuittance`/`genIRLLetter`
   - 📋 Backlog : EMAIL-ONGLET-PERMANENT livré v15.79 mais **lecture seule** → cette évolution ajoute l'envoi
4. **5 vues 360°** : UX (cockpit d'envoi) + cycle de vie (envois mensuels groupés) + technique (réutilisation moteur)

## Constat — divergence livré vs demande

| | Livré v15.79 (EMAIL-ONGLET-PERMANENT) | Demande user 2026-05-17 |
|---|---|---|
| Onglet Communication | **lecture seule** (Tableau de bord / Historique / Modèles) | + **envoyer** quittance/IRL/doc |
| Envoi quittance/IRL | depuis les fiches métier uniquement (Chemin PUSH) | aussi depuis Communication (Chemin PULL) |

Décision actée v15.79 : *« Page = lecture seule. Le déclenchement se fait depuis les fiches métier via leur bouton 📧 dédié. »* → Ce sujet **lève** cette limite avec un chemin d'envoi maîtrisé.

## Comment gérer le lien (réponse technique)

Le lien existe déjà dans le modèle EMAIL-AUTO :
```js
DB.emailsSent[] = {
  type,        // 'quittance' | 'irl-revision' | 'decompte-regul' | 'libre'
  entityType,  // 'bail' | 'quittance' | 'logement'   ← LE LIEN
  entityId,    // ref bail / id quittance              ← LE LIEN
  ctx,         // snapshot données (montants, période, indices IRL)
  to, subject, sentAt, status
}
```

### 2 chemins de pose du lien

**Chemin PUSH (existe v15.09)** — depuis la fiche :
```
Bail X → bouton "Envoyer lettre IRL" → ctx déjà calculé →
entityType='bail', entityId='X' auto → modale → envoi
```

**Chemin PULL (à construire, ce sujet)** — depuis Communication :
```
"Nouvel envoi" → mini-wizard :
  1. Type ? (quittance / IRL / relance / décompte / libre)
  2. Quel bail/locataire ? (sélecteur)          ← pose entityId
  3. Quelle période/révision ? (si quittance/IRL) ← contexte précis
  → RÉUTILISE genQuittance() / genIRLLetter() pour reconstruire ctx
  → entityType + entityId posés au moment de la sélection
  → aperçu → envoi
```

### Règle anti-duplication (CRITIQUE)

L'onglet Communication **n'a PAS son propre générateur de documents**. Il **orchestre** en déléguant :

| Doc | Générateur réutilisé (existe déjà) |
|---|---|
| Quittance | `genQuittance(...)` |
| Lettre IRL | `genIRLLetter(ref)` |
| Décompte régul | module régul |
| Email libre | composeur simple (texte, pas de doc) |

→ Communication = **chef d'orchestre**, pas re-codage.

## Scope (proposé)

### Phase 1 — Mini-wizard "Nouvel envoi" (~90min)
- Bouton "✉ Nouvel envoi" dans l'onglet Communication
- Étape 1 : choix type (chips : Quittance / IRL / Relance / Décompte / Libre)
- Étape 2 : sélecteur bail/locataire (réutilise la liste des baux actifs)
- Étape 3 : contexte (quittance→sélecteur mois ; IRL→révisions dispo ; libre→rien)
- Appel du générateur métier correspondant → ctx
- Aperçu → bouton Envoyer (réutilise la modale EMAIL-AUTO)

### Phase 2 — Envoi groupé (le vrai gain) (~60min)
- Onglet "📤 À envoyer" : liste les docs générés en attente (ex : quittances du mois)
- Sélection multiple + "Envoyer tout" (mailto séquentiel ou copy/share par lot)
- Indicateur de progression + statut par envoi

### Phase 3 — Tests Vitest (~30min)
- `_commWizardBuildContext(type, bailRef, periode)` retourne le bon ctx
- Lien `entityType`/`entityId` posé correctement selon le type
- Cas dégradés (bail sans IRL applicable, mois sans quittance générée)

### Phase 4 — Bump + commit
- Réutilise au maximum l'existant (générateurs + modale)

## Décisions à arbitrer

- [ ] **D1** : envoi groupé V1 ou reporté V2 ? (Phase 2 = le vrai gain mais plus complexe)
- [ ] **D2** : queue "À envoyer" persistée (DB) ou volatile (session) ?
- [ ] **D3** : envoi réel = mailto / copy / partage natif (EMAIL-AUTO V1) ou attendre EMAIL-SMTP-CONNECT (envoi direct) ?

## Coordination

⚠️ EMAIL-ONGLET-PERMANENT **déjà livré v15.79** (lecture seule). Ce sujet **ajoute** la capacité d'envoi sans modifier la partie consultation. Coordonner avec EMAIL-SMTP-CONNECT (si envoi direct souhaité) et EMAIL-MODAL-UX-REFONTE.

## Notes utilisateur

> 💬 2026-05-17 : « si je comprends bien depuis communication, on peut envoyer IRL, quittance ou autre document ? tu fais comment pour gérer le lien ? »

## Journal

- 2026-05-17 : créé · évolution de EMAIL-ONGLET-PERMANENT (livré lecture seule v15.79) vers l'envoi depuis Communication (Chemin PULL via mini-wizard) · réutilise les générateurs métier existants (anti-duplication) · le vrai gain = envoi groupé mensuel
