import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const buildDir = resolve(root, 'build');
const distDir = resolve(root, 'dist');

await rm(buildDir, { recursive: true, force: true });
await rm(distDir, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });
await mkdir(resolve(distDir, 'assets'), { recursive: true });
await mkdir(resolve(distDir, 'data'), { recursive: true });

const tscEntry = resolve(root, 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(process.execPath, [tscEntry, '-p', resolve(root, 'tsconfig.json')], { stdio: 'inherit' });

await cp(resolve(root, 'public', 'assets'), resolve(distDir, 'assets'), { recursive: true });
for (const file of ['questions-alpha-80.json', 'source-facts.json', 'glossary-ja-id.json', 'source-ledger.json', 'question.schema.json', 'review-checklist.csv']) {
  await cp(resolve(root, 'public', file), resolve(distDir, 'data', file));
}
for (const icon of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
  await cp(resolve(root, 'public', icon), resolve(distDir, icon));
}

const css = await readFile(resolve(root, 'src', 'styles.css'), 'utf8');
const js = await readFile(resolve(buildDir, 'app.js'), 'utf8');
await writeFile(resolve(distDir, 'styles.css'), css);
await writeFile(resolve(distDir, 'app.js'), js);
await cp(resolve(buildDir, 'app.js.map'), resolve(distDir, 'app.js.map'));

const indexHtml = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0f766e">
  <meta name="description" content="PWA pembelajaran tidak resmi / 非公式学習支援PWA untuk ujian peternakan tingkat 2。">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Ternak 2">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="icon" href="icon-192.png">
  <link rel="stylesheet" href="styles.css">
  <title>Belajar Bahasa Jepang untuk Peternakan 2 / 畜産2号日本語トレーナー</title>
</head>
<body>
  <noscript>Aktifkan JavaScript untuk menggunakan aplikasi ini。／このアプリを使うにはJavaScriptを有効にしてください。</noscript>
  <div id="app" aria-busy="true"></div>
  <div class="sr-only" aria-live="polite" data-live-region></div>
  <script src="app.js" defer></script>
</body>
</html>`;
await writeFile(resolve(distDir, 'index.html'), indexHtml);

const manifest = {
  name: 'Pelatih Peternakan Tingkat 2 / 畜産2号トレーナー',
  short_name: 'Nihongo Ternak',
  description: 'PWA pembelajaran tidak resmi untuk ujian peternakan tingkat 2 / 特定技能2号・畜産農業の非公式学習支援PWA',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#f7faf9',
  theme_color: '#0f766e',
  lang: 'id',
  orientation: 'portrait-primary',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
  shortcuts: [
    { name: '10 soal hari ini / 今日の10問', short_name: '10 soal', url: './?mode=daily' },
    { name: 'Simulasi ujian / 模擬試験', short_name: 'Simulasi', url: './?mode=mock' },
  ],
};
await writeFile(resolve(distDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const cacheVersion = 'livestock2-v0.5.0-pedagogical-learning';
const cacheFiles = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './assets/barn-ppe.svg', './assets/chick-guard.svg', './assets/cow-measurements.svg',
  './assets/dilution-20l.svg', './assets/sow-body-condition.svg',
];
const serviceWorker = `const CACHE_NAME = ${JSON.stringify(cacheVersion)};
const APP_SHELL = ${JSON.stringify(cacheFiles, null, 2)};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});\n`;
await writeFile(resolve(distDir, 'sw.js'), serviceWorker);
await writeFile(resolve(distDir, '.nojekyll'), '');
await writeFile(resolve(distDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

const assetEntries = [];
for (const asset of ['barn-ppe', 'chick-guard', 'cow-measurements', 'dilution-20l', 'sow-body-condition']) {
  const svg = await readFile(resolve(root, 'public', 'assets', `${asset}.svg`), 'utf8');
  assetEntries.push(`${JSON.stringify(asset)}:${JSON.stringify(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)}`);
}
const standaloneHtml = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0f766e"><title>Pelatih Peternakan Tingkat 2 / 畜産2号トレーナー</title><style>${css}</style></head>
<body><div id="app" aria-busy="true"></div><div class="sr-only" aria-live="polite" data-live-region></div><script>window.__ASSET_DATA__={${assetEntries.join(',')}};</script><script>${js}\n//# sourceURL=livestock2-app.js</script></body></html>`;
await writeFile(resolve(distDir, 'standalone-review.html'), standaloneHtml);

console.log(`Built ${distDir}`);
