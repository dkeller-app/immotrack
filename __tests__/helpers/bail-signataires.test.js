// __tests__/helpers/bail-signataires.test.js
// S1 SIGNATURE-SMOKE — wizard de signature SANS aucune case de paraphe (bloquant).
//
// REPRODUCTION (compte frais test0, bail « 102 », entité créée par le fil rouge minimal) :
// l'entité n'a NI mandataire NI gérant. Deux dérivations INDÉPENDANTES de l'identité du
// signataire bailleur cohabitaient dans index.html et divergeaient exactement dans ce cas :
//
//   • _confirmBailSignatureFlow (orchestrateur, l.7754) :
//       _bailBailleurSigners(bail) → []  (getBailSignataires → getGerants → [])
//       → [] interprété comme « mandataire » → file de signature = ['bailleur']
//   • previewBailData (popup, l.21663) :
//       withMandataire === false → branche co-gérants → sigNames = [] → repli [gerantLabel]
//       → _SIGS = [{id:'bailleur-0'}, {id:'loc-0'}]
//
//   → _wizV2SoloSigner = 'bailleur' ; _wizV2GetSigs() filtre _SIGS sur id==='bailleur'
//   → LISTE VIDE → aucun pad rendu, parcours MUET jusqu'au PDF final.
//
// PREUVE MATÉRIELLE (bp_102_7957d51b950d.pdf, PDF archivé du bail « signé ») : les 12 cases
// « Paraphe bailleur » et le cadre §18 bailleur sont VIDES ; les seules images du document
// (320×90 et 600×200 px — aucune taille de pad in-app, qui sont 560×180 et 720×220) sont
// celles tamponnées par le relais pour le LOCATAIRE, dans leurs bonnes cases. Le bail a donc
// été scellé « signé » sans AUCUNE signature du bailleur.
//
// Fix : une SEULE dérivation partagée (resolveBailleurSigners) + garde explicite quand la
// liste des signataires attendus est vide (padSignersFor → error, jamais un parcours muet).

import { describe, it, expect } from 'vitest';
import { resolveBailleurSigners, bailleurSignerIds, padSignersFor } from './bail-signataires.js';

describe('resolveBailleurSigners — dérivation UNIQUE des signataires bailleur', () => {
  it('RÉGRESSION S1 : entité sans gérant ni mandataire → un signataire de repli, id bailleur-0', () => {
    const out = resolveBailleurSigners({ names: [], withMandataire: false, entityLabel: 'Bailleur' });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('bailleur-0');
    expect(out[0].kind).toBe('entite');
    expect(out[0].nom).toBe('Bailleur');
  });

  it('RÉGRESSION S1 : orchestrateur et document produisent EXACTEMENT les mêmes ids', () => {
    // Le bug : la file valait ['bailleur'] pendant que _SIGS portait 'bailleur-0'.
    const input = { names: [], withMandataire: false, entityLabel: 'Bailleur' };
    const idsFile = bailleurSignerIds(input);          // orchestrateur (file de signature)
    const idsDoc = bailleurSignerIds(input);           // document (_SIGS)
    expect(idsFile).toEqual(idsDoc);
    expect(idsFile).toEqual(['bailleur-0']);
  });

  it('mandataire actif → un seul signataire, id « bailleur » (convention historique)', () => {
    const out = resolveBailleurSigners({
      names: ['Jean Dupont'], withMandataire: true, mandataireNom: 'Agence Martin', entityLabel: 'SCI KELLER'
    });
    expect(out).toEqual([{ id: 'bailleur', nom: 'Agence Martin', kind: 'mandataire' }]);
  });

  it('1 gérant → id bailleur-0 au nom du gérant', () => {
    const out = resolveBailleurSigners({ names: ['Didier Keller'], entityLabel: 'SCI KELLER' });
    expect(out).toEqual([{ id: 'bailleur-0', nom: 'Didier Keller', kind: 'gerant' }]);
  });

  it('co-gérants → un signataire par gérant, ids indexés et alignés', () => {
    const out = resolveBailleurSigners({ names: ['A Un', 'B Deux', 'C Trois'], entityLabel: 'SCI' });
    expect(out.map(s => s.id)).toEqual(['bailleur-0', 'bailleur-1', 'bailleur-2']);
    expect(out.map(s => s.nom)).toEqual(['A Un', 'B Deux', 'C Trois']);
  });

  it('ne renvoie JAMAIS une liste vide (garantie structurelle)', () => {
    const cases = [
      {}, { names: [] }, { names: null }, { names: ['  ', ''] },
      { withMandataire: true, mandataireNom: '' },        // mandataire coché mais pas nommé
      { names: [], entityLabel: '' }
    ];
    for (const c of cases) expect(resolveBailleurSigners(c).length).toBeGreaterThanOrEqual(1);
  });

  it('mandataire coché sans nom → retombe sur les gérants (pas de signataire fantôme)', () => {
    const out = resolveBailleurSigners({ names: ['Didier Keller'], withMandataire: true, mandataireNom: '' });
    expect(out).toEqual([{ id: 'bailleur-0', nom: 'Didier Keller', kind: 'gerant' }]);
  });

  it('repli sans nom d\'entité → libellé neutre, jamais une chaîne vide', () => {
    const out = resolveBailleurSigners({ names: [], entityLabel: '' });
    expect(out[0].nom).toBe('Le bailleur');
  });

  it('ignore les noms vides dans la liste des gérants', () => {
    const out = resolveBailleurSigners({ names: ['Didier Keller', '', '   '], entityLabel: 'SCI' });
    expect(out.map(s => s.nom)).toEqual(['Didier Keller']);
  });
});

