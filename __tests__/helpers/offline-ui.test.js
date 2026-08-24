/**
 * __tests__/helpers/offline-ui.test.js — chantier EDL TERRAIN, lot 4.
 *
 * La moitié ÉCRAN du hors ligne, celle qui vit dans index.html : le bandeau
 * daté (invariant 19c), les onglets fermés (19b), et surtout la règle qui les
 * gouverne tous — « aucune action nécessitant le réseau n'est cliquable sans
 * afficher sa raison » (invariant 19).
 *
 * Ce fichier n'inspecte AUCUN extrait de source. Il extrait le bloc hors ligne
 * d'index.html, l'EXÉCUTE contre un DOM de laboratoire, et regarde ce qui a été
 * fait : quelles classes posées, quel titre, quel message affiché, quelle
 * navigation refusée. Les verdicts (quel onglet est ouvert) viennent du VRAI
 * module js/core/offline-boot.js — pas d'un simulacre : c'est justement la
 * jonction des deux moitiés que ce test doit couvrir.
 *
 * Pas de jsdom dans ce dépôt (vitest.config : environment 'node') : le DOM est
 * réduit à ce que le bloc utilise réellement.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ongletDisponibleHorsLigne, motifOnglet, motifIndisponible, libelleDonneesDu,
} from '../../js/core/offline-boot.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const DEBUT = 'let _hlApi = null;';
const FIN = "// === BASCULE SUPABASE (P3) — points d'injection";

/* ── DOM de laboratoire ──────────────────────────────────────────────────── */

function noeud(tag, attrs = {}) {
  const classes = new Set();
  const n = {
    tagName: tag, id: attrs.id || '', title: '', innerHTML: '',
    _attrs: {}, children: [],
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle: (c, v) => { if (v) classes.add(c); else classes.delete(c); },
    },
    setAttribute: (k, v) => { n._attrs[k] = String(v); },
    getAttribute: k => (k in n._attrs ? n._attrs[k] : null),
    removeAttribute: k => { delete n._attrs[k]; },
    _classes: () => [...classes],
  };
  Object.keys(attrs).forEach(k => { if (k !== 'id') n._attrs[k] = attrs[k]; });
  return n;
}

/** Un item de nav tel que le rend réellement _renderSidebarV4 / _renderBottomNav. */
function itemNav(kind, page) {
  const n = noeud('div');
  if (kind === 'parent') { n._sel = '.v4s-a[data-nav]'; n._attrs['data-nav'] = page; }
  else if (kind === 'enfant') { n._sel = '.v4s-child[data-page]'; n._attrs['data-page'] = page; }
  else { n._sel = '.v4-bn[data-page]'; n._attrs['data-page'] = page; }
  return n;
}

function fauxDocument(items) {
  const body = { firstChild: null, _enfants: [] };
  const parIdentifiant = new Map();
  const doc = {
    body: Object.assign(body, {
      insertBefore: (n) => { body._enfants.unshift(n); body.firstChild = n; if (n.id) parIdentifiant.set(n.id, n); },
    }),
    createElement: tag => noeud(tag),
    getElementById: id => (parIdentifiant.has(id) ? parIdentifiant.get(id) : null),
    querySelectorAll: sel => {
      // Le bloc n'émet que trois sélecteurs ; on les reconnaît tels quels.
      if (sel.includes('.v4s-a[data-nav]')) return items.filter(i => i._sel === '.v4s-a[data-nav]');
      return items.filter(i => sel.includes(i._sel));
    },
  };
  return doc;
}

/* ── Montage ─────────────────────────────────────────────────────────────── */

let source;

beforeAll(() => {
  const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  const a = html.indexOf(DEBUT);
  const b = html.indexOf(FIN);
  if (a < 0 || b < 0 || b <= a) throw new Error('bloc hors ligne introuvable dans index.html');
  source = html.slice(a, b);
});

/**
 * Monte le bloc avec un DOM neuf et les VRAIES fonctions du module.
 * `pageCourante` simule `currentPage` de l'app.
 */
