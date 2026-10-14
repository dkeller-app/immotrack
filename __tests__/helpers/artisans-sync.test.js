/**
 * CIRCUIT D'UN INCIDENT — lot b : carnet d'artisans synchronisé (table `artisans`, migration 0060) et texte de la
 * migration (frontière du lien artisan, plafond décidé par la base, suivi du locataire).
 *   A-1  mapper : rattachement SCI, fiche complète (note privée comprise) en legacy_raw
 *   A-2  câblage : table, collection synchronisée, taguée hors ligne
 *   A-3  routage multi-espaces : l'artisan suit l'espace de sa SCI
 *   M-*  migration 0060 (texte) : RLS forcée partout, aucune écriture directe, fonctions côté artisan gardées par
 *        l'identité du relais, plafond, accord exprès, résultat seulement après publication
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mapToRow, MAPPED_COLLECTIONS } from '../../js/core/store-mapping.js'
import { SYNCED_COLLECTIONS } from '../../js/core/store-sync.js'
import { TABLE_COLLECTIONS } from '../../js/core/store-supabase.js'
import { COLLECTIONS_TAGUEES } from '../../js/core/offline-boot.js'
import { inferRattachementOf } from '../../js/core/store-multi.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ctx = () => ({ espaceId: 'ESP', ownerId: 'OWN', detUuid: (...p) => p.join(':'), entiteByNom: new Map([['sci dupont', 'ent-1']]), immeubleByNom: new Map(), logementByRef: new Map() })

describe('A · carnet d\'artisans dans la synchro', () => {
  it('A-1 mapper : SCI, fiche complète en legacy_raw ; SCI inconnue → null (membres pleins seulement)', () => {
    const row = mapToRow('artisans', { id: 12, entity: 'SCI Dupont', nom: 'Plomberie Weber', notePrivee: 'Ponctuel', metiers: ['plomberie'] }, ctx())
    expect(row).toMatchObject({ id: 'artisan:12', legacy_id: '12', entite_id: 'ent-1', espace_id: 'ESP' })
    expect(row.legacy_raw).toMatchObject({ nom: 'Plomberie Weber', notePrivee: 'Ponctuel' })
    expect(mapToRow('artisans', { id: 13, entity: 'Inconnue', nom: 'X' }, ctx()).entite_id).toBeNull()
  })
  it('A-2 câblage : table, collection synchronisée et taguée', () => {
    expect(MAPPED_COLLECTIONS).toContain('artisans')
    expect(TABLE_COLLECTIONS.has('artisans')).toBe(true)
    expect(SYNCED_COLLECTIONS).toContain('artisans')
    expect(COLLECTIONS_TAGUEES).toContain('artisans')
  })
  it('A-3 routage : un artisan suit l\'espace de sa SCI', () => {
    const db = { entites: [{ nom: 'SCI Dupont', _espaceId: 'B', immeubles: [] }] }
    expect(inferRattachementOf('artisans', { entity: 'SCI Dupont' }, db)).toEqual({ espace: 'B', entite: 'SCI Dupont' })
  })
})

describe('M · migration 0060 (texte)', () => {
  const sql = readFileSync(resolve(root, 'supabase/migrations/0060_incident_circuit.sql'), 'utf8').replace(/--.*$/gm, '')
  const fn = (nom) => { const m = new RegExp('create or replace function public\\.' + nom + '\\(([\\s\\S]*?)\\n\\$\\$;', 'm').exec(sql); return m ? m[0] : '' }
  it('M-1 RLS activée ET forcée sur les 5 tables nouvelles ; empreintes et ouvertures illisibles', () => {
    for (const t of ['artisans', 'artisan_acces', 'artisan_acces_jeton', 'artisan_depots', 'artisan_ouvertures']) {
      expect(sql).toMatch(new RegExp('alter table public\\.' + t + '\\s+enable row level security'))
      expect(sql).toMatch(new RegExp('alter table public\\.' + t + '\\s+force\\s+row level security'))
    }
    expect(sql).toMatch(/artisan_acces_jeton_aucune[^;]*using \(false\)/)
    expect(sql).toMatch(/artisan_ouvertures_aucune[^;]*using \(false\)/)
  })
  it('M-2 aucune écriture directe sur les liens et les dépôts : lecture seule pour les connectés', () => {
    expect(sql).toMatch(/revoke all on public\.artisan_acces, public\.artisan_acces_jeton, public\.artisan_depots, public\.artisan_ouvertures from anon, authenticated;/)
    expect(sql).toMatch(/grant select on public\.artisan_acces, public\.artisan_depots to authenticated;/)
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*artisan_(acces|depots)/)
  })
  it('M-3 chaque fonction côté artisan passe par _ar_acces (identité du relais exigée)', () => {
    expect(fn('_ar_acces')).toMatch(/if not public\._el_relais_ok\(\) then raise exception/)
    for (const f of ['ar_ouvrir', 'ar_fichier', 'ar_depot', 'ar_depot_fin', 'ar_document', 'ar_creneau', 'ar_constat', 'ar_ia_autorise']) {
      expect(fn(f), f).toMatch(/a := public\._ar_acces\(p_jeton_sha256, p_ip_hash\);\s*\n\s*if a\.id is null/)
    }
  })
  it('M-4 lien inactif : révoqué, expiré (validation + 30 j, émission + 90 j), incident supprimé', () => {
    expect(fn('_ar_fin')).toMatch(/least\(p_emis \+ interval '90 days', coalesce\(p_valide \+ interval '30 days'/)
    expect(fn('_ar_acces')).toMatch(/x\.revoque_le is null and now\(\) < public\._ar_fin\(x\.emis_le, x\.valide_le\)/)
    expect(fn('_ar_acces')).toMatch(/i\.deleted_at is null/)
  })
  it('M-5 émission : rattachements lus sur la ligne incident, droit d\'écriture exigé, photos bornées à la SCI', () => {
    const e = fn('ar_acces_emettre')
    expect(e).toMatch(/from public\.incidents x where x\.espace_id = p_espace_id and x\.legacy_id = p_incident_legacy_id and x\.deleted_at is null/)
    expect(e).toMatch(/has_entite_write_all\(i\.espace_id, i\.entite_id, i\.logement_id, i\.immeuble_id\)/)
    expect(e).toMatch(/_ar_photos_valides\(p_demande->'photos'/)
  })
  it('M-6 plafond : le statut d\'un devis est décidé par la base (cumul ≤ plafond > 0, aucun refus, incident non résolu)', () => {
    const d = fn('ar_document')
    expect(d).toMatch(/when a\.plafond_ttc > 0 and not public\._ar_resolu\(a\)/)
    expect(d).toMatch(/dr\.statut = 'refuse'/)
    expect(d).toMatch(/p_montant_ttc \+ coalesce\(\(select sum\(dd\.montant_ttc\)[\s\S]*statut in \('auto_accepte', 'accepte'\)\), 0\) <= a\.plafond_ttc/)
    expect(d).toMatch(/p_type = 'devis' and a\.valide_le is not null then raise exception 'el:ferme'/)
    expect(fn('ar_devis_decider')).toMatch(/d\.statut <> 'en_attente'/)
    expect(fn('ar_devis_decider')).toMatch(/where id = d\.id and statut = 'en_attente'/)
  })
  it('M-7 page artisan : les chemins des photos ne sortent pas (rang et nom seulement)', () => {
    expect(fn('ar_ouvrir')).toMatch(/\(a\.demande - 'photos'\)/)
    expect(fn('ar_ouvrir')).not.toMatch(/artisan_email|artisan_tel|incident_legacy_id/)
  })
  it('M-8 locataire : accord exprès un samedi ou un dimanche ; résultat seulement après publication ; téléphone seulement avec accord', () => {
    expect(fn('el_creneau_confirmer')).toMatch(/extract\(isodow from x\.creneau_date\) in \(6, 7\) and not coalesce\(p_accord_expres, false\)/)
    expect(fn('el_signalements')).toMatch(/'resultat', case when s\.resultat_publie_le is not null then s\.resultat end/)
    expect(fn('el_signaler')).toMatch(/case when coalesce\(p_tel_partage, false\) then nullif/)
    expect(sql).toMatch(/drop function if exists public\.el_signaler\(text, text, text, text, text, text, jsonb\);/)
    expect(sql).toMatch(/grant update \(resultat, resultat_publie_le\) on public\.locataire_signalements to authenticated;/)
  })
  it('M-9 stockage : le relais lit et dépose seulement les chemins ouverts par ar_*', () => {
    expect(fn('ar_objet_ouvert')).toMatch(/public\._el_relais_ok\(\) and exists/)
    expect(sql).toMatch(/for insert to authenticated\s+with check \( bucket_id = 'espace-files' and public\.ar_objet_ouvert\(name, 'depot'\) \)/)
  })
})
