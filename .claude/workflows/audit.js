export const meta = {
  name: 'audit',
  description: 'Oversight pass: recon the system, then the auditor files improvement 결재 서류 for the user to approve',
  phases: [
    { title: 'Recon', detail: 'researcher inventories the system' },
    { title: 'Audit', detail: 'auditor analyzes risks/inefficiencies and files proposals' },
  ],
}

const focus = (typeof args === 'string' && args.trim()) ? args.trim() : 'the whole agent-company system'

const RECON = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    recentChanges: { type: 'array', items: { type: 'string' } },
    smells: { type: 'array', items: { type: 'string' } },
  },
  required: ['files'],
}

phase('Recon')
const recon = await agent(
  `Inventory the agent-company system for an audit of ${focus}. List the agents / workflows / ` +
  `hooks / dashboard / docs files, summarize recent git changes, and flag anything that smells ` +
  `off (doc↔code drift, dead code, risky permissions, cost, fragile heuristics). Facts only.`,
  { agentType: 'researcher', phase: 'Recon', schema: RECON },
)

phase('Audit')
const briefing = await agent(
  `Audit ${focus}. Using the recon facts and by reading the actual files, find real risks, ` +
  `problems, and inefficiencies, and FILE improvement 결재 서류 under docs/improvements/ ` +
  `(one per issue, numbered AUDIT-NNNN after the current highest, and update the index). ` +
  `Do not change any system code. Then brief me with what you filed and your top recommendation.` +
  `\n\nRecon facts:\n${JSON.stringify(recon).slice(0, 6000)}`,
  { agentType: 'auditor', phase: 'Audit' },
)

return { focus, recon, briefing }
