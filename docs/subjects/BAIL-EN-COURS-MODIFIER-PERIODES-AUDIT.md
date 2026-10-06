# BAIL-EN-COURS-MODIFIER-PERIODES — contre-audit indépendant

**Périmètre** : `git diff 2227f1d HEAD` sur `feat/bail-en-cours` (8 commits « Périodes étape 1 à 8 »).
**Date** : 2026-10-06 · **Auditeur** : contre-audit indépendant (n'a pas écrit le code) · **Aucun fichier suivi modifié** (expériences et mutations dans une copie `git archive` du scratchpad).

## Verdict : 🟠 À CORRIGER

Le cœur est solide. Le module pur `bareme-edition.js` tient ses invariants (aucun chevauchement, une seule période ouverte, localité, traces, idempotence), y compris sur **deux chapitres contigus ou non**. Je l'ai vérifié avec mon propre fuzz : 3 000 séquences, 9 000 éditions, dont 4 000 sur le 2ᵉ bail. Le moteur IRL n'est pas touché. Le recalage du loyer vivant empêche bien le prochain « Modifier le bail » de repeindre la période corrigée. Le retour arrière sur échec de sauvegarde est réel.

Rien n'est 🔴 : aucun scénario ne casse le barème ni ne détruit de donnée irrécupérable par le geste normal. Restent **cinq 🟠**, à corriger avant de merger dans la branche principale :
- deux portent sur le filet multi-appareils (« Réappliquer ») ;
- un sur l'interaction avec une révision IRL programmée ;
- un est une faille XSS stockée ;
- un est un trou de test : le fuzz ne génère toujours pas de second chapitre.

---

## Findings

### 🟠 1. « Réappliquer » réécrit des montants absolus par-dessus une décision plus récente, et force le loyer d'une période IRL, sans alerte
`js/app/app-part2.js:14481-14500` (`_histoPerReappliquer`), en particulier `:14491` (`if(x.avant.source==='irl'){ o.origine='irl'; o.autoriserIRL=true; }`) et le patch `{debut, hc, ch}` = `x.apres` en valeurs absolues.

Le détecteur (`bareme-edition.js:404-425`) ne regarde que les autres entrées `type:'periode'` du journal pour décider qu'une entrée est périmée (supersédée). Une révision IRL, un avenant ou un saveBail faits entre-temps sur la même période sont invisibles pour lui. Le rejeu passe alors `autoriserIRL:true` et repose le loyer HC d'**avant**.

**Scénario mesuré** (`scratchpad/exp/e1.mjs`, S1) :
1. Barème : `2023-01-01→2026-08-31 700+100 [bail]` · `2026-09-01→ 730+100 [irl]`.
2. L'appareil A change les charges de la période IRL : 730+120 (entrée eA au journal).
3. L'appareil B, pas encore rafraîchi, revalide l'IRL au même effet à **742** €. Son blob écrase celui de A.
4. Le détecteur propose eA. « Réappliquer » donne `2026-09-01→ 730+120 [irl]` : le loyer repasse de 742 à **730** en silence. `irlHistorique` dit toujours 742.

Résultat : **−12 €/mois** sur une période ouverte, et l'historique IRL contredit le barème. Le rejeu ne montre aucun encart d'impact, alors qu'il change le dû.

**Correctif** :
- (a) Avant de rejouer, comparer la période cible vivante à `entree.avant` (`debut`, `fin`, `hc`, `ch`, `source`). Si elle diffère, ne rien rejouer et le dire : « la période a été modifiée depuis (révision IRL / bail) : refais la modification à la main ».
- (b) Ne jamais poser `autoriserIRL` au rejeu, et ne mettre dans le patch que les champs qui diffèrent entre `avant` et `apres`.
- (c) Ouvrir la fenêtre en mode « Réappliquer », avec l'encart `simuler:true` (impact, quittances, trop-perçu) avant d'écrire. Règle de Didier : on alerte avant d'écrire.

### 🟠 2. Deux éditions successives perdues ensemble : seule la plus récente est proposée, et elle échoue (`introuvable`). Rien n'est récupérable par le bouton.
`js/core/bareme-edition.js:419-421`. Une entrée est déclarée périmée dès qu'une entrée **postérieure** partage un `debut`, que cette entrée postérieure ait été appliquée ou non.

**Scénario mesuré** (`e3.mjs`) :
1. e1 : 01/09/2026 → 01/10/2026 (640 €).
2. e2 : la période du 01/10/2026 passe de 640 à 620 €.
3. Un blob périmé écrase les deux.
4. `periodesNonAppliquees` ne propose que `['e2']`. Le rejeu cherche la clé `debut:2026-10-01`, qui n'existe pas (le barème est revenu au 01/09) : `ok:false, raison:'introuvable'`, toast « la période a changé entre-temps ».

L'utilisateur perd les deux corrections, alors que le journal les contient toutes les deux. C'est le cas typique : on corrige la date, puis le montant.

**Correctif** : une entrée n'est périmée que si l'entrée postérieure qui la remplace est **appliquée** (son `id` figure dans `portes`). Sinon, proposer la chaîne de la plus ancienne à la plus récente, avec un seul bouton « Réappliquer les N modifications » qui les rejoue dans l'ordre du journal. Il faut aussi un test « deux éditions perdues ensemble ».

### 🟠 3. Modifier le loyer en vigueur fait sauter en silence une révision IRL programmée, et laisse son montant calculé sur l'ancien loyer
`js/app/app-part2.js:14610-14636` (le recalage pose `log.hc` / `bail.hc`) × `js/app/app-part1.js:25677-25682` (`_applyPendingIRLRevisions` : si `log.hc !== rev.ancienHC`, « application skip pour audit manuel », `console.warn` seul).

**Scénario** :
1. Loyer en vigueur 640 €, révision IRL programmée au 01/11/2026 : `ancienHC` 640, `nouveauHC` 660, période `irl` posée au barème.
2. Le 06/10, l'utilisateur corrige une faute de frappe sur la période en vigueur : 640 → 650. Le recalage met `log.hc` = 650.
3. Le 01/11, `_applyPendingIRLRevisions` voit `650 ≠ 640` et saute la révision sans rien afficher. `pendingApply` reste vrai indéfiniment, `log.hc`/`bail.hc` restent à 650. Le barème facture 660, une hausse calculée sur 640 au lieu de 650 : environ **−10 €/mois** par rapport à une révision juste.
4. De même, « Annuler la révision » (`irl-revision.js:120-124`) repose `ancienHC` = 640 et non 650 : la correction est perdue à partir de la date d'effet.

La fenêtre ne dit rien de tout cela. Le bandeau IRL n'apparaît que si la période **sélectionnée** est la période IRL.

**Correctif (sans toucher le moteur IRL)** : dans `_bailPeriodeAppliquer`, si une entrée `irlHistorique` vivante du lot a `pendingApply` et que l'édition change le loyer HC de la période qui précède son effet, ajouter un avertissement `irl-programmee-base` : « Une révision IRL programmée au JJ/MM a été calculée sur X € : recalcule-la (Annuler la révision puis revalider) ». Le transmettre aussi à la session « IRL & courriers », propriétaire de `ancienHC`.

### 🟠 4. XSS stockée dans le bandeau « Une modification de période n'apparaît pas »
`js/app/app-part2.js:13869-13872`. `fd(a.debut)`, `fd(b.debut)` et `fd(String(x.date).slice(0,10))` sont injectés dans le HTML **sans `escHtml`**. Or `fd()` (`app-part1.js:3711-3716`) **renvoie la chaîne brute** quand la date ne se lit pas. Les objets `x.avant` / `x.apres` viennent tels quels de `DB.baux_evenements` (table cloud, `legacy_raw`), que tout membre ayant le droit d'écrire sur l'espace peut alimenter (RLS 0017 : `insert` pour les rôles autorisés à écrire).

**Exploitation** : une entrée `{type:'periode', action:'modifiee', id:'x', avant:{debut:'<img src=x onerror=…>'}, apres:{…}}` s'exécute à l'ouverture de l'onglet Bail chez le propriétaire, puisque son `id` n'est porté par aucune ligne du barème. Le test d'échappement (`bail-periodes-ui.test.js:89`) ne couvre que les pastilles.

**Correctif** : `escHtml(fd(...))` partout dans ce bandeau. Mieux, n'accepter dans `periodesNonAppliquees` que des `avant/apres.debut` qui passent `_isoOk` (sinon ignorer l'entrée), et ajouter un test « entrée de journal piégée ».

