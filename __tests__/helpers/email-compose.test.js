/**
 * Tests pour js/core/email-compose.js (EMAIL-AUTO V1 Phase 1)
 *
 * Couverture :
 *  - _interpolateEmail (résolution path, fallback "(inconnu)", escape HTML)
 *  - _emailTypesSupportes (liste exhaustive 10 types)
 *  - _emailCompose : 1 test par type (10) + variable manquante + ctx vide + type inconnu + escape HTML
 *  - _logEmailSent / _getEmailHistory (Phase 3)
 */
import { describe, it, expect } from 'vitest';
import {
  _emailCompose,
  _emailTypesSupportes,
  _interpolateEmail
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

  it('contient les 10 types V1', () => {
    const types = _emailTypesSupportes();
    expect(types).toHaveLength(10);
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
