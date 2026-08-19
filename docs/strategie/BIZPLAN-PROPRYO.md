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
| **Le plan d'acquisition ?** | **SEO par pages-outils** — le plan Gratuit *fait* les documents (bail, quittance, EDL) que des dizaines de milliers de bailleurs cherchent chaque mois. C'est le modèle exact qui a construit BailFacile (~1 400 pages → ~110-220 k visites/mois, organique 1er canal — §8). |
| **Ça se lance quand ?** | Bêta privée septembre, **lancement public 14 octobre 2026**, 45 pages SEO publiées avant le jour J. |
| **Ça coûte combien ?** | **< 10 K€ la première année.** Aucune levée : bootstrappé, coûts fixes ~600 €/mois. |
| **Ça rapporte quoi ?** | Scénarios **dérivés du modèle** (§10) à fin 2029 : prudent ~950 clients / ~110 K€ ARR · central ~1 900 / ~215 K€ · ambitieux ~3 200 / ~365 K€. Rentable dans les trois cas ; valorisation potentielle 0,3-1,8 M€ (3-5× ARR, multiples proptech FR). |
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
| **Mouvements** | **Import bancaire OFX + Excel natif** (détection colonnes, contrôle par le solde, dédoublonnage FITID), règles éditables — « l'app ne devine rien » |
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
| **Propryo** | **2,99 €** (ou 0 € documents) | **9,90 € forfait** | **19,90 € forfait (≤ 30 lots)** | **incluse** (+ OTP prêt) | **inclus au plan Patrimoine** |

