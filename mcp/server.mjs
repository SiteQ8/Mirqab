#!/usr/bin/env node
// Mirqab MCP server. A lean read only stdio JSON-RPC server that lets an AI assistant teach from
// the same plant, controls, attack paths and incident playbooks the site uses. No dependencies.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  planScenario, posture, summarize, searchGlossary, validateEnabled, index,
} from '../docs/assets/core.js';

const bundle = JSON.parse(readFileSync(new URL('../docs/data/bundle.json', import.meta.url), 'utf8'));
const NAME = 'mirqab';
const VERSION = bundle.project.version;
const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

function bi(o) { return o ? { en: o.en, ar: o.ar } : null; }

const tools = [
  {
    name: 'overview',
    description: 'Overview of the Mirqab cyber range: what it is, its counts and the training disclaimer.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      return {
        name: bundle.project.name_en,
        name_ar: bundle.project.name_ar,
        tagline: { en: bundle.project.tagline_en, ar: bundle.project.tagline_ar },
        units: bundle.plant.units.length,
        controls: bundle.controls.controls.length,
        scenarios: bundle.scenarios.scenarios.length,
        glossary: bundle.glossary.terms.length,
        disclaimer: bundle.sources.note,
        site: `https://${bundle.project.domain}/`,
      };
    },
  },
  {
    name: 'list_units',
    description: 'The plant process units in order, their variables with safe bands, and the safety system.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      return {
        units: bundle.plant.units.map((u) => ({
          id: u.id, order: u.order, level: u.level, critical: !!u.critical, name: bi(u), desc: bi(u.desc),
          vars: u.vars.map((v) => ({ key: v.key, name: bi(v), unit: v.unit, normal: v.normal, warn: v.warn, trip: v.trip, limit: v.limit })),
        })),
        sis: { name: bundle.plant.sis, guards: bundle.plant.sis.guards, desc: bi(bundle.plant.sis.desc) },
      };
    },
  },
  {
    name: 'list_zones',
    description: 'The Purdue levels of the plant network and the seven IEC 62443 foundational requirements.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      return {
        levels: bundle.zones.purdue.map((z) => ({ id: z.id, name: bi(z), range: z.range, desc: bi(z.desc), assets: z.assets.map(bi) })),
        foundational: bundle.zones.foundational.map((f) => ({ id: f.id, name: bi(f) })),
      };
    },
  },
  {
    name: 'list_controls',
    description: 'The defensive controls with their Purdue level, IEC 62443 requirement, cost and what they block or detect.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      return {
        budget: bundle.controls.budget,
        controls: bundle.controls.controls.map((c) => ({ id: c.id, name: bi(c), desc: bi(c.desc), level: c.level, fr: c.fr, cost: c.cost, blocks: c.blocks, detects: c.detects })),
      };
    },
  },
  {
    name: 'list_scenarios',
    description: 'The attack and defense scenarios with a short summary of each kill chain.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      return {
        scenarios: bundle.scenarios.scenarios.map((s) => ({
          id: s.id, name: bi(s), inspiration: bi(s.inspiration), target_var: s.target_var,
          steps: s.steps.length, critical_step: s.critical_step, safety_step: s.safety_step, lesson: bi(s.lesson),
        })),
      };
    },
  },
  {
    name: 'get_scenario',
    description: 'One scenario in full: every kill chain step with its MITRE ATT&CK for ICS technique, the lesson and the incident playbook.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    run(args) {
      const s = index(bundle).scenarios.get(args.id);
      if (!s) throw new Error(`unknown scenario: ${args.id}`);
      return {
        id: s.id, name: bi(s), inspiration: bi(s.inspiration), target_var: s.target_var, critical_step: s.critical_step, safety_step: s.safety_step,
        steps: s.steps.map((st) => ({ id: st.id, name: bi(st), summary: bi(st.summary), technique: { id: st.technique.id, name: bi(st.technique), url: `https://attack.mitre.org/techniques/${st.technique.id}/` }, blocked_by: st.blocked_by, detected_by: st.detected_by })),
        lesson: bi(s.lesson),
        playbook: bundle.ir.phases.map((p) => ({ phase: p.id, name: bi(p), action: bi(s.playbook[p.id]) })),
      };
    },
  },
  {
    name: 'plan_defense',
    description: 'Run one scenario against a chosen set of control ids and return each step state and the outcome.',
    inputSchema: { type: 'object', properties: { scenario: { type: 'string' }, controls: { type: 'array', items: { type: 'string' } } }, required: ['scenario'], additionalProperties: false },
    run(args) {
      const enabled = validateEnabled(bundle, args.controls || []);
      const plan = planScenario(bundle, args.scenario, enabled);
      if (!plan) throw new Error(`unknown scenario: ${args.scenario}`);
      return {
        scenario: args.scenario, enabled, outcome: plan.outcome, reachedCritical: plan.reachedCritical, safetyIntact: plan.safetyIntact, detected: plan.detected,
        steps: plan.steps.map((st) => ({ id: st.id, name: bi(st), state: st.state, blockedBy: st.blockedBy, detectedBy: st.detectedBy })),
      };
    },
  },
  {
    name: 'assess_posture',
    description: 'Given a set of control ids, return the budget spent, the coverage and how many attacks are stopped.',
    inputSchema: { type: 'object', properties: { controls: { type: 'array', items: { type: 'string' } } }, required: ['controls'], additionalProperties: false },
    run(args) {
      const enabled = validateEnabled(bundle, args.controls || []);
      return { enabled, posture: posture(bundle, enabled), summary: summarize(bundle, enabled) };
    },
  },
  {
    name: 'glossary',
    description: 'The OT and ICS glossary. Pass an optional query in English or Arabic to filter the terms.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
    run(args) {
      const terms = searchGlossary(bundle, args && args.query ? args.query : '');
      return { count: terms.length, terms: terms.map((t) => ({ id: t.id, name: bi(t), def: bi(t.def), ref: t.ref || null })) };
    },
  },
  {
    name: 'sources',
    description: 'The authoritative sources behind the range from NCSA, NIST, IEC and MITRE.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      return { sources: bundle.sources.sources.map((s) => ({ id: s.id, title: bi(s), url: s.url, use: bi(s.use) })), note: bundle.sources.note };
    },
  },
];