### 🟠 5. Le fuzz ne génère toujours aucun second chapitre, et une mutation critique survit à toute la suite
`__tests__/helpers/bareme-edition-fuzz.test.js:28-29, 95` : un seul bail (`BD = '2023-01-01'`), pas de re-bail, aucune date avant `BD`. C'est exactement la leçon de l'audit précédent, qui n'a pas été appliquée.

Les tests unitaires à deux baux (`bareme-edition.test.js:266-285`) ont **un trou** entre les chapitres (bail 1 clos au 31/12/2022, bail 2 au 01/09/2023). Or le cas réel le plus courant est le re-bail **contigu** (`archiverBail` clôt la veille du nouveau bail).

**Mutation M9 (preuve)** : retirer le filtre de chapitre `_compat(p, bd)` de `lot` (`bareme-edition.js:100`). Les **89 tests restent verts**. Mon fuzz à deux chapitres (`scratchpad/exp/fuzz2.mjs`) la détecte en une passe : 146 échecs sur 3 000 séquences. Exemple : supprimer la 1ʳᵉ période du 2ᵉ bail prolonge celle de l'ancien locataire, et novembre 2024 passe de 910 à 720 €.

**Correctif** : dans le fuzz, tirer un re-bail (contigu dans 60 % des cas, avec vacance sinon), des gestes sur les deux chapitres, et des invariants supplémentaires :
- un chapitre ne déborde pas sa clôture ;
- aucune période n'est rattachée à un bail qui commence après elle ;
- éditer un chapitre ne change pas le dû de l'autre.

