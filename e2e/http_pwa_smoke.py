from __future__ import annotations

import http.server
import json
import os
import pathlib
import re
import sys
import threading
import urllib.parse

from playwright.sync_api import sync_playwright


ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
SW_PATH = DIST / 'sw.js'
SW_SOURCE = SW_PATH.read_text(encoding='utf-8')
BASE_CACHE_MATCH = re.search(r'const CACHE_NAME = ["\']([^"\']+)["\'];', SW_SOURCE)
if not BASE_CACHE_MATCH:
    raise RuntimeError('Could not read CACHE_NAME from dist/sw.js. Run npm run build first.')

BASE_CACHE = BASE_CACHE_MATCH.group(1)
UPDATED_CACHE = f'{BASE_CACHE}-http-e2e-v2'
LEGACY_CACHE = 'livestock2-v0.4-http-e2e-legacy'
FOREIGN_CACHE = 'foreign-http-e2e-cache'


class ServerState:
    serve_updated_worker = False


class ReviewBuildHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def log_message(self, _format: str, *_args) -> None:
        return

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        if path == '/__test__/service-worker-update' and self.command == 'GET':
            ServerState.serve_updated_worker = True
            self.send_response(204)
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return

        if path == '/sw.js':
            source = SW_SOURCE
            if ServerState.serve_updated_worker:
                source = re.sub(
                    r'const CACHE_NAME = ["\'][^"\']+["\'];',
                    f'const CACHE_NAME = {json.dumps(UPDATED_CACHE)};',
                    source,
                    count=1,
                )
            body = source.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        super().do_GET()


def browser_launch_options() -> dict[str, object]:
    options: dict[str, object] = {
        'headless': True,
        'args': ['--no-sandbox', '--disable-dev-shm-usage'],
        'timeout': 30_000,
    }
    if sys.platform == 'win32':
        local_app_data = pathlib.Path(os.environ.get('LOCALAPPDATA', ''))
        candidates = sorted(
            local_app_data.glob('ms-playwright/chromium_headless_shell-*/chrome-win/headless_shell.exe'),
            reverse=True,
        )
        if candidates:
            options['executable_path'] = str(candidates[0])
    return options


def wait_for_persisted_settings(page, expected: dict[str, object]) -> int:
    page.wait_for_function(
        """async (expected) => {
          const local = JSON.parse(localStorage.getItem('livestock2-state-v0.4'));
          if (!local || !Object.entries(expected).every(([key, value]) => local.settings?.[key] === value)) return false;
          const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('livestock-level2-trainer', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const stored = await new Promise((resolve, reject) => {
            const transaction = database.transaction('app', 'readonly');
            const request = transaction.objectStore('app').get('state-v0.4');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          database.close();
          return stored?.revision >= local.revision
            && Object.entries(expected).every(([key, value]) => stored.settings?.[key] === value);
        }""",
        arg=expected,
    )
    return page.evaluate("() => JSON.parse(localStorage.getItem('livestock2-state-v0.4')).revision")


def reload_from_indexeddb(page, expected: dict[str, object], minimum_revision: int) -> None:
    page.evaluate("() => localStorage.removeItem('livestock2-state-v0.4')")
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#app .brand')
    actual = page.evaluate(
        """() => ({
          revision: LivestockApp.runtime.state.revision,
          settings: LivestockApp.runtime.state.settings,
        })""",
    )
    assert actual['revision'] >= minimum_revision
    for key, value in expected.items():
        assert actual['settings'][key] == value, f'{key} was not restored from IndexedDB'


def open_settings(page) -> None:
    page.locator('[data-view="settings"]').first.click()
    page.wait_for_selector('[data-setting-study-mode]')


def start_daily_and_assert_level(page, expected_level: int) -> None:
    page.locator('[data-view="home"]').first.click()
    page.locator('[data-start="daily"]').first.click()
    page.wait_for_function('(level) => LivestockApp.runtime.session?.supportLevel === level', arg=expected_level)
    assert page.evaluate('() => LivestockApp.runtime.session.supportLevel') == expected_level


