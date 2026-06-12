# ImmoTrack — Note Comité de Direction
**Juin 2026**

---

## 1. Verdict en 5 lignes

ImmoTrack est un logiciel de gestion locative pour bailleurs particuliers et SCI familiales, conçu et utilisé en production depuis 2 ans par son créateur sur 22 logements réels.

Le marché français compte 7,4 M de logements locatifs privés et est en consolidation rapide. Aucun acteur ne domine le segment B2C : la fenêtre est ouverte 18 mois.

**ImmoTrack a 20 fonctionnalités exclusives** vérifiées (audit comparatif sur 8 concurrents B2C + 4 acteurs PRO). Aucun concurrent n'en a une seule équivalente.

Le produit est commercialisable en octobre 2026. Modèle Founder Edition lifetime + abonnement SaaS.

Investissement requis pour la V1 publique : ~15 000 € cash, exécution solo bootstrappée. Pas de levée nécessaire en scénario médian.

---

## 2. Le marché en 1 page

### Chiffres clés

- **7,4 millions** de logements locatifs privés en France
- **6 500** Conseillers en Gestion de Patrimoine indépendants (cible B2B)
- **42 000** utilisateurs sur le leader fiscal (Gererseul) — preuve que le marché paye
- **8,6 % de croissance annuelle** du marché mondial des logiciels de gestion locative

### Concurrence — 3 familles distinctes

**B2C bailleur particulier** (cible directe) : Rentila, BailFacile, Smartloc, Qalimo, Gererseul, ImmobilierLoyer, Smovin, LocataireCloud.
→ Aucun leader dominant. Prix entre 0 et 20 €/mois. Couverture fonctionnelle moyenne 60 %.

**B2B agences pro** (hors cible) : Septeo (leader, CA 420 M€), LOCKimmo, Powimo.
→ Prix 80-300 €/mois. Cible 3 200 cabinets ADB. Consolidation en cours.

**Agences digitales** : Manda (43 M€ levés en 2024), Imodirect.
→ Modèle commission 5,9 % sur loyer. Cible le bailleur qui veut déléguer.

### Fenêtre de marché

Le leader B2C "naturel" Qalimo plafonne à 71 % de couverture sans aucun différenciant exclusif. Un nouvel entrant a livré 26 fonctionnalités en 6 mois (LocataireCloud). **Le marché bouge, personne n'a verrouillé la couche logicielle souveraine.**

---

## 3. ImmoTrack — problème, solution, différenciants

### Le problème

Le bailleur particulier moyen gère son patrimoine avec 3 outils : Excel pour les loyers, Word pour les baux, Google Drive pour les EDL. Coût : 4-6 heures par mois en double saisie et erreurs.

Les SCI familiales et les CGP qui suivent plusieurs investisseurs ont les mêmes contraintes amplifiées : multi-entités, fiscal 2044 et 2072, conformité Loi Climat 2021, RGPD.

### La solution

