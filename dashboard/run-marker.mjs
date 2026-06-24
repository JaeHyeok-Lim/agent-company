#!/usr/bin/env node
// Run-state marker for the agent-company dashboard's "workflow bridge".
// Workflow (`/go`) subagents don't fire the Task|Agent tracking hooks, so agents.json
// stays empty during a `/go` run. The ORCHESTRATOR runs this script around a `/go` launch
// to signal run state; the dashboard reads run.json (via /shared) and synthesizes display
// instances from allocation.json while a run is active.
//   node dashboard/run-marker.mjs start "<goal text>"  -> { status:"running", startedAt, goal }
//   node dashboard/run-marker.mjs done                 -> add status:"done" + endedAt
// Writes run.json into ~/.claude/agent-company/ (the same dir the dashboard serves via /shared).
// Never throws fatally (mirrors track-agent.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const runFile = join(homedir(), '.claude', 'agent-company', 'run.json');
const mode = process.argv[2] || 'start';
const now = new Date().toISOString();

function save(obj) {
  mkdirSync(dirname(runFile), { recursive: true });
  writeFileSync(runFile, JSON.stringify(obj, null, 2));
}

if (mode === 'done') {
  let run = {};
  try { run = JSON.parse(readFileSync(runFile, 'utf8')); } catch { /* no prior run.json */ }
  run.status = 'done';
  run.endedAt = now;
  try { save(run); console.log(`run-marker: done — ${runFile}`); }
  catch { /* never block the orchestrator on a dashboard write */ }
} else {
  const goal = process.argv[3] || '';
  try { save({ status: 'running', startedAt: now, goal }); console.log(`run-marker: running — ${runFile}`); }
  catch { /* never block the orchestrator on a dashboard write */ }
}
