# AUDIT-EMAIL-FLOW-COMPLET — Audit transverse du flow email post v15.80

**Status** : ⬜ À faire · **Prio** : P1 (bloquant si bug v15.80 persiste) · **Taille** : S (~1h)
**Détecté** : 2026-05-18 (user : « rien ne fonctionne. aucun bouton (même annuler). il faut faire un audit complet de tout ça »)
**Lié à** : EMAIL-AUTO ✅ v15.09, EMAIL-ONGLET-PERMANENT ✅ v15.79, EMAIL-SMTP-CONNECT 🔄 v15.80, BUG-EMAIL-PROPOSAL-IRL ⏳

## Contexte

User 2026-05-18 après livraison v15.80 EMAIL-SMTP-CONNECT Phase 1+2 :
- ❌ Aucun bouton de la modale "Proposition de mail" ne fonctionne (même Annuler)
- ❌ Aucun bouton 📧 dans la fiche bail (régression connue v15.16)
- ❌ Email envoyé via "Envoyer maintenant" non testable car modale cassée

Application de la règle gravée `feedback_rigor_audit.md` : **audit en bloc** plutôt que patch local.

## Hypothèses bug "boutons cassés"

| # | Hypothèse | Probabilité | Diagnostic |
|---|---|---|---|
| 1 | Cache SW sert HTML v15.80 + JS v15.79 (mix incohérent) | HAUTE | Clear cache + SW unregister + reload |
| 2 | Régression event delegation mon code v15.80 | MOYENNE | Lecture code email-modal.js l.114-128 |
| 3 | CSS overlay au-dessus de la modale qui bloque les clics | FAIBLE | DevTools Inspect sur les boutons + check z-index |
| 4 | Erreur JS empêchant le bind du listener | FAIBLE | DevTools Console errors au moment du `_ensureModalDom` |

## Scope audit (~1h)

### Phase 1 — Reproduire le bug (~15min)
- F12 → onglet Console : check errors
- F12 → onglet Application → Service Workers : check version SW + bouton Unregister
- F12 → Network : check si `email-modal.js` est servi en `200 OK` ou `from disk cache`
- Clear cache complet (F12 → Application → Storage → Clear site data)
- Hard refresh (Ctrl+Shift+R)
- Retester

### Phase 2 — Si bug persiste après cache clear (~30min)
- Inspect HTML : la modale `#ov-email-compose` a-t-elle bien les `data-em-action` sur ses boutons ?
- Console : `document.querySelector('#ov-email-compose').addEventListener` est-il appelé ?
- Console manuelle : `document.querySelector('[data-em-action="mailto"]').click()` déclenche-t-il `_onMailto` ?
- Check si une autre modale (`.ov.act`) est au-dessus et bloque les clics
- Check `pointer-events: none` accidentel via CSS sur les boutons

### Phase 3 — Inventaire des points d'entrée email (~15min)

Mapping de TOUS les endroits où l'app peut déclencher `_openEmailModal` :
- [x] IRL : `previewIRLLetter` → bouton 📧 dans modale lettre (ligne 20596+)
- [x] Quittance : bouton 📧 dans liste quittances (ligne 20048)
- [x] Régul : décompte régul (ligne 19137)
- [x] Modale IRL Valider envoi (ligne 19987)
- [x] Hub Communications par-bail `_openCommsHub` (ligne 19381) — **inactif depuis v15.16** : pas de point d'entrée UI
- [ ] **Fiche bail** : aucun bouton 📧 actif → à remettre v15.81

→ Décision : remettre un bouton 📧 dans la fiche bail (lien direct vers `_openCommsHub(ref)`) + bouton "Voir l'historique emails" qui navigue vers `#p-emails`.

### Phase 4 — Fix + tests Vitest (~varie selon cause)
Selon résultat audit, fix ciblé. Cas type :
- **Hypothèse 1 (cache SW)** : documenter procédure clear cache pour user + ajouter version-bumping aggressive dans sw.js
- **Hypothèse 2 (regression)** : revert mon code v15.80 + recoder proprement avec test e2e

## Décisions à prendre post-audit

- **D1** : Faut-il un mécanisme automatique de cache invalidation à chaque bump version ?
- **D2** : Remettre le bouton 📧 fiche bail (régression v15.16 reversed) ?
- **D3** : Ajouter un test Vitest E2E (jsdom + happy-dom) qui simule l'ouverture de la modale + click sur chaque bouton ?

## Notes utilisateur

> 💬 2026-05-18 : « rien ne fonctionne. aucun bouton (même annuler) il faut faire un audit complet de tout ça (et je n'ai pas de bouton envoyer dans bail!) »

## Journal

- 2026-05-18 : créé · priorité P1 si bug persiste après hard-refresh user
