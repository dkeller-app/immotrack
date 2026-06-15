# Procédure — Bien affecter ses mouvements (guide utilisateur + référence)

> **Cadre** : location **nue**, revenus fonciers au **régime réel** (déclaration **2044**) — le domaine de l'app. Base légale vérifiée : `docs/subjects/AUDIT-FISCAL-MOUVEMENTS.md` (CGI, BOFiP, notice 2044). Autres régimes (meublé, micro, SCI à l'IS) : voir l'audit + sujet `FEAT-REGIMES-FISCAUX`.
> **À quoi ça sert** : que ta **2044 sorte juste en un clic** — chaque mouvement bancaire est rangé une fois, au bon endroit.

---

## 1. À comprendre AVANT de cliquer (le modèle mental)

Quand tu catégorises un mouvement, **3 informations** en découlent automatiquement :

1. **Est-ce que ça compte dans la 2044 ?** Et si oui, **sur quelle ligne** (211 à 250). Certains mouvements **ne comptent pas** (capital de prêt, dépôt de garantie, virement interne…) → ils sont tracés mais **hors résultat foncier**.
2. **À quel niveau ça se rattache** : un **logement** précis, un **immeuble**, ou la **SCI** globale. La catégorie propose un niveau par défaut ; **tu peux le changer**.
3. **Est-ce récupérable sur le locataire ?** (charges de copro, eau, ascenseur…) → réparti via un **compteur collectif**, pas déduit aux impôts.

**La règle d'or** : tu choisis **la catégorie** (= « c'est quoi, cette dépense ? ») ; l'app en **déduit** la ligne 2044 + le niveau + le badge. **Tu ne calcules jamais rien toi-même** — surtout pas le forfait de gestion (voir plus bas).

**3 pièges à retenir** (les plus coûteux) :
- 🔨 **Travaux** : réparer/entretenir/améliorer = **déductible**. **Construire / agrandir / reconstruire = NON déductible** (ça part dans la plus-value).
- 💳 **Prêt** : seuls les **intérêts + frais** sont déductibles. Le **capital remboursé = NON**.
- 🧾 **Tes frais de gestion perso** (déplacement, péage, tablette, frais bancaires) = **déjà couverts par un forfait automatique de 20 €/logement** → tu ne les déduis **pas en double**.

---

## 2. TABLEAU A — Ce qui ENTRE dans la 2044

