# Brief de session — Marketing Propryo · Recrutement bêta (kickoff)

> **À quoi sert ce fichier** : c'est le « prompt de démarrage » de la session marketing. Toute session (humain ou agent) le lit et devient opérationnelle sans contexte externe. Mis à jour au fil de l'eau.
> **Statut** : design validé 2026-06-25 (voie vidéo **B** + **3 personas**). Prêt pour Phase 0.

---

## 0. Mission

Produire les **moyens visuels** pour **recruter les premiers bêta-testeurs** de **Propryo** (app de gestion locative + moteur fiscal 2044) : une **vidéo démo** d'abord, puis landing de recrutement, visuels social, pitch deck, tutos.

Cible : **bailleurs particuliers en location nue** (cœur), + primo-bailleurs (funnel) + patrimoniaux (ambition).

---

## 1. Le produit en une phrase

> **Propryo** réunit toute la gestion locative d'un bailleur (biens, baux, quittances, états des lieux, loyers, finances) **et** génère sa **déclaration 2044 pré-remplie case par case**, chaque montant étant **justifié par sa pièce source**.

### Le différenciant (verrouillé par l'audit concurrence — `docs/strategie/AUDIT-CONCURRENCE-FISCAL.md`)

Ne PAS vendre « tous les régimes » (meublé/LMNP **saturé**, SCI **couvert**). Le créneau défendable, **peu servi**, sur lequel TOUT le marketing s'appuie :

1. **La 2044 du bailleur nu particulier EN DIRECT, faite vraiment bien** — l'administration laisse le formulaire **vierge**, à saisir case par case. Propryo le pré-remplit (cases 211 / 221-230 / 250 / 450), juste sur les subtilités (déficit 10 700 €, intérêts isolés ligne 250, travaux déductibles vs non).
2. **La traçabilité ligne-à-pièce** — chaque case justifiée par l'opération/la facture source. **Aucun concurrent ne le revendique.** Argument de vente ET couche anti-redressement.
3. **La transversalité patrimoniale** — un bailleur nu+meublé multi-biens dans une seule app (le « hub »).

**Le moment "waw" de toute démo** : cliquer une case du CERFA → drill → la facture source s'affiche.

---

## 2. Marque (non négociable — `docs/charte-graphique-propryo.md`)

