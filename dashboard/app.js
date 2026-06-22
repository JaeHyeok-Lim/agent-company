// Two views — Cards and Office. The Office view is a top-down floor plan (4×4 grid of
// department rooms grouped by workflow); people sit at desks, and on every real handoff a
// paper airplane flies the (localized) message between the specific agents.
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
const buildTag = document.getElementById('build');
if (buildTag) buildTag.textContent = 'build · bold KO dept names + docs sync'; // bump to confirm a hard refresh loaded new code

// ---- i18n (KO / EN) ----
const langToggle = document.getElementById('langToggle');
let LANG = 'ko';
try { LANG = localStorage.getItem('agentLang') || 'ko'; } catch { /* ignore */ }
const T = {
  ko: {
    sub: '멀티 에이전트 팀 — 실시간 플로어 뷰', toOffice: '🎬 오피스 뷰', toCards: '🃏 카드 뷰', langBtn: 'EN',
    idle: '대기', working: '작업 중', done: '완료', legIdle: '대기/휴식', legWorking: '작업 중', legDone: '완료',
    inTray: '🗂️ 해야 할 작업', warehouse: '📦 완료 창고', none: '없음', more: (n) => `+${n}건`,
    notStaffed: '미배정', planned: (n) => `예정 ×${n}`, agentsN: (n) => `${n}명`,
    modalSub: '— 한 작업 (이번 세션)', modalEmpty: '아직 한 작업이 없습니다.', teamEmpty: '이번 세션에 아직 팀 작업이 없습니다.', noDetail: '세부 내용이 기록되지 않았습니다.',
    noActive: '대기 중 — 진행 중인 작업 없음', updated: (tm, w, n) => `${tm} 갱신 · 작업중 ${w} / 총 ${n}`,
    ceoTitle: '대표(You) — 클릭하면 팀 작업 보기',
  },
  en: {
    sub: 'the multi-agent team — live floor view', toOffice: '🎬 Office view', toCards: '🃏 Card view', langBtn: '한국어',
    idle: 'idle', working: 'working', done: 'done', legIdle: 'idle / dozing', legWorking: 'working', legDone: 'done',
    inTray: '🗂️ To do', warehouse: '📦 Done', none: 'none', more: (n) => `+${n} more`,
    notStaffed: 'not staffed', planned: (n) => `planned ×${n}`, agentsN: (n) => `${n} agents`,
    modalSub: '— work this session', modalEmpty: 'No work yet.', teamEmpty: 'No team work this session yet.', noDetail: 'No further detail was recorded.',
    noActive: 'idle — no active work', updated: (tm, w, n) => `updated ${tm} · ${w} working / ${n} total`,
    ceoTitle: 'You (CEO) — click for the team’s work',
  },
};
const t = (k, ...a) => { const v = T[LANG]?.[k]; return typeof v === 'function' ? v(...a) : (v ?? k); };
const ROLE_NAME = {
  ko: { ceo: '대표(You)', orchestrator: '총괄', 'chief-of-staff': '관리팀', 'product-manager': '기획팀', researcher: '조사팀', designer: '디자인팀', architect: '설계팀', implementer: '개발팀', devops: '데브옵스', reviewer: '검토팀', security: '보안팀', 'data-analyst': '데이터팀', scribe: '문서팀', auditor: '감사팀' },
  en: { ceo: 'You (CEO)', orchestrator: 'Orchestrator', 'chief-of-staff': 'Management', 'product-manager': 'Product', researcher: 'Research', designer: 'Design', architect: 'Architecture', implementer: 'Engineering', devops: 'DevOps', reviewer: 'Review', security: 'Security', 'data-analyst': 'Data', scribe: 'Docs', auditor: 'Audit' },
};
const ROLE_ACTION = {
  ko: { ceo: '지시', orchestrator: '총괄', 'chief-of-staff': '업무 배정', 'product-manager': '요구사항 정의', researcher: '자료 조사', designer: 'UX 설계', architect: '설계', implementer: '개발', devops: '배포·인프라', reviewer: '검토', security: '보안 점검', 'data-analyst': '데이터 분석', scribe: '문서화', auditor: '점검' },
  en: { ceo: 'directing', orchestrator: 'coordinating', 'chief-of-staff': 'assigning', 'product-manager': 'defining specs', researcher: 'researching', designer: 'designing UX', architect: 'architecting', implementer: 'building', devops: 'deploying', reviewer: 'reviewing', security: 'security review', 'data-analyst': 'analyzing', scribe: 'writing docs', auditor: 'auditing' },
};
const OUTPUT = { // the abstract thing a sender hands off (shown on the plane)
  ko: { ceo: '지시', orchestrator: '지시', 'chief-of-staff': '업무 배정', 'product-manager': '요구사항', researcher: '조사 결과', designer: '디자인 시안', architect: '설계안', implementer: '구현물', devops: '배포본', reviewer: '검토 의견', security: '보안 검토', 'data-analyst': '분석 결과', scribe: '문서', auditor: '개선 제안' },
  en: { ceo: 'brief', orchestrator: 'brief', 'chief-of-staff': 'assignment', 'product-manager': 'spec', researcher: 'findings', designer: 'mockups', architect: 'design', implementer: 'build', devops: 'release', reviewer: 'review', security: 'sec review', 'data-analyst': 'analysis', scribe: 'docs', auditor: 'proposal' },
};
function roleName(role) { return ROLE_NAME[LANG]?.[role] || roster[role]?.name || role; }
function roleAction(role) { return ROLE_ACTION[LANG]?.[role] || ''; }
function applyStrings() {
  const set = (id, s) => { const e = document.getElementById(id); if (e) e.textContent = s; };
  set('sub', t('sub')); set('lg-idle', t('legIdle')); set('lg-working', t('legWorking')); set('lg-done', t('legDone'));
  if (langToggle) langToggle.textContent = t('langBtn');
  if (toggle) toggle.textContent = document.body.dataset.view === 'office' ? t('toCards') : t('toOffice');
  document.body.classList.toggle('lang-ko', LANG === 'ko'); // bigger CJK text via CSS
}
function setLang(lang) {
  LANG = lang;
  try { localStorage.setItem('agentLang', lang); } catch { /* ignore */ }
  applyStrings();
  floorBuilt = false; // rebuild the office so plaques / rail / labels pick up the language
  if (office) office.innerHTML = '';
  for (const key of Object.keys(roomEls)) delete roomEls[key];
  courierLayer = null; floorPlanEl = null; slipsEl = null; shelvesEl = null;
  lastSig = ''; prevInst = null;
  tick();
}
if (langToggle) langToggle.addEventListener('click', () => setLang(LANG === 'ko' ? 'en' : 'ko'));

