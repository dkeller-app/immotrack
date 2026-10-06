/**
 * Tests pour js/components/{toast,modal}.js
 *
 * Mock DOM minimal via globalThis : on simule document.getElementById qui
 * retourne un objet avec classList.add/remove et style.* . Pas de jsdom.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Mock document avant import (les modules ES qui appellent document à l'import
// ne le font pas — c'est seulement à l'invocation, donc on peut mocker ici).
function mockEl(id) {
  return {
    id,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    style: {},
    innerHTML: ''
  };
}

beforeEach(() => {
  globalThis.window = globalThis.window || {};
  globalThis.document = {
    _els: {},
    getElementById(id) {
      if (!this._els[id]) this._els[id] = mockEl(id);
      return this._els[id];
    }
  };
});

// Import APRÈS le beforeEach pour que les modules voient le mock.
const { showToast, placementToast, mesurerEcran, placerToast } = await import('../../js/components/toast.js');
const { openM, closeM, closeBg, confirm2 } = await import('../../js/components/modal.js');

describe('components/modal.js', () => {
  it('openM retire la classe hidden', () => {
    const el = document.getElementById('ov-test');
    el.classList.add('hidden');
    expect(el.classList.contains('hidden')).toBe(true);
    openM('ov-test');
    expect(el.classList.contains('hidden')).toBe(false);
  });

  it('closeM ajoute la classe hidden', () => {
    closeM('ov-test2');
    const el = document.getElementById('ov-test2');
    expect(el.classList.contains('hidden')).toBe(true);
  });

  it('openM / closeM ne crashent pas si id inexistant', () => {
    const oldGetById = document.getElementById;
    document.getElementById = () => null;
    expect(() => openM('inexistant')).not.toThrow();
    expect(() => closeM('inexistant')).not.toThrow();
    document.getElementById = oldGetById;
  });

  it('closeBg ne ferme PLUS rien, même si target = wrapper (clic dehors désactivé — décision user v15.270)', () => {
    const el = document.getElementById('ov-bg');
    el.classList.remove('hidden');
    closeBg({ target: el }, 'ov-bg');
    expect(el.classList.contains('hidden')).toBe(false); // no-op : un clic en dehors ne ferme plus aucune modale
  });

  it('closeBg ne ferme PAS si target ≠ wrapper', () => {
    const el = document.getElementById('ov-bg2');
    el.classList.remove('hidden');
    closeBg({ target: { id: 'autre' } }, 'ov-bg2');
    expect(el.classList.contains('hidden')).toBe(false);
  });

  it('confirm2 délègue à window.confirm', () => {
    let captured = null;
    window.confirm = msg => { captured = msg; return true; };
    expect(confirm2('Sûr ?')).toBe(true);
    expect(captured).toBe('Sûr ?');
  });
});

describe('components/toast.js', () => {
  beforeEach(() => {
    // Reset toast element
    const t = document.getElementById('toast');
    t.innerHTML = '';
    t.style = {};
  });

  it('affiche le message échappé', () => {
    showToast('Hello <script>');
    const t = document.getElementById('toast');
    expect(t.innerHTML).toBe('Hello &lt;script&gt;');
  });

  it('applique la couleur err', () => {
    showToast('Erreur', 'err');
    const t = document.getElementById('toast');
    expect(t.style.color).toBe('var(--red)');
  });

  it('applique la couleur ok', () => {
    showToast('OK', 'ok');
    const t = document.getElementById('toast');
    expect(t.style.color).toBe('var(--grn)');
  });

  it('applique la couleur warn', () => {
    showToast('Attention', 'warn');
    const t = document.getElementById('toast');
    expect(t.style.color).toBe('var(--ora)');
  });

  it('affiche le toast (display flex)', () => {
    showToast('Test');
    const t = document.getElementById('toast');
    expect(t.style.display).toBe('flex');
  });

  it('extraHTML ajouté brut (pas échappé)', () => {
    showToast('Action', '', 2800, '<button id="x">↶</button>');
    const t = document.getElementById('toast');
    expect(t.innerHTML).toBe('Action<button id="x">↶</button>');
  });

  it('no-op si #toast absent', () => {
    const old = document.getElementById;
    document.getElementById = () => null;
    expect(() => showToast('Test')).not.toThrow();
    document.getElementById = old;
  });
});

// Audit stockage lots 2-3 (🟠3) + vérification finale : sur téléphone, le toast passait SOUS la barre du bas
// (sous le z 999 de la barre), puis — premier correctif — PAR-DESSUS le pied collant des pages plein écran
// (Enregistrer, Précédent / Suivant), qu'il cachait et captait. La place est décidée par placementToast
// (pur), à partir de ce que mesurerEcran lit à l'écran, et appliquée par placerToast à chaque showToast.
describe('components/toast.js — où poser le toast sur téléphone', () => {
  const VH = 844;
  describe('placementToast (décision pure)', () => {
    it('PC (≥ 1024 px) : la feuille de style décide (rien ne change)', () => {
      expect(placementToast({ telephone: false, tablette: false, barre: 57, couche: { z: 1001, pied: { haut: 70, bas: 0 } }, zCss: 999 })).toEqual({ bas: null, z: null });
    });
    // TABLETTE (768-1023 px, pilotage 06/10) : le toast (z 999) passait SOUS la page EDL (#ov-edl, 1001).
    it('tablette, page EDL (z 1001) + pied collant en bas : au-dessus de la couche ET du pied', () => {
      expect(placementToast({ tablette: true, basCss: 28, couche: { z: 1001, pied: { haut: 70, bas: 0 } }, zCss: 999, hauteur: 60, vh: 1180 }))
        .toEqual({ bas: 82, z: 1002 });
    });
    it('tablette, couche sans pied ou pied haut : sa place de la feuille de style (bas 28), z au-dessus de la couche', () => {
      expect(placementToast({ tablette: true, basCss: 28, couche: { z: 1001, pied: null }, zCss: 999 })).toEqual({ bas: null, z: 1002 });
      // 28 + 60 + 12 = 100 ≤ 100 px libres sous le pied : le toast tient dessous
      expect(placementToast({ tablette: true, basCss: 28, couche: { z: 1001, pied: { haut: 400, bas: 100 } }, zCss: 999, hauteur: 60, vh: 1180 }))
        .toEqual({ bas: null, z: 1002 });
      expect(placementToast({ tablette: true, basCss: 28, couche: { z: 1001, pied: { haut: 400, bas: 99 } }, zCss: 999, hauteur: 60, vh: 1180 }).bas).toBe(412);
    });
    it('tablette, sans couche : jamais au-dessus de la barre du bas (réservé au téléphone) — la feuille de style décide', () => {
      expect(placementToast({ tablette: true, basCss: 28, barre: 57, zCss: 999 })).toEqual({ bas: null, z: null });
    });
    it('tablette : z-index jamais baissé (page DDT 2147483001), bannière au-dessus prise en compte', () => {
      expect(placementToast({ tablette: true, basCss: 28, couche: { z: 200, pied: null }, zCss: 2147483001 }).z).toBe(2147483001);
      expect(placementToast({ tablette: true, basCss: 28, couche: { z: 1001, pied: null }, zCss: 999, zBanniere: 1500 }).z).toBe(1501);
    });
    it('téléphone, barre du bas affichée : JUSTE au-dessus (12 px), au-dessus de la barre et de la bannière (1600)', () => {
      expect(placementToast({ telephone: true, barre: 57, zCss: 999 })).toEqual({ bas: 69, z: 1600 });
      expect(placementToast({ telephone: true, barre: 91, zCss: 999 }).bas).toBe(103);
    });
    it('téléphone, ni barre ni couche : la feuille de style décide (place et z-index d’avant)', () => {
      expect(placementToast({ telephone: true, barre: 0, zCss: 999 })).toEqual({ bas: null, z: null });
    });
    it('couche plein écran, pied collant en bas : le toast se pose AU-DESSUS du pied, juste au-dessus de la couche', () => {
      // #ov-edl (z 1001), rail Précédent / Suivant de 70 px en bas de l'écran
      expect(placementToast({ telephone: true, barre: 0, couche: { z: 1001, pied: { haut: 70, bas: 0 } }, zCss: 999, hauteur: 131, vh: VH }))
        .toEqual({ bas: 82, z: 1002 });
    });
    it('modale ordinaire (.ov, z 200) : z-index d’avant (999) — jamais baissé sous la feuille de style', () => {
      expect(placementToast({ telephone: true, couche: { z: 200, pied: { haut: 155, bas: 86 } }, zCss: 999, hauteur: 131, vh: VH }))
        .toEqual({ bas: 167, z: 999 });
      expect(placementToast({ telephone: true, couche: { z: 200, pied: null }, zCss: 2147483001 }).z).toBe(2147483001);
      expect(placementToast({ telephone: true, barre: 57, zCss: 2147483001 }).z).toBe(2147483001);
    });
    it('pied HAUT (contenu court) : le toast tient dessous → il reste à sa place (12 px), sans rien recouvrir', () => {
      // pied de ov-loyer-bien mesuré à 297-366 sur 844 : 478 px libres dessous
      expect(placementToast({ telephone: true, couche: { z: 200, pied: { haut: 547, bas: 478 } }, zCss: 999, hauteur: 131, vh: VH }))
        .toEqual({ bas: 12, z: 999 });
      // place juste suffisante : 12 + 131 + 12 = 155
      expect(placementToast({ telephone: true, couche: { z: 200, pied: { haut: 300, bas: 155 } }, zCss: 999, hauteur: 131, vh: VH }).bas).toBe(12);
      expect(placementToast({ telephone: true, couche: { z: 200, pied: { haut: 300, bas: 154 } }, zCss: 999, hauteur: 131, vh: VH }).bas).toBe(312);
    });
    it('pas la place au-dessus non plus : le toast reste DANS l’écran', () => {
      expect(placementToast({ telephone: true, couche: { z: 200, pied: { haut: 760, bas: 100 } }, zCss: 999, hauteur: 131, vh: VH }).bas).toBe(VH - 131 - 12);
    });
    it('bannière « Installer Propryo » affichée (z 1500, aussi par-dessus la page EDL) : le toast passe au-dessus', () => {
      expect(placementToast({ telephone: true, couche: { z: 1001, pied: { haut: 70, bas: 0 } }, zCss: 999, zBanniere: 1500, hauteur: 131, vh: VH }))
        .toEqual({ bas: 82, z: 1501 });
      expect(placementToast({ telephone: true, couche: { z: 200, pied: null }, zCss: 999, zBanniere: 1500 }).z).toBe(1501);
      expect(placementToast({ telephone: true, barre: 57, zCss: 999, zBanniere: 1500 }).z).toBe(1600);
      expect(placementToast({ telephone: true, barre: 0, zCss: 999, zBanniere: 1500 })).toEqual({ bas: null, z: null });   // ni barre ni couche : inchangé
    });
    it('couche sans pied collant : en bas (12 px), au-dessus de la couche ; une couche passe AVANT la barre', () => {
      expect(placementToast({ telephone: true, barre: 57, couche: { z: 1001, pied: null }, zCss: 999 })).toEqual({ bas: 12, z: 1002 });
    });
  });

  // Un écran de laboratoire : nœuds { cls, display, position, z, top, bottom } ; getComputedStyle / getBoundingClientRect.
  function ecran({ telephone = true, tablette = false, barre = null, couches = [], pwa = null } = {}) {
    const noeud = (o) => ({ className: o.cls || '', _o: o, getBoundingClientRect: () => ({ top: o.top || 0, bottom: o.bottom || 0, height: (o.bottom || 0) - (o.top || 0) }) });
    const nCouches = couches.map(c => Object.assign(noeud(c), { _pieds: (c.pieds || []).map(noeud), querySelectorAll() { return this._pieds; } }));
    const nBarre = barre ? noeud(barre) : null;
    const nPwa = pwa ? noeud(pwa) : null;
    const doc = {
      querySelector: (s) => (s === '.v4-bnav' ? nBarre : s === '#pwa-invite' ? nPwa : null),
      querySelectorAll: () => nCouches,
    };
    const win = {
      innerHeight: VH,
      matchMedia: (q) => ({ matches: (q === '(max-width: 767px)' && telephone) || (q === '(max-width: 1023px)' && (telephone || tablette)) }),
      getComputedStyle: (n) => n === TOAST
        ? { zIndex: String(TOAST._z), display: 'flex', bottom: (telephone ? 12 : 28) + 'px' }
        : { display: n._o.display || 'block', visibility: 'visible', position: n._o.position || 'static', zIndex: String(n._o.z == null ? 'auto' : n._o.z) },
    };
    return { doc, win };
  }
  const TOAST = { _z: 999 };
  const toast = () => {
    const props = {};
    return Object.assign(TOAST, {
      props,
      getBoundingClientRect: () => ({ height: 131 }),
      style: {
        setProperty: (k, v, p) => { props[k] = [v, p]; },
        removeProperty: (k) => { delete props[k]; },
      },
    });
  };

  describe('mesurerEcran (ce que l’écran montre)', () => {
    it('barre du bas : sa hauteur réelle, arrondie au-dessus ; masquée → 0', () => {
      expect(mesurerEcran(...Object.values(ecran({ barre: { top: 787.6, bottom: 844 } })))).toMatchObject({ telephone: true, barre: 57, couche: null });
      expect(mesurerEcran(...Object.values(ecran({ barre: { display: 'none', top: 787, bottom: 844 } }))).barre).toBe(0);
      expect(mesurerEcran(...Object.values(ecran({ telephone: false }))).telephone).toBe(false);
      expect(mesurerEcran(...Object.values(ecran({ telephone: false, tablette: true }))).tablette).toBe(true);
      expect(mesurerEcran(...Object.values(ecran({ telephone: false, tablette: false }))).tablette).toBe(false);
      expect(mesurerEcran(...Object.values(ecran({ telephone: true }))).tablette).toBe(false);   // le téléphone n'est pas une tablette
    });
    it('couche du dessus (z le plus haut) et la zone de son pied collant ; pieds masqués, géants ou non collants ignorés', () => {
      const { doc, win } = ecran({ couches: [
        { z: 200, pieds: [{ cls: 'm-foot', top: 689, bottom: 758 }] },
        { z: 1001, pieds: [
          { cls: 'edl-rail', top: 774, bottom: 844 },
          { cls: 'm-foot', display: 'none', top: 0, bottom: 0 },              // pied masqué (rail EDL à la place)
          { cls: 'bc-foot', position: 'static', top: 600, bottom: 640 },       // « *foot* » de contenu, pas collant
          { cls: 'grand-foot', position: 'sticky', top: 100, bottom: 844 },    // plus haut que la moitié de l'écran
        ] },
      ] });
      expect(mesurerEcran(doc, win)).toEqual({ telephone: true, tablette: false, barre: 0, zBanniere: 0, vh: VH, couche: { z: 1001, pied: { haut: 70, bas: 0 } } });
    });
    it('bannière « Installer Propryo » : son z-index si elle est affichée, 0 sinon', () => {
      expect(mesurerEcran(...Object.values(ecran({ pwa: { z: 1500, top: 606, bottom: 768 } }))).zBanniere).toBe(1500);
      expect(mesurerEcran(...Object.values(ecran({ pwa: { z: 1500, display: 'none' } }))).zBanniere).toBe(0);
    });
    it('pied collant qui suit un contenu court (sticky, en haut) : mesuré là où il est', () => {
      const { doc, win } = ecran({ couches: [{ z: 200, pieds: [{ cls: 'an-foot', position: 'sticky', top: 297, bottom: 366 }] }] });
      expect(mesurerEcran(doc, win).couche).toEqual({ z: 200, pied: { haut: 547, bas: 478 } });
    });
  });

  describe('placerToast / showToast (appliqué au vrai #toast)', () => {
    it('barre affichée : bottom et z-index posés en !important (la règle téléphone de la feuille de style dit 12 px !important)', () => {
      const t = toast();
      const { doc, win } = ecran({ barre: { top: 787, bottom: 844 } });
      expect(placerToast(t, doc, win)).toEqual({ bas: 69, z: 1600 });
      expect(t.props).toEqual({ bottom: ['69px', 'important'], 'z-index': ['1600', 'important'] });
    });
    it('page EDL ouverte : au-dessus du rail et de la couche ; puis la couche fermée → les styles en ligne sont RETIRÉS', () => {
      const t = toast();
      const edl = ecran({ couches: [{ z: 1001, pieds: [{ cls: 'edl-rail', top: 774, bottom: 844 }] }] });
      placerToast(t, edl.doc, edl.win);
      expect(t.props).toEqual({ bottom: ['82px', 'important'], 'z-index': ['1002', 'important'] });
      const rien = ecran({});
      expect(placerToast(t, rien.doc, rien.win)).toEqual({ bas: null, z: null });
      expect(t.props).toEqual({});
    });
    it('tablette, page EDL ouverte : au-dessus du rail et de la couche (z 1002) — plus jamais caché dessous', () => {
      const t = toast();
      const { doc, win } = ecran({ telephone: false, tablette: true, couches: [{ z: 1001, pieds: [{ cls: 'edl-rail', top: 774, bottom: 844 }] }] });
      expect(placerToast(t, doc, win)).toEqual({ bas: 82, z: 1002 });
      expect(t.props).toEqual({ bottom: ['82px', 'important'], 'z-index': ['1002', 'important'] });
    });
    it('tablette, barre du bas sans couche : aucun style en ligne (placement au-dessus de la barre réservé au téléphone)', () => {
      const t = toast();
      const { doc, win } = ecran({ telephone: false, tablette: true, barre: { top: 787, bottom: 844 } });
      placerToast(t, doc, win);
      expect(t.props).toEqual({});
    });
    it('PC : aucun style en ligne', () => {
      const t = toast();
      const { doc, win } = ecran({ telephone: false, barre: { top: 787, bottom: 844 }, couches: [{ z: 1001, pieds: [{ cls: 'edl-rail', top: 774, bottom: 844 }] }] });
      placerToast(t, doc, win);
      expect(t.props).toEqual({});
    });
    it('mesure impossible : ne lève jamais', () => {
      expect(placerToast({ style: { removeProperty() { throw new Error('x'); } } }, {}, {})).toBeNull();
    });
    it('showToast place le toast à CHAQUE affichage (la barre et les couches changent)', () => {
      const t = Object.assign(toast(), { innerHTML: '' });
      const docAvant = globalThis.document, winAvant = globalThis.window;
      const a = ecran({ barre: { top: 787, bottom: 844 } });
      globalThis.document = Object.assign({ getElementById: (id) => (id === 'toast' ? t : null) }, a.doc);
      globalThis.window = Object.assign({}, winAvant, a.win);
      try {
        showToast('Un');
        expect(t.props.bottom).toEqual(['69px', 'important']);
        const b = ecran({ couches: [{ z: 1001, pieds: [{ cls: 'edl-rail', top: 774, bottom: 844 }] }] });
        Object.assign(globalThis.document, b.doc);
        Object.assign(globalThis.window, b.win);
        showToast('Deux');
        expect(t.props).toEqual({ bottom: ['82px', 'important'], 'z-index': ['1002', 'important'] });
        expect(t.style.display).toBe('flex');
      } finally { globalThis.document = docAvant; globalThis.window = winAvant; }
    });
  });
});