function monter({ items = [], pageCourante = 'edl', donneesDu = new Date(2026, 7, 19, 8, 12).getTime() } = {}) {
  const toasts = [];
  const doc = fauxDocument(items);
  const win = {};
  const navigations = [];
  win.go = (page) => { navigations.push(page); return 'alle-a-' + page; };
  const signaturesReelles = [];
  win.openBailSignatureFlow = (ref) => { signaturesReelles.push(ref); return 'signe'; };

  const usine = new Function(
    'window', 'document', 'escHtml', 'showToast', 'currentPage', '_v4SyncBannersHeight', 'console',
    source + '\nreturn { _hlOngletOk, _hlDecorerNav, _hlMotifOnglet };'
  );
  let hauteurRecalculee = 0;
  const interne = usine(
    win, doc,
    s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    (msg, type, dur) => toasts.push({ msg, type, dur }),
    pageCourante,
    () => { hauteurRecalculee++; },
    { warn: () => {} }
  );

  const entrer = () => win.__immoEntrerHorsLigne({
    donneesDu,
    email: 'didier@exemple.fr',
    libelle: libelleDonneesDu(donneesDu),
    ongletDisponible: id => ongletDisponibleHorsLigne(id),
    motifOnglet: id => motifOnglet(id),
    motif: quoi => motifIndisponible(quoi),
  });

  return { win, doc, toasts, navigations, signaturesReelles, entrer, interne, hauteur: () => hauteurRecalculee };
}

/* ── Les tests ───────────────────────────────────────────────────────────── */

describe('le bandeau hors ligne — invariant 19c', () => {
  it('porte la DATE ET L’HEURE des données affichées, pas un « hors ligne » nu', () => {
    const m = monter();
    m.entrer();
    const barre = m.doc.getElementById('hl-bar');
    expect(barre).toBeTruthy();
    expect(barre.innerHTML).toContain('19/08 à 08h12');
  });

  it('dit quoi faire pour que la visite remonte', () => {
    const m = monter();
    m.entrer();
    expect(m.doc.getElementById('hl-bar').innerHTML).toMatch(/wifi/i);
  });

  it('déclare sa hauteur — sinon il recouvrirait le haut de l’app', () => {
    const m = monter();
    m.entrer();
    expect(m.hauteur()).toBeGreaterThan(0);
  });

  it('entrer deux fois ne pose pas deux bandeaux', () => {
    const m = monter();
    m.entrer(); m.entrer();
    expect(m.doc.body._enfants.filter(n => n.id === 'hl-bar')).toHaveLength(1);
  });
});

describe('les onglets fermés — invariants 19, 19b', () => {
  it('LE POINT DUR — un onglet fermé porte SA RAISON, pas seulement un grisé', () => {
    // Griser sans dire pourquoi, c'est ce que le CDC appelle un échec muet.
    const fin = itemNav('parent', 'finances');
    const m = monter({ items: [fin] });
    m.entrer();
    expect(fin._classes()).toContain('hl-off');
    expect(fin.getAttribute('aria-disabled')).toBe('true');
    expect(fin.title).toMatch(/imports bancaires/);
    expect(fin.title).toMatch(/donnée fausse/);
  });

  it('ce qui se constate debout reste ouvert, et non marqué', () => {
    const items = ['edl', 'biens', 'baux'].map(p => itemNav('parent', p));
    const m = monter({ items });
    m.entrer();
    items.forEach(n => {
      expect(n._classes()).not.toContain('hl-off');
      expect(n.getAttribute('aria-disabled')).toBeNull();
    });
  });

  it('LES FICHES 360 restent ouvertes — c’est là que vivent le locataire et l’adresse', () => {
    // Ouvrir « Logements » en fermant la fiche du logement rendrait l'onglet
    // inutile sur le terrain. Régression cherchée : la liste du module a
    // d'abord été écrite sans ces pages, qui existent pourtant dans l'app.
    for (const p of ['log-fiche', 'imm-fiche', 'ent-fiche']) {
      const n = itemNav('enfant', p);
      const m = monter({ items: [n] });
      m.entrer();
      expect(n._classes()).not.toContain('hl-off');
    }
  });

  it('les trois surfaces de navigation sont marquées, pas seulement la sidebar', () => {
    // Sur téléphone, c'est la nav du BAS qu'on touche : l'oublier laisserait
    // un bouton actif pour ne rien faire, exactement là où on est en visite.
    const parent = itemNav('parent', 'loyers');
    const enfant = itemNav('enfant', 'candidats');
    const bas = itemNav('bas', 'finances');
    const m = monter({ items: [parent, enfant, bas] });
    m.entrer();
    [parent, enfant, bas].forEach(n => expect(n._classes()).toContain('hl-off'));
  });

  it('le bouton « Plus » n’est jamais marqué : il ouvre une feuille, pas une page', () => {
    const plus = itemNav('bas', 'more');
    const m = monter({ items: [plus] });
    m.entrer();
    expect(plus._classes()).not.toContain('hl-off');
  });

  it('la décoration est IDEMPOTENTE : un re-render de la nav ne l’accumule pas', () => {
    const ok = itemNav('parent', 'edl');
    const m = monter({ items: [ok] });
    m.entrer();
    m.interne._hlDecorerNav(); m.interne._hlDecorerNav();
    expect(ok._classes()).not.toContain('hl-off');
    expect(ok._classes().filter(c => c === 'hl-off')).toHaveLength(0);
  });
});

