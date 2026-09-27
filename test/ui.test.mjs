import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, loadBundle } from './helpers.mjs';

const b = loadBundle();
const ui = b.ui;
const app = read('docs/assets/app.js');
const html = read('docs/index.html');

function has(key) { return ui[key] && ui[key].en && ui[key].ar; }

test('every static t() key in the app exists in both languages', () => {
  const keys = new Set();
  for (const m of app.matchAll(/\bt\(\s*(['"])([^'"]+)\1/g)) keys.add(m[2]);
  assert.ok(keys.size > 30, `only found ${keys.size} static keys`);
  const missing = [...keys].filter((k) => !has(k));
  assert.deepEqual(missing, [], `missing UI keys: ${missing.join(', ')}`);
});

test('every data-t attribute in the page exists in both languages', () => {
  const keys = new Set();
  for (const m of html.matchAll(/data-t="([^"]+)"/g)) keys.add(m[1]);
  const missing = [...keys].filter((k) => !has(k));
  assert.deepEqual(missing, [], `missing data-t keys: ${missing.join(', ')}`);
});

test('dynamic UI families are complete', () => {
  const missing = [];
  const need = (k) => { if (!has(k)) missing.push(k); };
  for (const id of ['range', 'defenses', 'architecture', 'glossary', 'about']) need(`tab.${id}`);
  for (const s of ['normal', 'warning', 'trip', 'release', 'disruption']) { need(`status.${s}`); need(`status.${s}Msg`); }
  for (const s of ['armed', 'disabled', 'tripped']) need(`sis.${s}`);
  for (const o of ['contained', 'safeTrip', 'release', 'disruption']) { need(`outcome.${o}`); need(`outcome.${o}Msg`); }
  for (const s of ['blocked', 'detected', 'open', 'pending']) need(`kill.${s}`);
  assert.deepEqual(missing, [], `incomplete families: ${missing.join(', ')}`);
});

test('every UI entry has non-empty English and Arabic', () => {
  const bad = [];
  for (const [k, v] of Object.entries(ui)) {
    if (!v || typeof v.en !== 'string' || typeof v.ar !== 'string' || !v.en.trim() || !v.ar.trim()) bad.push(k);
  }
  assert.deepEqual(bad, [], `incomplete UI entries: ${bad.join(', ')}`);
});
