# IA-V2 — Module IA opt-in "Pro Connect" (OCR + génération + classification)

**Status** : ⬜ À faire · **Prio** : V2 (post-commercialisation V1) · **Taille** : L (15-25h tous use cases)
**Détecté** : 2026-05-15
**Lié à** : LOG-ANNONCE (Phase 4) · BAILLEUR-DIAGNOSTICS-DDT (livré v15.05-06) · DOC-PJ · LOG-CANDIDATS · DRIVE-ARBORESCENCE · BAIL-CLAUSES-PERSO · GESTION-IMPAYE · BANK-INTEGRATION (V2 PDF banque)

## Décision arbitrée 2026-05-15

> 💬 User 2026-05-15 : « on est capable (et est-ce intéressant) d'ajouter une IA ? et pour faire quoi ? »
> 💬 User 2026-05-15 : « on met ça en backlog pour V2 »

→ **Pas en V1.1** (pas de coût récurrent + focus sur fondations V1 commerciale). **V2 = tier opt-in payant "Pro Connect"** (~5€/mois SaaS) après stabilisation V1.

## Justification (4 critères pré-vol)

1. **Cible** : bailleurs Pro qui veulent gagner du temps sur la saisie répétitive (DPE, factures, justificatifs candidats). Opt-in payant — pas imposé aux particuliers solo qui peuvent rester en V1 gratuit/forfait base.
2. **Règles respectées** : zéro coût récurrent ImmoTrack en V1 + opt-in (pas imposé) + différenciant net marché (Rentila/BailFacile/Qalimo = aucun OCR).
3. **Justifications multiples** :
   - 🧑 Cas user 2026-05-15 : question explicite « on est capable et est-ce intéressant ? »
   - 💻 Code existant : multiples points de saisie répétitive (9 diagnostics DDT, factures travaux, justificatifs locataire, classifications Drive)
   - 📋 Backlog : LOG-ANNONCE Phase 4 LLM déjà mentionnée (2026-05-15)
   - 💰 Business : tier payant SaaS = revenu récurrent au-delà du forfait base
4. **5 vues 360°** : axe commercial (Pro Connect monetisation) + axe technique (OCR/vision/LLM via API) + axe cycle vie (saisie DPE → annonce → impayé)

## Architecture proposée

### Module générique `_iaProvider` (couche d'abstraction)

```
ImmoTrack code
    ↓
_iaProvider.ocr(file, schema) ─┬─ Claude Sonnet vision (Anthropic)
_iaProvider.complete(prompt) ─┼─ OpenAI GPT-4o-mini
_iaProvider.classify(file) ───┼─ Mistral OCR (FR-native)
                              └─ Tesseract.js (local, gratuit, fallback)
```

- 1 seule clé API stockée chiffrée en localStorage (`pro_connect_key`)
- Choix du provider par l'utilisateur (préf coût vs qualité)
- **Fallback local** : Tesseract.js gratuit si pas de clé (qualité dégradée mais zéro coût)

### Coûts utilisateur estimés

| Provider | Coût input | Coût output | Cas d'usage |
|---|---|---|---|
| Claude Haiku 4.5 | 1€/MTok | 5€/MTok | Annonce, classification, OCR léger |
| Claude Sonnet 4.6 vision | 3€/MTok | 15€/MTok | OCR PDF complexe (DPE, factures) |
| GPT-4o-mini | 0.15€/MTok | 0.60€/MTok | Économique alternative |
| Mistral OCR | ~0.001€/page | — | OCR pur, FR-native |
| Tesseract.js | 0€ | 0€ | Fallback local (qualité moyenne) |

→ **Estimation utilisateur Pro Connect 5€/mois** : ~50-100 opérations/mois couvertes (DPE + 10 factures + 5 candidats + 5 annonces).

## Use cases — backlog V2

### 🟢 Use cases prioritaires V2 (justifiés par backlog ou cas user)

