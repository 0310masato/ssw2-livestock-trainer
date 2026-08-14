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

from playwright.sync_api import Page, sync_playwright


ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
OLD_HEADS = (
    'a6533c3a4dd194f48cc5186ed061b06b06019e6f',
    'fd1f89293b0a2aad3e11ab46a9bda58da28981b4',
)
EXPLICIT_REGRESSION_IDS = ('q045', 'q055', 'q078', 'q079')
FOREIGN_CACHE_PREFIX = 'foreign-http-e2e-cache'


class ServerState:
    root = DIST
    sw_root = DIST
    fail_paths: set[str] = set()


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


def optional_build_id(dist: pathlib.Path) -> str | None:
    source = (dist / 'index.html').read_text(encoding='utf-8')
    match = re.search(r'<meta name="app-build-id" content="([a-f0-9]{16})">', source)
    return match.group(1) if match else None


def npm_command() -> str:
    return 'npm.cmd' if sys.platform == 'win32' else 'npm'


def copy_dependencies(clone: pathlib.Path) -> None:
    source = ROOT / 'node_modules'
    if not source.is_dir():
        raise RuntimeError('node_modules is missing; run npm ci before the HTTP E2E suite.')
    shutil.copytree(source, clone / 'node_modules', symlinks=True)


@contextmanager
def actual_build_at(head: str):
    with tempfile.TemporaryDirectory(prefix=f'ssw2-pwa-{head[:7]}-') as temporary:
        clone = pathlib.Path(temporary) / 'checkout'
        subprocess.run(
            ['git', 'clone', '--quiet', '--no-checkout', '--no-hardlinks', str(ROOT), str(clone)],
            check=True,
        )
        subprocess.run(['git', '-C', str(clone), 'checkout', '--quiet', '--detach', head], check=True)
        actual_head = subprocess.run(
            ['git', '-C', str(clone), 'rev-parse', 'HEAD'],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        if actual_head != head:
            raise RuntimeError(f'Old-build clone resolved {actual_head}, expected {head}.')

        for dependency_file in ('package.json', 'package-lock.json'):
            old_dependency = (clone / dependency_file).read_text(encoding='utf-8').replace('\r\n', '\n')
            current_dependency = (ROOT / dependency_file).read_text(encoding='utf-8').replace('\r\n', '\n')
            if old_dependency != current_dependency:
                raise RuntimeError(f'{dependency_file} differs at {head}; isolated npm ci is required.')
        copy_dependencies(clone)
        subprocess.run([npm_command(), 'run', 'build'], cwd=clone, check=True)
        yield clone / 'dist'


@contextmanager
def service_worker_only_build():
    """Build the current tree with one harmless SW-template-only logic change."""
    with tempfile.TemporaryDirectory(prefix='ssw2-pwa-sw-only-') as temporary:
        clone = pathlib.Path(temporary) / 'checkout'
        current_head = subprocess.run(
            ['git', '-C', str(ROOT), 'rev-parse', 'HEAD'],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        subprocess.run(
            ['git', 'clone', '--quiet', '--no-checkout', '--no-hardlinks', str(ROOT), str(clone)],
            check=True,
        )
        subprocess.run(['git', '-C', str(clone), 'checkout', '--quiet', '--detach', current_head], check=True)

        # Overlay build inputs from the working tree so a focused local run tests
        # the exact uncommitted implementation that produced the current dist.
        for directory in ('src', 'public'):
            shutil.copytree(ROOT / directory, clone / directory, dirs_exist_ok=True)
        for file_name in ('package.json', 'package-lock.json', 'tsconfig.json'):
            shutil.copy2(ROOT / file_name, clone / file_name)
        shutil.copy2(ROOT / 'scripts' / 'build.mjs', clone / 'scripts' / 'build.mjs')

        build_script = clone / 'scripts' / 'build.mjs'
        source = build_script.read_text(encoding='utf-8')
        needle = "self.addEventListener('fetch', (event) => {"
        if source.count(needle) != 1:
            raise RuntimeError('Could not identify the unique service-worker fetch template boundary.')
        source = source.replace(
            needle,
            "const HTTP_E2E_SW_LOGIC_SCHEMA = 1;\nself.addEventListener('fetch', (event) => {",
            1,
        )
        build_script.write_text(source, encoding='utf-8')
        copy_dependencies(clone)
        subprocess.run([npm_command(), 'run', 'build'], cwd=clone, check=True)

        variant = clone / 'dist'
        for path in (
            'app.js',
            'styles.css',
            'manifest.webmanifest',
            'icon-192.png',
            'assets/chick-guard.svg',
        ):
            if (variant / path).read_bytes() != (DIST / path).read_bytes():
                raise AssertionError(f'SW-only fixture unexpectedly changed {path}.')
        if parse_build_id(variant) == parse_build_id(DIST):
            raise AssertionError('A service-worker-template-only change did not change the build ID.')
        yield variant


class ReviewBuildHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ServerState.root), **kwargs)

    def log_message(self, _format: str, *_args) -> None:
        return

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        if path in ServerState.fail_paths:
            body = b'intentional HTTP E2E app-shell failure'
            self.send_response(503)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == '/sw.js':
            source = (ServerState.sw_root / 'sw.js').read_text(encoding='utf-8')
            body = source.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


