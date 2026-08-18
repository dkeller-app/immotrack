# CDC — Quittances & Révisions de loyer (IRL)

**Statut : VALIDÉ par Didier le 18/08/2026** — session dédiée « quittances & IRL ».
Maquettes de référence, dans `mockups/QUITTANCES-IRL/` (gitignoré) :

| Fichier | Ce qu'il fixe |
|---|---|
| `scenarios-onglets.html` | Le choix de navigation (scénario A retenu) |
| `etats-loyers.html` | L'écran du mois, le tri par « quittance demandée », « Faire une quittance », états vides |
| `revision-irl.html` | Le calendrier Gantt, les états de révision, la fenêtre de validation, l'historique, la lettre |
| `retraits-et-rappels.html` | Le courrier de relance unique + l'inventaire complet des retraits |

Aucun code n'a été modifié par cette session. Ce fichier et les 4 maquettes sont les seuls livrables.

---

## 1. Le constat qui justifie le chantier

Les deux onglets actuels **ne détiennent aucune donnée en propre**. Le dû est dans le bail et le barème
(`duMois`, [js/core/loyer-du-mois.js:96](../../js/core/loyer-du-mois.js)), le payé dans les mouvements, l'historique
dans la timeline du bail (v15.496). Ce sont deux **listes de tâches** — donc deux endroits à visiter pour savoir
qu'il n'y a rien à faire.

Défauts relevés, référencés :

| # | Constat | Référence |
|---|---|---|
| C1 | **Trois chemins de génération concurrents et non alignés** : `genAllQuit()` (émet pour tout lot occupé, sans regarder le paiement ni les dates du bail, et écrit `datePaiement = aujourd'hui`), `_quittancesAutoGenAtBoot()` (respecte les dates, ignore le paiement), et le popup au save d'un mouvement (seul chemin adossé à un paiement réel) | index.html:28557 · 28507 · 16269 |
| C2 | **Trois réglages pour la même idée** : `params.quittancesAutoGen` (global), `bail.quittAutoGen` (par bail), colonne « 🧾 » de Pilotage — plus la case `bail.quittanceDemandee` qui, elle, ne sert qu'à un point de couleur sur le dashboard | index.html:1090 · 1602 · 48736 · 10712 |
| C3 | **Un 7ᵉ moteur d'imputation** : `_matcheMois()` rattache un paiement au mois de sa propre date. Un loyer d'août payé le 2 septembre compte pour septembre — août reste impayé à vie. Contredit frontalement le résolveur unique décidé le 09/07 | js/core/quittances-actives.js:100 |
| C4 | **Le montant de la quittance vient du bail courant**, jamais du barème : une quittance d'un mois passé porte le tarif d'aujourd'hui | index.html:28563 · 16281 |
| C5 | **L'onglet Quittances est un historique, pas une file de travail** : il ne montre que les quittances déjà émises, jamais un loyer encaissé restant à quittancer | rQuit() — index.html:27692 |
| C6 | **Un bouton efface toute la traçabilité IRL** (`DB.irlHistorique`) alors que le barème garde ses périodes → un loyer sans explication | index.html:541 |
| C7 | **L'historique IRL fait doublon** avec la timeline « Historique du bail » livrée en v15.496 | index.html:538 vs 37600+ |
| C8 | **La prescription d'un an (art. 17-1) n'existe pas** : `computeIRLRevision` calcule toujours sur l'année en cours et propose la révision quel que soit le retard | index.html:24903 |
| C9 | **La table INSEE est figée dans le code** et s'arrête à T1 2026 : T2 2026 (148,37, publié le 12/07/2026) manque → « Index T2 2026 manquant » sur tout bail à réviser aujourd'hui | IRL_DEFAULT — index.html:4114 |
| C10 | **Commentaire périmé** : index.html:12513 affirme encore que le dû d'un mois quittancé = la quittance figée (« B3 »). Le code ne le fait plus depuis le 16/07 | index.html:12513 |
| C11 | **Deux interrupteurs branchés sur rien** : colonne « 📈 révision IRL automatique » de Pilotage (aucun moteur), et le hub Communications marqué `@deprecated` sans appelant | index.html:48736 · 27810 |

