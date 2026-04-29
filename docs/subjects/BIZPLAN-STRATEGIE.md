# BIZPLAN-STRATEGIE — Étude de marché + Business plan + Stratégie commerciale

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : L (1-3 jours en session dédiée, hors enquête utilisateur)
**Détecté** : 2026-04-29
**Lié à** : project_commercialization (mémoire) · IMPORT-CONCURRENTS · LEGAL-2044 · SAAS-MULTIUSERS

## Contexte
ImmoTrack est aujourd'hui une app perso utilisée en production par son créateur. La commercialisation est prévue en 2e temps (cf mémoire `project_commercialization.md`).

L'utilisateur souhaite une **étude de marché + business plan** structuré pour :
- Comprendre le marché (taille, segments, tendances)
- Identifier le positionnement optimal vs concurrents
- Définir la proposition de valeur différenciante
- Choisir le modèle économique
- Bâtir un plan d'actions go-to-market

## Approche en 2 temps

### Temps 1 — Cadrage (cette session ou prochaine courte session)
Aligner sur 4 questions clés avant production :
1. **Profondeur** : brouillon décisionnel 3-5 pages OU dossier investisseur 20-30 pages ?
2. **Échéance** : V1 commerciale visée pour quand ? (Q3 2026 ? Q4 ? 2027 ?)
3. **Modèle envisagé** :
   - SaaS pur abonnement (9-19€/mois) ?
   - Freemium (gratuit 1 logement, payant au-delà) ?
   - License one-shot + maintenance ?
   - Hybride ?
4. **Géographie + cible** :
   - France seule ou Europe ?
   - B2C particuliers (1-10 logements) ou aussi B2B (agences, admin biens) ?

### Temps 2 — Production session dédiée
Le dossier final structuré en 8 sections :

#### 1. Contexte & Vision
- Histoire d'ImmoTrack (besoin perso → app prod)
- Vision long terme (3 ans)
- Pourquoi commercialiser maintenant

#### 2. Étude de marché
- Taille du marché français (~7.4M logements locatifs privés INSEE)
- Répartition (60% bailleurs particuliers, 40% agences)
- Segments cibles (solo 1-5, investisseur 5-50, SCI, agences)
- Tendances 2024-2026 (Loi Climat, DPE, digitalisation)
- Marché SaaS gestion locative ~15% croissance/an

#### 3. Analyse concurrentielle
Source : `ImmoTrack_Comparatif_Concurrents_2026.xlsx`
- Top 8 concurrents : Rentila, BailFacile, Qalimo, ImmobilierLoyer, Smovin, Lockimmo, Gererseul, Itsmycoaching
- Pour chacun : pricing, features, positionnement, parts de marché estimées
- Carte de positionnement (axes : prix vs richesse fonctionnelle, ou solo vs pro)

#### 4. Positionnement ImmoTrack
- **Forces différenciantes uniques** à pousser :
  - EDL délégué export HTML offline (absent chez tous concurrents)
  - Comparatif EDL entrée/sortie pièce par pièce + photos compteurs
  - Wizard bail avec signature partielle bailleur + différée locataire
  - Drive sync (pas de backend, données chez utilisateur — atout RGPD)
  - Offline-first (utilisable sans réseau)
  - Dashboard one-screen ~900px (cas usage rapide pro)
- **Forces actuelles** : entités SCI, mode sombre, IRL, mouvements scindables
- **Faiblesses à combler avant V1** : LEGAL-2044, LEGAL-BILAN-ANNUEL, QUIT-EMAIL, IMPORT-CONCURRENTS, multi-users

#### 5. Proposition de valeur
- Cible primaire pressentie : **investisseur particulier 2-10 logements + SCI familiale autonomes**
- Promesse : "L'outil le plus complet pour gérer son parc locatif sans agence"
- Différenciation vs Rentila (entrée gamme prix) : ImmoTrack = pro mais accessible

#### 6. Modèle économique
- Comparer 4 modèles (SaaS / Freemium / License / Hybride)
- Pricing benchmark concurrents
- Projections CA (50/100/500/1000 utilisateurs)
- Note : ImmoTrack offline-first → modèle "license + cloud sync optionnel" plausible

#### 7. Go-to-market
- Channels (SEO content, YouTube tutos, partenariats notaires/syndics, pubs Meta/LinkedIn)
- Onboarding clé : `IMPORT-CONCURRENTS` (mappers Rentila/BailFacile/Qalimo)
- Funnel acquisition trial → conversion
- Stratégie pricing introduction (early bird, lifetime deal ?)

#### 8. Plan d'actions roadmap
- **Q2 2026** (mai-juin) : finir V3 audit + visuel + onglets · IRL DPE · LEGAL-2044 · IMPORT-CONCURRENTS
- **Q3 2026** (jul-sept) : multi-users + Drive 2H/2F/2G · beta privée 30-50 utilisateurs · feedback
- **Q4 2026** (oct-déc) : lancement public · contenu marketing · 100 premiers clients
- **2027** : module agence (CRG, mandants) · API · expansion EU

## Décisions à prendre
- [ ] Confirmer la profondeur attendue (brouillon 5p vs dossier 30p)
- [ ] Confirmer modèle économique cible avant production
- [ ] Confirmer cible primaire (B2C solo vs B2B agences)
- [ ] Décider si on inclut une analyse SWOT formelle
- [ ] Décider si on inclut des projections financières chiffrées (Excel) ou juste qualitatives

## Ressources existantes
- `ImmoTrack_Comparatif_Concurrents_2026.xlsx` (à la racine du repo)
- Mémoire `project_commercialization.md`
- Cahier des charges v2 avril 2026 (Downloads)

## Prompt de démarrage de session (à finaliser après cadrage)
```
Session : production du dossier business plan ImmoTrack.

Contexte préalable validé :
- Profondeur visée : [TBD]
- Modèle économique cible : [TBD]
- Cible primaire : [TBD]
- Géographie : [TBD]

Lire avant de démarrer :
- docs/subjects/BIZPLAN-STRATEGIE.md (ce fichier)
- ImmoTrack_Comparatif_Concurrents_2026.xlsx
- Mémoire project_commercialization.md

Produire en sortie :
- docs/strategie/BIZPLAN.md (le dossier complet 8 sections)
- docs/strategie/CARTE_POSITIONNEMENT.md (matrice concurrence)
- docs/strategie/PLAN_ACTIONS_2026.md (roadmap trimestrielle)
```

## Notes utilisateur
> 💬 2026-04-29 : "je voudrai qu'on fasse une étude de marché et un business plan sur Immotrack. Son positionnement, les possibilités de marché et les atouts ou options à développer / pousser. me donner ta stratégie et ton plan d'actions"

## Journal
- 2026-04-29 : créé · attente cadrage utilisateur (4 questions clés) avant production
