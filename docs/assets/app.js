import {
  index, planScenario, initialState, stepSim, posture, summarize, searchGlossary, validateEnabled,
} from './core.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const LS = { lang: 'mirqab:lang', theme: 'mirqab:theme', def: 'mirqab:defenses', ack: 'mirqab:ack' };

const S = {
  b: null,
  lang: 'ar',
  theme: 'dark',
  tab: 'range',
  enabled: new Set(),
  scenarioId: null,
  sim: null,
  glossaryQuery: '',
};

// ---------- storage helpers ----------
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage off */ } }

// ---------- dom helpers ----------
function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style') {
      for (const decl of String(v).split(';')) {
        const c = decl.indexOf(':');
        if (c > 0) n.style.setProperty(decl.slice(0, c).trim(), decl.slice(c + 1).trim());
      }
    } else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) { if (c != null) n.append(c.nodeType ? c : document.createTextNode(c)); }
  return n;
}
function svg(tag, attrs = {}, children = []) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) { if (v != null) n.setAttribute(k, v); }
  for (const c of [].concat(children)) { if (c != null) n.append(c); }
  return n;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// ---------- i18n ----------
function t(key, vars) {
  const entry = S.b.ui[key];
  let str = entry ? (entry[S.lang] ?? entry.en ?? key) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, v);
  return str;
}
function L(obj) { return obj ? (obj[S.lang] ?? obj.en ?? '') : ''; }

// ---------- lang + theme ----------
function applyChrome() {
  const html = document.documentElement;
  html.lang = S.lang;
  html.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
  html.dataset.theme = S.theme;
  document.getElementById('lang-label').textContent = t('lang.switch');
  document.getElementById('lang-toggle').setAttribute('aria-label', t('lang.switchLabel'));
  document.getElementById('theme-label').textContent = S.theme === 'dark' ? t('theme.toLight') : t('theme.toDark');
  document.getElementById('theme-toggle').setAttribute('aria-label', t('theme.label'));
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.getAttribute('data-t')); });
  document.title = S.lang === 'ar' ? 'مرقاب Mirqab' : 'Mirqab مرقاب';
  const fw = S.b.sources.sources.find((s) => s.id === 'nimf');
  if (fw) document.getElementById('foot-fw').href = fw.url;
  document.getElementById('foot-ver').textContent = t('footer.version', { v: S.b.project.version });
  document.getElementById('tabs-nav').setAttribute('aria-label', t('tabs.label'));
}

// ---------- tabs ----------
const TABS = ['range', 'defenses', 'architecture', 'glossary', 'about'];
function renderTabs() {
  const list = document.getElementById('tablist');
  clear(list);
  for (const id of TABS) {
    const b = el('button', {
      class: 'tab', role: 'tab', id: `tab-${id}`, type: 'button',
      'aria-selected': String(id === S.tab), 'aria-controls': 'panels',
      onclick: () => { S.tab = id; render(); scrollTop(); },
    }, t(`tab.${id}`));
    list.append(b);
  }
}
function scrollTop() {
  const y = document.querySelector('.masthead').offsetHeight - 60;
  window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
}

// ---------- mini posture ----------
function updateMini() {
  const mini = document.getElementById('mini');
  const sum = summarize(S.b, [...S.enabled]);
  const dot = document.getElementById('mini-dot');
  const val = document.getElementById('mini-value');
  const extra = document.getElementById('mini-extra');
  mini.hidden = false;
  if (S.enabled.size === 0) {
    val.textContent = t('mini.setDefenses');
    dot.className = 'mini-dot';
    extra.hidden = true;
    return;
  }
  val.textContent = t('mini.safe', { n: sum.stopped, total: sum.total });
  if (sum.release > 0) {
    dot.className = 'mini-dot warn';
    extra.hidden = false;
    extra.textContent = t('mini.release');
  } else {
    dot.className = 'mini-dot';
    extra.hidden = true;
  }
}

// ---------- render root ----------
function render() {
  renderTabs();
  updateMini();
  const panels = document.getElementById('panels');
  clear(panels);
  let node;
  if (S.tab === 'range') node = renderRange();
  else if (S.tab === 'defenses') node = renderDefenses();
  else if (S.tab === 'architecture') node = renderArchitecture();
  else if (S.tab === 'glossary') node = renderGlossary();
  else node = renderAbout();
  node.setAttribute('role', 'tabpanel');
  node.setAttribute('aria-labelledby', `tab-${S.tab}`);
  panels.append(node);
}

