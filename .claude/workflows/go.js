export const meta = {
  name: 'go',
  description: 'One command for everything — the chief-of-staff allocates headcount per role, then the team runs define → research → UX → architecture → implement → ship → review → security → data → document. Usage: /go <goal>',
  phases: [
    { title: 'Staff', detail: 'chief-of-staff decides headcount per role (0..N)' },
    { title: 'Define', detail: 'product-manager: requirements, scope, success metrics' },
    { title: 'Research', detail: 'researchers in parallel' },
    { title: 'UX', detail: 'designers: user flow, screens, usability' },
    { title: 'Architecture', detail: 'architects: technical design' },
    { title: 'Implement', detail: 'implementers in parallel' },
    { title: 'Ship', detail: 'devops: CI/CD, deploy, reliability' },
    { title: 'Review', detail: 'reviewers (adversarial)' },
    { title: 'Security', detail: 'security: threat-model + vulns' },
    { title: 'Data', detail: 'data-analyst: metrics & experiments' },
    { title: 'Document', detail: 'scribes in parallel' },
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

// 1) Your command → the manager allocates headcount across ALL roles (0 where not needed)
phase('Staff')
const plan = await agent(
  `Allocate headcount across the worker roles (product-manager, researcher, designer, architect, ` +
  `implementer, devops, reviewer, security, data-analyst, scribe) for this goal. Use 0 where a ` +
  `role isn't needed (e.g. no UI → designer 0; no deploy → devops 0; internal tool → data 0). ` +
  `Allocate 2-4 where the work is large/parallelizable, bug-prone, or correctness-critical, and ` +
  `split it into one task slice per instance. Persist the plan to .claude/state/allocation.json, ` +
  `docs/staffing.md, AND the shared ~/.claude/agent-company/allocation.json (create the dir if ` +
  `missing), and return the allocation.\n\nGoal:\n${goal}`,
  { agentType: 'chief-of-staff', phase: 'Staff', schema: ALLOCATION },
)

const slotFor = (role) => (plan.allocation || []).find((a) => a.role === role)
const countFor = (role) => Math.max(0, Math.trunc(slotFor(role)?.count || 0))
const tasksFor = (role, n) => {
  const t = slotFor(role)?.tasks || []
  return Array.from({ length: n }, (_, i) => t[i] || t[0] || goal)
}
const trim = (v, n) => (typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n)

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

const spec = await staff('product-manager', 'Define',
  (t) => `Define requirements, scope (in/out), and success metrics for the goal. Slice: ${t}\n\nGoal:\n${goal}`)

const research = await staff('researcher', 'Research',
  (t) => `Research for the goal. Slice: ${t}\n\nGoal:\n${goal}\n\nProduct brief:\n${trim(spec, 4000)}`)

const ux = await staff('designer', 'UX',
  (t) => `Design the user flow, screens & states, and interactions. Slice: ${t}\n\nGoal:\n${goal}\n\nBrief:\n${trim(spec, 3500)}`)

const design = await staff('architect', 'Architecture',
  (t) => `Design the technical approach. Slice: ${t}\n\nGoal:\n${goal}\n\nResearch:\n${trim(research, 3500)}\n\nUX:\n${trim(ux, 2500)}`)

const built = await staff('implementer', 'Implement',
  (t) => `Implement your slice and verify it runs. Slice: ${t}\n\nGoal:\n${goal}\n\nDesign:\n${trim(design, 4000)}`)

const shipped = await staff('devops', 'Ship',
  (t) => `Set up build/deploy/CI and reliability for the change. Slice: ${t}\n\nImplementation:\n${trim(built, 3000)}`)

const review = await staff('reviewer', 'Review',
  (t) => `Adversarially review the change — refute findings before reporting. Slice: ${t}\n\nImplementation:\n${trim(built, 4000)}`)

const sec = await staff('security', 'Security',
  (t) => `Threat-model and review for vulnerabilities (auth, input, secrets, deps). Slice: ${t}\n\nImplementation:\n${trim(built, 4000)}`)

const data = await staff('data-analyst', 'Data',
  (t) => `Define the metrics/events and any experiment to measure success. Slice: ${t}\n\nGoal:\n${goal}\n\nBrief:\n${trim(spec, 3000)}`)

const docs = await staff('scribe', 'Document',
  (t) => `Document the result for the next reader. Slice: ${t}\n\nGoal:\n${goal}\n\nBuilt:\n${trim(built, 4000)}`)

return { goal, allocation: plan.allocation, spec, research, ux, design, built, shipped, review, sec, data, docs }
