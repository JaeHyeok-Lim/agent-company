// Renders the team in two views — Cards and Office (animated) — switchable via a toggle.
//   roster.json     : static character defs (avatar, traits, model)
//   agents.json     : live per-instance status (multiple agents per role)
//   allocation.json : planned headcount per role (chief-of-staff)
// Office view drives motion from status: working = bob + typing, done = pop, idle = doze (zzz).
const POLL_MS = 1500;
const CAP = 12;        // max status dots in card view
const CREW_CAP = 8;    // max animated avatars per pod in office view

const grid = document.getElementById('grid');
const office = document.getElementById('office');
const updated = document.getElementById('updated');
const toggle = document.getElementById('viewToggle');

let roster = {};
let lastSig = '';

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- view toggle (persisted) ----
function setView(v) {
  document.body.dataset.view = v;
  try { localStorage.setItem('agentView', v); } catch { /* ignore */ }
  toggle.textContent = v === 'office' ? '🃏 Card view' : '🎬 Office view';
}
let initial = 'cards';
try { initial = localStorage.getItem('agentView') || 'cards'; } catch { /* ignore */ }
setView(initial);
toggle.addEventListener('click', () => setView(document.body.dataset.view === 'office' ? 'cards' : 'office'));

// ---- shared helpers ----
function roleStatus(instances) {
  if (instances.some((x) => x.status === 'working')) return 'working';
  if (instances.length && instances.every((x) => x.status === 'done')) return 'done';
  return 'idle';
}

// ---- card view ----
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
    return shown + (instances.length > CAP ? `<span class="more">+${instances.length - CAP}</span>` : '');
  }
  if (planned > 0) {
    const shown = Array.from({ length: Math.min(planned, CAP) }, () => `<span class="idot planned"></span>`).join('');
    return shown + (planned > CAP ? `<span class="more">+${planned - CAP}</span>` : '');
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

// ---- office (animated) view ----
function crewFor(instances, planned) {
  if (instances.length) return instances.slice(0, CREW_CAP).map((x) => ({ status: x.status, task: x.task }));
  if (planned > 0) return Array.from({ length: Math.min(planned, CREW_CAP) }, () => ({ status: 'idle', planned: true }));
  return [{ status: 'idle' }]; // one resting avatar
}
function workerClass(status, calm) {
  if (status === 'working') return 'work';
  if (status === 'done') return 'done';
  return calm ? 'doze calm' : 'doze';
}
function workerBubble(w) {
  if (w.status === 'working') return escapeHtml((w.task || 'working…').slice(0, 38));
  if (w.status === 'done') return 'done ✓';
  return 'z';
}
function worker(info, w, calm) {
  const cls = workerClass(w.status, calm);
  const bubble = workerBubble(w);
  return `<div class="worker ${cls}">
    <div class="bubble">${bubble}</div>
    <div class="zzz">z</div>
    <div class="sprite">${info.emoji}</div>
    <div class="typing"><span></span><span></span><span></span></div>
  </div>`;
}
function podHead(instances, crewLen, planned) {
  if (instances.length) return `${crewLen}${instances.length > CREW_CAP ? '+' : ''}`;
  if (planned === 0) return 'off';
  if (planned > 0) return `×${planned}`;
  return '—';
}
function pod(role, info, instances, planned) {
  const calm = !!(info.boss || info.manager); // bosses rest, they don't snore
  const crew = crewFor(instances, planned);
  const head = podHead(instances, crew.length, planned);
  return `
  <div class="pod ${info.boss ? 'boss' : ''} ${info.manager ? 'manager' : ''} ${planned === 0 ? 'unstaffed' : ''}" style="--accent:${info.color}">
    <div class="pod-head"><span class="pemoji">${info.emoji}</span> ${escapeHtml(info.name)} <span class="headcount">${head}</span></div>
    <div class="crew">${crew.map((w) => worker(info, w, calm)).join('')}</div>
  </div>`;
}

// ---- render both views (only when something changed, so animations don't restart) ----
function render(state, alloc) {
  const all = Object.values(state.instances || {});
  const plannedOf = (role) => {
    const s = (alloc.allocation || []).find((a) => a.role === role);
    return s ? Math.trunc(s.count) : undefined;
  };
  const entries = Object.entries(roster).map(([role, info]) => [role, info, all.filter((x) => x.role === role), plannedOf(role)]);

  const sig = entries.map(([role, , inst, planned]) =>
    `${role}:${inst.map((x) => x.status).join(',')}|${planned ?? '-'}`).join(';');
  if (sig !== lastSig) {
    grid.innerHTML = entries.map((e) => card(...e)).join('');
    office.innerHTML = entries.map((e) => pod(...e)).join('');
    lastSig = sig;
  }

  const working = all.filter((x) => x.status === 'working').length;
  updated.textContent = state.updated
    ? `updated ${new Date(state.updated).toLocaleTimeString()} · ${working} working / ${all.length} total`
    : 'no activity yet — everyone idle';
}

async function tick() {
  let state = { instances: {}, updated: null };
  let alloc = { allocation: [] };
  try { state = await getJSON('/.claude/state/agents.json'); } catch { /* no activity yet */ }
  try { alloc = await getJSON('/.claude/state/allocation.json'); } catch { /* no plan yet */ }
  render(state, alloc);
}

try {
  roster = await getJSON('/dashboard/roster.json');
  await tick();
  setInterval(tick, POLL_MS);
} catch (e) {
  grid.innerHTML = `<p style="color:#e5534b">Could not load roster.json (${e.message}). Run via <code>npm run dashboard</code>.</p>`;
}
