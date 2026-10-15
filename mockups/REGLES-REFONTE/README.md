# Maquettes — Refonte des règles de classement (lot D, D1–D6)

Maquettes HTML **statiques** (aucun code applicatif, aucun fichier de `js/`, `css/` ou `index*.html` touché). Ouvrir `index.html`. Chaque écran a un sélecteur Format (PC 1280 / tablette 768 / téléphone 390) et Thème (auto / clair / sombre). Le design reprend les variables de `css/main.css` (`--bg`, `--sur`, `--t1`, `--acc`, `--pos`, `--neg`, `--warn`…), sans hex hors `:root`. Sombre via `prefers-color-scheme` et `data-theme`. Cibles tactiles >= 44 px, champs à 16 px. Les cadres s'adaptent par container queries (le cadre 390 px se comporte comme un téléphone même sur grand écran).

| Fichier | Écran |
|---|---|
| `creer-regle.html` | a. Création de règle (ligne d'import / mouvement enregistré / à froid), puce libre « + mot », compte préchargé |
| `apercu-direct.html` | b. Aperçu en direct, lignes décochables, alerte « natures différentes », cas SARAR 4 583,03 €, création à froid |
| `regle-enregistree.html` | c. Pastille « ✓ Règle enregistrée » (4 états) |
| `mes-regles.html` | d. Mes règles, version simple : liste par compte, badge « Compte à choisir », doublons, exceptions, Modifier ouvre un panneau d'édition |
| `categorie-assurance-pret.html` | e. Catégorie « Prêt — Assurance emprunteur » + note de prudence |

## Décisions de Didier reprises telles quelles
1. Une règle appartient à un compte (donc à un bailleur), obligatoire. Listes filtrées par bailleur avec « Voir tout » explicite. Seules les NOUVELLES règles imposent le compte dès la création. Les règles historiques sans compte restent actives et portent le badge « Compte à choisir » dans Mes règles : on ouvre la règle et on choisit le compte (obligatoire à l'enregistrement). Il n'y a ni écran de migration, ni assistant, ni bandeau dédié.
2. La règle ne s'applique jamais aux mouvements déjà en base : ligne source + import en cours + imports futurs. Le compteur « N déjà en base » est informatif, sans bouton.
3. Case décochable par ligne = « ne rentre pas dans la règle » ; exception mémorisée sur la règle, visible et supprimable dans Mes règles.
4. Condition de montant optionnelle : « = loyer du bail » OU montant exact OU plage ; plus le sens.
5. Catégorie « Prêt — Assurance emprunteur » visible dans le sélecteur, ligne 250, avec note de prudence (double compte possible si l'attestation annuelle l'inclut).

## Points tranchés par la maquette (hypothèses, à valider)
- **Ouverture sans mot présélectionné** : « aucun mot deviné » pris au pied de la lettre. L'enregistrement est désactivé tant qu'aucun mot n'est coché. (La maquette `a` montre l'import avec « SARAR SYNDIC » déjà coché pour la démonstration.)
- **Sémantique du motif** : tous les mots (puces cochées + mots saisis) doivent figurer dans le libellé (ET), n'importe où, sans ordre ni adjacence imposés, casse et accents ignorés. Une puce cochée est cherchée comme **mot du libellé** ; un mot saisi avec « + mot » est cherché comme **morceau de mot** (« ELEC » attrape « ELECTRICITE »). À confirmer : l'ordre/adjacence, et la recherche des puces cochées comme mots entiers plutôt que comme morceaux.
- **Création à froid** : sans libellé de départ, on colle un libellé de référence et les puces sont ses mots.
- **« = loyer du bail »** : proposé seulement quand le sens est « recette » ; comparé au **loyer charges comprises du mois en cours** du bail du logement affecté (décision Didier 06/10).
- **Ligne source verrouillée** (case cochée non décochable) dans l'aperçu : la ligne d'où l'on crée la règle suit toujours la règle. Cela déroge à « chaque ligne a une case décochable » pour cette seule ligne.
- **Fiche mouvement enregistré** : le mouvement de départ est mis à jour **directement** à l'enregistrement de la règle, sans confirmation (décision Didier 06/10) ; c'est la seule exception à « jamais les mouvements en base ».
- **Alerte « natures différentes »** calculée sur les lignes **cochées de l'import** (nature = catégorie proposée). Le nombre « en base » n'entre pas dans l'alerte, il reste informatif. Il n'y a plus d'action « fixer le compte » : le compte est déjà choisi (lecture seule) depuis une ligne ou un mouvement, et se choisit dans le sélecteur uniquement en création à froid.
- **Mes règles : « on fait simple » (décision Didier)** : l'écran ne garde que la liste par compte avec bailleur (filtre + « Voir tout »), le signal de doublon (Fusionner / Garder les deux), le badge « Compte à choisir » et la mention discrète « N exceptions » dépliable. **Retirés** : le champ « Tester un libellé » (et son surlignage) et les statistiques d'utilisation (« N mouvements · dernière fois le … »). Chaque règle montre motif en puces, sens, condition de montant, résultat (catégorie / affectation), Modifier et Supprimer. Deux règles au même résultat = doublon (pas de conflit) ; le cas « résultats différents » (CDC-IMPORT ⑦.2 v2) reste traité à l'import, plus dans cet écran.
- **Doublon** : proposé « Fusionner » ou « Garder les deux » ; critère de détection = même compte, même résultat, même condition de montant, et l'une attrape toutes les lignes de l'autre (motif inclus). **Fusionner garde la plus LARGE** (le bouton dit laquelle : « Fusionner (garder « SARAR ») ») et réunit les exceptions : aucune ligne ne perd son classement (audit I2 ; la maquette mes-regles.html, qui conserve « SARAR SYNDIC », date d'avant).
- **Exception** : supprimer une exception ne reclasse rien. Clé de l'exception (ligne précise ? libellé ?) non tranchée : la maquette l'affiche comme une ligne datée et chiffrée.
- **Plage de montant** : le CDC ⑦.1 l'avait écartée (« un montant qui change casse la règle en silence ») ; elle est réintégrée sur décision de Didier. La maquette n'ajoute pas d'alerte de « règle qui ne matche plus » : à envisager.
- **Données fictives** : SCI Dupont (CIC Pro ···4821, Banque Populaire ···0937), Didier Keller en nom propre (Crédit Agricole ···2210, « Studio Strasbourg — Krutenau »), Ferrette 101/102/103, SARAR (virements de 150 €, facture de travaux 4 583,03 €), loyer 680 € pour Ferrette 101, assurance emprunteur 18,40 €. Aucune règle fiscale nouvelle n'est affirmée : la ligne 250 et la note de prudence sont celles décidées par Didier.

- **Puce libre « + mot »** : dernière puce de la liste ; elle ouvre un petit champ (16 px) avec Ajouter / Annuler (Entrée valide, Échap ferme). Un seul mot, sans espace, pas de doublon. Le mot devient une puce **cochée**, marquée « saisi » (bordure en tirets, étiquette), décochable (la puce reste) et supprimable (✕, cible 44 px). Pendant la saisie, un retour indique si le morceau figure dans le libellé de départ (sinon la ligne de départ ne suivrait plus la règle). Aucune longueur minimale imposée (à confirmer).
- **Compte** : depuis une ligne d'import ou un mouvement enregistré, le compte est repris de la source et affiché en lecture seule avec son bailleur (badge « préchargé »), aucun sélecteur. Le sélecteur n'existe qu'en création à froid (onglet « À froid », et cas 4 de l'aperçu, remplacé par la création à froid).
- **Règles historiques sans compte** : restent actives sur tous les comptes ; groupe « Compte à choisir » en tête de Mes règles, affiché quel que soit le filtre bailleur (sans compte, pas de bailleur). Le bouton « Ouvrir et choisir le compte » ouvre la règle ; Enregistrer reste désactivé tant qu'aucun compte n'est choisi. Cette ouverture est le même panneau que Modifier (voir ci-dessous).
- **Modifier = panneau d'édition pour toute règle** : mêmes composants que la création (puces de mots cochables, puce libre « + mot » avec ✕, sens, condition de montant), plus compte et catégorie. Le compte n'est modifiable/obligatoire que pour une règle sans compte (Enregistrer désactivé tant qu'il manque un compte ou tout mot). Décocher un mot l'écarte du motif à l'enregistrement. L'affectation s'affiche en lecture seule (maquette). Supprimer, Fusionner et Garder les deux agissent sur la liste sans confirmation (maquette).
- **Cases de l'aperçu** : une création à froid n'a pas d'import en cours, donc pas de case à cocher ; l'aperçu liste seulement les mouvements en base, pour information.

## Zones modifiées de la fenêtre existante

La vraie fenêtre de classement (navigation « Vérifier 3/11 », éditeur d'affectation, découpage ✂️) est **conservée telle quelle** (CDC-IMPORT §⑦.6) : les maquettes `creer-regle.html` et `apercu-direct.html` ne la redessinent pas. Elles la montrent **grisée** (opacité réduite, niveaux de gris) et ne mettent en évidence, en couleur d'accent avec une étiquette, que ce qui change. Une légende « existant / modifié / nouveau » figure en haut de chaque page.

| Zone | Étiquette | Écran |
|---|---|---|
| Motif en puces (mots du libellé cochables) | modifié | a, b |
| Puce libre « + mot » et mots saisis | nouveau (dans la zone motif) | a, b |
| Compte préchargé en lecture seule avec son bailleur (sélecteur seulement à froid) | nouveau | a, b |
| Condition de montant (= loyer du bail / exact / plage) | nouveau | a |
| Listes d'affectation filtrées par bailleur, « Voir tout » | modifié | a |
| Cases décochables de l'aperçu | modifié | b |
| Alerte « natures différentes », compteur « en base », exceptions, récapitulatif « ce qui se passera » | nouveau (accompagne l'aperçu) | a, b |
| Pastille « ✓ Règle enregistrée » (remplace « Mémoriser la règle ») | nouveau | a, b, c |

Grisé (existant, inchangé) : barre « Vérifier 14 / 31 », boutons Précédent / Suivant, ✂️ Découper, ligne de départ, sens, sélecteur de catégorie et niveau d'affectation.

## À valider par Didier
1. Traitement fiscal de l'assurance emprunteur (ligne 250 avec les intérêts) et formulation de la note de prudence.
2. Les hypothèses ci-dessus, en particulier : motif en ET sans ordre, ligne source verrouillée, reclassement de la fiche mouvement, sens du « = loyer du bail », comportement de « Décider plus tard ».
3. Rappel d'implémentation (hors maquette) : retrouver la règle à modifier par son identifiant, pas par son motif (D6) ; `js/core/bank-import.js` et sa copie `js/helpers/bank-import.global.js`.
