import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID, webcrypto } from 'node:crypto';

function createIndexedDbStub(records, controls) {
  let initialized = false;
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  return {
    open() {
      const request = {};
      queueMicrotask(() => {
        const database = {
          objectStoreNames: { contains: () => initialized },
          createObjectStore: () => { initialized = true; },
          close: () => {},
          transaction: () => {
            const transaction = {};
            transaction.objectStore = () => ({
              get: (key) => {
                const getRequest = {};
                queueMicrotask(() => {
                  getRequest.result = clone(records.get(key));
                  getRequest.onsuccess?.();
                  queueMicrotask(() => transaction.oncomplete?.());
                });
                return getRequest;
              },
              put: (value, key) => {
                // Make revision 1 slower so this test detects unordered writes:
                // without the production write queue, revision 1 would win last.
                const delay = controls.indexedDbWriteDelayMs ?? (value.revision === 1 ? 10 : 0);
                setTimeout(() => {
                  if (controls.failIndexedDbWrites) {
                    transaction.error = new Error('Simulated IndexedDB write failure');
                    transaction.onerror?.();
                    return;
                  }
                  records.set(key, clone(value));
                  transaction.oncomplete?.();
                }, delay);
              },
            });
            return transaction;
          },
        };
        request.result = database;
        if (!initialized) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

async function loadApp(options = {}) {
  const source = await readFile(new URL('../build/app.js', import.meta.url), 'utf8');
  const storage = options.storage ?? new Map();
  const indexedDbRecords = options.indexedDbRecords ?? new Map();
  const controls = options.controls ?? {
    failLocalStorageWrites: false,
    failIndexedDbWrites: false,
    indexedDbWriteDelayMs: undefined,
  };
  const indexedDB = createIndexedDbStub(indexedDbRecords, controls);
  const noop = () => {};
  const windowStub = {
    addEventListener: noop,
    clearInterval,
    setInterval,
    setTimeout,
    scrollTo: noop,
    confirm: () => true,
    prompt: () => null,
    indexedDB,
  };
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Map,
    Set,
    Promise,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    AggregateError,
    Blob,
    URL,
    TextEncoder,
    TextDecoder,
    encodeURIComponent,
    decodeURIComponent,
    structuredClone,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    crypto: { ...webcrypto, randomUUID },
    performance: { now: () => 1000 },
    navigator: { onLine: true },
    location: { protocol: 'http:' },
    indexedDB,
    window: windowStub,
    document: {
      addEventListener: noop,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ click: noop, remove: noop, style: {}, set href(_) {}, set download(_) {} }),
      body: { append: noop },
      documentElement: { lang: '', dataset: {} },
      title: '',
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        if (controls.failLocalStorageWrites) throw new Error('Simulated localStorage write failure');
        storage.set(key, String(value));
      },
      removeItem: (key) => storage.delete(key),
    },
  };
  windowStub.window = windowStub;
  windowStub.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'app.js' });
  return { app: sandbox.LivestockApp, storage, indexedDbRecords, controls };
}

const { app, indexedDbRecords } = await loadApp();

test('temporary PR review build exposes all 80 source-checked questions', () => {
  const state = app.defaultState();
  assert.equal(app.activeQuestions(state).length, 80);
  state.settings.reviewContentEnabled = false;
  assert.equal(app.activeQuestions(state).length, 0, 'production gate must hide all non-approved questions');
});

test('daily queue returns ten unique questions', () => {
  const state = app.defaultState();
  const queue = app.buildDailyQueue(state, 10);
  assert.equal(queue.length, 10);
  assert.equal(new Set(queue).size, 10);
});

test('wrong answer schedules near-term review and records reason-ready history', () => {
  const state = app.defaultState();
  const question = app.QUESTIONS[0];
  const answeredAt = new Date('2026-08-12T00:00:00.000Z');
  const wrong = question.choices.find((choice) => choice.id !== question.correctChoiceId).id;
  const entry = app.recordAnswer(state, question, {
    sessionId: 'session-test',
    sessionKind: 'daily',
    selectedChoiceId: wrong,
    elapsedMs: 20_000,
    usedEasyJapanese: true,
    usedIndonesian: true,
    usedFurigana: true,
    supportLevel: 3,
    reason: 'knowledge',
    confidence: 'unsure',
    answeredAt,
  });
  assert.equal(entry.correct, false);
  assert.equal(state.mastery[question.id].stage, 0);
  assert.equal(state.mastery[question.id].dueAt, '2026-08-12T00:10:00.000Z');
  assert.equal(entry.reason, 'knowledge');
});