@contextmanager
def http_server(root: pathlib.Path):
    ServerState.root = root
    ServerState.sw_root = root
    ServerState.fail_paths = set()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), ReviewBuildHandler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, name='http-pwa-smoke-server', daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}'
    finally:
        ServerState.fail_paths = set()
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        if thread.is_alive():
            raise RuntimeError('HTTP PWA test server did not stop cleanly')


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


def wait_for_boot(page: Page, build_id: str | None = None) -> None:
    page.wait_for_selector('#app .brand')
    page.wait_for_function('() => Boolean(window.LivestockApp?.runtime?.state)')
    if build_id:
        page.wait_for_function(
            "(id) => document.querySelector('meta[name=\"app-build-id\"]')?.content === id",
            arg=build_id,
        )


def wait_for_controlled_worker(page: Page, cache_name: str) -> None:
    page.evaluate('() => navigator.serviceWorker.ready.then(() => true)')
    page.wait_for_function('() => Boolean(navigator.serviceWorker.controller)')
    page.wait_for_function(
        'async (name) => (await caches.keys()).includes(name)',
        arg=cache_name,
    )


def render_level_three_question(page: Page, question_id: str) -> dict[str, object]:
    return page.evaluate(
        """(questionId) => {
          const question = LivestockApp.questionById(questionId);
          const policy = LivestockApp.supportPolicyForLevel(3);
          Object.assign(LivestockApp.runtime.state.settings, {
            studySupportMode: 'guided', preferredSupportLevel: 3,
            showVocabulary: true, showQuestionPattern: true,
          });
          LivestockApp.runtime.view = 'study';
          LivestockApp.runtime.lastMockResult = null;
          LivestockApp.runtime.session = {
            id: `pwa-upgrade-${questionId}`, kind: 'daily', questionIds: [questionId], index: 0,
            selectedChoiceId: null, answered: false, startedQuestionAt: performance.now(), supportLevel: 3,
            furiganaVisible: policy.showFuriganaInitially,
            easyJapaneseVisible: policy.showEasyJapaneseInitially,
            indonesianVisible: policy.showQuestionTranslationInitially,
            keywordsVisible: policy.showKeywordsInitially,
            choiceTranslationsVisible: policy.showChoiceTranslationsInitially,
            answerIndonesianVisible: false,
            supportUsage: {
              furiganaUsed: true, easyJapaneseUsed: true, keywordsOpened: true,
              questionTranslationOpened: true, choiceTranslationsOpened: true,
              answerIndonesianOpened: false,
            },
            retryOfHistoryId: null, isRetryWithoutSupport: false,
            confidence: null, pendingReason: null, completed: false,
          };
          LivestockApp.render();
          return {
            easyChoiceCount: document.querySelectorAll('[data-learning-component="choice-easy-japanese"], .choice-easy-japanese').length,
            questionEasyCount: document.querySelectorAll('.meaning-stage .support-box:not(.id) p[lang="ja"]').length,
            choiceIndonesianCount: document.querySelectorAll('.choice-button [data-learning-component="choice-translation"]').length,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          };
        }""",
        question_id,
    )


