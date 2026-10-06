// BAIL-EN-COURS-MODIFIER-PERIODES — étape 5 : l'UI de l'historique (js/app/app-part2.js) exécutée telle quelle.
// Les fonctions _histoPer* / _histoBailPeriodeHtml / _histoBailEventHtml sont extraites par nom du VRAI code et évaluées dans un
// vm avec un mini-DOM : mode sélection (puces, barre, bouton), fenêtre « Modifier la période », encart d'alerte NON bloquant,
// patch envoyé à l'API (jamais un zéro pour un champ vide), cartes des éditions, échappements.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')
function extraire(src, nom) {
  const i = src.indexOf(`function ${nom}(`)
  if (i < 0) throw new Error('fonction introuvable : ' + nom)
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1)
  }
  throw new Error('accolades non équilibrées : ' + nom)
}
const constante = (nom) => { const i = P2.indexOf(`const ${nom} = {`); const j = P2.indexOf('\n};', i); return P2.slice(i, j + 3) }

// ── mini-DOM : juste ce que lisent les fonctions testées
class Noeud {
  constructor(id, cls = '') { this.id = id; this.classes = new Set(cls.split(' ').filter(Boolean)); this.attrs = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.value = ''; this.textContent = ''; this.innerHTML = ''; this.min = ''; this.max = ''; this.enfants = [] }
  get classList() { const c = this.classes; return { toggle: (n, on) => { if (on === undefined ? !c.has(n) : on) c.add(n); else c.delete(n) }, contains: (n) => c.has(n) } }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  removeAttribute(k) { delete this.attrs[k] }
  getAttribute(k) { return this.attrs[k] }
  querySelectorAll() { return this.enfants }
  focus() {}
}
function monde(over = {}) {
  const noeuds = {}
  const n = (id, cls) => (noeuds[id] = new Noeud(id, cls))
  const sec = n('hl-histo'), bar = n('hl-selbar'), ok = n('hl-selbar-ok'), btn = n('hl-btn-modifier')
  bar.hidden = true; ok.disabled = true
  for (const id of ['hper-titre', 'hper-sub', 'hper-debut', 'hper-hc', 'hper-ch', 'hper-fin', 'hper-motif', 'hper-debut-aide', 'hper-fin-wrap', 'hper-bandeau', 'hper-alerte', 'hper-champs', 'hper-suppr-q', 'hper-b-del', 'hper-b-fermer', 'hper-b-ok', 'hper-b-retour', 'hper-b-confirm']) n(id)
  const appels = { modifier: [], supprimer: [], ajouter: [], toasts: [], ouverts: [], fermes: [], refresh: 0 }
  const sb = {
    String, Number, Object, Array, Math, Date, JSON, RegExp, setTimeout, clearTimeout, console,
    document: { getElementById: (id) => noeuds[id] || null },
    el: (id) => noeuds[id] || null,
    v: (id) => (noeuds[id] ? noeuds[id].value : ''),
    fmt: (x) => (x == null ? '–' : x.toFixed(2).replace('.', ',') + ' €'),
    fd: (iso) => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '–'),
    escHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    _lyQ: (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    _uiIcon: (n) => `<i class="uic ${n}"></i>`,
    _logLabel: (r) => 'Logement ' + r,
    _hlNbMois: () => 3, _hlNbQuittances: () => 0,
    openM: (id) => appels.ouverts.push(id), closeM: (id) => appels.fermes.push(id),
    showToast: (m, t) => appels.toasts.push([t, m]),
    rLogFiche: () => { appels.refresh++ },
    DB: { irlHistorique: [] },
    window: {
      _bailPeriodeModifier: (...a) => { appels.modifier.push(a); return over.res || { ok: true, change: true, impact: { mois: [] }, avertissements: [] } },
      _bailPeriodeSupprimer: (...a) => { appels.supprimer.push(a); return over.res || { ok: true, change: true, impact: { mois: [] }, avertissements: [] } },
      _bailPeriodeAjouter: (...a) => { appels.ajouter.push(a); return over.res || { ok: true, change: true, impact: { mois: [] }, avertissements: [] } }
    }
  }
  vm.createContext(sb)
  vm.runInContext([
    'let _histoPerListe = [], _histoPerMode = null, _histoPerCtx = null, _histoPerTimer = null;',
    constante('_HISTO_PER_RAISONS'), constante('_HISTO_PER_AVERTS'),
    ...['_histoPerMoisLong', '_histoPerDeMois', '_histoPerSigne', '_histoPerModeOuvrir', '_histoPerModeFermer', '_histoPerMajMode', '_histoPerChoisir', '_histoPerModifierSel',
      '_histoPerAjouter', '_histoPerBandeau', '_histoPerOuvrir', '_histoPerVue', '_histoPerSupprimerDemande', '_histoPerSupprimerRetour', '_histoPerLire', '_histoPerPatch',
      '_histoPerRecalc', '_histoPerSimuler', '_histoPerAlerteHtml', '_histoPerEnregistrer', '_histoPerSupprimerConfirme', '_histoPerFinir', '_histoBailPeriodeHtml', '_histoBailEventHtml']
      .map((f) => extraire(P2, f))
  ].join('\n'), sb)
  return { sb, noeuds, appels }
}

