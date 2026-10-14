import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile('.env');
} catch {
  // no .env: CI passes DATABASE_URL_TEST directly
}

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Integration tests share one database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
