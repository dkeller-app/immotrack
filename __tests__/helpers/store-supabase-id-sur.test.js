// Avant bêta — l'identifiant applicatif d'un enregistrement vient de `legacy_raw`, réécrivable par tout
// membre en écriture via l'API. Il est ensuite interpolé dans des gestionnaires `on…` et des attributs
// (`openEditMv(${m.id})`, `data-doc="…"`). Un identifiant qui n'a pas la forme d'un identifiant généré par
// l'app (nombre, ou jeton [A-Za-z0-9_.:@|-]) n'est donc PAS chargé : la ligne reste intacte côté serveur,
// elle n'atteint simplement jamais le DOM.
import { describe, it, expect, vi } from 'vitest'
import { createSupabaseStore, idEnregistrementSur } from '../../js/core/store-supabase.js'

const backend = (tables) => ({
  fetchTable: async (name) => (tables[name] || []).map(lr => ({ legacy_raw: lr })),
  fetchConfig: async () => ({}),
})

describe('idEnregistrementSur', () => {
  it('accepte les formes produites par l\'app', () => {
    for (const v of [1726000000000, 1726000000000.123, 0, 'cand_lx3k9a', 'ev_1726_ab', 'bj_av_3', 'em_1_x9', 'f12', 'a.b:c@d|e-f', undefined, null]) {
      expect(idEnregistrementSur(v)).toBe(true)
    }
  })
  it('refuse ce qui peut sortir d\'un attribut ou d\'une chaîne JS', () => {
    for (const v of ['"><img src=x onerror=1>', "x');alert(1);//", 'a b', 'a&quot;b', '<', 'x`', 'a\\b', '', 'x'.repeat(201), NaN, Infinity, {}, [], true]) {
      expect(idEnregistrementSur(v)).toBe(false)
    }
  })
})

describe('hydrate — identifiants piégés écartés', () => {
  it('un enregistrement à identifiant piégé n\'est pas chargé, les autres le sont', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = createSupabaseStore(backend({
      mouvements: [{ id: 100, lib: 'Loyer' }, { id: '"><img src=x onerror=alert(1)>', lib: 'piège' }],
      documents: [{ id: 7, name: 'a.pdf' }, { id: "1');alert(1);//", name: 'b.pdf' }],
      agenda: [{ id: 'ev_1', titre: 'RDV' }],
      logements: [{ ref: 'F-1' }],   // pas d'id : inchangé
    }))
    const db = await s.hydrate()
    expect(db.mouvements.map(m => m.id)).toEqual([100])
    expect(db.documents.map(d => d.id)).toEqual([7])
    expect(db.agenda.map(e => e.id)).toEqual(['ev_1'])
    expect(db.logements).toEqual([{ ref: 'F-1' }])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
