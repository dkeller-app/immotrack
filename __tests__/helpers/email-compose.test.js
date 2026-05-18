/**
 * Tests pour js/core/email-compose.js (EMAIL-AUTO V1 Phase 1)
 *
 * Couverture :
 *  - _interpolateEmail (résolution path, fallback "(inconnu)", escape HTML)
 *  - _emailTypesSupportes (liste exhaustive 10 types)
 *  - _emailCompose : 1 test par type (10) + variable manquante + ctx vide + type inconnu + escape HTML
 *  - _logEmailSent / _getEmailHistory (Phase 3)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  _emailCompose,
  _emailTypesSupportes,
  _interpolateEmail,
  _logEmailSent,
  _getEmailHistory
} from '../../js/core/email-compose.js';

import fixtures from '../fixtures.json' assert { type: 'json' };

// Contexte standard reconstruit depuis les fixtures (bail ALPHA-001 actif).
function ctxAlpha() {
  const log = fixtures.logements.find(l => l.ref === 'ALPHA-001');
  const bail = fixtures.baux['ALPHA-001'];
  const entite = fixtures.entites.find(e => e.nom === bail.entity);
  const quittance = fixtures.quittances.find(q => q.logement === 'ALPHA-001' && q.mois === 'janvier 2026');
  return {
    logement: log,
    bail,
    entite,
    locataire: bail.locataires[0],
    quittance: { ...quittance, total: quittance.hc + quittance.ch },
    periode: 'janvier 2026',
    montant: 715.4,
    dateEcheance: '2026-02-05',
    annee: 2025,
    provisions: 600,
    chargesReelles: 720,
    solde: 120,
    soldeSens: 'à votre charge',
    soldeAction: 'Le solde de 120 € sera prélevé avec votre prochain loyer.',
    moisApplication: 'janvier 2026',
    ancienHC: 650,
    nouveauHC: 665.4,
    dateFinMRH: '2027-01-01',
    dateEDL: '2027-01-05',
    heureEDL: '10h00',
    dateLettre: '15 mars 2026',
    rappel1Date: '6 février 2026',
    rappel2Date: '20 février 2026'
  };
}

// ────────────────────────────────────────────────────────────────────────────
describe('_interpolateEmail', () => {
  it('remplace une variable simple', () => {
    expect(_interpolateEmail('Bonjour {{nom}}', { nom: 'Jean' })).toBe('Bonjour Jean');
  });

  it('remplace un chemin imbriqué', () => {
    const ctx = { locataire: { nom: 'Sophie', email: 'sophie@x.fr' } };
    expect(_interpolateEmail('{{locataire.nom}} ({{locataire.email}})', ctx))
      .toBe('Sophie (sophie@x.fr)');
  });

  it('variable manquante → "(inconnu)"', () => {
    expect(_interpolateEmail('Bonjour {{nom}}', {})).toBe('Bonjour (inconnu)');
  });

  it('chemin partiellement résolu → "(inconnu)"', () => {
    expect(_interpolateEmail('{{a.b.c}}', { a: { b: null } })).toBe('(inconnu)');
  });

  it('context null → toutes les variables "(inconnu)"', () => {
    expect(_interpolateEmail('Hello {{nom}}', null)).toBe('Hello (inconnu)');
  });

  it('template null → ""', () => {
    expect(_interpolateEmail(null, {})).toBe('');
  });

  it('value 0 → "0" (pas "(inconnu)")', () => {
    expect(_interpolateEmail('{{n}}', { n: 0 })).toBe('0');
  });

  it('mode escapeHtml échappe les valeurs', () => {
    const ctx = { nom: '<script>alert(1)</script>' };
    const out = _interpolateEmail('Hello {{nom}}', ctx, { escapeHtml: true });
    expect(out).toBe('Hello &lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('mode par défaut NE escape PAS (plain text pour mailto/clipboard)', () => {
    const ctx = { nom: '<b>Jean</b>' };
    expect(_interpolateEmail('Hello {{nom}}', ctx)).toBe('Hello <b>Jean</b>');
  });

  it('plusieurs occurrences même variable', () => {
    expect(_interpolateEmail('{{x}}-{{x}}-{{x}}', { x: 'a' })).toBe('a-a-a');
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('_emailTypesSupportes', () => {
  it('retourne un tableau de strings', () => {
    const types = _emailTypesSupportes();
    expect(Array.isArray(types)).toBe(true);
    expect(types.every(t => typeof t === 'string')).toBe(true);
  });

  it('contient les 29 types V1+V1.1 (10 V1 v14.97 + 19 extension v15.09)', () => {
    const types = _emailTypesSupportes();
    expect(types).toHaveLength(29);
    // V1 v14.97 (10 types)
    expect(types).toContain('quittance');
    expect(types).toContain('avis-echeance');
    expect(types).toContain('rappel-impaye-1');
    expect(types).toContain('rappel-impaye-2');
    expect(types).toContain('rappel-impaye-3');
    expect(types).toContain('irl-revision');
    expect(types).toContain('mrh-renouvellement');
    expect(types).toContain('bail-signe-final');
    expect(types).toContain('convocation-edl-sortie');
    expect(types).toContain('decompte-regul-annuel');
    // V1.1 v15.09 (19 nouveaux)
    expect(types).toContain('bail-pret-a-signer');
    expect(types).toContain('cautionnement-signe');
    expect(types).toContain('bail-avenant');
    expect(types).toContain('edl-convocation-entree');
    expect(types).toContain('edl-entree-signe');
    expect(types).toContain('bienvenue-infos-pratiques');
    expect(types).toContain('dg-recu');
    expect(types).toContain('demande-attest-entretien-chauffage');
    expect(types).toContain('demande-attest-mrh');
    expect(types).toContain('notification-travaux-a-venir');
    expect(types).toContain('notification-visite');
    expect(types).toContain('bail-renouvellement-3ans');
    expect(types).toContain('bail-conge-bailleur-6mois');
    expect(types).toContain('bail-preavis-recu');
    expect(types).toContain('edl-sortie-signe');
    expect(types).toContain('dg-restitution-integrale');
    expect(types).toContain('dg-restitution-partielle');
    expect(types).toContain('solde-tout-compte');
    expect(types).toContain('attestation-logement-libere');
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('_emailCompose — structure de sortie', () => {
  it('retourne {to, cc, subject, body, attachments, legalNote}', () => {
    const out = _emailCompose('quittance', ctxAlpha());
    expect(out).toHaveProperty('to');
    expect(out).toHaveProperty('cc');
    expect(out).toHaveProperty('subject');
    expect(out).toHaveProperty('body');
    expect(out).toHaveProperty('attachments');
    expect(out).toHaveProperty('legalNote');
    expect(Array.isArray(out.attachments)).toBe(true);
  });

  it('to = locataire.email du context', () => {
    const out = _emailCompose('quittance', ctxAlpha());
    expect(out.to).toBe('jean.test@example.com');
  });

  it('type inconnu → error: TYPE_UNKNOWN, body explicite', () => {
    const out = _emailCompose('blabla-inexistant', {});
    expect(out.error).toBe('TYPE_UNKNOWN');
    expect(out.subject).toBe('(type inconnu)');
    expect(out.body).toMatch(/non support/);
  });

  it('context vide → pas de crash, fallbacks "(inconnu)"', () => {
    const out = _emailCompose('quittance', {});
    expect(out.to).toBe('');
    expect(out.subject).toContain('(inconnu)');
    expect(out.body).toContain('(inconnu)');
  });

  it('context null → pas de crash', () => {
    expect(() => _emailCompose('quittance', null)).not.toThrow();
    const out = _emailCompose('quittance', null);
    expect(out.to).toBe('');
  });

  it('context undefined → pas de crash', () => {
    expect(() => _emailCompose('quittance')).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('_emailCompose — 10 types V1', () => {
  it('type quittance : sujet contient mois + adresse, PJ PDF nommée', () => {
    const out = _emailCompose('quittance', ctxAlpha());
    expect(out.subject).toBe('Quittance de loyer janvier 2026 — 10 rue Alpha 75011 PARIS');
    expect(out.body).toContain('Jean LOCATAIRE-A');
    expect(out.body).toContain('janvier 2026');
    expect(out.attachments).toHaveLength(1);
    expect(out.attachments[0].name).toBe('Quittance-janvier 2026-ALPHA-001.pdf');
    expect(out.attachments[0].type).toBe('pdf');
  });

  it('type avis-echeance : montant + IBAN + référence', () => {
    const out = _emailCompose('avis-echeance', ctxAlpha());
    expect(out.subject).toContain('Avis d\'échéance');
    expect(out.subject).toContain('janvier 2026');
    expect(out.body).toContain('IBAN');
    expect(out.body).toContain('FR76 0000 0000 0000 0000 0000 000');
    expect(out.body).toContain('Loyer janvier 2026 ALPHA-001');
    expect(out.attachments).toHaveLength(0);
  });

  it('type rappel-impaye-1 : ton amical, pas de legalNote', () => {
    const out = _emailCompose('rappel-impaye-1', ctxAlpha());
    expect(out.subject).toContain('Rappel');
    expect(out.body).toMatch(/simple oubli/i);
    expect(out.legalNote).toBe('');
  });

  it('type rappel-impaye-2 : mention article 24, legalNote présente', () => {
    const out = _emailCompose('rappel-impaye-2', ctxAlpha());
    expect(out.subject).toContain('Relance');
    expect(out.body).toContain('article 24');
    expect(out.legalNote).toMatch(/LRAR|amiable/i);
  });

  it('type rappel-impaye-3 : MISE EN DEMEURE + legalNote LRAR', () => {
    const out = _emailCompose('rappel-impaye-3', ctxAlpha());
    expect(out.subject).toContain('MISE EN DEMEURE');
    expect(out.body).toContain('huit (8) jours');
    expect(out.body).toContain('commandement de payer');
    expect(out.legalNote).toContain('LRAR');
  });

  it('type irl-revision : ancien/nouveau HC + PJ lettre PDF', () => {
    const out = _emailCompose('irl-revision', ctxAlpha());
    expect(out.subject).toContain('Révision');
    expect(out.body).toContain('650');
    expect(out.body).toContain('665.4');
    expect(out.attachments[0].name).toBe('Lettre-revision-IRL-ALPHA-001.pdf');
    expect(out.legalNote).toMatch(/loi Climat/i);
  });

  it('type mrh-renouvellement : article 7g + date fin MRH', () => {
    const out = _emailCompose('mrh-renouvellement', ctxAlpha());
    expect(out.subject).toContain('assurance habitation');
    expect(out.body).toContain('article 7g');
    expect(out.body).toContain('2027-01-01');
  });

  it('type bail-signe-final : infos pratiques + 2 PJ', () => {
    const out = _emailCompose('bail-signe-final', ctxAlpha());
    expect(out.subject).toContain('Bail signé');
    expect(out.body).toContain('Bienvenue');
    expect(out.attachments).toHaveLength(2);
    expect(out.attachments[0].name).toContain('Bail-ALPHA-001');
    expect(out.attachments[1].name).toContain('EDL-entree-ALPHA-001');
  });

  it('type convocation-edl-sortie : date + heure + mention huissier', () => {
    const out = _emailCompose('convocation-edl-sortie', ctxAlpha());
    expect(out.subject).toContain('État des lieux');
    expect(out.body).toContain('2027-01-05');
    expect(out.body).toContain('10h00');
    expect(out.body).toContain('huissier');
  });

  it('type decompte-regul-annuel : provisions + solde + PJ décompte', () => {
    const out = _emailCompose('decompte-regul-annuel', ctxAlpha());
    expect(out.subject).toContain('régularisation');
    expect(out.subject).toContain('2025');
    expect(out.body).toContain('600');
    expect(out.body).toContain('720');
    expect(out.body).toContain('à votre charge');
    expect(out.attachments[0].name).toBe('Decompte-charges-2025-ALPHA-001.pdf');
    expect(out.body).toContain('article 23');
    expect(out.legalNote).toContain('art. 23');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// v15.90 EM-3 DOC-CIVILITE — civilité dynamique dans templates
// ────────────────────────────────────────────────────────────────────────────
describe('_emailCompose — civilité dynamique (EM-3 v15.90)', () => {
  const baseCtx = {
    locataire: { nom: 'Dupont', email: 'd@test.fr' },
    bail: { adrBien: '10 rue X' },
    logement: { ref: 'L-001' },
    entite: { gerant: 'M. Y', nom: 'SCI X' },
    quittance: { mois: 'mai 2026', hc: 500, ch: 50, total: 550 }
  };

  it('civilite "M." → body contient "Bonjour Monsieur Dupont"', () => {
    const ctx = { ...baseCtx, locataire: { ...baseCtx.locataire, civilite: 'M.' } };
    const out = _emailCompose('quittance', ctx);
    expect(out.body).toContain('Bonjour Monsieur Dupont');
    expect(out.body).not.toContain('Bonjour Dupont,');
  });

  it('civilite "Mme" → body contient "Bonjour Madame Dupont"', () => {
    const ctx = { ...baseCtx, locataire: { ...baseCtx.locataire, civilite: 'Mme', nom: 'Martin' } };
    const out = _emailCompose('quittance', ctx);
    expect(out.body).toContain('Bonjour Madame Martin');
  });

  it('civilite absente → fallback "Bonjour Dupont" (juste le nom)', () => {
    const out = _emailCompose('quittance', baseCtx);
    expect(out.body).toContain('Bonjour Dupont');
    expect(out.body).not.toContain('Monsieur');
    expect(out.body).not.toContain('Madame');
  });

  it('rappel-impaye-3 (formel) : "Veuillez agréer, Monsieur Dupont,"', () => {
    const ctx = {
      ...baseCtx,
      locataire: { ...baseCtx.locataire, civilite: 'M.' },
      periode: 'mai 2026', montant: 550,
      rappel1Date: '5 juin', rappel2Date: '20 juin', dateLettre: '5 juillet'
    };
    const out = _emailCompose('rappel-impaye-3', ctx);
    expect(out.body).toContain('Veuillez agréer, Monsieur Dupont, l\'expression');
  });

  it('garant : cautionnement utilise civNom du garant', () => {
    const ctx = {
      ...baseCtx,
      garant: { civilite: 'Mme', nom: 'Garant' }
    };
    const out = _emailCompose('cautionnement-signe', ctx);
    expect(out.body).toContain('Bonjour Madame Garant');
  });

  it('civNom déjà fourni (ne fait pas double mapping)', () => {
    const ctx = {
      ...baseCtx,
      locataire: { ...baseCtx.locataire, civilite: 'M.', civNom: 'Pré-calculé Custom' }
    };
    const out = _emailCompose('quittance', ctx);
    expect(out.body).toContain('Pré-calculé Custom');
    // Le mapping civilité ne doit pas écraser le civNom déjà fourni
    expect(out.body).not.toContain('Monsieur Dupont');
  });

  it('context.locataire absent → pas de crash', () => {
    expect(() => _emailCompose('quittance', { bail: {}, entite: {} })).not.toThrow();
  });
});

describe('_emailCompose — sécurité', () => {
  it('escape HTML si opts.escapeHtml=true (nom locataire contient <script>)', () => {
    const ctx = ctxAlpha();
    ctx.locataire = { ...ctx.locataire, nom: '<script>alert(1)</script>' };
    const out = _emailCompose('quittance', ctx, { escapeHtml: true });
    expect(out.body).not.toContain('<script>');
    expect(out.body).toContain('&lt;script&gt;');
  });

  it('pas d\'escape par défaut (plain text → mailto/textarea safe)', () => {
    const ctx = ctxAlpha();
    ctx.locataire = { ...ctx.locataire, nom: 'Jean <jean@x.fr>' };
    const out = _emailCompose('quittance', ctx);
    expect(out.body).toContain('Jean <jean@x.fr>');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 3 — Historique d'envoi DB.emailsSent
// ────────────────────────────────────────────────────────────────────────────
describe('_logEmailSent — Phase 3', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window || {};
    globalThis.window.DB = { emailsSent: [] };
    globalThis.window.saveDB = () => {};
  });

  it('crée une entry avec id (préfixe em_), sentAt ISO, status', () => {
    const entry = _logEmailSent('logement', 'ALPHA-001', {
      type: 'quittance',
      to: 'jean@x.fr',
      subject: 'Quittance jan 2026',
      status: 'mailto'
    });
    expect(entry.id).toMatch(/^em_\d+_[a-z0-9]+$/);
    expect(entry.sentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.status).toBe('mailto');
    expect(entry.type).toBe('quittance');
    expect(entry.to).toBe('jean@x.fr');
    expect(entry.entityType).toBe('logement');
    expect(entry.entityId).toBe('ALPHA-001');
  });

  it('ne persiste PAS le body (RGPD — limiter rétention données perso)', () => {
    const entry = _logEmailSent('logement', 'ALPHA-001', {
      type: 'quittance',
      to: 'jean@x.fr',
      subject: 'Quittance',
      body: 'Bonjour Jean, voici votre quittance avec données privées...',
      status: 'mailto'
    });
    expect(entry.body).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain('données privées');
  });

  it('append à window.DB.emailsSent en prod (2 appels → 2 entries)', () => {
    expect(window.DB.emailsSent).toHaveLength(0);
    _logEmailSent('logement', 'ALPHA-001', { type: 'quittance', status: 'copied' });
    expect(window.DB.emailsSent).toHaveLength(1);
    _logEmailSent('logement', 'ALPHA-001', { type: 'avis-echeance', status: 'mailto' });
    expect(window.DB.emailsSent).toHaveLength(2);
  });

  it('initialise DB.emailsSent si absent', () => {
    delete window.DB.emailsSent;
    _logEmailSent('bail', 'X', { type: 'quittance', status: 'mailto' });
    expect(Array.isArray(window.DB.emailsSent)).toBe(true);
    expect(window.DB.emailsSent).toHaveLength(1);
  });

  it('emailData null → entry vide valide (defaults appliqués)', () => {
    const entry = _logEmailSent('logement', 'X', null);
    expect(entry.type).toBe('');
    expect(entry.status).toBe('proposed');
    expect(entry.entityType).toBe('logement');
  });

  it('saveDB invoqué après push (callback prod synchrone)', () => {
    let saved = false;
    window.saveDB = () => { saved = true; };
    _logEmailSent('logement', 'X', { type: 'quittance', status: 'mailto' });
    expect(saved).toBe(true);
  });

  it('saveDB qui throw → pas de crash (silencieux)', () => {
    window.saveDB = () => { throw new Error('read-only mode'); };
    expect(() => _logEmailSent('logement', 'X', { type: 'quittance' })).not.toThrow();
    expect(window.DB.emailsSent).toHaveLength(1);
  });
});

describe('_getEmailHistory — Phase 3', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window || {};
    globalThis.window.DB = { emailsSent: [] };
  });

  it('retourne [] si DB.emailsSent vide', () => {
    expect(_getEmailHistory()).toHaveLength(0);
  });

  it('filtre par entityType + entityId', () => {
    const list = [
      { id: 1, entityType: 'logement', entityId: 'A', type: 'quittance' },
      { id: 2, entityType: 'logement', entityId: 'B', type: 'quittance' },
      { id: 3, entityType: 'bail', entityId: 'A', type: 'avis-echeance' }
    ];
    expect(_getEmailHistory('logement', 'A', list)).toHaveLength(1);
    expect(_getEmailHistory('logement', null, list)).toHaveLength(2);
    expect(_getEmailHistory(null, 'A', list)).toHaveLength(2);
    expect(_getEmailHistory(null, null, list)).toHaveLength(3);
  });

  it('retourne une copie (pas l\'array original)', () => {
    const list = [{ id: 1 }];
    const out = _getEmailHistory(null, null, list);
    expect(out).not.toBe(list);
    expect(out).toEqual(list);
  });

  it('lit window.DB.emailsSent si pas d\'arg list', () => {
    window.DB.emailsSent = [
      { id: 1, entityType: 'logement', entityId: 'A' },
      { id: 2, entityType: 'logement', entityId: 'B' }
    ];
    expect(_getEmailHistory('logement', 'A')).toHaveLength(1);
    expect(_getEmailHistory()).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  v15.09 Sprint 10 — Tests extension 19 nouveaux types
// ═══════════════════════════════════════════════════════════════════

describe('EMAIL-AUTO extension v15.09 — Phase signature bail', () => {
  it('bail-pret-a-signer : sujet personnalisé + PJ projet bail', () => {
    const ctx = { ...ctxAlpha(), dureeBail: '3 ans', dateSignature: '2026-06-15', lieuSignatureTxt: ' au cabinet du notaire' };
    const r = _emailCompose('bail-pret-a-signer', ctx);
    expect(r.subject).toMatch(/prêt à être signé/);
    expect(r.body).toMatch(/2026-06-15/);
    expect(r.body).toMatch(/cabinet du notaire/);
    expect(r.attachments).toHaveLength(1);
    expect(r.attachments[0].name).toMatch(/Projet-bail/);
  });

  it('cautionnement-signe : destinataire garant, sujet acte reçu', () => {
    const ctx = { garant: { nom: 'M. DUPONT Père' }, locataire: { nom: 'M. DUPONT Jean' }, bail: { adrBien: '8 av des Tilleuls' }, entite: { gerant: 'Did K', nom: 'SCI' } };
    const r = _emailCompose('cautionnement-signe', ctx);
    expect(r.subject).toMatch(/cautionnement bien reçu/);
    expect(r.body).toMatch(/M\. DUPONT Père/);
    expect(r.attachments[0].type).toBe('pdf');
  });

  it('bail-avenant : motif et date d\'application interpolés', () => {
    const ctx = { ...ctxAlpha(), motifAvenant: 'Ajout colocataire', dateApplication: '2026-09-01' };
    const r = _emailCompose('bail-avenant', ctx);
    expect(r.body).toMatch(/Ajout colocataire/);
    expect(r.body).toMatch(/2026-09-01/);
    expect(r.attachments[0].name).toMatch(/Avenant/);
  });
});

describe('EMAIL-AUTO extension v15.09 — Phase entrée locataire', () => {
  it('edl-convocation-entree : date EDL + heure interpolés', () => {
    const ctx = { ...ctxAlpha(), dateEDL: '2026-06-15', heureEDL: '10h00' };
    const r = _emailCompose('edl-convocation-entree', ctx);
    expect(r.subject).toMatch(/État des lieux d'entrée/);
    expect(r.body).toMatch(/2026-06-15/);
    expect(r.body).toMatch(/10h00/);
    expect(r.body).toMatch(/article 3-2/);
    expect(r.legalNote).toMatch(/présomption en faveur du locataire/);
  });

  it('edl-entree-signe : relevé compteurs interpolé', () => {
    const ctx = { ...ctxAlpha(), dateEDL: '2026-06-15', compteurElec: 'HP 12345 / HC 6789', compteurGaz: '3456', compteurEauF: '432.1', compteurEauC: '210.5' };
    const r = _emailCompose('edl-entree-signe', ctx);
    expect(r.body).toMatch(/HP 12345 \/ HC 6789/);
    expect(r.body).toMatch(/3456/);
    expect(r.body).toMatch(/10 jours/);
    expect(r.attachments[0].name).toMatch(/EDL-entree/);
  });

  it('bienvenue-infos-pratiques : infos pratiques interpolées', () => {
    const ctx = { ...ctxAlpha(), contactEau: 'Eaux du Rhône — 04XXX',
      technologiesDispo: 'fibre + ADSL', jourCollecteOM: 'mardi', jourCollecteTri: 'jeudi',
      localPoubelles: 'sous-sol côté cave', syndic: 'Cabinet Foncia', contactGardien: 'M. Martin — 06XX',
      contactUrgence: 'syndic 24/7 + bailleur' };
    const r = _emailCompose('bienvenue-infos-pratiques', ctx);
    expect(r.body).toMatch(/Eaux du Rhône/);
    expect(r.body).toMatch(/Cabinet Foncia/);
    expect(r.body).toMatch(/MRH/);
    expect(r.subject).toMatch(/Bienvenue/);
  });

  it('dg-recu : montant DG + date versement', () => {
    const ctx = { ...ctxAlpha(), dateVersement: '2026-06-15' };
    const r = _emailCompose('dg-recu', ctx);
    expect(r.subject).toMatch(/dépôt de garantie/);
    expect(r.body).toMatch(/2026-06-15/);
    expect(r.body).toMatch(/article 22 de la loi/);
  });
});

describe('EMAIL-AUTO extension v15.09 — Vie du bail', () => {
  it('demande-attest-entretien-chauffage : année + référence légale', () => {
    const ctx = { ...ctxAlpha(), annee: 2026 };
    const r = _emailCompose('demande-attest-entretien-chauffage', ctx);
    expect(r.subject).toMatch(/2026/);
    expect(r.body).toMatch(/R224-31/);
    expect(r.body).toMatch(/décret n° 2009-649/);
  });

  it('demande-attest-mrh : date fin MRH interpolée + article 7g', () => {
    const ctx = { ...ctxAlpha(), dateFinMRH: '2026-09-30' };
    const r = _emailCompose('demande-attest-mrh', ctx);
    expect(r.body).toMatch(/2026-09-30/);
    expect(r.body).toMatch(/article 7g/);
    expect(r.body).toMatch(/10 %/);
  });

  it('notification-travaux-a-venir : nature + date + durée', () => {
    const ctx = { ...ctxAlpha(), natureTravaux: 'Ravalement façade', dateDebut: '2026-09-01',
      dureeEstimee: '4 semaines', intervenant: 'Entreprise BTP Sud', detailContexte: '' };
    const r = _emailCompose('notification-travaux-a-venir', ctx);
    expect(r.body).toMatch(/Ravalement façade/);
    expect(r.body).toMatch(/4 semaines/);
    expect(r.body).toMatch(/21 jours ouvrés/);
  });

  it('notification-visite : 3 créneaux proposés', () => {
    const ctx = { ...ctxAlpha(), motifVisite: 'Diagnostic électrique',
      creneau1: 'Mer 12/06 14h', creneau2: 'Jeu 13/06 10h', creneau3: 'Ven 14/06 16h' };
    const r = _emailCompose('notification-visite', ctx);
    expect(r.body).toMatch(/Diagnostic électrique/);
    expect(r.body).toMatch(/Mer 12\/06 14h/);
    expect(r.legalNote).toMatch(/violation de domicile/);
  });
});

describe('EMAIL-AUTO extension v15.09 — Fin de bail', () => {
  it('bail-renouvellement-3ans : date fin + note révision', () => {
    const ctx = { ...ctxAlpha(), dateFin: '2028-12-31', noteRevisionLoyer: 'Nous envisageons une révision art. 17-2.' };
    const r = _emailCompose('bail-renouvellement-3ans', ctx);
    expect(r.body).toMatch(/2028-12-31/);
    expect(r.body).toMatch(/tacitement reconduit/);
    expect(r.body).toMatch(/art\. 17-2/);
  });

  it('bail-conge-bailleur-6mois : LRAR + motif obligatoire', () => {
    const ctx = { ...ctxAlpha(), motifConge: 'vente', motifDetail: 'Cession du bien à un tiers',
      dateFin: '2027-06-30', dateLettre: '2026-12-31' };
    const r = _emailCompose('bail-conge-bailleur-6mois', ctx);
    expect(r.body).toMatch(/Lettre recommandée/);
    expect(r.body).toMatch(/Cession du bien/);
    expect(r.body).toMatch(/2027-06-30/);
    expect(r.body).toMatch(/article 15-II/);
    expect(r.legalNote).toMatch(/LRAR/);
  });

  it('bail-preavis-recu : durée préavis + date EDL sortie', () => {
    const ctx = { ...ctxAlpha(), datePreavis: '2026-04-01', typeBail: 'nu', dureePreavis: '3',
      dateFinPreavis: '2026-07-01', motifReduction: 'mutation professionnelle',
      dateEDLSortie: '2026-06-30', heureEDLSortie: '14h' };
    const r = _emailCompose('bail-preavis-recu', ctx);
    expect(r.body).toMatch(/préavis/);
    expect(r.body).toMatch(/mutation professionnelle/);
    expect(r.body).toMatch(/2026-06-30/);
  });
});

describe('EMAIL-AUTO extension v15.09 — Sortie & solde', () => {
  it('edl-sortie-signe : comparatif compteurs + bilan', () => {
    const ctx = { ...ctxAlpha(), dateEDL: '2026-06-30',
      comparatifCompteurs: 'consommations cohérentes',
      degradationsBilan: 'Aucune dégradation',
      conclusionEDL: 'Logement restitué en bon état.' };
    const r = _emailCompose('edl-sortie-signe', ctx);
    expect(r.body).toMatch(/consommations cohérentes/);
    expect(r.body).toMatch(/Aucune dégradation/);
    expect(r.attachments[0].name).toMatch(/EDL-sortie/);
  });

  it('dg-restitution-integrale : virement IBAN + délai 1 mois', () => {
    const ctx = { ...ctxAlpha(), dateEDLSortie: '2026-06-30',
      ibanLocataire: 'FR76 1234 5678 ...', dateRestitution: '2026-07-25' };
    const r = _emailCompose('dg-restitution-integrale', ctx);
    expect(r.body).toMatch(/intégralité/);
    expect(r.body).toMatch(/2026-07-25/);
    expect(r.body).toMatch(/délai légal d'un mois/);
    expect(r.legalNote).toMatch(/10 %/);
  });

  it('dg-restitution-partielle : retenues détaillées + IBAN', () => {
    const ctx = { ...ctxAlpha(), dateEDLSortie: '2026-06-30',
      detailRetenues: '• Peinture séjour : 280 €\n• Joint salle de bain : 60 €',
      montantRetenu: '340', soldeRestitue: '900',
      ibanLocataire: 'FR76 1234', dateRestitution: '2026-08-30' };
    const r = _emailCompose('dg-restitution-partielle', ctx);
    expect(r.body).toMatch(/Peinture séjour : 280/);
    expect(r.body).toMatch(/2 mois/);
    expect(r.legalNote).toMatch(/Justificatifs OBLIGATOIRES/);
  });

  it('solde-tout-compte : crédits + débits + solde net', () => {
    const ctx = { ...ctxAlpha(), tropPercuCharges: '120', autresCredits: '0',
      totalCredit: '1360', loyerImpaye: '0', chargesDues: '0', retenuesDG: '340',
      autresDebits: '0', totalDebit: '340', soldeNet: '1020', senseSolde: 'à votre profit',
      instructionsReglement: 'Virement effectué le 2026-08-30 sur votre IBAN.' };
    const r = _emailCompose('solde-tout-compte', ctx);
    expect(r.body).toMatch(/Solde net : 1020/);
    expect(r.body).toMatch(/à votre profit/);
  });

  it('attestation-logement-libere : libération + signataire', () => {
    const ctx = { ...ctxAlpha(), dateLiberation: '2026-06-30',
      dateEDLSortie: '2026-06-30', modaliteRemiseClef: 'en main propre',
      dateAttestation: '2026-07-01' };
    const r = _emailCompose('attestation-logement-libere', ctx);
    expect(r.subject).toMatch(/Attestation/);
    expect(r.body).toMatch(/2026-06-30/);
    expect(r.body).toMatch(/changement d'adresse/);
  });
});

describe('EMAIL-AUTO extension v15.09 — variables manquantes (fallback (inconnu))', () => {
  it('Variable manquante → "(inconnu)"', () => {
    const r = _emailCompose('bail-pret-a-signer', { locataire: { nom: 'TEST' }, bail: { adrBien: 'ADR' } });
    expect(r.body).toMatch(/\(inconnu\)/);
  });

  it('Toutes les variables manquantes → toujours générable', () => {
    const r = _emailCompose('dg-restitution-partielle', {});
    expect(r.body).toBeDefined();
    expect(r.body).toMatch(/\(inconnu\)/);
    expect(r.error).toBeUndefined();
  });
});