- **Nom public : Propryo.** (Le rename dans l'app est différé au chantier E1 ; côté marketing, on est 100 % Propryo dès maintenant.)
- **Corail = accent UNIQUEMENT** (`#ff5a3c` clair / `#ff6a4a` sombre) : CTA, liens, focus, point du logo, **1 chiffre clé** par écran. **Jamais** de fond/carte corail. Base = neutres.
- **Typo** : Schibsted Grotesk (display 800, titres + gros chiffres) + Inter (texte courant).
- **2 modes** : Clair (défaut vitrine) + Sombre bien contrasté.
- **Logo** : pavé encre + **point corail**, wordmark « Propryo » en Schibsted Grotesk.

---

## 3. Personas fictifs (3 — tous fictifs, RGPD-safe, cohérents fiscalement)

Mappés sur les 3 segments stratégiques. **Camille = persona phare** (celle qu'on filme).

### 👩 Camille Mercier — 41 ans · bailleuse nue multi-biens *(PHARE)*
- **Situation** : cadre, 3 lots en **location nue** au **réel foncier** (T3 hérité, T2 acheté, studio étudiant).
- **Douleur** : chaque printemps, la 2044 = angoisse. Factures éparpillées, recopie depuis Excel, peur du redressement, cases 211/221/250/450 à la main.
- **Déclic Propryo** : import relevés → loyers & charges classés → **2044 pré-remplie**, chaque montant cliquable jusqu'à la facture. *« 3 heures d'angoisse → 10 minutes. »*
- **Incarne** : le différenciant n°1 + n°2.

### 👫 Marc & Léa Dubois — 33 & 31 ans · primo-bailleurs *(FUNNEL)*
- **Situation** : jeune couple, viennent d'acheter un T2 mis en **location nue**. Premier bail, premier locataire.
- **Douleur** : ne savent pas par où commencer — bail conforme ? quittances ? révision IRL ? c'est quoi la 2044 ?
- **Déclic** : onboarding guidé, bail généré + quittances auto + alerte révision. *« On gère comme des pros sans être des pros. »*
- **Incarne** : simplicité d'entrée, élargit le haut du funnel.

### 👨‍👩‍👧‍👦 SCI Berger Patrimoine — couple + 2 enfants · patrimonial mixte *(AMBITION)*
- **Situation** : SCI à l'IR, 6 lots mixtes (4 nus + 2 meublés), patrimoine qui grossit.
- **Douleur** : tout est éclaté (meublé chez un spécialiste, nu sur Excel, SCI chez le comptable), aucune vue d'ensemble.
- **Déclic** : le **hub** — tout au même endroit, récap par régime, **2044 nu généré** + *« voici le récap à donner à ton comptable »* pour meublé/SCI, **partage** avec l'associé/conjoint.
- **Incarne** : la transversalité (différenciant n°3) + le partage SCI.

> Identités de scène (locataires, adresses, montants) : **toutes inventées**, jamais de vraie personne. Voir le dataset démo (§4).

---

## 4. Dataset démo (la fondation — tout en découle)

Un **jeu de données fictif soigné** chargé dans la **vraie app reskinée Propryo**, déployée sur github.io.

- **Contenu** : biens, baux, locataires, loyers encaissés, EDL avec photos, charges **taguées par case 2044** → pour que la 2044 se remplisse réellement et que le drill ligne→pièce fonctionne.
- **Isolation stricte** (règles gravées) :
  - ❌ **Rien à voir** avec le `_loadDemoDataset` prod ni l'auto-injection (interdite — `feedback_no_demo_autoinject`).
  - ❌ **Jamais** mélangé aux vraies données (clé de stockage isolée, build de démo séparé).
  - ✅ 100 % fictif, RGPD-safe (pas de vraie personne/adresse).
- **Double usage** : on le **filme** (captures pour la vidéo) **et** il devient le lien **« essaie la démo en vrai »** sur la landing.
- **Audit obligatoire** : cohérence fiscale du dataset (les cases 2044 doivent tomber juste) auditée par l'agent `code-reviewer` avant publication.

---

## 5. Vidéo héros — voie B (walkthrough animé auto-joué) · ~75 s

Page HTML déployée qui **se joue seule** (l'UI s'anime, sous-titres + voix-off), construite à partir des **vraies captures** de la démo déployée (donc authentique, mais art-dirigée et rejouable). On la screen-record une fois → MP4. Le déploiement réel sert en plus de **lien démo live**.

### Script (structure)
| Temps | Écran | Voix-off |
|---|---|---|
| 0–8 s | Paperasse + Excel + 2044 **vierge** | « Locataires, quittances, charges… et chaque printemps, la 2044. Vierge. Case par case. À la main. » |
| 8–18 s | Logo Propryo (point corail) | « Et si tout était déjà là ? » |
| 18–45 s | Parcours Camille : import → loyers classés → charges taguées → tableau de bord | « Tes loyers, tes charges, classés tout seuls. » |
| 45–60 s | **LE moment waw** : le CERFA 2044 se remplit case par case → clic case 221 → la facture source apparaît | « Ta 2044. Pré-remplie. Et chaque chiffre, justifié par sa facture. » |
| 60–75 s | CTA bêta, fond neutre + corail | « Propryo. Ta gestion locative, et ta fiscalité enfin tranquille. Rejoins la bêta → propryo.fr » |

**Garde-fous vidéo** : mockup-first (storyboard validé avant prod), couleur = sens (vert/rouge = signe, corail = accent), tester en vrai navigateur déployé (pas la preview Claude).

---

## 6. Autres livrables (après la vidéo)

- **Landing recrutement bêta** : message §1 + captures + **lien démo live** + formulaire inscription. Réutilise le reskin Propryo (skill `frontend-design`).
- **Visuels social / og-image** : skill `canvas-design`. Une accroche = un visuel par persona.
- **Pitch deck** (si besoin investisseur/partenaire plus tard) : skill `pptx`, structure problème→solution→différenciant→marché→produit→traction.
- **Tutos** : courts walkthroughs par tâche (générer un bail, faire sa 2044), même technique que la vidéo héros.

---

## 7. Agents & qui fait quoi

| Agent / skill | Rôle |
|---|---|
| `Explore` / `general-purpose` | Cartographier le **vrai parcours** de l'app (import → 2044, écrans réels) pour ancrer script + captures (ne pas réinventer — `feedback_ground_in_real_app`). |
| `frontend-design` (skill) | Landing bêta + walkthrough animé. |
| `canvas-design` / `pptx` (skills) | Visuels social, og-image, pitch deck. |
| `code-reviewer` (agent) | Audit dataset démo (cohérence 2044) + landing avant publication (`feedback_audits_par_agents`). |
| `Workflow` (option) | Fan-out : personas + dataset + script en parallèle. |

---

## 8. Séquencement

- **Phase 0 — Fondations** : carto parcours réel · 3 fiches personas · dataset démo · mini-charte marketing.
- **Phase 1 — Vidéo démo** *(1er livrable)* : script ~75 s · storyboard · walkthrough animé déployé.
- **Phase 2 — Landing bêta** : page + formulaire + visuels + lien démo live.
- **Phase 3 — Pitch deck + tutos.**

---

## 9. Garde-fous (règles gravées applicables)

- **Déployer, pas de localhost** : l'utilisateur n'accède qu'aux **URLs déployées** (`feedback_test_navigateur_deploiement`).
- **Vraie app, pas de proxy bricolé** : montrer le re-skin réel ou un mockup propre fait main (`feedback_real_app_preview_deploy`).
- **Mockup-first** : tout visuel d'abord en mockup (× formats × états post-clic) validé avant prod (`feedback_mockup_first`).
- **Charte = non négociable** : corail accent only, Schibsted/Inter, 2 modes (`feedback_design_consistency`).
- **Dataset démo isolé** + jamais d'auto-injection (`feedback_no_demo_autoinject`).
- **Audits par agent** sur tout livrable sensible (`feedback_audits_par_agents`).
- **Repo** : ce clone est stale ; livrer via worktree depuis `origin/main`, ne pas pousser main local (`project_repo_clone_stale`).
- **RGPD/fictif** : aucune vraie personne, adresse ou donnée réelle dans les supports.

---

## 10. État & prochaine action

- ✅ Brief validé (voie B + 3 personas).
- ✅ **Phase 0 — carto parcours réel** (voir Annexe A).
- ✅ **Fondations data + message livrées** (décision 2026-06-25 : on fait le contenu indépendant du design, on diffère les visuels finaux jusqu'au reskin) :
  - `personas.md` — 3 fiches fictives (Camille phare / Marc & Léa / SCI Berger).
  - `positionnement-message.md` — playbook messages, accroches, objections, ton.
  - `script-video-narration.md` — narration ~75 s (texte ; storyboard visuel différé).
  - `dataset-demo.md` — dataset fictif **fiscalement vérifié dans l'app réelle** (Camille complète → résultat foncier **14 940 €**, 0 mvt non mappé ; Marc & Léa + SCI Berger esquissés ; exclusion meublé démontrée).
- ✅ **Reskin Propryo LIVE en prod** (`origin/main` = Propryo v15.377, corail + Schibsted) → visuels débloqués (mon « pas reskiné » venait du clone stale).
- ✅ **Build démo vérifié + audité PASSANT** : worktree `Immo-demo-marketing`, seed `demo/propryo-demo-seed.js` (clé isolée `_test_immotrack_v4`), 2044 = 14 940 € confirmée in-app, audit `code-reviewer` PASSANT.
- ✅ **Storyboard héros** : `storyboard-video-camille.html` — 6 plans (douleur→bascule→gestion→2044 waw→« encore plus » + lien→CTA).
- ✅ **Walkthrough héros animé (voie B)** : `walkthrough-video-camille.html` — auto-joué ~68 s, count-up 14 940 €, drill ligne 224, panorama « encore plus ».
- ✅ **VIDÉO MP4 PRODUITE** : `docs/marketing/propryo-demo-camille.mp4` (~68 s, muette, sous-titres incrustés) + `.webm`. Rendue via **Playwright headless + ffmpeg-static** (script `C:/tmp/propryo-video/record.mjs`) → re-render ~1 min.
- ✅ **VERSION NARRÉE** : `propryo-demo-camille-vo.mp4` (~71 s, **voix neurale FR Denise** via `msedge-tts`, durées de plans auto-calées sur la voix, audio vérifié pic −4,8 dB ; script `C:/tmp/propryo-video/narrate.mjs`). Voix synthétique = version de travail ; voix réelle = mux ultérieur (pipeline prêt, donne un enregistrement → je remplace).
- ✅ **TOUR APP RÉEL** (la VRAIE app pilotée + filmée, demande user 2026-06-25) : `docs/marketing/propryo-tour-app.mp4` (~1 min, **mode clair** charte, bandeau MODE TEST masqué). Parcours : Accueil → Biens → **Candidats** (3 dossiers scorés) → Locataires → **Finances 2025** (cash-flow +12 720 €) → **IRL** (alerte révision +2,9 % → page) → **Régul 2025**. Pipeline `C:/tmp/propryo-video/tour.mjs` (Playwright pilote l'app servie en HTTP depuis le worktree, mode `?sandbox=1`). Dataset enrichi (candidats + DPE C/D/C + indices IRL 2026 injectés au runtime), **2044 intacte 14 940 €** (re-vérifiée). ⏳ RESTE : beat **import acte de vente** (headline « import facile » — nécessite un PDF d'acte fictif à fabriquer + piloter le wizard `openActeImport`) ; puis **voix-off** (Denise, même pipeline `narrate`).
- ✅ **FILM TOUR « VENDEUR » (narré Denise)** : `docs/marketing/propryo-tour-film.mp4` (~89 s). Récit bénéfice-par-plan (planches `planches-tour-app.html` validées ; **angle différenciant vs empilement type Qalimo** : fil rouge « moins de corvées » + **moat fiscal foregroundé**). Vrais écrans (candidats/finances/IRL/régul) en **zoom cinéma + accroche corail + sous-titres** ; plans concept (accroche/promesse/import acte/2044/CTA) ; **voix Denise fr-FR** (« Propryo »→« Proprio » à l'oral). Pipeline `C:/tmp/propryo-video/film-tour.mjs` (TTS → durées calées → record HTTP → mux). ⏳ Polish : durée (89→~70 s), accroches qui recouvrent parfois la donnée, beat import acte en vrai wizard (PDF fictif). Note veille Qalimo : `docs/strategie/AUDIT-CONCURRENCE-FISCAL.md`.
- ✅ **DÉMO AUTONOME 1-FICHIER** : `docs/marketing/Propryo-Demo.html` (7 Mo) — l'app COMPLÈTE + dataset Camille dans un seul HTML, s'ouvre en **double-clic** (file://), aucun serveur/login. Construite par `C:/tmp/propryo-video/build-single.mjs` (bundle esbuild main.js+supabase-entry, inline css+10 scripts, 3 gardes sandbox forcés, seed injecté en tête). **Vérifiée bout-en-bout** (Playwright file:// : boot Camille, candidats/finances/IRL OK, 0 erreur JS). Chaque ouverture ré-injecte Camille frais (les modifs de démo se réinitialisent au rechargement = re-présentable à l'infini). ⚠️ piège corrigé : `String.replace` + `$'` dans le code inliné (remplacements par fonction). À reconstruire après chaque évolution de l'app/du seed (relancer build-single.mjs).
- 🎬 **Structure validée** : héros (reconstruction) + **tour app réel** + capsule Finances ; EDL/IRL/Bail via la slide « encore plus » + future page fonctionnalités.
- ➡️ **Prochaines actions** : (1) storyboard + animation **capsule Finances** ; (2) déployer (au feu vert) pour le lien démo live + screen-record propre ; (3) enrichir le dataset (EDL/IRL) si capsules ultérieures.

---

## Annexe A — Ancrage app réel (carto Phase 0, 2026-06-25)

Le marketing s'ancre sur ces points réels (ne rien réinventer) :

- **Pages** : `go(page)` + ids `#p-...`. Parcours démo = `#p-accueil` (KPI hero + donut impayés) → `#p-loyers` / import → 2044.
- **Import bancaire** : modale `#ov-bank-import` (`js/core/bank-import.js`) — parse OFX/CSV → preview → mapping **catégorie** (`_bankImportSetCat`) + **qui** (`_bankImportSetQui`) + **règles auto** (`applyImportRules`). Catégories standard déjà mappées aux cases 2044 (ex. « Loyers encaissés » → 211, « Travaux… » → 224).
- **2044 (le "waw")** : `Paramètres → 📋 Aide déclaration 2044` → `openLegal2044()` → moteur `window._compute2044(mouvements, STD_CATEGORIES, opts)` (`js/core/legal-2044.js`). Sort `lignes{211,213,221…250}`, totaux, `resultatFoncier`, et `mvtsByLigne` (détail). **Drill** : clic sur une ligne → modale `#ov-dash-drill` → table des mouvements avec leur **facture** (`m.fac`). ✅ Différenciant n°2 (traçabilité) déjà fonctionnel.
- **Dashboard/Accueil** : `rAccueil()` → KPI hero (Reçu mois / Occupation / Net YTD), donut impayés (`_DD['accueil-impayes']`), sparklines occupation/rendement/dépôts.
- **Baux/Quittances/EDL** : `#p-baux` (wizard + PDF natif `pdf-bail-native.js` + signature OTP relay), `#p-quittances` (`rQuit()`), `#p-edl` (photos Drive/Supabase + highlight diff).
- **Dataset démo** : `_loadDemoDataset()` (gardé par `_isTestMode`) écrit dans la clé **isolée** `_test_immotrack_v4` (vraies données = `immotrack_v4`). ⇒ socle d'isolation à réutiliser ; l'actuel est pauvre (1 SCI / 4 logements / 12 mvts) → à enrichir pour les 3 personas.

### ⚠️ Dépendance reskin (impact planning)

`index.html` **n'est pas encore reskiné Propryo** (3 thèmes ImmoTrack, accent bleu/teal, pas de corail ni Schibsted Grotesk, titre « ImmoTrack »). Le reskin est planifié (`docs/superpowers/plans/2026-06-24-reskin-propryo.md`) mais **pas commencé**.

- **Vidéo héros (voie B)** : NON bloquée — on **reconstruit les écrans clés en HTML aux couleurs charte Propryo** (les vraies captures servent de référence de fidélité). 100 % on-brand sans attendre le reskin.
- **Lien « démo live » (Phase 2)** : a besoin, lui, de l'app reskinée déployée. **Décision repoussée à Phase 2** : (a) attendre la livraison du chantier reskin, ou (b) déployer un build démo reskiné dédié.
