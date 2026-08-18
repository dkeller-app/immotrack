import { describe, it, expect } from 'vitest';
import {
  IRL_IDBANK, urlIrlBdm, cleIrl, timePeriodDeCle, parseIrlSdmx,
  doitSynchroniser, fusionnerIrlTable, completerAvecFilet, anneeDepart
} from '../../js/core/irl-insee.js';

/**
 * CDC-QUITTANCES-IRL étape 7 (D20) — la table IRL se met à jour seule.
 * Invariants : I11 (l'API n'écrase rien), I12 (hors ligne, le filet prend le relais).
 */

// Réponse SDMX conforme à celle observée le 18/08/2026 (série 001515333).
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<message:StructureSpecificData xmlns:message="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message">
 <message:DataSet>
  <Series IDBANK="001515333" FREQ="T" TITLE_FR="Indice de référence des loyers">
   <Obs TIME_PERIOD="2025-Q1" OBS_VALUE="143.46" DATE_JO="2025-04-15" OBS_STATUS="A"/>
   <Obs TIME_PERIOD="2025-Q2" OBS_VALUE="145.30" DATE_JO="2025-07-12" OBS_STATUS="A"/>
   <Obs TIME_PERIOD="2026-Q1" OBS_VALUE="147.02" DATE_JO="2026-04-14" OBS_STATUS="A"/>
   <Obs TIME_PERIOD="2026-Q2" OBS_VALUE="148.37" DATE_JO="2026-07-12" OBS_STATUS="A"/>
  </Series>
 </message:DataSet>
