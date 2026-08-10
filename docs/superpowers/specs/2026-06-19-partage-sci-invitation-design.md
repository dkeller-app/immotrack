# Partage par SCI — Écran d'invitation & gestion des membres (design VALIDÉ 2026-06-19)

**But :** brique PRODUIT qui ACTIVE le partage par SCI. Le backend (RLS par-entité 0029/0030 + Storage par-SCI 0031 + câblage front v15.306) est déjà livré, appliqué au DB, audité PASSANT, 264 tests verts. Il ne reste QUE l'UX d'invitation/gestion + le flux d'acceptation + la vue scopée + la co-présence + la facturation.

**Maquette validée :** `mockups/partage-sci/index.html` (déployée github.io), variante B (par membre).

## Décisions validées (user 2026-06-19)
1. **Variante B** (une carte par membre, ses périmètres en pastilles).
2. **Mode d'accès PAR PÉRIMÈTRE (par SCI)** — une même personne peut être Écriture sur SCI-A et Lecture sur SCI-B. (Le backend le permet déjà : 1 ligne `entite_membre` par (entité, user) avec son propre `role`.)
3. **Modes** : **Écriture** (= `entite_membre.role = gestionnaire` ; co-gestion, AUCUN label de hiérarchie « Propriétaire/Gestionnaire ») / **Lecture** (= `lecture_seule` ; badge discret « Lecture », sous-titre « consultation seule » ; cas AGENCE qui donne au propriétaire un accès consultation).
4. **« Perso » partageable comme une SCI** (cas conjoints) — c'est l'entité « perso » de l'espace, cochable au même titre.
5. **Co-présence : popup transitoire ET pastille permanente** d'en-tête (avatars + point vert).
6. **Facturation** : abonnement de base + **1er partenaire ÉCRITURE offert, puis +3 €/mois par partenaire écriture supplémentaire**. **Les accès LECTURE (agences) sont GRATUITS** (hors quota).

## Frontend
- **Emplacement** : onglet « 👥 Partage » des Réglages (remplace le réglage Drive legacy, désormais masqué en cloud).
- **Écran « Partage & accès » (variante B)** : liste des membres = compte courant (toi, badge discret « vous », jamais « Propriétaire ») + partenaires. Par membre : ses périmètres en pastilles, badge « Lecture » uniquement pour ceux en lecture seule ; actions Modifier / Révoquer. Bouton « Inviter un partenaire ». Encart facturation (X/quota écriture, +3 €).
- **Popup « Inviter »** : sélection multi-périmètres (SCIs + Perso, pastilles) avec, **par périmètre coché, un mini-choix Écriture/Lecture** (défaut Écriture) → bouton « Générer l'invitation » → **réutilise la modale de partage du bail** (`_openBailSignShareModal` / `.bss-*` : Copier le lien / Email / SMS / WhatsApp / QR). Gère aussi l'édition d'un partenaire existant.
- **Vue partenaire (scopée)** : sidebar / dashboard / filtre entité limités aux périmètres octroyés ; bandeau « Vous accédez à <SCI>, partagé par <owner> ». La RLS garantit déjà l'étanchéité données+fichiers ; le front ne fait que CACHER ce qui n'est pas octroyé (pas de fuite même si oubli front, grâce à la RLS).
- **Co-présence** : pastille d'en-tête (avatars empilés + point vert « N en ligne », tooltip « X modifie la SCI Y ») + popup transitoire à l'édition simultanée.

## Backend (nouveau)
### Migration 0032 — `invitations` + RPC d'acceptation
- Table `invitations` : `id, espace_id, token (aléatoire, indexé unique), created_by, grants jsonb` (= liste `[{entite_id, mode}]`, `entite_id` = l'entité (SCI ou Perso), `mode` ∈ écriture|lecture), `email text null` (si invite email), `expires_at`, `status` (pending|accepted|revoked), `accepted_by`, `accepted_at`. RLS FORCE : gérable par `is_full_manager(espace_id)` ; un invité lit la sienne par token (ou via le RPC). Freeze identité + touch.
- RPC `accept_invitation(p_token)` `SECURITY DEFINER` : valide (pending, non expirée) → crée `espace_members(espace_id, user_id=auth.uid(), full_espace=false, invite_status=active)` (si absent) + une ligne `entite_membre` par grant (role dérivé du mode : écriture→gestionnaire, lecture→lecture_seule) → `status=accepted`, `accepted_by/at`. **Idempotent** (re-acceptation = no-op). Refuse si l'utilisateur est déjà membre plein.
- Tests RLS (`p1` ou nouveau fichier) : un invité accepte → obtient EXACTEMENT ses grants ; ne peut pas forger des grants hors invitation ; un non-manager ne crée/voit pas d'invitations ; token expiré/revoqué refusé.
- **Audit code-reviewer obligatoire** (sécurité : le RPC crée des accès → vérifier qu'il ne peut pas escalader au-delà des grants de l'invitation, ni cibler un autre espace).

### Flux
1. Owner : choisit périmètres + mode/périmètre → `insert invitations` (grants) → partage le **lien** `…/?invite=<token>` (et/ou email) via la modale bail.
2. Partenaire : ouvre le lien → login/signup Supabase → `accept_invitation(token)` → entre dans l'app scopée.

## Facturation (logique)
- Quota = nb d'utilisateurs DISTINCTS ayant ≥1 grant **écriture** (gestionnaire). 1er offert, chaque suivant +3 €/mois. Les utilisateurs uniquement en **lecture** = gratuits, hors quota. Affichage Réglages + au moment d'inviter. (Enforcement paiement = P5/Stripe, hors scope ici ; ici on AFFICHE + compte.)

## Co-présence — prérequis
Le canal Realtime est aujourd'hui **espace-level** (0025). Pour la co-présence : utiliser **Supabase Realtime Presence** sur le canal de l'espace (qui est en ligne + quoi). Décision à acter : présence espace-level (plus simple, un scopé voit juste « owner en ligne ») vs par-SCI (filtrer la présence par périmètre). Recommandation : **espace-level d'abord** (suffit pour le signal « quelqu'un d'autre est là »), affiner par-SCI plus tard.

## Ordre de construction suggéré (chaque étape : auditée si sensible)
1. **Migration 0032** (`invitations` + `accept_invitation`) + tests RLS + **audit**. Appliquer.
2. **Écran « Partage & accès » (variante B)** : lecture `espace_members` + `entite_membre` → liste membres + périmètres + modes.
3. **Popup d'invitation** (périmètres + mode/périmètre → `insert invitations` → modale bail) — lien d'abord (email = nécessite SMTP Supabase, cf note).
4. **Flux d'acceptation** : handler `?invite=<token>` au boot → login → `accept_invitation`.
5. **Vue scopée** (sidebar/dashboard/filtre limités aux périmètres octroyés + bandeau).
6. **Co-présence** (Realtime Presence → pastille + popup).
7. **Affichage facturation** (compte écriture, 1er offert, +3 €).

## Notes / dépendances
- **Email d'invitation** : nécessite la config SMTP Supabase (l'app note déjà « mdp oublié nécessite SMTP »). Le **lien** fonctionne sans SMTP → livrer le lien d'abord, l'email quand SMTP est configuré.
- Réutilise systématiquement l'existant : modale `.bss-*`, pastilles d'entité (couleur), structure Réglages, helpers `is_full_member`/`has_entite_*`.
- Toute la couche RLS+Storage étant déjà étanche + auditée, le risque de cette brique = surtout le **RPC d'acceptation** (escalade) et la **vue scopée** (fuite front) → audits ciblés.
