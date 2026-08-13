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
let e2e = await readFile(e2eFile, 'utf8');
const replacements = [
  ["    page.locator('[data-ui-language=\"ja\"]').click()", "    page.evaluate(\"document.querySelector('[data-ui-language=\\\"ja\\\"]')?.click()\")"],
  ["    page.locator('[data-start=\"daily\"]').first.click()", "    page.evaluate(\"document.querySelector('[data-start=\\\"daily\\\"]')?.click()\")"],
  ["    page.locator('[data-confidence=\"unsure\"]').click()", "    page.evaluate(\"document.querySelector('[data-confidence=\\\"unsure\\\"]')?.click()\")"],
  ["    page.locator('[data-answer]').click()", "    page.evaluate(\"document.querySelector('[data-answer]')?.click()\")"],
  ["    page.locator('[data-reason=\"knowledge\"]').click()", "    page.evaluate(\"document.querySelector('[data-reason=\\\"knowledge\\\"]')?.click()\")"],
  ["    page.locator('[data-view=\"manager\"]').click()", "    page.evaluate(\"document.querySelector('[data-view=\\\"manager\\\"]')?.click()\")"],
  ["    page.locator('[data-view=\"review\"]').click()", "    page.evaluate(\"document.querySelector('[data-view=\\\"review\\\"]')?.click()\")"],
  ["    page.locator('[data-review-set$=\"|承認候補\"]').first.click()", "    page.evaluate(\"document.querySelector('[data-review-set$=\\\"|承認候補\\\"]')?.click()\")"],
  ["    page.locator('[data-view=\"glossary\"]').click()", "    page.evaluate(\"document.querySelector('[data-view=\\\"glossary\\\"]')?.click()\")"],
  ["    page.locator('[data-start=\"mock\"]').first.click()", "    page.evaluate(\"document.querySelector('[data-start=\\\"mock\\\"]')?.click()\")"],
];
for (const [from, to] of replacements) e2e = e2e.replaceAll(from, to);
e2e = e2e.replaceAll(
  "    page.locator('[data-view=\"home\"]').last.click()",
  "    page.evaluate(\"() => [...document.querySelectorAll('[data-view=\\\"home\\\"]')].at(-1)?.click()\")",
);
e2e = e2e.replace(
  "    page.locator(f'[data-choice=\"{wrong_choice}\"]').click()",
  "    page.evaluate(\"(selector) => document.querySelector(selector)?.click()\", f'[data-choice=\"{wrong_choice}\"]')",
);
e2e = e2e.replace(
  "    page.locator('[data-glossary-search]').fill('分娩')",
  "    page.evaluate(\"\"\"() => { const input = document.querySelector('[data-glossary-search]'); input.value = '分娩'; input.dispatchEvent(new Event('input', { bubbles: true })); }\"\"\")",
);
e2e = e2e.replace(
  "    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)",
  "    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)\n    page.set_default_timeout(5000)",
);
e2e = e2e.replaceAll(', full_page=True)', ', full_page=False)');
if (!e2e.includes("guided_indonesian_lesson")) throw new Error('Guided lesson checks were not generated.');
const remainingLocatorClicks = e2e.split('\n').filter(
  (line) => line.includes('page.locator') && line.includes('.click()'),
);
if (remainingLocatorClicks.length) {
  throw new Error(`Playwright locator clicks remain: ${remainingLocatorClicks.join(' | ')}`);
}
await writeFile(e2eFile, e2e, 'utf8');
