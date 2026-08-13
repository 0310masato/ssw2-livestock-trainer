namespace LivestockApp {
  const QUESTION_PATTERN_HELP: Record<QuestionPatternKey, Omit<LocalizedText, 'rubyJa'>> = {
    most_appropriate: {
      ja: '「最も適切なもの」は、4つの中から一番よく当てはまる答えを1つ選ぶ問題です。',
      easyJa: '4つの中から、一番よい答えを1つ選びます。',
      id: '「最も適切なもの」 berarti pilih satu jawaban yang paling tepat dari empat pilihan.',
    },
    incorrect: {
      ja: '「誤っているもの」は、正しくない選択肢を1つ選ぶ問題です。正しいものを選ばないよう注意します。',
      easyJa: 'まちがっている答えを1つ選びます。',
      id: '「誤っているもの」 berarti pilih satu pernyataan yang salah. Jangan memilih pernyataan yang benar.',
    },
    correct: {
      ja: '「正しいもの」は、教材の説明と一致する選択肢を1つ選ぶ問題です。',
      easyJa: '正しい答えを1つ選びます。',
      id: '「正しいもの」 berarti pilih satu pernyataan yang benar dan sesuai dengan materi.',
    },
    calculation: {
      ja: '数値・単位・条件を確認し、何を求める問題かを整理してから計算します。',
      easyJa: '数字と単位を見て、順番に計算します。',
      id: 'Periksa angka, satuan, dan syaratnya. Tentukan apa yang ditanyakan sebelum menghitung.',
    },
    procedure: {
      ja: '作業の順番や、最初・次・最後に行うことを確認する問題です。',
      easyJa: '仕事の順番を考える問題です。',
      id: 'Soal ini menanyakan urutan kerja: apa yang dilakukan pertama, berikutnya, dan terakhir.',
    },
    which: {
      ja: '問題文の条件に合う選択肢を1つ選びます。主語・数値・否定表現を確認します。',
      easyJa: '問題に合う答えを1つ選びます。',
      id: 'Pilih satu jawaban yang sesuai dengan syarat pada kalimat soal. Periksa subjek, angka, dan bentuk negatif.',
    },
  };

  export function supportSettingsForStudy(
    state: AppState,
    question: Question,
    kind: SessionKind,
  ): { showFurigana: boolean; showEasyJapanese: boolean; showIndonesian: boolean } {
    return supportSettingsForLevel(resolvedSupportLevel(state, question, kind));
  }

  function patternHelp(question: Question): Pick<LocalizedText, 'ja' | 'easyJa' | 'id'> {
    return question.learningSupport.intentOverride
      ?? QUESTION_PATTERN_HELP[question.learningSupport.questionPattern]
      ?? QUESTION_PATTERN_HELP.which;
  }

  function bilingualHeading(ja: string, id: string): string {
    return renderBilingualHeading(ja, id, true);
  }

  function renderUiControlLabel(ja: string, id: string, language: UiLanguage): string {
    return escapeHtml(ui(ja, id, language));
  }

  function renderSupportToggle(
    active: boolean,
    labelJa: string,
    labelId: string,
    sessionToggle: string,
    supportUsage: string,
    language: UiLanguage,
  ): string {
    const stateLabel = active
      ? renderUiControlLabel('ON', 'AKTIF', language)
      : renderUiControlLabel('OFF', 'NONAKTIF', language);
    return `<button class="support-toggle ${active ? 'active' : ''}" data-session-toggle="${sessionToggle}" data-support-usage="${supportUsage}" data-ui-control="true" data-ui-control-language="${language}" aria-pressed="${active}">${renderUiControlLabel(labelJa, labelId, language)} ${stateLabel}</button>`;
  }

  function renderChoice(
    choice: Choice,
    question: Question,
    session: SessionState,
    options: LearningRenderOptions,
  ): string {
    const selected = session.selectedChoiceId === choice.id;
    const answerClass = session.answered
      ? choice.id === question.correctChoiceId ? 'correct' : selected ? 'wrong' : ''
      : selected ? 'selected' : '';
    return `<button class="choice-button guided-choice ${answerClass}" data-choice="${choice.id}" ${session.answered ? 'disabled' : ''} data-no-ui-translation="true">
      <span class="choice-letter">${choice.id.toUpperCase()}</span>
      <span class="choice-copy">
        ${renderChoiceTranslation(choice.text, options)}
      </span>
    </button>`;
  }

  function renderReasonPanel(selected: ErrorReason | null, language: UiLanguage): string {
    return `<section class="reason-panel" data-no-ui-translation="true">
      <h2 data-ui-control="true" data-ui-control-language="${language}">${renderUiControlLabel('なぜ間違えましたか？', 'Mengapa jawaban Anda salah?', language)}</h2>
      <p data-ui-control="true" data-ui-control-language="${language}">${renderUiControlLabel('次の出題を調整するために1つ選んでください。', 'Pilih satu alasan agar soal dan bantuan berikutnya dapat disesuaikan.', language)}</p>
      <div class="reason-grid">${(Object.keys(ERROR_REASON_LABELS) as ErrorReason[]).map((reason) => `
        <button class="reason-button ${selected === reason ? 'active' : ''}" data-reason="${reason}" data-ui-control="true" data-ui-control-language="${language}">${escapeHtml(errorReasonUiLabel(reason, language))}</button>`).join('')}
      </div>
    </section>`;
  }

  function renderJapaneseOnlyQuestionCard(
    question: Question,
    session: SessionState,
    settings: UserSettings,
    correct: boolean,
    supportLevel: number,
    total: number,
  ): string {
    const correctChoice = question.choices.find((choice) => choice.id === question.correctChoiceId);
    const language = settings.uiLanguage;
    const options: LearningRenderOptions = {
      showFurigana: false,
      showEasyJapanese: false,
      showIndonesian: false,
      phase: session.answered ? 'after-answer' : 'before-answer',
    };
    return `
      <article class="question-card japanese-only-card" data-no-ui-translation="true">
        <div class="question-number">問題 ${session.index + 1} / ${total} ・ 支援レベル ${supportLevel} ・ ${escapeHtml(question.status)}</div>
        <h1 class="question-text" lang="ja">${escapeHtml(question.question.ja)}</h1>
        ${question.visual ? `<figure class="question-visual"><img src="${assetPath(question.visual.assetId)}" alt="${escapeHtml(question.visual.altJa)}"><figcaption>独自作成の学習用模式図</figcaption></figure>` : ''}
        <div class="confidence-row" aria-label="${renderUiControlLabel('回答前の自信', 'Keyakinan sebelum menjawab', language)}" data-ui-control="true" data-ui-control-language="${language}">
          <span>${renderUiControlLabel('自信：', 'Keyakinan:', language)}</span>
          <button class="confidence-button ${session.confidence === 'sure' ? 'active' : ''}" data-confidence="sure" data-ui-control="true" data-ui-control-language="${language}">${renderUiControlLabel('分かる', 'Yakin', language)}</button>
          <button class="confidence-button ${session.confidence === 'unsure' ? 'active' : ''}" data-confidence="unsure" data-ui-control="true" data-ui-control-language="${language}">${renderUiControlLabel('迷っている', 'Masih ragu', language)}</button>
        </div>
        <div class="choice-list">
          ${question.choices.map((choice) => renderChoice(choice, question, session, options)).join('')}
        </div>
        ${!session.answered ? `<button class="btn primary full" data-answer data-ui-control="true" data-ui-control-language="${language}" ${session.selectedChoiceId ? '' : 'disabled'}>${renderUiControlLabel('回答する', 'Jawab', language)}</button>` : `
          ${renderAnswerExplanation(question, correctChoice, correct, options)}
          ${renderWrongChoiceExplanation(question, options)}
          ${renderKeywordGlossary(question, GLOSSARY, true, { ...options, showKeywords: true, showKeywordMeanings: false })}
          ${renderJapaneseLanguagePoint(question, options)}
          ${!correct ? renderReasonPanel(session.pendingReason, language) : ''}
          <button class="btn primary full" data-next data-ui-control="true" data-ui-control-language="${language}" ${!correct && !session.pendingReason ? 'disabled' : ''}>${session.index + 1 >= total ? renderUiControlLabel('結果を見る', 'Lihat hasil', language) : renderUiControlLabel('次の問題', 'Soal berikutnya', language)}</button>
        `}
      </article>`;
  }

  function renderSessionSupportControls(
    session: SessionState,
    settings: UserSettings,
    supportLevel: number,
    options: LearningRenderOptions,
  ): string {
    const controls: string[] = [];
    const language = settings.uiLanguage;
    if (supportLevel > 0) {
      controls.push(renderSupportToggle(session.furiganaVisible, 'ふりがな', 'Furigana', 'furigana', 'furigana', language));
    }
    if (supportLevel === 3) {
      controls.push(renderSupportToggle(session.easyJapaneseVisible, 'やさしい日本語', 'Bahasa Jepang sederhana', 'easy', 'easy-japanese', language));
    }
    if (supportLevel > 0 && settings.showVocabulary) {
      controls.push(renderSupportToggle(session.keywordsVisible, '重要語', 'Kosakata penting', 'keywords', 'keywords', language));
    }
    if (options.allowQuestionTranslation) {
      controls.push(renderSupportToggle(session.indonesianVisible, '問題の全文訳', 'Terjemahan lengkap soal', 'question-id', 'question-translation', language));
    }
    if (options.allowChoiceTranslations) {
      controls.push(renderSupportToggle(session.choiceTranslationsVisible, '選択肢の翻訳', 'Terjemahan pilihan jawaban', 'choices-id', 'choice-translation', language));
    }
    if (session.answered && options.allowAnswerIndonesian) {
      controls.push(renderSupportToggle(session.answerIndonesianVisible, '回答後のインドネシア語', 'Penjelasan bahasa Indonesia', 'answer-id', 'answer-indonesian', language));
    }
    return controls.length ? `<div class="support-controls" aria-label="${renderUiControlLabel('学習支援の表示切替', 'Tampilkan atau sembunyikan bantuan belajar', language)}" data-ui-control="true" data-ui-control-language="${language}">${controls.join('')}</div>` : '';
  }

  export function renderGuidedQuestionCard(
    question: Question,
    session: SessionState,
    settings: UserSettings,
    correct: boolean,
    supportLevel: SupportLevel,
    total: number,
    componentOverrides: Partial<LearningRenderOptions> = {},
  ): string {
    const levelPolicy = supportPolicyForLevel(supportLevel);
    const sharedOptions = {
      showFurigana: levelPolicy.showFuriganaInitially,
      showEasyJapanese: levelPolicy.showEasyJapaneseInitially,
      showIndonesian: levelPolicy.showQuestionTranslationInitially,
      ...componentOverrides,
    };
    const beforeOptions: LearningRenderOptions = { ...sharedOptions, phase: 'before-answer' };
    const afterOptions: LearningRenderOptions = { ...sharedOptions, phase: 'after-answer' };
    const activeOptions = session.answered ? afterOptions : beforeOptions;
    const showIndonesianBeforeAnswer = learningIndonesianVisible(beforeOptions);
    const showIndonesianAfterAnswer = afterOptions.showAnswerIndonesian ?? learningIndonesianVisible(afterOptions);
    const language = settings.uiLanguage;
    if (supportLevel === 0 || componentOverrides.isRetryWithoutSupport === true) {
      return renderJapaneseOnlyQuestionCard(question, session, settings, correct, supportLevel, total);
    }
    const pattern = patternHelp(question);
    const correctChoice = question.choices.find((choice) => choice.id === question.correctChoiceId);
    const meaningSupport = `${beforeOptions.showEasyJapanese ? `<div class="support-box"><strong lang="ja">やさしい日本語</strong><p lang="ja">${escapeHtml(question.question.easyJa)}</p></div>` : ''}${renderIndonesianTranslation(question.question, beforeOptions)}`;
    return `
      <article class="question-card guided-lesson-card" data-no-ui-translation="true">
        <div class="question-number">問題 ${session.index + 1} / ${total} ・ 支援レベル ${supportLevel} ・ ${escapeHtml(question.status)}</div>
        ${renderSessionSupportControls(session, settings, supportLevel, activeOptions)}

        <section class="lesson-stage" data-no-ui-translation="true">
          <div class="lesson-subheading"><span class="lesson-step">1</span><div><strong>${renderBilingualHeading('日本語の問題を読む', 'Baca soal bahasa Jepang', showIndonesianBeforeAnswer)}</strong>${showIndonesianBeforeAnswer ? '<small lang="id">Mulai dari kalimat asli yang akan muncul dalam ujian.</small>' : '<small lang="ja">試験に出る日本語を先に読みます。</small>'}</div></div>
          <h1 class="question-text" lang="ja" data-learning-component="ruby-text">${renderRubyText(question.question, beforeOptions.showFurigana, true)}</h1>
        </section>

        <section class="lesson-goal" data-no-ui-translation="true">
          <span class="lesson-label" lang="ja">学習目標${showIndonesianBeforeAnswer ? ' / <span lang="id">Tujuan belajar</span>' : ''}</span>
          <p lang="ja">${renderRubyText(question.learningSupport.lessonObjective, beforeOptions.showFurigana)}</p>
          ${showIndonesianBeforeAnswer ? `<p lang="id">${escapeHtml(question.learningSupport.lessonObjective.id)}</p>` : ''}
        </section>

        ${settings.showQuestionPattern ? renderQuestionIntent(pattern, question.learningSupport.questionPattern, question.question.ja, beforeOptions) : ''}

        ${meaningSupport ? `<section class="lesson-stage meaning-stage" data-no-ui-translation="true">
          <div class="lesson-subheading"><span class="lesson-step">2</span><div><strong>${renderBilingualHeading('意味を確認する', 'Pahami arti soal', showIndonesianBeforeAnswer)}</strong>${showIndonesianBeforeAnswer ? '<small lang="id">Gunakan bantuan untuk memahami, bukan untuk sekadar menebak.</small>' : '<small lang="ja">必要な補助を使って意味を確認します。</small>'}</div></div>
          ${meaningSupport}
        </section>` : ''}

        ${!session.answered ? renderKeywordGlossary(question, GLOSSARY, settings.showVocabulary, { ...beforeOptions, showKeywordMeanings: beforeOptions.compactKeywordHints || beforeOptions.showEasyJapanese }) : ''}
        ${question.visual ? `<figure class="question-visual"><img src="${assetPath(question.visual.assetId)}" alt="${escapeHtml(question.visual.altJa)}"><figcaption>${showIndonesianBeforeAnswer ? '独自作成の学習用模式図 / Diagram belajar asli' : '独自作成の学習用模式図'}</figcaption></figure>` : ''}

        <div class="confidence-row" aria-label="${renderUiControlLabel('回答前の自信', 'Keyakinan sebelum menjawab', language)}" data-ui-control="true" data-ui-control-language="${language}">
          <span>${renderUiControlLabel('自信：', 'Keyakinan:', language)}</span>
          <button class="confidence-button ${session.confidence === 'sure' ? 'active' : ''}" data-confidence="sure" data-ui-control="true" data-ui-control-language="${language}">${renderUiControlLabel('分かる', 'Yakin', language)}</button>
          <button class="confidence-button ${session.confidence === 'unsure' ? 'active' : ''}" data-confidence="unsure" data-ui-control="true" data-ui-control-language="${language}">${renderUiControlLabel('迷っている', 'Masih ragu', language)}</button>
        </div>
        <div class="choice-list">
          ${question.choices.map((choice) => renderChoice(choice, question, session, activeOptions)).join('')}
        </div>

        ${!session.answered ? `<button class="btn primary full" data-answer data-ui-control="true" data-ui-control-language="${language}" ${session.selectedChoiceId ? '' : 'disabled'}>${renderUiControlLabel('回答する', 'Jawab', language)}</button>` : `
          ${renderAnswerExplanation(question, correctChoice, correct, afterOptions)}
          ${renderWrongChoiceExplanation(question, afterOptions)}
          ${renderKeywordGlossary(question, GLOSSARY, true, { ...afterOptions, showKeywords: true, showKeywordMeanings: afterOptions.compactKeywordHints || afterOptions.showEasyJapanese })}
          ${renderJapaneseLanguagePoint(question, afterOptions)}
          ${supportLevel > 0 && !afterOptions.isRetryWithoutSupport ? renderRetryWithoutSupport(question.id, showIndonesianAfterAnswer, language) : ''}
          ${!correct ? renderReasonPanel(session.pendingReason, language) : ''}
          <button class="btn primary full" data-next data-ui-control="true" data-ui-control-language="${language}" ${!correct && !session.pendingReason ? 'disabled' : ''}>${session.index + 1 >= total ? renderUiControlLabel('結果を見る', 'Lihat hasil', language) : renderUiControlLabel('次の問題', 'Soal berikutnya', language)}</button>
        `}
      </article>`;
  }

  export function renderLearningFlowPanel(): string {
    return `
      <section class="learning-flow-panel" data-no-ui-translation="true">
        <div class="learning-flow-copy">
          <span class="lesson-label" lang="id">Cara belajar</span>
          <h2><span lang="ja">日本語を理解してから、補助なしで解けるようにする</span><span lang="id">Pahami bahasa Jepang, lalu kurangi bantuan sedikit demi sedikit</span></h2>
          <p lang="id">Aplikasi ini bukan sekadar menerjemahkan tombol. Setiap soal dipelajari melalui kalimat Jepang, furigana, arti Indonesia, kosakata, dan pembahasan.</p>
        </div>
        <ol class="learning-flow-steps">
          <li><strong>1</strong><span><b lang="ja">読む</b><small lang="id">Baca soal Jepang dengan furigana</small></span></li>
          <li><strong>2</strong><span><b lang="ja">理解する</b><small lang="id">Pahami arti dan istilah dalam bahasa Indonesia</small></span></li>
          <li><strong>3</strong><span><b lang="ja">説明で確認</b><small lang="id">Pelajari alasan benar dan salah</small></span></li>
          <li><strong>4</strong><span><b lang="ja">補助を減らす</b><small lang="id">Ulangi dengan bantuan lebih sedikit</small></span></li>
        </ol>
        <p class="mock-boundary" lang="id"><strong>Mode simulasi ujian:</strong> tetap hanya bahasa Jepang, tanpa furigana dan tanpa terjemahan.</p>
      </section>`;
  }

  export function renderPedagogySettingsPanel(settings: UserSettings): string {
    return `
      <section class="settings-panel pedagogy-settings" data-no-ui-translation="true">
        <h2>${bilingualHeading('学習方法', 'Metode belajar')}</h2>
        <label class="setting-row select-row"><span><strong>${bilingualHeading('学習サポート', 'Bantuan belajar')}</strong><small lang="id">Pilih cara bantuan ditampilkan pada soal latihan. Mode simulasi selalu bahasa Jepang saja.</small></span><select data-setting-study-mode>
          <option value="guided" ${settings.studySupportMode === 'guided' ? 'selected' : ''}>Belajar terpandu / しっかり理解</option>
          <option value="adaptive" ${settings.studySupportMode === 'adaptive' ? 'selected' : ''}>Bantuan berkurang otomatis / 段階的に減らす</option>
          <option value="japanese_only" ${settings.studySupportMode === 'japanese_only' ? 'selected' : ''}>Bahasa Jepang saja / 日本語のみ</option>
        </select></label>
        <label class="setting-row select-row"><span><strong>${bilingualHeading('guided の支援レベル', 'Level bantuan mode guided')}</strong><small lang="id">Dipakai hanya pada mode guided. Mode adaptive menentukan level dari kemajuan belajar.</small></span><select data-setting-level ${settings.studySupportMode === 'guided' ? '' : 'disabled'}>${[3, 2, 1, 0].map((level) => `<option value="${level}" ${settings.preferredSupportLevel === level ? 'selected' : ''}>Level ${level}：${escapeHtml(SUPPORT_LEVEL_LABELS[level])}</option>`).join('')}</select></label>
        <label class="setting-row"><span><strong>${bilingualHeading('重要語を表示', 'Tampilkan kosakata penting')}</strong><small lang="id">Menampilkan kanji, furigana, bahasa Jepang sederhana, dan arti Indonesia.</small></span><input type="checkbox" data-setting-pedagogy-checkbox="showVocabulary" ${settings.showVocabulary ? 'checked' : ''}></label>
        <label class="setting-row"><span><strong>${bilingualHeading('問題文の読み方を表示', 'Tampilkan cara membaca pola soal')}</strong><small lang="id">Menjelaskan ungkapan seperti 「最も適切」 dan 「誤っている」.</small></span><input type="checkbox" data-setting-pedagogy-checkbox="showQuestionPattern" ${settings.showQuestionPattern ? 'checked' : ''}></label>
      </section>`;
  }
}
