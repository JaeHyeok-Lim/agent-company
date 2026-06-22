# agent-company

A reusable **multi-agent "company"** built on Claude Code primitives. Each agent is a
role-specialized employee; the main session is the orchestrator that delegates work and
synthesizes results. Built native-first so the team is reusable across *every* future
project, with a documented escalation path to the Claude Agent SDK when a standalone
deployable service is needed.

## What this is (architecture)

- **Orchestrator** = the main Claude Code session. It decomposes a goal, delegates to
  specialist subagents, and synthesizes their outputs. It is also the only layer that runs
  `Workflow` scripts (subagents cannot spawn subagents).
- **Employees** = `.claude/agents/*.md` — role-specialized subagent definitions
  (researcher, architect, implementer, reviewer, scribe). Each is a custom `agentType`
  invokable via the `Agent` tool or inside a workflow.
- **Processes** = `.claude/workflows/*.js` — deterministic orchestration scripts that
  fan out / pipeline employees across a task (e.g. research → design → implement → review).
- **Manuals / capabilities** = `.claude/skills/*/SKILL.md` — reusable, on-demand expertise.
- Full org chart and data flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Design principle (from the brain): this is **harness engineering** — we don't make the model
smarter, we build an environment where acting like a well-run team is the path of least
resistance. See `/recall harness-engineering`.

## Commands

This project is currently **prompt/config-only** (no build step yet). Operate it from a
Claude Code session:

- **Run a role directly:** ask the main session to delegate, e.g. *"use the reviewer agent on the current diff"* → invokes the `Agent` tool with `subagent_type: reviewer`.
- **Run a process:** `Workflow` with `scriptPath: ".claude/workflows/build-feature.js"`
  (only the user/main session triggers workflows; they can spawn many agents — opt-in).
- **Promote a role globally:** copy a validated `.claude/agents/<role>.md` into
  `C:\Users\jaehyeok\.claude\agents\` so every project can use it.
- **Live dashboard:** `npm run dashboard` → http://localhost:4317/ — character floor view of
  the team with live status (idle/working/done), driven by hooks → `.claude/state/agents.json`.
- **Validate settings:** `python -m json.tool .claude/settings.json`

## MCP servers

Configured in `.mcp.json` (no secrets committed — auth is interactive in Claude Code):
- **github** (remote http) — issue/PR/repo tools for the agents. Complete OAuth when prompted.
- **context7** (remote http) — up-to-date library docs for the implementer.
- **playwright** (local `npx`) — browser automation; used to verify the dashboard / web UIs.

Claude Code prompts to trust project MCP servers on first use — approve them there.

When code is added later (TS SDK escalation path), record `build` / `test` / `lint` here.

## Conventions

- **One role per file** in `.claude/agents/`. Frontmatter: `name`, `description` (write the
  description as a *routing* signal — when to delegate to this role), `tools` (least
  privilege), `model` (`opus` | `sonnet` | `haiku`).
- **Portable prompts.** Write each role's system prompt as plain Markdown with no Claude-Code-
  only assumptions in the *body*, so it can be lifted into an Agent SDK system prompt verbatim
  if/when we escalate. Keep harness-specific wiring (tools, model) in frontmatter only.
- **Model tiering** (mirrors loop-engineering effort tiers):
  - `opus` (`claude-opus-4-8`) — orchestration + intelligence-sensitive roles (architect, implementer, reviewer)
  - `sonnet` (`claude-sonnet-4-6`) — routine roles (researcher, scribe)
  - `haiku` (`claude-haiku-4-5`) — cheap mechanical sub-steps
- **Verify, don't assume.** Roles report what they actually ran/found; reviewer uses
  adversarial verify (try to refute a finding before accepting it).

## Guardrails (don't)

- Don't give a role broader `tools` than its job needs (e.g. researcher is read-only —
  no `Edit`/`Write`/`Bash`).
- Don't run `Workflow` for trivial tasks — it can spawn dozens of agents and is billed; it is
  opt-in for substantive, parallelizable work only.
- Don't hardcode dated model snapshot IDs — use the aliases above (verified via the
  `claude-api` skill; re-check before relying on pricing).
- Don't edit files under `C:\Users\jaehyeok\.claude\` from inside this project except when
  *deliberately* promoting a validated role globally.

## Brain link

Personal knowledge graph: `C:\Users\jaehyeok\Documents\Obsidian`.
Before non-trivial work, `/recall` the relevant notes. This project's brain home is its MOC
`[[projects/agent-company]]` (`MOC/projects/agent-company.md`) — start there and file new
agent-company neurons under `neurons/projects/agent-company/`. Most relevant maps/neurons:
- Project MOC: `[[projects/agent-company]]` → `[[agent-company-overview]]`
- Orchestration principles: `[[orchestrator-is-main-session]]`, `[[portable-agent-prompts]]`,
  `[[agent-role-model-tiering]]`, `[[project-scoped-claude-config]]`, `[[agent-observability-via-hooks]]`,
  `[[multi-agent-communication-patterns]]`, `[[flexible-agent-headcount]]`
- MOC: `[[ai-agent-engineering]]` (harness vs loop engineering — the two big levers)
- `[[harness-engineering]]`, `[[loop-engineering]]`, `[[agentic-loop-structure]]`
- `[[context-rot]]`, `[[retrieval-is-the-bottleneck]]` (keep each role's context tight)

As further patterns prove out here (when to fan out vs pipeline, new role types), `/capture`
them under the project MOC above.
