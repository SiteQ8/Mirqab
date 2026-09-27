import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { read } from './helpers.mjs';

const SERVER = fileURLToPath(new URL('../mcp/server.mjs', import.meta.url));

function rpc(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', () => {
      const msgs = out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
      resolve(msgs);
    });
    for (const r of requests) child.stdin.write(`${JSON.stringify(r)}\n`);
    child.stdin.end();
    setTimeout(() => child.kill(), 4000);
  });
}

test('server completes the handshake and lists tools', async () => {
  const msgs = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ]);
  const init = msgs.find((m) => m.id === 1);
  assert.equal(init.result.serverInfo.name, 'mirqab');
  assert.ok(init.result.capabilities.tools, 'no tools capability');
  const list = msgs.find((m) => m.id === 2);
  assert.ok(list.result.tools.length >= 10, 'fewer than ten tools');
  for (const tdef of list.result.tools) {
    assert.ok(tdef.description && tdef.description.length > 10, `tool ${tdef.name} lacks a description`);
    assert.ok(tdef.inputSchema && tdef.inputSchema.type === 'object', `tool ${tdef.name} lacks an input schema`);
  }
});

test('plan_defense returns a real outcome through the protocol', async () => {
  const msgs = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'plan_defense', arguments: { scenario: 'safety-target', controls: [] } } },
  ]);
  const call = msgs.find((m) => m.id === 2);
  const data = JSON.parse(call.result.content[0].text);
  assert.equal(data.outcome, 'release');
});

test('the README documents every MCP tool', async () => {
  const msgs = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ]);
  const names = msgs.find((m) => m.id === 2).result.tools.map((t) => t.name);
  const readme = read('README.md');
  const missing = names.filter((n) => !readme.includes(n));
  assert.deepEqual(missing, [], `README missing tools: ${missing.join(', ')}`);
});