// floor-plan zones (% of a square plan)
// 4×4 grid (square canvas) grouped by workflow + adjacency:
//  row1 Leadership/oversight (CEO corner office) · row2 Product · row3 Engineering · row4 Quality+Docs
const ROOMS = {
  ceo:               { x: 1.5, y: 2,   w: 22, h: 22 },
  orchestrator:      { x: 25,  y: 2,   w: 23, h: 22 },
  'chief-of-staff':  { x: 50,  y: 2,   w: 23, h: 22 },
  auditor:           { x: 74.5, y: 2,  w: 22, h: 22 },
  'product-manager': { x: 1.5, y: 26,  w: 22, h: 22 },
  researcher:        { x: 25,  y: 26,  w: 23, h: 22 },
  designer:          { x: 50,  y: 26,  w: 23, h: 22 },
  'data-analyst':    { x: 74.5, y: 26, w: 22, h: 22 },
  architect:         { x: 1.5, y: 50,  w: 22, h: 22 },
  implementer:       { x: 25,  y: 50,  w: 23, h: 22 },
  devops:            { x: 50,  y: 50,  w: 23, h: 22 },
  reviewer:          { x: 1.5, y: 74,  w: 22, h: 22 },
  security:          { x: 25,  y: 74,  w: 23, h: 22 },
  scribe:            { x: 50,  y: 74,  w: 23, h: 22 },
};

