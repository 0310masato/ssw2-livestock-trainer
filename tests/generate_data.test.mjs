import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildCoverage,
  createDataSource,
  assertCanonicalPackCounts,
  parseJsonArray,
  writeGeneratedDataAtomic,
} from '../scripts/generate_data.mjs';

function fixtureQuestion(overrides = {}) {
  return {
    id: 'q001',
    status: 'source_checked',
    category: 'A',
    question: { rubyJa: [{ text: 'A' }] },
    choices: [{ id: 'a' }],
    choiceRationales: { a: { ja: 'reason' } },
    review: { languageId: 'pending_native_review' },
    ...overrides,
  };
}

test('data generation is deterministic and recalculates every derived coverage count', () => {
  const questions = [
    fixtureQuestion(),
    fixtureQuestion({ id: 'q002', status: 'approved', category: 'B', question: { rubyJa: [{ text: 'B' }] }, choiceRationales: {}, review: { languageId: 'pass' } }),
  ];
  const facts = [{ factId: 'f001', subject: 'B' }, { factId: 'f002', subject: 'B' }, { factId: 'f003', subject: 'A' }];
  const glossary = [{ id: 'g001' }];
  const coverage = buildCoverage(questions, facts, glossary);
  assert.deepEqual(coverage.questionCountsByCategory, { A: 1, B: 1 });
  assert.deepEqual(coverage.factCountsBySubject, { B: 2, A: 1 });
  assert.deepEqual(coverage.statusCounts, { source_checked: 1, approved: 1 });
  assert.equal(coverage.questionsTotal, 2);
  assert.equal(coverage.factsTotal, 3);
  assert.equal(coverage.glossaryTotal, 1);
  assert.equal(coverage.pedagogy.fullRubyQuestions, 2);
  assert.equal(coverage.pedagogy.choiceRationaleQuestions, 1);
  assert.equal(coverage.translationStatus.indonesian, 'machine_drafted_pending_native_review');

  const first = createDataSource({ version: '1.2.3', questions, facts, glossary });
  const second = createDataSource({ version: '1.2.3', questions, facts, glossary });
  assert.equal(first, second);
  assert.match(first, /export const QUESTIONS/);
  assert.match(first, /export const COVERAGE/);
});

test('invalid generated TypeScript leaves the existing target byte-for-byte unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ssw2-generate-'));
  const target = join(directory, 'data.ts');
  const original = 'namespace LivestockApp { export const SENTINEL = true; }\n';
  await writeFile(target, original, 'utf8');
  try {
    await assert.rejects(
      writeGeneratedDataAtomic(target, 'namespace LivestockApp { export const BROKEN = ; }\n'),
      /syntax/i,
    );
    assert.equal(await readFile(target, 'utf8'), original);
    assert.deepEqual((await readdir(directory)).sort(), ['data.ts']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('type-invalid generated data leaves the existing target byte-for-byte unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ssw2-generate-type-'));
  const target = join(directory, 'data.ts');
  const original = 'namespace LivestockApp { export const SENTINEL = true; }\n';
  await writeFile(target, original, 'utf8');
  const questions = JSON.parse(await readFile(new URL('../public/questions-alpha-80.json', import.meta.url), 'utf8'));
  const facts = JSON.parse(await readFile(new URL('../public/source-facts.json', import.meta.url), 'utf8'));
  const glossary = JSON.parse(await readFile(new URL('../public/glossary-ja-id.json', import.meta.url), 'utf8'));
  questions[0].difficulty = 'hard';
  const source = createDataSource({ version: '1.2.3', questions, facts, glossary });
  try {
    await assert.rejects(writeGeneratedDataAtomic(target, source), /type-check/i);
    assert.equal(await readFile(target, 'utf8'), original);
    assert.deepEqual((await readdir(directory)).sort(), ['data.ts']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('canonical input guards reject count drift and duplicate identifiers', () => {
  assert.throws(
    () => assertCanonicalPackCounts({ questions: [], facts: [], glossary: [] }),
    /questions count must be 80/,
  );
  assert.throws(
    () => createDataSource({
      version: '1.2.3',
      questions: [fixtureQuestion({ status: 'draft' }), fixtureQuestion({ status: 'draft' })],
      facts: [],
      glossary: [],
    }),
    /duplicate id/,
  );
});

test('JSON roots, boundary-like payloads, and coverage mutations are handled without partial parsing', () => {
  assert.throws(() => parseJsonArray('{broken', 'fixture.json'), /not valid JSON/);
  assert.throws(() => parseJsonArray('{"items":[]}', 'fixture.json'), /JSON array/);

  const boundary = '  export const GLOSSARY: GlossaryItem[] = ';
  const question = fixtureQuestion({ category: boundary });
  const source = createDataSource({
    version: '1.2.3',
    questions: [question],
    facts: [{ factId: 'f001', subject: 'A' }],
    glossary: [{ id: 'g001' }],
  });
  assert.match(source, new RegExp(JSON.stringify(boundary).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /export const GLOSSARY: GlossaryItem\[\]/);

  const initial = buildCoverage([fixtureQuestion()], [{ factId: 'f001', subject: 'A' }], []);
  const mutated = buildCoverage(
    [fixtureQuestion({ category: 'B', status: 'approved' })],
    [{ factId: 'f001', subject: 'A' }],
    [],
  );
  assert.deepEqual(initial.questionCountsByCategory, { A: 1 });
  assert.deepEqual(mutated.questionCountsByCategory, { B: 1 });
  assert.deepEqual(initial.statusCounts, { source_checked: 1 });
  assert.deepEqual(mutated.statusCounts, { approved: 1 });
});