Ajouter aussi `avant-bail` au fuzz (dates tirées avant `bailDebut` du 2ᵉ chapitre) : la mutation M8 n'est attrapée que par un seul test unitaire.

---

### 🟡 6. « Ajouter » dans un bail clos déborde la clôture
`bareme-edition.js:310-312`. Le paramètre `finChapitre` prévu par la conception (§1.3) n'est **pas implémenté** : `appliquerNouvellePeriode` borne la nouvelle période sur le début du bail **suivant**, pas sur la clôture.

**Mesure** (`e2.mjs`) : bail 1 clos au 31/12/2024, bail 2 au 01/03/2025. Ajouter 650 € au 01/06/2024 donne `2024-06-01→2025-02-28`, à cheval sur la vacance. Aucun euro n'est faux (`duMois` borne à `finEffective`, mesuré 0 → 0 sur 2025-01/02). En revanche, `chapitrePour` rattache désormais une date de la vacance au bail 1, et un ré-ancrage ultérieur du bail 2 vers l'arrière créerait un chevauchement. Mon fuzz trouve 112 cas sur 3 000, tous de ce type.

**Correctif** : passer `finChapitre` (fin d'occupation du bail du chapitre) et borner la fin à `min(fin, finChapitre)`.

### 🟡 7. « Ajouter » avec les charges vides écrit 0 € de charges
`bareme-edition.js:311` (`ch != null ? ch : 0`). C'est contraire à la règle du LOT 3 (« un champ vide n'est pas un zéro ») que le reste du module applique. L'encart d'impact montre bien la baisse (« repasse de 800 à 700 »), donc ce n'est pas silencieux.

**Correctif** : prendre par défaut la provision de la période en vigueur à cette date.

### 🟡 8. API : un montant non numérique est ignoré en silence
`bareme-edition.js:131-132`. `patch.hc = 'abc'` ou `NaN` donne `montantSaisi` → `null`, donc « inchangé », puis `change:false` (mesuré). Depuis l'UI c'est sans effet (`type=number` rend `''`), mais la session IRL, consommatrice de l'API, aurait un refus muet.

**Correctif** : `pt.hc` présent et non vide, mais non fini → `_echec('montant-invalide')`.

### 🟡 9. Barème legacy sans `bailDebut` : la suppression traverse les chapitres
`bareme-edition.js:47, 100` (`_compat` accepte tout quand `bailDebut` est absent).

**Mesure** (`e1.mjs`, S7) : deux périodes legacy contiguës. Supprimer la 1ʳᵉ période du 2ᵉ bail prolonge l'ancien locataire, et 600 € remplace 900 €. Côté UI, `droits.supprimer` est vrai. Le stock concerné est rare : la migration pose `bailDebut` (`loyer-migration.js:103-128`), mais des périodes `manuel` antérieures sont conservées telles quelles (`app-part1.js:25216`).

**Correctif** : quand `bd` est vide, déduire le chapitre par `chapitrePour(…, baux)` dans l'orchestrateur et le passer au module.

### 🟡 10. Le filet de couverture peut prendre le tarif de l'ancien locataire si le bail du chapitre est introuvable
`bareme-edition.js:107, 206, 262` → `garantirCouvertureBail` → `_periodeJusteAvant` (`loyer-bareme.js:597-605`), qui n'est **pas filtré par chapitre**. Si `_bailPeriodeBailDuChapitre` ne trouve pas le bail (date de début ré-ancrée, `baux_historique` incomplet), `bailHc` est absent et le comblement prend le tarif du bail précédent.

