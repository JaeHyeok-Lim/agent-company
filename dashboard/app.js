// Two views — Cards and Office. The Office view is a top-down floor plan with a central
// corridor; people sit at desks in department rooms, extras stroll the corridor, and on every
// real handoff a paper airplane flies the message (with its real task text) between agents.
// Motion reflects REAL work only — when agents actually run (hooks → /shared state) the floor
// lights up; when idle, everyone dozes. No fake/demo motion.
const POLL_MS = 1500;
const CAP = 12;
const CREW_CAP = 8;
const ROOM_CREW = 4;

const grid = document.getElementById('grid');
const office = document.getElementById('office');
const updated = document.getElementById('updated');
const toggle = document.getElementById('viewToggle');

// floor-plan zones (% of plan): two columns flanking a central corridor at x≈45–55
const ROOMS = {
  orchestrator:     { x: 3,  y: 3,  w: 40, h: 22 },
  researcher:       { x: 3,  y: 27, w: 40, h: 22 },
  implementer:      { x: 3,  y: 51, w: 40, h: 22 },
  scribe:           { x: 3,  y: 75, w: 40, h: 22 },
  'chief-of-staff': { x: 57, y: 3,  w: 40, h: 22 },
  architect:        { x: 57, y: 27, w: 40, h: 22 },
  reviewer:         { x: 57, y: 51, w: 40, h: 22 },
  auditor:          { x: 57, y: 75, w: 40, h: 22 },
};

const NEXT = { researcher: 'architect', architect: 'implementer', implementer: 'reviewer', reviewer: 'scribe', scribe: 'orchestrator', 'chief-of-staff': 'orchestrator' };
const ENTRY = new Set(['researcher', 'chief-of-staff']);
// per-department floor textures (kept; the clutter prop icons were removed)
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
  'auditor>orchestrator': '개선 결재',
  'orchestrator>auditor': 'audit ask',
};
function messageTitle(from, to) { return MESSAGES[`${from}>${to}`] || 'memo'; }

