import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export function read(p) { return readFileSync(join(ROOT, p), 'utf8'); }
export function loadBundle() { return JSON.parse(read('docs/data/bundle.json')); }
export function loadSrc(name) { return JSON.parse(read(`data/src/${name}`)); }

const SKIP_DIRS = new Set(['.git', 'node_modules']);
export function walk(rel, exts) {
  const out = [];
  const abs = join(ROOT, rel);
  const rec = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) rec(full);
      else if (!exts || exts.some((e) => name.endsWith(e))) out.push(full);
    }
  };
  rec(abs);
  return out;
}

const PLACEHOLDER = /\{[^}]*\}/g;

// Arabic writing rules: one period at the end only, no Latin or Arabic punctuation mid sentence,
// and any Latin token must be an acronym or number (start uppercase or digit).
export function arabicProblems(ar) {
  const s = String(ar).replace(PLACEHOLDER, '');
  const probs = [];
  const periods = (s.match(/\./g) || []).length;
  if (periods > 1 || (periods === 1 && !s.trim().endsWith('.'))) probs.push('mid-sentence period');
  if (/[\u060c\u061b]/.test(s)) probs.push('arabic comma or semicolon');
  if (/[,;:]/.test(s)) probs.push('latin punctuation');
  for (const tok of s.match(/[A-Za-z][A-Za-z0-9/&+-]*/g) || []) {
    if (!/^[A-Z0-9]/.test(tok)) probs.push(`lowercase latin token: ${tok}`);
  }
  return probs;
}

export function digits(s) { return (String(s).match(/\d+/g) || []).sort(); }
export function sameDigits(en, ar) {
  const a = digits(en); const b = digits(ar);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// Every bilingual prose field where full sentences are expected, excluding identifier-bearing
// fields such as source titles, glossary terms and variable names.
export function prosePairs(b) {
  const out = [];
  const add = (obj, where) => { if (obj && obj.en && obj.ar) out.push({ where, en: obj.en, ar: obj.ar }); };
  for (const u of b.plant.units) add(u.desc, `plant.${u.id}.desc`);
  add(b.plant.sis.desc, 'plant.sis.desc');
  for (const z of b.zones.purdue) add(z.desc, `zone.${z.id}.desc`);
  for (const c of b.controls.controls) add(c.desc, `control.${c.id}.desc`);
  for (const s of b.scenarios.scenarios) {
    add(s.inspiration, `${s.id}.inspiration`);
    add(s.lesson, `${s.id}.lesson`);
    for (const st of s.steps) add(st.summary, `${st.id}.summary`);
    for (const [ph, act] of Object.entries(s.playbook)) add(act, `${s.id}.playbook.${ph}`);
  }
  for (const t of b.glossary.terms) add(t.def, `glossary.${t.id}.def`);
  for (const p of b.ir.phases) add(p.desc, `ir.${p.id}.desc`);
  add(b.sources.note, 'sources.note');
  return out;
}
