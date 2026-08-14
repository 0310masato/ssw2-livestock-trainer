from __future__ import annotations

import json
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = (ROOT / 'dist' / 'standalone-review.html').read_text(encoding='utf-8')
SHOTS = ROOT / 'reports' / 'screenshots'
SHOTS.mkdir(parents=True, exist_ok=True)


def check(condition: bool, name: str, checks: dict[str, bool]) -> None:
    checks[name] = bool(condition)


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


def dom_click(page, selector: str) -> bool:
    """Dispatch the production DOM click listener without pointer hit-testing."""
    return bool(page.evaluate("""(selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return false;
      if ('disabled' in element && element.disabled) return false;
      element.click();
      return true;
    }""", selector))


with sync_playwright() as p:
    launch_options = {
        'headless': True,
        'args': ['--no-sandbox', '--disable-dev-shm-usage'],
        'timeout': 30_000,
    }
    if sys.platform == 'win32':
        # On Windows, explicitly prefer Playwright's headless shell. Launching
        # the full Chromium bundle can wait indefinitely when another desktop
        # Chrome instance is being managed by the host application.
        local_app_data = pathlib.Path(os.environ.get('LOCALAPPDATA', ''))
        windows_headless_shells = sorted(
            local_app_data.glob('ms-playwright/chromium_headless_shell-*/chrome-win/headless_shell.exe'),
            reverse=True,
        )
        if windows_headless_shells:
            launch_options['executable_path'] = str(windows_headless_shells[0])
    browser = p.chromium.launch(**launch_options)
    page = browser.new_page(viewport={'width': 360, 'height': 800}, device_scale_factor=1)
    page.set_default_timeout(3000)
    page_errors: list[str] = []
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    page.on('console', lambda message: page_errors.append(f'console:{message.text}') if message.type == 'error' else None)
    page.evaluate("""() => {
      const memory = new Map();
      const controls = { failWrites: false };
      try { delete window.indexedDB; } catch (_) {}
      Object.defineProperty(window, '__e2eStorageControls', {
        configurable: true,
        value: controls,
      });
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: (key) => memory.get(key) ?? null,
          setItem: (key, value) => {
            if (controls.failWrites) throw new Error('Simulated localStorage write failure');
            memory.set(key, String(value));
          },
          removeItem: (key) => memory.delete(key),
          clear: () => memory.clear(),
        },
      });
    }""")
    page.set_content(HTML, wait_until='domcontentloaded', timeout=15_000)
    page.wait_for_timeout(500)
    print('E2E core: home', flush=True)

    checks: dict[str, bool] = {}
    body = page.locator('body').inner_text()
    check('Pelatih Peternakan Tingkat 2' in body and 'Mulai 10 soal hari ini' in body, 'home_render_indonesian', checks)
    check(page.locator('[data-ui-language="id"].active').count() == 1 and page.evaluate("document.documentElement.lang === 'id'"), 'language_switcher_default', checks)
    check(page.locator('[data-category]').count() == 9, 'category_navigation', checks)
    tap_heights = page.evaluate("""() => [...document.querySelectorAll('button')].filter((el) => el.offsetParent !== null).slice(0, 25).map((el) => el.getBoundingClientRect().height)""")
    check(bool(tap_heights) and min(tap_heights) >= 40, 'mobile_tap_targets', checks)
    check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'mobile_no_horizontal_overflow', checks)
    check(page.evaluate("""() => {
      const nav = document.querySelector('.top-nav');
      return Boolean(nav) && nav.scrollWidth <= nav.clientWidth + 1;
    }"""), 'mobile_top_nav_no_horizontal_overflow', checks)
    page.screenshot(path=str(SHOTS / 'alpha-home-mobile.png'), full_page=False)

    page.evaluate("document.querySelector('[data-start=\"daily\"]')?.click()")
    page.wait_for_timeout(180)
    print('E2E core: guided study', flush=True)
    body = page.locator('body').inner_text()
    check(
        page.locator('[data-learning-component="indonesian-translation"]').count() == 1
        and page.locator('[data-learning-component="choice-translation"]').count() == 4,
        'guided_indonesian_lesson',
        checks,
    )
    check(page.locator('.guided-lesson-card ruby rt').count() >= 1, 'full_furigana_rendered', checks)
    check(page.locator('.vocabulary-card').count() >= 1, 'question_vocabulary_rendered', checks)
    page.evaluate("() => [...document.querySelectorAll('[data-view=\"home\"]')].at(-1)?.click()")
    page.wait_for_timeout(120)

    page.evaluate("document.querySelector('[data-ui-language=\"ja\"]')?.click()")
    page.wait_for_timeout(150)
    check('今日の10問を始める' in page.locator('body').inner_text() and page.evaluate("document.documentElement.lang === 'ja'"), 'language_switch_to_japanese', checks)
    page.wait_for_timeout(150)
    check(page.evaluate("JSON.parse(localStorage.getItem('livestock2-state-v0.4')).settings.uiLanguage === 'ja'"), 'language_selection_persisted', checks)

    page.evaluate("document.querySelector('[data-start=\"daily\"]')?.click()")
    page.wait_for_timeout(150)
    print('E2E core: answer flow', flush=True)
    body = page.locator('#app').text_content() or ''
    print('E2E core: daily text read', flush=True)
    check('問題 1 / 10' in body and page.locator('[data-choice]').count() == 4, 'daily_session', checks)
    page.screenshot(path=str(SHOTS / 'alpha-study-mobile.png'), full_page=False)
    print('E2E core: daily rendered', flush=True)

    wrong_choice = page.evaluate("""() => {
      const session = LivestockApp.runtime.session;
      const question = LivestockApp.questionById(session.questionIds[session.index]);
      return question.choices.find((choice) => choice.id !== question.correctChoiceId).id;
    }""")
    page.evaluate("(selector) => document.querySelector(selector)?.click()", f'[data-choice="{wrong_choice}"]')
    page.evaluate("document.querySelector('[data-confidence=\"unsure\"]')?.click()")
    page.evaluate("document.querySelector('[data-answer]')?.click()")
    page.wait_for_timeout(100)
    print('E2E core: answered', flush=True)
    body = page.locator('body').inner_text()
    check('不正解' in body and '根拠' in body and 'なぜ間違えましたか？' in body, 'answer_and_explanation', checks)
    page.evaluate("document.querySelector('[data-reason=\"knowledge\"]')?.click()")
    check(page.locator('[data-next]').is_enabled(), 'error_reason_gate', checks)
    print('E2E core: reason recorded', flush=True)

    page.evaluate("""() => {
      LivestockApp.runtime.session = {
        id: 'visual-test', kind: 'all', questionIds: ['q058'], index: 0,
        selectedChoiceId: null, answered: false, startedQuestionAt: performance.now(),
        easyJapaneseVisible: true, indonesianVisible: true, furiganaVisible: true,
        supportLevel: 3, keywordsVisible: true, choiceTranslationsVisible: true,
        answerIndonesianVisible: false,
        supportUsage: { furiganaUsed: true, easyJapaneseUsed: true, keywordsOpened: true,
          questionTranslationOpened: true, choiceTranslationsOpened: true, answerIndonesianOpened: false },
        retryOfHistoryId: null, isRetryWithoutSupport: false,
        confidence: null, pendingReason: null, completed: false
      };
      LivestockApp.runtime.view = 'study';
      LivestockApp.render();
    }""")
    page.wait_for_timeout(100)
    print('E2E core: visual rendered', flush=True)
    check(page.locator('.question-visual img').count() == 1, 'original_visual_asset', checks)
    page.screenshot(path=str(SHOTS / 'alpha-visual-mobile.png'), full_page=False)

    page.evaluate("document.querySelector('[data-view=\"manager\"]')?.click()")
    page.wait_for_timeout(100)
    print('E2E core: manager rendered', flush=True)
    body = page.locator('body').inner_text()
    check('会社管理者ダッシュボード' in body and '日本語原因の誤答' in body and '分野別累計' in body, 'manager_dashboard', checks)
    check(
        fits_mobile_width(page, ['.metric-grid', '.results-grid', '.table-panel']),
        'manager_no_horizontal_overflow',
        checks,
    )
    page.screenshot(path=str(SHOTS / 'alpha-manager-mobile.png'), full_page=False)

    # Load a representative card directly; the content tests separately assert
    # the stable total of 80 question records. Rendering all 80 long cards at
    # 360px can exhaust constrained headless-browser layout memory before any
    # interaction is exercised.
    page.evaluate("LivestockApp.runtime.reviewSearch = 'q001'")
    page.evaluate("document.querySelector('[data-view=\"review\"]')?.click()")
    page.wait_for_timeout(100)
    print('E2E core: review rendered', flush=True)
    check(
        '80問レビュー' in page.locator('.section-heading').inner_text()
        and 'approved化ではありません' in page.locator('.section-heading').inner_text()
        and page.locator('.review-card').count() == 1,
        'review_screen',
        checks,
    )
    check(page.locator('.review-card').count() == 1, 'review_filter', checks)
    review_choice_comparison = page.evaluate("""() => {
      const question = LivestockApp.questionById('q001');
      const rows = [...document.querySelectorAll('[data-review-choice-comparison="q001"] .review-choice-comparison-row')];
      return rows.length === question.choices.length && rows.every((row, index) => {
        const choice = question.choices[index];
        return row.dataset.reviewChoiceId === choice.id
          && row.querySelector('[data-review-choice-ja]')?.textContent === choice.text.ja
          && row.querySelector('[data-review-choice-easy-ja]')?.textContent === choice.text.easyJa;
      });
    }""")
    check(review_choice_comparison, 'review_choice_ja_easy_ja_comparison', checks)
    page.evaluate("document.querySelector('[data-review-set$=\"|承認候補\"]')?.click()")
    page.wait_for_timeout(100)
    check('承認候補 1' in page.locator('body').inner_text(), 'review_state', checks)
    check(
        fits_mobile_width(page, ['.critical-note', '.review-toolbar', '.review-card']),
        'review_no_horizontal_overflow',
        checks,
    )
    page.screenshot(path=str(SHOTS / 'alpha-review-mobile.png'), full_page=False)

    page.evaluate("LivestockApp.runtime.glossarySearch = '分娩'")
    page.evaluate("document.querySelector('[data-view=\"glossary\"]')?.click()")
    page.wait_for_timeout(100)
    print('E2E core: glossary rendered', flush=True)
    body = page.locator('body').inner_text()
    check('日本語専門用語' in body and '分娩' in body and page.locator('.glossary-row').count() >= 1, 'glossary_search', checks)
    print('E2E core: glossary checked', flush=True)
    check(
        fits_mobile_width(page, ['.search-bar', '.glossary-list', '.glossary-row']),
        'glossary_no_horizontal_overflow',
        checks,
    )
    print('E2E core: glossary width checked', flush=True)

    page.evaluate("LivestockApp.runtime.view = 'settings'; LivestockApp.render()")
    page.wait_for_timeout(100)
    print('E2E core: settings rendered', flush=True)
    check('設定' in page.locator('body').inner_text(), 'settings_screen', checks)
    check(
        fits_mobile_width(page, ['.settings-panel', '.setting-row']),
        'settings_no_horizontal_overflow',
        checks,
    )
    print('E2E core: settings checked', flush=True)

    # Imports must ignore the source device's revision and only replace the
    # live runtime after at least one durable backend accepts the candidate.
    import_baseline_revision = page.evaluate("""async () => {
      await LivestockApp.saveState(LivestockApp.runtime.state);
      return LivestockApp.runtime.state.revision;
    }""")
    import_fixture = page.evaluate("""() => {
      const state = structuredClone(LivestockApp.runtime.state);
      state.revision = Number.MAX_SAFE_INTEGER - 1;
      state.settings.dailyQuestionCount = 15;
      return JSON.stringify({ state });
    }""")
    page.locator('[data-import-progress]').set_input_files({
        'name': 'safe-revision-import.json',
        'mimeType': 'application/json',
        'buffer': import_fixture.encode('utf-8'),
    })
    page.wait_for_timeout(300)
    page.wait_for_function("LivestockApp.runtime.notice === '学習データを読み込みました。'")
    imported_state = page.evaluate("""() => {
      const saved = JSON.parse(localStorage.getItem('livestock2-state-v0.4'));
      return {
        revision: LivestockApp.runtime.state.revision,
        count: LivestockApp.runtime.state.settings.dailyQuestionCount,
        savedRevision: saved.revision,
        savedCount: saved.settings.dailyQuestionCount,
        safe: Number.isSafeInteger(LivestockApp.runtime.state.revision),
        notice: LivestockApp.runtime.notice,
      };
    }""")
    check(
        imported_state == {
            'revision': import_baseline_revision + 1,
            'count': 15,
            'savedRevision': import_baseline_revision + 1,
            'savedCount': 15,
            'safe': True,
            'notice': '学習データを読み込みました。',
        },
        'import_revision_rebased_to_local_safe_sequence',
        checks,
    )

    import_followup = page.evaluate("""async () => {
      const first = await LivestockApp.saveState(LivestockApp.runtime.state);
      const second = await LivestockApp.saveState(LivestockApp.runtime.state);
      const loaded = await LivestockApp.loadState();
      return {
        firstRevision: first.revision,
        secondRevision: second.revision,
        runtimeRevision: LivestockApp.runtime.state.revision,
        loadedRevision: loaded.revision,
        loadedCount: loaded.settings.dailyQuestionCount,
        allSafe: [first.revision, second.revision, loaded.revision].every(Number.isSafeInteger),
      };
    }""")
    check(
        import_followup == {
            'firstRevision': imported_state['revision'] + 1,
            'secondRevision': imported_state['revision'] + 2,
            'runtimeRevision': imported_state['revision'] + 2,
            'loadedRevision': imported_state['revision'] + 2,
            'loadedCount': 15,
            'allSafe': True,
        },
        'import_followup_revisions_safe_monotonic_and_reloadable',
        checks,
    )

    rollback_before = page.evaluate("""() => ({
      state: JSON.stringify(LivestockApp.runtime.state),
      fallback: localStorage.getItem('livestock2-state-v0.4'),
      history: JSON.stringify(LivestockApp.runtime.state.history),
      mastery: JSON.stringify(LivestockApp.runtime.state.mastery),
      revision: LivestockApp.runtime.state.revision,
    })""")
    rollback_fixture = page.evaluate("""() => {
      const state = structuredClone(LivestockApp.runtime.state);
      state.revision = 777;
      state.history = [];
      state.mastery = {};
      state.settings.dailyQuestionCount = 20;
      return JSON.stringify({ state });
    }""")
    page.evaluate("window.__e2eStorageControls.failWrites = true")
    page.locator('[data-import-progress]').set_input_files({
        'name': 'must-rollback-import.json',
        'mimeType': 'application/json',
        'buffer': rollback_fixture.encode('utf-8'),
    })
    page.wait_for_function("LivestockApp.runtime.notice === '保存に失敗しました。ブラウザの空き容量を確認してください。'")
    rollback_after = page.evaluate("""() => ({
      state: JSON.stringify(LivestockApp.runtime.state),
      fallback: localStorage.getItem('livestock2-state-v0.4'),
      history: JSON.stringify(LivestockApp.runtime.state.history),
      mastery: JSON.stringify(LivestockApp.runtime.state.mastery),
      revision: LivestockApp.runtime.state.revision,
      notice: LivestockApp.runtime.notice,
      indexedDbUnavailable: !('indexedDB' in window),
    })""")
    page.evaluate("window.__e2eStorageControls.failWrites = false")
    check(
        rollback_after['state'] == rollback_before['state']
        and rollback_after['fallback'] == rollback_before['fallback']
        and rollback_after['history'] == rollback_before['history']
        and rollback_after['mastery'] == rollback_before['mastery']
        and rollback_after['revision'] == rollback_before['revision']
        and rollback_after['notice'] == '保存に失敗しました。ブラウザの空き容量を確認してください。'
        and rollback_after['indexedDbUnavailable'],
        'import_dual_backend_failure_rolls_back_runtime_and_durable_state',
        checks,
    )

    # Set the saved display-language precondition before exercising the mock
    # flow entirely through production DOM click handlers.
    page.evaluate("""async () => {
      LivestockApp.runtime.session = null;
      LivestockApp.runtime.view = 'home';
      LivestockApp.runtime.state.settings.uiLanguage = 'id';
      await LivestockApp.saveState(LivestockApp.runtime.state);
      LivestockApp.render();
    }""")
    mock_ui_setup = page.evaluate("""() => ({
      runtimeLanguage: LivestockApp.runtime.state.settings.uiLanguage,
      savedLanguage: JSON.parse(localStorage.getItem('livestock2-state-v0.4')).settings.uiLanguage,
    })""")
    check(
        mock_ui_setup == {'runtimeLanguage': 'id', 'savedLanguage': 'id'},
        'mock_indonesian_setting_persisted_before_start',
        checks,
    )
    print('E2E core: home before mock', flush=True)
    check(dom_click(page, '[data-start="mock"]'), 'mock_started_via_dom', checks)
    page.wait_for_timeout(100)
    print('E2E core: mock', flush=True)
    body = page.locator('#app').text_content() or ''
    print('E2E core: mock text read', flush=True)
    check('問題 1 / 50' in body and '問題一覧' in body and page.locator('[data-mock-timer]').count() == 1, 'mock_50_60', checks)
    mock_boundary = page.evaluate("""() => ({
      indonesianNodes: document.querySelectorAll('#app [lang="id"]').length,
      rubyNodes: document.querySelectorAll('#app ruby rt').length,
      learningComponents: document.querySelectorAll('#app [data-learning-component]').length,
      documentLanguage: document.documentElement.lang,
      savedLanguage: JSON.parse(localStorage.getItem('livestock2-state-v0.4')).settings.uiLanguage,
    })""")
    check(
        mock_boundary == {
            'indonesianNodes': 0,
            'rubyNodes': 0,
            'learningComponents': 0,
            'documentLanguage': 'ja',
            'savedLanguage': 'id',
        }
        and not any(term in body for term in ('Pelatih Peternakan', 'Beranda', 'Belajar', 'Pengaturan')),
        'mock_strictly_japanese_only',
        checks,
    )
    print(f'E2E core: mock boundary {mock_boundary}', flush=True)
    print('E2E core: mock language checked', flush=True)
    check(
        fits_mobile_width(page, ['.mock-shell', '.mock-card', '.mock-index', '.mock-navigation']),
        'mock_no_horizontal_overflow',
        checks,
    )
    print('E2E core: mock width checked', flush=True)

    first_mock_choice = page.evaluate("""() => {
      const draft = LivestockApp.runtime.state.mockDraft;
      const questionId = draft.questionIds[draft.currentIndex];
      const question = LivestockApp.questionById(questionId);
      return { questionId, choiceId: question.choices[0].id };
    }""")
    check(
        dom_click(page, f'[data-mock-choice="{first_mock_choice["choiceId"]}"]'),
        'mock_choice_clicked_via_dom',
        checks,
    )
    page.wait_for_timeout(100)
    mock_choice_state = page.evaluate("""(expected) => {
      const draft = LivestockApp.runtime.state.mockDraft;
      const saved = JSON.parse(localStorage.getItem('livestock2-state-v0.4')).mockDraft;
      return {
        runtimeAnswer: draft.answers[expected.questionId],
        persistedAnswer: saved.answers[expected.questionId],
        selected: document.querySelectorAll('[data-mock-choice].selected').length,
      };
    }""", first_mock_choice)
    check(
        mock_choice_state == {
            'runtimeAnswer': first_mock_choice['choiceId'],
            'persistedAnswer': first_mock_choice['choiceId'],
            'selected': 1,
        },
        'mock_choice_handler_and_persistence',
        checks,
    )
    print('E2E core: mock choice', flush=True)
    check(dom_click(page, '[data-mock-next]'), 'mock_next_clicked_via_dom', checks)
    page.wait_for_timeout(100)
    mock_next_state = page.evaluate("""() => ({
      currentIndex: LivestockApp.runtime.state.mockDraft?.currentIndex,
      sessionIndex: LivestockApp.runtime.session?.index,
      persistedIndex: JSON.parse(localStorage.getItem('livestock2-state-v0.4')).mockDraft?.currentIndex,
    })""")
    check(
        '問題 2 / 50' in (page.locator('body').text_content() or '')
        and mock_next_state == {'currentIndex': 1, 'sessionIndex': 1, 'persistedIndex': 1},
        'mock_navigation',
        checks,
    )
    print('E2E core: mock navigation', flush=True)

    check(dom_click(page, '[data-mock-jump="4"]'), 'mock_jump_clicked_via_dom', checks)
    page.wait_for_timeout(100)
    mock_jump_state = page.evaluate("""() => ({
      currentIndex: LivestockApp.runtime.state.mockDraft?.currentIndex,
      sessionIndex: LivestockApp.runtime.session?.index,
      persistedIndex: JSON.parse(localStorage.getItem('livestock2-state-v0.4')).mockDraft?.currentIndex,
    })""")
    check(
        '問題 5 / 50' in (page.locator('body').text_content() or '')
        and mock_jump_state == {'currentIndex': 4, 'sessionIndex': 4, 'persistedIndex': 4},
        'mock_jump_navigation',
        checks,
    )
    check(dom_click(page, '[data-mock-jump="1"]'), 'mock_jump_returned_via_dom', checks)
    page.wait_for_timeout(100)

    check(dom_click(page, '[data-view="home"]'), 'mock_interrupted_via_dom', checks)
    page.wait_for_timeout(100)
    interrupted_state = page.evaluate("""() => ({
      resumeControls: document.querySelectorAll('[data-resume-mock]').length,
      sessionCleared: LivestockApp.runtime.session === null,
      draftIndex: LivestockApp.runtime.state.mockDraft?.currentIndex,
    })""")
    check(
        interrupted_state == {'resumeControls': 1, 'sessionCleared': True, 'draftIndex': 1},
        'mock_resume_control_visible',
        checks,
    )
    check(dom_click(page, '[data-resume-mock]'), 'mock_resumed_via_dom', checks)
    page.wait_for_timeout(100)
    resume_state = page.evaluate("""() => ({
      questionNumber: LivestockApp.runtime.state.mockDraft.currentIndex + 1,
      sessionKind: LivestockApp.runtime.session?.kind,
      sessionIndex: LivestockApp.runtime.session?.index,
      documentLanguage: document.documentElement.lang,
      savedLanguage: JSON.parse(localStorage.getItem('livestock2-state-v0.4')).settings.uiLanguage,
    })""")
    check(
        resume_state == {
            'questionNumber': 2,
            'sessionKind': 'mock',
            'sessionIndex': 1,
            'documentLanguage': 'ja',
            'savedLanguage': 'id',
        }
        and '問題 2 / 50' in (page.locator('body').text_content() or ''),
        'mock_interrupt_resume_handler',
        checks,
    )
    check(dom_click(page, '[data-mock-prev]'), 'mock_previous_clicked_via_dom', checks)
    page.wait_for_timeout(100)
    check(
        '問題 1 / 50' in (page.locator('body').text_content() or '')
        and page.locator(f'[data-mock-choice="{first_mock_choice["choiceId"]}"].selected').count() == 1,
        'mock_previous_and_answer_restored',
        checks,
    )

    check(dom_click(page, '[data-submit-mock]'), 'mock_submit_clicked_via_dom', checks)
    page.wait_for_timeout(50)
    check(
        page.locator('[data-confirm-dialog][open]').count() == 1
        and '模擬試験を採点' in page.locator('[data-confirm-title]').inner_text(),
        'mock_submit_confirmation',
        checks,
    )
    check(dom_click(page, '[data-confirm-ok]'), 'mock_submit_confirmed_via_dom', checks)
    page.wait_for_timeout(120)
    mock_result_state = page.evaluate("""() => ({
      draftCleared: LivestockApp.runtime.state.mockDraft === null,
      resultTotal: LivestockApp.runtime.lastMockResult?.total,
      resultAnswered: LivestockApp.runtime.lastMockResult
        ? LivestockApp.runtime.lastMockResult.total - LivestockApp.runtime.lastMockResult.unanswered
        : null,
      historyCount: LivestockApp.runtime.state.mockHistory.length,
    })""")
    check(
        page.locator('.result-hero.exam-result').count() == 1
        and mock_result_state['draftCleared']
        and mock_result_state['resultTotal'] == 50
        and mock_result_state['resultAnswered'] == 1
        and mock_result_state['historyCount'] >= 1,
        'mock_submit_and_grade_handler',
        checks,
    )

    page.set_viewport_size({'width': 1280, 'height': 900})
    restored_ui_state = page.evaluate("""() => ({
      documentLanguage: document.documentElement.lang,
      savedLanguage: JSON.parse(localStorage.getItem('livestock2-state-v0.4')).settings.uiLanguage,
      hasIndonesianBrand: document.querySelector('#app .brand')?.textContent.includes('Pelatih Peternakan Tingkat 2') ?? false,
    })""")
    check(
        restored_ui_state == {
            'documentLanguage': 'id',
            'savedLanguage': 'id',
            'hasIndonesianBrand': True,
        },
        'mock_ui_language_restored',
        checks,
    )

    # A paused mock keeps its absolute deadline, but its timer must not replace
    # an unrelated learning session. The expired mock is graded only when the
    # learner explicitly resumes it.
    page.evaluate("""() => {
      const nativeSetInterval = window.setInterval.bind(window);
      const nativeClearInterval = window.clearInterval.bind(window);
      const activeIntervals = new Set();
      window.__activeMockIntervals = activeIntervals;
      window.setInterval = (callback, delay, ...args) => {
        const handle = nativeSetInterval(callback, delay, ...args);
        activeIntervals.add(handle);
        return handle;
      };
      window.clearInterval = (handle) => {
        activeIntervals.delete(handle);
        nativeClearInterval(handle);
      };
    }""")
    page.evaluate("LivestockApp.runtime.session = null; LivestockApp.runtime.lastMockResult = null; LivestockApp.runtime.view = 'home'; LivestockApp.render()")
    page.wait_for_timeout(80)
    check(dom_click(page, '[data-start="mock"]'), 'paused_mock_timer_fixture_started', checks)
    page.wait_for_timeout(80)
    check(dom_click(page, '[data-view="home"]'), 'paused_mock_timer_fixture_interrupted', checks)
    page.wait_for_timeout(80)
    page.evaluate("LivestockApp.runtime.state.mockDraft.deadlineAt = new Date(Date.now() - 1000).toISOString()")
    check(dom_click(page, '[data-start="daily"]'), 'normal_study_started_with_expired_paused_mock', checks)
    page.wait_for_timeout(1_100)
    paused_mock_boundary = page.evaluate("""() => ({
      sessionId: LivestockApp.runtime.session?.id,
      sessionKind: LivestockApp.runtime.session?.kind,
      draftStillPaused: LivestockApp.runtime.state.mockDraft !== null,
      mockResultHidden: LivestockApp.runtime.lastMockResult === null,
      mockHistoryCount: LivestockApp.runtime.state.mockHistory.length,
    })""")
    check(
        paused_mock_boundary['sessionKind'] == 'daily'
        and paused_mock_boundary['draftStillPaused']
        and paused_mock_boundary['mockResultHidden'],
        'expired_paused_mock_does_not_replace_normal_study',
        checks,
    )
    page.evaluate("document.querySelector('[data-view=\"home\"]')?.click()")
    page.wait_for_timeout(80)
    check(dom_click(page, '[data-resume-mock]'), 'expired_mock_resumed_via_dom', checks)
    page.wait_for_timeout(120)
    expired_resume_state = page.evaluate("""() => ({
      draftCleared: LivestockApp.runtime.state.mockDraft === null,
      resultShown: LivestockApp.runtime.lastMockResult !== null,
      sessionKind: LivestockApp.runtime.session?.kind,
      sessionCompleted: LivestockApp.runtime.session?.completed,
      mockHistoryCount: LivestockApp.runtime.state.mockHistory.length,
      activeTickerCount: window.__activeMockIntervals.size,
    })""")
    check(
        expired_resume_state['draftCleared']
        and expired_resume_state['resultShown']
        and expired_resume_state['sessionKind'] == 'mock'
        and expired_resume_state['sessionCompleted']
        and expired_resume_state['mockHistoryCount'] == paused_mock_boundary['mockHistoryCount'] + 1
        and expired_resume_state['activeTickerCount'] == 0,
        'expired_mock_grades_on_explicit_resume',
        checks,
    )
    page.wait_for_timeout(1_200)
    expired_resume_stable = page.evaluate("""() => ({
      draftCleared: LivestockApp.runtime.state.mockDraft === null,
      mockHistoryCount: LivestockApp.runtime.state.mockHistory.length,
      activeTickerCount: window.__activeMockIntervals.size,
    })""")
    check(
        expired_resume_stable['draftCleared']
        and expired_resume_stable['mockHistoryCount'] == expired_resume_state['mockHistoryCount']
        and expired_resume_stable['activeTickerCount'] == 0,
        'expired_mock_leaves_no_ticker_or_repeat_processing',
        checks,
    )

    page.evaluate("LivestockApp.runtime.session = null; LivestockApp.runtime.lastMockResult = null; LivestockApp.runtime.view = 'home'; LivestockApp.render()")
    page.wait_for_timeout(100)
    page.evaluate("document.querySelector('[data-ui-language=\"ja\"]')?.click()")
    page.wait_for_timeout(100)
    check('毎日10問' in page.locator('body').inner_text(), 'desktop_render', checks)
    check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'desktop_no_horizontal_overflow', checks)
    page.screenshot(path=str(SHOTS / 'alpha-home-desktop.png'), full_page=False)

    check(not page_errors, 'no_runtime_errors', checks)
    browser.close()

failed = [name for name, passed in checks.items() if not passed]
report = {
    'overall': 'PASS' if not failed else 'FAIL',
    'method': 'Playwright Chromium using set_content against the standalone review build; local URL navigation is blocked by the execution environment administrator.',
    'viewportMobile': '360x800',
    'viewportDesktop': '1280x900',
    'checks': checks,
    'failed': failed,
    'pageErrors': page_errors,
    'screenshots': [
        'alpha-home-mobile.png',
        'alpha-study-mobile.png',
        'alpha-visual-mobile.png',
        'alpha-home-desktop.png',
    ],
}
(ROOT / 'reports' / 'E2E_REPORT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
sys.exit(1 if failed else 0)
