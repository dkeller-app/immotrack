# OUTILS-SEO-GRATUITS — Page /outils avec 10-15 calculateurs immobiliers

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : L (~3-4 j-h init + 1-2 j-h/calculateur additionnel)
**Détecté** : 2026-05-18 (réaction audit concurrent LocataireCloud qui a 16 calculateurs gratuits)
**Lié à** : BIZPLAN-V2 · WATCH-LOCATAIRELIVE · acquisition SEO V1 pre-launch

## Contexte

LocataireCloud (audit 2026-05-18) propose **16 calculateurs gratuits sans inscription** comme stratégie SEO d'acquisition long terme. Chaque calculateur = 1 page d'atterrissage SEO-riche ciblant une requête longue traîne ("calculer rendement locatif", "frais de notaire", "capacité d'emprunt", etc.).

ImmoTrack n'a **rien d'équivalent**. C'est un manque commercial : on perd des prospects sur ces requêtes à fort volume.

## Périmètre

### Liste de calculateurs à proposer (15 cibles)

| # | Calculateur | Profondeur | Volume recherche estim. /mois | Cible |
|---|---|---|---|---|
| 1 | **Rendement locatif** (brut + net + cash-flow) | Avancée | 18 000 | investisseur |
| 2 | **Frais de notaire** (ancien/neuf) | Basique | 22 000 | primo-acquéreur |
| 3 | **Capacité d'emprunt** (revenus + charges) | Basique | 27 000 | primo-acquéreur |
| 4 | **Simulateur prêt** (mensualités + amortissement) | Avancée | 14 000 | tout public |
| 5 | **IRL — augmentation loyer** (indices INSEE trimestriels) | Intermédiaire | 9 800 | bailleur établi |
| 6 | **Plus-value immobilière** (calcul impôt) | Intermédiaire | 8 400 | vendeur potentiel |
| 7 | **Encadrement loyers** (zone tendue + référence) | Basique | 6 700 | bailleur urbain |
| 8 | **LMNP micro vs réel** (régimes fiscaux) | Avancée | 5 200 | LMNP/LMP |
| 9 | **Location nue micro vs réel** | Avancée | 4 100 | bailleur établi |
| 10 | **Simulateur déclaration 2044** (preview ligne par ligne) ⭐ | Avancée | 7 400 | bailleur établi (différenciant ImmoTrack) |
| 11 | **Simulateur cession** (LMP/LMNP/résidence ppl) ⭐ | Avancée | 3 800 | vendeur potentiel (différenciant) |
| 12 | **Loyer marché** (comparateur loyer médian INSEE/CLAMEUR par ville) ⭐ | Avancée | 5 600 | bailleur tout public (différenciant) |
| 13 | **DPE plan rénov subventions** (MaPrimeRénov + CEE + déficit foncier) ⭐ | Avancée | 4 900 | bailleur DPE F/G (différenciant) |
| 14 | **Acheter vs louer** (comparaison coûts long terme) | Intermédiaire | 11 000 | primo-acquéreur |
| 15 | **Liberté financière patrimoine** (patrimoine cible) | Avancée | 4 200 | investisseur avancé |

→ **Volume total mensuel estimé** : ~152 000 requêtes potentielles. Avec 1 % de taux de clic SEO sur top 3 → 1 500 visiteurs/mois → 75-150 inscriptions freemium possibles.

### Format de chaque calculateur

Chaque page = template uniforme :
- H1 SEO-optimisé ("Calcul rendement locatif 2026 : brut, net, cash-flow")
- Calculateur interactif (HTML/JS pur, pas de backend)
- Bloc explicatif (250-400 mots, méthodo + références légales)
- CTA "Gérez gratuitement votre bien avec ImmoTrack" en bas (lien /signup)
- Schema.org structuré (`Calculator`, `FAQPage`)
- Articles de blog liés (croisement maillage interne)

### 4 calculateurs ⭐ différenciants (vs LocataireCloud)

Ces 4 calculateurs sont **uniques** sur le panel concurrent. Ce sont des points d'entrée prospects forts :
- **#10 Simulateur déclaration 2044** : aucun outil concurrent ne le propose en open-access (LocataireCloud l'a en payant via reporting fiscal T3 2026, mais pas gratuit en SEO)
- **#11 Simulateur cession LMP/LMNP** : aucun outil ne fait scénarios fiscaux dynamiques en gratuit
- **#12 Loyer marché** : LocataireCloud ne le propose pas, ImmoTrack peut s'appuyer sur source CLAMEUR
- **#13 DPE plan rénov subventionné** : différenciant unique (vu enjeu Loi Climat 2028)

## Architecture technique

- **Pas de page séparée** par défaut : section `/outils/` du site vitrine ImmoTrack
- **Pas de backend** : 100 % JS client (cohérent posture souveraine — pas de tracking de calculs)
- **Hébergé Cloudflare Pages** (gratuit, illimité bande passante)
- **Schema.org markup** systématique (rich snippets Google)
- **PWA installable** depuis chaque page outil (mini-CTA "Ajouter à l'écran d'accueil")
- **Templates partagés** pour cohérence visuelle (1 fichier base + 15 variantes calcul)

## Effort estimé

| Bloc | Effort |
|---|---|
| Template HTML/JS partagé + tests | 1 j-h |
| 15 calculateurs (1 par cal., 0,3-0,5 j-h chacun selon profondeur) | 6-8 j-h |
| Schema.org structuré + open graph | 0,5 j-h |
| Maillage SEO interne (FAQ + articles de blog liés) | 1 j-h |
| Sous-traitance rédactionnelle blocs explicatifs (rédacteur SEO immo) | 400-600 € HT |
| **Total** | **8-10 j-h + 500 € HT** |

## Quand livrer

**Recommandation : Q3 2026 (juillet-août, AVANT V1 launch oct 2026)** pour donner ~6 semaines d'indexation Google avant lancement public. Pour cela il faut écrire avant le lancement V1, en parallèle des V3-REFONTE.

**Si pas le temps Q3** : livrer post-launch en Q4 2026 (mais perte de 3 mois de référencement).

## Décisions à prendre

- [ ] Confirmer la liste des 15 calculateurs (ou retirer/remplacer certains)
- [ ] Confirmer sous-traitance rédactionnelle ou Didier rédige (économie 600 € vs +3 j-h)
- [ ] Confirmer slot Q3 2026 ou Q4 2026
- [ ] Confirmer hébergement Cloudflare Pages (au lieu de mêler avec app ImmoTrack)

## Journal

- 2026-05-18 : créé · réaction audit LocataireCloud · 15 calculateurs identifiés dont 4 ⭐ différenciants