// ---------- RANGE ----------
function renderRange() {
  const wrap = el('div', { class: 'panel' });
  wrap.append(el('h2', { class: 'section-title', text: t('range.title') }));
  wrap.append(el('p', { class: 'section-intro', text: t('range.intro') }));
  wrap.append(el('div', { class: 'sadu' }));

  // scenario picker + controls
  const select = el('select', { class: 'scenario-select', 'aria-label': t('range.pick') });
  for (const sc of S.b.scenarios.scenarios) {
    select.append(el('option', { value: sc.id, selected: sc.id === S.scenarioId ? 'selected' : null }, L(sc)));
  }
  select.addEventListener('change', () => { S.scenarioId = select.value; resetSim(); render(); });

  const running = S.sim && !S.sim.done && S.sim.timer;
  const launchBtn = el('button', {
    class: 'btn btn-primary', type: 'button', onclick: launchSim,
    disabled: running ? 'disabled' : null,
  }, [iconPlay(), t('range.launch')]);
  const stopBtn = el('button', { class: 'btn btn-outline', type: 'button', onclick: stopSim, disabled: running ? null : 'disabled' }, t('range.stop'));
  const resetBtn = el('button', { class: 'btn btn-outline', type: 'button', onclick: () => { resetSim(); render(); } }, t('range.reset'));

  wrap.append(el('div', { class: 'scenario-bar' }, [select, el('div', { class: 'controls-row' }, [launchBtn, stopBtn, resetBtn])]));

  if (S.enabled.size === 0) {
    wrap.append(el('div', { class: 'status-banner status-warning' }, [
      el('span', { class: 'st-badge', text: '!' }),
      el('span', { class: 'st-msg', text: t('range.defensesHint') }),
    ]));
  }

  // status banner (dynamic)
  wrap.append(statusBanner());

  // schematic
  const card = el('div', { class: 'card schematic-card' }, [buildSchematic()]);
  wrap.append(card);

  // SIS panel
  wrap.append(sisPanel());

  // active controls line
  const names = [...S.enabled].map((id) => L(index(S.b).controls.get(id))).filter(Boolean);
  wrap.append(el('p', { class: 'active-line' }, [
    `${t('range.activeControls')}: `,
    el('strong', {}, names.length ? names.join(' \u00b7 ') : t('range.none')),
  ]));

  // kill chain + outcome + playbook (only when a sim exists)
  if (S.sim) {
    wrap.append(renderKillChain());
    if (S.sim.done) {
      wrap.append(renderOutcome());
      wrap.append(renderPlaybook());
    }
  }
  return wrap;
}

function statusBanner() {
  const status = S.sim ? S.sim.state.status : 'idle';
  const map = { idle: 'normal', normal: 'normal', warning: 'warning', trip: 'trip', release: 'release', disruption: 'disruption' };
  const cls = map[status] || 'normal';
  let badge; let msg;
  if (status === 'idle') { badge = t('range.idle'); msg = t('status.normalMsg'); }
  else { badge = t(`status.${status}`); msg = t(`status.${status}Msg`); }
  const b = el('div', { class: `status-banner status-${cls}`, id: 'status-banner', role: 'status' }, [
    el('span', { class: 'st-badge', id: 'status-badge', text: badge }),
    el('span', { class: 'st-msg', id: 'status-msg', text: msg }),
  ]);
  return b;
}

// ----- schematic build + update -----
function displayVarKey(u) { return u.display || u.vars[0].key; }

