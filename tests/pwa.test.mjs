import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

function workflowTriggers(source) {
  const lines = source.split(/\r?\n/);
  const onIndex = lines.findIndex((line) => /^on:\s*$/.test(line));
  assert.notEqual(onIndex, -1, 'workflow is missing an on block');
  const triggers = [];
  for (const line of lines.slice(onIndex + 1)) {
    if (line.trim() === '') continue;
    if (!/^\s/.test(line)) break;
    const match = line.match(/^ {2}([\w-]+):/);
    if (match) triggers.push(match[1]);
  }
  return triggers;
}

test('web app manifest is installable and icons exist', async () => {
  const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.lang, 'id');
  assert.match(manifest.name, /Pelatih Peternakan Tingkat 2/);
  assert.equal(manifest.icons.length, 2);
  for (const icon of manifest.icons) {
    await access(resolve(dist, icon.src));
    assert.ok((await stat(resolve(dist, icon.src))).size > 500);
  }
});

test('service worker caches the complete app shell', async () => {
  const serviceWorker = await readFile(resolve(dist, 'sw.js'), 'utf8');
  assert.match(serviceWorker, /livestock2-v0\.5\.0-pr5-remediation/);
  for (const required of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'chick-guard.svg']) {
    assert.match(serviceWorker, new RegExp(required.replace('.', '\\.')));
  }
  assert.match(serviceWorker, /caches\.open/);
  assert.match(serviceWorker, /event\.request\.mode === 'navigate'/);
  assert.match(serviceWorker, /const CACHE_PREFIX = ["']livestock2-["']/);
  assert.match(serviceWorker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
  assert.doesNotMatch(serviceWorker, /keys\.filter\(\(key\) => key !== CACHE_NAME\)/);
});

test('standalone review build contains code, styles, and embedded visual assets', async () => {
  const html = await readFile(resolve(dist, 'standalone-review.html'), 'utf8');
  assert.match(html, /<style>[^<]+/);
  assert.match(html, /<script>window\.__ASSET_DATA__/);
  assert.match(html, /<script>[^<]*namespace LivestockApp|sourceURL=livestock2-app\.js/);
  assert.match(html, /window\.__ASSET_DATA__/);
  assert.match(html, /畜産2号トレーナー/);
  assert.match(html, /chick-guard/);
  assert.doesNotMatch(html, /https:\/\/cdn\./);
  assert.doesNotMatch(html, /(?:src|href)=["'][^"']+\.(?:js|css)["']/);
});

test('review deployment discourages indexing and bypasses Jekyll', async () => {
  const html = await readFile(resolve(dist, 'index.html'), 'utf8');
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  await access(resolve(dist, '.nojekyll'));
  const robots = await readFile(resolve(dist, 'robots.txt'), 'utf8');
  assert.match(robots, /Disallow: \/$/m);
  const notice = await readFile(resolve(dist, 'REVIEW_ARTIFACT_NOTICE.txt'), 'utf8');
  assert.match(notice, /Temporary PR review build/);
  assert.match(notice, /not access-restricted/);
  assert.match(notice, /7-day retention/);
  assert.match(notice, /Not an official distribution/);
});

test('compiled application contains persistent bilingual UI support', async () => {
  const app = await readFile(resolve(dist, 'app.js'), 'utf8');
  assert.match(app, /data-ui-language/);
  assert.match(app, /Pelatih Peternakan Tingkat 2/);
  assert.match(app, /Bahasa tampilan aplikasi/);
  assert.match(app, /uiLanguage/);
  assert.match(app, /Baca soal bahasa Jepang/);
  assert.match(app, /Arti dalam Bahasa Indonesia/);
  assert.match(app, /Pembahasan setiap pilihan/);
  assert.match(app, /studySupportMode/);
  assert.match(app, /japanese-only-card/);
  assert.match(app, /renderJapaneseOnlyQuestionCard/);
  assert.match(app, /畜産2号トレーナー_学習データ_v0\.5\.json/);
  assert.match(app, /畜産2号トレーナー_学習履歴_v0\.5\.csv/);
  assert.match(app, /畜産2号トレーナー_80問レビュー_v0\.5\.json/);
  assert.doesNotMatch(app, /畜産2号トレーナー_[^'"\\n]+_v0\.4\.(?:json|csv)/);
});

test('temporary review distribution excludes PDFs, private keys, and local user paths', async () => {
  const entries = await readdir(dist, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const names = files.map((entry) => resolve(entry.parentPath, entry.name));
  const forbiddenExtensions = /\.(?:pdf|pem|key|p12|pfx)$/i;
  assert.equal(names.filter((name) => forbiddenExtensions.test(name)).length, 0);

  const textExtensions = /\.(?:html|js|css|json|map|txt|webmanifest)$/i;
  for (const name of names.filter((entry) => textExtensions.test(entry))) {
    const content = await readFile(name, 'utf8');
    assert.doesNotMatch(content, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
    assert.doesNotMatch(content, /(?:[A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/)|\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/)/);
  }
});

test('PR artifact is temporary and Pages deployment remains manual-only', async () => {
  const ciWorkflow = await readFile(resolve(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const pagesWorkflow = await readFile(resolve(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  const branchPublishWorkflow = await readFile(resolve(root, '.github', 'workflows', 'publish-gh-pages-branch.yml'), 'utf8');
  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.match(packageJson.scripts['test:e2e:http'], /python e2e\/http_pwa_smoke\.py/);
  assert.match(packageJson.scripts['test:e2e'], /npm run test:e2e:http/);
  assert.match(ciWorkflow, /run:\s*npm run test:e2e/);
  assert.doesNotMatch(ciWorkflow, /run:\s*python3? e2e\/http_pwa_smoke\.py/);
  assert.match(ciWorkflow, /temporary-pr-review-build-7d-pr-/);
  assert.match(ciWorkflow, /retention-days:\s*7/);
  assert.doesNotMatch(ciWorkflow, /actions\/deploy-pages/);
  assert.match(ciWorkflow, /PyMuPDF==1\.27\.2\.2/);
  assert.deepEqual(workflowTriggers(pagesWorkflow), ['workflow_dispatch']);
  assert.deepEqual(workflowTriggers(branchPublishWorkflow), ['workflow_dispatch']);
});