PRODUCTION_MATRIX_SCRIPT = """() => {
  const pilot = LivestockApp.QUESTIONS.filter((question) => question.schemaVersion === '0.4.0');
  const failures = [];
  const explicit = Object.fromEntries(['q045', 'q055', 'q078', 'q079'].map((id) => [id, true]));
  const original = {
    view: LivestockApp.runtime.view,
    session: LivestockApp.runtime.session,
    lastMockResult: LivestockApp.runtime.lastMockResult,
    settings: { ...LivestockApp.runtime.state.settings },
    historyLength: LivestockApp.runtime.state.history.length,
  };
  let beforeCases = 0;
  let afterCases = 0;

  const newSession = (question, level, answered) => {
    const policy = LivestockApp.supportPolicyForLevel(level);
    return {
      id: `http-production-${question.id}-${level}`,
      kind: 'daily', questionIds: [question.id], index: 0,
      selectedChoiceId: answered ? question.correctChoiceId : null,
      answered, startedQuestionAt: performance.now(), supportLevel: level,
      furiganaVisible: policy.showFuriganaInitially,
      easyJapaneseVisible: policy.showEasyJapaneseInitially,
      indonesianVisible: policy.showQuestionTranslationInitially,
      keywordsVisible: policy.showKeywordsInitially,
      choiceTranslationsVisible: policy.showChoiceTranslationsInitially,
      answerIndonesianVisible: answered && policy.showAnswerIndonesianInitially,
      supportUsage: {
        furiganaUsed: policy.showFuriganaInitially,
        easyJapaneseUsed: policy.showEasyJapaneseInitially,
        keywordsOpened: policy.showKeywordsInitially,
        questionTranslationOpened: policy.showQuestionTranslationInitially,
        choiceTranslationsOpened: policy.showChoiceTranslationsInitially,
        answerIndonesianOpened: answered && policy.showAnswerIndonesianInitially,
      },
      retryOfHistoryId: null, isRetryWithoutSupport: false,
      confidence: answered ? 'sure' : null, pendingReason: null, completed: false,
    };
  };
  const fail = (question, level, phase, message) => failures.push(`${question.id}/L${level}/${phase}: ${message}`);
  const visibleJapanese = (element) => {
    const copy = element?.cloneNode(true);
    copy?.querySelectorAll('rt, rp').forEach((reading) => reading.remove());
    return copy?.textContent ?? '';
  };
  const assertNoChoiceEasy = (question, level, phase) => {
    const choices = [...document.querySelectorAll('.choice-button')];
    if (document.querySelectorAll('[data-learning-component="choice-easy-japanese"], .choice-easy-japanese').length) {
      fail(question, level, phase, 'choice easyJa element mounted');
    }
    for (const [index, choice] of choices.entries()) {
      const markers = [choice, ...choice.querySelectorAll('*')].flatMap((element) =>
        [...element.attributes]
          .filter((attribute) => /choice[-_ ]?easy|easy[-_ ]?japanese|やさしい日本語/iu.test(`${attribute.name}=${attribute.value}`))
          .map((attribute) => `${attribute.name}=${attribute.value}`));
      if (markers.length) fail(question, level, phase, `choice easyJa marker ${index}`);
      const source = question.choices[index];
      if (source?.text.easyJa && source.text.easyJa !== source.text.ja) {
        const unsupported = choice.cloneNode(true);
        unsupported.querySelectorAll('.choice-letter, .choice-ja, [data-learning-component="choice-translation"]')
          .forEach((element) => element.remove());
        const attributeLeak = [choice, ...choice.querySelectorAll('*')].some((element) =>
          [...element.attributes].some((attribute) => attribute.value.includes(source.text.easyJa)));
        if (unsupported.textContent.includes(source.text.easyJa) || attributeLeak) {
          fail(question, level, phase, `choice easyJa content/attribute ${index}`);
        }
      }
    }
  };

  Object.assign(LivestockApp.runtime.state.settings, {
    studySupportMode: 'guided', showVocabulary: true, showQuestionPattern: true,
  });
  LivestockApp.runtime.view = 'study';
  LivestockApp.runtime.lastMockResult = null;

  for (const question of pilot) {
    for (const level of [0, 1, 2, 3]) {
      const policy = LivestockApp.supportPolicyForLevel(level);
      LivestockApp.runtime.state.settings.preferredSupportLevel = level;
      LivestockApp.runtime.session = newSession(question, level, false);
      LivestockApp.render();
      beforeCases += 1;

      const card = document.querySelector(level === 0 ? '.japanese-only-card' : '.guided-lesson-card');
      const choices = [...document.querySelectorAll('.choice-button')];
      if (!card || choices.length !== question.choices.length) fail(question, level, 'before', 'study card/choice count');
      assertNoChoiceEasy(question, level, 'before');

      const forbidden = [
        '[data-learning-component="answer-explanation"]',
        '[data-learning-component="wrong-choice-explanation"]',
        '.answer-panel', '.choice-review', '.memory-point',
        '.choice-button.correct', '.choice-button.wrong', '[data-retry-without-support]',
      ];
      if (forbidden.some((selector) => document.querySelector(selector))) {
        fail(question, level, 'before', 'answer-only element/result class mounted');
      }
      const answerOnlyTexts = [
        question.explanation.ja, question.explanation.easyJa, question.explanation.id,
        question.learningSupport.memoryPoint.ja,
        question.learningSupport.memoryPoint.easyJa,
        question.learningSupport.memoryPoint.id,
        ...Object.values(question.choiceRationales).flatMap((text) => [text.ja, text.easyJa, text.id]),
      ].filter((text) => text.length >= 6);
      if (answerOnlyTexts.some((text) => card?.textContent.includes(text))) {
        fail(question, level, 'before', 'answer-only text mounted');
      }
      for (const element of [card, ...(card?.querySelectorAll('*') ?? [])]) {
        for (const attribute of element.attributes) {
          if (attribute.name !== 'data-choice' && attribute.value === question.correctChoiceId) {
            fail(question, level, 'before', `correctChoiceId mounted in ${attribute.name}`);
          }
        }
      }

      for (const [index, choice] of choices.entries()) {
        const japanese = choice.querySelector('.choice-ja');
        if (visibleJapanese(japanese) !== question.choices[index].text.ja) fail(question, level, 'before', `choice JA ${index}`);
        const expectedReadings = level > 0
          ? (question.choices[index].text.rubyJa ?? []).filter((segment) => segment.reading).length : 0;
        if ((japanese?.querySelectorAll('rt').length ?? 0) !== expectedReadings) fail(question, level, 'before', `choice ruby ${index}`);
        const translation = choice.querySelector('[data-learning-component="choice-translation"]');
        if ((level === 3 && translation?.textContent !== question.choices[index].text.id) || (level !== 3 && translation)) {
          fail(question, level, 'before', `choice ID ${index}`);
        }
      }
      const expectedQuestionReadings = level > 0
        ? (question.question.rubyJa ?? []).filter((segment) => segment.reading).length : 0;
      if (document.querySelectorAll('.question-text rt').length !== expectedQuestionReadings) fail(question, level, 'before', 'question ruby');
      const questionEasy = document.querySelector('.meaning-stage .support-box:not(.id) p[lang="ja"]');
      if ((level === 3 && questionEasy?.textContent !== question.question.easyJa) || (level !== 3 && questionEasy)) {
        fail(question, level, 'before', 'question easyJa boundary');
      }
      const questionTranslation = document.querySelectorAll('.meaning-stage [data-learning-component="indonesian-translation"]').length;
      const keywordCount = document.querySelectorAll('[data-learning-component="keyword-glossary"]').length;
      const intentCount = document.querySelectorAll('[data-learning-component="question-intent"]').length;
      if (questionTranslation !== (level === 3 ? 1 : 0)) fail(question, level, 'before', 'question ID boundary');
      if (keywordCount !== (level > 0 ? 1 : 0)) fail(question, level, 'before', 'keyword boundary');
      if (intentCount !== (level >= 2 ? 1 : 0)) fail(question, level, 'before', 'intent boundary');
      if (document.documentElement.scrollWidth > window.innerWidth + 1) fail(question, level, 'before', '360px overflow');

      if (['q045', 'q055', 'q078', 'q079'].includes(question.id) && level === 3) {
        explicit[question.id] = explicit[question.id]
          && document.querySelectorAll('[data-learning-component="choice-easy-japanese"], .choice-easy-japanese').length === 0;
      }

      LivestockApp.runtime.session = newSession(question, level, true);
      LivestockApp.render();
      afterCases += 1;
      assertNoChoiceEasy(question, level, 'after');

      const explanation = document.querySelector('[data-learning-component="answer-explanation"]');
      if (!explanation || !visibleJapanese(explanation).includes(question.explanation.ja)) fail(question, level, 'after', 'correct rationale');
      const reviews = [...document.querySelectorAll('.choice-review-item')];
      const wrongReviews = [...document.querySelectorAll('.choice-review-item.wrong')];
      if (reviews.length !== question.choices.length || wrongReviews.length !== question.choices.length - 1
          || document.querySelectorAll('.choice-review-item.correct').length !== 1) {
        fail(question, level, 'after', 'choice rationale topology');
      }
      for (const choice of question.choices.filter((choice) => choice.id !== question.correctChoiceId)) {
        if (!wrongReviews.some((item) => visibleJapanese(item).includes(question.choiceRationales[choice.id].ja))) {
          fail(question, level, 'after', `missing wrong rationale ${choice.id}`);
        }
      }
      const answerJapanese = [...document.querySelectorAll('.choice-review-item p[lang="ja"]')];
      if (answerJapanese.length !== question.choices.length || answerJapanese.some((item) => !item.textContent.trim())) {
        fail(question, level, 'after', 'empty Japanese rationale');
      }
      const choiceTranslations = document.querySelectorAll('.choice-button [data-learning-component="choice-translation"]').length;
      const answerIndonesian = explanation?.querySelectorAll('[lang="id"]').length ?? 0;
      const reviewIndonesian = document.querySelectorAll('.choice-review-item [lang="id"]').length;
      if (choiceTranslations !== (level === 3 ? question.choices.length : 0)) fail(question, level, 'after', 'choice ID boundary');
      if ((level === 3 && (answerIndonesian === 0 || reviewIndonesian < question.choices.length * 2))
          || (level !== 3 && (answerIndonesian !== 0 || reviewIndonesian !== 0))) {
        fail(question, level, 'after', 'answer ID boundary');
      }
      if (document.documentElement.scrollWidth > window.innerWidth + 1) fail(question, level, 'after', '360px overflow');
      if (['q045', 'q055', 'q078', 'q079'].includes(question.id) && level === 3) {
        explicit[question.id] = explicit[question.id]
          && document.querySelectorAll('[data-learning-component="choice-easy-japanese"], .choice-easy-japanese').length === 0;
      }
    }
  }

  LivestockApp.runtime.state.history.length = original.historyLength;
  Object.assign(LivestockApp.runtime.state.settings, original.settings);
  LivestockApp.runtime.view = original.view;
  LivestockApp.runtime.session = original.session;
  LivestockApp.runtime.lastMockResult = original.lastMockResult;
  LivestockApp.render();
  return { pilotCount: pilot.length, beforeCases, afterCases, explicit, failures };
}"""


