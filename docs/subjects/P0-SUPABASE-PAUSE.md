# P0-SUPABASE-PAUSE — Projet Supabase suspendu (inactivité free tier) → PROD DOWN

**Status** : 🚨 **P0 ABSOLU — app inutilisable pour TOUS les comptes** · **Taille** : XS (restauration) + décision (prévention)
**Détecté** : 2026-08-08 (user : login « Load failed » iPhone + « Failed to fetch » PC + mail Supabase « compte suspendu suite à inactivité »)

## Constats user (2026-08-08)

> 💬 « Connexion sur téléphone avec erreur » (capture : Load failed)
> 💬 « connexion impossible à Propryo même depuis PC » (capture : Failed to fetch)
> 💬 « j'ai reçu un mail de Supabase me disant que mon compte est suspendu suite à inactivité »

## Diagnostic

- « Failed to fetch » / « Load failed » = le navigateur n'obtient **aucune réponse** de `*.supabase.co` → cohérent avec un projet **mis en pause**, pas un bug app.
- Supabase **free tier** : les projets sont mis en pause automatiquement après ~1 semaine sans activité API. Les **données sont conservées** ; le projet se restaure depuis le dashboard (quelques minutes).
- Ça explique aussi (au moins en partie) les symptômes du jour : impossible de se connecter partout, et potentiellement « EDL pas dispo chez Marion » si son accès a eu lieu pendant/apres la pause (à re-tester APRÈS restauration).
- ⚠️ L'app étant utilisée régulièrement, une pause pour « inactivité » interroge : vacances récentes sans utilisation ? OU mail à vérifier (phishing possible — ne JAMAIS cliquer les liens du mail, aller sur supabase.com directement).

## Action immédiate (USER — je ne peux pas le faire à ta place)

1. Aller sur **supabase.com** en tapant l'adresse directement (pas via le lien du mail) et se connecter au dashboard.
2. Ouvrir le projet Propryo → un bandeau « Project paused » propose **« Restore project »** → cliquer, attendre quelques minutes.
3. Re-tester le login app PC puis téléphone.
4. Re-tester le compte Marion (EDL partagés) — si toujours KO après restauration → c'est un vrai bug partage, sujet séparé.

## Prévention (décision à prendre)

| Option | Coût | Effet |
|---|---|---|
| A. Passer le projet en **Pro** | ~25 $/mois | Plus jamais de pause auto. Obligatoire de toute façon pour commercialiser (SLA, backups quotidiens). |
| B. Rester free + **ping keep-alive** | 0 € | Un cron (GitHub Actions déjà dispo dans le repo) qui fait 1 requête/jour sur l'API → compte comme activité. Fragile (Supabase peut durcir la règle), pas de SLA. |
| C. Ne rien faire | 0 € | Re-pause à chaque semaine sans utilisation → re-panne. Inacceptable dès qu'il y a 2 utilisateurs (Marion). |

Reco : **B tout de suite** (10 min, gratuit, débloque le quotidien) puis **A au moment de la bêta** (de toute façon prévu par BIZPLAN).

## Journal

- 2026-08-08 : créé. Panne totale constatée sur 2 appareils + mail Supabase. Restauration = action user dashboard. Prévention à décider (keep-alive gratuit vs Pro).
- 2026-08-08 soir : **projet restauré par le user** (dashboard « Resume project », données intactes, resumable jusqu'au 01/09/2027 d'après l'écran). Vérifié en direct : auth health OK (GoTrue v2.195.0), endpoint login répond proprement. **Login PC re-testé OK par le user.** Précision user : le problème de connexion existait DÉJÀ le jour de l'EDL → la pause explique la « page de connexion » pendant l'EDL du matin (session impossible à rafraîchir). ⏳ Reste : (a) re-test login iPhone (fermer l'onglet et rouvrir) · (b) re-test compte Marion + visibilité EDL partagés · (c) décision prévention (keep-alive quotidien gratuit reco, puis Pro à la bêta).