const cle = (debut) => ({ ref: 'D-101', bailDebut: '2023-09-01', debut })
const periode = (o) => ({ debut: '2026-09-01', fin: null, hc: 640, ch: 80, total: 720, source: 'manuel', note: 'Accord', future: false, courante: true,
  cle: cle(o && o.debut || '2026-09-01'), premiere: false, chapitre: '2023-09-01', droits: { date: true, hc: true, ch: true, supprimer: true }, ...o })

describe('rendu des périodes : sélection par index, jamais la clé dans un onclick', () => {
  it('chaque pastille porte data-pidx, role radio, la puce ; le tableau est rempli dans l\'ordre du rendu', () => {
    const { sb } = monde()
    const h = sb._histoBailPeriodeHtml(periode({}), 'D-101', { statut: 'courant' })
    expect(h).toContain('data-pidx="0"'); expect(h).toContain('role="radio"'); expect(h).toContain('class="hl-pick"')
    expect(h).toContain('_histoPerChoisir(0)')
    sb._histoBailPeriodeHtml(periode({ debut: '2023-09-01' }), 'D-101', { statut: 'clos' })
    expect(vm.runInContext('_histoPerListe.map(e => [e.p.debut, e.clos])', sb)).toEqual([['2026-09-01', false], ['2023-09-01', true]])
  })
  it('un ref piégé ou une note HTML ne s\'exécutent jamais (échappement) et la clé n\'est pas dans le HTML', () => {
    const { sb } = monde()
    const h = sb._histoBailPeriodeHtml(periode({ future: true, courante: false, note: '<img src=x onerror=alert(1)>' }), "D'-1\"><script>", { statut: 'courant' })
    expect(h).not.toContain('<img'); expect(h).not.toContain('<script')
    expect(h).not.toContain('bailDebut')
  })
})

describe('mode sélection', () => {
  it('Modifier → barre visible, puces actives ; Modifier de la barre désactivé tant que rien n\'est choisi ; Annuler restaure', () => {
    const { sb, noeuds } = monde()
    const p1 = new Noeud('', 'hl-period'); p1.dataset.pidx = '0'; const p2 = new Noeud('', 'hl-period'); p2.dataset.pidx = '1'
    noeuds['hl-histo'].enfants = [p1, p2]
    vm.runInContext("_histoPerListe = [{ref:'D-101', p:" + JSON.stringify(periode({})) + "}, {ref:'D-101', p:" + JSON.stringify(periode({ debut: '2023-09-01', premiere: true })) + '}]', sb)
    sb._histoPerModeOuvrir('D-101')
    expect(noeuds['hl-histo'].classes.has('hl-selmode')).toBe(true)
    expect(noeuds['hl-selbar'].hidden).toBe(false)
    expect(noeuds['hl-selbar-ok'].disabled).toBe(true)
    expect(p1.attrs.tabindex).toBe('0')
    sb._histoPerChoisir(1)
    expect(p2.classes.has('sel')).toBe(true); expect(p1.classes.has('sel')).toBe(false)
    expect(p2.attrs['aria-checked']).toBe('true'); expect(noeuds['hl-selbar-ok'].disabled).toBe(false)
    sb._histoPerChoisir(0)
    expect(p1.classes.has('sel')).toBe(true); expect(p2.classes.has('sel')).toBe(false)
    sb._histoPerModeFermer()
    expect(noeuds['hl-histo'].classes.has('hl-selmode')).toBe(false)
    expect(noeuds['hl-selbar'].hidden).toBe(true)
    expect(p1.attrs.tabindex).toBeUndefined(); expect(p1.classes.has('sel')).toBe(false)
  })
  it('hors du mode, un clic sur une pastille ne fait rien', () => {
    const { sb } = monde()
    vm.runInContext("_histoPerListe = [{ref:'D-101', p:{}}]", sb)
    sb._histoPerChoisir(0)
    expect(vm.runInContext('_histoPerMode', sb)).toBeNull()
  })
})

