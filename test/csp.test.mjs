import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './helpers.mjs';

const html = read('docs/index.html');

test('a strict Content Security Policy is present', () => {
  const m = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(m, 'no CSP meta tag');
  const csp = m[1];
  for (const dir of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'"]) {
    assert.ok(csp.includes(dir), `CSP missing: ${dir}`);
  }
});

test('scripts and stylesheets are local only', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((x) => x[1]);
  for (const src of scripts) assert.ok(!/^https?:/i.test(src), `external script: ${src}`);
  const links = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)].map((x) => x[1]);
  for (const href of links) {
    if (/rel="canonical"/.test(html) && href.startsWith('https://mirqab.3li.info')) continue;
    assert.ok(!/^https?:/i.test(href), `external stylesheet or link: ${href}`);
  }
});

test('no inline event handlers or inline script blocks', () => {
  assert.ok(!/<script\b(?![^>]*\bsrc=)[^>]*>[^<]*\S/.test(html), 'inline script block present');
  assert.ok(!/\son\w+="/.test(html), 'inline event handler present');
});
