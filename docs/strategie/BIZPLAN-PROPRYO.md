# Propryo — Business plan (v2, 19 août 2026)

> **Objet** : démontrer l'ambition du projet, sa faisabilité et son potentiel concret — chiffres **dérivés d'un modèle sourcé**, jamais posés.
> **v2 du 19/08/2026** : chapitre « Moteur d'acquisition » (SEO = le cœur), funnel aux benchmarks publiés, concurrence **re-vérifiée le jour même** sur les pages tarifs, projections reconstruites de bas en haut. Remplace la v1 du même jour et [BIZPLAN.md](BIZPLAN.md) (avril 2026).
> **Annexes** : [MISE-EN-PROD.md](MISE-EN-PROD.md) (décisions et étapes figées) · [CARTE_POSITIONNEMENT.md](CARTE_POSITIONNEMENT.md) (panorama avril, dépassé sur les prix — voir §5) · sources en fin de document.

---

## 1. Le projet en une page

**Propryo** est une application de gestion locative pour bailleurs particuliers et SCI familiales.

> **Le WHY : « Gérer son parc immobilier ne devrait pas être un deuxième métier. »**

| Question | Réponse |
|---|---|
| **C'est faisable ?** | **C'est fait.** Le produit tourne en production et gère le parc réel de son créateur : 37 lots, 4 bailleurs, 6 immeubles. ~3 000 tests automatisés, données hébergées en UE. Il ne reste sur le chemin du lancement que du non-produit : domaine, statut, CGV, paiement. |
| **Le plan d'acquisition ?** | **SEO par pages-outils** — le plan Gratuit *fait* les documents (bail, quittance, EDL) que des dizaines de milliers de bailleurs cherchent chaque mois ; le modèle exact qui a construit BailFacile (§8). **+ canal 2 : le réseau de prescripteurs** (CGP, comptables, professionnels de la transaction — §8.5), qui apporte la confiance et le segment SCI. |
| **Ça se lance quand ?** | Bêta privée septembre, **lancement public 14 octobre 2026**, 45 pages SEO publiées avant le jour J. |
| **Ça coûte combien ?** | ~9,3 K€ de dépenses externes la 1re année ; **avance de trésorerie maximale ~12 K€** (cotisations sociales incluses), remboursée courant 2028. Aucune levée : bootstrappé. |
| **Ça rapporte quoi ?** | Scénarios **sortis du modèle financier joint** (§10) : **résultat mensuel positif entre avril et août 2027 dans les trois scénarios**, synchronisation bancaire provisionnée. Fin 2029 : prudent 710 clients / 77 K€ ARR · central ~950 / ~103 K€ · ambitieux ~1 830 / ~199 K€ — hors apport des prescripteurs (non modélisé). Valorisation indicative 0,23-0,97 M€ (3-5× ARR). |
| **Pourquoi maintenant ?** | Marché B2C sans leader installé, concurrents passés au **prix par bien** (2 à 4× plus chers que Propryo à 5 lots — §5), pression réglementaire continue (DPE, IRL, 2044), et un produit déjà construit. |

---

## 2. Le problème

Le bailleur particulier français (2-3 millions de personnes, ~6,8 M de logements locatifs privés — INSEE 2025) a trois options, toutes mauvaises :

1. **Excel + classeurs** : tout est manuel — quittances, IRL, régularisations, 2044, relances. Le « deuxième métier ».
2. **Une agence** : 5-10 % des loyers + perte de contrôle (1 800-3 600 €/an pour 5 lots à 600 €).
3. **Les logiciels existants** : simplistes (retour à Excel pour la moitié des cas) ou usines à gaz — et depuis 2026, presque tous facturent **au bien** : le prix grimpe à chaque lot (§5).

**La conviction Propryo** : chaque situation (nouveau bien, signature, impayé, révision, régularisation, déclaration) doit se traiter en minutes, guidée, sans rien deviner ni recalculer. La simplicité n'est pas un plan d'entrée de gamme : c'est le produit — et le prix est **forfaitaire**, pas un compteur.

---

## 3. Le produit — la preuve de faisabilité

Tout ce qui suit est **en production** (août 2026, v15.540), testé, utilisé sur un parc réel de 37 lots.

