/**
 * __tests__/helpers/edl-autosave.test.js — chantier EDL TERRAIN, lot 1.
 *
 * CDC docs/CDC-EDL.md §9 :
 *   1. Un rechargement en pleine saisie ne perd AUCUNE donnée déjà saisie.
 *   3. Un EDL SIGNÉ n'est jamais réécrit par l'autosave, quel que soit le nombre de saisies.
 *   4. L'autosave ne déclenche JAMAIS plus d'une écriture par fenêtre de 2 secondes.
 *
 * Le volume est le volume réel : 110 éléments saisis d'affilée (CDC §0.1).
 */
import { describe, it, expect } from 'vitest';
import { createEdlAutosave, decideAutosave, EDL_AUTOSAVE_DELAY_MS } from '../../js/core/edl-autosave.js';
import { _preserverChampsExistants } from '../../js/core/preserve-fields.js';

/** Horloge + minuteurs simulés : le temps n'avance que quand on le dit. */
function faux() {
  let t = 0;
  const timers = new Map();
  let seq = 0;
  const ecritures = [];
  const api = {
    now: () => t,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    /** Avance l'horloge de `ms`, en déclenchant les minuteurs échus dans l'ordre. */
    avance(ms) {
      const cible = t + ms;
      let garde = 0;
      for (;;) {
        let prochain = null;
        for (const [id, x] of timers) if (x.at <= cible && (!prochain || x.at < prochain[1].at)) prochain = [id, x];
        if (!prochain) break;
        if (++garde > 100000) throw new Error('boucle de minuteurs');
        timers.delete(prochain[0]);
        t = prochain[1].at;
        prochain[1].fn();
      }
      t = cible;
    },
    ecritures,
  };
  return api;
}

function autosave(opts = {}) {
  const h = faux();
  const inst = createEdlAutosave({
    save: (motif) => h.ecritures.push({ at: h.now(), motif }),
    now: h.now, setTimer: h.setTimer, clearTimer: h.clearTimer,
    ...opts,
  });
  return { inst, h };
}

describe('decideAutosave — la règle, sans effet de bord', () => {
  it('refuse un EDL signé, même avec des saisies en attente', () => {
    expect(decideAutosave({ signed: true, ready: true, dirty: true })).toEqual({ ok: false, motif: 'signe' });
  });
  it('refuse tant que logement et date manquent', () => {
    expect(decideAutosave({ ready: false }).ok).toBe(false);
  });
  it('n’écrit pas quand rien n’a changé', () => {
    expect(decideAutosave({ dirty: false }).motif).toBe('rien-a-ecrire');
  });
  it('écrit dans le cas courant', () => {
    expect(decideAutosave({ signed: false, ready: true, dirty: true }).ok).toBe(true);
  });
});

describe('invariant 4 — jamais plus d’une écriture par fenêtre de 2 s', () => {
  it('la fenêtre du CDC vaut bien 2 000 ms', () => {
    expect(EDL_AUTOSAVE_DELAY_MS).toBe(2000);
  });

  it('une saisie isolée : rien avant 2 s, une écriture à 2 s', () => {
    const { inst, h } = autosave();
    inst.declencher('champ');
    h.avance(1999);
    expect(h.ecritures).toHaveLength(0);
    h.avance(1);
    expect(h.ecritures).toHaveLength(1);
    expect(h.ecritures[0].at).toBe(2000);
  });

  it('les 110 éléments saisis d’affilée (10 ms d’écart) ne font QU’UNE écriture', () => {
    const { inst, h } = autosave();
    for (let i = 0; i < 110; i++) { inst.declencher('element ' + i); h.avance(10); }
    h.avance(2000);
    expect(inst.stats().declencheurs).toBe(110);
    expect(h.ecritures).toHaveLength(1);
  });

  it('une visite d’une heure au rythme réel : deux écritures ne sont jamais à moins de 2 s', () => {
    const { inst, h } = autosave();
    // 900 saisies terminées, une toutes les 4 s (rythme d'un EDL de 110 éléments)
    for (let i = 0; i < 900; i++) { inst.declencher('saisie ' + i); h.avance(4000); }
    h.avance(5000);
    expect(h.ecritures.length).toBeGreaterThan(0);
    for (let i = 1; i < h.ecritures.length; i++) {
      expect(h.ecritures[i].at - h.ecritures[i - 1].at).toBeGreaterThanOrEqual(EDL_AUTOSAVE_DELAY_MS);
    }
  });

  it('une rafale continue plus rapide que la fenêtre reste sous 1 écriture / 2 s', () => {
    const { inst, h } = autosave();
    for (let i = 0; i < 600; i++) { inst.declencher('rafale'); h.avance(100); } // 60 s de rafale
    h.avance(3000);
    // 63 s de temps simulé → au plus 32 fenêtres de 2 s
    expect(h.ecritures.length).toBeLessThanOrEqual(32);
    for (let i = 1; i < h.ecritures.length; i++) {
      expect(h.ecritures[i].at - h.ecritures[i - 1].at).toBeGreaterThanOrEqual(EDL_AUTOSAVE_DELAY_MS);
    }
  });
});

