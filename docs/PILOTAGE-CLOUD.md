# PILOTAGE CLOUD — sessions conduites depuis `claude/admiring-bohr-no6zkk`

> Le BACKLOG de référence est celui de `main` (intégrateur unique = pilotage Desktop, règle Didier 06/10). Ce fichier tient l'état des sessions cloud et des sujets notés ici ; le pilotage Desktop le reprend à l'intégration.

## 🧭 PLAN DE SESSIONS (05/10, validé Didier) — état au 07/10 matin
| Session | État | Attend Didier | Branche |
|---|---|---|---|
| Finances — suivi des loyers (Sonnet) | phase 1 ✅ (Arslan, règles d'imputation) · phase 3 : conception du moteur unique écrite (document, aucun code) | ses questions sur la conception (« qu'en penses-tu pour chacune ? ») | `feat/finances-suivi-unique` |
| Règles de classement (Sonnet) | phase 3 ✅ modèle pur (id, compte obligatoire, exceptions, montant) + migration + aperçu · phase 4 (application) en cours | — | `feat/regles-refonte` |
| Bail en cours (Sonnet) | **tout livré sur branche** (tête `7e2997a`, 6 506 tests, contre-audits Opus) : lot A, B4 DG versé, B3 nom d'affichage, bail/EDL hors Propryo + signature expirée, bouton Modifier des périodes · smoke : `docs/subjects/BAIL-EN-COURS-SMOKE.md` · en cours : fusion de main dans la branche (décision pilotage : garder la suppression du code mort v15.719 dans app-part1) | **Didier → demander au pilotage Desktop d'intégrer `feat/bail-en-cours`** (main + 1) | `feat/bail-en-cours` |
| Fusion des 2 SCI (Opus) | ✅ **v15.717 partage SCI sur main** (`be5a3a8`) · ✅ **données déplacées 06/10 ~16h45** (GO Didier « 1 à 4 ») : 85 mouvements + 9 documents + 2 MRH + 19 rappels → espace Marion, originaux tombstonés, 0 suppression dure, baux/EDL intacts, sauvegarde `sauvegarde-20261006-143935Z.json` remise à Didier + script de retour arrière · restent chez Didier volontairement : 2 mvts « DD2AMELEVIERE » (à reclasser SCI DD2 IMMO), 2 dépenses « payé Didier » sans lot | smoke vue Didier + vue Marion · réponse sur les 2 dépenses · suite (après GO) : validation de régul partagée par SCI | `fix/fusion-sci` |
| Audit de sécurité (Opus) | rapport livré (hors dépôt) · chantiers C1–C3 · domaine propryo.fr vérifié chez Resend | DMARC : contenu de la ligne `_dmarc.propryo.fr` dans cPanel (ou confirmer absente) | `audit/securite` |
| IRL & courriers (Sonnet) | lecture faite | valeur du champ « Trimestre IRL » du 103 + ce qu'affiche la ligne Révisions | `feat/irl-courriers` (pas encore poussée) |
| Stockage lots 2-3 (Opus) | ✅ **SUR MAIN en v15.723** (intégré par le pilotage Desktop, 06/10 soir) · suite à arbitrer : journal des EDL écrit même si le repli localStorage ne tient plus la base | smoke prod | `feat/stockage-lots-2-3` |
| Vague 3 | Écrans (B2, C1, C5, vue Charges sans immeuble, toasts M-15) — après Finances · Mise en production (reste : Stripe, comptable) | | |
⚠ **Quota** : limite hebdomadaire en alerte (`seven_day allowed_warning`, remise à zéro lundi 12/10 vers 13h (heure de Paris)) — éviter de lancer de nouvelles sessions avant d'avoir intégré les livraisons.

