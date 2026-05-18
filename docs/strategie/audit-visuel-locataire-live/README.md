# Audit visuel comparatif — LocataireCloud (locataire.live) vs ImmoTrack v15.73

> Captures réalisées le 2026-05-18 via Edge headless 1440×2200 (desktop) et 320/390/428 px (mobile).
> ImmoTrack v15.73 captures partagées par utilisateur dans le chat (non sauvegardées ici).

## Stack technique LocataireCloud identifié

- **Framework** : Next.js 14+ App Router (header `X-Nextjs-Prerender: 1`)
- **Hébergement** : Vercel (région Paris, `Server: Vercel`)
- **CSS** : Tailwind + shadcn/ui (tokens `bg-background`, `text-primary`, `bg-muted/25`...)
- **Fonts** : Montserrat + Instrument Sans + **Fraunces** (serif display titres)
- **Mode** : Light forcé (`data-theme="light"`)
- **Render** : SSR + SSG hybride (RSC)

## Captures incluses

### Desktop (1440 × 2200)
- `01_lc_home.png` — page d'accueil avec hero + offre Founder 347 € × 50 places + pricing card + sections produit
- `02_lc_tarifs.png` — section pricing (= 01 avec ancre #tarifs)
- `03_lc_agences.png` — page B2B agences (multi-utilisateurs, rôles, mandats)
- `04_lc_outils.png` — page /outils avec 16 calculateurs gratuits (acquisition SEO)
- `05_lc_roadmap.png` — roadmap publique (26 features T2 2026 → T1 2027)
- `08_lc_annonces.png` — place de marché annonces (4-col Airbnb-like)

### Mobile (320 / 390 / 428 px)
- `06_lc_home_mobile.png` — home iPhone 14 (390 px)
- `15_lc_iphone_se.png` — home iPhone SE (320 px)
- `16_lc_iphone_promax.png` — home iPhone Pro Max (428 px)
- `17_lc_outils_mobile.png` — page /outils mobile (390 px)
- `18_lc_agences_mobile.png` — page /agences mobile (390 px)

## Verdict global

| Dimension | Verdict |
|---|---|
| **Produit applicatif** (Dashboard / Wizard Bail / IRL / EDL / Régul) | 🟢 ImmoTrack v15.73 devant |
| **Site vitrine externe** | 🔴 LocataireCloud devant (ImmoTrack en a aucun) |
| **Calculateurs SEO gratuits** | 🔴 LocataireCloud devant (16 outils) |
| **Roadmap publique** | 🔴 LocataireCloud devant |
| **Pricing visible** | 🔴 LocataireCloud devant |
| **Mobile applicatif** | 🟢 ImmoTrack v15.73 OK (sauf 2 BUGS P0 + 4 layouts à polish — Sprint 5) |

## Conclusions actionnables

Voir détails dans :
- `docs/subjects/WATCH-LOCATAIRELIVE.md` — monitoring trimestriel
- `docs/subjects/BIZPLAN-V2.md` — section "Concurrent #9 LocataireCloud"
- `docs/subjects/OUTILS-SEO-GRATUITS.md` — réaction calculateurs SEO
- `docs/subjects/FOUNDER-EDITION.md` — réaction pricing lifetime
- `docs/subjects/IA-COPILOTE.md` — réaction IA conversationnelle
- `docs/subjects/MOBILE-AUDIT-ONGLETS.md` — Phase 5 polish identifiée
- `docs/subjects/BUG-MOBILE-MENU-PLUS.md` — P0 bug menu mobile
- `docs/subjects/BUG-MOBILE-DASH-PROFILES.md` — P0 sélecteur profil inaccessible mobile

## Sources

- [locataire.live homepage](https://www.locataire.live)
- [locataire.live/roadmap](https://www.locataire.live/roadmap)
- [locataire.live/agences](https://www.locataire.live/agences)
- [locataire.live/outils](https://www.locataire.live/outils)
- [locataire.live/annonce](https://www.locataire.live/annonce)