function buildSchematic() {
  const b = S.b;
  const W = 960; const H = 300;
  const s = svg('svg', { class: 'schematic', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('range.title') });
  const units = b.plant.units;
  const n = units.length;
  const mL = 30; const inner = W - mL * 2; const bw = 118; const gap = (inner - n * bw) / (n - 1);
  const boxY = 96; const boxH = 92; const midY = boxY + boxH / 2;
  const pos = units.map((u, i) => ({ u, x: mL + i * (bw + gap) }));

  // flow label
  s.append(svg('text', { x: mL, y: 24, class: 'label-flow' }, [txt(S.lang === 'ar' ? 'مسار العملية' : 'Process flow')]));

  // pipes between units
  for (let i = 0; i < n - 1; i += 1) {
    const x1 = pos[i].x + bw; const x2 = pos[i + 1].x;
    s.append(svg('line', { x1, y1: midY, x2, y2: midY, class: 'pipe' }));
    s.append(svg('line', { x1, y1: midY, x2, y2: midY, class: 'pipe-glow' }));
  }

  // flare stack over the liquefaction/storage region
  const liqIdx = units.findIndex((u) => u.id === 'liq');
  const fx = pos[liqIdx].x + bw + gap / 2;
  s.append(svg('line', { x1: fx, y1: boxY, x2: fx, y2: 44, class: 'flare-stack' }));
  s.append(svg('polygon', { id: 'flame', class: 'flame', points: `${fx - 7},44 ${fx + 7},44 ${fx},22` }));
  s.append(svg('text', { x: fx, y: 60, 'text-anchor': 'middle', class: 'unit-unit', id: 'flare-label' }, [txt(t('range.flare'))]));

  for (const { u, x } of pos) {
    const g = svg('g', {});
    g.append(svg('rect', { id: `box-${u.id}`, x, y: boxY, width: bw, height: boxH, rx: 10, class: `unit-box${u.critical ? ' crit' : ''}` }));
    g.append(svg('text', { x: x + bw / 2, y: boxY + 20, 'text-anchor': 'middle', class: 'unit-name' }, [txt(L(u.short))]));
    if (u.critical) g.append(svg('text', { x: x + bw / 2, y: boxY + 32, 'text-anchor': 'middle', class: 'unit-crit' }, [txt(S.lang === 'ar' ? 'حرجة' : 'CRITICAL')]));
    const dv = index(S.b).vmeta.get(displayVarKey(u));
    g.append(svg('text', { x: x + bw / 2, y: boxY + 56, 'text-anchor': 'middle', class: 'unit-val', id: `val-${u.id}` }, [txt(fmt(dv.normal))]));
    g.append(svg('text', { x: x + bw / 2, y: boxY + 70, 'text-anchor': 'middle', class: 'unit-unit' }, [txt(`${L({ en: dv.en, ar: dv.ar })} \u00b7 ${dv.unit}`)]));
    // gauge
    const gw = bw - 24; const gx = x + 12; const gy = boxY + 78;
    g.append(svg('rect', { x: gx, y: gy, width: gw, height: 6, rx: 3, class: 'gauge-track' }));
    g.append(svg('rect', { id: `gauge-${u.id}`, x: gx, y: gy, width: gaugeWidth(dv, dv.normal, gw), height: 6, rx: 3, class: 'gauge-fill' }));
    s.append(g);
  }

  // SIS shield linking liq + storage down to a guarded box
  const stoIdx = units.findIndex((u) => u.id === 'storage');
  const sx = (pos[liqIdx].x + pos[stoIdx].x + bw) / 2;
  const shY = 210;
  s.append(svg('path', { d: `M${pos[liqIdx].x + bw / 2},${boxY + boxH} L${sx},${shY - 26}`, class: 'sis-link' }));
  s.append(svg('path', { d: `M${pos[stoIdx].x + bw / 2},${boxY + boxH} L${sx},${shY - 26}`, class: 'sis-link' }));
  const shieldPath = `M${sx},${shY - 26} l34,10 v18 c0,18 -16,28 -34,34 c-18,-6 -34,-16 -34,-34 v-18 z`;
  s.append(svg('path', { id: 'sis-shield', d: shieldPath, class: 'sis-shield' }));
  s.append(svg('text', { x: sx, y: shY + 4, 'text-anchor': 'middle', class: 'sis-text' }, [txt('SIS')]));
  s.append(svg('text', { x: sx, y: shY + 20, 'text-anchor': 'middle', class: 'sis-state armed', id: 'sis-state' }, [txt(t('sis.armed'))]));

  S._schematic = { pos, bw, gw: bw - 24 };
  return s;
}

function txt(s) { return document.createTextNode(s); }
function fmt(v) { return Math.abs(v) >= 100 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString(); }
function gaugeWidth(meta, value, gw) {
  const span = meta.limit - meta.min;
  const frac = Math.max(0, Math.min(1, (value - meta.min) / span));
  return Math.round(frac * gw);
}
function levelClass(meta, value) {
  if (value >= meta.limit) return 'release';
  if (value >= meta.trip) return 'trip';
  if (value >= meta.warn) return 'warn';
  return '';
}

function updateSchematic() {
  const st = S.sim.state; const plan = S.sim.plan;
  const target = plan.scenario.target_var;
  const gw = S._schematic ? S._schematic.gw : 94;
  for (const u of S.b.plant.units) {
    const dv = index(S.b).vmeta.get(displayVarKey(u));
    const v = st.vars[dv.key];
    const valEl = document.getElementById(`val-${u.id}`);
    if (valEl) valEl.textContent = fmt(v);
    const cls = levelClass(dv, v);
    const gEl = document.getElementById(`gauge-${u.id}`);
    if (gEl) { gEl.setAttribute('width', gaugeWidth(dv, v, gw)); gEl.setAttribute('class', `gauge-fill${cls ? ` ${cls}` : ''}`); }
    const box = document.getElementById(`box-${u.id}`);
    if (box) {
      const isTarget = dv.key === target;
      let bcls = 'unit-box';
      if (cls) bcls += ` ${cls}`;
      if (isTarget && !st.done) bcls += ' active';
      if (isTarget && st.status === 'release') bcls += ' pulse';
      box.setAttribute('class', bcls);
    }
  }
  // SIS shield state
  const shield = document.getElementById('sis-shield');
  const state = document.getElementById('sis-state');
  let sis = 'armed';
  if (st.sis.tripped) sis = 'tripped';
  else if (!st.sis.healthy) sis = 'disabled';
  if (shield) shield.setAttribute('class', `sis-shield${sis === 'armed' ? '' : ` ${sis}`}`);
  if (state) { state.setAttribute('class', `sis-state ${sis}`); state.textContent = t(`sis.${sis}`); }
  // flare
  const flame = document.getElementById('flame');
  if (flame) flame.setAttribute('class', `flame${st.esd || st.status === 'trip' ? ' lit' : ''}`);
  // status banner
  const banner = document.getElementById('status-banner');
  if (banner) {
    const map = { normal: 'normal', warning: 'warning', trip: 'trip', release: 'release', disruption: 'disruption' };
    banner.setAttribute('class', `status-banner status-${map[st.status] || 'normal'}`);
    document.getElementById('status-badge').textContent = t(`status.${st.status}`);
    document.getElementById('status-msg').textContent = t(`status.${st.status}Msg`);
  }
}