**Versions (06/10, 17h)** : ⚠ le pilotage Desktop a pris **v15.717 (partage SCI) et v15.718 (Finances cash-flow + catégories)** sur main. Les réservations faites ici (718 Bail lot A, 719 régul, 720-721 Stockage, 722-725 Bail phase 4) sont **annulées** → règle unique : **chaque livraison prend main + 1 au moment du merge**. **GO Didier 06/10 (« donne le go au fur et à mesure »)** : ordre de merge sur main = ① Stockage lots 2+3 → ② Bail en cours lot A + B4 (branche de livraison sans B3) · Fusion SCI : GO exécution du plan (sauvegarde d'abord, pas à pas). ❓ **Deux pilotages actifs (Desktop + cloud) : Didier doit désigner un seul intégrateur.**


## 🎨 TOASTS-CHARTE-M15 — nouveau sujet (06/10, demande Didier via session Stockage) · P2 · vague 3 « Écrans »
Le composant `#toast` colore **tout le texte** en rouge/orange selon le type, contraire à la charte mobile **M-15** (`docs/CHARTE-MOBILE.md`). À refaire : texte neutre lisible + marqueur coloré (icône/bordure), contraste mesuré (M-17), clair ET sombre, 3 formats. Transverse (tous les toasts de l'app).

## 🚦 ALERTE « Régularisation N-1 à émettre » — ⚠ annoncée v15.713 mais **v15.713 déjà pris sur main** (charges hors occupation, `b121dbb`) → **renuméroter v15.719** · ⚠ commit **introuvable sur GitHub** (la branche `claude/vigorous-hawking-8b71ed` pointe sur main) : la session doit pousser son travail · ⏳ smoke + GO Didier
**Livré** : l'alerte s'éteint quand on clique « Valider la régul de l'immeuble » (onglet Charges) pour N-1 ; l'alerte ouvre l'onglet Charges directement sur N-1. **Version v15.713 prise** par cette branche.
**Smoke Didier** : Accueil → alerte Régul → onglet Charges sur 2025 → vue immeuble → Valider → l'alerte disparaît.
**À arbitrer (Didier)** :
1. **SCI partagée** : la validation est stockée dans la config propre à chaque utilisateur (`DB.regulValidations`). Un associé invité ne voit pas la validation du propriétaire : son alerte reste allumée, et le badge « validé » de l'écran Charges a le même défaut (préexistant). ✅ **DÉCIDÉ Didier 05/10 : validation = donnée PARTAGÉE de la SCI** (visible de tous les associés). Migration à prévoir (GO Didier avant application) → confié à la suite de la session « Fusion SCI » une fois la fusion terminée (connaît espaces + RLS), sinon session dédiée vague 2.
2. **Logement sans immeuble** : son alerte ne peut pas s'éteindre, car la vue « (sans immeuble) » de l'écran Charges est vide (défaut préexistant, cas rare). ✅ **DÉCIDÉ Didier 05/10 : vague 3 « Écrans »** (vue « (sans immeuble) » de l'écran Charges à remplir).

## 🔥 RETOURS-2026-10-05 (Ferrette 101/102/103) — 🔍 DIAGNOSTIQUÉ, ⏳ GO Didier lot A
**Lot A (bugs francs, correctifs rédigés)** : A1 `saveBail` boucle DDT ↔ popup financière → modif charges jamais enregistrée · A2 matrice « Signer le bail » sur bail signé (clés `signatures.bailleur/locataire` jamais écrites) · A3 « Faire l'EDL » (`DB.edls` au lieu de `DB.edl`) · A4 DPE joint → plomb/amiante détectés (mot « amiante » nu) · A5 CREP avec plomb 1 an au lieu de 6 ans (location) · A6 Diag rouge locataire en place (jugé à aujourd'hui au lieu de la conclusion du bail).
**Lots B/C** : 3 blocs Loyers, libellé logement ≠ réf, DG versé hors mouvement, MRH (PJ avant save, Documents, fiche lecture), bail/EDL externes, fil rouge IRL + lettre, corriger/annuler une modif de bail, vue logements, civilités, date dans les titres. **Lot D (Mouvements)** : pas de catégorie assurance prêt, règle non appliquée à la ligne source ni aux mouvements en base, « Mémoriser la règle » sans contrôle (doublons), pas de règle depuis un mouvement enregistré, refonte règles à maquetter (règles non scopées au bailleur du compte, aperçu non décochable, clé = motif). **Lot E (Finances)** : avance non compensée vs retard compensé (C2 du 14/07 à moitié corrigé), 3 moteurs (Finances / Loyers-relance / bandeau), pas de « manque accepté », popups sans lien mouvement, graphique et tableau en sens inverse, 2 sélecteurs bailleur. Détail : `docs/subjects/RETOURS-2026-10-05.md`.


