# Audit concurrence — Le moteur fiscal d'ImmoTrack est-il un vrai atout ?

> **Question posée** : « 2044 en un clic + traçable + multi-régime » est-il un **différenciant** ou du **table-stakes** ?
> **Méthode** : 4 sondes web parallèles (juin 2026), sources = **pages produit officielles** des concurrents. Tout fait repose sur le **discours éditeur**, **non testé en produit** → marqué comme tel. Filtré par les 4 critères gravés (cible / déjà couvert / effort vs gain / différenciant).
> **Verdict en une ligne** : **OUI, mais pas là où on le croyait.** Le différenciant n'est PAS « tous les régimes » (meublé et SCI sont **saturés**) — c'est **le 2044 foncier nu du bailleur particulier en direct + la traçabilité ligne-à-pièce**, créneau **peu couvert et mal servi**.

---

## 1. Segment FONCIER NU / 2044 — peu couvert, mal servi ✅ (notre terrain)

**Constat le plus solide de tout l'audit : l'administration ne pré-remplit PAS le 2044.**
Sur impots.gouv.fr, l'annexe 2044 (location nue, réel) est **vierge, à saisir case par case** : loyers (211), charges (221-230), intérêts (250), déficits antérieurs (450). L'admin ne calcule que les sous-totaux **une fois tout saisi à la main**. Des guides recommandent même de « faire ses calculs dans Excel avant ». → **C'est exactement le point de douleur visé.** (Source : corrigetonimpot.fr, impots.gouv.fr/formulaire/2044.)

**Les outils de gestion locative généralistes s'arrêtent au RÉCAP, pas au formulaire :**

| Acteur | Sortie 2044 | Détail | Source |
|---|---|---|---|
| **Rentila** | Récap « à titre indicatif », report à la charge de l'utilisateur ; télétransmission = **partenaire comptable payant** | gratuit | rentila.com/support |
| **Flatlooker/Manda** | **Récap Excel par locataire**, à recopier soi-même | gestion déléguée | support.flatlooker.com |
| **Smovin** | **Rien de fiscal FR** (origine belge, export compta) | 4-8€/u/mois | smovin.app |
| **Gérer Seul** | « aide à la déclaration » + annexes, **pas de 2044 pré-rempli** démontré | dès 14,90€/mois | gererseul.com |
| **Qalimo** | « déclaration revenu foncier » (aide) incluse ; **liasse payante 379€** orientée LMNP/SCI IS ; 2044 ligne-par-ligne **non vérifié** | 4,90€/bien/mois | qalimo.fr/tarif |

**Les rares acteurs qui revendiquent « 2044 auto » visent SCI/LMNP/B2B, pas le bailleur nu direct :** Indy, Ownily, VILOGI fournissent surtout des **« montants à reporter »** (quote-part associés), pas un CERFA généré et tracé.

**⚠️ Le seul concurrent frontal direct : `Déclaration-Foncier.fr`** — revendique un « 2044 pré-rempli (PDF, CERFA officiel) » pour le particulier nu, 19-39€. Petit, déclaratif, **profondeur non vérifiée** (gestion fine déficit 10 700€ / ligne 250 / travaux déductibles vs non = non démontrée). **À benchmarker en priorité avant de figer le positionnement.** `Qlower` est proche grand public (269€/an, location nue) mais flou sur la génération case-par-case.

→ **Créneau peu couvert, défendable, PAS désert.**

---

## 2. Segment MEUBLÉ / LMNP (liasse 2031) — SATURÉ ⛔ (ne pas attaquer en frontal)

**8-12 acteurs établis**, feature-parité totale. Le triptyque **liasse 2031/2033 + amortissement par composants + télétransmission EDI-TDFC** est une **commodité**, plus un différenciant.

| Acteur | Modèle | Prix/an |
|---|---|---|
| **JD2M** (leader) | logiciel / + EC | 99-299€ / 629€ |
| **Decla.fr** | logiciel | 219-249€ |
| **Nopillo** | logiciel + experts | ~316-599€ |
| **Amarris Immo** | logiciel / + EC dédié | 154-226€ net |
| **Indy** | logiciel | ~345€ |
| **LMNP.AI** | logiciel / + EC | 179-249€ |
| **Ownily, Qlower** | logiciel | 269-299€ |
| **Vague low-cost** (Limpee, declarer-ma-location-meublee) | logiciel | **114-159€** |

La concurrence se joue déjà **au prix** (plancher ~114€), sur l'**EC validant/signant** et l'**assurance contrôle fiscal**. Barrière d'entrée structurante : **l'agrément partenaire EDI-TDFC DGFiP** (art. 1649 quater B quater CGI) — sans lui, dépendance à un tiers EDI à 80-150€/an.

→ **Entrer ici en frontal = arriver derrière, plus cher, avec une barrière technique. Aucun intérêt en tant que générateur de liasse 2031 de plus.**