ImmoTrack centralise dans un seul outil web installable (PWA), entièrement souverain (les données restent chez l'utilisateur via Google Drive), avec couverture fiscale française complète (2044, FEC, bilan annuel par entité).

### 5 différenciants impossibles à copier en 6 mois

1. **Import acte de vente PDF** → crée bailleur + immeuble + logements en 30 secondes. Aucun concurrent B2C.
2. **Wizard bail paraphes page-par-page** avec pédagogie article §18 et clause "Lu et approuvé". Aucun concurrent.
3. **Aide déclaration 2044 + Export FEC** conforme arrêté 29 juillet 2013. Aucun concurrent B2C.
4. **Drive sync souverain** : aucune donnée stockée chez ImmoTrack. Posture opposée à 100 % des concurrents.
5. **Blocage strict Loi Climat 2021** : bail refusé si DPE F ou G. Protection légale automatique.

### 15 autres différenciants documentés

EDL délégué offline, Snapshot bail signé avec highlight diff, Cockpit conformité visuel, Cycle IRL 6 états contextuels, Pipeline candidature non-discriminatoire conforme décret 2015-1437, Architecture multi-tenant prête (Supabase), Drive co-gestion 2 utilisateurs, Send-as par entité Gmail, Bail repris Art 1743, Civilité M./Mme par locataire dans toutes surfaces, Audit trail intégré, Plan effacement RGPD article 17, Bail multi-bailleurs/locataires/garants avec N cadres signature, Templates HTML personnalisables, Pré-remplissage diagnostics par adresse.

---

## 4. Traction et roadmap

### Ce qui est livré (octobre 2024 → juin 2026)

20 mois de développement intensif solo. 15 versions majeures (v1 → v15.261). Application utilisée en production réelle sur **22 logements, 3 SCI, 21 baux, 13 loyers actifs**.

**6 derniers mois** : couverture fiscale française complète, conformité Loi Climat et RGPD, wizard bail signature distance (relais Cloudflare audité), import acte de vente, refonte mobile complète (audit clôturé sur 9 onglets), architecture Supabase multi-tenant prête (P0-A à P0-D).

### Ce qui reste avant V1 publique (octobre 2026)

| Bloc | Effort | Statut |
|---|---|---|
| Validation EDL par avocat | 1 500 € | À commander |
| Module gestion pro (mandat + CRG) | 11 h | À spec |
| Email standards (quittance, échéance, rappel impayé) | 6 h | À livrer |
| Site vitrine + pricing public | 8 h | À créer |

**Total : ~25 heures de dev + 1 500 € avocat + 3 000 € designer freelance.**

### Trajectoire produit après V1

- **V1.1** (T4 2026 — T1 2027) : Mandat Hoguet, CRG automatisé, Pré-contentieux impayés. Cible CGP partenariats.
- **V2** (T2 — T4 2027) : Multi-utilisateurs SaaS, Portail bailleur, Portail locataire, Notifications. Backend Supabase déjà prêt.
- **V3** (2028) : OCR factures, Comparateur loyer marché, Signature eIDAS, Module agence.

---

## 5. Modèle économique

### Tarification proposée

| Plan | Prix | Cible |
|---|---|---|
| Solo | Gratuit (1 lot) | Acquisition, freemium |
| Investisseur | 9,90 €/mois (99 €/an) | Bailleur 2-10 lots |
| SCI Patrimoine | 19,90 €/mois (199 €/an) | SCI familiale 11-30 lots |
| Agence Pro (V2) | 49,90 €/mois/user | Petits cabinets |

### Founder Edition — bootstrap acquisition

100 places à 249 € lifetime (accès Investisseur à vie). Annonce juillet 2026.
**Cash up-front : 24 900 €**. Crée 100 utilisateurs payants évangélistes avant lancement public.

### Métriques unitaires (benchmark SaaS B2C niche)

- ARPU pondéré : ~11,40 €/mois
- CAC moyen pondéré (60 % SEO + 40 % paid) : 25 €
- LTV brut sur 20 mois (churn 5 %) : 228 €
- **Ratio LTV/CAC : 7,3** (excellent ; sain au-dessus de 3)
- Payback CAC : 2,7 mois
- Marge brute : 80 %

---

## 6. Projections financières — 3 scénarios

| Scénario | Fin 2026 | Fin 2027 | Fin 2028 | Break-even |
|---|---|---|---|---|
| **Bas** (slow-burn) | 60 clients · 7 K€ ARR | 250 · 32 K€ | 600 · 80 K€ | T4 2028 |
| **Médian** (cible) | 150 · 19 K€ | 700 · 100 K€ | 1 800 · 277 K€ | T4 2027 |
| **Haut** (boost) | 350 · 49 K€ | 1 600 · 240 K€ | 4 000 · 660 K€ | T4 2026 |

Scénario médian = équivalent 1,5 % de la base Gererseul à 3 ans. Conservative.

### Valorisation à 3 ans (cession potentielle)

- Médian : 1,6 à 2,7 M€ (3-5× ARR)
- Haut : 5 à 8 M€ (4-6× ARR)

Acquéreurs probables : Septeo (a déjà fait l'acquisition de INCH en 2024 pour ADB), Manda (build-up acquisitif), fonds proptech (Naxicap, Apax).

---

## 7. Risques et mitigation

| Risque | Probabilité | Mitigation |
|---|---|---|
| LocataireCloud livre IA conversationnelle T2 2026 et capte la cible CGP | Moyenne | Notre posture souveraine est opposée. IA-COPILOTE locale sur la roadmap V1.5. |
| BailFacile copie 1 ou 2 différenciants (DPE/Risques auto) | Forte | 5 différenciants sont structurellement difficiles à copier (architecture, conformité, signature). |
| Septeo descend en B2C avec offre low-cost | Faible | Improbable selon stratégie historique. Si arrive : pivoter sur SCI multi-utilisateurs et agence pilote. |
| Burn-out fondateur solo | Moyenne | Recrutement freelance dev backend T1 2027 prévu (cf. V2). Pas de dépendance critique. |
| Dépendance Google Drive | Moyenne | WebDAV (Infomaniak / Nextcloud) planifié V1.5. Backend EU multi-tenant V2 (déjà préparé). |

---

## 8. Annexes par audience

### Annexe A — Investisseur

**Ask** : pré-seed 150 K€ optionnel pour accélérer Q1 2027 (recrutement dev + marketing). Non requis en scénario médian.

**Use of funds** : 60 % recrutement, 30 % acquisition payante, 10 % légal.

**Comparables levées** : Manda 43 M€ (Naxicap 2024), Hello Syndic 21 M€ (2023), Imodirect 500 K€ (2018). Marché chaud sur la proptech FR.

**Sortie** : multiples 3-7× ARR à 3 ans selon scénario.

### Annexe B — Banque

**Demande** : ligne de crédit professionnel 30 K€ pour avance de trésorerie (annonces, infrastructure, frais légaux).

**Garanties** : société à constituer en SASU à seuil 25 K€ de CA. Compte pro Qonto/Shine.

**Récurrence revenus** : modèle SaaS abonnement = revenus prédictibles (vs vente unique). Cash-flow positif T4 2027 en scénario médian.

### Annexe C — Conseiller en Gestion de Patrimoine

**Pourquoi vous devriez référer ImmoTrack à vos clients SCI familiale et investisseurs locatifs** :

1. Vos clients gagnent 4-6 h/mois en gestion administrative.
2. Vous montrez à vos clients que vous maîtrisez les outils modernes (différenciation).
3. Programme de partenariat : 30 % de commission sur la première année.
4. Cobranding possible sur l'extranet client.
5. Démonstration en direct : import d'un acte de vente PDF en 30 secondes, fiscal 2044 automatique.

### Annexe D — Beta testeur

**Pourquoi tester maintenant** :

1. Vous bénéficiez de l'offre Founder Edition lifetime 249 € (100 places, plus jamais ce prix).
2. Vous accédez à la roadmap privée et votez les prochaines fonctionnalités.
3. Vous bénéficiez d'un support direct par le créateur pendant 6 mois.
4. Vous testez sur vos données réelles, vos retours sont intégrés dans la semaine.

---

## 9. Décisions structurantes à valider

1. **Founder Edition lifetime 249 € × 100 places** : OK validée 2026-05-18. Setup Stripe avant fin juin.
2. **Statut juridique** : auto-entrepreneur jusqu'à 25 K€ CA, bascule SASU au-delà. Création société avant octobre 2026.
3. **Investissement légal V1** : 3 000 € (CGU + CGV + DPA + validation EDL avocat). À engager juin-juillet.
4. **Recrutement freelance dev backend** : à activer si scénario médian confirmé T1 2027 (MRR > 5 000 €/mois).
5. **Levée pré-seed 150-300 K€** : à activer uniquement en scénario haut (MRR > 8 000 €/mois T1 2027).

---

## Sources

- Audit comparatif quantitatif : `ImmoTrack_Comparatif_Concurrents_2026.xlsx` (149 critères × 9 outils)
- Audit visuel concurrent LocataireCloud : `docs/strategie/audit-visuel-locataire-live/`
- BIZPLAN v1 livré 2026-04-30 : `docs/strategie/BIZPLAN.md`
- INSEE parc logements 2025 : insee.fr/fr/statistiques/8640662
- Sites éditeurs concurrents vérifiés mai-juin 2026
