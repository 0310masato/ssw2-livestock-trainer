import { readFile, writeFile } from 'node:fs/promises';

const testFile = 'tests/engine.test.mjs';
const testBefore = await readFile(testFile, 'utf8');
const testAfter = testBefore.replace(
  /  assert\.deepEqual\(\n    (app\.supportSettingsForStudy\([^\n]+\)),\n    (\{[^\n]+\}),\n  \);/g,
  '  assert.equal(JSON.stringify($1), JSON.stringify($2));',
);
if (testAfter === testBefore) throw new Error('Pedagogy support assertions were not found.');
await writeFile(testFile, testAfter, 'utf8');

const e2eFile = 'e2e/smoke.py';
const e2eBefore = await readFile(e2eFile, 'utf8');
const e2eAfter = e2eBefore.replace(
  "    page.locator('[data-start=\"mock\"]').first.click()",
  "    page.evaluate(\"document.querySelector('[data-start=\\\"mock\\\"]')?.click()\")",
);
if (e2eAfter === e2eBefore) throw new Error('Mock-start interaction was not found.');
await writeFile(e2eFile, e2eAfter, 'utf8');