describe('le routeur go() — le refus est ANNONCÉ (invariant 19)', () => {
  it('naviguer vers un onglet fermé est refusé, avec la raison à l’écran', () => {
    const m = monter();
    m.entrer();
    const r = m.win.go('finances');
    expect(r).toBeUndefined();                 // la navigation n'a pas eu lieu
    expect(m.navigations).not.toContain('finances');
    expect(m.toasts).toHaveLength(1);
    expect(m.toasts[0].msg).toMatch(/imports bancaires/);
    expect(m.toasts[0].type).toBe('err');
  });

  it('naviguer vers un onglet ouvert marche exactement comme avant', () => {
    const m = monter();
    m.entrer();
    expect(m.win.go('edl')).toBe('alle-a-edl');
    expect(m.navigations).toContain('edl');
    expect(m.toasts).toHaveLength(0);
  });

  it('le routeur n’est enveloppé QU’UNE FOIS, même si on ré-entre', () => {
    const m = monter();
    m.entrer(); m.entrer();
    m.win.go('finances');
    expect(m.toasts).toHaveLength(1);          // pas deux messages superposés
  });
});

describe('signer un bail hors ligne — invariant 19d, CDC §3.1', () => {
  it('est REFUSÉ, et le message renvoie vers la signature à distance', () => {
    const m = monter();
    m.entrer();
    m.win.openBailSignatureFlow('FERRETTE-101');
    expect(m.signaturesReelles).toHaveLength(0);        // la vraie porte n'a pas été franchie
    expect(m.toasts).toHaveLength(1);
    expect(m.toasts[0].msg).toMatch(/signature à distance/);
    expect(m.toasts[0].msg).toMatch(/retour/);
  });
});

describe('la page d’arrivée — on n’atterrit jamais sur des montants périmés', () => {
  it('rouvrir sur Finances renvoie tout de suite vers les états des lieux', () => {
    // Le miroir rouvre sur la dernière page visitée. Y rester afficherait des
    // montants périmés malgré le bandeau.
    const m = monter({ pageCourante: 'finances' });
    m.entrer();
    expect(m.navigations).toContain('edl');
  });

  it('rouvrir sur un onglet ouvert n’impose aucune navigation', () => {
    const m = monter({ pageCourante: 'biens' });
    m.entrer();
    expect(m.navigations).toHaveLength(0);
  });
});

describe('sans le module, on n’invente aucune règle', () => {
  it('un import raté laisse la navigation passer — jamais un faux blocage', () => {
    // Le bandeau, lui, est déjà là pour dire que les données sont datées. Un
    // blocage inventé sans verdict serait pire : l'app deviendrait inutilisable
    // sans que rien ne l'explique.
    const m = monter();
    m.win.__immoEntrerHorsLigne({ donneesDu: 0 });      // aucune fonction passée
    expect(m.win.go('finances')).toBe('alle-a-finances');
    expect(m.toasts).toHaveLength(0);
  });
});
