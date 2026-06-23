export const meta = {
  name: 'staffed-build',
  description: 'Chief-of-staff allocates headcount per role (0..N), then the team executes with that many parallel agents per phase on their task slices',
  phases: [
    { title: 'Staff', detail: 'chief-of-staff decides headcount per role' },
    { title: 'Research', detail: 'N researchers in parallel' },
    { title: 'Design', detail: 'N architects in parallel' },
    { title: 'Implement', detail: 'N implementers in parallel' },
    { title: 'Review', detail: 'N reviewers in parallel (adversarial)' },
    { title: 'Document', detail: 'N scribes in parallel' },
  ],
}

const goal = (typeof args === 'string' && args.trim())
  ? args.trim()
  : args?.goal || 'No goal provided — pass the goal as Workflow args.'

const ALLOCATION = {
  type: 'object',
  properties: {
    allocation: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string' },
          count: { type: 'integer' },
          why: { type: 'string' },
          tasks: { type: 'array', items: { type: 'string' } },
          // One ownedPaths entry per instance: the file/dir globs that instance
          // is the SOLE writer of. Must be pairwise disjoint across every
          // concurrent instance (same role and across roles) so two parallel
          // writers can never touch the same path — this is the conflict-safety
          // contract. Anything no slice owns is an integration point (see below).
          ownedPaths: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        },
        required: ['role', 'count'],
      },
    },
  },
  required: ['allocation'],
}

// Write-roles fan out in parallel and may create/modify files; they must not
// collide. The chief-of-staff declares disjoint `ownedPaths` per instance; we
// inject that boundary into each write-role prompt. Read-only roles (researcher,
// architect, reviewer) don't get the boundary — they can't collide.
const WRITE_ROLES = new Set(['implementer', 'scribe'])

phase('Staff')
const plan = await agent(
  `Allocate headcount across the worker roles (researcher, architect, implementer, reviewer, ` +
  `scribe) for this goal. Use 0 where a role isn't needed; allocate 2-4 where the work is large/` +
  `parallelizable, bug-prone, or correctness-critical, and split it into one task slice per ` +
  `instance. For every WRITE role (implementer, scribe) with count >= 1, also emit ownedPaths: ` +
  `an array with one entry per instance listing the file/dir globs that instance is the SOLE ` +
  `writer of. These MUST be pairwise disjoint across all instances so two parallel writers never ` +
  `share a path; files no single slice can own (shared entry points, lockfiles, README) belong ` +
  `to NO slice — leave them out and call them integration points. ` +
  `Persist the plan to .claude/state/allocation.json, docs/staffing.md, AND the shared ` +
  `~/.claude/agent-company/allocation.json (so the dashboard shows planned headcount from any ` +
  `project — create the dir if missing), and return ` +
  `the allocation.\n\nGoal:\n${goal}`,
  { agentType: 'chief-of-staff', phase: 'Staff', schema: ALLOCATION },
)

const slotFor = (role) => (plan.allocation || []).find((a) => a.role === role)
const countFor = (role) => Math.max(0, Math.trunc(slotFor(role)?.count || 0))
const tasksFor = (role, n) => {
  const t = slotFor(role)?.tasks || []
  return Array.from({ length: n }, (_, i) => t[i] || t[0] || goal)
}
// The glob set instance i of a role is the sole writer of (its slice of ownedPaths).
const ownedPathsFor = (role, i) => {
  const o = slotFor(role)?.ownedPaths || []
  return Array.isArray(o[i]) ? o[i] : []
}
// The write-boundary contract appended to every write-role prompt, so a parallel
// writer never touches a path another instance owns.
const boundary = (paths) =>
  paths.length
    ? `\n\nWrite-boundary (conflict-safety): you are the SOLE writer of these paths — ${paths.join(', ')}. ` +
      `Create/modify files ONLY inside them. If your slice needs a file outside your owned paths, ` +
      `do NOT write it — report it as an integration point for the orchestrator to resolve sequentially.`
    : ''

// Fan out `count` instances of a role in parallel on their task slices.
async function staff(role, phaseTitle, makePrompt) {
  const n = countFor(role)
  if (!n) { log(`${role}: 0 allocated — skipped`); return [] }
  phase(phaseTitle)
  log(`${role}: ${n} allocated`)
  const tasks = tasksFor(role, n)
  const out = await parallel(
    tasks.map((t, i) => () =>
      agent(
        makePrompt(t, i, n) + (WRITE_ROLES.has(role) ? boundary(ownedPathsFor(role, i)) : ''),
        { agentType: role, phase: phaseTitle, label: `${role} ${i + 1}/${n}` },
      )
    )
  )
  return out.filter(Boolean)
}

const research = await staff('researcher', 'Research',
  (t) => `Research for the goal. Your slice: ${t}\n\nGoal:\n${goal}`)

const design = await staff('architect', 'Design',
  (t) => `Design the approach. Your slice: ${t}\n\nGoal:\n${goal}\n\nResearch:\n${JSON.stringify(research).slice(0, 6000)}`)

const built = await staff('implementer', 'Implement',
  (t) => `Implement your slice and verify it runs. Slice: ${t}\n\nGoal:\n${goal}\n\nDesign:\n${String(design).slice(0, 6000)}`)

const review = await staff('reviewer', 'Review',
  (t) => `Adversarially review the change — try to refute findings before reporting. Slice: ${t}\n\nImplementation:\n${String(built).slice(0, 6000)}`)

const docs = await staff('scribe', 'Document',
  (t) => `Document the result for the next reader. Slice: ${t}\n\nGoal:\n${goal}\n\nBuilt:\n${String(built).slice(0, 6000)}`)

return { goal, allocation: plan.allocation, research, design, built, review, docs }
