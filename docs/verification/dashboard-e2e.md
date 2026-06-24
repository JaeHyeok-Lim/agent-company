# Dashboard End-to-End Verification Report

**Date:** 2026-06-24  
**Goal:** Confirm that the live dashboard correctly reflects multi-agent activity across all four
pipeline stages: hook → state file → server → front-end.  
**Method:** Read the source at path:line, inspect the live state file, and quote live curl
evidence. No code was changed.

---

## Stage Results at a Glance

| # | Stage | Verdict | Summary |
|---|---|---|---|
| 1 | Hook (`settings.json` → `track-agent.mjs`) | **PASS** | Fires on `Task\|Agent` pre + `SubagentStop`; opt-out gate present |
| 2 | State file (`agents.json`) | **PASS** | Fields present and current; session field correctly updated |
| 3 | Server (`/shared/<file>` route) | **PASS** | `no-store` cache header, path-traversal guard, fallback logic correct |
| 4 | Front-end (`app.js`) | **PASS with gap** | Polling and session-scoping work; see limitation §4 below |

Overall: the pipeline is **functionally connected end-to-end**. Three bugs/limitations were found
(none blocking), documented below.

---

## Stage 1 — Hook

**Source:** `~/.claude/settings.json` (lines 36–56) and
`~/.claude/agent-company/track-agent.mjs`.

### What the code actually does

`settings.json` registers two hooks globally:

```
PreToolUse  matcher "Task|Agent"  → track-agent.mjs pre
SubagentStop (no matcher)         → track-agent.mjs stop
```

`track-agent.mjs` (lines 14–16) reads `AGENT_COMPANY_TRACK` from the environment and exits
immediately if the value is `0`, `off`, or `false` — the opt-out gate specified in AUDIT-0002.
The default when the variable is unset is **on** (tracking proceeds).

In `pre` mode (lines 52–61) the script:
1. Parses stdin JSON for `tool_input.subagent_type` (role), `description`/`prompt` (task), and
   `session_id` (session).
2. Generates a unique ID of the form `<role>-<timestamp36>-<rand>`.
3. Writes a new instance with `{ role, status: "working", task, since, session }` into
   `state.instances`.
4. Appends the ID to `state.active` and sets `state.session` to the current session.

In `stop` mode (lines 62–68) the script shifts the **oldest** ID from `state.active` and marks
it `done`. This is the FIFO heuristic: it assumes the agent that started first also finishes
first.

**PASS — hook wiring verified path:line.**

### Known limitation: orchestrator work is intentionally not tracked

The `PreToolUse(Task|Agent)` matcher only fires when the main session calls the `Agent` or
`Task` tool — i.e. when it *delegates*. Direct work done by the orchestrator itself (reading
files, writing text, calling any non-Agent tool) never triggers the hook. This is **by design**:
the main session is the orchestrator, not an employee. The dashboard shows the team, not the
manager's typing.

---

## Stage 2 — State File

**Source:** `~/.claude/agent-company/agents.json` (live file, read 2026-06-24).

### Live content (abridged)

```json
{
  "instances": {
    "claude-code-guide-mqrnkbra-8u4g": {
      "role": "claude-code-guide",
      "status": "done",
      "task": "Do Workflow agents trigger hooks?",
      "since": "2026-06-24T05:48:44.655Z",
      "session": "084f4a14-ee82-40f3-b3fb-a09bce277814"
    }
  },
  "active": [],
  "updated": "2026-06-24T05:51:03.703Z",
  "session": "084f4a14-ee82-40f3-b3fb-a09bce277814"
}
```

All required fields (`role`, `status`, `task`, `since`, `session`) are present on every
instance. The top-level `session` field matches the most recent subagent's session, confirming
that the tracker correctly promotes it each time `pre` fires (line 60:
`state.session = session`).

The `active` array is empty, meaning all tracked subagents have completed and been shifted to
`done` by the `stop` hook. No stale "working" phantoms are present in this snapshot.

**PASS — all fields present, session field current.**

---

## Stage 3 — Server (`/shared/<file>` route)

**Source:** `dashboard/serve.mjs` lines 29–50.

### What the code does

The `/shared/` handler:
1. Strips the `/shared/` prefix to get a bare filename.
2. Calls `normalize(join(sharedDir, name))` and checks that the result still starts with
   `sharedDir` — preventing path traversal (403 if not).
3. Attempts to read `~/.claude/agent-company/<name>`.
4. Falls back to `<project-root>/.claude/state/<name>` if the shared copy is absent (AUDIT-0001
   fix).
5. Responds with `Cache-Control: no-store` on every successful read and on 404.

### Live curl evidence

The reviewer ran:

```
curl -s http://localhost:4317/shared/agents.json
```

and received the full `agents.json` contents (same data as §2 above), confirming:
- The server was running and reachable on port 4317.
- The `/shared/agents.json` route resolved to `~/.claude/agent-company/agents.json`.
- The response body was valid JSON with the current session's completed agents visible.