function sisPanel() {
  const st = S.sim ? S.sim.state : null;
  let sis = 'armed';
  if (st) { if (st.sis.tripped) sis = 'tripped'; else if (!st.sis.healthy) sis = 'disabled'; }
  return el('div', { class: 'sis-panel' }, [
    el('span', { class: 'lbl', text: t('sis.title') }),
    el('span', { class: `pill ${sis}`, id: 'sis-pill', text: t(`sis.${sis}`) }),
    el('span', { class: 'sis-guard', text: t('sis.guarding') }),
  ]);
}

// ----- kill chain -----
function renderKillChain() {
  const plan = S.sim.plan; const sc = plan.scenario;
  const wrap = el('div', { class: 'kill' });
  wrap.append(el('div', { class: 'kill-h' }, [
    el('h3', {}, t('kill.title')),
    el('span', { class: 'kill-insp', text: `${t('kill.inspiration')}: ${L(sc.inspiration)}` }),
  ]));
  const ul = el('ul', { class: 'steps' });
  for (const step of plan.steps) {
    ul.append(renderStep(step));
  }
  wrap.append(ul);
  return wrap;
}

function renderStep(step) {
  const stateLabel = { blocked: t('kill.blocked'), detected: t('kill.detected'), open: t('kill.open'), pending: t('kill.pending') }[step.state];
  const ico = { blocked: '\u2713', detected: '!', open: '\u2717', pending: '\u00b7' }[step.state];
  const meta = el('div', { class: 'step-meta' });
  // technique chip -> MITRE link
  meta.append(el('span', { class: 'chip tech' }, [
    `${t('kill.technique')}: `,
    el('a', { href: `https://attack.mitre.org/techniques/${step.technique.id}/`, target: '_blank', rel: 'noopener' }, `${step.technique.id} ${L(step.technique)}`),
  ]));
  for (const id of step.blockedBy) meta.append(el('span', { class: 'chip block', text: `${t('kill.blockedBy')}: ${L(index(S.b).controls.get(id))}` }));
  for (const id of step.detectedBy) meta.append(el('span', { class: 'chip detect', text: `${t('kill.detectedBy')}: ${L(index(S.b).controls.get(id))}` }));

  return el('li', { class: `step ${step.state}` }, [
    el('span', { class: 'step-ico', text: ico }),
    el('div', {}, [
      el('div', { class: 'step-title', text: L(step) }),
      el('div', { class: 'step-sum', text: L(step.summary) }),
      meta,
    ]),
    el('span', { class: 'step-state', text: stateLabel }),
  ]);
}

// ----- outcome -----
function renderOutcome() {
  const plan = S.sim.plan;
  const key = { contained: 'contained', 'safe-trip': 'safeTrip', release: 'release', disruption: 'disruption' }[plan.outcome];
  const wrap = el('div', { class: `outcome ${plan.outcome}` });
  wrap.append(el('div', { class: 'outcome-h' }, [
    el('span', { class: 'outcome-badge', text: t(`outcome.${key}`) }),
    el('strong', { text: t('outcome.title') }),
  ]));
  wrap.append(el('p', { class: 'outcome-msg', text: t(`outcome.${key}Msg`) }));
  wrap.append(el('p', { class: 'outcome-detect', text: plan.detected ? t('outcome.detected') : t('outcome.undetected') }));
  wrap.append(el('div', { class: 'lesson' }, [
    el('span', { class: 'lbl', text: t('outcome.lesson') }),
    el('p', { text: L(plan.scenario.lesson) }),
  ]));
  // suggest a missing control if not contained
  const suggestion = suggestControl(plan);
  if (suggestion) {
    wrap.append(el('button', {
      class: 'btn btn-outline', type: 'button',
      onclick: () => { S.enabled.add(suggestion); saveDefenses(); S.tab = 'defenses'; render(); scrollTop(); },
    }, `${t('outcome.harden')}: ${L(index(S.b).controls.get(suggestion))}`));
  }
  return wrap;
}

