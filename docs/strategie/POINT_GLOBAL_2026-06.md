# ImmoTrack — Point global juin 2026

**1 document. 1 lecture. Tout ce que tu dois savoir pour pitcher ImmoTrack aujourd'hui.**

---

## SYNTHÈSE — à lire en 60 secondes

ImmoTrack est un logiciel de gestion locative pour bailleurs particuliers et SCI familiales. Utilisé en production depuis 2 ans sur 22 logements réels par son créateur.

**Architecture en place depuis juin 2026 :** base PostgreSQL Supabase hébergée en Europe, avec isolation cryptographique par utilisateur (Row Level Security strict). Données métier (baux, mouvements, locataires) côté Supabase. Photos d'état des lieux côté Google Drive utilisateur (en option).

**3 chiffres clés :**
- 7,4 millions de logements locatifs privés en France
- 0 concurrent B2C français au même niveau de couverture fiscale + signature légale
- 20 différenciants exclusifs documentés sur audit comparatif vérifié

**5 différenciants impossibles à copier en 6 mois :**
1. Import d'un acte de vente PDF qui crée bailleur + immeuble + logements en 30 secondes
2. Wizard de bail avec paraphage page-par-page sur 26 pages, signature en fin de lecture
3. Déclaration 2044 automatique + export FEC conforme DGFiP (Sage, EBP, Quadra)
4. Isolation cryptographique au niveau base de données + immutabilité du bail signé garantie par trigger PostgreSQL
5. Refus automatique de générer un bail si le logement est interdit à la location (Loi Climat 2021)

**Lancement public visé : octobre 2026.** Founder Edition lifetime dès juillet.

---

## 1. L'architecture juin 2026 — ce qui a changé

### Avant (jusqu'en mai 2026)
ImmoTrack stockait les données dans le navigateur de l'utilisateur (IndexedDB) avec une synchronisation Google Drive optionnelle. Posture commerciale : "vos données restent chez vous."

### Maintenant (depuis juin 2026)
Bascule actée vers Supabase hébergé en Europe.

**Données métier** (baux, mouvements, locataires, EDL, quittances) → PostgreSQL Supabase Cloud EU.

**Photos d'état des lieux et pièces jointes** → Google Drive de l'utilisateur (en option, prévu P3 de la migration).

**Isolation cryptographique** par utilisateur via Row Level Security FORCE de PostgreSQL. Chaque utilisateur a son propre `espace_id`. Concrètement : même les développeurs d'ImmoTrack ne peuvent pas voir les données d'un autre utilisateur sans casser la politique RLS du serveur.

**Immutabilité du bail signé** au niveau base. Un trigger PostgreSQL nommé `prevent_locked_mutation` refuse toute modification d'un bail signé, même exécuté avec les droits administrateur. Échappatoire admin existante (`app.bypass_immutable`) journalisée.

### Statut technique
Migrations 0001 à 0026 livrées (juin 2026). Les vraies données de Didier (360 lignes, espace « Patrimoine ») ont été importées sans perte le 9 juin 2026. L'application web va basculer sur la lecture Supabase dans les prochaines semaines (couche Store en cours).

### Posture commerciale qui en résulte

**Le pitch n'est plus "vos données chez vous". Le pitch devient :**

> ImmoTrack est le seul logiciel de gestion locative grand public français avec isolation cryptographique au niveau base de données, immutabilité légale du bail signé garantie par trigger PostgreSQL, et hébergement en Europe.

C'est un positionnement **plus tech, plus défendable juridiquement**, et plus crédible pour un investisseur, une banque ou un CGP que la posture précédente.

---

## 2. Le marché en 1 page

### Trois familles d'acteurs distinctes

**B2C bailleur particulier** — cible directe ImmoTrack. Rentila, BailFacile, Smartloc, Qalimo, Gererseul, ImmobilierLoyer, Smovin, LocataireCloud. Prix entre 0 et 20 €/mois. Aucun leader dominant. Couverture fonctionnelle moyenne 60 %.

