namespace LivestockApp {
  const QUESTION_PATTERN_HELP: Record<QuestionPatternKey, LocalizedText> = {
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
  ): Pick<UserSettings, 'showFurigana' | 'showEasyJapanese' | 'showIndonesian'> {
    if (kind === 'mock' || state.settings.studySupportMode === 'japanese_only') {
      return { showFurigana: false, showEasyJapanese: false, showIndonesian: false };
    }
    if (state.settings.studySupportMode === 'guided') {
      return { showFurigana: true, showEasyJapanese: true, showIndonesian: true };
    }
    if (state.settings.automaticSupport) {
      return supportSettingsForLevel(effectiveSupportLevel(state, question));
    }
    return {
      showFurigana: state.settings.showFurigana,
      showEasyJapanese: state.settings.showEasyJapanese,
      showIndonesian: state.settings.showIndonesian,
    };
  }

  function patternHelp(question: Question): LocalizedText {
    return QUESTION_PATTERN_HELP[question.learningSupport.questionPattern] ?? QUESTION_PATTERN_HELP.which;
  }

  function keyTerms(question: Question): GlossaryItem[] {
    return question.learningSupport.keyTermIds
      .map((id) => GLOSSARY.find((item) => item.id === id))
      .filter((item): item is GlossaryItem => Boolean(item));
  }

  function bilingualHeading(ja: string, id: string): string {
    return `<span lang="ja">${escapeHtml(ja)}</span><span aria-hidden="true"> / </span><span lang="id">${escapeHtml(id)}</span>`;
  }

  function renderVocabulary(question: Question, enabled: boolean): string {
    if (!enabled) return '';
    const terms = keyTerms(question);
    if (!terms.length) return '';
    return `
      <section class="lesson-vocabulary" data-no-ui-translation="true">
        <div class="lesson-subheading">
          <span class="lesson-step">3</span>
          <div><strong>${bilingualHeading('重要な日本語', 'Kosakata penting')}</strong><small lang="id">Baca kanji, arti sederhana, dan arti bahasa Indonesia.</small></div>
        </div>
        <div class="vocabulary-grid">
          ${terms.map((term) => `
            <article class="vocabulary-card">
              <ruby lang="ja">${escapeHtml(term.termJa)}<rt>${escapeHtml(term.reading)}</rt></ruby>
              <p lang="ja">${escapeHtml(term.easyJa)}</p>
              <strong lang="id">${escapeHtml(term.idn)}</strong>
            </article>`).join('')}
        </div>
      </section>`;
  }

  function renderChoice(
    choice: Choice,
    question: Question,
    session: SessionState,
    settings: UserSettings,
  ): string {
    const selected = session.selectedChoiceId === choice.id;
    const answerClass = session.answered
      ? choice.id === question.correctChoiceId ? 'correct' : selected ? 'wrong' : ''
      : selected ? 'selected' : '';
    return `<button class="choice-button guided-choice ${answerClass}" data-choice="${choice.id}" ${session.answered ? 'disabled' : ''} data-no-ui-translation="true">
      <span class="choice-letter">${choice.id.toUpperCase()}</span>
      <span class="choice-copy">
        <span class="choice-ja" lang="ja">${renderJapaneseText(choice.text, settings.showFurigana)}</span>
        ${settings.showEasyJapanese && choice.text.easyJa !== choice.text.ja ? `<span class="choice-support" lang="ja">${escapeHtml(choice.text.easyJa)}</span>` : ''}
        ${settings.showIndonesian ? `<span class="choice-support id" lang="id">${escapeHtml(choice.text.id)}</span>` : ''}
      </span>
    </button>`;
  }

  function renderChoiceReview(question: Question, settings: UserSettings): string {
    return `
      <section class="choice-review" data-no-ui-translation="true">
        <h3>${bilingualHeading('選択肢を確認', 'Pembahasan setiap pilihan')}</h3>
        <div class="choice-review-list">
          ${question.choices.map((choice) => {
            const rationale = question.choiceRationales[choice.id];
            const correct = choice.id === question.correctChoiceId;
            return `<article class="choice-review-item ${correct ? 'correct' : 'wrong'}">
              <div class="choice-review-title"><span>${choice.id.toUpperCase()}</span><strong lang="ja">${renderJapaneseText(choice.text, settings.showFurigana)}</strong><em lang="id">${escapeHtml(choice.text.id)}</em></div>
              <p lang="ja">${rationale ? renderJapaneseText(rationale, settings.showFurigana) : ''}</p>
              <p lang="id">${escapeHtml(rationale?.id ?? '')}</p>
            </article>`;
          }).join('')}
        </div>
      </section>`;
  }

