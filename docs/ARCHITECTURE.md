# Architecture — the agent company

## Org chart

```
        👑 You (CEO)
            │  asks / approves
            ▼
   Orchestrator (main session) ──consults──►  chief-of-staff
            │  delegates execution             (plans, staffs 0..N per role,
            │                                   sequences work, reports up)
   ┌───────────┬──────────┬───────────┬────────────┬──────────┐
   ▼           ▼          ▼           ▼            ▼          ▼
product-mgr researcher  designer   architect  implementer  devops
 (what/why)  (explore)   (UX)      (design)    (build)     (ship)
   └───────────┴──────────┴───────────┴────────────┴──────────┘
   ┌──────────┬───────────┬──────────┐        ┌──────────────────────┐
   ▼          ▼           ▼          ▼         │ auditor (감사팀):      │
reviewer   security  data-analyst  scribe     │ reviews the SYSTEM,    │
(verify)   (AppSec)   (metrics)    (docs)      │ files improvement memos│
                                               └──────────────────────┘
```

The pipeline runs front-to-back (product-manager → researcher → designer → architect →
implementer → devops → reviewer → security → data-analyst → scribe); the **auditor** is an
out-of-band oversight role that critiques the company itself rather than sitting in the pipeline.
Model tiers per role are in the table below.

The **chief-of-staff** is a staff (advisory) role: it organizes and reports but does not
execute. The orchestrator (or you directly) consults it for status, prioritization, and
briefings, then the orchestrator delegates the actual work to the specialists.

## Why the orchestrator is the main session

Claude Code subagents cannot spawn their own subagents (they generally lack the `Agent`
tool). So the **orchestration layer is the main session** — it is the only place that:

1. holds the overall goal and the synthesized conclusion,
2. calls the `Agent` tool to delegate to one specialist, and
3. runs `Workflow` scripts that fan out / pipeline specialists deterministically.

A specialist's final message is returned to the orchestrator as a tool result (not shown to
the user) — the orchestrator relays what matters.

## Roles (employees)

| Role | When to delegate | Tools (least privilege) | Model |
|---|---|---|---|
| **chief-of-staff** | "status / what's next / plan the schedule / briefing / where are we blocked" — coordination & reporting | Read, Grep, Glob, Bash, Write | opus |
| **researcher** | "find / locate / how does X work" — broad read-only sweeps | Read, Grep, Glob, WebSearch, WebFetch | sonnet |
| **architect** | "plan / design the approach" before edits | Read, Grep, Glob | opus |
| **implementer** | "make the change" — write code + run it | Read, Edit, Write, Grep, Glob, Bash | opus |
| **reviewer** | "is this correct?" — review a diff, adversarially | Read, Grep, Glob, Bash | opus |
| **scribe** | "document / capture what we learned" | Read, Grep, Glob, Write | sonnet |
| **auditor** | "review the system itself" — oversight (감사팀); critiques risks/inefficiencies, files improvement proposals (read-only on the system, writes only to `docs/improvements/`) | Read, Grep, Glob, Bash, Write | opus |
| **product-manager** | "what & why" — requirements, scope, success metrics, prioritized backlog (front of the pipeline) | Read, Grep, Glob, Write | opus |
| **designer** | "UX/UI" — user flow, screens & states, interaction, usability | Read, Grep, Glob, Write | opus |
| **devops** | "ship & operate" — CI/CD, deploy, infra, reliability/observability | Read, Edit, Write, Grep, Glob, Bash | opus |
| **data-analyst** | "metrics, analysis, experiments" — evidence for decisions | Read, Grep, Glob, Bash, Write | sonnet |
| **security** | "AppSec" — threat-model + vulnerability review with severity | Read, Grep, Glob, Bash | opus |

## Processes (workflows)

`.claude/workflows/*.js` encode deterministic collaboration. The canonical ones:
- `go.js` ⭐ — **the one command** (`/go <goal>`): the chief-of-staff allocates headcount per
  role, then it runs **define → research → UX → architecture → implement → ship → review →
  security → data → document**, skipping any role staffed at 0. Supersedes running
  `build-feature` / `staffed-build` by hand for most goals.
- `build-feature.js` — pipelines **research → design → implement → review**, with the review
  stage adversarially verifying before accepting.
- `standup.js` — **recon → brief**: researcher gathers repo/team state, then the chief-of-staff
  turns it into a decision-ready briefing for the user (and updates `docs/backlog.md`).
- `staffed-build.js` — **staff → research → design → implement → review → document**: the
  chief-of-staff first allocates headcount per role (0..N), then each phase fans out exactly
  that many agents in parallel on their task slices. This is the flexible-headcount build.
- `audit.js` — **recon → audit**: researcher inventories the system, then the **auditor (감사팀)**
  files improvement 결재 서류 into `docs/improvements/`. Oversight that improves the company
  itself without touching running work.

## Staffing (headcount allocation)