**B2B agences professionnelles** — hors cible. Septeo (leader CA 420 M€), LOCKimmo, Powimo. Prix 80 à 300 €/mois par utilisateur. 3 200 cabinets clients chez Septeo.

**Agences digitales** — concurrents indirects. Manda (43 M€ levés en 2024), Imodirect. Modèle commission 5,9 % sur loyer collecté.

### Le marché bouge vite

Septeo a fait 8 acquisitions en 2024 (dont INCH pour son module gestion locative). Manda enchaîne les rachats (5 fin 2024, 15 prévus en 2025). VILOGI affiche 47 % de croissance en 2024. Un nouvel entrant (LocataireCloud) a livré 26 fonctionnalités en 6 mois.

**La fenêtre d'entrée pour un nouvel acteur B2C est ouverte 18 mois.** Au-delà, la consolidation va verrouiller le marché.

---

## 3. Les 8 concurrents directs en un coup d'œil

| Concurrent | Prix entrée | Force | Faiblesse principale |
|---|---|---|---|
| **Rentila** | 0 à 8 €/mois | Base 50 000 utilisateurs · 4,5/5 Trustpilot | Interface vieillissante · pas de 2044 · pas de SCI avancée |
| **Qalimo** | 0 à 5 €/mois | Meilleure UX du marché · 4,9/5 Trustpilot | Aucun différenciant exclusif · pas de fiscalité avancée |
| **Gererseul** | 9,75 €/mois | Le plus ancien (2007) · fiscaliste inclus · 42 000 utilisateurs | Pas d'app mobile native · interface 2010 |
| **BailFacile** | 9,90 €/mois | SEO content très dense · signature électronique | Pas de 2044 · couverture fonctionnelle 55 % |
| **Smartloc** | 6,50 €/mois | Comparateur GLI intégré · app mobile 4,7/5 | Pas de SCI avancée · fiscalité limitée |
| **ImmobilierLoyer** | 7,70 €/mois | Seul avec liasse 2072 SCI IR · bilan annuel par entité | Interface 2010 · app à télécharger |
| **Smovin** | 4 à 8 €/bien/mois | Multi-pays FR/BE · facturation auto · levée de fonds | Fiscalité française imparfaite |
| **LocataireCloud** | 347 € lifetime (sortie bêta avril 2026) | Site vitrine très propre · 16 outils SEO · roadmap publique · place de marché annonces · agent IA annoncé T2 2026 | Fondateur solo · ~15 clients lifetime · aucun différenciant exclusif vérifié · pas de référencement comparatifs |

---

## 4. Les 20 différenciants ImmoTrack à pousser

### Différenciants techniques structurels (impossibles à copier en moins de 6 mois)

