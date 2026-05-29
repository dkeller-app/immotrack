# Paquet 1 — Vision UX cible (les 3 changements quotidiens)

**Date** : 2026-05-25 · **Auteur** : pilotage avec Didier
**Coordination** : Didier travaille en parallèle sur `index.html` (sujet logement/bien/bail). Ce document **ne touche pas le code**, c'est la cible vers laquelle on va.

---

## 1. La vision en une phrase

> **L'app doit comprendre dans quel contexte tu travailles (quelle SCI, quel mois) une bonne fois pour toutes, te montrer chaque chose à sa place (le mur d'un côté, la personne de l'autre), et t'aider quand tu ajoutes du patrimoine au lieu de te laisser tout seul devant trois formulaires séparés.**

Ces 3 chantiers ne sont **pas indépendants**. Ils forment **une seule logique cohérente** :
1. Un **contexte global** (où je travaille) → la barre du haut
2. Une **séparation claire** (quoi je regarde) → Bien vs Locataires
3. Un **parcours guidé** (comment je crée) → wizard séquentiel

Si on fait l'un sans l'autre, ça reste bancal. Si on fait les 3, l'app devient une **vraie expérience cohérente**.

---

## 2. Les 3 chantiers expliqués simplement

### 🟢 Chantier A — La barre de contexte globale

#### Le problème actuel
Tu cliques "SCI DD" dans les bulles du dashboard → ça filtre **seulement le dashboard**. Tu vas dans IRL → il faut re-sélectionner SCI DD dans un dropdown. Tu vas dans Mouvements → re-sélectionner encore. Et quand tu cliques une bulle, ça te ramène au dashboard alors que tu étais en train de regarder autre chose.

#### Ce qu'on va construire
Une barre **fixée en haut de l'écran**, **toujours visible**, avec :
- **À gauche** : les bulles d'entités (Toutes / SCI DD / SCI SM / Didier)
- **À droite** : un sélecteur de période (◀ Mai 2026 ▶)

Quand tu cliques une bulle ou changes le mois :
- Le filtre est **mémorisé**
- **TOUS** les onglets se mettent à jour (pas seulement le dashboard)
- Tu **restes sur l'onglet courant** (plus de retour forcé au dashboard)

#### Le vrai gain
- Tu te poses la question "quelle SCI je regarde ?" **une seule fois par session**, pas 15 fois
- Tu navigues librement, le filtre te suit
- Sensation d'un vrai outil pro, type "workspace SaaS"

#### Détail technique important
Le filtre doit **vraiment filtrer** (ex : si tu choisis SCI DD, les autres logements ne s'affichent **pas du tout**, ce n'est pas un masquage CSS). Et les chiffres (KPI, totaux) se recalculent sur la SCI choisie uniquement.

---

### 🟢 Chantier B — Séparation claire Bien ↔ Locataires

#### Le problème actuel
Aujourd'hui dans la fiche d'un bien (logement), tu trouves :
- Référence du bien ✓
- Surface, étage, DPE ✓ (ça concerne bien le mur)
- **Mais aussi** : nom du locataire, mail, téléphone, dates de bail… (ça concerne la personne)

C'est **confus**. Tu ne sais pas si tu modifies le bien ou le locataire.

Et dans l'onglet "Baux & Locataires" actuel, tu retrouves les mêmes infos sous un autre angle. → **redite**.

#### Ce qu'on va construire

Deux onglets qui se complètent **sans se dupliquer** :

**Onglet "Bien"** (le mur)
- Adresse, surface, étage, DPE
- Photos
- Diagnostics
- Équipements
- État (loué / vacant)
- Le bail apparaît en **lecture seule** : "Loué par X jusqu'au Y" — juste pour info

**Onglet "Locataires"** (la personne et la relation)
- Liste des locataires actuels
- Contact (mail + téléphone)
- Bouton ✉ "Écrire un mail" qui ouvre la modale EMAIL-AUTO
- Échéances de baux (renouvellements, fins)
- Candidats (pipeline LOG-CANDIDATS)
- Le bail apparaît en **gestion active** : éditer, renouveler, clôturer

#### La règle pour ne pas se tromper
- **Bien = je gère le mur** (immobilier, légal, physique)
- **Locataires = je gère la personne** (relation, contrat, communication)

Quand tu te demandes "où je clique ?", c'est cette règle qui tranche.