test('independent correct answers raise mastery and reduce support', () => {
  const state = app.defaultState();
  const question = app.QUESTIONS[1];
  for (let index = 0; index < 4; index += 1) {
    app.recordAnswer(state, question, {
      sessionId: `session-${index}`,
      sessionKind: 'daily',
      selectedChoiceId: question.correctChoiceId,
      elapsedMs: 25_000,
      usedEasyJapanese: false,
      usedIndonesian: false,
      usedFurigana: false,
      supportLevel: 0,
      reason: null,
      confidence: 'sure',
      answeredAt: new Date(`2026-08-${12 + index}T00:00:00.000Z`),
    });
  }
  assert.equal(state.mastery[question.id].stage, 4);
  assert.equal(app.effectiveSupportLevel(state, question), 0);
});

test('adaptive support fades after repeated success without equating supported and unsupported attempts', () => {
  const state = app.defaultState();
  const question = app.QUESTIONS[3];
  state.settings.studySupportMode = 'adaptive';
  const observedLevels = [];

  for (let index = 0; index < 6; index += 1) {
    const level = app.resolvedSupportLevel(state, question, 'daily');
    const policy = app.supportPolicyForLevel(level);
    observedLevels.push(level);
    app.recordAnswer(state, question, {
      sessionId: `adaptive-${index}`,
      sessionKind: 'daily',
      selectedChoiceId: question.correctChoiceId,
      elapsedMs: 25_000,
      usedEasyJapanese: policy.showEasyJapaneseInitially,
      usedIndonesian: policy.showQuestionTranslationInitially || policy.showChoiceTranslationsInitially,
      usedFurigana: policy.showFuriganaInitially,
      openedKeywords: policy.showKeywordsInitially,
      openedQuestionTranslation: policy.showQuestionTranslationInitially,
      openedChoiceTranslations: policy.showChoiceTranslationsInitially,
      supportLevel: level,
      reason: null,
      confidence: 'sure',
      answeredAt: new Date(`2026-08-${12 + index}T00:00:00.000Z`),
    });
  }

  assert.deepEqual(observedLevels, [3, 3, 2, 2, 1, 1]);
  assert.equal(state.mastery[question.id].stage, 4);
  assert.equal(app.resolvedSupportLevel(state, question, 'daily'), 0);
});

test('mock exam uses 50 unique questions and grades answers', () => {
  const state = app.defaultState();
  const draft = app.createMockDraft(state, 60);
  assert.equal(draft.questionIds.length, 50);
  assert.equal(new Set(draft.questionIds).size, 50);
  for (const questionId of draft.questionIds.slice(0, 12)) {
    const question = app.questionById(questionId);
    draft.answers[questionId] = question.correctChoiceId;
  }
  const result = app.gradeMock(draft, new Date(new Date(draft.startedAt).getTime() + 120_000));
  assert.equal(result.total, 50);
  assert.equal(result.correct, 12);
  assert.equal(result.unanswered, 38);
  assert.equal(result.accuracy, 24);
});

test('UI language defaults to Indonesian and can be persisted', () => {
  const state = app.defaultState();
  assert.equal(state.settings.uiLanguage, 'id');
  assert.equal(app.translateUiText('ホーム', 'id'), 'Beranda');
  assert.equal(app.translateUiText('今日の10問を始める', 'id'), 'Mulai 10 soal hari ini');
  assert.equal(app.translateUiText('ホーム', 'ja'), 'ホーム');

  const imported = app.validateImportedState({ settings: { uiLanguage: 'ja' } });
  assert.equal(imported.settings.uiLanguage, 'ja');
  const migrated = app.validateImportedState({ settings: {} });
  assert.equal(migrated.settings.uiLanguage, 'id');
  const supportSettings = app.validateImportedState({
    settings: { uiLanguage: 'ja', studySupportMode: 'guided', automaticSupport: false, preferredSupportLevel: 2 },
  });
  assert.equal(supportSettings.settings.preferredSupportLevel, 2);
  assert.equal('automaticSupport' in supportSettings.settings, false);
});