function suggestControl(plan) {
  if (plan.outcome === 'contained') return null;
  const sc = plan.scenario;
  const priority = [sc.safety_step, sc.critical_step].filter(Boolean);
  for (const sid of priority) {
    const step = plan.steps.find((s) => s.id === sid);
    if (step && step.state !== 'blocked' && step.blocked_by && step.blocked_by.length) {
      const pick = step.blocked_by.find((id) => !S.enabled.has(id));
      if (pick) return pick;
    }
  }
  for (const step of plan.steps) {
    if ((step.state === 'open' || step.state === 'detected') && step.blocked_by && step.blocked_by.length) {
      const pick = step.blocked_by.find((id) => !S.enabled.has(id));
      if (pick) return pick;
    }
  }
  return null;
}

// ----- playbook -----
function renderPlaybook() {
  const sc = S.sim.plan.scenario;
  const wrap = el('div', { class: 'playbook' });
  wrap.append(el('h3', {}, t('playbook.title')));
  wrap.append(el('p', { class: 'note', text: t('playbook.note') }));
  S.b.ir.phases.forEach((ph, i) => {
    const act = sc.playbook[ph.id];
    wrap.append(el('div', { class: 'phase' }, [
      el('div', { class: 'phase-h' }, [
        el('span', { class: 'phase-num', text: String(i + 1) }),
        el('span', { class: 'phase-name', text: L(ph) }),
      ]),
      el('p', { class: 'phase-act', text: L(act) }),
    ]));
  });
  return wrap;
}

// ----- sim control -----
function launchSim() {
  stopTimer();
  S.sim = { plan: planScenario(S.b, S.scenarioId, [...S.enabled]), state: initialState(S.b), timer: null, done: false };
  render();
  const tick = () => {
    S.sim.state = stepSim(S.b, S.sim.state, S.sim.plan);
    updateSchematic();
    if (S.sim.state.done) {
      stopTimer();
      S.sim.done = true;
      render();
    }
  };
  S.sim.timer = window.setInterval(tick, 720);
}
function stopTimer() { if (S.sim && S.sim.timer) { clearInterval(S.sim.timer); S.sim.timer = null; } }
function stopSim() { stopTimer(); if (S.sim) { S.sim.done = true; } render(); }
function resetSim() { stopTimer(); S.sim = null; }

// ---------- DEFENSES ----------
function renderDefenses() {
  const wrap = el('div', { class: 'panel' });
  wrap.append(el('h2', { class: 'section-title', text: t('def.title') }));
  wrap.append(el('p', { class: 'section-intro', text: t('def.intro') }));

  const pos = posture(S.b, [...S.enabled]);
  const sum = summarize(S.b, [...S.enabled]);

  // budget card
  const bar = el('div', { class: 'budget-bar' }, [
    el('span', { class: pos.over ? 'over' : '', style: `width:${Math.min(100, (pos.spent / pos.budget) * 100)}%` }),
  ]);
  const nums = el('div', { class: 'budget-nums' }, [
    bn(t('def.budget'), `${pos.budget}`),
    bn(t('def.spent'), `${pos.spent}`, pos.over),
    bn(t('def.remaining'), `${pos.remaining}`, pos.over),
  ]);
  const actions = el('div', { class: 'budget-actions' }, [
    el('button', { class: 'btn btn-outline', type: 'button', onclick: () => { S.b.controls.controls.forEach((c) => S.enabled.add(c.id)); saveDefenses(); render(); } }, t('def.selectAll')),
    el('button', { class: 'btn btn-outline', type: 'button', onclick: () => { S.enabled.clear(); saveDefenses(); render(); } }, t('def.clear')),
  ]);
  const summaryLine = el('p', { class: 'summary-line' }, [
    fillStrong(t('def.summary', { n: `\u0000B`, total: `\u0000T` }), sum.stopped, sum.total),
    sum.release > 0 ? el('span', { class: 'rel', text: ` \u00b7 ${t('mini.release')}` }) : null,
  ]);
  const over = pos.over ? el('p', { class: 'over-hint', text: t('def.over', { n: pos.over }) }) : null;
  wrap.append(el('div', { class: 'budget-wrap' }, [el('div', { class: 'card budget-card' }, [
    el('div', { class: 'budget-top' }, [nums, actions]),
    bar, over, summaryLine,
  ])]));

  // controls grouped by level
  for (const z of S.b.zones.purdue) {
    const controls = S.b.controls.controls.filter((c) => c.level === z.id);
    if (!controls.length) continue;
    const group = el('div', { class: 'level-group' });
    group.append(el('div', { class: 'level-head' }, [
      el('span', { class: 'level-tag', text: z.id }),
      el('span', { class: 'level-name', text: L(z) }),
    ]));
    const grid = el('div', { class: 'control-grid' });
    for (const c of controls) grid.append(controlCard(c, pos));
    group.append(grid);
    wrap.append(group);
  }

  // coverage
  wrap.append(coverage(pos));
  return wrap;
}

