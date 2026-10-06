# FUSION SCI — Plan de déplacement des restes (espace Didier → espace Marion)

Statut : **en attente du GO de Didier**. Rien n'a été écrit en base.

## Pré-requis

1. **Correctif v15.717 actif** (branche `fix/fusion-sci`, commit `89edc4a`). Sans lui, chaque nouvelle création de Didier sur la SCI repartirait dans son espace.
2. **Didier ferme l'app sur tous ses appareils** pendant l'opération (environ 2 minutes) et la rouvre après. Une app ouverte garderait l'ancien état en mémoire ; sa prochaine modification d'une ligne déplacée finirait en conflit puis en rechargement. Ce n'est pas destructeur, mais c'est inutile.
3. Aucune autre session ne teste sur les données réelles pendant l'opération.

## Périmètre exact (export du 06/10, avant écriture)

| Table | Lignes | Origine |
|---|---|---|
| mouvements | 34 | oubliés par la fusion du 28/09 (février à juin, immeuble Ferrette), **hors** les 2 « DD2AMELEVIERE » (décision Didier : SCI DD2 IMMO) |
| mouvements | 51 | import bancaire du 05/10, 21:09 |
| documents | 9 | DPE, DDT, Géorisques, formulaire de risques, attestation MRH, créés le 05/10. **Les fichiers sont déjà** dans le stockage de Marion : seule la fiche bouge |
| assurances (MRH) | 2 | attestations des lots FERRETTE 001 et Ferrette - 101, créées le 05/10 |
| agenda | 19 | rappels automatiques des lots du 05/10 (fins de bail, préavis, IRL, régularisations, diagnostics) |

**Exclu, en attente d'une réponse de Didier** : 1 document de juin (facture sur un mouvement « payé Didier », sans lot). Il reste en place.

Contrôles faits avant écriture :
- aucun `legacy_id` de ces lignes n'existe déjà chez Marion (0 collision sur les 4 tables) ;
- aucun doublon par date et montant, ni par fitid, avec les mouvements de Marion ;
- aucun doublon de rappel (titre + date).

## Méthode (identique à la fusion du 28/09)

Pour chaque ligne :
1. **Copie** dans l'espace de Marion. La ligne cible est calculée par le **vrai `mapToRow` de l'app**, avec le contexte de l'espace de Marion (générateur `gen.mjs`) :
   - id = `detUuid(propriétaire Marion)(type, legacy_id)` ;
   - rattachements résolus vers les fiches vivantes de Marion (6 lots, immeuble Ferrette, SCI). Les ids sont contrôlés égaux à ceux de la base ;
   - `legacy_raw` est recopié tel quel, `created_at` d'origine conservé, `created_by` = propriétaire de l'espace (convention de l'app et du 28/09).
   - **115 lignes générées, 0 rattachement non résolu.**
2. **Tombstone** de l'original dans l'espace de Didier (`deleted_at = now()`), **seulement si** la copie existe chez Marion et que l'original est encore vivant. **Aucune suppression dure.**
3. **Journal d'audit** : une entrée `fusion` / `admin-fusion` dans chacun des deux espaces, avec les comptes.

Le tout tient dans **une seule transaction** (`begin … commit`).

**Idempotence** : `insert … on conflict (id) do nothing`, et le tombstone est conditionné à l'existence de la copie. Relancer le script ne crée rien en double.

## Déroulé

1. **Sauvegarde** : export JSON horodaté de toutes les lignes concernées (contenu complet, ids d'origine). Il est **refait juste avant l'exécution** pour prendre ce qui aurait changé, et remis à Didier en fichier.
2. **Ré-export et régénération** du SQL si des lignes ont bougé depuis le 06/10. Didier voit les comptes avant exécution.
3. **Exécution** du SQL (MCP Supabase `execute_sql`, une transaction).
4. **Vérifications immédiates** (SELECT) :
   - chez Marion, +34+51 mouvements, +9 documents, +2 MRH et +19 rappels, tous vivants, avec un rattachement non nul ;
   - chez Didier, les mêmes `legacy_id` sont tombstonés et plus aucune ligne SCI n'est vivante ;
   - aucune ligne vivante ne pointe vers un logement tombstoné ;
   - les fichiers sont toujours lisibles (`storage.objects`).
5. **Vue Didier, puis vue Marion** : rechargement de l'app, contrôle des Finances SCI (juillet à octobre), des documents des lots et de l'agenda.

## Retour arrière

- Annuler la copie : `update … set deleted_at = now()` sur les ids créés chez Marion (liste dans `ids.json`).
- Rouvrir les originaux : `update … set deleted_at = null` sur les ids d'origine chez Didier (même fichier).
- Toujours en tombstones, jamais de suppression. La sauvegarde JSON permet en dernier recours de reconstruire n'importe quelle ligne.

## Hors périmètre de cette opération

- Les 2 mouvements « DD2AMELEVIERE » : reclassement vers SCI DD2 IMMO **dans l'app**, par Didier.
- Le compte bancaire « SMARTOSAURUS » et ses règles d'import **restent dans la config de Didier**. Avec v15.717, ses imports partent chez Marion dès que le mouvement porte un lot ou l'immeuble Ferrette, ce qui était le cas de tous les mouvements du 05/10.
- Un mouvement importé **sans lot ni immeuble** resterait chez Didier : c'est une limite connue.
