# Architecture — the agent company

## Org chart

```
                  ┌───────────────────────────────┐
                  │  Orchestrator (main session)  │   ← decomposes goal, delegates,
                  │  + Workflow scripts            │     synthesizes, owns the conclusion
                  └───────────────┬───────────────┘
                                  │ delegates (Agent tool / workflow stages)
        ┌──────────────┬──────────┼───────────────┬──────────────┐
        ▼              ▼          ▼                ▼              ▼
   researcher      architect  implementer      reviewer        scribe
   (read-only,     (plan/      (write code,    (adversarial    (docs +
    explore,        design,     run tests)      verify,         /capture to
    sonnet)         opus)       opus)           opus)           brain, sonnet)
```

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
| **researcher** | "find / locate / how does X work" — broad read-only sweeps | Read, Grep, Glob, WebSearch, WebFetch | sonnet |
| **architect** | "plan / design the approach" before edits | Read, Grep, Glob | opus |
| **implementer** | "make the change" — write code + run it | Read, Edit, Write, Grep, Glob, Bash | opus |
| **reviewer** | "is this correct?" — review a diff, adversarially | Read, Grep, Glob, Bash | opus |
| **scribe** | "document / capture what we learned" | Read, Grep, Glob, Write | sonnet |

## Processes (workflows)

`.claude/workflows/*.js` encode deterministic collaboration. The canonical one,
`build-feature.js`, pipelines: **research → design → implement → review**, with the review
stage adversarially verifying before accepting. Pipelines (no barrier between stages) are the
default; use a barrier only when a stage genuinely needs *all* prior results at once.

Loop patterns to reuse (from `[[loop-engineering]]`): loop-until-dry (keep finding until
nothing new), adversarial verify (refute before accept), self-repair (retry on error).

## Model tiering

Mirrors effort tiers — spend intelligence where it pays:
- `claude-opus-4-8` — orchestration + architect/implementer/reviewer (correctness-sensitive)
- `claude-sonnet-4-6` — researcher/scribe (routine, high-volume)
- `claude-haiku-4-5` — cheap mechanical sub-steps

(Model IDs verified via the `claude-api` skill — re-verify pricing/IDs before relying on them.)

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