test('legacy support settings migrate into the current seven-key settings model', () => {
  const japaneseOnly = app.validateImportedState({
    settings: {
      uiLanguage: 'ja',
      automaticSupport: false,
      showFurigana: false,
      showEasyJapanese: false,
      showIndonesian: false,
      showVocabulary: false,
      showQuestionPattern: false,
    },
  });
  assert.equal(japaneseOnly.settings.studySupportMode, 'japanese_only');
  assert.equal(japaneseOnly.settings.preferredSupportLevel, 0);
  assert.deepEqual(
    Object.keys(japaneseOnly.settings).sort(),
    ['dailyQuestionCount', 'preferredSupportLevel', 'reviewContentEnabled', 'showQuestionPattern', 'showVocabulary', 'studySupportMode', 'uiLanguage'].sort(),
  );

  const adaptive = app.validateImportedState({
    settings: { automaticSupport: true, showFurigana: true, showEasyJapanese: true, showIndonesian: true },
  });
  assert.equal(adaptive.settings.studySupportMode, 'adaptive');
  assert.equal(adaptive.settings.preferredSupportLevel, 3);

  const explicitModeWins = app.validateImportedState({
    settings: {
      studySupportMode: 'guided',
      preferredSupportLevel: 2,
      automaticSupport: true,
      showFurigana: false,
      showEasyJapanese: false,
      showIndonesian: false,
    },
  });
  assert.equal(explicitModeWins.settings.studySupportMode, 'guided');
  assert.equal(explicitModeWins.settings.preferredSupportLevel, 2);
});

test('state import rejects unknown or malformed data and rebuilds question-derived history fields', () => {
  const validHistory = {
    id: 'history-1',
    sessionId: 'session-1',
    questionId: 'q001',
    factIds: ['general-001'],
    category: '畜産共通',
    topic: '畜産の概要',
    sessionKind: 'daily',
    selectedChoiceId: 'b',
    correct: false,
    elapsedMs: 1_000,
    usedEasyJapanese: false,
    usedIndonesian: false,
    usedFurigana: false,
    openedKeywords: false,
    openedQuestionTranslation: false,
    openedChoiceTranslations: false,
    openedAnswerIndonesian: false,
    supportLevel: 1,
    knowledgeGap: false,
    japaneseGap: true,
    retryOfHistoryId: null,
    isRetryWithoutSupport: false,
    reason: 'japanese',
    confidence: 'unsure',
    at: '2026-08-12T00:00:00.000Z',
  };

  const imported = app.validateImportedState({ history: [validHistory] });
  assert.deepEqual(Array.from(imported.history[0].factIds), ['general-001']);
  assert.equal(imported.history[0].category, '畜産共通');
  assert.equal(imported.history[0].topic, '畜産の概要');
  assert.notEqual(imported.history[0].factIds, validHistory.factIds, 'derived arrays must be reconstructed');
  assert.equal(
    app.validateImportedState({ history: [{ ...validHistory, elapsedMs: 1_000.5 }] }).history[0].elapsedMs,
    1_000.5,
    'production performance timings may contain fractional milliseconds',
  );

  assert.throws(() => app.validateImportedState({ unexpected: true }), /unexpected/i);
  assert.throws(() => app.validateImportedState({ settings: { showVocabulary: 'yes' } }), /showVocabulary/i);
  assert.throws(() => app.validateImportedState({ settings: { studySupportMode: 'unsafe' } }), /studySupportMode/i);
  assert.throws(() => app.validateImportedState({ settings: { dailyQuestionCount: 11 } }), /dailyQuestionCount/i);
  assert.throws(() => app.validateImportedState({ lastOpenedAt: 'not-an-iso-date' }), /lastOpenedAt/i);
  assert.throws(() => app.validateImportedState({ lastOpenedAt: '2026-02-31T00:00:00.000Z' }), /lastOpenedAt/i);
  assert.throws(() => app.validateImportedState({ lastSessionQuestionIds: Array(81).fill('q001') }), /lastSessionQuestionIds/i);
  assert.throws(() => app.validateImportedState({ history: [{ ...validHistory, questionId: 'q999' }] }), /questionId/i);
  const rebuilt = app.validateImportedState({
    history: [{
      ...validHistory,
      factIds: ['legacy-fact'],
      category: '=HYPERLINK("https:\/\/example.invalid")',
      topic: 'legacy-topic',
      selectedChoiceId: 'a',
      correct: false,
    }],
  });
  assert.deepEqual(Array.from(rebuilt.history[0].factIds), ['general-001']);
  assert.equal(rebuilt.history[0].category, '畜産共通');
  assert.equal(rebuilt.history[0].topic, '畜産の概要');
  assert.equal(rebuilt.history[0].correct, true, 'correct must be rebuilt from the canonical correctChoiceId');
});

