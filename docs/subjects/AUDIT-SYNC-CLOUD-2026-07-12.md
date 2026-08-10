# 🚨 AUDIT SYNC CLOUD — 2026-07-12

> **Déclencheur** : Marion (accès révoqué) voit le popup IRL Zito/Fric + tableau gestionnaire complet ; ses créations PC n'apparaissent pas sur son téléphone ; « Delle b » supprimé sur PC ressuscite à chaque reconnexion ; popup IRL faux chez Didier ; « j'ai 0 confiance en l'app ».
>
> **Méthode** : 5 investigations parallèles en lecture seule sur le code déployé (`origin/main` @ `6424648` = v15.457, worktree `Immo-audit-prod`) + forensique DB prod (service role, SELECT only). Sauvegarde complète préalable : `_import/BACKUP-cloud-patrimoine-2026-07-12T13-08-21-188Z.json` (664 lignes).
>
> **Verdict global** : intégrité référentielle SAINE (0 orphelin FK) mais système DÉGRADÉ. La moitié serveur (RLS, versions, tombstones, immutabilité) est au niveau SaaS ; la moitié client est un moteur de **push mono-appareil sans feedback** qu'on fait tourner en multi-appareils. Tous les symptômes sont des conséquences prévisibles de 3 causes systémiques.

---

## 1. Les 3 causes systémiques

### C-A · La boucle de sync est ouverte : push-only, sans résolution, sans isolation
- Aucun pull en session (hydrate uniquement au login) ; le broadcast Realtime `changed` est émis mais **plus aucun récepteur** depuis le cutover (`supabase-entry.js:545-547`).
- Conflit de version = **impasse éternelle** : le contrat « conflict → re-hydrate » est écrit en commentaire partout, **jamais implémenté**. Retry à l'identique à chaque flush, modif perdue à la fermeture d'onglet.
- **Aucune isolation d'erreur par enregistrement** dans `_doFlush` (`store-sync.js:162-206`) : un upsert qui throw (401, RLS 42501, trigger, réseau) avorte TOUT — removes ET config jamais tentés. Un seul poison = sync 100 % morte.
- Suppression = diff d'absence + debounce 800 ms + garde version → fragile par construction.

### C-B · Les échecs sont 100 % invisibles (depuis le cutover)
- `setSync()` écrit dans `#imsb-sync` qui **n'existe plus** (le bandeau bleu supprimé au cutover était le seul organe de feedback). Échec de sync = `console.warn`, rien d'autre.
- `persistSession:false` : session en mémoire seule ; token mort après veille/reload = tous les appels en 401 avalés. Aucun `onAuthChange` branché, aucune demande de re-login.
- `logout()` flushe en best-effort et **avale le résumé** (`supabase-boot.js:40-44`).
- Preuve prod : **0 écriture cloud le 12/07** malgré une journée d'utilisation PC (dernières écritures 11/07) — sync morte toute la journée sans un seul signal.

### C-C · Le cache client fuit et ment
- **Miroir localStorage** : chaque `saveDB` en mode cloud écrit tout le DB dans `immotrack_v4` (`index.html:6002`) — y compris les données d'un espace partagé TIERS — **jamais purgé** (ni logout ni révocation). Un révoqué garde une copie lisible à vie. + IndexedDB `immotrack_photos` (binaires) idem. **= LE point RGPD rédhibitoire.**
- Au boot, l'app **rend le miroir avant le login** (derrière l'overlay) et calcule le popup IRL dessus à +1,5 s (`index.html:51500`) ; l'hydratation ne ferme pas les modales déjà ouvertes → popup Zito/Fric chez Marion.
- Le miroir n'est jamais RELU en mode cloud → il fait croire que c'est sauvegardé alors que seul le flush réseau compte.

## 2. Explication de chaque symptôme (tous élucidés)

