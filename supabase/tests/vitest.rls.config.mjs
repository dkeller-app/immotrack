import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    include: ['supabase/tests/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 30000,   // réseau : un projet hébergé EU répond plus lentement qu'en local
    hookTimeout: 30000,
    fileParallelism: false // les tests partagent des users/espaces → exécution sérielle
  }
})
