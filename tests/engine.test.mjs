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
