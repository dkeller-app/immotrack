/**
 * Tests Vitest pour les helpers DRIVE-PARTAGE-PICKER Phase 4 (« 1 fichier par user »).
 * v15.168 — pattern validé : chaque instance d'app écrit uniquement ses propres fichiers
 * tagués, sur 403 PATCH crée son propre fichier.
 *
 * Note : les helpers vivent dans index.html (pas dans un module ES6) parce qu'ils
 * dépendent de `_userEmail`, `localStorage`, `_driveToken`. On reproduit ici la logique
 * pure (userTag, choix de fichier, naming convention) pour pouvoir la tester en isolé.
 *
 * Source de vérité : index.html lignes ~38860+ (`_drvUserTag`, `_drvMyEntityFiles`).
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ─── Reproduction des helpers purs (miroir d'index.html) ─────────────────────

/**
 * Hash FNV-1a 32-bit d'une chaîne, troncqué à 6 hex.
 * Doit être stable : même input → même output. Cross-device si même email.
 */
function _drvUserTag(email, installId) {
  let src = (typeof email === 'string' && email) ? email.toLowerCase().trim() : '';
  if (!src) src = installId || 'inst-fallback';
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 6);
}

/**
 * Détermine le nom de fichier pour un save entité, selon que je suis le propriétaire
 * originel (1er save) ou un co-gestionnaire (PATCH a 403, je crée mon fichier tagué).
 */
function _drvEntityFileName(entityId, tag, isCoGestionnaire) {
  return isCoGestionnaire
    ? `immotrack-entity-${entityId}__${tag}.json`
    : `immotrack-entity-${entityId}.json`;
}

/**
 * Filtre une liste de fichiers Drive pour ne garder que les vrais fichiers global
 * (immotrack-global.json ou immotrack-global__{tag}.json) — pas les noms qui contiennent
 * juste « immotrack-global » par accident (ex : immotrack-global-backup-2026.json).
 */