#### UC1 — OCR Diagnostics (DPE / ERP / CREP / amiante / gaz / élec / termites / mérule / bruit aérien) ⭐
- **Couple avec** : BAILLEUR-DIAGNOSTICS-DDT (livré v15.05-06)
- **Flow** : déposer PDF du DPE → IA extrait `classe`, `kWh/m²/an`, `kgCO2/m²/an`, `date`, `validité` → pré-remplit `logement.dpe`, `logement.ges`, etc.
- **Provider recommandé** : Claude Sonnet vision (PDF natif) ou Mistral OCR
- **Coût** : ~0.005-0.01€/PDF
- **Gain user** : ~5 min/diagnostic → 9 diagnostics = ~45 min économisées par bien

#### UC2 — OCR Factures travaux / charges récup ⭐
- **Couple avec** : DOC-PJ + BUG-CHARGE-001 + Régul charges réelles
- **Flow** : déposer facture PDF/photo → IA extrait `fournisseur`, `date`, `montant TTC`, `nature` → catégorise auto (récup vs non récup décret 87-713) → propose ajout en mouvement
- **Provider** : Mistral OCR + LLM Haiku pour catégorisation
- **Coût** : ~0.005€/facture
- **Gain** : 3 min/facture → ~50 factures/an × portfolio = 2-3h économisées

#### UC3 — OCR Justificatifs candidat locataire ⭐
- **Couple avec** : LOG-CANDIDATS (P1, pipeline lien partagé)
- **Flow** : candidat dépose CNI + avis imposition + 3 fiches paie + RIB → IA extrait `nom`, `revenus mensuels`, `employeur`, `ancienneté contrat` → calcul auto ratio revenu/loyer (règle 33%)
- **Provider** : Claude Sonnet vision
- **Coût** : ~0.02€/candidat (5 pages)
- **Gain** : ~10 min/candidat × 3-5 candidats/loc = 30-50 min économisées par re-loc
- **Garde-fou RGPD** : conserver uniquement les valeurs extraites, supprimer les PDF source après vérification (sauf si user opt-in archive)