def main() -> None:
    ServerState.serve_updated_worker = False
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), ReviewBuildHandler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, name='http-pwa-smoke-server', daemon=True)
    thread.start()
    base_url = f'http://127.0.0.1:{server.server_port}'
    browser = None

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(**browser_launch_options())
            context = browser.new_context(viewport={'width': 360, 'height': 800}, device_scale_factor=1)
            page = context.new_page()
            page.set_default_timeout(10_000)
            page_errors: list[str] = []
            console_errors: list[str] = []
            page.on('pageerror', lambda error: page_errors.append(str(error)))
            page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)

            # Establish the origin without loading the app, then seed one old app
            # cache and one unrelated cache before the first worker activates.
            response = page.goto(f'{base_url}/robots.txt', wait_until='domcontentloaded')
            assert response and response.ok, 'HTTP review server did not serve robots.txt'
            page.evaluate(
                """async ({legacy, foreign}) => {
                  await caches.delete(legacy);
                  await caches.delete(foreign);
                  const oldCache = await caches.open(legacy);
                  await oldCache.put('/legacy-marker', new Response('legacy'));
                  const foreignCache = await caches.open(foreign);
                  await foreignCache.put('/foreign-marker', new Response('foreign'));
                }""",
                {'legacy': LEGACY_CACHE, 'foreign': FOREIGN_CACHE},
            )

            response = page.goto(f'{base_url}/', wait_until='domcontentloaded')
            assert response and response.ok, 'index.html did not load over HTTP'
            page.wait_for_selector('#app .brand')

            manifest_response = context.request.get(f'{base_url}/manifest.webmanifest')
            assert manifest_response.ok, 'manifest.webmanifest did not return HTTP 200'
            manifest = manifest_response.json()
            assert manifest['start_url'] == './'
            assert manifest['display'] == 'standalone'
            for asset in ('app.js', 'styles.css', 'icon-192.png', 'assets/chick-guard.svg'):
                asset_response = context.request.get(f'{base_url}/{asset}')
                assert asset_response.ok, f'{asset} did not return HTTP 200'

            page.evaluate("() => navigator.serviceWorker.ready.then(() => true)")
            page.wait_for_function(
                """async ({current, legacy, foreign}) => {
                  const names = await caches.keys();
                  return names.includes(current) && !names.includes(legacy) && names.includes(foreign);
                }""",
                arg={'current': BASE_CACHE, 'legacy': LEGACY_CACHE, 'foreign': FOREIGN_CACHE},
            )
            assert page.evaluate('() => Boolean(navigator.serviceWorker.controller)'), 'page is not controlled by the service worker'
            cached_paths = page.evaluate(
                """async (cacheName) => (await (await caches.open(cacheName)).keys())
                  .map((request) => new URL(request.url).pathname)""",
                BASE_CACHE,
            )
            for required in ('/index.html', '/app.js', '/styles.css', '/manifest.webmanifest'):
                assert required in cached_paths, f'{required} is missing from the app-shell cache'

            # Use production settings controls and the browser's real IndexedDB.
            # Each support mode must survive an IndexedDB-only boot and govern
            # the support level assigned to a newly started study session.
            page.locator('[data-ui-language="ja"]').click()
            open_settings(page)
            page.locator('[data-setting-study-mode]').select_option('adaptive')
            adaptive_settings = {'uiLanguage': 'ja', 'studySupportMode': 'adaptive'}
            adaptive_revision = wait_for_persisted_settings(page, adaptive_settings)
            reload_from_indexeddb(page, adaptive_settings, adaptive_revision)
            open_settings(page)
            assert page.locator('[data-setting-study-mode]').input_value() == 'adaptive'
            assert page.locator('[data-setting-level]').is_disabled()
            start_daily_and_assert_level(page, 3)

            page.reload(wait_until='domcontentloaded')
            page.wait_for_selector('#app .brand')
            open_settings(page)
            page.locator('[data-setting-study-mode]').select_option('guided')
            page.locator('[data-setting-level]').select_option('2')
            guided_settings = {
                'uiLanguage': 'ja',
                'studySupportMode': 'guided',
                'preferredSupportLevel': 2,
            }
            guided_revision = wait_for_persisted_settings(page, guided_settings)
            reload_from_indexeddb(page, guided_settings, guided_revision)
            open_settings(page)
            assert page.locator('[data-setting-study-mode]').input_value() == 'guided'
            assert page.locator('[data-setting-level]').input_value() == '2'
            assert not page.locator('[data-setting-level]').is_disabled()
            start_daily_and_assert_level(page, 2)

            page.reload(wait_until='domcontentloaded')
            page.wait_for_selector('#app .brand')
            open_settings(page)
            page.locator('[data-setting-study-mode]').select_option('japanese_only')
            japanese_only_settings = {'uiLanguage': 'ja', 'studySupportMode': 'japanese_only'}
            japanese_only_revision = wait_for_persisted_settings(page, japanese_only_settings)
            reload_from_indexeddb(page, japanese_only_settings, japanese_only_revision)
            open_settings(page)
            assert page.locator('[data-setting-study-mode]').input_value() == 'japanese_only'
            assert page.locator('[data-setting-level]').is_disabled()
            start_daily_and_assert_level(page, 0)

            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), '360px view overflows horizontally'

            # A controlled localhost page must reload without the network.
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_selector('#app .brand')
            assert page.evaluate("() => LivestockApp.runtime.state.settings.uiLanguage === 'ja'")
            assert page.evaluate('() => Boolean(navigator.serviceWorker.controller)')
            context.set_offline(False)

            # Serve a byte-different worker with a new app cache. Its activation
            # must remove the preceding livestock2 cache and retain foreign data.
            update_response = context.request.get(f'{base_url}/__test__/service-worker-update')
            assert update_response.status == 204
            page.evaluate(
                """async () => {
                  const registration = await navigator.serviceWorker.getRegistration();
                  if (!registration) throw new Error('service worker registration is missing');
                  await registration.update();
                }""",
            )
            page.wait_for_function(
                """async ({previous, updated, foreign}) => {
                  const names = await caches.keys();
                  return !names.includes(previous) && names.includes(updated) && names.includes(foreign);
                }""",
                arg={'previous': BASE_CACHE, 'updated': UPDATED_CACHE, 'foreign': FOREIGN_CACHE},
                timeout=15_000,
            )

            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_selector('#app .brand')
            assert page.evaluate('() => Boolean(navigator.serviceWorker.controller)')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
            context.set_offline(False)

            assert not page_errors, f'page errors: {page_errors}'
            assert not console_errors, f'console errors: {console_errors}'
            context.close()
            browser.close()
            browser = None

        print(json.dumps({
            'overall': 'PASS',
            'url': 'http://127.0.0.1:<ephemeral-port>',
            'viewport': '360x800',
            'checks': [
                'http_navigation_and_assets',
                'manifest',
                'service_worker_ready',
                'owned_cache_cleanup_foreign_cache_retained',
                'settings_ui_real_indexeddb_reload_and_new_session_levels',
                'offline_reload',
                'service_worker_cache_update',
                'no_page_or_console_errors',
                'no_360px_horizontal_overflow',
            ],
        }, ensure_ascii=False))
    finally:
        if browser is not None:
            try:
                browser.close()
            except Exception:
                # sync_playwright already closes Chromium if the test body raises.
                pass
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        if thread.is_alive():
            raise RuntimeError('HTTP PWA test server did not stop cleanly')


if __name__ == '__main__':
    main()