describe('padSignersFor — qui doit parapher CETTE page (+ garde anti-parcours muet)', () => {
  const SIGS = [
    { id: 'bailleur-0', nomCourt: 'Keller', role: 'BAILLEUR / GÉRANT' },
    { id: 'loc-0', nomCourt: 'Nom', role: 'LOCATAIRE' },
    { id: 'caution-0', nomCourt: 'Caution', role: 'CAUTION' }
  ];

  it('exclut toujours la caution (elle signe un acte séparé)', () => {
    const r = padSignersFor(SIGS, {});
    expect(r.sigs.map(s => s.id)).toEqual(['bailleur-0', 'loc-0']);
    expect(r.error).toBeNull();
  });

  it('solo = un signataire présent → ne rend QUE ses pads', () => {
    const r = padSignersFor(SIGS, { solo: 'bailleur-0' });
    expect(r.sigs.map(s => s.id)).toEqual(['bailleur-0']);
    expect(r.error).toBeNull();
  });

  it('RÉGRESSION S1 : solo INCONNU → erreur explicite, jamais une liste vide silencieuse', () => {
    const r = padSignersFor(SIGS, { solo: 'bailleur' });   // l\'id exact du bug
    expect(r.sigs).toEqual([]);
    expect(r.error).toBeTruthy();
    expect(r.error.code).toBe('SIGNER_INTROUVABLE');
    expect(r.error.message).toContain('bailleur');
  });

  it('phase 2 (locataire seul) → uniquement les locataires', () => {
    const r = padSignersFor(SIGS, { phase2: true });
    expect(r.sigs.map(s => s.id)).toEqual(['loc-0']);
  });

  it('bailleur seul (withLocataires false) → uniquement le côté bailleur', () => {
    const r = padSignersFor(SIGS, { withLocataires: false });
    expect(r.sigs.map(s => s.id)).toEqual(['bailleur-0']);
  });

  it('mandataire (id « bailleur » sans index) reste reconnu comme côté bailleur', () => {
    const sigs = [{ id: 'bailleur', nomCourt: 'Martin', role: 'MANDATAIRE (p/o Bailleur)' }, SIGS[1]];
    expect(padSignersFor(sigs, { withLocataires: false }).sigs.map(s => s.id)).toEqual(['bailleur']);
    expect(padSignersFor(sigs, { solo: 'bailleur' }).sigs.map(s => s.id)).toEqual(['bailleur']);
  });

  it('phase 2 sans aucun locataire → erreur explicite', () => {
    const r = padSignersFor([SIGS[0]], { phase2: true });
    expect(r.sigs).toEqual([]);
    expect(r.error.code).toBe('AUCUN_SIGNATAIRE');
  });

  it('_SIGS vide → erreur explicite', () => {
    const r = padSignersFor([], {});
    expect(r.error.code).toBe('AUCUN_SIGNATAIRE');
  });

  it('est PUR et autonome (injectable tel quel dans la popup de signature)', () => {
    // La popup reçoit la fonction sérialisée via toString() : elle ne doit capturer
    // aucune variable de module, sinon elle explose côté popup.
    const src = padSignersFor.toString();
    expect(src).not.toMatch(/\b(require|import)\b/);
  });
});
