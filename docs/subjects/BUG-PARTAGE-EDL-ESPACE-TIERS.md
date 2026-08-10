# BUG-PARTAGE-EDL-ESPACE-TIERS — EDL d'un espace partagé invisible côté membre invité

**Status** : ✅ **ROOT CAUSE TROUVÉE + FIX CONSTRUIT 2026-08-10** (branche `fix/partage-edl-espace-tiers`, worktree `Immo-wt-partage-edl`) — reste : audit code-reviewer → QUEUE → E2E réel user · **Prio** : P1 · **Taille** : S-M
**Détecté** : 2026-08-08 (post-restauration Supabase : Didier connecté sur SON compte PC ne voit pas l'EDL de juillet)
**Lié à** : project_partage_sci (chantier PARTAGE SCI SOLIDE v15.483) · P0-SUPABASE-PAUSE · EDL-MOBILE-TERRAIN

## ⚠️ LE DIAGNOSTIC DU 08/08 ÉTAIT FAUX SUR UN POINT CLÉ

L'EDL n'est **PAS** « intact au cloud » : il est **SOFT-DELETED depuis le 18/07 09:16:10 UTC**
(`edl.deleted_at=2026-07-18T09:16:10Z`, version 2 = création v1 le 15/07 13:02 + le soft-delete v2 ; la
« maj 18/07 09:16 » notée le 08/08 était en réalité LA SUPPRESSION). L'espace Marion compte **0 EDL
vivant**. Le client (Didier ET Marion) le masque donc **correctement** — ce n'était pas un bug
d'hydratation des espaces tiers. Marion ne le voyait pas non plus (son « test invalide pendant la
panne » du 08/08 matin était en fait un vrai symptôme).

Le `legacy_raw` est **complet et intact** (6 pièces, 75 éléments, 0 photo, bloc signatures présent) →
récupération = un-delete (réversible).

## Root cause (prouvée par repro E2E vrai Postgres, rouge sans fix / verte avec)

**Classe de bug : perte du tag `_espaceId` par remplacement d'objet.** `saveEDL` (index.html)
RECONSTRUIT le record de zéro (`const record={…}; DB.edl[i]=record`) → le tag `_espaceId` posé par
`store-multi` à l'hydrate est perdu. Au flush suivant, le diff D1 (clés `id@@espace`) voyait :
1. clé `1784120562200@@espace-Marion` disparue du courant → **softDelete routé chez Marion** —
   l'octroi `entite_membre gestionnaire` de Didier l'AUTORISE (RLS conforme) → tombstone isolé du
   18/07 09:16 ;
2. clé nue apparue → upsert routé espace **propre** (défaut D2) → `mapToRow` ne résout pas la ref
   `FERRETTE 001` (les refs de l'archive de Didier sont `Ferrette - 001`) → **skipped silencieux**.

Résultat : EDL détruit chez Marion, aucune copie nulle part. Scénario du 18/07 : Didier (session
multi-espace sur SON compte) a ouvert/ré-enregistré l'EDL tiers → destruction silencieuse.
Même classe de risque pour TOUTE collection dont l'éditeur remplace l'objet (`saveEnt`,
`DB.baux[ref]={…}`, …). La branche removes de `delEDL` était saine (elle route par le rec baseline tagué).

## Fix — D1b « réadoption du tag d'espace » (`js/core/store-sync.js`, un seul point, DRY)

Au flush (et dans `_hasPendingRemoves`), un record **vivant non tagué** dont la clé nue correspond à
un **unique** espace tagué du baseline est LE MÊME record réédité → il ré-adopte ce tag AVANT le diff
→ l'écriture repart au bon espace, aucun remove. Sûretés : jamais de retag d'un record déjà tagué ;
clé nue connue non taguée au baseline → espace propre (D2 inchangé, mono-espace inerte) ; 2+ espaces
candidats (homonymie réelle) → ambigu, pas de devinette (D2).

## Preuves (2026-08-10)

- **Repro E2E `supabase/tests/repro-partage-edl-tiers.test.mjs`** (vrai boot app `createBoot` →
  `resolveEspaces` → `wireStores` → `hydrate`, comptes de test, config prod exacte : owner plein +
  membre scopé lecture_seule/full_espace=false + octroi gestionnaire + archive homonyme + SCI non
  octroyée) : **7/7** — hydratation multi-espaces OK (le membre voit l'EDL tiers), anti-fuite OK,
  ET le scénario destructeur du 18/07 rejoué : **rouge sans fix, vert avec** (EDL survit chez
  l'owner, édité, sans copie parasite).
- **TDD offline `__tests__/helpers/store-sync-retag.test.js`** : 10 tests D1b (incident, delEDL,
  nouveau record D2, ambiguïté, mono inerte, baux, entites, markDirty).
- Suite offline complète : **2191/2191** (base rebasée v15.495). Suite RLS complète : en cours au
  moment de cette note (voir QUEUE).

## Récupération données

Un-delete de la ligne `edl` `e0ae9b6c-9d96-5be1-ad1c-3b3c8cdb9a0f` (service role,
`deleted_at=null`, réversible). ⚠️ Tant que le fix n'est pas DÉPLOYÉ : ne pas RÉ-ENREGISTRER l'EDL
depuis le compte de Didier (la consultation est sans risque ; un re-save le re-détruirait — re-un-delete possible).

## Journal

- 2026-08-08 : créé. Vérifs base : EDL « présent » + droits Didier OK → hypothèse bug client hydratation.
- 2026-08-10 : session chantier. Repro E2E verte → hydratation hors de cause → re-vérif base :
  **deleted_at manqué le 08/08**. Fingerprint tombstones : suppression isolée 18/07 09:16. Mécanisme
  identifié dans saveEDL (remplacement d'objet) + confirmé par repro E2E destructive (rouge sans fix).
  Fix D1b réadoption + 10 tests offline + E2E. Restauration EDL préparée.
