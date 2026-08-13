from __future__ import annotations

import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = (ROOT / 'dist' / 'standalone-review.html').read_text(encoding='utf-8')
REPORT = ROOT / 'reports' / 'PEDAGOGY_E2E_REPORT.json'
SCREENSHOT = ROOT / 'reports' / 'screenshots' / 'pedagogy-guided-mobile.png'
SCREENSHOT.parent.mkdir(parents=True, exist_ok=True)


def record(checks: dict[str, bool], name: str, value: bool) -> None:
    checks[name] = bool(value)


checks: dict[str, bool] = {}
page_errors: list[str] = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
    page.set_default_timeout(5_000)
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

    body = page.locator('body').inner_text()
    record(checks, 'indonesian_default', 'Mulai 10 soal hari ini' in body)
    record(checks, 'learning_flow_visible', 'Pahami bahasa Jepang' in body and 'Cara belajar' in body)
    record(checks, 'language_persisted_default', page.evaluate("LivestockApp.runtime.state.settings.studySupportMode === 'guided'"))

    page.evaluate("document.querySelector('[data-start=\"daily\"]')?.click()")
    page.wait_for_timeout(250)
    body = page.locator('body').inner_text()
    record(checks, 'guided_lesson_sections', all(text in body for text in [
        'Baca soal bahasa Jepang',
        'Pahami arti soal',
        'Kosakata penting',
    ]))
    record(checks, 'full_furigana', page.locator('.guided-lesson-card ruby rt').count() >= 1)
    record(checks, 'indonesian_question_meaning', page.locator('.support-box.id[lang="id"], .support-box.id').count() >= 1)
    record(checks, 'question_vocabulary', page.locator('.vocabulary-card').count() >= 1)
    record(checks, 'four_bilingual_choices', page.locator('[data-choice] .choice-support.id').count() == 4)
    page.screenshot(path=str(SCREENSHOT), full_page=False)

    page.evaluate("document.querySelector('[data-choice]')?.click()")
    page.evaluate("document.querySelector('[data-confidence=\"unsure\"]')?.click()")
    page.evaluate("document.querySelector('[data-answer]')?.click()")
    page.wait_for_timeout(250)
    body = page.locator('body').inner_text()
    record(checks, 'bilingual_answer_explanation', 'Mengapa jawaban ini benar?' in body and 'Penjelasan' in body)
    record(checks, 'choice_by_choice_review', page.locator('.choice-review-item').count() == 4)
    record(checks, 'memory_point', 'Poin yang perlu diingat' in body)
    record(checks, 'source_citation', 'Sumber' in body and 'PDF' in body)
    record(checks, 'no_runtime_errors', not page_errors)

    browser.close()

failed = [name for name, passed in checks.items() if not passed]
report = {
    'overall': 'PASS' if not failed else 'FAIL',
    'viewport': '390x844',
    'checks': checks,
    'failed': failed,
    'pageErrors': page_errors,
    'screenshot': SCREENSHOT.name,
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
sys.exit(1 if failed else 0)
