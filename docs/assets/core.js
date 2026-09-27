// Mirqab engine. Pure functions over the bundle: planning attack paths, running the process
// simulation, scoring posture. No DOM and no dependencies so the site, the tests and the MCP
// server all share exactly the same logic.

export const SCHEMA = 'mirqab/1';

const cache = new WeakMap();

export function index(b) {
  if (cache.has(b)) return cache.get(b);
  const units = new Map(b.plant.units.map((u) => [u.id, u]));
  const vmeta = new Map();
  for (const u of b.plant.units) {
    for (const v of u.vars) {
      const noise = Math.max((v.warn - v.normal) * 0.04, 0.2);
      vmeta.set(v.key, { ...v, unit: u.id, noise });
    }
  }
  const controls = new Map(b.controls.controls.map((c) => [c.id, c]));
  const scenarios = new Map(b.scenarios.scenarios.map((s) => [s.id, s]));
  const steps = new Map();
  for (const s of b.scenarios.scenarios) for (const st of s.steps) steps.set(st.id, { scenario: s.id, step: st });
  const glossary = new Map(b.glossary.terms.map((t) => [t.id, t]));
  const phases = new Map(b.ir.phases.map((p) => [p.id, p]));
  const zones = new Map(b.zones.purdue.map((z) => [z.id, z]));
  const idx = { units, vmeta, controls, scenarios, steps, glossary, phases, zones };
  cache.set(b, idx);
  return idx;
}

export function arabicFold(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064a')
    .replace(/[\u200c-\u200f]/g, '')
    .trim();
}

export function asSet(enabled) {
  return enabled instanceof Set ? enabled : new Set(enabled || []);
}

export function validateEnabled(b, enabled) {
  const idx = index(b);
  const out = [];
  for (const id of enabled || []) if (idx.controls.has(id) && !out.includes(id)) out.push(id);
  return out;
}

// Walk one scenario's kill chain against the enabled controls and decide the outcome.
export function planScenario(b, scenarioId, enabled) {
  const set = asSet(enabled);
  const sc = index(b).scenarios.get(scenarioId);
  if (!sc) return null;
  const steps = [];
  let stopped = false;
  let reachedCritical = false;
  let safetyIntact = true;
  let detected = false;
  for (const st of sc.steps) {
    const blockedBy = (st.blocked_by || []).filter((id) => set.has(id));
    const detectedBy = (st.detected_by || []).filter((id) => set.has(id));
    let state;
    if (stopped) {
      state = 'pending';
    } else if (blockedBy.length) {
      state = 'blocked';
      stopped = true;
    } else {
      state = detectedBy.length ? 'detected' : 'open';
      if (detectedBy.length) detected = true;
      if (st.id === sc.safety_step) safetyIntact = false;
      if (st.id === sc.critical_step) reachedCritical = true;
    }
    steps.push({ ...st, state, blockedBy, detectedBy });
  }
  let outcome;
  if (!reachedCritical) outcome = 'contained';
  else if (sc.target_var === null) outcome = 'disruption';
  else if (sc.safety_step && !safetyIntact) outcome = 'release';
  else outcome = 'safe-trip';
  return { scenario: sc, steps, reachedCritical, safetyIntact, detected, outcome };
}

export function initialState(b) {
  const vars = {};
  for (const u of b.plant.units) for (const v of u.vars) vars[v.key] = v.normal;
  return { vars, elapsed: 0, status: 'normal', sis: { healthy: true, tripped: false }, released: false, blind: false, esd: false, done: false };
}

// Advance the process one tick under a plan. Deterministic when given a seeded rng.
export function stepSim(b, state, plan, rng = Math.random) {
  const idx = index(b);
  const s = { ...state, vars: { ...state.vars }, sis: { ...state.sis } };
  s.elapsed += 1;
  const noise = (k) => (rng() - 0.5) * idx.vmeta.get(k).noise;
  const target = plan && plan.scenario ? plan.scenario.target_var : null;
  for (const u of b.plant.units) {
    for (const v of u.vars) {
      if (v.key !== target) s.vars[v.key] = v.normal + noise(v.key);
    }
  }
  if (!plan) { s.status = 'normal'; return s; }
  const sc = plan.scenario;
  if (!plan.reachedCritical) { s.status = 'normal'; s.done = true; return s; }
  if (target === null) { s.blind = true; s.status = 'disruption'; s.done = true; return s; }
  const meta = idx.vmeta.get(target);
  s.sis.healthy = plan.safetyIntact;
  let v = s.vars[target];
  if (s.esd) {
    v -= Math.max(meta.trip * 0.08, 2.5);
    if (v <= meta.normal) { v = meta.normal; s.done = true; }
    s.vars[target] = v;
    s.status = 'trip';
    return s;
  }
  v += sc.effect_per_tick + Math.abs(noise(target));
  if (v >= meta.trip && s.sis.healthy) {
    s.sis.tripped = true;
    s.esd = true;
    s.status = 'trip';
    s.vars[target] = Math.min(v, meta.limit - 0.5);
    return s;
  }
  if (!s.sis.healthy && v >= meta.limit) {
    s.vars[target] = meta.limit;
    s.released = true;
    s.status = 'release';
    s.done = true;
    return s;
  }
  s.status = v >= meta.warn ? 'warning' : 'normal';
  s.vars[target] = v;
  return s;
}

// Run a whole scenario to its end without a UI, for tests and the MCP gap report.
export function runToEnd(b, scenarioId, enabled, { seed = 7, maxTicks = 400 } = {}) {
  const plan = planScenario(b, scenarioId, enabled);
  let state = initialState(b);
  const rng = mulberry32(seed);
  let peak = plan.scenario.target_var ? state.vars[plan.scenario.target_var] : 0;
  for (let i = 0; i < maxTicks && !state.done; i += 1) {
    state = stepSim(b, state, plan, rng);
    if (plan.scenario.target_var) peak = Math.max(peak, state.vars[plan.scenario.target_var]);
  }
  return { plan, state, peak, outcome: plan.outcome };
}

export function posture(b, enabled) {
  const set = asSet(enabled);
  const list = b.controls.controls.filter((c) => set.has(c.id));
  const spent = list.reduce((a, c) => a + c.cost, 0);
  const budget = b.controls.budget;
  const fr = {};
  for (const f of b.zones.foundational) fr[f.id] = 0;
  const zone = {};
  for (const z of b.zones.purdue) zone[z.id] = 0;
  for (const c of list) {
    fr[c.fr] = (fr[c.fr] || 0) + 1;
    zone[c.level] = (zone[c.level] || 0) + 1;
  }
  return { spent, budget, over: Math.max(0, spent - budget), remaining: budget - spent, fr, zone };
}

export function summarize(b, enabled) {
  const per = b.scenarios.scenarios.map((sc) => {
    const p = planScenario(b, sc.id, enabled);
    return { id: sc.id, outcome: p.outcome, stopped: !p.reachedCritical, release: p.outcome === 'release', detected: p.detected };
  });
  return {
    total: per.length,
    stopped: per.filter((x) => x.stopped).length,
    release: per.filter((x) => x.release).length,
    per,
  };
}

export function searchGlossary(b, query) {
  const q = arabicFold(query).trim();
  if (!q) return b.glossary.terms.slice();
  const terms = q.split(/\s+/);
  return b.glossary.terms.filter((t) => {
    const hay = arabicFold(`${t.en} ${t.ar} ${t.def.en} ${t.def.ar}`);
    return terms.every((w) => hay.includes(w));
  });
}

// Small seeded PRNG so simulation runs are reproducible in tests and on the site.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
