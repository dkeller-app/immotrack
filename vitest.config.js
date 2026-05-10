/**
 * Vitest config minimale ImmoTrack
 *
 * Pourquoi Vitest plutôt que Jest :
 *   - ESM natif (pas de Babel à configurer)
 *   - Démarrage ultra-rapide (~1s vs 5-10s pour Jest)
 *   - Compatible si on passe à Vite plus tard (ARCHI-MODULAR option 3)
 *   - API identique à Jest (describe/it/expect)
 *
 * Scope tests V1 : helpers PURS uniquement (pas d'UI, pas de DOM).
 * - Calculs : _loyerHCAtDate, computeIRLRevision, calc charges récup
 * - Parsers : dates, montants, IRL
 * - Validators : DPE, garde-fou HC
 *
 * Scope tests V2 (post ARCHI-MODULAR) :
 * - DOM/UI avec @vitest/jsdom
 * - Mocks Drive sync
 * - Composants (modal, toast, kpi-tile)
 *
 * Lancer les tests :
 *   npm install         # 1ère fois uniquement
 *   npm test            # mode watch (interactif)
 *   npm run test:run    # 1 passe puis exit (CI)
 *   npm run test:ui     # interface graphique navigateur
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Globals (describe/it/expect) sans import explicite
    globals: false,

    // Pattern de fichiers tests
    include: ['__tests__/**/*.test.{js,mjs}'],

    // Ne PAS scanner index.html, sw.js, ni les vieux fichiers
    exclude: ['node_modules', 'dist', '.git', '.claude', 'Sauvegardes', 'EDL (1)', 'docs'],

    // Environnement par défaut : node (pas de DOM)
    // Si test UI plus tard : changer en 'jsdom' + npm install -D jsdom
    environment: 'node',

    // Reporter clair
    reporters: ['default'],

    // Timeout par test (5s par défaut)
    testTimeout: 5000
  }
})
