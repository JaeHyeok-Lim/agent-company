export const meta = {
  name: 'go',
  description: 'One command for everything — the chief-of-staff allocates headcount per role, then the whole team runs research → design → implement → review → document. Usage: /go <goal>',
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
  : args?.goal || 'No goal provided — usage: /go <goal>'

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
        },
        required: ['role', 'count'],
      },
    },
  },
  required: ['allocation'],
}

// 1) Your command → the manager allocates headcount (this is the single entry point)
phase('Staff')
const plan = await agent(
  `Allocate headcount across the worker roles (researcher, architect, implementer, reviewer, ` +
  `scribe) for this goal. Use 0 where a role isn't needed; allocate 2-4 where the work is large/` +
  `parallelizable, bug-prone, or correctness-critical, and split it into one task slice per ` +
  `instance. Persist the plan to .claude/state/allocation.json, docs/staffing.md, AND the shared ` +
  `~/.claude/agent-company/allocation.json (create the dir if missing), and return the allocation.` +
  `\n\nGoal:\n${goal}`,
  { agentType: 'chief-of-staff', phase: 'Staff', schema: ALLOCATION },
)

const slotFor = (role) => (plan.allocation || []).find((a) => a.role === role)
const countFor = (role) => Math.max(0, Math.trunc(slotFor(role)?.count || 0))
const tasksFor = (role, n) => {
  const t = slotFor(role)?.tasks || []
  return Array.from({ length: n }, (_, i) => t[i] || t[0] || goal)
}

// 2) The manager distributes: fan out `count` instances of a role on their task slices
async function staff(role, phaseTitle, makePrompt) {
  const n = countFor(role)
  if (!n) { log(`${role}: 0 allocated — skipped`); return [] }
  phase(phaseTitle)
  log(`${role}: ${n} allocated`)
  const tasks = tasksFor(role, n)
  const out = await parallel(
    tasks.map((t, i) => () =>
      agent(makePrompt(t, i, n), { agentType: role, phase: phaseTitle, label: `${role} ${i + 1}/${n}` })
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