#### UC4 — Annonce évocatrice LLM-generated (Phase 4 LOG-ANNONCE)
- **Couple avec** : LOG-ANNONCE Phase 4 (déjà spec'é)
- **Flow** : caractéristiques structurées du bien → LLM génère description évocatrice 250-400 mots → 3-4 variantes proposées
- **Provider** : Claude Haiku ou GPT-4o-mini
- **Coût** : ~0.01€/annonce
- **Gain** : annonce plus attractive → +30% clics estimés (étude Leboncoin)

#### UC5 — Classification auto Drive ⭐
- **Couple avec** : DRIVE-ARBORESCENCE (9 sous-dossiers livré)
- **Flow** : user drop un PDF dans le root Drive → IA identifie type (DPE / facture / bail / quittance / EDL / autre) + bien concerné → propose rangement dans le bon sous-dossier
- **Provider** : Mistral OCR (extraction texte) + Haiku (classification + matching bien)
- **Coût** : ~0.005€/doc
- **Gain** : zéro saisie de classement, le Drive se range tout seul

### 🟠 Use cases secondaires V2.5 (si demande user)

#### UC6 — Brouillon lettre relance impayé
- **Couple avec** : GESTION-IMPAYE (pas encore livré V1.1)
- **Flow** : contexte locataire + historique impayés → LLM génère brouillon de mise en demeure adapté au niveau (1er retard amiable vs 3 mois = LRAR + huissier)
- **Garde-fou** : user **valide et signe** avant envoi (jamais auto-envoi)

#### UC7 — Suggestions clauses bail
- **Couple avec** : BAIL-CLAUSES-PERSO (P2)
- **Flow** : user décrit la situation ("animaux", "télétravail", "sous-location interdite") → LLM propose 2-3 formulations conformes loi 89-462
- **Garde-fou** : citer les articles de loi en bas + disclaimer "vérification avocat recommandée"

#### UC8 — OCR Relevé bancaire PDF
- **Couple avec** : BANK-INTEGRATION (V1 CSV/OFX livré v15.07, V2 PDF prévu)
- **Flow** : banque qui ne fournit pas CSV (rare) → user upload PDF → IA extrait les lignes
- **Coût** : ~0.02€/relevé mensuel
- **Limite** : DSP2/AISP V2 (Bridge/Powens) sera meilleur que l'OCR

#### UC9 — Traduction multilingue annonce
- **Couple avec** : LOG-ANNONCE Phase 2 (mode évocateur)
- **Flow** : annonce FR générée → traduction EN/ES/IT/DE pour touche colocation étudiants étrangers
- **Coût** : ~0.005€/traduction

### 🔴 Use cases écartés (paillette / risque juridique)

| Cas | Raison de refus |
|---|---|
| **Conseil fiscal optimisé** (micro-BIC vs régime réel) | hors compétence légale — risque mise en cause conseil financier non agréé |
| **Analyse photos EDL "détection dégradation"** | risque litige fort si IA hallucine — EDL-VALIDATION-AVOCAT P1 gère mieux ça avec template juridique |
| **Prédiction loyer marché** (révision spéculative) | hors loi 89-462 — l'IRL est le SEUL indice légal de révision |
| **Chatbot généraliste app** | gadget — la doc structurée fait mieux et coûte 0€ |
| **Détection diagnostics expirés** | déjà fait par helpers JS purs (gratuit + déterministe) |

## Architecture sécurité

- **Clé API** : stockée chiffrée en localStorage (AES via Web Crypto API), jamais en clair
- **RGPD** : pas d'envoi de PII non strictement nécessaire à l'API ; logs IA archivés 30 jours max
- **Mention RGPD** : avis explicite avant 1er usage IA ("vos documents sont envoyés à Anthropic/OpenAI/Mistral pour traitement")
- **Provider EU** : Mistral (Paris) prioritaire si user demande données strictement EU
- **Mode dégradé sans IA** : tous les flows continuent à fonctionner en saisie manuelle si Pro Connect désactivé

## Différenciant marché V2

| Solution | OCR DPE | OCR factures | OCR justifs candidat | Classification Drive | Annonce LLM |
|---|---|---|---|---|---|
| Rentila | ❌ | ❌ | ❌ | ❌ | ❌ |
| BailFacile | ❌ | ❌ | ❌ | ❌ | ❌ |
| Qalimo V2 | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ImmoTrack V1.1** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ImmoTrack V2 Pro Connect** | ✅ | ✅ | ✅ | ✅ | ✅ |

→ Différenciant **majeur** : ImmoTrack V2 = **seul outil avec OCR + IA intégrés** sur le marché français des particuliers/petits SCI.

## Plan de déploiement V2 (estimation)

- **Q1 2027** (post-V1 commercial Q4 2026 stabilisé) : UC1 + UC2 + UC5 (~15h dev)
- **Q2 2027** : UC3 + UC4 (~8h)
- **Q3 2027** : UC6-UC9 selon demande utilisateurs Pro

## Décisions à arbitrer (V2)

- [ ] Provider par défaut : Claude (qualité max, ~5€/mois user) ou GPT-4o-mini (économique, ~2€/mois user) ?
- [ ] Tier "Pro Connect" tarif : 5€/mois forfait ou pay-per-use 0.01€/opération ?
- [ ] Fallback Tesseract.js local : intégrer dès UC1 ou V2.5 ?
- [ ] Hébergement clé : full client-side (localStorage chiffré) ou backend léger Cloudflare Worker ?

## Notes utilisateur

> 💬 2026-05-15 : « on est capable (et est-ce intéressant) d'ajouter une IA ? et pour faire quoi ? »
> 💬 2026-05-15 : « on met ça en backlog pour V2 »

## Journal

- 2026-05-15 : créé · consolidation des 9 use cases IA identifiés en session pilotage (5 prioritaires V2 + 4 secondaires V2.5 + 5 écartés paillette/risque). Décision **V2 post-commercialisation V1** = pas de coût récurrent pendant la phase V1.1.
