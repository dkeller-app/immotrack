# Audit fiscal — Affectation des mouvements bancaires d'un bailleur (5 régimes)

> **But** : référence légale qui fige, pour ImmoTrack, « tout mouvement bancaire → comment le traiter/l'affecter ». Fonde le mapping catégorie→ligne 2044→niveau des Chantiers B (affectation) et A (2044).
> **Date des valeurs** : revenus **2025** (déclarés au printemps **2026**). ⚠️ Valeurs **indicatives** : pour un cas précis, faire valider par un comptable. Les seuils/taux sont réévalués chaque loi de finances.
> **Sources officielles** : CGI (Légifrance), BOFiP (`bofip.impots.gouv.fr`), notices/formulaires `impots.gouv.fr`, `service-public.fr`. Réfs précises dans chaque section.

---

## 0. Périmètre

L'app cible aujourd'hui la **location nue au régime réel (déclaration 2044)**. Mais un même mouvement bancaire se traite **différemment selon le régime** du bailleur — d'où l'audit des **5 régimes**. Les 4 autres relèvent d'**autres déclarations** (pas la 2044) : à garder en tête pour la commercialisation (l'app devra savoir quel régime s'applique avant de classer).

---

## 1. Les 5 régimes en un coup d'œil

| Régime | Bien | Déclaration | Logique de charges | Seuil / abattement | Amortissement ? |
|---|---|---|---|---|---|
| **Micro-foncier** | nu | 2042 | aucune charge réelle | abattement **30 %**, seuil **15 000 €** de revenu brut foncier/an | non |
| **Foncier réel** | nu | **2044** | charges sur **liste limitative** (CGI art. 31) | — (charges réelles) | **non** |
| **Micro-BIC** | meublé | 2042-C-PRO | aucune charge réelle | meublé classique & tourisme **classé** : **50 %** · tourisme **non classé** : **30 % / 15 000 €** · minimum 305 € | non |
| **Réel BIC (LMNP/LMP)** | meublé | 2031 + 2042-C-PRO | charges réelles **+ AMORTISSEMENT** | — | **OUI** (bien hors terrain + mobilier + travaux) |
| **SCI à l'IS** | nu ou meublé | 2065 | charges réelles **+ amortissement**, déductibilité élargie | — | **OUI** ; mais **distributions imposées** + plus-value pro à la sortie (amortissements réintégrés) |

**La fracture clé = l'amortissement.** Foncier (micro ou réel) = **pas d'amortissement**, charges sur liste limitative. Meublé réel & IS = on **amortit le bien**, ce qui efface souvent le résultat imposable pendant des années — mais l'addition arrive à la revente (IS) ou via la réintégration des amortissements (LMNP, réforme 2025).

