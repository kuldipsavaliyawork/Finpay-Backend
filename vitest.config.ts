import { defineConfig } from 'vitest/config';

/**
 * Backend test runner.
 *
 * Tests run against an ISOLATED copy of the seeded SQLite database
 * (`prisma/prisma/fintech.test.db`) created fresh by `test/globalSetup.ts`,
 * so they never touch the dev database and a re-run always starts clean.
 *
 * `DATABASE_URL` is injected here (before any module — including Prisma —
 * loads). `dotenv/config` in `src/config.ts` does NOT override variables that
 * are already present in `process.env`, so this value wins over `.env`.
 *
 * A single fork (no file parallelism) guarantees one SQLite connection, which
 * avoids "database is locked" errors from concurrent writers.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./test/globalSetup.ts'],
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./prisma/fintech.test.db',
      JWT_SECRET: 'test-secret-finpay',
      JWT_EXPIRES_IN: '7d',
      CORS_ORIGINS: 'http://localhost:5173',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
    },
  },
});