test('state import rejects oversized files before reading or parsing their contents', () => {
  assert.doesNotThrow(() => app.assertImportFileSize(app.MAX_IMPORT_BYTES));
  assert.throws(() => app.assertImportFileSize(app.MAX_IMPORT_BYTES + 1), /20 MiB/);
  assert.throws(() => app.assertImportFileSize(Number.NaN), /20 MiB/);
});

test('state import enforces nested caps, finite numbers, enum variants, and safe reconstruction', () => {
  const base = {
    id: 'history-enum', sessionId: 'session-enum', questionId: 'q001', factIds: ['legacy'],
    category: '<img src=x onerror=alert(1)>', topic: '<script>alert(1)</script>',
    sessionKind: 'category', selectedChoiceId: 'a', correct: false, elapsedMs: 100,
    usedEasyJapanese: false, usedIndonesian: false, usedFurigana: false, supportLevel: 0,
    reason: 'calculation', confidence: 'sure', at: '2026-08-12T00:00:00.000Z',
  };
  const imported = app.validateImportedState({
    history: [base],
    reviews: { q001: { status: '要修正', note: '<script>alert(1)</script>', updatedAt: '2026-08-12T00:00:00.000Z' } },
  });
  assert.equal(imported.history[0].category, '畜産共通');
  assert.equal(imported.history[0].topic, '畜産の概要');
  assert.equal(imported.history[0].correct, true);
  assert.equal(imported.history[0].sessionKind, 'category');
  assert.equal(imported.history[0].reason, 'calculation');
  assert.equal(imported.reviews.q001.note, '<script>alert(1)</script>', 'free-form notes remain data and are escaped at render time');

  assert.throws(() => app.validateImportedState({ settings: { dailyQuestionCount: '<img onerror=alert(1)>' } }), /dailyQuestionCount/i);
  assert.throws(() => app.validateImportedState({ revision: Number.MAX_SAFE_INTEGER }), /revision/i);
  assert.equal(app.validateImportedState({ revision: Number.MAX_SAFE_INTEGER - 1 }).revision, Number.MAX_SAFE_INTEGER - 1);
  assert.throws(() => app.validateImportedState({ history: Array(20_001).fill(base) }), /at most 20000/i);
  assert.throws(() => app.validateImportedState({ mockHistory: Array(1_001).fill({}) }), /at most 1000/i);
  assert.throws(() => app.validateImportedState({ history: [{ ...base, elapsedMs: Number.NaN }] }), /elapsedMs/i);
  assert.throws(() => app.validateImportedState({ history: [{ ...base, elapsedMs: Number.POSITIVE_INFINITY }] }), /elapsedMs/i);
  assert.throws(() => app.validateImportedState({ history: [{ ...base, sessionKind: 'invalid' }] }), /sessionKind/i);
  assert.throws(() => app.validateImportedState({ history: [{ ...base, reason: 'invalid' }] }), /reason/i);
  assert.throws(() => app.validateImportedState({
    reviews: Object.fromEntries(Array.from({ length: 81 }, (_, index) => [`q${String(index + 1).padStart(3, '0')}`, {}])),
  }), /reviews.*at most 80/i);
});

test('CSV cells neutralize spreadsheet formulas after leading whitespace and control characters', () => {
  for (const unsafe of [
    '=1+1', '  +cmd', '\t@SUM(A1:A2)', '\r-2+3', '\n=IMPORTDATA("https://example.invalid")',
    '  \tplain text', ' \rplain text', '   \nplain text',
  ]) {
    const encoded = app.csvCell(unsafe);
    const decoded = encoded.startsWith('"') ? encoded.slice(1, -1).replaceAll('""', '"') : encoded;
    assert.equal(decoded.startsWith("'"), true, unsafe);
  }
  assert.equal(app.csvCell('ordinary text'), 'ordinary text');
});

