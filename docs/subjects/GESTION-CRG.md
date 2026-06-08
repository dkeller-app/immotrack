# GESTION-CRG — Compte Rendu de Gestion (CRG) mensuel, mode gestionnaire

**Status** : ⬜ À faire (note capturée, scope à affiner en session dédiée) · **Prio** : 🔥 P0 · **Taille** : ~6h
**Phase** : **V1.1** (Gestion pro) — *reporté, pas V1.0*
**Dépend de** : **GESTION-MANDAT** (mandat de gestion + honoraires + reversement bailleur) — prérequis dur : pas de CRG sans mandat ni barème d'honoraires.
**Lié à** : EXPORT-COMPTABLE (✅ livré, `_buildEcritures`), LEGAL-BILAN-ANNUEL (récap annuel v14.92), REPORTING-BAILLEUR (onglet Finances = analyse **propriétaire** ≠ CRG **mandataire**), AGENCE-CRG (P3, doublon historique à fusionner ici), DASH-PROFILES (profil Gestionnaire), MULTI-USER / PORTAIL-BAILLEUR (V2 : CRG en ligne).
**Sandbox-first** : `index-test.html` uniquement, prod après OK explicite user.

---

## Genèse

Pendant le brainstorming de l'onglet **Finances** (REPORTING-BAILLEUR), l'utilisateur a partagé un **vrai CRG** reçu de son agence et a dit :

> _« il faut penser aux bilans mensuels pour le suivi des agences »_

Désambiguïsation (AskUserQuestion 3 options : consommer les CRG de mes lots en gestion déléguée / **produire des CRG (mode gestionnaire)** / bilan mensuel dans Finances). Réponse retenue :

> **« Produire des CRG (mode gestionnaire) »**

→ ImmoTrack, utilisé par un **gestionnaire/mandataire** (agence, carte T Hoguet), doit **produire** chaque mois le Compte Rendu de Gestion à remettre au **propriétaire** dont il gère les biens. C'est le cœur réglementaire du métier de mandataire (reddition de comptes, loi Hoguet).

**Distinction importante** (ne pas confondre les deux livrables) :
- **Finances (REPORTING-BAILLEUR)** = analyse pour **le propriétaire de ses propres biens** (résultat net, compte de résultat, ratios). Vue interne, pas un document remis à un tiers.
- **CRG (ce sujet)** = document **officiel mandataire → propriétaire mandant**, par mandat, mensuel, avec honoraires de gestion + reversement. Ne sert pas l'auto-gestion.

→ **Les deux restent séparés.** REPORTING-BAILLEUR ne grossit pas de ce sujet. CRG = sprint V1.1 dédié, après GESTION-MANDAT.

---

## Référence réelle — CRG agence analysé

PDF fourni par l'utilisateur : `compte_rendu_de_gestion___mandat_00059___2026_05_31.pdf`
Émetteur : **DELLE IMMOBILIER** (réseau Stéphane Plaza) — mandat **00059**, période mai 2026.

Structure observée (= gabarit cible à produire) :

1. **En-tête** : émetteur (agence) + propriétaire mandant + n° de mandat + période (mois/année).
2. **Synthèse bâtiment / mandat** :
   - Solde des **recettes** (loyers + provisions encaissés)
   - − Solde des **dépenses** (honoraires de gestion, charges payées pour le compte du propriétaire…)
   - = **Situation** du mandat → **paiement au propriétaire** (net versé) → **solde du compte**
   - **Solde antérieur** + mouvements = **nouveau solde**
3. **Détail par locataire** : appels (loyer + provisions) vs encaissements réels, **restant dû** éventuel.
4. **Dépenses / honoraires** : honoraires de gestion = **% sur encaissé + TVA**.
5. **Net versé au propriétaire**.

Exemple chiffré réel (1 lot) :
- Locataire : M. Bouley Eloi — T2 meublé
- Loyer **500 €** + provisions sur charges **30 €** = **appel 530 €**
- Honoraires gestion **8,5 %** sur encaissé = **45,05 €** + **TVA 20 %** = **9,01 €** → total honoraires **54,06 €**
- **Net versé au propriétaire = 475,94 €**

---

## Scope pressenti (à affiner en session dédiée)

> ⚠️ Note seulement — pas de spec validée. À ouvrir formellement (brainstorming) le moment venu, **après GESTION-MANDAT**.

- **Données d'entrée** : barème d'honoraires (% + TVA) et reversement viennent de **GESTION-MANDAT** ; les encaissements/appels viennent des données loyers + `DB.mouvements` existants (réutiliser `_buildEcritures`, helpers loyers `_loyerProrataMois` / `_loyerHCAtDate`).
- **Périmètre** : un CRG **par mandat** (= par propriétaire mandant), pas par immeuble. Multi-lots par mandat possible.
- **Calculs** : appels vs encaissés, restant dû, honoraires (% encaissé + TVA), dépenses pour compte, net versé, report solde antérieur → nouveau solde.
- **Sortie** : **PDF** (gabarit type CRG agence) + dépôt **Drive** (cohérent avec l'arborescence par entité). Réutiliser le moteur PDF natif déjà en place (cf. génération bail/quittance).
- **Profil** : visible/activé uniquement en **profil Gestionnaire** (DASH-PROFILES) — masqué pour le particulier solo.
- **Extensibilité commerciale** : pensé multi-mandats / multi-propriétaires (SaaS gestionnaire), pas pour un seul mandat.

---

## Hors scope (YAGNI pour la première version)

- Signature électronique du CRG (V2/V3).
- Portail propriétaire en ligne pour consulter les CRG (V2 : PORTAIL-BAILLEUR).
- Notifications email automatiques d'envoi du CRG (V2 : NOTIFICATIONS).
- Régularisation annuelle des charges dans le CRG (déjà couverte par la régul existante + bilan annuel).

---

## Règles non négociables (mémoire projet)

- **Sandbox-first**, prod après OK explicite.
- **Mockup-first** : gabarit CRG (PDF + éventuel écran) mocké et validé AVANT code.
- **Audit code-reviewer obligatoire** : document chiffré à valeur réglementaire (honoraires, reversement, TVA) → audit agent avant « prêt à tester ».
- **Réutiliser l'existant** : `_buildEcritures` / mapping comptes (EXPORT-COMPTABLE livré), helpers loyers, moteur PDF natif. Ne pas réécrire.
- **Anti-jargon UI** : « CRG » conservé comme terme métier mandataire (le destinataire est un pro), mais expliciter « Compte rendu de gérance » au moins une fois.

---

## Notes utilisateur (verbatim)

- 2026-06-05 : _« il faut penser aux bilans mensuels pour le suivi des agences »_ (+ PDF CRG DELLE IMMOBILIER mandat 00059 joint).
- 2026-06-05 : choix désambiguïsation → **« Produire des CRG (mode gestionnaire) »**.

---

## Journal

- **2026-06-05** — Note capturée pendant brainstorming REPORTING-BAILLEUR. Création du fichier sujet (le sujet existait au BACKLOG ligne 155 sans fiche détaillée). Structure CRG extraite du PDF réel. Confirmé : **distinct de** l'onglet Finances (analyse propriétaire), reste **V1.1**, dépend de **GESTION-MANDAT**. Pas de spec ni de code lancé.