function bn(k, v, over) {
  return el('div', { class: 'bn' }, [el('span', { class: 'k', text: k }), el('span', { class: `v${over ? ' over' : ''}`, text: v })]);
}
function fillStrong(str, n, total) {
  // str contains sentinel placeholders for n and total; split and inject <b>
  const parts = str.split('\u0000B');
  const frag = document.createDocumentFragment();
  frag.append(parts[0]);
  frag.append(el('b', { text: String(n) }));
  const rest = (parts[1] || '').split('\u0000T');
  frag.append(rest[0]);
  frag.append(el('b', { text: String(total) }));
  frag.append(rest[1] || '');
  return frag;
}

function controlCard(c, pos) {
  const on = S.enabled.has(c.id);
  const label = el('label', { class: `control${on ? ' on' : ''}` });
  const cb = el('input', { type: 'checkbox', 'aria-label': `${t('def.enable')}: ${L(c)}` });
  cb.checked = on;
  cb.addEventListener('change', () => {
    if (cb.checked) S.enabled.add(c.id); else S.enabled.delete(c.id);
    saveDefenses();
    render();
  });
  const scenariosFor = (ids) => {
    const set = new Set();
    for (const sid of ids) { const rec = index(S.b).steps.get(sid); if (rec) set.add(rec.scenario); }
    return [...set].map((id) => L(index(S.b).scenarios.get(id)));
  };
  const chips = el('div', { class: 'control-chips' });
  for (const nm of scenariosFor(c.blocks)) chips.append(el('span', { class: 'chip block', text: `${t('def.blocks')}: ${nm}` }));
  for (const nm of scenariosFor(c.detects)) chips.append(el('span', { class: 'chip detect', text: `${t('def.detects')}: ${nm}` }));

  const body = el('div', {}, [
    el('div', { class: 'control-title' }, [
      L(c),
      el('span', { class: 'cost-badge', text: `${c.cost} ${t('def.points')}` }),
      el('span', { class: 'fr-badge', text: c.fr }),
    ]),
    el('p', { class: 'control-desc', text: L(c.desc) }),
    chips,
  ]);
  if (!on && c.cost > pos.remaining) body.append(el('p', { class: 'over-hint', text: t('def.affordHint') }));
  label.append(cb, body);
  return label;
}

function coverage(pos) {
  const wrap = el('div', { class: 'coverage' });
  // by FR
  const frCard = el('div', { class: 'card' });
  frCard.append(el('p', { class: 'cov-h', text: t('def.coverageFR') }));
  const frAvail = {}; for (const f of S.b.zones.foundational) frAvail[f.id] = 0;
  for (const c of S.b.controls.controls) frAvail[c.fr] = (frAvail[c.fr] || 0) + 1;
  for (const f of S.b.zones.foundational) {
    const have = pos.fr[f.id] || 0; const avail = frAvail[f.id] || 0;
    frCard.append(covRow(`${f.id}`, have, avail));
  }
  wrap.append(frCard);
  // by level
  const zCard = el('div', { class: 'card' });
  zCard.append(el('p', { class: 'cov-h', text: t('def.coverageZone') }));
  const zAvail = {}; for (const z of S.b.zones.purdue) zAvail[z.id] = 0;
  for (const c of S.b.controls.controls) zAvail[c.level] = (zAvail[c.level] || 0) + 1;
  for (const z of S.b.zones.purdue) {
    const avail = zAvail[z.id] || 0; if (!avail) continue;
    const have = pos.zone[z.id] || 0;
    zCard.append(covRow(z.id, have, avail));
  }
  wrap.append(zCard);
  return wrap;
}
function covRow(key, have, avail) {
  const pct = avail ? (have / avail) * 100 : 0;
  return el('div', { class: 'cov-row' }, [
    el('span', { class: 'cov-key', text: key }),
    el('div', { class: 'cov-track' }, [el('div', { class: 'cov-fill', style: `width:${pct}%` })]),
    el('span', { class: 'cov-num', text: `${have}/${avail}` }),
  ]);
}