def run_production_matrix(browser, current_build_id: str) -> dict[str, object]:
    with http_server(DIST) as base_url:
        context = browser.new_context(viewport={'width': 360, 'height': 800}, device_scale_factor=1)
        page = context.new_page()
        page.set_default_timeout(20_000)
        page_errors: list[str] = []
        console_errors: list[str] = []
        page.on('pageerror', lambda error: page_errors.append(str(error)))
        page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
        response = page.goto(f'{base_url}/', wait_until='domcontentloaded')
        assert response and response.ok, 'current index.html did not load over HTTP'
        wait_for_boot(page, current_build_id)
        resource_urls = page.evaluate("() => performance.getEntriesByType('resource').map((entry) => entry.name)")
        assert any(url.endswith(f'/app.js?v={current_build_id}') for url in resource_urls), 'external versioned app.js was not loaded'
        assert any(url.endswith(f'/styles.css?v={current_build_id}') for url in resource_urls), 'external versioned styles.css was not loaded'
        assert page.evaluate("() => Boolean(document.querySelector('#app .brand') && LivestockApp.runtime?.state)"), 'deferred boot did not complete'

        matrix = page.evaluate(PRODUCTION_MATRIX_SCRIPT)
        if matrix['failures']:
            print(json.dumps(matrix['failures'], ensure_ascii=False, indent=2), flush=True)
        assert matrix['pilotCount'] == 16
        assert matrix['beforeCases'] == 64
        assert matrix['afterCases'] == 64
        assert all(matrix['explicit'].values())
        assert not matrix['failures'], 'HTTP production 64 + 64 matrix failed'
        assert not page_errors, f'production matrix page errors: {page_errors}'
        assert not console_errors, f'production matrix console errors: {console_errors}'
        context.close()
        return {
            'pilotCount': matrix['pilotCount'],
            'beforeCases': matrix['beforeCases'],
            'afterCases': matrix['afterCases'],
            'explicitRegressionIds': matrix['explicit'],
            'externalApp': True,
            'deferredBoot': True,
            'viewport': '360x800',
            'pageErrors': 0,
            'consoleErrors': 0,
        }


