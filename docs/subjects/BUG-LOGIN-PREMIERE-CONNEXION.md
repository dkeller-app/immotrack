# BUG-LOGIN-PREMIERE-CONNEXION — 1re connexion : identifiants effacés après le temps de chargement

**Status** : ✅ Livré v15.423 (2026-07-06) · **Prio** : P0 (bloque l'entrée dans l'app) · **Taille** : S
**Détecté** : 2026-07-06 (user) : « la première connexion échoue. il y a le temps de chargement puis login et mdp disparaissent »

## Cause (audit complet)

Le formulaire de connexion (#imsb-form, injecté par injectOverlay dans js/app/supabase-entry.js) était
visible et actif AVANT que wireLoginForm câble le vrai onsubmit : boot() attend l'import CDN esm.sh de
supabase-js (plusieurs secondes au 1er chargement à froid, quasi instantané ensuite grâce au cache HTTP —
d'où « seulement la première fois »). Pendant cette fenêtre, « Se connecter »/Entrée déclenchait la
soumission NATIVE du <form> → rechargement de la page → identifiants tapés effacés.

## Fix (v15.423, commit ec5666c)

1. injectOverlay pose immédiatement un onsubmit de GARDE : preventDefault + mémorise l'intention
   (_pendingSubmit) + bouton « Chargement… ».
2. wireLoginForm REJOUE la demande une fois câblé (requestSubmit) — l'utilisateur n'a rien à refaire.
3. Échec de l'import CDN : erreur VISIBLE + bouton « Recharger la page » (avant : mort silencieuse
   console + soumission native à chaque essai).

## Audit

Agent code-reviewer : **PASS, 0 bloquant** — rejeu sûr (propriété onsubmit unique, écrasée par le vrai
handler, synchrone), pas de double soumission ni boucle, flux invitation sans fenêtre morte, aucune fuite
d'identifiants (inputs sans name= : même l'ancien submit natif ne sérialisait rien en URL), FLAG sandbox
inerte. Mineur pré-existant noté : libellé setBusy « Se connecter » en dur (faux en mode signup après
erreur) — polish futur.

## Journal

- 2026-07-06 : bug signalé → cause trouvée le jour même (fenêtre morte avant câblage du submit),
  fix + vérif navigateur (garde posée, aucun reload au submit, champs conservés, erreur Supabase propre),
  audit PASS, ✅ livré v15.423 origin/main (a796705..ec5666c).
