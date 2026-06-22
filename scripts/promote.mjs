// Promote the agent-company to your USER-level Claude config (~/.claude) so the
// agents, workflows, and skill are available in EVERY Claude Code project — AND
// install a global hook so the dashboard shows real-time activity from any project.
// Run from the project root:  npm run promote
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '.claude');
const home = join(homedir(), '.claude');

// 1) agents / workflows / skills → ~/.claude (usable from every project)
for (const sub of ['agents', 'workflows', 'skills']) {
  mkdirSync(join(home, sub), { recursive: true });
  cpSync(join(src, sub), join(home, sub), { recursive: true });
  console.log(`✓ ${sub} → ${join(home, sub)}`);
}

// 2) hook script → ~/.claude/agent-company/ (writes agents.json next to itself)
const sharedDir = join(home, 'agent-company');
mkdirSync(sharedDir, { recursive: true });
cpSync(join(src, 'hooks', 'track-agent.mjs'), join(sharedDir, 'track-agent.mjs'));
console.log(`✓ hook → ${join(sharedDir, 'track-agent.mjs')}`);

// 3) register global hooks in ~/.claude/settings.json (merge, idempotent)
const settingsPath = join(home, 'settings.json');
let settings = {};
if (existsSync(settingsPath)) {
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { settings = {}; }
}
settings.hooks = settings.hooks || {};
const scriptPath = join(sharedDir, 'track-agent.mjs').replaceAll('\\', '/'); // node accepts forward slashes on Windows
const MARK = 'agent-company/track-agent.mjs';
const present = (arr) => (arr || []).some((g) => (g.hooks || []).some((h) => (h.command || '').includes(MARK)));

function addHook(event, arg, matcher) {
  settings.hooks[event] = settings.hooks[event] || [];
  if (present(settings.hooks[event])) return false;
  const entry = { hooks: [{ type: 'command', command: `node "${scriptPath}" ${arg}` }] };
  if (matcher) entry.matcher = matcher;
  settings.hooks[event].push(entry);
  return true;
}
const added = [addHook('PreToolUse', 'pre', 'Task|Agent'), addHook('SubagentStop', 'stop', null)].some(Boolean);
writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
console.log(`✓ global hooks ${added ? 'registered' : 'already present'} in ${settingsPath}`);

console.log('\nPromoted agent-company globally — agents · workflows · skill · live hooks.');
console.log(`Live data: ${join(sharedDir, 'agents.json')}  (read by the dashboard via /shared)`);
console.log('Open a NEW Claude Code session so the global hooks load, then `npm run dashboard` here.');
