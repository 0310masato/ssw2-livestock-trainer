import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const questionsPath = resolve(root, 'public', 'questions-alpha-80.json');
const glossaryPath = resolve(root, 'public', 'glossary-ja-id.json');
const dataPath = resolve(root, 'src', 'data.ts');
const checkOnly = process.argv.includes('--check');

const questions = JSON.parse(await readFile(questionsPath, 'utf8'));
const glossary = JSON.parse(await readFile(glossaryPath, 'utf8'));
let source = await readFile(dataPath, 'utf8');

function replaceGeneratedConstant(input, declaration, nextDeclaration, value) {
  const start = input.indexOf(declaration);
  const end = input.indexOf(nextDeclaration, start + declaration.length);
  if (start < 0 || end < 0) {
    throw new Error(`Could not locate generated data boundary: ${declaration}`);
  }
  return `${input.slice(0, start)}${declaration}${JSON.stringify(value)};\n${input.slice(end)}`;
}

const generated = replaceGeneratedConstant(
  source,
  '  export const QUESTIONS: Question[] = ',
  '  export const GLOSSARY: GlossaryItem[] = ',
  questions,
);
const nextSource = replaceGeneratedConstant(
  generated,
  '  export const GLOSSARY: GlossaryItem[] = ',
  '  export const COVERAGE = ',
  glossary,
);

function synchronizeCoverage(input) {
  const declaration = '  export const COVERAGE = ';
  const suffix = ' as const;';
  const start = input.indexOf(declaration);
  const end = input.indexOf(suffix, start + declaration.length);
  if (start < 0 || end < 0) {
    throw new Error('Could not locate generated COVERAGE constant.');
  }
  const current = JSON.parse(input.slice(start + declaration.length, end));
  const coverage = { ...current, glossaryTotal: glossary.length };
  return `${input.slice(0, start)}${declaration}${JSON.stringify(coverage)}${input.slice(end)}`;
}

const synchronizedSource = synchronizeCoverage(nextSource);

if (checkOnly) {
  if (synchronizedSource !== source) {
    console.error('src/data.ts is out of sync with the public question or glossary JSON.');
    process.exitCode = 1;
  } else {
    console.log(`Data sync OK: ${questions.length} questions and ${glossary.length} glossary entries.`);
  }
} else {
  await writeFile(dataPath, synchronizedSource, 'utf8');
  console.log(`Generated src/data.ts from ${questions.length} questions and ${glossary.length} glossary entries.`);
}
