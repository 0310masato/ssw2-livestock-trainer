import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = async (name) => JSON.parse(await readFile(new URL(`../public/${name}`, import.meta.url), 'utf8'));
const questions = await load('questions-alpha-80.json');
const facts = await load('source-facts.json');
const glossary = await load('glossary-ja-id.json');
const pilotIds = new Set(['q001', 'q004', 'q008', 'q013', 'q016', 'q029', 'q033', 'q035', 'q044', 'q045', 'q049', 'q055', 'q057', 'q078', 'q079', 'q080']);
const hasHan = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆ヶ]/;
const pilotTermAnnotation = /（[^（）]*[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆ヶ][^（）]*）/gu;
const pilotTermWithReading = /^（[^（）]*[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆ヶ][^（）]*／[^（）]+）$/u;

function assertPilotTermAnnotation(value, label) {
  const annotations = [...value.matchAll(pilotTermAnnotation)].map((match) => match[0]);
  assert.ok(annotations.length > 0, `${label}: Indonesian text needs a Japanese term annotation`);
  for (const annotation of annotations.filter((item) => hasHan.test(item))) {
    assert.match(annotation, pilotTermWithReading, `${label}: kanji annotation needs 日本語／reading`);
  }
}

function localizedTexts(question) {
  return [
    ['question', question.question],
    ['explanation', question.explanation],
    ...question.choices.map((choice) => [`choice:${choice.id}`, choice.text]),
    ...Object.entries(question.choiceRationales).map(([id, value]) => [`rationale:${id}`, value]),
    ['lessonObjective', question.learningSupport.lessonObjective],
    ['memoryPoint', question.learningSupport.memoryPoint],
    ...(question.learningSupport.intentOverride ? [['intentOverride', question.learningSupport.intentOverride]] : []),
  ];
}

test('content counts and IDs are stable', () => {
  assert.equal(questions.length, 80);
  assert.equal(facts.length, 100);
  assert.equal(glossary.length, 63);
  assert.equal(new Set(questions.map((item) => item.id)).size, 80);
  assert.equal(new Set(facts.map((item) => item.factId)).size, 100);
  assert.equal(new Set(glossary.map((item) => item.id)).size, 63);
});

test('pilot pre-answer keywords avoid known answer-leak combinations', () => {
  const expectedNeutralKeys = new Map([
    ['q016', ['g014']],
    ['q055', ['g056']],
    ['q078', ['g063']],
    ['q079', ['g052']],
    ['q080', ['g002']],
  ]);
  for (const [questionId, expected] of expectedNeutralKeys) {
    const question = questions.find((item) => item.id === questionId);
    assert.deepEqual(question.learningSupport.keyTermIds, expected, `${questionId}: pre-answer keyword leak regression`);
  }
});

test('questions preserve approval gate and source traceability', () => {
  const factIds = new Set(facts.map((item) => item.factId));
  for (const question of questions) {
    assert.equal(question.status, 'source_checked');
    assert.equal(question.prototypeOnly, true);
    assert.ok(question.source.sourceId);
    assert.ok(Number.isInteger(question.source.pdfPage) && question.source.pdfPage > 0);
    assert.ok(question.source.section);
    assert.ok(question.sourceFactIds.length >= 1);
    for (const factId of question.sourceFactIds) assert.ok(factIds.has(factId), `${question.id}: ${factId}`);
    assert.equal(question.choices.length, 4);
    assert.ok(question.choices.some((choice) => choice.id === question.correctChoiceId));
    assert.equal(question.rights.originalWording, true);
    assert.equal(question.rights.usesOfficialImage, false);
    assert.equal(question.rights.usesCompetitorContent, false);
    for (const text of [question.question, question.explanation, ...question.choices.map((choice) => choice.text)]) {
      assert.ok(text.ja && text.easyJa && text.id, `${question.id}: multilingual text missing`);
    }
  }
});

test('pedagogical question pack contains ruby, vocabulary, and bilingual choice explanations', () => {
  for (const question of questions) {
    assert.equal(question.schemaVersion, pilotIds.has(question.id) ? '0.4.0' : '0.3.0');
    assert.ok(Array.isArray(question.question.rubyJa) && question.question.rubyJa.length > 0, question.id + ': question ruby missing');
    assert.ok(Array.isArray(question.explanation.rubyJa) && question.explanation.rubyJa.length > 0, question.id + ': explanation ruby missing');
    assert.ok(question.learningSupport && question.learningSupport.questionPattern, question.id + ': question pattern missing');
    assert.ok(question.learningSupport.keyTermIds.length >= 1, question.id + ': vocabulary missing');
    assert.equal(Object.keys(question.choiceRationales).length, question.choices.length, question.id + ': choice explanations missing');
    for (const choice of question.choices) {
      assert.ok(choice.text.rubyJa.length > 0, question.id + '/' + choice.id + ': choice ruby missing');
      const rationale = question.choiceRationales[choice.id];
      assert.ok(rationale && rationale.ja && rationale.easyJa && rationale.id, question.id + '/' + choice.id + ': rationale incomplete');
      assert.ok(rationale.rubyJa.length > 0, question.id + '/' + choice.id + ': rationale ruby missing');
    }
  }
});

test('representative pilot has explicit review gates and complete learning fields', () => {
  const pilot = questions.filter((question) => question.schemaVersion === '0.4.0');
  assert.equal(pilot.length, 16);
  assert.deepEqual(new Set(pilot.map((question) => question.id)), pilotIds);
  for (const question of pilot) {
    assert.ok(question.learningSupport.keyTermIds.length >= 1 && question.learningSupport.keyTermIds.length <= 5, question.id);
    assert.ok(Array.isArray(question.learningSupport.languagePointKeys) && question.learningSupport.languagePointKeys.length >= 1, `${question.id}: languagePointKeys`);
    assertPilotTermAnnotation(question.question.id, `${question.id}/question`);
    for (const key of ['furigana', 'japaneseLearning', 'answerLeak']) {
      assert.ok(key in question.review, `${question.id}: review.${key}`);
    }
    for (const [path, value] of localizedTexts(question)) {
      assert.ok(value.ja && value.easyJa && value.id, `${question.id}/${path}: translation missing`);
      assert.ok(Array.isArray(value.rubyJa) && value.rubyJa.length, `${question.id}/${path}: ruby missing`);
      const missing = value.rubyJa.filter((segment) => hasHan.test(segment.text) && !segment.reading);
      assert.deepEqual(missing, [], `${question.id}/${path}: kanji reading missing`);
      assert.equal(value.rubyJa.map((segment) => segment.text).join(''), value.ja, `${question.id}/${path}: ruby reconstruction`);
    }
    for (const choice of question.choices) {
      assertPilotTermAnnotation(choice.text.id, `${question.id}/${choice.id}`);
      if (choice.id === question.correctChoiceId) continue;
      const rationale = question.choiceRationales[choice.id];
      assert.ok(rationale.ja && rationale.easyJa && rationale.id, `${question.id}/${choice.id}: wrong-choice reason missing`);
    }
    assert.ok(question.source.documentTitle && question.source.edition && question.source.pdfPage && question.source.section, `${question.id}: source incomplete`);
  }
});
