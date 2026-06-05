# FEAT-VIR-INTERNE — Virements internes : auto-détection + rapprochement

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M
**Détaché de** : V3-REFONTE-LOYERS (audit pré-prod 2026-06-05) · **Lié à** : BANK-IMPORT-V2

---

## Problème

Le user a **plusieurs comptes bancaires** pour son activité locative. Quand il déplace de l'argent d'un de ses comptes vers un autre (transfert interne), le relevé importé fait apparaître **deux lignes** : un **débit** sur le compte source, un **crédit** sur le compte destination. Ce n'est ni une recette ni une charge foncière — ça ne doit **rien** déclarer et ne pas polluer les totaux.

## Périmètre de CE sujet (la partie « lourde »)

La partie **simple** est déjà couverte par la refonte loyers : une catégorie **« Virement interne — à ignorer »** (`special`, hors résultat foncier) posée à la main sur chaque ligne.

Ce sujet ajoute l'**automatisation** :
- **Auto-détection** des paires jumelles : même montant, sens opposés, dates proches, sur deux comptes différents du même utilisateur.
- **Rapprochement** : lier les 2 mouvements pour qu'ils se neutralisent, et n'en taguer qu'**un** (l'autre suit).
- UI de confirmation (proposition « ces 2 lignes semblent un virement interne — relier ? »), jamais d'auto-validation silencieuse (cf garde-fou « on ne crée pas de règle »).

## Points d'attention
- Mécanisme **net-neuf** : rien dans le code aujourd'hui ne relie deux mouvements entre eux.
- S'appuie sur les comptes existants `DB.params.bankAccounts[]` (`index.html:42818`) et leur identifiant (`ACCTID`/hash CSV).
- Ne pas confondre avec un vrai loyer/charge de même montant : la confirmation user est obligatoire.

## Prompt de démarrage (à compléter en session dédiée)
À cadrer : structure de liaison (champ `linkedMvId` ? collection de paires ?), heuristique de détection (tolérance dates/montants), UX de confirmation et d'annulation du lien.
