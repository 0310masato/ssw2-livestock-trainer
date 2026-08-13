import { readFile, writeFile, rm } from 'node:fs/promises';

async function update(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No change made to ${path}`);
  await writeFile(path, after, 'utf8');
}

await update('src/i18n.ts', (source) => source.replace(
  /if \(\(match = value\.match\(\/\^日本語原因の誤答が\(\\d\+\)%.*?用語学習を優先\$\/\)\)\) return `\$\{match\[1\]\}% kesalahan disebabkan bahasa Jepang\. Prioritaskan belajar istilah\.`;/,
  "if ((match = value.match(/^日本語原因の誤答が(\\d+)%\\u3002用語学習を優先$/))) return `${match[1]}% kesalahan disebabkan bahasa Jepang. Prioritaskan belajar istilah.`;",
));

await update('src/storage.ts', (source) => source.replace(
  `  export async function saveState(state: AppState): Promise<void> {
    state.lastOpenedAt = nowIso();
    try {
      await writeIndexedDb(state);
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('IndexedDB save failed. Using localStorage.', error);
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
    }
  }`,
  `  export async function saveState(state: AppState): Promise<void> {
    state.lastOpenedAt = nowIso();
    const serialized = JSON.stringify(state);
    localStorage.setItem(FALLBACK_KEY, serialized);
    try {
      await writeIndexedDb(state);
    } catch (error) {
      console.warn('IndexedDB save failed. State is preserved in localStorage.', error);
    }
  }`,
));

await update('e2e/smoke.py', (source) => source.replace(
  `    browser = p.chromium.launch(
        headless=True,
        executable_path='/usr/bin/chromium',
        args=['--no-sandbox', '--disable-dev-shm-usage'],
    )`,
  `    launch_options = {
        'headless': True,
        'args': ['--no-sandbox', '--disable-dev-shm-usage'],
    }
    system_chromium = pathlib.Path('/usr/bin/chromium')
    if system_chromium.exists():
        launch_options['executable_path'] = str(system_chromium)
    browser = p.chromium.launch(**launch_options)`,
));

await update('e2e/smoke.py', (source) => source.replace(
  `    check('Mulai 10 soal hari ini' in body and 'Belum ada soal berstatus approved' in body, 'home_render_indonesian', checks)
    check(page.locator('[data-ui-language]').count() == 2 and page.evaluate("document.documentElement.lang === 'id'"), 'language_switcher_default', checks)`,
  `    check('Pelatih Peternakan Tingkat 2' in body and 'Mulai 10 soal hari ini' in body, 'home_render_indonesian', checks)
    check(page.locator('[data-ui-language="id"].active').count() == 1 and page.evaluate("document.documentElement.lang === 'id'"), 'language_switcher_default', checks)`,
));

await update('e2e/smoke.py', (source) => source.replace(
  `    page.locator('[data-mock-choice]').first.click()
    page.locator('[data-mock-next]').click()`,
  `    page.evaluate("document.querySelector('[data-mock-choice]')?.click()")
    page.wait_for_timeout(100)
    page.evaluate("document.querySelector('[data-mock-next]')?.click()")`,
));

await rm('scripts/finalize_ui_language_feature.mjs', { force: true });
