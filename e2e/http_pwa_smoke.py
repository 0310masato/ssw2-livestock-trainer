from __future__ import annotations

import http.server
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from contextlib import contextmanager

from playwright.sync_api import sync_playwright


ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
OLD_HEAD = 'a6533c3a4dd194f48cc5186ed061b06b06019e6f'
LEGACY_CACHE = 'livestock2-v0.4-http-e2e-legacy'
FOREIGN_CACHE = 'foreign-http-e2e-cache'


class ServerState:
    root = DIST


def parse_cache_name(dist: pathlib.Path) -> str:
    source = (dist / 'sw.js').read_text(encoding='utf-8')
    match = re.search(r'const CACHE_NAME = ["\']([^"\']+)["\'];', source)
    if not match:
        raise RuntimeError(f'Could not read CACHE_NAME from {dist / "sw.js"}.')
    return match.group(1)


def parse_build_id(dist: pathlib.Path) -> str:
    source = (dist / 'index.html').read_text(encoding='utf-8')
    match = re.search(r'<meta name="app-build-id" content="([a-f0-9]{16})">', source)
    if not match:
        raise RuntimeError(f'Could not read the content build ID from {dist / "index.html"}.')
    return match.group(1)


@contextmanager
def actual_old_build():
    with tempfile.TemporaryDirectory(prefix='ssw2-pwa-old-build-') as temporary:
        clone = pathlib.Path(temporary) / 'old'
        subprocess.run(
            ['git', 'clone', '--quiet', '--no-checkout', '--no-hardlinks', str(ROOT), str(clone)],
            check=True,
        )
        subprocess.run(['git', '-C', str(clone), 'checkout', '--quiet', '--detach', OLD_HEAD], check=True)
        actual_head = subprocess.run(
            ['git', '-C', str(clone), 'rev-parse', 'HEAD'],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        if actual_head != OLD_HEAD:
            raise RuntimeError(f'Old-build clone resolved {actual_head}, expected {OLD_HEAD}.')
        for dependency_file in ('package.json', 'package-lock.json'):
            old_dependency = (clone / dependency_file).read_text(encoding='utf-8').replace('\r\n', '\n')
            current_dependency = (ROOT / dependency_file).read_text(encoding='utf-8').replace('\r\n', '\n')
            if old_dependency != current_dependency:
                raise RuntimeError(f'{dependency_file} differs at {OLD_HEAD}; isolated npm ci is required.')
        shutil.copytree(ROOT / 'node_modules', clone / 'node_modules')
        npm = 'npm.cmd' if sys.platform == 'win32' else 'npm'
        subprocess.run([npm, 'run', 'build'], cwd=clone, check=True)
        yield clone / 'dist'


class ReviewBuildHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ServerState.root), **kwargs)

    def log_message(self, _format: str, *_args) -> None:
        return

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        if path == '/sw.js':
            source = (ServerState.root / 'sw.js').read_text(encoding='utf-8')
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


def render_level_three_question(page, question_id: str) -> int:
    return page.evaluate(
        """(questionId) => {
          const question = LivestockApp.questionById(questionId);
          const policy = LivestockApp.supportPolicyForLevel(3);
          Object.assign(LivestockApp.runtime.state.settings, {
            studySupportMode: 'guided',
            preferredSupportLevel: 3,
            showVocabulary: true,
            showQuestionPattern: true,
          });
          LivestockApp.runtime.view = 'study';
          LivestockApp.runtime.lastMockResult = null;
          LivestockApp.runtime.session = {
            id: `pwa-upgrade-${questionId}`,
            kind: 'daily',
            questionIds: [questionId],
            index: 0,
            selectedChoiceId: null,
            answered: false,
            startedQuestionAt: performance.now(),
            supportLevel: 3,
            furiganaVisible: policy.showFuriganaInitially,
            easyJapaneseVisible: policy.showEasyJapaneseInitially,
            indonesianVisible: policy.showQuestionTranslationInitially,
            keywordsVisible: policy.showKeywordsInitially,
            choiceTranslationsVisible: policy.showChoiceTranslationsInitially,
            answerIndonesianVisible: false,
            supportUsage: {
              furiganaUsed: true,
              easyJapaneseUsed: true,
              keywordsOpened: true,
              questionTranslationOpened: true,
              choiceTranslationsOpened: true,
              answerIndonesianOpened: false,
            },
            retryOfHistoryId: null,
            isRetryWithoutSupport: false,
            confidence: null,
            pendingReason: null,
            completed: false,
          };
          LivestockApp.render();
          return document.querySelectorAll('[data-learning-component="choice-easy-japanese"], .choice-easy-japanese').length;
        }""",
        question_id,
    )


