// Renders the team in two views — Cards and Office (a floor plan with walking couriers).
//   roster.json     : static character defs (avatar, traits, model)
//   agents.json     : live per-instance status (multiple agents per role)
//   allocation.json : planned headcount per role (chief-of-staff)
// Office view = a fixed office floor plan; on each handoff (an agent finishes, or the
// orchestrator delegates) a little person walks a document from one zone to another.
const POLL_MS = 1500;
const CAP = 12;       // max status dots in card view
const CREW_CAP = 8;   // max avatars per role (card view)
const ROOM_CREW = 4;  // max people drawn per zone (office view)

const grid = document.getElementById('grid');
const office = document.getElementById('office');
const updated = document.getElementById('updated');
const toggle = document.getElementById('viewToggle');
const simBtn = document.getElementById('simToggle');

// fixed floor-plan zones, % of the plan (x,y = top-left, w,h)
const ROOMS = {
  orchestrator:     { x: 3,  y: 3,  w: 46, h: 20 },
  'chief-of-staff': { x: 51, y: 3,  w: 46, h: 20 },
  researcher:       { x: 3,  y: 26, w: 46, h: 21 },
  architect:        { x: 51, y: 26, w: 46, h: 21 },
  implementer:      { x: 3,  y: 50, w: 46, h: 21 },
  reviewer:         { x: 51, y: 50, w: 46, h: 21 },
  scribe:           { x: 3,  y: 74, w: 94, h: 22 },
};
// who hands off to whom (result flows down the pipeline; entry roles get tasks from the orchestrator)
const NEXT = { researcher: 'architect', architect: 'implementer', implementer: 'reviewer', reviewer: 'scribe', scribe: 'orchestrator', 'chief-of-staff': 'orchestrator' };
const ENTRY = new Set(['researcher', 'chief-of-staff']);

