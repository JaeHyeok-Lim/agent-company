# agent-company

A reusable **multi-agent "company"** running on Claude Code primitives — a team of
role-specialized agents that collaborate on software work, designed to be reused across all
future projects.

> Think of it as an org: the main Claude Code session is the orchestrator (PM), and each
> file in `.claude/agents/` is an employee with a defined role, toolset, and model tier.

📖 **사용설명서(한글, 도식 포함): [docs/사용설명서.md](docs/사용설명서.md)** — 가장 먼저 읽으면 좋습니다.

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
   │   ├─ scribe.md
   │   ├─ auditor.md         # oversight (감사팀): critiques the system, files improvement proposals
   │   ├─ product-manager.md # what & why: requirements, scope, success metrics
   │   ├─ designer.md        # UX/UI: user flow, screens, usability
   │   ├─ devops.md          # ship & operate: CI/CD, deploy, infra, reliability
   │   ├─ data-analyst.md    # metrics, analysis, experiments
   │   └─ security.md        # AppSec: threat-model + vulnerability review
   ├─ workflows/             # the "processes" — orchestration scripts
   │   ├─ go.js              # ⭐ the one command: staff → define → … → ship → review → document
   │   ├─ build-feature.js   # research → design → implement → review
   │   ├─ staffed-build.js   # chief-of-staff allocates headcount, team fans out per role
   │   ├─ standup.js         # recon → chief-of-staff briefing
   │   └─ audit.js           # recon → auditor files improvement 결재 서류
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
company floor plan**: a **square 4×4 grid of department rooms**, grouped by workflow (reflecting
how real companies place interdependent teams adjacent) — top row leadership (**👑 CEO corner
office**, orchestrator, chief-of-staff, audit), then Product, Engineering, and Quality+Docs. Each
room has a **top name-plaque band** (so it never overlaps the people) and **human figures** at
desks. A working agent turns **sharp with an accent outline glow**; an idle one is **dimmed/grey**;
a finished one shows a **green ✓**. The current task shows as a caption under each working agent.

**Information handoffs fly as paper airplanes — with the message title attached:** every message
is a **paper airplane ✈️** that **hovers ~1s over the sender, then cruises at constant speed** to
**one specific agent** — not department-to-department — carrying a label of *what* it is
(`task brief`, `findings`, `design spec`, `PR diff`, `change request`, `status report`, `docs`, …).
**Many planes fly at once** (one per message in flight). The **sending agent flashes 📤** and the
**receiving agent flashes 📥**; each plane and its label are tinted with the **sender's department
color** so you can trace origins. (This mirrors the real
[communication model](docs/ARCHITECTURE.md#communication-model): orchestrator-mediated,
structured handoffs.)

**Click any room/agent** (or the 👑 CEO) to open a modal of what that agent did this session.
Each row reads as a **specific subject** — e.g. *"‘OAuth2 PKCE 흐름…’에 대한 자료 조사"* rather than
just *"researching"* — pulled from the real task the hook captured; **click a row to expand its
full detail**. A **KO/EN toggle** localizes everything (Korean department names render bold).

**Motion reflects real work only — no demo/ambient loop.** When agents actually run (hooks →
`/shared` state) the floor lights up and planes fire on real handoffs; when nothing is running,
everyone dozes (idle) and no planes fly. The view choice persists and the whole thing respects
`prefers-reduced-motion`.

> Uses the *Press Start 2P* webfont for the pixel labels (loaded from Google Fonts; falls back
> to a monospace font offline).

### Flexible headcount

The **chief-of-staff** decides how many agents each role gets for a goal (0 when not needed,
2–4 for large / bug-prone / correctness-critical work). Run it end-to-end with the
`staffed-build` workflow — it staffs the goal, then fans out that many agents per phase.

## Use it from any project

```
npm run promote     # copies agents + workflows + skill into ~/.claude/
```

Promotes the whole company to your user-level Claude config so the roles
(`researcher`, `architect`, …) and workflows (`build-feature`, `staffed-build`,
`standup`) are callable in **every** Claude Code project — no per-folder setup.
It also installs a **global hook** (`~/.claude/settings.json` → `~/.claude/agent-company/`)
so the dashboard shows **real-time activity from any project** (open a new session for the
hook to load). Run `npm run dashboard` here to watch; re-run `promote` after editing `.claude/`.

## Quick start

From a Claude Code session in this directory:

- *"Use the **architect** agent to plan X"* — delegates to one role.
- **`/go <goal>`** — the one command: the chief-of-staff staffs the team, then it runs
  research → design → implement → review → document.
- Validated roles can be promoted to `~/.claude/agents/` for use in any project.

## Design philosophy

Native-first (works in every project today, zero infra), with a documented escalation to the
**Claude Agent SDK (TypeScript)** when a standalone/deployable service is needed. Role prompts
are kept portable so they migrate to the SDK without rework. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
