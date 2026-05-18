# IA-COPILOTE — Module IA léger ImmoTrack (recherche sémantique + suggestions)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : L (~10-15 j-h sur V1.5)
**Détecté** : 2026-05-18 (réaction audit concurrent LocataireCloud qui livre IA conversationnelle T2 2026)
**Lié à** : BIZPLAN-V2 · WATCH-LOCATAIRELIVE · DASH-PROFILES (cockpit V4) · positionnement V1.5

## Contexte

LocataireCloud annonce **"Gestion locative automatisée dopée à l'IA"** comme baseline et livre un **agent IA conversationnel T2 2026** (en cours d'implémentation). C'est un argument commercial fort pour les bailleurs débordés.

ImmoTrack n'a pas encore d'IA. Risque : si LocataireCloud livre vraiment, leur pitch devient "tout est automatisé par IA chez nous". Il faut une **parité concurrentielle** SANS sacrifier la posture souveraine d'ImmoTrack (rappel : les données restent chez l'utilisateur).

## Périmètre — 4 modules IA à livrer

### Module 1 : Recherche sémantique Ctrl+K (P1)
- L'utilisateur tape "Dupont" ou "le bail avec garant à Mulhouse" ou "loyers impayés F-001"
- L'IA cherche dans **toute la DB locale** (entités, logements, baux, locataires, mouvements, quittances, EDL)
- Embedding local (transformers.js dans le navigateur) + index FAISS local IndexedDB
- **Aucune donnée envoyée à un serveur** (cohérent posture souveraine)
- Effort : **3-4 j-h**

### Module 2 : Copilote "que dois-je faire aujourd'hui ?" (P1)
- Dashboard widget IA qui propose 3-5 actions prioritaires :
  - "Vous avez 2 IRL à appliquer (économie cumulée 1 240 €/an)"
  - "Bail F-002 expire dans 45 jours, lancer wizard renouvellement ?"
  - "Charges F-001 non régularisées depuis 2024, lancer régul ?"
  - "DPE F-003 expire en 2028, projeter plan rénov ?"
- Détection règles métier (pas LLM) + scoring priorité
- Effort : **3-4 j-h**

### Module 3 : Assistant catégorisation mouvements (P2)
- Quand utilisateur importe un CSV bancaire, l'IA propose la catégorisation automatique
- "Virement DUPONT JEAN" → Loyer F-001 (confiance 92 %)
- "EDF 87,30 €" → Énergies (confiance 98 %)
- LLM local (Phi-3 mini ou Qwen3 0.5B via WebLLM) OU heuristique simple + cache des choix utilisateur
- Effort : **3-4 j-h** (avec LLM local) ou 1,5 j-h (heuristique simple)

### Module 4 : Suggestions clauses bail (P3, V2+)
- Pendant rédaction bail, l'IA propose clauses adaptées au contexte :
  - Zone tendue → clause encadrement loyers
  - Étudiant → clause caution parentale renforcée
  - Meublé → clause inventaire détaillé
  - Garage → clause usage strict
- Base : 50-80 clauses-types catégorisées + matcher contextuel
- Effort : **2-3 j-h**

## Architecture technique

### Posture "IA souveraine" (différenciant vs LocataireCloud)

**Tous les modules tournent côté client (browser)** :
- **transformers.js** pour embeddings (Sentence-Transformers MiniLM, 25 MB)
- **FAISS-JS** ou IndexedDB index custom pour vector search
- **WebLLM** (https://webllm.mlc.ai/) pour Phi-3 mini si on veut un vrai LLM (200 MB)
- **AUCUNE clé API externe** (OpenAI/Anthropic/etc.) en V1.5 — posture souveraine

**Argument commercial** :
> « ImmoTrack a l'IA. Vos données ne quittent jamais votre navigateur. Pas un seul prompt n'est envoyé à OpenAI, Mistral ou Anthropic. **C'est la vraie IA souveraine.** »

### Charge bundle

- transformers.js MiniLM : ~25 MB (lazy-load au 1er Ctrl+K)
- WebLLM Phi-3 mini : ~200 MB (opt-in, "Activer l'IA copilote ?")
- Sans WebLLM : Modules 1+2+3 (heuristique) suffisent et gratuit en bundle

## Effort estimé

| Bloc | Effort |
|---|---|
| Module 1 (recherche sémantique Ctrl+K) | 3-4 j-h |
| Module 2 (copilote dashboard) | 3-4 j-h |
| Module 3 (catégorisation mouvements) | 1,5 j-h (heuristique) ou 3-4 j-h (LLM) |
| Module 4 (suggestions clauses bail, V2+) | 2-3 j-h (différé) |
| Bundle + tests + intégration | 1,5 j-h |
| **Total V1.5 (modules 1-3, mode heuristique)** | **9-11 j-h** |
| **Total V1.5 (modules 1-3, avec WebLLM)** | **13-15 j-h + 200 MB bundle opt-in** |

## Quand livrer

- **Modules 1+2 (recherche Ctrl+K + copilote dashboard)** : Q1 2027 (V1.5)
- **Module 3 (catégorisation)** : Q2 2027
- **Module 4 (clauses bail)** : V2 2027

## Décisions à prendre

- [ ] **Posture IA** : 100 % client souverain (différenciant fort) OU appel API externe (Anthropic Claude / Mistral) avec opt-in utilisateur ?
- [ ] **WebLLM Phi-3 mini** : oui (200 MB opt-in) ou heuristique simple (gratuit) ?
- [ ] **Module 3 heuristique vs LLM** : heuristique suffit V1.5, LLM en V2 ?
- [ ] **Module 4 (clauses bail)** : V1.5 ou V2 ?
- [ ] **Roadmap publique** : annoncer "IA souveraine" comme différenciant V1.5 dès le pitch commercial CGP ?

## Journal

- 2026-05-18 : créé · réaction audit LocataireCloud · 4 modules identifiés · posture "IA souveraine 100 % browser" recommandée