// ---------- ARCHITECTURE ----------
function renderArchitecture() {
  const wrap = el('div', { class: 'panel' });
  wrap.append(el('h2', { class: 'section-title', text: t('arch.title') }));
  wrap.append(el('p', { class: 'section-intro', text: t('arch.intro') }));
  wrap.append(el('div', { class: 'sadu' }));
  wrap.append(el('h3', { text: t('arch.purdue'), style: 'margin:0 0 .6rem' }));
  const levels = el('div', { class: 'levels' });
  for (const z of S.b.zones.purdue) {
    const here = S.b.controls.controls.filter((c) => c.level === z.id);
    const assetsList = el('ul', { class: 'lvl-list' }, z.assets.map((a) => el('li', {}, L(a))));
    const ctrlList = el('ul', { class: 'lvl-list' }, here.length
      ? here.map((c) => el('li', { class: `ctrl${S.enabled.has(c.id) ? '' : ''}`, text: `${L(c)}${S.enabled.has(c.id) ? ' \u2713' : ''}` }))
      : [el('li', { class: 'none', text: t('range.none') })]);
    levels.append(el('div', { class: 'lvl' }, [
      el('div', { class: 'lvl-h' }, [
        el('span', { class: 'lvl-id', text: z.id }),
        el('span', { class: 'lvl-name', text: L(z) }),
        el('span', { class: 'lvl-range', text: z.range }),
      ]),
      el('p', { class: 'lvl-desc', text: L(z.desc) }),
      el('div', { class: 'lvl-cols' }, [
        el('div', { class: 'lvl-col' }, [el('div', { class: 'h', text: t('arch.assets') }), assetsList]),
        el('div', { class: 'lvl-col' }, [el('div', { class: 'h', text: t('arch.controlsHere') }), ctrlList]),
      ]),
    ]));
  }
  wrap.append(levels);
  wrap.append(el('h3', { text: t('arch.fr'), style: 'margin:1.6rem 0 .6rem' }));
  const fr = el('div', { class: 'fr-list' });
  for (const f of S.b.zones.foundational) {
    fr.append(el('div', { class: 'fr-item' }, [el('span', { class: 'fr-id', text: f.id }), el('span', {}, L(f))]));
  }
  wrap.append(fr);
  return wrap;
}

// ---------- GLOSSARY ----------
function renderGlossary() {
  const wrap = el('div', { class: 'panel' });
  wrap.append(el('h2', { class: 'section-title', text: t('glo.title') }));
  wrap.append(el('p', { class: 'section-intro', text: t('glo.intro') }));
  const input = el('input', { class: 'glo-search', type: 'search', placeholder: t('glo.search'), 'aria-label': t('glo.search'), value: S.glossaryQuery });
  input.addEventListener('input', () => { S.glossaryQuery = input.value; renderGlossaryResults(list, count); });
  wrap.append(input);
  const count = el('p', { class: 'glo-count' });
  wrap.append(count);
  const list = el('div', { class: 'glo-grid' });
  wrap.append(list);
  renderGlossaryResults(list, count);
  return wrap;
}
function renderGlossaryResults(list, count) {
  clear(list);
  const results = searchGlossary(S.b, S.glossaryQuery);
  count.textContent = t('glo.count', { n: results.length });
  if (!results.length) { list.append(el('p', { class: 'section-intro', text: t('empty.search') })); return; }
  for (const term of results) {
    const card = el('div', { class: 'term' }, [
      el('div', { class: 'term-h' }, [
        el('span', { class: 'term-en', text: S.lang === 'ar' ? term.ar : term.en }),
        el('span', { class: 'term-ar', text: S.lang === 'ar' ? term.en : term.ar }),
      ]),
      el('p', { class: 'term-def', text: L(term.def) }),
    ]);
    if (term.ref) {
      const src = S.b.sources.sources.find((s) => s.id === term.ref);
      if (src) card.append(el('p', { class: 'term-ref' }, [`${t('glo.ref')}: `, el('a', { href: src.url, target: '_blank', rel: 'noopener' }, L(src))]));
    }
    list.append(card);
  }
}

// ---------- ABOUT ----------
function renderAbout() {
  const wrap = el('div', { class: 'panel' });
  wrap.append(el('h2', { class: 'section-title', text: t('about.title') }));
  const grid = el('div', { class: 'about-grid' });
  const block = (title, text, cls) => el('div', { class: `about-block${cls ? ` ${cls}` : ''}` }, [el('h3', { text: title }), el('p', { text })]);
  grid.append(block(t('range.title'), t('about.what')));
  grid.append(block(t('playbook.title'), t('about.how')));
  grid.append(block(t('about.sources'), t('about.source')));
  grid.append(block(t('about.nameTitle'), t('about.name')));
  grid.append(block('MCP', t('about.mcp')));
  grid.append(block('', t('about.disclaimer'), 'disclaimer'));
  wrap.append(grid);

  wrap.append(el('div', { class: 'sadu', style: 'margin-top:1.5rem' }));
  wrap.append(el('h3', { text: t('about.sources'), style: 'margin:0 0 .3rem' }));
  const list = el('ul', { class: 'src-list' });
  for (const s of S.b.sources.sources) {
    list.append(el('li', { class: 'src' }, [
      el('div', { class: 'src-t', text: L(s) }),
      el('p', { class: 'src-u', text: L(s.use) }),
      el('a', { class: 'src-link', href: s.url, target: '_blank', rel: 'noopener' }, s.url),
    ]));
  }
  wrap.append(list);
  wrap.append(el('p', { style: 'margin-top:1.2rem' }, [
    el('a', { href: `https://github.com/${S.b.project.owner}/${S.b.project.repo}`, target: '_blank', rel: 'noopener' }, t('about.code')),
  ]));
  return wrap;
}

