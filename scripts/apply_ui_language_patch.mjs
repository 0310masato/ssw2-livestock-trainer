import { readFile, writeFile, rm } from 'node:fs/promises';

async function read(path) {
  return readFile(path, 'utf8');
}

async function write(path, content) {
  await writeFile(path, content, 'utf8');
}

async function replaceOnce(path, search, replacement) {
  const content = await read(path);
  if (!content.includes(search)) {
    throw new Error(`Expected text not found in ${path}: ${search.slice(0, 120)}`);
  }
  const next = content.replace(search, replacement);
  await write(path, next);
}

async function appendOnce(path, marker, addition) {
  const content = await read(path);
  if (content.includes(marker)) return;
  await write(path, `${content.trimEnd()}\n\n${addition.trim()}\n`);
}

await replaceOnce(
  'src/app.ts',
  "    runtime = initialRuntime(state);\n    window.addEventListener('online', () => {",
  "    runtime = initialRuntime(state);\n    applyDocumentUiLanguage();\n    window.addEventListener('online', () => {",
);

await replaceOnce(
  'src/app.ts',
  "    root.innerHTML = appShell(renderCurrentView());\n    bindEvents();",
  "    root.innerHTML = appShell(renderCurrentView());\n    applyUiLanguage(root);\n    bindEvents();",
);

await replaceOnce(
  'src/app.ts',
  "      if (window.confirm(text)) callback();",
  "      if (window.confirm(translateUiText(text))) callback();",
);

await replaceOnce(
  'src/app.ts',
  "    titleNode.textContent = title;\n    textNode.textContent = text;",
  "    titleNode.textContent = translateUiText(title);\n    textNode.textContent = translateUiText(text);",
);

await replaceOnce(
  'src/app.ts',
  "        const entered = window.prompt(`${questionId} 要修正の理由`, note);",
  "        const entered = window.prompt(translateUiText(`${questionId} 要修正の理由`), note);",
);

await replaceOnce(
  'src/app.ts',
  "    document.querySelectorAll<HTMLElement>('[data-start]').forEach((element) => {",
  "    document.querySelectorAll<HTMLElement>('[data-ui-language]').forEach((element) => {\n      element.addEventListener('click', () => {\n        runtime.state.settings.uiLanguage = element.dataset.uiLanguage === 'ja' ? 'ja' : 'id';\n        void persist();\n        render();\n      });\n    });\n    document.querySelectorAll<HTMLElement>('[data-start]').forEach((element) => {",
);

await replaceOnce(
  'src/app.ts',
  "    document.querySelector<HTMLSelectElement>('[data-setting-level]')?.addEventListener('change', (event) => {",
  "    document.querySelector<HTMLSelectElement>('[data-setting-ui-language]')?.addEventListener('change', (event) => {\n      runtime.state.settings.uiLanguage = (event.currentTarget as HTMLSelectElement).value === 'ja' ? 'ja' : 'id';\n      void persist();\n      render();\n    });\n    document.querySelector<HTMLSelectElement>('[data-setting-level]')?.addEventListener('change', (event) => {",
);

await replaceOnce(
  'src/utils.ts',
  "    if (live) live.textContent = message;",
  "    if (live) live.textContent = translateUiText(message);",
);

await replaceOnce(
  'src/views.ts',
  '<section class="settings-panel"><h2>言語支援</h2><label class="setting-row"><span><strong>自動支援レベル</strong>',
  '<section class="settings-panel"><h2>言語支援</h2><label class="setting-row select-row"><span><strong>アプリの表示言語</strong><small>画面全体の案内・ボタン・設定を切り替えます。問題の日本語は練習のため残ります。</small></span><select data-setting-ui-language><option value="id" ${settings.uiLanguage === \'id\' ? \'selected\' : \'\'}>Bahasa Indonesia</option><option value="ja" ${settings.uiLanguage === \'ja\' ? \'selected\' : \'\'}>日本語</option></select></label><label class="setting-row"><span><strong>自動支援レベル</strong>',
);

await replaceOnce(
  'src/data.ts',
  'export const APP_VERSION = "0.4.0-alpha-review";',
  'export const APP_VERSION = "0.4.2-alpha-i18n";',
);

