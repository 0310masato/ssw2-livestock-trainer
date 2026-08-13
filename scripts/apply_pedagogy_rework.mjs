import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const kuromoji = require('kuromoji');
const dicPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');

const read = (file) => readFile(file, 'utf8');
const write = (file, content) => writeFile(file, content, 'utf8');

async function update(file, transform) {
  const before = await read(file);
  const after = transform(before);
  if (after === before) throw new Error(`No change made to ${file}`);
  await write(file, after, 'utf8');
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing ${label}`);
  return source.replace(search, replacement);
}

const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath }).build((error, built) => error ? reject(error) : resolve(built));
});

function katakanaToHiragana(value) {
  return String(value ?? '').replace(/[ァ-ヶ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60));
}

function rubySegments(text) {
  return tokenizer.tokenize(String(text ?? '')).map((token) => {
    const surface = token.surface_form;
    const hasKanji = /[一-龯々〆ヶ]/.test(surface);
    const reading = hasKanji ? katakanaToHiragana(token.reading) : '';
    return reading && reading !== surface ? { text: surface, reading } : { text: surface };
  });
}

function withRuby(text) {
  return { ...text, rubyJa: rubySegments(text.ja) };
}

function classifyPattern(value) {
  if (/誤っている|適切でない|正しくない|間違っている/.test(value)) return 'incorrect';
  if (/最も適切|もっとも適切/.test(value)) return 'most_appropriate';
  if (/正しいもの|正しい選択/.test(value)) return 'correct';
  if (/計算|何kg|何g|何mL|何L|何％|何%|求め/.test(value)) return 'calculation';
  if (/順番|順序|最初|次に|最後|手順/.test(value)) return 'procedure';
  return 'which';
}

const CATEGORY_ID = {
  '肉用鶏': 'ayam pedaging',
  '採卵鶏': 'ayam petelur',
  '豚': 'babi',
  '乳用牛': 'sapi perah',
  '肉用牛': 'sapi potong',
  '安全衛生': 'keselamatan dan kesehatan kerja',
  '畜産共通': 'dasar peternakan',
  '軽種馬': 'kuda ringan',
  '養蜂': 'perlebahan',
};

const CATEGORY_FALLBACK_TERM = {
  '肉用鶏': 'g018',
  '採卵鶏': 'g017',
  '豚': 'g014',
  '乳用牛': 'g041',
  '肉用牛': 'g005',
  '安全衛生': 'g025',
  '畜産共通': 'g001',
  '軽種馬': 'g052',
  '養蜂': 'g053',
};

const questions = JSON.parse(await read('public/questions-alpha-80.json'));
const glossary = JSON.parse(await read('public/glossary-ja-id.json'));
const facts = JSON.parse(await read('public/source-facts.json'));

for (const question of questions) {
  question.schemaVersion = '0.3.0';
  question.question = withRuby(question.question);
  question.explanation = withRuby(question.explanation);
  question.choices = question.choices.map((choice) => ({ ...choice, text: withRuby(choice.text) }));

  const correctChoice = question.choices.find((choice) => choice.id === question.correctChoiceId);
  if (!correctChoice) throw new Error(`${question.id}: correct choice missing`);

  question.choiceRationales = {};
  for (const choice of question.choices) {
    const correct = choice.id === question.correctChoiceId;
    const rationale = correct
      ? {
          ja: `「${choice.text.ja}」が正解です。${question.explanation.ja}`,
          easyJa: `「${choice.text.easyJa}」が正しいです。${question.explanation.easyJa}`,
          id: `Pilihan “${choice.text.id}” benar. ${question.explanation.id}`,
        }
      : {
          ja: `この選択肢は出典教材の記述と一致しません。正解は「${correctChoice.text.ja}」です。`,
          easyJa: `これは正解ではありません。正解は「${correctChoice.text.easyJa}」です。`,
          id: `Pilihan ini tidak sesuai dengan isi sumber. Jawaban yang benar adalah “${correctChoice.text.id}”. ${question.explanation.id}`,
        };
    question.choiceRationales[choice.id] = withRuby(rationale);
  }

  const searchable = [
    question.question.ja,
    question.explanation.ja,
    ...question.choices.map((choice) => choice.text.ja),
    question.category,
    question.topic,
  ].join(' ');
  const matchedTerms = glossary
    .filter((item) => searchable.includes(item.termJa))
    .sort((left, right) => right.termJa.length - left.termJa.length)
    .map((item) => item.id);
  const fallback = CATEGORY_FALLBACK_TERM[question.category];
  const keyTermIds = [...new Set([...matchedTerms, ...(fallback ? [fallback] : [])])].slice(0, 5);

  question.learningSupport = {
    questionPattern: classifyPattern(question.question.ja),
    keyTermIds,
    lessonObjective: withRuby({
      ja: `${question.category}の「${question.topic}」を、日本語の問題で理解する。`,
      easyJa: `${question.category}の${question.topic}について、日本語で答えられるようにします。`,
      id: `Memahami topik “${question.topic}” pada bidang ${CATEGORY_ID[question.category] ?? question.category} melalui soal bahasa Jepang.`,
    }),
    memoryPoint: withRuby({ ...question.explanation }),
  };
}

await write('public/questions-alpha-80.json', `${JSON.stringify(questions, null, 2)}\n`);

const schema = JSON.parse(await read('public/question.schema.json'));
schema.$id = 'https://example.local/schemas/livestock2-question-v0.3.schema.json';
schema.title = 'Livestock Level 2 Pedagogical Question v0.3';
schema.properties.schemaVersion.const = '0.3.0';
for (const field of ['choiceRationales', 'learningSupport']) {
  if (!schema.required.includes(field)) schema.required.push(field);
}
schema.properties.choiceRationales = {
  type: 'object',
  minProperties: 2,
  additionalProperties: { $ref: '#/$defs/multilingualText' },
};
schema.properties.learningSupport = {
  type: 'object',
  required: ['questionPattern', 'keyTermIds', 'lessonObjective', 'memoryPoint'],
  properties: {
    questionPattern: {
      enum: ['most_appropriate', 'incorrect', 'correct', 'calculation', 'procedure', 'which'],
    },
    keyTermIds: {
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
      minItems: 1,
      maxItems: 5,
    },
    lessonObjective: { $ref: '#/$defs/multilingualText' },
    memoryPoint: { $ref: '#/$defs/multilingualText' },
  },
  additionalProperties: false,
};
const multilingual = schema.$defs.multilingualText;
if (!multilingual.required.includes('rubyJa')) multilingual.required.push('rubyJa');
multilingual.properties.rubyJa = {
  type: 'array',
  minItems: 1,
  items: {
    type: 'object',
    required: ['text'],
    properties: {
      text: { type: 'string', minLength: 1 },
      reading: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};
await write('public/question.schema.json', `${JSON.stringify(schema, null, 2)}\n`);

await update('src/types.ts', (source) => {
  source = replaceRequired(
    source,
    "  export type UiLanguage = 'ja' | 'id';\n",
    "  export type UiLanguage = 'ja' | 'id';\n  export type StudySupportMode = 'guided' | 'adaptive' | 'japanese_only';\n  export type QuestionPatternKey = 'most_appropriate' | 'incorrect' | 'correct' | 'calculation' | 'procedure' | 'which';\n",
    'UI language type',
  );
  source = replaceRequired(
    source,
    "  export interface LocalizedText {\n    ja: string;\n    easyJa: string;\n    id: string;\n  }",
    "  export interface RubySegment {\n    text: string;\n    reading?: string;\n  }\n\n  export interface LocalizedText {\n    ja: string;\n    easyJa: string;\n    id: string;\n    rubyJa?: RubySegment[];\n  }",
    'LocalizedText',
  );
  source = replaceRequired(
    source,
    "    choiceRationalesJa: Record<string, string>;\n    source: SourceRef;",
    "    choiceRationalesJa: Record<string, string>;\n    choiceRationales: Record<string, LocalizedText>;\n    learningSupport: {\n      questionPattern: QuestionPatternKey;\n      keyTermIds: string[];\n      lessonObjective: LocalizedText;\n      memoryPoint: LocalizedText;\n    };\n    source: SourceRef;",
    'question learning support',
  );
  source = replaceRequired(
    source,
    "  export interface UserSettings {\n    uiLanguage: UiLanguage;",
    "  export interface UserSettings {\n    uiLanguage: UiLanguage;\n    studySupportMode: StudySupportMode;\n    showVocabulary: boolean;\n    showQuestionPattern: boolean;",
    'user settings',
  );
  return source;
});

await update('src/utils.ts', (source) => {
  const marker = "\n  export function questionById(id: string): Question | undefined {";
  if (!source.includes(marker)) throw new Error('utils questionById marker missing');
  const addition = `
  export function renderJapaneseText(text: LocalizedText, enabled: boolean): string {
    if (!enabled) return escapeHtml(text.ja);
    if (!text.rubyJa?.length) return textWithFurigana(text.ja, true);
    return text.rubyJa.map((segment) => segment.reading
      ? \`<ruby>\${escapeHtml(segment.text)}<rt>\${escapeHtml(segment.reading)}</rt></ruby>\`
      : escapeHtml(segment.text)).join('');
  }
`;
  source = source.replace(marker, `${addition}${marker}`);
  source = replaceRequired(
    source,
    "    const primary = textWithFurigana(text.ja, settings.showFurigana);",
    "    const primary = renderJapaneseText(text, settings.showFurigana);",
    'localized primary renderer',
  );
  return source;
});

await update('src/storage.ts', (source) => {
  source = replaceRequired(source, "schemaVersion: '0.4.2'", "schemaVersion: '0.5.0'", 'default schema version');
  source = replaceRequired(source, "schemaVersion: '0.4.2'", "schemaVersion: '0.5.0'", 'merged schema version');
  source = replaceRequired(
    source,
    "        uiLanguage: 'id',\n        preferredSupportLevel: 3,",
    "        uiLanguage: 'id',\n        studySupportMode: 'guided',\n        showVocabulary: true,\n        showQuestionPattern: true,\n        preferredSupportLevel: 3,",
    'pedagogy defaults',
  );
  source = replaceRequired(
    source,
    "      uiLanguage: candidateSettings.uiLanguage === 'ja' ? 'ja' : 'id',",
    "      uiLanguage: candidateSettings.uiLanguage === 'ja' ? 'ja' : 'id',\n      studySupportMode: ['guided', 'adaptive', 'japanese_only'].includes(String(candidateSettings.studySupportMode))\n        ? candidateSettings.studySupportMode as StudySupportMode\n        : 'guided',\n      showVocabulary: candidateSettings.showVocabulary !== false,\n      showQuestionPattern: candidateSettings.showQuestionPattern !== false,",
    'pedagogy state migration',
  );
  return source;
});

await update('src/app.ts', (source) => {
  const oldSupport = `  function questionSupport(session: SessionState, question: Question): void {
    const level = effectiveSupportLevel(runtime.state, question);
    const support = runtime.state.settings.automaticSupport
      ? supportSettingsForLevel(level)
      : {
          showFurigana: runtime.state.settings.showFurigana,
          showEasyJapanese: runtime.state.settings.showEasyJapanese,
          showIndonesian: runtime.state.settings.showIndonesian,
        };
    session.furiganaVisible = support.showFurigana;
    session.easyJapaneseVisible = support.showEasyJapanese;
    session.indonesianVisible = support.showIndonesian;
  }`;
  const newSupport = `  function questionSupport(session: SessionState, question: Question): void {
    const support = supportSettingsForStudy(runtime.state, question, session.kind);
    session.furiganaVisible = support.showFurigana;
    session.easyJapaneseVisible = support.showEasyJapanese;
    session.indonesianVisible = support.showIndonesian;
  }`;
  source = replaceRequired(source, oldSupport, newSupport, 'question support function');
  const marker = "    document.querySelector<HTMLSelectElement>('[data-setting-ui-language]')?.addEventListener('change', (event) => {";
  if (!source.includes(marker)) throw new Error('settings event marker missing');
  const handlers = `    document.querySelector<HTMLSelectElement>('[data-setting-study-mode]')?.addEventListener('change', (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      runtime.state.settings.studySupportMode = ['adaptive', 'japanese_only'].includes(value) ? value as StudySupportMode : 'guided';
      void persist();
      render();
    });
    document.querySelectorAll<HTMLInputElement>('[data-setting-pedagogy-checkbox]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.settingPedagogyCheckbox as 'showVocabulary' | 'showQuestionPattern';
        runtime.state.settings[key] = input.checked;
        void persist();
        render();
      });
    });
`;
  source = source.replace(marker, `${handlers}${marker}`);
  return source;
});

await update('src/views.ts', (source) => {
  const homeMarker = '      </section>\n\n      <section class="metric-grid" aria-label="学習状況">';
  source = replaceRequired(
    source,
    homeMarker,
    '      </section>\n\n      ${renderLearningFlowPanel()}\n\n      <section class="metric-grid" aria-label="学習状況">',
    'home learning flow',
  );

  const functionIndex = source.indexOf('  function studyView(): string {');
  const cardStart = source.indexOf('        <article class="question-card">', functionIndex);
  const cardEndMarker = '        </article>\n      </section>\n    `;';
  const cardEnd = source.indexOf(cardEndMarker, cardStart);
  if (functionIndex < 0 || cardStart < 0 || cardEnd < 0) throw new Error('study card boundaries missing');
  source = `${source.slice(0, cardStart)}        \${renderGuidedQuestionCard(question, session, settings, correct, supportLevel, total)}\n${source.slice(cardEnd + '        </article>\n'.length)}`;

  const settingsMarker = '      <div class="section-heading"><h1>設定</h1><p>母語補助、復習データ、端末へのインストールを管理します。</p></div>\n';
  source = replaceRequired(
    source,
    settingsMarker,
    `${settingsMarker}      \${renderPedagogySettingsPanel(settings)}\n`,
    'pedagogy settings panel',
  );
  return source;
});

await update('tsconfig.json', (source) => replaceRequired(
  source,
  '    "src/mock.ts",\n    "src/views.ts",',
  '    "src/mock.ts",\n    "src/pedagogy.ts",\n    "src/views.ts",',
  'pedagogy TypeScript file',
));

const styleAddition = `

/* Guided Japanese-learning lesson */
.learning-flow-panel { margin: 18px 0 28px; padding: 22px; border: 1px solid #f0c99d; border-radius: var(--radius); background: linear-gradient(135deg,#fff8ef,#f2faf7); }
.learning-flow-copy h2 { display: grid; gap: 5px; margin: 8px 0 10px; font-size: clamp(20px,4vw,27px); line-height: 1.35; }
.learning-flow-copy h2 span[lang="id"] { color: #9a541f; font-size: .72em; }
.learning-flow-copy p { margin: 0; color: var(--muted); line-height: 1.65; }
.learning-flow-steps { margin: 18px 0 12px; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 9px; }
.learning-flow-steps li { min-height: 92px; padding: 12px; border: 1px solid var(--border); border-radius: 15px; background: #fff; display: flex; gap: 9px; align-items: flex-start; }
.learning-flow-steps li > strong, .lesson-step { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: #fff; font-weight: 900; }
.learning-flow-steps span, .lesson-subheading div { display: grid; gap: 4px; }
.learning-flow-steps small, .lesson-subheading small { color: var(--muted); line-height: 1.4; }
.mock-boundary { margin: 0; padding-top: 11px; border-top: 1px dashed #d8b98f; }
.lesson-label { display: inline-flex; padding: 5px 9px; border-radius: 999px; background: var(--accent-soft); color: #934a17; font-size: 12px; font-weight: 850; }
.guided-lesson-card { display: grid; gap: 17px; }
.lesson-goal { padding: 14px 16px; border: 1px solid #f0d1ad; border-radius: 16px; background: #fff9f2; }
.lesson-goal p { margin: 5px 0 0; line-height: 1.55; }
.lesson-goal p[lang="id"] { color: #8a4e23; }
.lesson-stage { padding-top: 2px; }
.lesson-subheading { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 11px; }
.lesson-subheading strong { font-size: 16px; }
.question-pattern-guide { padding: 14px 16px; border: 1px solid #bfd9d3; border-radius: 15px; background: #f2f9f7; }
.question-pattern-guide p { margin: 6px 0 0; line-height: 1.58; }
.question-pattern-guide p[lang="id"] { color: #9b541e; }
.lesson-vocabulary { padding: 16px; border: 1px solid #ecd6b7; border-radius: 17px; background: #fffaf3; }
.vocabulary-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; }
.vocabulary-card { min-width: 0; padding: 12px; border: 1px solid #eadac2; border-radius: 13px; background: #fff; }
.vocabulary-card ruby { display: block; font-size: 19px; font-weight: 850; }
.vocabulary-card p { margin: 7px 0 4px; color: var(--muted); line-height: 1.45; }
.vocabulary-card > strong { color: #9a541f; font-size: 13px; }
.guided-choice .choice-ja { display: block; font-size: 16px; font-weight: 760; }
.correct-answer-block, .explanation-block, .memory-point { margin-top: 13px; padding: 13px 14px; border-radius: 14px; background: rgba(255,255,255,.72); }
.correct-answer-block p, .explanation-block p, .memory-point p { margin: 6px 0 0; line-height: 1.6; }
.correct-answer-block p[lang="id"], .memory-point p[lang="id"] { color: #92501f; }
.explanation-block h3 { margin: 0; font-size: 17px; }
.memory-point { border-left: 5px solid var(--accent); }
.choice-review { padding: 16px; border: 1px solid var(--border); border-radius: 17px; background: #f9fcfb; }
.choice-review h3 { margin: 0 0 12px; }
.choice-review-list { display: grid; gap: 8px; }
.choice-review-item { padding: 12px; border: 1px solid var(--border); border-radius: 13px; background: #fff; }
.choice-review-item.correct { border-color: #92cbb9; background: var(--ok-soft); }
.choice-review-item.wrong { border-color: #e6c7c9; }
.choice-review-title { display: grid; grid-template-columns: 30px minmax(0,1fr); gap: 7px; align-items: start; }
.choice-review-title > span { grid-row: 1 / 3; width: 27px; height: 27px; display: grid; place-items: center; border-radius: 50%; background: var(--surface-soft); font-weight: 900; }
.choice-review-title em { color: #9a541f; font-size: 13px; font-style: normal; }
.choice-review-item p { margin: 7px 0 0; line-height: 1.55; }
.choice-review-item p[lang="id"] { color: #815237; }
.reason-button small { display: block; margin-top: 4px; color: inherit; opacity: .78; }
.pedagogy-settings { border-color: #e7caa4; background: #fffaf4; }
@media (max-width: 800px) { .learning-flow-steps { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 520px) { .learning-flow-steps, .vocabulary-grid { grid-template-columns: 1fr; } .learning-flow-steps li { min-height: 0; } }
`;
await update('src/styles.css', (source) => source.includes('/* Guided Japanese-learning lesson */') ? source : `${source.trimEnd()}${styleAddition}`);

await update('tests/content.test.mjs', (source) => {
  if (source.includes("test('pedagogical question pack")) return source;
  return `${source.trimEnd()}\n\ntest('pedagogical question pack contains ruby, vocabulary, and bilingual choice explanations', () => {\n  for (const question of questions) {\n    assert.equal(question.schemaVersion, '0.3.0');\n    assert.ok(Array.isArray(question.question.rubyJa) && question.question.rubyJa.length > 0, question.id + ': question ruby missing');\n    assert.ok(Array.isArray(question.explanation.rubyJa) && question.explanation.rubyJa.length > 0, question.id + ': explanation ruby missing');\n    assert.ok(question.learningSupport && question.learningSupport.questionPattern, question.id + ': question pattern missing');\n    assert.ok(question.learningSupport.keyTermIds.length >= 1, question.id + ': vocabulary missing');\n    assert.equal(Object.keys(question.choiceRationales).length, question.choices.length, question.id + ': choice explanations missing');\n    for (const choice of question.choices) {\n      assert.ok(choice.text.rubyJa.length > 0, question.id + '/' + choice.id + ': choice ruby missing');\n      const rationale = question.choiceRationales[choice.id];\n      assert.ok(rationale && rationale.ja && rationale.easyJa && rationale.id, question.id + '/' + choice.id + ': rationale incomplete');\n      assert.ok(rationale.rubyJa.length > 0, question.id + '/' + choice.id + ': rationale ruby missing');\n    }\n  }\n});\n`;
});

await update('tests/engine.test.mjs', (source) => {
  if (source.includes("test('guided study mode")) return source;
  return `${source.trimEnd()}\n\ntest('guided study mode always exposes Japanese-learning supports', () => {\n  const state = app.defaultState();\n  const question = app.QUESTIONS[0];\n  assert.equal(state.settings.studySupportMode, 'guided');\n  assert.deepEqual(\n    app.supportSettingsForStudy(state, question, 'daily'),\n    { showFurigana: true, showEasyJapanese: true, showIndonesian: true },\n  );\n});\n\ntest('Japanese-only and mock modes hide all learning supports', () => {\n  const state = app.defaultState();\n  const question = app.QUESTIONS[0];\n  state.settings.studySupportMode = 'japanese_only';\n  assert.deepEqual(\n    app.supportSettingsForStudy(state, question, 'daily'),\n    { showFurigana: false, showEasyJapanese: false, showIndonesian: false },\n  );\n  state.settings.studySupportMode = 'guided';\n  assert.deepEqual(\n    app.supportSettingsForStudy(state, question, 'mock'),\n    { showFurigana: false, showEasyJapanese: false, showIndonesian: false },\n  );\n});\n`;
});

await update('tests/pwa.test.mjs', (source) => {
  source = replaceRequired(
    source,
    "  assert.match(app, /uiLanguage/);",
    "  assert.match(app, /uiLanguage/);\n  assert.match(app, /Baca soal bahasa Jepang/);\n  assert.match(app, /Arti dalam Bahasa Indonesia/);\n  assert.match(app, /Pembahasan setiap pilihan/);\n  assert.match(app, /studySupportMode/);",
    'PWA pedagogy assertions',
  );
  return source;
});

await update('e2e/smoke.py', (source) => {
  const marker = "    page.screenshot(path=str(SHOTS / 'alpha-home-mobile.png'), full_page=True)\n\n    page.locator('[data-ui-language=\"ja\"]').click()";
  const addition = `    page.screenshot(path=str(SHOTS / 'alpha-home-mobile.png'), full_page=True)

    page.locator('[data-start="daily"]').first.click()
    page.wait_for_timeout(180)
    body = page.locator('body').inner_text()
    check('Baca soal bahasa Jepang' in body and 'Arti dalam Bahasa Indonesia' in body, 'guided_indonesian_lesson', checks)
    check(page.locator('.guided-lesson-card ruby rt').count() >= 1, 'full_furigana_rendered', checks)
    check(page.locator('.vocabulary-card').count() >= 1, 'question_vocabulary_rendered', checks)
    page.locator('[data-view="home"]').last.click()
    page.wait_for_timeout(120)

    page.locator('[data-ui-language="ja"]').click()`;
  return replaceRequired(source, marker, addition, 'guided lesson E2E');
});

await update('scripts/validate_content.py', (source) => {
  source = replaceRequired(
    source,
    "missing_assets = []\nfor q in QUESTIONS:",
    "missing_assets = []\nbad_pedagogy = []\nfor q in QUESTIONS:",
    'pedagogy validator list',
  );
  const languageMarker = `    for c in q.get('choices', []):
        if not all(str(c.get('text', {}).get(k, '')).strip() for k in ('ja', 'easyJa', 'id')):
            bad_language.append((q['id'], f\"choice:{c.get('id')}\"))`;
  const pedagogyCheck = `${languageMarker}
    support = q.get('learningSupport', {})
    rationales = q.get('choiceRationales', {})
    ruby_fields = [q.get('question', {}), q.get('explanation', {}), *[c.get('text', {}) for c in q.get('choices', [])], *rationales.values()]
    if (
        q.get('schemaVersion') != '0.3.0'
        or not support.get('questionPattern')
        or not support.get('keyTermIds')
        or len(rationales) != len(q.get('choices', []))
        or any(not item.get('rubyJa') for item in ruby_fields)
        or any(not all(str(item.get(k, '')).strip() for k in ('ja', 'easyJa', 'id')) for item in rationales.values())
    ):
        bad_pedagogy.append(q['id'])`;
  source = replaceRequired(source, languageMarker, pedagogyCheck, 'pedagogy validation body');
  source = replaceRequired(
    source,
    "    check(not bad_language, 'All multilingual fields are populated', str(bad_language[:10])),\n    check(not missing_assets, 'All declared original visual assets exist', str(missing_assets[:10])),",
    "    check(not bad_language, 'All multilingual fields are populated', str(bad_language[:10])),\n    check(not bad_pedagogy, 'All questions include ruby and pedagogical support', str(bad_pedagogy[:10])),\n    check(not missing_assets, 'All declared original visual assets exist', str(missing_assets[:10])),",
    'pedagogy check summary',
  );
  source = replaceRequired(
    source,
    "for name, items in [('missing_fact_reference', missing_refs), ('bad_correct_choice', bad_correct), ('bad_source', bad_sources), ('bad_rights', bad_rights), ('bad_status', bad_status), ('bad_language', bad_language), ('missing_asset', missing_assets)]:",
    "for name, items in [('missing_fact_reference', missing_refs), ('bad_correct_choice', bad_correct), ('bad_source', bad_sources), ('bad_rights', bad_rights), ('bad_status', bad_status), ('bad_language', bad_language), ('bad_pedagogy', bad_pedagogy), ('missing_asset', missing_assets)]:",
    'pedagogy issues list',
  );
  source = source.replace("'generatedAt': '2026-08-12'", "'generatedAt': '2026-08-13'");
  return source;
});

const packageJson = JSON.parse(await read('package.json'));
packageJson.version = '0.5.0-alpha-pedagogy';
packageJson.description = 'インドネシア人向けに、日本語問題・全文ふりがな・母語解説・重要語・選択肢別解説を備えた特定技能2号畜産PWA教材';
await write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
const packageLock = JSON.parse(await read('package-lock.json'));
packageLock.version = packageJson.version;
if (packageLock.packages?.['']) packageLock.packages[''].version = packageJson.version;
await write('package-lock.json', `${JSON.stringify(packageLock, null, 2)}\n`);

await update('scripts/build.mjs', (source) => source
  .replace('livestock2-v0.4.2-persistent-ui-language', 'livestock2-v0.5.0-pedagogical-learning')
  .replace('Pelatih Peternakan Tingkat 2 / 畜産2号トレーナー', 'Belajar Bahasa Jepang untuk Peternakan 2 / 畜産2号日本語トレーナー')
  .replace("short_name: 'Ternak 2'", "short_name: 'Nihongo Ternak'"));

await update('README.md', (source) => source.includes('## 教材としての学習設計') ? source : `${source.trimEnd()}\n\n## 教材としての学習設計\n\nこの版では、単なるUI翻訳ではなく、インドネシア人学習者が日本語の試験問題を理解するための教材構造を実装しています。\n\n- 日本語問題を最初に提示\n- 問題文・選択肢・日本語解説へ全文ふりがな\n- やさしい日本語とインドネシア語で意味を確認\n- 「最も適切」「誤っている」など問題文の型を説明\n- 重要語を漢字・読み・やさしい日本語・インドネシア語で表示\n- 正答理由と選択肢別解説を表示\n- guided／adaptive／日本語のみを切替\n- 模擬試験は日本語のみ\n\n詳細は [docs/PEDAGOGY_SPEC.md](docs/PEDAGOGY_SPEC.md) を参照してください。\n`);

await update('CHANGELOG.md', (source) => source.includes('## 0.5.0-alpha-pedagogy') ? source : `${source.trimEnd()}\n\n## 0.5.0-alpha-pedagogy\n\n- インドネシア人向け日本語試験教材として学習画面を再設計\n- 80問の問題・選択肢・解説へ読み情報を追加\n- 問題文の型、重要語、学習目標、覚えるポイントを追加\n- 各選択肢へ日本語・インドネシア語の解説を追加\n- guided／adaptive／日本語のみの学習サポートモードを追加\n- 模擬試験は従来どおり日本語のみ\n- 問題状態はsource_checkedを維持し、インドネシア語ネイティブ確認前の承認を禁止\n`);

const categoryOrder = ['肉用鶏','採卵鶏','豚','乳用牛','肉用牛','安全衛生','畜産共通','軽種馬','養蜂'];
const poultryPath = ['肉用鶏','採卵鶏','畜産共通','安全衛生','豚','乳用牛','肉用牛','軽種馬','養蜂'];
const countBy = (items, key) => Object.fromEntries([...new Set(items.map((item) => item[key]))].map((value) => [value, items.filter((item) => item[key] === value).length]));
const coverage = {
  generatedAt: '2026-08-13',
  questionsTotal: questions.length,
  factsTotal: facts.length,
  glossaryTotal: glossary.length,
  questionCountsByCategory: countBy(questions, 'category'),
  factCountsBySubject: countBy(facts, 'subject'),
  statusCounts: countBy(questions, 'status'),
  translationStatus: { indonesian: 'machine_drafted_pending_native_review' },
  pedagogy: {
    fullRubyQuestions: questions.filter((q) => q.question.rubyJa?.length).length,
    choiceRationaleQuestions: questions.filter((q) => Object.keys(q.choiceRationales ?? {}).length === q.choices.length).length,
    guidedModeDefault: true,
  },
};
const dataTs = `namespace LivestockApp {\n  export const APP_VERSION = "0.5.0-alpha-pedagogy";\n  export const BUILD_MODE = "internal-review" as const;\n  export const QUESTIONS: Question[] = ${JSON.stringify(questions)};\n  export const GLOSSARY: GlossaryItem[] = ${JSON.stringify(glossary)};\n  export const COVERAGE = ${JSON.stringify(coverage)} as const;\n  export const CATEGORY_ORDER = ${JSON.stringify(categoryOrder)};\n  export const POULTRY_PATH = ${JSON.stringify(poultryPath)};\n  export const ERROR_REASON_LABELS: Record<ErrorReason,string> = {knowledge:"内容を知らなかった",japanese:"日本語の意味が分からなかった",misread:"選択肢を読み違えた",calculation:"計算を間違えた",time:"時間が足りなかった",unsure:"よく分からない"};\n  export const SUPPORT_LEVEL_LABELS: Record<number,string> = {3:"母語＋やさしい日本語＋ふりがな",2:"やさしい日本語＋ふりがな",1:"通常日本語＋用語ヒント",0:"日本語のみ"};\n}\n`;
await write('src/data.ts', dataTs);

console.log(JSON.stringify({
  questions: questions.length,
  rubyQuestions: questions.filter((question) => question.question.rubyJa?.length).length,
  rationaleQuestions: questions.filter((question) => Object.keys(question.choiceRationales).length === question.choices.length).length,
  version: packageJson.version,
}, null, 2));
