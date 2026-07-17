import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Global setup — runs once before the whole suite.
 *
 * Copies the seeded dev database to an isolated test database so integration
 * tests get a realistic, fully-seeded dataset without ever mutating the dev DB.
 * Any `-wal` / `-shm` sidecars are copied too (the dev server may run in WAL
 * mode), and stale test sidecars are cleared first so each run starts clean.
 */
const SRC = resolve(process.cwd(), 'prisma/prisma/fintech.db');
const DST = resolve(process.cwd(), 'prisma/prisma/fintech.test.db');
const SIDECARS = ['-wal', '-shm', '-journal'];

export default function setup() {
  if (!existsSync(SRC)) {
    throw new Error(
      `Seeded database not found at ${SRC}. Run "npm run setup" in apps/fintech/backend first.`,
    );
  }

  // Clear any leftover test DB + sidecars from a previous run.
  for (const suffix of ['', ...SIDECARS]) {
    const f = DST + suffix;
    if (existsSync(f)) rmSync(f, { force: true });
  }

  copyFileSync(SRC, DST);
  for (const suffix of SIDECARS) {
    if (existsSync(SRC + suffix)) copyFileSync(SRC + suffix, DST + suffix);
  }
}
