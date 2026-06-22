// Two views — Cards and Office. The Office view is a top-down floor plan with a central
// corridor; people sit at desks in department rooms, extras stroll the corridor, and on every
// handoff a paper airplane flies a message from one department to another.
// The office ALWAYS animates by default; when a real workflow is active it reflects real state,
// otherwise it runs an ambient "busy office" loop. The Pause button freezes all motion.
//   roster.json / agents.json / allocation.json drive the data.
const POLL_MS = 1500;
const CAP = 12;
const CREW_CAP = 8;
const ROOM_CREW = 4;

const grid = document.getElementById('grid');
const office = document.getElementById('office');
const updated = document.getElementById('updated');
const toggle = document.getElementById('viewToggle');
const pauseBtn = document.getElementById('simToggle');

// floor-plan zones (% of plan): two columns flanking a central corridor at x≈45–55
const ROOMS = {
  orchestrator:     { x: 3,  y: 3,  w: 40, h: 22 },
  researcher:       { x: 3,  y: 27, w: 40, h: 22 },
  implementer:      { x: 3,  y: 51, w: 40, h: 22 },
  scribe:           { x: 3,  y: 75, w: 40, h: 22 },
  'chief-of-staff': { x: 57, y: 3,  w: 40, h: 22 },
  architect:        { x: 57, y: 27, w: 40, h: 22 },
  reviewer:         { x: 57, y: 51, w: 40, h: 22 },
};
const LOUNGE = { x: 57, y: 75, w: 40, h: 22 };

const NEXT = { researcher: 'architect', architect: 'implementer', implementer: 'reviewer', reviewer: 'scribe', scribe: 'orchestrator', 'chief-of-staff': 'orchestrator' };
const ENTRY = new Set(['researcher', 'chief-of-staff']);
// edges the ambient loop sends documents along (pipeline + reports + feedback)
const EDGES = [
  ['orchestrator', 'researcher'], ['orchestrator', 'chief-of-staff'],
  ['researcher', 'architect'], ['architect', 'implementer'],
  ['implementer', 'reviewer'], ['reviewer', 'scribe'],
  ['scribe', 'orchestrator'], ['chief-of-staff', 'orchestrator'],
  ['architect', 'researcher'], ['reviewer', 'implementer'],
];
// department props (wall/shelf items) and floor textures, for the office look
const PROPS = {
  orchestrator: '🏆 📊', 'chief-of-staff': '🗂️ 📋', researcher: '📚 🔍',
  architect: '📐 🖼️', implementer: '🖥️ 🔧', reviewer: '🛡️ ✅', scribe: '🗃️ 📄',
};
const FLOORS = ['wood', 'tile', 'carpet'];
// what each handoff is "about" — shown as a title on the flying paper airplane
const MESSAGES = {
  'orchestrator>researcher': 'task brief',
  'orchestrator>chief-of-staff': 'priorities',
  'researcher>architect': 'findings',
  'architect>implementer': 'design spec',
  'implementer>reviewer': 'PR diff',
  'reviewer>scribe': 'sign-off',
  'reviewer>implementer': 'change request',
  'scribe>orchestrator': 'docs',
  'chief-of-staff>orchestrator': 'status report',
  'architect>researcher': 'questions',
};
function messageTitle(from, to) { return MESSAGES[`${from}>${to}`] || 'memo'; }

