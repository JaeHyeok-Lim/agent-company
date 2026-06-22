// Promote the agent-company to your USER-level Claude config (~/.claude) so the
// agents, workflows, and skill are available in EVERY Claude Code project.
// Run from the project root:  npm run promote
import { cpSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '.claude');
const dst = join(homedir(), '.claude');

for (const sub of ['agents', 'workflows', 'skills']) {
  mkdirSync(join(dst, sub), { recursive: true });
  cpSync(join(src, sub), join(dst, sub), { recursive: true });
  console.log(`✓ ${sub} → ${join(dst, sub)}`);
}
console.log('\nPromoted agent-company globally. Use the roles/workflows from any project.');
console.log('(Dashboard + hooks stay project-local — run `npm run dashboard` here to watch.)');
