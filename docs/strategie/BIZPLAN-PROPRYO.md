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
| **Ça coûte combien ?** | ~9,3 K€ de dépenses externes la 1re année ; **avance de trésorerie maximale ~15 K€** (cotisations sociales et synchro bancaire incluses), remboursée en 2028-2029. Aucune levée : bootstrappé. |
| **Ça rapporte quoi ?** | Scénarios **sortis du modèle financier joint** (§10), avec un démarrage à notoriété nulle assumé (800 visites au lancement) : **résultat mensuel positif entre août 2027 et janvier 2028**. Fin 2029 : prudent 613 clients / 67 K€ ARR · central 818 / 89 K€ · ambitieux 1 572 / 171 K€ — hors prescripteurs, et **hors option B2B agences qui, activée au go/no-go de T4 2027, porte la trajectoire combinée à 114-218 K€** (§10 bis). Valorisation indicative 0,20-0,86 M€, davantage avec le B2B. |
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
| **Locataire.live** (Michaël Ferrari / Esprit Riche — nouvel entrant, relevé 20/08) | 0 € (gestion complète 1 lot) | 8,25 € (Solo 99 €/an, **annuel seul**) | 16,60 € (Pilote 199 €/an lancement « bloqué à vie », 299 € ensuite, illimité) | incluse | rôles équipe dès Solo |
| **Propryo** | **2,99 €** (ou 0 € documents) | **9,90 € forfait** | **19,90 € forfait (≤ 30 lots)** | **incluse** (+ OTP prêt) | **inclus au plan Patrimoine** |

**Lecture** : à 5 lots, **seul Rentila (l'ancre low-cost historique, interface datée) est moins cher** ; tous les outils modernes sont 2 à 4× plus chers que Propryo, et l'hybride Monsieur Hugo (qui vend la protection juridique et le dépannage avec le logiciel, engagement 12 mois) est 7× plus cher. **La synchronisation bancaire automatique est un standard de marché** : Rentila l'inclut jusque dans son gratuit, Qalimo dans tous ses plans (GoCardless + Linxo, confirmé par leurs mentions légales) — Propryo la livre **T1 2027, incluse dès Investisseur** (§11), sans add-on payant (la leçon Qalimo : la facturer à part paraît chiche). À 10 lots, Propryo 19,90 € contre BailFacile 45,99 € et Qalimo 34,30 €. Le **forfait par palier** (vs compteur par bien) est un argument de simplicité et de prévisibilité aligné avec le WHY.

**⚠️ Le nouvel entrant à suivre de près : Locataire.live** (Michaël Ferrari, le formateur immo d'Esprit Riche — 3 000+ investisseurs formés, ~40 lots en propre). Prix quasi calqués sur les nôtres (99 €/an ≤ 5 lots ; illimité 199 €/an en lancement, « tarif bloqué à vie »), gratuit 1 lot en gestion complète, signature incluse, scoring IA des candidatures, espace locataire. **Sa force n'est pas le produit, c'est la distribution** (son école est son canal d'acquisition intégré). **Ses trous, vérifiés le 20/08 : aucun import bancaire ni synchro** (juste un import Excel du parc ; sa « comptabilité » = exports 2044/2072 — donc pas de payé réel, pas de cash-flow réel, pas de rapprochement), **annuel uniquement** (pas de mensuel sans engagement), pas d'import d'acte. Notre point fort n°1 — la finance au centime nourrie par la banque — est exactement ce qui lui manque.

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
- **Fondateurs (figé 20/08)** : les **10-15 bêta-testeurs proches** reçoivent un statut « Fondateur » — **gratuit à vie**, nominatif, non transférable, plafonné à 15 comptes, tous plans jusqu'à Patrimoine. Coût théorique ~130 €/mois à terme, contre des retours de terrain qui valent bien plus — les smokes réels trouvent ce que les tests automatisés ne voient pas.
- **Offre de lancement** : **tout abonnement pris en 2026 garde son tarif à vie** (prix garanti, aucune démarque). Le comparatif §5 montre une marge de hausse réelle (12,90/24,90 resteraient sous le marché) : « bloqué à vie » a une valeur croissante, coûte zéro aujourd'hui, crée l'urgence sans ancrer de prix cassé — l'essai 30 jours fait déjà le dérisquage. *(Remplace l'« early bird −50 % pour 100 » du plan d'avril, écarté le 20/08 : trop cher, doublon avec l'essai, et ancre un prix bradé.)*

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
| oct. 2026 (lancement) | 45 | **800** | **notoriété nulle assumée** : ~300 clics d'ads (600 € à ~2 €/clic) + pic de lancement (Product Hunt, communautés) qui retombe + SEO en cours d'indexation |
| déc. 2026 | ~60 | **1 500** | la longue traîne commence à sortir (Ahrefs : < 1 mois possible sur faible concurrence), ads maintenues |
| déc. 2027 | ~300 | **12 000** | ~40 visites/page en moyenne, domaine 15 mois, premières têtes de requêtes |
| déc. 2028 | ~500 | **28 000** | autorité installée (2 ans), quittance mensuelle = trafic récurrent |
| déc. 2029 | ~650 | **50 000** | ≈ la moitié du BailFacile bas — jamais supposé le dépasser |

