export const meta = {
  name: 'standup',
  description: 'Status standup: gather repo + team state, then the chief-of-staff synthesizes a decision-ready briefing for the user',
  phases: [
    { title: 'Recon', detail: 'researcher gathers the current situation' },
    { title: 'Brief', detail: 'chief-of-staff turns it into a prioritized briefing' },
  ],
}

const focus = typeof args === 'string' && args.trim() ? args.trim() : 'the whole project'

const RECON = {
  type: 'object',
  properties: {
    recentChanges: { type: 'array', items: { type: 'string' } },
    inProgress: { type: 'array', items: { type: 'string' } },
    openItems: { type: 'array', items: { type: 'string' } },
    anomalies: { type: 'array', items: { type: 'string' } },
  },
  required: ['recentChanges'],
}

phase('Recon')
const recon = await agent(
  `Gather the current situation for a status standup on ${focus}. Check git status/log, ` +
  `.claude/state/agents.json, docs/backlog.md, and any obviously broken or unfinished work. ` +
  `Report facts only — recent changes, what's in progress, open items, and anything anomalous.`,
  { agentType: 'researcher', phase: 'Recon', schema: RECON },
)

phase('Brief')
const briefing = await agent(
  `Produce a decision-ready briefing for the user (the CEO) on ${focus}. Update docs/backlog.md ` +
  `as needed. Lead with a 1-2 line status, then prioritized next steps (each with an owning ` +
  `role), then open risks.\n\nRecon facts:\n${JSON.stringify(recon, null, 2)}`,
  { agentType: 'chief-of-staff', phase: 'Brief' },
)

return { focus, recon, briefing }
