import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle } from './helpers.mjs';

const b = loadBundle();

test('schema and project identity', () => {
  assert.equal(b.schema, 'mirqab/1');
  assert.equal(b.project.repo, 'Mirqab');
  assert.equal(b.project.slug, 'mirqab');
  assert.equal(b.project.domain, 'mirqab.3li.info');
  assert.equal(b.project.owner, 'SiteQ8');
});

test('ids are unique across each collection', () => {
  const uniq = (arr, key) => {
    const ids = arr.map((x) => x[key]);
    assert.equal(new Set(ids).size, ids.length, `duplicate ${key}`);
  };
  uniq(b.plant.units, 'id');
  uniq(b.controls.controls, 'id');
  uniq(b.scenarios.scenarios, 'id');
  uniq(b.glossary.terms, 'id');
  uniq(b.zones.purdue, 'id');
  uniq(b.ir.phases, 'id');
  uniq(b.sources.sources, 'id');
});

test('the budget forces real tradeoffs', () => {
  const total = b.controls.controls.reduce((a, c) => a + c.cost, 0);
  assert.ok(b.controls.budget > 0, 'no budget');
  assert.ok(total > b.controls.budget, `budget ${b.controls.budget} should be below the total cost ${total}`);
});

test('every control references real steps', () => {
  const steps = new Set();
  for (const s of b.scenarios.scenarios) for (const st of s.steps) steps.add(st.id);
  for (const c of b.controls.controls) {
    for (const id of [...c.blocks, ...c.detects]) assert.ok(steps.has(id), `control ${c.id} references missing step ${id}`);
    assert.ok(b.zones.purdue.some((z) => z.id === c.level), `control ${c.id} bad level ${c.level}`);
    assert.ok(b.zones.foundational.some((f) => f.id === c.fr), `control ${c.id} bad fr ${c.fr}`);
  }
});

test('every scenario is well formed', () => {
  const controls = new Set(b.controls.controls.map((c) => c.id));
  for (const s of b.scenarios.scenarios) {
    const ids = s.steps.map((x) => x.id);
    assert.ok(s.critical_step && ids.includes(s.critical_step), `${s.id} missing critical step`);
    if (s.safety_step) assert.ok(ids.includes(s.safety_step), `${s.id} missing safety step`);
    if (s.target_var) assert.ok(b.plant.units.some((u) => u.vars.some((v) => v.key === s.target_var)), `${s.id} bad target var`);
    for (const st of s.steps) {
      assert.ok(st.technique && /^T\d{4}$/.test(st.technique.id), `${st.id} bad technique id`);
      for (const id of [...(st.blocked_by || []), ...(st.detected_by || [])]) assert.ok(controls.has(id), `${st.id} references missing control ${id}`);
    }
    for (const ph of b.ir.phases) assert.ok(s.playbook[ph.id], `${s.id} playbook missing ${ph.id}`);
  }
});

test('the safety system guards variables that exist', () => {
  for (const key of b.plant.sis.guards) {
    assert.ok(b.plant.units.some((u) => u.vars.some((v) => v.key === key)), `sis guards missing var ${key}`);
  }
});

test('variable bands are ordered', () => {
  for (const u of b.plant.units) {
    for (const v of u.vars) {
      assert.ok(v.min <= v.normal, `${v.key} min above normal`);
      assert.ok(v.normal < v.warn, `${v.key} normal above warn`);
      assert.ok(v.warn < v.trip, `${v.key} warn above trip`);
      assert.ok(v.trip < v.limit, `${v.key} trip above limit`);
    }
  }
});

test('at least one scenario can end in a release and at least one cannot', () => {
  const withSafety = b.scenarios.scenarios.filter((s) => s.safety_step);
  assert.ok(withSafety.length >= 1, 'no safety-targeting scenario');
  const withoutTarget = b.scenarios.scenarios.filter((s) => s.target_var === null);
  assert.ok(withoutTarget.length >= 1, 'no non-process scenario');
});
