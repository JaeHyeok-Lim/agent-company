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

Use the **🎬 Office view** toggle (top of the page) to switch from cards to a **pixel-style
company floor plan**: a building with a **central corridor** (people stroll up and down it) and
**department rooms on both sides** — each with a yellow name plaque, a window, a whiteboard, a
plant, and **human figures** at desks. People **type** while working, **pop a green ✓** when
done, and **doze with floating z's** when idle. Skin/hair/shirt vary per person.

**Information handoffs fly as paper airplanes — with the message title attached:** every message
is a **paper airplane ✈️** that arcs (slowly at takeoff/landing so the label is readable) from
**one specific agent to another** — not department-to-department — carrying a label of *what* it
is (`task brief`, `findings`, `design spec`, `PR diff`, `change request`, `status report`,
`docs`, …). **Many planes fly at once** (one per message in flight). The exact **sending agent
flashes 📤** and the **receiving agent flashes 📥 and glances up**; each plane and its label are
tinted with the **sender's department color** so you can trace origins. (This mirrors the real
[communication model](docs/ARCHITECTURE.md#communication-model): orchestrator-mediated,
structured handoffs.)

Agents sit **centered and evenly spaced** at desks (seated behind a desk with monitor, keyboard,
and chair, top-down style with shadows). They **type** when working and **doze** when idle, and
in the ambient loop departments periodically take a break and resume, so both motions are
visible. Rooms have per-department props and varied floor textures (wood / tile / carpet).

**The office animates by default — no button needed.** When no real workflow is running, the
floor shows an ambient "busy office" loop with couriers continuously moving documents along the
pipeline (orchestrator → research → design → implement → review → docs, plus reports back up).
When a real workflow *is* running, the floor reflects live agent status and couriers fire on
real handoffs. **⏸ Pause motion** freezes everything. The view choice persists and the whole
thing respects `prefers-reduced-motion`.

> Uses the *Press Start 2P* webfont for the pixel labels (loaded from Google Fonts; falls back
> to a monospace font offline).

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