def seed_upgrade_state(page: Page, label: str) -> dict[str, object]:
    return page.evaluate(
        """async (label) => {
          Object.assign(LivestockApp.runtime.state.settings, {
            uiLanguage: 'id', studySupportMode: 'guided', preferredSupportLevel: 2,
            showVocabulary: true, showQuestionPattern: true,
          });
          const historyQuestion = LivestockApp.questionById('q045');
          const entry = LivestockApp.recordAnswer(LivestockApp.runtime.state, historyQuestion, {
            sessionId: `upgrade-history-${label}`, sessionKind: 'daily',
            selectedChoiceId: historyQuestion.correctChoiceId, elapsedMs: 1200,
            usedEasyJapanese: false, usedIndonesian: false, usedFurigana: true,
            openedKeywords: true, openedQuestionTranslation: false,
            openedChoiceTranslations: false, openedAnswerIndonesian: false,
            supportLevel: 2, reason: null, confidence: 'sure',
          });
          const question = LivestockApp.questionById('q055');
          const policy = LivestockApp.supportPolicyForLevel(2);
          LivestockApp.runtime.view = 'study';
          LivestockApp.runtime.lastMockResult = null;
          LivestockApp.runtime.session = {
            id: `upgrade-session-${label}`, kind: 'daily', questionIds: ['q045', 'q055'], index: 1,
            selectedChoiceId: question.choices[1].id, answered: false,
            startedQuestionAt: performance.now(), supportLevel: 2,
            furiganaVisible: policy.showFuriganaInitially,
            easyJapaneseVisible: policy.showEasyJapaneseInitially,
            indonesianVisible: policy.showQuestionTranslationInitially,
            keywordsVisible: policy.showKeywordsInitially,
            choiceTranslationsVisible: policy.showChoiceTranslationsInitially,
            answerIndonesianVisible: false,
            supportUsage: {
              furiganaUsed: true, easyJapaneseUsed: false, keywordsOpened: true,
              questionTranslationOpened: false, choiceTranslationsOpened: false,
              answerIndonesianOpened: false,
            },
            retryOfHistoryId: null, isRetryWithoutSupport: false,
            confidence: null, pendingReason: null, completed: false,
          };
          LivestockApp.render();
          if (typeof LivestockApp.persist === 'function') await LivestockApp.persist();
          else await LivestockApp.saveState(LivestockApp.runtime.state);
          return {
            historyId: entry.id,
            historyCount: LivestockApp.runtime.state.history.length,
            revision: LivestockApp.runtime.state.revision,
            settings: {
              uiLanguage: LivestockApp.runtime.state.settings.uiLanguage,
              studySupportMode: LivestockApp.runtime.state.settings.studySupportMode,
              preferredSupportLevel: LivestockApp.runtime.state.settings.preferredSupportLevel,
            },
            session: {
              id: LivestockApp.runtime.session.id,
              index: LivestockApp.runtime.session.index,
              selectedChoiceId: LivestockApp.runtime.session.selectedChoiceId,
              answered: LivestockApp.runtime.session.answered,
              supportLevel: LivestockApp.runtime.session.supportLevel,
            },
          };
        }""",
        label,
    )


def current_upgrade_snapshot(page: Page) -> dict[str, object]:
    return page.evaluate(
        """() => ({
          session: LivestockApp.runtime.session ? {
            id: LivestockApp.runtime.session.id,
            index: LivestockApp.runtime.session.index,
            selectedChoiceId: LivestockApp.runtime.session.selectedChoiceId,
            answered: LivestockApp.runtime.session.answered,
            supportLevel: LivestockApp.runtime.session.supportLevel,
          } : null,
          sentinel: window.__upgradePageSentinel,
          buildId: document.querySelector('meta[name="app-build-id"]')?.content,
          url: location.href,
        })""",
    )


