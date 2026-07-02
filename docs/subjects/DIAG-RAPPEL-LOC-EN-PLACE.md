# DIAG-RAPPEL-LOC-EN-PLACE — Diagnostics (DPE, plomb…) : pas de rappel tant qu'un locataire est en place ?

**Status** : ⬜ À faire (vérification légale requise AVANT d'implémenter) · **Prio** : P2 · **Taille** : S
**Détecté** : 2026-07-02 (user, test app réelle)
**Lié à** : BAILLEUR-DIAGNOSTICS-DDT ✅ v15.05-06, LEGAL-DPE-INTERDICTION-LOCATION ✅ v15.05, IRL-DPE-FG ✅ v13.31

## Contexte

> 💬 2026-07-02 : *« DPE plomb : ne pas mettre de rappel tant qu'il y a un locataire en place (il faut vérifier la loi, mais doit-on le faire chaque année même si locataire en place ?) »*

L'app rappelle le renouvellement des diagnostics expirés même quand le logement est occupé. Intuition user : les diagnostics servent à la mise en location → pas besoin de les refaire pendant le bail.

## ⚠️ Vérification légale à faire en session (ne pas implémenter l'intuition telle quelle)

Points à vérifier précisément avant de couper les rappels :
1. **Principe général** : le dossier de diagnostic technique est dû **à la signature du bail** (art. 3-3 loi 89-462). En cours de bail, pas d'obligation générale de refaire un diagnostic expiré. → l'intuition user est globalement juste.
2. **MAIS exceptions à vérifier** :
   - **DPE + loi Climat** : gel IRL des DPE F/G (déjà implémenté IRL-DPE-FG) et interdiction location G (2025) / F (2028) — l'app a besoin d'un DPE **valide** pour appliquer ces règles même locataire en place. Un DPE expiré en cours de bail ≠ neutre : il bloque la révision IRL côté app.
   - **Reconduction tacite / renouvellement** : certains documents (état des risques ERP notamment) doivent être à jour au renouvellement.
   - **Plomb (CREP)** : validité illimitée si absence de plomb ; 6 ans si présence → si présence de plomb, obligation de travaux/suivi possible même en cours de bail.
3. Sources à citer dans la décision : loi 89-462 art. 3-3, décrets DPE, jurisprudence éventuelle.

## Direction pressentie (à confirmer après vérif légale)

Rappels diagnostics **contextuels** au lieu d'annuels systématiques :
- Locataire en place + diagnostic expiré → pas d'alerte rouge, mais statut « à refaire avant relocation » (info grise)
- Départ locataire annoncé (préavis / assistant de départ) → l'alerte se réveille : « diagnostics à refaire avant remise en location »
- Exception DPE F/G : garder l'alerte si le gel IRL / interdiction location dépend d'un DPE valide

## Notes utilisateur

> 💬 2026-07-02 : voir Contexte.

## Journal

- 2026-07-02 : sujet créé en session pilotage (triage retours test user). Vérif légale = première étape de la session.
