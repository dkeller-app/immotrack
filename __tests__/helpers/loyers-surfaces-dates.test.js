/**
 * CDC-LOYERS-DESIGN §4 — LES 8 SURFACES DE LA « DATE DE PAIEMENT », vérifiées dans le source.
 *
 * L'audit du 19/08 a trouvé quatre surfaces FAUSSES et quatre à risque, toutes pour la même
 * raison : la date affichée ne venait pas du paiement concerné mais d'un repli (dernier
 * encaissement du lot, champ legacy, date d'émission, `aujourd'hui`). L'invariant I-DATE dit :
 * « aucune date de paiement affichée qui ne corresponde pas réellement au mois quittancé ou
 * constaté ; en l'absence de rattachement : RIEN ».
 *
 * Un repli se réintroduit en une ligne et ne casse aucun test de valeur : il faut donc
 * l'interdire dans le SOURCE. Assertions sur des booléens (index.html fait 3,7 Mo).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const EMAIL = fs.readFileSync(path.join(ROOT, 'js/core/email-compose.js'), 'utf8');
const has = (s) => SRC.includes(s);

describe('Surface 1 — la quittance (aperçu, impression, PDF partagé, PDF archivé, PJ e-mail)', () => {
  it('la date vient de la cascade unique, via la porte datePaiementMois', () => {
    expect(has('window.datePaiementMois(_loyerEtatLot(q.logement), prefixMois)')).toBe(true);
  });
  it('le repli « dernier encaissement du lot » a disparu', () => {
    expect(has('datePayTrouvee')).toBe(false);
    expect(has('_mvsLot')).toBe(false);
  });
  it('le repli sur le champ legacy et sur la DATE D\'ÉMISSION a disparu', () => {
    expect(has('q.datePaiement ? fd(q.datePaiement) : fd(q.date)')).toBe(false);
  });
  it('la phrase d\'acte est construite pour pouvoir se dire SANS date', () => {
    expect(has("const recuLe = `déclare avoir reçu${_mention.mention} du locataire`")).toBe(true);
    // plus aucune occurrence de « reçu le <b>${datePay}</b> », qui ne pouvait pas être vide
    expect(has('avoir reçu le <b>${datePay}</b>')).toBe(false);
  });
});

describe('Surface 2 — le reçu de paiement partiel', () => {
  it('reçoit les versements réellement imputés à CE mois', () => {
    expect(has('infoPaiement: { date: null, dates: info.dates, nb: info.nb }')).toBe(true);
  });
  it('n\'annonce jamais un mois soldé : un reçu partiel ne solde rien', () => {
    expect(has('window.datePaiementMois(etat, ym)')).toBe(true);
  });
});

describe('Surface 3 — fiche 360 · Compta : le badge « ✓ payé / ⏳ non confirmé »', () => {
  it('ne lit plus le champ legacy q.datePaiement', () => {
    expect(has('title="Paiement reçu le ${fd(q.datePaiement)}"')).toBe(false);
    expect(has('title="Paiement non confirmé"')).toBe(false);
  });
  it('la liste des quittances qui le portait a été remplacée par l\'état 12 mois (V13)', () => {
    // Le badge ne pouvait pas être « réparé » : il annonçait un paiement à partir d'un champ
    // mort. La surface entière est remplacée par la bande de douze cases, qui lit l'état réel.
    expect(has('function _renderQuitForLog')).toBe(false);
    expect(has('function _renderEtat12Mois(ref, year)')).toBe(true);
  });
  it('l\'état affiché vient de la cascade, pas d\'un champ stocké', () => {
    expect(has('const rail = window.moisRailLot(etat, deja.yms, year, today.slice(0, 7), deja.dates);')).toBe(true);
  });
});

describe('Surface 4 — dashboard solo « ✓ Payé JJ/MM »', () => {
  it('le 7ᵉ moteur résiduel (rattachement au mois calendaire du mouvement) a disparu', () => {
    expect(has('const moPayments = (mvs||[]).filter(m =>')).toBe(false);
    expect(has("'✓ Payé ' + lastPay.date.slice(8,10)")).toBe(false);
  });
  it('lit l\'imputation unique et n\'affiche une date que si le mois est soldé', () => {
    expect(has('const _moM = (_etM && _etM.byYm) ? _etM.byYm[yrMoPrefix] : null;')).toBe(true);
    expect(has("_payM && _payM.date ? ' le ' + fd(_payM.date) : ''")).toBe(true);
  });
});

describe('Surface 5 — fiche 360 · Documents : la date d\'émission est étiquetée', () => {
  it('« éditée le » précède la date, qui ne peut plus se lire comme un paiement', () => {
    expect(has('· éditée le ${fd(q.date)}')).toBe(true);
  });
});

describe('Surfaces 6/7/8 — les dates proposées ne sont plus « aujourd\'hui »', () => {
  it('6 — le reçu de DG propose le mouvement de DG réel, sinon rien', () => {
    expect(has("window.dateVersementDG(DB.mouvements || [], ref) : null) || ''")).toBe(true);
    expect(has("extra.dateVersement = promptVal('Date du versement DG (YYYY-MM-DD) :', td());")).toBe(false);
  });
  it('7 — la restitution du DG propose le virement réel, sinon champ vide', () => {
    expect(has('window.dateRestitutionDG(DB.mouvements || [], ref)')).toBe(true);
    expect(has('id="dg-restit-date" value="${td()}"')).toBe(false);
  });
  it('7 — et l\'enregistrement ne retombe plus silencieusement sur aujourd\'hui', () => {
    expect(has("const dateRestitution = v('dg-restit-date') || td();")).toBe(false);
    expect(has("const dateRestitution = v('dg-restit-date') || '';")).toBe(true);
  });
  it('8 — l\'attestation propose la sortie déclarée et l\'EDL de sortie, sinon rien', () => {
    expect(has("extra.dateLiberation = promptVal('Date de libération du logement :', td());")).toBe(false);
    expect(has("extra.dateEDLSortie = promptVal('Date EDL sortie :', td());")).toBe(false);
    expect(has("promptVal('Date de libération du logement :', _libIso || '')")).toBe(true);
    expect(has("promptVal('Date EDL sortie :', _edlSortieIso || '')")).toBe(true);
  });
  it('les gabarits e-mail n\'ont pas de date en dur (ils sont interpolés)', () => {
    expect(EMAIL.includes('{{dateVersement}}')).toBe(true);
    expect(EMAIL.includes('{{dateLiberation}}')).toBe(true);
    expect(EMAIL.includes('{{dateEDLSortie}}')).toBe(true);
  });
});

describe('Vérifiés propres au §4 — à ne pas casser', () => {
  it('la quittance ne pilote toujours aucun calcul : le dû vient du barème du mois', () => {
    expect(has('_duMoisLot')).toBe(true);
  });
  it('le « payé du mois » a toujours une seule porte', () => {
    expect(has('function _loyerPayeDuMois(ref, ym)')).toBe(true);
  });
});
