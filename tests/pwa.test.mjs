import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { computeContentBuildId } from '../scripts/build.mjs';

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

test('content build ID is deterministic and changes with app bytes', () => {
  const baseline = computeContentBuildId([
    { path: 'styles.css', content: 'body { color: teal; }\n' },
    { path: 'app.js', content: 'console.log("current");\n' },
    { path: 'assets/icon.bin', content: Buffer.from([0, 1, 2]) },
  ]);
  const sameAcrossOrderingAndPlatformNewlines = computeContentBuildId([
    { path: 'assets\\icon.bin', content: Buffer.from([0, 1, 2]) },
    { path: 'app.js', content: 'console.log("current");\r\n' },
    { path: 'styles.css', content: 'body { color: teal; }\r\n' },
  ]);
  const changedApp = computeContentBuildId([
    { path: 'styles.css', content: 'body { color: teal; }\n' },
    { path: 'app.js', content: 'console.log("current");!\n' },
    { path: 'assets/icon.bin', content: Buffer.from([0, 1, 2]) },
  ]);
  assert.match(baseline, /^[a-f0-9]{16}$/);
  assert.equal(sameAcrossOrderingAndPlatformNewlines, baseline);
  assert.notEqual(changedApp, baseline);
});

test('content build ID covers every required app-shell source', async () => {
  const buildSource = await readFile(resolve(root, 'scripts', 'build.mjs'), 'utf8');
  for (const required of [
    "path: 'app.js'",
    "path: 'styles.css'",
    "path: 'index.html.template'",
    "path: 'manifest.webmanifest'",
    'barn-ppe.svg',
    'chick-guard.svg',
    'cow-measurements.svg',
    'dilution-20l.svg',
    'sow-body-condition.svg',
    'icon-192.png',
    'icon-512.png',
    'apple-touch-icon.png',
  ]) {
    assert.match(buildSource, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(buildSource, /hashEntries\.push/);
  assert.match(buildSource, /replace\(\/\\r\\n\?\/g, '\\n'\)/);
  assert.match(buildSource, /entry\.path\.replaceAll\('\\\\', '\/'\)/);
});

test('service worker caches the content-addressed complete app shell', async () => {
  const serviceWorker = await readFile(resolve(dist, 'sw.js'), 'utf8');
  const indexHtml = await readFile(resolve(dist, 'index.html'), 'utf8');
  const buildId = indexHtml.match(/<meta name="app-build-id" content="([a-f0-9]{16})">/)?.[1];
  assert.ok(buildId, 'index.html must expose its content build ID');
  assert.match(serviceWorker, new RegExp(`const CACHE_NAME = ["']livestock2-v0\\.5\\.0-${buildId}["']`));
  assert.match(serviceWorker, new RegExp(`const BUILD_ID = ["']${buildId}["']`));
  assert.match(indexHtml, new RegExp(`href="styles\\.css\\?v=${buildId}"`));
  assert.match(indexHtml, new RegExp(`src="app\\.js\\?v=${buildId}"`));
  assert.match(serviceWorker, new RegExp(`styles\\.css\\?v=${buildId}`));
  assert.match(serviceWorker, new RegExp(`app\\.js\\?v=${buildId}`));
  assert.doesNotMatch(serviceWorker, /livestock2-v0\.5\.0-pr5-remediation/);
  for (const required of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'chick-guard.svg']) {
    assert.match(serviceWorker, new RegExp(required.replace('.', '\\.')));
  }
  assert.match(serviceWorker, /caches\.open/);
  assert.match(serviceWorker, /new Request\(asset, \{ cache: 'reload' \}\)/);
  assert.match(serviceWorker, /!response\.ok \|\| response\.type === 'opaque'/);
  assert.match(serviceWorker, /await caches\.delete\(CACHE_NAME\);/);
  assert.doesNotMatch(serviceWorker, /cache\.addAll/);
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
  assert.match(app, /やさしい日本語（回答前に実表示）/);
  assert.match(app, /畜産2号トレーナー_80問レビュー_v0\.5\.json/);
  assert.match(app, /updateViaCache:\s*['"]none['"]/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /アプリを更新できます/);
  assert.doesNotMatch(app, /location\.reload\(\)/);
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