---

## 3. Segment SCI (2072 IR + 2065 IS) — bien couvert, prix bas ⚠️

**2072 (SCI IR) = commodité** : quasiment tous la génèrent et télétransmettent ; plusieurs gèrent la quote-part associés → report 2044 (Indy, Ownily, SCI AI).
**2065 (SCI IS)** plus discriminant mais **bien servi** : Ownily (325€/an autonome), SCI AI, ComptaSCI (licence <100€) en libre-service ; Dougs / Amarris / L-Expert-Comptable en **EC dédié humain** (29€/mois → 500-2000€/an).

Planchers de prix déjà très bas : **Indy 24€/mois HT**, **SCI AI 229€/an**, **ComptaSCI licence unique <100€**, **Ownily 199-325€/an**.

→ **Pas de trou béant ni sur la fonction ni sur le prix.** Angles non saturés (mineurs) : (1) chaîne complète associé (quote-part → 2044 auto, peu mise en avant) ; (2) intégration à une gestion patrimoniale existante ; (3) IS autonome un peu moins encombré que l'IR.

---

## 4. Synthèse stratégique — où est l'atout réel

| Segment | Densité concurrentielle | Verdict ImmoTrack |
|---|---|---|
| **Foncier nu / 2044** | **Faible** (récap partout, 1 frontal petit) | ✅ **Terrain principal** |
| **Meublé / LMNP** | **Saturé / commoditisé** | ⛔ Pas en frontal |
| **SCI IR / IS** | Dense, prix bas | ⚠️ Pas un générateur de plus |

**Les 3 piliers de différenciation défendables** (aucun n'est « couvrir un régime de plus ») :

1. **Le 2044 nu du bailleur particulier EN DIRECT, fait vraiment bien** — pré-rempli case par case, juste sur les subtilités (déficit 10 700€, intérêts isolés 250, travaux déductibles vs construction non déductible). C'est l'angle mort de Indy/Ownily/VILOGI (qui visent SCI) et le point de douleur que l'admin laisse béant.
2. **La traçabilité ligne-à-pièce** — justifier **chaque case 211→250 par l'opération/la facture source**. **Aucun concurrent ne revendique cet audit-trail.** C'est à la fois un argument de vente ET la **couche de protection anti-redressement** (cf `schema-multi-regimes.html`) : l'utilisateur voit, comprend, valide → responsabilité de son côté.
3. **La transversalité patrimoniale** — UN bailleur qui mélange **nu + meublé** dans **une seule app**, là où les spécialistes ne font qu'un segment. C'est le **seul** angle où toucher plusieurs régimes a du sens — non pas pour battre les pure-players sur leur liasse, mais pour être **le hub** du bailleur multi-biens.

**Ce que ça implique pour la stratégie multi-régimes (révision) :**
- Ne PAS investir dans des moteurs BIC/IS complets pour **concurrencer** des marchés saturés → effort énorme, gain faible, barrière EDI, **risque de responsabilité** (on jouerait au comptable sur des liasses qu'eux signent).
- Le meublé/SCI dans ImmoTrack = **honnêteté par phase** : tracer les mouvements, **signaler** « relève du BIC/IS, déclaration séparée — voici le récap à donner à ton comptable / à ton outil spécialisé », éventuellement **exporter**. Pas générer la liasse.
- → Ça **converge** avec la couche de protection juridique : on ne se positionne en autorité que là où on est irréprochable (2044 nu), et on **flague** le reste au lieu de le mal-déclarer.

---

## 5. Réserves & limites (à lever avant toute affirmation publique)

- Tout repose sur **pages produit/marketing, non testées**. La granularité réelle (CERFA généré vs « montant à reporter », gestion ligne 250 / déficit) est **non confirmée** pour Qalimo, Qlower, Ownily, Indy, Déclaration-Foncier.fr.
- **Action n°1** : tester en réel **Déclaration-Foncier.fr** (seul frontal) + l'« aide à la déclaration » incluse de **Qalimo** → confirmer/infirmer qu'ils génèrent vraiment le 2044 case par case.
- Acteurs non confirmés / écartés : Litchi, Qonto (hors scope liasse), Lodgy, declaration.fr, ClicImpôts, AppDeclaration (aucune trace de génération 2044).
- Re-vérifier à chaque **loi de finances** (les régimes bougent).

> Sources clés : impots.gouv.fr/formulaire/2044 · corrigetonimpot.fr · rentila.com · qalimo.fr · smovin.app · gererseul.com · nopillo.com · jedeclaremonmeuble.com · decla.fr · amarris-immo.fr · indy.fr · lmnp.ai · ownily.fr · dougs.fr · sci-ai.app · comptasci.com · declaration-foncier.fr · qlower.com · vilogi.com. Audit réalisé 2026-06-11.
