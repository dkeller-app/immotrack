# WATCH-LOCATAIRELIVE — Monitoring trimestriel du concurrent LocataireCloud

**Status** : 🔄 En cours (monitoring permanent depuis 2026-05-18) · **Prio** : P2 · **Taille** : XS (1-2h / trimestre)
**Détecté** : 2026-05-18 (signalé par user comme "concurrent sérieux que nous ne connaissons pas")
**Lié à** : BIZPLAN-V2 · IA-COPILOTE · OUTILS-SEO-GRATUITS · FOUNDER-EDITION

## Contexte

LocataireCloud (URL: locataire.live) est un concurrent **sérieux** identifié hors panel BIZPLAN-STRATEGIE initial. Audit complet réalisé 2026-05-18 (cf section "Audit initial" ci-dessous).

**Profil** :
- SaaS français, sortie de bêta avril 2026
- Fondateur unique, 40+ lots gérés depuis 15 ans, pas de levée connue
- Pricing actuel : **lifetime 347 €** (35/50 places restantes), futur SaaS 9,90-49,90 €/mois
- Cible : bailleurs + agences (page `/agences` dédiée)
- Velocity de feature delivery élevée (26 features roadmap publique sur T2 2026 → T1 2027)
- Stratégie SEO via 16 calculateurs gratuits

## Pourquoi monitoring permanent

5 signaux à surveiller :
1. **Adoption pricing lifetime** : 50 places vendues → 17 K€ cash + 50 évangélistes payants à vie + bascule SaaS mensuel
2. **Livraison de l'IA conversationnelle** (T2 2026 en cours) : si livrée correctement → différenciant fort
3. **App mobile native** (T4 2026) : iOS/Android, plus lourd que Capacitor d'ImmoTrack
4. **Module agence + mandats** (T3 2026) : attaque cible CGP **2 trimestres avant** ImmoTrack V2 (Q1-Q3 2027)
5. **Référencement comparatifs** : apparition dans BailFacile/iGestionlocative/Manda/Gererseul = bascule "concurrent visible"

## Cadence monitoring

| Fréquence | Action |
|---|---|
| **Trimestriel** | Fetch /roadmap + /tarifs + /agences · update SWOT_CONCURRENTS.md + CARTE_POSITIONNEMENT.md · note dans journal |
| **Annuel** | Audit complet refait (comme audit initial 2026-05-18) · décision stratégique : réagir ou non |
| **Veille passive permanente** | Mention sur Twitter/LinkedIn/Reddit r/vosfinances/r/ImmobilierFR · Trustpilot · Indie Hackers · Product Hunt · communiqués presse |

## Audit initial 2026-05-18 — données capturées

### Roadmap publique (26 features)
- **Livrées (mars-avr 2026)** : Colocation native · Place de marché annonces · EDL numérique · Espace locataire complet · Maintenance préventive · Suivi expiration documents
- **En cours T2 2026** : Sync bancaire DSP2 · Agent IA conversationnel · Signature électronique avancée
- **T3 2026** : Compta LMNP/SCI · Accès comptable · Reporting fiscal · Extension Chrome LBC/SeLoger · IRL · **Mandats gestion locative agence** · Encadrement loyers · Procédure impayés · Régul ALUR
- **T4 2026** : Import Rentila/Locagestion/Excel · **App mobile iOS/Android native** · Conformité bail meublé · Contestation EDL · Visites relocation
- **T1 2027** : Audit RGPD candidatures

### USP affichés
1. Colocation native (claim "aucun outil FR ne le fait à ce niveau")
2. Parc réel 40+ biens / 15 ans expérience fondateur
3. Automatisations paramétrables (plafonds auto-approuvés artisans)
4. Zéro friction communication (messagerie centralisée + IA conv)
5. Conformité packagée (Hoguet, ALUR, RGPD, DSP2)

### Stratégie SEO
16 calculateurs gratuits (rendement, IRL, cession, LMNP, capacité emprunt, frais notaire, etc.) — pipeline d'acquisition à long terme.

### Faiblesses identifiées
- Posture cloud SaaS (vs souverain d'ImmoTrack)
- Pas de validation EDL avocat mentionnée
- Pas de PDF natif annoncé (probable HTML→PDF)
- Pas de snapshot signé highlight diff
- Pas de mention RGPD hébergement FR
- Pas de différenciants techniques rares (= 0 ⭐ exclusif si on appliquait le Scorecard)
- Fondateur solo, 15 clients lifetime max, pas de traction publique

## Sources audit

- [locataire.live homepage](https://www.locataire.live)
- [locataire.live/roadmap](https://www.locataire.live/roadmap)
- [locataire.live/agences](https://www.locataire.live/agences)
- [locataire.live/outils](https://www.locataire.live/outils)

## Décisions structurantes (déjà prises 2026-05-18)

- [x] Ajouter LocataireCloud comme concurrent #9 dans SWOT_CONCURRENTS.md (BIZPLAN-V2)
- [x] Créer 3 sujets réactionnels : OUTILS-SEO-GRATUITS · IA-COPILOTE · FOUNDER-EDITION
- [x] Maintenir posture souveraine ImmoTrack (point fort vs SaaS cloud LocataireCloud)
- [ ] Décider monitoring quarterly = automatisé (script fetch /roadmap + diff) OU manuel (1-2h Didier)

## Journal

- 2026-05-18 : créé · audit initial complet · 4 sujets réactionnels lancés (WATCH-LOCATAIRELIVE + OUTILS-SEO-GRATUITS + IA-COPILOTE + FOUNDER-EDITION)