#### Important — coordination avec ton travail actuel
Tu es déjà en train de faire le travail de fond avec **ARCHI-DB-DOUBLONS** (livré) + **MODALE-LOGEMENT-CONSOLIDATION** (livré). Ce chantier B est donc **la moitié déjà faite côté données**. Il reste essentiellement à :
- Renommer l'onglet "Baux & Locataires" → "Locataires" (peut-être déjà fait, à vérifier — vu v15.220)
- Ajouter le contact + bouton ✉ dans la liste locataires
- S'assurer que la fiche bien ne montre QUE de la consultation côté bail (legacy retiré)

---

### 🟢 Chantier C — Wizard de création séquentiel

#### Le problème actuel
Pour ajouter un nouveau bien loué dans ton patrimoine, tu dois aujourd'hui :
1. Aller dans l'onglet Immeubles → créer l'immeuble
2. Aller dans l'onglet Logements → créer le bien (et te souvenir de bien le rattacher au bon immeuble)
3. Aller dans l'onglet Baux → créer le bail (et te souvenir de bien le rattacher au bon bien)

**4 onglets, 4 formulaires, aucun guidage.** Et le bouton "Créer bail" depuis la fiche logement avait un bug (corrigé v15.190 mais l'idée reste : pas de guidage).

#### Ce qu'on va construire
Après que tu enregistres un immeuble, une petite popup apparaît :

```
✓ Immeuble "Damelevières" créé.

Voulez-vous ajouter un bien dans cet immeuble ?
[+ Ajouter un bien]  [Plus tard]
```

Si tu cliques "+ Ajouter un bien" → le formulaire bien s'ouvre, **immeuble pré-rempli**. Tu remplis, tu enregistres, et nouvelle popup :

```
✓ Bien "D-101" créé.

Voulez-vous créer un bail sur ce bien ?
[+ Créer un bail]  [Plus tard]
```

Et ainsi de suite jusqu'au bail. À chaque étape tu peux dire "Plus tard" sans rien casser.

#### Le vrai gain
- Tu ne perds plus de temps à chercher dans quel onglet aller
- Tu ne risques plus d'oublier de créer le bail
- Les liaisons (immeuble → bien → bail) sont **automatiquement bonnes**
- Quand tu accueilles un nouveau bailleur (commercialisation), il a un parcours fluide au lieu de partir en confusion

#### Important — coordination avec ton travail actuel
Tu travailles sur logement/bien/bail. Si tu touches à `openNewBailChoix` ou aux modales de création, **garde-le en tête** : la cible est ce flow guidé. Si tu peux déjà brancher un crochet "après save immeuble → proposer bien", c'est gagné.

---

## 3. L'ordre d'attaque (très important)

Il y a **un seul bon ordre**, sinon on se prend des conflits :

### Étape 1 — Stabiliser ton travail actuel logement/bien/bail
Tu es en plein dedans, et c'est exactement la **fondation** des chantiers B et C. **Termine ce que tu as commencé** avant qu'on touche au reste, sinon je vais te marcher dessus.

### Étape 2 — Chantier A : la barre de contexte globale
Pourquoi en premier des nouveaux chantiers ? Parce que :
- C'est **indépendant** des autres (modification topbar + filtres, pas la fiche bien)
- C'est **visible immédiatement** : le ressenti UX change dès la première session
- Ça **prépare** les chantiers B et C (la barre est déjà là, on l'utilise)

### Étape 3 — Chantier B : finir Bien vs Locataires
La moitié est déjà faite par tes commits récents. Reste les détails (contact dans Locataires, bouton ✉, vérification du renommage).

### Étape 4 — Chantier C : wizard de création séquentiel
On le fait **après B**, parce que le wizard appelle les formulaires bien et bail. Mieux vaut que ces formulaires soient eux-mêmes dans leur version cible.

### Récap visuel
```
TOI (en cours)                  Stabiliser logement/bien/bail
   ↓
ÉTAPE 2 (~5-7h)                 Barre de contexte globale (Chantier A)
   ↓
ÉTAPE 3 (~2-3h)                 Finir Bien vs Locataires (Chantier B)
   ↓
ÉTAPE 4 (~4-6h)                 Wizard de création (Chantier C)
   ↓
PAQUET 1 = TERMINÉ              ≈ 12 à 16 heures de dev total
```

---

## 4. Les décisions à prendre AVANT de coder

Pour ne pas découvrir un blocage en plein dev, voici les questions auxquelles il faut répondre maintenant.

### Pour la barre de contexte (Chantier A)
- **Q1** : sur les onglets qui n'ont pas de notion de "période" (ex : Biens, EDL), on cache le sélecteur mois/année ou on le laisse en grisé ?
  - *Reco* : on le **laisse mais en grisé** (cohérence visuelle, l'utilisateur voit que c'est inactif)
- **Q2** : le filtre est-il persisté entre les sessions (tu retrouves "SCI DD" à la reconnexion) ou il se remet à "Toutes" à chaque ouverture ?
  - *Reco* : **persisté** (workspace, comportement SaaS)
- **Q3** : sur mobile, les bulles s'affichent comment ? (scroll horizontal ou menu condensé)
  - *Reco* : **scroll horizontal** pour rester visuel

### Pour Bien vs Locataires (Chantier B)
- **Q4** : la liste des locataires montre quoi exactement (nom, téléphone, mail, bail en cours, alertes) ?
  - *À discuter sur mockup*
- **Q5** : le pipeline candidats (LOG-CANDIDATS) vit dans cet onglet ou ailleurs ?
  - *Reco* : **ici** (sous-onglet "Candidats" dans Locataires)

### Pour le wizard (Chantier C)
- **Q6** : la popup "Voulez-vous ajouter…" est-elle **modale** (bloquante tant qu'on n'a pas choisi) ou **non-modale** (toast qu'on peut ignorer) ?
  - *Reco* : **non-modale** (toast/sheet), respecte le flux utilisateur
- **Q7** : on inclut l'entité comme première étape du wizard, ou on suppose qu'elle existe déjà ?
  - *Reco* : on suppose qu'elle existe (cas réel : on ne crée pas une entité par bien)
- **Q8** : si l'utilisateur clique "Plus tard" à l'étape bien, est-ce qu'on lui rappelle quelque part qu'il a un immeuble vide ?
  - *À discuter*

---

## 5. Le mockup interactif

Un mockup `docs/strategie/mockups/paquet-1-vision/` qui montre **les 3 chantiers intégrés sur une même app**. Tu pourras :
- Voir la barre fixe en action (cliquer les bulles, changer le mois)
- Voir Bien vs Locataires côte à côte (pour comprendre la séparation)
- Voir un wizard séquentiel en action (popups guidées)

Le mockup utilise des données fictives. C'est juste pour **visualiser la cible**, pas pour coder.

---

## 6. Coordination avec ton travail actuel

Tu es en plein refactor logement/bien/bail. Voici **comment ça s'articule** avec ce paquet :

| Ce que tu fais maintenant | Comment ça nous aide pour le Paquet 1 |
|---|---|
| ARCHI-DB-DOUBLONS (livré) | Pose les fondations pour Bien vs Locataires |
| MODALE-LOGEMENT-CONSOLIDATION (livré) | Retire le legacy de la fiche bien, libère l'espace pour la vision cible |
| Si tu touches au wizard `openNewBailChoix` | Pense à laisser un crochet "après save → propose étape suivante" |
| Si tu refactores la sidebar | Garde l'esprit "Bien" / "Locataires" séparés |

**À éviter** :
- Réajouter du contenu bail dans la fiche bien (on veut le retirer, pas le réinjecter ailleurs)
- Multiplier les dropdowns "filtre par entité" sur chaque onglet (Chantier A va les remplacer)

---

## 7. La suite après le Paquet 1

Une fois le Paquet 1 fini, l'app a sa **vraie forme finale UX**. Le Paquet 2 (commercialisation : démo + onboarding + app démo séparée) peut alors être attaqué dans de bonnes conditions, parce que :
- Le tour guidé pourra pointer la **nav cible** (pas l'ancienne)
- Les données démo pourront être chargées dans le mode démo cohérent
- Les prospects verront l'app **dans sa forme aboutie**

C'est pour ça qu'on fait Paquet 1 **avant** Paquet 2.

---

## En résumé

- **3 chantiers cohérents**, pas indépendants
- **Vision** : un contexte global (barre du haut) + une séparation claire (Bien vs Locataires) + un parcours guidé (wizard)
- **Effort total** : 12 à 16 heures de dev
- **Ordre obligatoire** : tu finis ton travail logement/bien/bail → A → B → C
- **Pré-requis** : valider les 8 décisions (Q1 à Q8) avant de coder
- **Coordination** : tu ne réintroduis pas le legacy, tu laisses des crochets quand tu peux

Dis-moi :
1. Si la vision est claire pour toi
2. Si tu valides les recos (Q1-Q8) ou si on en discute
3. Quand tu auras fini ton travail logement/bien/bail (pour qu'on enchaîne Chantier A)
