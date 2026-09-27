import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { walk } from './helpers.mjs';

const EXTS = ['.js', '.mjs', '.json', '.html', '.css', '.md', '.txt', '.svg'];
const files = [
  ...walk('data/src', EXTS),
  ...walk('docs', EXTS),
  ...walk('mcp', EXTS),
  ...walk('scripts', EXTS),
  ...walk('test', EXTS),
  ...walk('.', ['.md']).filter((f) => !f.includes('/docs/') && !f.includes('/node_modules/')),
];
// LICENSE has no extension
try { files.push(new URL('../LICENSE', import.meta.url).pathname); } catch { /* optional */ }

const DASHES = /[\u2012\u2013\u2014\u2015\u2212]/;
// built from fragments so the banned words never appear verbatim in the repository
const FORBIDDEN = new RegExp(['cla' + 'ude', 'anthro' + 'pic', 'n' + 'bk'].join('|'), 'i');

test('no Unicode dashes anywhere in the source', () => {
  const bad = [];
  for (const f of files) {
    let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
    if (DASHES.test(text)) {
      const line = text.split('\n').findIndex((l) => DASHES.test(l)) + 1;
      bad.push(`${f}:${line}`);
    }
  }
  assert.deepEqual(bad, [], `Unicode dashes found in:\n${bad.join('\n')}`);
});

test('no mention of the assistant vendor or the excluded name', () => {
  const bad = [];
  for (const f of files) {
    let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
    if (FORBIDDEN.test(text)) {
      const line = text.split('\n').findIndex((l) => FORBIDDEN.test(l)) + 1;
      bad.push(`${f}:${line}`);
    }
  }
  assert.deepEqual(bad, [], `forbidden references in:\n${bad.join('\n')}`);
});