**Mesure** (S4/S5) : supprimer la seule période du bail 2 sans `bailHc` donne 600+80 au lieu de 900+100. **Correctif** : si `bailHc` est absent, prendre le tarif de la période T elle-même plutôt que la voisine d'un autre chapitre, ou bien renvoyer `ok:false, raison:'bail-introuvable'`, avec une explication.

### 🟡 11. Une édition datée dans le futur ne fait pas suivre le loyer vivant à l'échéance
Le recalage (`app-part2.js:14610`) ne regarde que **aujourd'hui**. Exemple : reculer la période en vigueur (640 €) au 01/12/2026, le 06/10. On a alors `bail.hc` = 600, et rien ne le remet à 640 le 01/12. Le dû reste juste (le barème fait foi). Mais le formulaire « Modifier le bail » montrera 600, et le prochain changement financier saisi partira de cette base. La famille existait déjà (avenant daté), il faut la consigner au BACKLOG.

### 🟡 12. Le journal d'audit n'est pas défait au retour arrière
`app-part2.js:14637`. `_auditLog` est appelé avant `saveDB` ; si la sauvegarde échoue, le barème, le journal, le bail et le logement sont restaurés, mais `_auditLog` garde « période … modifiée ». **Correctif** : appeler `_auditLog` après un `saveDB` réussi.

### 🟡 13. Test à retardement
`bareme-edition-orchestrateur.test.js:185-193` : `expect(DB.baux[REF].hc).toBe(640) // période future`, avec l'ajout au **01/03/2027** et `_histoBailTodayIso` sur l'horloge réelle. Vérifié en forçant l'horloge au 15/04/2027 : le test devient rouge (`expected 700 to be 640`). **Correctif** : injecter la date du jour dans le bac à sable du test.

### 🟡 14. Détecteur : ordre de rejeu libre et horloges des appareils
Les boutons « Réappliquer » sont indépendants, l'utilisateur choisit l'ordre ; la péremption compare des `date` ISO issues d'horloges d'appareils différents. Je n'ai pas trouvé de divergence chiffrée dans les cas essayés. Le bouton groupé du finding 2 règle les deux points.

