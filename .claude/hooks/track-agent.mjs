#!/usr/bin/env node
// Live-state tracker for the agent-company dashboard.
// Wired via Claude Code hooks in .claude/settings.json:
//   PreToolUse (Task|Agent) -> "pre"  : a subagent starts -> mark role "working"
//   SubagentStop            -> "stop" : a subagent finishes -> mark oldest active "done"
// Writes .claude/state/agents.json which the dashboard polls. Never blocks (always exit 0).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const mode = process.argv[2] || 'pre';
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stateFile = join(projectDir, '.claude', 'state', 'agents.json');

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}
function loadState() {
  try { return JSON.parse(readFileSync(stateFile, 'utf8')); }
  catch { return { agents: {}, active: [], updated: null }; }
}
function saveState(s) {
  s.updated = new Date().toISOString();
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(s, null, 2));
}

let input = {};
try { input = JSON.parse(readStdin() || '{}'); } catch { /* tolerate non-JSON */ }

const state = loadState();
state.agents = state.agents || {};
state.active = state.active || [];
const now = new Date().toISOString();

if (mode === 'pre') {
  const ti = input.tool_input || {};
  const role = ti.subagent_type || ti.subagentType || 'unknown';
  const task = ti.description || ti.prompt || '';
  state.agents[role] = { status: 'working', task: String(task).slice(0, 160), since: now };
  state.active.push(role);
} else if (mode === 'stop') {
  // v1 heuristic: SubagentStop doesn't reliably carry the role, so mark the
  // oldest still-active role as done. Parallel subagents may resolve out of order.
  const role = state.active.shift();
  if (role && state.agents[role]) {
    state.agents[role] = { status: 'done', task: state.agents[role].task, since: now };
  }
}

try { saveState(state); } catch { /* never block the agent on a dashboard write */ }
process.exit(0);
