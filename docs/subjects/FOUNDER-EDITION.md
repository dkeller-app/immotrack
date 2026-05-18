# FOUNDER-EDITION — Décision pricing lifetime acquisition early adopters

**Status** : ⬜ À faire (décision urgente avant lancement pré-V1) · **Prio** : P1 · **Taille** : S (~2-3h décision + setup)
**Détecté** : 2026-05-18 (réaction audit LocataireCloud qui utilise lifetime 347 € pour 50 places)
**Lié à** : BIZPLAN-V2 (PROJECTIONS_v2 impact) · WATCH-LOCATAIRELIVE

## Contexte

LocataireCloud lance avec une **offre Founder Lifetime 347 € limitée à 50 places** (35 places restantes au moment de l'audit 2026-05-18). C'est un gimmick d'acquisition qui :
1. Bootstrap rapidement la base early adopters (50 utilisateurs payants à vie = 50 évangélistes)
2. Génère du cash up-front (50 × 347 € = **17 350 €**) qui finance les premiers mois
3. Crée de l'urgence ("plus que 35 places") = conversion x3-5
4. Convertit en pré-vendant un produit pas encore en V1

ImmoTrack peut faire mieux ou pareil pour **bootstrapper son lancement V1**.

## Périmètre

### Décision principale à prendre

**Lancer une "ImmoTrack Founder Edition" lifetime AVANT le launch public oct 2026 ?**

| Option | Mécanique | Avantages | Risques |
|---|---|---|---|
| **(a) NON, on garde SaaS pur 9,90 / 19,90 €** | Pas de lifetime, pur SaaS dès le launch | Modèle clean, pas de gestion de cas particulier | Perte d'opportunité bootstrap, retard 3-6 mois sur les premiers évangélistes |
| **(b) OUI, lifetime 249 € × 100 places** | Limité dans le temps (juillet → oct 2026) + dans le volume (100 places) | +25 K€ cash up-front, 100 évangélistes, narratif lancement | Devra honorer le lifetime à vie, complexité onboarding |
| **(c) OUI, lifetime 349 € × 50 places** | Comme LocataireCloud, plus élitiste | +17 K€ cash, prix plus respecté | Moins de places vendues, narratif moins puissant |
| **(d) Lifetime 199 € × 200 places** | Volume + prix doux | +40 K€ cash, 200 évangélistes, narratif fort | Plus de support à fournir, marge plus faible |

→ **Recommandation : option (b) Lifetime 249 € × 100 places** — équilibre cash/évangélistes/exclusivité. Annonce mai-juin 2026, vente juin-sept 2026, V1 publique oct 2026.

### Sous-décisions

- [ ] **Périmètre fonctionnel "à vie"** :
  - Toutes les fonctions actuelles + futures **dans l'abonnement Investisseur** (= équivalent 9,90 €/mois)
  - L'utilisateur passe-t-il automatiquement au plan SCI/Patrimoine si son parc dépasse 10 lots ? Ou il reste à 10 lots à vie ?
  - Le plan Cloud EU V2 (14,90-24,90 €) est-il inclus dans le lifetime ? **Recommandation : NON, c'est un add-on**.
- [ ] **Mise à jour à vie** : oui (tous les correctifs + features V1.5/V2 si planifiées sur architecture existante)
- [ ] **Support à vie** : email/chat dans les SLA standard, pas de SLA premium
- [ ] **Transférabilité** : pas transférable (lié à 1 personne ou 1 SCI)
- [ ] **Garantie remboursement** : 30 jours sans condition (comme LocataireCloud)
- [ ] **Bonus early adopters** : badge "Fondateur" + accès roadmap private + vote sur features prioritaires

### Mécanique opérationnelle

| Bloc | Détail |
|---|---|
| **Plateforme paiement** | Stripe (pas Paddle, car one-shot = pas besoin TVA mensuelle EU) |
| **Compteur "places restantes"** | Affiche sur landing en temps réel ("47/100 places vendues") |
| **Email confirmation** | "Bienvenue Fondateur ImmoTrack. Vous avez sécurisé 1 place sur 100." + accès roadmap private |
| **Mécanisme limitation accès** | Compte utilisateur tagged "founder" → débloque toutes features Investisseur sans paiement récurrent |
| **Setup technique** | 1,5 j-h (intégration Stripe + tag DB + page landing dédiée) |

### Impact financier

| Scénario | Cash up-front | Coût opportunité 3 ans (vs SaaS mensuel) |
|---|---|---|
| 100 × 249 € lifetime | **+24 900 €** | -100 clients × 9,90 €/mois × 36 mois × 0,8 marge = **–28 500 €** sur 3 ans |
| Net 3 ans | **–3 600 €** vs SaaS pur | – |

→ Mathématiquement, c'est neutre/légèrement négatif sur 3 ans. **MAIS** :
- Les fondateurs deviennent **ambassadeurs naturels** (referral × 2-3 clients chacun en moyenne dans le SaaS B2C)
- Le **narratif lancement** ("100 fondateurs ont déjà choisi ImmoTrack") = conversion booster sur le launch oct 2026
- Le **cash up-front** finance le launch (ads + identité + freelance backend) sans levée

→ **Conclusion** : option (b) RECOMMANDÉE. Cash up-front 25 K€ utilisable immédiatement pour financer le launch, en échange d'un coût opportunité maîtrisé.

## Effort estimé

- Décision pricing + sous-décisions (Didier) : 1-2 h
- Setup Stripe + tag DB + page landing : 1,5 j-h
- Brief campagne marketing dédiée (LinkedIn fondateur + ads + emails listing pré-launch) : 0,5 j-h
- **Total : ~2,5 j-h + cash promo 500-800 € ads early access**

## Quand livrer

- **Décision finale** : avant fin mai 2026
- **Setup technique** : juin 2026
- **Annonce publique** : début juillet 2026
- **Vente active** : juillet → 14 octobre 2026 (= jour du launch public)
- **Bascule SaaS pur** : 14 octobre 2026

## Décisions à prendre

- [ ] Option (a/b/c/d) — recommandation : (b) 249 € × 100 places
- [ ] Plan inclus à vie : Investisseur OU SCI/Patrimoine ?
- [ ] Cloud EU V2 inclus à vie ou add-on ?
- [ ] Bonus fondateurs (badge + vote roadmap) : oui/non ?
- [ ] Calendrier annonce : juillet 2026 ?
- [ ] Stripe vs autre plateforme ?

## Journal

- 2026-05-18 : créé · réaction audit LocataireCloud · option (b) 249 € × 100 places recommandée