// ---------- icons ----------
function iconPlay() { const s = svg('svg', { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' }, [svg('path', { d: 'M8 5v14l11-7z' })]); return s; }

// ---------- persistence ----------
function saveDefenses() { lsSet(LS.def, JSON.stringify([...S.enabled])); }

// ---------- first visit disclaimer ----------
let disclaimerEl = null;
function markSvg() {
  return svg('svg', { class: 'modal-mark', viewBox: '0 0 48 48', fill: 'none', 'aria-hidden': 'true' }, [
    svg('path', { d: 'M10 44V21l3-2.2 3 2.2v-4.5l3-2.2 3 2.2V11l3-2.2 3 2.2v5l3-2.2 3 2.2V21l3 2.2V44', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' }),
    svg('circle', { cx: '24', cy: '30', r: '3.4', stroke: 'currentColor', 'stroke-width': '1.8' }),
    svg('path', { d: 'M24 24.4v-3M24 39v-3M18.6 30h-3M32.4 30h-3', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round' }),
  ]);
}
function onDisclaimerKey(e) { if (e.key === 'Escape') dismissDisclaimer(); }
function dismissDisclaimer() {
  if (!disclaimerEl) return;
  disclaimerEl.remove();
  disclaimerEl = null;
  document.removeEventListener('keydown', onDisclaimerKey);
  lsSet(LS.ack, '1');
}
function showDisclaimer() {
  if (disclaimerEl) disclaimerEl.remove();
  const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'disc-title', 'aria-describedby': 'disc-body' }, [
    el('div', { class: 'modal-crest', 'aria-hidden': 'true' }),
    el('div', { class: 'modal-inner' }, [
      el('div', { class: 'modal-head' }, [markSvg(), el('h2', { class: 'modal-title', id: 'disc-title', text: t('popup.title') })]),
      el('div', { class: 'modal-body', id: 'disc-body' }, [el('p', { text: t('popup.body1') }), el('p', { text: t('popup.body2') })]),
      el('div', { class: 'modal-actions' }, [el('button', { class: 'btn btn-primary', type: 'button', id: 'disc-ack', onclick: dismissDisclaimer, text: t('popup.ack') })]),
    ]),
  ]);
  disclaimerEl = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === disclaimerEl) dismissDisclaimer(); } }, [dialog]);
  document.body.append(disclaimerEl);
  document.addEventListener('keydown', onDisclaimerKey);
  const btn = document.getElementById('disc-ack');
  if (btn) btn.focus();
}

// ---------- boot ----------
async function boot() {
  try {
    const res = await fetch('data/bundle.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`bundle ${res.status}`);
    S.b = await res.json();
  } catch (e) {
    const boot = document.getElementById('boot');
    boot.textContent = 'Could not load the range data. Please refresh.';
    return;
  }
  index(S.b);
  // prefs
  const lang = lsGet(LS.lang); if (lang === 'ar' || lang === 'en') S.lang = lang;
  const theme = lsGet(LS.theme); S.theme = theme === 'light' ? 'light' : 'dark';
  const saved = lsGet(LS.def);
  if (saved) { try { S.enabled = new Set(validateEnabled(S.b, JSON.parse(saved))); } catch { S.enabled = new Set(); } }
  S.scenarioId = S.b.scenarios.scenarios[0].id;

  document.getElementById('boot').hidden = true;
  document.getElementById('panels').hidden = false;

  document.getElementById('lang-toggle').addEventListener('click', () => {
    S.lang = S.lang === 'ar' ? 'en' : 'ar'; lsSet(LS.lang, S.lang); applyChrome(); render();
    if (disclaimerEl) showDisclaimer();
  });
  document.getElementById('theme-toggle').addEventListener('click', () => {
    S.theme = S.theme === 'dark' ? 'light' : 'dark'; lsSet(LS.theme, S.theme); applyChrome();
  });

  applyChrome();
  render();
  if (lsGet(LS.ack) !== '1') showDisclaimer();
}

boot();