let roster = {};
let lastSig = '';
let prevInst = null;
let floorBuilt = false;
let courierLayer = null;
let floorPlanEl = null;
const roomEls = {};

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---- view toggle (persisted) ----
function setView(v) {
  document.body.dataset.view = v;
  try { localStorage.setItem('agentView', v); } catch { /* ignore */ }
  toggle.textContent = v === 'office' ? '🃏 Card view' : '🎬 Office view';
}
let initial = 'cards';
try { initial = localStorage.getItem('agentView') || 'cards'; } catch { /* ignore */ }
setView(initial);
toggle.addEventListener('click', () => { setView(document.body.dataset.view === 'office' ? 'cards' : 'office'); tick(); });

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
function taskCaption(w) {
  if (w.status === 'working') return escapeHtml((w.task || 'working…').slice(0, 26));
  if (w.status === 'done') return 'done ✓';
  return 'idle';
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
const SHIRTS = ['#5b8def', '#16b1a6', '#f2a541', '#e5534b', '#7c5cff', '#4caf72'];
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
    <div class="zzz">z</div>
    <div class="badge">✓</div>
    ${personSVG()}
    <div class="monitor"></div>
    <div class="desk"></div>
    <div class="task-cap">${taskCaption(w)}</div>
  </div>`;
}
// a small standing/walking person (no desk) for the corridor + couriers
function walkerSVG(shirt, skin, hair, withDoc) {
  return `<svg viewBox="0 0 22 32" aria-hidden="true"><g class="cwalk">
    <circle cx="11" cy="5.5" r="4" style="fill:${skin}"/>
    <path d="M7 5.5 a4 4 0 0 1 8 0 z" style="fill:${hair}"/>
    <rect x="6.5" y="10" width="9" height="11" rx="3" style="fill:${shirt}"/>
    <rect class="leg-l" x="8" y="21" width="2.4" height="8" rx="1.2" style="fill:#3a4150"/>
    <rect class="leg-r" x="11.6" y="21" width="2.4" height="8" rx="1.2" style="fill:#3a4150"/>
    ${withDoc ? `<rect class="doc" x="7.5" y="13" width="7" height="9" rx="1"/>
    <line class="docl" x1="9" y1="16" x2="13" y2="16"/><line class="docl" x1="9" y1="18.5" x2="13" y2="18.5"/>` : ''}
  </g></svg>`;
}

// a paper airplane (points right by default; rotated toward its target in flight)
function planeSVG() {
  return `<svg class="paper" viewBox="0 0 28 18" aria-hidden="true"><g class="glide">
    <path class="pw" d="M2 3 L27 9 L9 9 Z"/>
    <path class="pb" d="M2 15 L27 9 L9 9 Z"/>
    <path class="pc" d="M2 3 L2 15 L9 9 Z"/>
  </g></svg>`;
}

// ---- office view: floor plan (built once, updated in place) ----
function buildFloorPlan() {
  const roomDecor = '<div class="decor window"></div><div class="decor board"></div><div class="decor plant">🪴</div>';
  const rooms = Object.entries(roster)
    .filter(([role]) => ROOMS[role])
    .map(([role, info]) => {
      const R = ROOMS[role];
      const floorClass = `floor-${FLOORS[roleSeed(role) % FLOORS.length]}`;
      return `<div class="room ${floorClass}" id="room-${role}" style="left:${R.x}%;top:${R.y}%;width:${R.w}%;height:${R.h}%;--accent:${info.color}">
        ${roomDecor}
        <div class="props">${PROPS[role] || ''}</div>
        <div class="plaque"><span class="pemoji">${info.emoji}</span> ${escapeHtml(info.name)} <span class="headcount"></span></div>
        <div class="floor"></div>
      </div>`;
    }).join('');
  // a decorative break-room / lounge
  const lounge = `<div class="room lounge" style="left:${LOUNGE.x}%;top:${LOUNGE.y}%;width:${LOUNGE.w}%;height:${LOUNGE.h}%;--accent:#b98a5a">
      <div class="plaque">☕ Lounge</div>
      <div class="lounge-floor"><span>🛋️</span><span>🪴</span><span>☕</span><span>📺</span></div>
    </div>`;
  // central corridor with strolling people
  const walkers = [
    { d: 7.5, dl: 0, up: false },
    { d: 9, dl: -3, up: true },
    { d: 8.2, dl: -5, up: false },
  ].map((wk, i) => {
    const s = walkerSVG(SHIRTS[(i * 2) % SHIRTS.length], SKINS[(i + 1) % SKINS.length], HAIRS[i % HAIRS.length], false);
    return `<div class="walker ${wk.up ? 'up' : ''}" style="animation-duration:${wk.d}s;animation-delay:${wk.dl}s;left:${42 + i * 6}%">${s}</div>`;
  }).join('');
  const corridor = `<div class="corridor">${walkers}</div>`;

  office.innerHTML = `<div class="floor-plan">${corridor}${rooms}${lounge}<div class="couriers"></div></div>`;
  floorPlanEl = office.querySelector('.floor-plan');
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

// ---- couriers (document handoffs), routed through the corridor ----
function centerOf(role) {
  const R = ROOMS[role] || ROOMS.orchestrator;
  return { x: R.x + R.w / 2, y: R.y + R.h / 2 };
}
// individual-agent helpers: the specific workstation that handles a message
function agentEl(role, idx) {
  const r = roomEls[role];
  if (!r) return null;
  return r.floor.children[idx] || r.floor.children[0] || null;
}
function agentCount(role) {
  const r = roomEls[role];
  return r ? Math.max(1, r.floor.children.length) : 1;
}
function randIdx(role) { return Math.floor(Math.random() * agentCount(role)); }
function agentCenter(role, idx) {
  const ws = agentEl(role, idx);
  if (!ws || !floorPlanEl) return centerOf(role);
  const fp = floorPlanEl.getBoundingClientRect();
  if (!fp.width) return centerOf(role);
  const w = ws.getBoundingClientRect();
  return {
    x: ((w.left + w.width / 2) - fp.left) / fp.width * 100,
    y: ((w.top + w.height * 0.4) - fp.top) / fp.height * 100,
  };
}
function flashAgent(role, idx, cls, ms) {
  const ws = agentEl(role, idx);
  if (!ws) return;
  ws.classList.remove(cls);
  ws.getBoundingClientRect(); // restart the flash
  ws.classList.add(cls);
  setTimeout(() => ws.classList.remove(cls), ms);
}
function sendPlane(from, fromIdx, to, toIdx, title) {
  if (!courierLayer || !ROOMS[from] || !ROOMS[to]) return;
  if (courierLayer.childElementCount > 24) return; // cap concurrent planes
  const a = agentCenter(from, fromIdx);
  const b = agentCenter(to, toIdx);
  // heading in screen space (the plan is wider than tall: 1% x ≈ 1.6 × 1% y)
  const ang = Math.round((Math.atan2((b.y - a.y) * 0.625, b.x - a.x) * 180) / Math.PI);
  const el = document.createElement('div');
  el.className = 'plane';
  el.style.setProperty('--ang', `${ang}deg`);
  el.style.setProperty('--from', roster[from]?.color || '#9aa3b2'); // tint the plane by sender
  el.innerHTML = `<div class="plane-label">${escapeHtml(title || messageTitle(from, to))}</div>${planeSVG()}`;
  el.style.left = `${a.x}%`;
  el.style.top = `${a.y}%`;
  courierLayer.appendChild(el);
  flashAgent(from, fromIdx, 'sending', 700); // 📤 on the specific sender
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2 - 7; // arc lift so it glides
  // near-departure / near-arrival waypoints (8% of the path from each end)
  const nax = a.x + (b.x - a.x) * 0.08;
  const nay = a.y + (b.y - a.y) * 0.08;
  const nbx = a.x + (b.x - a.x) * 0.92;
  const nby = a.y + (b.y - a.y) * 0.92;
  // Speed profile: cruise ≈ 0.7× the old speed, dipping to ≈ 0.4× at departure and
  // arrival so the message label is readable. Linear easing on the two end segments
  // keeps them slow; ease-in-out across the middle accelerates then decelerates.
  const anim = el.animate([
    { left: `${a.x}%`, top: `${a.y}%`, opacity: 0, offset: 0, easing: 'linear' },
    { left: `${nax}%`, top: `${nay}%`, opacity: 1, offset: 0.13, easing: 'ease-in-out' },
    { left: `${midX}%`, top: `${midY}%`, opacity: 1, offset: 0.5, easing: 'ease-in-out' },
    { left: `${nbx}%`, top: `${nby}%`, opacity: 1, offset: 0.87, easing: 'linear' },
    { left: `${b.x}%`, top: `${b.y}%`, opacity: 0, offset: 1 },
  ], { duration: 2700, fill: 'forwards' });
  anim.onfinish = () => { flashAgent(to, toIdx, 'receiving', 900); el.remove(); };
}
function diffHandoffs(prev, cur) {
  if (prev === null) return;
  const byRole = {};
  for (const id of Object.keys(cur)) {
    const role = cur[id].role;
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(id);
  }
  const idxOf = (role, id) => (byRole[role] || []).indexOf(id);
  let n = 0;
  const fire = (from, fromIdx, to, toIdx, title) => {
    if (from && to && n < 12) { n++; sendPlane(from, fromIdx, to, toIdx, title); }
  };
  for (const id of Object.keys(cur)) {
    const c = cur[id];
    const p = prev[id];
    const task = (c.task || '').slice(0, 28); // the REAL task this agent is handling
    if (!p && c.status === 'working' && ENTRY.has(c.role)) {
      // the orchestrator hands this specific new agent its real task
      fire('orchestrator', 0, c.role, Math.max(0, idxOf(c.role, id)), task || 'task');
    } else if (p && p.status !== 'done' && c.status === 'done' && NEXT[c.role]) {
      // this specific agent ships its finished result to a specific agent downstream
      fire(c.role, Math.max(0, idxOf(c.role, id)), NEXT[c.role], randIdx(NEXT[c.role]), task || 'result');
    }
  }
}

// ---- render ----
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
    : (demoMode ? 'demo motion (no real work)' : 'idle — no active work');
}

// ---- ambient "busy office" loop (default ON in office view) ----
const AMBIENT_COUNT = { orchestrator: 1, 'chief-of-staff': 1, researcher: 3, architect: 2, implementer: 3, reviewer: 2, scribe: 2 };
const SAMPLE_TASKS = {
  orchestrator: ['plan', 'route'],
  'chief-of-staff': ['staffing', 'status'],
  researcher: ['scan auth', 'map data', 'API survey'],
  architect: ['design', 'patterns', 'API spec'],
  implementer: ['module A', 'endpoints', 'edge fix'],
  reviewer: ['review', 'edge cases', 'repro'],
  scribe: ['README', 'changelog'],
};
let ambientOn = false;
let ambientTimer = null;
let demoMode = false; // OFF by default → motion reflects only real work
let ambientState = null;
let ambientTickN = 0;
function buildAmbient() {
  const instances = {};
  for (const [role, n] of Object.entries(AMBIENT_COUNT)) {
    for (let i = 0; i < n; i++) instances[`amb-${role}-${i}`] = { role, status: 'working', task: (SAMPLE_TASKS[role] && pick(SAMPLE_TASKS[role])) || role };
  }
  return { instances, updated: null };
}
function ambientStep() {
  ambientTickN++;
  // every few ticks a department "takes a break" (or returns) so idle vs working
  // motion is both visible in the default view
  if (ambientState && ambientTickN % 3 === 0) {
    const role = pick(Object.keys(AMBIENT_COUNT));
    const ids = Object.keys(ambientState.instances).filter((id) => ambientState.instances[id].role === role);
    const goIdle = ambientState.instances[ids[0]]?.status === 'working';
    ids.forEach((id) => { ambientState.instances[id].status = goIdle ? 'idle' : 'working'; });
    render(ambientState, { allocation: [] });
  }
  emitAmbientPlanes(2 + Math.floor(Math.random() * 2)); // 2–3 concurrent messages each tick
}
function emitAmbientPlanes(k) {
  for (let i = 0; i < k; i++) {
    const [from, to] = pick(EDGES);
    sendPlane(from, randIdx(from), to, randIdx(to));
  }
}
function startAmbient() {
  if (ambientOn) return;
  ambientOn = true;
  lastSig = ''; prevInst = null; // suppress diff burst; planes come from the timer
  ambientState = buildAmbient();
  render(ambientState, { allocation: [] });
  emitAmbientPlanes(3);
  ambientTimer = setInterval(ambientStep, 2300);
}
function stopAmbient() {
  ambientOn = false;
  clearInterval(ambientTimer);
  ambientTimer = null;
}

async function tick() {
  let state = { instances: {}, updated: null };
  let alloc = { allocation: [] };
  try { state = await getJSON('/.claude/state/agents.json'); } catch { /* none */ }
  try { alloc = await getJSON('/.claude/state/allocation.json'); } catch { /* none */ }
  const active = Object.values(state.instances || {}).some((x) => x.status === 'working');
  const inOffice = document.body.dataset.view === 'office';

  // Motion reflects REAL work by default: render live state (working agents move, idle
  // agents doze, planes fire only on real handoffs with the real task text). The ambient
  // "busy office" showcase runs only when Demo mode is ON and nothing real is happening.
  if (inOffice && demoMode && !active) {
    startAmbient();
  } else {
    stopAmbient();
    render(state, alloc);
  }
}

// ---- demo motion toggle (default OFF → the floor only animates for real work) ----
function setDemo(on) {
  demoMode = on;
  pauseBtn.textContent = on ? '⏹ Stop demo' : '🎬 Demo motion';
  if (floorPlanEl) floorPlanEl.classList.toggle('demo', on);
  if (!on) stopAmbient();
  tick();
}
pauseBtn.addEventListener('click', () => setDemo(!demoMode));

// ---- boot ----
try {
  roster = await getJSON('/dashboard/roster.json');
  await tick();
  setInterval(tick, POLL_MS);
} catch (e) {
  grid.innerHTML = `<p style="color:#e5534b">Could not load roster.json (${e.message}). Run via <code>npm run dashboard</code>.</p>`;
}
