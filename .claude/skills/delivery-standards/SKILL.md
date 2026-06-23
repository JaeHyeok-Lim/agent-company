---
name: delivery-standards
description: The agent company's shared definition-of-done and collaboration standards. Load when an agent is producing or accepting a deliverable (code, plan, doc, review) so output is consistent across roles.
---

# Delivery standards

Shared "house rules" every role on the team follows. Keep deliverables consistent regardless
of which agent produced them.

## Core principles (every role)
- **Simplicity first** — make every change as simple as it can be; touch the least code that
  solves it.
- **Minimal impact** — change only what the task needs; don't refactor adjacent code or risk
  introducing bugs in code you weren't asked to touch.
- **No laziness** — trace problems to the root cause; no band-aids or temporary patches. Hold
  to the bar a senior engineer would.

## Definition of done
- The change does what was asked — verified by actually running it, not by assertion.
- Before marking work done, ask: **"would a staff engineer approve this?"** If not, it isn't done.
- Failures and skipped steps are reported plainly, with the real output.
- No scope creep: only what was requested; no speculative abstractions or dead error handling.
- Code matches the surrounding style (naming, comments, idioms).

## Handoffs between roles
- Every role's final message is the deliverable returned to the orchestrator — make it a
  structured conclusion, not a log of the process.
- Cite evidence: `path:line` for code claims, command output for "it works", URLs for web facts.
- Pass forward only what the next role needs; don't dump full context (avoids context rot).

## Verification posture
- Reviewer (and any verify step) uses adversarial verification: try to refute a finding before
  accepting it; default to "not a problem" when uncertain and state what would confirm it.
- For unknown-size discovery (bugs, edge cases), prefer loop-until-dry over a fixed count.

## Knowledge capture
- When work produces a reusable, non-obvious lesson, hand it to the scribe / propose `/capture`
  so it becomes a brain neuron. Knowledge not captured is lost.
