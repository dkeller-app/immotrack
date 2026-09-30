# CDC — Déclaration d'occupation (impots.gouv) + garantie Visale

Validé par Didier le 25-28/09/2026. Maquette : `mockups/VISALE-GMBI/index.html` (locale, gitignorée).
Origine : BACKLOG « Remarques Didier 25/09 », sujets #6 et #7. Aucune API possible (DGFiP, Visale) : l'app prévient, ne déclare rien.

Principes : prévenir sans bloquer · ton neutre (infinitif) · aucune colonne cloud nouvelle (tout dans `legacy_raw`) · 3 formats · DRY.

## A. Déclaration d'occupation (« Gérer mes biens immobiliers »)

Base légale (Légifrance, vérifiée 25/09) :
- art. 1418 CGI (version du 21/02/2026) : propriétaires de locaux d'habitation, déclaration « avant le 1er juillet de chaque année », dispense si aucun changement depuis la dernière déclaration ; SCI via l'espace professionnel.
- art. 1770 terdecies CGI : « amende de 150 € par local », y compris omission ou inexactitude.
- Catégories : Cerfa 1208-OD-SD, un seul choix : 3.1 occupé par le propriétaire · 3.2 occupé par des tiers (gratuit oui/non) · 3.3 saisonnier/courte durée · 3.4 vacant + 1 motif sur 4. Garage/box = local distinct.

Décisions :
1. **Alerte ponctuelle**, affichée une fois au moment du changement de locataire. Pas de bulle Pilotage, pas d'état « fait », rien de persisté. Boutons « Ouvrir impots.gouv » + « Compris ».
2. **Départ** : à la clôture d'un bail (`saveBailClore`, `terminerBail`) → catégorie « vacant depuis le <fin effective> », les 4 motifs affichés sans en choisir (l'app ne le connaît pas).
3. **Arrivée** : au 1er enregistrement d'un nouveau bail (`saveBail`, `isNewBail`) → catégorie « occupé par des tiers », gratuit Non, loyer HC (facultatif), occupants (nom, date et lieu de naissance), date d'entrée = début du bail. Re-bail sur logement occupé (`archiverBail`) = une seule alerte (arrivée).
4. **Pas d'alerte** : bail repris à l'achat (`typeContrat='repris'`), renouvellement, mêmes occupants que le bail précédent, modification d'un bail existant.
5. **Échéance** : changement du 02/01/N au 01/01/N+1 → avant le 1er juillet N+1 (service-public.gouv.fr, campagne 2026).
6. **Rien de rétroactif** : seuls les changements faits après la mise en service.

## B. Visale

Sources (visale.fr, vérifiées 25/09) : le visa porte n°, locataire(s), loyer maximum charges comprises, date de validité ; « le contrat de cautionnement doit être validé avant la signature du bail » ; pas d'API (vérification manuelle sur l'espace bailleur).
Plafonds au 06/01/2026, charges comprises : 1 940 € Île-de-France · 1 575 € agglomérations > 100 000 hab., Corse, DROM · 1 365 € autres communes (étudiants au forfait 1 000 / 840 / 680 €).

Décisions :
1. Choix de garantie explicite « Aucune / Garant / Visale » dans la candidature et le bail (étape Personnes). Seules les données du choix retenu sont enregistrées.
2. Visa : `visale = { visaId, beneficiaires, loyerMax, validite, cautionValidee }` (JSON existant, pas de colonne). Pré-rempli du candidat au bail à la conversion.
3. Contrôles non bloquants : loyer charges comprises > loyer maximum du visa ; visa expiré (validité < aujourd'hui) tant que le bail n'est pas signé.
4. Plafonds par zone affichés en rappel seulement, pas de champ zone (le plafond qui fait foi est celui du visa). Source unique dans `js/core/visale.js`.
5. Case « Cautionnement validé sur visale.fr » (assistant bail + écran de signature). Non cochée → rappel non bloquant « Activer le cautionnement Visale avant de signer le bail » dans « Qui signe, et comment ? ».
6. Garant + Visale simultanés : le blocage de `saveBail` devient un avertissement (règle « jamais bloquer un enregistrement »), avec le rappel de l'art. 22-1.

Hors périmètre : formulaire de dossier en ligne du locataire (`relay/public/dossier.js`, déploiement séparé : reste n° de visa seul) ; empreinte légale du bail signé (Visale absent de `bailLegalContent`, à traiter à part).
