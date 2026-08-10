# ImmoTrack — Backlog & Pilotage

> **Hub central de pilotage du projet.** Tu n'as PAS besoin de l'ouvrir manuellement.
> Au démarrage de chaque session Claude, je lis ce fichier et je te montre la TodoWrite à jour.
>
> **Workflow** :
> - Tu notes tes remarques dans le chat → je les classe ici + commit
> - Tu dis "où en est-on" → je relis ce fichier et rafraîchis la TodoWrite
> - Tu dis "on attaque [SUJET]" → je te donne le prompt de démarrage de la session sujet
>
> **Légende** :
> - **Priorité** : P0 critique · P1 forte · P2 moyenne · P3 faible
> - **Taille** : XS (<1h) · S (1-3h) · M (3-8h) · L (1-3j) · XL (>3j)
> - **Statut** : ⬜ À faire · ⏳ En attente · 🔄 En cours · ✅ Livré · 🚫 Abandonné

---

## 🚨 P0 PANNE ACTIVE — Projet Supabase EN PAUSE (2026-08-08) → app inutilisable partout

> **[P0-SUPABASE-PAUSE](docs/subjects/P0-SUPABASE-PAUSE.md)** — ✅ **RESTAURÉ 08/08 soir** (Resume project par le user ; auth vérifiée en direct ; login PC re-testé OK ; la panne datait d'AVANT l'EDL du matin → expliquait la « page de connexion »). Reste : re-test iPhone · décision prévention (keep-alive gratuit reco immédiate, puis Pro à la bêta).
>
> **[BUG-PARTAGE-EDL-ESPACE-TIERS](docs/subjects/BUG-PARTAGE-EDL-ESPACE-TIERS.md) (P1 / S-M)** — **✅ ROOT CAUSE + FIX CONSTRUIT 10/08** (session chantier, worktree `Immo-wt-partage-edl`, branche `fix/partage-edl-espace-tiers` sur v15.495). **Le diagnostic 08/08 était faux : l'EDL n'était PAS intact — il est SOFT-DELETED depuis le 18/07 09:16 UTC** (la « maj 18/07 » = la suppression ; Marion ne le voyait pas non plus ; le client masquait CORRECTEMENT). Cause : `saveEDL` reconstruit l'objet (`DB.edl[i]=record`) → **tag `_espaceId` perdu** → le diff D1 pousse un softDelete chez Marion (octroi gestionnaire = autorisé) + upsert routé espace propre skippé = destruction silencieuse (classe : tout éditeur qui REMPLACE l'objet — saveEnt, DB.baux[ref]=…). Fix **D1b « réadoption du tag »** dans `store-sync.js` (1 seul point, DRY, inerte mono, D2 préservé, ambiguïté sans devinette). Preuves : repro E2E vrai Postgres `repro-partage-edl-tiers.test.mjs` 7/7 (rouge sans fix) + 10 tests offline + suite 2191/2191. Récup : un-delete EDL (réversible). Reste : suite RLS complète → audit code-reviewer → QUEUE (maître intègre + bump) → **E2E réel Didier↔Marion** (⚠️ avant déploiement : ne pas ré-enregistrer l'EDL depuis le compte Didier).

---

## 🚨 P0 ABSOLU — AUDIT SYNC CLOUD 2026-07-12 (5 agents, code déployé v15.457 + forensique DB)

> **Rapport complet : [AUDIT-SYNC-CLOUD-2026-07-12](docs/subjects/AUDIT-SYNC-CLOUD-2026-07-12.md).** Déclencheur : fuite post-révocation (Marion voit Zito/Fric), créations PC Marion jamais montées, « Delle b » qui ressuscite, popup IRL faux, 0 confiance. **Tous les symptômes élucidés** — 3 causes systémiques : boucle sync push-only sans résolution ni isolation d'erreur · échecs 100 % invisibles (`#imsb-sync` n'existe plus) · cache client jamais purgé (miroir localStorage = fuite RGPD post-révocation).
>
> | Sujet | Prio | Taille | Statut |
> |---|---|---|---|
> | P0.1 Marion + architecture SCI | P0 | S | ✅ **CLOS 14/07, architecture INVERSÉE (décision user)** : Marion = bêta-testeuse, **la SCI SMARTOSAURUS vit dans SON espace** (`2e5c49db`) et elle partagera à Didier. Réimport FAIT (8 lignes : SCI + immeuble « 1 rue de la Première Armée » + 6 lots FERRETTE, export archivé `_import/marion-miroir-2026-07-14.json`). Bail Baysang à re-saisir CHEZ ELLE (données récupérées : 495+30 €, DG 495, 18/07/2026→17/07/2032 — **aucun tombstone chez elle → pas de bug B-REBAIL, deadline 18/07 tenable**). **Option C** : la copie SMARTOSAURUS de Didier = ARCHIVE FIGÉE (historique baux/quittances/2044) — suppression DIFFÉRÉE sur décision explicite user post-déclaration ; migration historique (option A) = session dédiée si souhaitée. ✅ CORRECTIF 14/07 : l'acceptation (étape 4) EST livrée (`?invite=` → `acceptInviteFlow`, supabase-entry.js:417-560, exercée par Marion en juin) → **Marion peut inviter Didier dès maintenant**. Chantier « PARTAGE SCI SOLIDE » ✅ **LIVRÉ + STAGÉ 15/07** (branche `feat/partage-sci-solide`, worktree `Immo-wt-partage-sci`, **EN FILE QUEUE.md**) : **D1 fusion multi-espaces** (`store-sync.js` : clé de diff `espTag='@@'+_espaceId` symétrique → 2 SCI SMARTOSAURUS homonymes ne s'écrasent plus ; audit code-reviewer **SÛR**) · **D3 écriture membre scopé** (`store-mapping.js` pose parent_id + **migration 0042** `entite_of_document` résout assurance/mrh/equipement/quittance/candidat via logement + 'bail' ; **APPLIQUÉE au DB**) · **D2 config scopée** (**migration 0043** RPC `espace_config_scoped` filtre irlHistorique/assurances/compteursReleves par refs accessibles + SELECT durcie is_full_member + adapter fetchConfig→RPC ; **APPLIQUÉE au DB**). Gates : **offline 2041/2041 + RLS vrai Postgres 86/86** (p1-partage-sci étendu D2+D3) + adapter 13/13. Rebasé sur `origin/main` v15.481 (coexiste avec rebail). ✅ **audits code-reviewer COMPLETS** : D1 SÛR · D3 SÛR · D2 réserve HAUTE LEVÉE (l'audit a trouvé equipements/emailsSent(PII)/regulValidations qui fuitaient aussi → filtre config élargi à TOUTES les clés per-SCI, `cb63f59`). ✅ **INTÉGRÉ PROD v15.483** (`da6e382` sur `origin/main`, fast-forward, migrations 0042/0043 appliquées au DB) — offline 2082/2082 · RLS 342/342. **Déploiement sûr** : D1 inerte pour les users mono-espace (pas de tag), D2/D3 identiques pour les owners (RPC=blob intégral) → aucun changement de comportement pour Didier/Marion dans leurs espaces ; n'active la logique scopée que pour un membre partagé (0 aujourd'hui). Follow-on hors gate : store-multi ne fusionne pas encore le sous-blob config filtré des espaces TIERS. **RESTE : E2E réel** (Marion invite→Didier accepte→voit SA SCI sans collision→attache assurance→elle la voit) |
> | P0.2 Session PC Didier : console F12 (401 vs throw) + hard-refresh v15.457 ; modifs du 12/07 JAMAIS montées au cloud | P0 | XS | ✅ **CAUSE TROUVÉE + FIX APPLIQUÉ** : console = `documents_parent_type_check` 23514 (attestation assurance `mrh`/`assurance` refusée par CHECK 0026 limitée à 5 types) → **migration 0040 écrite + auditée PASS + APPLIQUÉE au DB prod + poussée origin/main `6b8deb3`**. Reste : Didier fait une modif → vérifier console (plus d'erreur flush) + suppressions qui partent. ⚠️ console montre aussi `[RESYNC-LOC]` : le bail zombie « Delle b » recrée le logement localement à chaque boot → supprimer le BAIL zombie d'abord (ou P0.3). + relay 401 candidatures (sujet séparé, noté) |
> | P0.3 Nettoyage cloud : 6 lignes « Delle b » + 29 doublons agenda (app fermée, audit code-reviewer) | P0 | S | 🔄 **« Delle b » ÉRADIQUÉ 12/07 soir** : logement tombstoné PAR L'APP (20:52, preuve sync réparée) + bail zombie & 4 agenda tombstonés en base (script `_import/cleanup-delleb.mjs`, audit code-reviewer PASS, transaction, 0 ligne vivante restante, restaurable backup 13:08). **29 doublons agenda tombstonés 13/07** (`_import/cleanup-agenda-dups.mjs`, audit code-reviewer FAIL→fix CTE FOR UPDATE + garde bigint→Number, transaction, pré-checks : 0 titre null + GARDE=legacy ms max 29/29 ; état final **157 vivants** = prédiction forensique, restaurable backup 20:14). ✅ Reste seulement : rattacher/purger fichiers Storage orphelins du matin (mineur) |
> | P0.4 Loyer Fric : 660,14 € dû depuis 15/06 appliqué puis écrasé 09/07 (+5,09 €/mois perdus) + régul | P0 | XS | 🔄 **CAUSE RACINE TROUVÉE + REPRODUITE 14/07** par [AUDIT-SUIVI-LOYERS-2026-07-14](docs/subjects/AUDIT-SUIVI-LOYERS-2026-07-14.md) : `applyIRL` tardif enregistre `dateRevision = anniversaire PASSÉ` → dû des mois écoulés recalculé au loyer révisé alors que Fric a payé ses quittances. ✅ **CORRIGÉ chantier AUDIT-SUIVI-LOYERS ét.1-4 (v15.489) + correctif quittance v15.493 (`424f396`, 16/07)** : au smoke test, Fric affichait +50€ avance (P&L) ET −1870€ retard (Suivi) — cause = mes quittances FAUSSES (mars=600 vs loyer réel 655,05) que ma décision B3 « dû=quittance » propageait. **Fix v15.493 : la QUITTANCE sort du calcul du dû → 2 sources = bail (dû) + import (payé)** (feedback gravé). Faux 50€ éliminés. Audit code-reviewer SÛR (fiscal 2044 re-confirmé intouché), 2168/2168. ⚠️ reste réel (PAS bugs) : Fric paie 650 pour loyer 655,05 = 5€/mois sous ; jan/fév sans paiement enregistré. Smoke user en cours |
> | **AUDIT-SUIVI-LOYERS** — audit complet dû/retard/IRL/charges (session dédiée 14/07) : 4 P0 REPRODUITS harness Node modules prod (C1 IRL rétroactive=Fric · C2 avance→retard+avance fantômes simultanés · C3 bouton 🗑 efface l'historique IRL → tout le passé au loyer courant · C4 re-bail sans clôture → `archiverBail` sans `finEffective` → dû DOUBLÉ) + 8 P1 (3 bornages différents Finances/Suivi/fiche · quittance figée-puis-recalculée ≠ dû · charges sans historique rétroactives · filtre `.logement` mort 3 sites · tacite reconduction dû=0 · tolérance <10 sur 2 surfaces/5…) + audit code-reviewer 16 constats. **Livrable écrit : [AUDIT-SUIVI-LOYERS-2026-07-14](docs/subjects/AUDIT-SUIVI-LOYERS-2026-07-14.md)** (modèle du loyer dans le temps + données cassées + PARTIE B propositions : barème de loyer historisé + résolveur unique `duMois()` + dû=quittance figée + décision légale Q1 mois anniversaire). ⏳ **ATTEND validation user des propositions (partie B) — RIEN n'est codé**. Mockup-first : **3 variantes « Historique du loyer » livrées 14/07** (`mockups/historique-loyer/` : A frise+table · B timeline · C périodes+preuve dû=quittance ; 3 formats × clair/sombre × modale correction ; serveur `mockup-historique-loyer` port 8809 ; vérifiées navigateur 0 erreur console). **Variante B « Timeline » RETENUE + Q1 DÉCIDÉE (user 14/07)** : chaque révision IRL porte une **date d'effet EXPLICITE stockée et modifiable** (pré-remplie : validée à temps → 1er du mois de l'anniversaire ; en retard → 1er du mois suivant la validation ; jamais rétroactive, jamais avant un mois quittancé). **Chantier prêt à lancer en session dédiée : prompt `PROMPT-CHANTIER-BAREME-LOYER.md`** (4 étapes : moteur duMois TDD → barème+writers → migration+écran B → quittance figée). **✅ CHANTIER COMPLET — 4/4 ÉTAPES LIVRÉES + DÉPLOYÉES origin/main.** ét.1 v15.482 (`825d638`) moteur pur `duMois()` TDD 42 tests · ét.2 v15.486 (`7628195`) `DB.loyerBareme[]` alimenté par tous les writers + date d'effet Q1 + fixes C4/C10/C11/C13 · ét.3 v15.488 (`6d045c1`) migration de l'existant + écran « Historique du loyer » Timeline B · **ét.4 (DERNIÈRE) v15.489 (`3211750`, 16/07)** : quittance FIGÉE (`_buildQuittanceHtml` source via `_duMoisLot` → re-print après IRL n'affiche plus le nouveau taux) + **rebranchement des 5 surfaces sur `duMois()`** (résolveur unique `_duMoisLot`, les 2 résolveurs `_getActiveBailHcChProrated(Split)` y délèguent → P&L/Suivi/Accueil/pilotage/prog-drill lisent le barème + quittances figées) + netting C2 (`_computeLoyerArrears`→`_computeLoyerNetting`). **FISCAL intouché** (`_compute2044` reste Σ211 brut, audit adversarial SÛR). Chaque étape auditée code-reviewer SÛR, gates 2160/2160. ⚠️ **RESTE : smoke test user au déploiement** — (a) faux retard Fric disparu · (b) re-print quittance mars = montant émis · (c) **contrôle chiffré Σ dû ancien≈nouveau sur données réelles** (mineur audit n°3 : là où le barème a un trou, repli sur HC courant surévaluerait un mois passé — la migration ét.3 devrait avoir bouché les trous, à confirmer). Mineurs différés : quittance mi-mois figée au plein (création non reproratisée) ; filtrage `loyerBareme` dans `espace_config_scoped` avant partage SCI.

**ÉTAPE 2/4 LIVRÉE 16/07 v15.486** (`7628195` origin/main) : `DB.loyerBareme[]` alimenté par TOUS les writers + date d'effet Q1 + fixes C4/C10/C11/C13. Noyau pur `js/core/loyer-bareme.js` (27 tests TDD : `computeDateEffetIRL` Q1 jamais rétroactif/jamais avant mois quittancé + `synchroniserPeriodeBail`/`appliquerNouvellePeriode`/`cloturerBareme`/tombstones). Collection top-level append-only transite par le blob `espace_config` (0 table relationnelle). Writers : saveBail (création→période initiale, édition→maj période ouverte) · applyIRL + batch (période 'irl' datée + fix désync log.hc≠baux.hc) · archiverBail C4 (finEffective=veille du nouveau bail→fin du dû doublé) · saveBailClore/terminerBail (clôture). **Q1 non-rétroactif via NOUVEAU champ `irlHistorique.dateEffet`** lu par `_loyerHCAtDate` (module+inline) ; `dateRevision` reste l'anniversaire (clé de cycle IRL inchangée→0 régression). Migration **0044** : `loyerBareme` ajouté à l'allowlist `espace_config_scoped` (⚠️ **à appliquer au DB avant activation partage SCI** — pas de credentials en session). Audit code-reviewer **2 tours** : bug **B1 (IRL composée, mon erreur v1) CORRIGÉ + vérifié SÛR** (approche dateEffet isolée) + M1/M3. Suite **2122/2122**, inline 5/0, **smoke navigateur http OK** (0 erreur, duMois non-rétroactif vérifié en direct : Fric→1er juillet). **Surfaces PAS encore rebranchées (étape 4)→aucun impact visible sur le P&L/Suivi actuels.**

**ÉTAPE 3/4 LIVRÉE 16/07 v15.488** (`6d045c1` origin/main) : migration de l'existant + écran « Historique du loyer » (variante B Timeline validée). `js/core/loyer-migration.js` `reconstruireBaremeLot` (19 tests TDD) reconstruit `DB.loyerBareme` depuis baux+baux_historique+irlHistorique — période initiale=ancienHC de la 1re IRL, IRL legacy re-datées Q1 (DRY `computeDateEffetIRL`), baux archivés figés+tronqués C4, incohérences surfacées (irl-redatee/bail-tronque/desync-hc/irl-sans-date/irl-hors-bail). **Migration INERTE : NE MUTE aucun enregistrement existant** (barème = nouvelle collection non lue par les surfaces avant étape 4) ; `_migrerLoyerBareme()` au boot, idempotent (flag `_loyerBaremeMigreV1`), préserve les périodes source:manuel. **Écran** (tokens design system, bouton fiche logement→overlay `ov-histo-loyer`) : now-band + bandeau migration (incohérences RECALCULÉES à la volée, pures→0 nouvel état synchronisé) + timeline verticale (périodes+événements bail/IRL/renonciation/correction) + modale « Corriger une période » (motif obligatoire, garde-fou mois quittancé, période source:manuel). Audit code-reviewer **SÛR 0 bloquant** (M1 timezone compteur quittances + M2 double-échappement + M3 échappement ref + N2 IRL-hors-bail corrigés ; M4 3 tests ajoutés). Suite **2152/2152**, inline 5/0, page chargée 0 erreur console. ⚠️ **Test visuel navigateur INTERACTIF bloqué par infra (classifier indispo) → à valider sur le déploiement** (fiche logement → panneau compta → « 🕒 Historique du loyer »).

**Reste : étape 4 (quittance figée + rebranchement des 5 surfaces sur `duMois()` → LÀ Fric et les faux retards disparaissent partout ; décision étape 4 : `duMois` lit l'occupation depuis le barème ou depuis les baux ?).** Note file:// : révision future validée en file:// → trou barème (mineur, comblé par re-migration). | P0 | XL | 🔄 étapes 1-3/4 livrées (v15.482, v15.486, v15.488), étape 4 à suivre |

**🔄 SUITE 17/07 — HISTORIQUE-BAIL-ONGLET — ✅ DÉPLOYÉ 10/08 v15.496 (origin/main 2d0cd32, reste smoke user)** : l'écran « Historique du loyer » de l'ét.3 (overlay `ov-histo-loyer` ouvert depuis la fiche logement, v15.488) a été livré **au mauvais endroit sans validation user** (le mockup B validait le CONTENU, pas le point d'entrée). Décisions user 17/07 : ① la timeline vit **dans l'onglet Bail de la fiche logement, en visu INLINE** (pas de popup de consultation) ; ② c'est l'**historique de L'ENSEMBLE des évolutions du bail** (loyer, charges, dépôt de garantie, révisions IRL, travaux, fins de bail), tous baux confondus — le tableau « 📈 Historique des révisions IRL » (`irlHistSection`) **DÉGAGE** et le panneau « 💰 Dépôt de garantie » (`dgSection`) **DÉGAGE** : le DG devient des **ÉVÉNEMENTS de la timeline** (versé / restitué avec retenues), pas un bloc à part ; ③ **ACCORDÉON PAR BAIL** (« au bout de 20 ans on va avoir une chronologie imbuvable ») : bail courant déplié, chaque bail clos = une ligne repliée dépliable — rien n'est perdu à la clôture (`baux_historique` verrouillé + barème append-only rattaché au LOGEMENT) ; ④ **toute modification des termes financiers du bail (loyer, charges, DG) passe par une POPUP DE VALIDATION** avant application : ancien → nouveau, **date d'effet** pré-remplie (1er du mois suivant, jamais rétroactive sur un mois quittancé), **motif obligatoire** (travaux / provisions / accord locataire / correction / autre+texte libre) → l'événement alimente la timeline + le barème (fini le `saveBail` qui écrase silencieusement). Cas d'usage moteur : modif loyer après travaux. ⑤ **CORRECTION D'ÉVÉNEMENT depuis la timeline** (constat user 17/07 : « j'ai annulé et refait un IRL, la date est figée ») — aujourd'hui `applyIRL` calcule la date d'effet et l'affiche dans un simple `confirm()` (index.html:25160), pas éditable, et le reset+re-apply re-clampe → le « modifiable » de Q1 n'était livré qu'à moitié. Décision : la date d'effet devient un **champ éditable dans la popup de validation** (pré-remplie par la règle, garde-fou mois quittancé conservé) + chaque événement de la timeline porte « **✏️ Corriger** » → popup de correction (re-dater/re-monter, motif obligatoire, append-only : l'événement d'origine reste visible, correction tracée, barème recalculé depuis la nouvelle date). Mockup livré 17/07 : `mockups/historique-bail-onglet/index.html` (clair/sombre × PC/tablette/téléphone, accordéons interactifs, popup validation « ✏️ Modifier le bail » + popup correction « ✏️ Corriger » sur les événements, langage visuel variante B). ✅ vérifié navigateur http://localhost:8806 : 0 erreur console, accordéons repliés par défaut, 3 liens Corriger, script OK (capture d'écran preview HS = infra). ⑥ **CADRE LÉGAL majoration après travaux (recherche 17/07, sources officielles)** — en cours de bail : **art. 17-1 II loi 89-462 du 6/07/1989** = uniquement par **clause expresse du bail OU avenant signé des deux parties** (jamais unilatéral), travaux d'**AMÉLIORATION** seulement (valeur ajoutée : équipement nouveau/qualité supérieure, réduction dépenses, sécurisation — PAS l'entretien/réparations/décence qui sont l'obligation du bailleur), montant fixé librement d'un commun accord, applicable **après achèvement des travaux**, jamais rétroactif ; la majoration ainsi convenue n'est pas attaquable en diminution. **INTERDIT si DPE F/G** (art. 17-1 III, loi Climat — baux conclus/renouvelés dès 24/08/2022 métropole, 01/07/2024 outre-mer). Au RENOUVELLEMENT en zone tendue (levier distinct, art. 17-2 + décret annuel) : hausse possible si travaux ≥ dernière année de loyer, plafonnée 15 % du coût TTC. **Justificatifs que l'app doit exiger/conserver** : avenant signé 2 parties (ou clause) + factures (nature, montant, date d'achèvement) + garde DPE≠F/G. Mockup complété : popup validation motif travaux exige les justificatifs (chips fichiers + rappels légaux + garde DPE) et l'événement timeline ouvre l'**aperçu du document** (modale avenant `ovlDoc` — constat user « je ne peux pas voir le document »). ⑦ **AVENANT → PARCOURS SIGNATURE UNIFIÉ (décision user 17/07)** : l'avenant est un contrat → il passe par le **fil rouge signature existant du bail** (porte « ✍️ Signer » → matrice de présence → présentiel chacun son tour / à distance par relais `bail-sign-relay`), **RÉUTILISÉ, pas recopié** (DRY — généraliser le moteur à un type de document `bail|avenant` avec verrou/hash à la signature). Conséquence légale câblée au moteur : **la majoration n'entre au barème qu'une fois l'avenant signé des DEUX parties** (art. 17-1 II = accord) — d'ici là l'événement timeline reste « ⏳ en attente de signature » et le dû ne bouge pas ; à la signature l'événement passe 🔒 et la nouvelle période s'arme à la date d'effet (≥ achèvement travaux). ⚠️ Prérequis : smoke test compte frais du correctif SIGNATURE-DISTANCE-FIX v15.484 (P0.8) AVANT d'étendre la signature à distance aux avenants. Mockup mis à jour (popup : « avenant généré → à signer » + effet suspendu à la signature ; aperçu doc : badge 🔒 signé 2 parties présentiel ; événement : meta avenant signé). **CHANTIER CONSTRUIT 08/08 (GO user « tu codes toi-même »)** — worktree `Desktop\Immo-wt-histo-bail`, branche `feat/historique-bail-onglet` sur origin/main v15.494, 9 commits rebasés sur origin/main 43f4705 (SC1), **v15.496** (collision v15.495 avec SC1 résolue, panneau pièces obligatoires conservé au-dessus de l'historique) : ①②③ timeline inline onglet Bail en accordéons par bail (module pur `js/core/bail-historique.js`, 18 tests — chapitres/rail, DG = événements avec statut `_dgStatut` + CTA restitution préservés à iso-fonctionnalité, chapitre clos DG urgent auto-déplié) ; overlay `ov-histo-loyer` + `irlHistSection` + `dgSection` + liste historique + timeline horizontale SUPPRIMÉS (CSS mort purgé) ; bandeau en vigueur + « Prochaine évolution » dans la fiche bail. ④ popup validation modif financière (`ov-bail-valid`) : hc/ch → **nouvelle période DATÉE du barème** (source manuel, note=motif, fini la maj silencieuse), dg → trace **`DB.bailEvents`** (nouvelle collection append-only, transite blob espace_config comme le barème) ; module `js/core/bail-modif.js` 14 tests. ⑤ date d'effet IRL **éditable** (modale `ov-irl-valid` remplace le confirm) + « ✏️ Corriger la date d'effet » sur les événements IRL du bail courant (`redaterRevisionIRL` : re-bornage périodes, anti-chevauchement, cohérence pendingApply/log.hc, trace). **Audits code-reviewer ×2** : B1 (double période ouverte → `borneMinEffetBareme` + garde fin explicite) + M1 (pending consommé en tête de saveBail) + M2 (refus re-datage sans période) + clôture ciblée `cloturerPeriodeParDebut` (le chemin fin explicite corrompait la période vivante — bug pré-existant fixé) + mineurs 1/2/3/6 corrigés. Gates : **2202/2202**, inline-js 5/0, CRLF intact, vérifié navigateur vrai clic (accordéons, modales pré-remplies, clamps, 0 erreur console). **DÉPLOYÉ 10/08 (GO user) : origin/main 2d0cd32, github.io v15.496.** Audit CLOS (garde R1 posée → SÛR selon l'auditeur). **RESTE smoke user** (compte réel : onglet Bail Ferrette/Fric, modif charges → popup, correction date IRL). **NON INCLUS (phase 2, après smoke P0.8 SIGNATURE-DISTANCE-FIX)** : ⑥⑦ génération avenant + pièces jointes consultables depuis les événements + routage signature unifiée bail|avenant — le motif travaux de la popup rappelle le cadre légal (art. 17-1 II) en attendant. Note partage SCI : `bailEvents` suivra le même traitement de filtrage scopé que `loyerBareme` (RPC 0043) — à vérifier au chantier partage.
> | P0.5 MOMPER 124 € | P0 | XS | 🔄 **DOUBLON PROUVÉ 14/07 sans relevé** : les 2 lignes du 04/05 portent la MÊME référence bancaire unique `10278-20-26125660112431` (2 imports pré-empreintes, 05+14 mai) ; mars/avril/juin uniques ; aucune quittance liée → interchangeables. **Reste : user supprime L'UNE des 2 dans l'app** (Loyers & mouvements → F-002 → 04/05) — la sync propage. +124 € de recettes en trop sur mai tant que non fait |
> | P0.6 Sauvegardes cloud horodatées | P0 | XS | ✅ **Livré 12/07** — tâche Windows `Propryo-Backup-Cloud` (quotidien 03:30, `node _import/backup-cloud.mjs`, 10 min max, StartWhenAvailable) ; run de test validé (BACKUP `…T20-14-53`, 672 l.) ; 2 backups en réserve |
> | P0.7 `sealSigned: true` (verrou légal baux signés DÉSACTIVÉ en prod !) | P0 | XS | ✅ **DÉCIDÉ + LIVRÉ 15/07 (Option A)** — user a choisi `sealSigned:true`. Fait dans SIGNATURE-DISTANCE-FIX §5 (`js/app/supabase-boot.js` L109+125) : le chokepoint `sealSignedBaux` calcule `contentHashTerms` AVANT le snapshot → `content_hash` non-null → satisfait le CHECK `baux_immotrack_hash_chk` (fin du poison 23514). ⚠️ **VERROU LÉGAL GLOBAL désormais ON** (tout bail signé devient immuable au cloud). Audit code-reviewer : flip SÛR (trigger 0014 checke OLD.locked, skip `prev.locked` → pas de re-push d'un locked). **🔀 INTÉGRÉ PROD v15.484 (`9f5cb26` origin/main)** |
> | **P0.8 BAIL-SIGNE-EXPIRE** — bail FERRETTE 001 (espace Marion) signé à distance par la locataire (14/07 18:44) mais badge « ⚠️ Session expirée » : `_emitRemoteSignSession` (index.html:7035) stocke `relayUrl = params.bailSignRelayUrl` (VIDE pour tout compte sans URL saisie en Réglages = tous les nouveaux comptes) alors que la CRÉATION utilise le défaut `_relayCfg().base` → poll en URL RELATIVE sur github.io → 404 → `'expired'` synthétique TERMINAL (plus jamais re-pollé). La relance user a créé une session orpheline 35228 + écrasé l'ownerToken de la session signée 0834 (qui n'a survécu en KV QUE parce que relayUrl vide a fait sauter la purge l.7417 — sinon PDF signé détruit). Repro 100 % compte frais. Rapport : [AUDIT-BAIL-SIGNE-SESSION-EXPIREE-2026-07-15](docs/subjects/AUDIT-BAIL-SIGNE-SESSION-EXPIREE-2026-07-15.md) | P0 | M | ✅ **RÉCUPÉRATION FAITE 15/07** : PDF signé + dossier de preuve extraits du KV relais (sha256 vérifié = proof), sauvegardés `_recovery-bail-signe/` (gitignoré) ; ré-ingestion serveur `recover-ingest.mjs` **auditée 2× code-reviewer** (v1 DANGEREUX → 2 critiques corrigées : legacy_raw non écrit / content_hash=termes pas sha PDF → v2 **SÛR**, hash termes contre-calculé indépendamment) : row **v11 locked**, mode distance, remoteSession 0834 completed, PDF archivé Storage, session orpheline 35228 supprimée du relais (204). ⚠️ **Reste** : ① smoke test user — recharger l'app (PC+tél+appareils Marion), vérifier « 🔒 Signé à distance » + 📄 PDF sur FERRETTE 001, cliquer « 📜 Régénérer le certificat » et l'archiver ; ② supprimer la session KV 0834 après confirmation (auto-TTL 28/07 sinon) ; ③ **chantier correctif ✅ INTÉGRÉ PROD 15/07 — v15.484 (`9f5cb26` origin/main, fast-forward)** (§1 relayUrl=`_relayCfg().base` · §2 `_resolveRelayBase` auto-guérison tous sites · §3 404≠expiré → `'unreachable'` non terminal + TTL 14j + badge orange mockup validé · §4 « Relancer » async non destructeur poll-avant-DELETE + récup si completed · §5 `sealSigned:true` + durcissement mapping · §7 doublon PDF masqué). Gates unit 2083/2083 + check-inline-js 5/0 + verif-popup OK + sw.js OK. **Audit `code-reviewer` SAFE (0 Critique/0 Important**, 6 points légaux vérifiés). Rebasé `origin/main` v15.483 `da6e382` 0 conflit. **Reste : intégration maître + smoke test compte frais** (`didierkeller+test0`) : envoi → badge « En attente » stable → signer → ingestion + poussée cloud (§5). **Aucune nouvelle signature à distance en PROD avant intégration+smoke.** |
> | **P1.1+P1.2 SYNC HONNÊTE + FLUSH BLINDÉ** : pastille topbar réelle `#imsb-sync` (✓/⟳/⚠ + hors-ligne + clic=retry) · `onAuthChange` enfin branché → bannière « Se reconnecter » (fini les 401 avalés) · isolation d'erreur PAR ENREGISTREMENT dans `_doFlush` (`summary.errors`, un poison n'avorte plus removes+config) · removes = flush IMMÉDIAT (bypass debounce, hors baux verrouillés) · retry backoff 2s→60s (conflits exclus à dessein) · `_backupRestoreRun` compte les erreurs isolées · logout ne mange plus le résumé | P1 | L | ✅ **CONSTRUIT + AUDITÉ 13/07** — branche `feat/sync-p1-honnete` (worktree `Immo-wt-sync-p1`), **v15.459**, commits `8bc9514` + polish `598f1f4`. TDD **37/37** + **scénario « 2 appareils » contre le VRAI Postgres** (`supabase/tests/flush-poison.test.mjs` 4/4 : rejeu du poison 23514 du 12/07 → suppression + config SURVIVENT dans le même flush, appareil B les voit). Audit code-reviewer **PASS avec réserves** (0 critique, 0 important ; M1/M3/M6 corrigés dans `598f1f4` ; M2/M4 consignés ligne suivante). 🔀 **INTÉGRÉ v15.460** (`a6caa28` sur origin/main 13/07, cherry-picks 0 conflit, renum 459→460, gates RE-vérifiés : 1884/1884 + flush-poison 4/4 vrai Postgres, **CI verte**) → ⚠️ reste smoke test prod user (pastille ⟳/✓ · remove immédiat · Hors ligne→reprise · pas de fausse bannière session) |
> | **P1.7 DÉFAUTS ESPACE FRAIS** : espace cloud vierge (blob = params seuls, prouvé espace Marion `2e5c49db`) sans `categories`/`templates.bail`/`irlTable`/`piecesEDL`/`catConfig` → TypeError / pages vides (Mouvements, Réglages catégories, IRL, éditeur bail) pour TOUT nouvel inscrit | P1 | S | ✅ **CONSTRUIT + AUDITÉ 13/07** — branche `feat/defauts-espace-frais` (worktree `Immo-wt-defauts-frais`), **v15.460**, commit `c6fbc77`. `_applyDataDefaults()` (pattern v15.452, extraction 1:1 vérifiée au diff) appelée par `initDB()` ET `__immoSetDB()` avant `_applyParamDefaults` ; espace NON vide = clés manquantes seulement ; défauts avant le seed sync → 0 diff parasite ; 0 dataset démo. TDD **18/18** + suite 1888 verts (3 échecs PRÉ-EXISTANTS origin/main : legal-2044 ×2 + bank-import ×1 — tests qui parsent index.html cassés par un reformatage amont, tâche séparée proposée) + vérif navigateur réel (`__immoSetDB` blob params-seuls → défauts posés, initFilters/rParamsCats/rIRL OK). Audit code-reviewer **PASSANT 0 bloquant** ; consigné : **I1** au prochain bump `BAIL_TMPL_VERSION` un template custom cloud serait écrasé au flush suivant → prévoir sauvegarde `templates.bailCustom` (P2) ; **I2** les MIGRATIONS initDB (soft-add STD, _CAT_MIGRATION…) ne tournent JAMAIS côté cloud → toute future catégorie standard n'atteindra pas les espaces pur-cloud existants (gap pré-existant, chantier « migrations cloud » à créer en P2). 🔀 **INTÉGRÉ v15.461** (`079b59d` sur origin/main 13/07, cherry-pick 0 conflit, renum 460→461, suite 1902/1902, **CI verte**) → ⚠️ reste smoke test user (créer un espace frais, ouvrir Mouvements/Réglages catégories/IRL/éditeur bail) |
> | **P1.3 CONFLIT→RE-HYDRATE + RÉCEPTEUR REALTIME + PURGE CACHE RGPD** (dernier bloc P1 : items 2/3/6 + réserves M2/M4 de v15.460) : conflit → re-hydratation complète auto (serveur gagne) + re-render page courante + bannière « revérifie ta modif » (contrat store-supabase.js:7,161 enfin honoré) · M2 (remove en conflit ≠ flush immédiat à chaque save) · M4 (broadcast émis dès qu'une écriture réelle aboutit, `summaryHasCloudWrites`) · récepteur `changed` rebranché → re-pull coalescé (différé si modale ouverte) + re-pull `visibilitychange:visible` >5 min (tue la vue figée du téléphone) · purge RGPD : tag miroir {userId,espaceId}, purge login (≠same)/logout (toujours), IDB photos seulement si other-user prouvé ou 0 binaire idb-only (préserve preuves légales), miroir re-basé sur la vue RLS au login, initDB ne lit PLUS le miroir pré-login (fini popup IRL Zito/Fric d'un espace révoqué), jobs boot data-dépendants différés post-hydratation (`_bootDataJobs`), gardes saveDB/beforeunload/storage pré-login, `__immoSetDB` ferme les modales, rattrapage Storage `_drvUploadPendingAttachments` (code mort) rebranché | P1 | L-XL | ✅ **CONSTRUIT + AUDITÉ 13/07** — branche `feat/sync-p1-rehydrate` (worktree `Immo-wt-sync-p13`), **v15.462**, commits `6827d8d` + polish audit `515b9b6` (base 079b59d). TDD **15 nouveaux tests** (M2×3+M4 + `cache-purge.test.js` ×11), suite **1917/1917**, check-inline-js 5/0. Audit code-reviewer **PASS avec réserves** (0 critique ; I-1 course re-pull/saisie locale + I-2 bannière conflit avalée → **corrigés** ; M-c/M-e/M-f consignés spec §5bis). Spec `docs/superpowers/specs/2026-07-13-sync-p13-rehydrate-realtime-purge-design.md`. 🔀 **INTÉGRÉ v15.463** (`56c2d5a` sur origin/main 13/07, cherry-picks 0 conflit sur hotfix `a062d41`, renum 462→463, suite 1917/1917 + parité vérifiée sur blobs bruts, **CI verte**). ⚠️ **Déployé AVANT P0.1 sur décision user — Marion prévenue de ne pas ouvrir l'app avant l'export de son miroir (sinon créations perdues)** · ⚠️ smoke test 2 appareils : modif A→B se rafraîchit sans reco · conflit→bannière+convergence · logout→miroir purgé · index-test.html non mirroré (figé pré-v15.314, diff inerte en sandbox) |
> | P2 Sync robuste (~6-9 sem) : pull incrémental + version sur espace_config (fin LWW, fuite scopé [AUDIT] 5-7) + journal d'écritures IndexedDB + auditTrail cloud + docs→Storage (20/35 idb-only !) + kill-switch révocation | P1 | XL | ⬜ prérequis commercialisation |
>
> **⚖️ Seuil commercialisation (avis audit)** : P1 complet + P2.1-3 ≈ 8-10 semaines. P1 seul = passable = non (règle gravée).
>
> **🔴 Découverts au smoke test user 13/07 (v15.461)** :
> | Sujet | Prio | Statut |
> |---|---|---|
> | **B-REBAIL-TOMBSTONE** — relouer un logement ne peut JAMAIS syncer le nouveau bail : `id = detUuid('bail', __key)` (store-mapping.js:95) → l'id est occupé À VIE par le tombstone de l'ancien bail (insert `ON CONFLICT DO NOTHING` → conflit éternel, update gardé `deleted_at is null` → conflit). **PROUVÉ** : bail Baysang/Ferrette-001 créé 12/07 jamais monté (id `97dfc78f` = tombstone Misslin 20/06), perdu localement au reload-cloud du 13/07 → « plus aucune donnée ». Bloque le flux métier cœur (relocation). Pistes : id par `__key+debut` (comme baux_historique) + migration, OU chemin « revive » délibéré du tombstone gardé version | **P0 — ⏰ deadline 18/07** (le bail Baysang récupéré doit pouvoir être créé + signé sur le vrai Ferrette-001 avant le début du bail). *Mitigation possible mais NON confirmée user* : le créer dans l'espace neuf de Marion (sans tombstone) contournerait le bug ; le fix reste requis pour toute relocation dans un espace ANCIEN |  ✅ **CONSTRUIT + AUDITÉ 14/07, EN FILE d'intégration `index.html` (QUEUE, P0)** — **Option B (revive délibéré)** retenue (Option A id+debut rejetée : casse le modèle « 1 bail courant/logement » + migration invasive). `writer.reviveTombstone` ré-ouvre le slot TOMBSTONÉ (`SET payload, deleted_at=NULL WHERE deleted_at IS NOT NULL [AND locked=false]`) **sur intention explicite** `allowRevive = !prev` (ajout frais SEULEMENT, jamais une édition → anti-résurrection « Delle b » intacte) + **REFUS ABSOLU si locked** (3 gardes : engine ne soft-delete jamais un locked · `locked=false` · trigger DB `prevent_locked_mutation`). **Générique** : corrige aussi logements/immeubles/entites (pendant cloud de BUG-RECREATE-REF-TOMBSTONE v15.262). `summary.revives` tracé à part (+ `summaryHasCloudWrites` → flush relocation pure broadcaste, redescente OK). Cœur 100 % `js/core/*` ; `index.html` = bump version seul. Branche `fix/rebail-revive-tombstone` (worktree `Immo-wt-rebail`), commits `5e300ad`+`1c5eab2`+`dc84c50`+`b6f6156`+`98a8127`, **v15.478 visée (bump cohérent aux 5 spots)**. Audit `superpowers:code-reviewer` **0 Critique / 0 Important**. Gates : **1993 unit + 23 intégration VRAI Postgres** (Misslin→Baysang v+1 + redescend + anti-résurrection + logement recréé même ref + reviveTombstone refuse locked=true = preuve DB verrou légal), check-inline-js 5/0, `node --check sw.js` OK. Spec `docs/superpowers/specs/2026-07-14-rebail-revive-tombstone-design.md`. 🔀 **INTÉGRÉ v15.480** (`a212c77` origin/main 14/07 soir, renum 478→480, CI verte) → ⚠️ reste smoke test user : recréer le bail Baysang sur le VRAI Ferrette-001 (Tiffany Baysang, 495+30 €, DG 495, 18/07/2026→17/07/2032) → pastille ✓ + visible 2e appareil |
> | **RESTAURATION-CLOUD** — restaurer une sauvegarde en mode cloud se heurte aux gardes de version → « Restauration incomplète » + reload = restauration perdue (comportement honnête v15.460, mais flux inutilisable). Spécifier : re-hydrater d'abord → seed → appliquer la sauvegarde comme modifs par-dessus baseline fraîche (+ décision sur les suppressions) | P1 | ⬜ à spécifier |
> | **RESET-CLOUD UX** — « réinitialiser » local ne vide PAS l'espace cloud → « bouton qui ne sert à rien » (user 13/07). ✅ **CONSTRUIT + AUDITÉ 14/07** — branche `feat/cloud-ux-quickwins` (worktree `Immo-wt-cloud-ux`), **v15.464 (→ renum ≥472 à l'intégration)**, commits `085db39`+`615d84e`, **EN FILE QUEUE.md**. En mode cloud : « 🧹 Vider cet appareil » (= logout+purge miroir, cloud intact) + « ⚠️ Vider mon espace cloud » (owner only, modale 2 étapes saisie du nom exact, **sauvegarde JSON auto avant purge**, RPC gardée serveur `purge_mon_espace` **migration 0041 APPLIQUÉE au DB** — owner actif + nom re-vérifiés SQL, jamais de service key client ; photos IDB conservées). Après purge : re-login → espace recréé vierge + défauts v15.461 (**PROUVÉ E2E navigateur réel**, user jetable). Gates : 13 tests purs + **RLS 10/10 vrai Postgres** (anon/étranger/non-owner/owner-pending/cross-espace/mauvais nom tous refusés) + suite 1930/1930 + audit code-reviewer PASS (importants corrigés). ⚠️ conflit attendu avec `fix/login-double-persist` sur supabase-entry.js (détail QUEUE.md) · ⚠️ smoke test user sur didierkeller+test0 · consigné P2 : orphelins Storage post-purge + edge multi-espace (owner avec accès tiers) | **P1 ⬆ (user)** | 🔀 **INTÉGRÉ v15.475** (`09454f1`, CI verte, couture logout login-double×teardown vérifiée) → ⚠️ smoke test user sur didierkeller+test0 UNIQUEMENT |
> | Compte de test « nouveau client » créé 13/07 (`didierkeller+test0@gmail.com`, user `abdbbc80`, allowlist admin) — parcours from-zero répétable (purge espace test sur demande au maître). Sert aussi de banc P1.7 | — | ✅ |
> | **CFE-GESTION-2044** (déterré par l'audit post-hoc be56dac, PASS sur les tests — problèmes PRÉ-EXISTANTS v15.326) : ① CFE/TLV custom non mappées ont PERDU le comportement `gestionCharge` → **résultat de gestion P&L surévalué** pour un payeur de CFE (skip total dans `_finChargeBuckets` ~48085, drill « charges gestion HF » mort) ; ② l'UI POUSSE au mauvais mapping (bandeau « classe-les avant de déclarer » + wizard étape 2 SANS option « Hors résultat » `__ignore`, qui ÉCRASE silencieusement un `__ignore` posé via Associer) → un user qui obéit corrompt sa 2044. Correctifs recommandés par l'audit : bucket « non ventilé » au P&L (ou équivalent gestionCharge name-based) + option `__ignore` au wizard + garde-fou regex CFE/TLV + 2 mineurs (hygiène `__ignore` truthy dans _legal2044WizardOpts:33107 ; divergence prévisu/wizard mapping) | P1 (fiscal) | ⬜ session dédiée |
> | OFX-ENCODING-1252 — les OFX Crédit Agricole (CHARSET:1252) sont lus en UTF-8 → accents mâchés dans les libellés importés (« PrÃ©lÃ¨vement »). Lire le fichier selon l'en-tête OFX (windows-1252) ou détecter | P2 | ⬜ |
> | **BUG-BANK-SLICE-DESC** — le « ne lit pas tout » du user était un VRAI bug : pointeur de progression positionnel supposant un fichier croissant → sur les exports DÉCROISSANTS (Crédit Agricole) les nouvelles lignes étaient silencieusement jetées (capture user : 12 doublons ≤17/06, juillet invisible). Fix sémantique « plus récentes que le pointeur » + TDD repro exacte + audit PASS | P1 | ✅ **LIVRÉ v15.467** (`4afc7dc`, CI verte) — test user : réimporter le même OFX, les 13 lignes de juillet doivent apparaître. Durcissement futur (R1 mono-date/R2 non-trié/R3 même-date) = filtrage par date + dédup, avec OFX-ENCODING-1252 |
> | iPhone : PWA installée figée (vieille version+session, fix SW v15.457 arrivé après son install) — navigateur Safari OK sur le même tél = serveur sain | — | action user : réinstaller la PWA |
>
> **✅ Smoke test 2 appareils 13/07 soir (v15.463) : « synchro ok entre tablette et téléphone » — P1.3 VALIDÉ en réel.** 2 irritants relevés :
> | Sujet | Prio | Statut |
> |---|---|---|
> | BANDEAU-SAUVEGARDE-CLOUD — `_backupShowProposeBanner` (sauvegarde LOCALE ère Drive) s'affichait en mode cloud + tablette. ✅ **CONSTRUIT 14/07** (même branche `feat/cloud-ux-quickwins` que RESET-CLOUD, **EN FILE QUEUE.md**) — politique cloud-aware : en cloud plus JAMAIS de bandeau « recommandée » (`_backupAutoCheck`, gate APRÈS la branche auto-run silencieuse dossier-accordé qui reste active) ni de rappel hebdo (`_backupReminderCheck`) ; carte manuelle Réglages conservée ; legacy/sandbox inchangés. ⚠️ **INTERACTION SAUVEGARDE-ARBRE** (branche `feat/backup-arbre`, aussi en file) : son nouveau `_backupProposeAfterDoc()` déclenche AUSSI le bandeau et n'est PAS couvert par mon gate (il n'existe pas dans ma base v15.463) → **à l'intégration du 2e des deux : déplacer le gate cloud DANS `_backupShowProposeBanner` (point d'étranglement unique) ou gater `_backupProposeAfterDoc` pareil** | P2 | 🔀 **INTÉGRÉ v15.475 + gate déplacé v15.476** (édit de coordination fait à l'intégration de SAUVEGARDE-ARBRE : gate dans `_backupShowProposeBanner`, couvre `_backupProposeAfterDoc`) |
> | **SAUVEGARDE-ARBRE** (chantier « Sauvegarde v2 », mockup arbre validé) — la sauvegarde de sécurité range les binaires en ARBRE `Bailleur/Immeuble/Appartement/Type` (fini le plat `documents/`+`photos/`) · photos EDL dans `État des lieux/Photos` datées (AAAA-MM-JJ) · bandeau discret post-génération (bail/EDL/import). **Cœur `js/core/backup.js`** (reprend le helper non commité de la session cloudfix, fini+testé) + **3 sites `index.html`** (dossier/zip/restauration, repli rétro-compat) + `_backupProposeAfterDoc` (DRY via stub `suggestSave` + succès upload cloud). Objectifs #1+#2 faits ; #3 (réglages) déjà là ; **#4 chiffrement = ABANDONNÉ 14/07** (décision user : sauvegarde rangée sur PC perso uniquement → session Windows protégée, chiffrement superflu + piège « mdp oublié = perte » ; le cœur crypto `js/core/backup-crypto.js` AES-256-GCM/PBKDF2 + l'outil autonome `dechiffrer-sauvegarde.html`, codés+testés **12/12** avec test de parité, **DORMENT sur branche `feat/backup-chiffrement`** — réactivables tels quels si besoin futur : USB/cloud perso ou exigence RGPD client à la commercialisation). | P1 | 🔨 **CONSTRUIT + AUDITÉ 13/07** (audit `code-reviewer` PASS 0 bloquant, 2 IMPORTANT corrigés + durcissement Windows) — branche `feat/backup-arbre`, **TDD 53/53**, suite 1967/1968 (rouge = fausse alerte EOL working-tree, blobs identiques vérifiés), smoke navigateur OK. **✅ prêt à intégrer** (QUEUE, v15.469→renum ≥471). ⚠️ écriture disque réelle jamais exercée + **LIMITE MAX_PATH Windows** sur noms longs → smoke test déploiement requis. #4 chiffrement = abandonné (voir gauche, réactivable) |
> | **BUG-LOGIN-DOUBLE** — connexion à faire 2× pour atteindre l'Accueil. RÉCURRENT (tablette 13/07, PC 14/07, déjà cherché plusieurs fois) — **« rédhibitoire pour la vente » (user)**. Hypothèse principale : session Supabase EN MÉMOIRE SEULE (`persistSession:false`, choix ère test) + un reload quelconque entre login et Accueil (SW `controllerchange` pendant l'écran de login — garde v15.457 armée seulement post-login —, redirect interne, update en attente) → session perdue → 2ᵉ login. **Fix définitif probable : `persistSession: true`** (standard SaaS — session survit aux reloads/onglets ; l'hygiène RGPD existe depuis P1.3 : purge miroir+IDB au logout/changement de compte, il faut y AJOUTER la purge du token) + armer la garde anti-reload SW dès le boot cloud (pas post-login) + instrumentation (breadcrumb sessionStorage : timestamps login/controllerchange/reload → prouve la cause au 1er incident suivant). Session dédiée avec repro + audit sécurité (stockage token) | **P0 ⬆ (vente)** | ✅ **LIVRÉ v15.473** (`5d2aeb5`→`fd55c31`, CI verte, audit SÛR 0 bloquant, TDD 11 tests) — hypothèse CONFIRMÉE par lecture code : `persistSession:true` + storageKey `immo-supabase-auth` purgé logout/chgt de compte + garde SW `__immoCloudBoot` armée dès le `<head>` + breadcrumb `login-breadcrumb.js` (prouvera tout incident résiduel). ⚠️ **test user : login → F5 → Accueil SANS mdp · logout → token absent de localStorage**. Décision produit (13/07) : Option A statu quo |
> | Idée B — déconnexion auto sur inactivité (X min) pour la cible AGENCES (postes mutualisés) — petit chantier séparé, décidé statu quo Option A le 13/07 (session persistante = standard SaaS, particuliers) | P3 agences | ⬜ plus tard |
>
> **Suites 13/07 (session maître)** :
> - ✅ **CI GitHub reverdie** (`be56dac` sur main) — rouge depuis v15.326 (~1 mois, personne n'avait vu) : 3 tests anti-régression 2044/import cherchaient les anciens noms de catégories (restructuration 31→21). Sémantique fiscale VÉRIFIÉE avant alignement (B1 exclusions tenues ; CFE/TLV = customs, moteur fail-safe `nonMappes`). 1874/1874 verts.
> - ⚠️ Découvert : **`index-test.html` figé pré-v15.314** (catégories un an en arrière) — résidu R2 de la session cascade, régénération sandbox = session dédiée à planifier.
> - ⏳ Nettoyage **29 doublons agenda** : script `_import/cleanup-agenda-dups.mjs` écrit, EN ATTENTE d'audit code-reviewer (quota agents 13h) — ne pas exécuter avant.
> - ⏳ `relay 401` pull candidatures (spam console, non bloquant) — à traiter avec le chantier candidatures.

---

## 🔥 Retours test user 2026-07-02 — triage (15 retours → 12 codes, 9 nouveaux)

> **Campagne de test app réelle du 2026-07-02.** Triés en session pilotage le jour même.
>
> | # | Retour | Code | Prio | Taille | Chantier / session |
> |---|---|---|---|---|---|
> | 1 | Accueil : « logement » ne dirige vers rien | [BUG-ACCUEIL-NAV-LOGEMENT](docs/subjects/BUG-ACCUEIL-NAV-LOGEMENT.md) ✅ **Livré v15.407** (`go('biens')`, seule cible morte de l'app — inventaire complet) | P1 | XS | ⚡ Quick wins |
> | 2 | Dash gestionnaire : parc tronqué >8 apparts + Quittance toujours rouge (point si demandée, sinon –) | [BUG-DASH-GESTIONNAIRE-PARC](docs/subjects/BUG-DASH-GESTIONNAIRE-PARC.md) 🆕 | P1 | S | 🎛 Dashboard cockpit |
> | 3 | **Actions priorisées : refonte complète (PRIO user)** — 5 visibles / 14 en cours + redondance bulles | [DASH-ACTIONS-REFONTE](docs/subjects/DASH-ACTIONS-REFONTE.md) 🆕 | **P1** | M | 🎛 Dashboard cockpit (mockup-first) |
> | 4 | Fil rouge création bailleur → immeuble → logement + import acte de vente | [FLOW-CREATION-BIEN](docs/subjects/FLOW-CREATION-BIEN.md) 🔄 **REPRISE 15/07 — le déployé v15.481 ≠ le mockup validé** (constats user écrans à l'appui). **P0 acte cassé → REVERT `f294971` + bump v15.482 DÉPLOYÉ origin/main (`ea4f1fd`, gates 2031/2031 + inline-js 5/0 + sw OK)** : bouton « 📜 Importer un acte » rétabli (l'écran de choix acte/manuel n'avait jamais été validé — le mockup montre les 2 boutons côte à côte). Décisions user 15/07 : P1 continuité = carte persistante du mockup (suppr. auto-hide 12 s) · P2 garde identité réf/type/surface/loyer bloquante dans le parcours (`saveParamLog` si `_frMode`) · P3 « ✍ Bail » + select filtrés vacants (`_bienActiveBail`) + identité complète · P4 récap centré sur ce qui vient d'être créé (pas les 26 biens). **P1-P4 IMPLÉMENTÉS + VÉRIFIÉS AU VRAI CLIC** (branche `fix/fil-rouge-fidelite`, worktree `Immo-wt-filrouge-fidelite`, `19c78ed`, v15.483). **Audit code-reviewer = RÉSERVES → C1 CRITIQUE (double source loyer : mon nouveau champ faisait doublon avec `logp-loc-hcRef` existant → divergence hc≠loyerHcRef = classe du bug « Fric ») CORRIGÉ par DRY** (`f7407d6` : relocalise le champ EXISTANT en onglet Identité, supprime le doublon) — re-vérifié VRAI CLIC (L-301 hc=640===loyerHcRef=640, P4 récap montre seulement le créé, 0 erreur console). **RE-AUDIT = ✅ SÛR** (C1 résolu) + note grisage DG dédiée. **🔀 INTÉGRÉ PROD v15.487** (`e95972d` sur `origin/main`, go user 16/07 — rebasé sur v15.486, conflits = 5 lignes de version seulement, gates **2133/2133** + sanity navigateur, P0+P1-P4 vérifiés live dans origin/main, CACHE_VER bumpé). **RESTE : smoke test USER en réel** (⚠ cache PWA). Mockup contrat : `mockups/fil-rouge-creation-bien-v2/index.html`. **🔧 SUITE 16/07 — PORTE UNIQUE (retour user : « je veux UN seul bouton, le choix acte/manuel DEDANS » = mockup v1 `fil-rouge-creation-bien`, PAS le v2 à 2 boutons)** : ✅ **DÉPLOYÉ origin/main v15.491 (`7513d38`)** — un seul bouton « + Ajouter un bien » sur la page Biens (quel que soit le sous-onglet) → le fil ouvre l'écran **« Comment on démarre ? »** (2 tuiles : 📄 Importer l'acte [badge « Le plus rapide »] / ✍️ Saisir à la main) → déroule jusqu'au bail. Conducteur : étape `start` ; `_frStartActe()` ouvre le wizard d'import en `_frMode` (annulation relâche `_frMode` via close hook `ov-acte`) ; `openBiensAdd`→`_frStart('bien')` ; 2e bouton acte séparé RETIRÉ. Audit code-reviewer **SÛR** (0 Critique/Important ; mineurs : `openNewImm`/branche non-`_frMode` acte = code mort legacy). Rebasé sur v15.490 (NAV-SOUS-MENUS), renum 489→491. Gates **2170/2170** + inline-js 5/0 + sw OK. **🎯 SUITE 16-17/07 — ÉCRANS PROPRES DU MOCKUP (retour user : « on n'a pas le fil rouge du mockup ! », le fil rouvrait les GROSSES modales existantes au lieu des écrans légers du mockup ; bail = « bulle sans rien »)** : ✅ **DÉPLOYÉ origin/main v15.494 (`b26240e`)** — chaque étape est désormais un **écran PROPRE léger** dans `#ov-fr` (bailleur nom/forme/siren · immeuble adresse/ville/année · logement réf/type/surface/loyer), plus les grosses modales. **Ponts DRY** `_frSubmitEnt/Imm/Log` : remplissent les inputs RÉELS cachés + appellent le vrai `saveEnt/saveImm/saveParamLog` (exécution synchrone → grosse modale jamais peinte) → `_frAfterSave` auto-avance. Garde-fou `_frCloseIfOpen`. `_frOpenStep` : tout via `_frShowFr`. **VÉRIFIÉ AU VRAI CLIC** (instance locale de l'app, `.click()` sur les vrais boutons) : choix→manuel→bailleur(crée entité)→immeuble(crée imm)→logement(crée lot, **loyer hc=508/700 persiste**)→récap centré→**bail fonctionnel (le lot dans le select, plus de bulle vide)** ; aucune grosse modale visible, `_frMode` tenu, 0 erreur console. **Audit code-reviewer = SÛR** (0 critique ; le seul async `addImmForm` focus neutralisé par `display:none` ; mineurs M1-M4 assumés). Rebasé sur v15.493, renum →494, gates 2167/2168 (1=CRLF pré-existant). ⚠️ **RESTE smoke user sur déploiement** (captures navigateur plantent côté outil ; vérif faite via console `.click()` réels). **🧭 SUITE 17/07 — FIL ROUGE COMPLET acte → rapprochement → complétion 100 % → baux (demande user : « un vrai fil rouge » ; mockup livré, ATTEND validation)** : compréhension + audit faits (cartographie v15.494 par agent). Constats d'audit : ① l'acte finit sur un écran « Succès » **cul-de-sac** (`_frAfterActe` saute direct à `done`, aucune complétion) ; ② rapprochement **bailleur existe** (`_acteFindDupEntity` SIREN puis nom + bandeau) mais **rapprochement immeuble INEXISTANT** (« IMMEUBLE — toujours créé », commentaire index.html:41696 ; `AdresseParser`/`LogImmResolver` dans le repo mais jamais branchés) ; ③ pas de modèle de complétude au-delà du binaire louable (`identiteParcours` réf/type/surface/loyer), pas de %, pas de tâches par fiche ; ④ état du fil (`_frCtx`) **non persisté** → fermer l'app = fil perdu, aucune reprise ; ⑤ `_acteApply` écrit DB en direct (rollback propre) sans passer par `saveEnt/saveImm/saveParamLog` (2 voies de création à garder cohérentes). Mockup `mockups/fil-rouge-complet/index.html` (charte Propryo clair/sombre × PC/tablette/mobile) : 8 écrans — porte unique inchangée → vérif acte avec **NOUVEAU bandeau rapprochement immeuble** (adresse normalisée, popup rattacher/créer, miroir du bandeau bailleur, jamais auto) → récap (🔗 rattaché / ✚ créé / 🔑 bail repris) → **TRANSITION** (remplace le Succès : « le fil continue — compléter à 100 % » / plus tard) → **fil de complétion** (variante B validée de `fil-rouge-completion` : timeline bailleur→immeuble→chaque bien, tâches ✓/!/○ + jauges + % global, chaque bouton ouvre l'écran EXISTANT ; loués = « vérifier le bail repris », vacants = « créer le bail » via `openBail` filtré `_bienActiveBail`) → relais bail → **reprise** (bandeau persistant page Biens avec vraie progression) → fini 100 %. Réutilise : wizard acte inchangé, écrans propres v15.494, `ParcoursBienModel` (à étendre : tâches/% par fiche), mockups import-acte validés (regroupement lots, art. 1743, annexes). Vérifié VRAI CLIC navigateur (port 8806) : 8 écrans + 2 popups + progression dynamique 32→36 % + relais bail + thème sombre + mobile, 0 erreur console. **Retour user 17/07 sur mockup v1 (« j'ai dit on reprend ce qui existe ») → mockup v2 corrigé + re-vérifié** : ① écran Vérif = l'écran acte existant COMPLET (logements interprétés ÉDITABLES ✏️🗑➕, toggle 🔑 Loué/Vacant bail repris art. 1743, annexes 3 modes, popup regroupement de lots) — seuls ajouts : bandeau rapprochement immeuble + création EN BAS de l'écran ; ② ex-étape « récap » SUPPRIMÉE (fusionnée : synthèse 1 ligne + « ✓ Tout est bon — créer », on ne re-valide pas 2×) → 7 écrans ; ③ fil de complétion = ACCORDÉON poussé (UN nœud ouvert « tu es ici », fiches terminées repliées en ligne ✓, finir une fiche la replie et ouvre la suivante auto) ; ④ reprise confirmée = pause partout + état persisté + bandeau rouvre au nœud exact. Re-vérifié navigateur (clics `.click()` réels sur les vrais boutons — l'input souris du pane est mort, infra) : porte→vérif (3 cartes éditables, toggle occ, suppr/ajout, 2 popups, synthèse vivante avec pluriel fixé)→créer→transition→fil accordéon (chaque « Compléter → » replie et pousse : SCI→Tilleuls→Lot 5+6→Lot 7)→wizard bail (coche la tâche, pousse)→Lot 8→Parking→**100 %** (6 pastilles ✓, bandeau reprise « Configuration terminée 🎉 », écran Fini)→mobile+sombre OK, 0 erreur console. **✅ Mockup v2 VALIDÉ user 08/08.** **📐 SPEC + PLAN + PROMPT ÉCRITS 08/08 — CHANTIER PRÊT À LANCER en session dédiée** : spec `docs/superpowers/specs/2026-08-08-fil-rouge-complet-acte-design.md` (6 deltas : D1 module pur `acte-rapprochement` match immeuble par adresse canon (TDD) · D2 bandeau+picker INLINE dans la vérif — écart assumé vs mockup : pas de 2ᵉ overlay, règle « un seul overlay » · D3 `_acteApply` rattache les lots à l'immeuble existant choisi (jamais auto, rollback conservé) · D4 fusion récap→vérif (stepper 2 jalons, synthèse+CTA) · D5 `completionModel` (tâches ✓/!/○ + % par fiche, bail repris→« vérifier »+« ✓ Vérifié » explicite, vacant→« créer »/« vacant assumé ») + écran transition + écran complétion ACCORDÉON dans `#ov-fr` (close-hook étendu : fermer une fiche/le bail rouvre la complétion) · D6 persistance `DB.params.frCompletion` (params déjà syncé cloud) + bandeau reprise `rBiens` + purge à 100 %) · plan 9 tasks TDD `docs/superpowers/plans/2026-08-08-fil-rouge-complet-acte.md` (ancré code réel v15.494 lignes greppées, ~19 nouveaux tests purs, vrai-clic à chaque task) · prompt session `PROMPT-CHANTIER-FIL-ROUGE-COMPLET.md` (worktree origin/main, décisions gravées, audit code-reviewer FIDÉLITÉ MOCKUP obligatoire). | P1 | L | 🏠 Chantier Biens |
> | 5 | Onglet Biens : trop de sous-onglets, être sharp « type iPhone » | [NAV-BIENS-SIMPLIFICATION](docs/subjects/NAV-BIENS-SIMPLIFICATION.md) 🆕 | P1 | M | 🏠 Chantier Biens (mockup-first) |
> | 6 | Locataires : icône assistant départ + aperçu bail = PDF légal + popup « … » figé (aussi mal sur Logement) | [BUG-LOCATAIRE-UX-PACK](docs/subjects/BUG-LOCATAIRE-UX-PACK.md) ✅ **Livré v15.407** (menus ⋮ unifiés `_openMenuPopover` fixed-viewport · aperçu bail signé = PDF archivé cloud/legacy · icône porte-de-sortie · audit code-reviewer PASS) | P1 | S | ⚡ Quick wins |
> | 7 | Locataires : classement immeubles incohérent (bloc vide, bailleurs mélangés) | [UX-GROUP-BY-IMMEUBLE](docs/subjects/UX-GROUP-BY-IMMEUBLE.md) note | P1 ⬆ | — | 📐 Intercalaires |
> | 8 | Diagnostics DPE/plomb : pas de rappel si locataire en place (vérifier la loi) | [DIAG-RAPPEL-LOC-EN-PLACE](docs/subjects/DIAG-RAPPEL-LOC-EN-PLACE.md) 🆕 | P2 | S | 🔎 Session dédiée (vérif légale d'abord) |
> | 9 | Équipements : intercalaires immeubles comme IRL | [UX-GROUP-BY-IMMEUBLE](docs/subjects/UX-GROUP-BY-IMMEUBLE.md) note | P1 ⬆ | — | 📐 Intercalaires |
> | 10 | IRL vue tableau : intercalaires | [UX-GROUP-BY-IMMEUBLE](docs/subjects/UX-GROUP-BY-IMMEUBLE.md) note | P1 ⬆ | — | 📐 Intercalaires |
> | 11 | Reçus & quittances : dernière quittance fait foi, historique replié, bulles illisibles → **mockup demandé** | [V3-REFONTE-QUIT](docs/subjects/V3-REFONTE-QUIT.md) P2→P1 | P1 ⬆ | M | 🧾 Session dédiée (mockup-first) |
> | 12 | EDL : sortir de « Comptabilité » + intercalaires immeubles | [NAV-SIDEBAR-CLEANUP](docs/subjects/NAV-SIDEBAR-CLEANUP.md) 🆕 (placement) + UX-GROUP-BY-IMMEUBLE (intercalaires) | P2 | S | 🧭 Nav cleanup / 📐 Intercalaires |
> | 13 | Onglet Pilotage à revoir complètement (**pas prio** — user) | [PILOTAGE-ONGLET-REFONTE](docs/subjects/PILOTAGE-ONGLET-REFONTE.md) 🆕 | P3 | M-L | plus tard |
> | 14 | Import : template Excel multi-onglets à renvois pas intuitif | [IMPORT-EXCEL-LOG](docs/subjects/IMPORT-EXCEL-LOG.md) (doc créée) | P2 | M | avec V3-REFONTE-IMPORTS-UI (19E) |
> | 15 | Paramètres + Export/Sauvegarde : hors sidebar → menu bouton connexion + audit contenu | [NAV-SIDEBAR-CLEANUP](docs/subjects/NAV-SIDEBAR-CLEANUP.md) 🆕 | P2 | S | 🧭 Nav cleanup |
>
> **Regroupement en 6 chantiers** : ⚡ Quick wins (1+6, ~½ journée) · 🎛 Dashboard cockpit (2+3) · 🏠 Biens (4+5) · 📐 Intercalaires (7+9+10+12b — mécanique v15.76 existante à propager) · 🧾 Quittances (11) · 🧭 Nav cleanup (12a+15). + 🔎 Diagnostics (8) et Import (14) au fil de l'eau.
>
> **2e vague (2026-07-02, pendant la session quick wins)** :
>
> | # | Retour | Code | Prio | Statut |
> |---|---|---|---|---|
> | 16 | Bouton retour navigateur partout (tunnels/fiches inclus) — « absolument » | [NAV-HISTORY-BACK](docs/subjects/NAV-HISTORY-BACK.md) ✅ **Livré v15.407** (`#p-{page}` via go() + hashchange étendu + nettoyage état fiches au back + surbrillance sidebar ; restait : F5 restaure la page — mineur audité, itération suivante) | **P1** | ✅ |
> | 17 | IRL renoncée affichée « Appliquée » en vert avec nouveau loyer → état orange « IRL renoncée » | [BUG-IRL-RENONCE-AFFICHAGE](docs/subjects/BUG-IRL-RENONCE-AFFICHAGE.md) ✅ **Livré v15.407** (flag `renonce` computeIRLRevision + carte orange « ⊘ IRL renoncée » loyer inchangé + tableau/drill/masse ; cycle skip→reset→apply validé) | P1 | ✅ |
> | 18 | Loyers & Mouvements : sélection des colonnes bugge parfois | [BUG-MVT-COL-SELECT](docs/subjects/BUG-MVT-COL-SELECT.md) 🆕 | P2 | ⏳ attente repro user |
> | 19 | Logement « Vacant » avec locataire en place 6+ ans (tacite reconduction ?) | [BUG-VACANT-LOCATAIRE-PRESENT](docs/subjects/BUG-VACANT-LOCATAIRE-PRESENT.md) ✅ **Livré v15.407** (`_bienIsBailActif` aligné sur la règle tacite v15.343 + resync boot `log.locataire` depuis bail actif — vérifier F4 après déploiement) | P1 | ✅ |

---

## 🔥 Sprint email UX & cache PWA (insert 2026-05-18, P0 dans le marathon)

> **Découvert pendant test v15.84** : la modale email envoie bien via Gmail API MAIS :
> 1. **PDF non attaché auto** (PJ « à joindre manuellement » dans la modale)
> 2. **UX modale dégueu** (overflow mobile, hiérarchie boutons cassée, pas d'aff. FROM)
> 3. **Service Worker cache les modules JS** sans invalidation → user voit ancien `email-modal.js`
> 4. **Templates non personnalisables** + civilité non reprise du bail
>
> **Décision user 2026-05-18** : « on enregistre tout ça pour un sprint ». Sprint à insérer **avant 19C** car cache SW = bloquant pour livraison de toutes les futures fixes.
>
> | Lot | Sujet | Prio | Taille | Statut |
> |---|---|---|---|---|
> | EM-1 | [BUG-SW-CACHE-JS](docs/subjects/BUG-SW-CACHE-JS.md) — fix cache SW (bumper CACHE_VER + network-first pour JS) | **P0** | XS | ✅ Livré v15.85 |
> | EM-2a | [EMAIL-MODAL-UX-REFONTE](docs/subjects/EMAIL-MODAL-UX-REFONTE.md) — refonte HTML modale variant A (FROM bar + PJ card + note légale repliable + footer 2 rangs mobile) | P1 | M | ✅ Livré v15.86 |
> | EM-2b | [EMAIL-MODAL-UX-REFONTE](docs/subjects/EMAIL-MODAL-UX-REFONTE.md) — PJ PDF auto-générée (quittance + IRL V1.0) | P1 | M | ✅ Livré v15.87 + fix lazy load jsPDF v15.88 |
> | EM-2c | PJ auto types restants (régul + bail + EDL ent/sort + cautionnement) | P2 | M | ✅ Livré v15.89 (5 nouveaux types) |
> | EM-2d | Refonte PJ quittance avec rendu officiel (html2canvas du `_buildQuittanceHtml`) | P1 | M | ✅ Livré v15.91 → étendu IRL v15.111 + décompte v15.113. **Bail signé / EDL ent-sort / Cautionnement** restent en text-natif jsPDF sobre (à embellir V1.x si besoin user) |
> | BUG-QUITTANCE-PRORATA | Quittance entrée/sortie mi-mois marquée "Reçu partiel" alors que paiement prorata correct (loi 89-462) | P1 | XS | ✅ Livré v15.94 + fix robustesse v15.95 |
> | EM-2e | Quittance redesign visuel (3 mockups A/B/C v3 dont C-Qonto) | P1 | S | 🚫 **Abandonné** — user a rejeté toutes variantes Qonto (« tu modifies les documents »). Rendu officiel Times NR restauré v15.102. Mockups conservés dans `mockups/quittance-redesign/` pour historique. |
> | EM-2f | Bug pagination multi-page PJ PDF (overlap massif quittance/IRL/décompte sur 2 pages) | P1 | XS | ✅ Livré v15.110 (algo position page N corrigé) |
> | EM-2g | Embellir PJ bail signé / EDL ent-sort / Cautionnement (passer en HTML + html2canvas si user le souhaite) | P3 | S | ⬜ Reporté V1.x — user 2026-05-19 « on a perdu trop de temps, on fera plus tard ». Text-natif jsPDF acceptable en V1. |
> | BUG-IRL-INVALID-DATE | Corps de mail IRL affichait « Application : à compter du mois de Invalid Date » (rev.dateRevision déjà Date object) | P1 | XS | ✅ Livré v15.112 |
> | EM-5 | [EMAIL-FROM-PAR-ENTITE](docs/subjects/EMAIL-FROM-PAR-ENTITE.md) — envoyer depuis l'adresse de l'entité (send-as Gmail aliases) | P1 | S | ✅ Livré v15.92 + fix popup + auto-CC v15.93 |
> | EM-3 | [DOC-CIVILITE](docs/subjects/DOC-CIVILITE.md) — civilité dynamique dans templates (M./Mme du bail) | P2 | XS | ✅ Livré v15.90 |
> | EM-4 | [TEMPLATES-EMAILS-PARAMS](docs/subjects/TEMPLATES-EMAILS-PARAMS.md) — éditeur templates dans Paramètres | P2 | M-L | ⬜ À faire (post EM-2) |

---

## 🔥 Marathon V1 propre — Sprint 19 + 20 (décision 2026-05-16 : Drive avant partage)

> **12 lots indépendants · 24-35h total · prompts détaillés clé en main** :
> **[docs/strategie/SPRINT-19-20-MARATHON-V1-PROPRE-PROMPTS.md](docs/strategie/SPRINT-19-20-MARATHON-V1-PROPRE-PROMPTS.md)** 👈 fichier maître
>
> **Décision user 2026-05-16** : finir bugs UX visibles (Sprint 19) PUIS fondations Drive solides (Sprint 20) AVANT le partage granulaire V1. Pas de patch vite fait sur fondations bancales.
>
> **Ordre strict** : 19A → 19I (UI bugs) → 20A → 20C (Drive solide) → Sprint 21 PARTAGE-GRANULAIRE V1 (~6-8h, à spec'er ensuite)
>
> | Lot | Sujet | Prio | Taille | Statut |
> |---|---|---|---|---|
> | 19A | BUG-IRL-APERCU-LETTRE-V15 | P1 | S | ✅ Livré v15.74 + v15.75 |
> | 19B | EMAIL-ONGLET-PERMANENT | P1 | S | ✅ Livré v15.79 |
> | 19C | BUG-EQUIP-INTERV-FEEDBACK | P1 | S | ✅ Livré v15.164 |
> | 19D | V3-REFONTE-NAV-ONGLETS (Loyers→Mouvements + décisions) | P1 | M | ⬜ À faire |
> | 19E | V3-REFONTE-IMPORTS-UI (3 sous-tabs) | P1 | M | ⬜ À faire |
> | 19F | IRL-RAPPEL-MAJ-INSEE | P2 | S | ⬜ À faire |
> | 19G | V3-REFONTE-ASSURANCES (cards) | P2 | M | ⬜ À faire |
> | 19H | V3-REFONTE-EDL-CARDS | P2 | M | ⬜ À faire |
> | 19I | V3-REFONTE-PARAMS-AUDIT (input user requis) | P2 | S | ⬜ À faire |

---

## 📑 Vue par onglet (pour travailler onglet par onglet)

> Permet de regrouper tous les sujets d'un même onglet pour les traiter en une session.
> Codes triés par priorité décroissante au sein de chaque onglet.

| Onglet | Codes (prio) |
|---|---|
| 📊 **Dashboard** | DASH-PROFILES ⏳ (P1, Phase 1 v2 livrée — 4 onglets, attente validation finale) · BUG-DASH-001 (P1) · BUG-DASH-SPARK-COLOR ✅ v15.49 (cash-flow vert/rouge par segment) · DASH-KPI-HC (P2) — *DASH-REFONTE-GLOBALE-V4 ✅ Livré sandbox v15.36 (CP1-4, attente validation user pour propagation prod) · DASH-V2 ✅ fusionné dans DASH-REFONTE-GLOBALE-V4* |
| 📜 **Bail** | BAIL-CHARGES-DETAIL (P1) · V3-REFONTE-BAIL 🔄 (P2) · BAIL-CLAUSES-PERSO (P2) · BAIL-TYPES (P2) · BAIL-PARAPHE-PLACEHOLDER (P3) · BAIL-NAMESPACE-MIGRATION (P3) |
| 🏢 **Logement / Équipement** | **BUG-LOCATAIRE-CONCAT ✅ Code fixé v15.115 (P0, corruption nom multi-locataires stoppée — réparation données manuelle à faire user)** · LOG-CANDIDATS ✅ Pipeline candidature livré PROD v15.249 (onglet Candidats + saisie dossier + scoring « Confiance » non-discriminatoire décret 2015-1437 / loi 6 juill. 1989 + conversion candidat→bail sans ressaisie + purge RGPD 30j + sync Drive) — **lien partagé en ligne (relais Cloudflare) reporté à un plan dédié hors périmètre**, design `docs/superpowers/specs/2026-06-02-candidature-locataire-design.md` · **FICHES-PARITE-360 🔥 (P1, ~27h)** · LOG-FICHE-360 🔄 (P1, Phase 2) · BUG-LOG-001 (P2) · BUG-EQUIP-FILTER (P2) · BUG-HC-GARDE-FOU (P2) · V3-REFONTE-EQUIP (P2) · LOG-PHOTOS (P2) · ~~LOG-ANNONCE~~ ✅ Livré v15.207-210 · LOG-DG-LABEL (P3) — *NAV-RESTRUCTURE + LOG-LISTE-CARDS + LOG-ARCHIVE livrés v14.2 ✅ · LOG-FICHE-360 Bloc A livré v14.13 ✅ · BAILLEUR-DIAGNOSTICS-DDT ✅ Livré v15.05+v15.06 (Sprint 7+7B) · EQUIP-CONTROLES-PERIODIQUES ✅ Livré v15.08 (Sprint 9, 6 phases)* |
| 🏛️ **Entité / Immeuble** | PARAM-BAILLEUR-AUTOMATISATIONS (P1) · IMM-FICHE-SOUS-ONGLETS (P2) · BAILLEUR-FORM-RICHE (P2) · ENT-SAVE-IMM (P2) — *BUG-ENT-RENAME-CASCADE livré v14.51 ✅ · BUG-ENT-ORPHANS-CLEANUP livré v14.52-53 ✅* |
| 💰 **Mouvements** | V3-REFONTE-LOYERS (P2) · MVT-SCIND-CAT (P2) · MVT-RECURRENT (P2) · FEAT-VIR-INTERNE (P2) · FEAT-PRET-ECHEANCIER (P2) · MVT-SCIND-LIMIT (P3) |
| 🧾 **Quittances** | V3-REFONTE-QUIT (P2) · QUIT-EMAIL (P2) · AVIS-ECHEANCE (P2) · RAPPEL-IMPAYE (P2) — *EMAIL-AUTO ✅ Livré sandbox v14.97 (3 cas intégrés : quittance + IRL + régul)* |
| ⚡ **Charges / Régul** | BUG-CHARGE-001 (P1) · V3-REFONTE-REGUL (P2) · CHARGE-REGLES (P2) |
| 📈 **IRL** | V3-REFONTE-IRL (P2) — *BUG-IRL-001 + IRL-VALIDATION + IRL-DPE-FG livrés v13.30/31/33 ✅* |
| 📋 **EDL** | EDL-VALIDATION-AVOCAT (P1) · EDL-TEMPLATE-PER-LOG (P2, ~6h) · EDL-DELEGUE-EXPORT (P2) · EDL-DELEGUE-IMPORT (P2) |
| 🛡️ **MRH** | MRH-AUTO-LOC (P2) |
| 🔧 **Travaux / Entretien / PJ** | DOC-PJ (P2) · TRAV-SUIVI (P2) |
| 🤝 **Associés** | ASSO-PARTAGE (P2) |
| ⚙️ **Architecture / V3 / Sécu** | **BUG-DELETE-BRUT-NO-TOMBSTONE (P1, S)** · **ARCHI-IMM-FK-IMMID (P1, L — refonte clé étrangère stable `l.immId` pour remplacer le rattachement-par-nom `l.imm===im.nom` ; supprime la classe « drift » au renommage/suppression d'immeuble [Repro B] ; session dédiée à coordonner avec la migration Supabase relationnelle ; le filet de sécurité d'affichage est déjà livré v15.258 cf. BUG-IMM-TOMBSTONE-DISPLAY)** · **EMAIL-OAUTH-INCREMENTAL (P2, S)** · AUDIT-GLOBAL 🔄 (P1, élargi audit+nettoyage+modularité) · ARCHI-MODULAR (P1, en attente AUDIT) · SECU-INNERHTML (P1) · V3-VISUEL (P2) · BUG-UI-DARK-MODAL (P2) · V3-REFONTE-PARAMS (P2) — *USER-PROFILE-FILTERS ✅ Livré v15.04 (Sprint 6 V1.1) · PILOTAGE-MATRICIEL ✅ Livré v15.07 (Sprint 8) · BANK-INTEGRATION V1 ✅ Livré v15.07 · ARCHI-DB-DOUBLONS Phase 4b ✅ Livré v15.232 · BUG-DELIMM-CASCADE ✅ Livré PROD v15.248 (cascade suppression immeuble + confirmation détaillée dry-run, audité 2× sandbox + 1× port prod)* |
| 💾 **Drive sync** | **DRIVE-CONFIANCE-UX ✅ Résolu v15.114→134 (P0)** : 9 bugs boucle/perte (B v114 · offline-first A0 v116 · timeout v117 · boucle save v118 · boucle pull v120-121 · re-stamp signature v122 · ping-pong onglets v123 · boucle pull→push v124 · spam toast v125 · migration idempotente v127) **+ page de connexion plein écran** (design confiance v129 · polices app v130 · affichée avant dashboard v131 · pas de flash pendant connexion v132 · **boot gate anti-flash accueil v133** · **A5 aide diagnostic VPN/Opera v134**). *Panneau "État Drive" (C) ✅ couvert par l'existant (FAB statut live + Paramètres Stockage Drive + Export restaurer) — non reconstruit. Thème sombre page connexion écarté (choix A).* · DRIVE-ARBORESCENCE 🔄 (P1) · DRIVE-2H (P1) · DRIVE-2F (P1) · DRIVE-2G (P1) · DRIVE-2K ⚠️ englobé (P2) · DRIVE-2I (P2) · DRIVE-2J (P3) |
| 🏛️ **Légal / Fiscal** | LEGAL-2044 (P1) · LEGAL-BILAN-ANNUEL (P1) · LEGAL-2072 (P3) — *LEGAL-DPE-INTERDICTION-LOCATION ✅ Livré v15.05 (Sprint 7) : blocage strict bail si DPE interdit loi Climat 2021* |
| 📥 **Import** | IMPORT-EXCEL-LOG (P2) · IMPORT-CONCURRENTS (P2) |
| 🌐 **Agence / SaaS** | AGENCE-GESTION (P3) · AGENCE-CRG (P3) · AGENCE-HONORAIRES (P3) · SIGN-EIDAS (P3) · PORTAIL-LOC (P3) · SAAS-MULTIUSERS (P3) · **SAAS-PRICING-TIERS (P2, ~3-5h)** — *gating modules par abonnement, build sur l'infra USER-PROFILE-FILTERS livrée v15.04* |
| 🤖 **IA / Pro Connect V2** | **IA-V2 🔮 (V2 post-commercialisation, ~15-25h)** — *opt-in payant Pro Connect ~5€/mois · 5 use cases prioritaires : OCR DPE/diagnostics · OCR factures travaux · OCR justifs candidat · annonce LLM-generated · classification auto Drive · 4 secondaires V2.5 · 5 écartés (conseil fiscal/analyse EDL/prédiction loyer = risque juridique). Pas en V1.1 (zéro coût récurrent)* |
| 📈 **Stratégie / Business** | **REBRAND-NAMING 🔄 (P1 — nom retenu : LODYO ✅ ; reste vérif INPI + achat lodyo.fr/.app + dépôt marque + propagation code/docs/réseaux ~1j)** · FOUNDER-EDITION (P1) · WATCH-LOCATAIRELIVE 🔄 (P2) · OUTILS-SEO-GRATUITS (P2) · IA-COPILOTE (P2) · VEILLE-QALIMO-V2 (P2) · BIZPLAN-V2 🔄 (P2) — *BIZPLAN-STRATEGIE ✅ Livré 2026-04-30 (5 docs `docs/strategie/`)* |
| 📱 **Mobile / PWA / Offline** | BUG-MOBILE-MENU-PLUS ✅ v15.142 (bottom-sheet) · BUG-MOBILE-DASH-PROFILES ✅ v15.140 · **MOBILE-AUDIT-ONGLETS ✅ CLÔTURÉ v15.140-148** (audit 375px : 0 overflow · touch targets ≥40px · affordance scroll · toutes tables denses en cartes : Loyers, Pilotage ×3, Assurances) · MOBILE-PWA-OFFLINE (P2) |

---

## 🎯 Vision produit V1 commerciale (audit 2026-05-07)

> **ImmoTrack = SaaS universel de gestion immobilière** — cible : particulier solo + gestionnaire pro. Tout statut juridique (particulier / SCI / SAS / LMP/LMNP / mandataire Hoguet). Toute pratique comptable (autonome / Excel / logiciel pro / expert-comptable).

### 🚫 Règle UX non négociable — Pas de jargon ni d'acronyme dans l'UI
**Captée 2026-05-14 (Sprint 9, après livraison BAILLEUR-DIAGNOSTICS-DDT v15.05-v15.06)** :
> 💬 « c'est quoi DDT ? si je ne sais pas ça ne sera pas clair dans app non plus. pas mettre de raccourci comme ça »

**Règle** : aucun acronyme métier dans les libellés UI **visibles** au bailleur particulier solo. Le terme complet en français courant doit toujours être utilisé. Acronymes uniquement tolérés :
- Dans le **bail signé / PDF juridique** (où c'est cité par la loi, ex `Dossier de Diagnostic Technique (DDT)` art. 3-3 loi 89-462) — le terme complet + abréviation = pratique standard juridique
- Dans le **code interne** (commentaires JS, codes de sujet `BAILLEUR-DIAGNOSTICS-DDT`)

Liste vivante des termes complets à utiliser dans l'UI :
| À éviter | À utiliser dans l'UI |
|---|---|
| DDT | « Diagnostics » / « Dossier de diagnostic technique » |
| DPE F/G | « DPE classé F ou G » |
| MRH | « Assurance habitation » (locataire) / « PNO » → « Assurance propriétaire non occupant » |
| EDL | « État des lieux » |
| CRG | « Compte rendu de gérance » |
| CREP | « Constat de risque d'exposition au plomb » |
| SCI / SAS | OK (statuts juridiques courants) |
| IRL | OK (terme contractuel cité dans bail) |

Fix v15.08 : tous les libellés DDT visibles user → « Diagnostics » / « Dossier de diagnostic technique » en clair.

### Roadmap par phase

| Phase | Contenu | Coût | Bloqueur ? |
|---|---|---|---|
| **V1.0** | Charges récup + reporting bailleur + 2044 (en cours v14.61-65) | ~10h | Tous |
| **V1.1** | Gestion pro indispensable (mandat + CRG + FEC + audit + DG + impayés + RGPD) | ~30h | Pro Hoguet, V1 commerciale |
| **V1.2** | Compléments sectoriels (TVA / amortissement / encadrement loyer / sinistres / travaux) | ~20h | Selon profils |
| **V2** | SaaS multi-utilisateurs (rôles + portail bailleur + portail locataire + notifs) | ~45h | Refonte data model |
| **V3** | Différenciants premium (OCR / comparateur / signature eIDAS) | ~25h | Nice-to-have |

### V1.0 — En cours (charges + reporting bailleur + 2044)

| # | Code | Sujet | Coût | Statut |
|---|---|---|---|---|
| 1 | CHARGES-COMMUNES Phase 1 | Compteurs collectifs immeuble + saisie + tableau quote-part | 3h | ✅ v14.59 |
| 2 | CHARGES-COMMUNES Phase 1.5 | Single source DB.mouvements + lien mv.compteurCcId | 1h | ✅ v14.60 |
| 3 | CHARGES-COMMUNES Phase 2 | Modélisation 5 cas + part bailleur + scope/composition/fallback | 1h30 | 🔄 v14.61 |
| 4 | CHARGES-COMMUNES Phase 3 | Régul enrichie + card part bailleur + PDF récap loi 1989 | 2h30 | ⬜ v14.62-63 |
| 5 | REPORTING-BAILLEUR | Onglet **Finances** (analyse) : résultat net + compte de résultat + 4 ratios + argent à récupérer (cliquable→opérationnel) + passerelles 2044/FEC/Bilan · + widget dashboard « Projection »→« Loyers attendu vs encaissé » · [spec](docs/subjects/REPORTING-BAILLEUR.md) · [port PROD](docs/subjects/REPORTING-BAILLEUR-PORT-PROD.md) | L | ✅ **Onglet Finances Livré PROD v15.264** (branche `finance-port-prod`, cherry-pick `7391c26`→`3305fe7`, renum 263→264 car 263 pris par bail-sign-c3). Inclut onglet Finances complet (résultat net, compte de résultat N/N-1, ratios, argent à récupérer, passerelles 2044/Bilan/FEC) + **éditeur correspondance catégories→2044** (`_finCatLigne`/`_finUnmappedCats`). Re-audit `code-reviewer` du diff PROD = **port propre, 0 blocker** · check-inline-js 4/0 · Vitest 1490/47 · render localhost OK. **Widget dashboard « Loyers attendu vs encaissé » ✅ Livré PROD v15.265** (`43a9691`, remplace la carte « Projection 2026 », cherry-pick `2c0dd31`, gates 4/0). **Reste NON porté** : branche `_v4FilterEnt` (prod a `_setActiveEntity` plus récent). ⚠️ `DB.catMapping` interim → converger avec V3-REFONTE-LOYERS Chantier A + **coordination B1** : `_finUnmappedCats` devra exclure `type:'special'` quand les 5 catégories special de B1 arriveront (sinon double-compte). |
| 6 | LEGAL-2044 | Wizard 2044 + mapping catégories → lignes + PDF | 3-4h | ⬜ v14.65 |

### V1.1 — Gestion pro (~30h, ordre par dépendance)

| # | Code | Sujet | Coût | Prio | Bloqueur |
|---|---|---|---|---|---|
| 0 | **EMAIL-SMTP-CONNECT** | Envoi direct d'emails depuis l'app via Gmail API OAuth (leverage OAuth Drive existant). Fallback `mailto:` pour non-Google. Phase 2 Microsoft Graph V1.2 | ~6-8h | **P1** | OAuth Drive existant (v13.41), vérification Google Console scope `gmail.send` (~2-6 sem) · [docs/subjects/EMAIL-SMTP-CONNECT.md](docs/subjects/EMAIL-SMTP-CONNECT.md) · différenciant marché (envoi depuis adresse du bailleur, pas `noreply@`) |
| 0.b | **AUDIT-EMAIL-FLOW-COMPLET** | Audit transverse post v15.80 — bug user « aucun bouton ne fonctionne dans la modale » + régression bouton 📧 fiche bail (retiré v15.16) | ~1h | **P1** | [docs/subjects/AUDIT-EMAIL-FLOW-COMPLET.md](docs/subjects/AUDIT-EMAIL-FLOW-COMPLET.md) · diagnostic cache SW vs régression code · inventaire 6 points d'entrée email · décision : remettre bouton 📧 fiche bail v15.81 |
| 0.c | ~~**SIGN-BAIL-LIEN**~~ 🚫 **FUSIONNÉ** | ~~Signature électronique du bail aller-retour (Yousign Free)~~ → **fusionné le 2026-06-02 dans BAIL-SIGNATURE-DISTANCE**. Raison : free tier Yousign = par compte → non-scalable multi-tenant. Yousign survit comme option premium eIDAS qualifié | — | 🚫 Fusionné | Voir [docs/subjects/BAIL-SIGNATURE-DISTANCE.md](docs/subjects/BAIL-SIGNATURE-DISTANCE.md). Fichier [SIGN-BAIL-LIEN.md](docs/subjects/SIGN-BAIL-LIEN.md) conservé pour historique (comparatif prestataires, flow Yousign) |
| 1 | **AUDIT-TRAIL** | Journal modifications (qui/quand/quoi) | ✅ Livré v14.89 (Sprint 3A) | 🔥 P0 | `js/core/audit-trail.js` (5820 B, 5 exports + tests Vitest 30 tests). Hook dans `saveDB` via `_auditFlushPending()`. Entries auto sur `saveBail/delBail/saveEnt/delEnt/saveParamLog/delLog/saveMv`. `DB.auditTrail` array avec cap soft 10k entrées (prune oldest 5000). Sync Drive auto via payload standard. UI Paramètres "Journal d'activité" reportée Sprint 4 polish (données déjà exportables programmatiquement via `_auditToCsv`). |
| 2 | **GESTION-MANDAT** | Mandat de gestion + honoraires + reversement bailleur | 5h | 🔥 P0 | Hoguet (carte T) — **Reporté V1.1** (UX complexe : signature mandat + revoiur honoraires + interaction CRG mensuel) |
| 3 | **GESTION-CRG** | Compte Rendu de Gestion automatisé (PDF + Drive) · [spec](docs/subjects/GESTION-CRG.md) | 6h | 🔥 P0 | Réglementaire mandataire — **Reporté V1.1**, dépend de GESTION-MANDAT. User 2026-06-05 : « produire des CRG (mode gestionnaire) » + PDF agence réel analysé (Delle, mandat 00059). Distinct de l'onglet Finances (analyse propriétaire). |
| 4 | **EXPORT-COMPTABLE** | FEC + journal + grand livre (formats Sage/EBP/Quadra) | ✅ Livré v14.93 (Sprint 3E) | 🔥 P0 | `js/core/export-comptable.js` (9 KB, 5 exports : `_buildEcritures`, `_buildGrandLivre`, `_toFEC`, `_journalToCsv`, `_grandLivreToCsv`). Mapping comptes 706000/411000/615200/616000/622000/635110/661100/etc. sur catégories LEGAL-2044. **FEC format DGFiP** : 18 colonnes tab-séparé conforme arrêté 29 juillet 2013. **Journal général + grand livre** : CSV avec solde progressif + totaux. UI dans p-export : 3 boutons (FEC / journal / grand livre). 20 tests Vitest (partie double équilibre débit=crédit, mapping comptes, format FEC YYYYMMDD + virgule décimale FR, escape tab/newline). |
| 5 | **GESTION-DG** | Suivi caution / restitution / retenues justifiées | 3h | P1 | Légal (1m/2m délai) |
| 6 | **GESTION-IMPAYE** | Pré-contentieux : mise en demeure + commandement de payer | 4h | P1 | Business critical |
| 7 | **RGPD-COMPLIANCE** | Registre traitement + durée conservation + droit oubli | ✅ Livré v14.91 (Sprint 3D) | 🔥 P0 | `docs/legal/RGPD-REGISTRE.md` (registre art. 30 RGPD avec 4 traitements documentés + droits art. 15-22) + `docs/legal/DPA-GOOGLE-DRIVE.md` (analyse sous-traitant). `js/core/rgpd.js` (9 KB, 4 exports : `_findPersonalDataForRef`, `_generateGdprExport`, `_planErasure`, `_isEraseEligible`). UI dans p-export : carte "🔒 RGPD" avec sélecteur logement + 3 boutons (rapport données art. 15 / export portabilité art. 20 / plan effacement art. 17). 18 tests Vitest. Politique prescription civile 3 ans appliquée à `_isEraseEligible`. **Exécution effective de l'effacement** reportée V1.1 (nécessite UX double-confirm + cascade audit). |

### V1.2 — Compléments sectoriels (~20h)

| # | Code | Sujet | Coût | Profil concerné |
|---|---|---|---|---|
| 1 | GESTION-TVA | Régime BIC / meublé pro / paramétrage TVA | 5h | SCI IS, LMP, commercial |
| 2 | AMORTISSEMENT-LMNP | Table amortissement + dotations annuelles | 4h | LMNP/LMP |
| 3 | ENCADREMENT-LOYER | Vérif au bail (zones tendues : Paris/Lille/Bordeaux/etc.) | 3h | Zones tendues |
| 4 | GESTION-SINISTRE | Déclaration → suivi → indemnisation | 3h | Tous |
| 5 | GESTION-TRAVAUX | Workflow devis → ordre → facture → contrôle | 5h | Gestionnaires actifs |

### V2 — SaaS multi-utilisateurs (~45h)

| # | Code | Sujet | Coût |
|---|---|---|---|
| 1 | MULTI-USER | Rôles (admin/gestionnaire/bailleur/locataire) + permissions + cloisonnement | 15h |
| 2 | PORTAIL-BAILLEUR | Lecture seule + emails auto + CRG en ligne | 10h |
| 3 | PORTAIL-LOCATAIRE | Quittances en ligne + paiement Stripe/SEPA | 15h |
| 4 | NOTIFICATIONS | Email/SMS auto (échéances, IRL, CRG) | 5h |

### V3 — Différenciants premium (~25h)

| # | Code | Sujet | Coût |
|---|---|---|---|
| 1 | OCR-FACTURE | Extraction auto montant/date depuis PDF/photo | 5h |
| 2 | COMPARATEUR-LOYER | Benchmark zone (data SeLoger/Pap) | 6h |
| 3 | PORTAIL-VISITE | Agenda visites + pré-dossier locataire | 8h |
| 4 | SIGN-EIDAS | Signature électronique conforme bail (loi Hamon) | 5h |

---

## 🔥 Priorité immédiate — bugs critiques

> **🚨 Sujets de fond bloquants V1 commerciale (sessions dédiées)** :
> - **BAIL-SIGNATURE-DISTANCE** ✅ **Livré PROD v15.263 (3 composants)** (P1) — signature du bail à distance par le locataire avec **aller-retour 100% automatique** (rejet explicite user de l'approche « envoie un PDF et débrouille-toi »). Architecture : **relais serverless maison (Cloudflare Worker + R2 + KV)** servant `sign.html` (port du wizard Phase 2 existant) + crochet eIDAS qualifié en option premium. Absorbe l'ex-sujet SIGN-BAIL-LIEN (Yousign → premium seulement). **🟢 C1 RELAIS** construit + audité 2026-06-02 (branche `relay-bail-sign`, 46/46 tests, 6 routes) **+ DÉPLOYÉ prod** (R1 CORS + R2 DELETE + R3, Worker ver `09497487`). **🟢 C2 `sign.html`** livré + audité + validé téléphone. **🟢 C3 intégration in-app ✅ Livré PROD v15.263** (commit `f861736`, branche `bail-sign-c3`) : modale envoi variante B + bouton 📨 + collecte signataires, émission session (manifeste pdf-lib, POST /sessions), instrumentation ancres `__SIGN_ANCHORS__` sur `genPDFNative`, orchestrateur polling boot+fiche (throttle 30s) + chaînage email N+1, complétion (result+hash SHA-256+certificat+couture `_ingestSignedBailArtifacts`+DELETE relais+lock), Réglages relais URL/APP_KEY (exclu sync Drive), badges 4 états + partage multi-canal. **Présentiel existant inchangé** (2e chemin ajouté). Modules purs testés (coords mm→pt, manifest pdf-lib, sigid, build-manifest) + 4 mirrors globaux. **Intégré par la session maître** : merge FF `origin/bail-sign-c3` → `origin/main` ; gates check-inline-js 4/0 · Vitest 1503/52 · re-audit `code-reviewer` **PASS 0 bloquant** · parité byte-identique sandbox · 0 secret en dur (APP_KEY = saisie user). ⚠️ **Suivi non bloquant** : lanceur 📨 de la LISTE Locataires câblé dans fonction morte `_rBauxLegacyCards_DEPRECATED_v15_224` → seul point d'entrée vivant = fiche bien (`_renderLogFichePanelBail`) ; re-câbler dans `rBaux()` vivant en suivi audité. [docs/subjects/BAIL-SIGNATURE-DISTANCE.md](docs/subjects/BAIL-SIGNATURE-DISTANCE.md) · [plan C3](docs/superpowers/plans/2026-06-04-bail-signature-distance-c3.md)
> - **ARCHI-DB-DOUBLONS** (P1, ~12-15h) — refonte structurelle séparation log (bien) / bail (contrat). [docs/subjects/ARCHI-DB-DOUBLONS.md](docs/subjects/ARCHI-DB-DOUBLONS.md). Phase 1 CDC à attaquer en premier (~2h, dialogue décisions UX).
> - **FICHES-PARITE-360** (P1, ~27h) — parité totale onglets ↔ fiches 360° (logement, immeuble, bailleur). [docs/subjects/FICHES-PARITE-360.md](docs/subjects/FICHES-PARITE-360.md). 8 sessions phasées par ROI.
>
> **Ordre obligatoire** : ARCHI-DB-DOUBLONS Phases 1+2 livré AVANT de démarrer FICHES-PARITE-360, sinon double refacto sur les helpers `_renderXForLog(ref)`.

| Code | Sujet | Prio | Taille | Statut | Détail |
|---|---|---|---|---|---|
| EDL-MOBILE-TERRAIN | **🔥 EDL terrain mobile : pas d'autosave (perte totale au reload) + pull-to-refresh recharge l'app + retombe sur page connexion + footer 4 boutons ≈ 40 % écran + offline non formalisé** | P1 | M-L | 🔄 Chantier lancé 08/08 — prompt `PROMPT-CHANTIER-EDL-MOBILE-TERRAIN.md` (Phase 1 draft persistant TDD + Phase 2 footer mockup-first + investigation login) | [docs/subjects/EDL-MOBILE-TERRAIN.md](docs/subjects/EDL-MOBILE-TERRAIN.md) · diagnostic ancré v15.494 : EDL = globales mémoire sans draft (beforeunload inerte en cloud) · zéro `overscroll-behavior` · CSS footer mobile css/main.css:2833 ne rend pas le 50 % prévu · store-sync retry non persisté (offline tient tant que l'onglet reste ouvert) · plan 3 phases (draft persistant+restauration → footer compact mockup-first → offline formel avec MOBILE-PWA-OFFLINE) + investigation session/login après reload |
| DASH-REFONTE-GLOBALE-V4 | **🔥 Refonte visuelle globale dashboard + sidebar + audit dark 14 onglets** (V4 Stripe narrative) | P1 | XL | 🔄 En cours (session dédiée) | [docs/subjects/DASH-REFONTE-GLOBALE-V4.md](docs/subjects/DASH-REFONTE-GLOBALE-V4.md) · décision user 2026-05-15 d'abandonner le sprint-par-sprint pour refonte en bloc · 4 checkpoints visuels (CP1 fondations+sidebar+dédupli bandeau · CP2 cockpit Hero V4 · CP3 cash-flow Bloomberg + 5 KPIs sparklines · CP4 dash-ent-cards + audit dark 14 onglets + responsive 3 formats) · sandbox v15.36 · fusionne Phase B Étape A (v15.33) + Sprint 1 bandeau (v15.35) qui étaient des livraisons hybrides moches |
| BUG-IRL-001 | Lettre IRL : "date anniversaire du bail" est faux, c'est le mois | P0 | XS | ✅ Livré v13.30 | commit 661d0e7 · "date anniversaire, soit le 15 juin 2026" → "mois anniversaire (juin 2026)" + helper _dfm |
| BUG-CHARGE-001 | Régularisation des charges ne fonctionne pas | P1 | M | ✅ Livré v14.82 + résiduel v15.04 (Sprint 6) | **Cause racine** : `computeRegul` filtrait `m.cat==='Loyers'`/`'Charges'` strict (legacy v14.59). Avec v14.78 LEGAL-2044, l'utilisateur tagge `'Loyers encaissés'`, `'Provisions pour charges de copropriété'` → plus aucun match → provisions = 0, charges = 0, solde faux. **Fix v14.82** : helpers `_isLoyerCategory` / `_isChargeRecupCategory` qui matchent legacy + LEGAL-2044 (211 recettes + 229/230 charges récup). 12 sites supplémentaires mis à jour (dashboard widgets, KPI, quittances, alertes). **Tests Vitest** : 19 nouveaux dans `__tests__/helpers/charges.test.js` (compat legacy + modern + mix). **Résiduel v15.04** : 6 sites supplémentaires détectés par audit Explore (`_buildRevDrill` l.5627, `_getLogementStartIso` l.5771, `_buildProgDrill` l.5892, `_buildRdtDrill` l.6542, KPI Immeuble l.7281, sparkline rendement l.7343) → grep final = 0 occurrence résiduelle. |
| BUG-DASH-SPARK-COLOR | **Régression V4** : sparklines/aires du dashboard restent vertes même quand valeurs négatives. Avant V4 : couleur dynamique vert si positif / rouge si négatif. | P2 | S | ✅ Livré v15.49 (cash-flow uniquement) | `sumSeries12 >= 0 ? --pos : --neg` appliqué dans `_renderDashV4Premium` cash-flow sparkline (stroke + gradient + lastPt). Mag/Rdt/DG sparklines restent neutres (CTA) car always positifs en pratique. |
| BUG-DASH-001 | Dashboard : prendre les baux en vigueur dans le mois choisi | P1 | M | ✅ Phase 1+2 v14.83 + résiduel v15.04 (Sprint 6) | **Helpers temporels** `_bailEstActifAt`, `_loyerHCAtDate`, `_chargesAtDate` ajoutés dans index-test.html (ligne 5985) — adaptés au schéma réel `DB.irlHistorique` (pas `bail.revisions[]`). **Test Vitest** `dashboard-temporel.test.js` : 19 tests (5 scénarios complets dont le cas user "mai 2024 vs fév 2025"). **Application** dashboard : refonte `_getActiveBailHcCh` qui consultait `bail.hc` brut (montant courant post-révisions IRL) → utilise désormais `_loyerHCAtDate` pour bail courant + monthIso passé. Dimension 1 (baux par période) déjà gérée via `_getAllBailsForLog`. **Résiduel v15.04** : fix de `_buildProgDrill` (l.5892) qui faisait encore `m.cat !== 'Loyers'` → couvert par la conversion `_isLoyerCategory` du Sprint 6. **Phase 3 optionnelle** : refacto complet rDash/buildDashWidget reportée à Sprint 2A (refacto fns monstres 892 lignes). |
| BUG-BAIL-002 | Bail : seule la 1re signature garant apparaît si 2 garants | P1 | S | ✅ Obsolète 2026-04-29 | [docs/subjects/BUG-BAIL-002.md](docs/subjects/BUG-BAIL-002.md) · vérifié par utilisateur : 2 actes cautionnement bien générés (1 par garant) avec page-break + sig dédiée. Bug résolu par refonte UI dynamique garants. |
| BUG-BAIL-003 | Bail multi-bailleurs : 2e signature bailleur capturée mais absente du PDF | P1 | XS | ✅ Livré v13.19 | [docs/subjects/BUG-BAIL-003.md](docs/subjects/BUG-BAIL-003.md) · commit eca0faa · ✅ testé OK 2026-04-29 (bail Ferrette ARSLAN/HARNIST 2 sigs visibles) |
| BUG-BAIL-PARAPHES-MULTI | Bail multi-bailleurs/locataires : 1 seul paraphe sur N signataires dans footer PDF | P1 | XS | ✅ Livré v13.36 | commit 36f20e2 · `drawParaphesFooter` accepte arrays · genPDFNative collecte en arrays par sig.id · helper `drawCol` trace N sous-cadres côte à côte (label pluriel si N>1) · sigs finales déjà OK (it. par sig.id) |
| BUG-DRIVE-OVERWRITE | **P0 perte de données** : signature bail offline écrasée silencieusement par sync Drive | P0 | S | ✅ Livré v13.38 | commit c6980dc · Cause : wizard signature popup écrivait `bail.signatures = sigData` sans `_stamp(bail)` → `_modifiedAt` non MAJ → `_drvWins` faisait gagner Drive → signature wiped + push DB sans sig = perte définitive. **3 fixes** : (1) stamp dans wizard 2 paths · (2) protection signature au merge `_mergeEntityPayload` (jamais d'écrasement silencieux d'une sig locale par un Drive sans sig) · (3) alerte utilisateur via `_driveSigProtected` + bouton "Restaurer backup" dans toast conflit |
| BUG-DRIVE-DISCONNECT | **P0 sauvegarde silencieusement perdue** : token Drive expire à 1h sans alerte | P0 | M | ✅ Livré v13.41 | commit d616669 · OAuth GIS browser-only n'a pas de refresh token. **5 leviers** : (A) refresh proactif T-5min via `_scheduleProactiveTokenRefresh` · (B) refresh à `visibilitychange` au retour de tab · (C) modale obligatoire `#ov-drive-disconnected` avec NB modifs en attente + bouton reconnecter + warning risque · (D) FAB rouge clignotant `@keyframes drive-fab-pulse` quand expiré · (E) silent re-grant au startup si `_driveLastSync` existe. Reprompt 5min après "Plus tard". 9 triggers de modale documentés. |
| IRL-VALIDATION | IRL : enveloppe couleur + valider envoi + valider IRL + popup mois anniversaire | P1 | M | ✅ Livré v13.33 | refonte v13.33 (v13.32 rejeté : encart dans lettre = bricolage). Enveloppe 3 états (gris/orange/rouge/vert) dans cellule actions + boutons "Valider envoi" et "💶 Valider IRL" cohérents tous états + popup `#ov-irl-rappel` mois anniversaire (login 1×/jour + ouverture onglet IRL 1×/session) + dashboard alerts enrichies + lettre PDF nettoyée (zéro encart validation) |
| IRL-DPE-FG | IRL : pas de révision si bail en DPE F ou G (loi Climat 2021) | P1 | S | ✅ Livré v13.31 | commit 625638c · 4 surfaces (computeIRLRevision + rIRL + genIRLLetter + applyIRL) · DPE F/G bloque dur, DPE manquant alerte popup, DPE >10 ans warning |
| BUG-PJ-LOCALSTORAGE | **PJ mouvements gonflent localStorage** (quota 5-10 Mo) | **P1** | M | ✅ Livré v14.99 (Sprint 5A) | **Architecture 3 tiers unifiée** : localStorage (métadonnées `DB.documents[]`) + IndexedDB (binaire idbKey) + Drive (canonique). Module `js/core/attachments.js` (4.5 KB, 7 exports). Helpers inline : `_attachmentSaveForMouvement`, `_drvUploadAttachmentBackground` (fire&forget), `_mvPjResolve`, `_migratePjMouvementsToAttachments` (auto boot, idempotent). `saveMv` async + tombstone si remplacement. Rétro-compat lecture `m.pj.dataB64` legacy. **Limite 2 MB → 10 MB**. **Tests Vitest** : 28 nouveaux (validation, build, match/resolve, migration plan, orphans). Total 18 fichiers / 365 tests. Phase 2-3-4 (DOC-PJ généralisé, LOG-PHOTOS, Drive lazy scan) reportées V1.1. |
| BUG-ENT-RENAME-CASCADE | Renommage entité ne propage pas vers logements/baux/quittances → KPIs dashboard à 0 après rename | P0 | XS | ✅ Livré v14.51 | commit ee48bad · `saveEnt()` cascade sur 5 collections (logements / baux / baux_historique / quittances / mouvements globaux SCI:nom) + normalisation Unicode à la saisie (em-dash U+2014 / en-dash U+2013 / NBSP → ASCII safe) · toast "Entité renommée — N rattachement(s) propagé(s)" |
| BUG-ENT-ORPHANS-CLEANUP | Détection + nettoyage des rattachements orphelins (logements pointant vers entités supprimées ou renommées) | P2 | S | ✅ Livré v14.52-53 | [docs/subjects/BUG-ENT-ORPHANS-CLEANUP.md](docs/subjects/BUG-ENT-ORPHANS-CLEANUP.md) · Phase 1 v14.52 commit 7e209a5 (audit boot + toast warning + console.warn détaillée) · Phase 2 v14.53 commit 79b93bc (modale Paramètres "Maintenance — Rattachements orphelins" avec UI 1-clic Rattacher / Supprimer, réutilise cascade rename de saveEnt) · Phase 3 fuzzy-match auto = standby (pas urgent) |
| BUG-BIENS-TABS-FILTER | Page Biens / mode Bailleurs : toggle Tous/Archivés affichait les mêmes 3 cards dans les 2 vues | P2 | XS | ✅ Livré v14.54 | [docs/subjects/BUG-BIENS-TABS-FILTER.md](docs/subjects/BUG-BIENS-TABS-FILTER.md) · commit ae7b24b · `_renderBiensModeBailleurs` filtre sur `_entsWithArchived()` quand `_biensTab==='archives'` + `_renderBailleurCard(ent, isArchivedTab)` compte selon scope · empty state "Aucun bailleur n'a de bien archivé" + libellé "N biens **actif**(s)" / "**archivé**(s)" |
| BUG-LOG-001 | Logement : référence non modifiable après création | P2 | XS | ⬜ À faire | [docs/subjects/BUG-LOG-001.md](docs/subjects/BUG-LOG-001.md) · reporté Sprint 1E (UX cascade nécessite design dédié) |
| BUG-EQUIP-FILTER | Onglet Équipements : filtre exclut logements vacants | P2 | XS | ✅ Livré v14.84 (Sprint 1E) | Retrait du filtre `l.locataire` dans `rEquipements` (3 sites : sélecteur immeuble, sélecteur logement, liste). Les vacants sont maintenant inclus avec label "Vacant" dans le selectbox. |
| BUG-HC-GARDE-FOU | Garde-fou saisie HC : alerte si valeur aberrante | P2 | XS | ✅ Livré v14.84 (Sprint 1E) | `saveParamLog` confirme avant écriture si : HC > 50 000 €/mois (excessif) OU CH > HC (anormal). Helper `_validateHC` testé via Vitest (19 tests). |
| DB-CORRUPT-FALLBACK | DB corrompue : alerte + backup + restore Drive | P2 | XS | ✅ Livré v14.84 (Sprint 1E) | `initDB` détecte JSON parse échoué → backup du payload corrompu localStorage (`KEY_corrupt_backup_*`) + toast erreur 12s + ouvre modale restore Drive si user avait Drive. Avant : fallback silencieux. |
| BUG-UI-DARK-MODAL | Mode sombre : fond modale trop transparent (texte page derrière visible) | P2 | XS | ⬜ À faire | [docs/subjects/BUG-UI-DARK-MODAL.md](docs/subjects/BUG-UI-DARK-MODAL.md) · capture wizard Bail F-001 · à fixer dans V3-VISUEL ou avant |

---

## 🔴 P1 — Légal / Fiscal (bloquant commercialisation)

| # | Code | Sujet | Prio | Taille | Statut | Note CDC |
|---|---|---|---|---|---|---|
| 14 | LEGAL-2044 | Aide déclaration 2044 — mapping catégories → lignes fiscales | P1 | L | ✅ Livré v14.90 (Sprint 3B) | `js/core/legal-2044.js` (11 KB, 3 exports : `_compute2044`, `_format2044Recap`, `_2044ToCsv`). Agrégation des mouvements par ligne 2044 (211, 213, 221-230, 250) en réutilisant STD_CATEGORIES v14.78. UI dans onglet Export : carte "Aide déclaration 2044" avec selecteurs année + entité + bouton récap + bouton télécharger CSV. Helpers exposés à window. Tests Vitest 15 : aggregate, période, scope entité, tombstones, special, custom non-mappé, comptes, arrondi, null-safe, format texte récap, CSV escape, avertissement déficit. **Hors scope V1** : déficit foncier complexe (limite 10 700€, report 10 ans), liasse 2072 SCI IS (sujet LEGAL-2072 P3). |
| 15 | LEGAL-BILAN-ANNUEL | Bilan annuel par entité PDF | P1 | M | ✅ Livré v14.92 (Sprint 3C) | `js/core/legal-bilan.js` (9 KB, 2 exports : `_computeBilanAnnuel`, `_formatBilanTexte`). Réutilise `_compute2044` pour la structure fiscale + ajoute KPIs métier (taux occupation, manque à gagner, détail par logement). UI dans p-export : carte "📊 Bilan annuel" avec selecteurs année + entité + bouton "Générer". Sortie texte ASCII multilignes prête à copier/imprimer. 10 tests Vitest. **PDF natif** reporté à Sprint 4 polish (le récap texte est imprimable via navigateur Ctrl+P). |
| 38 | EDL-VALIDATION-AVOCAT | Validation légale template EDL par avocat (bail habitation) | P1 | XS | ⬜ À faire | Décret 2016-382 · clés (nombre+destination), réf EDL entrée dans sortie, comparatif pièce par pièce |
| 32 | ARCHI-DB-DOUBLONS | Refonte architecture DB — séparer log (bien physique) et bail (contrat), bidirectionnel | P1 | XL | ✅ **Phase 4b COMPLÈTE livrée v15.232** (décision B3 : logement = source unique du bien) | [docs/subjects/ARCHI-DB-DOUBLONS.md](docs/subjects/ARCHI-DB-DOUBLONS.md) · **Phases livrées** : 1 CDC `ae73859`, 2 data `511faf3` v14.14, 3a UI tabs `5d7097f` v14.15, 3b sync étendu `17426cf` v14.16, 4a wizard readonly `5fd2ca0` v14.17, fix bouton `230a7fd` v14.17.1, 4b fondation `1a42721` v14.17.2. **4b COMPLÈTE v15.232 (2026-05-29)** : écritures legacy `bail.X` supprimées (getBailDataFromForm/copyBailFrom) + bloc bien `_syncLogToBail` retiré + sérialiseurs `_lbSerialize*` (3 bugs affichage corrigés : annexes `[object Object]` / equip toujours `–` / chauffage label-only) + schéma chauffage 11 flags + ECS enrichi + migration boot `_migrateArchiV4bIfNeeded` (lossless equip→customs, signés/orphelins préservés, backup auto) + rendu BAIL-FIRST `bail.X || _lbFill.X` (immutabilité bail signé via snapshot) + `saveBail` re-préserve champs gelés. **Audit code-reviewer 2 passes** : C1/I1/I2/S3 + dérive re-save → tous RESOLVED. Propagé index.html (byte-identique) + sw.js v15.232. |

---

## 🔴 P1 — Sécu / Architecture (bloquant commercialisation)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| **FICHES-PARITE-360** 🔥 | **Parité totale onglets ↔ fiches 360° (logement / immeuble / bailleur) — single source of truth** | **P1** | **XL (~27h, ~23h restantes)** | 🔄 **Session 1 ✅ Compta riche logement livrée v14.18** · 7 sessions restantes | [docs/subjects/FICHES-PARITE-360.md](docs/subjects/FICHES-PARITE-360.md) · **Session 1 commit `a2ae89c` v14.18** : sous-onglet 💰 Comptabilité fiche logement (KPIs annuels + cash-flow SVG 12 barres + listes compactes mouvements/quittances/IRL filtrées par ref+année + sélecteur année + boutons "+ Mvt"/"+ Quittance"). Helpers factorisables `_renderComptaKPIsForLog`, `_renderComptaCashFlowChart`, `_renderMvForLog`, `_renderQuitForLog`, `_renderIrlForLog`. **Sessions restantes par ROI** : 2 Plan d'occupation Gantt immeuble (~3h, killer feature), 3 EDL fiche logement + EDL-TEMPLATE-PER-LOG (~7h), 4 Compteurs + graphique conso (~2h), 5 Entretien équipements+assurances+agenda (~2h), 6 Documents agrégés (~1h), 7 Performance + compta bailleur (~5h), 8 Plan immeuble charges communes+travaux (~3h). |
| AUDIT-GLOBAL | Audit + nettoyage actif + analyse faisabilité modularité (index.html = 30 083 lignes au 2026-05-05) | P1 | L | ✅ Livré v14.81 (Sprint 1B) | Phases 1-5+7 audit lecture livrées (commits `15c1aee`, `5084b70`). Phase 6 nettoyage console.log : audit montre **104 console.* tous diagnostics opérationnels utiles** (Drive sync, OAuth, EDL, migrations, ARCHI) → aucun TEST/DEBUG oublié, codebase déjà propre. Pas de fix nécessaire — clos. Estim initiale du rapport AUDIT-CODE (60-70 à supprimer) revue à 0. |
| ARCHI-MODULAR | Refonte modulaire monolithe index.html (ES modules natifs) | P1 | XL | 🔄 Phases 0+1a+1b+2 livrées v14.85→88 (Sprint 2 marathon partiel) | [docs/strategie/ARCHI-MODULAR-FAISABILITE.md](docs/strategie/ARCHI-MODULAR-FAISABILITE.md) · **Stratégie 2 ES modules natifs**. Tag rollback `pre-modular-sprint2`. **Livré dans Sprint 2 marathon** : Phase 0 v14.85 (CSS extrait dans `css/main.css`, -3434 lignes index-test.html), Phase 1a v14.86 (`core/utils.js` 16 helpers purs : sanitize + validation + DPE + classification + temporels), Phase 1b v14.87 (`core/idb.js` 5 helpers IndexedDB + 10 tests), Phase 2 v14.88 (`components/toast.js` + `components/modal.js` + 13 tests). Source unique de vérité pour 26 helpers via re-export depuis `__tests__/helpers/*.js`. Pattern shadow (inline + module) idempotent. **Reporté post-V1** : Phase 1c db.js + Phase 1d drive.js (objet DB mutable global + OAuth state nécessitent refacto en profondeur), Phase 3 migration onglets (30+ fonctions globales par onglet via onclick inline, prérequis BAIL-NAMESPACE-MIGRATION 3-4j), Phase 4 cleanup. **Pré-requis dev** : http-server sur port 8766. |
| SECU-INNERHTML | Sites `innerHTML=` non échappés restants — XSS V1 bloquant | P1 | M | 🔄 Phase 1 livrée v14.80 (Sprint 1A) | Phase 1 (commit `2bf8d1f`) : helpers _esc/_h/_raw + 16 tests Vitest + 10 lots fixes sites HAUT-RISQUE (fillMvQui, drillEntOps, rAlertsSection, rParamsPieces XSS onclick critique, _irlBaseCells, IRL histo, ass/mrh/quit tbody, régul cards/doc, ent.logo). Inventaire `docs/audit/SECU-INNERHTML-INVENTAIRE.md`. **Phase 2 restant** : ~30 sites `onclick="X('${l.ref}')"` IRL/baux à migrer vers data-attributes (en Sprint 1B). |
| MOBILE-AUDIT-ONGLETS | Audit + correctifs UX mobile onglet par onglet (irréprochable sur téléphone) | P1 | L | 🔄 Phase 1+2+3+4 règles CSS livrées v14.11→14.95 | [docs/subjects/MOBILE-AUDIT-ONGLETS.md](docs/subjects/MOBILE-AUDIT-ONGLETS.md) · **Phase 1 v14.11** : anti-zoom iOS Safari. **Phase 2 v14.12** : refonte EDL. **Phase 3+4 v14.95 (Sprint 3H)** : règles CSS génériques dans `css/main.css` (~80 lignes ajoutées) — touch targets 44px partout (buttons, inputs, selects), inputs font-size 16px (renforce anti-zoom iOS), modales plein écran 100dvh + m-foot sticky avec safe-area-inset-bottom iPhone, scroll-margin-top 60px pour anchors, tbl-wrap overflow scroll horizontal, form-grid → 1 col mobile, toast centré bas mobile, sidebar burger sur <480px, dark mode preserve. **Validation visuelle reportée Sprint 4 polish** (nécessite test 320/390/428 px par utilisateur). |
| LOG-FICHE-360 | Vue 360° consolidée par bien (Phase 2 sous-onglets Documents/EDL/Compta/Compteurs/Entretien) | P1 | M | 🔄 Phase 1 livrée v14.2 | [docs/subjects/LOG-FICHE-360.md](docs/subjects/LOG-FICHE-360.md) · Phase 1 livrée commit `1036bdf` (route + header + onglet Général) · Phase 2 à planifier en session dédiée — stub ergonomique des 5 sous-onglets déjà en place |
| DASH-PROFILES | Dashboard 4 onglets (Propriétaire 1-écran / Gestionnaire ops / Complet = prod / Custom = mode édition) | P1 | M | ⏳ Phase 2 reportée Sprint 4 marathon (validation visuelle nécessaire) | Phase 1 v2 livrée (mockups + spec). **Phase 2 implémentation 4.5 j-h non livrée dans cette session marathon** : nécessite validation visuelle 320/390/768/1280 px qui ne peut être faite en autonomie sans preview navigateur réel. Reportée à une session dédiée user avec validation lentille par lentille. 3 décisions D1-D3 toujours à arbitrer (persist user/device, custom layout séparé, vue détaillée modale/onglet). |

---

## 🔴 Drive sync — multi-utilisateurs / partage

> **🧪 TEST EN ATTENTE (à rappeler à l'user)** : valider **DRIVE-PARTAGE-PICKER** avec un 2e compte (Marion) — Didier partage son dossier ImmoTrack (Éditeur), Marion ouvre l'app, Paramètres → Partage → « Sélectionner un dossier partagé » → choisit le dossier → doit pouvoir **enregistrer**. Tant que non validé : ne pas construire DRIVE-2F (prématuré).

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| **DRIVE-PARTAGE-PICKER** | Co-gestion 2-users Drive (POC + 5 phases industrialisation + REORG arbo complète + auto-détection + migration) | **P1** | L (~9h livrés sur la session 2026-05-25) | ✅ **v15.167→172 livrés (toutes phases A-E)** · 🧪 **test 2 comptes en cours** | [docs/subjects/DRIVE-PARTAGE-PICKER.md](docs/subjects/DRIVE-PARTAGE-PICKER.md) · 8 commits empilés : POC v15.167, industrialisation 1-5 v15.168, fix folders writer v15.169, fix `_drvSAD()` 5 endpoints v15.170, REORG Phase A docs cloisonnés v15.171, REORG Phases B+C+D+E v15.172. **ZONE SENSIBLE** : à tester en prod soigneusement avant manipulation données réelles. |
| DRIVE-2F | Optimistic Concurrency Control (OCC) — anti-écrasement 2 writers simultanés | P1 | M | ⬜ **Après validation PARTAGE-PICKER** | [docs/subjects/DRIVE-2F.md](docs/subjects/DRIVE-2F.md) · filet de sécurité une fois que 2 personnes (Didier+Marion) écrivent les mêmes fichiers. ⚠ touche le chemin de save critique (fraîchement stabilisé) → à faire avec prudence + test 2 comptes. Prématuré tant que le partage n'est pas validé. |
| DRIVE-2H | Re-architecture fichiers par-user vs partagé | P1→**V2** | M | 🔵 **Reclassé V2 multi-tenant** | Le split per-user n'est utile qu'en multi-tenant (V2 PostgreSQL Q4 2027). Pour 2-3 users co-gestion, le partage Picker suffit (ils partagent tout, c'est voulu). [docs/subjects/DRIVE-2H.md](docs/subjects/DRIVE-2H.md) |
| DRIVE-2G | Awareness UI (qui édite quoi) | P1→**V2** | S | 🔵 **Reclassé V2** | Présence temps-réel = confort multi-user, redondant avec le backend V2. [docs/subjects/DRIVE-2G.md](docs/subjects/DRIVE-2G.md) |
| DRIVE-2I / 2J | Audit log Drive · merge field-level | P2/P3→**V2** | — | 🔵 **Reclassés V2** | Nice-to-have, couverts/refaits par le multi-tenant V2. |
| DRIVE-ARBORESCENCE | Arborescence Drive Entité/Immeuble/Logement/[9 sous-dossiers métier] + sync bidirectionnel | P1 | L | ✅ Phases A + B + C + D livrées | Phase A v14.20 (arborescence), Phase B v14.35 (`_drvUploadDoc` + `DB.documents`), Phase D v14.36 (UI Stockage Drive), **Phase C v15.02 Sprint 5D : lazy scan Drive→app**. Helpers `_drvListFolderFiles` (files.list API), `_drvScanLogementFolders(logRef, [categories])` (multi-catégories), `_drvMergeScanResults(scan, logRef)` (ajoute nouveaux fichiers + tombstone ceux supprimés côté Drive web), `_drvLazyScanLogement(logRef)` (orchestration + throttle 30s + toast + audit-trail). Trigger : à l'entrée des sous-onglets `documents` ou `photos` de LOG-FICHE-360 (setTimeout 200ms). **13 tests Vitest** dédiés (`drive-scan.test.js`) couvrant additions/tombstones/multi-cat/edge-cases. Englobe DRIVE-2K. |

---

## 🟠 P2 — V3 visuelle harmonisée (= "design", étape 2 V3)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| V3-VISUEL | Appliquer design system v2 à TOUTES les pages (formulaires, tableaux, modales, cartes, typo, hover/focus, mode sombre, responsive) | P2 | L | ⬜ À faire | Structure inchangée, juste visuel · cf `project_v3_transition.md` étape 2 · ~3-5 sessions · **Principe directeur** : constance visuelle non-négociable sur toute l'app — chaque nouveau composant/page doit déjà appliquer la cible (cf mémoire `feedback_design_consistency.md`) |

## 🟠 P2 — V3 fonctionnelle onglet par onglet (étape 3 V3)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| V3-REFONTE-BAIL | Refonte fonctionnelle Bail (en cours sur plusieurs sessions) | P2 | L | 🔄 En cours | Phase 3a-d, wizard, signature, snapshot livrés. Reste : polish + types + PDF natif (cf sujets dédiés) |
| V3-REFONTE-LOYERS | Refonte fonctionnelle onglet Loyers/Mouvements | P2 | M-L | ✅ COMPLET — Finances + mouvement + split + règles + import (5 phases) + catégories restructurées (21+2) livrés v15.308→326 / reste tests user + chip sync sandboxes | **Chantier A (2044 moteur unifié & juste) TERMINÉ PROD** : Phase 1 v15.259 + Phase 2 v15.261. **Catégories ✅ PROD v15.267** (`5c80b9a` : +5 catégories `type:'special'` hors résultat foncier + précédence `special` sur catMapping = anti double-compte). **Finances P&L refonte ✅ PROD v15.308-316** (cf [[project-pl-finances-refonte]]). **Affectation pilotée par la catégorie ✅ PROD v15.316** (`cf36772` : bloc réutilisable unique `_affZone` dans le formulaire mouvement `ov-mv` — la catégorie propose 1 des 4 destinations log/imm/SCI/récupérable, surchargeable par pastilles ; écrit dans champs cachés `mv-qui`/`mv-imm`/`mv-cc` → `saveMv` inchangé ; `log` renseigne aussi `imm` parent ; **audit code-reviewer PASSANT** 5 invariants 2044). **Chantier C — split multi-sens ✅ PROD v15.317** (`aac7908` : « Scinder un mouvement » mono-sens → N lignes SIGNÉES, chacune son sens − débit / + crédit + sa catégorie + son affectation via `_affZone` (1 instance `sp<j>` par ligne) ; équilibre sur le NET Σcr−Σdb = net bancaire du source ; cas relevé de gérance loyers crédit − frais débit ; `_spMvSyncDom` recopie les champs cachés avant chaque re-rendu → 0 affectation perdue ; **audit PASSANT** 6 invariants — conservation de la masse + **corrige un double-compte régul latent** de l'ancien split). **B3 — auto-seeds du split ✅ PROD v15.318** (`f676b15` : boutons 🏦 Relevé de gérance [1 ligne crédit/logement loué = hc+ch en « Loyers encaissés » + 1 ligne débit « Frais de gestion » à l'immeuble] · 👥 Par logement [virement groupé/CAF] · ✏️ Manuel ; ancré dans le vrai modèle `log.hc`/`log.ch`, pas la maquette ; **audit PASSANT**). ⚠️ **DÉCISION FISCALE captée** : on NE sépare PAS loyer/charges en 2 mouvements — l'app traite « Loyers encaissés » comme le paiement complet (hc+ch) et la régul dérive la provision du bail (`bail.ch`×mois, `computeRegul` L23858) ; la catégorie « Provision de charges (locataire) » de la maquette n'existe pas → séparer aurait cassé la régul (corroboré par 3 sources : régul/dashboard/finances). CAF/APL non trackée → montants pré-remplis = loyer réel à ajuster. **`_affZone` branché dans l'éditeur de règles d'import ✅ PROD v15.319** (`486bb41` : 3 colonnes indépendantes Logement/Immeuble/Compteur → 1 colonne « Affectation » via `_affZone` ; **FIX FISCAL** = avant, une règle pouvait poser qui+compteur → mvt importé exclu silencieusement du 2044 [trou de sous-déclaration, l'import court-circuite saveMv] ; `_affZone` garantit l'exclusivité ; hook générique `_affHooks` non régressif pour form/split ; `_ccImmeuble` compat règles recup anciennes ; **audit PASSANT** 7 invariants). **→ La fenêtre « Renseigner un mouvement » (affectation + split + seeds) + l'éditeur de règles sont COMPLETS.** **REFONTE IMPORT BANCAIRE (sous-chantier, 5 phases) — design figé 2026-06-21** (spec `docs/superpowers/specs/2026-06-21-refonte-import-bancaire-design.md`, maquette `mockups/loyer-2044-pro/import-bancaire.html` ; toutes briques retenues + catégories revalidées par user). **Phase 1 — socle ✅ PROD v15.320** (`325657a` : nouvelle catégorie « Charges récupérables (eau, énergie…) » [ligne2044 vide, type special, recup:true, pas de gestionCharge → hors 2044 + hors P&L, gérée via compteur/régul] + **FIX BUG FISCAL** : `_bankMatchHeuristic` proposait des catégories inexistantes [« Taxes foncières », « Intérêts d'emprunt », « Frais de gérance », « Autres »] → mouvements importés exclus du 2044 = sous-déclaration ; réécrit vers les vrais noms [module + shadow inline file:// synchronisés] ; fallback → '' ; **audit PASSANT** [main.js:292 écrase le shadow sur http → fix actif prod]). ⚠️ chip ouvert : sync des 5 sandboxes `index-test*.html`. **Phase 2 — picker cherchable ✅ PROD v15.321** (`354a9e1` : le sélecteur de logement de `_affZone` passe du `<select>` à plat à un picker cherchable en overlay [recherche réf/locataire/immeuble, groupé par immeuble] ; écrit les mêmes champs `qui`/`imm` → contrat B1 inchangé ; bénéficie au formulaire/split/règles/import ; vérifié en preview eval — ouverture/recherche/pick/écriture OK, 0 erreur console ; pas fiscalement sensible). **Phase 3 — assistant de revue ✅ PROD v15.322** (`90934ce` : aperçu d'import refondu en 2 onglets accordéon « À compléter »/« Reconnus » [⚙ règle / ✨ proposé], éditeur `_affZone` par ligne + barre compte=périmètre [scope SCI/immeuble filtre le picker, gaté aux pickers d'import]. **2 FIX FISCAUX** : (a) le nouvel import IGNORAIT `DB.importRules` → l'éditeur de règles était sans effet, maintenant les règles classent l'import ; (b) `_bankImportConfirm` écrit l'affectation COMPLÈTE qui/imm/SCI/compteur, plus seulement qui+cascade. Vérifié preview eval [règle appliquée, classification, scope, import 3 mvts corrects] ; **audit PASSANT** 6 invariants + adversarial). ⚠️ chip ouvert : nettoyage code mort `_bankImportToggle/SetCat/SetQui`. **Phases 4+5 ✅ PROD v15.323** (`2b015c4` : **Phase 4** = auto-détection relevé de gérance [libellé GERANCE/GESTION] + split intégré — le split multi-sens v15.317 réutilisé sur une ligne d'import via `_spMvImportIdx`/`_spMvSrc`, stocké sur `line._sp`, `_bankImportConfirm` crée N mvts signés Σcr−Σdb=net ; seed gérance enumère les logements de l'immeuble ; **Phase 5** = écran récap après import → impact 2044 [recettes/charges/intérêts/récup-hors-2044/special] + aperçu + lien 2044, affichage seulement. **Audit PASSANT** 6 invariants [masse conservée, exclusivité par part, pas de régression split DB] ; fixes appliqués [sens deduction L230, masquage bouton]). **→ REFONTE IMPORT BANCAIRE COMPLÈTE (Phases 1-5).** ✅ **Tout le chantier V3-REFONTE-LOYERS mouvement+import est livré** (Finances P&L + formulaire mouvement + split + seeds + règles + import 5 phases, v15.308→323). **Nettoyage code mort ✅ v15.324** (`21978a7` : `_bankImportToggle`/`SetCat`/`SetQui` + `_ruleFieldSel` supprimés, 0 appelant). **Catégorie « Frais de gestion forfaitisés (forfait 222) » ✅ PROD v15.325** (`5d92e1d` : trou signalé par le user — récupéré depuis l'audit fiscal acté `docs/subjects/PROCEDURE-AFFECTATION-MOUVEMENTS.md` §5 + `AUDIT-FISCAL-MOUVEMENTS.md` piège #3, BOFiP RFPI-BASE-20-10. Y vont les **frais bancaires** de tenue de compte / péage / déplacement / matériel → EXCLUS de la 2044 [déjà couverts par le forfait 222 auto, anti double-déduction], gestionCharge:true [réduit le résultat de gestion P&L], niv:'sci'. + comptable → niv:'sci' [BOFiP §60]. + heuristique import frais bancaires/péage → cette catégorie. **Audit PASSANT** 6 invariants [exclusion 2044 vérifiée sur 3 agrégateurs]). **Restructuration des catégories (31 → 21 visibles + 2 auto) ✅ PROD v15.326** (`94445a5` : refonte de la taxonomie `STD_CATEGORIES` validée user — fusion des catégories qui partagent la même ligne 2044 [PNO+GLI → « Primes d'assurance (PNO, GLI) », réparation+amélioration → « Travaux (entretien, réparation, amélioration) », frais d'emprunt → « Prêt — Intérêts d'emprunt », DG reçu+restitué → « Dépôt de garantie (reçu / restitué) »…], **on NE sépare PAS le prêt** [échéance → « Prêt — Capital remboursé », les intérêts ligne 250 = saisie manuelle user d'après l'attestation banque], péage/tablette/carburant → « Divers (non déductible) » [PAS frais bancaires], 225/230 passés en `auto:true` [cachés du picker manuel via `STD_CATEGORY_NAMES = filter(!auto)`, restent dans `catByName` pour le mapping 2044 + régul]. **Migration `_CAT_MIGRATION` dans initDB** re-tague `DB.mouvements[].cat` + `DB.importRules[].cat` [21 entrées old→new, idempotente, fusions fiscalement neutres = même ligne 2044], nettoie `DB.categories` des anciens noms/auto, **conserve les customs** [CFE / TLV non migrés → deviennent custom]. Shadow inline == module (heuristique synchronisée). **Audit `code-reviewer` PASSANT** [table fate complète 36 entrées, 0 orphelin, toutes fusions neutres, migration idempotente, customs préservés, `niv` = défaut UI seulement pas mapping 2044]). **PICKER CATÉGORIE UNIQUE — maquette validée user 2026-06-22** (`mockup-category-picker.html` déployé github.io : overlay groupé par NATURE [Recettes / Charges déductibles / Prêt / Charges récupérables / Hors résultat foncier / Mes catégories] + icône par catégorie + cherchable + « Créer une catégorie » ; décisions user : disposition à plat, **PAS de numéros de ligne 2044** [jargon], prêt 1 ligne, frais de gestion/honoraires/compta fusionnés). **Corrections catégories + composant _catPk (formulaire) ✅ PROD v15.329** (`73e1e47` : fusion « Comptabilité / expert-comptable » → « Frais de gestion / honoraires / comptabilité » [221, neutre] ; flag **`pickerHidden`** sur « Prêt — Intérêts d'emprunt » [250] = hors menu de saisie libre, saisi via écran dédié `ov-fincredit`, conservé dans STD_CATEGORIES pour mapping 250 ; migration + cleanup + heuristique synchronisés. Composant `_catPk` [overlay design = `_affPk`, groupes dérivés de STD_CATEGORIES, créer-libre via addCat]. **BLOCKER d'audit corrigé** : `<select>` ne portant pas une valeur sans `<option>` [intérêts pickerHidden] → `mv-cat` devient `<input hidden>` + bouton-déclencheur → `_finCreditCreate`/`openEditMv` posent bien 250. **Audit code-reviewer : cœur fiscal [mapping+migration] PASSANT** ; picker UI vérifié navigateur + relu anti-XSS ; re-audit agent du picker à faire [limite session]). **Toast « charge répartie sur N lots » gaté ✅ PROD v15.330** (`1b8274f` : le toast info au save d'une charge d'immeuble ne se déclenche plus pour PNO/taxe foncière/gestion-compta [déductibles non répartis] — flag `repartImm` sur Charges de copropriété + `recup` ; n'affecte PAS la 2044 [toast informatif, charge déduite en totalité] ; vérifié navigateur). **Picker sur TOUS les écrans de saisie ✅ PROD v15.331** (`8eac030` : split `sp<j>-cat` + règles `rule<i>-cat` + import `imp<i>-cat` → `_catBtn`+`<input hidden>` ; dispatch `_catApplyChange` par préfixe tgt vers `_spMvOnCat`/`_ruleOnCat`/`_bankOnCat`/`_affOnCatChange` ; handlers inchangés = 0 impact fiscal ; 2 const `cats` morts retirés ; vérifié navigateur 3 sites + dispatch. **→ 1 seul composant catégorie partout, fin de la duplication des 7 selects à plat**). **Renommage « Prêt — Capital remboursé » → « Prêt » ✅ PROD v15.332** (`779d1a5` : intitulé simplifié [demande user], inchangé par ailleurs [special, ligne vide → HORS 2044 ; intérêts 250 toujours via écran dédié] ; synchronisé STD + migration + heuristique [shadow+module] + `_finCreditCreate` + somme « capital amorti » Finances + hints). **RE-AUDIT code-reviewer du picker complet [form+split+règles+import] + renommage = PASSANT** (composant `_catPk` : exclusion auto/pickerHidden OK, dispatch `_catApplyChange` slices OK, XSS escHtml complet, créer-libre OK ; 4 sites câblés sans lecture `<select>` résiduelle ; BLOCKER select-sans-option définitivement clos [hidden input]). **Fixes re-audit ✅ PROD v15.333** (`f5179e1` : [1] BLOCKER test `bank-import.test.js` asseyait l'heuristique sur l'ancien nom prêt → corrigé ; [2] **risque fiscal silencieux** = un custom « Prêt » legacy AVEC mapping 2044 perso aurait été écrasé par la précédence STD → **parade défensive dans initDB** AVANT `_CAT_MIGRATION` : custom « Prêt » mappé → renommé « Prêt (perso) » [mvts+règles+catégorie+mapping conservés] + toast info ; sans mapping → fusion inoffensive ; idempotent. Vérifié node 4 scénarios + navigateur boot clean). **→ PICKER CATÉGORIE UNIQUE COMPLET + AUDITÉ PASSANT sur les 4 écrans.** Reste : **chip sync 5 sandboxes `index-test*.html`** (non-prod, sandboxes + tests Vitest portent encore quelques anciens noms — `index-test-loyer.html` a encore « Prêt — Capital remboursé ») + **tests utilisateur**. specs `docs/superpowers/specs/2026-06-20-*` + `2026-06-21-*` · spec source `docs/subjects/V3-REFONTE-LOYERS.md` |
| V3-REFONTE-QUIT | Refonte fonctionnelle onglet Quittances | P2 | M | ⬜ À faire | 3e priorité |
| V3-REFONTE-REGUL | Refonte fonctionnelle onglet Régularisation | P2 | M | ⬜ À faire | 4e priorité · couvre BUG-CHARGE-001 + CHARGE-REGLES |
| V3-REFONTE-IRL | Refonte fonctionnelle onglet IRL | P2 | M | ⬜ À faire | 5e priorité · couvre IRL-VALIDATION |
| V3-REFONTE-PARAMS | Refonte fonctionnelle onglet Paramètres/Référentiel | P2 | M | ⬜ À faire | 6e priorité |
| V3-REFONTE-EQUIP | Refonte fonctionnelle onglet Équipements | P2 | M | ⬜ À faire | 7e priorité · inclut BUG-EQUIP-FILTER |
| DASH-V2 | Refonte dashboard 7 phases (one-screen ~900px) | P2 | XL | 🔄 En cours | v2 livré · cahier v2 avril 2026 · cf `project_immotrack.md` + `project_dashboard_onescreen.md` · 7 phases au total |

## 🟠 P2 — Bail (chantiers spécifiques planifiés)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| BAIL-PRINT-POLISH | Polish Bail (paraphes / en-têtes nav / cautionnement / logo entité / UX éditeur template) | P2 | M | ✅ Livré v13.05-13.29 | Points 1+6 obsolètes (source unique v13.05) · 2+3 cautionnement print v13.25-27 · 4 logo entité v13.28 · 5 UX éditeur template (mode lecture + mode avancé toggle) v13.29 |
| BAIL-PDF-NATIF | Refonte PDF Bail natif (pdf.text/pdf.rect + signatures + emplacements vides) | P2 | L | ✅ Livré v13.24 | Phase A-B-C livrées sessions 2026-04-26/27 · Phase D Notice arrêté 2015 livrée v13.24 commit 064c4c6 · cf `project_bail_pdf_native.md` |
| BAIL-TRAVAUX-INTERLOC | Champ "Travaux réalisés depuis précédent locataire" manquant dans le formulaire | P2 | XS | ✅ Livré v13.23 | commit 529e261 · textarea + visibilité conditionnelle (zone tendue/encadrement/<18 mois) |
| BAIL-LOC-ADR-PREC | Adresse précédente par locataire (au lieu d'un champ unique concaténé) | P2 | S | ✅ Livré v13.23 | commit 529e261 · 1 input par locataire + checkbox "même adresse" + migration legacy |
| BAIL-CLAUSES-PERSO | Clauses particulières personnalisables par entité (ou bail) — section "16 bis" injectée auto | P2 | S | ⬜ À faire | [docs/subjects/BAIL-CLAUSES-PERSO.md](docs/subjects/BAIL-CLAUSES-PERSO.md) · liste de {titre, contenu} dans entite.customClauses · injection HTML/PDF/Word · ~1-2h |
| BAIL-TYPES | Ajout 5 types bail (meublé/garage/mobilité/étudiant + Autre) | P2 | L | ⬜ À faire | 5 sous-phases A-E · cf `project_bail_types.md` · session dédiée après PDF natif |

## 🟠 P2 — Détectés en usage (par onglet)

| Code | Sujet | Prio | Taille | Statut | Détail |
|---|---|---|---|---|---|
| **Dashboard** | | | | | |
| DASH-KPI-HC | KPI occupation/rendement brut basés sur loyer HC, drill TTC | P2 | S | ⬜ À faire | [docs/subjects/DASH-KPI-HC.md](docs/subjects/DASH-KPI-HC.md) |
| **Mouvements** | | | | | |
| MVT-SCIND-CAT | Ajouter catégorie au scindage de ligne | P2 | S | ⬜ À faire | [docs/subjects/MVT-SCIND-CAT.md](docs/subjects/MVT-SCIND-CAT.md) |
| MVT-RECURRENT | Mouvements récurrents (assurance, prêt) avec récurrence configurable | P2 | M | ⬜ À faire | [docs/subjects/MVT-RECURRENT.md](docs/subjects/MVT-RECURRENT.md) |
| FEAT-VIR-INTERNE | Virements internes : auto-détection + rapprochement des 2 lignes jumelles | P2 | M | ⬜ À faire | Détaché de V3-REFONTE-LOYERS (audit 2026-06-05). La catégorie manuelle « à ignorer » est dans la refonte ; ici = auto. [docs/subjects/FEAT-VIR-INTERNE.md](docs/subjects/FEAT-VIR-INTERNE.md) |
| FEAT-PRET-ECHEANCIER | Échéancier de prêt : mémorise l'amortissement, pré-remplit le découpage capital/intérêts/assurance | P2 | M | ⬜ À faire | Détaché de V3-REFONTE-LOYERS (audit 2026-06-05). Découpage manuel possible dès la refonte ; ici = auto. Lié MVT-RECURRENT. [docs/subjects/FEAT-PRET-ECHEANCIER.md](docs/subjects/FEAT-PRET-ECHEANCIER.md) |
| **Charges** | | | | | |
| CHARGE-REGLES | Règles répartition charges (chauffage 30/70, eau compteur) | P2 | M | ⬜ À faire | [docs/subjects/CHARGE-REGLES.md](docs/subjects/CHARGE-REGLES.md) |
| **Entité** | | | | | |
| ENT-SAVE-IMM | Modifier entité : Enregistrer entité sauve aussi l'immeuble en saisie | P2 | S | ⬜ À faire | [docs/subjects/ENT-SAVE-IMM.md](docs/subjects/ENT-SAVE-IMM.md) |
| **MRH** | | | | | |
| MRH-AUTO-LOC | MRH : récupérer auto le locataire selon logement | P2 | S | ⬜ À faire | [docs/subjects/MRH-AUTO-LOC.md](docs/subjects/MRH-AUTO-LOC.md) |
| **Logement** | | | | | |
| LOG-PHOTOS | Photos illustratives sur la fiche logement (galerie permanente) | P2 | M | ✅ Livré v15.01 (Sprint 5C) | Sous-onglet **📷 Photos** dans LOG-FICHE-360. Grid 3 cols responsive (auto-fill 180px). Thumbnails IDB lazy-load (lazy="lazy" + setTimeout post-render). **Upload multiple** (input file `multiple` accept image/*) avec compression auto > 2 Mo. **Lightbox plein écran** : nav Prev/Next + Escape + clic outside. **Photo de couverture** : toggle ⭐/☆ marque `doc.isCover=true`, démarque les autres du logement. Stockage `DB.documents` { parentType:'logement', category:'photos' } + IDB + Drive `🖼️ Photos/`. Réutilise `_attachmentSaveForEntity` v15.00 + `_attachmentLoadBinary`. **Couverture dans cards Biens** : reportée V1.1 (nécessite chargement async des thumbnails dans render synchrone). |
| LOG-ANNONCE | Bouton "Générer annonce de location" pour logements vacants — **enrichi 2026-05-15 mode "qui fait rêver" type Leboncoin** | P2 | M (4-6h) + L si LLM | ✅ **Livré v15.207-211 (2026-05-27)** post-audit | [docs/subjects/LOG-ANNONCE.md](docs/subjects/LOG-ANNONCE.md) · **5 étapes livrées + audit code-reviewer + 6 fixes P0/P1** : v15.207-210 = module ES 103 tests + schéma DB + onglet Présentation + modale + PDF/Copier/Email · **v15.211 post-audit** = (F1) script `tools/sync-annonce-global-mirror.mjs` qui régénère le mirror IIFE depuis l'ES (avant : 8 variantes d'accroches manquaient en prod !) · (F2) fix SMS « balcon m² » résiduel · (F3) retrait mention « loi Carrez » trompeuse pour location, ajout loi Boutin pour meublé · (F4) fix étage absent → plus de « situé au  d'un immeuble » · (F5) avertissement DPE F/G/E avec citations loi Climat 2021-1104 + décret 2021-19 · (F6) bouton visible UNIQUEMENT sur logements vacants (`!_bienActiveBail(ref)`) · **1132 tests Vitest OK** (+9 audit) · différenciant marché vs Rentila/BailFacile |
| **Travaux / PJ** | | | | | |
| DOC-PJ | Pouvoir ajouter des PJ (factures, CR entretien, photos) | P2 | M | 🔄 **Phase 1 quasi-livrée v15.155-158** | [docs/subjects/DOC-PJ.md](docs/subjects/DOC-PJ.md) · **Drive v15.155** : tout DB.documents → Drive (dossier général hors-logement + rattrapage reconnexion). **PJ manuelle ajoutée** sur fiches Logement(déjà) + Entité + Immeuble + modales Assurance/MRH + Équipement (v15.156-158). Charges = couvert (Immeuble docs + mvt). **Reste** : Bail (modale wizard, reporté) + **Phase 2 : archivage AUTO des PDF générés** (quittance/IRL/régul/EDL/bail). 🔗 Phase C scan Drive→app toujours future. |
| TRAV-SUIVI | Suivi entretien / travaux avec calendrier | P2 | L | ⬜ À faire | [docs/subjects/TRAV-SUIVI.md](docs/subjects/TRAV-SUIVI.md) · CDC requis |
| **Courriers / Templates** | | | | | |
| DOC-CIVILITE | Reprendre civilité du locataire dans formules de politesse | P2 | XS | ✅ Livré v13.23 | commit 529e261 · helpers _civSalut/_civConge incluent maintenant les noms ("Madame ARSLAN, Monsieur HARNIST,") |
| BUG-EMAIL-PROPOSAL-IRL | Modale "Proposition de mail" IRL : boutons inactifs + salutation incorrecte (adresse au lieu du locataire) + date "Invalid Date" | P2 | S | ⏳ En attente sprint mail | [docs/subjects/BUG-EMAIL-PROPOSAL-IRL.md](docs/subjects/BUG-EMAIL-PROPOSAL-IRL.md) · détecté 2026-05-17 user · à traiter dans Sprint 19B EMAIL-ONGLET-PERMANENT |
| BUG-BANK-IMPORT-DEDUP | Import bancaire : doublons à l'import car `_bankDedup` actuel sur date+montant cassé si user édite après import | P1 | S | ✅ Livré v15.78 | [docs/subjects/BUG-BANK-IMPORT-DEDUP.md](docs/subjects/BUG-BANK-IMPORT-DEDUP.md) · commit `5cb8e3a` · fingerprinting stable (FNV-1a + DJB2 16 chars hex) sur ligne brute CSV/OFX (priorité FITID en OFX) · `_bankDedup` 2 stratégies cascade (fingerprint priorité + fallback legacy) · migration paresseuse OFX legacy · Vitest 811 → 837 (+26 tests dont CRITIQUE post-modification) · différenciant marché vs Rentila/BailFacile/Qalimo |
| BANK-IMPORT-V2 | Refonte import : **pointeur de progression par compte** (au lieu du dédup heuristique qui cassait sur CAF scindée + loyer décalé manuellement). Identification auto OFX (ACCTID) / CSV (hash en-têtes), modal compte 1re fois, modal 1er import 3 choix (date / tout / sélection), pointeur incrémental (slice après fingerprint) + fallback heuristique, UI Paramètres « 🏦 Mes comptes » (renommer/reset/supprimer). | P1 | M | ✅ Livré v15.160-163 | [docs/subjects/BANK-IMPORT-V2.md](docs/subjects/BANK-IMPORT-V2.md) · 6 phases A-F livrées · 21 nouveaux tests Vitest (924 → 936) · code review pre-release (fix bug grammaire + refacto fragile details.open → 4e radio + safety dispatcher) · **à valider en prod sur workflow bancaire réel** |
| **UX transverse** | | | | | |
| UX-GROUP-BY-IMMEUBLE | Tri visuel par immeuble avec séparateurs / headers — règle transverse tous onglets listant logements (IRL, Loyers, Quittances, EDL, Assurances, Équipements, Régul, Travaux…) | P2 | M (~3-5h) ou S (IRL seul) | 🔄 IRL livré v15.76 + drill-downs v15.77 · 9 onglets restants | [docs/subjects/UX-GROUP-BY-IMMEUBLE.md](docs/subjects/UX-GROUP-BY-IMMEUBLE.md) · IRL : groupage + headers collapsibles + KPI condensés + persist localStorage + 3 drill-downs (lots/alerts/compta) via modale unifiée · propagation onglet par onglet au fil V3-REFONTE-* |
| TOOLING-MOCKUP-DEVICE-TOGGLE | Toggle device fiable dans les mockups responsive (5 tentatives échouées 2026-05-17 → solution actuelle = DevTools F12) | P2 | S | ⏳ Dette technique | [docs/subjects/TOOLING-MOCKUP-DEVICE-TOGGLE.md](docs/subjects/TOOLING-MOCKUP-DEVICE-TOGGLE.md) · à reprendre en session dédiée tooling |
| **Associés** | | | | | |
| ASSO-PARTAGE | Refonte du fonctionnement du partage entre associés | P2 | L | ⬜ À faire | [docs/subjects/ASSO-PARTAGE.md](docs/subjects/ASSO-PARTAGE.md) · CDC requis |

---

## 🟠 P2 — Fonctionnel (concurrence / standards marché)

| # | Code | Sujet | Prio | Taille | Statut | Note CDC |
|---|---|---|---|---|---|---|
|  | EDL-TEMPLATE-PER-LOG | Template EDL personnalisable par logement (labels enrichis + on/off pièces+éléments + custom) — héritage auto vers nouveaux EDL | P2 | M (~6h) | ⬜ À faire | [docs/subjects/EDL-TEMPLATE-PER-LOG.md](docs/subjects/EDL-TEMPLATE-PER-LOG.md) · proposé par session parallèle 2026-05-02 · intégré planning LOG-FICHE-360 Phase 2 (Bloc C, sous-onglet 6 ou 7e de la fiche) · spec validée avec 2 réserves mineures (id stable + UX placeholder) · zone code propre côté EDL_TPL/openNewEDL · session parallèle peut coder en parallèle sans conflit |
| 16 | EDL-DELEGUE-EXPORT | EDL délégué : export HTML offline pour tiers | P2 | L | ⬜ À faire | Critères 2.15+16.5 · différenciant total absent de TOUS les concurrents |
| 17 | EDL-DELEGUE-IMPORT | EDL délégué : import JSON + statut À valider | P2 | M | ⬜ À faire | Critère 2.16 · complémentaire du point 16 |
| 18 | IMPORT-EXCEL-LOG | Import Excel logements/locataires (template SheetJS) | P2 | M | ⬜ À faire | Critères 14.1+14.2 · onboarding · SheetJS déjà embarqué |
|  | IMPORT-ACTE-VENTE | Création **bailleur + immeuble + logements** depuis l'**acte de vente** (PDF → pdf.js → extraction → wizard validation « suggéré »). Acheteur→entité (rattacher si existe, sinon créer) · adresse → immeuble · constitution → logements | P2 | L | ✅ **Livré PROD v15.247 (commit b6bc00a)** | [docs/subjects/IMPORT-ACTE-VENTE.md](docs/subjects/IMPORT-ACTE-VENTE.md) · design [docs/superpowers/specs/2026-06-01-import-acte-vente-design.md] · demande user 2026-06-01 (fil B2 v2-c1) · **voie A (heuristique locale, gratuite, sans backend) RETENUE**. **Phase A ✅** : `__tests__/helpers/acte-extract.js` **enrichi** (RCS+capital bloc-acquéreur · contenance cadastrale · surface totale · surfaces Carrez par lot · surface habitable · lots copro+désignation+tantièmes · étages énumérés · types FN · annexes) + `acteRegroup()` (merge lots→logements D4) + **54 tests Vitest** (1341 total OK) + calibré 4/4 actes réels (ENGEL→1 logement fusionné lots 5+6 / 34,79 m² / 21‰). **Phase B ✅ sandbox** (⚠️ ancienne note « v15.248 commit 9acbd7b » ERRONÉE : ce commit n'a jamais existé en prod ; le code import-acte était 100 % sandbox jusqu'au port PROD v15.247) : modal #ov-acte (barre Biens) → dépôt PDF 100% local (pdf.js) → champs « ✨ à vérifier » éditables + phrases sources + anti-doublon SIREN → récap. **Phase D ✅ v15.249 sandbox** (`index-test.html`) : `_acteExtract` enrichi + `_acteRegroup`/`_acteNormEtage` portés ; verif surface RCS/capital + contenance/surface immeuble + surf/n°lot/tantièmes par logement + notes de regroupement + annexes **éditables** (type via datalist prédéfini + saisie libre · précision n°/lot · mode rattacher/bien/ignorer ; fix retour test user 2026-06-02 « on ne peut pas modifier ») ; **`_acteApply` = CRÉATION RÉELLE** (entité rattachée si doublon sinon créée · immeuble nested · logements DB.logements · annexes triple-mode · `_drvHookEnsureEntity`/`_drvHookEnsureImmeuble` · `_auditLog`/`_stamp`/`saveDB`/`_refreshAfterMutation`). **#19 déroulé manuel = ABANDONNÉ** (décision user 2026-06-02 « on fait tout à plat » après mockup comparatif `mockups/import-acte-vente/deroule-vs-plat.html` → vérif à plat Variante A retenue). **Phase C ✅ sandbox** : sélecteur « Rattachée à » par annexe en mode rattacher (option=logement cible, masqué en mode bien, reclampé/réindexé à l'ajout/retrait de logement) + cible répercutée dans `_acteApply` (`createdLogs[targetIdx]` au lieu de `[0]`) + lignes annexes dans le récap. **Phase E ✅ sandbox** : double audit `superpowers:code-reviewer` (création multi-entités) → 0 bloquant ; correctifs appliqués+revérifiés [atomicité DB rollback si quota / hook Drive logements importés (`_drvEnsureLogementTree` batch + 1 toast) / réindexation targetIdx à la suppression / nbLots compte les annexes-biens] ; responsive 375/768/desktop OK (flex-wrap, 0 débordement) ; vitest 1411 + inline-JS 4/0. **Annexes add/split/remove ✅ sandbox** (retour test user 2026-06-02 « on ne peut pas splitter ou ajouter des annexes comme les logements ») : section ANNEXES toujours rendue (même à 0) + bouton ＋ Ajouter une annexe (`_acteAddAnnexe`) + 🗑 par ligne (`_acteRemoveAnnexe`) + compteur `acte-an-count` ; recollecte DOM avant mutation (saisies préservées) ; smoke-test live OK (add 1→2, edit préservé, bonne ligne supprimée, 0→bouton actif). **🟠 atomicité RÉSOLU** : `_auditLog`/`_stamp` gardés avant `saveDB()` (persistance happy-path Drive) MAIS rollbackés si `saveDB()` throw — purge audit par `_createdIds` (jamais l'entité doublon) + restore `_modifiedAt` entité. Re-audité `superpowers:code-reviewer` 2026-06-03 → 🟢 OK prêt à tester (0 bloquant ; seul 🟠 = quota localStorage avalé par saveDB, préexistant/hors périmètre). **Porté PROD v15.247** (`index.html` : bouton barre Biens + modal #ov-acte + 33 fonctions `_acte*` + annexe-split + fix 🟠 ; bump 4 emplacements + `sw.js` CACHE_VER ; 0 marqueur sandbox ; check-inline-js 4/0 ; parité fonctions prod 33 = sandbox ; vitest 1411) — **✅ Livré PROD v15.247 commit b6bc00a** (auto-push GitHub Pages OK 2026-06-03). B (LLM) = upgrade SaaS futur · **🆕 EXTENSION BAIL-REPRIS (Art. 1743) — ✅ Livré PROD v15.257 (commit `8e8e894`)** (branche `import-acte-bail-repris`) : à l'import d'un acte sur bien occupé, extraction occupation (locataire / loyer HC+charges / date d'effet / DG) via section 10 du parser `acteExtract` + `attachOccupations` (rattachement par lots, note si ambigu) ; toggle **« Reprendre le bail en cours »** par logement (variante A) dans l'écran de vérif → `_acteApply` crée un **vrai** `DB.baux[ref]` (`typeContrat:'repris'`, `type:'nu'`, **sans signature**, via module pur `buildReprisBail`) + cache occupation dénormalisé sur le logement (lot affiché occupé, pas vacant) ; `usedRefs` étendu à `DB.baux` (anti-écrasement d'un bail existant/tombstone) ; affichage `typeContrat:'repris'` (« Bail repris · Art. 1743 ») dans les générateurs Bail. Spec [docs/superpowers/specs/2026-06-03-import-acte-bail-repris-design.md] · plan [docs/superpowers/plans/2026-06-03-import-acte-bail-repris.md]. Module pur `__tests__/helpers/bail-repris.js` (+3 tests) ; parser occupation (+91 tests `acte-extract.test.js`). **Vérifs** : check-inline-js 4/0 · Vitest 46 fichiers / 1439 · parité inline↔helpers byte-identique. **✅ Intégré par la session maître 2026-06-05** : cherry-pick `e46940d` sur `origin/main` (`554bcbd`→`8e8e894`), conflit résolu = ligne de version uniquement (15.256→15.257 sur 4 spots `index.html` + `sw.js` CACHE_VER) ; gates post-résolution : check-inline-js 4/0 · `sw.js` syntax OK · symboles `_acteOccField`/`_acteToggleOcc`/`buildReprisBail` présents · Vitest inchangé (logique byte-identique à `e46940d`, 46/1439 worker). **P0-A Supabase NON publié** (isolé par cherry-pick depuis `origin/main`). Push → déploiement GitHub Pages. |
| 19 | QUIT-EMAIL | Envoi email quittances au locataire | P2 | M | ⬜ À faire | Critère 3.3 · standard chez tous concurrents |
| 20 | AVIS-ECHEANCE | Avis d'échéance avant paiement | P2 | S | ⬜ À faire | Critère 3.7 · manque vs Qalimo/Rentila/BailFacile |
| 21 | RAPPEL-IMPAYE | Rappel automatique locataire (impayé) | P2 | M | ⬜ À faire | Critère 4.12 · standard marché |
|  | IMPORT-CONCURRENTS | Migration depuis solutions concurrentes (Rentila / BailFacile / Qalimo / etc.) | P2 | L | 🔄 Structure livrée v14.94 (Sprint 3G) | `js/core/import-concurrents.js` (8 KB, 3 exports : `_mapRentila`, `_mapBailFacile`, `_mergeImport`). Mappers basés sur schémas publics : Rentila JSON (biens/locataires/baux/paiements), BailFacile XLSX (3 onglets Logements/Baux/Paiements). Politique merge : skip si ref existante (pas d'écrasement) + dédup mouvements par signature date+ref+montant. 18 tests Vitest. **UI reportée Sprint 4 polish** : nécessite exemples réels (fichiers anonymisés exportés par utilisateurs Rentila/BailFacile) pour ajuster les mappers aux formats exacts. Qalimo/ImmobilierLoyer/Smovin hors scope V1. |
|  | BIZPLAN-STRATEGIE | Étude de marché + business plan + positionnement + effort déploiement (B2C + B2B pro) | P2 | L | ✅ Livré 2026-04-30 | 5 livrables dans `docs/strategie/` : [BIZPLAN](docs/strategie/BIZPLAN.md) · [CARTE_POSITIONNEMENT](docs/strategie/CARTE_POSITIONNEMENT.md) · [PROJECTIONS](docs/strategie/PROJECTIONS.md) · [PLAN_ACTIONS](docs/strategie/PLAN_ACTIONS.md) · [EFFORT_DEPLOIEMENT](docs/strategie/EFFORT_DEPLOIEMENT.md) |
|  | BIZPLAN-V2 | Pitch commercial CGP + plan attaque opérationnel + CDC technique (V2 dossier) | P2 | XL | 🔄 En cours | [docs/subjects/BIZPLAN-V2.md](docs/subjects/BIZPLAN-V2.md) · 11 livrables (2 pptx + xlsx + pdf one-pager + 7 md/docx) sur 2-3 sessions dédiées · 4 décisions archi figées (Capacitor V1.1, PWA installable, 3 niveaux souveraineté, soft-block) · cible CGP/vendeurs · **+ concurrent #9 LocataireCloud ajouté 2026-05-18** |
|  | WATCH-LOCATAIRELIVE | Monitoring trimestriel concurrent LocataireCloud (locataire.live) | P2 | XS | 🔄 En cours | [docs/subjects/WATCH-LOCATAIRELIVE.md](docs/subjects/WATCH-LOCATAIRELIVE.md) · audit initial 2026-05-18 · 26 features roadmap publique · pricing lifetime 347 € × 50 places + futur SaaS 9,90-49,90 € · IA conv T2 2026 + app mobile native T4 + mandats agence T3 → menace cible CGP 2 trimestres avant V2 ImmoTrack |
|  | OUTILS-SEO-GRATUITS | Page /outils avec 10-15 calculateurs immobiliers (acquisition SEO V1 pre-launch) | P2 | L | ⬜ À faire | [docs/subjects/OUTILS-SEO-GRATUITS.md](docs/subjects/OUTILS-SEO-GRATUITS.md) · réaction LocataireCloud (16 calculateurs gratuits) · 4 calculateurs ⭐ différenciants (2044 preview / cession LMP-LMNP / loyer marché CLAMEUR / DPE plan rénov) · 8-10 j-h + 500 € HT rédactionnel · cible Q3 2026 |
|  | IA-COPILOTE | Module IA léger souverain (recherche sémantique Ctrl+K + copilote dashboard + catégorisation + clauses bail) | P2 | L | ⬜ À faire | [docs/subjects/IA-COPILOTE.md](docs/subjects/IA-COPILOTE.md) · parité concurrentielle LocataireCloud agent IA T2 2026 · 4 modules · posture "IA souveraine 100 % browser" (transformers.js + WebLLM Phi-3 opt-in) · 9-15 j-h V1.5 Q1 2027 |
|  | FOUNDER-EDITION | Pricing lifetime 249 € × 100 places acquisition early adopters pré-launch | P1 | S | 🔄 **Option (b) validée 2026-05-18** | [docs/subjects/FOUNDER-EDITION.md](docs/subjects/FOUNDER-EDITION.md) · réaction LocataireCloud (347 € × 50 places) · décision (b) 249 € × 100 places = 24 900 € cash up-front + 100 évangélistes · annonce juillet 2026 · setup 1,5 j-h Stripe + tag DB |
|  | BUG-MOBILE-MENU-PLUS | **P0 bug fonctionnel mobile** : menu "Plus" bottom nav ne s'ouvre pas → 12 fonctions sur 16 inaccessibles mobile | P0 | S | ✅ **Livré v15.140** | [docs/subjects/BUG-MOBILE-MENU-PLUS.md](docs/subjects/BUG-MOBILE-MENU-PLUS.md) · "Plus" ouvre la sidebar overlay + backdrop (tap=ferme), garantit rendu sidebar V4 · commit 68b5fa9 · ⚠️ test device user à confirmer |
|  | BUG-MOBILE-DASH-PROFILES | **P0 bug fonctionnel mobile** : sélecteur profil dashboard (Solo/Premium/Gestionnaire) inaccessible mobile | P0 | XS | ✅ **Livré v15.140** | [docs/subjects/BUG-MOBILE-DASH-PROFILES.md](docs/subjects/BUG-MOBILE-DASH-PROFILES.md) · pills mode dashboard-only (plus sur Accueil) · mode "Solo" supprimé (redondant page Accueil) → migration 'solo'→'premium' · "Tableau de bord" réapparaît dans sidebar · commit 68b5fa9 |

---

## 🔵 P3 — Petits sujets / nice-to-have

| Code | Sujet | Prio | Taille | Statut | Détail |
|---|---|---|---|---|---|
| BAIL-A-ECHOIR | Bail : "à échoir" par défaut | P3 | XS | ✅ Livré v13.23 | commit 529e261 · data DEMO modalitePaiement de "terme_echu" → "echeoir" |
| MVT-SCIND-LIMIT | Mouvements : limite scindage ligne ? | P3 | XS | ⬜ À faire | [docs/subjects/MVT-SCIND-LIMIT.md](docs/subjects/MVT-SCIND-LIMIT.md) · investigation |
| LOG-DG-LABEL | Logement : label "DG" explicite (Dépôt de Garantie) | P3 | XS | ⬜ À faire | [docs/subjects/LOG-DG-LABEL.md](docs/subjects/LOG-DG-LABEL.md) |
| BAIL-PARAPHE-PLACEHOLDER | Bail : supprimer le texte "à compléter" dans cadre paraphe locataire | P3 | XS | ⬜ À faire | [docs/subjects/BAIL-PARAPHE-PLACEHOLDER.md](docs/subjects/BAIL-PARAPHE-PLACEHOLDER.md) |
| BAIL-NAMESPACE-MIGRATION | Retirer alias globaux Bail.* — migration onclick inline → addEventListener | P3 | XL | ⏳ En attente | [docs/subjects/BAIL-NAMESPACE-MIGRATION.md](docs/subjects/BAIL-NAMESPACE-MIGRATION.md) · ~35 onclick bail à migrer + event delegation pour les renders dynamiques · 3-4 jours · pas avant V3-VISUEL et V3-REFONTE-BAIL terminés |

---

## 🔵 P3 — Module agence + SaaS (CDC requis avant tout code)

| # | Code | Sujet | Prio | Taille | Statut | Note CDC |
|---|---|---|---|---|---|---|
| 25 | AGENCE-GESTION | Module agence : gestion pour compte de tiers (mandants) | P3 | XL | ⬜ À faire | Critères 11.2-11.6 · rupture modèle données · CDC requis |
| 26 | AGENCE-CRG | Module agence : relevé de gérance mensuel (CRG) | P3 | XL | ⬜ À faire | Critère 11.3 · cœur métier admin de biens |
| 27 | AGENCE-HONORAIRES | Module agence : honoraires gestion paramétrables | P3 | L | ⬜ À faire | Critère 11.4 · % loyer + forfait |
| 28 | LEGAL-2072 | Liasse 2072 SCI IR | P3 | XL | ⬜ À faire | Critère 7.3 · seul ImmobilierLoyer le propose · différenciant SCI |
| 29 | SIGN-EIDAS | Signature électronique eIDAS (via prestataire) | P3 | L | ⬜ À faire | Critère 13.6 · valeur légale renforcée vs canvas |
| 30 | PORTAIL-LOC | Portail locataire (accès en ligne lecture) | P3 | XL | ⬜ À faire | Critère 12.7 · nécessite SaaS |
| 31 | SAAS-MULTIUSERS | Multi-utilisateurs + rôles (SaaS) | P3 | XL | ⬜ À faire | Critères 16.1+16.2 · backend nécessaire · CDC architecture SaaS requis |
| 32 | **IA-V2** 🔮 | Module IA opt-in "Pro Connect" : OCR DPE/diagnostics + OCR factures + OCR justifs candidat + annonce LLM + classification Drive auto | V2 | L (15-25h) | ⬜ V2 post-commercialisation | [docs/subjects/IA-V2.md](docs/subjects/IA-V2.md) · 5 use cases prio + 4 secondaires + 5 écartés (risque juridique) · tier payant ~5€/mois SaaS · zéro coût récurrent ImmoTrack V1 · différenciant majeur marché FR (Rentila/BailFacile/Qalimo = aucun OCR) |

---

## 🟡 V1+ post-commercialisation Drive

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| DRIVE-2K | Arborescence Drive par dossier entité (JSON+Baux+EDL ensemble pour partage simple) | P2 | M | ⬜ À faire | [docs/subjects/DRIVE-2K.md](docs/subjects/DRIVE-2K.md) · à combiner avec DRIVE-2H |
| DRIVE-2I | Audit log + history Drive | P2 | S | ⬜ À faire | Pour support client · [docs/subjects/DRIVE-2I.md](docs/subjects/DRIVE-2I.md) |
| DRIVE-2J | Field-level conflict resolution | P3 | M | ⬜ À faire | Nice-to-have · [docs/subjects/DRIVE-2J.md](docs/subjects/DRIVE-2J.md) |

---

## 🔄 En cours

### Phase B — Refonte UX dashboard wahoo (agent design v2 en background)
> Mockup v1 noté 6/10 par user (sobre ≈ coloré, solo ≈ pro, scroll non respecté, pas de Gestionnaire). Agent design v2 lancé avec brief enrichi : Boursorama (couleurs) + Deliveroo (UX action-oriented), 3 profils × 3 thèmes = 9 mockups, contrainte dure 1 écran 1440×900 sans scroll, info en 1-2 clics max.
>
> **Output attendu** : `docs/strategie/dashboard-mockups/v2-refonte-2026-05-15.html` + plan markdown. Cible note ≥ 9/10.
>
> Implémentation Phase B code en attente validation visuelle des mockups.

### Phase C — Audit navigation + onglets par profil (audit livré, implé en attente)
> Audit complet livré : [NAV-AUDIT-PROFILS.md](docs/subjects/NAV-AUDIT-PROFILS.md). Verdict par onglet (Garder/Reclassifier/Refondre/Sortir-top-nav) + sidebar cible Solo (5) / Gestionnaire (10) / Pro (10+ multi-portfolio).
>
> 6 sous-sprints C1-C6 identifiés (22-40h total) : nav adaptative profils · scinder Import patrimoine/comptable · sortir EDL/IRL/Régul du top-nav · refonte Agenda · décision Assurances · fusion Paramètres+Export.
>
> Pré-requis avant code : validation mockup Phase B + brief user clarifié pour Agenda (C4) et Assurances (C5).

---

## 🔧 Dette technique ARCHI-FICHES-UNIFIED (post-clôture cycle v15.224)

> **Cycle audit clos 2026-05-29** après 8 audits code-reviewer agent successifs (F→G→H→I→K→N) sur 12 commits v15.212-224. Verdict final agent : « OK avec réserves mineures — le cycle peut être clos. »
>
> Les findings ci-dessous sont des **améliorations qualité non-bloquantes**. Aucune ne touche à la sécurité ni à l'immutabilité légale.

### Session 3 Phase 3c — Cleanup brutal lectures (REPORTÉ session dédiée, ~14h)
**Périmètre** : ~149 sites de lecture `bail.X` (champs bien) + ~79 sites `log.X` (bail courant) → migrer vers `_readLogForBail(bail, log).X` / `getCurrentXxx(ref).X`. Puis suppression définitive ~30 champs bail legacy + 9 champs log legacy + retrait du palliatif `_syncLogToBail` v14.16.

**Plan d'attaque révisé (agent audit v15.224)** — 14h sur 3 sessions :
- **3c-a (~2h)** : catalogue les 228 sites en 3 buckets via grep automatisé
  - Bucket A *safe-to-rename* : lectures dashboard/listings/UI (~120 sites)
  - Bucket B *PDF/legal-critical* : `_buildBailHtml`, `_buildBailPdf`, `acteCautionnement`, `genQuittance`, snapshots (~50 sites) → **tests pixel-near obligatoires**
  - Bucket C *ambigus* : Drive sync, exports comptables, migrations (~58 sites)
- **3c-b (~3h)** : Bucket A — sed/grep brutal, un sous-onglet à la fois, commit par sous-onglet
- **3c-c (~4h)** : Bucket B — refonte ciblée, screenshot before/after par PDF, dérive retirée du chantier
- **3c-d (~3h)** : Bucket C — cas par cas (Drive particulièrement sensible)
- **3c-e (~2h)** : audit agent obligatoire + sync sandbox + bump version

**Alternative** : conserver en dette permanente jusqu'à bug réel sur les lectures, puis traiter ad-hoc. Cohérent avec règle « pas de solution passable ».

### Findings P3 mineurs (à traiter à l'occasion, ~30 min cumulé)
| ID | Description | Trivialité |
|---|---|---|
| **N5** | Vraie suppression du corps `_rBauxLegacyCards_DEPRECATED_v15_224` (~95 lignes mortes, signature renommée v15.224 mais corps toujours présent) | 5 min |
| **K3** | Mobile : 5-6 boutons `.loc-actions-b` flex tassés en téléphone — validation visuelle user requise | UX |
| **K4** | Classe `bien-card-menu` manquante sur certains boutons ⋮ (handler global L34331 exempte cette classe pour défensif) | 2 min |
| **K5+K6** | Pré-existants v15.220 : escaping `data-attr` HTML vs CSS selector, duplication logique daysLeft (résolu N1 mais autres sites) | 10 min |
| **P2-K** | Toggle UI pour `_biensFilters.layout` (`blocks-a` / `cards-b`) — utilité douteuse si user ne switch jamais | À supprimer ? |
| **P2-L** | Sticky `z-index: 5` sur `.imm-block-a-header` vs topbar — validation visuelle requise | UX |
| **P2-M** | `:before` labels FR hardcodés (`💰 Loyer`, `📅 Échéance`) — i18n V2 commercialisation | V2 |
| **P2-N** | `parseInt(etage)` → "RDC" = 0 et "Sous-sol" = 0 collision tri (rare) | 3 min |

### Findings P2 réserves agent v15.224
- **N1/N2 résolus v15.225** : pastille A double parenthèse + perte date `(échu)` — fix utilise `ech.text` intégral
- **N3 résolu v15.225** : commentaire inline → pointer vers `__tests__/helpers/loc-display.js` anti-désync
- **N4 cosmétique** : taille indiquée commit msg (5 281 040) ≠ taille réelle (5 303 885). Sans impact.

### Follow-ups P2 audit v15.231 (Phase A hotfix bail)
- **P2-A** — `openBailHist` (lecture bail archivé, ~L13424/L13450) n'applique PAS le fallback bien `_lbFill` (volontaire : un bail archivé/signé doit rester figé). MAIS si un bail archivé **non signé** a des champs bien vides, ils le restent. À évaluer : backfill depuis snapshot pour les archivés non signés. Non-bloquant.
- **P2-B** — diff-highlight aperçu bail (~L17235) peut produire un faux-positif « modifié » sur les champs bien désormais backfillés depuis le log (la valeur affichée diffère de `bail.X` brut stocké). Cosmétique. À vérifier visuellement à l'occasion.

---

## ⚠️ Limitations connues (documentation produit)

### I3 — Baux signés AVANT v15.218 : immutabilité partielle
**Sujet** : ARCHI-FICHES-UNIFIED Session 3 / immutabilité bail signé.
**Découvert** : audit code-reviewer v15.218 (2026-05-29).

Pour les baux **signés en v15.215, v15.216 ou v15.217** où l'utilisateur a modifié l'immeuble parent (adresse, CP, ville, période, régime, syndic, équipementsCommuns) **entre la signature et le premier boot post-upgrade vers v15.218**, le `bailSnapshot.imm` capturé par `_migrateArchiV1IfNeeded` fige l'imm POST-modification, pas l'imm au moment EXACT de la signature.

**Impact** : le PDF re-rendu d'un tel bail signé peut afficher une adresse différente de celle qui figurait sur le PDF original signé.

**Mitigation** :
1. Pour les nouveaux baux signés en v15.218+ : faille FIXÉE (capture immédiate via `_wizV2PersistSignatures` H1).
2. Pour les baux historiques affectés : vérifier manuellement le PDF figé (« Voir bail signé ») et comparer à la version PDF originale archivée Drive. Si divergence détectée → contacter le bailleur.

**Pourquoi pas fixable techniquement** : impossible de reconstruire un historique d'imm qui n'a jamais été capturé. Limite par nature, pas un bug.

---

## ✅ Livré récemment

### REFONTE-NAV — refonte complète de la navigation (2026-07-10, v15.455)
> **Déclencheur** : « sur téléphone/tablette on ne retrouve pas tous les onglets ». Cause réelle = **3 systèmes de nav désynchronisés** (sidebar V4 générée · sidebar legacy morte · bottom-nav + feuille « Plus ») → `finances`/`candidats` **injoignables sur mobile**.
> - **Une seule source de vérité `_V4_NAV_MODEL`** génère sidebar + bottom-nav + feuille « Plus » (fin de la triple divergence). **8 onglets en 3 zones** (Pilotage · Gestion locative · Argent) + **sous-onglets** (`_NAV_GROUPS`/`_navSubtabsHtml`, réutilise `.tabs/.tab`).
> - **Réglages hors des onglets** → menu compte (popover `v4s-acct-pop` : Personnaliser le menu · Paramètres · Import de données · Sauvegarde & export · Déconnexion). Import bancaire reste son bouton dans Loyers ; Finances = sous-onglet de Pilotage ; Quittances = sous-onglet de Loyers ; Candidats → « Candidatures ».
> - **Menu personnalisable par compte** (`_MENU_PRESETS` Propriétaire/Gestion locative/Comptable + interrupteurs par onglet/sous-partie, `_lsKey('immo_menu_on')`) ; **Accueil + Logements verrouillés** (`_MENU_LOCKED`, jamais de menu vide) ; page masquée reste joignable `#p-id`.
> - **Mobile** : feuille « Plus » liste les 3 zones + 8 onglets + 14 sous-parties → **tout joignable** (fix du bug). Tablette = sidebar complète libellée.
> - **Ids `#p-<id>` INCHANGÉS** (compat deep-links/back/refresh) — regroupement au niveau menu, pas en renommant les pages. Onglet parent atterrit sur sa 1re page **encore activée** par le menu perso (`_navSidebarLanding` + surlignage via `data-nav`).
> - **Vérifs** : mockup-first validé (`mockups/refonte-nav/`, fidèle au vrai style) · **5 phases**, 2 audits `superpowers:code-reviewer` **PASS** (phase 1 byte-identique · phases 2a-4 « SÛR prod » + 2 findings IMPORTANT corrigés+vérifiés : landing enfant-activé, Import de données réintégré) · check-inline-js **5/0**. Intégré par MERGE dans worktree jetable, **2 reset+re-merge** sur `origin/main` mouvant (v15.452→453→454, autres sessions), **conflits = lignes de version uniquement**, renum→**455**, FF push `c1d6410..747050d`. Spec `docs/superpowers/specs/2026-07-08-refonte-navigation-design.md`. ⚠️ **jamais vu navigateur réel peuplé** → smoke test prod requis (sidebar 8 onglets/sous-onglets · feuille Plus mobile · menu perso Comptable). Communications laissée hors menu (choix user). Polish optionnel : bottom-nav 4 primaires à relabeliser, noms (Suivi, Loyer (IRL)).

### BUG-RENAME-CLOUD-DUP — renommer un bien créait un DOUBLON cloud (2026-07-08, v15.439)
> **Signalé par user au test** : renommer un bien en **créait un deuxième** (l'ancien réapparaissait au rechargement) ; c'était aussi la vraie cause du « Bien introuvable ». Régression du cœur de sync, données réelles → **priorité absolue**.
> - **Cause** (confirmée `store-mapping.js:58/101` + `store-sync.js`) : les collections à **clé naturelle mutable** — `logements` (par `ref`) et `baux_historique` (par `ref|_archivedAt`) — étaient énumérées **par référence directe** (`db => db.logements`), alors que `immeubles`/`baux` copiaient déjà (`.map(x => ({...x}))`). Le `baseline` (photo du dernier état synchronisé) partageait donc l'**objet vivant**. `renameLogementRef` mute la ref **EN PLACE** → rétro-corrompait le rec du baseline → au flush, la branche `remove` recalculait l'uuid depuis la **nouvelle** ref (l'uuid dérive de la ref) → supprimait la ligne qu'elle venait d'insérer et **laissait l'ancienne vivante** = doublon/résurrection au reload.
> - **Fix** : `spread` à l'énumération pour `logements` + `baux_historique` (fige l'identité de suppression au seed), + `entites` en défensif (l'audit a établi que `saveEnt` **remplace** l'objet → entités jamais buggées, mais invariant homogène).
> - **Vérifs** : TDD **3 tests round-trip renommage** (reproduisaient le bug ROUGE → verts) · **audit `superpowers:code-reviewer` PASSANT** — a trouvé que `baux_historique` (table de **preuve**) était omis du 1er jet → ajouté au même commit ; a corrigé le récit (entités = remplacement, pas mutation). Collections keyées par `id` immuable = à l'abri (rename recâble les FK, id inchangé). Suite **1833+ verts** (3 échecs pré-existants sans rapport). Livré via **worktree jetable** off `origin/main` (une autre session éditait `backup.js` dans le worktree partagé — non touché, zéro interférence). **origin/main `62f9095`, v15.439.**
> - ⚠️ **Doublon déjà créé PAS auto-nettoyé** (ligne orpheline old-ref persiste en base) → nettoyage manuel après reload (à cadrer avec Didier selon ce qu'il voit). Fix = **préventif**.

### EDL-LEGENDE — légende des états N/B/U/M/– dans le PDF de l'état des lieux (2026-07-08, v15.435)
> **Demande user** : les codes d'état (N/B/U/M/–) apparaissaient en lettres nues dans le PDF EDL, sans clé de lecture. Or l'état conditionne l'**imputation des dégradations** (qui paie) → portée juridique.
> - **Variante détaillée validée (mockup)** : petit tableau `Code · État · Signification` avec pastilles couleur, inséré **juste avant l'inventaire des pièces** dans `generateEDLPdfNative` (index.html). Reprend la portée juridique : « État d'usage → vétusté normale, **non imputable** » / « Mauvais état → dégradation anormale, **à charge du locataire** ».
> - **DRY** : réutilise les constantes globales `EDL_ETATS`/`EDL_ABBREV`/`EDL_DESC`/`EDL_COLORS` (source unique, zéro recopie) + helper local `_edlHexRgb` (hex→RGB pour autoTable). Légende **mobilier** laissée telle quelle (barème distinct : U = « Usagé fonctionnel », HS).
> - **Vérifs** : **audit `superpowers:code-reviewer` SAFE** (didParseCell OK, row.index aligné body, pas de casse de la pagination « 1 pièce/page », légende fidèle aux codes réellement imprimés, DRY confirmé) — 1 mineur corrigé (réserve `newPageIfNeeded` 46→54 pour que la légende ne se coupe jamais en 2 pages). check-inline-js 5/0. **origin/main `c3a0c78`, v15.435.** Reste : test user (générer un EDL et vérifier la légende).

### RENOMMER-BIEN — renommer la référence d'un logement (cascade complète) (2026-07-07, v15.426)
> **Demande user** : la réf d'un bien était `readOnly` en édition → impossible de corriger un nom (cas principal : bien vacant fraîchement créé). « Indispensable en utilisation ».
> - **Module pur `js/core/rename-logement.js`** (exposé `window._renameLogement`) : `validateNewRef` (format 60 max + collision `norm()` tombstones inclus + no-op) · `canRenameLogement` (bloque si bail courant/historique `.signatures.locked||.signedAt` ou EDL signé — immutabilité légale) · `renameLogementRef` valide+garde PUIS reporte. Réutilise le patron cascade de `saveEnt` (comme BUG-ENT-RENAME-CASCADE v14.51), pas une copie.
> - **15 rattachements** : logements[].ref, baux (re-clé la MAP + b.ref), baux_historique (.ref+.logement), mouvements.qui (pas SCI:), quittances.logement, edl.logement, assurances.logement, mrh.logement, agenda.logement+autoKey, documents.parentRef/logRef (parentType=logement), candidats.logRef, + **blob config** compteursReleves (map), equipements (map), irlHistorique.ref, candidatLinks.logRef. **L'audit code-reviewer a trouvé 4 rattachements du blob que j'avais omis** (compteurs/équipements/IRL/liens candidat) → sans eux, ces données devenaient injoignables après renommage → corrigés + testés.
> - **UI** : bouton « ✏️ Renommer » dans la modale d'édition du bien (`_openRenameLog`/`_renameLogLive` aperçu live sur COPIE non-mutante/`_doRenameLog`) + modale `#ov-rename-log` (état bloqué si signé, sinon input+validation live+aperçu « N éléments seront mis à jour »). `_auditLog('update',...)`.
> - **Côté cloud** : renommer change `detUuid('logement', norm(ref))` → sync fait delete(ancien)+insert(nouveau)+ré-insert enfants (FK résolus via `logementByRef`). Propre pour bien vacant.
> - **Vérifs** : TDD **11 tests** (`rename-logement.test.js`, les 15 rattachements + maps re-keyées + autre bien intact) · **audit `superpowers:code-reviewer` PASSANT** (2 axes catastrophiques SÛRS : immutabilité légale re-validée dans le chemin de mutation + pas d'orphelin cloud ; 4 rattachements omis rattrapés) · check-inline-js 5/0. Spec `docs/superpowers/specs/2026-07-06-renommer-bien-design.md` + plan. **origin/main `d0a96d0`, v15.426.**
> - **BUG-RENAME-FICHE-360 (trouvé au 1er test user, corrigé v15.429+v15.430)** : la fiche 360 ouverte affichait « Bien introuvable » après renommage. Cause = `_currentLogFicheRef` (pointeur de la fiche) **EST la réf** ; `_doRenameLog` changeait la réf en base mais pas le pointeur → re-render de l'ancienne réf disparue (le renommage d'**entité** n'a jamais ce bug : fiche pointée par un **id stable**). Fix : redirection via le chemin canonique **`openLogFiche(newRef, true)`** (repose pointeur + hash + titre + rendu) + param `replace`→`replaceState` qui **collapse l'entrée d'historique morte** (un Retour navigateur ne retombe plus sur l'ancien nom). check-inline-js 5/0. **origin/main `598ba10`, v15.430.**
> - **Reste** : re-test round-trip cloud user (renommer un bien vacant, vérifier fiche OK + Retour navigateur + reload/2e device).

### V3-REFONTE-LOYERS P0 (FEAT-REGIMES) — la 2044 exclut les lots meublés (BIC) (2026-06-12, v15.278)
> **Objectif** : la déclaration 2044 ne couvre que la location NUE. Les lots loués meublés (BIC/LMNP) ne doivent plus polluer le résultat foncier (correctness avant tout moteur multi-régime).
> - **Nouveau module pur `js/core/regime-lot.js`** : classifieur multi-source de la nature d'un lot — `bail.type` → **`logement.typeUsage`** (LA source réelle : `bail.type` n'est rempli que sur 2 baux sur 24) → `bail.typeContrat` legacy → défaut nu. **Jamais d'exclusion silencieuse** (dans le doute = foncier). `splitFonciereLots` répartit le scope en foncier / exclus (meublé) / flagués (mixte ou usage à qualifier).
> - **Builders panneau + wizard** (`_legal2044BuildOpts`, `_legal2044WizardOpts`) excluent les meublés de `refs` (scope mouvements) ET `nbLocaux` (forfait 222). Encart « Périmètre foncier » **symétrique** : panneau, wizard (step 3+4), PDF, CSV (transparence anti-redressement).
> - **Vérifs** : TDD **23 tests** (`regime-lot` + transparence CSV) · audit `superpowers:code-reviewer` **PASS** (2 critiques data-shape rattrapées : sans le fallback `typeUsage` et le filtre histo `.ref`, le lot meublé réel **« RDC gauche »** restait à tort dans la 2044) · check-inline-js 4/0 · suite worktree 1605 verts · **validé sur l'export réel** (RDC gauche + F3 exclus, Ferrette - Bar flagué, 35/37 foncier). Sandbox-first (`index-test-loyer.html`) → port prod via worktree/QUEUE (rebasé 2× sur `origin/main` mouvant, 0 conflit hors version, renum 276→278). **origin/main `059e41e`, v15.278.** Reste **P2** : ventilation immeuble mixte + découpage temporel par mouvement + moteurs BIC/SCI (cf `docs/subjects/FEAT-REGIMES-FISCAUX.md`).

### BUG1-DEPOT-DIAGNOSTICS + vrai fix clic-dehors + cabinet DPE (2026-06-10, v15.274)
> **Demande user** : pouvoir déposer les PDF de diagnostic dans l'onglet Diagnostics d'un bien **pas encore enregistré** (avant : message « Enregistre d'abord le logement »).
> - **Bug 1 (dépôt avant save)** : zone de dépôt visible pour un bien neuf → PDF bufferisés dans `_logDiagDraft.pendingDocs` (mémoire, jamais persisté seul) + lecture auto immédiate (pdf.js → ADEME) + badge « ⏳ à enregistrer » → rattachés via `_attachmentSaveForEntity` au `saveParamLog`. Annulation/✕ → `_closeLogGuarded` confirme avant perte. Bien existant **inchangé**. Pattern buffer+flush réutilisé de l'import d'acte.
> - **VRAI fix clic-dehors** : le fix v15.268 (inline `closeBg` no-op) était **inefficace** — `js/main.js` (`window.closeBg = closeBg`) expose la version **module** `js/components/modal.js` au boot, qui écrasait l'inline. Corrigé à la vraie source (`modal.js` no-op) + test `components.test.js` aligné (`toBe(false)`).
> - **Cabinet DPE** : l'ADEME ne renvoie pas le diagnostiqueur ; sur un DDT combiné c'est le même cabinet que plomb/amiante → appliqué à la ligne DPE si vide (`_logDiagApplySuggestions`), sans toucher classe/GES/date.
> - **Vérifs** : audit `superpowers:code-reviewer` **PASS 0 bloquant** (mémoire vidée flush+réinit, zéro orphelin à l'annulation, flush IDB-first sûr même Drive offline, non-régression `_handleAttachmentUpload`, injection escHtml, parité). **Vitest 1512 passed**. check-inline-js 5/0. Sandbox-first (`index-test.html`, validé user via serveur local). **origin/main `df55247`, v15.274** (rebases successifs bail-sign 271→273, renum 270→274). Spec + plan + mockup commités.

### FIX-CLOSEBG-CLIC-DEHORS — clic dehors ne ferme plus — ⚠️ INEFFICACE (inline `closeBg` écrasé par le module au boot), VRAI fix en v15.274 ci-dessus (2026-06-09, v15.268)
> **Demande user** : « dès qu'on clique en dehors de la bulle, la fenêtre se ferme » — sur **tous les pop-up**. Risque = perte de saisie (et bientôt les PDF en attente du bug 1 dépôt-avant-save).
> - **Cause** : `closeBg(e,id){ if(e.target===el(id)) closeM(id); }` — 1 fonction partagée, branchée sur **54 modales `.ov`** via `onclick="closeBg(event,'…')"`.
> - **Fix** : `closeBg` rendue **inerte** → plus aucune modale ne ferme au clic sur le fond ; fermeture via ✕ / Annuler / Enregistrer. **No-trap vérifié** : les 54 modales ont toutes un `closeM`. `_closeBailWizardBg` (wrapper backdrop `ov-bail`) rendu inerte aussi (sinon un clic-fond effaçait `_pendingCandidatConv` sans fermer ; cette conversion candidat n'est nettoyée qu'à une vraie fermeture `_closeBailWizard`/✕ ou un `openBail`).
> - **Hors-scope (laissé exprès)** : menus de navigation (`more-ov`, `sb-backdrop`) → tap sur le fond = ferme (UX mobile normale, aucune donnée perdue).
> - **Vérifs** : check-inline-js **5/0** · `node --check sw.js` OK · 0 appel `closeBg` résiduel · aucun autre pattern backdrop (`target===this`) · parité `index.html`+`index-test.html`. Worktree off `origin/main` (v15.267 après b1), commit `d92ff18` → FF push → **origin/main = v15.268**.

### HOTFIX-PDF-LIBS-COMMA — virgule manquante cassait TOUTE la génération PDF en prod (2026-06-09, v15.266) · P0
> **Bug user** (console live, déployé) : dépôt d'un PDF de diagnostic → toast `Lecture auto du PDF impossible (pdfjs base64 introuvable (window._BAIL_PDF_LIBS.pdfjs))`. Le DPE ne se remplit pas (« rien n'est repris »).
> - **Cause racine** : `Uncaught SyntaxError: Unexpected identifier 'pdfLib'` (index.html L14). La valeur `pdfjsWorker` (L13) du bloc inline `window._BAIL_PDF_LIBS = {…}` n'avait **pas de virgule** avant la clé `pdfLib` ajoutée en v15.263 (`bail-sign-c3`, « pdf-lib vendored »). Le `<script>` entier plantait → `window._BAIL_PDF_LIBS` **undefined** → **pdf.js, lecture auto DPE, génération bail PDF ET quittances PDF cassés** en prod (v15.263→265). 1 caractère.
> - **Pourquoi le CI ne l'a pas vu** : `scripts/check-inline-js.mjs` **sautait** précisément ce bloc (`if (code.startsWith('window._BAIL_PDF_LIBS')) continue;`) → le seul bloc non validé était celui qui a cassé. **Durci** : ne saute plus (`new Function` COMPILE sans exécuter → valide la syntaxe sans décoder le base64).
> - **Fix** = 1 virgule en fin de L13 + bump v15.265→266 (4 spots `index.html` + `sw.js` CACHE_VER). Worktree off `origin/main`, commit `0522efe` → **FF push `952b067..b35cab4`**. **origin/main : `952b067` → `b35cab4`, index.html = v15.266.**
> - **Vérifs** : check-inline-js durci **5/0** (attrape le cassé `FAIL pdfLib`, passe le corrigé) · exécution runtime du bloc corrigé → 6 clés présentes, **pdfjs 426672 car.** · `node --check sw.js` OK. Diagnostic 100% par la console user (fichier servi = source git intact → bug code, ni cache SW ni Jekyll). Worktree jetable créé+supprimé. **Prochaines branches index : rebaser sur `b35cab4` (v15.266), prendre v15.267+.**

### BUG-RECREATE-REF-TOMBSTONE — bien recréé avec une réf supprimée restait invisible (2026-06-08, v15.262)
> **Bug user** (prod, diag live console) : « quand j'enregistre un bien, il n'apparaît pas, mais le Drive se crée ». Cause racine confirmée par **test contrôlé** : réf neuve `ZZZ-NEUF-42` → visible ✅ ; réfs réutilisées `Logt 3/4/5` → `_deleted:true` invisibles ❌. Quand on recrée un bien dont la **réf existe déjà en tombstone** (ex. supprimé par la cascade de suppression d'immeuble v15.248), `saveParamLog` le retrouve via `find(l=>l.ref===ref)` (qui n'exclut pas les tombstones), le traite comme une **édition** (`isNew=false`), réécrit les champs MAIS laisse `_deleted:true` → le bien reste un tombstone → invisible partout (`_isAlive`) et figé par Drive. Le dossier Drive est bien créé (hook en fin de save) → d'où le symptôme « le Drive se crée ».
> - **Fix** : dans `saveParamLog`, si `find` tombe sur un tombstone → `wasTombstone` → traité comme **création** (`isNew`) + `delete log._deleted; delete log._deletedAt;` (id conservé, champs réécrits du formulaire, `_stamp`→NOW → le push Drive gagne sur l'ancien tombstone via `_drvWins` → résurrection propagée multi-device). `prevSnapshot=null` si tombstone (la branche isNew recrée l'arbo Drive).
> - **Durcissement adjacent** : `_syncLogToBail` saute désormais un bail tombstone (`bail._deleted`) — sinon recréer un logement dont le bail a été cascade-supprimé pouvait écrire sur un bail mort (latent, relevé par l'audit).
> - **Périmètre** : bug spécifique à `saveParamLog` (clé = réf string). `saveImm`/`saveEnt` (édition par index/id) et `_acteApply` (garde `usedRefs` incluant les tombstones → réf auto-unique « Logt (2) ») ne l'ont pas.
> - **Vérifs** : check-inline-js 4/0 · Vitest 47 fichiers / 1481 · parité sandbox↔prod des 2 hunks. **Audit `superpowers:code-reviewer`** → **« sound, ship it », 0 bloquant** (6 points vérifiés dont sûreté merge Drive + non-réintroduction de la résurrection auto v14.30).
> - Sandbox-first (`index-test.html`, OK user) → port **PROD** sur branche `fix-recreate-ref-tombstone` (base `origin/main`, ciblait v15.260). **✅ Intégré PROD v15.262 par la session maître 2026-06-08** : cherry-pick isolé `2b96b5d` sur `origin/main` `17aa6f8` → `320348a`. **Renuméroté 15.260 → v15.262** car entre-temps l'incident push-direct Chantier A Phase 2 a pris **v15.261** sur `origin/main`. Conflit résolu = lignes de version uniquement (15.261 base ↔ 15.260 branche → **15.262** partout, 4 spots + `sw.js` CACHE_VER) ; les 2 hunks logiques (`saveParamLog` résurrection + `_syncLogToBail` skip `_deleted`) appliqués **sans conflit** (ne touchent pas les fonctions 2044 du push direct). Gates post-intégration : check-inline-js **4/0** · `sw.js` `node --check` OK · 4 spots version 15.262 + CACHE_VER · 0 résidu 15.260/261 · `wasTombstone` présent. Push → déploiement GitHub Pages.

### BUG-IMM-TOMBSTONE-DISPLAY — immeuble supprimé restait visible/compté (filet de sécurité) (2026-06-05, v15.258)
> **Bug user** (capture live) : la suppression d'un immeuble le **tombstone** correctement (`{id, nom, _deleted:true}`, pattern v14.30) MAIS l'immeuble restait **affiché** dans la grille de la fiche bailleur et **toujours compté** dans les stats — car ~8 sites de lecture de `ent.immeubles` n'appliquaient pas le filtre `_isAlive` (alors que les lectures de logements adjacentes filtraient déjà, cf. commentaires `v14.47 audit tombstones`). Complément de **BUG-DELIMM-CASCADE** (v15.248, qui gère la cascade de suppression mais pas le filtrage d'affichage).
> - **Fix = filet de sécurité** (Option 2 « différée », cf. ARCHI-IMM-FK-IMMID) : ajout de `.filter(_isAlive)` aux 8 sites display/count/aggregate — `openAss` (dropdown immeuble assurance, + aligne `DB.entites` sur la convention `.filter(_isAlive)`) · `_renderBailleurCard` nbImms · `rEntFiche` nbImms · `_renderEntFicheImmeubles` (LA carte du bug) · `_computeComptaBailleur` immsBailleur · `_compute2044` immsBailleur · `_renderWiz2044Step1` + `_print2044` (résumés périmètre). Cohérence fiscale 2044 préservée (agrégat = compteur affiché).
> - **NON touché** (régression v14.30 évitée) : `_buildEntityPayload` / collecte tombstones Drive conservent les tombstones (sinon résurrection). Lookups find-by-name/find-by-id laissés en place (classe « nom-as-FK drift » → refonte FK dédiée ARCHI-IMM-FK-IMMID).
> - **Vérifs** : check-inline-js 4/0 · Vitest 47 fichiers / 1462 · diff = 13 lignes (8 logique + 4 version + 1 CACHE_VER). **Audit `superpowers:code-reviewer`** (sandbox + re-audit du port prod) → **APPROUVÉ, 0 bloquant** (seul 🟡 = `.slice()` redondant après `.filter`, cosmétique).
> - Développé sandbox-first (`index-test.html`, validé live user « ok ça fonctionne ») puis porté **PROD** (`index.html`) sur branche `fix-suppr-immeuble-tombstone` + bump 4 emplacements + `sw.js` CACHE_VER v15.258. **✅ Intégré PROD v15.258 par la session maître 2026-06-05** : cherry-pick isolé `9819830` sur `origin/main` `3d20423` → `4097d5f`, **0 conflit** (base et parent au même v15.257 → bump appliqué proprement). Gates post-intégration : check-inline-js 4/0 · `sw.js` `node --check` OK · 4 spots version 15.258 + CACHE_VER · 0 résidu 15.257. Push → déploiement GitHub Pages.

### BUG-SIGN-REFRESH-FICHE — Fiche 360 figée après signature bailleur-seul (2026-06-04, v15.256)
> **Bug user** : après avoir signé un bail « juste bailleur » (mode `bailleur-seul`) **depuis l'onglet « 📜 Bail » de la fiche logement 360**, aucun bouton n'apparaissait (« ✍️ Le locataire signe », annuler, envoyer par mail) — ils ne revenaient qu'après fermeture/réouverture de la fiche. « je ne peux plus rien faire ».
> - **Cause racine** : la signature se persiste dans une **popup** qui écrit directement `DB.baux[ref].signatures` (sans passer par `saveBail()`), puis ne rafraîchissait l'UI opener que via `window.opener.rBaux()` (page *liste* des Baux). La fiche 360 ouverte (`#log-fiche-content`) n'était jamais re-rendue → `_renderLogFichePanelBail` gardait son ancien rendu (bail non signé → boutons absents) jusqu'à fermeture/réouverture.
> - **Fix** : ajout de `window.opener._refreshAfterMutation()` dans le bloc de sauvegarde de la popup, juste après `rBaux()`. Réutilise le helper canonique **REFRESH-LIVE** (v14.28, déjà câblé dans 19 sites dont `saveBail`) — **même bug et même correctif que `resetBailSignatures` (v15.203)**. Aucun helper custom ajouté (DRY).
> - **Audit `superpowers:code-reviewer`** (2 passes : ébauche helper custom écartée, puis approche canonique retenue) → 0 finding ; ordre write-avant-refresh confirmé, no-op propre depuis la liste Baux, parité prod/sandbox byte-identique.
> - Développé sur branche dédiée (base v15.250), **rebasé sur prod v15.255** → livré **v15.256**. Propagé sandbox → prod (`index.html`) + bump 4 emplacements + `sw.js` CACHE_VER v15.256 (rattrape aussi le CACHE_VER laissé à v15.250 par la livraison précédente). [docs/subjects/BUG-SIGN-REFRESH-FICHE.md](docs/subjects/BUG-SIGN-REFRESH-FICHE.md)

### BUG-BAIL-ANNEXES-DUP — annexes affichées en double dans le bail (2026-06-04, v15.251)
> **Signalé par capture user** : le bail (contrat-type légal décret 2015-587) affichait cave/parking/garage **deux fois** — ligne légale « Locaux et équipements accessoires à usage privatif du locataire » (`bail.locauxPrivatifs`, texte libre legacy) **ET** ligne « Annexes privatives » (`log.annexes` structuré sérialisé). Follow-up de la consolidation annexes (Phase B4).
> - **Décision user** : fusion sur la **seule ligne légale** (annexes structurées = source de vérité, `locauxPrivatifs` = fallback, ligne « Annexes privatives » supprimée) **uniquement pour les baux NON signés**. **Baux signés inchangés** (immutabilité stricte byte-identique : 2 lignes conservées).
> - **3 rendus + template** alignés via gating `_bailSigned()` : PDF natif (`buildBailStructure`), aperçu HTML (`previewBailData`), template éditable (`genBailHTML` via placeholder conditionnel `{{ANNEXES_ROW}}` ; `{{ANNEXES}}` conservé pour templates custom legacy). Helpers `_bailSigned`/`_bailAnnexesVal`/`_bailLocauxFused`.
> - **MAJOR-1 corrigé** (effet de bord trouvé par audit) : le diff aperçu d'un bail signé comparait live (branche signée, N+1 lignes) vs snapshot (`signatures` supprimé → branche non-signée, N lignes) → faux « changement structurel » sur **chaque** bail signé. Fix : `snapStruct` forcé en branche signée via `Object.assign({}, snapBail, {signatures: bail.signatures})` (idiome déjà éprouvé ligne 16422). N'affecte QUE le bandeau de diff, jamais le document rendu/exporté.
> - **Audit `superpowers:code-reviewer` (2 passes)** : full audit → SAFE TO SHIP + MAJOR-1 ; re-audit ciblé du fix MAJOR-1 → **SAFE, aucune correction requise**, byte-identité bail signé confirmée intacte. check-inline-js 4/0 · Vitest 1422/1422. Commit direct PROD (override sandbox-first à la demande user) `bcb9811` + bump 5 emplacements + sw.js CACHE_VER v15.251.

### ARCHI-DB-DOUBLONS — Phase 4b COMPLÈTE (décision B3 : logement = source unique du bien) (2026-05-29, v15.232)
> **Mandat user** : « en finir avec ce sujet, tout faire d'un coup propre ». Fin de la duplication bail↔bien : le **LOGEMENT** (`DB.logements[]`, clé `.ref`) est désormais la **source unique** des champs « bien physique ». Le bail les lit via `_readLogForBail(bail, log)`.
> - **Écritures legacy supprimées** : `getBailDataFromForm` + `copyBailFrom` n'émettent plus les champs bien · bloc « bien » de `_syncLogToBail` retiré (garde identité adrBien/ftype/etage/surf + financiers/locataire conservée).
> - **3 bugs d'affichage corrigés** : annexes `[object Object]` · equipCuisine/Sanitaires/techInfo toujours `–` · chauffage label-only. Sérialiseurs `_lbSerialize*` (`log.equipements{}`/`annexes{}`/`chauffage{}`/`ecs{}` structurés → texte).
> - **Schéma chauffage/ECS enrichi** (mockup validé user) : modale Logement passe de 3 à 11 flags chauffage (+ PAC/fioul/bois/poêles/insert/cheminée/clim) + ECS (thermo/solaire/fioul/autre). `EQUIP_RULES` condFns repointées sur `log.chauffage.*`.
> - **Migration boot `_migrateArchiV4bIfNeeded`** (idempotente, backup auto) : Étape A migre le texte libre équipements → `log.equipements.*.customs[]` AVANT suppression (lossless) ; Étape B purge les champs bien legacy des baux **non signés uniquement** · baux signés JAMAIS touchés · baux **orphelins** (sans logement) préservés intacts.
> - **Immutabilité bail signé préservée** : rendu BAIL-FIRST `bail.X || _lbFill.X` (bail signé → `_lbFill` issu du `bailSnapshot.log` figé). `saveBail` re-préserve les champs plats gelés d'un bail signé re-sauvé (anti-dérive Aperçu). Annexes bail-first + string-guard (free-text signé byte-identique).
> - **Audit `superpowers:code-reviewer` (2 passes)** : 5 findings traités → **C1** (critique, annexes) · **I1** (clauses entretien chauffage gating `!_bailSignedSnapshot`) · **I2** (perte texte bail orphelin) · **S3** (backup namespace `_lsKey`) · **dérive re-save bail signé** → tous **RESOLVED**, aucune régression, snapshot légal jamais impacté.
> - Propagé index-test → index.html (**byte-identique**) + bump 4 emplacements in-file + `sw.js` CACHE_VER v15.232. Syntaxe 0 erreur (prod + sandbox).

### MODALE-LOGEMENT-CONSOLIDATION — Phase A hotfix bail cassé (2026-05-29, v15.231)
> **Régression** : après la consolidation de la modale Logement (ARCHI-FICHES-UNIFIED, retrait des inputs legacy « Bail courant »), le user n'arrivait plus à générer un bail complet. Diagnostic 2 causes confirmées par investigation code + 2 captures écran.
> - **CAUSE A** — `_syncLogToBail` écrasait *inconditionnellement* hc/ch/dg/debut/fin/entity du bail avec des `log.X` désormais souvent `undefined` (inputs retirés, décision C4) → financiers/dates resetés à vide. **Fix** : garde `if(log.X) bail.X = log.X`.
> - **CAUSE B** — wizard + 3 générateurs PDF (genPDFNative / previewBailData / genBailHTML) lisaient `bail.X` pour les champs **bien** sans fallback → champs bien vides dans le PDF. **Fix** : `bail.X || _lbFill.X` (`_lbFill = _readLogForBail` sauf bail signé → `{}` = immutabilité légale préservée, doc re-rendu byte-identique).
> - **Audit** agent `superpowers:code-reviewer` : **SHIP** (0 P0/P1), immutabilité bail signé confirmée. Propagé index.html + index-test.html (vérif counts identiques). Bump 5 emplacements + sw.js.
> - **Phase B** (refonte mockup-first complète modales Logement/Bail/Immeuble) = scope principal du sujet. **✅ B1→B8 LIVRÉ PROD v15.250 (2026-06-03)** + corrections mockup v3 (reste : follow-ups P2 + resync `index-test`, cf entrées dédiées plus bas) : mockup validé 2026-05-29, 13 décisions D-B1→D-B13 captées, plan d'implémentation phasé (B1→B8) écrit. Voir [docs/subjects/MODALE-LOGEMENT-CONSOLIDATION.md](docs/subjects/MODALE-LOGEMENT-CONSOLIDATION.md) et [le plan](docs/superpowers/plans/2026-05-29-modale-logement-consolidation-phaseB.md).
> - **Phase B1** (schéma DB `log.diagnostics` unifié + migrations, FONDATION) **✅ LIVRÉ v15.233** (2026-05-30) : collision DPE résorbée (source unique `log.diagnostics.dpe`, fini le `log.dpe` string↔objet qui churnait Drive) ; loyer **théorique** poussé depuis le bail (`loyerHcRef`/`chargesRef`/`dgRef`/`irlRef` — helper `_pushLoyerTheoFromLive` sur 6 sites + backfill au boot, décision B1-a Q1=a/Q2=b/Q3=a, garde non-vide) ; `_diagGet`/`_diagSave`/`saveLog`/rendu fiche robustes string↔objet. Audit `superpowers:code-reviewer` (BLOCKER perte classe DPE au boot + HIGH churn Drive → résolus). Propagé index.html ↔ index-test.html (diff strictement identique) + bump 5 emplacements (title/em/landing/IMMOTRACK_VERSION/sw.js). **Reste B2→B8.**
> - **Phase B2** (onglet « 🏷 Diagnostics » unifié dans la modale Logement + retrait écran DDT 360°) **✅ TEST VISUEL OK (sandbox) + LIVRÉ PROD v15.241 (2026-06-02)** :
>   - **B2 v1** (v15.234, 2026-06-01) : 1 onglet table groupée fill-once (9 diags + détail DPE + contexte auto-détection) lisant/écrivant le canonique `log.diagnostics` ; moteur `_logDiag*` (~260 l) ; retrait des 2 ex-onglets DPE+Risques de la modale, de l'écran `_renderLogFichePanelDiagnostics` (fiche 360°), de la modale `ov-diag-edit` et des fns `_diagEdit`/`_diagSave`/`_diagSaveContext` (deep-links repointés vers `openLogModalOnTab(ref,'diag')`). **GARDÉ** : moteur de calcul + récap DDT joint au bail. Projection legacy `log.dpe`+`log.dpeDate`+`log.etatRisques` régénérée au commit (`_logDiagCommitToLog`) → bail (`_readLogForBail` + snapshot signé immuable) intact. Audit `superpowers:code-reviewer` : 1 BLOCKER B2-1 (résultats `presence:false`/`conforme:false` sans date perdus par le filtre `hasData`) → corrigé + 8/8 tests.
>   - **B2 v2** (refonte UX validée par mockup `diagnostics-redesign.html`, variante B « tableau clarifié ») découpée en 3 sous-phases :
>     - **B2 v2-a ✅ CODÉ SANDBOX v15.235** (2026-06-01) : libellés clarifiés (nom clair + chip sigle + bulle « ? » via map UI-only `_DIAG_UI_META`) · **upload documents-first** EN HAUT (`_renderAttachmentSection` parentType:'logement') · bouton « Aperçu récap DDT » retiré · détail DPE en sous-ligne · lignes colorées par statut · CSS injecté `#logdiag-css`. **37 tests Vitest OK · audit `superpowers:code-reviewer` 0 BLOCKER** (projection bail intacte, XSS escapé, prod intacte). EN ATTENTE TEST VISUEL.
>     - **B2 v2-b ✅ CODÉ SANDBOX v15.236** (2026-06-01) : récup DPE depuis l'open-data **ADEME** (dataset `dpe03existant`, gratuit/sans clé/CORS *, fetch direct navigateur — pas de backend). Champ **N° DPE ADEME** + bouton « ⬇ Récupérer ADEME » sur la sous-ligne Détail DPE → pré-remplit classe énergie (`etiquette_dpe`) + classe GES (`etiquette_ges`) + conso EP (`conso_5_usages_par_m2_ep`) + dépenses (`cout_total_5_usages`) + date (`date_etablissement_dpe`). **2 garde-fous** avant écrasement : (1) adresse ADEME ≠ adresse logement (heuristique CP + recouvrement mots, via `_logDiagResolvedLogAddress`/`LogImmResolver`), (2) données ADEME ≠ saisie existante (liste des deltas). `numeroDpe` persiste canonique (`log.diagnostics.dpe`) + round-trip réouverture. Vérifs réseau : pas de CSP, SW passe-through cross-origin. **37 tests Vitest OK · audit `superpowers:code-reviewer` 0 BLOCKER** (XSS escapé, bail signé immuable, popups corrects, robustesse réseau, mapping EP correct, prod intacte ; suggestion format dépenses « X € » appliquée). EN ATTENTE TEST VISUEL.
>     - **B2 v2-c1 ✅ CODÉ SANDBOX v15.237** (2026-06-01) : **lecture auto des PDF de diagnostic** (pdfjs embarqué `_BAIL_PDF_LIBS.pdfjs` chargé dans la fenêtre principale, worker blob URL gardée vivante). Au dépôt d'un PDF dans la zone Documents de la modale → extraction texte (≤30 p / 200 Ko) → **extraction N° DPE** (format national strict `\d{4}[A-Z]\d{7}[A-Z]`, FIABLE) ; si trouvé + champ vide → pré-remplissage + **lancement ADEME automatique** (les 2 garde-fous B2v2-b s'appliquent). **Bandeau « Détection automatique »** indicatif (diagnostics probablement couverts par mots-clés — purement informatif, **n'écrit JAMAIS de résultat**). Hook gated dans `_handleAttachmentUpload` (sans dépendance DOM : `_logDiagDraft.logId===parentId`), fire-and-forget try/catch (PDF illisible/scanné non bloquant). Promesse de chargement pdfjs mémorisée (anti-double-load). **37 tests Vitest OK · syntaxe OK · audit `superpowers:code-reviewer` 0 BLOCKER** (pdfjs main-window OK, worker non révoqué, base64→Uint8Array byte-exact, coverage jamais écrite, DPE auto-fill seulement si vide, XSS escapé, bail signé non touché, gate robuste, anti-fuite d'état ; NB-1 race + NB-3 log level appliqués). **Fix v15.238** (2026-06-01) : la détection couverture echouait pour élec/gaz/autres → cause : ancres multi-mots à espaces vs tokenisation imprévisible de pdf.js (« d'électricité » → « d ' electricite »). Corrigé par **normalisation compacte** (accents + ponctuation + apostrophes + espaces retirés) + ancres collées sur titres légaux standard. Vérifié 20 cas logique (titres réels, apostrophes droites/typo, mots coupés, anti-faux-positif) + audit `code-reviewer` 0 blocker. **✅ VALIDÉ VISUELLEMENT** (2026-06-01, screenshot user : N° DPE `2568E1285086E` récupéré ADEME + bandeau « DPE · Plomb · Amiante · Électricité » correct sur DDT combiné réel).
>     - **B2 v2-c2 🔎 ANALYSÉ EMPIRIQUEMENT (2026-06-01) — verdict captured, scope à décider** : le user attend le **pré-remplissage des champs** date/résultat/cabinet (« pas de récupération » = c1 ne fait qu'un bandeau indicatif). Analyse de 2 vrais cabinets (DDT combiné « SL Diag-Conseils » plomb+amiante+élec+DPE ; ERP « Media Immo ») : **(1) Résultat élec/gaz** = phrase Cerfa standard « ne comporte aucune anomalie » / « comporte une ou des anomalies » — FIABLE **uniquement dans la page de synthèse** (phrase unique) ; **PIÈGE** dans le formulaire à cases (les 2 formulations coexistent, pdf.js perd la coche) → refuser. **(2) Résultat plomb/amiante** = « n'a pas été repéré de revêtements contenant du plomb » / « …matériaux…amiante » (absence) — moyenne, conservateur. **(3) Date** = ambiguë (« Date du repérage » vs « Rapport du » vs « Date de réalisation » selon cabinet). **(4) Cabinet** = présent partout mais format propre à chaque cabinet (footer vs en-tête). **(5) ERP** = résultat « établi » → date suffit. **(6) DPE** = déjà via ADEME (autoritaire). **Design retenu (prudent, blank-on-doubt)** : pré-remplir en « ✨ suggéré · à vérifier », jamais committé sans confirmation, phrase source affichée ; remplir le résultat UNIQUEMENT sur formulation non ambiguë (refuser les formulaires à cases). Sensible (DDT légal) → **mockup-first + audit code-reviewer obligatoires**.
>     - **B2 v2-c2 ✅ CODÉ SANDBOX v15.240 + fix v15.241 (2026-06-01)** : mockup `diagnostics-c2-suggere.html` validé ; décisions user = scope **prudent** + flux **« les deux »** (bandeau revue global + ✓/✗ inline) + résultat-auto sur formulation non ambiguë + suggestions enregistrées mais marquées ✨ « à vérifier » (marqueur persistant `_sg` ISOLÉ : exclu de `hasData`, ignoré par projection bail, absent du snapshot signé). Moteur conservateur porté (`_logDiagExtractSuggestions`/`_logDiagApplySuggestions`) : date libellé-ancrée + cabinet + résultat plomb/amiante=absence seul + élec/gaz conforme/anomalie via phrase isolée (garde bidirectionnelle anti-formulaire à cases) sinon vide. **Vérif** : identité moteur vs banc d'essai sur DDT réel SL Diag-Conseils (date 01/04/2025, crep=abs, amiante=abs, elec=conf) · 37/37 Vitest. **🛡 Audit `code-reviewer` → 1 BLOCKER B1** (suggestion sur diag NON applicable masqué → fausse « Absence » dans annexe bail sans badge visible) **CORRIGÉ v15.241** (gate `isApplicable===false` à l'application + auto-cicatrisation au rendu). **🛡 Re-audit → B1 CLOSED, M1 CLOSED, 0 régression** (16 assertions + test fuite commit-path · Vitest 1264/1264). **Fix date v15.242** (retour user « les dates ne sont pas reprises ») : pdf.js intercale une réf interne entre le libellé et la date → normalisation séparateurs + fenêtre bruit tolérante (vérifié sur texte pdf.js réel). **Durcissement v15.243** (recommandations audit, avant PROD) : rejet date étrangère intercalée par libellé concurrent (`rapport|édition|…`) + validation plage calendaire (jour 1-31/mois 1-12) — 12/12 sondes, 37/37 Vitest. **✅ TEST VISUEL OK (2026-06-02)** : DDT/ERRIAL réel redéposé → date + suggestions ✨ affichées correctement. Validé conjointement avec **FEAT-GEORISQUES-ERP Phase 2** (même moteur `_logDiag*`), qui a aussi nécessité un fix du parsing de date ERRIAL en texte français (« Établi le 2 juin 2026 »).
>   - **✅ SYNC PROD FAITE v15.241 (2026-06-02)** : port B2 (B1→B2 complet) + FEAT-GEORISQUES-ERP via **fusion 3-voies `git merge-file`** (deltas B2 puis Géo appliqués sur prod, B3-B8 + wizard import-acte **exclus** car non testés visuellement). Conflits = **versions uniquement** (résolus à 15.241). Décision périmètre : auto-injection démo retirée d'`initDB()` (conforme règle gravée). **Vérif** : check-inline-js **4/0** · **1408/1408 Vitest** · 0 fuite B3-B8/import-acte · zone diagnostics prod == cible sandbox · dépendance `georisques-erp-detector.global.js` trackée. **🛡 Audit `superpowers:code-reviewer` → « Safe to ship to PROD as-is »** (0 Blocker / 0 Major ; isolation `_sg` du bail signé prouvée aux 4 niveaux). Bump 4 emplacements + sw.js CACHE_VER 15.233→15.241. **✅ M1 CORRIGÉ v15.242 (2026-06-02)** : `_diagAddYM` clampe désormais le jour au dernier jour du mois cible (ex. `2026-08-31`+6 mois donnait « 2027-02-31 » → roulé au 3 mars, expiration décalée de qq jours, amplifié par ERP 6 mois). Fix appliqué prod + sandbox (parité), vérifié 7/7 cas node (bissextile incluse). Bump 4 emplacements + sw.js CACHE_VER 15.241→15.242. **✅ DÉTECTION PRÉSENCE AMIANTE/PLOMB v15.243 (2026-06-02)** : retour user sur DDT réel (amiante+plomb appt 1) → le moteur `_logDiagExtractSuggestions` ne suggérait QUE l'absence pour crep/amiante (design conservateur c2). Ajout des ancres **présence** (`amiante: aetereperedesmateriauxetproduitscontenantdelamiante` · `plomb: aetemisenevidencelapresencederevetementscontenantduplomb`) → suggère `code:'pres'` (✨ à vérifier, jamais écriture aveugle) quand la synthèse conclut présence ; logique présence-OU-absence avec garde **les-deux-coexistent → ambigu** (même philosophie qu'élec/gaz). **Anti-négation prouvé** : ancres présence préfixées « a été » (`aete…`) jamais sous-chaîne de « n'a pas été » (`napasete…`). Ancre absence plomb « mis en évidence » ajoutée (recall, reco audit). Vérifié contre le PDF réel (présence×2 HIT, absences miss). Apply-path supporte déjà `'pres'`→`presence:true`. Appliqué prod + sandbox (parité ancres byte-identique). **Vérif** : check-inline-js 4/0 (2 fichiers) · 1408/1408 Vitest. **🛡 Audit `superpowers:code-reviewer` → « SAFE to ship, no blockers »** (immunité négation/boilerplate confirmée, garde both-present OK, aucun write sans badge ✨, projection bail intacte). Bump 4 emplacements + sw.js CACHE_VER 15.242→15.243. **✅ EXTRACTION CABINET/DIAGNOSTIQUEUR v15.244 (2026-06-02)** : retour user sur le même DDT (« le diagnostiqueur n'est pas renseigné »). Cause : l'ancien bloc cabinet (a) utilisait le flag `/i` → `[A-ZÀ-Ý]` matchait les minuscules et capturait du boilerplate (« réalisée par la remise du constat de risque d'… »), (b) ne reconnaissait que « réalisé par », pas « rédigé par » (le doc dit « rédigé par »). Réécriture en **4 ancres garde-MAJUSCULE** (ordre d'essai) : en-tête footer « X | …N°SIREN » → « (pour la) société X » → « rédigé/réalisé par X » → « auteur du constat X », nom borné `_NM` (début+continuation `[A-ZÀ-Þ]` = majuscules accentuées uniquement, exclut les minuscules accentuées qui captureraient « établissement »/« établie »). Vérifié contre le PDF réel (cabinet=`ADEXI`, signataire « rédigé par … pour la société ADEXI » ; 5 boilerplate rejetés). Le diagnostiqueur s'écrit en `info.diagnostiqueur` (✨ à vérifier) uniquement si vide. Appliqué prod + sandbox (parité bloc cabinet byte-identique LF). **Vérif** : check-inline-js 4/0 (2 fichiers) · 1408/1408 Vitest. **🛡 Audit `superpowers:code-reviewer` → PASS** (ReDoS safe, ordre/parité OK ; should-fix « resserrer `À-Ÿ`→`À-Þ` » appliqué). Bump 4 emplacements + sw.js CACHE_VER 15.243→15.244.
> - **Phase B8** (Suivi expiration diagnostics : Agenda + actions prioritaires + login = D-B11 + D-B12) **🔄 CODÉ SANDBOX v15.245** (2026-06-01, `index-test.html` uniquement) :
>   - **(D-B11) Agenda** : catégorie `AGENDA_CATS.DIAG` (📋 teal) + bloc dans `agendaAutoSync()` — boucle séparée sur tous les logements non archivés → event `cat:'DIAG'` / `rappels:[90,30,7]` / `autoKey=DIAG:{ref}:{key}:{annéeExp}` par diag applicable à expiration calculable. **Idempotent** + **purge des périmés** (date changée / diag supprimé / devenu non-applicable·na ; scopé `cat:'DIAG'`, conserve les « ✓ Fait » à clé valide). Diags permanents (amiante/mérule/bruit, CREP sans plomb) → aucun event. `agendaAutoSync()` aussi appelé dans `saveParamLog`.
>   - **(D-B12) Actions prioritaires** : section dans `_computeUnifiedTodo()` → diag `_diagStatut==='expire'` ⇒ item `type:'diag'` rouge (score 88, « Mettre à jour » → `openLogModalOnTab(ref,'diag')`). **Anti-doublon** : À-traiter = expirés ; à-venir = Agenda seul. **PAS de carte dashboard** (consigne « tu touches pas au dashboard »).
>   - **(D-B12) Login** : `_checkDiagRappelsAuLogin()` (calqué `_checkIRLRappelsAuLogin`) toast-only, anti-spam 1/jour, hook post-connexion 3200 ms.
>   - **Vérif** : test node dédié **30/30 OK** · **1319/1319 Vitest** · parse JS OK · 6 symboles câblés. B8 non listée phase sensible (pas d'audit obligatoire). **⏳ EN ATTENTE TEST VISUEL** (sandbox). Reste : sync PROD B2 → B3→B4→B5→B6→B7.
> - **Phase B3** (Bâti → immeuble hérité + fallback = D-B1) **🔄 CODÉ SANDBOX v15.246** (2026-06-01, `index-test.html` uniquement) :
>   - **Immeuble** : nouveau `<select id="imm-typeHabitat">` (Immeuble collectif / Maison individuelle) à côté du régime juridique. Câblage complet : migration boot (`typeHabitat` défaut `''`), reset/edit/save.
>   - **Logement (onglet Description)** : les 3 champs bâti (typeHabitat/régime/période) enveloppés dans `#logmod-bati-own` ; `_logRefreshInherited()` bascule via `_toggleBati()` — **autonome / immeuble introuvable** ⇒ éditable ; **immeuble lié** ⇒ masqué + note « 🏛 hérité » + valeurs en lecture seule dans l'encart « Hérité de l'immeuble parent » (onglet Identité, nouvelle ligne « Type d'habitat »).
>   - **Bail** : `_readLogForBail` résout `_inhTypeHabitat = _imm.typeHabitat` (3 branches, lecture inline directe — **pas** via le resolver partagé pour préserver l'isolation sandbox) + override `typeHabitat` dans le retour → les 6 sites de lecture bail (`b-typeHabitat`, `isCopro`, PDF/preview) reçoivent la valeur héritée. **Immutabilité bail signé préservée** (`_imm` = `bailSnapshot.imm` figé).
>   - **Vérif** : parse JS 4 blocs **valide** · **1319/1319 Vitest** · grep cohérence 11 sites. B3 non listée phase sensible (pas d'audit obligatoire). **⏳ EN ATTENTE TEST VISUEL** (sandbox). Reste : B4→B5→B6→B7.
> - **Phase B4** (Équipements consolidés + annexes 1 bloc = D-B7 + D-B8) **🔄 CODÉ SANDBOX v15.247** (2026-06-01, `index-test.html` uniquement) :
>   - **(D-B7)** Tout l'équipement physique regroupé dans l'onglet **Équipements** : sections Équipements internes (`logp-cu-*`/`logp-sa-*`/`logp-te-*`), Extérieurs (`logp-ext-*`) et Annexes privatives (`logp-an-*`) **déplacées** depuis Présentation (ids inchangés → `_logpFillFromLog`/`_logpReadFromForm` lisent par id, handlers intacts). Présentation conserve : équipements communs immeuble, mise en valeur, quartier, conditions location.
>   - **(D-B8)** Annexes **1 seul bloc structuré étendu** : `log.annexes` 3→8 types (ajout grenier/buanderie/cellier/localVelos/atelier `{present,num}`, conserve cave/parking+type/garage/customs). Câblage 5 nouvelles clés sur migration (2 branches), `_lbSerializeAnnexes` (helper `_p` → clause bail), `_logpFillFromLog`, `_logpReadFromForm`. **Retrait** des 2 saisies texte libre redondantes `log-annexes` (Équipements) + `log-locauxPrivatifs` (Description) ; champ **donnée** `log.locauxPrivatifs` **conservé** (valeurs préservées, écriture supprimée non remplacée par vide ; toujours lu par le PDF bail + éditable via wizard `b-locauxPrivatifs`).
>   - **Vérif** : parse JS 4 blocs **valide** · **1319/1319 Vitest** · grep (0 réf orpheline). **🛡 AUDIT `superpowers:code-reviewer`** (touche `_lbSerializeAnnexes` = clause légale) → **0 BLOCKER / 0 warning matériel** (ordre sérialisation identique pour ancien data, immutabilité bail signé confirmée, pas de perte donnée, miroir annonce ignore clés inconnues). **⏳ EN ATTENTE TEST VISUEL** (sandbox). Reste : B5→B6→B7.
> - **Phase B5** (Présentation : loyer théorique éditable + prefill bail/annonce = D-B9 + D-B10) **🔄 INJECTÉ SANDBOX main v15.251** (initialement v15.248 worktree) :
>   - Section « Conditions de location » : loyer HC / charges / DG **théoriques** + IRL réf (`loyerHcRef`/`chargesRef`/`dgRef`). Décision B1-a respectée : grisés + poussés par le bail actif, **éditables seulement si vacant**. Prefill nouveau bail depuis `log.loyerHcRef` ; annonce vacant alimentée par le théorique. Mise en valeur structurée déjà présente (non dupliquée).
>   - **Vérif (post-injection)** : check-inline-js 4/0 · 1341/1341 Vitest · grep cohérence fill/read/save/prefill/annonce. **⏳ EN ATTENTE TEST VISUEL** (sandbox).
> - **Phase B6** (Bail : retrait champ régime fiscal + jpay défaut 5 = D-B5 + D-B6) **🔄 INJECTÉ SANDBOX main v15.251** (initialement v15.249 worktree) :
>   - Champ mort `b-fiscal` retiré de la modale bail (jamais dans le PDF). **Carryover** dans `saveBail` pour préserver toute valeur `fiscal` historique (zéro perte sur bail signé). Jour de paiement par défaut harmonisé à **5** (HTML/fill/openBail/CSV), cohérent avec les générateurs PDF.
>   - **🛡 AUDIT `superpowers:code-reviewer`** (phase sensible, chemin save bail) **v15.249** → SAFE TO SHIP, 6/6 PASS, byte-identité bail signé confirmée (`fiscal` dans aucun générateur). **Vérif post-injection** : check-inline-js 4/0 · 1341/1341 Vitest · 0 lecture DOM `b-fiscal` survivante. **⏳ EN ATTENTE TEST VISUEL** (sandbox).
> - **Phase B7** (Wizard Bail 4→3 étapes = D-B13 / WB-2 / WB-4) **🔄 INJECTÉ SANDBOX main v15.251** (initialement v15.250 worktree) :
>   - Refonte UI pure : fusion panes « Le bien » + « Diagnostics » en un pane **« Récapitulatif » (étape 3) en lecture seule** (bien + diagnostics hérités du logement via `_readLogForBail`/`_lbFill`). Stepper 4→3 (`_BAIL_STEPS` 3 entrées, clamp `Math.min(3,n)`, save-btn à l'étape 3) ; `_makeBailBienTabReadOnly()` verrouille `bp-bien`+`bp-diag` (exceptions `data-bail-editable` : `b-diag`/`b-diagSoc` + mobilier). WB-2 : type pré-rempli depuis `log.typeUsage` sur **nouveau** bail uniquement (`!_bailIsEdit`, sans popup confirm DG). Collatéral : 2 boutons « Saisir DPE » + messages IRL repointés `openBail` → `openLogModalOnTab(ref,'diag')`.
>   - **Vérif post-injection** : check-inline-js 4/0 · 1341/1341 Vitest · 3 `.tab-panel` dans `#ov-bail`, 0 réf au modèle 4 étapes. **⏳ EN ATTENTE TEST VISUEL** (sandbox).
> - **💉 INJECTION Phase B (B5+B6+B7) dans main** (2026-06-02, **merge `539d9ad` → v15.251**) : le worktree isolé `phaseB-b5-b7` (créé pour travailler en parallèle d'IMPORT-ACTE-VENTE + V3-REFONTE-ASSURANCES sur le même `index-test.html`) a été mergé dans `main` sur ordre user. Conflits = **versions uniquement** (les 2 branches avaient bumpé en parallèle), résolus à 15.251. **Aucun conflit sémantique** (B5-B7 ne chevauchent pas ACTE-VENTE/ASSURANCES). **🛡 AUDIT `superpowers:code-reviewer` de la cohérence du merge → SAFE TO SHIP** (8/8 checks : 0 réf orpheline `b-fiscal`, wizard 3 étapes intègre, `openLogModalOnTab` signature OK, champs loyer théo cohérents, **immutabilité bail signé intacte** via `bailSnapshot`, versions 15.251 × 4 spots, inline-JS 4/0, Vitest 1341/1341). Nit cosmétique (commentaire « wizard 4 étapes ») corrigé `1430d80`. **PROD index.html PAS touché.**
> - **✅ SYNC PROD B3→B8 + corrections mockup v3 — LIVRÉ v15.250 (2026-06-03)** : port « tout d'un bloc » du sandbox vers PROD `index.html` (1 audit global + 1 commit, override sandbox-first décidé par user pour ce sujet). Phases B3 (bâti hérité immeuble/D-B1) · B4 (équipements consolidés + annexes 3→8/D-B7+D-B8) · B5 (loyer théorique éditable/D-B9+D-B10) · B6 (retrait `b-fiscal` + jpay défaut 5/D-B5+D-B6) · B7 (wizard 4→3 + récap lecture seule/D-B13) · B8 (suivi expiration diagnostics : agenda DIAG + todo + toast login/D-B11+D-B12). **+ corrections mockup v3** (régression B7 corrigée) : `b-villeSign` + `b-precedentLoc` déplacés de `bp-bien` (lecture seule) vers `bp-conditions` (éditables) + helper `_bailFillVilleSign` (auto-remplissage ville depuis le logement). **🛡 Audit `superpowers:code-reviewer` du port (vs base) → 0 BLOCKER** (immutabilité bail signé OK, mappings `getBailDataFromForm` identiques, `_acteExtract` 1×). **⚠️ Collision version** : v15.249 consommé entre-temps par la session **Candidature** (propagation PROD `d708707` + bump `c1a8f64`). **Merge `origin/main` × commit port auto-résolu SANS conflit** (zones disjointes dans `index.html`) → re-numéroté **v15.250**. **🛡 Re-audit `code-reviewer` du merge → 0 BLOCKER** : `convertCandidatToBail` (candidat→bail de Candidature) vérifiée **compatible** avec le wizard 4→3 (délègue à `openBail`, champs par `id`, aucun `goBailStep(4)`, aucun `el('b-fiscal')`, atterrit étape 1 valide) ; 3 tab-panels intacts ; insertion `#ov-candidat` hors `#ov-bail`. **Vérif** : check-inline-js **4/0** · **1422/1422 Vitest** · `_acteExtract` 1 déf · immutabilité bail signé préservée. Commits `7faaae4` (port) + `eed3849` (merge) + `7a2589c` (bump v15.250), push `origin/main`. Bump 5 emplacements release + `sw.js` CACHE_VER →15.250 (marqueurs commentaire `// v15.249 B*` conservés = cycle dev).
> - **⚠️ Divergence index-test ASSUMÉE — décision user 2026-06-03 : « on ne fait rien dans index-test »** : les corrections mockup v3 (`b-villeSign`/`b-precedentLoc` en `bp-conditions` + `_bailFillVilleSign`) sont **uniquement en PROD**, PAS dans `index-test.html` (où ces champs restent piégés dans `bp-bien`). **On ne resync PAS le sandbox.** 🚨 **GARDE-FOU pour tout futur sync sandbox→PROD** : NE PAS écraser ces corrections côté PROD (sinon régression B7 réintroduite — ville signature + précédent locataire repiégés en lecture seule). Si un sync futur repart d'`index-test`, réappliquer d'abord les corrections mockup v3 dans le sandbox AVANT de propager.
> - **Follow-ups P2** (reportés, cf section Dette technique) : P2-A backfill baux archivés · P2-B faux-positif diff-highlight.

### FEAT-GEORISQUES-ERP 🗺️ — Détection auto ERP/IAL depuis l'adresse (2026-06-02, v15.252-254) — P2 · ✅ Phase 2 livrée + TEST VISUEL OK (sandbox v15.254) · ✅ LIVRÉ PROD v15.241 (2026-06-02, porté avec B2)
> **Sujet** : `docs/subjects/FEAT-GEORISQUES-ERP.md`. Dans l'onglet Diagnostics de la modale Logement, détermine **automatiquement depuis l'adresse** si un **ERP / IAL** (État des Risques) est légalement obligatoire (Code env. L.125-5 / décret 2022-1289), affiche les risques applicables + mention « vérifiez sur georisques.gouv.fr ». APIs publiques gratuites/sans clé/CORS * (aucun backend) : **BAN** (adresse→INSEE) + **Géorisques** (sismicité, radon, PPR naturel/techno/minier).
> - **Logique PURE** : `__tests__/helpers/georisques-erp-detector.js` + **44 tests Vitest** (gotcha **camelCase `codeInsee`** sur `gaspar/ppr*` vs snake `code_insee` ailleurs verrouillé ; normalisation arrondissements PLM ; tri-état complet). Mirror navigateur auto-généré `js/helpers/georisques-erp-detector.global.js` (`window.GeorisquesErpDetector`, 4ᵉ entrée de `tools/sync-helpers-global-mirrors.mjs`).
> - **Tri-état strict** (« si tu ne sais pas, dis-le ») : `true` dès qu'un signal déclenche (PPR>0 | sismicité≥2 | radon cat.3) ; `false` UNIQUEMENT si les **5 signaux** (sismique+radon+PPRN+PPRT+PPRM) sont connus & aucun ne déclenche ; sinon `indeterminé` → l'UI n'affirme rien. **Non-clobber** : la case « Zone à risques (ERP) » auto-déterminée n'écrase JAMAIS un choix manuel (`zoneRisquesManual`). Auto-détection à l'ouverture, cache 180 j par adresse.
> - **Vérif** : check-inline-js 4/0 · `node tools/sync-helpers-global-mirrors.mjs` OK · **1385/1385 Vitest**. **🛡 Audit `superpowers:code-reviewer` ×2 → SHIP** : (1) initial 0 BLOCKER (légal, XSS escapé, non-clobber, anti-boucle re-render, **immutabilité bail signé confirmée**) + 3 NITs ; (2) re-audit du fix `pprt/pprm` (5 signaux, comble un faux « non requis » pour commune Seveso/minière) → SHIP régression-free.
> - **✅ TEST VISUEL OK (2026-06-02)** : le panneau détecte les risques **depuis l'adresse via l'API, AVANT tout upload de document** (confirmé user, commune Morschwiller-le-Bas 68218 — sismicité 3). **Correctif v15.253** : `georisquesReportUrl()` renvoyait la route morte `…/rapport2?codeInsee=…` (404/page vide, SPA Angular) → renvoie désormais la racine officielle **ERRIAL** `https://errial.georisques.gouv.fr/` (tool État des Risques à annexer au bail ; pas de param de préremplissage documenté). +mirror régénéré +44 tests OK.
> - **✅ Phase 2 livrée (sandbox v15.254, 2026-06-02)** — *câblage doc ERRIAL ↔ ligne diagnostic ERP + suivi validité 6 mois*. Mockup `mockups/georisques-erp/alerte-validite-erp.html` + spec `docs/superpowers/specs/2026-06-02-georisques-erp-phase2-design.md` + plan `docs/superpowers/plans/2026-06-02-georisques-erp-phase2.md`. **3 décisions** : (1) **ERP binaire** valide/expiré — `_diagStatut('erp',…)` ne renvoie JAMAIS « expirebientot » (corrige par suppression le bug seuil 6 mois = validité totale) ; (2) **bandeau rouge** au-dessus du tableau DDT (`_logDiagRenderTab`) SI ERP expiré, CTA « ↻ Régénérer sur ERRIAL (gratuit) » ; (3) **encart ERP→ERRIAL** dans la modale bloquante existante `ov-ddt-incomplet` (`_ddtShowIncompletModal`) si ERP manquant/expiré. **Extraction** : date « Établi le JJ/MM/AAAA » du PDF ERRIAL extraite **séparément** (`erpDate`, validation calendaire Date.UTC) et suggérée « ✨ à vérifier » **sur la ligne `erp` uniquement** (jamais de pollution DPE/autres). Le propriétaire régénère l'ERP lui-même, gratuit (Art. L.125-5 C. env.).
> - **Vérif Phase 2** : check-inline-js **4/0** · **1408/1408 Vitest** · 🛡 **revue conformité spec ✅** + **audit `superpowers:code-reviewer` ✅ SHIP** (0 Critical / 0 Important : cross-contamination structurellement impossible, garde `erp` en bonne branche — expiré reste `expire`, gate génération inchangé, immutabilité bail OK, pas d'écriture aveugle, pas de XSS ; 3 Minor cosmétiques, dont wording date d'expiration corrigé). **✅ TEST VISUEL OK (2026-06-02)** : dépôt PDF ERRIAL réel → date « Établi le 2 juin 2026 » suggérée ✨ sur la ligne ERP (02/06/2026), chip ✅ Valide, aucun bandeau (cas <6 mois confirmé par l'user). Cas expiré (bandeau 🔴 + encart bloquant génération bail) = code-complet + audité, se déclenche avec un ERRIAL > 6 mois. **🐛 fix post-test** : format date ERRIAL = TEXTE français « Établi le 2 juin 2026 » (pas numérique) → extraction (a) numérique + (b) textuelle 12 mois, re-audit code-reviewer ✅.
> - PROD `index.html`+`sw.js` PAS touchés (sync différée avec Phase B — `_logDiag*` = 0 en PROD).

### LOG-ANNONCE 📢 — Générateur d'annonces vacant sans IA (2026-05-27, v15.207-211)
> **Post-audit v15.211** (code-reviewer indépendant) : 6 findings P0/P1 traités le même jour :
> - **F1 (P0)** : nouveau script `tools/sync-annonce-global-mirror.mjs` qui régénère le mirror IIFE depuis l'ES (testée). Avant : 8 variantes d'accroches manquaient en navigateur + description haut-gamme amputée. Maintenant : 33 titres + 21 accroches sync à l'identique, sanity check au build.
> - **F2 (P0)** : SMS ne produit plus « balcon m² » si surface absente (utilise `surfTxt()`). +5 tests pathologiques.
> - **F3 (P1)** : mention « loi Carrez » retirée (Carrez = vente copro, faux pour location). Surface habitable pour nue + « loi Boutin » (art. 78 loi 2009-323) pour meublé. +3 tests.
> - **F4 (P1)** : étage absent ne génère plus « situé au  d'un immeuble » (double espace). +1 test.
> - **F5 (P1)** : avertissement DPE F/G/E (loi Climat 2021-1104 + décret 2021-19) dans la modale → rouge G interdit 2025 / orange F 2028 / bleu E 2034.
> - **F6 (P1)** : bouton « 📢 Créer une annonce » visible UNIQUEMENT sur logements vacants (`!_bienActiveBail(ref)`).
> 
> **Vitest** : 1132/1132 OK (+9 tests audit). **Audit code-reviewer** : verdict initial « OK avec réserves majeures » → fixé en intégralité.


> **Sujet** : `docs/subjects/LOG-ANNONCE.md` — bouton « 📢 Créer une annonce » sur les fiches logement vacantes pour générer des annonces de location (Leboncoin / SeLoger / PAP) **sans IA**, prêtes à coller, avec garde-fou anti-mensonge légal.
>
> **5 étapes livrées en une session** :
> - **Étape 1 (v15.207-208)** — Module ES `__tests__/helpers/annonce-generator.js` + **103 tests Vitest** (1123/1123 OK) dont 6 anti-mensonge ciblés (pas de balcon faux, pas d'ascenseur faux…) + 3 multi-villes (Paris sans extérieur, Maison Toulouse jardin, Studio meublé Lyon)
> - **Étape 2 (v15.209)** — Schéma DB enrichi (`equipements`, `exterieurs`, `annexes`, `presentation`, `quartier`, `locationInfo` sur log + `equipementsCommuns` sur imm) + migration `_initAnnonceSchemaIfNeeded()` au boot, idempotente
> - **Étape 3 (v15.209)** — Onglet « 📢 Présentation » dans modale Logement (~200 lignes HTML + 200 JS) avec pattern customs[] partout (règle UX D1 « choix prédéfini + ajout libre »)
> - **Étape 4 (v15.210)** — Mirror IIFE `js/helpers/annonce-generator.global.js` (18 fonctions miroir) + modale `ov-annonce` avec switcher **3 formats** (Leboncoin / Détaillé / SMS) × **4 tons** (Factuel / Storytelling / Convivial / Haut-gamme) × dossier on/off + split preview + textarea brute
> - **Étape 5 (v15.210)** — Export PDF natif jsPDF (titre H1 + body + footer pagination), Copier presse-papier, mailto: email, **case anti-mensonge obligatoire** (loi Hoguet 70-9 + L.121-1 conso) qui débloque les 3 actions
>
> **Différenciant marché** : storytelling local templating (sans IA = aucun coût, aucun risque RGPD), banques de phrases conditionnelles seedées par PRNG Mulberry32, anti-mensonge strict (énumérations de valeurs positives uniquement). BYOK Pro Connect (Claude/Mistral) reporté V2 sujet IA-V2.

### ARCHI-FICHES-UNIFIED 📋 — Session 1 CDC verrouillée (2026-05-27)
> **Sujet** : `ARCHI-FICHES-UNIFIED.md` — consolide ARCHI-IMM-LOG-DEDUP + ARCHI-DB-DOUBLONS (Phase 4b) + NAV-LOGEMENT-BAIL-CLARIF en 1 chantier transverse.
>
> **Session 1 livrée 2026-05-27** : **12 décisions verrouillées en bloc** (toutes recos validées) :
> - **Bloc A** (Immeuble↔Bien) : A1=3 champs séparés rue/CP/ville · A2=suppression brute log.adr · A3=équipements communs sur immeuble
> - **Bloc B** (Bien↔Bail) : B1=OUI suppression 9 champs legacy log · B2=OUI suppression ~30 champs legacy bail · B3=OUI déplacer 4 équipements bail→bien
> - **Bloc C** (UX) : C1=OUI Option B sidebar (Biens/Locataires/EDL) · C2=OUI encart « 🏛 Hérité » modale Bien · C3=OUI conserver wizard bail read-only · C4=OUI supprimer encart legacy « Bail courant » · C5=groupé par immeuble + toggle + 4 tris
> - **Bloc D** (UX transverse) : D1=OUI « choix prédéfini + ajout libre toujours » systématique (déjà validé 2026-05-26)
>
> **Cohérence livraisons récentes** : LOG-ANNONCE v15.207-211 a déjà créé `log.equipements{cuisine,sanitaires,technologies,customs:[]}` + `imm.equipementsCommuns{customs:[]}` → A3 + B3 + D1 partiellement appliqués déjà.
>
> **Audit initial 2026-05-26** : inventaire exhaustif des 4 entités (130+ champs catalogués) — Immeuble 8-11 / Bien 52 / Bail 68 / Locataire 8-9. **Doublons** : 3 Immeuble↔Bien + ~30 Bien↔Bail + 9 Bien↔Bail-courant.
>
> **Plan 4 sessions (~15-20h)** :
> - ✅ **Session 1** (~1h) CDC user — 12 décisions verrouillées
> - ✅ **Session 2** (~4-6h) Refonte Immeuble↔Bien — v15.212 (Commit 1 schéma imm) + v15.213 (Commit 2 bien hérite) + v15.214 (post-audit 4 fixes P1/P2)
> - 🔄 **Session 3** partiellement démarrée — v15.215 (Phase 3a + 3b adresse) + F7 sync auto ES⇄IIFE + **v15.216 hotfix audit** (3 P0/P1 : immutabilité bail signé + trampoline défensif + imm partiel). **Phase 3c cleanup brutal reporté** (149 sites + 39 champs = risque trop élevé pour 1 commit, besoin tests PDF pixel-near). 4 findings P3 reportés Session 4 (G1 test fenêtre temporelle · G2 `_captureBailSnapshot` enrichi · G3 commentaire · G4 perf)
> - ⬜ **Session 4** (~3-4h) UX sidebar Option B + mockup-first pages Bien/Locataires
>
> **Gain attendu** : ~40 champs doublons supprimés (~10-15% payload Drive en moins), saisie unique, 0 désync, UX claire « mur / personne / contrat ».
>
> **Prochaine étape** : 🔜 **Validation visuelle user de Session 2+3a/b**, puis Session 3c cleanup (session dédiée future) OU Session 4 UX sidebar (mockup-first).

### BAIL-TYPES Phase B ✅ — Bail meublé complet (v15.191→v15.195, 2026-05-26)
> **Sujet** : `BAIL-TYPES.md` — ajout 6 types de bail (nu/meublé/étudiant/mobilité/garage/autre) avec rétrocompat totale.
>
> **v15.191 — Étape 1 Infrastructure** : champ `bail.type` (default `'nu'`), sélecteur dans wizard étape 2 « Conditions », handler `onBailTypeChange()` qui pré-remplit DG selon type (1×HC nu, 2×HC meublé/étudiant, 0 € mobilité verrouillé), recalcule date de fin via `autoFinBail()`, badges type sur cartes bail (📚 🎓 🚀 🚗 📋, silencieux pour nu).
>
> **v15.192 — Étape 2 Inventaire mobilier** (décret 2015-981 art. 2) : section visible si type ∈ {meublé, étudiant, mobilité}. 11 checkboxes obligatoires (literie, occultation, plaques, four, frigo, vaisselle, ustensiles, table, étagères, luminaires, entretien) + textarea détails libres. Compteur live `X/11` avec code couleur (vert 11, ambre 8-10, rouge <8). Bouton « Tout cocher » / « Tout décocher ». Warning si <11 cochées (juridiquement = bail nu si incomplet). Champs `data-bail-editable="1"` pour échapper au verrou readonly du tab « Le bien » (Phase 4 archi).
>
> **v15.193 — Étape 3 Clauses HTML/PDF meublé** : `buildBailStructure(bail)` désormais type-aware. Titre, sous-titre, articles de loi cités, mention DG header, durée + phrase justificative, congé/préavis BAILLEUR (3 mois meublé vs 6 mois nu), tacite reconduction (1 an meublé / non reconductible étudiant / interdite mobilité), §7 DG (1 mois nu / 2 mois meublé / 0 mobilité avec callout VISALE / libre garage), §1 bis nouveau « Inventaire du mobilier » avec table récap 11 catégories + alerte si incomplet, §17 annexes obligatoires ajoute ligne 11 « Inventaire détaillé du mobilier ». 6 variantes gérées : nu / meublé / étudiant / mobilité / garage / autre.
>
> **v15.194 — Étape 4 Annexe inventaire mobilier** : nouvelle page dédiée du PDF (visible meublé/étudiant/mobilité) titrée « Annexe 11 — Inventaire détaillé du mobilier ». Tableau 7 colonnes (N° / Catégorie / Fourni / Quantité-désignation / État entrée / État sortie / Observations) sur les 11 catégories décret 2015-981. Codification État N/B/U/HS. Zone observations libres + signatures contradictoires entrée/sortie (BAILLEUR + LOCATAIRE). Mention 1731 C. civ. + 25-6 loi 89-462 sur retenue DG.
>
> **v15.195 — Étape 5 Tests Vitest dédiés** : nouveau module `__tests__/helpers/bail-types.js` (helpers purs + source de vérité documentée pour les 6 types) + test suite `bail-types.test.js` (63 tests). Couvre `BAIL_TYPES`, `MOB_CATEGORIES_DECRET_2015_981` (11 catégories figées), `isBailFurnished`, `getBailDureeMonths`, `getBailDgMonthsMax`, `getBailLegalRefs`, `getBailPreavisMonths`, `isTaciteReconductionAllowed`, `getMobilierCompletion`, `isMobilierLegallyComplete`. Asserts sur les articles de loi cités (89-462 art. 10/22/25-3/25-7/25-12/25-18, décret 2015-981, ELAN art. 107, CC art. 1709).
>
> **1020/1020 tests Vitest OK** (957 historiques + 63 nouveaux). Phase B complète — reste à attaquer Phase C (Bail garage simplifié) + Phase D (Bail mobilité avec motif) + Phase E (Bail étudiant 9 mois) — l'infrastructure type-aware est déjà en place, ces phases sont essentiellement du polish + champs spécifiques (motif mobilité).

### BUG 3.A ✅ — Bouton « Créer bail » fiche logement (v15.190, 2026-05-26)
> **Bug user** (BUG-CRITIQUES-2026-05-25) : « dans logement le bouton créé bail dirige vers le bien » — boucle UX dans le flow quotidien.
>
> **Cause** : ligne 31450 (`logf-panel` Bail en cours, quand aucun bail actif), bouton appelait `openNewLog(refSafe)` (= éditeur du **bien**) au lieu de `openBail(refSafe)` (= formulaire **bail**).
>
> **Fix** : 1 ligne. `openBail(ref)` pré-remplit le formulaire avec le logement et verrouille le dropdown — comportement parfait pour cette UX.
>
> **Commit** `afb924c`. 957 tests OK.

### CLEANUP-MASSIF-DRIVE ✅ — 9 commits cleanup + fix bug racine OAuth (v15.181→v15.189, 2026-05-25/26)
> **Session marathon cleanup** demandée par user après 20 commits Drive accumulés en 1 jour. Audit indépendant via 4 agents code-reviewer en cycle.
>
> **9 commits livrés** :
> - **v15.181 Phase D** : ~50 lignes de commentaires obsolètes condensés
> - **v15.182 Phase C** : 5 fonctions zombies supprimées (~110 lignes : `_attemptStartupReconnect`, `_drvPocShareWithAssociate`, `_dismissDriveModal`, `driveInviteMember/Revoke`, `_checkDashMigrationV2/Accept/Dismiss`)
> - **v15.183 Phase F** : ID Drive hardcodé `1nodzkJIr6a07Cm7WVYu12Jgz5IyNlUum` extrait en constante `LEGACY_OWNER_EDL_ROOT_ID` (8 occurrences → 1 déclaration)
> - **v15.184 Phase A** : 4 bugs critiques fixés (TDZ `_inDrivePull`, 2 tombstones manquants IRL+importRules, cascade `delEnt` documents étendue, `_drvSAD()` 4 endpoints)
> - **v15.185 Phase B** : helper `_tombstoneObj()` centralisé + 3 sites refactorisés
> - **v15.186 Phase E** : fusion `_drvImmoTrackRoot` ↔ `_getImmoRootFolder` (hiérarchie 4 caches)
> - **v15.187** : fix audit #1 — cascade 4/7→8/8 parentTypes + branche immeuble dans `_buildEntityPayload` + `_drvOpenImmoTrackFolder` shared root
> - **v15.188** : fix audit #2 — `delEnt` préserve `immeubles: [{id, nom}, ...]` dans tombstone (sinon docs immeuble jamais propagés cross-device)
> - **v15.189 FIX BUG RACINE** : retrait `gmail.send` du scope OAuth par défaut → résout enfin « 2 popups Google » qui persistait depuis v15.80. Granular consent multi-cases. Solution incremental authorization à venir (cf `EMAIL-OAUTH-INCREMENTAL`).
>
> **957/957 tests Vitest OK** à chaque commit. Filet de sécurité `index.html.BACKUP-v15.180-20260525-pre-audit` + tag git `audit-baseline-v15.180`. Dettes techniques : `EMAIL-OAUTH-INCREMENTAL` + `BUG-DELIMM-CASCADE`.

### DRIVE-REORG fix Baux+EDL ✅ — Routing nouveau + migration legacy (v15.173+v15.174, 2026-05-25)
> **v15.173** : étend la migration Phase D aux fichiers `immotrack-entity-*.json` à la racine (déplacement vers `[entité]/`). Cohérence totale avec « 1 dossier par entité contenant tout ».
>
> **v15.174** : user signale « baux et EDL en dehors du bon fichier ». Diagnostic : `uploadBailPDFToDrive` + `uploadEDLPDFToDrive` utilisent un dossier Drive HARDCODÉ (`DB.params.edlDriveFolderId` fallback `1nodzkJIr6a07Cm7WVYu12Jgz5IyNlUum`) → créent `Baux/[ref]_[loc]/` et `EDL/[logement]/[type_date]/` HORS de la nouvelle arbo par entité (code legacy avant DRIVE-ARBORESCENCE v14.20). Fix : routing nouveau (utilise `log.driveFolders.baux` et `log.driveFolders.edl`) + migration legacy intégrée au bouton « Réorganiser mon Drive » (scan 2 racines possibles, déplacement PATCH addParents/removeParents). Récap alert() en 4 sections.

### DRIVE-REORG Phases B+C+D+E ✅ — Sauvegarde cloisonnée + auto-détection + migration + UI (v15.172, 2026-05-25)
> **Termine la refacto Drive** demandée par user : « un dossier par entité qui comprend tout, sauvegarde incluse » + « zero friction côté co-gestionnaire ».
>
> **Phase B** : `_driveSaveOneEntity` POST dans `[entité]/` au lieu de root. `_driveLoadEntityFiles` adapté avec scan récursif via `_drvListAllFilesRec` + filter (rétro-compat fichiers anciens à la racine, dédoublonnage par fileId).
>
> **Phase C** : auto-détection cross-user au login. `_drvAutoDetectSharedFolder` scan `sharedWithMe=true` + nom `ImmoTrack`. Si trouvé → modale 1 clic → set `_drvSharedRootId`. Plus jamais besoin de Pickerisé manuellement pour les cas standards. `_drvAutoDetectDismissed` mémorisé si l'user dit non (reset au clic « Revenir à mon Drive perso »).
>
> **Phase D** : bouton « 🗂 Réorganiser mon Drive » dans Paramètres → Partage. `_drvMigrateDocsToEntityFolders` déplace les anciens fichiers de `Documents (hors logement)/` vers `[entité]/Documents/` (PATCH addParents+removeParents). Idempotent. Récap détaillé.
>
> **Phase E** : UI Paramètres → Partage refondue. Message clair « détection automatique à l'ouverture », bouton Picker en secondaire. Card migration ajoutée.
>
> **Commit** `7030468`. 957 tests Vitest OK.

### DRIVE-REORG Phase A ✅ — Docs entité/immeuble cloisonnés par entité (v15.171, 2026-05-25)
> **Feedback user** : « les docs entité et immeuble sont dans un dossier Documents (hors logement) commun à toutes les entités, c'est mal cloisonné. Il faut faire un dossier par entité qui comprend tout ».
>
> **Fix Phase A** : nouveaux helpers `_drvEnsureEntityDocsFolder(entityNom)` + `_drvResolveDocEntity(doc)` qui détermine l'entité parente d'un document. Refacto `_drvAttachmentFolderId` : pour les docs SANS logRef (entité/immeuble), route vers `[entité]/Documents/` au lieu du dossier mutualisé. Cas couverts : logement, entite directe, immeuble (recherche dans DB.entites[*].immeubles[*]), mouvement avec qui="SCI:nom", bail avec parentRef=log.ref.
>
> **Phases B/C/D/E reportées** : sauvegarde JSON dans `[entité]/`, auto-détection cross-user zero-friction, migration anciens docs, refonte UI. Capturées dans `docs/subjects/DRIVE-PARTAGE-PICKER.md` pour reprise en session dédiée (~3h restantes).
>
> **À l'usage** : les NOUVEAUX docs entité/immeuble uploadés dès v15.171 vont au bon endroit. Les ANCIENS restent dans `Documents (hors logement)/` tant que la Phase D migration n'est pas faite (à venir).
>
> **Commit** `c2542f5`. 957 tests Vitest OK.

### DRIVE-PARTAGE-PICKER ✅ — Phase 1-5 industrialisation co-gestion 2-users (v15.167+v15.168, 2026-05-25)
> **POC v15.167** : bouton de test `permissions.create` sur chaque fichier du dossier ImmoTrack → Marion (co-gestionnaire) débloquée immédiatement sur la **lecture des PJ binaires** (photos EDL, PDF bail…). Confirme empiriquement que le scope `drive.file` exige une autorisation **individuelle par fichier** (le partage du dossier parent ne propage que la lecture des JSON entité).
>
> **v15.168 — industrialisation 5 phases** :
> - **Phase 1 UI Co-gestionnaires** : card propre dans Paramètres → Partage. Liste emails + label + bouton ajouter/retirer. `DB.params.coGestionnaires` initialisé dans initDB, partagé dans le JSON DB (propagation cross-device).
> - **Phase 2 Auto permissions.create** : hook fire-and-forget dans 4 fonctions (`_drvUploadAttachmentNow`, `_drvUploadDoc`, `_driveSaveOneEntity POST`, `_driveSaveGlobal POST`). Chaque nouveau fichier est partagé automatiquement avec tous les co-gestionnaires.
> - **Phase 3 Backfill** : `_drvBackfillSharePermissions(emails?)` recyclé du POC, proposé automatiquement à l'ajout d'un nouveau co-gestionnaire + bouton manuel « 🔄 Rattraper les anciens fichiers ».
> - **Phase 4 « 1 fichier par user »** (pour l'écriture cross-user) : helpers `_drvUserTag()` (hash FNV-1a 6 hex de _userEmail, stable cross-device) + `_drvMyEntityFiles()` (tracking localStorage non-contaminé par les merges Drive). `_driveSaveOneEntity` refacto : PATCH known → succès → mémo, 403/404 → POST nouveau fichier tagué `immotrack-entity-{eid}__{userHash}.json`. Idem `_driveSaveGlobal`. `_driveLoadGlobal` élargi à `name contains 'immotrack-global'` + filter regex strict. `_driveLoadEntityFiles` déjà compatible (`name contains 'immotrack-entity-'`). Merge LWW (`_drvWins`) tranche entre versions untagged/tagged.
> - **Phase 5 Tests Vitest** : 21 nouveaux (`drive-multiuser.test.js`) couvrant `_drvUserTag` stabilité + naming convention + filter global files + simulation des 4 scénarios save. **957 total, zéro régression**.
>
> **Pour Marion** : après hard reload, plus de 403 à la sauvegarde (ses modifs vont dans `immotrack-entity-{eid}__{son-tag}.json`, fichiers SIEN). Plus de « binaire introuvable » sur les PJ uploadées par toi (permissions explicites partagées). Et inversement : tu vois ses modifs/uploads (LWW merge + permissions auto).
>
> **Limites résiduelles connues** : non testé en prod cross-user IRL (test Marion à faire). Drive Picker option B (sélection dossier) reste fonctionnelle pour onboarding. **Coût zéro Google Workspace** (toujours en `drive.file` minimal).
>
> **Commits** : `5ee7f52` (POC v15.167) + `a851213` (v15.168 Phase 1-5). +1021 / -241 lignes.

### BUG-DEMO-INJECTION ✅ — Suppression injection auto démos + bouton purge buggé (v15.166, 2026-05-25)
> **2 bugs liés résolus en 1 commit** (couvre BUG 1 P0 de BUG-CRITIQUES-2026-05-25) :
>
> **Bug A — Bouton « Supprimer SCI Dupont locale » sans effet** (constaté par user) : `cleanupDupontLocal()` faisait `DB.entites = filter(...)` brut sans créer de tombstone → suppression locale propre, mais push Drive itère uniquement les entités alive → tombstone jamais propagé → pull suivant ramenait la version live → SCI Dupont réapparaissait. Le commentaire l'avouait : « ⚠️ locale uniquement ». **Fix** : bouton + fonction retirés. L'user passe par delEnt(id) sur la fiche entité → cascade tombstone propre (pattern v14.30 BUG-DRIVE-RESURRECTION) → propagation Drive OK.
>
> **Bug B — Injection auto des démos sur tout nouveau device** : initDB injectait SCI Dupont/DEMO-F2/mvts 9000001-3 sous condition `!driveUsed`. `driveUsed` étant local (`localStorage._driveLastSync`), il était vide sur tout PC/Mac/téléphone vierge → démos injectées AVANT que l'user connecte Drive. Risque concret : mode offline-first v15.116 autorisait les écritures → modifs sur démos prenaient _modifiedAt=NOW → push Drive → `_drvWins` favorisait les démos tombstone vs vraies données plus anciennes → **pollution Drive irréversible possible**. **Fix** : retrait complet de l'injection auto + `_firstLaunch` + `_demoWelcome` + toast bienvenue démo. Pour charger un dataset démo, futur bouton opt-in via `_loadDemoDataset` (déjà utilisé en sandbox).
>
> **Pour l'user** : tombstones déjà propagés via delEnt cascade sur PC → Mac et téléphone seront nettoyés au prochain pull Drive. Plus jamais de réinjection au boot d'un nouveau device.
>
> **Commit** `156e0bb`. Bump v15.166. -233 lignes / +75 lignes (net cleanup).

### BUG-CSV-ENCODING ✅ — Auto-détection UTF-8 vs Windows-1252 import bancaire (v15.165, 2026-05-25)
> **Bug user** : import CSV CIC/Crédit Mutuel (`00021317403.csv`) → « Aucune transaction trouvée » alors que le fichier était valide. OFX OK sur plusieurs tests.
>
> **Cause** : `FileReader.readAsText(f, 'utf-8')` (l.35495 dans `_bankImportFileLoaded` ET l.36374 dans `handleImport` legacy). Or les exports CIC/Crédit Mutuel/BP/SG sont en Windows-1252 → en-têtes `Débit;Crédit;Libellé` mangled en `D�bit;Cr�dit;Libell�` → `_bankAutoDetectColumns` ne reconnaît plus debit/credit/libelle → 0 ligne extraite.
>
> **Fix** : `readAsArrayBuffer` + `TextDecoder('utf-8', { fatal:true })` first (throw si séquence invalide) → fallback `TextDecoder('windows-1252')` qui couvre 99% des banques FR/EU legacy. UTF-8 (BNP/Boursorama/N26) inchangé. Audit grep a remonté 2 sites, les 2 corrigés.
>
> **Commits** `e17ae51` (V2 importer) + `250064b` (legacy importer). Bump v15.165.

### 19C BUG-EQUIP-INTERV-FEEDBACK ✅ — Reset filtres + scroll/highlight après save intervention (v15.164, 2026-05-25)
> **Bug** : après save d'une intervention équipement, si un filtre immeuble/logement actif ne matchait pas le logement de la nouvelle intervention → user voyait « Aucun logement trouvé » → impression que le save avait échoué.
>
> **Fix** (`saveEquipIntervention` l.34227 + `rEquipements` l.33959) :
> - Reset `equip-f-imm` + `equip-f-log` AVANT le re-render → garantit que la ligne fraîchement saisie est dans le scope
> - Toast étendu : mention « (filtres réinitialisés) » uniquement si filtres étaient actifs
> - Scroll + highlight vert 2s de la ligne via `tr[data-equip-key="${ref}__${key}"]` (attribut composite ajouté au template), `CSS.escape()` pour refs avec caractères spéciaux
>
> **Commit** `a0744f2`. Bump v15.164 (5 places + sw.js).

### DASH-REFONTE-GLOBALE-V4 ✅ — Refonte V4 Stripe complète (sandbox v15.37) — session 2026-05-15/16 (~7h cumulées)
> **Refonte visuelle COMPLÈTE** alignée sur mockup `docs/strategie/dashboard-mockups/galerie-finale-sans-surcharge.html` (variant V4 Stripe, l.947-1136).
>
> Suite à retour user (capture CP1-4 jugée hybride) : abandon des patches incrémentaux → réécriture complète du dashboard + sidebar V4 Stripe.
>
> **Fonts** : ajout Inter (400-800) + JetBrains Mono (400-600) en plus de Manrope existant.
>
> **CSS** : ~480 lignes ajoutées dans `main.css` scopées `body[data-dash-v4="on"]` (préfixe classes `.v4s-*`). Activé uniquement quand `DB.params.dashRenderV === 'v2'`.
>
> **Sidebar V4** (`_renderSidebarV4`) : logo "ImmoTrack" + badge PREMIUM · 4 carrés entités top 3 + bouton "+" · nav compacte avec 16 items (icones SVG Feather-style) + badges count (Logements / Locataires / Loyers) · sections "Comptabilité" et "Réglages" · footer avatar DK + nom + sous-titre.
>
> **Dashboard V4** (`_renderDashV4`) — 5 sections :
> 1. **Coach IA** : eyebrow + h2 "Priorisation {Mois Année}" + 3 cards horizontales (todos dédupliqués par type via `_TODO_TYPE_META`) + CTA "DÉMARRER →".
> 2. **Narrate** : phrase narrative discrète avec deltas dynamiques (montant + delta vs mois-1 + % collecté réel + restant).
> 3. **Row1** : Hero jauge demi-cercle SVG (pctCollecte) + Cash-flow 12 mois (sparkline area gradient + 3 mini-KPIs YTD) + Sujets à traiter (top 3 priorisés).
> 4. **Row2** : 5 KPIs Bloomberg row (Occupation·MAG / Rendement / DG / Charges·Loyers / vs mois-1).
> 5. **Entview** : par entité, header + KPIs + immeubles avec lots colorés (ok/warn/vac).
>
> **Helpers métier intacts** : `_computeUnifiedTodo`, `_TODO_TYPE_META`, `_heroCashflowSeries`, `_mkSparkline`, `_buildHeroDrill`, `_buildFluxDrill`, `_isLoyerCategory`, `_computeImpayes`, `_isAlive`. 23 drill-downs `_DD[*]` préservés (hero, flux, occ, rdt, donut, dg, todo-unified accessibles).
>
> **Bugs fixés en cours de session** :
> - `objMens × 12` quand "Toute l'année" (avant : "8 250 € sur 1 706 €" — bug annuel vs mensuel).
> - Narrate "100 % collecté" en dur remplacé par `pctCollecte` réel + restant.
> - Delta % cash-flow et "vs mois-1" : clamp si `prevCf` < 10% du courant (évite "+5213 %" aberrant) → bascule sur delta absolu €.
> - Label "vs N-1" → "vs Mars 2026" (label dynamique partout).
>
> **Comportement** :
> - V4 Stripe activé automatiquement quand `dashRenderV='v2'` + thème dark (force thème dark via `_applyStoredPrefs`).
> - Sidebar legacy (sections collapsibles + entités épinglées CP1) masquée via CSS quand v2 actif.
> - Pages autres que dashboard intactes (navigation `go(page)` préservée).
>
> **Vérification visuelle** (preview_eval sur http-server local) :
> - data-dash-v4="on" ✓ · thème dark ✓ · v15.37 ✓
> - Sidebar : logo + carrés entités + 16 nav items + footer ✓
> - Dashboard : coach (2 cards) + narrate (40% collecté + restant) + row1 (hero/cash/sjt) + row2 (5 KPIs) + entview (4 lots colorés) ✓
> - Fonts Inter + JetBrains Mono chargées ✓
> - Console : aucune erreur runtime ✓
>
> **Sujet à jour** : règle "Pas de jauge SVG géante" du `DASH-REFONTE-GLOBALE-V4.md` **abandonnée** au profit du mockup (jauge demi-cercle conservée). Sujet à mettre à jour en V3-VISUEL.
>
> **À valider** : capture user pour propagation prod `index.html`. **Sujet** : [DASH-REFONTE-GLOBALE-V4.md](docs/subjects/DASH-REFONTE-GLOBALE-V4.md).
>
> **Reports V3-VISUEL** : suppression `.cockpit-v2/.cockpit-v4` orphelins (anciennes versions CP2-3), nettoyage code mort `top/maxV/rows` dans widget `donut` v1 (10 lignes harmless), nettoyage widgets v1 legacy (`occ`, `rdt`, `donut`, `dg`, `flux`) qui ne sont plus appelés en mode V4 (utilisés seulement si dashRenderV revient à 'v1'), audit dark des 3 backgrounds `#fff` résiduels (modales/print).
>
> ──────────────────────────────────────────────────────────────────────
> **Historique** (workflow CP fractionné abandonné mi-session) :

### DASH-REFONTE-GLOBALE-V4 ✅ historique CP1-4 — Refonte globale dashboard + sidebar (sandbox v15.36) — session 2026-05-15 (~4h)
> **CP1 + CP2 + CP3 + CP4 livrés en bloc sandbox** `index-test.html` (master, sandbox-first). Décision user (mi-session) : abandon des checkpoints intermédiaires invalidables → enchaînement complet.
>
> **CP1 — Fondations** :
> - Thème dark forcé par défaut quand `DB.params.dashRenderV === 'v2'` et aucune préf user explicite (`_applyStoredPrefs`). Préf user respectée si déjà set.
> - Sidebar V4 : sections collapsibles individuellement (chevron + click titre, état persisté `immotrack_sb_sections_collapsed`) · entités épinglées top 3 par revenus annuels (clic = filtre dashboard) · footer DK (avatar + nom + lien Paramètres). No-op si `dashRenderV !== 'v2'`.
> - Bandeau Priorisation dédupliqué par `type` dans `_renderTopBandeauPrio` (ex. 3× "MRH manquante" → "Assurances × 3"). CSS responsive : `line-clamp: 2` + `nowrap` retiré.
> - Widget "À TRAITER" retiré du grid v2 par défaut : `DASH_DEFAULT_LAYOUT.todo-unified.visible = false` + ajout dans `hide` Sets `proprio`/`gestion`. Drill `_DD['todo-unified']` préservé via bandeau CTA. Hero passe `col: 12`.
>
> **CP2 — Cockpit Hero V4 Stripe narrative** :
> - `_heroV2` réécrit : jauge SVG 220×220 **supprimée** → format narrative (eyebrow + titre `8 250 € reçus sur 8 250 € attendus · 100 %` + sous-titre delta absolu € + barre progress horizontale fine + 4 satellites Recettes/Charges/Cash-flow/Occupation).
> - **Fix bug** : label `vs N-1` remplacé par `vs Mars 2026` (label dynamique mois-1 partout). Pill delta `cv4-sat-delta` avec couleur + flèche.
> - CSS `.cockpit-v4` ajouté (140 lignes). `.cockpit-v2` orphelin conservé (inerte) → cleanup en V3-VISUEL.
>
> **CP3 — Cash-flow 12 mois Bloomberg + 5 KPIs sparklines** :
> - Widget `flux` : sparkline passe de 6 à 12 mois + axe X mois 1-lettre (J F M A M J J A S O N D) + baseline 0 pointillée + ligne moyenne pointillée + delta `vs Mars 2026` sous le Net.
> - Widgets KPI Bloomberg (`occ`, `rdt`, `donut`, `dg`) : eyebrow JetBrains Mono uppercase + valeur grosse Manrope 24px + delta couleur + sparkline 12 mois inline (rdt + donut).
> - **`donut` renommé "Charges / loyers"** : ratio % charges/loyers + delta pts vs mois-1 + sparkline 12 mois du ratio. Drill `_DD['donut']` garde le détail catégories intact.
> - Helpers `_kpiMonthlySeries`, `_mkSparkline`, `_isLoyerCategory`, `_buildFluxDrill`/`_buildOccDrill`/`_buildRdtDrill` **intacts**.
>
> **CP4 — Suppression doublons + audit dark + responsive** :
> - **Bouton "9 actions requises"** (`#dash-alert-pill`) : conditionné `display:none` en v2 (redondant avec bandeau Priorisation top).
> - **Widget `context-bar` simplifié** en v2 : retire la salutation (déjà dans bandeau) → reste date + pills entité/période.
> - **Audit dark 14 onglets** : couverture suffisante (46 rules `[data-theme="dark"]` + 31 media queries déjà en place). 3 backgrounds hard-coded `#fff` résiduels (probablement modales/print) → audit fin reporté en V3-VISUEL.
> - **`dash-ent-cards` refonte V4 narrative reportée en V3-VISUEL** : decision pragmatique — code map() complexe (l.5357+), risque élevé de casser la logique métier pour gain visuel modéré (cards actuelles fonctionnelles, juste denses). Note ajoutée ci-dessous.
> - Responsive 3 formats (1440 / 1024 / 375) : couverture media queries existante préservée.
>
> Helpers métier intacts globalement. 23 drill-downs `_DD[*]` préservés (14 chemins visibles via grep + chaînages internes).
>
> **À valider** : capture user → propagation prod `index.html`. **Sujet** : [DASH-REFONTE-GLOBALE-V4.md](docs/subjects/DASH-REFONTE-GLOBALE-V4.md). **Code mort résiduel** : variables `top/maxV/rows` dans widget `donut` (10 lignes harmless, à nettoyer en V3-VISUEL).

### v15.21 quick win UX — retrait bouton « Mettre à jour les loyers » Pilotage — session 2026-05-15 (~5 min)
> User : *« Mettre à jour les loyers ? quel est l'utilité ? »*. Bouton retiré du Pilotage (révision IRL reste accessible via l'onglet Révision IRL + cas par cas par bail). Fonction `_pilOpenBulkMajIrl()` conservée @deprecated.

### Phase D spec — STRIPE-PAYWALL-V1 (doc 30-50h estimé) — session 2026-05-15
> Spec complète Stripe paywall V1 vanilla JS : modèle économique 4 tiers (Free 1 lot · Solo 14,90€ · Co-gestion 19,90€ · Gestionnaire 29,90€/user · Pro 89€/user), architecture sans backend (Stripe Payment Links + Customer Portal + 1 cloud function proxy auth), roadmap implé D0-D5.
>
> **Doc** : [STRIPE-PAYWALL-V1.md](docs/subjects/STRIPE-PAYWALL-V1.md). Implé après Phase B/C alignées et validation pricing par entretiens Phase E.

### Phase E spec — ENTRETIENS-HOGUET (sourcing + script + templates) — session 2026-05-15
> Plan complet 10 entretiens gestionnaires Hoguet 10-50 lots : objectifs (pricing 29,90€/user + différenciants + décision V2), méthodologie 30 min visio, plan d'entretien minute par minute, templates messages LinkedIn/email/forum, tableau suivi Google Sheet, coût estimé 630€.
>
> **Doc** : [ENTRETIENS-HOGUET.md](docs/subjects/ENTRETIENS-HOGUET.md). Sourcing à démarrer en parallèle Phase D dev. Livrable final = décision V2 GO/PIVOT/NO-GO.

### Phase A3 — BUG-DRIVE-PARTAGE-TIERS (workaround V1 documenté) — session 2026-05-15 (~15 min, doc only)
> User : *« j'ai donné accès à un tiers et elle n'a pas toutes les infos et ne peut pas enregistrer »*. Cause structurelle : OAuth `drive.file` ne permet pas d'écrire dans un fichier créé par un autre user, même si Drive natif autorise l'édition.
>
> 4 options évaluées (synthèse SaaS V2). **Option D retenue** : Drive partagé Google (anciennement Team Drive) → tous les membres sont propriétaires effectifs → OAuth `drive.file` autorise lecture+écriture pour Marion. **Zéro modif app**, 30 min setup user.
>
> Procédure pas-à-pas dans le doc sujet. Fix structurel multi-tenant = Phase D / V2 Q4 2027.
>
> **Doc sujet** : [BUG-DRIVE-PARTAGE-TIERS.md](docs/subjects/BUG-DRIVE-PARTAGE-TIERS.md). Note Phase D : tier « Co-gestion » à ~19€/mois pour formaliser commercialement le partage.

### Phase A2 — BUG-POPUP-QUITTANCE (régression v15.10) — session 2026-05-15 (~30 min, v15.20)
> User : *« J'ai enregistré un mouvement... Je n'ai pas eu le pop up (v14.63) »*. En réalité régression v15.10 Sprint 11 : auto-gen boot + matching auto silencieux faisaient que la quittance existait DÉJÀ au moment du saveMv → l'ancien code passait dans la branche `_exists = true` → toast inutile au lieu du popup.
>
> **Fix** : si toggle bail `quittAutoGen` actif → TOUJOURS proposer popup (créer OU ouvrir). Message différencié. Filtre `_deleted` ajouté (tombstone-safe).
>
> **Doc sujet** : [BUG-POPUP-QUITTANCE.md](docs/subjects/BUG-POPUP-QUITTANCE.md). Validation manuelle requise.

### Phase A1 — BUG-PRORATA-DASH (fix calculs loyer intra-mois) — session 2026-05-15 (~3h, v15.19)
> **Bug bloquant pour monétisation V1**. Locataire entré mi-mois (1-15) marqué « impayé » dans dashboard alors qu'il avait payé son prorata. Cause : `_getActiveBailHcCh` testait au 15 du mois et retournait le loyer plein → cassait `_computeImpayes`, `_computeExpectedRent`, `_buildProgDrill`.
>
> **Fix** : nouveau helper `_loyerProrataMois(log, yr, mi, bails, irlHist)` testable (loi 6 juillet 1989 + jurisprudence Cass. 3e civ.). Gère entrée mi-mois, sortie mi-mois, transition de 2 baux mi-mois, révisions IRL pour bail courant vs `bail.hc` figé pour bail historique clos. Wrapper inline `_getActiveBailHcChProrated`. Les 3 callsites de calcul d'attendu refactorés (hero impayés, attendu vs encaissé, progression annuelle).
>
> **Tests Vitest** : 713 → **744** (+31 nouveaux, zéro régression). 7 tests scénario user reproductible (cas Marion entrée 10/03).
>
> **Doc sujet** : [BUG-PRORATA-DASH.md](docs/subjects/BUG-PRORATA-DASH.md).
>
> **Reste à valider visuellement par user** dans `index-test.html` avant promotion vers `index.html`.

### Sprints 14-15-16-17 V1.1 + Fixes UX — session 2026-05-14 (~2h, v15.14 → v15.17)
> **Clôture du marathon V1.1**. Sprint 14 IMPORT-EXCEL-LOG déjà livré (template + import existants). Sprint 15 mobile = RAS (39 media queries en place depuis Sprint 3H v14.95). Sprint 16 cleanup Hub Communications (marqué @deprecated suite retour user "communication dans bail n'a aucune logique"). Sprint 17 polish UX → **reporté à l'audit onglet par onglet** vu les retours utilisateur sur la direction globale.

**3 retours utilisateur critiques traités v15.14-v15.17** :
- v15.14 : 4 fixes UX (bug clôture bail, refonte cartes quittances, alertes remontées, section DG dédiée fiche bail)
- v15.15 : rollback alertes remontées (« 1b c'est vraiment de la merde »)
- v15.16 : retrait Hub Communications + Historique communications de la fiche bail (« communication dans bail n'a aucune logique »)
- v15.17 : Hub Communications JS marqué @deprecated (code conservé pour audit)

**Audit onglet par onglet planifié post-marathon** : suite aux retours user multiples sur direction globale ("plein de rajouts peu compréhensibles qui complexifient tout"), audit ensemble pour décider quoi garder/cacher/virer dans tous les ajouts Sprints 6-13.

| Sprint | Statut | Détail |
|---|---|---|
| 14 IMPORT-EXCEL-LOG | ✅ Déjà livré | `genImportTemplate` + `handleImportRef` existants (6 onglets xlsx) |
| 15 Mobile | ✅ RAS code | Viewport + 39 media queries déjà OK |
| 16 Cleanup | ✅ Hub Comm @deprecated | Bouton fiche bail retiré v15.16 · appels DG/impayés retirés v15.16 · code JS conservé en lecture seule pour audit |
| 17 Polish UX | ⏳ Reporté audit | À traiter onglet par onglet avec user |

**Bilan marathon V1.1 complet (Sprints 6-17)** :

| Sprint | Versions | Livré | Effort |
|---|---|---|---|
| 6 | v15.04 | USER-PROFILE-FILTERS | ~4h |
| 7+7B | v15.05-06 | LEGAL-DPE-INTERDICTION + DIAGNOSTICS-DDT | ~7h |
| 8 | v15.07 | PILOTAGE-MATRICIEL + BANK-INTEGRATION V1 | ~12h |
| 9 | v15.08 | EQUIP-CONTROLES-PERIODIQUES | ~5.5h |
| 10 | v15.09 | EMAIL-AUTO extension | ~4h |
| 11 | v15.10/11 | IRL-REVISION-UX-FIX + Quittances actives | ~8h |
| 12 | v15.12 | Gestion DG & Impayés | ~6h |
| 13 | v15.13 | DASH-PROFILES Phase 2 | ~3h |
| 14-17 | v15.14-17 | Fixes UX + cleanup | ~2h |
| **Total** | **v15.04 → v15.17** | **11 sujets P1/P2 + 13 modules core/** | **~52h** |

**Tests Vitest** : 713 passants (vs 378 avant marathon → +335 nouveaux tests, 26 fichiers, zéro régression).

**Prochaine étape** : audit onglet par onglet ensemble (post-marathon).

---

### Sprint 13 V1.1 — DASH-PROFILES Phase 2 (4 onglets dashboard par persona) — session 2026-05-14 (~3h, v15.13)
> Sprint 13 du marathon V1.1. **Sujet DASH-PROFILES Phase 2 ✅ clos** : implémentation des 4 onglets dashboard (Propriétaire / Gestionnaire / Complet / Custom) avec persist `DB.params.dashTab` et presets densifiés par persona. **Aucun concurrent (Rentila/BailFacile/Qalimo/Smovin) ne fait ça** — argument marketing premium pricing.

| Code | Sujet | Note |
|---|---|---|
| DASH-PROFILES Phase 2 | ✅ Livré (~3h). **Phases 2a-2f** : Onglets en haut du dashboard avec 4 vues (🏠 Propriétaire / 🛠 Gestionnaire / 📊 Complet / ✦ Custom). Persist `DB.params.dashTab` (décision D1=B : par-utilisateur, sync Drive). Helper `setDashTab(tab, e)` + `_currentDashTab()`. **Presets densifiés** dans `DASH_TAB_PRESETS` : Propriétaire = vue 1-écran finance (cache agenda+gestion), Gestionnaire = vue ops (cache KPIs finance lourds, garde À-faire/agenda/vacances/impayés). Complet = défaut/saved layout, Custom = layout utilisateur drag-drop (décision D2=B). Drill-down par bien via `dash-ent-cards` existant → fiche logement 360° (décision D3=A). Migration douce `initDB()` default `'proprio'`. | v15.13 · [docs/subjects/DASH-PROFILES.md](docs/subjects/DASH-PROFILES.md) |
| Tests Vitest | **713 toujours passants** (refactor purement UI, pas de nouvelle logique testable). 26 fichiers de tests. Zéro régression. | |

**Différenciant marché** :
- Rentila/BailFacile/Qalimo/Smovin/ImmobilierLoyer : **aucun n'a de dashboard par persona**
- ImmoTrack v15.13 : ⭐ unique sur le marché B2C/SCI · 4 vues qui s'adaptent au cas d'usage du moment

**Sandbox-first** respecté. Bump v15.12 → v15.13.

---

### Sprint 12 V1.1 — Gestion DG & Impayés — session 2026-05-14 (~6h, v15.12)
> Sprint 12 du marathon V1.1. **2 blocs livrés** : Gestion DG (tracking + restitution avec calcul délai légal auto) + Gestion Impayés avancée (vue centralisée + plan d'apurement + procédure judiciaire 5 étapes). Bonus : fix UX Sprint 11 v15.11 (cartes IRL compactes + bouton Fermer discret + bouton "+ Règle" import bank).

| Code | Sujet | Note |
|---|---|---|
| Gestion DG (Bloc A) | ✅ Livré (~3h). Module `js/core/gestion-dg-impayes.js` (8 KB, 8 exports) + shadow inline. **Helpers purs** : `_dgStatut` (6 états : manquant/partiel/complet/a_restituer/restitue/en_retard) · `_calculerDelaiRestitution` (1 mois si EDL sortie sans dégradation, 2 mois sinon loi 89-462 art. 22 ALUR 2014) · `_calculerSoldeDG` (DG versé - retenues - loyers impayés cumulés). **UI** : modale `#ov-dg-restitution` avec calcul auto-recalculé live + détail retenues + IBAN + date · alertes dashboard graduées (J-30 / J-7 / J+0 / J+1+ retard avec pénalité 10%/mois loi ALUR) + alertes DG manquant/partiel pendant bail. | v15.12 |
| Gestion Impayés avancée (Bloc B) | ✅ Livré (~3h). **Helpers** : `_planApurementStatut` (a_jour/retard/termine/aucun avec retardJours) · `_procedureJudiciaireEtat` (5 états : mise_en_demeure / commandement_payer / assignation / jugement / cloturee) · `_listerImpayesActifs` (agrégation tri par avancement procédure puis ancienneté). **UI** : bouton "💰 Impayés actifs" dans Pilotage matriciel → modale `#ov-impayes-vue` table récap + colonne statut coloré + modale `#ov-impayes-actions` (hub : email rappels + plan apurement + procédure) · modale `#ov-plan-apurement` saisie échéances avec checkbox payée + tracking · modale `#ov-procedure` 5 étapes datées (LRAR / commandement huissier / assignation tribunal / jugement / clôture) avec audit-trail. | v15.12 |
| Tests Vitest | **713 passants** (vs 679 Sprint 11 → +34 gestion-dg-impayes). 26 fichiers de tests. Zéro régression. | |

**Différenciant marché** :
- Rentila/BailFacile : 0 workflow DG · 0 procédure judiciaire trackée
- Qalimo V2 : tracking DG basique · partial procédure
- **ImmoTrack v15.12** : ⭐ délai légal DG auto-calculé (1/2 mois) selon EDL sortie + alertes pénalité 10%/mois + procédure judiciaire 5 étapes documentées avec audit-trail RGPD

**Sandbox-first** respecté. Bump v15.10 → v15.12 (v15.11 = fix UX intermédiaire).

---

### Sprint 11 V1.1 — IRL-REVISION-UX-FIX + Quittances actives — session 2026-05-14 (~8h, v15.10)
> Sprint 11 du marathon V1.1. **2 sujets P1 clos** : IRL-REVISION-UX-FIX (refonte UX cartes + bouton unique + logique temporelle stricte loi 89-462 art. 17-1) + Quittances actives (statut dynamique 7 états + matching paiement + escalade graduée 4 niveaux + génération auto mensuelle). Intégration EMAIL-AUTO Sprint 10 via les rappels d'escalade. **Différenciant marché majeur** : quittance mai 2026 = ancien loyer, quittance juin = nouveau (impossible avant v15.10 où `bail.hc` était muté direct).

| Code | Sujet | Note |
|---|---|---|
| IRL-REVISION-UX-FIX | ✅ Livré complet (~3.5h, Bloc A). **3 remarques utilisateur 2026-05-14 respectées** : (1) UX cartes cohérentes design system, (2) bouton unique "Valider et envoyer", (3) `bail.hc` jamais muté direct, `_loyerHCAtDate` consommateur. **Phases 1-6** : refonte rIRL() en grid 320px responsive · 4 statuts visuels colorés (À valider / Envoyée en attente / Appliquée / Gel DPE F/G) · modale `#ov-irl-valider` aperçu structuré · `applyIRL` rewrite avec `pendingApply` + `dateApplication` + cron boot `_applyPendingIRLRevisions` (vérif cohérence avant mutation) · section "📈 Historique des révisions IRL" dans LOG-FICHE-360 · audit migration baux existants (toast warning, pas de mutation auto). Toggle vue cartes↔tableau persisté localStorage. | v15.10 · [docs/subjects/IRL-REVISION-UX-FIX.md](docs/subjects/IRL-REVISION-UX-FIX.md) |
| Quittances actives | ✅ Livré complet (~4.5h, Bloc B). Sujet transversal (QUIT-EMAIL + AVIS-ECHEANCE + RAPPEL-IMPAYE intégrés). Module `js/core/quittances-actives.js` (5 KB, 5 exports) + shadow inline. **Statut dynamique 7 états** (`_statutQuittance`) : attendue / payée / partielle / impayée_J5 / impayée_J15 / impayée_J30 / mise_en_demeure. **Matching auto paiement** dans `saveMv` : nouveau mvt Loyers + qui=ref → association à `quittance.paymentMatchedMvtId`. **Escalade dashboard 4 niveaux** : alertes graduées avec lien direct vers l'email correspondant via templates Sprint 10 (avis-echeance / rappel-impaye-1 / rappel-impaye-2 / rappel-impaye-3). **Génération auto mensuelle** : toggle `DB.params.quittancesAutoGen` dans Paramètres + cron boot idempotent `_quittancesAutoGenAtBoot`. **33 nouveaux tests Vitest** dans `quittances-actives.test.js` (statut ×17 + matching ×6 + escalade ×6 + plan génération ×7). | v15.10 |
| Tests Vitest | **679 passants** (vs 646 Sprint 10 → +33 quittances-actives). 25 fichiers de tests. Zéro régression. | |

**Différenciant marché** :
- Rentila/BailFacile : génération manuelle + 0 suivi paiement automatique
- Qalimo V2 : génération auto + alerte impayé simple
- **ImmoTrack v15.10** : ⭐ logique temporelle stricte IRL (cohérent loi 89-462 art. 17-1) + 7 statuts dynamiques + matching auto + escalade 4 niveaux liée aux 29 templates email + génération auto idempotente

**Sandbox-first** respecté. Bump v15.09 → v15.10.

---

### Sprint 10 V1.1 — EMAIL-AUTO extension cycle locataire complet — session 2026-05-14 (~4h, v15.09)
> Sprint 10 du marathon V1.1. Sujet **EMAIL-AUTO** ✅ clos avec 29 types couvrant tout le cycle de vie du bail (signature → entrée → vie → fin → sortie) + **hub centralisé UX** (1 endroit > 19 boutons disséminés) + historique RGPD-compliant. Différenciant marché : aucun concurrent ne propose une telle granularité.

| Code | Sujet | Note |
|---|---|---|
| EMAIL-AUTO extension V1.1 | ✅ Livré (~4h). 19 nouveaux templates dans `js/core/email-compose.js` (29 types total vs 10 V1) avec variables interpolées, PJ + notes légales. Hub centralisé **"📧 Communications"** dans fiche logement onglet Bail : modal `#ov-comms-hub` groupe 29 types par 5 phases (Signature / Entrée / Vie du bail / Fin / Sortie) avec icônes, badges historique "✓ déjà envoyé". Prompts UI auto pour variables manquantes (dates EDL, IBAN, motifs, montants retenue DG). Helper `_buildEmailCtxFromRef(ref, extra)` factorise la construction du contexte. Section **"📧 Historique communications"** dans la fiche logement listant les 10 dernières communications (date, type, sujet, destinataire, statut). 21 nouveaux tests Vitest (62 total `email-compose.test.js`). 4 templates candidat-* reportés post LOG-CANDIDATS futur. | v15.09 · [docs/subjects/EMAIL-AUTO.md](docs/subjects/EMAIL-AUTO.md) |
| Tests Vitest | **646 passants** (vs 625 Sprint 9 → +21). 24 fichiers de tests. Zéro régression. | |

**Couverture cible atteinte** : 0 communication ad-hoc — toutes les communications bailleur ↔ locataire au cours du bail passent par les templates ImmoTrack avec historisation RGPD-compliant. **Hub centralisé** UX choisie vs boutons disséminés (1 endroit visible > scrolling cherche boutons).

**Différenciant marché** :
- Rentila/BailFacile : quittance + IRL templates basiques
- Qalimo V2 : ~8 templates standards
- ImmoTrack v15.09 : ⭐ **29 templates** couvrant 6 phases + variables interpolées + hub UX + historique automatique

**Sandbox-first** respecté. Bump v15.08 → v15.09.

---

### Sprint 9 V1.1 — EQUIP-CONTROLES-PERIODIQUES complet + fix jargon DDT — session 2026-05-14 (~5.5h, v15.08)
> Sprint 9 "Légal équipements" du marathon V1.1. Sujet **EQUIP-CONTROLES-PERIODIQUES** ✅ clos en 6 phases. **Différenciant juridique fort** : photo DAAF EDL = preuve juridique en cas d'incendie (aucun concurrent ne le fait). Capture en bonus de la **règle UX anti-jargon** suite au feedback "c'est quoi DDT ?".

| Code | Sujet | Note |
|---|---|---|
| EQUIP-CONTROLES-PERIODIQUES | ✅ Livré complet (~5h). 17 règles EQUIP_RULES (vs 12 avant) avec ECS gaz/thermo, climatisation > 12 kW, citerne fioul, VMC indiv info-only. condFn(bail, log) lit `log.equipements.*` pour les nouvelles règles. **Section UI "Configuration équipements"** dépliable dans chaque card onglet Équipements (5 champs + bloc DAAF dédié). **Article bail 11.1 bis** "Équipements spécifiques" auto-injecté avec liste personnalisée + mention DAAF obligatoire (loi 2010-238 R129-13). **Section EDL "🚨 Sécurité incendie — DAAF"** entre §1 et §2 compteurs : radio statut (présent/défaut/absent) + photo recommandée + warning juridique rouge si absent. Persistance `edl.daaf` + sync `log.equipements.daafPresent`. Migration douce `initDB()` 8 champs par défaut. Module `js/core/equipements.js` + 34 tests Vitest (_calculerProchainControle, _buildClauseEntretienItems, _isDaafCovered). | v15.08 · [docs/subjects/EQUIP-CONTROLES-PERIODIQUES.md](docs/subjects/EQUIP-CONTROLES-PERIODIQUES.md) |
| Fix jargon DDT (bonus session) | ✅ Tous les libellés UI "DDT" remplacés par "Diagnostics" / "Dossier de diagnostic technique" en clair (badges, modales, alertes dashboard, colonnes Pilotage, nom PDF, popup impression). DDT conservé uniquement dans le bail PDF signé (terme légal cité par loi 89-462). **Règle UX anti-jargon captée dans BACKLOG.md section Vision produit** avec tableau "À éviter / À utiliser" (DDT, DPE F/G, MRH, EDL, CRG, CREP, etc.). | v15.08 |
| Tests Vitest | **625 passants** (vs 591 Sprint 8 → +34 equipements). 24 fichiers de tests. Zéro régression. | |

**Différenciant marché** :
- Rentila/BailFacile/Qalimo : liste basique d'équipements + alertes basiques, **pas de photo DAAF EDL**
- ImmoTrack v15.08 : 5 catégories locataire auto-détectées + clauses bail générées + **photo DAAF EDL = preuve juridique post-incendie**

**Sandbox-first** respecté. Bump v15.07 → v15.08.

---

### Sprint 8 V1.1 — PILOTAGE-MATRICIEL complet + BANK-INTEGRATION V1 — session 2026-05-13/14 (~12h, v15.07)
> Sprint 8 "Pilotage & Bank" du marathon V1.1. **2 sujets P1 livrés intégralement en une session** (vision user "on ne fait pas à moitié"). PILOTAGE-MATRICIEL = différenciant pro Qalimo V2, BANK-INTEGRATION V1 = différenciant FR sans concurrence (Rentila/BailFacile/Qalimo ont aucun import bancaire dans le V1). 591 tests passants (+88 vs Sprint 7B).

| Code | Sujet | Note |
|---|---|---|
| PILOTAGE-MATRICIEL | ✅ Livré complet (~7h). Vue matricielle multi-baux gestionnaire pro, parité Qalimo V2. **6 phases** : (1) Onglet sidebar `🎛 Pilotage` + page 4 sous-onglets + route. (2) Suivi comptable — tableau locataire × DG + Solde cumulé + 4 mois M-3..M, bulk select + bouton `📈 Mettre à jour les loyers` avec exclusion auto gel DPE F/G + IRL N-1 manquant. Helpers `_pilSoldeLocataire`, `_pilBulkMajLoyersSimule`. (3) Suivi documents — tableau × 6 colonnes Bail/EDL/MRH/Chauffage/Caution/DDT avec badges colorés. Helper `_pilStatutDoc`. (4) Automatisations override par bail — 8 toggles avec héritage bailleur + override `bail.automatisations`, icône ⇧ si override, bouton reset. (5) Stub Prélèvements V1 (V2 SaaS). (6) Tests Vitest `pilotage.test.js` — **36 nouveaux tests** purs. Le tab Pilotage est masqué automatiquement pour profil solo/SCI via la matrice USER-PROFILE-FILTERS livrée Sprint 6 (`data-module="pilotage-matriciel"` → visible Pro/Mandataire uniquement). | v15.07 · [docs/subjects/PILOTAGE-MATRICIEL.md](docs/subjects/PILOTAGE-MATRICIEL.md) |
| BANK-INTEGRATION V1 | ✅ V1 CSV/OFX complet (~5h, **0€ coût récurrent**). Module `js/core/bank-import.js` (10 KB, 8 exports) + shadow inline complet pour mode file://. Parsers CSV (détection auto délimiteur ;/,/tab + champs guillemets) + OFX (SGML/XML standard) + amounts FR/EN + dates ISO/FR/OFX. Auto-détection colonnes par heuristiques. Matching auto par nom locataire ×3 chars + montant ≈ loyer attendu ±5€ + 8 mots-clés catégoriels (assurance/EDF/syndic/travaux/taxe foncière/emprunt/notaire/diagnostic). Dédup par fitid OFX exact (match certain) ou date ±3j + montant ±1€. UI : bouton `🏦 Importer banque` dans onglet Mouvements → modale upload+preview+correction+confirm avec selects catégorie/bail prélus + badges doublons + checkboxes par ligne. Persistance `DB.mouvements` avec `_source:'bank_import'` + audit-trail. **52 tests Vitest** dans `bank-import.test.js`. **V2 Saltedge backend** (Cloudflare Worker + OAuth DSP2 + KMS) explicitement reporté post-SAAS-MULTIUSERS (~50h, nécessite mode SaaS commercial avec Pro Connect +5€/mois). | v15.07 · [docs/subjects/BANK-INTEGRATION.md](docs/subjects/BANK-INTEGRATION.md) |
| Tests Vitest | **591 passants** (vs 503 Sprint 7B → +88 nouveaux : 36 pilotage + 52 bank-import). 23 fichiers de tests. Zéro régression. | |

**Différenciants marché v15.07** :
- Rentila/BailFacile : ❌ pas de vue matricielle pro · ❌ pas d'import bancaire
- Qalimo V2 : ⭐ vue Pilotage 4 sous-onglets · ✅ intégration bancaire (via Bridge/Linxo)
- ImmoTrack v15.07 : ⭐ parité Qalimo Pilotage + bulk IRL avec exclusion DPE auto · ⭐ import CSV/OFX V1 (0€, offline-first) + V2 Saltedge prête en architecture

**Sandbox-first** : `index-test.html` uniquement. Prod intacte.

---

### Sprint 7B V1.1 — BAILLEUR-DIAGNOSTICS-DDT Phases 2-3-4 (clôture du sujet) — session 2026-05-13 (~2.5h, v15.06)
> Continuation du Sprint 7 sur demande utilisateur (cohérence sujet). 3 phases complètes : récap DDT imprimable + PDF, bloquage bail soft (override "à mes risques"), alertes dashboard. **Sujet BAILLEUR-DIAGNOSTICS-DDT ✅ complet (5 phases en ~5h total)**.

| Code | Sujet | Note |
|---|---|---|
| BAILLEUR-DIAGNOSTICS-DDT Phase 2 | ✅ Récap DDT imprimable. Bouton `📎 Récap DDT` dans sous-onglet Diagnostics → modale `#ov-ddt-recap` avec page de garde (bailleur entité + logement + adresse + année construction) + tableau récap 9 diagnostics (icône + label + classe DPE + statut badge + détail date/expiration + diagnostiqueur) + cadre légal + 3 boutons : Fermer / 🖨 Imprimer (window.print sur popup) / 📄 Télécharger PDF (jsPDF + html2canvas multi-pages A4). Helper `_buildDdtRecapHTML(log)` print-friendly. **Limite explicite** : pas de concaténation des PDF source des diagnostics (sera fait en V2 avec pdf-lib si demandé) — chaque PJ reste dans Drive accessible séparément. | v15.06 |
| BAILLEUR-DIAGNOSTICS-DDT Phase 3 | ✅ Bloquage bail si DDT incomplet (override "à mes risques"). Intercepte `saveBail()` ligne ~10240 après le check DPE interdit strict. Si `_ddtComplet().complet=false` → modale orange `#ov-ddt-incomplet` (≠ rouge DPE interdit) listant les diagnostics manquants + expirés + 3 boutons : Annuler / **⚠ Continuer quand même** (force la sauvegarde + log audit-trail `_auditLog('override','bail',ref,'DDT_INCOMPLET_FORCE')` + flag `_skipDdtCheckOnce` consommé une fois) / **✦ Mettre à jour** (redirige fiche logement onglet Diagnostics). Override conscient et tracé = RGPD-compliant. Différent de LEGAL-DPE-INTERDICTION qui est strict (pas d'override). | v15.06 |
| BAILLEUR-DIAGNOSTICS-DDT Phase 4 | ✅ Alertes Conformité dashboard. Intégration dans `rAlertsSection()` du dashboard : 2 nouveaux types d'alertes (🏷 DDT incomplet — warn pour chaque logement loué avec `_ddtComplet` incomplet ; 🌡 DPE expire bientôt — info, anticipation rénovation 12 mois avant pour éviter gel IRL F/G). Liens cliquables qui ouvrent `openLogFiche(ref) + setLogFicheTab('diagnostics')` en 200ms. Compteur intégré au pill dashboard existant. | v15.06 |

**Différenciant marché total BAILLEUR-DIAGNOSTICS-DDT v15.05+v15.06** : DDT 9 diagnostics auto-détectés par contexte logement + récap imprimable PDF + bloquage bail avec override tracé + alertes dashboard intégrées. Aucun concurrent (Rentila/BailFacile/Qalimo) ne couvre cette parité bailleur pro.

**Tests Vitest** : 503 toujours passants (rien cassé) — Phases 2-4 sont UI + intégration, pas de nouveaux helpers purs à tester.

---

### Sprint 7 V1.1 — DPE & Différenciants (LEGAL-DPE-INTERDICTION-LOCATION + BAILLEUR-DIAGNOSTICS-DDT Phase 1+5) — session 2026-05-13 (~4.5h, v15.05)
> Sprint 7 "DPE & Différenciants" du marathon V1.1. Réponse à 2 trous légaux V1 critiques détectés à l'audit 360° : (1) absence de blocage strict bail si DPE interdit loi Climat 2021 → amende 15 000 € + nullité bail ; (2) absence d'UI pour les 9 diagnostics obligatoires bailleur (DDT loi 89-462 art. 3-3). Différenciant marché clair vs Rentila/BailFacile qui ne couvrent ni l'un ni l'autre.

| Code | Sujet | Note |
|---|---|---|
| LEGAL-DPE-INTERDICTION-LOCATION | ✅ Complet (~2h). Helper `_dpeInterditLocationAuDate(dpe, dateRef)` dans `js/core/utils.js` + inline shadow + exposition window via `js/main.js`. Calendrier loi Climat 2021-1104 art. 23 : G interdit 2025, F interdit 2028, E interdit 2034. Bloquage `saveBail()` ligne ~10230 : intercepte avant écriture DB → modale rouge `#ov-dpe-interdit` avec bandeau ⛔ + raison + calendrier + boutons "Annuler" / "Mettre à jour DPE" (redirige fiche logement). Override **impossible** (différent de DDT bloquage qui aura override "à mes risques" en Phase 3 BAILLEUR-DIAGNOSTICS-DDT). Couvre création + renouvellement (check sur `bail.debut`). Tests Vitest : 20 nouveaux dans `dpe.test.js` (DPE A-D jamais interdits ×4 + G 2025 ×3 + F 2028 ×3 + E 2034 ×2 + edge cases ×6 + calendrier expose ×2). | v15.05 · [docs/subjects/LEGAL-DPE-INTERDICTION-LOCATION.md](docs/subjects/LEGAL-DPE-INTERDICTION-LOCATION.md) |
| BAILLEUR-DIAGNOSTICS-DDT Phase 1+5 | 🔄 Phases 1+5 livrées (~2.5h). Module `js/core/diagnostics.js` (8 KB) + helpers inline shadow : catalogue 9 diagnostics (`DIAGS_CATALOG` : DPE/CREP/amiante/gaz/élec/ERP/termites/mérule/bruit) avec validité légale + référence texte + auto-détection applicabilité par contexte logement (CREP <1949, amiante <1997, gaz/élec >15 ans installation, ERP zone risques par défaut, termites/mérule/PEB sur déclaration). Helpers purs `_diagCatalogEntry`, `_diagGet` (rétrocompat champs flat DPE), `_estDiagApplicable`, `_diagDateExpiration` (string-based pour éviter bug timezone setMonth), `_estDiagExpire`, `_diagStatut` (6 statuts : valide/expirebientot/expire/na/inapplicable/manquant), `_ddtComplet`. UI : nouveau sous-onglet `🏷 Diagnostics` dans `LOG-FICHE-360` à côté de Conformité, badge DDT complet/incomplet en header, 9 cartes statut + section "Contexte logement" (année construction + installation gaz/élec + 4 cases zones réglementaires) + modale d'édition par diagnostic `#ov-diag-edit` avec champs spécifiques (DPE → classe + kWh ; CREP/amiante/termites/mérule → présence oui/non ; gaz/élec → conforme oui/non) + audit-trail sur save. Phases 2 (génération auto PDF DDT) + 3 (bloquage bail si DDT incomplet) + 4 (alertes dashboard lentille Conformité) reportées Sprint 8 V1.1 (~3-4h restants). Tests Vitest : 37 nouveaux dans `diagnostics.test.js` (catalogue + lookup + rétrocompat + applicabilité × 10 + dates + expire + statut + DDT complet). | v15.05 · [docs/subjects/BAILLEUR-DIAGNOSTICS-DDT.md](docs/subjects/BAILLEUR-DIAGNOSTICS-DDT.md) |
| Tests Vitest | 503 tests passants au total (vs 446 avant Sprint 7) — +57 nouveaux (20 DPE + 37 diagnostics). Zéro régression. 21 fichiers de tests. | |

**Différenciant marché** :
- Rentila/BailFacile : ❌ aucun blocage DPE interdit + ❌ pas d'UI DDT structurée
- Qalimo V2 : partial blocage DPE (warning sans blocage strict) + ❌ pas d'UI DDT auto-détectée par contexte
- ImmoTrack v15.05 : ⭐ blocage strict loi Climat (override impossible) + ⭐ DDT 9 diagnostics auto-détectés par âge logement et zone

**Sandbox-first respecté** : tout dans `index-test.html` uniquement. Prod intacte v14.99/15.00.

---

### Sprint 6 V1.1 — USER-PROFILE-FILTERS + résiduel BUG-CHARGE-001/BUG-DASH-001 — session 2026-05-13 (~4h, v15.04)
> Sprint 6 "Foundations Simplicité" du marathon V1.1. Réponse à la demande user 2026-05-13 « solution simple d'utilisation et UX améliorée + filtres d'activation ». Différenciant marché unique vs Qalimo/Rentila/BailFacile qui montrent tout à tous.

| Code | Sujet | Note |
|---|---|---|
| USER-PROFILE-FILTERS | 4 profils utilisateur (solo / sci_familiale / pro / mandataire) + matrice 15 modules + setup wizard 4 questions + UI Paramètres avec override toggles. **5 phases livrées** : (1) Modèle `DB.params.userProfile/modulesEnabled/profileWizardDone` + helpers `_calculateProfile`, `_isModuleEnabled` + wizard modal `#ov-profile-wizard` (4 questions : nb logements, statut, mandataire, compta) avec live preview du profil calculé. (2) Matrice 15 modules × 4 profils inline dans `_isModuleEnabled` (CORE 12 modules toujours actifs, SOLO_OFF 10 modules masqués pour particulier, SCI_OFF/PRO_OFF subset, mandataire = tout actif). (3) Sidebar dynamique : `data-module="..."` sur 14 tabs + `data-module-section="..."` sur 5 sections + helper `_renderSidebarFiltered()` qui masque tabs+sections vides. Trigger boot après `initDB()` + appel après save wizard. (4) Onglet Paramètres "👤 Profil utilisateur" + `rParamsProfile()` : badge profil actuel, récap réponses wizard, 14 toggles modules (override individuel par module), bouton réinit + bouton modifier profil. (5) Tests Vitest `profile.test.js` : 68 tests (calcul profil ×13 + matrice modules ×42 + overrides ×4 + edge cases ×3 + cohérence labels). Hook boot 2.5s : wizard auto au 1er load si `profileWizardDone === false`, skippable (default solo). | v15.04 · [docs/subjects/USER-PROFILE-FILTERS.md](docs/subjects/USER-PROFILE-FILTERS.md) |
| BUG-CHARGE-001 résiduel | 6 sites legacy `m.cat !== 'Loyers'` détectés par audit complet (Explore agent) non couverts par v14.82 Sprint 1C. Convertis vers `!_isLoyerCategory(m.cat)` pour matcher legacy + LEGAL-2044 'Loyers encaissés'. Sites : `_buildRevDrill` (l.5627), `_getLogementStartIso` (l.5771), `_buildProgDrill` (l.5892 — CRITIQUE DASHBOARD), `_buildRdtDrill` (l.6542), KPI Immeuble buildDashWidget (l.7281), Sparkline rendement (l.7343). Grep final : 0 occurrence résiduelle de `m.cat !== 'Loyers'` dans index-test.html. | v15.04 |
| BUG-DASH-001 résiduel | Fix couvert par la conversion de `_buildProgDrill` (ligne 5892) dans BUG-CHARGE-001 résiduel — c'était le site critique manquant pour que les baux en vigueur dans le mois sélectionné soient correctement reconnus avec catégories LEGAL-2044. | v15.04 |
| Tests Vitest | 446 tests passants au total (vs 378 avant Sprint 6) — ajout `profile.test.js` 68 tests. Zéro régression sur les 378 tests existants. | 20 fichiers tests |

**Vision "pas copier concurrent"** : Profils + filtres modules = différenciant unique sur le marché bailleur français. Rentila/BailFacile/Qalimo n'ont aucun système de personnalisation UX. Notion/Linear (SaaS référence) ont les presets workspace, mais pas appliqués à l'immobilier.

**Architecture extensible** : Les modules "à venir" (dashboard-lentilles, bailleurs-multi, candidats, travaux, pilotage-matriciel, export-fec, mandat-crg-sepa, audit-trail-ui, carnet-adresse, bank-integration) sont déjà dans la matrice + dans les toggles UI Paramètres avec mention "À venir Sprint X" — quand on les livre, ils s'activent automatiquement selon profil sans toucher le wizard.

---

### ENT-CASCADE-FIXES + BIENS-TABS — session 2026-05-05/06 (~2h, 4 commits, v14.51 → v14.54)
> Détectés pendant la session DASH-PROFILES Phase 1 v2 (mockups). Utilisateur a renommé entité bailleur "Perso — Didier Keller" → "Didier Keller" et tous ses KPIs sont passés à 0. Diagnostic systématique → 3 bugs corrigés en cascade.

| Code | Sujet | Note |
|---|---|---|
| BUG-ENT-RENAME-CASCADE | `saveEnt()` ne propageait pas le renommage entité vers `.entity` (logements/baux/baux_historique/quittances) ni `.qui` (mouvements globaux SCI:nom) → KPIs dashboard à 0 silencieusement après rename. Fix : cascade ~20 lignes dans saveEnt avec garde `prevNom !== ent.nom` + skip tombstones + `_modifiedAt` pour merge Drive timestamp-aware. **Bonus normalisation Unicode à la saisie** (em-dash U+2014 / en-dash U+2013 / NBSP → ASCII safe) pour éviter pièges invisibles à l'œil. | v14.51 · commit `ee48bad` · [docs/subjects/BUG-ENT-RENAME-CASCADE.md](docs/subjects/BUG-ENT-RENAME-CASCADE.md) |
| BUG-ENT-ORPHANS-CLEANUP Phase 1 | Audit boot des rattachements orphelins (5 collections) avec helper `_auditOrphans()` + toast warning 9s + console.warn détaillée par entité inconnue. Délai 2200ms après boot pour ne pas spammer. | v14.52 · commit `7e209a5` |
| BUG-ENT-ORPHANS-CLEANUP Phase 2 | Modale UI "🛠 Maintenance — Rattachements orphelins" dans Paramètres globaux. Pour chaque entité orpheline : sélecteur d'entité active + boutons Rattacher (cascade rename) ou Supprimer (tombstone). Réutilise même logique que saveEnt v14.51. Détecte aussi mouvements globaux `SCI:nom`. | v14.53 · commit `79b93bc` · [docs/subjects/BUG-ENT-ORPHANS-CLEANUP.md](docs/subjects/BUG-ENT-ORPHANS-CLEANUP.md) |
| BUG-BIENS-TABS-FILTER | Page Biens / mode Bailleurs : toggle Tous/Archivés affichait les 3 mêmes cards. Fix `_renderBiensModeBailleurs` filtre via `_entsWithArchived()` quand `_biensTab==='archives'` + `_renderBailleurCard(ent, isArchivedTab)` compte logements selon scope. Empty state "Aucun bailleur n'a de bien archivé" + libellé compteur "actif(s)" / "archivé(s)". | v14.54 · commit `ae7b24b` · [docs/subjects/BUG-BIENS-TABS-FILTER.md](docs/subjects/BUG-BIENS-TABS-FILTER.md) |

**Migration de la donnée user déjà cassée** : 3 records corrigés en console (1 logement Delle + 1 bail + 1 quittance) avant que le fix v14.51 soit poussé en prod, pour ne pas attendre.

**Outils session promus en repo principal** : `screenshot-mockups.js` (puppeteer générateur PNG mockups, réutilisable Phase 2 DASH-PROFILES + futurs aperçus), `launch.json` (config preview server `npx http-server`), `package.json` + `.gitignore` (`node_modules/` + worktrees).

**Règle pilotage codifiée** : "BACKLOG en temps réel" — mise à jour à chaque livraison, pas en fin de session. Ajoutée dans `docs/PILOTAGE.md` + mémoire user `feedback_pilotage_realtime.md`.

### DASH-PROFILES Phase 1 aperçu — session 2026-05-01/05 (~5h, 2 commits)
| Code | Sujet | Note |
|---|---|---|
| DASH-PROFILES Phase 1 v1 | 8 lentilles dashboard proposées (Propriétaire / Financier / Gestionnaire / Fiscale 2044 / Investisseur / Échéances / Prévisionnel / Patrimoine). Mockups HTML cliquables + spec MD + 18 screenshots. | commit `6749a76` (v1 abandonnée v2) |
| DASH-PROFILES Phase 1 v2 | Refonte après feedback user "paillettes" (Investisseur/Prévisionnel/Patrimoine) + "redondant" (Échéances). 4 onglets retenus (Propriétaire 1-écran refonte profonde + Gestionnaire amélioré absorbant Échéances + Complet = prod actuelle + Custom = mode édition). 6 lentilles archivées dans `_attic/`. Effort Phase 2 ramené ~38 j-h → ~4.5 j-h. | commit `6749a76` · [DASH-PROFILES-SPEC.md](docs/strategie/DASH-PROFILES-SPEC.md) · ⏳ attente validation finale + 3 décisions D1-D3 |

### GANTT-OCCUPATION — session 2026-05-03 (~3h, 1 commit, v14.45) 🔥 Killer feature
> Plan d'occupation Gantt 36 mois (24 passés + mois courant + 11 futurs) sur la fiche immeuble 360°. Killer feature différenciante vs Qalimo / BailFacile / Smovin. FICHES-PARITE-360 Session 2 livrée.

| Code | Sujet | Note |
|---|---|---|
| GANTT-OCCUPATION | Sous-onglet « 📅 Plan d'occupation » sur fiche immeuble : Gantt 36 mois, 1 ligne par logement, barres bail colorées par locataire (hash HSL déterministe → mémoire visuelle inter-vues), mini-strip occupation globale, marker AUJOURD'HUI vertical animé, hover bar → highlight cross-row du locataire (parcours dans l'immeuble), click → drill-in fiche logement, segments réalisé vs projection (rayures), stats footer 3 KPIs (taux occup 24m / durée bail moyenne / manque à gagner cumulé). Helpers `_tenantColor`, `_renderImmFichePlanGantt`, `_ganttHighlight`, `setImmFicheTab`. CSS responsive 3 breakpoints (PC ≥ 1280 / tablette 768-1279 / mobile ≤ 600). | v14.45 · [docs/subjects/GANTT-OCCUPATION.md](docs/subjects/GANTT-OCCUPATION.md) |

### EDL-AUDIT-CRITIQUE — session 2026-05-03/04 (~3h, 7 commits, v14.38 → v14.44) 🔥 P0
> Refonte module EDL après audit complet (7 bugs remontés + 7 bugs latents = 14 bugs identifiés). 12 sur 14 fixés. **Loin d'une solution pro → maintenant utilisable en prod.**

| Code | Sujet | Note |
|---|---|---|
| EDL-AUDIT-CRITIQUE Audit | Audit complet du module EDL : 14 bugs identifiés (7 remontés utilisateur + 7 latents détectés), plan en 6 phases. **Aucun patch pendant l'audit** | spec [docs/subjects/EDL-AUDIT-CRITIQUE.md](docs/subjects/EDL-AUDIT-CRITIQUE.md) · commit `ad65abb` |
| Phase 1 v14.38 | Refonte archi état EDL : helper `_edlResetGlobalState()` reset 5 globales en bloc + appels inconditionnels dans openNewEDL/openEditEDL + pattern in-place pour préserver les références JS sur 3 sites de réassignation directe (`_edlP`, `_edlCles`, `_edlCptPhotos`) | commit `32dac3f` · **Bug 6 cross-contamination photos** ✅ |
| Phase 2 v14.39 | Sync form/DB après edlSyncDrive : helper `_edlPropagateSyncedToForm` matche par idbKey et propage synced=true vers `_edlP`/`_edlCles`/`_edlCptPhotos` après chaque upload + mutex `_edlSyncing` empêche concurrence + bouton UI disable pendant sync | commit `734e33c` · **Bug 1 doublons + Bug 9 concurrence** ✅ |
| Phase 3 v14.40 | Migration arbo Drive Phase A : edlSyncDrive utilise `log.driveFolders.edl` (DRIVE-ARBORESCENCE Phase A v14.20) avec fallback `_drvEnsureLogementTree` pour logements legacy + remplace `el('edl-drive-path').value` runtime par résolution stable depuis `edl.logement → DB.logements` | commit `693ee82` · **Bug 5 ancien chemin + Bug 10 drive-path runtime** ✅ |
| Phase 4a v14.41 | iOS Safari camera fix : helper `_edlPickPhoto(onPhotos)` qui attache l'input file au DOM (off-screen invisible) avant `.click()` au lieu d'un noeud orphelin → onchange fire correctement après bouton « Utiliser » caméra native iPhone. Refactor des 3 fonctions photo (pièces / clés / compteurs) | commit `22dd2c6` · **Bug 2 photos perdues iPhone + Bug 7 photos compteurs** ✅ |
| Phase 4b v14.42 | EDL signé verrouillé : pattern `edlSnapshot` répliqué de bailSnapshot v13.10 (capture clone du record au moment de la 1re signature complète) + bandeau jaune `#edl-locked-banner` + class CSS `.edl-signed-locked` qui désactive inputs/textareas/select + bouton « 🔓 Réinitialiser signature » avec double-confirm + warning légal + saveEDL préserve les sigs originales si EDL signé en DB (anti-écrasement par canvas vide) | commit `aa99ad7` · **Bug 3 signature perdue à réouverture + Bug 8 race signature au save** ✅ |
| Phase 5 v14.43 | Wizard bail saveDB return check : Path 1 vérifie le retour de `window.opener.saveDB()`. Si `false` (mode readonly Drive token expiré) → ne marque PAS `ok=true` → bascule sur Path 2 (localStorage direct) qui écrit même en readonly + toast warn explicite. Logging détaillé console.warn | commit `a23e682` · **Bug 4 bail signature locataire échouée mais PDF OK** ✅ |
| Phase 6 v14.44 | Polish UX : suppression du reset agressif `_photoCache={}` dans openEditEDL (vidait le cache pour TOUS les EDL pré-chargés) + progress bar dans bouton sync Drive (texte « ⏹ Annuler (M/N…) ») + bouton « ⏹ Annuler sync » avec flag `_edlSyncCancelRequested` qui break la boucle d'upload entre 2 photos | commit `09d82b3` · **Bug 11 cache + Bug 13 progress bar + Bug 14 annulation** ✅ |
| Bugs reportés | Bug 12 tombstone photos individuelles (cohérence multi-device fine — pas critique V1, à traiter si résurrection observée) · possible suite Bug 4 si reproduit malgré fix v14.43 — fournir logs DevTools |


### DRIVE-ARBORESCENCE — sessions 2026-05-02/03 (~5h, 4 commits, v14.20 + v14.35-36)
| Code | Sujet | Note |
|---|---|---|
| DRIVE-ARBORESCENCE Phase A | Création arborescence `ImmoTrack/{Entité}/{Immeuble}/{Logement}/[9 sous-dossiers]` (📋 EDL, 📜 Bail, 📄 Documents, 🖼️ Photos, 🧾 Quittances, 📈 IRL, 🛡️ MRH, 🔧 Travaux, ⚡ Charges) ; helpers `_drvImmoTrackRoot`/`_drvEnsureEntityFolder`/`_drvEnsureImmeubleFolder`/`_drvEnsureLogementTree` (parallélisation `Promise.all` 9 sous-dossiers) + `_drvRenameFolder`/`_drvTrashFolder` ; hooks fire-and-forget dans saveEnt/saveImm/saveParamLog/delEnt/delImm/delLog avec confirms create/rename/trash | v14.20 · commits `528eafe` + `03cd686` |
| DRIVE-ARBORESCENCE Phase B | Helper `_drvUploadDoc(logRef, category, file)` : compression image > 2 Mo (canvas resize 1600px max + jpeg 0.8) + refus > 10 Mo + nommage `{cat}_{ISO}_{file}.{ext}` ; collection plate `DB.documents = []` (cohérent avec assurances/mrh/quittances) ; propagation Drive bidirectionnelle (`_buildEntityPayload` + merge par id avec `_drvWins`/`_drvMark` + cascade dans `_cascadeDeleteEntity`). Helper sans UI utilisable par DOC-PJ et LOG-PHOTOS futurs. | v14.35 · commit `7997ce2` |
| DRIVE-ARBORESCENCE Phase D | Section UI Paramètres « 🗂️ Stockage Drive — Arborescence ImmoTrack » avec compteur dynamique `X / Y biens avec arborescence` (couleur vert/orange/bleu selon couverture, warn si Drive déconnecté) + bouton « 🔄 Réorganiser mon Drive » (chunks de 3 paralléles, idempotent skip biens déjà arborescence, toast progress incrémental) + bouton « 📂 Ouvrir mon dossier ImmoTrack dans Drive » (nouvel onglet). Hook `_drvUpdateStorageStats` dans `rParams`. Touch targets ≥ 44px, mode sombre testé. | v14.36 · commit `0d7928a` |
| Phase C reportée | Sync Drive→app lazy scan à l'ouverture de LOG-FICHE-360 (détecter fichiers déposés manuellement dans Drive) — sujet futur, sera utile quand DOC-PJ ou LOG-PHOTOS exposeront l'UI consommatrice. Pas bloquant pour V1 car helpers d'upload + arborescence en place. | Sujet futur |

### BUG-DRIVE-RESURRECTION — session 2026-05-03 (~2h, 4 commits, v14.30 → v14.32) 🔥 P0
| Code | Sujet | Note |
|---|---|---|
| BUG-DRIVE-RESURRECTION Phase 1 | Helper `_isAlive` + 10 fonctions `delX` converties au pattern tombstone (delLog/Imm/Ent/Bail/BailHist/Mv/Quit/Ass/Mrh/IRL) — préserve les champs de filtrage (entity, logement, qui, ref) pour cohérence avec `_buildEntityPayload` | v14.30 · commit `3ed2ac0` |
| BUG-DRIVE-RESURRECTION Phase 2 | Helper `_alive(coll)` polyvalent + filtrage tombstones dans 12 renderers principaux + helpers `immeubles()`/`_activeLogements()` + 3 sites SCI options (préventif crash sur `e.type` manquant) + IRL dictionnaire mixte (typeof number || _isAlive) | v14.31 · commit `94b2b07` |
| BUG-DRIVE-RESURRECTION Phase 3 | Cas spécial entité multi-device : helper `_cascadeDeleteEntity(entNom, entityId)` qui tombstone récursivement tous les sous-objets liés (logements/baux/mvt/quit/edl/ass/mrh/historique) ; hook local dans `delEnt` (DANS le `_undoOp` pour que la snapshot pré-modif capture l'état complet et l'undo restaure tout en bloc) ; hook pull dans `_mergeEntityPayload` quand `payload.entity._deleted === true` (cascade côté pull + early return) ; push fichier Drive avec `entity._deleted:true` au top-level géré automatiquement par `_driveAutoSaveNow` qui itère sur tombstones | v14.32 · commit `f77bcd2` |
| Cause racine | 10 fonctions delX faisaient `filter()` ou `delete` direct → l'objet disparaissait localement, saveDB poussait sa version locale, mais le merge UNION du pull ré-injectait l'objet absent → résurrection silencieuse (et propagation suppression bloquée multi-device). Seul `delEDL` (v14.4 BUG-EDL-DELETE-NOSYNC) avait déjà le pattern tombstone. | Spec [docs/subjects/BUG-DRIVE-RESURRECTION.md](docs/subjects/BUG-DRIVE-RESURRECTION.md) · commit spec `fdda0ec` |

### VACANCE-VIZ — session 2026-05-03 (~1h30, 1 commit, v14.29)
| Code | Sujet | Note |
|---|---|---|
| VACANCE-VIZ | Visualisation manque à gagner sur fiche logement 360° : (a) bandeau status loué/vacant en haut (vert/rouge avec montant), (b) timeline 24 mois SVG (mois loué vs vacant, tooltips natifs), (c) refonte 4ᵉ KPI Compta « Vacance % » → « Manque à gagner -Y € » avec sub « X% vacance ». Réutilise `_getActiveBailHcCh` existant (fallback dernier bail = mémoire du loyer en vacance). Helpers factorisables : `_daysBetweenIso`, `_monthsBetweenIso`, `_getLastBailForLog`, `_getLastClosedBailEndIso`, `_renderLogFicheOccupationBanner`, `_renderLogFicheTimeline24`. | v14.29 · [docs/subjects/VACANCE-VIZ.md](docs/subjects/VACANCE-VIZ.md) |

### BUG-DEL-FICHE-360 + UX-IMM-MODAL + REFRESH-LIVE — sessions 2026-05-02/03 (~2h, 3 commits, v14.26 → v14.28)
| Code | Sujet | Note |
|---|---|---|
| BUG-DEL-FICHE-360 | Fix régression UX post-UNDO-OP : `delLog`/`delImm`/`delEnt`/`delBail` ne fermaient plus la modale d'édition ni ne quittaient la fiche 360° de l'élément supprimé. Ajout `closeM('ov-X')` + `closeXFiche()` conditionnel **avant** le `_undoOp` (préserve Ctrl+Z) | v14.26 · [docs/subjects/BUG-DEL-FICHE-360.md](docs/subjects/BUG-DEL-FICHE-360.md) |
| UX-IMM-MODAL | Modale immeuble rendue **autonome** (« 1 création = 1 bulle ») : section Immeubles retirée de `ov-ent`, hidden `imm-ent-id` ajouté à `ov-imm`, refacto `addImmForm/editImm/delImm/saveImm` avec `entIdOverride`, `openNewImm`/`_confirmImmPicker` n'ouvrent plus `ov-ent` intermédiaire, bouton « + Immeuble » sur fiche bailleur 360°, menu ⋮ carte building enfin opérationnel (kind prioritaire sur ref) | v14.27 · [docs/subjects/BUG-DEL-FICHE-360.md](docs/subjects/BUG-DEL-FICHE-360.md) (volet 2) |
| REFRESH-LIVE | Helper centralisé `_refreshAfterMutation()` injecté dans **19 sites** (saveParamLog, saveBail x2, saveMv, saveQuit, saveEnt, saveImm, saveAss, saveMrh + 10 del*). Création/édition/suppression désormais reflétées **instantanément** sur la fiche 360° courante (avant : page figée jusqu'au reload manuel) | v14.28 · [docs/subjects/BUG-DEL-FICHE-360.md](docs/subjects/BUG-DEL-FICHE-360.md) (volet 3) |

### UNDO-OP — session 2026-05-02 (~3h, 4 commits, v14.21 → v14.24)
| Code | Sujet | Note |
|---|---|---|
| UNDO-OP Phase 1 | Cœur stack RAM 20 niveaux + helpers `_undoOp`/`_undoUndo`/`_undoClear` + hook saveDB symétrique (`_undoOnSaveDB` pré + `_undoOnSaveDBSuccess` post) + init aux 2 sites loadDB + flag `_undoSuppressCapture` anti-récursion | v14.21 · commit `07e591a` |
| UNDO-OP Phase 2 | UI : CSS `#fab-undo` bottom-left (responsive 52px mobile) + `_undoUIInit` injection FAB au boot + listener Ctrl+Z global avec guard `_inEditableField` (laisse undo natif des inputs/textarea) + helper `_undoToast(message, type)` pour bouton « ↶ Annuler » 8s inline | v14.22 · commit `9b9cf3f` |
| UNDO-OP Phase 3 | 11 wrappers `_undoOp` sur les suppressions critiques avec libellés explicites : delLog, delImm, delEnt, delMv, delBail, delBailHist, delAss, delMrh, delIRL, delQuit, delEDL · Drive trash garde hors du `_undoOp` (cf spec Q6b : V1 corbeille manuelle 30j) | v14.23 · commit `bb1f23d` |
| UNDO-OP Phase 4 | Multi-device safety : flag `_drivePullChangedDB` + helper `_drvMark()` → 24 instrumentations dans `_mergeEntityPayload` + 2 dans `_mergeGlobalPayload` (mouvements globaux uniquement) ; `_driveLoadEntityFiles` vide la stack undo après pull avec modifs externes via `_undoClear('drive_pull')` + toast info | v14.24 · commit `4c5b4f5` |

### Vue Biens (Qalimo-like) — session 2026-05-01 (~6h, 5 commits, v14.1 → v14.2)
| Code | Sujet | Note |
|---|---|---|
| NAV-RESTRUCTURE | Sortir Biens + Bailleurs du Référentiel → 2 onglets sidebar dédiés (section Patrimoine) ; Référentiel renommé Paramètres ; redirects legacy | v14.2 · commit `aaf1e54` |
| LOG-LISTE-CARDS Phase 1 | Grid responsive cartes immeubles 4/3/2/1 cols + toggle Immeubles↔Logements + ratio occupation visuel + image placeholder + agrégation période/loyer total | v14.2 · commit `df7b66f` |
| LOG-LISTE-CARDS Phase 2 | Toolbar : recherche live + popovers Filtrer (bailleur/statut/type) et Trier (6 critères) + export CSV 15 colonnes + badge filtres actifs + auto-fermeture popovers | v14.2 · commit `a4bed74` |
| LOG-ARCHIVE | Soft-delete réversible + champs `archived`/`archivedAt` + tabs Actifs/Archivés avec compteurs + menu dropdown ⋮ (Voir/Modifier/Archiver-Restaurer/Supprimer) + bloc archivage si bail actif + style is-archived + migration ciblée 5 selects de création | v14.2 · commit `7070fb3` |
| LOG-FICHE-360 Phase 1 | Vue full-page route `#log-fiche-{ref}` (deeplink + back/forward + boot) + hero (placeholder photos + badges) + onglet Général (panneaux Locataire actuel + Conditions du bail) + 5 sous-onglets stubbés "À venir" | v14.2 · commit `1036bdf` |

### Drive sync — session 2026-04-28 (~5h, 7 commits, v13.12 → v13.18)
| # | Code | Sujet | Note |
|---|---|---|---|
| | DRIVE-2A | Payload entity étendu (5 collections supplémentaires) + fichier global | v13.12 · commit 815e22f |
| | DRIVE-2A-bis | Protection démo + restore intelligent par type | v13.13 · commit 8b2992b |
| | DRIVE-2A-ter | Fix 83 mouvements globaux non sync | v13.14 · commit 26d4ce5 |
| | DRIVE-2A-quater | Bouton UI cleanup Dupont | v13.15 · commit 5dd53b9 |
| | DRIVE-2A-quinquies | trashed=false sur queries Drive | v13.16 · commit 284c794 |
| | DRIVE-2C | Backup pré-sync localStorage + bouton Restaurer | v13.17 · commit ec52ae4 |
| | DRIVE-2D | Force push depuis device source | v13.17 · commit ec52ae4 |
| | DRIVE-2B | Timestamps `_modifiedAt` + merge timestamp-aware | v13.18 · commit 619f8ff |
| | DRIVE-2E | Toast warning sur conflit détecté au load | v13.18 · commit 619f8ff |

### Bail — sessions avril 2026 (v12.50 → v13.24)

| Code | Sujet | Note |
|---|---|---|
| BAIL-PDF-NATIF | Phase D Notice arrêté 29 mai 2015 intégrée au PDF natif | v13.24 · commit 064c4c6 · Phases A-C livrées avant (genPDFNative + helpers PDF_NATIVE) |
| BAIL-A-ECHOIR | Modalité paiement "à échoir" par défaut (data DEMO) | v13.23 · commit 529e261 |
| BAIL-TRAVAUX-INTERLOC | Champ travaux d'amélioration entre 2 locataires | v13.23 · commit 529e261 |
| DOC-CIVILITE | Civilité + nom dans formules de politesse | v13.23 · commit 529e261 |
| BAIL-LOC-ADR-PREC | Adresse précédente par locataire + checkbox "même" | v13.23 · commit 529e261 |
| BUG-BAIL-003 | Multi-bailleurs : N cadres signature au lieu d'un seul | v13.19 · commit eca0faa |
| BAIL-WIZARD | Wizard 4 étapes Bail | v12.44-50 |
| BAIL-3a | Extraction namespace BailDocument | v12.52 |
| BAIL-3b | Conversion ES5 → ES6 (partielle, var → const) | v12.53-55 |
| BAIL-3c | Magic strings → constantes | SKIPPED |
| BAIL-3d | Namespace global Bail.* (~45 entrées) | v12.56 |
| BAIL-WIZARD-V2 | Wizard signature mobile-first (paraphes, jsPDF natif, page-par-page) | v12.59-66 |
| BAIL-PDF-INLINE | jsPDF + html2canvas inlinés (CORS file://) | v12.68 |
| BAIL-PDF-UTF8-FIX | URL.createObjectURL(Blob) au lieu de atob() | v12.70 |
| BAIL-SIGNATURE-PERSIST | Persistance signatures DB + workflow signé/reset | v13.02-05 |
| BAIL-SIGNATURE-MODES | 2 modes nets + persist robuste + état partiel-bailleur | v13.04-05 |
| BAIL-CARTE-ACTIONS | Actions épurées + fix previewBail signed state + MIME Word | v13.06 |
| BAIL-MODIFIER-SIMPLIFIE | Retire Export Word + rename Acte garant → Aperçu garant | v13.07 |
| BAIL-WORKFLOW-LOCATAIRE | Workflow signature différée in-app | v13.08 |
| BAIL-DRIVE-PDF-SIGNE | Drive upload PDF signé automatique après wizard | v13.09 |
| BAIL-SNAPSHOT | Snapshot signé + Voir bail signé + highlight diff Aperçu | v13.10-11 |
| BUG-BAIL-003 | Multi-bailleurs : PDF rend N cadres signature (1 par bailleur) | v13.19 · commit eca0faa |
| BAIL-CARTE-MODIFIER-ACTIF | Modifier bail toujours actif même bilatéral signé | v13.20 · commit 78e706f |
| BAIL-HIGHLIGHTS-FIX | Backfill snapshot + locataires/garants + Voir signé honnête | v13.21 · commit 17101d6 |

### IRL — session 2026-04-29 (6 commits, v13.30 → v13.35)
| Code | Sujet | Note |
|---|---|---|
| BUG-IRL-001 | Lettre IRL : "date anniversaire" → "mois anniversaire" | v13.30 · commit 661d0e7 |
| IRL-DPE-FG | Pas de révision si DPE F/G + warning DPE manquant/expiré | v13.31 · commit 625638c · 4 surfaces |
| IRL-VALIDATION (v13.32 rejeté) | 1ère version dans popup lettre — rejetée par utilisateur | v13.32 · commit 458c05a · "encart vert s'imprime, on valide dans la lettre = bricolage" |
| IRL-VALIDATION (v13.33 final) | Refonte propre : enveloppe 3 états + boutons cohérents + popup mois anniversaire | v13.33 · commit 5207b70 · helpers `_irlLettreState` / `_irlEnvelopeBtn` / `_collectIRLRappels` / `_renderIRLRappelModal` · modal `#ov-irl-rappel` · cellule actions homogène + lettre PDF nettoyée |
| IRL-DESIGN-POLISH | Refonte design tableau IRL + responsive complet (PC/tablette/mobile) | v13.34 · commit 73cc3d2 · fix bugs colonnes décalées (10 cellules→9) sur DPE manquant/F-G/index manquant · badges unifiés `.irl-badge` + barre d'état colorée à gauche de chaque ligne · layout `.irl-calc-grid` 1024/900/600px · table-to-cards sur mobile (data-label sur tous les `<td>`) · boutons full-width tap-friendly sur mobile |
| BUG-IRL-RESET | Reset IRL ne restaurait pas le loyer (compound inflation à chaque cycle) | v13.35 · commit 01bf664 · `resetIRLApply` consulte `irlHistorique`, restaure `log.hc = entry.ancienHC` + retire l'entrée. Confirm dialog contextualisé. Gère apply / skipIRL / pas d'entrée trouvée |

### EDL — session avril 2026
| # | Code | Sujet | Note |
|---|---|---|---|
| 33 | EDL-PHOTOS-IDXDB | Photos IndexedDB + Drive auto-sync | `immotrack_photos` IDB |
| 34 | EDL-CPT-COMPARATIF | Comparatif compteurs entrée/sortie dans PDF | 2 colonnes systématiques |
| 35 | EDL-PDF-7COL | PDF 7 colonnes toujours (sortie vides + fond bleu) | format comparatif systématique |
| 36 | EDL-CPT-PHOTOS | Photos compteurs (1 par relevé, entrée + sortie) | 8 clés `compteursPhotos` |
| 37 | EDL-PHOTOS-SIZE | Photos max-height 120px, col commentaires réduite | éviter débordement |
| 39 | EDL-PARAPHES | Paraphes supprimés du PDF (signature unique en bas) | décret 2016-382 |
| 41 | IRL-LETTRE-REVISION | Lettre révision IRL : mentions légales art. 17-1 loi 89-462 | adresse, date bail, INSEE série 001515333, LRAR |

### Dashboard v2 — sessions avril 2026 (Phases 1-7 livrées)
| Code | Sujet | Note |
|---|---|---|
| DASH-V2-PHASE1-7 | Dashboard v2 — 7 phases livrées et validées | v12.27 + correctifs Progression annuelle v12.28-32 |
| DASH-V2-CHARTS | Composants `_mkSparkline`, `_mkMultiLineChart`, `_kpiBody`, `_kpiDelta` | en place |
| DASH-V2-DRILL | Drill-down entité/immeuble/logement avec sous-lignes par segment | v12.28-32 |
| DASH-V2-MARKERS | Markers verticaux "changement de bail" sur chart cumulatif | v12.28-32 |

---

## 📝 Remarques en attente de classement

> Espace libre pour les remarques que tu me dis dans le chat avant que je les classifie ailleurs.
> Ex : "le total quittance est faux quand TVA" → je l'ajoute ici si je ne sais pas où le ranger immédiatement.

- **CI-VITEST-MAIN-ROUGE** — ✅ **Investigué 2026-08-10, était déjà résolu.** Les 356 notifications (constat 08/08) sont un historique : main est VERT depuis le **2026-07-13**. Cause racine datée : restructuration catégories 31→21 (`94445a5`, 21/06, v15.326) → 2 fichiers de tests (`bank-import.test.js`, `legal-2044.test.js`) avec libellés figés désynchros → CI rouge sur 163 runs consécutifs (25/06→12/07, #805→#967). Fix déjà livré 13/07 par une session antérieure (`be56dac`, branche `claude/fix-ci-tests-2044`, réalignement propre + sémantique fiscale vérifiée, aucun test affaibli). Vérifié aujourd'hui : 39 runs verts consécutifs jusqu'au dernier push (`43f4705`, v15.495) + le mien (`1e0ecd7`, #1008). Scope CI déjà correct (`supabase/tests/*` proprement exclu, suite RLS séparée `test:rls`). **Bonus livré** : cron quotidien keep-alive Supabase (`.github/workflows/supabase-keepalive.yml`, push direct sur main, cf `docs/subjects/P0-SUPABASE-PAUSE.md` option B). Détail complet dans le BACKLOG.md d'`origin/main` (section Remarques en attente).

---

## 📌 Décisions structurantes (journal)

### 2026-05-01 — Refonte vue Biens (parité Qalimo/BailFacile/Smovin) — v14.2
- Sidebar : nouvelle section **Patrimoine** entre Vue d'ensemble et Locataires (Biens + Bailleurs)
- Référentiel renommé en **Paramètres** (terme standard)
- Vue Biens en cartes (immeubles par défaut, toggle vers logements) avec toolbar complète (recherche/filtres/tri/export CSV) et tabs Actifs/Archivés
- Fiche bien dédiée full-page (route `#log-fiche-{ref}`, header + onglet Général en Phase 1, 5 sous-onglets stubbés pour Phase 2)
- Soft-delete réversible avec règle **bloque l'archivage tant qu'un bail est actif** (cohérence métier)
- Décisions par défaut prises faute de validation utilisateur en cours de session : Bailleurs en sidebar dédiée (Option A), Immeubles par défaut, route dédiée pour fiche 360, placeholder image en attendant LOG-PHOTOS
- Restant : LOG-PHOTOS (image principale réelle), LOG-FICHE-360 Phase 2 (sous-onglets riches Documents/EDL/Compta/Compteurs/Entretien)

### 2026-04-29 — Principe directeur : constance visuelle / design system
- Toute modification UI (formulaires, modales, tableaux, popups, lettres/PDF, dashboard) doit respecter le **design system** existant et **conserver la cohérence visuelle sur toutes les pages**
- Couleurs : variables CSS uniquement, pas de hex localisé · Typo + espacements cohérents · Mode sombre testé · Responsive 3 formats
- Si nouveau composant nécessaire → l'ajouter au design system, pas en one-shot
- Référence : mémoire `feedback_design_consistency.md`
- Sujet associé pour mise en cohérence globale rétroactive : `V3-VISUEL`

### 2026-04-28 — Vue par onglet pour pilotage
- Ajout d'une section "📑 Vue par onglet" en tête de BACKLOG → permet de travailler onglet par onglet (1 session = 1 onglet, tous sujets traités d'un coup)
- TodoWrite réorganisée par onglet en mode pilotage

### 2026-04-28 — IRL : gel pour DPE F/G (loi Climat 2021)
- IRL-DPE-FG ajouté : pas de révision possible si bail en DPE F ou G (loi 2021-1104, art. 23, applicable depuis le 24/08/2022)
- Bloque la révision dur (pas d'override) car la loi est claire ; doit s'appliquer même aux baux antérieurs

### 2026-04-28 — Migration depuis concurrents
- IMPORT-CONCURRENTS : sujet onboarding clé pour la commercialisation
- Approche : template ImmoTrack standard + mappers par concurrent (Rentila, BailFacile, Qalimo, ImmobilierLoyer, Smovin, etc.)
- CDC requis : choisir top 3 concurrents prioritaires

### 2026-04-28 — 18 remarques utilisateur classées
- Bugs P0/P1 : BUG-IRL-001, BUG-CHARGE-001, BUG-DASH-001, BUG-BAIL-002, IRL-VALIDATION
- Features P2 : DASH-KPI-HC, MVT-SCIND-CAT, MVT-RECURRENT, MRH-AUTO-LOC, ENT-SAVE-IMM, DOC-CIVILITE, ASSO-PARTAGE, DOC-PJ, TRAV-SUIVI, CHARGE-REGLES
- Petits P3 : BAIL-A-ECHOIR, MVT-SCIND-LIMIT, LOG-DG-LABEL

### 2026-04-28 — Système de pilotage backlog
- Ce fichier `BACKLOG.md` + `docs/subjects/*.md` + mémoire `project_pilotage.md`
- Slash command `/pilotage` pour démarrer/reprendre toute session
- Workflow : tout passe par le chat Claude, jamais d'édition manuelle MD

### 2026-04-28 — Architecture Drive sync
- Choix : 1 fichier global + N entity files (par-entité)
- **Décision V1 commercial** : le fichier global SERA DÉCOUPÉ (DRIVE-2H) en `user-{userId}.json` + `entity-{entityId}-shared.json` + `global-ref.json`

### 2026-04-26 — Génération PDF Bail natif
- Choix : pdf.text/pdf.rect natif (pas html2canvas) avec emplacements vides locataire pour Acrobat
- Plan en 3 sessions ~10h
- Référence : `project_bail_pdf_native.md`

### 2026-04-26 — V3 transition (3 étapes séquentielles)
- **Étape 1** : Audit global (sécu, perf, code quality)
- **Étape 2** : V3 visuelle harmonisée (toutes pages, structure inchangée) ← "design"
- **Étape 3** : Refonte fonctionnelle onglet par onglet (priorité Bail)

### 2026-04-25 — Types de bail
- 5 types à ajouter : meublé, garage, mobilité, étudiant, Autre
- 5 phases A-E · DG par type validé (Q4) · phasing par-phase 1 commit + retest
- Référence : `project_bail_types.md`

### 2026-04-27 — Pas de solution passable
- Règle non négociable : refonte complète plutôt que compromis temporaire, planifier en session dédiée si trop gros
- Référence : mémoire `feedback_no_compromise.md`

### 2026-05-10 — 🚨 AUDIT TRANSVERSAL POST-FIX = MANDATORY (pas optionnel)
- Citation user : *« tu me fatigues ! faire un audit suite au bug est mandatory pas optionnel ! »*
- Précédent : v14.79 j'avais présenté « c'est corrigé » sans audit transversal des call-sites. Le user a dû me demander 2 fois (« as-tu fait l'audit ? ») avant que je le fasse réellement.
- L'audit a révélé 2 bugs supplémentaires non fixés (ytdMvts L23049 + confirmSplitMvList L11434) — preuve directe de la nécessité de la règle.
- **Règle gravée** : à chaque fix, AVANT de dire « corrigé », exécuter les 6 étapes de `feedback_modify_verify.md` § « RÈGLE ABSOLUE ». Pas négociable.

### 2026-05-07 — 🛑 Modification + vérification TOUJOURS
- **Règle non négociable** captée après 6 itérations cassées en chaîne (v14.62→67 SANDBOX-MODE)
- Citation user : *« on vérifie tout ce qu'on a fait pour être sur que c'est bien fait ! […] modification + vérification toujour stoujours !! »*
- Avant CHAQUE bump et CHAQUE demande de test :
  1. Grep le symbole modifié → tous les sites collatéraux protégés ?
  2. Si user teste sur fichier dérivé (`index-test.html`) → copier le fix + vérifier la copie
  3. Si modif d'init/migration → penser au state localStorage déjà persisté (cleanup ou migration)
  4. Si nouvel écran vide → guider l'utilisateur (pas de "vide non guidé")
  5. Test mental Ctrl+F5 : "qu'est-ce que je vois et qu'est-ce que je dois faire ?"
- Référence : mémoire `feedback_modify_verify.md`

### 2026-05-07 — 🚀 Penser déploiement + commercialisation TOUJOURS
- **Règle non négociable** : ImmoTrack est destiné à être commercialisé (cf `project_commercialization.md`). Chaque feature doit être conçue pour le marché SaaS, pas juste pour le besoin perso.
- Citation user : *« il faut penser déploiement et commercialisation (à mettre dans le doc des règles !) »*
- 2 options à chaque conception :
  - **Option A — Complet** : tous statuts juridiques (particulier/SCI/SARL/LMP/LMNP/Hoguet) + tous profils + responsive 3 formats + propagation Drive
  - **Option B — Nécessaire + extensible** : minimum vital + mécanisme d'extension UI (bouton « + nouveau type » + stockage `DB.params.X[]`)
  - **Interdit Option C** : « pour mon besoin uniquement » sans extension UI → mur invisible avant le lancement commercial
- À la livraison d'une feature, marquer dans `docs/subjects/X.md` :
  - ✅ Statuts juridiques couverts · ✅ Profils utilisateurs · ✅ Mécanisme d'extension · ⚠ Hors scope
- Référence : mémoire `feedback_deploy_commercialize.md`

### 2026-05-07 — 🤐 Pas d'idées pour proposer · Si tu ne sais pas, dis-le
- **Règle non négociable** captée après proposition non motivée (charges propriétaires hors scope V1, inventées « pour avoir l'air complet »)
- Citation user : *« me propose pas des idées pour proposer. Si tu n'as pas d'idées tu ne dis rien. Idem si tu ne sais pas tu le dis : à noter dans les règles »*
- Une proposition n'est valide QUE si elle s'appuie sur 1 des 4 :
  1. Cas réel rencontré par le user (qu'il a explicité)
  2. Obligation légale citée précisément
  3. Référence dans le code existant qui appelle l'extension
  4. Référence dans `project_commercialization.md` ou `BACKLOG.md`
- Si aucun des 4 ne s'applique → **silence ou question**, pas de fluff
- Formulations autorisées : « Je ne sais pas » · « À confirmer » · « Hors de mon périmètre »
- Référence : mémoire `feedback_no_bullshit.md`