test('approved questions require every applicable automated and human review gate', () => {
  const legacy = structuredClone(app.QUESTIONS.find((question) => question.schemaVersion === '0.3.0'));
  legacy.status = 'approved';
  legacy.prototypeOnly = false;
  Object.assign(legacy.review, {
    content: 'pass', languageJa: 'pass', languageId: 'pass', legalRights: 'pass', approvalByUser: 'approved',
    furigana: 'pass', japaneseLearning: 'pass', answerLeak: 'pass', reviewedAt: '2026-08-13T00:00:00.000Z',
  });
  assert.equal(app.isQuestionApproved(legacy), true);
  legacy.review.languageId = 'pending_native_review';
  assert.equal(app.isQuestionApproved(legacy), false);
  legacy.review.languageId = 'pass';
  legacy.review.reviewedAt = '2026-02-31T00:00:00.000Z';
  assert.equal(app.isQuestionApproved(legacy), false);

  const pilot = structuredClone(app.QUESTIONS.find((question) => question.schemaVersion === '0.4.0'));
  pilot.status = 'approved';
  pilot.prototypeOnly = false;
  Object.assign(pilot.review, {
    content: 'pass', languageJa: 'pass', languageId: 'pass', legalRights: 'pass', approvalByUser: 'approved',
    furigana: 'pass', japaneseLearning: 'pass', answerLeak: 'pass', reviewedAt: '2026-08-13T00:00:00.000Z',
  });
  assert.equal(app.isQuestionApproved(pilot), true);
  pilot.review.answerLeak = 'pending';
  assert.equal(app.isQuestionApproved(pilot), false);
});

test('guided study mode always exposes Japanese-learning supports', () => {
  const state = app.defaultState();
  const question = app.QUESTIONS[0];
  assert.equal(state.settings.studySupportMode, 'guided');
  assert.equal(JSON.stringify(app.supportSettingsForStudy(state, question, 'daily')), JSON.stringify({ showFurigana: true, showEasyJapanese: true, showIndonesian: true }));
});

test('Japanese-only and mock modes hide all learning supports', () => {
  const state = app.defaultState();
  const question = app.QUESTIONS[0];
  state.settings.studySupportMode = 'japanese_only';
  assert.equal(JSON.stringify(app.supportSettingsForStudy(state, question, 'daily')), JSON.stringify({ showFurigana: false, showEasyJapanese: false, showIndonesian: false }));
  state.settings.studySupportMode = 'guided';
  assert.equal(JSON.stringify(app.supportSettingsForStudy(state, question, 'mock')), JSON.stringify({ showFurigana: false, showEasyJapanese: false, showIndonesian: false }));
});

test('support levels 0 through 3 expose only the specified learning aids', () => {
  const level0 = app.supportPolicyForLevel(0);
  assert.equal(level0.showFuriganaInitially, false);
  assert.equal(level0.allowAnswerIndonesian, false);

  const level1 = app.supportPolicyForLevel(1);
  assert.equal(level1.showFuriganaInitially, true);
  assert.equal(level1.compactKeywordHints, true);
  assert.equal(level1.allowQuestionTranslation, false);
  assert.equal(level1.allowAnswerIndonesian, true);

  const level2 = app.supportPolicyForLevel(2);
  assert.equal(level2.showIntent, true);
  assert.equal(level2.showQuestionTranslationInitially, false);
  assert.equal(level2.allowQuestionTranslation, true);
  assert.equal(level2.showChoiceTranslationsInitially, false);

  const level3 = app.supportPolicyForLevel(3);
  assert.equal(level3.showEasyJapaneseInitially, true);
  assert.equal(level3.showQuestionTranslationInitially, true);
  assert.equal(level3.showChoiceTranslationsInitially, true);
});

test('configured modes and mock exams determine the effective support level', () => {
  const state = app.defaultState();
  const question = app.QUESTIONS[0];
  state.settings.studySupportMode = 'adaptive';
  state.settings.preferredSupportLevel = 2;
  assert.equal(app.resolvedSupportLevel(state, question, 'daily'), 3);
  state.mastery[question.id] = { questionId: question.id, factIds: question.sourceFactIds, stage: 2 };
  assert.equal(app.resolvedSupportLevel(state, question, 'daily'), 2);
  assert.equal(app.resolvedSupportLevel(state, question, 'mock'), 0);
  state.settings.studySupportMode = 'japanese_only';
  assert.equal(app.resolvedSupportLevel(state, question, 'daily'), 0);
  state.settings.studySupportMode = 'guided';
  state.settings.preferredSupportLevel = 1;
  assert.equal(app.resolvedSupportLevel(state, question, 'daily'), 1, 'guided must respect the preferred support level');
});

