import { readFile, writeFile } from 'node:fs/promises';

const file = 'tests/engine.test.mjs';
const before = await readFile(file, 'utf8');
const after = before.replace(
  /  assert\.deepEqual\(\n    (app\.supportSettingsForStudy\([^\n]+\)),\n    (\{[^\n]+\}),\n  \);/g,
  '  assert.equal(JSON.stringify($1), JSON.stringify($2));',
);
if (after === before) throw new Error('Pedagogy support assertions were not found.');
await writeFile(file, after, 'utf8');