Sources : CGI art. 32 (micro-foncier), 31 (foncier réel), 50-0 (micro-BIC), 39 & s. (BIC réel), 206/209 (IS) · BOFiP [BOI-RFPI-DECLA-10](https://bofip.impots.gouv.fr/bofip/3973-PGP.html) · [BOI-BIC-CHAMP-40-20](https://bofip.impots.gouv.fr/bofip/3610-PGP.html) · [location meublée tourisme — impots.gouv.fr](https://www.impots.gouv.fr/particulier/questions/je-suis-proprietaire-dune-location-meublee-de-tourisme-quel-est-le-nouveau).

---

## 2. Inventaire des mouvements — traitement & affectation

Colonne **2044** = ligne en location nue régime réel (cœur de l'app) ou « **hors** » résultat foncier. Colonne **niveau** = à quoi le mouvement se rattache logiquement dans l'app (logement / immeuble / SCI), **surchargeable**. Colonne **autres régimes** = ce qui change ailleurs.

### A. RECETTES

| Mouvement | 2044 (nu réel) | Niveau | Autres régimes | Source / piège |
|---|---|---|---|---|
| Loyer encaissé (hors charges) | **211** | logement | meublé→BIC recette ; micro→abattement | CGI 29 · loyer **nu** déclaré HC |
| Arriérés de loyers | **211** | logement | idem | imposé l'année d'**encaissement** |
| Loyer d'avance | **211** | logement | idem | imposé à l'encaissement |
| **Provisions pour charges** encaissées du locataire | **211** (avec le loyer) puis régularisées | logement | — | ⚠️ **neutres** au final : encaissées en recette, mais la régularisation (ligne 230 / 229) annule ; **piège du double-compte** si re-tagué |
| Indemnité **GLI / loyers impayés** reçue | **213** | logement | — | remplace le loyer → imposable |
| **Subvention ANAH** | **213** si finance des charges déductibles ; sinon réduit la base des travaux | logement | — | BOFiP RFPI ; ⚠️ une subvention de travaux **diminue** la dépense déductible correspondante |
| **MaPrimeRénov'** | réduit la base des travaux déductibles (224/224bis) | logement | — | ⚠️ ne pas déduire les travaux **financés par la prime** |
| Indemnité d'**assurance sinistre** | **213** (si couvre des charges déductibles / pertes de loyer) | immeuble | — | sinistre bâtiment |
| Recettes accessoires (parking, **antennes-relais**, pub, droit de chasse, pas-de-porte) | **213** | immeuble | — | revenus accessoires de l'immeuble |
| **DG utilisé** pour impayés/charges | **213** (devient imposable) | logement | — | ⚠️ le DG **conservé** au titre d'impayés devient une recette imposable |

### B. CHARGES DÉDUCTIBLES (location nue, réel)

| Mouvement | 2044 | Niveau | Autres régimes | Source / piège |
|---|---|---|---|---|
| Honoraires de **gérance / agence** + **comptabilité / expert-comptable** versés à un **tiers** | **221** | immeuble (gérance) / **SCI** (compta = charge de la société) | déductibles partout au réel | [BOFiP RFPI-BASE-20-10 §60](https://bofip.impots.gouv.fr/bofip/5804-PGP.html) : « sommes versées pour la tenue de comptabilité » = **déductibles montant réel** ✅ |
| **Frais de procédure** (avocat, huissier, expert) | **221** | logement | idem | montant réel |
| Rémunération **gardien / concierge** | **221** | immeuble | idem | montant réel |
| Cotisations **chambres syndicales** de bailleurs | **221** | SCI / bailleur | idem | montant réel |
| **Autres frais de gestion DU BAILLEUR** : **déplacement / kilométriques** (visites, EDL), **matériel / informatique** (tablette, ordinateur), mobilier de bureau, correspondance, téléphone, frais d'enregistrement des baux, **frais de tenue de compte bancaire** | **222** = **forfait 20 €/local** (auto) | — (ne s'affecte nulle part) | **déductibles au réel** en BIC/IS (déplacement au barème, matériel **amorti**) | ⚠️ **PIÈGE** : aucun ne se déduit **pour son montant réel** en foncier — forfait « réputé les couvrir » [BOFiP RFPI-BASE-20-10 §210]. **Pas de barème kilométrique** en foncier. ⚠️ **NE PAS confondre avec la comptabilité** (elle = déductible réel 221, §60). |
| **Repas / restauration** du bailleur | **hors** (non déductible, hors champ) | — | BIC : déductibles seulement sous conditions strictes | pas une charge de l'immeuble — ni 221 ni forfait |
| **Assurance PNO** | **223** | immeuble | déductible partout | toutes primes (incendie, DDE, RC bailleur…) |
| **Assurance GLI** / loyers impayés | **223** | logement | déductible partout | par bail |
| **Travaux réparation / entretien** | **224** | logement | BIC réel/IS : **amortissables** ou charge | maintien en l'état |
| **Travaux d'amélioration** | **224** | logement | idem | équipement de confort sans modif structure |
| **Rénovation énergétique** (E/F/G→A/B/C/D) | **224bis** | logement | idem | plafond déficit rehaussé (cf §3) |
| **Charges récupérables NON récupérées** au départ du locataire | **225** | logement | — | la part **avancée par le bailleur** et non remboursée → déductible. Dans l'app = calcul auto `computeRegul` |
| **Indemnité d'éviction** versée + frais de relogement | **226** | logement | — | ⚠️ déductible **seulement** si pour **relouer** dans de meilleures conditions ; **exclue** si reprise perso/revente/démolition |
| **Taxe foncière** + taxes annexes | **227** | immeuble | déductible partout | ⚠️ la **TEOM** (ordures) incombe au **locataire** (récupérable) → pas une charge nette du bailleur |
| **Provisions de copropriété** versées au syndic | **229** | immeuble + **récupérable→compteur** | — | [BOFiP RFPI-BASE-20-70](https://bofip.impots.gouv.fr/bofip/5810-PGP.html) ; total versé en N |
| **Régularisation N-1** des provisions copro | **230** (se **déduit** du total charges) | immeuble | — | ⚠️ réintègre les charges non déductibles + récupérables ; **240 = (221..229) − 230** |
| **Intérêts d'emprunt** + frais accessoires (dossier, hypothèque, **cautionnement**, agios, **assurance emprunteur**) | **250** | immeuble (le prêt finance un bien) | déductibles partout au réel | [BOFiP RFPI-BASE-20-80](https://bofip.impots.gouv.fr/bofip/5808-PGP.html) ; ⚠️ **hors plafond** des 10 700 € de déficit |

### C. HORS RÉSULTAT FONCIER (mais souvent déductible/amortissable dans les autres régimes)

| Mouvement | 2044 | Niveau | Autres régimes | Source / piège |
|---|---|---|---|---|
| **Capital** de l'emprunt remboursé | **hors** (non déductible) | immeuble | hors aussi en BIC/IS — mais l'**amortissement compense** | ⚠️ piège classique : déduire le capital |
| **Travaux de construction / reconstruction / agrandissement** | **hors** (non déductible) | logement/immeuble | **AMORTISSABLES** en BIC réel & IS | ⚠️ **LE piège le plus cher** : pris pour de l'entretien (224) → redressement. [BOFiP RFPI-BASE-20-30-10] |
| **Frais d'acquisition** (notaire, droits, agence à l'achat) | **hors** (→ prix de revient / plus-value) | immeuble | BIC réel : **option** charge ou amortissement ; IS : déductibles/amortissables | régime des plus-values |
| **Prix de vente** d'un bien | **hors** → **plus-value immobilière** (régime distinct) | immeuble | LMNP : réintégration des amortissements (réforme 2025) ; IS : plus-value **pro** | déclaration séparée |
| **DG reçu** (versement initial) | **hors** (non imposable au versement) | logement | — | devient 213 **si utilisé** |
| **DG restitué** | **hors** | logement | — | simple restitution |
| **Frais bancaires de tenue de compte** | **hors** (couverts par le forfait 222) | — | **déductibles** au réel BIC/IS | cf piège §B ligne 222 |
| **Virement interne** entre comptes du bailleur | **hors** (ne se déclare pas) | aucun | hors partout | 2 lignes jumelles à neutraliser |
| **SCI à l'IR** — apport / retrait de **compte courant d'associé** | **hors** | SCI | — | trésorerie associés, pas un produit/charge foncier |
| **SCI à l'IR** — **distribution** de résultat aux associés | **hors** (le résultat est imposé chez l'associé via la **quote-part**, pas la distribution) | SCI | en **IS** : la distribution = **dividende imposable** (2ᵉ couche) | translucidité IR vs IS |

---

## 3. Ce qui change RADICALEMENT selon le régime

1. **Amortissement** (meublé réel & IS) : on déduit chaque année une fraction de la valeur du bien (hors terrain, ~2-3 %/an), du mobilier (~10-20 %) et des travaux. → résultat souvent **nul** pendant 10-20 ans. Le foncier (micro ou réel) **n'amortit pas**. C'est LA raison du choix meublé/IS.
2. **Travaux de construction/agrandissement** : **non déductibles** en foncier, **amortissables** en BIC réel/IS.
3. **Frais d'acquisition (notaire)** : **perdus** côté foncier (vont à la plus-value) ; **récupérables** (charge ou amortissement) en BIC réel/IS.
4. **Frais bancaires** : noyés dans le forfait 222 en foncier ; **déductibles réels** en BIC/IS.
5. **Déficit** : foncier → imputable sur le **revenu global** ≤ **10 700 €/an** (hors intérêts), excédent reporté 10 ans sur revenus fonciers. LMNP → déficit imputable **uniquement sur les BIC** futurs (pas le revenu global). IS → report sans limite de durée.
6. **Sortie** : IS = plus-value **professionnelle** (amortissements réintégrés, addition salée) + **double imposition** des distributions. C'est le revers du choix IS.

**Déficit foncier — détail vérifié** : plafond **10 700 €/an** (hors intérêts d'emprunt), **rehaussé à 21 400 €** pour les travaux de **rénovation énergétique** faisant changer un bien de classe (devis accepté ≥ 5/11/2022, payés du 1/1/2023 au 31/12/2027). Excédent + intérêts → report 10 ans sur revenus fonciers. [BOFiP BOI-RFPI-BASE-30-20](https://bofip.impots.gouv.fr/bofip/4142-PGP.html) · [Notice 2044 (2026)](https://www.impots.gouv.fr/sites/default/files/formulaires/2044/2026/2044_5487.pdf).

---

## 4. Les pièges les plus coûteux (location nue réel — le cœur de l'app)

1. **Travaux de construction/agrandissement déduits en 224** comme de l'entretien → redressement (le poste le plus contrôlé). *Garde-fou app : catégorie dédiée `special` + alerte.*
2. **Capital de prêt déduit** (seuls intérêts + frais en 250). *Garde-fou : catégorie `special`.*
3. **Frais forfaitisés déduits au réel** (frais **bancaires**, **déplacements**/kilométriques, **tablette**/matériel de bureau ; **repas** = hors champ) alors qu'ils sont couverts par le forfait 222 (auto). ⚠️ **À l'INVERSE, ne pas oublier que la comptabilité / l'expert-comptable EST déductible au réel (221, §60)** — ni la forfaitiser ni l'oublier. *Garde-fou : catégorie « Frais forfaitisés (222) » `special` (déplacement/matériel/bancaire) + message « déjà couvert » ; catégorie « Comptabilité / honoraires » bien en **221**.*
4. **Double-compte des charges récupérables** : la provision encaissée + la facture brute + la régul, mal articulées. *L'app gère via `computeRegul`→225 + le skip `compteurCcId` ; ne PAS re-taguer le mouvement (cf B1 : régul de solde = `special`).*
5. **Régularisation N-1 (230) ajoutée au lieu d'être déduite** (240 = (221..229) − 230). *Corrigé Chantier A (type `deduction`).*
6. **Subvention / prime déduite ET les travaux financés par elle déduits** (double avantage interdit) : la subvention diminue la base déductible.
7. **TEOM (ordures) traitée comme charge du bailleur** : elle est **récupérable** sur le locataire.
8. **Indemnité d'éviction déduite alors qu'elle vise une reprise/revente** (déductible seulement pour relouer mieux).

---

## 5. Implications pour ImmoTrack (Chantiers A / B)

- **L'app fait la location nue au régime réel (2044).** Le mapping catégorie→ligne 2044→niveau (B1/B2/B3) est **correct pour ce régime**. Les colonnes « 2044 » + « niveau » ci-dessus = la **source de vérité** de ce mapping.
- **Catégorie manquante à créer** : **« Frais bancaires (non déductibles — forfait 222) »** (`special`, hors résultat) — sinon le bailleur ne sait pas où ranger ses frais de compte (cf piège #3).
- **Garde-fous pédagogiques** à brancher (Chantier 2044 / B3) : construction vs entretien (#1), capital vs intérêts (#2), frais bancaires (#3), TEOM récupérable (#7), subvention (#6).
- **Hors scope actuel (à signaler dans l'app)** : micro-foncier (abattement, pas de 2044), **meublé** (BIC, déclaration 2031/2042-C-PRO, amortissements), **SCI à l'IS** (2065). Pour la commercialisation : l'app devra demander **le régime** avant de proposer le classement — un même mouvement n'a pas le même sort selon le régime. À cadrer en sujet dédié (ex. `FEAT-REGIMES-FISCAUX`).

---

## Sources principales
- Notice **2044** (revenus 2025 / dépôt 2026) : https://www.impots.gouv.fr/sites/default/files/formulaires/2044/2026/2044_5487.pdf
- BOFiP **RFPI — frais d'administration et gestion** (221/222) : https://bofip.impots.gouv.fr/bofip/5804-PGP.html
- BOFiP **RFPI — intérêts et frais d'emprunt** (250) : https://bofip.impots.gouv.fr/bofip/5808-PGP.html
- BOFiP **RFPI — provisions de copropriété** (229) : https://bofip.impots.gouv.fr/bofip/5810-PGP.html
- BOFiP **RFPI — déficits fonciers** (10 700 / 21 400) : https://bofip.impots.gouv.fr/bofip/4142-PGP.html
- BOFiP **RFPI — caractère déductible des travaux** (224 vs construction) : https://bofip.impots.gouv.fr/bofip/4050-PGP.html
- BOFiP **RFPI — micro-foncier** (art. 32) : https://bofip.impots.gouv.fr/bofip/3973-PGP.html
- BOFiP **BIC — location meublée, régime fiscal** : https://bofip.impots.gouv.fr/bofip/3610-PGP.html
- impots.gouv.fr — **meublé de tourisme, nouveau régime** : https://www.impots.gouv.fr/particulier/questions/je-suis-proprietaire-dune-location-meublee-de-tourisme-quel-est-le-nouveau
- CGI : art. 28-31 (foncier), 32 (micro-foncier), 50-0 (micro-BIC), 39 & s. (BIC), 206/209 (IS) — Légifrance.

> ⚠️ Audit **indicatif** à vocation produit (paramétrer l'app). Pour un dossier réel, validation par un expert-comptable agréé. Valeurs à re-vérifier à chaque loi de finances.
