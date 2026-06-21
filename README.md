# agent-company

A reusable **multi-agent "company"** running on Claude Code primitives — a team of
role-specialized agents that collaborate on software work, designed to be reused across all
future projects.

> Think of it as an org: the main Claude Code session is the orchestrator (PM), and each
> file in `.claude/agents/` is an employee with a defined role, toolset, and model tier.

## Layout

```
agent-company/
├─ CLAUDE.md                 # how agents should operate in this repo (read first)
├─ docs/ARCHITECTURE.md      # org chart, roles, data flow, escalation path
├─ .mcp.json                 # MCP servers (github, context7, playwright)
├─ package.json              # `npm run dashboard`
├─ dashboard/                # live "floor view" — characters + status (static HTML/JS)
│   ├─ index.html · styles.css · app.js
│   ├─ roster.json           # the characters (avatar, traits, model)
│   └─ serve.mjs             # zero-dep static server
└─ .claude/
   ├─ settings.json          # permissions + hooks (hooks feed the dashboard)
   ├─ hooks/track-agent.mjs  # writes live agent status to state/agents.json
   ├─ agents/                # the "employees" — role-specialized subagents
   │   ├─ researcher.md
   │   ├─ architect.md
   │   ├─ implementer.md
   │   ├─ reviewer.md
   │   └─ scribe.md
   ├─ workflows/             # the "processes" — orchestration scripts
   │   └─ build-feature.js
   └─ skills/                # the "manuals" — reusable capabilities
       └─ delivery-standards/SKILL.md
```

## Live dashboard

```
npm run dashboard      # → http://localhost:4317/
```

Shows the company as a floor of **character cards** — each role's avatar, personality,
model tier, and **live status** (idle / working / done). Status is driven by Claude Code
hooks: when the orchestrator delegates to a subagent, a hook writes to
`.claude/state/agents.json`, which the dashboard polls. Open it in one window while you run
work in another to watch the team light up.

## Quick start

From a Claude Code session in this directory:

- *"Use the **architect** agent to plan X"* — delegates to one role.
- *"Run the **build-feature** workflow for X"* — runs research → design → implement → review.
- Validated roles can be promoted to `~/.claude/agents/` for use in any project.

## Design philosophy

Native-first (works in every project today, zero infra), with a documented escalation to the
**Claude Agent SDK (TypeScript)** when a standalone/deployable service is needed. Role prompts
are kept portable so they migrate to the SDK without rework. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