  function renderBilingualReasonPanel(selected: ErrorReason | null): string {
    return `<section class="reason-panel" data-no-ui-translation="true">
      <h2>${bilingualHeading('なぜ間違えましたか？', 'Mengapa jawaban Anda salah?')}</h2>
      <p lang="id">Pilih satu alasan. Aplikasi akan menyesuaikan soal dan bantuan berikutnya.</p>
      <div class="reason-grid">${(Object.keys(ERROR_REASON_LABELS) as ErrorReason[]).map((reason) => `
        <button class="reason-button ${selected === reason ? 'active' : ''}" data-reason="${reason}">
          <span lang="ja">${escapeHtml(ERROR_REASON_LABELS[reason])}</span>
          <small lang="id">${escapeHtml(errorReasonUiLabel(reason, 'id'))}</small>
        </button>`).join('')}
      </div>
    </section>`;
  }

  export function renderGuidedQuestionCard(
    question: Question,
    session: SessionState,
    settings: UserSettings,
    correct: boolean,
    supportLevel: number,
    total: number,
  ): string {
    const pattern = patternHelp(question);
    const correctChoice = question.choices.find((choice) => choice.id === question.correctChoiceId);
    return `
      <article class="question-card guided-lesson-card">
        <section class="lesson-goal" data-no-ui-translation="true">
          <span class="lesson-label" lang="id">Tujuan belajar</span>
          <p lang="ja">${renderJapaneseText(question.learningSupport.lessonObjective, settings.showFurigana)}</p>
          <p lang="id">${escapeHtml(question.learningSupport.lessonObjective.id)}</p>
        </section>

        <div class="support-controls">
          <button class="support-toggle ${session.furiganaVisible ? 'active' : ''}" data-session-toggle="furigana">ふりがな ${session.furiganaVisible ? 'ON' : 'OFF'}</button>
          <button class="support-toggle ${session.easyJapaneseVisible ? 'active' : ''}" data-session-toggle="easy">やさしい日本語 ${session.easyJapaneseVisible ? 'ON' : 'OFF'}</button>
          <button class="support-toggle wide ${session.indonesianVisible ? 'active' : ''}" data-session-toggle="id">Bahasa Indonesia ${session.indonesianVisible ? 'ON' : 'OFF'}</button>
        </div>
        <div class="question-number">問題 ${session.index + 1} / ${total} ・ 支援レベル ${supportLevel} ・ ${escapeHtml(question.status)}</div>

        <section class="lesson-stage" data-no-ui-translation="true">
          <div class="lesson-subheading"><span class="lesson-step">1</span><div><strong>${bilingualHeading('日本語の問題を読む', 'Baca soal bahasa Jepang')}</strong><small lang="id">Mulai dari kalimat asli yang akan muncul dalam ujian.</small></div></div>
          <h1 class="question-text" lang="ja">${renderJapaneseText(question.question, settings.showFurigana)}</h1>
        </section>

        ${runtime.state.settings.showQuestionPattern ? `
          <section class="question-pattern-guide" data-no-ui-translation="true">
            <strong>${bilingualHeading('問題文の読み方', 'Cara membaca pola soal')}</strong>
            <p lang="ja">${renderJapaneseText(pattern, settings.showFurigana)}</p>
            <p lang="id">${escapeHtml(pattern.id)}</p>
          </section>` : ''}

        <section class="lesson-stage meaning-stage" data-no-ui-translation="true">
          <div class="lesson-subheading"><span class="lesson-step">2</span><div><strong>${bilingualHeading('意味を確認する', 'Pahami arti soal')}</strong><small lang="id">Gunakan bantuan untuk memahami, bukan untuk sekadar menebak.</small></div></div>
          ${settings.showEasyJapanese ? `<div class="support-box"><strong lang="ja">やさしい日本語</strong><p lang="ja">${escapeHtml(question.question.easyJa)}</p></div>` : ''}
          ${settings.showIndonesian ? `<div class="support-box id"><strong lang="id">Arti dalam Bahasa Indonesia</strong><p lang="id">${escapeHtml(question.question.id)}</p></div>` : ''}
        </section>

        ${renderVocabulary(question, runtime.state.settings.showVocabulary)}
        ${question.visual ? `<figure class="question-visual"><img src="${assetPath(question.visual.assetId)}" alt="${escapeHtml(question.visual.altJa)}"><figcaption>独自作成の学習用模式図 / Diagram belajar asli</figcaption></figure>` : ''}

        <div class="confidence-row" aria-label="回答前の自信">
          <span>自信 / Keyakinan:</span>
          <button class="confidence-button ${session.confidence === 'sure' ? 'active' : ''}" data-confidence="sure">分かる / Yakin</button>
          <button class="confidence-button ${session.confidence === 'unsure' ? 'active' : ''}" data-confidence="unsure">迷っている / Ragu</button>
        </div>
        <div class="choice-list">
          ${question.choices.map((choice) => renderChoice(choice, question, session, settings)).join('')}
        </div>

        ${!session.answered ? `<button class="btn primary full" data-answer ${session.selectedChoiceId ? '' : 'disabled'}>回答する / Jawab</button>` : `
          <section class="answer-panel ${correct ? 'correct' : 'wrong'}" data-no-ui-translation="true">
            <h2>${correct ? '正解です / Jawaban benar' : '不正解です / Jawaban belum benar'}</h2>
            <div class="correct-answer-block">
              <strong>${bilingualHeading('正解', 'Jawaban benar')}</strong>
              <p lang="ja">${correctChoice ? renderJapaneseText(correctChoice.text, settings.showFurigana) : ''}</p>
              ${settings.showIndonesian ? `<p lang="id">${escapeHtml(correctChoice?.text.id ?? '')}</p>` : ''}
            </div>
            <div class="explanation-block">
              <h3>${bilingualHeading('なぜこの答え？', 'Mengapa jawaban ini benar?')}</h3>
              <p lang="ja">${renderJapaneseText(question.explanation, settings.showFurigana)}</p>
              ${settings.showEasyJapanese ? `<p class="easy-explanation" lang="ja"><strong>やさしい日本語：</strong>${escapeHtml(question.explanation.easyJa)}</p>` : ''}
              ${settings.showIndonesian ? `<p class="id-explanation" lang="id"><strong>Penjelasan：</strong>${escapeHtml(question.explanation.id)}</p>` : ''}
            </div>
            <div class="memory-point">
              <strong>${bilingualHeading('覚えるポイント', 'Poin yang perlu diingat')}</strong>
              <p lang="ja">${renderJapaneseText(question.learningSupport.memoryPoint, settings.showFurigana)}</p>
              <p lang="id">${escapeHtml(question.learningSupport.memoryPoint.id)}</p>
            </div>
            <div class="source-citation"><strong>参照 / Sumber：</strong>${escapeHtml(question.source.documentTitle)}／${escapeHtml(question.source.edition)}／PDF ${question.source.pdfPage}／冊子 ${escapeHtml(question.source.printedPageLabel || '-')}／${escapeHtml(question.source.section)}</div>
          </section>
          ${renderChoiceReview(question, settings)}
          ${!correct ? renderBilingualReasonPanel(session.pendingReason) : ''}
          <button class="btn primary full" data-next ${!correct && !session.pendingReason ? 'disabled' : ''}>${session.index + 1 >= total ? '結果を見る / Lihat hasil' : '次の問題 / Soal berikutnya'}</button>
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
        <label class="setting-row"><span><strong>${bilingualHeading('重要語を表示', 'Tampilkan kosakata penting')}</strong><small lang="id">Menampilkan kanji, furigana, bahasa Jepang sederhana, dan arti Indonesia.</small></span><input type="checkbox" data-setting-pedagogy-checkbox="showVocabulary" ${settings.showVocabulary ? 'checked' : ''}></label>
        <label class="setting-row"><span><strong>${bilingualHeading('問題文の読み方を表示', 'Tampilkan cara membaca pola soal')}</strong><small lang="id">Menjelaskan ungkapan seperti 「最も適切」 dan 「誤っている」.</small></span><input type="checkbox" data-setting-pedagogy-checkbox="showQuestionPattern" ${settings.showQuestionPattern ? 'checked' : ''}></label>
      </section>`;
  }
}