test('an immediate retry without support is recorded without changing mastery scheduling', () => {
  const state = app.defaultState();
  const question = app.QUESTIONS[2];
  const wrong = question.choices.find((choice) => choice.id !== question.correctChoiceId).id;
  const first = app.recordAnswer(state, question, {
    sessionId: 'retry-session',
    sessionKind: 'daily',
    selectedChoiceId: wrong,
    elapsedMs: 30_000,
    usedEasyJapanese: true,
    usedIndonesian: true,
    usedFurigana: true,
    openedKeywords: true,
    openedQuestionTranslation: true,
    openedChoiceTranslations: true,
    supportLevel: 3,
    reason: 'japanese',
    confidence: 'unsure',
    answeredAt: new Date('2026-08-12T00:00:00.000Z'),
  });
  const masteryBeforeRetry = JSON.stringify(state.mastery[question.id]);
  const retry = app.recordAnswer(state, question, {
    sessionId: 'retry-session',
    sessionKind: 'daily',
    selectedChoiceId: question.correctChoiceId,
    elapsedMs: 12_000,
    usedEasyJapanese: false,
    usedIndonesian: false,
    usedFurigana: false,
    supportLevel: 0,
    reason: null,
    confidence: 'sure',
    retryOfHistoryId: first.id,
    isRetryWithoutSupport: true,
    answeredAt: new Date('2026-08-12T00:01:00.000Z'),
  });
  assert.equal(retry.correct, true);
  assert.equal(retry.retryOfHistoryId, first.id);
  assert.equal(retry.isRetryWithoutSupport, true);
  assert.equal(JSON.stringify(state.mastery[question.id]), masteryBeforeRetry);
  assert.equal(app.assessmentHistory(state).length, 1);
  assert.equal(app.overallAccuracy(state), 0, 'retry evidence must not inflate independent accuracy');
});

test('older history imports gain explicit support-usage and gap fields', () => {
  const migrated = app.validateImportedState({
    history: [{
      id: 'legacy', sessionId: 's', questionId: 'q001', factIds: ['general-001'], category: '畜産共通',
      topic: '畜産の概要', sessionKind: 'daily', selectedChoiceId: 'b', correct: false, elapsedMs: 1000,
      usedEasyJapanese: false, usedIndonesian: true, usedFurigana: false, supportLevel: 2,
      reason: 'knowledge', confidence: 'unsure', at: '2026-08-12T00:00:00.000Z',
    }],
  });
  const entry = migrated.history[0];
  assert.equal(entry.openedQuestionTranslation, true);
  assert.equal(entry.openedChoiceTranslations, false);
  assert.equal(entry.knowledgeGap, true);
  assert.equal(entry.japaneseGap, false);
  assert.equal(entry.retryOfHistoryId, null);
});

test('legacy state migrates to the current schema without losing progress or review state', () => {
  const migrated = app.validateImportedState({
    schemaVersion: '0.4.0',
    revision: 12,
    updatedAt: '2026-08-10T00:00:00.000Z',
    mastery: {
      q001: {
        questionId: 'q001', factIds: ['fact-001'], stage: 2, attempts: 3, correct: 2,
        dueAt: '2026-08-20T00:00:00.000Z', lastAnsweredAt: '2026-08-10T00:00:00.000Z',
        lastCorrect: true, lastSupportLevel: 2,
      },
    },
    reviews: { q001: { status: '承認候補', note: '既存メモ', updatedAt: '2026-08-10T00:00:00.000Z' } },
    settings: { uiLanguage: 'ja' },
    lastSessionQuestionIds: ['q001'],
  });

  assert.equal(migrated.schemaVersion, '0.6.0');
  assert.equal(migrated.revision, 12);
  assert.equal(migrated.mastery.q001.stage, 2);
  assert.equal(migrated.mastery.q001.dueAt, '2026-08-20T00:00:00.000Z');
  assert.equal(migrated.reviews.q001.status, '承認候補');
  assert.equal(migrated.reviews.q001.note, '既存メモ');
  assert.equal(migrated.settings.uiLanguage, 'ja');
  assert.deepEqual(Array.from(migrated.lastSessionQuestionIds), ['q001']);
});

