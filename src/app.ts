namespace LivestockApp {
  export let runtime: AppRuntime;
  let mockTimerHandle: number | null = null;
  let confirmCallback: (() => void) | null = null;

  function initialRuntime(state: AppState): AppRuntime {
    return {
      view: 'home',
      state,
      session: null,
      selectedCategory: null,
      glossarySearch: '',
      glossaryFilter: 'all',
      reviewSearch: '',
      reviewStatus: 'all',
      reviewCategory: 'all',
      installPrompt: null,
      online: navigator.onLine,
      notice: null,
      lastMockResult: null,
    };
  }

  export async function boot(): Promise<void> {
    const state = await loadState();
    runtime = initialRuntime(state);
    applyDocumentUiLanguage();
    window.addEventListener('online', () => {
      runtime.online = true;
      render();
    });
    window.addEventListener('offline', () => {
      runtime.online = false;
      render();
    });
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      runtime.installPrompt = event as BeforeInstallPromptEvent;
      render();
    });
    window.addEventListener('appinstalled', () => {
      runtime.installPrompt = null;
      showNotice('ホーム画面へインストールしました。');
    });
    await registerServiceWorker();
    render();
  }

  async function registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (error) {
      console.warn('Service Worker registration failed.', error);
    }
  }

  export function render(): void {
    if (mockTimerHandle !== null) {
      window.clearInterval(mockTimerHandle);
      mockTimerHandle = null;
    }
    const root = document.querySelector<HTMLElement>('#app');
    if (!root) return;
    root.innerHTML = appShell(renderCurrentView());
    applyUiLanguage(root);
    bindEvents();
    startMockTickerIfNeeded();
  }

  function startMockTickerIfNeeded(): void {
    if (!runtime.state.mockDraft || runtime.view !== 'study' || runtime.lastMockResult) return;
    const update = () => {
      const draft = runtime.state.mockDraft;
      if (!draft) return;
      const remaining = mockSecondsRemaining(draft);
      const timer = document.querySelector<HTMLElement>('[data-mock-timer]');
      if (timer) timer.textContent = formatClock(remaining);
      if (remaining <= 0) {
        if (mockTimerHandle !== null) window.clearInterval(mockTimerHandle);
        mockTimerHandle = null;
        submitMock(true);
      }
    };
    update();
    mockTimerHandle = window.setInterval(update, 1_000);
  }

  async function persist(): Promise<void> {
    try {
      await saveState(runtime.state);
    } catch (error) {
      console.error(error);
      runtime.notice = '保存に失敗しました。ブラウザの空き容量を確認してください。';
      render();
    }
  }

  function setView(view: ViewName): void {
    runtime.view = view;
    if (view !== 'study') runtime.session = null;
    runtime.lastMockResult = null;
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function emptySupportUsage(): SupportUsage {
    return {
      furiganaUsed: false,
      easyJapaneseUsed: false,
      keywordsOpened: false,
      questionTranslationOpened: false,
      choiceTranslationsOpened: false,
      answerIndonesianOpened: false,
    };
  }

  function questionSupport(session: SessionState, question: Question): void {
    const policy = resolveSupportPolicy(runtime.state, question, session.kind, session.isRetryWithoutSupport);
    session.supportLevel = policy.level;
    session.furiganaVisible = policy.showFuriganaInitially;
    session.easyJapaneseVisible = policy.showEasyJapaneseInitially;
    session.indonesianVisible = policy.showQuestionTranslationInitially;
    session.keywordsVisible = policy.showKeywordsInitially && runtime.state.settings.showVocabulary;
    session.choiceTranslationsVisible = policy.showChoiceTranslationsInitially;
    session.answerIndonesianVisible = false;
    session.supportUsage = {
      furiganaUsed: session.furiganaVisible,
      easyJapaneseUsed: session.easyJapaneseVisible,
      keywordsOpened: session.keywordsVisible,
      questionTranslationOpened: session.indonesianVisible,
      choiceTranslationsOpened: session.choiceTranslationsVisible,
      answerIndonesianOpened: false,
    };
  }

  function createSession(kind: SessionKind, questionIds: string[]): SessionState {
    const session: SessionState = {
      id: uid('session'),
      kind,
      questionIds,
      index: 0,
      selectedChoiceId: null,
      answered: false,
      startedQuestionAt: performance.now(),
      easyJapaneseVisible: runtime.state.settings.showEasyJapanese,
      indonesianVisible: runtime.state.settings.showIndonesian,
      furiganaVisible: runtime.state.settings.showFurigana,
      supportLevel: 0,
      keywordsVisible: false,
      choiceTranslationsVisible: false,
      answerIndonesianVisible: false,
      supportUsage: emptySupportUsage(),
      retryOfHistoryId: null,
      isRetryWithoutSupport: false,
      confidence: null,
      pendingReason: null,
      completed: false,
    };
    const first = questionById(questionIds[0]);
    if (first) questionSupport(session, first);
    return session;
  }

  function startSession(kind: SessionKind, category?: string): void {
    runtime.lastMockResult = null;
    if (kind === 'mock') {
      if (runtime.state.mockDraft) {
        askConfirm('新しい模試を開始', '中断中の模試を破棄して、新しい50問を開始します。', () => {
          runtime.state.mockDraft = createMockDraft(runtime.state);
          runtime.session = createSession('mock', runtime.state.mockDraft.questionIds);
          runtime.view = 'study';
          void persist();
          render();
        });
        return;
      }
      runtime.state.mockDraft = createMockDraft(runtime.state);
      runtime.session = createSession('mock', runtime.state.mockDraft.questionIds);
      runtime.view = 'study';
      void persist();
      render();
      return;
    }

    let questionIds: string[] = [];
    if (kind === 'daily') questionIds = buildDailyQueue(runtime.state);
    if (kind === 'poultry') questionIds = buildPoultryQueue(runtime.state, runtime.state.settings.dailyQuestionCount);
    if (kind === 'all') questionIds = buildAllQueue(runtime.state, runtime.state.settings.dailyQuestionCount);
    if (kind === 'due') questionIds = buildDueQueue(runtime.state, 20);
    if (kind === 'category' && category) questionIds = buildCategoryQueue(runtime.state, category, Math.min(20, activeQuestions(runtime.state).filter((question) => question.category === category).length));

    if (!questionIds.length) {
      showNotice(kind === 'due' ? '復習期限が来た問題はありません。' : 'このモードで表示できる問題がありません。');
      return;
    }
    runtime.session = createSession(kind, questionIds);
    runtime.state.lastSessionQuestionIds = questionIds;
    runtime.view = 'study';
    void persist();
    render();
  }

  function startGlossarySession(term: string): void {
    const questionIds = activeQuestions(runtime.state)
      .filter((question) => `${question.question.ja} ${question.explanation.ja} ${question.tags.join(' ')}`.includes(term))
      .map((question) => question.id)
      .slice(0, 20);
    if (!questionIds.length) {
      showNotice(`「${term}」に直接一致する問題はありません。`);
      return;
    }
    runtime.session = createSession('category', questionIds);
    runtime.view = 'study';
    render();
  }

  function selectChoice(choiceId: string): void {
    const session = runtime.session;
    if (!session || session.answered) return;
    session.selectedChoiceId = choiceId;
    render();
  }

  function setConfidence(confidence: 'sure' | 'unsure'): void {
    if (!runtime.session || runtime.session.answered) return;
    runtime.session.confidence = confidence;
    render();
  }

  function answerStudy(): void {
    const session = runtime.session;
    if (!session || session.answered || !session.selectedChoiceId) return;
    const question = questionById(session.questionIds[session.index]);
    if (!question) return;
    const policy = supportPolicyForLevel(session.supportLevel);
    session.answerIndonesianVisible = policy.showAnswerIndonesianInitially;
    if (session.answerIndonesianVisible) session.supportUsage.answerIndonesianOpened = true;
    const entry = recordAnswer(runtime.state, question, {
      sessionId: session.id,
      sessionKind: session.kind,
      selectedChoiceId: session.selectedChoiceId,
      elapsedMs: performance.now() - session.startedQuestionAt,
      usedEasyJapanese: session.supportUsage.easyJapaneseUsed,
      usedIndonesian: session.supportUsage.questionTranslationOpened
        || session.supportUsage.choiceTranslationsOpened
        || session.supportUsage.answerIndonesianOpened,
      usedFurigana: session.supportUsage.furiganaUsed,
      openedKeywords: session.supportUsage.keywordsOpened,
      openedQuestionTranslation: session.supportUsage.questionTranslationOpened,
      openedChoiceTranslations: session.supportUsage.choiceTranslationsOpened,
      openedAnswerIndonesian: session.supportUsage.answerIndonesianOpened,
      supportLevel: session.supportLevel,
      reason: null,
      confidence: session.confidence,
      retryOfHistoryId: session.retryOfHistoryId,
      isRetryWithoutSupport: session.isRetryWithoutSupport,
    });
    session.answered = true;
    session.pendingReason = entry.correct ? null : null;
    void persist();
    render();
    announce(entry.correct ? '正解です。' : '不正解です。正解と解説を確認してください。');
  }

  function currentHistoryEntry(session: SessionState): HistoryEntry | undefined {
    const questionId = session.questionIds[session.index];
    return runtime.state.history.findLast((item) => item.sessionId === session.id && item.questionId === questionId);
  }

  function syncAnsweredSupportUsage(session: SessionState): boolean {
    if (!session.answered) return false;
    const entry = currentHistoryEntry(session);
    if (!entry) return false;
    entry.usedFurigana = session.supportUsage.furiganaUsed;
    entry.usedEasyJapanese = session.supportUsage.easyJapaneseUsed;
    entry.openedKeywords = session.supportUsage.keywordsOpened;
    entry.openedQuestionTranslation = session.supportUsage.questionTranslationOpened;
    entry.openedChoiceTranslations = session.supportUsage.choiceTranslationsOpened;
    entry.openedAnswerIndonesian = session.supportUsage.answerIndonesianOpened;
    entry.usedIndonesian = entry.openedQuestionTranslation
      || entry.openedChoiceTranslations
      || entry.openedAnswerIndonesian;
    return true;
  }

  function chooseReason(reason: ErrorReason): void {
    const session = runtime.session;
    if (!session || !session.answered) return;
    session.pendingReason = reason;
    const entry = currentHistoryEntry(session);
    if (entry) {
      entry.reason = reason;
      entry.knowledgeGap = reason === 'knowledge';
      entry.japaneseGap = reason === 'japanese';
    }
    void persist();
    render();
  }

  function nextStudy(): void {
    const session = runtime.session;
    if (!session || !session.answered) return;
    const entry = currentHistoryEntry(session);
    if (entry && !entry.correct && !session.pendingReason) return;
    if (session.index >= session.questionIds.length - 1) {
      session.completed = true;
      render();
      return;
    }
    session.index += 1;
    session.selectedChoiceId = null;
    session.answered = false;
    session.pendingReason = null;
    session.confidence = null;
    session.retryOfHistoryId = null;
    session.isRetryWithoutSupport = false;
    session.startedQuestionAt = performance.now();
    const question = questionById(session.questionIds[session.index]);
    if (question) questionSupport(session, question);
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  type SessionSupportToggle = 'furigana' | 'easy' | 'id' | 'question-id' | 'choices-id' | 'keywords' | 'answer-id';

  function toggleSessionSupport(kind: SessionSupportToggle): void {
    const session = runtime.session;
    if (!session || session.kind === 'mock') return;
    const policy = supportPolicyForLevel(session.supportLevel);
    if (kind === 'furigana' && session.supportLevel > 0) {
      session.furiganaVisible = !session.furiganaVisible;
      if (session.furiganaVisible) session.supportUsage.furiganaUsed = true;
    }
    if (kind === 'easy' && session.supportLevel === 3) {
      session.easyJapaneseVisible = !session.easyJapaneseVisible;
      if (session.easyJapaneseVisible) session.supportUsage.easyJapaneseUsed = true;
    }
    if (kind === 'keywords' && session.supportLevel > 0) {
      session.keywordsVisible = !session.keywordsVisible;
      if (session.keywordsVisible) session.supportUsage.keywordsOpened = true;
    }
    if ((kind === 'id' || kind === 'question-id') && policy.allowQuestionTranslation) {
      session.indonesianVisible = !session.indonesianVisible;
      if (session.indonesianVisible) session.supportUsage.questionTranslationOpened = true;
    }
    if (kind === 'choices-id' && policy.allowChoiceTranslations) {
      session.choiceTranslationsVisible = !session.choiceTranslationsVisible;
      if (session.choiceTranslationsVisible) session.supportUsage.choiceTranslationsOpened = true;
    }
    if (kind === 'answer-id' && session.answered && policy.allowAnswerIndonesian) {
      session.answerIndonesianVisible = !session.answerIndonesianVisible;
      if (session.answerIndonesianVisible) session.supportUsage.answerIndonesianOpened = true;
    }
    if (syncAnsweredSupportUsage(session)) void persist();
    render();
  }

  function retryWithoutSupport(): void {
    const session = runtime.session;
    if (!session || session.kind === 'mock' || !session.answered || session.isRetryWithoutSupport) return;
    const entry = currentHistoryEntry(session);
    if (!entry || (!entry.correct && !session.pendingReason)) return;
    session.retryOfHistoryId = entry.id;
    session.isRetryWithoutSupport = true;
    session.selectedChoiceId = null;
    session.answered = false;
    session.pendingReason = null;
    session.confidence = null;
    session.startedQuestionAt = performance.now();
    const question = questionById(session.questionIds[session.index]);
    if (question) questionSupport(session, question);
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
    announce('学習支援を外しました。日本語だけでもう一度解いてください。');
  }

  function resumeMock(): void {
    const draft = runtime.state.mockDraft;
    if (!draft) return;
    runtime.session = createSession('mock', draft.questionIds);
    runtime.session.index = draft.currentIndex;
    runtime.view = 'study';
    runtime.lastMockResult = null;
    render();
  }

  function setMockChoice(choiceId: string): void {
    const draft = runtime.state.mockDraft;
    if (!draft) return;
    const questionId = draft.questionIds[draft.currentIndex];
    draft.answers[questionId] = choiceId;
    void persist();
    render();
  }

  function moveMock(index: number): void {
    const draft = runtime.state.mockDraft;
    if (!draft) return;
    draft.currentIndex = clamp(index, 0, draft.questionIds.length - 1);
    if (runtime.session) runtime.session.index = draft.currentIndex;
    void persist();
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function submitMock(automatic: boolean): void {
    const draft = runtime.state.mockDraft;
    if (!draft) return;
    const result = gradeMock(draft);
    runtime.state.mockHistory.push(result);
    runtime.state.mockDraft = null;
    runtime.lastMockResult = result;
    runtime.session = createSession('mock', draft.questionIds);
    runtime.session.completed = true;
    void persist();
    render();
    announce(automatic ? '時間になったため模擬試験を終了しました。' : '模擬試験を採点しました。');
  }

  function showNotice(message: string): void {
    runtime.notice = message;
    render();
    window.setTimeout(() => {
      if (runtime.notice === message) {
        runtime.notice = null;
        render();
      }
    }, 3_000);
  }

  function askConfirm(title: string, text: string, callback: () => void): void {
    confirmCallback = callback;
    const language: UiLanguage = runtime.session?.kind === 'mock' ? 'ja' : currentUiLanguage();
    const dialog = document.querySelector<HTMLDialogElement>('[data-confirm-dialog]');
    const titleNode = document.querySelector<HTMLElement>('[data-confirm-title]');
    const textNode = document.querySelector<HTMLElement>('[data-confirm-text]');
    if (!dialog || !titleNode || !textNode) {
      if (window.confirm(translateUiText(text, language))) callback();
      return;
    }
    titleNode.textContent = translateUiText(title, language);
    textNode.textContent = translateUiText(text, language);
    dialog.showModal();
  }

  function installApp(): void {
    const prompt = runtime.installPrompt;
    if (!prompt) {
      showNotice('このブラウザではインストール案内を表示できません。ブラウザのメニューから「ホーム画面に追加」を選んでください。');
      return;
    }
    void prompt.prompt().then(async () => {
      const choice = await prompt.userChoice;
      runtime.installPrompt = null;
      showNotice(choice.outcome === 'accepted' ? 'インストールを開始しました。' : 'インストールをキャンセルしました。');
    });
  }

  function exportProgress(): void {
    downloadText('畜産2号トレーナー_学習データ_v0.5.json', JSON.stringify({ exportedAt: nowIso(), appVersion: APP_VERSION, state: runtime.state }, null, 2));
  }

  function exportProgressCsv(): void {
    const header = [
      '日時', '問題ID', '分野', 'トピック', '正誤', '回答時間秒', '誤答原因', '支援レベル',
      'ふりがな', 'やさしい日本語', '重要語', '全文インドネシア語', '選択肢訳', '回答後インドネシア語',
      '知識不足', '日本語不足', '日本語のみ再挑戦',
    ];
    const rows = runtime.state.history.map((entry) => [
      entry.at,
      entry.questionId,
      entry.category,
      entry.topic,
      entry.correct ? '正解' : '不正解',
      Math.round(entry.elapsedMs / 1000),
      entry.reason ? ERROR_REASON_LABELS[entry.reason] : '',
      entry.supportLevel,
      entry.usedFurigana,
      entry.usedEasyJapanese,
      entry.openedKeywords,
      entry.openedQuestionTranslation,
      entry.openedChoiceTranslations,
      entry.openedAnswerIndonesian,
      entry.knowledgeGap,
      entry.japaneseGap,
      entry.isRetryWithoutSupport,
    ]);
    downloadText('畜産2号トレーナー_学習履歴_v0.5.csv', '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n'), 'text/csv');
  }

  function exportReviews(): void {
    const records = QUESTIONS.map((question) => ({
      questionId: question.id,
      mark: runtime.state.reviews[question.id]?.status ?? '未確認',
      note: runtime.state.reviews[question.id]?.note ?? '',
      updatedAt: runtime.state.reviews[question.id]?.updatedAt ?? null,
      sourceId: question.source.sourceId,
      pdfPage: question.source.pdfPage,
      printedPage: question.source.printedPageLabel,
      questionJa: question.question.ja,
    }));
    downloadText('畜産2号トレーナー_80問レビュー_v0.5.json', JSON.stringify(records, null, 2));
  }

  async function importProgress(file: File): Promise<void> {
    try {
      const parsed = JSON.parse(await file.text());
      const raw = parsed.state ?? parsed;
      const imported = validateImportedState(raw);
      imported.revision = Math.max(imported.revision, runtime.state.revision);
      runtime.state = imported;
      await persist();
      showNotice('学習データを読み込みました。');
    } catch (error) {
      console.error(error);
      showNotice('学習データを読み込めませんでした。JSON形式を確認してください。');
    }
  }

  function bindEvents(): void {
    document.querySelectorAll<HTMLElement>('[data-view]').forEach((element) => {
      element.addEventListener('click', () => setView(element.dataset.view as ViewName));
    });
    document.querySelectorAll<HTMLButtonElement>('button[data-ui-language]').forEach((element) => {
      element.addEventListener('click', () => {
        runtime.state.settings.uiLanguage = element.dataset.uiLanguage === 'ja' ? 'ja' : 'id';
        void persist();
        render();
      });
    });
    document.querySelectorAll<HTMLElement>('[data-start]').forEach((element) => {
      element.addEventListener('click', () => startSession(element.dataset.start as SessionKind));
    });
    document.querySelectorAll<HTMLElement>('[data-category]').forEach((element) => {
      element.addEventListener('click', () => startSession('category', element.dataset.category));
    });
    document.querySelectorAll<HTMLElement>('[data-choice]').forEach((element) => {
      element.addEventListener('click', () => selectChoice(element.dataset.choice ?? ''));
    });
    document.querySelector<HTMLElement>('[data-answer]')?.addEventListener('click', answerStudy);
    document.querySelector<HTMLElement>('[data-next]')?.addEventListener('click', nextStudy);
    document.querySelectorAll<HTMLElement>('[data-reason]').forEach((element) => {
      element.addEventListener('click', () => chooseReason(element.dataset.reason as ErrorReason));
    });
    document.querySelectorAll<HTMLElement>('[data-session-toggle]').forEach((element) => {
      element.addEventListener('click', () => toggleSessionSupport(element.dataset.sessionToggle as SessionSupportToggle));
    });
    document.querySelector<HTMLElement>('[data-retry-without-support]')?.addEventListener('click', retryWithoutSupport);
    document.querySelectorAll<HTMLElement>('[data-confidence]').forEach((element) => {
      element.addEventListener('click', () => setConfidence(element.dataset.confidence as 'sure' | 'unsure'));
    });
    document.querySelector<HTMLElement>('[data-stop-session]')?.addEventListener('click', () => {
      askConfirm('学習を中断', '回答済みの履歴は残してホームへ戻ります。', () => {
        runtime.session = null;
        setView('home');
      });
    });
    document.querySelector<HTMLElement>('[data-resume-mock]')?.addEventListener('click', resumeMock);
    document.querySelectorAll<HTMLElement>('[data-mock-choice]').forEach((element) => {
      element.addEventListener('click', () => setMockChoice(element.dataset.mockChoice ?? ''));
    });
    document.querySelector<HTMLElement>('[data-mock-prev]')?.addEventListener('click', () => moveMock((runtime.state.mockDraft?.currentIndex ?? 0) - 1));
    document.querySelector<HTMLElement>('[data-mock-next]')?.addEventListener('click', () => moveMock((runtime.state.mockDraft?.currentIndex ?? 0) + 1));
    document.querySelectorAll<HTMLElement>('[data-mock-jump]').forEach((element) => {
      element.addEventListener('click', () => moveMock(Number(element.dataset.mockJump)));
    });
    document.querySelector<HTMLElement>('[data-submit-mock]')?.addEventListener('click', () => {
      askConfirm('模擬試験を採点', '未回答があっても終了し、非公式正答率を表示します。', () => submitMock(false));
    });

    const glossarySearch = document.querySelector<HTMLInputElement>('[data-glossary-search]');
    glossarySearch?.addEventListener('input', () => {
      runtime.glossarySearch = glossarySearch.value;
      render();
      const next = document.querySelector<HTMLInputElement>('[data-glossary-search]');
      next?.focus();
      next?.setSelectionRange(runtime.glossarySearch.length, runtime.glossarySearch.length);
    });
    document.querySelectorAll<HTMLElement>('[data-glossary-study]').forEach((element) => {
      element.addEventListener('click', () => startGlossarySession(element.dataset.glossaryStudy ?? ''));
    });

    const reviewSearch = document.querySelector<HTMLInputElement>('[data-review-search]');
    reviewSearch?.addEventListener('input', () => {
      runtime.reviewSearch = reviewSearch.value;
      render();
      const next = document.querySelector<HTMLInputElement>('[data-review-search]');
      next?.focus();
      next?.setSelectionRange(runtime.reviewSearch.length, runtime.reviewSearch.length);
    });
    document.querySelector<HTMLSelectElement>('[data-review-category]')?.addEventListener('change', (event) => {
      runtime.reviewCategory = (event.currentTarget as HTMLSelectElement).value;
      render();
    });
    document.querySelector<HTMLSelectElement>('[data-review-status]')?.addEventListener('change', (event) => {
      runtime.reviewStatus = (event.currentTarget as HTMLSelectElement).value as 'all' | ReviewMark;
      render();
    });
    document.querySelectorAll<HTMLElement>('[data-review-set]').forEach((element) => {
      element.addEventListener('click', () => {
        const [questionId, mark] = (element.dataset.reviewSet ?? '').split('|') as [string, ReviewMark];
        let note = runtime.state.reviews[questionId]?.note ?? '';
        if (mark === '要修正') {
          const entered = window.prompt(translateUiText(`${questionId} 要修正の理由`), note);
          if (entered === null) return;
          note = entered;
        }
        runtime.state.reviews[questionId] = { status: mark, note, updatedAt: nowIso() };
        void persist();
        render();
      });
    });

    document.querySelectorAll<HTMLInputElement>('[data-setting-checkbox]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.settingCheckbox as keyof UserSettings;
        (runtime.state.settings as unknown as Record<string, unknown>)[key] = input.checked;
        void persist();
        render();
      });
    });
    document.querySelector<HTMLSelectElement>('[data-setting-study-mode]')?.addEventListener('change', (event) => {
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
    document.querySelector<HTMLSelectElement>('[data-setting-ui-language]')?.addEventListener('change', (event) => {
      runtime.state.settings.uiLanguage = (event.currentTarget as HTMLSelectElement).value === 'ja' ? 'ja' : 'id';
      void persist();
      render();
    });
    document.querySelector<HTMLSelectElement>('[data-setting-level]')?.addEventListener('change', (event) => {
      runtime.state.settings.preferredSupportLevel = Number((event.currentTarget as HTMLSelectElement).value) as SupportLevel;
      void persist();
      render();
    });
    document.querySelector<HTMLSelectElement>('[data-setting-count]')?.addEventListener('change', (event) => {
      runtime.state.settings.dailyQuestionCount = Number((event.currentTarget as HTMLSelectElement).value);
      void persist();
      render();
    });

    document.querySelectorAll<HTMLElement>('[data-install]').forEach((element) => element.addEventListener('click', installApp));
    document.querySelectorAll<HTMLElement>('[data-export-progress]').forEach((element) => element.addEventListener('click', exportProgress));
    document.querySelectorAll<HTMLElement>('[data-export-progress-csv]').forEach((element) => element.addEventListener('click', exportProgressCsv));
    document.querySelectorAll<HTMLElement>('[data-export-reviews]').forEach((element) => element.addEventListener('click', exportReviews));
    document.querySelector<HTMLInputElement>('[data-import-progress]')?.addEventListener('change', (event) => {
      const file = (event.currentTarget as HTMLInputElement).files?.[0];
      if (file) void importProgress(file);
    });
    document.querySelector<HTMLElement>('[data-reset-progress]')?.addEventListener('click', () => {
      askConfirm('学習履歴をリセット', '学習履歴・復習予定・模試履歴を削除します。レビュー結果と設定は残します。', async () => {
        runtime.state = await clearProgressKeepReviews(runtime.state);
        runtime.session = null;
        runtime.lastMockResult = null;
        render();
      });
    });

    document.querySelector<HTMLElement>('[data-confirm-ok]')?.addEventListener('click', (event) => {
      event.preventDefault();
      const dialog = document.querySelector<HTMLDialogElement>('[data-confirm-dialog]');
      dialog?.close();
      const callback = confirmCallback;
      confirmCallback = null;
      callback?.();
    });
    document.querySelector<HTMLElement>('[data-confirm-cancel]')?.addEventListener('click', () => {
      confirmCallback = null;
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void LivestockApp.boot();
});