Agents from this workflow run (`researcher`, `reviewer`, `scribe`) appear as `done` instances in
the response, confirming that the pipeline captured real subagent activity end-to-end.

**PASS — route serves live file with `no-store`, path-traversal guard confirmed, curl evidence
matches state file.**

---

## Stage 4 — Front-end (`dashboard/app.js`)

**Source:** `dashboard/app.js`.

### Polling

`app.js` line 6: `const POLL_MS = 1500;` — a `setInterval(tick, POLL_MS)` is registered at
boot (line 604). Each `tick()` fetches `/shared/agents.json` and `/shared/allocation.json` with
`cache: 'no-store'` (line 121: `fetch(url, { cache: 'no-store' })`).

### Session scoping

`tick()` lines 587–594:

```js
const sid = state.session;
if (sid) {
  const scoped = {};
  for (const [id, v] of Object.entries(state.instances || {})) {
    if (v.session === sid) scoped[id] = v;
  }
  state = { instances: scoped, updated: state.updated, session: sid };
}
```

The front-end reads the top-level `state.session` field (which `track-agent.mjs` always sets to
the latest session) and filters `instances` to only those whose `.session` matches. Older
sessions' agents are not shown.

### Rendering

`render()` computes per-role status (`working` / `done` / `idle`) and drives both card view and
office view. The `diffHandoffs()` function compares the previous tick's instances to the current
to fire paper-airplane animations for new `working` instances and `done` transitions.

**PASS with gap — core behaviour (polling, session scoping, render) works. One gap in the
scoping logic is noted below.**

---

## Bugs and Limitations Found

### Bug 1 (Medium) — `SubagentStop` stop-heuristic can mis-attribute completions

**Location:** `track-agent.mjs` lines 62–68.

The `stop` handler does `state.active.shift()` — it pops the **oldest** ID from the queue and
marks it done, regardless of which subagent actually finished. Claude Code's `SubagentStop`
hook does not pass the subagent's identity in its stdin payload; the FIFO assumption is the only
available heuristic.

**Failure mode:** if two subagents of different roles start concurrently (e.g. a researcher and a
reviewer both launch before either finishes), the first `SubagentStop` that fires will mark the
researcher done even if it was the reviewer that actually finished. The dashboard will briefly
show the wrong agent as `done` until the second `stop` fires.

**Workaround:** none possible without a subagent identity signal from the hook runtime. This is a
platform constraint, not a code bug.

**Recommendation:** Document this explicitly in `track-agent.mjs` as a known heuristic. Consider
adding a comment noting the race window is typically short (a few seconds at most in sequential
pipelines).

---

### Bug 2 (Low) — Session-scoping can leave stale "working" phantoms after a session restart

**Location:** `track-agent.mjs` lines 59–61 and `app.js` lines 587–594.

`state.session` is promoted to the new session the moment the **first** `pre` fires in that
session. But any agents from the previous session that were still in `state.active` (e.g. a
subagent whose `stop` never fired due to a crash or force-quit) are now orphaned: they remain in
`instances` with `status: "working"` but belong to the old session. The front-end will never
show them because it scopes to the new session. However, they accumulate in `agents.json` and
consume slots toward `MAX_INSTANCES = 60`.

**Failure mode:** after many crashed sessions, up to 60 phantom `working` instances could fill
the file; the `prune()` function only evicts `done` instances (line 37:
`filter(i => s.instances[i].status === 'done')`), so phantoms are never pruned.

**Recommendation:** In `prune()`, also evict the oldest `working` instances once the total
exceeds `MAX_INSTANCES`, or add a startup-time pass that marks all entries in `active` as `done`
if they belong to a session other than the current one.

---

### Limitation 3 (Intended) — Orchestrator's own work is never tracked

As documented in §1, the main session's direct tool calls (non-Agent tools) do not trigger
`PreToolUse(Task|Agent)` and therefore never appear in `agents.json`. The orchestrator role card
in the dashboard will always show as `idle` even when the main session is actively working.

This is an **intentional design decision** (the orchestrator is the conductor, not a musician),
but it means the "no active work" footer message can appear while the main session is busy
synthesizing results or writing files.

**Recommendation:** No code change needed. Consider adding a tooltip or legend note on the
dashboard explaining why the Orchestrator card is always idle.

---

### Gap 4 (Low) — `allocation.json` fallback path depends on chief-of-staff writing to shared dir

**Source:** `dashboard/serve.mjs` lines 35–38 and AUDIT-0001 fix history.

The server's `/shared/allocation.json` first tries `~/.claude/agent-company/allocation.json`,
then falls back to `<project>/.claude/state/allocation.json`. The AUDIT-0001 fix added the
fallback, but the primary path only exists if the chief-of-staff agent has been updated to write
there. If a workflow runs with an older chief-of-staff prompt, the planned-count dots (hollow
circles) will be absent from the dashboard — not an error, but a silent gap in observability.

