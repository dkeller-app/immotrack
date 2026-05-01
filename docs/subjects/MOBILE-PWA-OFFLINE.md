# MOBILE-PWA-OFFLINE — Mode hors ligne formalisé + app mobile (PWA installable)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M (PWA + offline formel) → L (si on ajoute une couche native)
**Détecté** : 2026-05-01
**Lié à** : feedback_responsive · DRIVE-2H/2F/2G · BIZPLAN-STRATEGIE (USP "offline-first")

## Contexte
Demande utilisateur 2026-05-01 :
> 💬 « ajouter un mode hors ligne de l'app ? faire un app téléphone ? »

**Point de départ** : ImmoTrack est déjà **techniquement offline-first** (vanilla JS + IndexedDB + Drive sync optionnel) mais ce n'est ni formalisé côté UX ni installable comme app. Beaucoup d'UX mobile a déjà été livrée v13.37→v13.40 (popup lettre IRL, bail card responsive, headers non tronqués).

Manques actuels :
1. **Service Worker** absent → pas de cache d'assets, l'app ne fonctionne pas si le serveur est down (alors qu'elle pourrait)
2. **Manifest PWA** absent → impossible d'installer sur écran d'accueil (iOS/Android)
3. **Indicateur online/offline** absent → l'utilisateur ne sait pas s'il est en mode offline
4. **Queue de sync explicite** : quand offline, les modifs partent au prochain online — actuellement implicite, à exposer
5. **Tests mobile** systématiques : à intégrer dans le workflow

## Approche en 3 phases

### Phase 1 — PWA installable + offline formel (P2 / M, ~5-8h)
**Objectif** : transformer ImmoTrack en vraie PWA, installable sur téléphone + offline visible.

- [ ] **Manifest PWA** (`manifest.webmanifest`) : nom, icônes 192/512, theme-color, display "standalone", orientation
- [ ] **Service Worker** (`sw.js`) : cache `index.html` + assets statiques (jsPDF, html2canvas inlinés déjà OK), stratégie cache-first
- [ ] **Splash screen** iOS/Android (icônes + theme-color)
- [ ] **Indicateur connexion** : badge UI online/offline (top-right), vert "synchronisé" / orange "hors ligne, X modifs en attente" / rouge "erreur sync"
- [ ] **Queue de sync explicite** : compteur de modifs non synchronisées + bouton "Sync maintenant" en mode online
- [ ] **Détection install prompt** : bouton "Installer ImmoTrack" sur landing si non installé
- [ ] **iOS specifics** : meta tags apple-mobile-web-app-* (l'iOS PWA support est limité, à vérifier)

### Phase 2 — UX mobile (P2 / S-M, déjà partiellement livré v13.37-40)
- [x] Popup lettre IRL responsive (v13.37)
- [x] Boutons bail compacts (v13.37)
- [x] Bail card stack vertical mobile (v13.39)
- [x] Headers non tronqués (v13.40)
- [ ] **Tour systématique des onglets en 320px-768px** : identifier les pages encore desktop-only
- [ ] **Touch targets** : taille minimale 44x44px (iOS HIG)
- [ ] **Gestures** : swipe-to-delete sur listes, pull-to-refresh dashboard ?
- [ ] **Bottom nav** mobile (alternative aux onglets top) ?

### Phase 3 — App native (P3 / L, V2 2027 si besoin)
**Décision à prendre** : la PWA Phase 1 suffira-t-elle ou faut-il une vraie app native ?

- **Option A — PWA seule** (recommandé) : 0 effort native, marche sur Android (très bien) et iOS (limité mais OK). Pas de stores, pas de review Apple. → Suffit pour 90% des usages.
- **Option B — Wrap Capacitor** : conserve la base vanilla JS, ajoute une coque native pour publier sur App Store + Google Play. ~5-10 j-h de setup + maintenance des stores. → Si exigence stores forte (perception "vraie app", notifs push fortes).
- **Option C — Refonte React Native / Flutter** : refonte complète. Effort énorme (~3-6 mois). → ÉCARTÉ (pas de ROI vs PWA pour notre cas).

Recommandation par défaut : **Option A** d'abord, **Option B** si demande utilisateurs/stores après V1 commerciale.

## Décisions à prendre
- [ ] Phase 1 PWA : on attaque quand ? (Q3 2026 propre pour V1 ?)
- [ ] Service Worker : cache-first (rapide, mais MAJ silencieuses) ou network-first (toujours frais, mais lent offline) ? → **Recommandation** : stale-while-revalidate
- [ ] Phase 3 native : décision après retours V1 (pas de pré-engagement)
- [ ] Test mobile : ajouter checklist "responsive 3 formats validé" au workflow PR ?

## Ressources
- BIZPLAN.md mentionne "offline-first" comme USP — la formaliser via PWA renforce ce différenciant
- Mémoire `feedback_responsive.md` : tout changement UI doit être pensé 3 formats (déjà règle)
- Mémoire `feedback_design_consistency.md` : design system cohérent y compris en mobile

## Notes utilisateur
> 💬 2026-05-01 : "ajouter un mode hots ligne de l'app ? faire un app téléphone ?"

## Journal
- 2026-05-01 : créé · scope = PWA + offline formel (Phase 1 P2/M) · native = optionnel V2