let roster = {};
let lastSig = '';
let prevInst = null;          // id -> {role, status} from the previous render
let floorBuilt = false;
let courierLayer = null;
const roomEls = {};

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
function crewFor(instances, planned) {
  if (instances.length) return instances.slice(0, CREW_CAP).map((x) => ({ status: x.status, task: x.task }));
  if (planned > 0) return Array.from({ length: Math.min(planned, CREW_CAP) }, () => ({ status: 'idle', planned: true }));
  return [{ status: 'idle' }];
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
function podHead(instances, crewLen, planned) {
  if (instances.length) return `${crewLen}${instances.length > CREW_CAP ? '+' : ''}`;
  if (planned === 0) return 'off';
  if (planned > 0) return `×${planned}`;
  return '—';
}
function roleSeed(role) {
  let h = 0;
  for (const ch of role) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 97;
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

// ---- office view: people ----
const SKINS = ['#f1c9a5', '#e7b58f', '#d49a6a', '#a9744f', '#6f4a31'];
const HAIRS = ['#2b2b2b', '#4a2f1d', '#6b4423', '#8a8a8a', '#1c1c1c', '#c9a24b'];
function personSVG() {
  return `<svg class="person" viewBox="0 0 56 64" aria-hidden="true">
    <g class="head">
      <circle class="skin" cx="28" cy="15" r="9"/>
      <path class="hair" d="M19 15 a9 9 0 0 1 18 0 z"/>
      <circle class="eye" cx="25" cy="15" r="1.1"/>
      <circle class="eye" cx="31" cy="15" r="1.1"/>
    </g>
    <path class="shirt torso" d="M16 50 q0 -16 12 -16 q12 0 12 16 z"/>
    <rect class="shirt arm arm-l" x="14" y="36" width="6" height="16" rx="3"/>
    <rect class="shirt arm arm-r" x="36" y="36" width="6" height="16" rx="3"/>
    <circle class="skin hand" cx="17" cy="51" r="3"/>
    <circle class="skin hand" cx="39" cy="51" r="3"/>
  </svg>`;
}
function workstation(info, w, calm, seed) {
  const cls = workerClass(w.status, calm);
  const skin = SKINS[seed % SKINS.length];
  const hair = HAIRS[(seed * 3 + 1) % HAIRS.length];
  return `<div class="workstation ${cls}" style="--skin:${skin};--hair:${hair}">
    <div class="bubble">${workerBubble(w)}</div>
    <div class="zzz">z</div>
    <div class="badge">✓</div>
    ${personSVG()}
    <div class="monitor"></div>
    <div class="desk"></div>
  </div>`;
}

// ---- office view: floor plan (built once, then updated in place) ----
function buildFloorPlan() {
  const rooms = Object.entries(roster)
    .filter(([role]) => ROOMS[role])
    .map(([role, info]) => {
      const R = ROOMS[role];
      return `<div class="room" id="room-${role}" style="left:${R.x}%;top:${R.y}%;width:${R.w}%;height:${R.h}%;--accent:${info.color}">
        <div class="room-plaque"><span class="pemoji">${info.emoji}</span> ${escapeHtml(info.name)} <span class="headcount"></span></div>
        <div class="floor"></div>
      </div>`;
    }).join('');
  office.innerHTML = `<div class="floor-plan">${rooms}<div class="couriers"></div></div>`;
  courierLayer = office.querySelector('.couriers');
  for (const role of Object.keys(roster)) {
    const el = document.getElementById(`room-${role}`);
    if (el) roomEls[role] = { el, floor: el.querySelector('.floor'), head: el.querySelector('.headcount') };
  }
  floorBuilt = true;
}
function updateRooms(entries) {
  for (const [role, info, instances, planned] of entries) {
    const r = roomEls[role];
    if (!r) continue;
    const calm = !!(info.boss || info.manager);
    const crew = crewFor(instances, planned).slice(0, ROOM_CREW);
    const base = roleSeed(role);
    r.floor.innerHTML = crew.map((w, i) => workstation(info, w, calm, base + i)).join('');
    r.head.textContent = podHead(instances, crew.length, planned);
    r.el.classList.toggle('unstaffed', planned === 0);
  }
}

// ---- couriers (document handoffs) ----
function courierSVG() {
  return `<svg viewBox="0 0 24 34" aria-hidden="true"><g class="cwalk">
    <circle class="skin" cx="12" cy="6" r="4.3"/>
    <path class="hair" d="M7.7 6 a4.3 4.3 0 0 1 8.6 0 z"/>
    <rect class="shirt" x="7.5" y="10.5" width="9" height="11" rx="3"/>
    <rect class="leg" x="9" y="21" width="2.6" height="8" rx="1.3"/>
    <rect class="leg" x="12.4" y="21" width="2.6" height="8" rx="1.3"/>
    <rect class="shirt" x="5" y="12.5" width="3.5" height="7" rx="1.7"/>
    <rect class="shirt" x="15.5" y="12.5" width="3.5" height="7" rx="1.7"/>
    <rect class="doc" x="8.5" y="14" width="7" height="9" rx="1"/>
    <line class="docl" x1="10" y1="17" x2="14" y2="17"/>
    <line class="docl" x1="10" y1="19.5" x2="14" y2="19.5"/>
  </g></svg>`;
}
function centerOf(role) {
  const R = ROOMS[role] || ROOMS.orchestrator;
  return { x: R.x + R.w / 2, y: R.y + R.h / 2 };
}
function receive(role) {
  const r = roomEls[role];
  if (!r) return;
  r.el.classList.remove('receiving');
  r.el.getBoundingClientRect(); // force reflow so the flash animation restarts
  r.el.classList.add('receiving');
  setTimeout(() => r.el.classList.remove('receiving'), 800);
}
function sendCourier(from, to) {
  if (!courierLayer || !ROOMS[from] || !ROOMS[to]) return;
  const a = centerOf(from);
  const b = centerOf(to);
  const el = document.createElement('div');
  el.className = 'courier' + (b.x < a.x ? ' flip' : '');
  el.innerHTML = courierSVG();
  el.style.left = `${a.x}%`;
  el.style.top = `${a.y}%`;
  courierLayer.appendChild(el);
  const anim = el.animate(
    [{ left: `${a.x}%`, top: `${a.y}%` }, { left: `${b.x}%`, top: `${b.y}%` }],
    { duration: 2300, easing: 'ease-in-out', fill: 'forwards' }
  );
  anim.onfinish = () => {
    receive(to);
    const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: 'forwards' });
    fade.onfinish = () => el.remove();
  };
}
function diffHandoffs(prev, cur) {
  if (prev === null) return; // skip first render
  const events = [];
  for (const id of Object.keys(cur)) {
    const c = cur[id];
    const p = prev[id];
    if (!p && c.status === 'working' && ENTRY.has(c.role)) events.push(['orchestrator', c.role]);
    if (p && p.status !== 'done' && c.status === 'done' && NEXT[c.role]) events.push([c.role, NEXT[c.role]]);
  }
  const seen = new Set();
  let n = 0;
  for (const [from, to] of events) {
    const k = `${from}>${to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (n++ >= 5) break;
    sendCourier(from, to);
  }
}

// ---- render (cards + office), only rebuild on change so animations don't restart ----
function render(state, alloc) {
  const all = Object.values(state.instances || {});
  const plannedOf = (role) => {
    const s = (alloc.allocation || []).find((a) => a.role === role);
    return s ? Math.trunc(s.count) : undefined;
  };
  const entries = Object.entries(roster).map(([role, info]) => [role, info, all.filter((x) => x.role === role), plannedOf(role)]);

  const sig = entries.map(([role, , inst, planned]) => `${role}:${inst.map((x) => x.status).join(',')}|${planned ?? '-'}`).join(';');
  if (sig !== lastSig) {
    grid.innerHTML = entries.map((e) => card(...e)).join('');
    if (!floorBuilt) buildFloorPlan();
    updateRooms(entries);
    diffHandoffs(prevInst, state.instances || {});
    prevInst = state.instances || {};
    lastSig = sig;
  }

  const working = all.filter((x) => x.status === 'working').length;
  updated.textContent = state.updated
    ? `updated ${new Date(state.updated).toLocaleTimeString()} · ${working} working / ${all.length} total`
    : 'no activity yet — everyone idle';
}

async function tick() {
  if (simOn) return; // simulation drives the render while on
  let state = { instances: {}, updated: null };
  let alloc = { allocation: [] };
  try { state = await getJSON('/.claude/state/agents.json'); } catch { /* no activity yet */ }
  try { alloc = await getJSON('/.claude/state/allocation.json'); } catch { /* no plan yet */ }
  render(state, alloc);
}

// ---- simulation: scripted handoff cycle so the motion is visible on demand ----
const SIM_FLOW = [['researcher', 3], ['architect', 1], ['implementer', 2], ['reviewer', 2], ['scribe', 1]];
let simOn = false;
let simTimer = null;
let simPhase = 0;
function simModel(p) {
  const instances = {};
  for (let k = 0; k < SIM_FLOW.length; k++) {
    const [role, count] = SIM_FLOW[k];
    let status = null;
    if (k < p) status = 'done';
    else if (k === p) status = 'working';
    else continue;
    for (let i = 0; i < count; i++) instances[`sim-${role}-${i}`] = { role, status, task: `${role} task ${i + 1}` };
  }
  return { instances, updated: new Date().toISOString() };
}
function simAdvance() {
  render(simModel(simPhase), { allocation: [] });
  simPhase++;
  if (simPhase > SIM_FLOW.length) { simPhase = 0; lastSig = ''; prevInst = {}; }
}
function startSim() {
  simOn = true;
  simBtn.textContent = '⏸ Stop simulation';
  if (document.body.dataset.view !== 'office') setView('office');
  lastSig = ''; prevInst = {}; simPhase = 0;
  simAdvance();
  simTimer = setInterval(simAdvance, 3200);
}
function stopSim() {
  simOn = false;
  simBtn.textContent = '▶ Simulate handoffs';
  clearInterval(simTimer); simTimer = null;
  lastSig = ''; prevInst = null;
  tick();
}
simBtn.addEventListener('click', () => (simOn ? stopSim() : startSim()));

// ---- boot ----
try {
  roster = await getJSON('/dashboard/roster.json');
  await tick();
  setInterval(tick, POLL_MS);
} catch (e) {
  grid.innerHTML = `<p style="color:#e5534b">Could not load roster.json (${e.message}). Run via <code>npm run dashboard</code>.</p>`;
}