test('consecutive saves retain the newest revision in IndexedDB and fallback persistence', async () => {
  const state = app.defaultState();
  const firstSave = app.saveState(state);
  state.settings.uiLanguage = 'ja';
  const secondSave = app.saveState(state);
  assert.equal(state.revision, 0, 'metadata must not advance before a durable backend succeeds');
  const [firstResult, secondResult] = await Promise.all([firstSave, secondSave]);

  assert.equal(firstResult.revision, 1);
  assert.equal(secondResult.revision, 2);
  assert.equal(state.revision, 2);
  assert.ok(Date.parse(state.updatedAt) > 0);
  assert.equal(indexedDbRecords.get('state-v0.4').revision, 2);
  assert.equal(indexedDbRecords.get('state-v0.4').settings.uiLanguage, 'ja');
  const loaded = await app.loadState();
  assert.equal(loaded.revision, 2);
  assert.equal(loaded.settings.uiLanguage, 'ja');
});

test('durable saves succeed when either localStorage or IndexedDB remains available', async () => {
  const indexedOnly = await loadApp();
  const indexedState = indexedOnly.app.defaultState();
  await indexedOnly.app.saveState(indexedState);
  const staleFallback = indexedOnly.storage.get('livestock2-state-v0.4');
  indexedOnly.controls.failLocalStorageWrites = true;
  indexedState.settings.uiLanguage = 'ja';
  const indexedResult = await indexedOnly.app.saveState(indexedState);

  assert.equal(indexedResult.localStorage, false);
  assert.equal(indexedResult.indexedDb, true);
  assert.equal(indexedState.revision, 2);
  assert.equal(indexedOnly.storage.get('livestock2-state-v0.4'), staleFallback);
  assert.equal(indexedOnly.indexedDbRecords.get('state-v0.4').revision, 2);
  assert.equal((await indexedOnly.app.loadState()).settings.uiLanguage, 'ja');

  const fallbackOnly = await loadApp();
  const fallbackState = fallbackOnly.app.defaultState();
  await fallbackOnly.app.saveState(fallbackState);
  const staleIndexed = JSON.stringify(fallbackOnly.indexedDbRecords.get('state-v0.4'));
  fallbackOnly.controls.failIndexedDbWrites = true;
  fallbackState.settings.uiLanguage = 'ja';
  const fallbackResult = await fallbackOnly.app.saveState(fallbackState);

  assert.equal(fallbackResult.localStorage, true);
  assert.equal(fallbackResult.indexedDb, false);
  assert.equal(fallbackState.revision, 2);
  assert.equal(JSON.stringify(fallbackOnly.indexedDbRecords.get('state-v0.4')), staleIndexed);
  assert.equal(JSON.parse(fallbackOnly.storage.get('livestock2-state-v0.4')).revision, 2);
  assert.equal((await fallbackOnly.app.loadState()).settings.uiLanguage, 'ja');
});

test('dual-backend save failure preserves caller metadata and existing durable state', async () => {
  const environment = await loadApp();
  const current = environment.app.defaultState();
  await environment.app.saveState(current);
  const fallbackBefore = environment.storage.get('livestock2-state-v0.4');
  const indexedBefore = JSON.stringify(environment.indexedDbRecords.get('state-v0.4'));
  const currentBefore = JSON.stringify(current);

  const candidate = environment.app.validateImportedState({
    revision: Number.MAX_SAFE_INTEGER - 1,
    settings: { uiLanguage: 'ja' },
  });
  candidate.revision = current.revision;
  const candidateRevision = candidate.revision;
  const candidateUpdatedAt = candidate.updatedAt;
  const candidateLastOpenedAt = candidate.lastOpenedAt;
  environment.controls.failLocalStorageWrites = true;
  environment.controls.failIndexedDbWrites = true;

  await assert.rejects(
    environment.app.saveState(candidate),
    /localStorage or IndexedDB/,
  );
  assert.equal(candidate.revision, candidateRevision);
  assert.equal(candidate.updatedAt, candidateUpdatedAt);
  assert.equal(candidate.lastOpenedAt, candidateLastOpenedAt);
  assert.equal(JSON.stringify(current), currentBefore);
  assert.equal(environment.storage.get('livestock2-state-v0.4'), fallbackBefore);
  assert.equal(JSON.stringify(environment.indexedDbRecords.get('state-v0.4')), indexedBefore);
});