def restore_upgrade_session(page: Page, seeded: dict[str, object], label: str) -> dict[str, object]:
    return page.evaluate(
        """({seeded, label}) => {
          const historyPresent = LivestockApp.runtime.state.history.some((entry) => entry.id === seeded.historyId);
          const settings = {
            uiLanguage: LivestockApp.runtime.state.settings.uiLanguage,
            studySupportMode: LivestockApp.runtime.state.settings.studySupportMode,
            preferredSupportLevel: LivestockApp.runtime.state.settings.preferredSupportLevel,
          };
          if (!historyPresent || JSON.stringify(settings) !== JSON.stringify(seeded.settings)) {
            throw new Error('old state was not restored by the current app before the SW update');
          }
          const question = LivestockApp.questionById('q055');
          const policy = LivestockApp.supportPolicyForLevel(2);
          LivestockApp.runtime.view = 'study';
          LivestockApp.runtime.lastMockResult = null;
          LivestockApp.runtime.session = {
            id: `upgrade-current-session-${label}`, kind: 'daily',
            questionIds: ['q045', 'q055'], index: 1,
            selectedChoiceId: question.choices[1].id, answered: false,
            startedQuestionAt: performance.now(), supportLevel: 2,
            furiganaVisible: policy.showFuriganaInitially,
            easyJapaneseVisible: policy.showEasyJapaneseInitially,
            indonesianVisible: policy.showQuestionTranslationInitially,
            keywordsVisible: policy.showKeywordsInitially,
            choiceTranslationsVisible: policy.showChoiceTranslationsInitially,
            answerIndonesianVisible: false,
            supportUsage: {
              furiganaUsed: true, easyJapaneseUsed: false, keywordsOpened: true,
              questionTranslationOpened: false, choiceTranslationsOpened: false,
              answerIndonesianOpened: false,
            },
            retryOfHistoryId: null, isRetryWithoutSupport: false,
            confidence: null, pendingReason: null, completed: false,
          };
          LivestockApp.render();
          return {
            historyId: seeded.historyId,
            historyCount: LivestockApp.runtime.state.history.length,
            revision: LivestockApp.runtime.state.revision,
            settings,
            session: {
              id: LivestockApp.runtime.session.id,
              index: LivestockApp.runtime.session.index,
              selectedChoiceId: LivestockApp.runtime.session.selectedChoiceId,
              answered: LivestockApp.runtime.session.answered,
              supportLevel: LivestockApp.runtime.session.supportLevel,
            },
          };
        }""",
        {'seeded': seeded, 'label': label},
    )


def seed_foreign_collision(page: Page, cache_name: str, build_id: str) -> None:
    page.evaluate(
        """async ({cacheName, buildId}) => {
          const cache = await caches.open(cacheName);
          await cache.put('/foreign-marker', new Response('foreign-marker'));
          await cache.put('/index.html', new Response(
            '<!doctype html><html><body data-foreign-index="true">FOREIGN INDEX</body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          ));
          await cache.put(`/app.js?v=${buildId}`, new Response(
            'window.__FOREIGN_CACHE_SCRIPT_EXECUTED__ = true; document.body.dataset.foreignScript = "true";',
            { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } },
          ));
          await cache.put(`/styles.css?v=${buildId}`, new Response(
            ':root { --foreign-cache-collision: yes; }',
            { headers: { 'Content-Type': 'text/css; charset=utf-8' } },
          ));
        }""",
        {'cacheName': cache_name, 'buildId': build_id},
    )