function _filterGlobalFiles(files) {
  return files.filter(f =>
    /^immotrack-global(__[a-z0-9]+)?\.json$/i.test(f.name || '')
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('_drvUserTag', () => {
  it('produit un tag de 6 caractères hex', () => {
    const t = _drvUserTag('marion@gmail.com');
    expect(t).toMatch(/^[0-9a-f]{6}$/);
  });

  it('est stable (même email → même tag à chaque appel)', () => {
    const t1 = _drvUserTag('marion@gmail.com');
    const t2 = _drvUserTag('marion@gmail.com');
    expect(t1).toBe(t2);
  });

  it('est insensible à la casse et aux espaces (normalisation)', () => {
    const t1 = _drvUserTag('Marion@Gmail.com');
    const t2 = _drvUserTag('  marion@gmail.com  ');
    const t3 = _drvUserTag('marion@gmail.com');
    expect(t1).toBe(t3);
    expect(t2).toBe(t3);
  });

  it('produit des tags différents pour des emails différents', () => {
    const tMarion = _drvUserTag('marion@gmail.com');
    const tDidier = _drvUserTag('didier@gmail.com');
    expect(tMarion).not.toBe(tDidier);
  });

  it('fallback sur installId si email absent', () => {
    const t1 = _drvUserTag('', 'inst-abc123');
    const t2 = _drvUserTag(null, 'inst-abc123');
    const t3 = _drvUserTag(undefined, 'inst-abc123');
    expect(t1).toBe(t2);
    expect(t2).toBe(t3);
  });

  it('email vide + installId vide → fallback déterministe « inst-fallback »', () => {
    const t = _drvUserTag('', '');
    expect(t).toMatch(/^[0-9a-f]{6}$/);
    expect(t).toBe(_drvUserTag('', '')); // déterministe
  });

  it('un même utilisateur a le même tag sur tous ses devices (cross-device stable)', () => {
    // Simulation : 2 devices différents, même email Google → doit produire le même tag
    const tagPC = _drvUserTag('didier.keller@gmail.com');
    const tagTel = _drvUserTag('didier.keller@gmail.com');
    expect(tagPC).toBe(tagTel);
  });
});

describe('_drvEntityFileName', () => {
  it('untagged pour le créateur originel (1er save, pas de fichier connu)', () => {
    const name = _drvEntityFileName('eid-001', 'a3b9c2', false);
    expect(name).toBe('immotrack-entity-eid-001.json');
  });

  it('tagged pour le co-gestionnaire (après 403 sur PATCH)', () => {
    const name = _drvEntityFileName('eid-001', 'a3b9c2', true);
    expect(name).toBe('immotrack-entity-eid-001__a3b9c2.json');
  });

  it('le tag est intégré tel quel dans le nom (pas d\'échappement)', () => {
    const name = _drvEntityFileName('eid-002', 'ff00aa', true);
    expect(name).toContain('__ff00aa.json');
  });

  it('plusieurs co-gestionnaires de la même entité produisent des noms différents', () => {
    const nameMarion = _drvEntityFileName('eid-001', _drvUserTag('marion@gmail.com'), true);
    const nameEC = _drvEntityFileName('eid-001', _drvUserTag('expert@cabinet.fr'), true);
    expect(nameMarion).not.toBe(nameEC);
    // Mais même pattern de base
    expect(nameMarion.startsWith('immotrack-entity-eid-001__')).toBe(true);
    expect(nameEC.startsWith('immotrack-entity-eid-001__')).toBe(true);
  });
});

describe('_filterGlobalFiles', () => {
  it('accepte immotrack-global.json (legacy)', () => {
    const r = _filterGlobalFiles([{ name: 'immotrack-global.json' }]);
    expect(r).toHaveLength(1);
  });

  it('accepte immotrack-global__{tag}.json (tagué)', () => {
    const r = _filterGlobalFiles([{ name: 'immotrack-global__a3b9c2.json' }]);
    expect(r).toHaveLength(1);
  });

  it('rejette les noms qui contiennent juste « immotrack-global » par accident', () => {
    const r = _filterGlobalFiles([
      { name: 'immotrack-global-backup.json' },
      { name: 'my-immotrack-global.json' },
      { name: 'immotrack-global.zip' },
      { name: 'immotrack-global__SPACES IN TAG.json' },
    ]);
    expect(r).toHaveLength(0);
  });

  it('mix : ne garde que les valides', () => {
    const r = _filterGlobalFiles([
      { name: 'immotrack-global.json' },
      { name: 'immotrack-global__a3b9c2.json' },
      { name: 'immotrack-global-backup.json' },     // rejeté
      { name: 'immotrack-entity-eid-001.json' },    // rejeté (entité, pas global)
      { name: 'random.json' },                       // rejeté
    ]);
    expect(r).toHaveLength(2);
    expect(r.map(f => f.name)).toEqual([
      'immotrack-global.json',
      'immotrack-global__a3b9c2.json',
    ]);
  });

  it('liste vide → résultat vide (pas d\'erreur)', () => {
    expect(_filterGlobalFiles([])).toEqual([]);
  });

  it('fichiers sans nom → ignorés (pas de crash)', () => {
    const r = _filterGlobalFiles([{ id: 'x' }, { name: '' }, { name: null }]);
    expect(r).toHaveLength(0);
  });
});

// ─── Simulation de la logique de save (PATCH → 403 → POST tagué) ────────────

/**
 * Simule la logique save : on retourne le fileName qui SERAIT créé selon l'état.
 * @param {object} ctx - { tryFileId, patchOk, userEmail, entityId }
 */
function simulateSaveOneEntity(ctx) {
  const { tryFileId, patchOk, userEmail, entityId } = ctx;
  // Si pas de fichier connu → POST untagged (1er save, je suis créateur)
  if (!tryFileId) {
    return { action: 'POST', name: `immotrack-entity-${entityId}.json` };
  }
  // PATCH tentative
  if (patchOk) {
    return { action: 'PATCH', fileId: tryFileId };
  }
  // PATCH 403/404 → POST tagué
  const tag = _drvUserTag(userEmail);
  return { action: 'POST', name: `immotrack-entity-${entityId}__${tag}.json` };
}

describe('logique save « 1 fichier par user » (simulation)', () => {
  it('1er save (pas de fichier connu) → POST untagged (je suis créateur)', () => {
    const r = simulateSaveOneEntity({
      tryFileId: null,
      patchOk: false,
      userEmail: 'didier@gmail.com',
      entityId: 'eid-001',
    });
    expect(r.action).toBe('POST');
    expect(r.name).toBe('immotrack-entity-eid-001.json');
  });

  it('PATCH OK (je suis propriétaire du fichier connu) → pas de création', () => {
    const r = simulateSaveOneEntity({
      tryFileId: 'drive-file-aaa',
      patchOk: true,
      userEmail: 'didier@gmail.com',
      entityId: 'eid-001',
    });
    expect(r.action).toBe('PATCH');
    expect(r.fileId).toBe('drive-file-aaa');
  });

  it('PATCH 403 (fichier d\'un autre) → POST tagué avec mon userTag', () => {
    const r = simulateSaveOneEntity({
      tryFileId: 'drive-file-bbb',  // fichier de Didier
      patchOk: false,                // Marion essaie de patcher → 403
      userEmail: 'marion@gmail.com',
      entityId: 'eid-001',
    });
    expect(r.action).toBe('POST');
    const tagMarion = _drvUserTag('marion@gmail.com');
    expect(r.name).toBe(`immotrack-entity-eid-001__${tagMarion}.json`);
  });

  it('Didier et Marion sauvent la même entité → 2 fichiers distincts produits', () => {
    // Didier (propriétaire) sauve la 1re fois
    const r1 = simulateSaveOneEntity({
      tryFileId: null,
      patchOk: false,
      userEmail: 'didier@gmail.com',
      entityId: 'eid-001',
    });
    expect(r1.name).toBe('immotrack-entity-eid-001.json');

    // Marion (co-gestionnaire) sauve à son tour : tente PATCH sur le fichier de Didier → 403 → POST tagué
    const r2 = simulateSaveOneEntity({
      tryFileId: 'drive-file-aaa', // le fichier de Didier (importé via pull cross-user)
      patchOk: false,
      userEmail: 'marion@gmail.com',
      entityId: 'eid-001',
    });
    const tagMarion = _drvUserTag('marion@gmail.com');
    expect(r2.name).toBe(`immotrack-entity-eid-001__${tagMarion}.json`);

    // Les 2 fichiers existent en parallèle sur Drive → pull les capte tous les 2 →
    // _mergeEntityPayload est appelé 2 fois → LWW _drvWins tranche.
    expect(r1.name).not.toBe(r2.name);
  });
});