**Lecture** : à 5 lots, **seul Rentila (l'ancre low-cost historique, interface datée) est moins cher** ; tous les outils modernes sont 2 à 4× plus chers que Propryo. À 10 lots, Propryo 19,90 € contre BailFacile 45,99 € et Qalimo 34,30 €. Le **forfait par palier** (vs compteur par bien) est un argument de simplicité et de prévisibilité aligné avec le WHY.

Changements notables depuis avril : Qalimo a **supprimé son plan gratuit** ; BailFacile est passé à 9,99 € + 4 €/bien ; Rentila s'est restructuré (Silver/Gold, signature incluse partout, multi-utilisateurs dès Silver).

### 5.2 — Différenciants Propryo qui survivent à l'examen

L'examen honnête du panel retire deux « exclusivités » v1 (la signature incluse existe chez Rentila/BailFacile ; le multi-utilisateurs existe chez Rentila et Smovin). Restent, vérifiables en démo :

1. **Import de l'acte notarié → création du bien** — introuvable ailleurs ; l'onboarding au moment exact où un bailleur cherche un outil.
2. **Un seul moteur financier, juste au centime** — « en + ou en − ? » : cash-flow réel, retards expliqués, N-1 à période comparable ; import bancaire par relevé (OFX/Excel) sans connexion DSP2 à la banque.
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

Le Gratuit n'est pas une démo : c'est **l'arme d'acquisition** (§8). La frontière est nette : gratuit = documents générés localement (coût de service nul) ; payant = la valeur récurrente. Early bird au lancement : −50 % la 1re année pour les 100 premiers.

---

## 7. Modèle économique — hypothèses sourcées

> Chaque taux vient d'un benchmark publié (sources en annexe). Valeur « prudente » = celle du modèle central §10.

| Maillon | Prudent | Benchmark publié | Source |
|---|---|---|---|
| Visiteur → inscrit (landing-outil dédiée) | **4 %** blended | landing pages : médiane 6,6 % (41 000 pages) ; SaaS 3,8 % ; sites entiers 1-5 % | Unbounce 2024, Klipfolio |
| Inscrit gratuit → payant | **3 %** | freemium « bon » 3-5 %, médian B2C 2,2 %, top 6-8 % | OpenView/Lenny 2023, RevenueCat 2025 |
| Activation (inscrit → actif) | 30 % | médiane SaaS ~30-35 % | Userpilot, ProductLed |
| Churn mensuel | **5 %** | SaaS réel 3,2 %/mois (Recurly 07/2026), B2C ~6,5 % | Recurly, Vitally |
| ARPU pondéré | **9,50 €/mois** | mix 35 % Essentiel · 45 % Investisseur · 20 % Patrimoine | grille §6 |
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
| Vélocité contenu | plan nominal | nominal | ×1,5 + partenariats |
| Churn mensuel | 5 % | 5 % | 4 % |

| Fin de période | Prudent | Central | Ambitieux |
|---|---|---|---|
| **2026** (3 mois) | ~25 clients · MRR 240 € | ~40 · 380 € | ~60 · 570 € |
| **2027** | ~150 · **ARR 17 K€** | ~280 · **32 K€** | ~480 · **55 K€** |
| **2028** | ~450 · 51 K€ | ~900 · 103 K€ | ~1 600 · 182 K€ |
| **2029** | ~950 · **108 K€** | ~1 900 · **217 K€** | ~3 200 · **365 K€** |

- **Break-even opérationnel** (MRR > ~600 € de coûts fixes) : courant 2027 dans les trois scénarios. **Break-even cumulé** (~10 K€ investis récupérés) : fin 2028 prudent · mi-2028 central · fin 2027 ambitieux.
- **Valorisation indicative fin 2029** (3-5× ARR) : 0,3-0,5 M€ prudent · **0,65-1,1 M€ central** · 1,1-1,8 M€ ambitieux.
- **Sensibilité** (les vrais leviers) : +1 point de conversion freemium = **+33 % de clients** partout · churn 5 → 3,5 % = +40 % de base à 3 ans · ×2 sur la vélocité contenu ≈ +60-80 % de trafic fin 2027. Les trois leviers sont pilotables (produit, rétention, contenu) — la calibration de janvier 2027 (§11) dira lequel pousser.
- *La v1 de ce BP affichait 700 clients fin 2027 et 3 200 fin 2029 en « médian » : ces chiffres supposaient 15 % de conversion freemium. Dérivés proprement, ils correspondent à l'actuel scénario **ambitieux**. Le plan reste le même ; la promesse est désormais démontrable.*

---

## 11. Exécution

### 11.1 — Calendrier (décisions figées, [MISE-EN-PROD.md](MISE-EN-PROD.md))

| Quand | Quoi |
|---|---|
| Août | Domaine propryo.fr · statut micro-entreprise (comptable) · **volumes Keyword Planner tirés → plan éditorial calibré** |
| Septembre | Emails (Resend) · site + `app.propryo.fr` · CGU/CGV/RGPD (avocat ~3 K€) · **bêta privée** · production des 45 pages SEO |
| Octobre | Stripe + quotas de plans branchés · **lancement public 14/10** avec les 45 pages en ligne · early bird |
| Janvier 2027 | **Calibration sur données réelles** : conversion, churn, mix, trafic/page — le scénario se choisit là, pas avant |

### 11.2 — L'équipe : un fondateur outillé

Développeur solo **avec une chaîne d'agents IA** (développement, audit systématique par agent indépendant, ~3 000 tests) : capacité d'une petite équipe au coût d'une personne. La même chaîne produit le contenu SEO à ~30 €/page. Ce qui a livré en 4 mois (mai-août) ce que le plan d'avril chiffrait en 2 trimestres.

### 11.3 — Cash an 1 (~9 K€)

Avocat 3 000 · rédacteur SEO 4 mois 1 600 · ads amorçage 1 800 · domaine/infra/outils 650 · comptabilité 600 · logo/finitions 750 · buffer 800. **Recrutements à seuils** : support freelance > 300 clients ; rien d'autre avant.

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

**Fin 2027** : le projet vit de lui-même (break-even opérationnel dans les trois scénarios), 150-480 clients selon la conversion réelle, un actif SEO de ~300 pages qui travaille tout seul.

**Fin 2029** : 950-3 200 clients, 108-365 K€ ARR, EBITDA ~35 % en régime — et deux portes, toutes deux bonnes : **poursuivre** (portail locataire, petites agences, Belgique/Luxembourg) ou **céder** dans un marché qui consolide à coups d'acquisitions (Septeo : 8 en 2024 ; Manda : 43 M€ levés), à 3-5× l'ARR.

**Ce qui rend ce plan crédible** : le produit est construit et prouvé ; le canal d'acquisition a une preuve de marché documentée (BailFacile) et un avantage structurel (l'outil EST le produit) ; chaque taux du modèle a une source publiée ; le cash engagé est < 10 K€ ; et le scénario **prudent** — celui où tout est au plancher des benchmarks — reste un projet rentable.

---

## Annexe — sources principales

**Concurrence** (consultées le 19/08/2026) : rentila.com/tarifs · bailfacile.fr/tarifs · qalimo.fr/tarif · smartloc.fr/tarifs · gererseul.com/tarifs · immobilierloyer.com/acheter.php · smovin.app/fr/tarifs.
**SEO** : sitemaps bailfacile.fr (1 391 URLs), qalimo.fr (181), rentila.com (comptés le 19/08/2026) · SimilarWeb bailfacile.fr & rentila.com (07/2026) · Semrush public rentila.com (12/08/2026) · Ahrefs « How long does it take to rank » (maj 15/05/2025) · Ahrefs AI Overviews CTR (02/2026).
**Funnel** : Unbounce Conversion Benchmark Report (Q4 2024) · Klipfolio signup benchmarks · OpenView/Lenny's Newsletter free-to-paid (2023) · RevenueCat State of Subscription Apps (2025) · Userpilot/ProductLed activation · Recurly churn benchmarks (07/2026) · Vitally B2B/B2C · Talyco/Junto/Leo Marchal CPC-CPL France (2025-26).
**Marché** : INSEE Focus 359 (2025) · Verified Market Reports (2024).
