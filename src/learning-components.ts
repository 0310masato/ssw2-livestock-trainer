namespace LivestockApp {
  export type LearningRenderPhase = 'before-answer' | 'after-answer';

  export interface LearningRenderOptions {
    showFurigana: boolean;
    showEasyJapanese: boolean;
    showIndonesian: boolean;
    phase: LearningRenderPhase;
    showQuestionTranslation?: boolean;
    showChoiceTranslations?: boolean;
    showAnswerIndonesian?: boolean;
    showKeywords?: boolean;
    /** Independent from the full-question translation disclosure. */
    showKeywordIndonesian?: boolean;
    showIntent?: boolean;
    /** Level 2/3 intent remains Indonesian even while the full translation is closed. */
    showIntentIndonesian?: boolean;
    compactKeywordHints?: boolean;
    allowQuestionTranslation?: boolean;
    allowChoiceTranslations?: boolean;
    allowAnswerIndonesian?: boolean;
    isRetryWithoutSupport?: boolean;
    /** Phase 4 can enable Indonesian only after answering (Level 1). */
    revealIndonesianAfterAnswer?: boolean;
    /** Phase 4 can keep a translation mounted as a closed disclosure. */
    translationDisclosure?: boolean;
    translationExpanded?: boolean;
    /** Lets Level 1 retain short vocabulary hints without enabling all easy Japanese. */
    showKeywordMeanings?: boolean;
  }

  interface JapaneseLanguageExpression {
    key: string;
    ja: string;
    id: string;
    explanationJa: string;
    explanationId: string;
    negative?: boolean;
  }

  const JAPANESE_LANGUAGE_POINT_DEFINITIONS: Record<JapaneseLanguagePointKey | 'which', JapaneseLanguageExpression> = {
    most_appropriate: { key: 'most_appropriate', ja: '最も適切', id: 'yang paling tepat', explanationJa: 'いちばん内容に合うものを選びます。', explanationId: 'Pilih jawaban yang paling sesuai.' },
    incorrect: { key: 'incorrect', ja: '誤っている', id: 'yang salah', explanationJa: '正しくない内容を選ぶ否定問題です。', explanationId: 'Ini soal negatif: pilih pernyataan yang salah.', negative: true },
    inappropriate: { key: 'inappropriate', ja: '適切でない', id: 'yang tidak tepat', explanationJa: '内容に合わないものを選ぶ否定問題です。', explanationId: 'Ini soal negatif: pilih jawaban yang tidak tepat.', negative: true },
    prohibited: { key: 'prohibited', ja: 'してはいけない', id: 'tidak boleh dilakukan', explanationJa: '禁止されている行動を表します。', explanationId: 'Menunjukkan tindakan yang dilarang.', negative: true },
    always: { key: 'always', ja: '必ず', id: 'wajib / pasti', explanationJa: '例外なく行うことを表します。', explanationId: 'Menunjukkan sesuatu yang wajib dilakukan tanpa pengecualian.' },
    except: { key: 'except', ja: '除く', id: 'kecuali', explanationJa: '示されたものを対象から外します。', explanationId: 'Keluarkan hal yang disebut dari kelompok.', negative: true },
    in_principle: { key: 'in_principle', ja: '原則として', id: 'pada prinsipnya', explanationJa: '基本の決まりを表し、例外があり得ます。', explanationId: 'Menunjukkan aturan dasar; mungkin ada pengecualian.' },
    select_all: { key: 'select_all', ja: 'すべて選ぶ', id: 'pilih semua jawaban', explanationJa: '正しい選択肢を全部選びます。', explanationId: 'Pilih semua pilihan yang benar.' },
    before_after: { key: 'before_after', ja: '次の分娩に備えて／時期として', id: 'untuk mempersiapkan proses melahirkan berikutnya / kapan', explanationJa: '次の出来事に備える時期を確認します。', explanationId: 'Perhatikan kapan tindakan dilakukan untuk mempersiapkan kejadian berikutnya.' },
    purpose: { key: 'purpose', ja: '利点として', id: 'sebagai keuntungan / apa keuntungannya', explanationJa: 'どのような利点があるかを尋ねる表現です。', explanationId: 'Menanyakan keuntungan dari tindakan tersebut.' },
    procedure_first: { key: 'procedure_first', ja: 'まず／最初に', id: 'pertama-tama', explanationJa: '手順の最初に行うことを確認します。', explanationId: 'Perhatikan tindakan yang dilakukan paling awal.' },
    not_included: { key: 'not_included', ja: '含まれない', id: 'tidak termasuk', explanationJa: 'グループの中に入らないものを選ぶ否定問題です。', explanationId: 'Ini soal negatif: pilih yang tidak termasuk dalam kelompok.', negative: true },
    condition: { key: 'condition', ja: '場合／とき', id: 'jika / ketika', explanationJa: 'どの条件のときかを確認します。', explanationId: 'Perhatikan kondisi kapan hal tersebut berlaku.' },
    at_least: { key: 'at_least', ja: '以上', id: 'sekurang-kurangnya', explanationJa: '示された数を含み、それより多い範囲です。', explanationId: 'Mencakup angka batas tersebut dan semua angka di atasnya.' },
    calculation: { key: 'calculation', ja: '必要な原液量は何mL', id: 'berapa mL larutan pekat yang diperlukan', explanationJa: '求める量と単位を確認して計算します。', explanationId: 'Periksa besaran dan satuan yang diminta, lalu hitung.' },
    correct_statement: { key: 'correct_statement', ja: '正しいもの', id: 'pernyataan yang benar', explanationJa: '内容が正しい選択肢を選びます。', explanationId: 'Pilih pernyataan yang benar.' },
    according_to_source: { key: 'according_to_source', ja: '教材に沿う', id: 'yang sesuai dengan materi', explanationJa: '教材の説明と一致するものを選びます。', explanationId: 'Pilih jawaban yang sesuai dengan isi materi.' },
    not_listed: { key: 'not_listed', ja: '挙げられていない', id: 'tidak dicantumkan', explanationJa: '教材に書かれていないものを選ぶ否定問題です。', explanationId: 'Ini soal negatif: pilih hal yang tidak dicantumkan dalam materi.', negative: true },
    only: { key: 'only', ja: 'のみ', id: 'hanya', explanationJa: '対象を一つの条件に限定します。', explanationId: 'Membatasi hal pada satu syarat saja.' },
    most_of: { key: 'most_of', ja: '大部分／ほとんど', id: 'sebagian besar / hampir semua', explanationJa: '全部ではなく、多くの部分を表します。', explanationId: 'Menunjukkan sebagian besar, bukan semuanya.' },
    which: { key: 'which', ja: 'どれ', id: 'yang mana', explanationJa: '選択肢の中から質問に合うものを一つ選びます。', explanationId: 'Pilih satu jawaban yang sesuai dari pilihan yang tersedia.' },
  };

  const GENERIC_PATTERN_EXPRESSIONS: Record<QuestionPatternKey, JapaneseLanguageExpression> = {
    most_appropriate: JAPANESE_LANGUAGE_POINT_DEFINITIONS.most_appropriate,
    incorrect: JAPANESE_LANGUAGE_POINT_DEFINITIONS.incorrect,
    correct: JAPANESE_LANGUAGE_POINT_DEFINITIONS.correct_statement,
    calculation: JAPANESE_LANGUAGE_POINT_DEFINITIONS.calculation,
    procedure: { key: 'procedure', ja: '手順', id: 'prosedur / urutan', explanationJa: '作業の順序や方法に合うものを選びます。', explanationId: 'Pilih prosedur atau urutan yang sesuai.' },
    which: JAPANESE_LANGUAGE_POINT_DEFINITIONS.which,
  };

  const JAPANESE_LANGUAGE_EXPRESSIONS: readonly JapaneseLanguageExpression[] = Object.values(JAPANESE_LANGUAGE_POINT_DEFINITIONS);

  const NEGATIVE_JA_TERMS = ['適切でない', 'してはいけない', '含まれない', '誤っている', '正しくない', '記載されていない', '挙げられていない', '除く', '否定表現'];
  const NEGATIVE_ID_TERMS = ['tidak boleh', 'tidak termasuk', 'tidak tepat', 'tidak tercantum', 'tidak dicantumkan', 'tidak disebutkan', 'yang salah', 'salah', 'jangan', 'kecuali', 'negatif'];

  function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightTerms(value: string, terms: readonly string[], language: 'ja' | 'id'): string {
    const candidates = terms.filter((term) => value.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
    if (!candidates.length) return escapeHtml(value);
    const matcher = new RegExp(`(${candidates.sort((left, right) => right.length - left.length).map(escapeRegExp).join('|')})`, 'giu');
    return value.split(matcher).map((part) => candidates.some((term) => term.toLocaleLowerCase() === part.toLocaleLowerCase())
      ? `<mark class="negative-expression" lang="${language}">${escapeHtml(part)}</mark>`
      : escapeHtml(part)).join('');
  }

  function negativeTextRanges(value: string): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    [...NEGATIVE_JA_TERMS].sort((left, right) => right.length - left.length).forEach((term) => {
      let offset = 0;
      while (offset < value.length) {
        const start = value.indexOf(term, offset);
        if (start < 0) break;
        const end = start + term.length;
        if (!ranges.some((range) => start < range.end && end > range.start)) ranges.push({ start, end });
        offset = end;
      }
    });
    return ranges.sort((left, right) => left.start - right.start);
  }

  function renderRubyWithNegativeEmphasis(text: LocalizedText, showFurigana: boolean): string {
    const ranges = negativeTextRanges(text.ja);
    if (!ranges.length) return renderJapaneseText(text, showFurigana);
    if (!showFurigana || !text.rubyJa?.length) return highlightTerms(text.ja, NEGATIVE_JA_TERMS, 'ja');
    let offset = 0;
    let marked = false;
    let result = '';
    text.rubyJa.forEach((segment) => {
      const start = offset;
      const end = start + segment.text.length;
      const shouldMark = ranges.some((range) => start < range.end && end > range.start);
      if (shouldMark !== marked) {
        result += shouldMark ? '<mark class="negative-expression" lang="ja">' : '</mark>';
        marked = shouldMark;
      }
      result += segment.reading
        ? `<ruby>${escapeHtml(segment.text)}<rt>${escapeHtml(segment.reading)}</rt></ruby>`
        : escapeHtml(segment.text);
      offset = end;
    });
    if (marked) result += '</mark>';
    return result;
  }

  export function learningIndonesianVisible(options: LearningRenderOptions): boolean {
    return options.showIndonesian
      || (options.phase === 'after-answer' && options.revealIndonesianAfterAnswer === true);
  }

  function questionTranslationVisible(options: LearningRenderOptions): boolean {
    return options.showQuestionTranslation ?? learningIndonesianVisible(options);
  }

  function choiceTranslationsVisible(options: LearningRenderOptions): boolean {
    return options.showChoiceTranslations ?? learningIndonesianVisible(options);
  }

  function answerIndonesianVisible(options: LearningRenderOptions): boolean {
    return options.showAnswerIndonesian ?? learningIndonesianVisible(options);
  }

  export function renderBilingualHeading(ja: string, id: string, showIndonesian: boolean): string {
    if (!showIndonesian) return `<span lang="ja">${escapeHtml(ja)}</span>`;
    return `<span lang="ja">${escapeHtml(ja)}</span><span aria-hidden="true"> / </span><span lang="id">${escapeHtml(id)}</span>`;
  }

  export function renderRubyText(text: LocalizedText, showFurigana: boolean, emphasizeNegative = false): string {
    return emphasizeNegative ? renderRubyWithNegativeEmphasis(text, showFurigana) : renderJapaneseText(text, showFurigana);
  }

  export function renderKeywordGlossary(
    question: Question,
    glossary: readonly GlossaryItem[],
    enabled: boolean,
    options: LearningRenderOptions,
  ): string {
    if (!enabled || options.showKeywords === false) return '';
    const terms = question.learningSupport.keyTermIds
      .map((id) => glossary.find((item) => item.id === id))
      .filter((item): item is GlossaryItem => Boolean(item));
    if (!terms.length) return '';
    const compact = options.compactKeywordHints === true && options.phase === 'before-answer';
    const showIndonesian = options.phase === 'after-answer'
      ? options.showKeywordIndonesian === true || answerIndonesianVisible(options)
      : options.showKeywordIndonesian ?? learningIndonesianVisible(options);
    const showMeanings = options.showKeywordMeanings ?? options.showEasyJapanese;
    return `
      <section class="lesson-vocabulary ${compact ? 'compact-keyword-hints' : ''}" data-learning-component="keyword-glossary" data-support-usage="keywords" data-no-ui-translation="true">
        <div class="lesson-subheading">
          <span class="lesson-step">3</span>
          <div><strong>${renderBilingualHeading('重要な日本語', 'Kosakata penting', showIndonesian)}</strong>${showIndonesian ? '<small lang="id">Baca kanji, arti sederhana, dan arti bahasa Indonesia.</small>' : options.showFurigana ? '<small lang="ja">漢字と読み方を確認します。</small>' : '<small lang="ja">問題の重要語を確認します。</small>'}</div>
        </div>
        <div class="vocabulary-grid">
          ${terms.map((term) => `
            <article class="vocabulary-card">
              ${options.showFurigana ? `<ruby lang="ja">${escapeHtml(term.termJa)}<rt>${escapeHtml(term.reading)}</rt></ruby>` : `<strong class="vocabulary-term" lang="ja">${escapeHtml(term.termJa)}</strong>`}
              ${showMeanings ? `<p lang="ja">${escapeHtml(term.easyJa)}</p>` : ''}
              ${showIndonesian ? `<strong lang="id">${escapeHtml(term.idn)}</strong>` : ''}
            </article>`).join('')}
        </div>
      </section>`;
  }

  export function renderIndonesianTranslation(
    text: LocalizedText,
    options: LearningRenderOptions,
    label = 'Arti dalam Bahasa Indonesia',
    usage = 'question-translation',
  ): string {
    if (!questionTranslationVisible(options) || !text.id) return '';
    const content = `<div class="support-box id" data-learning-component="indonesian-translation" data-support-usage="${escapeHtml(usage)}"><strong lang="id">${escapeHtml(label)}</strong><p lang="id">${highlightTerms(text.id, NEGATIVE_ID_TERMS, 'id')}</p></div>`;
    if (!options.translationDisclosure) return content;
    return `<details class="translation-disclosure" data-learning-component="indonesian-translation-disclosure" data-support-usage="${escapeHtml(usage)}" ${options.translationExpanded ? 'open' : ''}><summary lang="id">${escapeHtml(label)}</summary>${content}</details>`;
  }

  export function renderQuestionIntent(
    intent: Pick<LocalizedText, 'ja' | 'easyJa' | 'id'>,
    pattern: QuestionPatternKey,
    questionJa: string,
    options: LearningRenderOptions,
  ): string {
    if (options.showIntent === false) return '';
    const showIndonesian = options.showIntentIndonesian ?? learningIndonesianVisible(options);
    const negative = pattern === 'incorrect' || JAPANESE_LANGUAGE_EXPRESSIONS.some((item) => item.negative && questionJa.includes(item.ja));
    const ja = negative ? highlightTerms(intent.ja, NEGATIVE_JA_TERMS, 'ja') : escapeHtml(intent.ja);
    const id = negative ? highlightTerms(intent.id, NEGATIVE_ID_TERMS, 'id') : escapeHtml(intent.id);
    return `
      <section class="question-pattern-guide ${negative ? 'negative-pattern' : ''}" data-learning-component="question-intent" data-no-ui-translation="true">
        <strong>${renderBilingualHeading('設問の意図', 'Maksud pertanyaan', showIndonesian)}</strong>
        <p lang="ja">${ja}</p>
        ${showIndonesian ? `<p lang="id">${id}</p>` : ''}
      </section>`;
  }

  export function renderChoiceTranslation(text: LocalizedText, options: LearningRenderOptions): string {
    const showIndonesian = choiceTranslationsVisible(options);
    return `
      <span class="choice-ja" lang="ja">${renderRubyText(text, options.showFurigana)}</span>
      ${options.showEasyJapanese && text.easyJa !== text.ja ? `<span class="choice-support" lang="ja">${escapeHtml(text.easyJa)}</span>` : ''}
      ${showIndonesian ? `<span class="choice-support id" lang="id" data-learning-component="choice-translation" data-support-usage="choice-translation">${escapeHtml(text.id)}</span>` : ''}`;
  }

  export function renderAnswerExplanation(
    question: Question,
    correctChoice: Choice | undefined,
    correct: boolean,
    options: LearningRenderOptions,
  ): string {
    const showIndonesian = answerIndonesianVisible(options);
    return `
      <section class="answer-panel ${correct ? 'correct' : 'wrong'}" data-learning-component="answer-explanation" data-no-ui-translation="true">
        <h2>${correct
          ? renderBilingualHeading('正解です', 'Jawaban benar', showIndonesian)
          : renderBilingualHeading('不正解です', 'Jawaban belum benar', showIndonesian)}</h2>
        <div class="correct-answer-block">
          <strong>${renderBilingualHeading('正解', 'Jawaban benar', showIndonesian)}</strong>
          <p lang="ja">${correctChoice ? renderRubyText(correctChoice.text, options.showFurigana) : ''}</p>
          ${showIndonesian ? `<p lang="id">${escapeHtml(correctChoice?.text.id ?? '')}</p>` : ''}
        </div>
        <div class="explanation-block">
          <h3>${renderBilingualHeading('なぜこの答え？', 'Mengapa jawaban ini benar?', showIndonesian)}</h3>
          <p lang="ja">${renderRubyText(question.explanation, options.showFurigana)}</p>
          ${options.showEasyJapanese ? `<p class="easy-explanation" lang="ja"><strong>やさしい日本語：</strong>${escapeHtml(question.explanation.easyJa)}</p>` : ''}
          ${showIndonesian ? `<p class="id-explanation" lang="id"><strong>Penjelasan：</strong>${escapeHtml(question.explanation.id)}</p>` : ''}
        </div>
        <div class="memory-point">
          <strong>${renderBilingualHeading('覚えるポイント', 'Poin yang perlu diingat', showIndonesian)}</strong>
          <p lang="ja">${renderRubyText(question.learningSupport.memoryPoint, options.showFurigana)}</p>
          ${showIndonesian ? `<p lang="id">${escapeHtml(question.learningSupport.memoryPoint.id)}</p>` : ''}
        </div>
        <div class="source-citation"><strong>${showIndonesian ? '参照 / Sumber' : '参照'}：</strong>${escapeHtml(question.source.documentTitle)}／${escapeHtml(question.source.edition)}／PDF ${question.source.pdfPage}／冊子 ${escapeHtml(question.source.printedPageLabel || '-')}／${escapeHtml(question.source.section)}</div>
      </section>`;
  }

  export function renderWrongChoiceExplanation(question: Question, options: LearningRenderOptions): string {
    const showIndonesian = answerIndonesianVisible(options);
    return `
      <section class="choice-review" data-learning-component="wrong-choice-explanation" data-no-ui-translation="true">
        <h3>${renderBilingualHeading('選択肢を確認', 'Pembahasan setiap pilihan', showIndonesian)}</h3>
        <div class="choice-review-list">
          ${question.choices.map((choice) => {
            const rationale = question.choiceRationales[choice.id];
            const correct = choice.id === question.correctChoiceId;
            return `<article class="choice-review-item ${correct ? 'correct' : 'wrong'}">
              <div class="choice-review-title"><span>${choice.id.toUpperCase()}</span><strong lang="ja">${renderRubyText(choice.text, options.showFurigana)}</strong>${showIndonesian ? `<em lang="id">${escapeHtml(choice.text.id)}</em>` : ''}</div>
              <p lang="ja">${rationale ? renderRubyText(rationale, options.showFurigana) : ''}</p>
              ${showIndonesian ? `<p lang="id">${escapeHtml(rationale?.id ?? '')}</p>` : ''}
            </article>`;
          }).join('')}
        </div>
      </section>`;
  }

  export function renderJapaneseLanguagePoint(question: Question, options: LearningRenderOptions): string {
    const showIndonesian = answerIndonesianVisible(options);
    const configuredKeys = question.learningSupport.languagePointKeys ?? [];
    const configured = configuredKeys.map((key) => JAPANESE_LANGUAGE_POINT_DEFINITIONS[key]).filter((item): item is JapaneseLanguageExpression => Boolean(item));
    const detected = configured.length ? [] : JAPANESE_LANGUAGE_EXPRESSIONS.filter((item) => question.question.ja.includes(item.ja));
    const source = configured.length ? configured : detected.length ? detected : [GENERIC_PATTERN_EXPRESSIONS[question.learningSupport.questionPattern]];
    const seen = new Set<string>();
    const expressions = source.filter((item) => {
      if (!item || seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });
    const negative = expressions.some((item) => item.negative);
    return `
      <section class="japanese-language-point ${negative ? 'negative-language-point' : ''}" data-learning-component="japanese-language-point" data-no-ui-translation="true">
        <h3>${renderBilingualHeading('日本語ポイント', 'Poin bahasa Jepang', showIndonesian)}</h3>
        <div class="language-expression-list">
          ${expressions.map((item) => `<div class="language-expression">
            <div class="language-expression-copy"><strong lang="ja">${item.negative ? `<mark class="negative-expression">${escapeHtml(item.ja)}</mark>` : escapeHtml(item.ja)}</strong><small lang="ja">${escapeHtml(item.explanationJa)}</small></div>
            ${showIndonesian ? `<div class="language-expression-copy" lang="id"><strong>${item.negative ? `<mark class="negative-expression">${escapeHtml(item.id)}</mark>` : escapeHtml(item.id)}</strong><small>${escapeHtml(item.explanationId)}</small></div>` : ''}
          </div>`).join('')}
        </div>
        ${negative ? `<p class="negative-warning"><strong lang="ja">否定部分を確認してから選びます。</strong>${showIndonesian ? '<span lang="id">Periksa bagian negatif sebelum memilih jawaban.</span>' : ''}</p>` : ''}
      </section>`;
  }

  export function renderRetryWithoutSupport(
    questionId: string,
    showIndonesian: boolean,
    language: UiLanguage = currentUiLanguage(),
  ): string {
    return `
      <section class="retry-without-support" data-learning-component="retry-without-support" data-no-ui-translation="true">
        <div><strong lang="ja">日本語だけでもう一度</strong>${showIndonesian ? '<small lang="id">Coba lagi tanpa bantuan.</small>' : '<small lang="ja">ふりがな・翻訳・ヒントを使わずに確認します。</small>'}</div>
        <button type="button" class="btn secondary" data-retry-without-support="${escapeHtml(questionId)}" data-ui-control="true" data-ui-control-language="${language}">${escapeHtml(ui('補助なしで再挑戦', 'Coba lagi tanpa bantuan', language))}</button>
      </section>`;
  }

  // Exact component names are exported for Phase 3/4 integrations while keeping
  // the existing render* naming convention used throughout this application.
  export const RubyText = renderRubyText;
  export const KeywordGlossary = renderKeywordGlossary;
  export const IndonesianTranslation = renderIndonesianTranslation;
  export const QuestionIntent = renderQuestionIntent;
  export const ChoiceTranslation = renderChoiceTranslation;
  export const AnswerExplanation = renderAnswerExplanation;
  export const WrongChoiceExplanation = renderWrongChoiceExplanation;
  export const JapaneseLanguagePoint = renderJapaneseLanguagePoint;
  export const RetryWithoutSupport = renderRetryWithoutSupport;
}