describe('invariant 3 — un EDL signé n’est JAMAIS réécrit', () => {
  it('110 saisies sur un EDL signé : zéro écriture', () => {
    const { inst, h } = autosave({ isSigned: () => true });
    for (let i = 0; i < 110; i++) { inst.declencher('saisie'); h.avance(3000); }
    h.avance(10000);
    expect(h.ecritures).toHaveLength(0);
    expect(inst.stats().refusSigne).toBe(110);
  });

  it('la fermeture non plus n’écrit pas un EDL signé', () => {
    const { inst, h } = autosave({ isSigned: () => true });
    inst.declencher('saisie');
    expect(inst.fermer()).toBe('signe');
    expect(h.ecritures).toHaveLength(0);
  });

  it('un EDL signé PENDANT l’attente du minuteur n’est pas écrit à l’échéance', () => {
    let signe = false;
    const { inst, h } = autosave({ isSigned: () => signe });
    inst.declencher('saisie');
    h.avance(500);
    signe = true;            // les deux signatures viennent d'être posées
    h.avance(5000);
    expect(h.ecritures).toHaveLength(0);
  });
});

describe('fermeture de la modale — elle enregistre, sans rien demander', () => {
  it('écrit immédiatement ce qui attendait', () => {
    const { inst, h } = autosave();
    inst.declencher('champ');
    h.avance(300);
    expect(inst.fermer('fermeture')).toBe('ecrit');
    expect(h.ecritures).toEqual([{ at: 300, motif: 'fermeture' }]);
  });

  it('ne réécrit pas un EDL auquel on n’a pas touché', () => {
    const { inst, h } = autosave();
    inst.declencher('champ');
    h.avance(2000);                  // écriture automatique
    expect(h.ecritures).toHaveLength(1);
    expect(inst.fermer()).toBe('rien-a-ecrire');
    expect(h.ecritures).toHaveLength(1);   // pas de seconde écriture inutile
  });

  it('après la fermeture, aucun minuteur ne reste armé', () => {
    const { inst, h } = autosave();
    inst.declencher('champ');
    inst.fermer();
    h.avance(60000);
    expect(inst.enAttente()).toBe(false);
    expect(h.ecritures).toHaveLength(1);
  });
});

describe('tant que logement et date manquent, l’EDL n’existe pas encore', () => {
  it('aucune écriture avant que le formulaire soit exploitable', () => {
    let pret = false;
    const { inst, h } = autosave({ isReady: () => pret });
    inst.declencher('type');
    h.avance(5000);
    expect(h.ecritures).toHaveLength(0);
    pret = true;
    inst.declencher('logement');
    h.avance(2000);
    expect(h.ecritures).toHaveLength(1);
  });
});

describe('invariant 5 — ré-enregistrer ne sort JAMAIS l’EDL de l’espace partagé', () => {
  /**
   * Reproduit ce que fait saveEDL : reconstruire le record depuis le formulaire
   * puis remplacer l'objet. C'est ce geste qui a détruit l'EDL FERRETTE 001 de
   * l'espace de Marion le 18/07 (le tag `_espaceId` disparaissait au remplacement).
   * Avec l'autosave, ce remplacement a lieu toutes les 2 secondes.
   */
  function reconstruireCommeSaveEDL(existant) {
    // Le littéral de saveEDL : aucun champ technique de synchro.
    const record = {
      id: existant.id, type: existant.type, date: existant.date, logement: existant.logement,
      pieces: existant.pieces, cles: [], signatures: existant.signatures || null,
      _modifiedAt: new Date().toISOString(),
    };
    return _preserverChampsExistants(record, existant);
  }

  it('le tag d’espace survit à un ré-enregistrement', () => {
    const existant = { id: 1, type: 'Entrée', date: '2026-05-03', logement: 'FERRETTE-001', pieces: [], _espaceId: 'espace-marion' };
    expect(reconstruireCommeSaveEDL(existant)._espaceId).toBe('espace-marion');
  });

  it('900 ré-enregistrements d’affilée ne perdent toujours pas le tag', () => {
    let rec = { id: 1, type: 'Entrée', date: '2026-05-03', logement: 'FERRETTE-001', pieces: [], _espaceId: 'espace-marion', cloudPdfKey: 'espace/ent/files/pdf' };
    for (let i = 0; i < 900; i++) rec = reconstruireCommeSaveEDL(rec);
    expect(rec._espaceId).toBe('espace-marion');
    expect(rec.cloudPdfKey).toBe('espace/ent/files/pdf');
  });

  it('sans la préservation, le tag disparaît dès la première écriture (le bug du 18/07)', () => {
    const existant = { id: 1, pieces: [], _espaceId: 'espace-marion' };
    const sansFilet = { id: existant.id, pieces: existant.pieces };
    expect(sansFilet._espaceId).toBeUndefined();
  });
});

describe('annulation du minuteur', () => {
  it('annuler() empêche l’écriture en attente', () => {
    const { inst, h } = autosave();
    inst.declencher('champ');
    inst.annuler();
    h.avance(10000);
    expect(h.ecritures).toHaveLength(0);
    expect(inst.enRetard()).toBe(false);
  });
});