| Symptôme | Cause prouvée |
|---|---|
| Marion voit Zito/Fric + tableau gestionnaire post-révocation | Miroir localStorage de l'espace Didier rendu pré-login + popup calculé dessus ; serveur hors de cause (RLS fail-closed vérifiée) |
| « Premium » mort chez Marion | Aucun gating plan côté client (simple toggle de vue) ; DOM du miroir + re-rendu post-hydratation échoué en silence (`__immoRender` avale les exceptions, `overlay.remove()` inconditionnel) |
| Créations PC Marion invisibles sur tél | Onglet PC probablement encore câblé sur l'espace Didier post-révocation → INSERT refusés RLS 42501 → throw → flush avorté AVANT l'étape config → zéro trace. Échec invisible (C-B). **Données probablement récupérables dans `immotrack_v4` de son PC** |
| Espace frais Marion : config écrite 1× (09:30) puis plus rien | Le 1er flush (params défaut) a marché → la chaîne était saine à 09:30 ; ensuite tous les flushs ont jeté (cf. ci-dessus) et l'étape config est en DERNIER dans `_doFlush` |
| « Delle b » ressuscite | Résidu du BUG-RENAME (v15.439) : rename Delle→« Delle b » 09/07 05:40:18 (nouvelles lignes cloud), rename inverse 20 s après, le remove n'est jamais parti. Chaque hydrate le remonte. + le 12/07 la sync PC était morte (0 écriture) donc les suppressions du jour n'avaient aucune chance |
| Popup IRL faux (Didier) | `irlHistorique` vit dans le blob config **last-write-wins** inter-appareils + bail Fric réécrit par un flush de baseline périmée le 09/07 05:41. PC encore en v15.456 (hotfix 457 pas reçu) |

## 3. Dégâts constatés en base (forensique)

