# Staffing plan

Headcount allocation per role, decided by the **chief-of-staff** agent for the current goal.
This file is (re)written each time the chief-of-staff staffs a goal; the machine-readable copy
lives at `.claude/state/allocation.json` (and the shared `~/.claude/agent-company/allocation.json`)
and drives the dashboard's planned-count display.

## Rules of thumb
- **0** — role not needed for this goal.
- **1** — needed, straightforward, single coherent piece.
- **2–4** — large/parallelizable, bug-prone, or correctness-critical work; split into one task
  slice per instance.

## Current plan

**Goal:** Improve the agent-company system — (A) conflict-safe parallel execution / role
write-isolation, and (B) selectively adopt the founder-CLAUDE.md principles into our rules &
harness (no duplication, minimal impact, verified).

**Total concurrent (peak per phase): 2.** Pipeline runs research → architecture → implement →
review → document; each phase fans out the counts below.

| Role | Count | Why | Slices |
|---|---|---|---|
| product-manager | 0 | Goal is internal and already well-specified; no new requirements/metrics. | – |
| researcher | 2 | Two independent, parallel read-only investigations that gate everything; grounding the "does isolation exist?" claim is correctness-critical. | A: audit workflows + runtime parallel()/cwd + write-role prompts, find collision scenario · B: founder-principle → our-system gap table |
| designer | 0 | No UI in scope. | – |
| architect | 2 | Two distinct, low-coupling, correctness-critical designs. | A: conflict-safety mechanism (worktree vs slice-ownership vs write-region + merge rule), minimal-impact · B: where each adopted principle is wired (single home each) |
| implementer | 2 | Two disjoint write regions → run in parallel without colliding (dogfoods track A's own rule); bug-prone workflow JS gets a focused instance. | A: owns `go.js`, `staffed-build.js`, `ARCHITECTURE.md` · B: owns project `CLAUDE.md`, `delivery-standards/SKILL.md`, named agent prompts |
| devops | 0 | No deploy/CI/infra change; `scripts/check.mjs` smoke check already exists and is used for verification. | – |
| reviewer | 2 | Constraint demands the safeguard be *verified*, not asserted → two independent adversarial refuters. | A: stress-test isolation for collision/overwrite holes + demand demonstrated parallel-write scenario · B: check for re-introduced duplication, JS regression (`node --check` + `check.mjs`), no secrets |
| security | 0 | No new auth/input/network/dep surface; the no-secrets check is folded into reviewer B. | – |
| data-analyst | 0 | No metrics/experiment to instrument. | – |
| scribe | 1 | One coherent doc pass; single owner avoids two scribes colliding on the same docs (the very failure mode being fixed). | Update backlog, summarize the write-boundary rule + adopted principles, prepare `/capture` neurons, cite paths |

## Sequencing & parallelism
- **Sequential gates:** research → architecture → implement → review → document.
- **Within a phase, parallel:** researcher A‖B, architect A‖B, implementer A‖B (disjoint owned
  paths), reviewer A‖B.
- **Critical-path risk:** track A (isolation) is the riskier half and must produce a *demonstrated*
  parallel-write scenario before review accepts it.

## Verified grounding (chief-of-staff, 2026-06-24)
- No isolation mechanism exists today: `go.js` and `staffed-build.js` fan out N write-capable
  agents via `parallel()` with **no per-instance cwd, no worktree, and no write-region
  partitioning** — task slices are free-text prompts only. This is a real, currently-open gap.
- `scripts/check.mjs` exists (per AUDIT-0003) and is the smoke check implementers/reviewers run.
- The founder principles partially overlap our harness already (architect ≈ plan mode, /capture ≈
  lessons, reviewer/verify ≈ Verification-Before-Done) — adopt only the genuine gaps.
