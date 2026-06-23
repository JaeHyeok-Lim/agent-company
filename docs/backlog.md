# Backlog

Living task list maintained by the **chief-of-staff** agent. Items are small and
outcome-stated. The chief-of-staff updates this during a `standup` or when asked for status.

## In progress
- (none)

## Next
- Run `build-feature` end-to-end once to validate the multi-agent workflow, then `/capture`
  the "orchestrator is the main session" pattern into the brain. — owner: orchestrator
- Approve & authenticate the project MCP servers (github / context7 / playwright) in a Claude
  Code session. — owner: you

## Done
- Bootstrap agent-company: 10 worker roles + chief-of-staff + auditor, 5 workflows (go, build-feature, staffed-build, standup, audit), delivery-standards skill, live dashboard, MCP config, public GitHub repo.
- **(A) Conflict-safety for parallel writers** — disjoint `ownedPaths` per slice, enforced by contract in both `go.js` and `staffed-build.js`. Chief-of-staff declares pairwise-disjoint path sets per write-role instance; the harness injects a write-boundary clause into every write-role prompt; integration points (no slice can own them) are deferred to the orchestrator. Design rationale and the 3-part contract documented in `docs/ARCHITECTURE.md` § "Conflict-safety for parallel writers".
- **(B) Founder principles mapped to harness** — selected non-redundant founder principles adapted into `CLAUDE.md` (Working principles section) and the architect / implementer / delivery-standards prompts (elegance check, STOP-and-replan, staff-engineer self-check). Full mapping (what was already encoded vs. what was added) in `CLAUDE.md` § "Working principles (orchestrator defaults)".

## Risks / blockers
- (none open)
