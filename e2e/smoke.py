from __future__ import annotations

import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = (ROOT / 'dist' / 'standalone-review.html').read_text(encoding='utf-8')
SHOTS = ROOT / 'reports' / 'screenshots'
SHOTS.mkdir(parents=True, exist_ok=True)


def check(condition: bool, name: str, checks: dict[str, bool]) -> None:
    checks[name] = bool(condition)


with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path='/usr/bin/chromium',
        args=['--no-sandbox', '--disable-dev-shm-usage'],
    )
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
    page_errors: list[str] = []
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    page.on('console', lambda message: page_errors.append(f'console:{message.text}') if message.type == 'error' else None)
    page.evaluate("""() => {
      const memory = new Map();
      try { delete window.indexedDB; } catch (_) {}
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: (key) => memory.get(key) ?? null,
          setItem: (key, value) => memory.set(key, String(value)),
          removeItem: (key) => memory.delete(key),
          clear: () => memory.clear(),
        },
      });
    }""")
    page.set_content(HTML, wait_until='load')
    page.wait_for_timeout(500)

    checks: dict[str, bool] = {}
    body = page.locator('body').inner_text()
    check('Mulai 10 soal hari ini' in body and 'Belum ada soal berstatus approved' in body, 'home_render_indonesian', checks)
    check(page.locator('[data-ui-language]').count() == 2 and page.evaluate("document.documentElement.lang === 'id'"), 'language_switcher_default', checks)
    check(page.locator('[data-category]').count() == 9, 'category_navigation', checks)
    tap_heights = page.evaluate("""() => [...document.querySelectorAll('button')].filter((el) => el.offsetParent !== null).slice(0, 25).map((el) => el.getBoundingClientRect().height)""")
    check(bool(tap_heights) and min(tap_heights) >= 40, 'mobile_tap_targets', checks)
    check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'mobile_no_horizontal_overflow', checks)
    page.screenshot(path=str(SHOTS / 'alpha-home-mobile.png'), full_page=True)

    page.locator('[data-ui-language="ja"]').click()
    page.wait_for_timeout(150)
    check('今日の10問を始める' in page.locator('body').inner_text() and page.evaluate("document.documentElement.lang === 'ja'"), 'language_switch_to_japanese', checks)
    page.wait_for_timeout(150)
    check(page.evaluate("JSON.parse(localStorage.getItem('livestock2-state-v0.4')).settings.uiLanguage === 'ja'"), 'language_selection_persisted', checks)

    page.locator('[data-start="daily"]').first.click()
    page.wait_for_timeout(150)
    body = page.locator('body').inner_text()
    check('問題 1 / 10' in body and page.locator('[data-choice]').count() == 4, 'daily_session', checks)
    page.screenshot(path=str(SHOTS / 'alpha-study-mobile.png'), full_page=True)

    wrong_choice = page.evaluate("""() => {
      const session = LivestockApp.runtime.session;
      const question = LivestockApp.questionById(session.questionIds[session.index]);
      return question.choices.find((choice) => choice.id !== question.correctChoiceId).id;
    }""")
    page.locator(f'[data-choice="{wrong_choice}"]').click()
    page.locator('[data-confidence="unsure"]').click()
    page.locator('[data-answer]').click()
    page.wait_for_timeout(100)
    body = page.locator('body').inner_text()
    check('不正解' in body and '根拠' in body and 'なぜ間違えましたか？' in body, 'answer_and_explanation', checks)
    page.locator('[data-reason="knowledge"]').click()
    check(page.locator('[data-next]').is_enabled(), 'error_reason_gate', checks)

    page.evaluate("""() => {
      LivestockApp.runtime.session = {
        id: 'visual-test', kind: 'all', questionIds: ['q058'], index: 0,
        selectedChoiceId: null, answered: false, startedQuestionAt: performance.now(),
        easyJapaneseVisible: true, indonesianVisible: true, furiganaVisible: true,
        confidence: null, pendingReason: null, completed: false
      };
      LivestockApp.runtime.view = 'study';
      LivestockApp.render();
    }""")
    page.wait_for_timeout(100)
    check(page.locator('.question-visual img').count() == 1, 'original_visual_asset', checks)
    page.screenshot(path=str(SHOTS / 'alpha-visual-mobile.png'), full_page=True)

    page.locator('[data-view="manager"]').click()
    page.wait_for_timeout(100)
    body = page.locator('body').inner_text()
    check('会社管理者ダッシュボード' in body and '日本語原因の誤答' in body and '分野別累計' in body, 'manager_dashboard', checks)
    page.screenshot(path=str(SHOTS / 'alpha-manager-mobile.png'), full_page=True)

    page.locator('[data-view="review"]').click()
    page.wait_for_timeout(100)
    body = page.locator('body').inner_text()
    check('80問レビュー' in body and 'approved化ではありません' in body, 'review_screen', checks)
    page.locator('[data-review-set$="|承認候補"]').first.click()
    page.wait_for_timeout(100)
    check('承認候補 1' in page.locator('body').inner_text(), 'review_state', checks)
    page.screenshot(path=str(SHOTS / 'alpha-review-mobile.png'), full_page=True)

    page.locator('[data-view="glossary"]').click()
    page.wait_for_timeout(100)
    page.locator('[data-glossary-search]').fill('分娩')
    page.wait_for_timeout(150)
    body = page.locator('body').inner_text()
    check('日本語専門用語' in body and '分娩' in body and page.locator('.glossary-row').count() >= 1, 'glossary_search', checks)

    page.locator('[data-view="home"]').last.click()
    page.locator('[data-start="mock"]').first.click()
    page.wait_for_timeout(100)
    body = page.locator('body').inner_text()
    check('問題 1 / 50' in body and '問題一覧' in body and page.locator('[data-mock-timer]').count() == 1, 'mock_50_60', checks)
    page.locator('[data-mock-choice]').first.click()
    page.locator('[data-mock-next]').click()
    check('問題 2 / 50' in page.locator('body').inner_text(), 'mock_navigation', checks)

    page.set_viewport_size({'width': 1280, 'height': 900})
    page.evaluate("""() => {
      LivestockApp.runtime.state.mockDraft = null;
      LivestockApp.runtime.lastMockResult = null;
      LivestockApp.runtime.session = null;
      LivestockApp.runtime.view = 'home';
      LivestockApp.render();
    }""")
    page.wait_for_timeout(100)
    check('毎日10問' in page.locator('body').inner_text(), 'desktop_render', checks)
    check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'desktop_no_horizontal_overflow', checks)
    page.screenshot(path=str(SHOTS / 'alpha-home-desktop.png'), full_page=True)

    check(not page_errors, 'no_runtime_errors', checks)
    browser.close()

failed = [name for name, passed in checks.items() if not passed]
report = {
    'overall': 'PASS' if not failed else 'FAIL',
    'method': 'Playwright Chromium using set_content against the standalone review build; local URL navigation is blocked by the execution environment administrator.',
    'viewportMobile': '390x844',
    'viewportDesktop': '1280x900',
    'checks': checks,
    'failed': failed,
    'pageErrors': page_errors,
    'screenshots': sorted(path.name for path in SHOTS.glob('alpha-*.png')),
}
(ROOT / 'reports' / 'E2E_REPORT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
sys.exit(1 if failed else 0)
