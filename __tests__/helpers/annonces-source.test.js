/**
 * Câblage du chantier ANNONCES dans index.html (CDC validé 29/09/2026). Le moteur est testé à part
 * (annonce-generator.test.js, dpe-texte.test.js) ; ici on verrouille ce que le navigateur exécute.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const bloc = (debut, fin) => { const a = html.indexOf(debut); const b = html.indexOf(fin, a); return a >= 0 && b > a ? html.slice(a, b) : ''; };
const openAnnonce = bloc('function openAnnonce(', '\nfunction _annonceGoStep(');
const js = bloc('let _annonceCtx = ', '// v15.233 MODALE-LOGEMENT B1');
const modale = bloc('<div class="ov hidden" id="ov-annonce"', '<!-- MODAL: IMPORT RÉFÉRENTIEL -->');

describe('D1 — le loyer de l\'annonce est le loyer souhaité, jamais l\'ancien bail', () => {
  it('openAnnonce ne lit plus DB.baux', () => {
    expect(openAnnonce).not.toBe('');
    expect(openAnnonce).not.toContain('DB.baux');
    expect(openAnnonce).toContain('log.loyerHcRef');
  });
  it('l\'étape 1 écrit par le chemin de l\'onglet Identité (_logpPushLoyerRef) puis _stamp + saveDB', () => {
    const cont = bloc('function _annonceStep1Continuer(', '\nfunction _annonceToggleDossier(');
    expect(cont).toContain('_logpPushLoyerRef(log, { loyerHcRef: hcS, chargesRef: chS }, !!_bienActiveBail(log.ref))');
    expect(cont).toContain('_rescoreCandidatsDuLogement(log.ref)');
    expect(cont).toContain('_stamp(log)');
    expect(cont).toContain('saveDB()');
    expect(cont).toContain('_appReadOnly');
  });
});

describe('D6 — classe G : avertir (confirm2 + rappel légal), jamais bloquer', () => {
  it('confirmation avant génération', () => {
    expect(openAnnonce).toContain("_annonceDpe(log).classe === 'G'");
    expect(openAnnonce).toContain('confirm2(');
    expect(openAnnonce).toContain('art. 6 loi n° 89-462');
  });
});

describe('P-2 / P-3 / D2 — retraits', () => {
  it('plus de case « Je certifie », plus d\'e-mail, plus de tons ni de formats', () => {
    expect(modale).not.toContain('an-verifie');
    expect(html).not.toContain('function _annonceEmail(');
    expect(html).not.toContain('function _annonceSetTon(');
    expect(html).not.toContain('function _annonceSetFormat(');
    expect(js).not.toContain('mailto:');
  });
  it('Copier et PDF ne sont jamais désactivés (D3)', () => {
    expect(modale).not.toMatch(/id="an-btn-copy"[^>]*disabled/);
    expect(modale).not.toMatch(/id="an-btn-pdf"[^>]*disabled/);
  });
});

describe('D9 / D10 — aucune adresse web ajoutée au texte copié', () => {
  it('le texte copié = description + mentions + dossier, sans lien DossierFacile', () => {
    const t = bloc('function _annonceTexte(', '\nasync function _annonceCopy(');
    expect(t).not.toMatch(/dossierfacile|https?:/i);
  });
  it('l\'adresse DossierFacile n\'apparaît que dans l\'affiche PDF', () => {
    const pdf = bloc('function _annoncePDF(', '// v15.233 MODALE-LOGEMENT B1');
    expect(pdf).toContain('www.dossierfacile.fr');
  });
});

describe('texte unique (maquette v2)', () => {
  it('une seule zone de texte + calque des emplacements, plus de bloc verrouillé', () => {
    expect(modale).toContain('id="an-texte"');
    expect(modale).toContain('id="an-texte-bd"');
    expect(modale).not.toContain('an-mentions');
    expect(modale).not.toContain('an-lock');
  });
  it('contrôle en direct à chaque frappe, Remettre, mise à jour des mentions au retour de la fiche', () => {
    expect(modale).toContain('oninput="_annonceTexteMaj()"');
    expect(js).toContain('AG.controlerTexte(t, r)');
    expect(js).toContain('AG.remettreMention(ta.value, r, key)');
    expect(js).toContain('AG.majMentions(ta.value, avant, r)');
  });
  it('re-score des candidats : une seule source', () => {
    expect(html.split('x.confianceScore = _calculConfiance(x, _loyerAttenduForCand(x).loyer, _candPiecesPts(x))').length - 1).toBe(1);
  });
});

describe('données (lot 2)', () => {
  it('3 champs du loyer souhaité lus en partiel et remplis', () => {
    ['logp-loc-chModalite', 'logp-loc-honoEdl', 'logp-loc-honoHcl'].forEach(id => expect(html).toContain('id="' + id + '"'));
    expect(html).toContain("out['chargesModalite']  = v('logp-loc-chModalite')");
    expect(html).toContain("out['honorairesEdlRef'] = v('logp-loc-honoEdl')");
    expect(html).toContain("out['honorairesHclRef'] = v('logp-loc-honoHcl')");
    expect(html).toContain("setV('logp-loc-chModalite', log.chargesModalite || '')");
  });
  it('champ années des prix : plus limité à 4 chiffres', () => {
    expect(html).not.toMatch(/maxlength="4"[^>]*'anneePrix'/);
    expect(html).toContain("_logDiagSetField('dpe','anneePrix',this.value)");
  });
  it('liste UNIQUE des champs « à vérifier » : plus aucun triplet recopié', () => {
    expect(html).toContain("const _LOGDIAG_SG_FIELDS = ['date', 'cabinet', 'result', 'depenses', 'anneePrix'];");
    expect(html).not.toContain("['date','cabinet','result'].filter");
    expect(html).not.toContain('if (e.date) n++; if (e.cabinet) n++; if (e.result) n++;');
    expect(html).not.toContain('delete e.date; delete e.cabinet; delete e.result;');
  });
  it('lecture du PDF DPE branchée, fourchette prioritaire sur l\'ADEME', () => {
    expect(html).toContain('<script src="js/helpers/dpe-texte.global.js"></script>');
    expect(html).toContain('window.DpeTexte.lireCoutsDpe(text)');
    expect(html).toContain('window.DpeTexte.estFourchette(dpe.depensesEnergie)');
  });
});
