# BUG-PARTAGE-EDL-ESPACE-TIERS — EDL d'un espace partagé invisible côté membre invité

**Status** : ⬜ À investiguer (session dédiée, console requise) · **Prio** : P1 (partage SCI = non négociable) · **Taille** : S-M
**Détecté** : 2026-08-08 (post-restauration Supabase : Didier connecté sur SON compte PC ne voit pas l'EDL de juillet)
**Lié à** : project_partage_sci (chantier PARTAGE SCI SOLIDE v15.483 — le « RESTE : E2E réel » jamais exécuté) · P0-SUPABASE-PAUSE · EDL-MOBILE-TERRAIN

## Constat user

> 💬 2026-08-08 : « je n'ai pas l'EDL fait en juillet en me connectant ! » (compte didierkeller@gmail.com, PC, post-restauration)

## Faits vérifiés en base (service role, lecture seule, 2026-08-08 soir)

- **L'EDL de juillet EXISTE et est intact au cloud** : `edl.legacy_id=1784120562200`, type Entrée, `date_edl=2026-07-15`, logement **FERRETTE 001** (`d211273b…`), dernière maj `2026-07-18 09:16 UTC`, non signé en base (`signed_at=null`).
- Il vit dans l'**espace de MARION** `2e5c49db…` (« Mon patrimoine », owner marion.raimbeaux@gmail.com) — **normal** : architecture inversée 14/07, la SCI SMARTOSAURUS vit chez elle.
- **Didier a les droits côté base** : membre `espace_members` de cet espace (role espace `lecture_seule`, `full_espace=false`, actif depuis le 15/07) **+ octroi `entite_membre` role `gestionnaire` sur l'entité SCI SMARTOSAURUS** (`6afe1b64…`) — la policy `edl_select` (`has_entite_access` via `entite_of_logement`, migration 0030) rend donc l'EDL **lisible ET modifiable** pour lui. RLS = pas la cause.
- Côté client, `resolveEspaces()` (supabase-boot.js:81) liste bien l'espace de Marion (membership actif) et `wireStores` monte 1 store par espace → le boot DEVRAIT hydrater l'EDL.
- Marion (owner) : dernier sign-in password **14/07 18:04** (le « EDL pas dispo chez Marion » du 08/08 matin = testé pendant la PANNE Supabase → test invalide, à refaire).

## Hypothèses (à départager en session avec console F12)

1. **Fusion espace tiers incomplète côté front** — le follow-on documenté du chantier partage (« store-multi ne fusionne pas encore le sous-blob config filtré des espaces TIERS ») ou un équivalent pour les collections : les rows edl de l'espace tiers arrivent-elles dans `DB.edl` ? (`espTag` D1, homonymie FERRETTE 001 : l'archive figée SMARTOSAURUS chez Didier a les MÊMES refs logement → collision/filtrage possible dans la LISTE EDL).
2. Fetch initial des espaces tiers partiel (toutes les tables demandées ?) ou erreur silencieuse pendant l'hydratation.
3. UI : la page EDL filtre par logements visibles — vérifier si FERRETTE 001 (version espace Marion) est dans `DB.logements` chez Didier.

## Plan de la session investigation

- [ ] Didier connecté PC : console F12 au boot → tracer l'hydratation de l'espace `2e5c49db` (requêtes REST, contenu `DB.edl`, `DB.logements` avec espTag).
- [ ] Vérifier la liste EDL UI vs `DB.edl` brut (`__immo…` helpers).
- [ ] Test croisé : Marion se connecte (owner) → doit voir l'EDL → confirme que le bug est spécifique au chemin « membre scopé espace tiers ».
- [ ] Fix + E2E réel complet du RESTE du chantier partage (Marion invite → Didier voit SA SCI sans collision → EDL/documents visibles).

## Contournement immédiat

Consulter/travailler l'EDL depuis le **compte de Marion** (owner de l'espace) en attendant le fix.

## Journal

- 2026-08-08 : créé. Vérifs base faites en direct (EDL présent + droits Didier OK) → bug côté client (hydratation/fusion espaces tiers ou UI), exactement le trou du « E2E réel jamais exécuté » du chantier PARTAGE SCI SOLIDE.
