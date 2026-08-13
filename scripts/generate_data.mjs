import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const defaultPaths = {
  questions: resolve(root, 'public', 'questions-alpha-80.json'),
  facts: resolve(root, 'public', 'source-facts.json'),
  glossary: resolve(root, 'public', 'glossary-ja-id.json'),
  package: resolve(root, 'package.json'),
  output: resolve(root, 'src', 'data.ts'),
};
const CATEGORY_ORDER = ['肉用鶏', '採卵鶏', '豚', '乳用牛', '肉用牛', '安全衛生', '畜産共通', '軽種馬', '養蜂'];
const POULTRY_PATH = ['肉用鶏', '採卵鶏', '畜産共通', '安全衛生', '豚', '乳用牛', '肉用牛', '軽種馬', '養蜂'];
const COVERAGE_GENERATED_AT = '2026-08-13';
const CANONICAL_COUNTS = { questions: 80, facts: 100, glossary: 63 };

export function parseJsonArray(text, label) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(value)) throw new Error(`${label} must contain a JSON array.`);
  return value;
}

function requireObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  return value;
}

function requireString(record, key, path) {
  if (typeof record[key] !== 'string' || !record[key]) throw new Error(`${path}.${key} must be a non-empty string.`);
}

function assertInputStructure(questions, facts, glossary) {
  const statuses = new Set(['draft', 'candidate', 'source_checked', 'language_checked', 'approved', 'suspended', 'retired']);
  questions.forEach((value, index) => {
    const path = `questions[${index}]`;
    const question = requireObject(value, path);
    for (const key of ['id', 'category', 'status']) requireString(question, key, path);
    if (!statuses.has(question.status)) throw new Error(`${path}.status is invalid.`);
    const localizedQuestion = requireObject(question.question, `${path}.question`);
    if (!Array.isArray(localizedQuestion.rubyJa)) throw new Error(`${path}.question.rubyJa must be an array.`);
    if (!Array.isArray(question.choices)) throw new Error(`${path}.choices must be an array.`);
    requireObject(question.choiceRationales, `${path}.choiceRationales`);
    const review = requireObject(question.review, `${path}.review`);
    requireString(review, 'languageId', `${path}.review`);
  });
  facts.forEach((value, index) => {
    const path = `facts[${index}]`;
    const fact = requireObject(value, path);
    requireString(fact, 'factId', path);
    requireString(fact, 'subject', path);
  });
  glossary.forEach((value, index) => {
    const path = `glossary[${index}]`;
    const item = requireObject(value, path);
    requireString(item, 'id', path);
  });
}

