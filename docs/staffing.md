# Staffing plan

Headcount allocation per role, decided by the **chief-of-staff** agent for the current goal.
This file is (re)written each time the chief-of-staff staffs a goal; the machine-readable copy
lives at `.claude/state/allocation.json` (and the shared `~/.claude/agent-company/allocation.json`)
which the dashboard reads to show planned headcount per role.

## Goal

**Live-dashboard end-to-end verification.** Confirm — with evidence, not assumption — that the
4-stage multi-agent activity pipeline works end to end. This workflow run is itself a *live test*:
running these subagents generates real activity that should flow through the pipeline.

Pipeline under test:
1. **Hook** — `~/.claude/settings.json` PreToolUse (`Task|Agent`) -> `track-agent.mjs pre`
   (adds a working instance); SubagentStop -> `stop` (marks oldest active done). `AGENT_COMPANY_TRACK`
   opt-out gate.
2. **State file** — `~/.claude/agent-company/agents.json`: role/status/session/task/since written,
   `state.session` updated to the latest session.
3. **Server** — `dashboard/serve.mjs` `/shared/<file>` route serves `~/.claude/agent-company/`
   files `no-store` (http://localhost:4317/shared/agents.json).
4. **Front** — `dashboard/app.js` scopes to the latest `state.session`, renders working/done/idle
   into card + office views, polls every 1.5s.

## Constraints (all agents)

- No `git commit` / `push` by any agent.
- Verification only — **no code changes** unless strictly necessary. Find a bug -> **report it,
  do not fix** (orchestrator decides).
- Public repo, no secrets.
- Validate via `npm run check` (not just `node --check`).

## Allocation

| Role | Count | Why |
|------|-------|-----|
| product-manager | 0 | No requirements/metrics work — goal is verification of existing behavior. |
| researcher | **2** | Read-only data-flow trace with path:line evidence; split the 4 stages into two coherent halves so each instance keeps a tight context. |
| designer | 0 | No UI design work; the front-end is a verification target, not a design task. |
| architect | 0 | No new design/architecture decision; the architecture exists and is being validated. |
| implementer | 0 | No feature code — verification only. |
| devops | 0 | No deploy. (Starting the local dashboard server for the live check is handled by the runtime reviewer, not a devops deliverable.) |
| reviewer | **2** | Correctness-critical adversarial verification — two independent reviewers refute different failure classes (logic/heuristic vs runtime/caching); one runs live curl. |
| security | 0 | No security scope beyond the no-secrets constraint already enforced. |
| data-analyst | 0 | No data analysis. |
| scribe | **1** | One coherent verification write-up; single author, owns only the new report file. |

Total concurrent: **5** (well under the ~16 cap).

### Task slices

**researcher x2**
- R1 — Stages 1-2 (hook + state file): trace `settings.json` + `track-agent.mjs`; confirm working
  add / oldest-active stop, opt-out gate, fields + `state.session` update, this run's agents present;
  note intended limitation (orchestrator main-session work is NOT tracked by the `Task|Agent` hook).
- R2 — Stages 3-4 (server + front): trace `serve.mjs` `/shared` no-store + `.claude/state` fallback;
  `app.js` session scoping, working/done/idle render in card + office views, 1.5s poll; confirm the
  state.session written by the hook is the one app.js reads.

**reviewer x2**
- RV1 — Adversarial LOGIC refute: session-scoping breakage (missing `session_id` -> `local`, stale
  `state.session`, mixed-session active queue), SubagentStop "oldest active" mis-attribution
  (out-of-order completion, FIFO assumption), stale/accumulated instances, `MAX_INSTANCES` prune.
  Run `npm run check` and quote output.
- RV2 — Adversarial RUNTIME refute + LIVE check: start `npm run dashboard` if needed, then
  `curl -s http://localhost:4317/shared/agents.json` and confirm this session's agents show
  working/done (quote JSON); probe no-store header (`curl -sI`), fallback path, 403 traversal guard,
  and 1.5s poll reflecting a live change.

**scribe x1**
- SC1 — Synthesize into `docs/verification/dashboard-e2e.md`: per-stage PASS/FAIL, bugs + limitations
  (incl. intended orchestrator-not-tracked limitation and any session-scoping / stop-heuristic gaps),
  quoted live curl evidence, recommendations. No code or other-doc changes.

### Write ownership (disjoint)

Only one write-role with count >= 1: **scribe**.

- scribe[0] — sole writer of `docs/verification/dashboard-e2e.md`.

**Integration points (no slice owns; orchestrator-owned or runtime-mutated):**
- `dashboard/serve.mjs`, `dashboard/app.js`, `dashboard/index.html`, `dashboard/styles.css` —
  read-only verification targets.
- `~/.claude/agent-company/track-agent.mjs`, `~/.claude/settings.json` — read-only targets.
- `~/.claude/agent-company/agents.json` — mutated by hooks at runtime, not by any slice; it is the
  live evidence under test.
- `docs/backlog.md`, `README.md` — orchestrator-owned.
