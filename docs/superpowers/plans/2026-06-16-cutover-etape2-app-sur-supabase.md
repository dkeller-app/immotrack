# Cutover étape 2 — l'app de tous les jours sur Supabase (plan d'exécution)

> **Pré-requis FAIT** : étape 1 (ré-import frais) ✅ 2026-06-16 — cloud = données du jour, vérifié 0 perte.
> **Risque** : ÉLEVÉ (vraies données en lecture/écriture cloud). **Principe directeur** : réversible à tout instant, filet localStorage, validation écran par écran AVANT toute irréversibilité. Login propre = étape 5 (gardé pour la fin) → ici on réutilise l'overlay de connexion existant.

## Goal
L'app de tous les jours (`index.html`) tourne sur Supabase (lecture + écriture), de façon **opt-in d'abord** (un réglage), **réversible** (filet localStorage à jour en permanence), puis **par défaut** une fois validée.

## État actuel (grounded 2026-06-16)
- **Le moteur existe** : `js/app/supabase-entry.js:18` → `localStorage immo_use_supabase==='1'` fait booter `index.html` sur Supabase (login overlay → hydrate cloud → `__immoSetDB`+`__immoRender`). Écriture 2c câblée (`saveDB`→`__immoMarkDirty`→flush, gardé version). Hydrate prouvé.
- **Ce qui manque pour un usage quotidien sûr** :
  1. **Filet de sécurité** : en mode cloud, `saveDB` (index.html:5828) NE persiste PAS en localStorage → si on coupe le mode cloud, le localStorage est figé à l'instant de bascule. Pas de rollback propre.
  2. **UX d'activation** : aujourd'hui le flag se pose à la main (ou via le bouton sandbox). Pas de réglage clair « Activer le mode cloud » dans l'app réelle.
  3. **Validation** : jamais exercé comme app quotidienne réelle sur la vraie origine.

## Sous-étapes (ordre = sûreté croissante)

### 2.1 — Filet de sécurité : DOUBLE-ÉCRITURE (code, audité)
**Quoi** : en mode cloud, `saveDB` écrit À LA FOIS le cloud (markDirty→flush, déjà là) ET le localStorage réel (`immotrack_v4`, miroir). Le cloud reste la source de vérité (hydrate lit le cloud) ; le localStorage devient un **miroir de secours** tenu à jour.
**Pourquoi** : rollback instantané = couper `immo_use_supabase` → l'app repart sur un localStorage À JOUR (pas figé). Zéro perte possible pendant toute la phase de validation.
**Fichier** : `index.html:5828-5834` (garde saveDB mode cloud) — réintroduire l'écriture localStorage (le quota ne s'applique PAS sur la vraie origine/clé `immotrack_v4`, contrairement au cache github.io partagé du sandbox).
**Décision** : double-écriture ACTIVE pendant toute la phase opt-in/validation ; retirée seulement au flip final (2.5) si on veut, ou gardée comme cache.
**Gates** : audit code-reviewer (chemin d'écriture) · test : modif → présent en cloud ET en localStorage · rollback (flag off) → données à jour.
**Coordination** : `index.html` = domaine maître → worktree off origin/main, file `.index-queue`, bump version.

### 2.2 — UX d'activation « Mode cloud » (Réglages) — MOCKUP-FIRST
**Quoi** : un réglage clair dans l'app pour activer/désactiver le mode cloud (pose/retire `immo_use_supabase`), avec statut (connecté en tant que X · espace Y · indicateur de sync) et un bouton « Revenir au mode local ».
**Pourquoi** : remplace la pose manuelle du flag ; rend la bascule (et le rollback) accessibles et lisibles.
**Process** : **mockups A/B/C × 3 formats × tous états** (activé/désactivé/connexion/erreur/rollback) AVANT code (règle gravée mockup-first). Réutilise le design system. Login = overlay existant (pas le login propre, qui est l'étape 5).
**Gates** : validation user des mockups → spec → code → audit.

### 2.3 — Login intérimaire
**Quoi** : quand le mode cloud est activé sans session, l'overlay de connexion existant (`supabase-entry`) gère le login. Le **login propre (Variante A) reste l'étape 5**. Rien à construire ici, juste vérifier le flux sur l'app réelle.

### 2.4 — Validation écran par écran (user, avec filet)
**Quoi** : Didier active le mode cloud sur son app réelle et exerce TOUS les écrans (dashboard, biens, baux, loyers, quittances, EDL, agenda, finances, génération PDF…) en lecture ET écriture. Le filet (2.1) tourne → aucun risque.
**Sortie** : checklist signée « tout fonctionne sur le cloud ». Tant qu'un écran cloche → on corrige, le mode reste opt-in.

### 2.5 — Bascule par défaut (le flip final)
**Quoi** : une fois 2.4 validé, le mode cloud devient le défaut (ou reste opt-in fortement recommandé). Décision : garder la double-écriture comme cache, ou la retirer.
**Pré-requis** : 2.4 OK. **Après** : étape 3 (verrou signés), 4 (retrait Drive), 5 (login propre + SSO).

## Filets de sécurité globaux
- localStorage tenu à jour (2.1) → rollback instantané.
- Drive intact jusqu'à l'étape 4.
- Cloud ré-importable (étape 1 rejouable depuis un export frais).
- Chaque sous-étape code = audit `superpowers:code-reviewer` avant validation user.

## Premier pas exécutable
**2.1 (double-écriture)** — petit, sûr (rend le mode cloud PLUS sûr, n'affecte pas l'app legacy car le mode cloud est opt-in), foundation du reste. À faire via worktree + file index + audit.