**Risques du canal, nommés** : (a) **AI Overviews** — Ahrefs (02/2026) mesure −58 % de CTR en position 1 quand un encart IA est présent ; mitigation : les pages-**outils** résistent (Google ne génère pas un bail signé conforme), la longue traîne est moins exposée ; (b) dépendance Google — mitigation : le produit lui-même est viral (chaque signature à distance et chaque candidature met un locataire devant une page Propryo), plus newsletter et marque ; (c) **les volumes de recherche exacts ne sont pas publiés** — action immédiate : les tirer de Google Keyword Planner (gratuit) pour calibrer le plan éditorial page par page avant septembre.

### 8.5 — Canal 2 : le réseau de prescripteurs (CGP, comptables, professionnels de la transaction)

Le SEO apporte le volume ; les prescripteurs apportent **la confiance et le segment SCI** (l'ARPU le plus élevé de la grille). Trois familles, chacune avec une raison *propre* de prescrire — pas une commission plaquée :

| Prescripteur | Pourquoi il prescrit | Le déclencheur produit |
|---|---|---|
| **Expert-comptable / comptable** | Ses clients bailleurs arrivent avec des relevés en vrac ; Propryo importe le relevé (OFX/Excel), catégorise selon des règles validées et prépare la 2044 → dossier propre, moins d'heures ingrates | L'aide 2044 et l'import bancaire, déjà en prod |
| **CGP** (conseiller en gestion de patrimoine) | Il vend le projet locatif puis laisse le client seul avec la gestion ; Propryo est le « service après-vente » qui sécurise le projet — un client qui voit son cash-flow réel est un client rassuré, qui réinvestit avec son CGP | Le moteur Finances « en + ou en −, au centime » |
| **Vendeur de biens / agent immobilier / notaire** | Au closing, le client repart avec son acte — et **Propryo crée le bien depuis l'acte notarié** : le prescripteur offre un démarrage en 5 minutes, un cadeau de clôture qui ne lui coûte rien | L'import d'acte, introuvable ailleurs |
| **Formateurs & influenceurs immo** (hors M. Ferrari, devenu concurrent — §5) | Ils vendent « gérez seul, sans agence » : Propryo est l'outil de leur thèse, et la commission 30 % correspond au modèle d'affiliation dont ils vivent déjà. **Urgence : les signer avant que Locataire.live ne les affilie** | Le produit complet qui rend leur promesse tenable |

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

Exemple au régime de fin 2027 (12 000 visites/mois) : ~480 inscrits/mois → **14-24 nouveaux payants/mois** selon le taux de conversion. C'est ce flux, cumulé en cohortes avec churn, qui produit les scénarios ci-dessous — dans ce sens-là, jamais l'inverse.

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
| **2026** (3 mois) | 13 clients · ARR 1,4 K€ | 19 · 2,1 K€ | 28 · 3,1 K€ |
| **2027** | 76 · **ARR 8 K€** | 102 · **11 K€** | 187 · **20 K€** |
| **2028** | 275 · 30 K€ | 367 · 40 K€ | 695 · 76 K€ |
| **2029** | 613 · **67 K€** | 818 · **89 K€** | 1 572 · **171 K€** |

- **Résultat mensuel positif** : janvier 2028 (prudent) · novembre 2027 (central) · août 2027 (ambitieux) — le projet s'autofinance dans les trois cas, **synchronisation bancaire provisionnée** (placeholders jaunes en attendant les devis Phase 0).
- **Avance de trésorerie maximale : ~15 K€** (point bas −14,8 / −13,7 / −11,7 K€ selon le scénario, atteint fin 2027), remboursée entre juillet 2028 et juin 2029. Aucune levée nécessaire.
- **Valorisation indicative fin 2029** (3-5× ARR) : 0,20-0,33 M€ prudent · **0,27-0,44 M€ central** · 0,51-0,86 M€ ambitieux.
- **Sensibilité** (les vrais leviers, pilotables dans le classeur) : +1 point de conversion freemium = **+33 % de clients** partout · churn 5 → 3,5 % = +40 % de base à 3 ans · ×2 sur la vélocité contenu ≈ +60-80 % de trafic fin 2027. La calibration de janvier 2027 (§11) dira lequel pousser.
- **Bascule société calculée automatiquement** (au franchissement du plafond micro sur 12 mois glissants) : prudent et central **restent en micro-entreprise sur toute la période** ; l'ambitieux bascule en **juin 2029** (création de société + expert-comptable + prélèvements ~28 % comptés). Hébergement évolutif inclus (base Supabase/Resend + 0,10 €/client/mois) ; revenus de cogestion inclus (règle §6).
- **Upside non modélisé, volontairement** : les clients apportés par les prescripteurs (§8.5) n'entrent pas dans le funnel modélisé (seules leurs commissions sont provisionnées en charge) — chaque filleul réel s'ajoute à ces chiffres.
- *Trajectoire de rigueur : la v1 posait 700 clients fin 2027 (conversion 15 %, indéfendable) ; la v2 en dérivait 280 mais oubliait cotisations et remise annuelle ; la v3 les comptait mais faisait démarrer le trafic à 3 000 visites dès le mois du lancement — irréaliste pour un domaine que personne ne connaît (objection Didier, 20/08). Cette v4 démarre à 800 visites et sort intégralement du classeur. C'est la version qu'on peut défendre ligne à ligne devant n'importe qui.*

---

## 10 bis. Le levier B2B — l'option agences, datée et chiffrée

Le scénario central est du B2C pur : c'est le plancher démontrable. **Le levier de taille du dossier est le B2B**, traité ici en option réelle — avec des jalons, des critères et un chiffrage — pas en vœu.

**Pourquoi c'est LE levier** :
- **ARPU ~98 €/mois par cabinet** (2 utilisateurs × 49 €) = **10× l'ARPU B2C** — et le marché pro paie aujourd'hui 80-300 €/mois/utilisateur (Septeo, LOCKimmo, sur devis).
- **Le socle produit est déjà en prod** : multi-entités avec isolation RLS, candidatures en ligne, signature à distance, documents au gabarit pro — et surtout **le pont existe déjà au backlog : le CRG de gérance** (relevé mensuel pour mandants, mockups faits) — le document exact qu'une agence produit chaque mois.
- **La tête de pont commerciale aussi** : les agents et vendeurs de biens du canal prescripteurs (§8.5) sont les premiers cabinets à convertir.

**Le chemin en 5 jalons** :

| Quand | Jalon |
|---|---|
| S2 2027 | **CRG de gérance en bêta** chez les gérants du réseau — teste la demande sans rien construire de neuf |
| T4 2027 | **GO/NO-GO B2B**, critères chiffrés : conversion B2C ≥ 3 % confirmée · ≥ 10 agents/vendeurs prescripteurs actifs · ≥ 5 gérants utilisant le CRG bêta |
| S1 2028 | Module agences **co-construit avec 3-5 cabinets** (mandants, honoraires, multi-utilisateurs agence) |
| S2 2028 | **10-20 cabinets pilotes payants** à ~49 €/mois/utilisateur |
| 2029 | Échelle : groupements, réseaux d'indépendants |

**Ce que ça ajoute** (feuille « Option B2B » du classeur, hypothèses modestes : 2 utilisateurs/cabinet, 40 cabinets fin 2029 = **1,25 % de la seule base Septeo ADB**) : **+11,8 K€ d'ARR fin 2028, +47 K€ fin 2029** → trajectoire combinée fin 2029 : **114 K€ (prudent) · 136 K€ (central) · 218 K€ (ambitieux)**, avec un revenu B2B qui se valorise mieux que le B2C à la revente.

**Pourquoi hors scénario central** : rien n'est prouvé avant le go/no-go de T4 2027 — le central reste défendable seul. C'est la construction qu'un lecteur exigeant attend : **le réalisme dans le modèle, le levier documenté et daté à côté.**

---

## 11. Exécution

### 11.1 — Calendrier (décisions figées, [MISE-EN-PROD.md](MISE-EN-PROD.md))

| Quand | Quoi |
|---|---|
| Août | Domaine propryo.fr · **France Travail par écrit : reliquat ARE + application ou non du plafond 60 %** (la variable qui dimensionne la trésorerie personnelle — [AIDES-CREATION.md](AIDES-CREATION.md)) · inscription Activ'Créa · RDV comptable · **volumes Keyword Planner tirés → plan éditorial calibré** |
| Sept.-oct. | **Immatriculation micro : recommandée au 1er OCTOBRE** (12 mois pleins d'ACRE nouvelle formule — compatible Stripe avant le 14/10, à confirmer comptable) · choix explicite du **maintien ARE** (ARCE écartée) · demande ACRE ≤ 60 j · déclaration CFE 1447-C avant le 31/12 |
| Septembre | Emails (Resend) · site + `app.propryo.fr` · CGU/CGV/RGPD (avocat ~3 K€) · **bêta privée** · production des 45 pages SEO |
| Octobre | **Chantier PLANS-QUOTAS-ESSAI** (l'app n'a pas encore de notion de plan : matrice de gating Gratuit/payant, essai 30 j, retombée Gratuit, webhooks Stripe, application côté serveur) · **lancement public 14/10** avec les 45 pages en ligne · offre de lancement « tarif 2026 garanti à vie » |
| Novembre | **Canal prescripteurs — cercle 1** : page partenaires + kit + codes Stripe · 10 partenaires signés dans le réseau en propre (§8.5) |
| Janvier 2027 | **Calibration sur données réelles** : conversion, churn, mix, trafic/page, apport prescripteurs — le scénario se choisit là, pas avant |
| T4 2026 | **Synchro bancaire — dogfood** : Enable Banking gratuit sur les comptes du fondateur (CM+CA), toute la chaîne validée sur données réelles à 0 € |
| T1 2027 | **Prescripteurs — cercle 2 Alsace** (~10 démos/mois) · **webinar 2044 de saison fiscale** (mars-mai) · **synchro bancaire ouverte aux clients** (provider retenu sur devis, arrangement agent + DPA — incluse dès Investisseur) |
| S2 2027 | **Portail locataire (bêta)** — rétention + boucle virale · **CRG de gérance en bêta chez les gérants** (le pont vers le B2B, §10 bis) |
| T4 2027 | **GO/NO-GO B2B** — critères chiffrés du §10 bis |
| S1 2028 | **Module agences co-construit avec 3-5 cabinets** (mandants, honoraires, multi-utilisateurs agence) |
| S2 2028 | **10-20 cabinets pilotes payants** ~49 €/mois/utilisateur — recrutés via les agents déjà prescripteurs (§8.5) |
| 2029 | Échelle agences (groupements, réseaux) · ouverture Belgique/Luxembourg si les indicateurs sont verts |

### 11.2 — L'équipe : un fondateur outillé

Développeur solo **avec une chaîne d'agents IA** (développement, audit systématique par agent indépendant, ~3 000 tests) : capacité d'une petite équipe au coût d'une personne. La même chaîne produit le contenu SEO à ~30 €/page. Ce qui a livré en 4 mois (mai-août) ce que le plan d'avril chiffrait en 2 trimestres.

### 11.3 — Aides à la création mobilisées ([AIDES-CREATION.md](AIDES-CREATION.md), recherche sourcée 24/08)

- **Maintien de l'ARE = le pilier, chiffré sur données réelles (24/08)** : reliquat 59 283 € (315 j × 188,20 €), plafond 60 % applicable (fin de contrat 30/11/2025) → **~5 600 €/mois pendant ~6,3 mois, jusqu'à ~avril 2027** ; réserve de **23 713 €** déblocable par saisine de l'Instance Paritaire Régionale (activité démontrée) pour couvrir le pont jusqu'à la rentabilité (juil. 2027-janv. 2028). L'**ARCE est écartée** : même montant que le plafond (34,5 K€) mais irréversible et sans l'option IPR.
- **ACRE nouvelle formule** (décret 02/2026 : exonération réduite à 25 %) : cotisations **15,9 %** au lieu de 21,2 % jusqu'à fin sept. 2027 en créant au 1er octobre — intégrée au classeur ; gain modeste, le plan ne repose pas dessus.
- **CFE 0 € en 2026** (déclaration 1447-C avant le 31/12), franchise de TVA (seuil 37 500 €), Activ'Créa gratuit.
- **Financements possibles du besoin de trésorerie** : prêt d'honneur **Initiative Strasbourg 3-15 K€ à taux 0** (dossier = ce BP + le classeur) ; **Bourse French Tech jusqu'à 30 K€** (micro admise si accompagnée par un incubateur — Quest for change/SEMIA (Strasbourg) ; déposer avant d'engager les dépenses).

### 11.4 — Cash (détail complet : classeur financier, feuilles P&L et modèles)

Dépenses externes 2026 (~9,3 K€) : avocat 3 000 · rédacteur SEO 1 600 (sept.-déc.) · ads amorçage 1 800 · **RC professionnelle 450/an** · **hébergement évolutif** (Supabase Pro + Resend 45 €/mois + 0,15 €/client/mois — tarifs vérifiés sur supabase.com le 19/08) + outils 15 €/mois · comptabilité 250 · logo/finitions 750 · buffer 800. S'y ajoutent les charges proportionnelles au CA (Stripe 2 %, **cotisations micro ~21,2 %**, commissions apporteurs) — et à la bascule société (automatique dans le modèle) : création ~800 €, expert-comptable ~150 €/mois, prélèvements ~28 % (approximation à affiner comptable). **Avance de trésorerie maximale ~15 K€** (point bas fin 2027), remboursée en 2028-2029. **Recrutements à seuils** : support freelance > 300 clients ; rien d'autre avant.

---

## 12. Risques et parades

| Risque | Prob. | Parade |
|---|---|---|
| **AI Overviews / évolution Google** (−58 % CTR pos. 1 mesuré, Ahrefs 02/2026) | élevée sur les requêtes info | pages-**outils** en cœur de plan (un encart IA ne génère pas un bail conforme signé) ; produit-viral (signatures, candidatures) ; newsletter ; ne jamais dépendre d'un seul pilier |
| Conversion freemium < 3 % | possible | le palier 2,99 € et la quittance mensuelle sont faits pour ça ; sinon : bascule vers essai limité, mesurée en janvier 2027 |
| Dépendance au fondateur | structurelle | chaîne d'agents + 3 000 tests + docs de chantier = transmissible ; seuils de recrutement définis |
| Rentila écrase les prix (4,90 € / 5 lots) | actée | ne pas se battre sur son terrain : modernité + conformité + acte→bien + finance au centime ; Rentila est l'ancre low-cost depuis 10 ans sans empêcher BailFacile de croître à 26 €/5 lots |
| Un acteur copie l'import d'acte | moyenne à 18 mois | avance d'exécution ; la copie d'une feature ne copie pas la simplicité du tout |
| **Concurrent-influenceur : Locataire.live** (M. Ferrari) — distribution énorme via son école, prix calqués, « tarif bloqué à vie » déjà en place | **réalisée** (constatée 20/08) | se battre là où il ne peut pas suivre vite : **import bancaire + cash-flow réel** (absents chez lui), import d'acte, cogestion SCI, mensuel sans engagement ; **signer les AUTRES formateurs immo en prescripteurs avant qu'il ne les affilie** (§8.5) |
| Seuils AE / TVA | souhaitable | bascule SASU préparée, prix pensés TTC |
| Dépendance Supabase | faible | PostgreSQL standard exportable, sauvegardes |

---

## 13. L'ambition

**Fin 2027** : le cap du vrai démarrage — 76-187 clients selon la conversion réelle, le résultat mensuel devient positif entre août 2027 et janvier 2028, un actif SEO de ~300 pages travaille tout seul — et les prescripteurs en plus, non comptés.

**Fin 2029** : 613-1 572 clients, 67-171 K€ ARR — **114-218 K€ avec l'option B2B agences activée** (§10 bis) —, résultat cumulé +19 à +90 K€ — et deux portes, toutes deux bonnes : **poursuivre** (portail locataire, petites agences, Belgique/Luxembourg) ou **céder** dans un marché qui consolide à coups d'acquisitions (Septeo : 8 en 2024 ; Manda : 43 M€ levés), à 3-5× l'ARR.

**Ce qui rend ce plan crédible** : le produit est construit et prouvé ; le canal d'acquisition a une preuve de marché documentée (BailFacile) et un avantage structurel (l'outil EST le produit) ; chaque taux du modèle a une source publiée et **chaque chiffre sort d'un classeur vérifiable, cotisations sociales comprises** ; l'avance de trésorerie maximale est ~12 K€ ; et le scénario **prudent** — celui où tout est au plancher des benchmarks — reste un projet rentable.

---

## Annexe — sources principales

**Concurrence** (consultées le 19/08/2026) : rentila.com/tarifs · bailfacile.fr/tarifs · qalimo.fr/tarif · smartloc.fr/tarifs · gererseul.com/tarifs · immobilierloyer.com/acheter.php · smovin.app/fr/tarifs.
**SEO** : sitemaps bailfacile.fr (1 391 URLs), qalimo.fr (181), rentila.com (comptés le 19/08/2026) · SimilarWeb bailfacile.fr & rentila.com (07/2026) · Semrush public rentila.com (12/08/2026) · Ahrefs « How long does it take to rank » (maj 15/05/2025) · Ahrefs AI Overviews CTR (02/2026).
**Funnel** : Unbounce Conversion Benchmark Report (Q4 2024) · Klipfolio signup benchmarks · OpenView/Lenny's Newsletter free-to-paid (2023) · RevenueCat State of Subscription Apps (2025) · Userpilot/ProductLed activation · Recurly churn benchmarks (07/2026) · Vitally B2B/B2C · Talyco/Junto/Leo Marchal CPC-CPL France (2025-26).
**Marché** : INSEE Focus 359 (2025) · Verified Market Reports (2024).