describe('fenêtre « Modifier la période »', () => {
  const ouvrir = (p, over) => {
    const m = monde(over)
    vm.runInContext('_histoPerListe = [{ref:"D-101", clos:false, p:' + JSON.stringify(p) + '}]', m.sb)
    m.sb._histoPerOuvrir('modifier', 'D-101', vm.runInContext('_histoPerListe[0]', m.sb))
    return m
  }
  it('titre, champs préremplis, bornes de saisie ; période normale : tout est saisissable, suppression offerte', () => {
    const { noeuds, appels } = ouvrir(periode({ fin: '2027-02-28' }))
    expect(noeuds['hper-titre'].textContent).toBe('Modifier la période du 01/09/2026')
    expect([noeuds['hper-debut'].value, noeuds['hper-hc'].value, noeuds['hper-ch'].value]).toEqual(['2026-09-01', 640, 80])
    expect([noeuds['hper-debut'].min, noeuds['hper-debut'].max]).toEqual(['2023-09-01', '2027-02-28'])
    expect(noeuds['hper-debut'].disabled).toBe(false); expect(noeuds['hper-b-del'].hidden).toBe(false)
    expect(appels.ouverts).toEqual(['ov-histo-corr'])
  })
  it('1re période : la date est grisée avec l\'explication « Modifier le bail »', () => {
    const { noeuds } = ouvrir(periode({ debut: '2023-09-01', premiere: true, droits: { date: false, hc: true, ch: true, supprimer: true } }))
    expect(noeuds['hper-debut'].disabled).toBe(true)
    expect(noeuds['hper-debut-aide'].innerHTML).toContain('celle du bail'); expect(noeuds['hper-debut-aide'].innerHTML).toContain('openBail')
  })
  it('période issue d\'une révision IRL : date et loyer grisés, charges libres, pas de suppression, gestes IRL proposés', () => {
    const m = monde()
    m.sb.DB.irlHistorique = [{ ref: 'D-101', date: '2026-10-01', dateRevision: '2027-03-01', dateEffet: '2027-03-01', ancienHC: 640, nouveauHC: 660 }]
    const p = periode({ debut: '2027-03-01', source: 'irl', future: true, courante: false, droits: { date: false, hc: false, ch: true, supprimer: false } })
    vm.runInContext('_histoPerListe = [{ref:"D-101", clos:false, p:' + JSON.stringify(p) + '}]', m.sb)
    m.sb._histoPerOuvrir('modifier', 'D-101', vm.runInContext('_histoPerListe[0]', m.sb))
    const n = m.noeuds
    expect([n['hper-debut'].disabled, n['hper-hc'].disabled, n['hper-ch'].disabled, n['hper-b-del'].hidden]).toEqual([true, true, false, true])
    expect(n['hper-bandeau'].innerHTML).toContain('_histoIrlCorrOpen'); expect(n['hper-bandeau'].innerHTML).toContain('_irlAnnulerProgrammee')
  })
  it('bail clos : le bandeau le dit', () => {
    const m = monde()
    vm.runInContext('_histoPerListe = [{ref:"D-101", clos:true, p:' + JSON.stringify(periode({})) + '}]', m.sb)
    m.sb._histoPerOuvrir('modifier', 'D-101', vm.runInContext('_histoPerListe[0]', m.sb))
    expect(m.noeuds['hper-bandeau'].innerHTML).toContain('clos')
  })
  it('Enregistrer : le patch ne contient que ce qui est saisi ET saisissable (un champ vide n\'est jamais un zéro)', () => {
    const { sb, noeuds, appels } = ouvrir(periode({}))
    noeuds['hper-debut'].value = '2026-10-01'; noeuds['hper-hc'].value = ''; noeuds['hper-ch'].value = '90'; noeuds['hper-motif'].value = '  Accord décalé '
    sb._histoPerEnregistrer()
    const reels = appels.modifier.filter((a) => !a[4].simuler)       // (les appels simuler:true sont l'alerte)
    expect(reels).toHaveLength(1)
    const [ref, k, patch, motif, opts] = reels[0]
    expect(ref).toBe('D-101'); expect(k).toEqual(cle('2026-09-01'))
    expect(patch).toEqual({ debut: '2026-10-01', ch: '90' })
    expect(motif).toBe('Accord décalé'); expect(opts).toEqual({})
    expect(appels.fermes).toContain('ov-histo-corr'); expect(appels.refresh).toBe(1)
    expect(appels.toasts.at(-1)).toEqual(['ok', 'Période modifiée'])
  })
  it('un champ « Charges » vidé n\'est pas envoyé non plus (jamais un zéro silencieux)', () => {
    const { sb, noeuds, appels } = ouvrir(periode({}))
    noeuds['hper-hc'].value = '700'; noeuds['hper-ch'].value = ''
    sb._histoPerEnregistrer()
    expect(appels.modifier.filter((a) => !a[4].simuler)[0][2]).toEqual({ debut: '2026-09-01', hc: '700' })
  })
  it('période IRL : même si le champ est rempli, date et loyer ne partent pas dans le patch', () => {
    const { sb, noeuds, appels } = ouvrir(periode({ source: 'irl', droits: { date: false, hc: false, ch: true, supprimer: false } }))
    noeuds['hper-debut'].value = '2027-04-01'; noeuds['hper-hc'].value = '999'; noeuds['hper-ch'].value = '95'
    sb._histoPerEnregistrer()
    expect(appels.modifier.filter((a) => !a[4].simuler)[0][2]).toEqual({ ch: '95' })
  })
  it('Supprimer : une confirmation avec son propre encart ; Retour revient à la saisie ; Confirmer appelle l\'API de suppression', () => {
    const { sb, noeuds, appels } = ouvrir(periode({}))
    sb._histoPerSupprimerDemande()
    expect(noeuds['hper-champs'].hidden).toBe(true); expect(noeuds['hper-suppr-q'].hidden).toBe(false)
    expect(noeuds['hper-suppr-q'].innerHTML).toContain('720,00 €')
    expect(noeuds['hper-b-confirm'].hidden).toBe(false); expect(noeuds['hper-b-ok'].hidden).toBe(true)
    expect(appels.supprimer.at(-1)[3]).toEqual({ simuler: true })       // l'alerte est une SIMULATION
    sb._histoPerSupprimerRetour()
    expect(noeuds['hper-champs'].hidden).toBe(false); expect(noeuds['hper-b-confirm'].hidden).toBe(true)
    sb._histoPerSupprimerDemande(); noeuds['hper-motif'].value = 'doublon'
    sb._histoPerSupprimerConfirme()
    expect(appels.supprimer.filter((a) => !a[3].simuler).at(-1)).toEqual(['D-101', cle('2026-09-01'), 'doublon', {}])
    expect(appels.toasts.at(-1)).toEqual(['ok', 'Période supprimée'])
  })
  it('l\'alerte est recalculée en simulation à chaque saisie, seul l\'encart est réécrit', () => {
    const { sb, noeuds, appels } = ouvrir(periode({}))
    const avant = appels.modifier.length
    noeuds['hper-debut'].value = '2026-10-01'
    sb._histoPerRecalc(true)
    expect(appels.modifier.length).toBe(avant + 1)
    expect(appels.modifier.at(-1)[4]).toEqual({ simuler: true })
    expect(noeuds['hper-titre'].textContent).toBe('Modifier la période du 01/09/2026')      // la fenêtre n'est pas re-rendue
  })
})

