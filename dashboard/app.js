// Polls the live state file and renders each role as a character card.
// Roster (traits/avatars) is static; status (idle/working/done) is live.
const POLL_MS = 1500;
const grid = document.getElementById('grid');
const updated = document.getElementById('updated');

let roster = {};

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function stateOf(state, role) {
  return (state.agents && state.agents[role]) || { status: 'idle', task: '' };
}

function card(role, info, st) {
  const status = st.status || 'idle';
  return `
  <div class="card ${info.boss ? 'boss' : ''} status-${status}" style="--accent:${info.color}">
    <div class="avatar">${info.emoji}</div>
    <div class="body">
      <div class="name">${escapeHtml(info.name)} <span class="model">${escapeHtml(info.model)}</span></div>
      <div class="trait">${escapeHtml(info.trait)}</div>
      <div class="status">
        <span class="dot ${status}"></span>
        <span class="label">${status}</span>
        ${st.task ? `<span class="task">— ${escapeHtml(st.task)}</span>` : ''}
      </div>
    </div>
  </div>`;
}

async function tick() {
  let state = { agents: {}, updated: null };
  try { state = await getJSON('/.claude/state/agents.json'); } catch { /* no activity yet */ }
  grid.innerHTML = Object.entries(roster)
    .map(([role, info]) => card(role, info, stateOf(state, role)))
    .join('');
  updated.textContent = state.updated
    ? `state updated ${new Date(state.updated).toLocaleTimeString()}`
    : 'no activity yet — everyone idle';
}

(async () => {
  try {
    roster = await getJSON('/dashboard/roster.json');
  } catch (e) {
    grid.innerHTML = `<p style="color:#e5534b">Could not load roster.json (${e.message}). Run via <code>npm run dashboard</code>.</p>`;
    return;
  }
  await tick();
  setInterval(tick, POLL_MS);
})();
