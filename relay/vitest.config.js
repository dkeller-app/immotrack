import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['test/**/*.test.js'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        isolatedStorage: false,
        miniflare: {
          bindings: {
            SIGNING_SECRET: 'test-secret-please-change-test-secret-please-change',
            APP_KEY: 'test-app-key'
          }
        }
      }
    }
  }
});