| Domaine | En prod |
|---|---|
| **Biens** | Fiches simplifiées ; **création d'un bien par import de l'acte notarié** (rapprochement bailleur/immeuble automatique, complétion guidée avec obligations légales et diagnostics) |
| **Bail** | Wizard complet, snapshot signé inaltérable, **historique en timeline** (barème daté, DG, événements) |
| **Signature** | **À distance incluse** (relais, présentiel + distant mixables) ; OTP email construit (activation au domaine) |
| **Candidatures** | Dossier en ligne par lien public, multi-candidats |
| **EDL** | Entrée/sortie, photos, comparatif pièce par pièce |
| **Loyers** | Quittance seulement si le mois est **soldé** (sinon reçu — art. 1342-9), **IRL au 1er du mois anniversaire, jamais rétroactive, prescription 1 an (art. 17-1)**, table INSEE synchronisée par API, relances |
| **Mouvements** | **Import bancaire OFX + Excel natif** (détection colonnes, contrôle par le solde, dédoublonnage FITID), règles éditables — « l'app ne devine rien ». **Synchronisation bancaire automatique (DSP2) au calendrier** : dogfood T4 2026 (gratuit), clients T1 2027 — l'étude d'architecture est faite (tout-Supabase, agrégateur agréé, réutilisation à 100 % de la chaîne d'import existante — `BANK-API-AUTO-IMPORT.md`) |
| **Finances** | **Un seul moteur** : cash-flow réel, recouvrement sur le dû du barème, P&L par bailleur/immeuble/lot — le même chiffre au centime sur tous les écrans |
| **Fiscal** | Aide 2044 (mapping catégories → lignes fiscales) |
| **Multi-utilisateurs** | **Partage par SCI** : isolation par entité au niveau base de données (RLS), chaque associé son accès |
| **Documents** | 8 documents au gabarit pro unifié, logo bailleur, 1 page garantie |

**Qualité & souveraineté** : ~3 000 tests automatisés à chaque livraison, audit par agent relecteur indépendant avant intégration, invariants financiers testés (« Σ vues immeuble = vue bailleur au centime ») ; hébergement UE (Supabase/PostgreSQL, RLS), **zéro CDN externe, zéro tracker** ; PWA vérifiée sur 4 formats × 2 thèmes. Dogfooding : le créateur gère son propre patrimoine dans l'app.

---

## 4. Marché — TAM / SAM / SOM

| Niveau | Estimation | Méthode |
|---|---|---|
| **TAM** — bailleurs privés France | ~6,8 M logements · 2-3 M bailleurs | INSEE Focus 359 (2025) ; 24 % des ménages détiennent 68 % des logements |
| **SAM** — gestion autonome digitalisable | ~1,5 M logements « gérables par logiciel » · ~500-700 K bailleurs | ~20-25 % du parc estimé gérable en SaaS ; ~470 K biens déjà captés par les acteurs en place (bases publiées Rentila/Gererseul + estimations) → **~1 M de logements pas encore équipés** |
| **SOM** — cible 3 ans | 950-3 200 clients (scénarios §10) | = **0,15-0,5 % du SAM bailleurs** — la modestie de la part de marché requise est un argument : le plan ne suppose aucune conquête héroïque |

