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
   │   ├─ chief-of-staff.md  # middle manager: status, scheduling, reporting up
   │   ├─ researcher.md
   │   ├─ architect.md
   │   ├─ implementer.md
   │   ├─ reviewer.md
   │   └─ scribe.md
   ├─ workflows/             # the "processes" — orchestration scripts
   │   ├─ build-feature.js   # research → design → implement → review
   │   ├─ staffed-build.js   # chief-of-staff allocates headcount, team fans out per role
   │   └─ standup.js         # recon → chief-of-staff briefing
   └─ skills/                # the "manuals" — reusable capabilities
       └─ delivery-standards/SKILL.md
```

## Live dashboard

```
npm run dashboard      # → http://localhost:4317/
```

Shows the company as a floor of **character cards** — each role's avatar, personality,
model tier, **headcount**, and **live status**. Per role you see the planned count (hollow
dots, from the chief-of-staff's allocation) and live instances (filled dots: amber = working,
green = done), so running multiple agents of one role shows up as multiple dots. Status is
driven by Claude Code hooks: each subagent start/stop updates `.claude/state/agents.json`,
which the dashboard polls. Open it in one window while you run work in another to watch the
team light up.

Use the **🎬 Office view** toggle (top of the page) to switch from cards to an **office floor**:
each role is a department **room** (name plaque, window, carpet) staffed with little **human
figures** at desks with monitors — one person per live agent (or planned slot). They **type at
the keyboard** while working (with a flickering screen), **pop a green ✓** when done, and **slump
their head with floating z's** when idle or not staffed. Skin/hair vary per person so a 3-person
room looks like three people. The choice persists, and it respects `prefers-reduced-motion`.

### Flexible headcount

The **chief-of-staff** decides how many agents each role gets for a goal (0 when not needed,
2–4 for large / bug-prone / correctness-critical work). Run it end-to-end with the
`staffed-build` workflow — it staffs the goal, then fans out that many agents per phase.

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
