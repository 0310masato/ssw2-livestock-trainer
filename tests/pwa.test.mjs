import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

test('web app manifest is installable and icons exist', async () => {
  const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.icons.length, 2);
  for (const icon of manifest.icons) {
    await access(resolve(dist, icon.src));
    assert.ok((await stat(resolve(dist, icon.src))).size > 500);
  }
});

test('service worker caches the complete app shell', async () => {
  const serviceWorker = await readFile(resolve(dist, 'sw.js'), 'utf8');
  for (const required of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'chick-guard.svg']) {
    assert.match(serviceWorker, new RegExp(required.replace('.', '\\.')));
  }
  assert.match(serviceWorker, /caches\.open/);
  assert.match(serviceWorker, /event\.request\.mode === 'navigate'/);
});

test('standalone review build contains code, styles, and embedded visual assets', async () => {
  const html = await readFile(resolve(dist, 'standalone-review.html'), 'utf8');
  assert.match(html, /window\.__ASSET_DATA__/);
  assert.match(html, /畜産2号トレーナー/);
  assert.match(html, /chick-guard/);
  assert.doesNotMatch(html, /https:\/\/cdn\./);
});

test('review deployment discourages indexing and bypasses Jekyll', async () => {
  const html = await readFile(resolve(dist, 'index.html'), 'utf8');
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  await access(resolve(dist, '.nojekyll'));
  const robots = await readFile(resolve(dist, 'robots.txt'), 'utf8');
  assert.match(robots, /Disallow: \/$/m);
});