describe('ajout', () => {
  it('« Ajouter une période » : même fenêtre, vide, avec le « jusqu\'au » ; date et loyer requis ; appelle l\'API d\'ajout', () => {
    const { sb, noeuds, appels } = monde()
    sb._histoPerAjouter('D-101')
    expect(noeuds['hper-titre'].textContent).toBe('Ajouter une période')
    expect(noeuds['hper-fin-wrap'].hidden).toBe(false); expect(noeuds['hper-b-del'].hidden).toBe(true)
    sb._histoPerEnregistrer()
    expect(appels.ajouter).toHaveLength(0); expect(appels.toasts.at(-1)[0]).toBe('err')
    noeuds['hper-debut'].value = '2027-01-01'; noeuds['hper-hc'].value = '500'; noeuds['hper-ch'].value = ''; noeuds['hper-fin'].value = '2027-03-31'; noeuds['hper-motif'].value = 'Remise'
    sb._histoPerEnregistrer()
    expect(appels.ajouter.at(-1)).toEqual(['D-101', { debut: '2027-01-01', fin: '2027-03-31', hc: '500', ch: '' }, 'Remise', {}])
    expect(appels.toasts.at(-1)).toEqual(['ok', 'Période ajoutée'])
  })
})

describe('l\'encart d\'alerte — jamais bloquant', () => {
  const ctx = (sb) => vm.runInContext('({mode:"modifier", vue:"edit", entree:{p:' + JSON.stringify(periode({ fin: '2027-02-28' })) + '}})', sb)
  const mois = (ym, a, b, o) => ({ ym, avant: { total: a }, apres: { total: b }, delta: b - a, ...o })
  it('CAS DE LA MAQUETTE : « le dû de septembre 2026 repasse de 720,00 € à 680,00 € » + « Tu peux enregistrer quand même »', () => {
    const { sb, noeuds } = monde()
    noeuds['hper-debut'].value = '2026-10-01'
    const h = sb._histoPerAlerteHtml({ ok: true, change: true, impact: { mois: [mois('2026-09', 720, 680)], futur: null, tropPercu: 0, resteSupp: 0, deltaTotal: -40 }, avertissements: [] }, ctx(sb))
    const t = h.replace(/<[^>]+>/g, '')
    expect(t).toContain('Le dû de septembre 2026 repasse de 720,00 € à 680,00 €.')
    expect(t).toContain('Tu peux enregistrer quand même.')
    expect(h).not.toContain('class="hper-alerte err"')
  })
  it('élision (« d\'octobre »), hausse (« passe »), trop-perçu, quittance émise non modifiée, avenir, agrégat au-delà de 3 mois', () => {
    const { sb, noeuds } = monde()
    noeuds['hper-debut'].value = '2026-10-01'
    const t = (r) => sb._histoPerAlerteHtml(r, ctx(sb)).replace(/<[^>]+>/g, '').replace(/&#39;/g, "'")
    const un = t({ ok: true, change: true, avertissements: [], impact: { mois: [mois('2026-10', 700, 730, { quittance: { total: 700 } })], futur: { des: '2026-11-01', avant: { total: 700 }, apres: { total: 730 }, ouvert: true, nbMois: 5 }, tropPercu: 40, resteSupp: 30 } })
    expect(un).toContain("Le dû d'octobre 2026 passe de 700,00 € à 730,00 €.")
    expect(un).toContain('À partir du 01/11/2026')
    expect(un).toContain('40,00 € déjà encaissés en trop'); expect(un).toContain('trop-perçu')
    expect(un).toContain("La quittance d'octobre 2026 a été émise à 700,00 € : elle n'est pas modifiée")
    expect(un).toContain('30,00 € de plus à encaisser')
    const six = t({ ok: true, change: true, avertissements: [], impact: { mois: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map((m) => mois(m, 700, 660)), futur: null, tropPercu: 0, resteSupp: 0, deltaTotal: -240 } })
    expect(six).toContain('6 mois changent, de janvier 2026 à juin 2026 : −240,00 € au total.')
  })
  it('les avertissements du module sont dits (1re période, IRL, 1re supprimée…) ; une date hors 1er du mois reçoit un conseil', () => {
    const { sb, noeuds } = monde()
    noeuds['hper-debut'].value = '2026-10-15'
    const t = sb._histoPerAlerteHtml({ ok: true, change: true, impact: { mois: [], futur: null }, avertissements: ['premiere-periode-date', 'irl-geste-dedie', 'absorbe-irl', 'trou-preexistant', 'seule-periode'], avant: { hc: 600, ch: 80 } }, ctx(sb)).replace(/<[^>]+>/g, '')
    for (const mot of ['celle du bail', 'gestes IRL', 'révision IRL', 'trou', 'seule période', '1er du mois']) expect(t).toContain(mot)
    const s = sb._histoPerAlerteHtml({ ok: true, change: true, impact: { mois: [], futur: null }, avertissements: ['premiere-periode-supprimee'], avant: { hc: 600, ch: 80 } }, ctx(sb)).replace(/<[^>]+>/g, '')
    expect(s).toContain('Le loyer initial du bail était de 680,00 €')
  })
  it('une entrée inexploitable est EXPLIQUÉE (jamais un refus muet) : après la fin, avant le bail, aucun bail…', () => {
    const { sb } = monde()
    const c = ctx(sb)
    const h = (raison, extra) => sb._histoPerAlerteHtml({ ok: false, raison, ...(extra || {}) }, c).replace(/<[^>]+>/g, '')
    expect(h('date-apres-fin')).toContain('après la fin de la période (28/02/2027)'); expect(h('date-apres-fin')).toContain('Supprimer cette période')
    expect(h('avant-bail', { bailDebut: '2023-09-01' })).toContain('précède le début du bail (01/09/2023)')
    expect(h('aucun-bail')).toContain('Aucun bail')
    expect(sb._histoPerAlerteHtml({ ok: false, raison: 'date-apres-fin' }, c)).toContain('hper-alerte err')
  })
  it('Enregistrer sur une entrée refusée : la raison est dite en toast, la fenêtre reste ouverte (« introuvable » : fermée + rechargée)', () => {
    const { sb, noeuds, appels } = monde({ res: { ok: false, raison: 'date-apres-fin' } })
    vm.runInContext('_histoPerListe = [{ref:"D-101", clos:false, p:' + JSON.stringify(periode({ fin: '2027-02-28' })) + '}]', sb)
    sb._histoPerOuvrir('modifier', 'D-101', vm.runInContext('_histoPerListe[0]', sb))
    noeuds['hper-debut'].value = '2027-06-01'
    sb._histoPerEnregistrer()
    expect(appels.toasts.at(-1)[0]).toBe('err'); expect(appels.toasts.at(-1)[1]).toContain('après la fin')
    expect(appels.fermes).not.toContain('ov-histo-corr')
    const m2 = monde({ res: { ok: false, raison: 'introuvable' } })
    vm.runInContext('_histoPerListe = [{ref:"D-101", clos:false, p:' + JSON.stringify(periode({})) + '}]', m2.sb)
    m2.sb._histoPerOuvrir('modifier', 'D-101', vm.runInContext('_histoPerListe[0]', m2.sb))
    m2.sb._histoPerEnregistrer()
    expect(m2.appels.fermes).toContain('ov-histo-corr'); expect(m2.appels.refresh).toBe(1)
  })
})

describe('cartes de la timeline', () => {
  const carte = (ev) => monde().sb._histoBailEventHtml(ev, { statut: 'courant', bail: {} }, 'D-101', null)
  it('modifiée : avant → après, motif et auteur échappés', () => {
    const h = carte({ type: 'periode-modifiee', date: '2026-10-01', le: '2026-10-06', auteur: '<b>Didier</b>', motif: '<script>x</script>',
      avant: { debut: '2026-09-01', hc: 640, ch: 80, total: 720 }, apres: { debut: '2026-10-01', hc: 650, ch: 80, total: 730 } })
    expect(h).toContain('Période modifiée'); expect(h).toContain('date 01/09/2026 → 01/10/2026'); expect(h).toContain('loyer HC 640,00 € → 650,00 €')
    expect(h).toContain('hl-move'); expect(h).not.toContain('<script'); expect(h).not.toContain('<b>Didier')
    const seulDate = carte({ type: 'periode-modifiee', date: '2026-10-01', avant: { debut: '2026-09-01', hc: 640, ch: 80, total: 720 }, apres: { debut: '2026-10-01', hc: 640, ch: 80, total: 720 } })
    expect(seulDate).not.toContain('hl-move')
  })
  it('supprimée et absorbée', () => {
    const s = carte({ type: 'periode-supprimee', date: '2026-09-01', reprise: 'precedente', repriseTarif: { total: 680 }, avant: { debut: '2026-09-01', fin: null, total: 720 }, motif: 'doublon' })
    expect(s).toContain('Période supprimée'); expect(s).toContain('reprennent le tarif de la période précédente (680,00 €)'); expect(s).toContain('Motif : doublon')
    expect(carte({ type: 'periode-supprimee', date: '2023-09-01', reprise: 'suivante', avant: { debut: '2023-09-01', fin: '2026-08-31', total: 680 } })).toContain('de la période suivante')
    const a = carte({ type: 'periode-absorbee', date: '2023-09-01', avant: 680, dateEffet: '2023-09-01' })
    expect(a).toContain('remplacée par la période avancée au'); expect(a).toContain('680,00 €')
  })
})