Each function is **not** fixed at one agent. The chief-of-staff allocates headcount per role for
a given goal:
- **0** — role not needed (e.g. no docs to write → scribe 0).
- **1** — needed, straightforward, single coherent piece.
- **2–4** — large/parallelizable, bug-prone, or correctness-critical work, split into one task
  slice per instance (e.g. 3 reviewers independently refuting a risky change; consensus wins).

The plan is written to `.claude/state/allocation.json` (drives the dashboard's planned-count
display) and `docs/staffing.md` (human-readable record). `staffed-build.js` consumes it and
fans out per role via `parallel()`. Concurrency is capped (~16 agents at once) by the runtime;
keep any single role ≤ ~4. The dashboard shows, per role: planned count (hollow dots), live
instances (filled dots: working = pulsing amber, done = green), and a status badge. Pipelines (no barrier between stages) are the
default; use a barrier only when a stage genuinely needs *all* prior results at once.

Loop patterns to reuse (from `[[loop-engineering]]`): loop-until-dry (keep finding until
nothing new), adversarial verify (refute before accept), self-repair (retry on error).

### Conflict-safety for parallel writers

When `parallel()` fans out several write-capable agents at once (multiple implementers, or
implementer + devops + scribe together), two of them editing the same file would corrupt or
overwrite each other's work. We prevent this by **disjoint owned-paths per slice** — enforcement
by contract, not by runtime isolation:

1. The chief-of-staff emits, alongside each write role's `tasks[]`, an `ownedPaths[]` array with
   one entry per instance: the file/dir globs that instance is the **sole writer** of. These must
   be **pairwise disjoint** across every concurrent instance — same role and across roles — so no
   two parallel writers ever share a writable path.
2. `go.js` / `staffed-build.js` inject that boundary into each write-role prompt (`WRITE_ROLES`):
   *"you are the sole writer of these paths; write only inside them; anything outside is an
   integration point — don't write it, report it."* Read-only roles (researcher, architect,
   reviewer, security) get no boundary because they cannot collide.
3. **Integration points** — files no single slice can own (shared entry points, lockfiles,
   `README`) — belong to no slice. They're deferred to a single sequential owner (the
   orchestrator after the fan-out), never written concurrently.

Why owned-paths and not `isolation:'worktree'`: worktrees require a git repo and force a merge
step, which collides with our rule that no agent commits/pushes — the orchestrator reviews the
working tree directly. Owned-paths needs no runtime feature and is provably safe: two writes can
only collide if their path sets intersect, and the sets are declared disjoint by construction.

## Model tiering

Mirrors effort tiers — spend intelligence where it pays:
- `claude-opus-4-8` — orchestration + architect/implementer/reviewer (correctness-sensitive)
- `claude-sonnet-4-6` — researcher/scribe (routine, high-volume)
- `claude-haiku-4-5` — cheap mechanical sub-steps

(Model IDs verified via the `claude-api` skill — re-verify pricing/IDs before relying on them.)

## Communication model

**Chosen pattern: orchestrator-mediated hub-and-spoke with structured (schema-validated)
handoffs.** The orchestrator (main session) routes every exchange; specialists never talk to
each other directly. Each handoff is a typed payload — `agent(..., { schema })` returns a
validated object that the orchestrator passes to the next stage (see `build-feature`,
`staffed-build`, `standup`).

Why this and not the alternatives:
- **Hub-and-spoke** keeps message overhead ~O(n) (vs O(n²) for peer-to-peer mesh "gossip"),
  preserves global context in one place, and is the most observable/controllable — the
  orchestrator owns the conclusion.
- **Peer-to-peer / mesh** is not even available natively: Claude Code subagents cannot message
  each other or spawn agents ([[orchestrator-is-main-session]]), so direct agent-to-agent
  channels can't be built without the SDK.
- **Blackboard** (agents self-selecting work off a shared board) can win for open-ended
  discovery, but needs agents that *poll and choose* — our one-shot subagents can't, so it's an
  SDK-only option.

Verified: the workflows already pass structured outputs between stages and the main session is
the sole router — i.e. the system is already on the recommended pattern. No change required.
If/when this moves to the Agent SDK (where long-lived processes can host shared memory), a
**blackboard layer** is the natural upgrade for open-ended, ill-structured tasks.

## Escalation path → Claude Agent SDK

Stay native until you hit one of these, then lift the role prompts (kept portable as Markdown)
into an SDK service:

- Need a **deployed backend** or API other apps call.
- Need **scheduled autonomous runs** outside an interactive session (cron, queues).
- Need a **custom UI** or multi-tenant access.

Recommended target: **Agent SDK (TypeScript)** — matches the existing JS ecosystem
(e.g. ShareEat). Options at that point: Claude API + tool-use loop (host the loop yourself,
maximum control) or **Managed Agents** (Anthropic hosts the loop + a per-session container).
Because each role's system prompt is already plain Markdown, migration is mostly wiring, not
rewriting.

## Reusing across projects

A role proven here is promoted by copying `.claude/agents/<role>.md` into
`C:\Users\jaehyeok\.claude\agents\` — then every project's Claude Code session can delegate to
it. The company grows globally as roles mature.