const toolMap = new Map(tools.map((t) => [t.name, t]));

function send(msg) { process.stdout.write(`${JSON.stringify(msg)}\n`); }
function result(id, res) { send({ jsonrpc: '2.0', id, result: res }); }
function error(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

function handle(msg) {
  if (msg.method === 'initialize') {
    const req = msg.params && msg.params.protocolVersion;
    const protocolVersion = SUPPORTED.includes(req) ? req : SUPPORTED[0];
    return result(msg.id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: NAME, version: VERSION } });
  }
  if (msg.method === 'ping') return result(msg.id, {});
  if (msg.method === 'tools/list') {
    return result(msg.id, { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params || {};
    const tool = toolMap.get(name);
    if (!tool) return error(msg.id, -32602, `unknown tool: ${name}`);
    try {
      const data = tool.run(args || {});
      return result(msg.id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
    } catch (e) {
      return result(msg.id, { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true });
    }
  }
  if (msg.id !== undefined) return error(msg.id, -32601, `method not found: ${msg.method}`);
  return undefined; // notification
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));

if (process.argv.includes('--selftest')) {
  const names = tools.map((t) => t.name);
  const plan = toolMap.get('plan_defense').run({ scenario: 'safety-target', controls: [] });
  const post = toolMap.get('assess_posture').run({ controls: ['sis_zone', 'sis_keyswitch'] });
  process.stdout.write(`${JSON.stringify({ tools: names, s2_no_defense: plan.outcome, sis_only_stopped: post.summary.stopped })}\n`);
  process.exit(0);
}
