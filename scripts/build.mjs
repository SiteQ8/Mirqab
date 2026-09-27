// Assemble data/src/*.json into docs/data/bundle.json. With --check it verifies the bundle is
// up to date instead of writing it. No dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const src = (name) => JSON.parse(readFileSync(join(root, 'data/src', name), 'utf8'));

const project = src('project.json');
const sources = src('sources.json');
const plant = src('plant.json');
const zones = src('zones.json');
const controls = src('controls.json');
const scenarios = src('scenarios.json');
const ir = src('ir.json');
const glossary = src('glossary.json');
const ui = src('ui.json');

const bundle = {
  schema: project.schema,
  project,
  sources,
  plant,
  zones,
  controls,
  scenarios,
  ir,
  glossary,
  ui,
};

// Cross checks so a broken reference fails the build rather than the browser.
const problems = [];
const controlIds = new Set(controls.controls.map((c) => c.id));
const stepIds = new Set();
for (const sc of scenarios.scenarios) for (const st of sc.steps) stepIds.add(st.id);
for (const c of controls.controls) {
  for (const s of [...c.blocks, ...c.detects]) if (!stepIds.has(s)) problems.push(`control ${c.id} references unknown step ${s}`);
}
for (const sc of scenarios.scenarios) {
  const ids = sc.steps.map((s) => s.id);
  if (sc.critical_step && !ids.includes(sc.critical_step)) problems.push(`scenario ${sc.id} critical_step ${sc.critical_step} missing`);
  if (sc.safety_step && !ids.includes(sc.safety_step)) problems.push(`scenario ${sc.id} safety_step ${sc.safety_step} missing`);
  if (sc.target_var) {
    const known = plant.units.some((u) => u.vars.some((v) => v.key === sc.target_var));
    if (!known) problems.push(`scenario ${sc.id} target_var ${sc.target_var} missing`);
  }
  for (const st of sc.steps) {
    for (const id of [...(st.blocked_by || []), ...(st.detected_by || [])]) if (!controlIds.has(id)) problems.push(`step ${st.id} references unknown control ${id}`);
  }
  for (const ph of ir.phases) if (!sc.playbook[ph.id]) problems.push(`scenario ${sc.id} playbook missing phase ${ph.id}`);
}
if (problems.length) {
  console.error(`build failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

const out = join(root, 'docs/data/bundle.json');
const text = `${JSON.stringify(bundle)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(out, 'utf8'); } catch { current = ''; }
  if (current !== text) {
    console.error('docs/data/bundle.json is out of date; run node scripts/build.mjs');
    process.exit(1);
  }
  console.log('bundle up to date');
  process.exit(0);
}

writeFileSync(out, text);
console.log(`bundle written: ${plant.units.length} units, ${controls.controls.length} controls, ${scenarios.scenarios.length} scenarios, ${glossary.terms.length} glossary terms`);
