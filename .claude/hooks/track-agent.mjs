#!/usr/bin/env node
// Live-state tracker for the agent-company dashboard.
// Writes `agents.json` NEXT TO THIS SCRIPT, so it works wherever it's installed.
// `npm run promote` copies it to ~/.claude/agent-company/ and registers the hooks
// in ~/.claude/settings.json — then EVERY project's subagent activity is captured
// in one shared file that the dashboard reads (via the /shared route).
//   PreToolUse (Task|Agent) -> "pre"  : a subagent starts -> add a working instance
//   SubagentStop            -> "stop" : a subagent finishes -> mark oldest active done
// Never blocks the agent (always exit 0).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'pre';
// AUDIT-0002: opt-out switch — set AGENT_COMPANY_TRACK=0|off|false to disable tracking globally
if (['0', 'off', 'false'].includes((process.env.AGENT_COMPANY_TRACK || '').toLowerCase())) process.exit(0);
const here = dirname(fileURLToPath(import.meta.url));
const stateFile = join(here, 'agents.json');
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

const session = input.session_id || 'local'; // group work by chat session

if (mode === 'pre') {
  const ti = input.tool_input || {};
  const role = ti.subagent_type || ti.subagentType || 'unknown';
  const task = String(ti.description || ti.prompt || '').slice(0, 160);
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  const id = `${role}-${Date.now().toString(36)}-${rand}`;
  state.instances[id] = { role, status: 'working', task, since: now, session };
  state.active.push(id);
  state.session = session; // latest active session — the dashboard scopes to this
  prune(state);
} else if (mode === 'stop') {
  const id = state.active.shift();
  if (id && state.instances[id]) {
    state.instances[id].status = 'done';
    state.instances[id].since = now;
  }
}

try { saveState(state); } catch { /* never block the agent on a dashboard write */ }
process.exit(0);