def run_upgrade_path(browser, old_head: str, current_build_id: str, current_cache: str) -> dict[str, object]:
    with actual_build_at(old_head) as old_dist:
        old_build_id = optional_build_id(old_dist)
        old_cache = parse_cache_name(old_dist)
        if old_cache == current_cache:
            raise AssertionError(f'{old_head} and current builds unexpectedly share one cache name.')
        with http_server(old_dist) as base_url:
            context = browser.new_context(viewport={'width': 360, 'height': 800}, device_scale_factor=1)
            page = context.new_page()
            page.set_default_timeout(25_000)
            page_errors: list[str] = []
            console_errors: list[str] = []
            navigations: list[str] = []
            page.on('pageerror', lambda error: page_errors.append(str(error)))
            page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
            page.on('framenavigated', lambda frame: navigations.append(frame.url) if frame == page.main_frame else None)

            response = page.goto(f'{base_url}/', wait_until='domcontentloaded')
            assert response and response.ok, f'{old_head} index did not load'
            wait_for_boot(page, old_build_id)
            wait_for_controlled_worker(page, old_cache)

            # Persist settings/history with the exact old app and active old SW.
            page.reload(wait_until='domcontentloaded')
            wait_for_boot(page, old_build_id)
            wait_for_controlled_worker(page, old_cache)
            old_seeded = seed_upgrade_state(page, old_head[:7])

            # The historical apps predate update notifications. Load the current
            # app shell through the still-active old worker while serving the old
            # sw.js bytes. This exercises old-state migration and lets the current
            # app attach its update listener before the real new SW is exposed.
            ServerState.root = DIST
            ServerState.sw_root = old_dist
            page.goto(f'{base_url}/?transition={current_build_id}', wait_until='domcontentloaded')
            wait_for_boot(page, current_build_id)
            wait_for_controlled_worker(page, old_cache)
            seeded = restore_upgrade_session(page, old_seeded, old_head[:7])
            page.evaluate('window.__upgradePageSentinel = crypto.randomUUID()')
            before_notice = current_upgrade_snapshot(page)
            navigation_count_before = len(navigations)

            foreign_cache = f'{FOREIGN_CACHE_PREFIX}-{old_head[:7]}'
            seed_foreign_collision(page, foreign_cache, current_build_id)
            ServerState.sw_root = DIST
            response = context.request.get(f'{base_url}/index.html?build={current_build_id}')
            assert response.ok and f'content="{current_build_id}"' in response.text()

            page.evaluate(
                """async () => {
                  const registration = await navigator.serviceWorker.getRegistration();
                  if (!registration) throw new Error('service worker registration is missing');
                  await registration.update();
                }""",
            )
            page.wait_for_function("() => LivestockApp.runtime.notice?.includes('更新できます') === true")
            page.wait_for_function(
                """async ({oldCache, currentCache, foreignCache}) => {
                  const names = await caches.keys();
                  return !names.includes(oldCache) && names.includes(currentCache) && names.includes(foreignCache);
                }""",
                arg={'oldCache': old_cache, 'currentCache': current_cache, 'foreignCache': foreign_cache},
            )
            after_notice = current_upgrade_snapshot(page)
            assert after_notice['session'] == before_notice['session'], 'update notice changed the in-progress session'
            assert after_notice['sentinel'] == before_notice['sentinel'], 'update notice replaced the page realm'
            assert after_notice['buildId'] == current_build_id, 'update notice replaced the current app shell'
            assert after_notice['url'] == before_notice['url'], 'update notice changed the URL'
            assert len(navigations) == navigation_count_before, 'update notice caused an automatic navigation/reload'

            page.reload(wait_until='domcontentloaded')
            page.wait_for_function(
                """() => window.__FOREIGN_CACHE_SCRIPT_EXECUTED__ === true
                  || Boolean(document.querySelector('#app .brand'))
                  || Boolean(document.querySelector('[data-foreign-index]'))""",
            )
            assert not page.evaluate('() => Boolean(window.__FOREIGN_CACHE_SCRIPT_EXECUTED__)'), 'foreign app.js was executed'
            assert page.locator('[data-foreign-index]').count() == 0, 'foreign index.html was used online'
            wait_for_boot(page, current_build_id)
            assert page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--foreign-cache-collision').trim()") == '', 'foreign styles.css was used'
            restored = page.evaluate(
                """(expected) => ({
                  historyPresent: LivestockApp.runtime.state.history.some((entry) => entry.id === expected.historyId),
                  historyCount: LivestockApp.runtime.state.history.length,
                  settings: {
                    uiLanguage: LivestockApp.runtime.state.settings.uiLanguage,
                    studySupportMode: LivestockApp.runtime.state.settings.studySupportMode,
                    preferredSupportLevel: LivestockApp.runtime.state.settings.preferredSupportLevel,
                  },
                })""",
                seeded,
            )
            assert restored['historyPresent'] and restored['historyCount'] >= seeded['historyCount']
            assert restored['settings'] == seeded['settings']

            explicit_results = {}
            for question_id in EXPLICIT_REGRESSION_IDS:
                result = render_level_three_question(page, question_id)
                explicit_results[question_id] = result
                assert result == {
                    'easyChoiceCount': 0,
                    'questionEasyCount': 1,
                    'choiceIndonesianCount': 4,
                    'overflow': False,
                }, f'{question_id} support boundary failed after {old_head[:7]} upgrade: {result}'

            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function(
                """() => Boolean(document.querySelector('#app .brand'))
                  || Boolean(document.querySelector('[data-foreign-index]'))""",
            )
            assert page.locator('[data-foreign-index]').count() == 0, 'foreign index.html was used offline'
            wait_for_boot(page, current_build_id)
            assert not page.evaluate('() => Boolean(window.__FOREIGN_CACHE_SCRIPT_EXECUTED__)')
            assert page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--foreign-cache-collision').trim()") == ''
            offline_explicit_results = {}
            for question_id in EXPLICIT_REGRESSION_IDS:
                result = render_level_three_question(page, question_id)
                offline_explicit_results[question_id] = result
                assert result['easyChoiceCount'] == 0 and not result['overflow'], (
                    f'{question_id} regressed after offline {old_head[:7]} upgrade: {result}'
                )
            cache_names = page.evaluate('() => caches.keys()')
            assert current_cache in cache_names and old_cache not in cache_names and foreign_cache in cache_names
            context.set_offline(False)

            assert not page_errors, f'{old_head[:7]} upgrade page errors: {page_errors}'
            assert not console_errors, f'{old_head[:7]} upgrade console errors: {console_errors}'
            context.close()
            return {
                'oldHead': old_head,
                'oldBuildId': old_build_id or 'unversioned',
                'oldCache': old_cache,
                'newBuildId': current_build_id,
                'newCache': current_cache,
                'noticeWithoutAutoReload': True,
                'sessionUnchangedBeforeManualReload': True,
                'settingsAndHistoryRestored': True,
                'foreignCollisionRejected': True,
                'foreignCacheRetained': True,
                'offlineReload': True,
                'explicitRegressionIds': explicit_results,
                'offlineExplicitRegressionIds': offline_explicit_results,
                'pageErrors': 0,
                'consoleErrors': 0,
            }