// pipeline order for "done → next" handoff planes (full product flow)
const NEXT = {
  'product-manager': 'researcher', researcher: 'designer', designer: 'architect',
  architect: 'implementer', implementer: 'devops', devops: 'reviewer', reviewer: 'security',
  security: 'scribe', scribe: 'orchestrator', 'data-analyst': 'orchestrator', 'chief-of-staff': 'orchestrator',
};
const ENTRY = new Set(['product-manager', 'chief-of-staff', 'researcher']);
// per-department floor textures (kept; the clutter prop icons were removed)
const FLOORS = ['wood', 'tile', 'carpet'];
// the abstract, localized thing a sender hands off — shown on the plane (sender-based)
function messageTitle(from) { return OUTPUT[LANG]?.[from] || (LANG === 'ko' ? '전달' : 'memo'); }

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
// Pull a short, human subject out of the raw task string the hook captured
// (the Agent `description`/`prompt`). Strips workflow scaffolding ("Slice:", "Goal:")
// and the first line only, so a row reads "‘<subject>’에 대한 자료 조사" not just "자료 조사".
function taskSubject(task) {
  if (!task) return '';
  let s = String(task).split('\n')[0].trim();
  s = s.replace(/^(slice|task|goal|subject)\s*[:：]\s*/i, '').trim();
  return s;
}
function taskLabel(x) {
  const action = roleAction(x.role);
  const subj = taskSubject(x.task);
  if (!subj) return action || t('working');
  const short = subj.length > 64 ? `${subj.slice(0, 64)}…` : subj;
  // if the captured text already names the action (e.g. "...자료 조사"), don't repeat it
  if (!action || short.includes(action)) return short;
  return LANG === 'ko' ? `‘${short}’에 대한 ${action}` : `${action}: “${short}”`;
}
function taskListHtml(insts) {
  if (!insts.length) return `<p class="modal-empty">${t('modalEmpty')}</p>`;
  const rank = { working: 0, done: 1, idle: 2 };
  const sorted = insts.slice().sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  const rows = sorted.map((x) => {
    const label = escapeHtml(taskLabel(x));
    const hasDetail = Boolean(x.task && String(x.task).trim());
    const detail = hasDetail ? escapeHtml(String(x.task).trim()) : t('noDetail');
    const caret = `<span class="mt-caret" aria-hidden="true">▸</span>`;
    return `<li class="mt-row"><button type="button" class="mt-line">` +
      `<span class="mt-dot">${statusDot(x.status)}</span>` +
      `<span class="mt-task">${label}</span>` +
      `<span class="mt-st">${escapeHtml(t(x.status))}</span>${caret}</button>` +
      `<div class="mt-detail" hidden>${detail}</div></li>`;
  }).join('');
  return `<ul class="modal-tasks">${rows}</ul>`;
}
function openModal(role) {
  ensureModal();
  const all = Object.values(lastState.instances || {});
  let body;
  if (role === 'ceo') {
    const roles = [...new Set(all.map((x) => x.role))];
    body = roles.length
      ? roles.map((r) => `<h4>${(roster[r]?.emoji) || ''} ${escapeHtml(roleName(r))}</h4>${taskListHtml(all.filter((x) => x.role === r))}`).join('')
      : `<p class="modal-empty">${t('teamEmpty')}</p>`;
  } else {
    body = taskListHtml(all.filter((x) => x.role === role));
  }
  modalTitle.innerHTML = `${(roster[role]?.emoji) || ''} ${escapeHtml(roleName(role))} <span class="modal-sub">${t('modalSub')}</span>`;
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
  // click a task row to expand its full detail (the raw task the hook captured)
  modalBody.addEventListener('click', (e) => {
    const line = e.target.closest('.mt-line');
    if (!line) return;
    const row = line.closest('.mt-row');
    const det = row?.querySelector('.mt-detail');
    if (!det) return;
    det.hidden = !det.hidden;
    row.classList.toggle('open', !det.hidden);
  });
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
  toggle.textContent = v === 'office' ? t('toCards') : t('toOffice');
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
  // abstract, localized action while working — disappears when done/idle
  return w.status === 'working' ? escapeHtml(roleAction(w.role)) : '';
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
    if (working) parts.push(`${working} ${t('working')}`);
    if (done) parts.push(`${done} ${t('done')}`);
    return parts.join(' · ') || t('agentsN', instances.length);
  }
  if (planned === 0) return t('notStaffed');
  if (planned > 0) return t('planned', planned);
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
  return `
  <div class="card ${cls} status-${status}" data-role="${role}" style="--accent:${info.color}">
    <div class="avatar">${info.emoji}</div>
    <div class="body">
      <div class="name">${escapeHtml(roleName(role))} <span class="model">${escapeHtml(info.model)}</span>${b ? `<span class="count">${escapeHtml(b)}</span>` : ''}</div>
      <div class="trait">${escapeHtml(info.trait)}</div>
      <div class="status">
        <span class="dot ${status}"></span><span class="label">${t(status)}</span>
        ${status === 'working' ? `<span class="task">— ${escapeHtml(roleAction(role))}</span>` : ''}
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
      const style = `left:${R.x}%;top:${R.y}%;width:${R.w}%;height:${R.h}%;--accent:${info.color}`;
      const plaque = `<div class="plaque"><span class="pemoji">${info.emoji}</span> <span class="pname">${escapeHtml(roleName(role))}</span>${role === 'ceo' ? '' : ' <span class="headcount"></span>'}</div>`;
      if (role === 'ceo') {
        // the boss's corner office — a 👑 figure, not a worker desk
        return `<div class="room ceo-office" id="room-${role}" data-role="${role}" style="${style}" title="${t('ceoTitle')}">
          ${plaque}<div class="floor"></div><div class="ceo-fig">👑</div>
        </div>`;
      }
      const floorClass = `floor-${FLOORS[roleSeed(role) % FLOORS.length]}`;
      return `<div class="room ${floorClass}" id="room-${role}" data-role="${role}" style="${style}">
        ${roomDecor}
        ${plaque}
        <div class="floor"></div>
      </div>`;
    }).join('');

  const rail = `<aside class="task-rail">
    <section class="rail-sec in-tray">
      <h3 class="rail-title">${t('inTray')}</h3>
      <div class="slips"></div>
    </section>
    <section class="rail-sec warehouse">
      <h3 class="rail-title">${t('warehouse')}</h3>
      <div class="shelves"></div>
    </section>
  </aside>`;
  office.innerHTML = `<div class="office-wrap"><div class="floor-plan">${rooms}<div class="couriers"></div></div>${rail}</div>`;
  floorPlanEl = office.querySelector('.floor-plan');
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
    if (!r || role === 'ceo') continue; // CEO office is static (👑), no worker desks
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
  return extra > 0 ? `<div class="rail-more">${t('more', extra)}</div>` : '';
}
function slipHtml(inst) {
  const info = infoFor(inst.role);
  return `<div class="slip" style="--accent:${info.color}">
    <div class="slip-fold"></div>
    <div class="slip-who"><span class="slip-emoji">${info.emoji}</span> ${escapeHtml(roleName(inst.role))}</div>
    <div class="slip-task">${escapeHtml(roleAction(inst.role))}</div>
  </div>`;
}
function boxHtml(inst) {
  const info = infoFor(inst.role);
  return `<div class="box" style="--accent:${info.color}" title="${escapeHtml(roleName(inst.role))}">
    <span class="box-emoji">${info.emoji}</span>
    <span class="box-label">${escapeHtml(roleAction(inst.role))}</span>
  </div>`;
}
function updateTaskBoard(all) {
  const working = all.filter((x) => x.status === 'working');
  const done = all.filter((x) => x.status === 'done').reverse(); // most recent first
  if (working.length) {
    const shown = working.slice(0, CAP).map((x) => slipHtml(x)).join('');
    slipsEl.innerHTML = shown + moreLine(working.length - CAP);
  } else {
    slipsEl.innerHTML = `<div class="rail-empty">${t('none')}</div>`;
  }
  if (done.length) {
    const shown = done.slice(0, CAP).map((x) => boxHtml(x)).join('');
    shelvesEl.innerHTML = shown + moreLine(done.length - CAP);
  } else {
    shelvesEl.innerHTML = `<div class="rail-empty">${t('none')}</div>`;
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
  const ws = role === 'ceo' ? roomEls.ceo?.el : agentEl(role, idx);
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
  el.innerHTML = `<div class="plane-label">${escapeHtml(title || messageTitle(from))}</div>${planeSVG()}`;
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
  // plane labels come from the localized, abstract handoff type (messageTitle(from))
  const fire = (from, fromIdx, to, toIdx) => {
    if (from && to && n < 12) { n++; sendPlane(from, fromIdx, to, toIdx); }
  };
  for (const id of Object.keys(cur)) {
    const c = cur[id];
    const p = prev[id];
    if (!p && c.status === 'working') {
      // new work appears → it flows from YOU, through the manager, out to the team:
      if (c.role === 'chief-of-staff') fire('ceo', 0, 'chief-of-staff', Math.max(0, idxOf(c.role, id)));
      else if (hasChief) fire('chief-of-staff', 0, c.role, Math.max(0, idxOf(c.role, id)));
      else if (ENTRY.has(c.role)) fire('ceo', 0, c.role, Math.max(0, idxOf(c.role, id)));
    } else if (p && p.status !== 'done' && c.status === 'done' && NEXT[c.role]) {
      fire(c.role, Math.max(0, idxOf(c.role, id)), NEXT[c.role], randIdx(NEXT[c.role]));
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
    ? t('updated', new Date(state.updated).toLocaleTimeString(), working, all.length)
    : t('noActive');
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
  applyStrings(); // set localized static text (sub, legend, buttons)
  await tick();
  setInterval(tick, POLL_MS);
} catch (e) {
  grid.innerHTML = `<p style="color:#e5534b">Could not load roster.json (${e.message}). Run via <code>npm run dashboard</code>.</p>`;
}
