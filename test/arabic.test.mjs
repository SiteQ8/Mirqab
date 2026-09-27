import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle, prosePairs, arabicProblems, sameDigits } from './helpers.mjs';

const b = loadBundle();
const pairs = prosePairs(b);

test('there is a healthy amount of prose to check', () => {
  assert.ok(pairs.length >= 60, `only ${pairs.length} prose pairs`);
});

test('Arabic prose obeys the writing rules', () => {
  const failures = [];
  for (const p of pairs) {
    const probs = arabicProblems(p.ar);
    if (probs.length) failures.push(`${p.where}: ${probs.join(', ')}`);
  }
  assert.deepEqual(failures, [], `Arabic rule violations:\n${failures.join('\n')}`);
});

test('numbers survive translation in every prose pair', () => {
  const failures = [];
  for (const p of pairs) if (!sameDigits(p.en, p.ar)) failures.push(p.where);
  assert.deepEqual(failures, [], `numeral mismatches: ${failures.join(', ')}`);
});

test('UI strings that carry a period obey the Arabic rules', () => {
  const failures = [];
  for (const [k, v] of Object.entries(b.ui)) {
    if (!v || !v.ar) continue;
    const probs = arabicProblems(v.ar);
    if (probs.length) failures.push(`ui.${k}: ${probs.join(', ')}`);
    if (!sameDigits(v.en, v.ar)) failures.push(`ui.${k}: numeral mismatch`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