await replaceOnce(
  'src/i18n.ts',
  "if ((match = value.match(/^日本語原因の誤答が(\\d+)%】【。用語学習を優先$/)))",
  "if ((match = value.match(/^日本語原因の誤答が(\\d+)%】【。用語学習を優先$/)))",
).catch(async () => {
  const path = 'src/i18n.ts';
  const content = await read(path);
  const next = content.replace(/if \(\(match = value\.match\(\/\^日本語原因の誤答が\(\\d\+\)%.*?用語学習を優先\$\/\)\)\)/, "if ((match = value.match(/^日本語原因の誤答が(\\d+)%】【。用語学習を優先$/)))");
  if (next === content) throw new Error('Could not normalize Japanese-reason regex in src/i18n.ts');
  await write(path, next);
});

const packageJson = JSON.parse(await read('package.json'));
packageJson.version = '0.4.2-alpha-i18n';
packageJson.description = '特定技能2号・畜産農業向けの日本語／インドネシア語切替対応PWA学習アプリ（社内レビュー用Alpha）';
await write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

let build = await read('scripts/build.mjs');
build = build
  .replace('<html lang="ja">', '<html lang="id">')
  .replace('<meta name="description" content="特定技能2号・畜産農業の非公式学習支援PWA。社内レビュー用Alphaです。">', '<meta name="description" content="PWA pembelajaran tidak resmi / 非公式学習支援PWA untuk ujian peternakan tingkat 2。">')
  .replace('<meta name="apple-mobile-web-app-title" content="畜産2号">', '<meta name="apple-mobile-web-app-title" content="Ternak 2">')
  .replace('<title>畜産2号トレーナー</title>', '<title>Pelatih Peternakan Tingkat 2 / 畜産2号トレーナー</title>')
  .replace('<noscript>このアプリを使うにはJavaScriptを有効にしてください。</noscript>', '<noscript>Aktifkan JavaScript untuk menggunakan aplikasi ini。／このアプリを使うにはJavaScriptを有効にしてください。</noscript>')
  .replace("  name: '畜産2号トレーナー',", "  name: 'Pelatih Peternakan Tingkat 2 / 畜産2号トレーナー',")
  .replace("  short_name: '畜産2号',", "  short_name: 'Ternak 2',")
  .replace("  description: '特定技能2号・畜産農業の非公式学習支援PWA（社内レビュー用Alpha）',", "  description: 'PWA pembelajaran tidak resmi untuk ujian peternakan tingkat 2 / 特定技能2号・畜産農業の非公式学習支援PWA',")
  .replace("  lang: 'ja',", "  lang: 'id',")
  .replace("{ name: '今日の10問', short_name: '10問', url: './?mode=daily' },", "{ name: '10 soal hari ini / 今日の10問', short_name: '10 soal', url: './?mode=daily' },")
  .replace("{ name: '模擬試験', short_name: '模試', url: './?mode=mock' },", "{ name: 'Simulasi ujian / 模擬試験', short_name: 'Simulasi', url: './?mode=mock' },")
  .replace("const cacheVersion = 'livestock2-v0.4.1-alpha-pages-ready';", "const cacheVersion = 'livestock2-v0.4.2-persistent-ui-language';")
  .replace('<html lang="ja"><head>', '<html lang="id"><head>')
  .replace('<title>畜産2号トレーナー（単体レビュー版）</title>', '<title>Pelatih Peternakan Tingkat 2 / 畜産2号トレーナー</title>');
await write('scripts/build.mjs', build);

await appendOnce(
  'tests/engine.test.mjs',
  "test('UI language defaults to Indonesian and can be persisted'",
  `test('UI language defaults to Indonesian and can be persisted', () => {
  const state = app.defaultState();
  assert.equal(state.settings.uiLanguage, 'id');
  assert.equal(app.translateUiText('ホーム', 'id'), 'Beranda');
  assert.equal(app.translateUiText('今日の10問を始める', 'id'), 'Mulai 10 soal hari ini');
  assert.equal(app.translateUiText('ホーム', 'ja'), 'ホーム');

  const imported = app.validateImportedState({ settings: { uiLanguage: 'ja' } });
  assert.equal(imported.settings.uiLanguage, 'ja');
  const migrated = app.validateImportedState({ settings: {} });
  assert.equal(migrated.settings.uiLanguage, 'id');
});`,
);

