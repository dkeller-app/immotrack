# ENTRETIENS-HOGUET — 10 entretiens gestionnaires (Phase E)

> **Statut** : ⏳ Sourcing à démarrer · **Prio** : P1 (validation pricing Gestionnaire 29,90 €/user)
> **Taille** : M (10h sourcing + 5h entretiens + 3h synthèse = 18h sur 1 mois)
> **Lié à** : STRIPE-PAYWALL-V1 (pricing Tier Gestionnaire à valider avant Phase D)

---

## Objectif

Valider en entretiens semi-structurés avec 10 gestionnaires immobiliers Hoguet :

1. **Pricing** : 29,90 €/user/mois acceptable ? Quelle valeur perçue ?
2. **Différenciants** : "simplicité + UX 1 écran + automatisation" tient face à Qalimo V2 (4,9/5 Trustpilot) ?
3. **Features prioritaires** : Pilotage matriciel · multi-bailleurs · automatisation quittances · CRG · FEC · GLI ?
4. **Décision V2 multi-tenant** : faut-il investir 240-260h post-V1 ? Si oui, quel calendrier ?

## Cible

- **Gestionnaires immobiliers indépendants** avec carte Hoguet
- **Portfolio 10-50 lots** (sweet spot 20-30)
- **Insatisfaits de leur outil actuel** OU sur Excel (le plus prometteur)
- France métropolitaine

Sources :
- Pages Jaunes "gestionnaire immobilier" par département (top 10 villes)
- LinkedIn Sales Navigator : titre "Gestionnaire locatif" + carte Hoguet
- FNAIM annuaire (filtrage activité gestion)
- Groupes Facebook "Bailleurs particuliers" → demander "qui est votre gestionnaire ?"

## Méthodologie

### Format
- **Visio 30 min** (Google Meet ou téléphone)
- **Compensation** : 50 € cadeau Carrefour OU 3 mois gratuits ImmoTrack quand on lance
- **Recording** : avec consentement explicite (RGPD)
- **Anonymisation** : pas de nom dans la synthèse finale

### Plan d'entretien (30 min)