| Ligne 2044 | Désignation (catégorie dans l'app) | Mouvements concernés | Niveau |
|---|---|---|---|
| **211** Loyers | **Loyers encaissés** · **Arriérés de loyers** | loyer hors charges, rappels, loyer d'avance | **logement** |
| **213** Recettes diverses | **Indemnité GLI / loyers impayés** · **Subventions ANAH** · **Indemnité d'assurance sinistre** · **Recettes diverses** (parking, antennes, pub, chasse) · **Dépôt de garantie utilisé** (impayés/charges) | encaissements ≠ loyer | logement (GLI, DG) / immeuble (parking, sinistre) |
| **221** Frais d'administration et de gestion | **Frais de gestion / honoraires** (agence, gérance, **comptable / expert-comptable**) · **Frais de procédure** (avocat, huissier, expert) · **Cotisations syndicales bailleurs** | factures de gérance, honoraires comptable, frais d'avocat | immeuble (gérance) · **SCI (comptable)** · logement (procédure) |
| **222** Forfait gestion | **AUTOMATIQUE — rien à saisir** | 20 € × nb de logements, calculé par l'app | — |
| **223** Assurances | **Primes d'assurance PNO** · **Primes d'assurance GLI** | quittances d'assurance | immeuble (PNO) · logement (GLI) |
| **224** Réparation / entretien / amélioration | **Travaux de réparation et d'entretien** · **Travaux d'amélioration** | plomberie, peinture, chaudière, cuisine équipée… (maintien/confort, **sans** changer la structure) | **logement** (immeuble pour toiture/façade) |
| **224bis** Rénovation énergétique | **Travaux de rénovation énergétique** | passoire E/F/G → A/B/C/D | logement |
| **225** Charges récupérables non récupérées | **Charges récupérables non récupérées** (+ calcul **automatique** au départ du locataire) | part avancée par toi, non remboursée par le locataire parti | logement |
| **226** Indemnités d'éviction | **Indemnités d'éviction / frais de relogement** | indemnité versée **pour relouer mieux** (pas pour reprise/revente) | logement |
| **227** Taxe foncière | **Taxe foncière (et taxes annexes)** | avis de TF (⚠ la TEOM/ordures est récupérable sur le locataire) | **immeuble** |
| **229** Provisions de copropriété | **Provisions pour charges de copropriété** | appels de fonds du syndic | **immeuble** + **récupérable → compteur** |
| **230** Régularisation N-1 | **Régularisation provisions copro N-1** (se **déduit** : 240 = (221..229) − 230) | régularisation annuelle du syndic | immeuble |
| **250** Intérêts d'emprunt | **Prêt — Intérêts d'emprunt** · **Prêt — Frais d'emprunt** (dossier, hypothèque, cautionnement, agios, assurance emprunteur) | part **intérêts** de l'échéance + frais bancaires liés au **prêt** | immeuble |

---

## 3. TABLEAU B — Ce qui N'ENTRE PAS dans la 2044 (tracé, mais hors résultat foncier)

| Désignation (catégorie) | Mouvements concernés | Pourquoi hors 2044 | Niveau |
|---|---|---|---|
| **Prêt — Capital remboursé** | part **capital** de l'échéance | seuls les intérêts sont déductibles | immeuble |
| **Frais de gestion forfaitisés (forfait 222)** | **frais bancaires** de tenue de compte · **frais de déplacement / kilométriques** · **péage**, carburant pour visites/EDL · **tablette / ordinateur / matériel** · téléphone, correspondance · enregistrement des baux | **déjà couverts** par le forfait auto de 20 €/logement → ne pas déduire en double | — (ne s'affecte nulle part) |
| **Acquisition / cession de bien** | frais de notaire, droits, frais d'agence à l'achat ; prix de vente | relèvent de la **plus-value** (régime séparé) | immeuble |
| **Dépôt de garantie reçu** | DG encaissé à l'entrée | non imposable au versement | logement |
| **Dépôt de garantie restitué** | DG rendu à la sortie | simple restitution | logement |
| **Travaux de construction / agrandissement (non déductible)** | extension, surélévation, reconstruction | **non déductible** (≠ entretien) → va à la plus-value | logement / immeuble |
| **Régularisation de solde locataire** | remboursement/complément de charges au locataire | déjà porté par la régularisation auto (ligne 225) | logement |
| **CCA / distribution SCI** | apport/retrait de compte courant d'associé, distribution de résultat | trésorerie entre la SCI et ses associés | **SCI** |
| **Virement interne (non déclarable)** | transfert entre 2 de tes comptes | ni recette ni charge | **aucun** |
| **Divers (non déductible)** | repas, dépenses perso, à ventiler | hors champ foncier | — |

---

## 4. Tes cas concrets

- **Frais bancaires** (tenue de compte) → **« Frais de gestion forfaitisés (222) »** (Tableau B). *Exception : des agios/frais d'un **emprunt** → ligne **250**.*
- **Frais de péage / carburant** (aller faire un EDL, visiter) → **« Frais de gestion forfaitisés (222) »**. Pas de barème kilométrique en foncier — c'est dans le forfait.
- **Tablette pour les EDL** → **« Frais de gestion forfaitisés (222) »**.
- **Facture de l'expert-comptable** → **« Frais de gestion / honoraires »** (ligne **221**), niveau **SCI**. **Déductible** ✅.
- **Repas** → **« Divers (non déductible) »**.
- **Échéance de prêt** (une seule ligne sur le relevé) → à **découper** : part **intérêts** → 250 ; part **capital** → « Capital remboursé » (hors) ; part **assurance emprunteur** → 250. *(Découpage assisté = sujet `FEAT-PRET-ECHEANCIER`.)*

---

## 5. Ce que ça implique pour l'app (spec B2-B3)

- **Catégorie à créer** : **« Frais de gestion forfaitisés (forfait 222) »** (`special`, hors résultat) — couvre frais bancaires, péage, déplacement, matériel. + garde-fou « déjà couvert par le forfait 20 €/logement, ne pas déduire ».
- **« Frais de gestion / honoraires » (221)** : rendre le niveau **SCI** accessible (pour le comptable).
- **Le forfait 222 reste 100 % automatique** (calculé par le moteur 2044 — Chantier A).
- **Garde-fous pédagogiques** (le « comprendre avant ») : afficher, au moment de catégoriser, la ligne 2044 cible + un mot d'explication ; alerter sur les 3 pièges (construction vs entretien, capital vs intérêts, frais forfaitisés). → c'est le **parcours guidé** déjà maquetté (`mockups/loyer-2044-pro/`).
- **Hors scope actuel** : meublé / micro / SCI IS → `FEAT-REGIMES-FISCAUX`.

> ⚠️ Guide **indicatif** (paramétrage produit) — pour un cas précis, l'expert-comptable tranche. Re-vérifier à chaque loi de finances. Détail + sources : `AUDIT-FISCAL-MOUVEMENTS.md`.