function assertUniqueIds(items, key, label) {
  const ids = items.map((item, index) => {
    if (!item || typeof item !== 'object' || typeof item[key] !== 'string' || !item[key]) {
      throw new Error(`${label}[${index}].${key} must be a non-empty string.`);
    }
    return item[key];
  });
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate ${key} values.`);
}

function countsBy(items, key) {
  const result = {};
  for (const item of items) {
    const value = item?.[key];
    if (typeof value !== 'string' || !value) throw new Error(`Cannot calculate coverage: ${key} must be a non-empty string.`);
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

export function buildCoverage(questions, facts, glossary) {
  return {
    generatedAt: COVERAGE_GENERATED_AT,
    questionsTotal: questions.length,
    factsTotal: facts.length,
    glossaryTotal: glossary.length,
    questionCountsByCategory: countsBy(questions, 'category'),
    factCountsBySubject: countsBy(facts, 'subject'),
    statusCounts: countsBy(questions, 'status'),
    translationStatus: {
      indonesian: questions.every((question) => question?.review?.languageId === 'pass')
        ? 'native_reviewed'
        : 'machine_drafted_pending_native_review',
    },
    pedagogy: {
      fullRubyQuestions: questions.filter((question) => Array.isArray(question?.question?.rubyJa) && question.question.rubyJa.length > 0).length,
      choiceRationaleQuestions: questions.filter((question) => {
        const choiceIds = Array.isArray(question?.choices) ? question.choices.map((choice) => choice?.id) : [];
        const rationales = question?.choiceRationales;
        return rationales && typeof rationales === 'object'
          && choiceIds.length > 0
          && choiceIds.every((id) => typeof id === 'string' && rationales[id]);
      }).length,
      guidedModeDefault: true,
    },
  };
}

export function createDataSource({ version, questions, facts, glossary }) {
  if (typeof version !== 'string' || !version) throw new Error('package version must be a non-empty string.');
  if (!Array.isArray(questions) || !Array.isArray(facts) || !Array.isArray(glossary)) {
    throw new Error('questions, facts, and glossary must be arrays.');
  }
  assertInputStructure(questions, facts, glossary);
  assertUniqueIds(questions, 'id', 'questions');
  assertUniqueIds(facts, 'factId', 'facts');
  assertUniqueIds(glossary, 'id', 'glossary');
  const coverage = buildCoverage(questions, facts, glossary);
  return [
    'namespace LivestockApp {',
    `  export const APP_VERSION = ${JSON.stringify(version)};`,
    '  export const BUILD_MODE = "temporary-pr-review" as const;',
    `  export const QUESTIONS: Question[] = ${JSON.stringify(questions)};`,
    `  export const GLOSSARY: GlossaryItem[] = ${JSON.stringify(glossary)};`,
    `  export const COVERAGE = ${JSON.stringify(coverage)} as const;`,
    `  export const CATEGORY_ORDER = ${JSON.stringify(CATEGORY_ORDER)};`,
    `  export const POULTRY_PATH = ${JSON.stringify(POULTRY_PATH)};`,
    '  export const ERROR_REASON_LABELS: Record<ErrorReason,string> = {knowledge:"内容を知らなかった",japanese:"日本語の意味が分からなかった",misread:"選択肢を読み違えた",calculation:"計算を間違えた",time:"時間が足りなかった",unsure:"よく分からない"};',
    '  export const SUPPORT_LEVEL_LABELS: Record<number,string> = {3:"母語＋やさしい日本語＋ふりがな",2:"やさしい日本語＋ふりがな",1:"通常日本語＋用語ヒント",0:"日本語のみ"};',
    '}',
    '',
  ].join('\n');
}

export function assertCanonicalPackCounts({ questions, facts, glossary }) {
  const actual = { questions: questions.length, facts: facts.length, glossary: glossary.length };
  for (const [key, expected] of Object.entries(CANONICAL_COUNTS)) {
    if (actual[key] !== expected) throw new Error(`Canonical ${key} count must be ${expected}; received ${actual[key]}.`);
  }
}

export function validateTypeScriptSyntax(source) {
  const sourceFile = ts.createSourceFile('data.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  if (diagnostics.length) {
    const detail = diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('; ');
    throw new Error(`Generated TypeScript syntax is invalid: ${detail}`);
  }
}

export function validateGeneratedTypeScript(source) {
  validateTypeScriptSyntax(source);
  const configPath = resolve(root, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(`Could not read tsconfig.json: ${ts.flattenDiagnosticMessageText(config.error.messageText, '\n')}`);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const canonicalDataPath = resolve(root, 'src', 'data.ts');
  const canonicalKey = canonicalDataPath.toLowerCase();
  const host = ts.createCompilerHost(parsed.options);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.readFile = (fileName) => resolve(fileName).toLowerCase() === canonicalKey ? source : originalReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (resolve(fileName).toLowerCase() === canonicalKey) {
      return ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TS);
    }
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, host });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    const detail = diagnostics.slice(0, 10).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('; ');
    throw new Error(`Generated TypeScript failed repository type-check: ${detail}`);
  }
}

export async function writeGeneratedDataAtomic(outputPath, source) {
  validateGeneratedTypeScript(source);
  const temporaryPath = resolve(
    dirname(outputPath),
    `.${outputPath.split(/[\\/]/).at(-1)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temporaryPath, source, { encoding: 'utf8', flag: 'wx' });
    const written = await readFile(temporaryPath, 'utf8');
    if (written !== source) throw new Error('Generated temporary file did not round-trip byte-for-byte.');
    validateGeneratedTypeScript(written);
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readCanonicalInputs(paths = defaultPaths) {
  const [questionText, factText, glossaryText, packageText] = await Promise.all([
    readFile(paths.questions, 'utf8'),
    readFile(paths.facts, 'utf8'),
    readFile(paths.glossary, 'utf8'),
    readFile(paths.package, 'utf8'),
  ]);
  const packageJson = JSON.parse(packageText);
  return {
    version: packageJson.version,
    questions: parseJsonArray(questionText, 'questions-alpha-80.json'),
    facts: parseJsonArray(factText, 'source-facts.json'),
    glossary: parseJsonArray(glossaryText, 'glossary-ja-id.json'),
  };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const inputs = await readCanonicalInputs();
  assertCanonicalPackCounts(inputs);
  const source = createDataSource(inputs);
  validateGeneratedTypeScript(source);
  if (checkOnly) {
    const current = await readFile(defaultPaths.output, 'utf8');
    if (source !== current.replaceAll('\r\n', '\n')) {
      console.error('src/data.ts is out of sync with the canonical public JSON data.');
      process.exitCode = 1;
      return;
    }
    console.log(`Data sync OK: ${inputs.questions.length} questions, ${inputs.facts.length} facts, and ${inputs.glossary.length} glossary entries.`);
    return;
  }
  await writeGeneratedDataAtomic(defaultPaths.output, source);
  console.log(`Generated src/data.ts atomically from ${inputs.questions.length} questions, ${inputs.facts.length} facts, and ${inputs.glossary.length} glossary entries.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
