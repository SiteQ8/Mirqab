import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle } from './helpers.mjs';
import { planScenario, posture, summarize, runToEnd, searchGlossary, validateEnabled } from '../docs/assets/core.js';

const b = loadBundle();
const ALL = b.controls.controls.map((c) => c.id);
const NONE = [];

test('plan marks the first blocked step and stops the chain', () => {
  const plan = planScenario(b, 'safety-target', ['sis_zone']);
  const reach = plan.steps.find((s) => s.id === 's2_reach_sis');
  assert.equal(reach.state, 'blocked');
  assert.equal(plan.steps.find((s) => s.id === 's2_reprogram').state, 'pending');
  assert.equal(plan.outcome, 'contained');
});

test('no defenses lets each scenario reach its process outcome', () => {
  assert.equal(runToEnd(b, 'remote-liq', NONE).outcome, 'safe-trip');
  assert.equal(runToEnd(b, 'safety-target', NONE).outcome, 'release');
  assert.equal(runToEnd(b, 'false-readings', NONE).outcome, 'safe-trip');
  assert.equal(runToEnd(b, 'ransomware-ops', NONE).outcome, 'disruption');
});

test('full defenses contain every scenario', () => {
  for (const s of b.scenarios.scenarios) assert.equal(runToEnd(b, s.id, ALL).outcome, 'contained');
});

test('a release needs the safety system defeated, and either safety control prevents it', () => {
  const release = runToEnd(b, 'safety-target', NONE);
  assert.equal(release.outcome, 'release');
  assert.ok(release.peak >= 70, `peak ${release.peak} should reach the limit`);
  assert.equal(release.plan.safetyIntact, false, 'a release must defeat the safety system');
  // blocking the reprogram with the key switch, or blocking the reach at the sis zone, stops the release
  const keyed = runToEnd(b, 'safety-target', ['sis_keyswitch']);
  assert.equal(keyed.outcome, 'contained');
  assert.equal(keyed.plan.safetyIntact, true, 'the key switch keeps the safety system intact');
  assert.equal(runToEnd(b, 'safety-target', ['sis_zone']).outcome, 'contained');
});

test('the safe trip fires between the trip and the limit', () => {
  const r1 = runToEnd(b, 'remote-liq', NONE);
  assert.ok(r1.peak >= 62 && r1.peak < 70, `S1 peak ${r1.peak}`);
  const r3 = runToEnd(b, 'false-readings', NONE);
  assert.ok(r3.peak >= 250 && r3.peak < 290, `S3 peak ${r3.peak}`);
});

test('posture computes spend and coverage', () => {
  const p = posture(b, ['email_filter', 'mfa_remote']);
  assert.equal(p.spent, 16);
  assert.equal(p.budget, b.controls.budget);
  assert.equal(p.remaining, b.controls.budget - 16);
  assert.equal(p.fr.FR1, 2);
});

test('summarize counts stopped attacks and possible releases', () => {
  const none = summarize(b, NONE);
  assert.equal(none.stopped, 0);
  assert.equal(none.release, 1);
  const all = summarize(b, ALL);
  assert.equal(all.stopped, 4);
  assert.equal(all.release, 0);
});

test('the simulation is deterministic for a given seed', () => {
  const a = runToEnd(b, 'false-readings', NONE, { seed: 42 });
  const c = runToEnd(b, 'false-readings', NONE, { seed: 42 });
  assert.equal(a.peak, c.peak);
});

test('glossary search narrows results and folds Arabic', () => {
  const all = searchGlossary(b, '');
  const some = searchGlossary(b, 'safety');
  assert.ok(some.length > 0 && some.length < all.length);
});

test('validateEnabled drops unknown control ids', () => {
  const out = validateEnabled(b, ['mfa_remote', 'not_real', 'mfa_remote']);
  assert.deepEqual(out, ['mfa_remote']);
});
