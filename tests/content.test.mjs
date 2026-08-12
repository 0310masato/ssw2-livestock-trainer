import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = async (name) => JSON.parse(await readFile(new URL(`../public/${name}`, import.meta.url), 'utf8'));
const questions = await load('questions-alpha-80.json');
const facts = await load('source-facts.json');
const glossary = await load('glossary-ja-id.json');

test('content counts and IDs are stable', () => {
  assert.equal(questions.length, 80);
  assert.equal(facts.length, 100);
  assert.equal(glossary.length, 60);
  assert.equal(new Set(questions.map((item) => item.id)).size, 80);
  assert.equal(new Set(facts.map((item) => item.factId)).size, 100);
  assert.equal(new Set(glossary.map((item) => item.id)).size, 60);
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
