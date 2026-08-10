# Charte graphique Propryo — VALIDÉE 2026-06-19

Identité de marque officielle. Validée sur la maquette `mockups/charte/index.html` (mise en page « cockpit », modes Clair/Sombre).

## Principe directeur
- **Corail = ACCENT UNIQUEMENT** : CTA, liens, focus, point du logo, 1 chiffre/élément clé. **JAMAIS de fond, carte ou panneau corail** (« tout corail » a été écarté). La base est faite de NEUTRES.
- Typo : **Schibsted Grotesk** (display, 800) + **Inter** (texte courant).
- **2 modes** : **Clair** (défaut vitrine) + **Sombre** (bien contrasté).

## Accent corail
- Mode clair : `#ff5a3c` (hover `#e8431f`, halo focus `#ffe7e0`).
- Mode sombre : `#ff6a4a` (légèrement plus lumineux pour le contraste ; texte sur corail = encre `#1a0d09`).

## Mode CLAIR — tokens
- Fond `#f4f5f8` · Surface (cartes) `#ffffff` · Surface creusée (inputs) `#f7f8fb` · Bordure `#e4e7ee`
- Titres `#101521` · Texte `#3c4658` · Secondaire `#6e7888`

## Mode SOMBRE — tokens (MODÈLE pour corriger le dark de l'app, qui manque de contraste)
- Fond `#14161d` (PAS noir pur) · Surface `#1e222c` (nettement > fond) · Carte `#262b37` · Bordure `rgba(255,255,255,.12)` (visible)
- Titres `#f2f5fa` · Texte `#cdd6e3` · Secondaire `#9aa6b8`
- **Surfaces nettement détachées du fond + bordures visibles** = chaque bloc se distingue. Ombres → bordures/halos. Contraste AA vérifié bloc par bloc.

## Logo
Propryo : pavé encre/surface + **point corail**. (Wordmark « Propryo » en Schibsted Grotesk.)

## À appliquer (étapes)
1. **Page de connexion réelle** : remplacer la modale `imsb-*` (`js/app/supabase-entry.js`) par cette landing plein écran (mode Clair par défaut + toggle Clair/Sombre persistant). ⚠️ Conserver les points d'ancrage auth : `#imsb-left` (renderLoading + acceptInviteFlow s'y injectent), le formulaire avec `#imsb-email`/`#imsb-pass`/`#imsb-submit`/`#imsb-error`/`#imsb-form` (utilisés par `wireLoginForm`), et le flux `acceptInviteFlow` (invitations).
2. **Re-skin de l'app** (`css/main.css`) : accent corail + le mode Sombre ci-dessus (corrige le manque de contraste actuel du thème Dark Boursorama) ; aligner les thèmes existants (Sobre/Coloré/Dark) sur cette identité. Touche tout `index.html` (coordination file index.html avec l'autre session).
