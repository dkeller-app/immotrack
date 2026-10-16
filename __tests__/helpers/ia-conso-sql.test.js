// CONSO-IA — garde-fous STATIQUES de la migration 0062 (la preuve dynamique est la simulation
// supabase/tests/sim/0062-ia-conso-plafonds.sim.mjs, jouée sur la vraie base dans une transaction annulée).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const SQL = readFileSync(new URL('../../supabase/migrations/0062_ia_conso_plafonds.sql', import.meta.url), 'utf8')
const sansCommentaires = SQL.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n')
const fonctions = [...sansCommentaires.matchAll(/create or replace function public\.([a-z_]+)\(([\s\S]*?)\$\$;/g)]
  .map((m) => ({ nom: m[1], corps: m[0] }))
const fn = (nom) => (fonctions.find((f) => f.nom === nom) || {}).corps || ''
const TABLES = ['ia_plafonds_offre', 'ia_surcharges', 'ia_compteurs', 'ia_conso_jour', 'ia_admin_journal']
const ADMIN = ['ia_admin_conso', 'ia_admin_plafonds', 'ia_admin_plafonds_maj', 'ia_admin_surcharge_maj', 'ia_admin_surcharge_retirer']

describe('0062 — consommation IA (statique)', () => {
  it('C-1 · transaction unique ; toute fonction a search_path vide', () => {
    expect((sansCommentaires.match(/\bbegin\s*;/gi) || []).length).toBe(1)
    expect((sansCommentaires.match(/\bcommit\s*;/gi) || []).length).toBe(1)
    expect(fonctions.length).toBeGreaterThanOrEqual(13)
    for (const f of fonctions) expect(f.corps, f.nom).toMatch(/set search_path = ''/)
  })
  it('C-2 · RLS activée ET forcée sur chaque table, aucune écriture directe pour un connecté', () => {
    for (const t of TABLES) {
      expect(sansCommentaires, t).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
      expect(sansCommentaires, t).toMatch(new RegExp(`alter table public\\.${t}\\s+force\\s+row level security`))
      expect(sansCommentaires, t).toMatch(new RegExp(`create policy \\w+\\s+on public\\.${t}\\s+for select to authenticated`))
    }
    expect(sansCommentaires).not.toMatch(/for (insert|update|delete|all) to authenticated/)
    expect(sansCommentaires).toMatch(/revoke insert, update, delete, truncate on public\.ia_plafonds_offre, public\.ia_surcharges, public\.ia_compteurs, public\.ia_conso_jour, public\.ia_admin_journal from authenticated/)
    expect(sansCommentaires).not.toMatch(/grant [^;]* to anon/i)
  })
  it('C-3 · réservation et consigne : identité du relais exigée EN PREMIER', () => {
    for (const f of ['ia_reserver', 'ia_consigner']) {
      expect(fn(f), f).toMatch(/security definer/)
      expect(fn(f), f).toMatch(/begin\s*\n\s*if not public\._el_relais_ok\(\) then raise exception 'ia:interdit' using errcode = '42501'/)
    }
  })
  it('C-4 · compteur ATOMIQUE : la ligne du mois est verrouillée avant la comparaison au plafond', () => {
    const r = fn('ia_reserver')
    const iLock = r.search(/for update;/), iCmp = r.search(/v_u >= v_pl/), iMaj = r.search(/set unites = c\.unites \+ p_estimation/)
    expect(iLock).toBeGreaterThan(0)
    expect(iCmp).toBeGreaterThan(iLock)
    expect(iMaj).toBeGreaterThan(iCmp)
  })
  it('C-5 · fonctions admin : is_app_admin() exigé en premier ; helpers internes exécutables par personne', () => {
    for (const f of ADMIN) expect(fn(f), f).toMatch(/begin\s*\n\s*if not public\.is_app_admin\(\) then raise exception 'ia:interdit' using errcode = '42501'/)
    for (const f of ['_ia_auj()', '_ia_mois()', '_ia_plafonds(uuid)', '_ia_compteurs_mois(uuid, date)'])
      expect(sansCommentaires, f).toContain(`revoke all on function public.${f} from public, anon, authenticated;`)
  })
  it('C-6 · catalogue vide : jamais « sans plafond » par défaut (toutes les familles à 0)', () => {
    expect(fn('_ia_plafonds')).toMatch(/o\.dictee_min := 0; o\.pieces_pages := 0; o\.liens_demandes := 0; o\.factures := 0; o\.video_images := 0;/)
  })
  it('C-7 · l\'offre d\'un espace n\'est plus modifiable par un connecté (garde de l\'abonnement)', () => {
    const g = fn('espaces_abonnement_garde')
    expect(g).toMatch(/if current_user not in \('authenticated', 'anon'\) then return new; end if;/)
    for (const col of ['plan_id', 'subscription_source', 'subscription_status', 'trial_ends_at', 'stripe_customer_id', 'comp_reason', 'comp_granted_by', 'comp_granted_at'])
      expect(g, col).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`))
    expect(sansCommentaires).toMatch(/before insert or update on public\.espaces\s+for each row execute function public\.espaces_abonnement_garde\(\)/)
  })
  it('C-8 · grille validée (16/10/2026) et bascule D4', () => {
    expect(sansCommentaires).toMatch(/\('free',\s+10,\s+8,\s+10,\s+5, null\)/)
    expect(sansCommentaires).toMatch(/\('investisseur',\s+90, 120, 150,\s+60, null\)/)
    expect(sansCommentaires).toMatch(/\('beta',\s+300, 400, 500, 200, null\)/)
    expect(sansCommentaires).toMatch(/update public\.espaces set plan_id = 'beta' where plan_id = 'free';/)
    expect(sansCommentaires).toMatch(/insert into public\.ia_surcharges \(user_id, sans_plafond, motif\)\s+select a\.user_id, true,/)
    expect(fn('_ia_auj')).toMatch(/at time zone 'Europe\/Paris'/)
  })
  it('C-9 · aucune donnée personnelle de locataire ou de candidat : seulement des compteurs', () => {
    const colonnes = [...sansCommentaires.matchAll(/create table public\.ia_\w+ \(([\s\S]*?)\n\);/g)].map((m) => m[1]).join('\n')
    expect(colonnes).not.toMatch(/locataire_id|candidat|bail_id|logement|texte|email|telephone/)
  })
})