**Vents porteurs** : Loi Climat (interdictions DPE G 2025 / F 2028 / E 2034 — le bailleur doit s'outiller), complexité 2044/2072, sensibilité croissante à la localisation des données. Marché mondial du logiciel de gestion locative : +8,6 %/an (2024-2033, Verified Market Reports).

---

## 5. Concurrence — re-vérifiée le 19/08/2026 sur les pages tarifs

> Méthode : pages tarifs consultées en direct le jour même (sliders BailFacile et ImmobilierLoyer manipulés pour extraire les paliers). Écart majeur vs avril : **le marché est passé au prix par bien.**

### 5.1 — Prix réels à parc donné (€/mois, engagement annuel)

| Outil | 1 lot | 5 lots | 10 lots | Signature électronique | Multi-utilisateurs |
|---|---|---|---|---|---|
| Rentila | 0 € | ~4,90 € TTC (Silver 49 € HT/an) | ~9,90 € HT (Gold) | **incluse, même en gratuit** | oui, dès Silver |
| ImmobilierLoyer | 7,70 € | 11,00 € | 16,50 € | quota 1/an par 10 biens | multi-propriétaires (+ option SCI 5 €/mois) |
| Smartloc | 7,00 € | 20,00 € | 20,00 € | incluse (annuel), sinon 4 €/signataire | non affiché |
| Qalimo | 4,90 € | 24,50 € (4,90 €/bien) | 34,30 € (forfait Pro) | **payante : 2,90 €/document** | plan Business (devis) seulement |
| BailFacile | 9,99 € | 25,99 € (9,99 + 4 €/bien) | 45,99 € | incluse, illimitée | non affiché |
| Gererseul | 9,75 € | ~41 € (117 €/an/bien, −15 %) | devis | **payante : 4,99 €/document** | non affiché |
| Monsieur Hugo (hybride logiciel + services) | 14,90 € | 74,50 € (14,9 €/bien) | ~145 € (dégressif dès le 8e) | **9,90 €/bail en sus** (offre à la carte) + EDL 5,99 € | non affiché |
| **Propryo** | **2,99 €** (ou 0 € documents) | **9,90 € forfait** | **19,90 € forfait (≤ 30 lots)** | **incluse** (+ OTP prêt) | **inclus au plan Patrimoine** |

**Lecture** : à 5 lots, **seul Rentila (l'ancre low-cost historique, interface datée) est moins cher** ; tous les outils modernes sont 2 à 4× plus chers que Propryo, et l'hybride Monsieur Hugo (qui vend la protection juridique et le dépannage avec le logiciel, engagement 12 mois) est 7× plus cher. **La synchronisation bancaire automatique est un standard de marché** : Rentila l'inclut jusque dans son gratuit, Qalimo dans tous ses plans (GoCardless + Linxo, confirmé par leurs mentions légales) — Propryo la livre **T1 2027, incluse dès Investisseur** (§11), sans add-on payant (la leçon Qalimo : la facturer à part paraît chiche). À 10 lots, Propryo 19,90 € contre BailFacile 45,99 € et Qalimo 34,30 €. Le **forfait par palier** (vs compteur par bien) est un argument de simplicité et de prévisibilité aligné avec le WHY.

**Les pros et la gestion déléguée — le référentiel de l'étape agences (§11)** : Septeo (ICS/Crypto/ADB, 86 % de couverture fonctionnelle) et LOCKimmo se vendent **sur devis à ~80-300 €/mois/utilisateur** (relevé avril 2026) ; les agences en ligne facturent au loyer (Manda 5,9 % TTC) ; Monsieur Hugo occupe l'entre-deux « tranquillité ». Deux lectures : (a) le plafond de prix du marché est très au-dessus de Propryo — notre grille a de la marge ; (b) pour l'attaque du marché des agences en 2028, un module Propryo à ~49 €/mois/utilisateur resterait **2 à 6× sous les pros** avec le socle déjà construit (CRG au backlog produit).

Changements notables depuis avril : Qalimo a **supprimé son plan gratuit** ; BailFacile est passé à 9,99 € + 4 €/bien ; Rentila s'est restructuré (Silver/Gold, signature incluse partout, multi-utilisateurs dès Silver).

### 5.2 — Différenciants Propryo qui survivent à l'examen

L'examen honnête du panel retire deux « exclusivités » v1 (la signature incluse existe chez Rentila/BailFacile ; le multi-utilisateurs existe chez Rentila et Smovin). Restent, vérifiables en démo :

1. **Import de l'acte notarié → création du bien** — introuvable ailleurs ; l'onboarding au moment exact où un bailleur cherche un outil.
2. **Un seul moteur financier, juste au centime** — « en + ou en − ? » : cash-flow réel, retards expliqués, N-1 à période comparable. Côté banque, **le choix appartient au bailleur** : relevé importé (OFX/Excel) sans rien connecter, ou synchronisation automatique (T1 2027) — même chaîne, même 2044.
3. **Conformité automatique** — quittance seulement si soldé, IRL jamais rétroactive + prescription 1 an, verdict DPE bloquant : l'app empêche la faute.
4. **Timeline du bail** — chaque révision/avenant tracé, la preuve en cas de litige.
5. **Souveraineté démontrable** — UE, zéro CDN, zéro tracker, documents générés localement.
6. **Prix forfaitaire simple** — 4 paliers, pas de compteur par bien, tout inclus dès 2,99 €.
7. Signature à distance **incluse** (vs 2,90-4,99 €/document chez Qalimo/Gererseul) et partage SCI avec **isolation par entité au niveau base** — pas exclusifs, mais au meilleur niveau du panel.

### 5.3 — Personas

| Persona | Description | Plan |
|---|---|---|
| Le primo-bailleur | 25-45 ans, 1er bien, cherche « faire un bail gratuit » | Gratuit → Essentiel 2,99 € |
| Le bailleur autonome | 35-55 ans, 2-5 lots, gère sans agence | Investisseur 9,90 € |
| La SCI familiale | 45-70 ans, 6-30 lots, plusieurs associés | Patrimoine 19,90 € |

---

## 6. L'offre (grille figée le 19/08/2026)

| Plan | Lots | Périmètre | Mensuel | Annuel (2 mois offerts) |
|---|---|---|---|---|
| **Gratuit** | 1 | Documents : bail conforme, EDL, quittance — PDF illimités | 0 € | — |
| **Essentiel** | 1 | Tout Propryo | 2,99 € | 29 € |
| **Investisseur** | ≤ 5 | Tout Propryo, multi-bailleurs | 9,90 € | 99 € |
| **Patrimoine** | ≤ 30 | + partage SCI multi-utilisateurs | 19,90 € | 199 € |

Le Gratuit n'est pas une démo : c'est **l'arme d'acquisition** (§8). La frontière est nette : gratuit = documents générés localement (coût de service nul) ; payant = la valeur récurrente.

**Synchronisation bancaire (décision 19/08)** : **incluse dès Investisseur à partir de T1 2027** (pas d'add-on payant — Rentila et Qalimo l'incluent) ; l'Essentiel garde l'import par relevé (OFX/Excel). **La grille 9,90/19,90 est maintenue** : déjà sous tous les outils modernes à parc égal, au-dessus du seul low-cost historique qu'on ne cherche pas à battre sur le prix — réexamen à la calibration de janvier 2027 avec les données réelles de conversion.

**Cogestion (règle figée 19/08)** : **1 co-gestionnaire inclus dans tout plan payant** ; sièges supplémentaires **2,99 €/mois** ; et **gratuit si le co-gestionnaire possède son propre compte payant ≥ Investisseur (9,90 €)** — deux associés abonnés cogèrent sans surcoût, ce qui pousse chaque associé à avoir son compte (boucle virale interne aux SCI).

**Essai et avantages (figés 19/08)** :
- **Essai 30 jours, toutes fonctions, sans carte bancaire** — 30 jours car le cycle de valeur d'un bailleur est mensuel (loyer → rapprochement → quittance) : un essai de 15 jours ne le couvre pas. À J+30, **retombée automatique sur le plan Gratuit** : aucune donnée perdue, la quittance mensuelle ramène l'utilisateur — une sortie d'essai qu'aucun concurrent n'offre (leurs essais expirent sur un mur payant). Benchmark : un essai complet convertit 8-12 % contre 3-5 % en freemium seul (OpenView/Lenny) — c'est un levier direct vers le scénario central.
- **Parrainage client** : 1 mois offert au parrain par filleul devenu payant (cumulable), 1 mois au filleul.
- **Early bird** au lancement : −50 % la 1re année pour les 100 premiers.

---

## 7. Modèle économique — hypothèses sourcées

> Chaque taux vient d'un benchmark publié (sources en annexe). Valeur « prudente » = celle du modèle central §10.

| Maillon | Prudent | Benchmark publié | Source |
|---|---|---|---|
| Visiteur → inscrit (landing-outil dédiée) | **4 %** blended | landing pages : médiane 6,6 % (41 000 pages) ; SaaS 3,8 % ; sites entiers 1-5 % | Unbounce 2024, Klipfolio |
| Inscrit gratuit → payant | **3 %** | freemium « bon » 3-5 %, médian B2C 2,2 %, top 6-8 % | OpenView/Lenny 2023, RevenueCat 2025 |
| Activation (inscrit → actif) | 30 % | médiane SaaS ~30-35 % | Userpilot, ProductLed |
| Churn mensuel | **5 %** | SaaS réel 3,2 %/mois (Recurly 07/2026), B2C ~6,5 % | Recurly, Vitally |
| ARPU catalogue / **effectif** | 9,50 € / **8,85 €/mois** | mix 35/45/20 ; remise annuelle (2 mois offerts) déduite au prorata des 40 % d'abonnés annuels | grille §6 |
| Marge brute | ~85 % | Stripe ~2 %, hébergement marginal | — |
| LTV nette | ~160 € | 9,50 × 20 mois × 0,85 | dérivé |
| CAC paid ads | **120-150 €** | CPC FR ~2 € ÷ 5 % ÷ 3 % (reconstruction) | Talyco/Junto 2025-26 |
| CAC organique | ~15-30 € | coût du contenu amorti (§8.4) | interne |

**Conséquence structurante — assumée** : au vu du CAC paid (120-150 €) face à une LTV de ~160 €, **la publicité ne peut être qu'un appoint d'amorçage**. L'acquisition est organique par construction, pas par préférence. C'est le chapitre suivant.

*Note de rigueur : la v1 de ce BP utilisait 15 % de conversion freemium→payant et un CAC de 25 € — indéfendables face aux données publiées. Les cibles clients ont été recalculées en conséquence (§10).*

---

## 8. Le moteur d'acquisition — SEO par pages-outils (le cœur du plan)

### 8.1 — La preuve que le canal construit une entreprise (données du 19/08/2026)

- **BailFacile** — l'acteur qui a exécuté exactement cette stratégie : sitemap compté en direct = **1 391 pages** (1 209 guides + **39 pages-outils documents** + **7 générateurs de bail** + 126 pages locales dont ~15 « encadrement des loyers {ville} »). Résultat : **~110-220 k visites/mois** (SimilarWeb 07/2026 : 110,5 k, organique = 55,8 % = 1er canal ; Semrush 2025 : 218 k), ~2 900 mots-clés positionnés. Leur page `/documents/quittance-loyer` (« quittance de loyer **gratuite** », générateur → essai payant) est le modèle : **la page-outil ranke ET convertit**.
- **La contre-preuve : Rentila** — 214-235 k visites/mois mais **organique ~33 k seulement, 100 % marque** (« rentila » 27 100 recherches/mois), 13 pages + 200 articles de blog, **zéro page-outil**. Sans générateurs, pas de captation d'intention : son trafic, c'est ses utilisateurs existants qui se connectent.
- **Qalimo** applique la thèse BailFacile à échelle 1/10 (181 pages, dont `/quittance-de-loyer/`, `/etat-des-lieux/`) — le chemin est praticable en partant petit.

### 8.2 — L'avantage structurel de Propryo sur ce canal

Chez BailFacile, la page-outil est un **entonnoir vers un essai payant**. Chez Propryo, la page-outil **EST le produit** : le plan Gratuit génère le bail, la quittance, l'EDL — vraiment, sans carte bancaire, sans limite de durée. Trois effets :
1. **Meilleure réponse à la requête** → meilleur comportement utilisateur → meilleur ranking (un générateur réel bat un modèle Word à télécharger).
2. **La quittance est mensuelle** : le bailleur du Gratuit *revient tous les mois* — pression de conversion récurrente, là où un téléchargement de modèle est un one-shot.
3. **Fraîcheur réglementaire automatique** : l'IRL est synchronisée sur l'API INSEE (en prod), le verdict DPE est intégré — nos pages « indice IRL » et « DPE location » peuvent afficher la donnée du jour sans maintenance.

### 8.3 — Le plan de bataille (3 piliers)

| Pilier | Contenu | Pourquoi ça ranke |
|---|---|---|
| **P1 — Générateurs** (~10 pages) | bail vide / meublé / mobilité / étudiant / colocation / parking · quittance · EDL entrée & sortie · caution | Intention maximale (« gratuit », « modèle », « PDF ») ; l'outil réel bat l'article |
| **P2 — Guides longue traîne** (12-15/mois) | la carte des 1 209 guides BailFacile : variantes par cas (« quittance colocation », « EDL sortie meublé », « IRL bail commercial »…), réglementaire daté (IRL du trimestre, calendrier DPE, 2044 ligne à ligne) | Ahrefs 2025 : seules 1,74 % des pages neuves atteignent le top 10 en < 1 an, MAIS 40,8 % de celles qui y arrivent le font **en < 1 mois** — la longue traîne à faible concurrence monte vite ; les têtes de requêtes viendront à 12-24 mois |
| **P3 — Comparatifs & local** | « Propryo vs Rentila/BailFacile/Qalimo », « meilleur logiciel 2026 », « encadrement des loyers {ville} » (modèle des 15 pages locales BailFacile) | Faible volume, intention d'achat maximale |

**Production** : chaîne IA (celle qui a construit le produit) + relecture humaine (rédacteur spécialisé, 400 €/mois) + validation juridique par sondage. Cadence : **45 pages avant le lancement** (10 générateurs + 30 guides + 5 comparatifs), puis 12-15 guides/mois → **~300 pages fin 2027, ~500 fin 2028**. Coût marginal ~30 €/page contre 100-150 € au prix du marché — un avantage de coût structurel.

### 8.4 — Le modèle de montée du trafic (calibré sur le panel)

Calibrage : BailFacile ≈ 80-160 visites/page/mois (domaine âgé, autorité) ; Gererseul 48 k visites pour ~1 400 mots-clés ; un domaine neuf fait moins bien les 18 premiers mois (Ahrefs). Hypothèses prudentes :

| Fin de période | Pages publiées | Visites/mois (organique + amorçage) | Justification |
|---|---|---|---|
| déc. 2026 | ~60 | **6 000** | longue traîne naissante (20-40/page) + ads 600 €/mois + communautés |
| déc. 2027 | ~300 | **15 000** | ~40-50/page en moyenne, domaine 15 mois, premières têtes de requêtes |
| déc. 2028 | ~500 | **32 000** | autorité installée, quittance mensuelle = trafic récurrent |
| déc. 2029 | ~650 | **55 000** | ≈ la moitié du BailFacile bas — jamais supposé le dépasser |

**Risques du canal, nommés** : (a) **AI Overviews** — Ahrefs (02/2026) mesure −58 % de CTR en position 1 quand un encart IA est présent ; mitigation : les pages-**outils** résistent (Google ne génère pas un bail signé conforme), la longue traîne est moins exposée ; (b) dépendance Google — mitigation : le produit lui-même est viral (chaque signature à distance et chaque candidature met un locataire devant une page Propryo), plus newsletter et marque ; (c) **les volumes de recherche exacts ne sont pas publiés** — action immédiate : les tirer de Google Keyword Planner (gratuit) pour calibrer le plan éditorial page par page avant septembre.

### 8.5 — Canal 2 : le réseau de prescripteurs (CGP, comptables, professionnels de la transaction)

Le SEO apporte le volume ; les prescripteurs apportent **la confiance et le segment SCI** (l'ARPU le plus élevé de la grille). Trois familles, chacune avec une raison *propre* de prescrire — pas une commission plaquée :

| Prescripteur | Pourquoi il prescrit | Le déclencheur produit |
|---|---|---|
| **Expert-comptable / comptable** | Ses clients bailleurs arrivent avec des relevés en vrac ; Propryo importe le relevé (OFX/Excel), catégorise selon des règles validées et prépare la 2044 → dossier propre, moins d'heures ingrates | L'aide 2044 et l'import bancaire, déjà en prod |
| **CGP** (conseiller en gestion de patrimoine) | Il vend le projet locatif puis laisse le client seul avec la gestion ; Propryo est le « service après-vente » qui sécurise le projet — un client qui voit son cash-flow réel est un client rassuré, qui réinvestit avec son CGP | Le moteur Finances « en + ou en −, au centime » |
| **Vendeur de biens / agent immobilier / notaire** | Au closing, le client repart avec son acte — et **Propryo crée le bien depuis l'acte notarié** : le prescripteur offre un démarrage en 5 minutes, un cadeau de clôture qui ne lui coûte rien | L'import d'acte, introuvable ailleurs |

**Mécanique V1 (figée 19/08, volontairement simple)** : page `propryo.fr/partenaires` + **code partenaire** + kit d'une page + démo de 15 minutes + suivi manuel des attributions. **Rémunération à deux volets** :
- **Commission 30 % de la première année d'abonnement** (CGP, vendeurs de biens, agents — SIREN requis pour facturer) : sur encaissé uniquement, paiement trimestriel sur facture (minimum 50 €), contrat d'apporteur simple **sans mandat** (l'apporteur ne négocie ni ne signe rien au nom de Propryo — contrat type produit par l'avocat des CGU). Coût par client : ~9-60 € selon le plan, soit 3-4× moins que l'acquisition publicitaire.
- **Avantage 100 % reversé au client** (notaire, expert-comptable, dont la déontologie encadre ou interdit les commissions) : le filleul reçoit 6 mois offerts au lieu de 3.
Le filleul d'un prescripteur reçoit **3 mois offerts** (remplace l'essai standard). Plus tard, si le canal prouve : tableau de bord partenaire (les programmes GLI/MRH/EC identifiés en avril restent l'étage d'après).

**L'approche — en 3 cercles, du chaud vers le froid** :

| Cercle | Quand | Qui et comment | Objectif |
|---|---|---|---|
| **1 — Réseau en propre** | nov. 2026 | Le comptable du fondateur, les notaires de ses propres actes, les agences avec lesquelles il travaille. RDV de 15 min, démo ciblée sur LE déclencheur du prescripteur (acte / 2044 / Finance), kit + code. Crédibilité maximale : le fondateur utilise l'app sur son propre parc de 37 lots | **10 partenaires signés** |
| **2 — Local Alsace** | T1 2027 | Cabinets EC orientés immobilier, CGP indépendants (annuaires CNCGP/ANACOFI), agences indépendantes, chambre des notaires. Email personnalisé + LinkedIn + relance, ~10 démos/mois par le fondateur (~2 j/mois). **Webinar de saison « préparez la 2044 de vos clients bailleurs » (mars-mai)** — le moment exact où EC et CGP ont le problème entre les mains | 20-30 prescripteurs actifs |
| **3 — Échelle** | 2027+ **si le canal prouve** | Groupements CGP, réseaux d'agences, salon Patrimonia (sept.) — jamais avant les chiffres des cercles 1-2 | selon calibration |

**KPI du canal** (mesurés dès janvier 2027) : partenaires *actifs* (≥ 1 filleul/trimestre), filleuls/partenaire, conversion filleul → payant.

**Réalisme** : cycle long (6-12 mois pour qu'un cabinet prescrive régulièrement). **Ce canal n'est pas modélisé dans le scénario central** (aucune donnée pour le chiffrer honnêtement) : il fait partie, avec l'accélération contenu, de ce qui sépare le central de l'ambitieux — et c'est le premier candidat de calibration de janvier 2027.

### 8.6 — Notoriété : fabriquée, pas espérée

Ni pari sur un bouche-à-oreille spontané, ni pub massive (le CAC publicitaire de 120-150 € pour 160 € de valeur-vie l'interdit — §7). Le mix, par ordre d'investissement :
1. **SEO** — l'investissement principal : un actif qui se cumule (chaque page continue de travailler), contrairement à la pub qui s'évapore.
2. **Pub d'amorçage seulement** — 600 €/mois pendant 3-6 mois, pour exister pendant que le SEO monte ; maintenue ou coupée à la calibration de janvier 2027.
3. **Les boucles virales sont dans le produit** — chaque quittance envoyée, chaque signature à distance, chaque candidature en ligne expose un locataire (futur bailleur ou prescripteur d'un bailleur) à Propryo ; le parrainage (1 mois/1 mois) donne au bouche-à-oreille une raison d'accélérer.
4. **Un coup de lancement gratuit** — Product Hunt, r/vosfinances, presse spécialisée immobilier.

Réalisme Google assumé : la longue traîne peut ranker en < 1 mois, les têtes de requêtes prendront 12-24 mois sur un domaine neuf (Ahrefs, §8.3) — c'est précisément ce trou de 12 mois que couvrent l'amorçage publicitaire, les prescripteurs (indépendants de Google) et les boucles produit.

---

## 9. Le funnel dérivé

```
visites/mois (modèle §8.4)
  × 4 % visiteur → inscrit        (landing-outil, Unbounce/Klipfolio)
  × 3 à 5 % inscrit → payant      (benchmark freemium, tiré vers le haut
                                    par la quittance mensuelle et le palier 2,99 €)
  − churn 5 %/mois sur la base    (Recurly/Vitally)
  = clients payants (cohortes)
```

Exemple au régime de fin 2027 (15 000 visites/mois) : 600 inscrits/mois → **18-30 nouveaux payants/mois** selon le taux de conversion. C'est ce flux, cumulé en cohortes avec churn, qui produit les scénarios ci-dessous — dans ce sens-là, jamais l'inverse.

---

## 10. Projections — trois scénarios dérivés

| Hypothèses | Prudent | Central | Ambitieux |
|---|---|---|---|
| Conversion inscrit → payant | 3 % | 4 % | 5 % |
| Vélocité contenu | plan nominal | nominal | ×1,5 + prescripteurs actifs (§8.5) |
| Churn mensuel | 5 % | 5 % | 4 % |

> **Source : le classeur `propryo-modele-financier.xlsx`** (cohortes mensuelles août 2026 → déc. 2029, toutes hypothèses modifiables). Ces chiffres incluent ce que les versions précédentes oubliaient : **les cotisations de micro-entreprise (21,2 % du CA, à confirmer comptable)** et **la remise annuelle dans l'ARPU** (2 mois offerts × 40 % d'annuels → ARPU effectif 8,85 €).

| Fin de période | Prudent | Central | Ambitieux |
|---|---|---|---|
| **2026** (3 mois) | 24 clients · ARR 3 K€ | 34 · 4 K€ | 56 · 6 K€ |
| **2027** | 135 · **ARR 15 K€** | 181 · **20 K€** | 337 · **37 K€** |
| **2028** | 351 · 38 K€ | 468 · 51 K€ | 893 · 97 K€ |
| **2029** | 710 · **77 K€** | 947 · **103 K€** | 1 828 · **199 K€** |

- **Résultat mensuel positif** : août 2027 (prudent) · juin 2027 (central) · avril 2027 (ambitieux) — le projet s'autofinance dans les trois cas à l'été 2027, **coût de la synchronisation bancaire provisionné** (forfait agrégateur + coût par compte dès avril 2027 — placeholders jaunes en attendant les devis Phase 0).
- **Avance de trésorerie maximale : ~12 K€** (point bas −11,6 / −10,9 / −9,8 K€ selon le scénario), remboursée entre janvier et décembre 2028. Aucune levée nécessaire.
- **Valorisation indicative fin 2029** (3-5× ARR) : 0,23-0,38 M€ prudent · **0,30-0,50 M€ central** · 0,58-0,97 M€ ambitieux.
- **Sensibilité** (les vrais leviers, pilotables dans le classeur) : +1 point de conversion freemium = **+33 % de clients** partout · churn 5 → 3,5 % = +40 % de base à 3 ans · ×2 sur la vélocité contenu ≈ +60-80 % de trafic fin 2027. La calibration de janvier 2027 (§11) dira lequel pousser.
- **Bascule société calculée automatiquement** (au franchissement du plafond micro sur 12 mois glissants) : prudent et central **restent en micro-entreprise jusqu'à fin 2029** (le central frôle le plafond — la bascule est pour début 2030) ; l'ambitieux bascule en **mars 2029** (création de société + expert-comptable + prélèvements ~28 % comptés). Hébergement évolutif inclus (base Supabase/Resend + 0,10 €/client/mois) ; revenus de cogestion inclus (règle §6).
- **Upside non modélisé, volontairement** : les clients apportés par les prescripteurs (§8.5) n'entrent pas dans le funnel modélisé (seules leurs commissions sont provisionnées en charge) — chaque filleul réel s'ajoute à ces chiffres.
- *Trajectoire de rigueur : la v1 posait 700 clients fin 2027 (conversion 15 %, indéfendable) ; la v2 en dérivait 280 mais oubliait cotisations et remise annuelle ; cette v3 sort du classeur, complet. C'est moins flatteur — et c'est défendable ligne à ligne.*

---

## 11. Exécution

### 11.1 — Calendrier (décisions figées, [MISE-EN-PROD.md](MISE-EN-PROD.md))

| Quand | Quoi |
|---|---|
| Août | Domaine propryo.fr · statut micro-entreprise (comptable) · **volumes Keyword Planner tirés → plan éditorial calibré** |
| Septembre | Emails (Resend) · site + `app.propryo.fr` · CGU/CGV/RGPD (avocat ~3 K€) · **bêta privée** · production des 45 pages SEO |
| Octobre | **Chantier PLANS-QUOTAS-ESSAI** (l'app n'a pas encore de notion de plan : matrice de gating Gratuit/payant, essai 30 j, retombée Gratuit, webhooks Stripe, application côté serveur) · **lancement public 14/10** avec les 45 pages en ligne · early bird |
| Novembre | **Canal prescripteurs — cercle 1** : page partenaires + kit + codes Stripe · 10 partenaires signés dans le réseau en propre (§8.5) |
| Janvier 2027 | **Calibration sur données réelles** : conversion, churn, mix, trafic/page, apport prescripteurs — le scénario se choisit là, pas avant |
| T4 2026 | **Synchro bancaire — dogfood** : Enable Banking gratuit sur les comptes du fondateur (CM+CA), toute la chaîne validée sur données réelles à 0 € |
| T1 2027 | **Prescripteurs — cercle 2 Alsace** (~10 démos/mois) · **webinar 2044 de saison fiscale** (mars-mai) · **synchro bancaire ouverte aux clients** (provider retenu sur devis, arrangement agent + DPA — incluse dès Investisseur) |
| S2 2027 | **Portail locataire (bêta)** — rétention + boucle virale (chaque locataire voit Propryo) |
| **2028** | **🎯 Attaque du marché des agences immobilières** : module pilote mandants + CRG + honoraires (le CRG de gérance est déjà au backlog produit), **10-20 cabinets pilotes recrutés via les agents déjà prescripteurs** (§8.5 — la tête de pont commerciale existe), pricing cible ~49 €/mois/utilisateur = 2-6× sous Septeo/LOCKimmo. Déclenchement conditionné à la calibration 2027 |
| 2029 | Échelle agences · ouverture Belgique/Luxembourg si les indicateurs sont verts |

### 11.2 — L'équipe : un fondateur outillé

Développeur solo **avec une chaîne d'agents IA** (développement, audit systématique par agent indépendant, ~3 000 tests) : capacité d'une petite équipe au coût d'une personne. La même chaîne produit le contenu SEO à ~30 €/page. Ce qui a livré en 4 mois (mai-août) ce que le plan d'avril chiffrait en 2 trimestres.

### 11.3 — Cash (détail complet : classeur financier, feuilles P&L et modèles)

Dépenses externes 2026 (~9,3 K€) : avocat 3 000 · rédacteur SEO 1 600 (sept.-déc.) · ads amorçage 1 800 · **RC professionnelle 450/an** · **hébergement évolutif** (Supabase Pro + Resend 45 €/mois + 0,15 €/client/mois — tarifs vérifiés sur supabase.com le 19/08) + outils 15 €/mois · comptabilité 250 · logo/finitions 750 · buffer 800. S'y ajoutent les charges proportionnelles au CA (Stripe 2 %, **cotisations micro ~21,2 %**, commissions apporteurs) — et à la bascule société (automatique dans le modèle) : création ~800 €, expert-comptable ~150 €/mois, prélèvements ~28 % (approximation à affiner comptable). **Avance de trésorerie maximale ~12 K€** (point bas mi-2027), remboursée courant 2028. **Recrutements à seuils** : support freelance > 300 clients ; rien d'autre avant.

---

## 12. Risques et parades

| Risque | Prob. | Parade |
|---|---|---|
| **AI Overviews / évolution Google** (−58 % CTR pos. 1 mesuré, Ahrefs 02/2026) | élevée sur les requêtes info | pages-**outils** en cœur de plan (un encart IA ne génère pas un bail conforme signé) ; produit-viral (signatures, candidatures) ; newsletter ; ne jamais dépendre d'un seul pilier |
| Conversion freemium < 3 % | possible | le palier 2,99 € et la quittance mensuelle sont faits pour ça ; sinon : bascule vers essai limité, mesurée en janvier 2027 |
| Dépendance au fondateur | structurelle | chaîne d'agents + 3 000 tests + docs de chantier = transmissible ; seuils de recrutement définis |
| Rentila écrase les prix (4,90 € / 5 lots) | actée | ne pas se battre sur son terrain : modernité + conformité + acte→bien + finance au centime ; Rentila est l'ancre low-cost depuis 10 ans sans empêcher BailFacile de croître à 26 €/5 lots |
| Un acteur copie l'import d'acte | moyenne à 18 mois | avance d'exécution ; la copie d'une feature ne copie pas la simplicité du tout |
| Seuils AE / TVA | souhaitable | bascule SASU préparée, prix pensés TTC |
| Dépendance Supabase | faible | PostgreSQL standard exportable, sauvegardes |

---

## 13. L'ambition

**Fin 2027** : le projet s'autofinance (résultat mensuel positif entre avril et août 2027 dans les trois scénarios, synchro bancaire provisionnée), 135-337 clients selon la conversion réelle, un actif SEO de ~300 pages qui travaille tout seul — et les prescripteurs en plus, non comptés.

**Fin 2029** : 710-1 830 clients, 77-199 K€ ARR, résultat cumulé +35 à +127 K€ — et deux portes, toutes deux bonnes : **poursuivre** (portail locataire, petites agences, Belgique/Luxembourg) ou **céder** dans un marché qui consolide à coups d'acquisitions (Septeo : 8 en 2024 ; Manda : 43 M€ levés), à 3-5× l'ARR.

**Ce qui rend ce plan crédible** : le produit est construit et prouvé ; le canal d'acquisition a une preuve de marché documentée (BailFacile) et un avantage structurel (l'outil EST le produit) ; chaque taux du modèle a une source publiée et **chaque chiffre sort d'un classeur vérifiable, cotisations sociales comprises** ; l'avance de trésorerie maximale est ~12 K€ ; et le scénario **prudent** — celui où tout est au plancher des benchmarks — reste un projet rentable.

---

## Annexe — sources principales

**Concurrence** (consultées le 19/08/2026) : rentila.com/tarifs · bailfacile.fr/tarifs · qalimo.fr/tarif · smartloc.fr/tarifs · gererseul.com/tarifs · immobilierloyer.com/acheter.php · smovin.app/fr/tarifs.
**SEO** : sitemaps bailfacile.fr (1 391 URLs), qalimo.fr (181), rentila.com (comptés le 19/08/2026) · SimilarWeb bailfacile.fr & rentila.com (07/2026) · Semrush public rentila.com (12/08/2026) · Ahrefs « How long does it take to rank » (maj 15/05/2025) · Ahrefs AI Overviews CTR (02/2026).
**Funnel** : Unbounce Conversion Benchmark Report (Q4 2024) · Klipfolio signup benchmarks · OpenView/Lenny's Newsletter free-to-paid (2023) · RevenueCat State of Subscription Apps (2025) · Userpilot/ProductLed activation · Recurly churn benchmarks (07/2026) · Vitally B2B/B2C · Talyco/Junto/Leo Marchal CPC-CPL France (2025-26).
**Marché** : INSEE Focus 359 (2025) · Verified Market Reports (2024).