### 🟡 15. UI / accessibilité
- **Échap** ne quitte pas le mode sélection (seule la fenêtre se ferme) ; aucun `role="radiogroup"` ni navigation aux flèches entre les puces `role="radio"`.
- `.hl-selmode .hl-card{pointer-events:none}` désactive aussi les liens IRL des cartes pendant la sélection (voulu ? à dire).
- L'encart « futur » n'affiche que le premier écart. Si les mois futurs changent de deux façons différentes (absorption), « à partir du … » est trompeur.
- Non vérifié en navigateur ici (pas d'affichage). La maquette téléphone (`periodes-modifier-tel-light.png`) est cohérente avec le CSS : 44 px, champs à 16 px, PC/tablette à taille native.

### 🟡 16. Ménage
- Des commentaires citent encore `_histoSaveCorrPeriode`, supprimé : `app-part1.js:25130`, `loyer-du-mois.js:86`, `loyer-bareme.js:292`.
- Version non bumpée (title + footer), reportée « au merge » contrairement à AGENTS.md §4 : à assumer explicitement.
- Avec `sansSave:true`, aucun retour arrière n'est possible si le `saveDB` de l'appelant échoue : à écrire dans le contrat de l'API pour la session IRL.

---

## Vérifié et trouvé correct

- **Moteur IRL intact** : `loyer-bareme.js`, `irl-revision.js`, `bail-modif.js` et `app-part1.js` sont absents du diff. Après une modification des seules charges, `redaterRevisionIRL` (`bail-modif.js:133`) et `annulerRevisionProgrammee` (`irl-revision.js:117`) retrouvent toujours la période (`source:'irl'`, même `debut`, vivante).
- **Invariants du module** : le fuzz du dépôt (2 000 séquences) et mon fuzz à deux chapitres (3 000 séquences, 4 098 éditions sur le 2ᵉ bail, chapitres contigus et non contigus, IRL/manuel/clôture) ne donnent **aucun** chevauchement, aucune double période ouverte, aucune période du 2ᵉ bail avant son début, et aucun changement du dû de l'autre chapitre (hors finding 6, sans effet sur le dû).
- **Sémantique** :
  - reculer prolonge P contiguë (cas de la maquette : 720 → 680 en septembre) ;
  - avancer absorbe (`_absorbeePar`) ou rogne ;
  - la date de la 1ʳᵉ période est ignorée, avec un avertissement ;
  - supprimer la 1ʳᵉ période pose une ligne au tarif de la suivante ;
  - supprimer la seule période repose la période au tarif du bail ;
  - supprimer la période de clôture ne dépasse jamais la clôture ;
  - une continuation `bail` éditée devient `manuel` ;
  - IRL : seules les charges se modifient, la suppression est refusée et expliquée.
- **Entrées** : jamais mutées. Dates calculées en UTC (`_decale`), sans saut d'heure d'été. Montants négatifs refusés. Idempotence par `evtId` (y compris rejeu et double clic).
- **saveBail** : après recalage, `synchroniserPeriodeBail` est un no-op (testé, mutation M3 détectée). Le recalage ne touche que le chapitre courant non clos, et seulement si la période du jour change.
- **Sauvegarde** : en mode cloud, `saveDB` appelle `__immoMarkDirty` même quand le miroir échoue (`app-part1.js:2681`), mais le flush est différé (debounce, `supabase-entry.js:1656`) : le retour arrière en mémoire passe avant. Hors ligne, le refus est annoncé (`_hlEcritureOK`). Le bail signé n'est jamais réécrit à la main : `hc`/`ch` sont dans `CHAMPS_BAIL` et passent par `_journaliserVerrouilles` (`store-sync.js:466`).
- **Journal** : `type:'periode'` est rangé en `type_evenement='autre'`, objet complet dans `legacy_raw` (`store-mapping.js:181-189`, testé). La relecture le reconstruit tel quel (`store-supabase.js:137`). `reappliquerJournalBaux` et `journalDuBail` l'ignorent (pas de `changements`), donc pas de rejeu au chargement ni de migration. Le rejeu « Réappliquer » n'ajoute pas d'entrée.
- **UI** : sélection par index `data-pidx` (pas de clé dans l'`onclick`). `_lyQ` correctement composé (`\'` puis `&#39;`). Notes, motifs et auteurs échappés dans les cartes et le bandeau IRL. Le tableau de sélection et le mode sont réinitialisés à chaque rendu. L'alerte est recalculée en simulation sans écriture, débouncée, et seul l'encart est réécrit. CSS en variables uniquement (clair/sombre), 44 px et 16 px sur téléphone.
- **Mutations** (copie `git archive`) : 8 sur 9 font rougir au moins un test.

| Mutation | Résultat |
|---|---|
| M1 reculer sans prolonger P | 10 tests rouges |
| M2 la source reste `bail` | 1 test rouge |
| M3 pas de recalage | 3 tests rouges |
| M4 pas de péremption au détecteur | 1 test rouge |
| M5 pas de retour arrière à l'échec de sauvegarde | 1 test rouge |
| M6 pas de ligne de reprise (1ʳᵉ supprimée) | 1 test rouge |
| M7 garde IRL retirée | 2 tests rouges |
| M8 `avant-bail` retiré | 1 test rouge |
| **M9 filtre de chapitre retiré** | **survit** (finding 5) |

- **Suite complète** : 263 fichiers, 6 464 tests verts. `tools/stamp-app-parts.mjs` ne laisse aucun écart.

## Résumé

**Verdict : 🟠 À CORRIGER.** Aucun 🔴 : le module pur tient ses invariants, y compris sur deux baux contigus (fuzz indépendant de 3 000 séquences). L'IRL n'est pas touchée. Le recalage protège bien du prochain saveBail.

- 🟠1 « Réappliquer » force des montants absolus, dont le loyer HC d'une période IRL, par-dessus une révision faite entre-temps (742 → 730 €, sans alerte).
- 🟠2 Deux éditions perdues ensemble : seule la dernière est proposée et elle échoue (`introuvable`), rien n'est récupérable par le bouton.
- 🟠3 Modifier le loyer en vigueur fait sauter en silence une révision IRL programmée (`ancienHC` ≠ `log.hc`) et laisse sa hausse calculée sur l'ancien loyer, sans alerte.
- 🟠4 XSS stockée : `fd()` non échappé dans le bandeau du détecteur (données du journal cloud).
- 🟠5 Le fuzz n'a toujours pas de second chapitre ; la mutation « filtre de chapitre retiré » survit à toute la suite.