- **💶 PERTE FINANCIÈRE PROUVÉE — Fric (Ferrette-104)** : révision IRL appliquée 19/06 (655,05 → 660,14) mais loyer courant resté 655,05 (logement ET bail, réécrits 09/07 05:41). **+5,09 €/mois non perçus depuis le 15/06**, quittance de juin émise à l'ancien montant. Zito : cohérent aujourd'hui.
- **6 lignes fantômes « Delle b »** à tombstoner : logement `8e71b9a2`, bail `e64826d0`, 4 agenda (`56650e45`, `25812812`, `2d842cac`, `b22d1df1`).
- **Agenda : 29 groupes en doublon** (186 lignes / 157 distinctes) — régénérations sans propagation des suppressions (0 tombstone agenda).
- **1 mouvement suspect** : « VIR MME MOMPER FABIENNE » 124 € du 04/05/2026, 2× sur F-002 (`94850163` + `7c57010b`, lots d'import ≠) — à vérifier sur relevé.
- **20/35 documents vivants sont idb-only** (`storage_path` NULL) : tout l'ajouté post-ETL juin. Nettoyage navigateur = perte ; invisibles des autres appareils.
- **`auditTrail` PAS synchronisé au cloud** — traçabilité (argument commercial) uniquement locale.
- **⚖️ `sealSigned: false` en prod** (`supabase-boot.js:100,116`) : le verrou d'immutabilité légale des baux signés est DÉSACTIVÉ avec de vrais bêta dessus.
- Le blob config LWW a déjà mangé des entrées de journal en mai (renonciation Ferrette-Bar dupliquée).
- 0 orphelin FK, quittances/mouvements/EDL cohérents, tombstones propres là où ils existent.

## 4. Défauts d'onboarding (chaque futur client)

- **Espace frais = app cassée** : `_applyParamDefaults` (v15.452) ne rejoue QUE les params ; `categories`/`templates.bail`/`irlTable`/`piecesEDL`/`catConfig` ne sont JAMAIS créés sur un espace cloud vierge → TypeError / pages vides (Mouvements, Réglages catégories, IRL, éditeur bail). Prouvé par le blob de Marion (params seuls).
- Piège résiduel : fallback `renderProof` → bouton « Voir dans l'app complète » → `index.html?sandbox=1` = mode legacy sans sync.
- Révocation en session ouverte : aucun effet jusqu'à fermeture d'onglet (pas de listener membership).
- `espace_config` servi ENTIER au membre scopé par-SCI (contient irlHistorique/assurances/compteurs de TOUTES les SCI) — gap [AUDIT] étapes 5-7 confirmé.

## 5. Ce qui est sain (à conserver)

ids déterministes `detUuid` · concurrence optimiste `version` + `touch_row` (le serveur ne ment jamais) · insert fail-closed `ON CONFLICT DO NOTHING` · tombstones + anti-résurrection serveur (`deleted_at IS NULL` gardé) · ordre parent→enfant/enfant→parent · flushs sérialisés · pagination hydrate · RLS par entité 0029-0032 + Storage par-SCI + Realtime privé · immutabilité légale côté DB prête (0014-0017) · spreads défensifs v15.435/439.

## 6. PLAN DE PROGRÈS

### P0 · Sauvetage & hygiène immédiate (jours)
1. **Récupérer les créations de Marion** depuis `localStorage['immotrack_v4']` de son PC (export AVANT tout nettoyage de cache) → réimport dans son espace `2e5c49db`.
2. **Diagnostiquer la session PC de Didier** (F12 console : 401 vs throw) + hard-refresh vers v15.457 ; re-saisir/flusher les modifs du 12/07 (jamais montées).
3. **Nettoyer les 6 lignes « Delle b »** + 29 doublons agenda (session dédiée, app fermée, audit code-reviewer).
4. **Corriger le loyer Fric** (660,14 depuis 15/06) + décision régularisation locataire.
5. **Vérifier MOMPER 124 €** sur relevé (double comptage possible).
6. **Sauvegardes cloud horodatées régulières** (script `_import/backup-cloud.mjs` existant → cron).
7. **Flip `sealSigned: true`** (décision Didier — c'était un débranchement de phase test).

### P1 · Colmatage sûr (~2-3 semaines) — tue les 4 symptômes
1. Indicateur de sync réel (pastille topbar : ✓/⟳/⚠) branché sur les résumés de flush + `navigator.onLine` + détection session morte (`onAuthChange` → re-login).
2. Conflit → re-hydrate automatique + re-render + bannière.
3. Rebrancher le récepteur Realtime `changed` + re-pull au `visibilitychange:visible` si hydrate > N min.
4. **Isolation d'erreur par enregistrement dans `_doFlush`** (un poison ne bloque plus removes/config).
5. Removes = flush immédiat (bypass debounce) + retry backoff.
6. Hygiène cache : purge `immotrack_v4` + IndexedDB au logout / changement de compte (tag `{userId, espaceId}` sur le miroir) ; ne plus rendre/calculer les popups sur le miroir pré-login ; fermer les modales dans `__immoSetDB`.
7. Défauts d'espace frais : rejouer TOUS les défauts initDB (categories/templates/irlTable/piecesEDL/catConfig) post-hydratation d'un espace vide.

### P2 · Sync robuste (~6-9 semaines) — prérequis commercialisation
1. Pull incrémental `updated_at > lastSyncAt` par table, déclenché par Realtime + focus + post-conflit.
2. Garde de version sur `espace_config` + éclatement du blob (irlHistorique, assurances bailleur, compteurs → tables ou sous-blobs par-SCI) → fin du LWW ; règle aussi la fuite au membre scopé ([AUDIT] 5-7).
3. File d'écritures persistée (journal IndexedDB rejoué au boot) → une modif survit au crash/fermeture/coupure.
4. `auditTrail` synchronisé au cloud + documents : upload Storage systématique (fin de l'idb-only).
5. Kill-switch révocation (listener `espace_members`/`entite_membre` → logout forcé).
6. Résolution de conflit par ligne : « serveur gagne + notification + copie locale proposée ».

### P3 · Architecture cible (post-premiers clients)
State par lignes (fin du blob DB muté en place), abonnements `postgres_changes`, lectures paresseuses, décision franche offline (offline-first outillé vs thin client assumé). Le coût réel = le monolithe (~50k lignes lisent `DB` directement). Chantier planifié, PAS un prérequis commercial.

### ⚖️ Avis tranché commercialisation
**P1 seul = passable = NON** (règle « pas de solution passable »). Seuil minimum avant le premier euro encaissé : **P1 complet + P2 items 1-3 + sealSigned** ≈ **8-10 semaines**. 90 % de l'infra nécessaire existe déjà (versions, Realtime privé, updated_at) — c'est la boucle à fermer, pas les fondations à refaire.

---

*Audit du 2026-07-12, 5 agents (moteur sync · onboarding · révocation/cache · forensique · architecture), rapports complets dans la session. Scripts diagnostic (gitignorés) : `_import/diag-*.mjs`, `_import/audit-forensic-*.mjs`.*
