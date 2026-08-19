# Propryo — Business plan (août 2026)

> **Objet** : démontrer l'ambition du projet, sa faisabilité et son potentiel concret.
> **Remplace** [BIZPLAN.md](BIZPLAN.md) (avril 2026, sous le nom « ImmoTrack ») — périmé sur le nom, l'architecture, les différenciants et la roadmap.
> **Annexes** : [CARTE_POSITIONNEMENT.md](CARTE_POSITIONNEMENT.md) (concurrence détaillée, avril 2026 — prix à re-vérifier avant publication de la page Tarifs) · [MISE-EN-PROD.md](MISE-EN-PROD.md) (décisions et étapes d'exécution, figées 19/08) · [PROJECTIONS.md](PROJECTIONS.md) (méthodologie des scénarios).

---

## 1. Le projet en une page

**Propryo** est une application de gestion locative pour bailleurs particuliers et SCI familiales.

> **Le WHY : « Gérer son parc doit être simple dans toutes les situations, et ne pas me donner un deuxième métier. »**

| Question | Réponse |
|---|---|
| **C'est faisable ?** | **C'est fait.** Le produit existe, tourne en production, et gère quotidiennement le parc réel de son créateur : **37 lots, 4 bailleurs (SCI + nom propre), 6 immeubles**. ~3 000 tests automatisés, données hébergées en Union européenne, zéro dépendance à un CDN tiers. |
| **Ça se lance quand ?** | Bêta privée **septembre 2026**, lancement public **14 octobre 2026**. |
| **Ça coûte combien ?** | **< 10 K€ de cash** pour la première année commerciale. Aucune levée de fonds nécessaire : projet bootstrappé, break-even visé ~12-15 mois après lancement. |
| **Ça rapporte quoi ?** | Scénario médian à 3 ans : **~3 200 clients payants, ~365 K€ d'ARR, EBITDA ~35 %**. Valorisation potentielle à la revente : 1,1-1,8 M€ (3-5× ARR, multiples proptech FR). Scénario haut : ARR ~850 K€, valorisation 3,5-5 M€. |
| **Pourquoi maintenant ?** | Marché B2C fragmenté sans leader (fenêtre d'entrée), consolidation B2B en cours (Septeo, Manda), pression réglementaire qui pousse les bailleurs vers le logiciel (DPE, encadrement, fiscalité), et un produit avec ~2,5 ans d'avance d'usage réel. |

---

## 2. Le problème

Le bailleur particulier français (2-3 millions de personnes, ~6,8 M de logements locatifs privés — INSEE 2025) a aujourd'hui trois options, toutes mauvaises :

1. **Excel + classeurs** : gratuit, mais tout est manuel — quittances, révisions IRL, régularisations, déclaration 2044, relances. C'est le « deuxième métier ».
2. **Une agence** : 5-10 % des loyers + perte de contrôle. Pour un parc de 5 lots à 600 €/mois, c'est 1 800-3 600 €/an.
3. **Les logiciels existants** : soit trop simples (le bailleur retombe sur Excel pour la moitié des cas), soit une accumulation de modules et d'options qui recrée la complexité qu'on fuyait. Aucun ne couvre le cycle complet — de l'acte d'achat à la déclaration fiscale — avec la même exigence de simplicité.

**La conviction Propryo** : chaque situation de la vie d'un bailleur (nouveau bien, nouveau locataire, signature, impayé, révision, régularisation, déclaration) doit se traiter en quelques minutes, guidée, sans rien deviner et sans rien recalculer à la main. La simplicité n'est pas un « plan d'entrée de gamme » : c'est le produit.

---

## 3. Le produit aujourd'hui — la preuve de faisabilité

Ce chapitre est la différence majeure avec un business plan classique : **il n'y a pas de risque produit**. Tout ce qui suit est en production en août 2026 (v15.539), testé et utilisé sur un parc réel.

### 3.1 — Couverture fonctionnelle

| Domaine | Ce qui existe en prod |
|---|---|
| **Biens** | Fiches bailleur / immeuble / logement simplifiées ; **création d'un bien par import de l'acte notarié** (rapprochement automatique bailleur/immeuble, complétion guidée avec obligations légales et diagnostics) |
| **Bail** | Wizard complet, clauses, snapshot signé inaltérable, **historique du bail en timeline** (barème de loyer daté, dépôt de garantie, événements) |
| **Signature** | **Signature du bail à distance** (chacun signe de son côté via un lien relais, présentiel + distant mixables), OTP email type Yousign construit (activation au branchement du domaine) |
| **Candidatures** | Dossier candidat en ligne par lien public, multi-candidats |
| **EDL** | État des lieux entrée/sortie, photos, comparatif pièce par pièce |
| **Loyers** | Quittances (émises seulement si le mois est soldé — sinon reçu, conformité art. 1342-9), révision **IRL au 1er du mois anniversaire, jamais rétroactive, prescription 1 an (art. 17-1)**, table INSEE synchronisée par API, relances |
| **Mouvements** | **Import bancaire OFX et Excel natif** (détection des colonnes par le contenu, contrôle par le solde, dédoublonnage FITID), règles d'affectation éditables — « l'app ne devine rien, on ne cache rien » |
| **Finances** | **Moteur financier unique** : cash-flow réel, recouvrement sur le dû du barème, P&L par bailleur/immeuble/logement — invariant permanent : le même chiffre au centime sur tous les écrans |
| **Fiscal** | Aide à la déclaration 2044 (mapping des catégories vers les lignes fiscales) |
| **Multi-utilisateurs** | **Partage par SCI** : chaque associé voit les entités partagées avec lui (sécurité au niveau base de données, ligne par ligne) |
| **Documents** | 8 documents au gabarit professionnel unifié (quittance, lettre IRL, décompte de charges, cautionnement, diagnostics, 2044…), logo du bailleur, 1 page garantie |

### 3.2 — Qualité et souveraineté technique

- **~3 000 tests automatisés** exécutés à chaque livraison ; chaque chantier passe un audit par un agent relecteur indépendant avant intégration ; invariants financiers encodés en tests (« Σ vues immeuble = vue bailleur au centime »).
- **Hébergement Union européenne** (Supabase/PostgreSQL, isolation par entité via Row Level Security), **zéro CDN externe au runtime** (toutes les dépendances embarquées, polices comprises), zéro tracker.
- **PWA responsive** : PC, tablette, téléphone (+ paysage), thèmes clair/sombre — chaque écran validé sur les 4 formats avant livraison.
- **Dogfooding total** : le créateur gère son propre patrimoine avec l'app depuis ~2,5 ans. Chaque bug de production est un bug qui le touche personnellement.

### 3.3 — Ce qui reste avant le lancement (le chemin est court)

Cf [MISE-EN-PROD.md](MISE-EN-PROD.md) : domaine `propryo.fr` (achat fin août) → emails transactionnels (Resend) → site vitrine + `app.propryo.fr` → CGU/RGPD (avocat, ~3 K€) → bêta privée → Stripe → lancement. **Aucun développement produit majeur n'est sur le chemin critique.**

---

## 4. Le marché

### 4.1 — Taille (France)

| Métrique | Valeur | Source |
|---|---|---|
| Logements locatifs privés (résidences principales) | **~6,8 M** (22,8 % du parc) | INSEE Focus 359, 2025 |
| Bailleurs particuliers + SCI familiales | ~2-3 M de ménages | INSEE (24 % des ménages détiennent 68 % des logements) |
| Logements détenus en SCI (location) | ~820 K | INSEE |
| Pénétration logicielle estimée | ~30 % des logements « digitalisables » | estimation d'après bases concurrents (~470 K biens captés sur ~1,5 M) |
| Marché mondial logiciels de gestion locative | $10,5 Md (2024) → $21,8 Md (2033), **CAGR 8,6 %** | Verified Market Reports |

**Lecture** : ~1 M de logements adressables ne sont pas encore digitalisés. C'est un marché **en cours de digitalisation** — la croissance vient des bailleurs qui quittent Excel, pas d'une guerre de parts entre logiciels.

### 4.2 — Vents porteurs réglementaires

- **Loi Climat** : interdiction de louer les DPE G (2025), F (2028), E (2034) → le bailleur DOIT outiller le suivi de ses diagnostics (Propryo intègre le verdict d'interdiction et bloque la révision d'un F/G).
- **Fiscalité 2044/2072** : complexité croissante → demande de préparation automatique.
- **RGPD / souveraineté** : sensibilité croissante des locataires ET des bailleurs à l'endroit où vivent leurs données — Propryo héberge en UE et l'affiche.

---

## 5. Concurrence et positionnement

### 5.1 — Le panel B2C (détail : [CARTE_POSITIONNEMENT.md](CARTE_POSITIONNEMENT.md), avril 2026)

| Outil | Entrée | Multi | Positionnement | Faiblesse exploitable |
|---|---|---|---|---|
| Qalimo | 0-5 € | 5-15 € | meilleure note du marché (4,9/5) | aucun différenciant exclusif, SCI limitée |
| Gererseul | 9,75 € | dégressif | SCI + fiscaliste humain, 42 K users | interface datée, pas d'app mobile |
| Rentila | 0-8 € | 8 € | low-cost, 50 K bailleurs | vieillissant, freemium bridé (2 baux) |
| BailFacile | 9,90 € | 19,90 € | moderne, très bon SEO | couverture fonctionnelle moyenne |
| Smartloc | 6,50 € | 12,50-20 € | GLI intégrée | 5 lots = déjà 20 €/mois |
| ImmobilierLoyer | 7,70 € | 12,50 € | liasse 2072 SCI | interface 2010, app à télécharger |

Le B2B (Septeo 86 % de couverture, sur devis 80-300 €/mois/utilisateur) se consolide à coups d'acquisitions — il valide la valeur du secteur mais ne descend pas sur le particulier. **Aucun acteur B2C ne combine : couverture complète + simplicité réelle + multi-utilisateurs + prix < 20 €.** C'est le vide que Propryo occupe.

### 5.2 — Les différenciants Propryo (tous en production, vérifiables en démo)

1. **Signature du bail à distance incluse** dans l'abonnement — chez les concurrents : module payant à l'acte, ou absent. Avec OTP email (valeur probante renforcée) prêt à activer.
2. **Créer un bien en important l'acte notarié** — onboarding unique sur le marché : le moment où un bailleur cherche un outil, c'est quand il achète.
3. **Partage SCI multi-utilisateurs dès la V1** — chez les B2C, le multi-utilisateurs n'existe pas (c'est l'apanage du B2B à 80 €+/mois). Sécurité au niveau base (RLS par entité).
4. **Un seul moteur financier, juste au centime** — « un chiffre d'argent présent sur deux écrans est le même octet ». Import bancaire sans connexion DSP2 à la banque (OFX/Excel, contrôle par le solde) : posture souveraine.
5. **Conformité loyers native** : quittance seulement si le mois est soldé, IRL jamais rétroactive avec prescription d'un an appliquée, verdict DPE bloquant — le logiciel empêche le bailleur de se mettre en faute.
6. **Historique du bail en timeline** : barème daté, chaque révision/avenant tracé — la preuve en cas de litige.
7. **Souveraineté démontrable** : hébergement UE, zéro CDN, zéro tracker, documents générés localement.

### 5.3 — Phrase de positionnement

> **Propryo est l'outil du bailleur qui veut gérer seul sans que ça devienne un deuxième métier : le cycle complet — de l'acte d'achat à la déclaration — guidé, conforme et juste au centime, de 0 à 30 lots, pour moins de 20 €/mois.**

### 5.4 — Personas

| Persona | Description | Plan visé |
|---|---|---|
| **Le primo-bailleur** | 25-45 ans, 1er bien (souvent hérité ou 1er investissement), cherche « faire un bail gratuit » | Gratuit → Essentiel 2,99 € |
| **Le bailleur autonome** | 35-55 ans, 2-5 lots, gère sans agence, veut du fiable | Investisseur 9,90 € |
| **La SCI familiale** | 45-70 ans, 6-30 lots, plusieurs associés, sensibilité fiscale et patrimoniale | Patrimoine 19,90 € |

---

## 6. L'offre (grille figée le 19/08/2026)

| Plan | Lots | Périmètre | Mensuel | Annuel (**2 mois offerts**) |
|---|---|---|---|---|
| **Gratuit** | 1 | Les documents : bail conforme, EDL, quittance — PDF illimités, sans limite de durée | 0 € | — |
| **Essentiel** | 1 | Tout Propryo : suivi des loyers, import bancaire, Finances, IRL, signature à distance, candidatures | 2,99 € | 29 € |
| **Investisseur** | jusqu'à 5 | Tout Propryo, multi-bailleurs (nom propre + SCI) | 9,90 € | 99 € |
| **Patrimoine** | jusqu'à 30 | + partage SCI multi-utilisateurs | 19,90 € | 199 € |

Au-delà de 30 lots / agences : « nous contacter » (offre pro ultérieure).

**Logique de la grille** :
- **Le gratuit fait du flux** : il capte l'intention de recherche la plus massive (« modèle de bail gratuit », « EDL gratuit ») et fait entrer le bailleur dans le produit. La frontière est nette : gratuit = ce qui ne coûte rien à servir (documents locaux) ; payant = la valeur récurrente (suivi, import, signature, finances).
- **2,99 € casse le ticket d'entrée** sur le segment le plus nombreux (le mono-lot) — sous le prix de tous les concurrents payants.
- **9,90 € / 5 lots** : aligné sur la structure du marché (Smartloc 2-4, Qalimo 2-6, BailFacile 1-5) et moins cher que tout le panel sauf Rentila à parc égal (un 5-lots paie 20 € chez Smartloc).
- **19,90 € / 30 lots + partage** : le multi-utilisateurs, introuvable en B2C, justifie le palier autrement que par le volume. Un 7-lots reste moins cher chez Propryo que chez Smartloc ou Gererseul.
- **Lancement** : offre early bird 50 % sur la 1re année pour les 100 premiers clients (promo ponctuelle, le prix catalogue ne bouge pas).

---

## 7. Modèle économique

### 7.1 — Hypothèses unitaires

| Métrique | Valeur | Base |
|---|---|---|
| Mix payants attendu | 35 % Essentiel · 45 % Investisseur · 20 % Patrimoine | structure du parc FR (majorité de petits bailleurs) |
| **ARPU pondéré** | **~9,50 €/mois** | 0,35×2,99 + 0,45×9,90 + 0,20×19,90 |
| Conversion gratuit → payant | 15 % (hypothèse à calibrer sur les 3 premiers mois) | benchmark SaaS B2C niche 5-25 % ; le palier 2,99 € devrait la tirer vers le haut (upside non modélisé) |
| Churn mensuel | 5 % (durée de vie moyenne 20 mois) | benchmark B2C immo 4-8 % ; marché réputé fidèle |
| CAC moyen pondéré | 25 € (60 % SEO/organique à 12 €, 40 % paid à 45 €) | benchmarks proptech |
| Marge brute | **~85 %** | Stripe ~2 % (vs Paddle 5 % au BP d'avril) + Supabase + Resend + support |
| **LTV nette** | ~160 € | 9,50 × 20 × 0,85 |
| **LTV/CAC** | **~6,5** | sain > 3, excellent > 5 |
| **Payback CAC** | **~3 mois** | sain < 12 |

### 7.2 — Ce qui a changé vs le BP d'avril

- ARPU **11,40 € → 9,50 €** (ajout du palier 2,99 € et limite 5 lots à 9,90 €) — compensé par : une conversion attendue plus forte (ticket d'entrée à 2,99 €), une marge brute meilleure (Stripe vs Paddle : +3 points), et l'upsell mécanique Investisseur → Patrimoine au 6e lot.
- Les revenus complémentaires (partenariats GLI/MRH/expert-comptable, 5-15 % de rétrocession) restent un upside hors cas central.

---

## 8. Projections — 3 scénarios (rebasés grille 2026)

Méthodologie et courbes d'acquisition : [PROJECTIONS.md](PROJECTIONS.md) (les volumes clients sont conservés, l'ARR est recalculé à l'ARPU 9,50 €).

| Scénario | Fin 2026 | Fin 2027 | Fin 2028 | Fin 2029 | Break-even cumulé |
|---|---|---|---|---|---|
| 🔻 **Bas** | 60 clients · 7 K€ ARR | 250 · 28 K€ | 600 · 68 K€ | 1 100 · 125 K€ | fin 2028 |
| ▶ **Médian** | 150 clients · 17 K€ ARR | 700 · **80 K€** | 1 800 · 205 K€ | 3 200 · **365 K€** | ~Q4 2027 |
| 🔺 **Haut** | 350 clients · 40 K€ ARR | 1 600 · 182 K€ | 4 000 · 456 K€ | 7 500 · **855 K€** | Q1 2027 |

- **Médian = 3 200 clients fin 2029** ≈ 1,5 % de la base Gererseul + Rentila cumulée — objectif volontairement non agressif.
- Cash maximum à engager avant break-even : **< 15 K€ cumulés** (voir §10) — le projet est bootstrappable dans les trois scénarios ; seul le scénario haut justifierait une levée pre-seed optionnelle (150-300 K€, Q1-Q2 2027) pour accélérer.
- **Valorisation potentielle fin 2029** (multiples observés proptech FR 3-5× ARR ; 4-6× en croissance forte) : médian **1,1-1,8 M€**, haut **3,5-5 M€**.

---

## 9. Go-to-market

**Canal principal : le SEO d'intention forte** — le bailleur cherche au moment du besoin (« calcul IRL 2026 », « modèle bail meublé », « déclaration 2044 SCI », « DPE G interdiction location », « état des lieux gratuit ») et le plan Gratuit répond exactement à ces requêtes. 30 articles avant lancement puis 3/mois (rédacteur sous-traité 400 €/mois), 5 comparatifs « Propryo vs X ».

**Appui payant au lancement** : Meta + Google Ads 600 €/mois sur 3-6 mois, le temps que l'organique prenne.

**Communautés** : r/vosfinances (200 K membres), forums bailleurs, LinkedIn build-in-public, Product Hunt au jour J.

**Le produit comme canal** : chaque signature à distance et chaque candidature en ligne met un locataire ou un candidat devant une page Propryo — des dizaines de contacts organiques par bailleur actif et par an.

**Funnel cible fin 2026 (médian)** : 12 000 visiteurs/mois → 6 % d'inscriptions → 70 % d'activation → 30 % de conversion payante sur activés → **150 clients payants, MRR ~1 400 €**.

**Calendrier commercial** : bêta privée septembre (10-30 testeurs, allowlist en place) → lancement public **14 octobre 2026** → bilan de calibration à 3 mois (janvier 2027 : conversion, churn, mix réel) → décision d'accélération.

---

## 10. Exécution, ressources, cash

### 10.1 — L'équipe : un fondateur-développeur outillé

Didier Keller, développeur solo — **mais pas artisanal** : le produit est développé avec une chaîne d'agents IA (développement, audit de code systématique par agent indépendant, ~3 000 tests). Cette organisation a livré en 4 mois (mai-août 2026) ce que le plan d'avril chiffrait en 2 trimestres. C'est un avantage de coût structurel : la capacité de production d'une petite équipe, au coût d'une personne.

### 10.2 — Cash-out année 1 (rebasé — vs 11,5 K€ au plan d'avril)

| Poste | Montant € HT |
|---|---|
| Domaine + emails (Resend) + infra (Supabase Pro) | ~450 |
| Avocat : CGU, CGV, politique de confidentialité, DPA | 3 000 |
| Logo / finitions identité (la charte design existe déjà) | 500-1 000 |
| Ads lancement (oct-déc, 3 × 600 €) | 1 800 |
| Rédaction SEO sous-traitée (oct-déc, 3 × 400 €) | 1 200 |
| Comptabilité (outil + accompagnement AE) | ~600 |
| Outils support (Crisp, Plausible, Sentry : offres gratuites au départ) | ~200 |
| Buffer 10 % | ~750 |
| **Total an 1** | **~8 500-9 500 €** |

### 10.3 — Cadre juridique et paiement (décisions du 19/08)

- **Micro-entreprise** au lancement (à confirmer avec le comptable) — création immédiate, franchise de TVA au départ ; **bascule en société (SASU)** dès ~2 000-2 500 € de MRR, avec apport formalisé du logiciel.
- **Stripe** pour l'encaissement (~2 % ; réévaluation de Paddle si assujettissement TVA ou expansion Europe).
- RGPD : hébergement UE, registre, DPA sous-traitants (Supabase, Resend, Stripe) — posture assumée et affichée : c'est un argument commercial, plus seulement une conformité.

### 10.4 — Recrutements (déclenchés par des seuils, jamais en avance)

| Profil | Déclencheur | Coût |
|---|---|---|
| Rédacteur SEO (freelance) | dès le lancement | 4 800 €/an |
| Support/customer success (freelance) | > 300 clients payants | ~5 K€/an puis CDI > 800 clients |
| Dev complément (freelance) | chantiers V2 (portail locataire, module agence) | à la mission |

---

## 11. Risques et parades

| Risque | Probabilité | Parade |
|---|---|---|
| **Dépendance au fondateur** (dev solo) | structurelle | chaîne d'agents + 3 000 tests + docs de chantier = le projet est transmissible ; seuils de recrutement définis |
| Acquisition plus lente que prévu | moyenne | coûts fixes quasi nuls : le scénario bas reste viable ; pivot possible vers monétisation partenariats (GLI/MRH/EC, +30-40 % d'ARR possible) |
| Un gros acteur copie la signature à distance / l'import d'acte | moyenne à 18 mois | avance d'exécution + positionnement simplicité (une copie de feature ne copie pas le produit) ; accélérer le portail locataire pour rendre la base captive |
| Rentila élargit son gratuit | moyenne | ne pas se battre sur le prix : se battre sur « complet ET simple » (le gratuit Propryo est déjà plus généreux en usage documentaire) |
| Dépendance Supabase | faible | PostgreSQL standard, exportable ; sauvegardes ; pas de lock-in propriétaire |
| Seuils AE / TVA atteints | souhaitable | bascule SASU préparée (cf §10.3), prix affichés pensés TTC |
| Réglementaire (modèle de bail, IRL, DPE) | continue | c'est un atout : chaque évolution légale rend l'outil plus indispensable et pénalise les bailleurs sous Excel |

---

## 12. L'ambition

**À 12 mois** (fin 2027) : ~700 clients payants, ~80 K€ ARR, break-even atteint — Propryo est un produit rentable géré par son fondateur.

**À 3 ans** (fin 2029) : 3 200+ clients, ~365 K€ ARR, EBITDA ~35 % — Propryo est l'outil de référence du bailleur autonome français, avec deux options ouvertes :
- **poursuivre** : extension portail locataire, module petites agences, Belgique/Luxembourg ;
- **céder** : le marché consolide (Septeo : 8 acquisitions en 2024 ; Manda : 43 M€ levés, 9 acquisitions) — une base de clients B2C fidèle avec un produit souverain UE est une cible naturelle, valorisée 3-5× l'ARR.

Le scénario haut (855 K€ ARR) ne demande pas un autre produit — seulement un product-market fit confirmé dès Q1 2027 et du carburant marketing.

**Ce qui rend ce plan crédible** : le produit est fini, testé et utilisé en production réelle ; le cash nécessaire est inférieur à 10 K€ ; chaque hypothèse commerciale (conversion, churn, mix) a un point de calibration daté (janvier 2027) et un scénario bas qui reste viable.

---

*Sources marché et concurrence : voir [CARTE_POSITIONNEMENT.md](CARTE_POSITIONNEMENT.md) §9 et [PROJECTIONS.md](PROJECTIONS.md) (INSEE Focus 359, Verified Market Reports, sites éditeurs, presse spécialisée — avril 2026 ; prix concurrents à re-vérifier avant publication de la page Tarifs).*