let roster = {};
let lastSig = '';
let prevInst = null;
let floorBuilt = false;
let courierLayer = null;
let floorPlanEl = null;
let slipsEl = null;
let shelvesEl = null;
const roomEls = {};

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- per-character task modal (click any character to see what it has done) ----
let lastState = { instances: {} };
let modalEl = null;
let modalTitle = null;
let modalBody = null;
function statusDot(s) {
  if (s === 'working') return '🟡';
  if (s === 'done') return '🟢';
  return '⚪';
}
function taskListHtml(insts) {
  if (!insts.length) return '<p class="modal-empty">아직 한 작업이 없습니다.</p>';
  const rank = { working: 0, done: 1, idle: 2 };
  const sorted = insts.slice().sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  const rows = sorted.map((x) => `<li><span class="mt-dot">${statusDot(x.status)}</span><span class="mt-task">${escapeHtml(x.task || '(작업 미상)')}</span><span class="mt-st">${escapeHtml(x.status)}</span></li>`).join('');
  return `<ul class="modal-tasks">${rows}</ul>`;
}
function openModal(role) {
  ensureModal();
  const all = Object.values(lastState.instances || {});
  const info = roster[role] || { name: role, emoji: '' };
  let body;
  if (role === 'ceo') {
    const roles = [...new Set(all.map((x) => x.role))];
    body = roles.length
      ? roles.map((r) => `<h4>${(roster[r]?.emoji) || ''} ${escapeHtml(roster[r]?.name || r)}</h4>${taskListHtml(all.filter((x) => x.role === r))}`).join('')
      : '<p class="modal-empty">이번 세션에 아직 팀 작업이 없습니다.</p>';
  } else {
    body = taskListHtml(all.filter((x) => x.role === role));
  }
  modalTitle.innerHTML = `${info.emoji || ''} ${escapeHtml(info.name || role)} <span class="modal-sub">— 한 작업 (이번 세션)</span>`;
  modalBody.innerHTML = body;
  modalEl.hidden = false;
}
function ensureModal() {
  if (modalEl) return;
  const wrap = document.createElement('div');
  wrap.id = 'agent-modal';
  wrap.className = 'modal';
  wrap.hidden = true;
  wrap.innerHTML = '<div class="modal-card"><button class="modal-x" type="button" aria-label="닫기">✕</button><h3 class="modal-title"></h3><div class="modal-body"></div></div>';
  document.body.appendChild(wrap);
  modalEl = wrap;
  modalTitle = wrap.querySelector('.modal-title');
  modalBody = wrap.querySelector('.modal-body');
  const close = () => { modalEl.hidden = true; };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.classList.contains('modal-x')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // delegated: click any element tagged with data-role (card, room, or the CEO figure)
  document.addEventListener('click', (e) => {
    if (e.target.closest('#agent-modal')) return;
    const el = e.target.closest('[data-role]');
    if (el) openModal(el.dataset.role);
  });
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
  // only show the task caption while actually working — it disappears when done/idle
  return w.status === 'working' ? escapeHtml((w.task || '').slice(0, 26)) : '';
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
  <div class="card ${cls} status-${status}" data-role="${role}" style="--accent:${info.color}">
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
  const cap = taskCaption(w);
  return `<div class="workstation ${cls}" style="--skin:${skin};--hair:${hair}">
    <i class="pip" title="${w.status}"></i>
    <div class="zzz">z</div>
    <div class="badge">✓</div>
    ${personSVG()}
    <div class="monitor"></div>
    <div class="desk"></div>
    ${cap ? `<div class="task-cap">${cap}</div>` : ''}
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
  const roomDecor = '<div class="decor window"></div><div class="decor board"></div>';
  const rooms = Object.entries(roster)
    .filter(([role]) => ROOMS[role])
    .map(([role, info]) => {
      const R = ROOMS[role];
      const floorClass = `floor-${FLOORS[roleSeed(role) % FLOORS.length]}`;
      return `<div class="room ${floorClass}" id="room-${role}" data-role="${role}" style="left:${R.x}%;top:${R.y}%;width:${R.w}%;height:${R.h}%;--accent:${info.color}">
        ${roomDecor}
        <div class="plaque"><span class="pemoji">${info.emoji}</span> ${escapeHtml(info.name)} <span class="headcount"></span></div>
        <div class="floor"></div>
      </div>`;
    }).join('');
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

  const rail = `<aside class="task-rail">
    <section class="rail-sec in-tray">
      <h3 class="rail-title">🗂️ 해야 할 작업</h3>
      <div class="slips"></div>
    </section>
    <section class="rail-sec warehouse">
      <h3 class="rail-title">📦 완료 창고</h3>
      <div class="shelves"></div>
    </section>
  </aside>`;
  office.innerHTML = `<div class="office-wrap"><div class="floor-plan">${corridor}${rooms}<div class="couriers"></div></div>${rail}</div>`;
  floorPlanEl = office.querySelector('.floor-plan');
  // CEO (you) — an overseeing figure at the top of the floor; click it for the team's work
  floorPlanEl.insertAdjacentHTML('beforeend', '<div class="ceo" data-role="ceo" title="You (CEO) — 클릭하면 팀 작업 보기"><span class="ceo-fig">👑</span><span class="ceo-tag">You</span></div>');
  courierLayer = office.querySelector('.couriers');
  slipsEl = office.querySelector('.slips');
  shelvesEl = office.querySelector('.shelves');
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

// ---- task rail: in-tray (paper slips) + warehouse (boxes on shelves) ----
function infoFor(role) {
  return roster[role] || { name: role, emoji: '👤', color: '#9aa3b2' };
}
function moreLine(extra) {
  return extra > 0 ? `<div class="rail-more">+${extra} more</div>` : '';
}
function slipHtml(inst) {
  const info = infoFor(inst.role);
  const task = escapeHtml(inst.task || 'working…');
  return `<div class="slip" style="--accent:${info.color}">
    <div class="slip-fold"></div>
    <div class="slip-who"><span class="slip-emoji">${info.emoji}</span> ${escapeHtml(info.name)}</div>
    <div class="slip-task">${task}</div>
  </div>`;
}
function boxHtml(inst) {
  const info = infoFor(inst.role);
  const task = escapeHtml(inst.task || 'done');
  return `<div class="box" style="--accent:${info.color}" title="${task}">
    <span class="box-emoji">${info.emoji}</span>
    <span class="box-label">${task}</span>
  </div>`;
}
function updateTaskBoard(all) {
  const working = all.filter((x) => x.status === 'working');
  const done = all.filter((x) => x.status === 'done').reverse(); // most recent first
  if (working.length) {
    const shown = working.slice(0, CAP).map((x) => slipHtml(x)).join('');
    slipsEl.innerHTML = shown + moreLine(working.length - CAP);
  } else {
    slipsEl.innerHTML = '<div class="rail-empty">없음</div>';
  }
  if (done.length) {
    const shown = done.slice(0, CAP).map((x) => boxHtml(x)).join('');
    shelvesEl.innerHTML = shown + moreLine(done.length - CAP);
  } else {
    shelvesEl.innerHTML = '<div class="rail-empty">없음</div>';
  }
}

// ---- couriers (document handoffs), routed through the corridor ----
function centerOf(role) {
  if (role === 'ceo') return { x: 50, y: 2 }; // the CEO figure at the top of the floor
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
  const ws = role === 'ceo' ? floorPlanEl?.querySelector('.ceo') : agentEl(role, idx);
  if (!ws) return;
  ws.classList.remove(cls);
  ws.getBoundingClientRect(); // restart the flash
  ws.classList.add(cls);
  setTimeout(() => ws.classList.remove(cls), ms);
}
function sendPlane(from, fromIdx, to, toIdx, title) {
  const okFrom = ROOMS[from] || from === 'ceo';
  const okTo = ROOMS[to] || to === 'ceo';
  if (!courierLayer || !okFrom || !okTo) return;
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
  // Sit FULLY STILL over the sender for exactly 1s (visible the whole time), then move in
  // ONE straight line at a CONSTANT speed (flight time ∝ distance → same speed for every
  // plane, no mid-flight slow-down), then fade. No arc, no arrival pause.
  const dx = b.x - a.x;
  const dy = (b.y - a.y) * 0.625; // aspect-correct the % space (plan is 16:10)
  const dist = Math.hypot(dx, dy);
  const HOVER = 1000;
  const FLY = Math.max(600, Math.round(dist * 28)); // ~28ms per % unit → same speed for all planes
  const FADE = 300;
  const DUR = HOVER + FLY + FADE;
  const k = (ms) => ms / DUR;
  const anim = el.animate([
    { left: `${a.x}%`, top: `${a.y}%`, opacity: 1, offset: 0 },                          // appear instantly, fully visible
    { left: `${a.x}%`, top: `${a.y}%`, opacity: 1, offset: k(HOVER), easing: 'linear' },  // hold still a full 1s, then depart
    { left: `${b.x}%`, top: `${b.y}%`, opacity: 1, offset: k(HOVER + FLY) },               // straight, constant-speed arrival
    { left: `${b.x}%`, top: `${b.y}%`, opacity: 0, offset: 1 },                            // fade out on arrival
  ], { duration: DUR, fill: 'forwards' });
  flashAgent(from, fromIdx, 'sending', HOVER);                                  // 📤 sender glows during the 1s hold
  setTimeout(() => flashAgent(to, toIdx, 'receiving', 700), HOVER + FLY);       // 📥 receiver, on arrival
  anim.onfinish = () => el.remove();
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
  const hasChief = Object.values(cur).some((x) => x.role === 'chief-of-staff');
  let n = 0;
  const fire = (from, fromIdx, to, toIdx, title) => {
    if (from && to && n < 12) { n++; sendPlane(from, fromIdx, to, toIdx, title); }
  };
  for (const id of Object.keys(cur)) {
    const c = cur[id];
    const p = prev[id];
    const task = (c.task || '').slice(0, 28); // the REAL task this agent is handling
    if (!p && c.status === 'working') {
      // new work appears → it flows from YOU, through the manager, out to the team:
      if (c.role === 'chief-of-staff') {
        fire('ceo', 0, 'chief-of-staff', Math.max(0, idxOf(c.role, id)), task || '명령'); // your command → manager
      } else if (hasChief) {
        fire('chief-of-staff', 0, c.role, Math.max(0, idxOf(c.role, id)), task || '작업 배정'); // manager distributes
      } else if (ENTRY.has(c.role)) {
        fire('ceo', 0, c.role, Math.max(0, idxOf(c.role, id)), task || '지시'); // no manager → straight from you
      }
    } else if (p && p.status !== 'done' && c.status === 'done' && NEXT[c.role]) {
      fire(c.role, Math.max(0, idxOf(c.role, id)), NEXT[c.role], randIdx(NEXT[c.role]), task || 'result');
    }
  }
}

// ---- render ----
function render(state, alloc) {
  lastState = state; // remember for the click-to-see-tasks modal
  const all = Object.values(state.instances || {});
  const plannedOf = (role) => {
    const s = (alloc.allocation || []).find((a) => a.role === role);
    return s ? Math.trunc(s.count) : undefined;
  };
  const entries = Object.entries(roster).map(([role, info]) => [role, info, all.filter((x) => x.role === role), plannedOf(role)]);

  const sig = entries.map(([role, , inst, planned]) => {
    const items = inst.map((x) => `${x.status}~${x.task || ''}`).join(',');
    return `${role}:${items}|${planned ?? '-'}`;
  }).join(';');
  if (sig !== lastSig) {
    grid.innerHTML = entries.map((e) => card(...e)).join('');
    if (!floorBuilt) buildFloorPlan();
    updateRooms(entries);
    updateTaskBoard(all);
    diffHandoffs(prevInst, state.instances || {});
    prevInst = state.instances || {};
    lastSig = sig;
  }

  const working = all.filter((x) => x.status === 'working').length;
  updated.textContent = state.updated
    ? `updated ${new Date(state.updated).toLocaleTimeString()} · ${working} working / ${all.length} total`
    : 'idle — no active work';
}

// ---- live tick: the office reflects REAL work only (no fake/demo motion) ----
async function tick() {
  let state = { instances: {}, updated: null };
  let alloc = { allocation: [] };
  try { state = await getJSON('/shared/agents.json'); } catch { /* none yet */ }
  try { alloc = await getJSON('/shared/allocation.json'); } catch { /* none yet */ }
  // scope to the current (latest) chat session so the floor + task board reflect
  // only this session's assigned work — not the global all-time history
  const sid = state.session;
  if (sid) {
    const scoped = {};
    for (const [id, v] of Object.entries(state.instances || {})) {
      if (v.session === sid) scoped[id] = v;
    }
    state = { instances: scoped, updated: state.updated, session: sid };
  }
  render(state, alloc);
}

// ---- boot ----
try {
  roster = await getJSON('/dashboard/roster.json');
  ensureModal(); // wire click-to-see-tasks (cards, rooms, CEO)
  await tick();
  setInterval(tick, POLL_MS);
} catch (e) {
  grid.innerHTML = `<p style="color:#e5534b">Could not load roster.json (${e.message}). Run via <code>npm run dashboard</code>.</p>`;
}
