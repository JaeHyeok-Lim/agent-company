#!/usr/bin/env node
// Live-state tracker for the agent-company dashboard.
// Wired via Claude Code hooks in .claude/settings.json:
//   PreToolUse (Task|Agent) -> "pre"  : a subagent starts -> add a working instance
//   SubagentStop            -> "stop" : a subagent finishes -> mark oldest active instance done
// Tracks PER-INSTANCE so multiple agents of the same role (headcount > 1) show individually.
// Writes .claude/state/agents.json which the dashboard polls. Never blocks (always exit 0).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const mode = process.argv[2] || 'pre';
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stateFile = join(projectDir, '.claude', 'state', 'agents.json');
const MAX_INSTANCES = 60;

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}
function loadState() {
  try { return JSON.parse(readFileSync(stateFile, 'utf8')); }
  catch { return { instances: {}, active: [], updated: null }; }
}
function saveState(s) {
  s.updated = new Date().toISOString();
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(s, null, 2));
}
function prune(s) {
  const ids = Object.keys(s.instances);
  if (ids.length <= MAX_INSTANCES) return;
  const done = ids
    .filter((i) => s.instances[i].status === 'done')
    .sort((a, b) => String(s.instances[a].since).localeCompare(String(s.instances[b].since)));
  for (const i of done.slice(0, ids.length - MAX_INSTANCES)) delete s.instances[i];
}

let input = {};
try { input = JSON.parse(readStdin() || '{}'); } catch { /* tolerate non-JSON */ }

const state = loadState();
state.instances = state.instances || {};
state.active = state.active || [];
const now = new Date().toISOString();

if (mode === 'pre') {
  const ti = input.tool_input || {};
  const role = ti.subagent_type || ti.subagentType || 'unknown';
  const task = String(ti.description || ti.prompt || '').slice(0, 160);
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  const id = `${role}-${Date.now().toString(36)}-${rand}`;
  state.instances[id] = { role, status: 'working', task, since: now };
  state.active.push(id);
  prune(state);
} else if (mode === 'stop') {
  // v1 heuristic: SubagentStop doesn't carry the instance, so mark the oldest
  // still-active instance done. Parallel agents may resolve out of order.
  const id = state.active.shift();
  if (id && state.instances[id]) {
    state.instances[id].status = 'done';
    state.instances[id].since = now;
  }
}

try { saveState(state); } catch { /* never block the agent on a dashboard write */ }
process.exit(0);