await replaceOnce(
  'tests/pwa.test.mjs',
  "  assert.equal(manifest.start_url, './');",
  "  assert.equal(manifest.start_url, './');\n  assert.equal(manifest.lang, 'id');\n  assert.match(manifest.name, /Pelatih Peternakan Tingkat 2/);",
);

await appendOnce(
  'tests/pwa.test.mjs',
  "test('compiled application contains persistent bilingual UI support'",
  `test('compiled application contains persistent bilingual UI support', async () => {
  const app = await readFile(resolve(dist, 'app.js'), 'utf8');
  assert.match(app, /data-ui-language/);
  assert.match(app, /Pelatih Peternakan Tingkat 2/);
  assert.match(app, /Bahasa tampilan aplikasi/);
  assert.match(app, /uiLanguage/);
});`,
);

let e2e = await read('e2e/smoke.py');
e2e = e2e.replace(
  "    check('今日の10問を始める' in body and 'approved 問題はまだ0問' in body, 'home_render', checks)",
  "    check('Mulai 10 soal hari ini' in body and 'Belum ada soal berstatus approved' in body, 'home_render_indonesian', checks)\n    check(page.locator('[data-ui-language]').count() == 2 and page.evaluate(\"document.documentElement.lang === 'id'\"), 'language_switcher_default', checks)",
);
e2e = e2e.replace(
  "    page.screenshot(path=str(SHOTS / 'alpha-home-mobile.png'), full_page=True)\n\n    page.locator('[data-start=\"daily\"]').first.click()",
  "    page.screenshot(path=str(SHOTS / 'alpha-home-mobile.png'), full_page=True)\n\n    page.locator('[data-ui-language=\"ja\"]').click()\n    page.wait_for_timeout(150)\n    check('今日の10問を始める' in page.locator('body').inner_text() and page.evaluate(\"document.documentElement.lang === 'ja'\"), 'language_switch_to_japanese', checks)\n    page.wait_for_timeout(150)\n    check(page.evaluate(\"JSON.parse(localStorage.getItem('livestock2-state-v0.4')).settings.uiLanguage === 'ja'\"), 'language_selection_persisted', checks)\n\n    page.locator('[data-start=\"daily\"]').first.click()",
);
await write('e2e/smoke.py', e2e);

let publisher = await read('.github/workflows/publish-gh-pages-branch.yml');
publisher = publisher.replace(
  '    paths:\n      - ".github/workflows/publish-gh-pages-branch.yml"',
  '    paths:\n      - ".github/workflows/publish-gh-pages-branch.yml"\n      - "src/**"\n      - "scripts/**"\n      - "public/**"\n      - "tests/**"\n      - "package.json"\n      - "tsconfig.json"',
);
await write('.github/workflows/publish-gh-pages-branch.yml', publisher);

await appendOnce(
  'CHANGELOG.md',
  '## 0.4.2-alpha-i18n',
  `## 0.4.2-alpha-i18n

- 画面全体の日本語／インドネシア語切替を追加
- ヘッダーと設定画面の両方から表示言語を変更可能
- 選択言語をIndexedDBとlocalStorageへ保存し、次回起動でも維持
- 問題文・選択肢は日本語学習のため日本語を主表示のまま維持
- PWAの言語メタデータとキャッシュバージョンを更新`,
);

await appendOnce(
  'README.md',
  '### 表示言語',
  `### 表示言語

画面上部または設定画面で **日本語／Bahasa Indonesia** を切り替えられます。選択した表示言語は端末内へ保存され、再起動後も維持されます。

表示言語はナビゲーション、説明、ボタン、成績、管理画面、レビュー画面、設定画面に適用されます。問題文と選択肢は日本語練習のため日本語を主表示として残し、既存の「やさしい日本語」「Bahasa Indonesia」学習補助で内容を確認します。`,
);

await rm('scripts/apply_ui_language_patch.mjs', { force: true });
await rm('.github/workflows/apply-ui-language-patch.yml', { force: true });
