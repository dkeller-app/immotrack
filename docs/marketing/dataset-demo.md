# Dataset démo — Propryo (fictif, fiscalement juste)

> **Statut** : fondation data (validée 2026-06-25). Indépendant du design app.
> **But** : un jeu de données fictif soigné, **isolé**, qui (1) montre bien l'app et (2) fait tomber une **2044 réelle et cohérente** avec drill case→facture. Incarne les 3 personas (`personas.md`).
> **Ancrage technique** : mapping & schéma vérifiés dans le code (`index.html` STD_CATEGORIES ~4069-4106, `js/core/legal-2044.js`, `js/core/regime-lot.js`). Année fiscale de démo = **2025**.

---

> ⚠️ **CORRECTION 2026-06-25 (post-vérif `origin/main` v15.377)** — les catégories ont été **restructurées en prod** (« 21+2 ») ; les libellés ci-dessous (issus d'un clone stale) sont **périmés par endroits**. Liste **faisant autorité** + chiffres **provisoires** tant que le seed n'est pas vérifié contre le vrai moteur (worktree origin/main).

### Catégories standard FAISANT AUTORITÉ (origin/main, `index.html` ~3934-3959)
**Mappées 2044** (apostrophe = ASCII `'`) :
`Loyers encaissés`→211 · `Indemnité GLI / loyers impayés`→213 · `Recettes diverses`→213 · `Frais de gestion / honoraires / comptabilité`→221 · `Primes d'assurance (PNO, GLI)`→223 · `Travaux (entretien, réparation, amélioration)`→224 · `Travaux de rénovation énergétique`→224bis · `Indemnités d'éviction / relogement`→226 · `Taxe foncière (et taxes annexes)`→227 · `Charges de copropriété`→229 · `Prêt — Intérêts d'emprunt`→250 *(pickerHidden, flux « 🧮 Renseigner les intérêts »)*.
**AUTO (jamais taggées à la main)** : `Charges récupérables non récupérées`→225 *(computeRegul)* · `Régularisation provisions copro N-1`→230 *(écran Régul)* · **222 forfait** = nbLocaux×20 (sans catégorie).
**Special / hors 2044** : `Charges récupérables (eau, énergie…)` · `Prêt` *(capital)* · `Frais bancaires` · `Acquisition / cession de bien` · `Dépôt de garantie (reçu / restitué)` · `Travaux de construction / agrandissement (non déductible)` · `Virement interne (non déclarable)` · `CCA / distribution SCI` · `Divers (non déductible)`.

> **À re-vérifier dans le worktree origin/main avant de figer les montants** : (1) comment `Prêt — Intérêts d'emprunt` (250) est stocké/lu (mouvement vs flux dédié) ; (2) 230/225 étant auto, ils ne sont PAS des mouvements manuels → le résultat foncier de Camille sera recalculé. Le **seed vérifié** (à venir) fait foi sur les tableaux ci-dessous.

---

## 0. Règles de construction (non négociables — sinon l'app plante ou la 2044 est fausse)

1. **Isolation** : injecter dans la clé localStorage **`_test_immotrack_v4`** (mode `_isTestMode`). JAMAIS `immotrack_v4` (vraies données). Aucun lien avec `_loadDemoDataset()` prod.
2. **`cat`** = chaîne **EXACTE** d'une catégorie standard (copier-coller), apostrophe **droite ASCII `'` (U+0027)**, pas courbe. Sinon → `nonMappes`.
3. **`date`** = `YYYY-MM-DD` strict (filtre période = comparaison de chaînes).
4. **`compteurCcId: ''`** sur tout mouvement qui doit compter dans la 2044 (truthy = ignoré).
5. Sur chaque **logement** : `typeUsage` explicite ; sur chaque **bail** : `type` explicite → contrôle déterministe inclusion/exclusion 2044 (nu = `habitation-nu`/`type:'nu'` ; meublé exclu = `habitation-meuble`/`type:'meuble'`).
6. **`qui`** : ref logement (loyers, charges du lot) · `''` + `imm` correct (charge niveau immeuble : taxe foncière/PNO/syndic d'un immeuble multi-lots) · `'SCI:'+nom` (charge globale entité).
7. 100 % **fictif** : noms, adresses, montants inventés. Aucune vraie personne.

---

## 1. Camille Mercier — dataset COMPLET *(persona filmé)*

**Entité** (détention en direct / nom propre — `type` à confirmer à la génération JSON ; le `nom` est la clé de jointure)
```
{ id:1, nom:'Camille Mercier', type:'Particulier', siren:'', gerant:'Camille Mercier',
  immeubles:[
    { id:101, nom:'Résidence Neustadt',  adr:'12 rue du Faubourg, 67000 Strasbourg',  annee:1925, regimeJuridique:'Copropriété' },
    { id:102, nom:'Le Clemenceau',       adr:'8 av. Georges Clemenceau, 67300 Schiltigheim', annee:1998, regimeJuridique:'Monopropriété' },
    { id:103, nom:'Campus Esplanade',    adr:'3 allée du Campus, 67000 Strasbourg',   annee:2008, regimeJuridique:'Copropriété' }
  ] }
```

**Logements** (3, tous **nu**, réel foncier)
| ref | imm | type | hc | ch | dg | typeUsage | locataire (fictif) | bail |
|---|---|---|---|---|---|---|---|---|
| `T3-NEU` | Résidence Neustadt | T3 | 780 | 80 | 780 | `habitation-nu` | Julien Weiss | 2019-09-01 → en cours |
| `T2-CLE` | Le Clemenceau | T2 | 640 | 60 | 640 | `habitation-nu` | Sophie Klein | 2022-07-01 → en cours · **emprunt en cours** |
| `STU-CAM` | Campus Esplanade | Studio | 430 | 40 | 430 | `habitation-nu` | Lucas Marchal | 2023-09-01 → en cours |

**Baux** (`DB.baux`, map ref→bail) : chacun `{ ref, debut, fin, hc, ch, dg, type:'nu', typeContrat:'nu', entity:'Camille Mercier', locataires:[{civilite, nom, tel, email}], jpay:5 }`.

### Mouvements 2025 (ce que la vidéo montre)

**Recettes — Loyers encaissés (cat `Loyers encaissés` → 211, `cr` = HC+charges, 12 mois/lot)**
| lot | cr mensuel | × | total annuel |
|---|---|---|---|
| T3-NEU | 860 | 12 | 10 320 |
| T2-CLE | 700 | 12 | 8 400 |
| STU-CAM | 470 | 12 | 5 640 |
| | | **211 =** | **24 360** |
*(36 mouvements mensuels, `qui` = ref du lot, `lib` = « Loyer + charges {mois} », `fac:''`.)*

**Charges (les mouvements « intéressants » — ceux qu'on drill)**
| cat (string exact) | ligne | qui | db | fac | lib |
|---|---|---|---|---|---|
| `Cotisations syndicales bailleurs` | 221 | T3-NEU | 90 | `UNPI-2025` | Adhésion UNPI 2025 |
| `Primes d'assurance PNO` | 223 | T3-NEU | 140 | `PNO-NEU-2025` | Assurance PNO Neustadt |
| `Primes d'assurance PNO` | 223 | T2-CLE | 140 | `PNO-CLE-2025` | Assurance PNO Clemenceau |
| `Primes d'assurance PNO` | 223 | STU-CAM | 140 | `PNO-CAM-2025` | Assurance PNO studio |
| `Travaux de réparation et d'entretien` | 224 | T3-NEU | 1 450 | `PLOMB-2025-0312` | Réparation fuite + remplacement mitigeur |
| `Travaux de réparation et d'entretien` | 224 | STU-CAM | 680 | `PEINT-2025-0905` | Rafraîchissement peinture studio |
| `Taxe foncière (et taxes annexes)` | 227 | T3-NEU | 980 | `TF-NEU-2025` | Taxe foncière Neustadt |
| `Taxe foncière (et taxes annexes)` | 227 | T2-CLE | 760 | `TF-CLE-2025` | Taxe foncière Clemenceau |
| `Taxe foncière (et taxes annexes)` | 227 | STU-CAM | 540 | `TF-CAM-2025` | Taxe foncière studio |
| `Provisions pour charges de copropriété` | 229 | T3-NEU | 1 200 | `SYND-NEU-2025` | Provisions copro Neustadt |
| `Provisions pour charges de copropriété` | 229 | STU-CAM | 600 | `SYND-CAM-2025` | Provisions copro studio |
| `Régularisation provisions copro N-1` | 230 *(déduction)* | T3-NEU | 150 | `REGUL-NEU-2024` | Régul copro 2024 (trop-perçu rendu) |

**Emprunt (lot T2-CLE)**
| cat (string exact) | ligne | qui | db | fac | note |
|---|---|---|---|---|---|
| `Prêt — Intérêts d'emprunt` | 250 | T2-CLE | 2 640 | `PRET-INT-2025` | intérêts 2025 |
| `Prêt — Capital remboursé` | *(exclu, ligne `''`)* | T2-CLE | 4 200 | `PRET-CAP-2025` | **doit être ignoré** par la 2044 (preuve que le moteur trie) |

### 2044 attendue (calcul vérifié à la main — ce que l'écran affiche)
```
▶ RECETTES
  211 — Loyers encaissés ............................. 24 360 €
  TOTAL RECETTES ..................................... 24 360 €

▶ CHARGES
  221 — Cotisations syndicales bailleurs ................. 90 €
  222 — Forfait gestion (20 € × 3 logements) ............ 60 €   ← auto, sans mouvement
  223 — Primes d'assurance PNO ......................... 420 €
  224 — Travaux de réparation et d'entretien ......... 2 130 €
  227 — Taxe foncière ................................ 2 280 €
  229 — Provisions pour charges de copropriété ....... 1 800 €
  230 — Régularisation copro N-1 ...................... (150) €  ← se soustrait
  TOTAL CHARGES ...................................... 6 630 €

▶ INTÉRÊTS D'EMPRUNT
  250 — Intérêts d'emprunt ........................... 2 640 €

═══════════════════════════════════════════════════════════
  RÉSULTAT FONCIER (24 360 − 6 630 − 2 640) ........ 15 090 €
═══════════════════════════════════════════════════════════
```
**Le « moment waw » filmé** : clic sur la ligne **224 — Travaux 2 130 €** → drill → 2 mouvements (plomberie `PLOMB-2025-0312` 1 450 € · peinture `PEINT-2025-0905` 680 €) → la facture. *« Chaque chiffre, justifié. »*
Le `Prêt — Capital remboursé` (4 200 €) **n'apparaît pas** dans la 2044 → preuve visible que l'app ne mélange pas capital et intérêts.

---

## 2. Marc & Léa Dubois — dataset *(esquisse, primo, 1er année partielle)*

- **Entité** : `Marc & Léa Dubois` (nom propre, indivision). 1 immeuble `Le Liberté` (Nantes 44).
- **Logement** : ref `T2-NANTES`, T2, hc 720, ch 60, `typeUsage:'habitation-nu'`. Locataire fictif **Inès Fontaine**. Bail `type:'nu'` débuté **2025-09-01** (donc 4 mois en 2025).
- **Mouvements 2025** : Loyers encaissés (211) = (720+60) × 4 = **3 120 €** ; Taxe foncière (227) prorata **320 €** ; PNO (223) **130 €**. Forfait 222 = 1 × 20 = **20 €**.
- **2044 2025** : recettes 3 120 − charges (320+130+20=470) = **résultat foncier 2 650 €**. Petite, normale pour une 1ʳᵉ année partielle → sert le récit « primo-bailleur, déjà prêt sans avoir compris le formulaire ».

---

## 3. SCI Berger Patrimoine — dataset *(esquisse, mixte → démontre l'exclusion meublé)*

- **Entité** : `SCI Berger Patrimoine`, `type:'SCI'`, IR. 2 immeubles (Lyon 69), **6 lots** : **4 nu + 2 meublé**.
- **Lots nu** (dans la 2044) : `BER-N1..N4`, `typeUsage:'habitation-nu'`, `type:'nu'`.
- **Lots meublé** (EXCLUS, BIC) : `BER-M1`, `BER-M2`, `typeUsage:'habitation-meuble'`, `type:'meuble'` → apparaissent dans l'avertissement *« lots MEUBLÉS EXCLUS du 2044 — relèvent du BIC/LMNP »*. **C'est exactement le message d'honnêteté du persona hub.**
- **Charge niveau immeuble** : une taxe foncière `qui:'' + imm:'…'` (immeuble multi-lots) → démontre le **scope immeuble** (différent de Camille).
- **Forfait 222** = **4** × 20 = 80 € (seuls les lots fonciers comptent — preuve que les meublés sont retirés même du forfait).
- Montants à détailler à la génération ; l'important ici = la **démonstration de l'exclusion** + le partage SCI (parents/enfants associés).

---

## 4. Prochaine étape (différée jusqu'au reskin)

- Convertir ces données en **JSON** conforme au schéma (`DB.entites` / `logements` / `baux` map / `mouvements` …) et l'injecter dans `_test_immotrack_v4` d'un **build démo déployé** — **quand l'app sera reskinée Propryo** (sinon on filme l'ancien thème).
- **Audit `code-reviewer`** du JSON (cohérence 2044, exclusion meublé, aucun mouvement « special » compté) avant de filmer.
- Gotchas à re-vérifier au moment du JSON : apostrophes ASCII, `compteurCcId:''`, `date` ISO, `type`/`typeUsage` explicites, le `type` d'entité « Particulier » (valeur enum réelle à confirmer dans le code).
