import { execFileSync } from 'node:child_process';
import { serverEnv } from './playwright.config';

/** Creates the demo accounts in the e2e database. The seed is idempotent. */
export default function globalSetup(): void {
  execFileSync(
    'pnpm',
    ['--filter', '@taskboard/api', 'exec', 'tsx', '--conditions=source', 'src/scripts/seed.ts'],
    { env: { ...process.env, ...serverEnv }, stdio: 'inherit' },
  );
}
