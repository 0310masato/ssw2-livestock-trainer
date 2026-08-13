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
        'timeout': 30_000,
    }
    if sys.platform == 'win32':
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

    page.evaluate("LivestockApp.runtime.reviewSearch = 'q045'")
    page.locator('[data-view="review"]').first.click()
    page.locator('[data-review-search]').fill('q045')
    review_choice_comparison = page.evaluate("""() => {
      const question = LivestockApp.questionById('q045');
      const comparison = document.querySelector('[data-review-choice-comparison="q045"]');
      const rows = [...(comparison?.querySelectorAll('.review-choice-comparison-row') ?? [])];
      return {
        cardCount: document.querySelectorAll('.review-card').length,
        rowCount: rows.length,
        actual: rows.map((row) => ({
          id: row.dataset.reviewChoiceId,
          ja: row.querySelector('[data-review-choice-ja]')?.textContent,
          easyJa: row.querySelector('[data-review-choice-easy-ja]')?.textContent,
        })),
        expected: question.choices.map((choice) => ({
          id: choice.id,
          ja: choice.text.ja,
          easyJa: choice.text.easyJa,
        })),
      };
    }""")
    record(
        checks,
        'review_search_q045_shows_choice_ja_easy_ja_comparison',
        review_choice_comparison['cardCount'] == 1
        and review_choice_comparison['rowCount'] == 4
        and review_choice_comparison['actual'] == review_choice_comparison['expected'],
    )
    page.evaluate("""() => {
      LivestockApp.runtime.reviewSearch = '';
      LivestockApp.runtime.view = 'home';
      LivestockApp.render();
    }""")

    # Render every pilot question at every support level before answering. The
    # rendered subtree must not contain answer-only material, and support-slot
    # topology must be independent from which choice is correct.
    leak_matrix = page.evaluate("""() => {
      const pilot = LivestockApp.QUESTIONS.filter((question) => question.schemaVersion === '0.4.0');
      const explicitRegressionIds = new Set(['q045', 'q055', 'q078', 'q079']);
      const failures = [];
      const explicit = Object.fromEntries([...explicitRegressionIds].map((id) => [id, true]));
      let preCases = 0;
      let answeredCases = 0;
      const samePattern = Object.fromEntries(pilot.map((question) => [
        question.id,
        Object.fromEntries(question.choices.map((choice) => [
          choice.id,
          choice.text.ja === choice.text.easyJa,
        ])),
      ]));
      const correlatedQuestionIds = pilot.filter((question) => {
        const entries = Object.entries(samePattern[question.id]);
        const same = entries.filter(([, value]) => value);
        const different = entries.filter(([, value]) => !value);
        const singleton = same.length === 1 ? same[0][0] : different.length === 1 ? different[0][0] : null;
        return singleton === question.correctChoiceId;
      }).map((question) => question.id);

      for (const question of pilot) {
        for (const level of [0, 1, 2, 3]) {
          preCases += 1;
          const policy = LivestockApp.supportPolicyForLevel(level);
          const session = {
            id: `leak-${question.id}-${level}`,
            kind: 'daily',
            questionIds: [question.id],
            index: 0,
            selectedChoiceId: null,
            answered: false,
            startedQuestionAt: Date.now(),
            supportLevel: level,
            easyJapaneseVisible: policy.showEasyJapaneseInitially,
            indonesianVisible: policy.showQuestionTranslationInitially,
            furiganaVisible: policy.showFuriganaInitially,
            keywordsVisible: policy.showKeywordsInitially,
            choiceTranslationsVisible: policy.showChoiceTranslationsInitially,
            answerIndonesianVisible: false,
            supportUsage: {
              furiganaUsed: false,
              easyJapaneseUsed: false,
              keywordsOpened: false,
              questionTranslationOpened: false,
              choiceTranslationsOpened: false,
              answerIndonesianOpened: false,
            },
            retryOfHistoryId: null,
            isRetryWithoutSupport: false,
            confidence: null,
            pendingReason: null,
            completed: false,
          };
          const settings = {
            ...LivestockApp.runtime.state.settings,
            studySupportMode: 'guided',
            preferredSupportLevel: level,
            showVocabulary: true,
            showQuestionPattern: true,
          };
          const host = document.createElement('div');
          host.style.cssText = 'position:fixed;left:-100000px;top:0;width:360px;';
          host.innerHTML = LivestockApp.renderGuidedQuestionCard(
            question,
            session,
            settings,
            false,
            level,
            1,
            {
              showFurigana: policy.showFuriganaInitially,
              showEasyJapanese: policy.showEasyJapaneseInitially,
              showIndonesian: policy.showQuestionTranslationInitially,
              showQuestionTranslation: policy.showQuestionTranslationInitially,
              showChoiceTranslations: policy.showChoiceTranslationsInitially,
              showAnswerIndonesian: false,
              showKeywords: policy.showKeywordsInitially,
              showKeywordIndonesian: level >= 2,
              showIntent: policy.showIntent,
              showIntentIndonesian: level >= 2,
              compactKeywordHints: policy.compactKeywordHints,
              allowQuestionTranslation: policy.allowQuestionTranslation,
              allowChoiceTranslations: policy.allowChoiceTranslations,
              allowAnswerIndonesian: policy.allowAnswerIndonesian,
            },
          );
          document.body.append(host);

          const forbiddenSelectors = [
            '[data-learning-component="answer-explanation"]',
            '[data-learning-component="wrong-choice-explanation"]',
            '.answer-panel',
            '.choice-review',
            '.memory-point',
            '.choice-button.correct',
            '.choice-button.wrong',
            '[data-retry-without-support]',
          ];
          for (const selector of forbiddenSelectors) {
            if (host.querySelector(selector)) failures.push(`${question.id}/L${level}: ${selector}`);
          }

          const answerOnlyTexts = [
            question.explanation.ja,
            question.explanation.easyJa,
            question.explanation.id,
            question.learningSupport.memoryPoint.ja,
            question.learningSupport.memoryPoint.easyJa,
            question.learningSupport.memoryPoint.id,
            ...Object.values(question.choiceRationales).flatMap((text) => [text.ja, text.easyJa, text.id]),
          ].filter((text) => text.length >= 6);
          for (const text of answerOnlyTexts) {
            if (host.textContent.includes(text)) failures.push(`${question.id}/L${level}: answer-only text mounted`);
          }

          const choices = [...host.querySelectorAll('.choice-button')];
          if (choices.length !== question.choices.length) failures.push(`${question.id}/L${level}: choice count`);
          const canonicalChoiceSignature = (choice, index) => {
            const copy = choice.cloneNode(true);
            const sourceChoice = question.choices[index];
            const choiceSpecificTexts = [
              sourceChoice.text.ja,
              sourceChoice.text.id,
            ].filter(Boolean).sort((left, right) => right.length - left.length);
            copy.querySelector('.choice-letter')?.replaceChildren('#');
            copy.querySelector('.choice-ja')?.replaceChildren('<japanese-choice>');
            copy.querySelector('[data-learning-component="choice-translation"]')?.replaceChildren('<indonesian-choice>');
            for (const element of [copy, ...copy.querySelectorAll('*')]) {
              const attributes = [...element.attributes]
                .filter((attribute) => attribute.name !== 'data-choice' && attribute.name !== 'aria-label')
                .map((attribute) => `${attribute.name}=${attribute.value}`)
                .sort();
              if (element.hasAttribute('aria-label')) {
                let ariaLabel = element.getAttribute('aria-label');
                for (const text of choiceSpecificTexts) ariaLabel = ariaLabel.replaceAll(text, '<choice-content>');
                attributes.push(`aria-label=${ariaLabel}`);
              }
              element.setAttribute('data-signature-attributes', attributes.join('|'));
              [...element.attributes]
                .filter((attribute) => attribute.name !== 'data-signature-attributes')
                .forEach((attribute) => element.removeAttribute(attribute.name));
              if (element.children.length === 0) element.textContent = '<choice-text>';
            }
            return copy.outerHTML;
          };
          const topology = choices.map((choice, index) => {
            const easySlots = [...choice.querySelectorAll('[data-learning-component="choice-easy-japanese"]')];
            const translationSlots = choice.querySelectorAll('[data-learning-component="choice-translation"]');
            if (easySlots.length !== 0) failures.push(`${question.id}/L${level}: learner choice easy slot ${index}`);
            if (translationSlots.length !== (level === 3 ? 1 : 0)) failures.push(`${question.id}/L${level}: translation slot ${index}`);
            const choiceEasyMarkers = [choice, ...choice.querySelectorAll('*')].flatMap((element) =>
              [...element.attributes]
                .filter((attribute) => /choice[-_ ]?easy|easy[-_ ]?japanese|やさしい日本語/iu.test(`${attribute.name}=${attribute.value}`))
                .map((attribute) => `${attribute.name}=${attribute.value}`));
            if (choiceEasyMarkers.length) failures.push(`${question.id}/L${level}: learner choice easy marker ${index}`);
            const copyChildren = [...(choice.querySelector('.choice-copy')?.children ?? [])];
            const expectedChildCount = level === 3 ? 2 : 1;
            if (copyChildren.length !== expectedChildCount
                || copyChildren.some((child) => !child.matches('.choice-ja, [data-learning-component="choice-translation"]'))) {
              failures.push(`${question.id}/L${level}: unexpected learner choice child ${index}`);
            }
            const residualCopy = choice.querySelector('.choice-copy')?.cloneNode(true);
            residualCopy?.querySelectorAll('.choice-ja, [data-learning-component="choice-translation"]')
              .forEach((element) => element.remove());
            if (!residualCopy || residualCopy.textContent.trim() !== '' || residualCopy.children.length !== 0) {
              failures.push(`${question.id}/L${level}: unexpected learner choice copy residue ${index}`);
            }
            const japanese = choice.querySelector('.choice-ja');
            const japaneseCopy = japanese?.cloneNode(true);
            japaneseCopy?.querySelectorAll('rt, rp').forEach((reading) => reading.remove());
            if ((japaneseCopy?.textContent ?? '') !== question.choices[index].text.ja) {
              failures.push(`${question.id}/L${level}: choice JA ${index}`);
            }
            const sourceEasyJa = question.choices[index].text.easyJa;
            if (sourceEasyJa !== question.choices[index].text.ja) {
              const easyJaAttributes = [choice, ...choice.querySelectorAll('*')].flatMap((element) =>
                [...element.attributes].filter((attribute) => attribute.value.includes(sourceEasyJa)));
              const unsupportedContent = choice.cloneNode(true);
              unsupportedContent.querySelectorAll('.choice-letter, .choice-ja, [data-learning-component="choice-translation"]')
                .forEach((element) => element.remove());
              if (unsupportedContent.textContent.includes(sourceEasyJa) || easyJaAttributes.length) {
                failures.push(`${question.id}/L${level}: choice easyJa residual-content/attribute ${index}`);
              }
            }
            const expectedReadings = level > 0
              ? (question.choices[index].text.rubyJa ?? []).filter((segment) => segment.reading).length
              : 0;
            if ((japanese?.querySelectorAll('rt').length ?? 0) !== expectedReadings) {
              failures.push(`${question.id}/L${level}: choice ruby ${index}`);
            }
            if (level === 3 && translationSlots[0]?.textContent !== question.choices[index].text.id) {
              failures.push(`${question.id}/L${level}: choice ID ${index}`);
            }
            return `${easySlots.length}:${translationSlots.length}`;
          });
          if (new Set(topology).size !== 1) failures.push(`${question.id}/L${level}: non-uniform support topology`);
          const domSignatures = choices.map(canonicalChoiceSignature);
          if (new Set(domSignatures).size !== 1) failures.push(`${question.id}/L${level}: non-uniform DOM/class/ARIA signature`);
          const questionEasy = host.querySelector('.meaning-stage .support-box:not(.id) p[lang="ja"]');
          if ((level === 3 && questionEasy?.textContent !== question.question.easyJa)
              || (level !== 3 && questionEasy)) {
            failures.push(`${question.id}/L${level}: question easyJa support`);
          }

          const answerMarkers = /(?:^|[-_:\\s])(correct|incorrect|right|wrong|answer|rationale|explanation|memory|benar|salah)(?:$|[-_:\\s])|正解|不正解|誤り/iu;
          for (const element of [host, ...host.querySelectorAll('*')]) {
            for (const attribute of element.attributes) {
              const isEmptyAnswerControl = attribute.name === 'data-answer' && attribute.value === '';
              if (!isEmptyAnswerControl
                  && (answerMarkers.test(attribute.name) || answerMarkers.test(attribute.value))) {
                failures.push(`${question.id}/L${level}: answer marker ${attribute.name}=${attribute.value}`);
              }
              if (attribute.name !== 'data-choice' && attribute.value === question.correctChoiceId) {
                failures.push(`${question.id}/L${level}: correctChoiceId mounted in ${attribute.name}`);
              }
            }
            const computedStyle = getComputedStyle(element);
            if (element.matches('[hidden], [aria-hidden="true"]')
                || computedStyle.display === 'none'
                || computedStyle.visibility === 'hidden'
                || computedStyle.contentVisibility === 'hidden'
                || computedStyle.opacity === '0') {
              const hiddenText = element.textContent || '';
              if (answerOnlyTexts.some((text) => hiddenText.includes(text))) {
                failures.push(`${question.id}/L${level}: answer-only material hidden in DOM`);
              }
            }
          }
          host.remove();

          if (level === 3 && explicitRegressionIds.has(question.id)) {
            explicit[question.id] = topology.length === 4
              && new Set(topology).size === 1
              && topology[0] === '0:1';
          }
          answeredCases += 1;
          const answeredSession = {
              ...session,
              answered: true,
              selectedChoiceId: question.correctChoiceId,
              confidence: 'sure',
              answerIndonesianVisible: policy.showAnswerIndonesianInitially,
            };
          const answeredHost = document.createElement('div');
          answeredHost.innerHTML = LivestockApp.renderGuidedQuestionCard(
              question,
              answeredSession,
              settings,
              true,
              level,
              1,
              {
                showFurigana: policy.showFuriganaInitially,
                showEasyJapanese: policy.showEasyJapaneseInitially,
                showIndonesian: policy.showQuestionTranslationInitially,
                showQuestionTranslation: policy.showQuestionTranslationInitially,
                showChoiceTranslations: policy.showChoiceTranslationsInitially,
                showAnswerIndonesian: policy.showAnswerIndonesianInitially,
                showKeywords: policy.showKeywordsInitially,
                showKeywordIndonesian: true,
                showIntent: policy.showIntent,
                showIntentIndonesian: true,
                compactKeywordHints: policy.compactKeywordHints,
                allowQuestionTranslation: policy.allowQuestionTranslation,
                allowChoiceTranslations: policy.allowChoiceTranslations,
                allowAnswerIndonesian: policy.allowAnswerIndonesian,
              },
            );
          const answeredChoices = [...answeredHost.querySelectorAll('.choice-button')];
          for (const [index, choice] of answeredChoices.entries()) {
              const markers = [choice, ...choice.querySelectorAll('*')].flatMap((element) =>
                [...element.attributes]
                  .filter((attribute) => /choice[-_ ]?easy|easy[-_ ]?japanese|やさしい日本語/iu.test(`${attribute.name}=${attribute.value}`))
                  .map((attribute) => `${attribute.name}=${attribute.value}`));
              const children = [...(choice.querySelector('.choice-copy')?.children ?? [])];
              const expectedChildren = level === 3 ? 2 : 1;
              if (choice.querySelector('[data-learning-component="choice-easy-japanese"], .choice-easy-japanese')
                  || markers.length
                  || children.length !== expectedChildren
                  || children.some((child) => !child.matches('.choice-ja, [data-learning-component="choice-translation"]'))) {
                failures.push(`${question.id}/L${level}/answered: learner choice easyJa ${index}`);
                if (explicitRegressionIds.has(question.id)) explicit[question.id] = false;
              }
              const residualCopy = choice.querySelector('.choice-copy')?.cloneNode(true);
              residualCopy?.querySelectorAll('.choice-ja, [data-learning-component="choice-translation"]')
                .forEach((element) => element.remove());
              if (!residualCopy || residualCopy.textContent.trim() !== '' || residualCopy.children.length !== 0) {
                failures.push(`${question.id}/L${level}/answered: unexpected learner choice copy residue ${index}`);
                if (explicitRegressionIds.has(question.id)) explicit[question.id] = false;
              }
              const sourceChoice = question.choices[index];
              if (sourceChoice.text.easyJa !== sourceChoice.text.ja) {
                const easyJaAttributes = [choice, ...choice.querySelectorAll('*')].flatMap((element) =>
                  [...element.attributes].filter((attribute) => attribute.value.includes(sourceChoice.text.easyJa)));
                const unsupportedContent = choice.cloneNode(true);
                unsupportedContent.querySelectorAll('.choice-letter, .choice-ja, [data-learning-component="choice-translation"]')
                  .forEach((element) => element.remove());
                if (unsupportedContent.textContent.includes(sourceChoice.text.easyJa) || easyJaAttributes.length) {
                  failures.push(`${question.id}/L${level}/answered: choice easyJa residual-content/attribute ${index}`);
                  if (explicitRegressionIds.has(question.id)) explicit[question.id] = false;
                }
              }
          }
          const explanationEasy = answeredHost.querySelector('.easy-explanation');
          if ((level === 3 && !explanationEasy?.textContent.includes(question.explanation.easyJa))
              || (level !== 3 && explanationEasy)) {
            failures.push(`${question.id}/L${level}/answered: explanation easyJa support`);
          }
        }
      }
      return { pilotCount: pilot.length, preCases, answeredCases, failures, explicit, samePattern, correlatedQuestionIds };
    }""")
    if leak_matrix['failures']:
        print(json.dumps(leak_matrix['failures'], ensure_ascii=False, indent=2), flush=True)
    record(
        checks,
        'pilot_16_by_level_0_to_3_preanswer_and_answered_choice_easy_ja_absent',
        leak_matrix['pilotCount'] == 16
        and leak_matrix['preCases'] == 64
        and leak_matrix['answeredCases'] == 64
        and not leak_matrix['failures'],
    )
    record(
        checks,
        'choice_easy_ja_source_correlation_reported',
        len(leak_matrix['samePattern']) == 16
        and leak_matrix['correlatedQuestionIds'] == ['q045', 'q055', 'q078', 'q079'],
    )
    for regression_id in ('q045', 'q055', 'q078', 'q079'):
        record(checks, f'{regression_id}_choice_easy_ja_absent_before_and_after', leak_matrix['explicit'].get(regression_id) is True)

    # Repeat the complete 16 x 4 matrix through the production integration
    # boundary. LivestockApp.render() replaces #app with the real study view and
    # binds its production event handlers; the retry assertion exercises one of
    # those handlers for every answered case.
    production_matrix = page.evaluate("""() => {
      const pilot = LivestockApp.QUESTIONS.filter((question) => question.schemaVersion === '0.4.0');
      const failures = [];
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
          id: `production-${question.id}-${level}`,
          kind: 'daily',
          questionIds: [question.id],
          index: 0,
          selectedChoiceId: answered ? question.correctChoiceId : null,
          answered,
          startedQuestionAt: performance.now(),
          supportLevel: level,
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
          retryOfHistoryId: null,
          isRetryWithoutSupport: false,
          confidence: answered ? 'sure' : null,
          pendingReason: null,
          completed: false,
        };
      };

      const beforeFailure = (question, level, message) => failures.push(`${question.id}/L${level}/before: ${message}`);
      const afterFailure = (question, level, message) => failures.push(`${question.id}/L${level}/after: ${message}`);
      Object.assign(LivestockApp.runtime.state.settings, {
        studySupportMode: 'guided',
        showVocabulary: true,
        showQuestionPattern: true,
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
          if (!card || choices.length !== question.choices.length) beforeFailure(question, level, 'production study card/choices');
          if (document.querySelectorAll('[data-learning-component="choice-easy-japanese"], .choice-easy-japanese').length) {
            beforeFailure(question, level, 'choice easyJa mounted');
          }
          if (document.querySelector('[data-learning-component="answer-explanation"], [data-learning-component="wrong-choice-explanation"], .answer-panel, .choice-review, .memory-point, .choice-button.correct, .choice-button.wrong')) {
            beforeFailure(question, level, 'answer-only material or result class mounted');
          }
          for (const element of [document.body, ...document.body.querySelectorAll('*')]) {
            for (const attribute of element.attributes) {
              if (attribute.name !== 'data-choice' && attribute.value === question.correctChoiceId) {
                beforeFailure(question, level, `correctChoiceId mounted in ${attribute.name}`);
              }
            }
          }
          const questionEasy = document.querySelector('.meaning-stage .support-box:not(.id) p[lang="ja"]');
          if ((level === 3 && questionEasy?.textContent !== question.question.easyJa) || (level !== 3 && questionEasy)) {
            beforeFailure(question, level, 'question easyJa boundary');
          }
          const expectedQuestionReadings = level > 0
            ? (question.question.rubyJa ?? []).filter((segment) => segment.reading).length
            : 0;
          if (document.querySelectorAll('.question-text rt').length !== expectedQuestionReadings) {
            beforeFailure(question, level, 'question ruby boundary');
          }
          const questionTranslations = document.querySelectorAll('.meaning-stage [data-learning-component="indonesian-translation"]');
          const choiceTranslations = document.querySelectorAll('.choice-button [data-learning-component="choice-translation"]');
          if (questionTranslations.length !== (level === 3 ? 1 : 0)) beforeFailure(question, level, 'question ID boundary');
          if (choiceTranslations.length !== (level === 3 ? question.choices.length : 0)) beforeFailure(question, level, 'choice ID boundary');

          const historyId = `production-history-${question.id}-${level}`;
          LivestockApp.runtime.state.history.push({
            id: historyId,
            sessionId: LivestockApp.runtime.session.id,
            questionId: question.id,
            correct: true,
          });
          LivestockApp.runtime.session = newSession(question, level, true);
          LivestockApp.render();
          afterCases += 1;

          if (document.querySelectorAll('[data-learning-component="choice-easy-japanese"], .choice-easy-japanese').length) {
            afterFailure(question, level, 'choice easyJa mounted');
          }
          if (document.querySelectorAll('[data-learning-component="answer-explanation"]').length !== 1) {
            afterFailure(question, level, 'correct explanation missing');
          }
          if (document.querySelectorAll('.choice-review-item').length !== question.choices.length) {
            afterFailure(question, level, 'choice rationale count');
          }
          const answeredChoiceTranslations = document.querySelectorAll('.choice-button [data-learning-component="choice-translation"]');
          if (answeredChoiceTranslations.length !== (level === 3 ? question.choices.length : 0)) {
            afterFailure(question, level, 'choice ID boundary');
          }
          const retry = document.querySelector('[data-retry-without-support]');
          if (level === 0) {
            if (retry || document.querySelectorAll('.japanese-only-card').length !== 1) {
              afterFailure(question, level, 'Level 0 must already be Japanese-only without another retry');
            }
          } else if (!retry) {
            afterFailure(question, level, 'retry control missing');
          } else {
            retry.click();
            const retrySession = LivestockApp.runtime.session;
            if (retrySession?.supportLevel !== 0
                || retrySession?.isRetryWithoutSupport !== true
                || document.querySelectorAll('.japanese-only-card').length !== 1
                || document.querySelector('.japanese-only-card [lang="id"], .japanese-only-card ruby rt, .japanese-only-card [data-learning-component]')) {
              afterFailure(question, level, 'production retry is not strict Level 0');
            }
          }
          LivestockApp.runtime.state.history.length = original.historyLength;
        }
      }

      LivestockApp.runtime.state.history.length = original.historyLength;
      Object.assign(LivestockApp.runtime.state.settings, original.settings);
      LivestockApp.runtime.view = original.view;
      LivestockApp.runtime.session = original.session;
      LivestockApp.runtime.lastMockResult = original.lastMockResult;
      LivestockApp.render();
      return { pilotCount: pilot.length, beforeCases, afterCases, failures };
    }""")
    if production_matrix['failures']:
        print(json.dumps(production_matrix['failures'], ensure_ascii=False, indent=2), flush=True)
    record(
        checks,
        'production_path_pilot_16_by_level_before_64_after_64',
        production_matrix['pilotCount'] == 16
        and production_matrix['beforeCases'] == 64
        and production_matrix['afterCases'] == 64
        and not production_matrix['failures'],
    )

    mode_contract = page.evaluate("""() => {
      const state = LivestockApp.defaultState();
      const question = LivestockApp.QUESTIONS.find((item) => item.id === 'q001');
      state.settings.studySupportMode = 'guided';
      state.settings.preferredSupportLevel = 1;
      const guidedWithLegacyTrue = LivestockApp.resolvedSupportLevel(state, question, 'daily');
      const guidedWithLegacyFalse = LivestockApp.resolvedSupportLevel(state, question, 'daily');
      state.settings.studySupportMode = 'adaptive';
      delete state.mastery[question.id];
      const adaptiveNew = LivestockApp.resolvedSupportLevel(state, question, 'daily');
      state.mastery[question.id] = { questionId: question.id, factIds: question.sourceFactIds, stage: 2 };
      const adaptiveStage2 = LivestockApp.resolvedSupportLevel(state, question, 'daily');
      state.mastery[question.id].stage = 3;
      const adaptiveStage3 = LivestockApp.resolvedSupportLevel(state, question, 'daily');
      state.mastery[question.id].stage = 4;
      const adaptiveStage4 = LivestockApp.resolvedSupportLevel(state, question, 'daily');
      state.settings.studySupportMode = 'japanese_only';
      const japaneseOnly = LivestockApp.resolvedSupportLevel(state, question, 'daily');
      state.settings.studySupportMode = 'adaptive';
      const mock = LivestockApp.resolvedSupportLevel(state, question, 'mock');
      return { guidedWithLegacyTrue, guidedWithLegacyFalse, adaptiveNew, adaptiveStage2, adaptiveStage3, adaptiveStage4, japaneseOnly, mock };
    }""")
    record(checks, 'support_mode_contract_guided_adaptive_japanese_only', mode_contract == {
        'guidedWithLegacyTrue': 1,
        'guidedWithLegacyFalse': 1,
        'adaptiveNew': 3,
        'adaptiveStage2': 2,
        'adaptiveStage3': 1,
        'adaptiveStage4': 0,
        'japaneseOnly': 0,
        'mock': 0,
    })

    settings_contract = page.evaluate("""() => {
      const previousView = LivestockApp.runtime.view;
      LivestockApp.runtime.view = 'settings';
      Object.assign(LivestockApp.runtime.state.settings, { studySupportMode: 'guided', preferredSupportLevel: 2 });
      LivestockApp.render();
      const guidedLevel = document.querySelector('[data-setting-level]');
      const legacySelectors = [
        '[data-setting-checkbox="automaticSupport"]',
        '[data-setting-checkbox="showFurigana"]',
        '[data-setting-checkbox="showEasyJapanese"]',
        '[data-setting-checkbox="showIndonesian"]',
      ];
      const legacyControls = legacySelectors.some((selector) => document.querySelector(selector));
      LivestockApp.runtime.state.settings.studySupportMode = 'adaptive';
      LivestockApp.render();
      const adaptiveLevel = document.querySelector('[data-setting-level]');
      const result = {
        guidedLevelEnabled: Boolean(guidedLevel && !guidedLevel.disabled),
        adaptiveLevelDisabled: Boolean(adaptiveLevel?.disabled),
        legacyControls,
      };
      LivestockApp.runtime.view = previousView;
      LivestockApp.render();
      return result;
    }""")
    record(checks, 'settings_ui_exposes_mode_and_guided_level_without_legacy_toggles', settings_contract == {
        'guidedLevelEnabled': True,
        'adaptiveLevelDisabled': True,
        'legacyControls': False,
    })

    # Level 2 starts with furigana, terminology, and intent. Full-question and
    # choice translations are available but remain closed until the learner asks.
    page.evaluate("""() => {
      Object.assign(LivestockApp.runtime.state.settings, {
        studySupportMode: 'guided', preferredSupportLevel: 2,
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
    'choiceEasyJapaneseCorrelation': {
        'preCases': leak_matrix['preCases'],
        'answeredCases': leak_matrix['answeredCases'],
        'samePattern': leak_matrix['samePattern'],
        'correlatedQuestionIds': leak_matrix['correlatedQuestionIds'],
    },
    'productionPath': {
        'pilotCount': production_matrix['pilotCount'],
        'beforeCases': production_matrix['beforeCases'],
        'afterCases': production_matrix['afterCases'],
        'failures': production_matrix['failures'],
    },
    'screenshots': sorted(path.name for path in SHOTS.glob('*.png')),
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
sys.exit(1 if failed else 0)
