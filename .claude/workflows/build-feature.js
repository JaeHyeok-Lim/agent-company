export const meta = {
  name: 'build-feature',
  description: 'Pipeline a feature through the agent company: research -> design -> implement -> review (with adversarial verify)',
  phases: [
    { title: 'Research', detail: 'researcher gathers context' },
    { title: 'Design', detail: 'architect produces a plan' },
    { title: 'Implement', detail: 'implementer carries out the plan' },
    { title: 'Review', detail: 'reviewer adversarially verifies the change' },
  ],
}

// The task to build is passed as `args` (a string). Fall back to a prompt if omitted.
const task = typeof args === 'string' && args.trim()
  ? args.trim()
  : 'No task provided — describe what to build by passing it as Workflow args.'

const FINDINGS = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    relevantFiles: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary'],
}

const VERDICT = {
  type: 'object',
  properties: {
    correct: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['correct', 'summary'],
}

phase('Research')
const research = await agent(
  `Research what's needed to build this, in the current repo:\n\n${task}\n\nReturn relevant files, how the area works today, and risks.`,
  { agentType: 'researcher', phase: 'Research', schema: FINDINGS },
)

phase('Design')
const plan = await agent(
  `Design a concrete, step-by-step plan to build this:\n\n${task}\n\n` +
  `Research findings:\n${JSON.stringify(research, null, 2)}`,
  { agentType: 'architect', phase: 'Design' },
)

phase('Implement')
const built = await agent(
  `Implement this plan. Make the change, run/verify it, and report the actual result.\n\n` +
  `Task:\n${task}\n\nPlan:\n${plan}`,
  { agentType: 'implementer', phase: 'Implement' },
)

phase('Review')
const verdict = await agent(
  `Adversarially review the change just made. Try to refute each finding before reporting it.\n\n` +
  `Task:\n${task}\n\nImplementation report:\n${built}`,
  { agentType: 'reviewer', phase: 'Review', schema: VERDICT },
)

return { task, research, plan, built, verdict }
