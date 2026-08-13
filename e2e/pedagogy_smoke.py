from __future__ import annotations

import json
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = (ROOT / 'dist' / 'standalone-review.html').read_text(encoding='utf-8')
REPORT = ROOT / 'reports' / 'PEDAGOGY_E2E_REPORT.json'
SHOTS = ROOT / 'reports' / 'screenshots' / 'pedagogy-pilot'
SHOTS.mkdir(parents=True, exist_ok=True)


def record(checks: dict[str, bool], name: str, value: bool) -> None:
    checks[name] = bool(value)


def fits_mobile_width(page, selectors: list[str]) -> bool:
    return bool(page.evaluate("""(selectors) => {
      const tolerance = 1;
      const viewportWidth = window.innerWidth;
      const groups = selectors.map((selector) => [...document.querySelectorAll(selector)]);
      if (groups.some((group) => group.length === 0)) return false;
      const cardsFit = groups.flat().every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= -tolerance
          && rect.right <= viewportWidth + tolerance
          && rect.width <= viewportWidth + tolerance
          && element.scrollWidth <= element.clientWidth + tolerance;
      });
      return document.documentElement.scrollWidth <= viewportWidth + tolerance && cardsFit;
    }""", selectors))


checks: dict[str, bool] = {}
page_errors: list[str] = []

