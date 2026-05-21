# LOG-NOTES — Zone de commentaires libres (notes) sur les fiches

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S (~2-3h selon portée)
**Détecté** : 2026-05-17 (user : « on m'a fait remarqué qu'une zone d'écriture serait appréciable pour écrire des commentaires »)
**Lié à** : LOG-FICHE-360 ✅ (Bloc A v14.13) · FICHES-PARITE-360 (P1) · audit-trail RGPD

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs (besoin universel de noter du contexte libre : codes d'accès, particularités, échanges)
2. **Règles** : design consistency (sous-onglet dans la fiche 360°) + RGPD (notes = données perso si elles parlent du locataire)
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 : « une zone d'écriture serait appréciable pour écrire des commentaires »
   - 💻 Code existant : la fiche 360° (LOG-FICHE-360) agrège déjà les sous-onglets → une zone Notes s'y branche naturellement
   - 📋 Backlog : trou fonctionnel (aucune zone de texte libre aujourd'hui)
4. **5 vues 360°** : UX (contexte libre) + cycle de vie (suivi dans le temps) + RGPD (si notes mentionnent le locataire)

## Constat

Aujourd'hui ImmoTrack n'a **aucune zone de texte libre** : tout est structuré (champs typés). Or un bailleur a souvent besoin de noter du contexte non structuré :
- Codes d'accès, digicode, emplacement compteurs, nom du voisin de palier
- Historique d'échanges informels avec le locataire
- Particularités du bien (« chaudière capricieuse », « fuite réparée 03/2025 »)
- Rappels de gestion (« revoir le loyer sous-évalué au prochain bail »)

## Décisions à arbitrer (posées 2026-05-17, NON tranchées — user a reporté)

### D1 — Portée : à quel(s) niveau(x) ?
- [ ] **Bien (logement)** — le plus demandé, point de départ minimal
- [ ] Bail / Locataire — relation locative (comportement payeur, échanges)
- [ ] Immeuble — syndic, parties communes, AG copro
- [ ] Entité (SCI/bailleur) — associés, décisions de gestion
→ **Reco** : commencer par **Bien** (V1), étendre aux autres niveaux si besoin (le composant Notes est réutilisable).

### D2 — Format
- [ ] **Note libre unique** — 1 zone de texte éditable en continu (bloc-notes). Simple, rapide.
- [ ] **Notes horodatées (journal)** — chaque note datée + archivée comme fil d'événements. Traçabilité RGPD.
- [ ] **Les deux** — note libre permanente EN HAUT + journal horodaté en dessous.
→ **Reco** : à trancher avec le user. Note libre = MVP rapide, journal = plus pro mais plus de dev.

### D3 — RGPD
- Si une note mentionne le locataire (nom, comportement) → c'est une **donnée personnelle**.
- Doit être incluse dans l'export RGPD + la purge à la sortie du locataire ? À cadrer.

## Scope (proposé, V1 = Bien + note libre)

### Phase 1 — Sous-onglet Notes dans la fiche 360° (~60min)
- Nouveau sous-onglet **📝 Notes** dans LOG-FICHE-360
- `<textarea>` auto-save (debounce) → `logement.notes` (string)
- Compteur caractères + indicateur "sauvegardé"
- Markdown léger optionnel (gras/listes) — V2

### Phase 2 — Persistance + Drive sync (~30min)
- Champ `logement.notes` dans le payload entité (cf `_buildEntityPayload`)
- Sync Drive transparente (string dans le JSON entité)

### Phase 3 — Tests Vitest (~20min)
- Helper `_sanitizeNote(str)` (échappe HTML, limite taille)
- Auto-save debounce testé

### Phase 4 (si journal horodaté retenu) — ~60min
- `logement.notesJournal = [{ date, texte, auteur }]`
- UI fil d'événements + bouton "+ Ajouter une note datée"
- Lien audit-trail RGPD

## Notes utilisateur

> 💬 2026-05-17 : « on m'a fait remarqué qu'une zone d'écriture serait appréciable pour écrire des commentaires. On la met où ? dans logement ? mais comment on fait un 360° ? »
> (Réponse pilotage : zone Notes = sous-onglet de la fiche 360° du bien, qui agrège déjà tout.)

## Journal

- 2026-05-17 : créé · zone commentaires libres · décisions D1-D3 posées mais reportées par user · V1 proposé = Bien + note libre simple · à traiter en sprint