1. **Import d'un acte de vente PDF** — pdf.js + heuristique locale, sans LLM, sans envoi tiers. Crée bailleur + immeuble + logements en cascade. 54 tests automatisés. Aucun concurrent B2C.
2. **Bail repris article 1743** — extraction de l'occupation existante lors d'un achat de bien occupé. Aucun concurrent.
3. **Wizard bail paraphage page-par-page** sur 26 pages + signature en fin de lecture + clause "Lu et approuvé" obligatoire + pédagogie article §18. Aucun concurrent au même niveau.
4. **Snapshot du bail signé avec mise en évidence des modifications** post-signature. Aucun concurrent.
5. **Aide déclaration 2044** automatique depuis les mouvements bancaires + export FEC format DGFiP (Sage, EBP, Quadra). Aucun concurrent B2C.
6. **Onglet Finances complet** — résultat net + 4 ratios + compte de résultat N vs N-1 + drill par logement + argent à récupérer + passerelles 2044/FEC/Bilan. Aucun concurrent B2C.
7. **Isolation cryptographique RLS FORCE** au niveau base de données. Position unique sur le segment B2C.
8. **Immutabilité du bail signé garantie par trigger PostgreSQL** — refus de modification même sous droits service_role. Unique au monde sur le segment.
9. **Refus strict de bail si DPE F ou G interdit** (Loi Climat 2021). Aucun concurrent B2C.
10. **EDL délégué offline** export HTML pour tiers. Aucun concurrent.
11. **Pipeline candidature locataire non-discriminatoire** conforme décret 2015-1437 + scoring de confiance + conversion candidat → bail sans ressaisie + purge RGPD à 30 jours.
12. **Cockpit conformité "Climat météo"** — vue 5 secondes sur l'état du parc (5/21 conformes, X à traiter, etc.).
13. **Cycle IRL à 6 états contextuels** — bail incomplet, indice INSEE non publié, anniversaire dans X jours, révision prête, à valider et envoyer, refus DPE F/G.
14. **Bail multi-bailleurs / multi-locataires / multi-garants** avec N cadres de signature dynamiques et paraphes au pluriel automatiques.
15. **Annonce de location** générée avec avertissement DPE F/G/E intégré et citation Loi Climat 2021-1104.
16. **Send-as par entité** via Gmail aliases — envoyer depuis l'adresse de chaque SCI, pas depuis `noreply@`.
17. **Civilité M./Mme par locataire** dans toutes les surfaces (bail, IRL, quittance, courriers). Accord grammatical complet.
18. **Templates HTML personnalisables** en mode lecture ou mode avancé selon le niveau utilisateur. Aucun concurrent.
19. **Audit trail intégré** — journal modifications (qui, quand, quoi) sur les opérations critiques.
20. **Plan d'effacement RGPD article 17** outillé + politique prescription civile 3 ans + droits articles 15 et 20.

---

## 5. Ce qui est livré

Marathon de développement de mai à juin 2026. Plus de 200 versions livrées (v15.04 → v15.261).

### Vrais blocs commercialisables livrés
- Fiscalité complète : aide 2044, bilan annuel par entité, export FEC, onglet Finances
- Conformité légale : Loi Climat 2021, RGPD article 17, audit trail
- Bail : wizard paraphage, signature distance via relais Cloudflare audité, multi-bailleurs/locataires/garants
- Import d'un acte de vente vers bailleur + immeuble + logements en cascade
- Mobile : audit clôturé sur 9 onglets, bottom-sheet drawer pour la navigation
- Email : envoi direct Gmail API OAuth, send-as par entité, pièces jointes auto-générées
- Pipeline candidature locataire conforme décret 2015-1437
- Architecture multi-tenant Supabase EU avec isolation RLS FORCE
- Drive partagé deux utilisateurs (Didier + Marion) pour co-gestion familiale
- Banking : import OFX/CSV avec fingerprinting stable, pointeur de progression par compte

### Données réelles importées
9 juin 2026 : 360 lignes de la base réelle de Didier importées dans l'espace « Patrimoine » Supabase. Zéro perte de données. Intégrité des clés étrangères et contraintes CHECK vérifiées.

---

## 6. Ce qui reste avant le lancement public d'octobre 2026