with sync_playwright() as p:
    launch_options = {
        'headless': True,
        'args': ['--no-sandbox', '--disable-dev-shm-usage'],
        'timeout': 15_000,
    }
    system_chromium = pathlib.Path('/usr/bin/chromium')
    if system_chromium.exists():
        launch_options['executable_path'] = str(system_chromium)
    else:
        local_app_data = pathlib.Path(os.environ.get('LOCALAPPDATA', ''))
        windows_headless_shells = sorted(
            local_app_data.glob('ms-playwright/chromium_headless_shell-*/chrome-win/headless_shell.exe'),
            reverse=True,
        )
        if windows_headless_shells:
            launch_options['executable_path'] = str(windows_headless_shells[0])
    browser = p.chromium.launch(**launch_options)
    page = browser.new_page(viewport={'width': 360, 'height': 800}, device_scale_factor=1)
    page.set_default_timeout(3_000)
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
    page.set_content(HTML, wait_until='domcontentloaded', timeout=15_000)
    page.wait_for_timeout(300)
    print('E2E pedagogy: home', flush=True)

    body = page.locator('body').inner_text()
    record(checks, 'indonesian_ui_default', 'Mulai 10 soal hari ini' in body)
    record(checks, 'learning_flow_visible', 'Pahami bahasa Jepang' in body and 'Cara belajar' in body)

    # Level 2 starts with furigana, terminology, and intent. Full-question and
    # choice translations are available but remain closed until the learner asks.
    page.evaluate("""() => {
      Object.assign(LivestockApp.runtime.state.settings, {
        studySupportMode: 'adaptive', automaticSupport: false, preferredSupportLevel: 2,
      });
    }""")
    page.evaluate("document.querySelector('[data-start=\"daily\"]')?.click()")
    page.evaluate("""() => {
      LivestockApp.runtime.session.questionIds[0] = 'q033';
      LivestockApp.render();
    }""")

    # UI copy follows the saved display language independently from the
    # learning-support level and its Indonesian teaching-content visibility.
    expected_controls = {
        'ja': {
            0: [],
            1: ['ふりがな ON', '重要語 ON'],
            2: ['ふりがな ON', '重要語 ON', '問題の全文訳 OFF', '選択肢の翻訳 OFF'],
            3: ['ふりがな ON', 'やさしい日本語 ON', '重要語 ON', '問題の全文訳 ON', '選択肢の翻訳 ON'],
        },
        'id': {
            0: [],
            1: ['Furigana AKTIF', 'Kosakata penting AKTIF'],
            2: ['Furigana AKTIF', 'Kosakata penting AKTIF', 'Terjemahan lengkap soal NONAKTIF', 'Terjemahan pilihan jawaban NONAKTIF'],
            3: ['Furigana AKTIF', 'Bahasa Jepang sederhana AKTIF', 'Kosakata penting AKTIF', 'Terjemahan lengkap soal AKTIF', 'Terjemahan pilihan jawaban AKTIF'],
        },
    }
    expected_answer = {'ja': '回答する', 'id': 'Jawab'}
    expected_confidence = {'ja': '分かる', 'id': 'Yakin'}
    for language in ('ja', 'id'):
        for level in range(4):
            page.evaluate("""({language, level}) => {
              const session = LivestockApp.runtime.session;
              Object.assign(LivestockApp.runtime.state.settings, {
                uiLanguage: language,
                showVocabulary: true,
                showQuestionPattern: true,
              });
              Object.assign(session, {
                answered: false,
                selectedChoiceId: null,
                confidence: null,
                supportLevel: level,
                furiganaVisible: level > 0,
                easyJapaneseVisible: level === 3,
                indonesianVisible: level === 3,
                keywordsVisible: level > 0,
                choiceTranslationsVisible: level === 3,
                answerIndonesianVisible: false,
                isRetryWithoutSupport: false,
                retryOfHistoryId: null,
              });
              LivestockApp.render();
            }""", {'language': language, 'level': level})
            operation_languages = page.locator('.question-card [data-ui-control]').evaluate_all(
                """(elements) => elements.map((element) => element.dataset.uiControlLanguage)""",
            )
            record(
                checks,
                f'level{level}_{language}_operation_labels',
                page.locator('[data-answer]').inner_text() == expected_answer[language]
                and page.locator('[data-confidence="sure"]').inner_text() == expected_confidence[language]
                and page.locator('.support-toggle').all_inner_texts() == expected_controls[language][level]
                and bool(operation_languages)
                and all(value == language for value in operation_languages)
                and page.locator('.question-card[data-no-ui-translation="true"] .question-text[lang="ja"]').count() == 1,
            )

    # Restore the Level 2 / Indonesian-UI state used by the detailed flow below.
    page.evaluate("""() => {
      const session = LivestockApp.runtime.session;
      Object.assign(LivestockApp.runtime.state.settings, { uiLanguage: 'id' });
      Object.assign(session, {
        answered: false,
        selectedChoiceId: null,
        confidence: null,
        supportLevel: 2,
        furiganaVisible: true,
        easyJapaneseVisible: false,
        indonesianVisible: false,
        keywordsVisible: true,
        choiceTranslationsVisible: false,
        answerIndonesianVisible: false,
        isRetryWithoutSupport: false,
        retryOfHistoryId: null,
      });
      LivestockApp.render();
    }""")
    page.wait_for_timeout(150)
    print('E2E pedagogy: level2 rendered', flush=True)
    record(checks, 'level2_recorded', page.evaluate('LivestockApp.runtime.session.supportLevel === 2'))
    record(checks, 'level2_furigana', page.locator('.guided-lesson-card ruby rt').count() > 0)
    record(checks, 'level2_keywords_and_intent', page.locator('[data-learning-component="keyword-glossary"]').count() == 1 and page.locator('[data-learning-component="question-intent"]').count() == 1)
    record(checks, 'level2_intent_indonesian_independent', page.locator('[data-learning-component="question-intent"] [lang="id"]').count() >= 2)
    record(checks, 'level2_keyword_indonesian_independent', page.locator('[data-learning-component="keyword-glossary"] .vocabulary-card > strong[lang="id"]').count() >= 1)
    record(checks, 'level2_translations_closed', page.locator('[data-learning-component="indonesian-translation"]').count() == 0 and page.locator('[data-learning-component="choice-translation"]').count() == 0)
    record(checks, 'level2_translation_controls', page.locator('[data-session-toggle="question-id"]').count() == 1 and page.locator('[data-session-toggle="choices-id"]').count() == 1)
    record(checks, 'negative_expression_bilingual_emphasis', page.locator('mark.negative-expression[lang="ja"], mark.negative-expression').count() > 0 and page.locator('mark.negative-expression[lang="id"]').count() > 0)
    page.locator('[data-session-toggle="furigana"]').click()
    record(
        checks,
        'level2_furigana_off_preserves_level2_support',
        page.locator('.guided-lesson-card').count() == 1
        and page.locator('[data-learning-component="question-intent"]').count() == 1
        and page.locator('[data-session-toggle="question-id"]').count() == 1
        and page.locator('[data-session-toggle="choices-id"]').count() == 1,
    )
    page.locator('[data-session-toggle="furigana"]').click()
    question_box = page.locator('.question-text').bounding_box()
    record(checks, 'japanese_question_visible_in_initial_viewport', bool(question_box) and question_box['y'] < 800 and question_box['y'] + question_box['height'] > 0)
    record(checks, 'level2_no_horizontal_overflow', page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    page.screenshot(path=str(SHOTS / '01-level2-closed.png'), full_page=False)
    print('E2E pedagogy: level2 closed', flush=True)

    page.locator('[data-session-toggle="question-id"]').click()
    page.locator('[data-session-toggle="choices-id"]').click()
    record(checks, 'level2_translations_opened', page.locator('[data-learning-component="indonesian-translation"]').count() == 1 and page.locator('[data-learning-component="choice-translation"]').count() == 4)
    emphasized_question_phrase = page.evaluate("""() => {
      const element = document.querySelector('.question-text mark.negative-expression');
      if (!element) return '';
      const copy = element.cloneNode(true);
      copy.querySelectorAll('rt').forEach((reading) => reading.remove());
      return copy.textContent;
    }""")
    emphasized_translation_phrase = page.locator('[data-learning-component="indonesian-translation"] mark.negative-expression').inner_text() if page.locator('[data-learning-component="indonesian-translation"] mark.negative-expression').count() else ''
    record(
        checks,
        'negative_question_and_full_translation_emphasis',
        emphasized_question_phrase == '含まれない'
        and page.locator('[data-learning-component="indonesian-translation"] mark.negative-expression').count() == 1
        and emphasized_translation_phrase == 'tidak termasuk',
    )
    record(
        checks,
        'level2_open_translations_no_horizontal_overflow',
        fits_mobile_width(page, ['.guided-lesson-card', '.meaning-stage', '.choice-list']),
    )
    page.locator('[data-learning-component="indonesian-translation"]').scroll_into_view_if_needed()
    page.screenshot(path=str(SHOTS / '02-level2-translations-open.png'), full_page=False)
    print('E2E pedagogy: translations open', flush=True)

    wrong_choice = page.evaluate("""() => {
      const question = LivestockApp.questionById('q033');
      return question.choices.find((choice) => choice.id !== question.correctChoiceId).id;
    }""")
    page.locator(f'[data-choice="{wrong_choice}"]').click()
    page.locator('[data-confidence="unsure"]').click()
    page.locator('[data-answer]').click()
    page.wait_for_timeout(100)
    print('E2E pedagogy: answered level2', flush=True)
    record(checks, 'answer_has_correct_and_all_choice_reasons', page.locator('[data-learning-component="answer-explanation"]').count() == 1 and page.locator('.choice-review-item').count() == 4)
    record(checks, 'answer_indonesian_closed_at_level2', page.locator('.answer-panel [lang="id"]').count() == 0 and page.locator('[data-session-toggle="answer-id"]').count() == 1)
    expected_after_answer_controls = {
        'ja': {
            'answer_id': '回答後のインドネシア語 OFF',
            'retry': '補助なしで再挑戦',
            'next': '次の問題',
            'reason_heading': 'なぜ間違えましたか？',
            'reason': '内容を知らなかった',
        },
        'id': {
            'answer_id': 'Penjelasan bahasa Indonesia NONAKTIF',
            'retry': 'Coba lagi tanpa bantuan',
            'next': 'Soal berikutnya',
            'reason_heading': 'Mengapa jawaban Anda salah?',
            'reason': 'Belum mengetahui materinya',
        },
    }
    for language in ('ja', 'id'):
        page.evaluate("""(language) => {
          LivestockApp.runtime.state.settings.uiLanguage = language;
          LivestockApp.render();
        }""", language)
        expected = expected_after_answer_controls[language]
        record(
            checks,
            f'after_answer_{language}_operation_labels',
            page.locator('[data-session-toggle="answer-id"]').inner_text() == expected['answer_id']
            and page.locator('[data-retry-without-support]').inner_text() == expected['retry']
            and page.locator('[data-next]').inner_text() == expected['next']
            and page.locator('.reason-panel h2').inner_text() == expected['reason_heading']
            and page.locator('[data-reason="knowledge"]').inner_text() == expected['reason']
            and page.locator('.question-card [data-ui-control]').evaluate_all(
                """(elements, expectedLanguage) => elements.every((element) => element.dataset.uiControlLanguage === expectedLanguage)""",
                language,
            ),
        )
    page.evaluate("""() => {
      LivestockApp.runtime.state.settings.uiLanguage = 'id';
      LivestockApp.render();
    }""")
    page.locator('[data-session-toggle="answer-id"]').click()
    record(checks, 'answer_indonesian_opened', page.locator('.answer-panel [lang="id"]').count() > 0)
    record(checks, 'configured_language_point_rendered', '含まれない' in page.locator('.japanese-language-point').inner_text() and 'tidak termasuk' in page.locator('.japanese-language-point').inner_text() and page.locator('.japanese-language-point .negative-expression').count() >= 2)
    record(
        checks,
        'answer_explanation_open_no_horizontal_overflow',
        fits_mobile_width(page, ['.guided-lesson-card', '.answer-panel', '.choice-review', '.lesson-vocabulary', '.japanese-language-point']),
    )
    page.evaluate("document.querySelector('[data-reason=\"knowledge\"]')?.click()")
    history_usage = page.evaluate("""() => {
      const entry = LivestockApp.runtime.state.history.at(-1);
      return {
        furigana: entry.usedFurigana,
        easy: entry.usedEasyJapanese,
        keywords: entry.openedKeywords,
        question: entry.openedQuestionTranslation,
        choices: entry.openedChoiceTranslations,
        answer: entry.openedAnswerIndonesian,
        knowledge: entry.knowledgeGap,
        japanese: entry.japaneseGap,
        elapsed: entry.elapsedMs,
      };
    }""")
    record(checks, 'actual_support_usage_saved', history_usage == {
        'furigana': True,
        'easy': False,
        'keywords': True,
        'question': True,
        'choices': True,
        'answer': True,
        'knowledge': True,
        'japanese': False,
        'elapsed': history_usage['elapsed'],
    } and history_usage['elapsed'] >= 0)
    page.locator('.answer-panel').scroll_into_view_if_needed()
    page.screenshot(path=str(SHOTS / '03-answer-explanation.png'), full_page=False)
    print('E2E pedagogy: explanation captured', flush=True)

    page.evaluate("document.querySelector('[data-retry-without-support]')?.click()")
    record(checks, 'retry_forces_level0', page.evaluate('LivestockApp.runtime.session.supportLevel === 0 && LivestockApp.runtime.session.isRetryWithoutSupport === true'))
    record(checks, 'retry_is_strictly_japanese_only', page.locator('.japanese-only-card').count() == 1 and page.locator('.japanese-only-card [lang="id"], .japanese-only-card ruby rt, .japanese-only-card [data-learning-component]').count() == 0)
    record(checks, 'retry_button_not_repeated', page.locator('[data-retry-without-support]').count() == 0)
    record(
        checks,
        'level0_retry_no_horizontal_overflow',
        fits_mobile_width(page, ['.japanese-only-card', '.japanese-only-card .choice-list']),
    )
    page.screenshot(path=str(SHOTS / '04-retry-japanese-only.png'), full_page=False)
    print('E2E pedagogy: retry level0', flush=True)
    page.evaluate("""() => {
      const session = LivestockApp.runtime.session;
      const question = LivestockApp.questionById(session.questionIds[session.index]);
      session.selectedChoiceId = question.correctChoiceId;
      session.confidence = 'sure';
      LivestockApp.render();
      document.querySelector('[data-answer]')?.click();
    }""")
    record(
        checks,
        'level0_answer_has_japanese_keywords_without_support_leak',
        page.locator('.japanese-only-card [data-learning-component="keyword-glossary"] .vocabulary-card').count() >= 1
        and page.locator('.japanese-only-card [lang="id"], .japanese-only-card ruby rt, .japanese-only-card .easy-explanation, .japanese-only-card .choice-support.id').count() == 0,
    )
    record(
        checks,
        'level0_answer_no_horizontal_overflow',
        fits_mobile_width(page, ['.japanese-only-card', '.answer-panel', '.choice-review', '.lesson-vocabulary', '.japanese-language-point']),
    )
    print('E2E pedagogy: answered level0', flush=True)

    # Render Level 1 and Level 3 explicitly to verify their distinct UI shapes.
    page.evaluate("""() => {
      const session = LivestockApp.runtime.session;
      session.answered = false;
      session.selectedChoiceId = null;
      session.isRetryWithoutSupport = false;
      session.retryOfHistoryId = null;
      session.supportLevel = 1;
      session.furiganaVisible = true;
      session.easyJapaneseVisible = false;
      session.indonesianVisible = false;
      session.keywordsVisible = true;
      session.choiceTranslationsVisible = false;
      session.answerIndonesianVisible = false;
      LivestockApp.render();
    }""")
    record(
        checks,
        'level1_short_hints_only',
        page.locator('.compact-keyword-hints').count() == 1
        and page.locator('.compact-keyword-hints .vocabulary-card > p[lang="ja"]').count() >= 1
        and page.locator('.compact-keyword-hints [lang="id"]').count() == 0
        and page.locator('[data-learning-component="question-intent"], [data-session-toggle="question-id"], [data-session-toggle="choices-id"]').count() == 0,
    )
    print('E2E pedagogy: level1 rendered', flush=True)
    page.evaluate("""() => {
      const session = LivestockApp.runtime.session;
      const question = LivestockApp.questionById(session.questionIds[session.index]);
      session.selectedChoiceId = question.correctChoiceId;
      session.confidence = 'sure';
      LivestockApp.render();
      document.querySelector('[data-answer]')?.click();
    }""")
    page.wait_for_timeout(100)
    record(
        checks,
        'level1_answer_indonesian_closed',
        page.locator('[data-session-toggle="answer-id"]').count() == 1
        and page.locator('[data-learning-component="keyword-glossary"] .vocabulary-card > strong[lang="id"]').count() == 0,
    )
    page.evaluate("""() => {
      const session = LivestockApp.runtime.session;
      session.answerIndonesianVisible = true;
      session.supportUsage.answerIndonesianOpened = true;
      LivestockApp.render();
    }""")
    record(
        checks,
        'level1_answer_indonesian_reveals_keywords',
        page.locator('[data-learning-component="answer-explanation"] [lang="id"]').count() >= 1
        and page.locator('[data-learning-component="keyword-glossary"] .vocabulary-card > strong[lang="id"]').count() >= 1
        and page.locator('.compact-keyword-hints').count() == 0,
    )
    print('E2E pedagogy: level1 answer translation', flush=True)

    page.evaluate("""() => {
      const session = LivestockApp.runtime.session;
      session.answered = false;
      session.selectedChoiceId = null;
      session.confidence = null;
      session.supportLevel = 3;
      session.furiganaVisible = true;
      session.easyJapaneseVisible = true;
      session.indonesianVisible = true;
      session.keywordsVisible = true;
      session.choiceTranslationsVisible = true;
      session.answerIndonesianVisible = false;
      LivestockApp.render();
    }""")
    record(checks, 'level3_all_preanswer_support', page.locator('[data-learning-component="indonesian-translation"]').count() == 1 and page.locator('[data-learning-component="choice-translation"]').count() == 4 and page.locator('.support-box:not(.id)').count() >= 1)
    print('E2E pedagogy: level3 rendered', flush=True)
    language_point_text = page.evaluate("""() => {
      const options = { showFurigana: true, showEasyJapanese: true, showIndonesian: true, showAnswerIndonesian: true, phase: 'after-answer' };
      const host = document.createElement('div');
      return Object.fromEntries(['q008', 'q013', 'q049', 'q057'].map((id) => {
        host.innerHTML = LivestockApp.renderJapaneseLanguagePoint(LivestockApp.questionById(id), options);
        return [id, host.textContent];
      }));
    }""")
    record(
        checks,
        'configured_language_points_use_question_phrases',
        '次の分娩に備えて／時期として' in language_point_text['q008']
        and '利点として' in language_point_text['q013']
        and '必要な原液量は何mL' in language_point_text['q049']
        and '教材に沿う' in language_point_text['q057'],
    )
    q078_negative_phrases = page.evaluate("""() => {
      const question = LivestockApp.questionById('q078');
      const options = { showFurigana: true, showEasyJapanese: false, showIndonesian: false, showQuestionTranslation: true, phase: 'before-answer' };
      const host = document.createElement('div');
      host.innerHTML = `<div class="ja">${LivestockApp.renderRubyText(question.question, true, true)}</div>${LivestockApp.renderIndonesianTranslation(question.question, options)}`;
      const ja = host.querySelector('.ja mark');
      const jaCopy = ja?.cloneNode(true);
      jaCopy?.querySelectorAll('rt').forEach((reading) => reading.remove());
      return {
        ja: jaCopy?.textContent ?? '',
        id: host.querySelector('[data-learning-component="indonesian-translation"] mark')?.textContent ?? '',
      };
    }""")
    record(checks, 'q078_actual_negative_phrases_emphasized', q078_negative_phrases == {'ja': '挙げられていない', 'id': 'tidak dicantumkan'})
    record(checks, 'no_runtime_errors', not page_errors)
    print('E2E pedagogy: complete', flush=True)

    browser.close()

failed = [name for name, passed in checks.items() if not passed]
report = {
    'overall': 'PASS' if not failed else 'FAIL',
    'viewport': '360x800',
    'checks': checks,
    'failed': failed,
    'pageErrors': page_errors,
    'screenshots': sorted(path.name for path in SHOTS.glob('*.png')),
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
sys.exit(1 if failed else 0)