def run_sw_only_failure(browser, current_build_id: str, current_cache: str) -> dict[str, object]:
    with service_worker_only_build() as variant_dist:
        variant_build_id = parse_build_id(variant_dist)
        variant_cache = parse_cache_name(variant_dist)
        assert variant_build_id != current_build_id
        assert variant_cache != current_cache
        with http_server(DIST) as base_url:
            context = browser.new_context(viewport={'width': 360, 'height': 800}, device_scale_factor=1)
            page = context.new_page()
            page.set_default_timeout(25_000)
            response = page.goto(f'{base_url}/', wait_until='domcontentloaded')
            assert response and response.ok
            wait_for_boot(page, current_build_id)
            wait_for_controlled_worker(page, current_cache)
            page.reload(wait_until='domcontentloaded')
            wait_for_boot(page, current_build_id)
            wait_for_controlled_worker(page, current_cache)

            foreign_cache = f'{FOREIGN_CACHE_PREFIX}-sw-failure'
            page.evaluate(
                """async (name) => {
                  const cache = await caches.open(name);
                  await cache.put('/foreign-marker', new Response('foreign'));
                  const registration = await navigator.serviceWorker.getRegistration();
                  window.__rollbackActiveWorker = registration.active;
                  window.__rollbackController = navigator.serviceWorker.controller;
                  window.__failedWorkerState = null;
                }""",
                foreign_cache,
            )

            ServerState.root = variant_dist
            ServerState.sw_root = variant_dist
            ServerState.fail_paths = {'/styles.css'}
            page.evaluate(
                """async () => {
                  const registration = await navigator.serviceWorker.getRegistration();
                  const watch = () => {
                    const worker = registration.installing;
                    if (!worker) return;
                    window.__failedWorkerState = worker.state;
                    worker.addEventListener('statechange', () => {
                      window.__failedWorkerState = worker.state;
                    });
                  };
                  registration.addEventListener('updatefound', watch);
                  watch();
                  try { await registration.update(); } catch (error) {
                    window.__failedWorkerUpdateError = String(error);
                  }
                }""",
            )
            page.wait_for_function("() => window.__failedWorkerState === 'redundant'")
            rollback = page.evaluate(
                """async ({currentCache, variantCache, foreignCache}) => {
                  const registration = await navigator.serviceWorker.getRegistration();
                  const names = await caches.keys();
                  const cachedIndex = await (await caches.open(currentCache)).match('./index.html');
                  const cachedIndexText = cachedIndex ? await cachedIndex.text() : '';
                  return {
                    activeWorkerUnchanged: registration.active === window.__rollbackActiveWorker,
                    controllerUnchanged: navigator.serviceWorker.controller === window.__rollbackController,
                    currentCachePresent: names.includes(currentCache),
                    variantCacheAbsent: !names.includes(variantCache),
                    foreignCachePresent: names.includes(foreignCache),
                    cachedIndexBuildId: cachedIndexText.match(/app-build-id" content="([a-f0-9]{16})/)?.[1] ?? null,
                  };
                }""",
                {'currentCache': current_cache, 'variantCache': variant_cache, 'foreignCache': foreign_cache},
            )
            assert all(value for key, value in rollback.items() if key != 'cachedIndexBuildId'), f'SW-only install failure did not roll back safely: {rollback}'
            assert rollback['cachedIndexBuildId'] == current_build_id, f'old cache index changed during failed install: {rollback}'

            ServerState.fail_paths = set()
            ServerState.root = DIST
            ServerState.sw_root = DIST
            context.set_offline(True)
            offline_response = page.reload(wait_until='domcontentloaded')
            assert offline_response and offline_response.from_service_worker, 'offline navigation did not come from the old active worker'
            assert page.evaluate('() => navigator.onLine === false'), 'browser context was not offline'
            wait_for_boot(page)
            offline_build_id = page.evaluate("() => document.querySelector('meta[name=\"app-build-id\"]')?.content")
            assert offline_build_id == current_build_id, f'offline reload used {offline_build_id}, expected {current_build_id}'
            cache_names = page.evaluate('() => caches.keys()')
            assert current_cache in cache_names and variant_cache not in cache_names and foreign_cache in cache_names
            context.set_offline(False)
            context.close()
            return {
                'currentBuildId': current_build_id,
                'swOnlyBuildId': variant_build_id,
                'currentCache': current_cache,
                'failedInstallCache': variant_cache,
                'failedWorkerState': 'redundant',
                'oldActiveWorkerRetained': True,
                'oldOwnedCacheRetained': True,
                'failedNewCacheRemoved': True,
                'foreignCacheRetained': True,
                'offlineReload': True,
            }


def main() -> None:
    if not (DIST / 'index.html').is_file() or not (DIST / 'sw.js').is_file():
        raise RuntimeError('dist is missing; run npm run build before the HTTP E2E suite.')
    current_build_id = parse_build_id(DIST)
    current_cache = parse_cache_name(DIST)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**browser_launch_options())
        try:
            production_matrix = run_production_matrix(browser, current_build_id)
            upgrades = [run_upgrade_path(browser, head, current_build_id, current_cache) for head in OLD_HEADS]
            sw_only_failure = run_sw_only_failure(browser, current_build_id, current_cache)
        finally:
            browser.close()

    print(json.dumps({
        'overall': 'PASS',
        'url': 'http://127.0.0.1:<ephemeral-port>',
        'newBuildId': current_build_id,
        'newCache': current_cache,
        'productionMatrix': production_matrix,
        'upgradePaths': upgrades,
        'serviceWorkerOnlyFailure': sw_only_failure,
        'checks': [
            'normal_dist_external_app_deferred_boot_and_runtime',
            'http_production_pilot_16_by_level_before_64_after_64',
            'choice_easy_ja_and_answer_leak_boundaries',
            'all_correct_and_wrong_rationales',
            'a6533c3_to_current_same_origin_upgrade',
            'fd1f892_to_current_same_origin_upgrade',
            'update_notice_no_auto_reload_or_session_mutation',
            'settings_history_and_offline_reload_retained',
            'foreign_index_versioned_js_css_collision_rejected',
            'service_worker_only_build_id_changes',
            'failed_service_worker_install_preserves_old_offline_cache',
            'no_page_or_console_errors_in_success_paths',
            'no_360px_horizontal_overflow',
        ],
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