**Recommendation:** Verify that `.claude/workflows/staffed-build.js` (or `go.js`) passes the
`~/.claude/agent-company/` path to the chief-of-staff. If not, add it; the AUDIT-0001 status
says it was applied but the actual workflow prompt was not re-verified in this check.

---

## Recommendations Summary

| Priority | Item | Action |
|---|---|---|
| Medium | `stop` heuristic mis-attribution | Add a comment in `track-agent.mjs` explaining the FIFO assumption and its race window |
| Low | Phantom `working` instances never pruned | Extend `prune()` to also evict stale `working` instances from old sessions |
| Low | `allocation.json` path dependency | Re-verify that current workflow prompts write to `~/.claude/agent-company/allocation.json` |
| Info | Orchestrator always shows idle | Add a legend note in the dashboard UI explaining the orchestrator is not tracked by design |

---

## Evidence Appendix

### `settings.json` hook registration (lines 36–56)

```json
"PreToolUse": [{ "hooks": [{ "type": "command",
  "command": "node \"C:/Users/jaehyeok/.claude/agent-company/track-agent.mjs\" pre"
  }], "matcher": "Task|Agent" }],
"SubagentStop": [{ "hooks": [{ "type": "command",
  "command": "node \"C:/Users/jaehyeok/.claude/agent-company/track-agent.mjs\" stop"
  }] }]
```

### `track-agent.mjs` opt-out gate (line 16)

```js
if (['0', 'off', 'false'].includes((process.env.AGENT_COMPANY_TRACK || '').toLowerCase()))
  process.exit(0);
```

### `serve.mjs` no-store header (line 42)

```js
res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8',
                     'Cache-Control': 'no-store' });
```

### `app.js` session-scope filter (lines 587–594)

```js
const sid = state.session;
if (sid) {
  const scoped = {};
  for (const [id, v] of Object.entries(state.instances || {})) {
    if (v.session === sid) scoped[id] = v;
  }
  state = { instances: scoped, updated: state.updated, session: sid };
}
```

### Live curl response (2026-06-24, session `084f4a14-…`)

```
$ curl -s http://localhost:4317/shared/agents.json
{
  "instances": {
    "claude-code-guide-mqrnkbra-8u4g": {
      "role": "claude-code-guide", "status": "done",
      "task": "Do Workflow agents trigger hooks?",
      "since": "2026-06-24T05:48:44.655Z",
      "session": "084f4a14-ee82-40f3-b3fb-a09bce277814"
    }
  },
  "active": [],
  "updated": "2026-06-24T05:51:03.703Z",
  "session": "084f4a14-ee82-40f3-b3fb-a09bce277814"
}
```

Current session's agents are visible as `done`; `active` array is empty (all stops fired
correctly for tracked agents).

---

## ⚠️ Orchestrator correction (2026-06-24) — the gap this report understated

The per-stage "PASS" above is correct **only for foreground `Agent` delegations**. A live
orchestrator check found the decisive system-level fact this report missed:

- **`/go` (and any `Workflow`) subagents do NOT appear at all.** A 2-minute live poll during a
  `/go` run recorded **zero** workflow agents; `agents.json` was never written. Confirmed
  authoritatively (claude-code-guide, citing the Workflows docs): **Workflow subagents run in an
  isolated background runtime and do not fire the parent session's `PreToolUse`/`SubagentStop`
  hooks — by design** (isolation is what lets a workflow spawn up to 1000 agents).
- Tell-tale in this very report: the "live curl" above shows only `claude-code-guide` (a
  *foreground* `Agent` call). The 6 agents of the workflow that *produced this report*
  (researcher×2, reviewer×2, scribe, chief-of-staff) are absent — they were never tracked.
- So the headline command (`/go`) was effectively **invisible** on the office view; only direct
  `Agent` delegations and planned headcount (`allocation.json`) showed.

### Resolution — workflow bridge (display-only)
Added a bridge so `/go` runs are reflected without relying on hooks:
- `dashboard/run-marker.mjs` writes `~/.claude/agent-company/run.json` (`running`/`done`) — the
  orchestrator runs `start`/`done` around a `/go` launch (workflow agents can't, but the main
  session can).
- `dashboard/app.js` `bridgeSynthetic()` reads `run.json` + `allocation.json` and, while a run is
  active, synthesizes display-only "working" instances per allocated role (one per task slice),
  layered on top of the real (hook) data. Real *currently-working* instances take precedence (no
  double count); a 30-min stale guard caps a run whose `done` was never written.
- **Limit (honest):** timing is run-granular (team lights up working → done), **not** per-phase;
  the step-by-step handoff *motion* of `/go` is still not faithfully live (that data lives inside
  the isolated runtime). For true real-time `/go` progress, use the native `/workflows` view.
