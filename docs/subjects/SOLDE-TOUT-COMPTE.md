# CDC — Solde de tout compte (grille de vétusté + pénalité art. 22)

**Statut** : figé 09/09/2026 après mockups validés (`mockups/SOLDE-TOUT-COMPTE/`). Chantier « manque légal » de l'audit code global. Branche `feat/solde-tout-compte`.

## §0 — Intention

Rendre l'écran de **restitution du dépôt de garantie** légalement complet, en chiffrant deux choses aujourd'hui absentes :
1. la **part réellement imputable au locataire** sur une dégradation (grille de vétusté, décret n° 2016-382) ;
2. la **pénalité de retard de restitution** due au locataire (art. 22, loi 89-462).

Les deux vivent dans la **même surface** (`_dgOpenRestitution`) : le départ du locataire est le moment du solde de tout compte.

## §1 — Contrainte gravée : pas d'€ dans l'EDL

Le CDC EDL (`docs/CDC-EDL.md` §A.2) interdit tout montant dans l'EDL — « l'EDL constate, il ne chiffre pas ». La grille et ses montants vivent donc **uniquement** dans la restitution du DG. L'EDL ne fournit que le **constat** : les éléments en `etatS = « Mauvais état »` (ou « État d'usage » alors qu'ils étaient « Bon état » à l'entrée), lus via le résolveur unique `edlSortieQuiFaitFoi`.

## §2 — Grille de vétusté (décret 2016-382)

**On n'invente aucun pourcentage** (décision user : « app immo officielle, la vraie grille, mandatory »). Le décret impose : si une grille est utilisée, elle vient d'un **accord collectif**. Barème par défaut embarqué = **grille OPAC Paris** (accord collectif de référence, citée par les tribunaux), **éditable** (V1 : barème global ; porte ouverte à un barème par bail ensuite).

Chaque type d'élément porte 4 paramètres : **durée de vie** (années), **franchise** (années initiales sans usure), **abattement/an** (%), **part résiduelle** (% du coût toujours à charge du locataire, même amorti).

**Formule** (module `js/core/vetuste-grille.js`) :
```
usure = (âge − franchise) × abattement/an          (borné ≥ 0)
usure = min(usure, 100 % − part résiduelle)         (plancher résiduel)
part locataire = coût de remplacement × (1 − usure) (arrondi au centime)
```
→ le locataire paie **toujours au moins la part résiduelle** ; jamais 0 même sur un équipement au-delà de sa durée de vie.

**Barème OPAC embarqué** (vie / franchise / abatt.%/an / résiduel %) :
Peinture & papiers peints 7/1/15/10 · Moquette 7/1/15/10 · Revêt. plastique pièce humide 10/2/10/20 · Revêt. plastique autre 15/5/8/20 · Parquet/carrelage/faïence 20/5/5/25 · Appareils sanitaires 20/5/5/25 · Robinetterie/quincaillerie 10/2/10/20 · Appareils ménagers 8/2/15/10 · Meubles sous évier 15/5/8/20 · Menuiseries 20/5/5/25 · Volets roulants 10/2/10/20 · Stores 5/1/20/20 · Chauffage/radiateurs 25/5/4/20 · Plomberie/canalisations 15/5/8/20 · Réseau électrique 20/5/5/25.

## §3 — Preuve de l'ancienneté (charge du bailleur)

La charge de la preuve incombe au bailleur. L'âge se compte depuis la **vraie mise en service** (date de pose / dernière réfection), **pas** depuis l'entrée du locataire. Chaque ligne porte une **source** :
- `facture` — date de pose saisie (preuve la plus solide) ;
- `edl_neuf` — élément « neuf » à l'EDL d'entrée → l'app ancre sur la **date de l'EDL d'entrée** du logement (calcul auto, `ctx.edlEntreeDate`) ;
- `estim` — estimation, **marquée « à justifier »** (badge orange) ; sans date d'ancre → coût plein (aucune vétusté prouvée).

`âge = date EDL sortie (ou dateSortie) − mise en service`, en années révolues.

## §4 — Pénalité de retard, art. 22 (module `_penaliteRetardDG`)

En cas de restitution tardive : **10 % du loyer HC (principal seul, `bail.hc`)** par **mois de retard entamé**.
- Point de départ = **remise des clés** = `bail.depart.dateSortie` (repli `finEffective`).
- Délai légal 1 ou 2 mois via `_calculerDelaiRestitution` (2 si dégradations/retenues).
- Date de restitution = `dgRestitueAt` si saisie, sinon aujourd'hui (retard courant).
- **Mois entamés** : date limite atteinte pile → 0 ; +1 jour → 1 mois ; +1 mois pile → 1 mois.
- **Exception légale** : `bail.dgAdresseNonCommuniquee = true` → pénalité neutralisée (mais le retard reste affiché).
- La pénalité est au **crédit du locataire** : elle **s'ajoute** au montant restitué, elle ne se retranche pas du dépôt.

## §5 — Solde de tout compte

```
DG versé (dgPaid || dg)  − réparations (grille)  − loyers impayés  + pénalité art.22  = montant restitué
```
- `dgPaid` étant historiquement non renseigné, la base « DG versé » retombe sur `dg` (repli local à la surface, cohérent avec la clôture ~`index.html:25680`).
- Loyers impayés : modèle Didier anti-double-compte (le DG couvre le LOYER seul ; charges portées par la régul), via `_calculerSoldeDG`.
- Régularisation copro (plafond 20 % DG) : inchangée, moteur `_rgClotureCompute` en place.

## §6 — Persistance

Sur validation (`_dgConfirmerRestitution`) : `bail.dgRetenu` = total grille, `bail.depart.vetusteLignes` = détail structuré `[{piece,type,cout,source,mes}]` (réédition + justificatif), `bail.dgAdresseNonCommuniquee`, `bail.dgPenaliteArt22`, `bail.dgRestitueMontant` = montant restitué (pénalité incluse). Aucun nouveau champ cloud (tout dans le blob `bail`). Audit-trail `dg-restitution` enrichi (retenu/impayé/pénalité).

## §7 — Points d'ancrage réels (audits Explore 09/09)

`_dgOpenRestitution`/`_dgRestitRecalc`/`_dgConfirmerRestitution` (`index.html` ~51278+), helpers `_dgVg*` juste avant. Résolveur EDL `window.EdlParcours.edlSortieQuiFaitFoi`. Modules `js/core/vetuste-grille.js` (+ test) et `js/core/gestion-dg-impayes.js` (`_penaliteRetardDG` + test miroir), bindings `js/main.js`.

## §8 — Hors périmètre V1 (portes ouvertes)

- Barème **par bail** (annexe au contrat) — V1 = barème global.
- Mémoriser la date de mise en service sur l'équipement du bien (éviter la ressaisie au bail suivant).
- Grille de vétusté **imprimée** dans le décompte PDF remis au locataire (le détail structuré est déjà persisté pour l'alimenter).

## §9 — Gate

`npx vitest run` (3998 tests, dont 27 nouveaux vétusté + pénalité) · `node scripts/check-inline-js.mjs` = 5|0 · CRLF index.html = 0 bare LF · smoke 3 formats. Chantier argent → audit `code-reviewer` + 2ᵉ passe adversariale avant « prêt ».
