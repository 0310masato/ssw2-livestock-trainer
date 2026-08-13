import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID, webcrypto } from 'node:crypto';

async function loadApp() {
  const source = await readFile(new URL('../build/app.js', import.meta.url), 'utf8');
  const storage = new Map();
  const noop = () => {};
  const windowStub = {
    addEventListener: noop,
    clearInterval,
    setInterval,
    setTimeout,
    scrollTo: noop,
    confirm: () => true,
    prompt: () => null,
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
    window: windowStub,
    document: {
      addEventListener: noop,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ click: noop, remove: noop, style: {}, set href(_) {}, set download(_) {} }),
      body: { append: noop },
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
  windowStub.window = windowStub;
  windowStub.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'app.js' });
  return sandbox.LivestockApp;
}

const app = await loadApp();

test('internal review build exposes all 80 source-checked questions', () => {
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
  state.settings.automaticSupport = true;
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
  assert.equal(supportSettings.settings.automaticSupport, false);
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
  state.settings.automaticSupport = false;
  state.settings.preferredSupportLevel = 2;
  assert.equal(app.resolvedSupportLevel(state, question, 'daily'), 2);
  assert.equal(app.resolvedSupportLevel(state, question, 'mock'), 0);
  state.settings.studySupportMode = 'japanese_only';
  assert.equal(app.resolvedSupportLevel(state, question, 'daily'), 0);
  state.settings.studySupportMode = 'guided';
  state.settings.automaticSupport = true;
  assert.equal(app.resolvedSupportLevel(state, question, 'daily'), 3);
  state.settings.automaticSupport = false;
  state.settings.preferredSupportLevel = 1;
  assert.equal(app.resolvedSupportLevel(state, question, 'daily'), 1, 'fixed level must be respected when automatic support is off');
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
      id: 'legacy', sessionId: 's', questionId: 'q001', factIds: ['fact-001'], category: '畜産共通',
      topic: 'test', sessionKind: 'daily', selectedChoiceId: 'a', correct: false, elapsedMs: 1000,
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

test('save revisions state before asynchronous IndexedDB persistence', async () => {
  const state = app.defaultState();
  const pending = app.saveState(state);
  assert.equal(state.revision, 1);
  assert.ok(Date.parse(state.updatedAt) > 0);
  await pending;
});