def main() -> None:
    current_cache = parse_cache_name(DIST)
    current_build_id = parse_build_id(DIST)
    with actual_old_build() as old_dist:
        old_cache = parse_cache_name(old_dist)
        if old_cache == current_cache:
            raise AssertionError('The real old and current builds unexpectedly share one cache name.')
        ServerState.root = old_dist
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
                page.set_default_timeout(15_000)
                page_errors: list[str] = []
                console_errors: list[str] = []
                page.on('pageerror', lambda error: page_errors.append(str(error)))
                page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)

                # Start from the exact known-leaking predecessor. This proves the
                # fixture really contains the q078 Level 3 choice easyJa leak.
                response = page.goto(f'{base_url}/', wait_until='domcontentloaded')
                assert response and response.ok, 'old index.html did not load over HTTP'
                page.wait_for_selector('#app .brand')
                page.evaluate("() => navigator.serviceWorker.ready.then(() => true)")
                page.wait_for_function('() => Boolean(navigator.serviceWorker.controller)')
                page.wait_for_function(
                    "async (oldCache) => (await caches.keys()).includes(oldCache)",
                    arg=old_cache,
                )
                assert render_level_three_question(page, 'q078') == 4, 'old q078 fixture is not the known leaking build'
                assert page.evaluate(
                    "() => LivestockApp.renderChoiceTranslation.toString().includes('choice-easy-japanese')",
                ), 'old app.js does not contain the expected leak marker'
                page.evaluate(
                    """async ({legacy, foreign}) => {
                      const oldCache = await caches.open(legacy);
                      await oldCache.put('/legacy-marker', new Response('legacy'));
                      const foreignCache = await caches.open(foreign);
                      await foreignCache.put('/foreign-marker', new Response('foreign'));
                    }""",
                    {'legacy': LEGACY_CACHE, 'foreign': FOREIGN_CACHE},
                )

                # Change only the server root while retaining the same browser,
                # profile, origin and port. The old worker first fetches the new
                # index; its versioned app URL cannot resolve to old cached bytes.
                ServerState.root = DIST
                current_index_response = context.request.get(f'{base_url}/index.html?build={current_build_id}')
                assert current_index_response.ok
                assert f'content="{current_build_id}"' in current_index_response.text()
                page.goto(f'{base_url}/?build={current_build_id}', wait_until='domcontentloaded')
                page.wait_for_selector('#app .brand')
                page.wait_for_function(
                    "(buildId) => document.querySelector('meta[name=\"app-build-id\"]')?.content === buildId",
                    arg=current_build_id,
                )
                page.wait_for_function(
                    "() => !LivestockApp.renderChoiceTranslation.toString().includes('choice-easy-japanese')",
                )
                page.evaluate(
                    """async () => {
                      const registration = await navigator.serviceWorker.getRegistration();
                      if (!registration) throw new Error('service worker registration is missing');
                      await registration.update();
                    }""",
                )
                assert page.evaluate(
                    "() => navigator.serviceWorker.getRegistration().then((registration) => registration?.updateViaCache)",
                ) == 'none', 'service worker registration must bypass the HTTP cache during update checks'
                page.wait_for_function(
                    """async ({oldCache, legacy, current, foreign}) => {
                      const names = await caches.keys();
                      return !names.includes(oldCache)
                        && !names.includes(legacy)
                        && names.includes(current)
                        && names.includes(foreign);
                    }""",
                    arg={
                        'oldCache': old_cache,
                        'legacy': LEGACY_CACHE,
                        'current': current_cache,
                        'foreign': FOREIGN_CACHE,
                    },
                )
                loaded_app_url = page.evaluate(
                    """() => performance.getEntriesByType('resource')
                      .map((entry) => entry.name)
                      .find((name) => new URL(name).pathname.endsWith('/app.js')) ?? ''""",
                )
                assert f'?v={current_build_id}' in loaded_app_url, 'new content-addressed app.js was not loaded'

                for question_id in ('q045', 'q055', 'q078', 'q079'):
                    assert render_level_three_question(page, question_id) == 0, f'{question_id} still mounts choice easyJa after upgrade'
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), '360px view overflows after upgrade'

                manifest_response = context.request.get(f'{base_url}/manifest.webmanifest')
                assert manifest_response.ok, 'manifest.webmanifest did not return HTTP 200'
                manifest = manifest_response.json()
                assert manifest['start_url'] == './'
                assert manifest['display'] == 'standalone'
                for asset in (
                    f'app.js?v={current_build_id}',
                    f'styles.css?v={current_build_id}',
                    'icon-192.png',
                    'assets/chick-guard.svg',
                ):
                    asset_response = context.request.get(f'{base_url}/{asset}')
                    assert asset_response.ok, f'{asset} did not return HTTP 200'
                cached_urls = page.evaluate(
                    """async (cacheName) => (await (await caches.open(cacheName)).keys())
                      .map((request) => new URL(request.url).pathname + new URL(request.url).search)""",
                    current_cache,
                )
                for required in (
                    '/index.html',
                    f'/app.js?v={current_build_id}',
                    f'/styles.css?v={current_build_id}',
                    '/manifest.webmanifest',
                ):
                    assert required in cached_urls, f'{required} is missing from the current app-shell cache'

                # Use production settings controls and the browser's real IDB.
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
                guided_settings = {'uiLanguage': 'ja', 'studySupportMode': 'guided', 'preferredSupportLevel': 2}
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
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')

                context.set_offline(True)
                page.reload(wait_until='domcontentloaded')
                page.wait_for_selector('#app .brand')
                assert page.evaluate("() => document.querySelector('meta[name=\"app-build-id\"]')?.content") == current_build_id
                assert page.evaluate("() => LivestockApp.runtime.state.settings.uiLanguage === 'ja'")
                assert page.evaluate('() => Boolean(navigator.serviceWorker.controller)')
                assert page.evaluate(
                    "() => !LivestockApp.renderChoiceTranslation.toString().includes('choice-easy-japanese')",
                )
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
                'oldHead': OLD_HEAD,
                'oldBuildId': f'legacy-cache:{old_cache}',
                'newBuildId': current_build_id,
                'oldCache': old_cache,
                'newCache': current_cache,
                'checks': [
                    'actual_old_head_q078_choice_easy_ja_fixture',
                    'same_origin_old_to_new_content_addressed_upgrade',
                    'q045_q055_q078_q079_choice_easy_ja_absent',
                    'old_owned_cache_cleanup_foreign_cache_retained',
                    'versioned_app_and_styles_shell_urls',
                    'settings_ui_real_indexeddb_reload_and_new_session_levels',
                    'offline_new_build_reload',
                    'no_page_or_console_errors',
                    'no_360px_horizontal_overflow',
                ],
            }, ensure_ascii=False))
        finally:
            if browser is not None:
                try:
                    browser.close()
                except Exception:
                    pass
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
            if thread.is_alive():
                raise RuntimeError('HTTP PWA test server did not stop cleanly')


if __name__ == '__main__':
    main()