test('import revisions are rebased onto a safe local sequence and survive reload', async () => {
  const environment = await loadApp();
  const current = environment.app.defaultState();
  await environment.app.saveState(current);

  const imported = environment.app.validateImportedState({
    revision: Number.MAX_SAFE_INTEGER - 1,
    settings: { uiLanguage: 'ja' },
  });
  assert.equal(imported.revision, Number.MAX_SAFE_INTEGER - 1, 'the source revision remains parseable for compatibility');
  imported.revision = current.revision;
  const importedSave = await environment.app.saveState(imported);
  const followupSave = await environment.app.saveState(imported);

  assert.equal(importedSave.revision, 2);
  assert.equal(followupSave.revision, 3);
  assert.equal(imported.revision, 3);
  assert.equal(Number.isSafeInteger(imported.revision), true);
  const loaded = await environment.app.loadState();
  assert.equal(loaded.revision, 3);
  assert.equal(loaded.settings.uiLanguage, 'ja');
});

test('saveState rejects instead of advancing beyond the safe-integer revision boundary', async () => {
  const environment = await loadApp();
  const state = environment.app.defaultState();
  await environment.app.saveState(state);
  const fallbackBefore = environment.storage.get('livestock2-state-v0.4');
  const indexedBefore = JSON.stringify(environment.indexedDbRecords.get('state-v0.4'));
  state.revision = Number.MAX_SAFE_INTEGER;
  const updatedAtBefore = state.updatedAt;
  const lastOpenedAtBefore = state.lastOpenedAt;

  await assert.rejects(environment.app.saveState(state), /incremented safely/);
  assert.equal(state.revision, Number.MAX_SAFE_INTEGER);
  assert.equal(state.updatedAt, updatedAtBefore);
  assert.equal(state.lastOpenedAt, lastOpenedAtBefore);
  assert.equal(environment.storage.get('livestock2-state-v0.4'), fallbackBefore);
  assert.equal(JSON.stringify(environment.indexedDbRecords.get('state-v0.4')), indexedBefore);
});

test('import barrier prevents delayed old-runtime saves and concurrent imports from overwriting the candidate', async () => {
  const environment = await loadApp({
    controls: {
      failLocalStorageWrites: false,
      failIndexedDbWrites: false,
      indexedDbWriteDelayMs: 40,
    },
  });
  await environment.app.boot();
  await environment.app.persist();
  const baselineRevision = environment.app.runtime.state.revision;

  const candidate = environment.app.defaultState();
  candidate.revision = Number.MAX_SAFE_INTEGER - 1;
  candidate.settings.uiLanguage = 'id';
  candidate.settings.dailyQuestionCount = 15;
  const candidateText = JSON.stringify({ state: candidate });
  let releaseFileText;
  const delayedText = new Promise((resolve) => { releaseFileText = resolve; });
  const importPromise = environment.app.importProgress({
    size: Buffer.byteLength(candidateText),
    text: () => delayedText,
  });

  const oldRuntime = environment.app.runtime.state;
  oldRuntime.settings.uiLanguage = 'ja';
  oldRuntime.settings.dailyQuestionCount = 5;
  let postStartPersistSettled = false;
  const postStartPersist = environment.app.persist().then(() => {
    postStartPersistSettled = true;
  });

  const ignoredCandidate = environment.app.defaultState();
  ignoredCandidate.settings.dailyQuestionCount = 20;
  const ignoredText = JSON.stringify({ state: ignoredCandidate });
  await environment.app.importProgress({
    size: Buffer.byteLength(ignoredText),
    text: async () => ignoredText,
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(postStartPersistSettled, false, 'ordinary persistence must wait for the active import transaction');

  releaseFileText(candidateText);
  await Promise.all([importPromise, postStartPersist]);

  assert.notEqual(environment.app.runtime.state, oldRuntime);
  assert.equal(environment.app.runtime.state.settings.uiLanguage, 'id');
  assert.equal(environment.app.runtime.state.settings.dailyQuestionCount, 15);
  assert.equal(environment.app.runtime.state.revision, baselineRevision + 2);
  const fallback = JSON.parse(environment.storage.get('livestock2-state-v0.4'));
  const indexed = environment.indexedDbRecords.get('state-v0.4');
  assert.equal(fallback.settings.dailyQuestionCount, 15);
  assert.equal(indexed.settings.dailyQuestionCount, 15);
  assert.equal(fallback.revision, baselineRevision + 2);
  assert.equal(indexed.revision, baselineRevision + 2);
  const reloaded = await environment.app.loadState();
  assert.equal(reloaded.settings.uiLanguage, 'id');
  assert.equal(reloaded.settings.dailyQuestionCount, 15);
  assert.equal(reloaded.revision, baselineRevision + 2);
});
