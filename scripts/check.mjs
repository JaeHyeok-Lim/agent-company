// Smoke check (AUDIT-0003): JSON validity, JS syntax, and workflow harness-shape parse.
// Run from the project root:  npm run check
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  BAD  ${m}`); failures++; };

// 1) JSON parses
for (const f of ['package.json', '.mcp.json', '.claude/settings.json', 'dashboard/roster.json']) {
  try { JSON.parse(readFileSync(join(root, f), 'utf8')); ok(`json    ${f}`); }
  catch (e) { bad(`json    ${f} — ${e.message}`); }
}

// 2) plain JS / MJS syntax (node --check)
for (const f of ['dashboard/app.js', 'dashboard/serve.mjs', 'scripts/promote.mjs', 'scripts/check.mjs', '.claude/hooks/track-agent.mjs']) {
  try { execFileSync(process.execPath, ['--check', join(root, f)], { stdio: 'pipe' }); ok(`syntax  ${f}`); }
  catch (e) { bad(`syntax  ${f} — ${(e.stderr || e.message || '').toString().split('\n')[0]}`); }
}

// 3) workflows: parse under the Workflow harness shape (export meta + top-level await/return)
const AF = Object.getPrototypeOf(async function () {}).constructor;
const wfDir = join(root, '.claude/workflows');
for (const f of readdirSync(wfDir).filter((n) => n.endsWith('.js'))) {
  try {
    const src = readFileSync(join(wfDir, f), 'utf8').replace(/^export\s+const\s+meta/m, 'const meta');
    new AF('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow', src);
    ok(`flow    ${f}`);
  } catch (e) { bad(`flow    ${f} — ${e.message}`); }
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed');
process.exit(failures ? 1 : 0);