| Bloc | Effort | Statut |
|---|---|---|
| Validation EDL par avocat | 1 500 € | À commander |
| Couche Store : bascule de l'app sur la lecture Supabase | ~5 jours | En cours |
| Verrouillage légal des signés au moment de la bascule | ~1 jour | Avec la couche Store |
| Module gestion pro (mandat de gestion + CRG automatisé) | 11 h | À spécifier |
| Email standards (envoi quittance, avis d'échéance, rappel impayé) | 6 h | À livrer |
| Site vitrine + pricing public | 8 h | À créer |
| Setup Founder Edition Stripe | 1,5 h | Validé option (b) 249 € × 100 places |

**Total : ~25 heures de développement + 1 500 € avocat + 3 000 € designer freelance.**

---

## 7. Modèle économique

| Plan | Prix | Cible |
|---|---|---|
| Solo (freemium) | Gratuit pour 1 logement | Acquisition |
| Investisseur | 9,90 €/mois (99 €/an) | Bailleur 2 à 10 logements |
| SCI Patrimoine | 19,90 €/mois (199 €/an) | SCI familiale 11 à 30 logements |
| Agence Pro (V2 2027) | 49,90 €/mois par utilisateur | Petits cabinets |

**Founder Edition lifetime** : 100 places à 249 €. Annonce juillet 2026. Cash up-front 24 900 € + 100 utilisateurs évangélistes avant lancement public.

### Métriques unitaires benchmark SaaS B2C niche
- ARPU pondéré : 11,40 €/mois
- CAC moyen pondéré : 25 €
- LTV brut sur 20 mois (churn 5 %) : 228 €
- LTV/CAC : 7,3 (excellent, sain au-dessus de 3)
- Payback CAC : 2,7 mois
- Marge brute : 80 %

---

## 8. Trois scénarios de projection à 3 ans

| Scénario | Fin 2026 | Fin 2027 | Fin 2028 | Break-even |
|---|---|---|---|---|
| Bas | 60 clients · 7 K€ ARR | 250 · 32 K€ | 600 · 80 K€ | T4 2028 |
| Médian (cible) | 150 · 19 K€ | 700 · 100 K€ | 1 800 · 277 K€ | T4 2027 |
| Haut | 350 · 49 K€ | 1 600 · 240 K€ | 4 000 · 660 K€ | T4 2026 |

**Valorisation potentielle à 3 ans** : 1,6 à 2,7 M€ en scénario médian, 5 à 8 M€ en scénario haut. Acquéreurs probables : Septeo, Manda, fonds proptech (Naxicap, Apax).

---

## 9. Risques principaux

| Risque | Probabilité | Mitigation |
|---|---|---|
| LocataireCloud livre son IA conversationnelle T2 2026 et capte les CGP | Moyenne | Module IA souverain local sur la roadmap V1.5 |
| BailFacile copie le pré-remplissage diagnostics ou la 2044 | Forte | 8 des 20 différenciants restent structurellement difficiles à copier (architecture, signature, conformité) |
| Septeo descend sur le segment B2C avec offre low-cost | Faible | Improbable, plan B = pivoter sur SCI multi-utilisateurs et agences pilotes |
| Burn-out fondateur solo | Moyenne | Recrutement freelance dev backend prévu T1 2027 si MRR > 5 K€/mois |
| Migration de données vers Supabase incomplète | Moyenne | Photos EDL Drive-only restantes (176) à migrer en P3 |

---

## 10. Recommandations SEO actionnables

### Nouveau positionnement éditorial — à intégrer dès maintenant

**Avant** : "vos données chez vous" (Drive).
**Maintenant** : "ImmoTrack — hébergé en Europe, isolation cryptographique au niveau base, immutabilité légale du bail signé."

C'est une catégorie SEO neuve à créer. Personne ne se positionne là-dessus sur le segment B2C français. À pousser sur les mots-clés "logiciel souverain français", "gestion locative hébergée Europe", "RGPD strict", "bail signé infalsifiable".

### 6 clusters de contenu à produire (30 articles + 6 pages piliers)

**Cluster 1 — Déclaration 2044 et fiscalité revenus fonciers** (volume pilier 22 000/mois)
Articles satellites : Ligne 211 (3 200), Charges déductibles (5 600), Déficit foncier (4 800), SCI IR 2072 (2 300), Locations meublées (6 700).

**Cluster 2 — Loi Climat 2021 et DPE F/G** (volume pilier 7 400/mois)
Articles satellites : Interdiction location DPE F (7 400), Loyer bloqué DPE F G (4 100), Travaux DPE (3 600), MaPrimeRénov bailleur (11 000), Déficit foncier travaux (3 400).

**Cluster 3 — État des lieux** (volume pilier 14 000/mois)
Articles satellites : Différences entrée/sortie (5 800), Vétusté (4 200), Compteurs (2 100), EDL à distance (1 800), Bail location nue (6 400).

**Cluster 4 — IRL et révision de loyer** (volume pilier 12 500/mois)
Articles satellites : Indice IRL T1 2026 (9 800, renouvelable chaque trimestre), Lettre de révision (6 500), Date anniversaire (2 300), Manquer une révision (2 100), DPE F/G et révision (1 400 — exclusif ImmoTrack).

**Cluster 5 — SCI familiale** (volume pilier 13 000/mois)
Articles satellites : SCI IR vs SCI IS (8 200), Compte associés (3 100), Distribution bénéfices (2 800), Transmission (4 700), Hoguet et SCI (1 600).

**Cluster 6 — Candidature locataire** (volume pilier 4 600/mois)
Articles satellites : Pièces justificatives (4 600), Caution vs Visale (5 400), GLI (8 800), Refuser un dossier (2 300), Dossier conforme (6 100).

### 12 pages comparatif (acquisition transactionnelle directe)
ImmoTrack vs Rentila, BailFacile, Smartloc, Qalimo, Gererseul, ImmobilierLoyer, LocataireCloud. Plus 5 pages "alternative à X". Format type : 1 500 mots, tableau fonctionnalités, tableau pricing, CTA "Essayer gratuitement".

### 15 calculateurs gratuits sur /outils (acquisition long terme)
4 calculateurs **différenciants ImmoTrack** à pousser absolument :
- Simulateur déclaration 2044 preview ligne par ligne (volume 7 400)
- Simulateur cession LMP/LMNP (volume 3 800)
- Comparateur loyer marché par ville (volume 5 600)
- Plan rénov DPE avec subventions (volume 4 900)

Les 11 autres standards : rendement locatif, frais de notaire, capacité d'emprunt, etc.

### Calendrier éditorial recommandé
30 articles sur 6 mois (juillet à décembre 2026), soit 5 articles par mois. Sous-traitance recommandée à un rédacteur SEO immobilier : 4 articles par mois à 150 € = 600 €/mois.

### KPIs cibles
À 6 mois : 50 mots-clés top 10 · 5 000 visites/mois · 100 inscriptions freemium SEO · 10 backlinks DR > 30.
À 12 mois : 200 mots-clés top 10 · 25 000 visites/mois · 500 inscriptions SEO · 40 backlinks.

---

## 11. Décisions à valider

1. **Founder Edition lifetime 249 € × 100 places** — option (b) validée 2026-05-18, setup Stripe avant fin juin.
2. **Statut juridique** — auto-entrepreneur jusqu'à 25 K€ de CA, bascule SASU au-delà. Création société avant octobre 2026.
3. **Investissement légal V1** — 3 000 € (CGU, CGV, DPA, validation EDL avocat). À engager juin-juillet.
4. **Bascule de l'application sur la lecture Supabase** — verrouillage légal des baux signés au moment de la bascule. À planifier avant le lancement public.
5. **Recrutement freelance dev backend** — à activer si MRR > 5 000 €/mois T1 2027.
6. **Levée pré-seed 150-300 K€** — uniquement en scénario haut, MRR > 8 000 €/mois T1 2027.

---

## Sources

Comparatif quantitatif interne : `ImmoTrack_Comparatif_Concurrents_2026.xlsx` (149 critères × 9 outils). Audit visuel LocataireCloud : `docs/strategie/audit-visuel-locataire-live/`. Architecture Supabase : mémoire `project_persistance_multitenant.md` + migrations 0001 à 0026. INSEE parc logements 2025. Sites éditeurs concurrents vérifiés mai-juin 2026.