</message:StructureSpecificData>`;

/** DOMParser de substitution : prouve que les deux chemins de lecture concordent. */
const fauxDomParser = {
  parseFromString(src) {
    const nodes = [];
    const re = /<Obs\b([^>]*)\/?>/g;
    let m;
    while ((m = re.exec(src))) {
      const at = m[1];
      nodes.push({
        getAttribute(nom) {
          const mm = at.match(new RegExp(nom + '\\s*=\\s*"([^"]*)"'));
          return mm ? mm[1] : null;
        }
      });
    }
    return { getElementsByTagName: (t) => (t === 'Obs' ? nodes : []) };
  }
};

describe('Adressage de la série INSEE', () => {
  it('l\'IDBANK est celui de l\'IRL, et l\'URL est bornée au millésime utile', () => {
    expect(IRL_IDBANK).toBe('001515333');
    expect(urlIrlBdm(2024)).toBe('https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/001515333?startPeriod=2024-Q1');
    expect(urlIrlBdm('x')).toBe('https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/001515333');
  });
  it('l\'année de départ remonte de deux ans (il faut N et N-1)', () => {
    expect(anneeDepart('2026-08-18')).toBe(2024);
  });
  it('les clés font l\'aller-retour entre le format INSEE et celui de la table', () => {
    expect(cleIrl('2026-Q2')).toBe('T2 2026');
    expect(cleIrl('2026-Q5')).toBe('');
    expect(cleIrl('')).toBe('');
    expect(timePeriodDeCle('T2 2026')).toBe('2026-Q2');
    expect(timePeriodDeCle('bidule')).toBe('');
  });
});

describe('Lecture du SDMX', () => {
  it('extrait trimestre, valeur et DATE DE PUBLICATION AU JO', () => {
    const obs = parseIrlSdmx(XML);
    expect(obs).toHaveLength(4);
    expect(obs[3]).toEqual({ cle: 'T2 2026', timePeriod: '2026-Q2', valeur: 148.37, dateJo: '2026-07-12' });
  });
  it('le chemin DOMParser (navigateur) et le repli donnent le MÊME résultat', () => {
    expect(parseIrlSdmx(XML, { domParser: fauxDomParser })).toEqual(parseIrlSdmx(XML));
  });
  it('trie par période croissante', () => {
    expect(parseIrlSdmx(XML).map(o => o.timePeriod))
      .toEqual(['2025-Q1', '2025-Q2', '2026-Q1', '2026-Q2']);
  });
  it('ignore une observation sans valeur exploitable', () => {
    const xml = XML.replace('OBS_VALUE="148.37"', 'OBS_VALUE=""');
    expect(parseIrlSdmx(xml).map(o => o.cle)).not.toContain('T2 2026');
  });
  it('réponse vide, tronquée ou non-XML → tableau vide, jamais d\'exception', () => {
    expect(parseIrlSdmx('')).toEqual([]);
    expect(parseIrlSdmx(null)).toEqual([]);
    expect(parseIrlSdmx('<html>503 Service Unavailable</html>')).toEqual([]);
    expect(parseIrlSdmx('<Obs TIME_PERIOD="2026-Q2"')).toEqual([]);
  });
  it('un DOMParser qui jette n\'empêche pas la lecture', () => {
    const casse = { parseFromString() { throw new Error('boom'); } };
    expect(parseIrlSdmx(XML, { domParser: casse })).toHaveLength(4);
  });
});

describe('D20 — au plus une lecture par jour', () => {
  it('jamais synchronisé → oui', () => {
    expect(doitSynchroniser('', '2026-08-18')).toBe(true);
    expect(doitSynchroniser(null, '2026-08-18')).toBe(true);
  });
  it('déjà synchronisé aujourd\'hui → non', () => {
    expect(doitSynchroniser('2026-08-18T09:12:00Z', '2026-08-18')).toBe(false);
  });
  it('synchronisé hier → oui', () => {
    expect(doitSynchroniser('2026-08-17', '2026-08-18')).toBe(true);
  });
  it('date du jour invalide → on ne tente rien', () => {
    expect(doitSynchroniser('', 'nope')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  I11 — l'API n'écrase rien
// ═══════════════════════════════════════════════════════════════════════════

describe('I11 — une valeur saisie à la main survit à une synchronisation', () => {
  const DEF = { 'T1 2025': 143.46, 'T2 2025': 145.30, 'T1 2026': 147.02 };

  it('ajoute les trimestres manquants (T2 2026 publié le 12/07/2026 — le cas C9)', () => {
    const r = fusionnerIrlTable({ ...DEF }, parseIrlSdmx(XML), { defaults: DEF, todayIso: '2026-08-18' });
    expect(r.table['T2 2026']).toBe(148.37);
    expect(r.ajouts.map(a => a.cle)).toEqual(['T2 2026']);
    expect(r.meta['T2 2026']).toMatchObject({ source: 'insee', dateJo: '2026-07-12' });
    expect(r.divergences).toEqual([]);
  });

  it('une valeur marquée « manuel » n\'est PAS écrasée — la divergence est signalée', () => {
    const table = { ...DEF, 'T1 2026': 999 };
    const meta = { 'T1 2026': { source: 'manuel' } };
    const r = fusionnerIrlTable(table, parseIrlSdmx(XML), { defaults: DEF, meta, todayIso: '2026-08-18' });
    expect(r.table['T1 2026']).toBe(999);
    expect(r.divergences).toEqual([
      { cle: 'T1 2026', valeurLocale: 999, valeurInsee: 147.02, dateJo: '2026-04-14' }
    ]);
    expect(r.meta['T1 2026'].source).toBe('manuel');
    expect(r.meta['T1 2026'].divergence).toBe(147.02);
  });

  it('sans méta (données antérieures), une valeur qui S\'ÉCARTE du filet est réputée manuelle', () => {
    const table = { ...DEF, 'T1 2026': 150.00 };
    const r = fusionnerIrlTable(table, parseIrlSdmx(XML), { defaults: DEF, todayIso: '2026-08-18' });
    expect(r.table['T1 2026']).toBe(150.00);
    expect(r.divergences).toHaveLength(1);
  });

  it('une valeur encore ÉGALE au filet est réputée non touchée : elle peut être corrigée', () => {
    const table = { ...DEF, 'T2 2025': 145.30 };
    const obs = parseIrlSdmx(XML.replace('OBS_VALUE="145.30"', 'OBS_VALUE="145.31"'));
    const r = fusionnerIrlTable(table, obs, { defaults: DEF, todayIso: '2026-08-18' });
    expect(r.table['T2 2025']).toBe(145.31);
    expect(r.majs).toEqual([{ cle: 'T2 2025', avant: 145.30, apres: 145.31, dateJo: '2025-07-12' }]);
    expect(r.divergences).toEqual([]);
  });

  it('la fusion est IDEMPOTENTE : deux passes donnent la même table', () => {
    const obs = parseIrlSdmx(XML);
    const r1 = fusionnerIrlTable({ ...DEF }, obs, { defaults: DEF, todayIso: '2026-08-18' });
    const r2 = fusionnerIrlTable(r1.table, obs, { defaults: DEF, meta: r1.meta, todayIso: '2026-08-19' });
    expect(r2.table).toEqual(r1.table);
    expect(r2.ajouts).toEqual([]);
    expect(r2.majs).toEqual([]);
    expect(r2.divergences).toEqual([]);
  });

  it('la table d\'entrée n\'est jamais mutée', () => {
    const table = { ...DEF };
    const copie = { ...table };
    fusionnerIrlTable(table, parseIrlSdmx(XML), { defaults: DEF });
    expect(table).toEqual(copie);
  });

  it('la date du JO est conservée même quand la valeur ne bouge pas', () => {
    const r = fusionnerIrlTable({ ...DEF }, parseIrlSdmx(XML), { defaults: DEF });
    expect(r.meta['T1 2025'].dateJo).toBe('2025-04-15');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  I12 — hors ligne
// ═══════════════════════════════════════════════════════════════════════════

describe('I12 — sans réseau, IRL_DEFAULT prend le relais et rien ne casse', () => {
  const DEF = { 'T1 2025': 143.46, 'T2 2025': 145.30, 'T1 2026': 147.02 };

  it('aucune observation → la table sort inchangée', () => {
    const table = { ...DEF, 'T2 2026': 148.37 };
    const r = fusionnerIrlTable(table, [], { defaults: DEF });
    expect(r.table).toEqual(table);
    expect(r.ajouts).toEqual([]);
    expect(r.divergences).toEqual([]);
  });

  it('réponse illisible (503, HTML, vide) → aucune observation, donc aucun effet', () => {
    for (const rep of ['', '<html>503</html>', null]) {
      const r = fusionnerIrlTable({ ...DEF }, parseIrlSdmx(rep), { defaults: DEF });
      expect(r.table).toEqual(DEF);
    }
  });

  it('le filet complète les trimestres inconnus, sans jamais remplacer l\'existant', () => {
    const t = completerAvecFilet({ 'T1 2025': 999 }, DEF);
    expect(t['T1 2025']).toBe(999);          // valeur locale préservée
    expect(t['T2 2025']).toBe(145.30);       // filet posé
    expect(Object.keys(t).sort()).toEqual(Object.keys(DEF).sort());
  });

  it('completerAvecFilet est idempotent et tolère les entrées vides', () => {
    const a = completerAvecFilet({}, DEF);
    expect(completerAvecFilet(a, DEF)).toEqual(a);
    expect(completerAvecFilet(null, DEF)).toEqual(DEF);
    expect(completerAvecFilet({ x: 1 }, null)).toEqual({ x: 1 });
  });

  it('une valeur tombstone (objet, pas un nombre) est remplacée par le filet', () => {
    // DB.irlTable peut porter des tombstones {_deleted:true} après une purge.
    const t = completerAvecFilet({ 'T1 2025': { _deleted: true } }, DEF);
    expect(t['T1 2025']).toBe(143.46);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Constats d'audit — I11 troué sur les clés hors filet, et tombstones ressuscités
// ═══════════════════════════════════════════════════════════════════════════

describe('Audit — la fusion ne perd ni n\'écrase rien', () => {
  const DEF = { 'T1 2025': 143.46, 'T2 2025': 145.30, 'T1 2026': 147.02 };
  const obs = parseIrlSdmx(XML);

  it('I11 — un trimestre saisi à la main ABSENT du filet est protégé', () => {
    // C'est le cas de `quickAddIRL` : on saisit le trimestre qui manque pour débloquer une
    // révision. Sans méta et sans défaut, il était écrasé en silence au boot suivant.
    const r = fusionnerIrlTable({ ...DEF, 'T2 2026': 999 }, obs, { defaults: DEF });
    expect(r.table['T2 2026']).toBe(999);
    expect(r.divergences).toEqual([
      { cle: 'T2 2026', valeurLocale: 999, valeurInsee: 148.37, dateJo: '2026-07-12' }
    ]);
  });

  it('un trimestre SUPPRIMÉ (tombstone) n\'est pas ressuscité par la synchronisation', () => {
    const table = { ...DEF, 'T1 2026': { _deleted: true, _deletedAt: '2026-08-01' } };
    const r = fusionnerIrlTable(table, obs, { defaults: DEF });
    expect(r.table['T1 2026']).toEqual({ _deleted: true, _deletedAt: '2026-08-01' });
    expect(r.ajouts.map(a => a.cle)).not.toContain('T1 2026');
    expect(r.majs.map(a => a.cle)).not.toContain('T1 2026');
  });

  it('un tombstone n\'empêche pas les AUTRES trimestres d\'arriver', () => {
    const table = { ...DEF, 'T1 2026': { _deleted: true } };
    const r = fusionnerIrlTable(table, obs, { defaults: DEF });
    expect(r.table['T2 2026']).toBe(148.37);
  });
});
