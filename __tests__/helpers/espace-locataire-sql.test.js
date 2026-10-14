// ESPACE LOCATAIRE — garde-fous STATIQUES de la migration 0059 (la preuve dynamique d'isolation est la simulation
// supabase/tests/sim/0059-espace-locataire.sim.mjs, jouée sur la vraie base dans une transaction annulée).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const SQL = readFileSync(new URL('../../supabase/migrations/0059_espace_locataire.sql', import.meta.url), 'utf8')
const sansCommentaires = SQL.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n')
const fonctions = [...sansCommentaires.matchAll(/create or replace function public\.([a-z_]+)\(([\s\S]*?)\$\$;/g)]
  .map((m) => ({ nom: m[1], corps: m[0] }))
const LOCATAIRE = ['el_contact', 'el_ouvrir', 'el_documents', 'el_fichier', 'el_depot', 'el_accord', 'el_signaler', 'el_signalements', 'el_messages', 'el_message_envoyer']

describe('0059 — frontière d\'accès (statique)', () => {
  it('L-1 · transaction unique, aucun COMMIT intermédiaire', () => {
    expect((sansCommentaires.match(/\bbegin\s*;/gi) || []).length).toBe(1)
    expect((sansCommentaires.match(/\bcommit\s*;/gi) || []).length).toBe(1)
  })
  it('L-2 · toute fonction a search_path vide ; toute fonction el_* est security definer', () => {
    expect(fonctions.length).toBeGreaterThan(15)
    for (const f of fonctions) {
      expect(f.corps, f.nom).toMatch(/set search_path = ''/)
      if (f.nom.startsWith('el_')) expect(f.corps, f.nom).toMatch(/security definer/)
    }
  })
  it('L-3 · chaque fonction côté locataire passe par _el_acces (seule résolution de l\'accès)', () => {
    for (const nom of LOCATAIRE) {
      const f = fonctions.find((x) => x.nom === nom)
      expect(f, nom).toBeTruthy()
      expect(f.corps, nom).toMatch(/a := public\._el_acces\(p_jeton_sha256, p_ip_hash\);\s*if a\.id is null then return/)
    }
  })
  it('L-4 · _el_acces refuse tout appelant qui n\'est pas l\'identité du relais, et n\'est exécutable par personne', () => {
    const f = fonctions.find((x) => x.nom === '_el_acces')
    expect(f.corps).toMatch(/if not public\._el_relais_ok\(\) then raise exception 'el:interdit' using errcode = '42501'/)
    expect(sansCommentaires).toMatch(/revoke all on function public\._el_acces\(text, text\) from public, anon, authenticated;/)
  })
  it('L-5 · aucun droit accordé à anon ; EXECUTE retiré à anon pour chaque fonction exposée', () => {
    expect(sansCommentaires).not.toMatch(/grant [^;]* to anon/i)
    for (const nom of [...LOCATAIRE, 'el_acces_emettre', 'el_acces_revoquer', 'el_acces_renouveler', 'el_objet_ouvert', '_el_relais_ok'])
      expect(sansCommentaires, nom).toMatch(new RegExp(`revoke all on function public\\.(%s|${nom})`))
  })
  it('L-6 · l\'empreinte du jeton n\'est lisible par personne ; les colonnes d\'accord ne sont pas modifiables par un connecté', () => {
    expect(sansCommentaires).toMatch(/create policy locataire_acces_jeton_aucune on public\.locataire_acces_jeton for select to authenticated using \(false\)/)
    expect(sansCommentaires).not.toMatch(/grant [^;]*locataire_acces_jeton[^;]* to authenticated/)
    const upd = sansCommentaires.match(/grant update \(([^)]*)\) on public\.locataire_acces to authenticated/)
    expect(upd[1].replace(/\s/g, '')).toBe('fin_bail,comptes_clos_le')
  })
  it('L-7 · le seau n\'est ouvert au relais que par une autorisation horodatée (el_objet_ouvert)', () => {
    const pols = [...sansCommentaires.matchAll(/create policy "espace-files:[^"]*"\s+on storage\.objects[\s\S]*?;/g)].map((m) => m[0])
    expect(pols.length).toBe(2)
    for (const p of pols) expect(p).toMatch(/el_objet_ouvert\(name, '(lecture|depot)'\)/)
    const f = fonctions.find((x) => x.nom === 'el_objet_ouvert')
    expect(f.corps).toMatch(/public\._el_relais_ok\(\) and exists/)
    expect(f.corps).toMatch(/o\.jusqu_au > now\(\)/)
  })
  it('L-8 · le suivi d\'un incident ne lit dans le registre que statut et dates (jamais verdict, payeur, artisan)', () => {
    const f = fonctions.find((x) => x.nom === 'el_signalements')
    expect(f.corps).not.toMatch(/verdict|payeur|artisan|assurance|mouvement/)
    expect(f.corps).toMatch(/legacy_raw->'statutDates'/)
  })
  it('L-9 · phases (D4) : départ jusqu\'à la clôture, documents 6 mois, plafond fin + 14 mois', () => {
    const f = fonctions.find((x) => x.nom === '_el_phase')
    expect(f.corps).toMatch(/interval '14 months'/)
    expect(f.corps).toMatch(/interval '6 months'/)
  })
})

// ── 0061 — « Dernière visite » fidèle : SEUL le seuil d'écriture change dans el_ouvrir ──
describe('0061 — dernière visite (statique)', () => {
  const lire = (n) => readFileSync(new URL('../../supabase/migrations/' + n, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const corpsOuvrir = (sql) => { const i = sql.indexOf('create or replace function public.el_ouvrir'); return sql.slice(i, sql.indexOf('$$;', i) + 3) }
  const SQL61 = lire('0061_espace_derniere_visite.sql')
  it('M-1 · transaction unique et une seule fonction remplacée : el_ouvrir', () => {
    const sans = SQL61.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
    expect((sans.match(/\bbegin\s*;/gi) || []).length).toBe(1)
    expect((sans.match(/\bcommit\s*;/gi) || []).length).toBe(1)
    expect([...sans.matchAll(/create or replace function public\.([a-z_]+)/g)].map((m) => m[1])).toEqual(['el_ouvrir'])
    expect(sans).not.toMatch(/\b(drop|alter table|create table|create policy|grant)\b/i)
  })
  it('M-2 · corps identique à 0059 hormis le seuil d\'écriture (1 heure → 1 minute)', () => {
    const a = corpsOuvrir(lire('0059_espace_locataire.sql')), b = corpsOuvrir(SQL61)
    expect(a).toContain("interval '1 hour'")
    expect(b).toContain("interval '1 minute'")
    expect(b).not.toContain("interval '1 hour'")
    expect(b).toBe(a.replace("a.derniere_visite < now() - interval '1 hour'", "a.derniere_visite < now() - interval '1 minute'"))
  })
  it('M-3 · reste security definer, search_path vide, résolution par _el_acces', () => {
    const b = corpsOuvrir(SQL61)
    expect(b).toMatch(/security definer/); expect(b).toMatch(/set search_path = ''/)
    expect(b).toMatch(/a := public\._el_acces\(p_jeton_sha256, p_ip_hash\);\s*if a\.id is null then return/)
  })
})