**Min 0-3 — Mise en confiance**
- Présentation Didier (dev solo, bailleur particulier qui code pour s'aider)
- "Je ne vends rien, je veux comprendre vos besoins"
- Demande consentement recording

**Min 3-10 — Découverte (laisser parler)**
- "Décrivez votre journée type"
- "Quels logiciels utilisez-vous au quotidien ?"
- "Combien de lots gérez-vous ?"
- "Quelle est la chose qui vous prend le plus de temps et qui vous énerve ?"

**Min 10-18 — Approfondir les frictions**
- "Combien d'heures par semaine sur l'admin (vs visites/négo) ?"
- "Comment gérez-vous les impayés ?"
- "Comment gérez-vous les CRG (compte rendu gérance) ?"
- "Comment vos clients bailleurs reçoivent leurs documents ?"
- "Avez-vous déjà testé Qalimo / Rentila / Smovin / BailFacile ?"

**Min 18-25 — Tester la value prop ImmoTrack**
- Demo écran partagé 5 min du dashboard wahoo Phase B
- "Si vous aviez cet outil pour 29,90 €/user/mois, vous remplaceriez votre outil actuel ?"
- "Quelle feature serait l'argument décisif ?"
- "Qu'est-ce qui vous arrêterait ?"

**Min 25-30 — Closing**
- "Si on lance dans 6 mois, vous voudriez être beta testeur ?"
- Remerciements + compensation
- Demande de référer 2-3 collègues

## Sourcing — Templates de messages

### LinkedIn (sales nav)
```
Bonjour [Prénom],

Je suis bailleur particulier (4 lots) et développeur solo. Je construis un outil de gestion locative pensé pour les pros Hoguet 10-50 lots (j'ai des lacunes sur ce segment, vous êtes l'expertise).

Auriez-vous 30 min en visio dans les 2 prochaines semaines pour me partager votre quotidien et vos frustrations sur les outils existants ? Je compense le temps (50€ Carrefour ou 3 mois gratuits au lancement).

Sans agenda commercial — je veux comprendre.

Bien cordialement,
Didier Keller
```

### Email (annuaire FNAIM, Pages Jaunes)
```
Objet : Étude utilisateur — 30 min pour partager votre expérience gestion locative

Bonjour,

Je suis Didier Keller, développeur solo et bailleur particulier en région parisienne. Je construis ImmoTrack, un outil de gestion locative et je cherche à mieux comprendre les besoins des gestionnaires immobiliers Hoguet (10-50 lots) — votre profil semble correspondre.

Auriez-vous 30 min en visio (Meet / téléphone) dans les 2 prochaines semaines pour me partager votre quotidien, vos frustrations sur les outils existants (Qalimo, Rentila, Smovin, ICS…) et votre vision ?

→ Sans aucun agenda commercial : je veux comprendre, pas vendre.
→ Compensation : 50 € en cadeau (Carrefour, FNAC…) ou 3 mois gratuits au lancement.

Si oui, votre dispo dans Calendly : [LIEN]

Bien cordialement,
Didier Keller
[Tél] · [Email] · [LinkedIn]
```

### Forum / Groupe Facebook
```
[POSTAGE GROUPE PRO]

Bonjour à tous,

Je suis dev solo et bailleur particulier. Je construis un outil de gestion locative pensé pour les gestionnaires Hoguet (10-50 lots).

Si vous êtes gestionnaire et que vous avez 30 min à m'accorder pour comprendre votre quotidien (visio ou téléphone), je compense votre temps (50 € ou 3 mois gratuits au lancement). Aucun agenda commercial.

Vos critères pour participer :
- Carte Hoguet active
- Au moins 10 lots gérés
- Utilisez un outil dédié OU Excel

DM ou commentaire pour planifier 🙏

Didier
```

## Tableau de suivi (à dupliquer en Google Sheet)

| # | Prénom | Société | Lots gérés | Outil actuel | Source contact | Date envoi | Date relance | Date entretien | Notes synthèse | Beta-testeur OK ? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |

Objectif : 30 messages envoyés → 15 réponses → **10 entretiens réalisés**.

## Coût estimé

- Compensation 10×50 € = 500 €
- LinkedIn Sales Navigator 1 mois = 80 €
- Outils annexes (Calendly Pro, Loom) = 50 €
- **Total : ~630 € pour 10 entretiens** + ROI : décision GO/NO-GO sur 240-260h V2

## Livrable final (post-entretiens)

Synthèse markdown `docs/strategie/ENTRETIENS-HOGUET-SYNTHESE.md` :
- Personnage type gestionnaire (frictions, outils, JTBD)
- Pricing acceptable (médian, plage)
- Features ranking (top 3 features qui font basculer)
- Verdict V2 GO / PIVOT / NO-GO

Recommandation finale au user pour décision Phase D launch + V2 roadmap.

## Pré-requis

- ⏳ Phase B mockup wahoo livré (pour demo 5 min en entretien)
- ⏳ Phase A1+A2+A3 validés visuellement par user (app fonctionnelle pour demo)
- ⏳ Compte LinkedIn Sales Navigator (acheter au démarrage Phase E)
- ⏳ Email pro `didier@immotrack.app` (à créer si pas déjà)

## Timing recommandé

Phase E doit **commencer en parallèle de Phase D dev** (pas avant, sinon pas de demo wahoo crédible ; pas après, sinon décision V2 trop tardive).

→ Phase B livrée → Phase D D0-D2 + Phase E sourcing en parallèle (3 semaines)
→ Phase D D3-D5 + Phase E entretiens en parallèle (1 mois)
→ Synthèse E → décision launch Phase D commerciale + V2 roadmap
