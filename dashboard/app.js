// Polls live state and renders each role as a character card with HEADCOUNT:
// - roster.json  : static character defs (avatar, traits, model)
// - agents.json  : live per-instance status (multiple agents per role)
// - allocation.json (optional) : planned headcount per role from the chief-of-staff
const POLL_MS = 1500;
const CAP = 12; // max dots drawn per card
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

function roleStatus(instances) {
  if (instances.some((x) => x.status === 'working')) return 'working';
  if (instances.length && instances.every((x) => x.status === 'done')) return 'done';
  return 'idle';
}
function badge(instances, planned) {
  const working = instances.filter((x) => x.status === 'working').length;
  const done = instances.filter((x) => x.status === 'done').length;
  if (instances.length) {
    const parts = [];
    if (working) parts.push(`${working} working`);
    if (done) parts.push(`${done} done`);
    return parts.join(' · ') || `${instances.length} agents`;
  }
  if (planned === 0) return 'not staffed';
  if (planned > 0) return `planned ×${planned}`;
  return '';
}
function dots(instances, planned) {
  if (instances.length) {
    const shown = instances.slice(0, CAP).map((x) => `<span class="idot ${x.status}" title="${escapeHtml(x.task || x.status)}"></span>`).join('');
    const extra = instances.length > CAP ? `<span class="more">+${instances.length - CAP}</span>` : '';
    return shown + extra;
  }
  if (planned > 0) {
    const shown = Array.from({ length: Math.min(planned, CAP) }, () => `<span class="idot planned"></span>`).join('');
    const extra = planned > CAP ? `<span class="more">+${planned - CAP}</span>` : '';
    return shown + extra;
  }
  return '';
}

function card(role, info, instances, planned) {
  const status = roleStatus(instances);
  const cls = `${info.boss ? 'boss' : ''} ${info.manager ? 'manager' : ''} ${planned === 0 ? 'unstaffed' : ''}`;
  const b = badge(instances, planned);
  const d = dots(instances, planned);
  const latest = instances.find((x) => x.status === 'working') || instances[instances.length - 1];
  return `
  <div class="card ${cls} status-${status}" style="--accent:${info.color}">
    <div class="avatar">${info.emoji}</div>
    <div class="body">
      <div class="name">${escapeHtml(info.name)} <span class="model">${escapeHtml(info.model)}</span>${b ? `<span class="count">${escapeHtml(b)}</span>` : ''}</div>
      <div class="trait">${escapeHtml(info.trait)}</div>
      <div class="status">
        <span class="dot ${status}"></span><span class="label">${status}</span>
        ${latest?.task ? `<span class="task">— ${escapeHtml(latest.task)}</span>` : ''}
      </div>
      ${d ? `<div class="dots">${d}</div>` : ''}
    </div>
  </div>`;
}

async function tick() {
  let state = { instances: {}, updated: null };
  let alloc = { allocation: [] };
  try { state = await getJSON('/.claude/state/agents.json'); } catch { /* no activity yet */ }
  try { alloc = await getJSON('/.claude/state/allocation.json'); } catch { /* no plan yet */ }

  const all = Object.values(state.instances || {});
  const plannedOf = (role) => {
    const s = (alloc.allocation || []).find((a) => a.role === role);
    return s ? Math.trunc(s.count) : undefined;
  };

  grid.innerHTML = Object.entries(roster)
    .map(([role, info]) => card(role, info, all.filter((x) => x.role === role), plannedOf(role)))
    .join('');

  const working = all.filter((x) => x.status === 'working').length;
  updated.textContent = state.updated
    ? `state updated ${new Date(state.updated).toLocaleTimeString()} · ${working} working / ${all.length} total agents`
    : 'no activity yet — everyone idle';
}

// Loaded as a module (<script type="module">), so top-level await is available.
try {
  roster = await getJSON('/dashboard/roster.json');
  await tick();
  setInterval(tick, POLL_MS);
} catch (e) {
  grid.innerHTML = `<p style="color:#e5534b">Could not load roster.json (${e.message}). Run via <code>npm run dashboard</code>.</p>`;
}