---

## 2. Les décisions

### Navigation

**D1 — Un seul onglet « Loyers ».** Les onglets *Quittances* et *Loyer (IRL)* fusionnent en un onglet unique qui ne
contient que **ce qu'il y a à faire ce mois-ci** sur les loyers. Zone Argent de la sidebar :
**Mouvements · Loyers · Charges · Finances**. 13 entrées de menu au lieu de 14.

**D2 — « Loyers & mouvements » est renommé « Mouvements ».** C'est déjà son libellé en sous-onglet
(`_NAV_GROUPS`, index.html:7989). Sans ce renommage, deux entrées du menu contiennent le mot « Loyers ».

### Ce que l'écran montre — et surtout ne montre pas

**D3 — La quittance n'est pas omniprésente.** Le bloc « Quittances demandées » ne liste que les baux dont la case
**« 🧾 le locataire demande une quittance mensuelle »** est cochée (`bail.quittanceDemandee`, index.html:1608,
art. 21 loi 1989 : le bailleur la transmet *à qui en fait la demande*). Sur 12 lots, 2 ou 3 la cochent : les autres
ne produisent **aucune ligne**. L'écran grandit avec les problèmes, pas avec le parc.

**D4 — Pour tous les autres : « ＋ Faire une quittance ».** Bouton principal, permanent, indépendant de toute ligne.
Deux choix : **le logement, puis le mois**. Aucun montant à saisir — il est lu au **barème du mois choisi** (une
quittance de juin 2026 porte le loyer de juin 2026, même s'il a été révisé depuis). Les mois non soldés restent
visibles mais non sélectionnables, avec leur motif (« reste 120,00 € »).

**D5 — L'écran du mois tient en quelques lignes.** Trois blocs, chacun replié à une ligne quand il est vide :
1. 🧾 **Quittances demandées** (case cochée + mois soldé)
2. ⏳ **Pas à jour** — loyer **et** charges
3. 📈 **Révisions à préparer**

Plus deux lignes repliées : « Quittances éditées ce mois » et « Calendrier des révisions à venir ».

### Quand une quittance est possible

**D6 — Mois soldé = quittance ; sinon, reçu.** La quittance n'est proposée que si le cumul encaissé imputé au mois
atteint le dû du mois, **au centime**. En dessous : bouton « Reçu de paiement partiel », jamais une quittance
(art. 21 : *« dans tous les cas de paiement partiel, le bailleur délivre un reçu »*).

**D7 — L'imputation n'est pas réinventée : elle est consommée.** Le rattachement d'un paiement à un mois est déjà
tranché (décisions du 09/07 et 14/07) et codé :
- cascade **loyer HC du mois → charges du mois → arriérés de loyer les plus vieux d'abord → arriérés de charges**
  (`_loyerArrearsPass`, [js/core/loyer-du-mois.js:212](../../js/core/loyer-du-mois.js)) ;
- **netting avance↔retard** (`_computeLoyerNetting`, idem:263) : une avance couvre les mois suivants avant qu'un
  retard naisse ;
- « un paiement n'est pas rattaché au mois calendaire de sa date, il comble d'abord le plus vieux mois non couvert »
  (`_computeLoyerStatut`, [js/core/loyer-statut.js:31](../../js/core/loyer-statut.js)) ;
- écrit dans [docs/CDC-FINANCES.md § H-1](../../docs/CDC-FINANCES.md).

**Un mois est quittançable quand il ne porte plus aucun résidu** : `retardMois[idx].loyer === 0 && retardMois[idx].charge === 0`.
Ce seul prédicat donne gratuitement le rattrapage, le paiement en plusieurs fois et l'avance.
`_matcheMois()` (C3) est **supprimé**, pas corrigé.

**D8 — Une quittance = un mois.** Quand un rattrapage solde trois mois d'un coup, un geste (« Éditer les 3 »)
produit **trois documents datés**. Jamais un document « juin à août ». L'attestation annuelle de loyers
(CAF, déclaration du locataire) est **hors V1**.

**D9 — Un mois échu non soldé : une ligne par lot, jusqu'au solde.** « COLMAR-4 · Muller — 6 mois non soldés depuis
mars 2026 — 4 140,00 € — *Relancer* ». Une seule ligne quel que soit le nombre de mois. Le détail mois par mois est
à un clic, dans l'écran **Suivi** qui existe déjà. **Aucun document n'est émis** pour ces lignes.

**D10 — Les charges ont leur place dans « Pas à jour ».** La cascade (D7) impute le loyer avant les charges : un
locataire peut avoir son loyer soldé et 250 € de charges en souffrance. La ligne l'écrit en clair et propose le
même geste que pour un loyer impayé (D11).

**D11 — Un seul courrier de relance.** Un unique document, au gabarit unique déjà validé, dont le **tableau**
détaille ce qui manque : loyer, charges, arriérés. Que le manque porte sur le loyer, les charges ou les deux, c'est
le même bouton — seul le tableau change. Les modèles existants (`rappel-impaye-1/2/3`) fournissent le texte et
l'escalade (rappel → relance → mise en demeure) selon l'ancienneté. **Pas de second document « rappel de charges ».**

### Révision IRL

**D12 — Effet au 1ᵉʳ jour du mois de l'anniversaire du bail.** Bail signé le 15/09 → la révision prend effet au
**01/09** de chaque année. *(Écart avec le code actuel : `computeIRLRevision` place la révision au jour anniversaire
et ne cale jamais l'effet sur le 1ᵉʳ du mois.)*

**D13 — Proposée un mois avant.** La ligne apparaît dans « Révisions à préparer » dès le **1ᵉʳ du mois précédent**
(effet 01/09 → rappel dès le 01/08), pour laisser le temps de préparer et remettre la lettre avant que le nouveau
loyer s'applique. *(Écart : l'alerte actuelle se déclenche à 30 jours glissants, pas au 1ᵉʳ du mois.)*

**D14 — Une révision en retard n'est jamais rétroactive.** Validée après la date d'effet prévue, elle s'applique au
**1ᵉʳ du mois suivant la validation**. C'est la règle Q1 déjà codée
(`_baremeComputeDateEffetIRL` / `_baremeClampDateEffet`) et c'est aussi l'art. 17-1 (*« si le bailleur manifeste sa
volonté dans le délai d'un an, la révision prend effet à compter de sa demande »*). Jamais avant un mois déjà quittancé.

**D15 — Prescription d'un an (art. 17-1) : le cycle périmé est fermé.** Au-delà d'un an après la date d'effet prévue,
la révision de ce cycle **n'est plus proposée**. Elle bascule dans un bloc informatif « ⌛ Perdue », qui indique une
fois ce qu'elle aurait rapporté (« ≈ 14,80 €/mois »). Seul le **cycle en cours** reste révisable, sur le loyer
**actuel** — pas sur celui qu'on aurait eu sans l'oubli. L'app ne propose jamais un geste non opposable au locataire.

**D16 — Un calendrier type Gantt.** Douze mois glissants, un lot par ligne : bande hachurée = mois de rappel,
pavé plein = mois d'effet, ligne grise = non révisable (DPE F/G gelé, bail < 1 an). Replié en bas de l'onglet Loyers,
déplié à la demande. Sur téléphone il défile **dans son propre cadre** ; la page ne déborde pas.

**D17 — Les non-révisables sont visibles mais muets.** DPE F/G gelé (loi Climat), bail de moins d'un an, indice non
publié : listés dans un bloc « 🔒 Non révisables », **hors du compteur**, sans action demandée. Ils évitent la
question « pourquoi celui-là n'est pas dans la liste ? ».

**D18 — La fenêtre de validation est conservée telle quelle** (`ov-irl-valid`, `_irlValidConfirm`), avec sa date
d'effet modifiable et ses garde-fous. Une seule chose est ajoutée : la phrase **« Les mois passés ne changent pas —
aucune quittance déjà émise, aucun loyer déjà dû n'est recalculé. »**

**D19 — Un seul historique : celui du bail.** La révision écrit son événement dans la timeline « Historique du bail »
(v15.496). La lettre s'y re-télécharge depuis la ligne. Le sous-onglet « Historique » de l'IRL et son bouton
« 🗑 Effacer tout l'historique » disparaissent — rien ne justifie de pouvoir effacer une trace financière (C6).

### Indice INSEE

**D20 — La table INSEE part dans Paramètres et se met à jour toute seule via l'API INSEE.**
Vérifié en direct le 18/08/2026 :

```
GET https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/001515333?startPeriod=2024-Q1
```

| Point | Constat vérifié |
|---|---|
| Authentification | **Aucune** — 200 en anonyme (l'API BDM est ouverte ; l'ancien portail à jeton a fermé le 10/09/2025) |
| CORS | **Ouvert** — `Access-Control-Allow-Origin` renvoyé en écho de l'`Origin`, préflight `OPTIONS` → 200. **Appel direct depuis le navigateur, aucun Worker relais nécessaire** |
| Format | **SDMX XML uniquement** (`Accept: application/json` ignoré) → `DOMParser` natif, **zéro dépendance**, conforme à la règle « aucun CDN au runtime » |
| Série | IDBANK **001515333** — « Indice de référence des loyers (IRL) », `FREQ=T`, base 100 = T4 1998 |
| Champs utiles | `TIME_PERIOD` (`2026-Q2`), `OBS_VALUE` (`148.37`), `DATE_JO` (publication au JO : `2026-07-12`), `LAST_UPDATE` |
| Débit | 30 appels/min annoncés (en-tête observé : 100). **Une lecture par ouverture d'app suffit** |

Règles d'usage :
- lecture **au boot, au plus une fois par jour** (horodatage en base), silencieuse ;
- `IRL_DEFAULT` reste le **filet de sécurité hors ligne** (file://, API injoignable) — jamais supprimée ;
- une valeur venue de l'API **n'écrase jamais** une valeur saisie à la main : divergence = signalée, pas corrigée d'office ;
- l'écran affiche la **date de publication au JO** de chaque indice : c'est elle qui explique pourquoi un trimestre
  n'est pas encore disponible (publication ~6 semaines après la fin du trimestre).

### Réglages

**D21 — Un seul interrupteur survit : la case du bail.** `bail.quittanceDemandee` devient le seul réglage lié aux
quittances, et c'est lui qui décide de ce qui s'affiche (D3). Il doit devenir une question posée **une fois, au
moment du bail** (« ce locataire veut-il sa quittance chaque mois ? »), pas une case perdue dans un formulaire.
Les trois autres réglages (C2) disparaissent.

---

## 3. Ce qui disparaît

Validé en bloc. **Aucune donnée n'est supprimée** : `DB.quittances` et `DB.irlHistorique` restent en base, et les
quittances d'un logement restent consultables depuis sa fiche.

### Retiré

| Élément | Référence | Raison |
|---|---|---|
| Onglet « Quittances » (liste, filtres, bascule cartes/tableau) | index.html:650 · `rQuit()` | absorbé par « Loyers » |
| Bouton « ⚡ Générer ce mois » | `genAllQuit()` — index.html:28557 | émet sans regarder le paiement (contraire à D6) |
| Bouton « + Manuelle » (montants tapés à la main) | `openQuitManuelle()` — index.html:28966 | remplacé par « Faire une quittance » (D4) |
| Génération automatique au démarrage | `params.quittancesAutoGen` · `_quittancesAutoGenAtBoot()` | émettait sans paiement |
| Toggle « quittance auto à l'encaissement » du bail + son popup au save d'un mouvement | `bail.quittAutoGen` · index.html:16269 | remplacé par la case « demande » (D21) |
| Colonne « 🧾 » de Pilotage › Automatisations | `_PIL_AUTOM_KEYS` — index.html:48736 | 3ᵉ réglage pour la même idée |
| Colonne « 📈 révision IRL automatique » de Pilotage | idem | interrupteur branché sur rien (C11) |
| Onglet « Loyer (IRL) » et ses 3 sous-onglets | index.html:426 · `rIRL()` | absorbé par « Loyers » |
| Sous-onglet « Historique » de l'IRL + bouton « 🗑 Effacer tout l'historique » | index.html:538-541 | doublon + destruction de trace (C6, C7) |
| Panneau « ✉ Aperçu lettre » et son sélecteur de bail | `irl-letter-pane` — index.html:502 | l'aperçu suit le clic |
| `_matcheMois()` / `_matchPaiementQuittance()` | js/core/quittances-actives.js:100 · 121 | 7ᵉ moteur d'imputation (C3) |

### Déménage

| Élément | Vers |
|---|---|
| Table IRL INSEE + « ↺ Sync INSEE » (index.html:523, `rIRLParams()`) | **Paramètres**, alimentée par l'API (D20) |
| Onglet « Loyers & mouvements » | renommé **« Mouvements »** (D2) |

### Conservé tel quel

Fenêtre de validation de la révision (`ov-irl-valid`, `_irlValidConfirm`) · liste des quittances d'un logement dans
sa fiche (`_renderQuitForLog`, index.html:37567) · timeline « Historique du bail » (`bail-historique.js`) ·
écran **Suivi** (cible du lien « Détail mois par mois ») · gabarit unique des documents
(`doc-template.global.js`) et popup de partage (`_docShareOpen`), envoi e-mail toujours coupé
(`DOC_ENVOI_ACTIF = false` : on télécharge).

---

## 4. Invariants testables

À encoder en tests Vitest, chacun doit échouer si le comportement régresse.

| # | Invariant |
|---|---|
| **I1** | **Aucune quittance émise ne modifie un calcul.** Émettre, modifier ou supprimer une quittance laisse `duMois(ref, ym)` strictement inchangé pour tous les mois du lot. |
| **I2** | **Aucune révision ne modifie un mois déjà quittancé.** Pour tout `ym` porteur d'une quittance émise, `duMois` après `_applyIRLValidated` = `duMois` avant. |
| **I3** | **Aucune date d'effet rétroactive.** `dateEffet ≥ 1ᵉʳ du mois de l'anniversaire` **et** `dateEffet > dernier mois quittancé`, quelles que soient les valeurs saisies dans la modale. |
| **I4** | **Une quittance n'existe que sur un mois soldé.** Pour toute quittance émise, le mois correspondant a un résidu nul dans `_loyerArrearsPass` (loyer **et** charges). |
| **I5** | **Le montant de la quittance est celui du barème du mois**, pas du bail courant : après une révision, ré-éditer une quittance d'un mois antérieur produit le même montant qu'avant. |
| **I6** | **Une seule source d'imputation.** Aucun appel à un rattachement paiement→mois hors `_loyerArrearsPass` / `_computeLoyerNetting` / `_computeLoyerStatut`. |
| **I7** | **Une révision = un mois.** `N` mois soldés simultanément produisent `N` quittances distinctes, une par `ym`, jamais un document multi-mois. |
| **I8** | **Prescription.** Une révision dont la date d'effet prévue remonte à plus d'un an n'est jamais proposée à l'application ; seul le cycle en cours l'est. |
| **I9** | **Rappel M-1.** Une révision d'effet `01/M` apparaît dans « à préparer » du `01/(M-1)` au `31/(M-1)`, et pas avant. |
| **I10** | **Loyer gelé.** Un lot au DPE F ou G n'apparaît jamais dans « à réviser » et `applyIRL` reste bloqué. |
| **I11** | **L'API INSEE n'écrase rien.** Une valeur d'indice saisie à la main survit à une synchronisation ; une divergence est signalée, pas corrigée. |
| **I12** | **Hors ligne.** Sans réseau, `IRL_DEFAULT` prend le relais et aucun écran ne casse. |
| **I13** | **Pas d'émission automatique.** Aucun chemin de code ne crée une quittance sans clic explicite (ni au boot, ni au save d'un mouvement). |

---

## 5. Hors V1

- Attestation annuelle de loyers pour le locataire (CAF, déclaration de revenus).
- Révision IRL appliquée automatiquement sans validation (**écarté**, pas différé : une automatisation qui déplace
  de l'argent sans validation est exclue).
- Second document « rappel de charges » distinct du courrier de relance (D11).
- Décompte de régularisation annuelle des charges dans le même onglet — il reste dans **Charges**, mais l'écran
  « Loyers » est conçu pour l'accueillir plus tard sans refonte.
- Notion de tiers payeur (CAF/APL) au bail — déjà notée hors V1 dans CDC-FINANCES § H-2b.

---

## 6. Notes de code à traiter pendant le chantier

Relevées pendant l'audit, à ne pas perdre :

1. **Commentaire périmé, index.html:12513** : affirme encore que le dû d'un mois quittancé = la quittance figée
   (« B3 »). Le code ne le fait plus depuis la décision du 16/07. À corriger, sinon le prochain lecteur ré-introduira
   la 3ᵉ source.
2. **`EMAIL_HUB_CATALOG` / `_openCommsHub`** (index.html:27810+) sont marqués `@deprecated` sans appelant actif
   depuis v15.16. À trancher pendant le chantier : supprimer, ou ré-exposer.
3. **`_matchPaiementQuittance`** (quittances-actives.js:121) tolère un écart de montant (`toleranceAmount`) —
   disparaît avec D7, avec ses tests miroir.
4. **`computeIRLRevision`** doit changer de calendrier (D12/D13) : anniversaire → 1ᵉʳ du mois, alerte 30 jours
   glissants → 1ᵉʳ du mois précédent. Vérifier les 5 appelants (dashboard, matrice, agenda, fiche, drill).
5. **`IRL_DEFAULT`** doit rester (filet hors ligne) mais cesse d'être la source de vérité.

---

## 7. Ordre de chantier

Chaque étape est livrable et testable seule. Worktree dédié, détruit après intégration ; jamais de commit depuis
`Desktop\Immo`.

| Étape | Contenu | Gate |
|---|---|---|
| **1. Le socle du verdict** | Exposer « ce mois est-il soldé ? » depuis la cascade existante (`_loyerArrearsPass`) sous forme d'un sélecteur unique par (lot, mois). Supprimer `_matcheMois` et `_matchPaiementQuittance`. | Tests I4, I6 verts ; aucun écran modifié |
| **2. La quittance lit le barème** | `_buildQuittanceHtml` prend son montant de `duMois(ref, ym)` au lieu de `bail.hc/ch`. | Tests I1, I5 ; ré-édition d'une quittance ancienne identique à l'originale |
| **3. Couper les émissions automatiques** | Retirer `genAllQuit`, `_quittancesAutoGenAtBoot`, le popup au save de mouvement, les trois réglages (D21). | Test I13 ; smoke : aucune quittance n'apparaît sans clic |
| **4. L'onglet « Loyers »** | Nouvelle page : 3 blocs (D5), tri par `quittanceDemandee` (D3), « Faire une quittance » (D4), courrier de relance unique (D11). Retrait de l'onglet Quittances. | Gate 3 formats + 1 écran PC |
| **5. Le calendrier IRL** | Nouveau calendrier (D12/D13/D16/D17), prescription (D15), bloc « à préparer » dans l'onglet Loyers. Retrait de l'onglet IRL et de ses sous-onglets sauf la table. | Tests I8, I9, I10 ; gate 3 formats |
| **6. Historique unifié** | La révision écrit dans la timeline du bail ; retrait du sous-onglet Historique et du bouton d'effacement (D19). | Test I2 ; smoke : révision visible sur la fiche |
| **7. API INSEE** | Table déplacée dans Paramètres, synchronisation au boot (D20), `IRL_DEFAULT` en filet. | Tests I11, I12 ; smoke hors ligne |
| **8. Navigation** | Renommage « Mouvements » (D2), zone Argent à 4 entrées, sidebar + barre du bas + feuille Plus + menu personnalisable. | Gate 3 formats ; audit agent SÛR |

**Gate de sortie (non négociable, CDC-V1-LIGHT § 6)** : fonctionnel complet sur téléphone + tablette + PC · 0 erreur
console · données réelles intactes · tests verts · audit par agent `superpowers:code-reviewer` **SÛR** · smoke explicite
de Didier. Onglet validé = figé.
