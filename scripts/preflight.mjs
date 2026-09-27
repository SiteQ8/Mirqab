#!/usr/bin/env node
// Preflight for Mirqab. Rebuilds the bundle, runs the test suite and checks the site is release ready.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const fail = [];
const ok = [];
function step(name, fn) { try { fn(); ok.push(name); } catch (e) { fail.push(`${name}: ${e.message}`); } }

step('build is fresh', () => {
  execSync('node scripts/build.mjs --check', { cwd: ROOT, stdio: 'pipe' });
});

step('tests pass', () => {
  execSync('node --test', { cwd: ROOT, stdio: 'pipe' });
});

step('no placeholder text left behind', () => {
  const exts = ['.js', '.mjs', '.json', '.html', '.css', '.md', '.txt', '.svg'];
  const skip = new Set(['.git', 'node_modules']);
  const bad = [];
  const rx = new RegExp(['TO' + 'DO', 'FIX' + 'ME', 'lorem ' + 'ipsum', 'REPLACE_' + 'ME', 'XX' + 'XX'].join('|'), 'i');
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      if (skip.has(n)) continue;
      const full = join(dir, n);
      if (statSync(full).isDirectory()) walk(full);
      else if (exts.some((e) => n.endsWith(e))) {
        const text = readFileSync(full, 'utf8');
        if (rx.test(text)) bad.push(full.replace(ROOT, ''));
      }
    }
  };
  walk(ROOT);
  if (bad.length) throw new Error(`placeholders in ${bad.join(', ')}`);
});

step('CNAME matches the project domain', () => {
  const bundle = JSON.parse(readFileSync(join(ROOT, 'docs/data/bundle.json'), 'utf8'));
  const cname = readFileSync(join(ROOT, 'docs/CNAME'), 'utf8').trim();
  if (cname !== bundle.project.domain) throw new Error(`CNAME ${cname} != ${bundle.project.domain}`);
});

step('Pages guard files exist', () => {
  for (const f of ['docs/.nojekyll', 'docs/favicon.svg', 'docs/robots.txt', 'docs/sitemap.xml']) {
    if (!existsSync(join(ROOT, f))) throw new Error(`missing ${f}`);
  }
});

step('fonts are bundled locally', () => {
  const dir = join(ROOT, 'docs/fonts');
  const woff = readdirSync(dir).filter((n) => n.endsWith('.woff2'));
  if (woff.length < 1) throw new Error('no local woff2 fonts');
});

for (const o of ok) process.stdout.write(`  ok    ${o}\n`);
for (const f of fail) process.stdout.write(`  FAIL  ${f}\n`);
process.stdout.write(fail.length ? `\npreflight failed with ${fail.length} problem(s)\n` : '\npreflight passed\n');
process.exit(fail.length ? 1 : 0);
