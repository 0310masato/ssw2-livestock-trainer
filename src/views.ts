namespace LivestockApp {
  export function appShell(content: string): string {
    const navItems: Array<{ view: ViewName; label: string }> = [
      { view: 'home', label: 'ホーム' },
      { view: 'study', label: '学習' },
      { view: 'glossary', label: '用語' },
      { view: 'results', label: '成績' },
      { view: 'manager', label: '管理' },
      { view: 'review', label: 'レビュー' },
      { view: 'settings', label: '設定' },
    ];
    return `
      <header class="app-header">
        <div class="brand-row">
          <button class="brand" data-view="home" aria-label="ホームへ戻る">
            <span class="brand-mark" aria-hidden="true">2</span>
            <span>畜産2号トレーナー</span>
          </button>
          <div class="status-cluster">
            <span class="connection-status ${runtime.online ? 'online' : 'offline'}" title="通信状態">
              ${runtime.online ? 'オンライン' : 'オフライン'}
            </span>
            ${runtime.installPrompt ? '<button class="install-button" data-install>インストール</button>' : ''}
          </div>
        </div>
        <div class="review-banner">
          <strong>内部レビュー版 v${escapeHtml(APP_VERSION)}</strong>：80問は公式教材との根拠照合済み（source_checked）ですが、
          インドネシア語ネイティブ確認と利用者承認前です。正式な approved 問題はまだ0問です。
        </div>
        <nav class="top-nav" aria-label="主な画面">
          ${navItems.map((item) => `
            <button class="nav-item ${runtime.view === item.view ? 'active' : ''}" data-view="${item.view}" ${runtime.view === item.view ? 'aria-current="page"' : ''}>
              ${escapeHtml(item.label)}
            </button>`).join('')}
        </nav>
      </header>
      <main class="main-content" id="main-content">${content}</main>
      <div class="toast ${runtime.notice ? 'visible' : ''}" role="status">${escapeHtml(runtime.notice ?? '')}</div>
      <div class="sr-only" aria-live="polite" data-live-region></div>
      <dialog class="confirm-dialog" data-confirm-dialog>
        <form method="dialog">
          <h2 data-confirm-title>確認</h2>
          <p data-confirm-text></p>
          <div class="dialog-actions">
            <button value="cancel" class="btn ghost" data-confirm-cancel>キャンセル</button>
            <button value="ok" class="btn primary" data-confirm-ok>実行</button>
          </div>
        </form>
      </dialog>
    `;
  }

  export function renderCurrentView(): string {
    switch (runtime.view) {
      case 'home': return homeView();
      case 'study': return studyView();
      case 'glossary': return glossaryView();
      case 'results': return resultsView();
      case 'manager': return managerView();
      case 'review': return reviewView();
      case 'settings': return settingsView();
      default: return homeView();
    }
  }

  function homeView(): string {
    const state = runtime.state;
    const learned = learnedCount(state);
    const accuracy = overallAccuracy(state);
    const due = dueCount(state);
    const reviewCandidateCount = Object.values(state.reviews).filter((review) => review.status === '承認候補').length;
    const weak = weakestCategories(state, 3);
    const todayAnswers = state.history.filter((entry) => dateKey(entry.at) === dateKey(new Date())).length;
    const dailyTarget = state.settings.dailyQuestionCount;
    return `
      <section class="hero-panel">
        <div class="hero-copy">
          <h1>毎日10問。母語で理解し、最後は日本語だけで解く。</h1>
          <p>養鶏経験を入口に、牛・豚・安全衛生・軽種馬・養蜂まで全範囲を学びます。間違いの原因を知識と日本語に分け、次の復習へつなげます。</p>
          <div class="hero-actions">
            <button class="btn primary large" data-start="daily">今日の${dailyTarget}問を始める</button>
            ${state.mockDraft ? '<button class="btn secondary large" data-resume-mock>中断中の模試を再開</button>' : ''}
          </div>
        </div>
        <div class="daily-progress" aria-label="今日の進捗">
          <span>${Math.min(todayAnswers, dailyTarget)} / ${dailyTarget}</span>
          <div class="progress-track"><i style="width:${Math.min(100, Math.round(todayAnswers / dailyTarget * 100))}%"></i></div>
          <small>今日の解答数</small>
        </div>
      </section>

      <section class="metric-grid" aria-label="学習状況">
        <article class="metric-card"><strong>${learned}/80</strong><span>学習した問題</span></article>
        <article class="metric-card"><strong>${accuracy}%</strong><span>累計正答率</span></article>
        <article class="metric-card"><strong>${due}</strong><span>復習期限到来</span></article>
        <article class="metric-card"><strong>${reviewCandidateCount}/80</strong><span>承認候補</span></article>
      </section>

      <section class="section-block">
        <div class="section-heading"><h2>学習モード</h2><p>実務に合わせた短時間学習と本番形式を分けています。</p></div>
        <div class="mode-list">
          <article class="mode-row featured">
            <div><h3>今日の${dailyTarget}問</h3><p>復習4問、弱点3問、新しい問題3問を基本に自動選択します。</p></div>
            <button class="btn primary" data-start="daily">始める</button>
          </article>
          <article class="mode-row">
            <div><h3>養鶏から学ぶ</h3><p>肉用鶏・採卵鶏を中心に、未経験分野へ段階的に広げます。</p></div>
            <button class="btn secondary" data-start="poultry">始める</button>
          </article>
          <article class="mode-row">
            <div><h3>復習待ち</h3><p>期限が来た問題を優先します。現在${due}問です。</p></div>
            <button class="btn ghost" data-start="due" ${due === 0 ? 'disabled' : ''}>復習する</button>
          </article>
          <article class="mode-row exam">
            <div><h3>50問・60分 模擬試験</h3><p>日本語のみ、途中解説なし。結果は非公式正答率として表示します。</p></div>
            <button class="btn dark" data-start="mock">模試を始める</button>
          </article>
        </div>
      </section>

      <section class="section-block">
        <div class="section-heading"><h2>分野を選ぶ</h2><p>80問の内部レビュー問題を分野別に練習できます。</p></div>
        <div class="category-grid">
          ${CATEGORY_ORDER.map((category) => {
            const count = activeQuestions(state).filter((question) => question.category === category).length;
            return `<button class="category-button" data-category="${escapeHtml(category)}"><strong>${escapeHtml(category)}</strong><span>${count}問</span></button>`;
          }).join('')}
        </div>
      </section>

      <section class="support-panel">
        <div><h2>現在の重点</h2><p>${weak.length ? weak.map(escapeHtml).join('、') : '学習を始めると弱点分野を表示します。'}</p></div>
        <button class="btn ghost" data-view="results">分析を見る</button>
      </section>
    `;
  }

  function studyLanding(): string {
    const state = runtime.state;
    return `
      <div class="section-heading"><h1>学習</h1><p>目的に合うモードを選んでください。</p></div>
      <div class="mode-list compact">
        <article class="mode-row featured"><div><h3>今日の${state.settings.dailyQuestionCount}問</h3><p>復習・弱点・新規を混ぜます。</p></div><button class="btn primary" data-start="daily">始める</button></article>
        <article class="mode-row"><div><h3>養鶏から学ぶ</h3><p>肉用鶏を中心に10問。</p></div><button class="btn secondary" data-start="poultry">始める</button></article>
        <article class="mode-row"><div><h3>全範囲</h3><p>全分野から10問。</p></div><button class="btn ghost" data-start="all">始める</button></article>
        <article class="mode-row"><div><h3>復習待ち</h3><p>${dueCount(state)}問が期限到来。</p></div><button class="btn ghost" data-start="due" ${dueCount(state) === 0 ? 'disabled' : ''}>復習する</button></article>
        <article class="mode-row exam"><div><h3>50問・60分 模擬試験</h3><p>日本語のみで本番形式を練習。</p></div><button class="btn dark" data-start="mock">開始</button></article>
      </div>
      <div class="section-heading"><h2>分野別</h2></div>
      <div class="category-grid">
        ${CATEGORY_ORDER.map((category) => `<button class="category-button" data-category="${escapeHtml(category)}"><strong>${escapeHtml(category)}</strong><span>${activeQuestions(state).filter((question) => question.category === category).length}問</span></button>`).join('')}
      </div>
    `;
  }

  function studyView(): string {
    if (!runtime.session) return studyLanding();
    if (runtime.session.kind === 'mock' && runtime.lastMockResult) return mockResultView(runtime.lastMockResult);
    if (runtime.session.kind === 'mock') return mockView();
    if (runtime.session.completed) return sessionResultView();

    const session = runtime.session;
    const question = questionById(session.questionIds[session.index]);
    if (!question) return '<div class="empty-state"><h1>問題を読み込めませんでした</h1></div>';
    const total = session.questionIds.length;
    const progress = Math.round(((session.index + 1) / total) * 100);
    const latest = runtime.state.history.findLast((entry) => entry.sessionId === session.id && entry.questionId === question.id);
    const correct = latest?.correct ?? false;
    const supportLevel = effectiveSupportLevel(runtime.state, question);

    const settings: UserSettings = {
      ...runtime.state.settings,
      showFurigana: session.furiganaVisible,
      showEasyJapanese: session.easyJapaneseVisible,
      showIndonesian: session.indonesianVisible,
    };

    return `
      <section class="session-shell">
        <div class="question-toolbar">
          <div class="tag-list"><span class="pill">${escapeHtml(question.category)}</span><span class="pill orange">${escapeHtml(question.topic)}</span><span class="pill warn">学習</span></div>
          <button class="text-button" data-stop-session>中断</button>
        </div>
        <div class="question-progress" aria-label="${session.index + 1}問目 / ${total}問"><i style="width:${progress}%"></i></div>

        <article class="question-card">
          <div class="support-controls">
            <button class="support-toggle ${session.furiganaVisible ? 'active' : ''}" data-session-toggle="furigana">ふりがな ${session.furiganaVisible ? 'ON' : 'OFF'}</button>
            <button class="support-toggle ${session.easyJapaneseVisible ? 'active' : ''}" data-session-toggle="easy">やさしい日本語 ${session.easyJapaneseVisible ? 'ON' : 'OFF'}</button>
            <button class="support-toggle wide ${session.indonesianVisible ? 'active' : ''}" data-session-toggle="id">Bahasa ${session.indonesianVisible ? 'ON' : 'OFF'}</button>
          </div>
          <div class="question-number">問題 ${session.index + 1} / ${total} ・ 支援レベル ${supportLevel} ・ ${escapeHtml(question.status)}</div>
          <h1 class="question-text">${textWithFurigana(question.question.ja, settings.showFurigana)}</h1>
          ${settings.showEasyJapanese ? `<div class="support-box"><strong>やさしい日本語</strong><p>${escapeHtml(question.question.easyJa)}</p></div>` : ''}
          ${settings.showIndonesian ? `<div class="support-box id"><strong>Bahasa Indonesia</strong><p>${escapeHtml(question.question.id)}</p></div>` : ''}
          ${question.visual ? `<figure class="question-visual"><img src="${assetPath(question.visual.assetId)}" alt="${escapeHtml(question.visual.altJa)}"><figcaption>独自作成の学習用模式図</figcaption></figure>` : ''}
          <div class="confidence-row" aria-label="回答前の自信">
            <span>自信：</span>
            <button class="confidence-button ${session.confidence === 'sure' ? 'active' : ''}" data-confidence="sure">分かる</button>
            <button class="confidence-button ${session.confidence === 'unsure' ? 'active' : ''}" data-confidence="unsure">迷っている</button>
          </div>
          <div class="choice-list">
            ${question.choices.map((choice) => {
              const selected = session.selectedChoiceId === choice.id;
              const answerClass = session.answered
                ? choice.id === question.correctChoiceId ? 'correct' : selected ? 'wrong' : ''
                : selected ? 'selected' : '';
              return `<button class="choice-button ${answerClass}" data-choice="${choice.id}" ${session.answered ? 'disabled' : ''}>
                <span class="choice-letter">${choice.id.toUpperCase()}</span>
                <span class="choice-copy">${renderLocalizedText(choice.text, settings, 'choice')}</span>
              </button>`;
            }).join('')}
          </div>

          ${!session.answered ? `<button class="btn primary full" data-answer ${session.selectedChoiceId ? '' : 'disabled'}>回答する</button>` : `
            <section class="answer-panel ${correct ? 'correct' : 'wrong'}">
              <h2>${correct ? '正解です' : '不正解です'}</h2>
              <p><strong>正解：</strong>${escapeHtml(question.choices.find((choice) => choice.id === question.correctChoiceId)?.text.ja ?? '')}</p>
              <p>${textWithFurigana(question.explanation.ja, settings.showFurigana)}</p>
              ${settings.showEasyJapanese ? `<p class="easy-explanation"><strong>やさしい日本語：</strong>${escapeHtml(question.explanation.easyJa)}</p>` : ''}
              ${settings.showIndonesian ? `<p class="id-explanation"><strong>Bahasa：</strong>${escapeHtml(question.explanation.id)}</p>` : ''}
              <div class="source-citation"><strong>参照：</strong>${escapeHtml(question.source.documentTitle)}／${escapeHtml(question.source.edition)}／PDF ${question.source.pdfPage}／冊子 ${escapeHtml(question.source.printedPageLabel || '-')}／${escapeHtml(question.source.section)}</div>
            </section>
            ${!correct ? errorReasonPanel(session.pendingReason) : ''}
            <button class="btn primary full" data-next ${!correct && !session.pendingReason ? 'disabled' : ''}>${session.index + 1 >= total ? '結果を見る' : '次の問題'}</button>
          `}
        </article>
      </section>
    `;
  }

  function errorReasonPanel(selected: ErrorReason | null): string {
    return `<section class="reason-panel"><h2>なぜ間違えましたか？</h2><p>次の出題を調整するために1つ選んでください。</p><div class="reason-grid">${(Object.keys(ERROR_REASON_LABELS) as ErrorReason[]).map((reason) => `<button class="reason-button ${selected === reason ? 'active' : ''}" data-reason="${reason}">${escapeHtml(ERROR_REASON_LABELS[reason])}</button>`).join('')}</div></section>`;
  }

  function sessionResultView(): string {
    const session = runtime.session!;
    const entries = runtime.state.history.filter((entry) => entry.sessionId === session.id);
    const correct = entries.filter((entry) => entry.correct).length;
    const accuracy = entries.length ? Math.round((correct / entries.length) * 100) : 0;
    const avg = entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.elapsedMs, 0) / entries.length / 1000) : 0;
    const japanese = entries.filter((entry) => entry.reason === 'japanese').length;
    const weakest = calculateCategoryStats({ ...runtime.state, history: entries }).filter((item) => item.answered > 0).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101))[0];
    return `
      <section class="result-hero">
        <span class="result-icon" aria-hidden="true">✓</span>
        <h1>${entries.length}問が終わりました</h1>
        <strong>${correct} / ${entries.length}（${accuracy}%）</strong>
        <p>平均回答時間 ${avg}秒。日本語が原因の誤答は${japanese}件です。</p>
      </section>
      <div class="metric-grid">
        <article class="metric-card"><strong>${correct}</strong><span>正解</span></article>
        <article class="metric-card"><strong>${entries.length - correct}</strong><span>不正解</span></article>
        <article class="metric-card"><strong>${avg}秒</strong><span>平均回答時間</span></article>
        <article class="metric-card"><strong>${weakest?.category ?? '-'}</strong><span>今回の重点</span></article>
      </div>
      <section class="support-panel"><div><h2>次の一手</h2><p>${japanese > 0 ? '日本語が原因の誤答があります。用語集で関連語を確認してください。' : weakest ? `${weakest.category}をもう一度学習すると効果的です。` : '次の10問へ進みましょう。'}</p></div><button class="btn ghost" data-view="results">分析を見る</button></section>
      <div class="hero-actions centered"><button class="btn primary large" data-start="daily">次の${runtime.state.settings.dailyQuestionCount}問</button><button class="btn ghost large" data-view="home">ホームへ戻る</button></div>
    `;
  }

  function mockView(): string {
    const draft = runtime.state.mockDraft;
    if (!draft) return studyLanding();
    const index = clamp(draft.currentIndex, 0, draft.questionIds.length - 1);
    const question = questionById(draft.questionIds[index]);
    if (!question) return '<div class="empty-state"><h1>模試問題を読み込めませんでした</h1></div>';
    const remaining = mockSecondsRemaining(draft);
    const selected = draft.answers[question.id] ?? null;
    const unanswered = draft.questionIds.filter((id) => !draft.answers[id]).length;
    return `
      <section class="mock-shell">
        <div class="mock-header"><div><span class="pill danger">模擬試験</span><strong>問題 ${index + 1} / ${draft.questionIds.length}</strong></div><div class="mock-timer" data-mock-timer>${formatClock(remaining)}</div></div>
        <div class="mock-note">日本語のみ・途中解説なし・非公式練習結果です。残り未回答 ${unanswered}問。</div>
        <article class="question-card mock-card">
          <div class="question-number">${escapeHtml(question.category)}／${escapeHtml(question.topic)}</div>
          <h1 class="question-text">${escapeHtml(question.question.ja)}</h1>
          ${question.visual ? `<figure class="question-visual"><img src="${assetPath(question.visual.assetId)}" alt="${escapeHtml(question.visual.altJa)}"></figure>` : ''}
          <div class="choice-list">${question.choices.map((choice) => `<button class="choice-button ${selected === choice.id ? 'selected' : ''}" data-mock-choice="${choice.id}"><span class="choice-letter">${choice.id.toUpperCase()}</span><span class="choice-copy">${escapeHtml(choice.text.ja)}</span></button>`).join('')}</div>
          <div class="mock-navigation"><button class="btn ghost" data-mock-prev ${index === 0 ? 'disabled' : ''}>前へ</button><button class="btn secondary" data-mock-next ${index >= draft.questionIds.length - 1 ? 'disabled' : ''}>次へ</button></div>
        </article>
        <section class="mock-index"><h2>問題一覧</h2><div class="number-grid">${draft.questionIds.map((id, itemIndex) => `<button class="number-button ${draft.answers[id] ? 'answered' : ''} ${itemIndex === index ? 'current' : ''}" data-mock-jump="${itemIndex}">${itemIndex + 1}</button>`).join('')}</div></section>
        <button class="btn danger full" data-submit-mock>模試を終了して採点する</button>
      </section>
    `;
  }

  function mockResultView(result: MockResult): string {
    const weakest = Object.entries(result.categoryResults).sort(([, left], [, right]) => left.accuracy - right.accuracy).slice(0, 3);
    return `
      <section class="result-hero exam-result">
        <span class="result-icon" aria-hidden="true">50</span>
        <h1>模擬試験が終わりました</h1>
        <strong>${result.correct} / ${result.total}（${result.accuracy}%）</strong>
        <p>未回答 ${result.unanswered}問／所要時間 ${formatDuration(result.elapsedMs)}。これは非公式の練習結果です。</p>
      </section>
      <section class="table-panel"><h2>分野別結果</h2><div class="table-wrap"><table><thead><tr><th>分野</th><th>正解</th><th>問題数</th><th>正答率</th></tr></thead><tbody>${Object.entries(result.categoryResults).map(([category, item]) => `<tr><td>${escapeHtml(category)}</td><td>${item.correct}</td><td>${item.total}</td><td>${item.accuracy}%</td></tr>`).join('')}</tbody></table></div></section>
      <section class="support-panel"><div><h2>次の重点</h2><p>${weakest.length ? weakest.map(([category, item]) => `${escapeHtml(category)} ${item.accuracy}%`).join('、') : '分野別データがありません。'}</p></div><button class="btn ghost" data-view="results">成績を見る</button></section>
      <div class="hero-actions centered"><button class="btn primary large" data-start="daily">今日の問題へ</button><button class="btn ghost large" data-view="home">ホームへ戻る</button></div>
    `;
  }

  function glossaryView(): string {
    const needle = runtime.glossarySearch.trim().toLowerCase();
    const items = GLOSSARY.filter((item) => {
      const text = `${item.termJa} ${item.reading} ${item.easyJa} ${item.idn}`.toLowerCase();
      return (!needle || text.includes(needle)) && (runtime.glossaryFilter === 'all' || item.termJa.startsWith(runtime.glossaryFilter));
    });
    return `
      <div class="section-heading"><h1>日本語専門用語</h1><p>試験問題を読むための60語です。一般日本語ではなく、畜産・安全衛生の専門語に絞っています。</p></div>
      <div class="search-bar"><input type="search" data-glossary-search value="${escapeHtml(runtime.glossarySearch)}" placeholder="例：分娩、飼料、防疫、melahirkan"><span>${items.length}語</span></div>
      <div class="glossary-list">${items.map((item) => `<article class="glossary-row"><div class="glossary-term"><ruby>${escapeHtml(item.termJa)}<rt>${escapeHtml(item.reading)}</rt></ruby><span>${escapeHtml(item.idn)}</span></div><p>${escapeHtml(item.easyJa)}</p><button class="text-button" data-glossary-study="${escapeHtml(item.termJa)}">関連問題を探す</button></article>`).join('') || '<div class="empty-state"><h2>該当する用語がありません</h2></div>'}</div>
    `;
  }

  function resultsView(): string {
    const state = runtime.state;
    const stats = calculateCategoryStats(state);
    const recent = state.history.slice(-10).reverse();
    const weak = stats.filter((item) => item.answered > 0).sort((left, right) => (left.accuracy ?? 101) - (right.accuracy ?? 101));
    const reasons = (Object.keys(ERROR_REASON_LABELS) as ErrorReason[]).map((reason) => ({ reason, count: state.history.filter((entry) => entry.reason === reason).length }));
    const maxReason = Math.max(1, ...reasons.map((item) => item.count));
    return `
      <div class="section-heading"><h1>成績と弱点</h1><p>正答率だけでなく、回答時間と誤答原因を見ます。</p></div>
      <div class="metric-grid">
        <article class="metric-card"><strong>${state.history.length}</strong><span>累計解答</span></article>
        <article class="metric-card"><strong>${overallAccuracy(state)}%</strong><span>累計正答率</span></article>
        <article class="metric-card"><strong>${dueCount(state)}</strong><span>復習待ち</span></article>
        <article class="metric-card"><strong>${state.mockHistory.length}</strong><span>模試回数</span></article>
      </div>
      <section class="table-panel"><h2>分野別</h2><div class="table-wrap"><table><thead><tr><th>分野</th><th>解答</th><th>正解</th><th>正答率</th><th>平均</th><th>日本語原因</th></tr></thead><tbody>${stats.map((item) => `<tr><td>${escapeHtml(item.category)}</td><td>${item.answered}</td><td>${item.correct}</td><td>${item.accuracy ?? '-'}${item.accuracy === null ? '' : '%'}</td><td>${item.avgTimeSeconds ?? '-'}${item.avgTimeSeconds === null ? '' : '秒'}</td><td>${item.japaneseReasonRate ?? '-'}${item.japaneseReasonRate === null ? '' : '%'}</td></tr>`).join('')}</tbody></table></div></section>
      <div class="results-grid">
        <section class="panel"><h2>現在の重点</h2>${weak.length ? weak.slice(0, 3).map((item, index) => `<div class="recommendation"><strong>${index + 1}. ${escapeHtml(item.category)}</strong><span>正答率 ${item.accuracy}%／平均 ${item.avgTimeSeconds}秒</span><button class="text-button" data-category="${escapeHtml(item.category)}">この分野を学ぶ</button></div>`).join('') : '<p>学習を始めると表示します。</p>'}</section>
        <section class="panel"><h2>誤答原因</h2><div class="reason-bars">${reasons.map((item) => `<div><div class="bar-label"><span>${escapeHtml(ERROR_REASON_LABELS[item.reason])}</span><strong>${item.count}件</strong></div><div class="bar-track"><i style="width:${Math.round(item.count / maxReason * 100)}%"></i></div></div>`).join('')}</div></section>
      </div>
      <section class="table-panel"><h2>直近の回答</h2>${recent.length ? `<div class="history-list">${recent.map((entry) => `<div class="history-row ${entry.correct ? 'correct' : 'wrong'}"><span>${entry.correct ? '正解' : '不正解'}</span><strong>${escapeHtml(entry.category)}・${escapeHtml(entry.topic)}</strong><small>${Math.round(entry.elapsedMs / 1000)}秒／${new Date(entry.at).toLocaleString('ja-JP')}</small></div>`).join('')}</div>` : '<p>まだ履歴がありません。</p>'}</section>
      ${state.mockHistory.length ? `<section class="table-panel"><h2>模擬試験</h2><div class="history-list">${[...state.mockHistory].reverse().map((result) => `<div class="history-row"><strong>${result.correct}/${result.total}（${result.accuracy}%）</strong><span>未回答 ${result.unanswered}</span><small>${new Date(result.finishedAt).toLocaleString('ja-JP')}／${formatDuration(result.elapsedMs)}</small></div>`).join('')}</div></section>` : ''}
    `;
  }

  function managerView(): string {
    const state = runtime.state;
    const recent = state.history.filter((entry) => withinDays(entry.at, 7));
    const correct = recent.filter((entry) => entry.correct).length;
    const wrongWithReason = recent.filter((entry) => !entry.correct && entry.reason);
    const japanese = wrongWithReason.filter((entry) => entry.reason === 'japanese').length;
    const learningDays = new Set(recent.map((entry) => dateKey(entry.at))).size;
    const activity = Array.from({ length: 14 }, (_, reverseIndex) => {
      const date = new Date();
      date.setDate(date.getDate() - (13 - reverseIndex));
      const key = dateKey(date);
      return { label: `${date.getMonth() + 1}/${date.getDate()}`, count: state.history.filter((entry) => dateKey(entry.at) === key).length };
    });
    const maxActivity = Math.max(1, ...activity.map((item) => item.count));
    const stats = calculateCategoryStats(state).filter((item) => item.answered > 0).sort((left, right) => (left.accuracy ?? 101) - (right.accuracy ?? 101));
    const recommendations: string[] = [];
    stats.slice(0, 3).forEach((item) => recommendations.push(`${item.category}: 正答率${item.accuracy}%、平均${item.avgTimeSeconds}秒`));
    if (wrongWithReason.length && japanese / wrongWithReason.length >= 0.2) recommendations.push(`日本語原因の誤答が${Math.round(japanese / wrongWithReason.length * 100)}%。用語学習を優先`);
    if (!recommendations.length) recommendations.push('学習を始めると支援判断を表示します。');
    return `
      <div class="section-heading"><h1>会社管理者ダッシュボード</h1><p>この端末に保存された学習履歴から、支援に必要な項目だけを表示します。</p><span class="pill warn">試作・端末内データ</span></div>
      <div class="metric-grid"><article class="metric-card"><strong>${learningDays}日</strong><span>直近7日の学習日数</span></article><article class="metric-card"><strong>${recent.length}問</strong><span>直近7日の解答</span></article><article class="metric-card"><strong>${recent.length ? Math.round(correct / recent.length * 100) : 0}%</strong><span>直近7日の正答率</span></article><article class="metric-card"><strong>${wrongWithReason.length ? Math.round(japanese / wrongWithReason.length * 100) : 0}%</strong><span>日本語原因の誤答</span></article></div>
      <div class="results-grid"><section class="panel"><h2>14日間の学習量</h2><div class="activity-chart">${activity.map((item) => `<div class="activity-column"><i style="height:${Math.max(4, Math.round(item.count / maxActivity * 100))}%" class="${item.count ? 'active' : ''}"></i><span>${item.label}</span></div>`).join('')}</div></section><section class="panel"><h2>現在の支援判断</h2>${recommendations.map((item) => `<div class="recommendation">${escapeHtml(item)}</div>`).join('')}<div class="recommendation"><strong>復習待ち：</strong>${dueCount(state)}問</div><div class="recommendation"><strong>直近模試：</strong>${state.mockHistory.length ? `${state.mockHistory.at(-1)!.correct}/${state.mockHistory.at(-1)!.total}` : '未受験'}</div></section></div>
      <section class="table-panel"><h2>分野別累計</h2><div class="table-wrap"><table><thead><tr><th>分野</th><th>解答</th><th>正解</th><th>正答率</th><th>平均時間</th></tr></thead><tbody>${stats.map((item) => `<tr><td>${escapeHtml(item.category)}</td><td>${item.answered}</td><td>${item.correct}</td><td>${item.accuracy}%</td><td>${item.avgTimeSeconds}秒</td></tr>`).join('') || '<tr><td colspan="5">まだデータがありません</td></tr>'}</tbody></table></div></section>
      <div class="hero-actions"><button class="btn ghost" data-export-progress>学習データJSON</button><button class="btn ghost" data-export-progress-csv>履歴CSV</button></div>
    `;
  }

  function reviewView(): string {
    const statuses: Array<'all' | ReviewMark> = ['all', '未確認', '承認候補', '要修正', '保留'];
    let items = QUESTIONS.filter((question) => runtime.reviewCategory === 'all' || question.category === runtime.reviewCategory);
    if (runtime.reviewStatus !== 'all') items = items.filter((question) => (runtime.state.reviews[question.id]?.status ?? '未確認') === runtime.reviewStatus);
    const needle = runtime.reviewSearch.trim().toLowerCase();
    if (needle) items = items.filter((question) => `${question.id} ${question.category} ${question.topic} ${question.question.ja} ${question.source.section}`.toLowerCase().includes(needle));
    const count = (status: ReviewMark) => QUESTIONS.filter((question) => (runtime.state.reviews[question.id]?.status ?? '未確認') === status).length;
    return `
      <div class="section-heading"><h1>80問レビュー</h1><p>原典・日本語・インドネシア語・権利の4観点で最終承認へ進めます。</p><span class="pill warn">端末内の印でありapproved化ではありません</span></div>
      <div class="critical-note"><strong>重要：</strong>「承認候補」は端末内のレビュー印です。インドネシア語ネイティブ確認とマサトさんの最終判断後に、正本データ上で approved へ昇格します。</div>
      <div class="review-summary"><span class="pill">未確認 ${count('未確認')}</span><span class="pill success">承認候補 ${count('承認候補')}</span><span class="pill danger">要修正 ${count('要修正')}</span><span class="pill warn">保留 ${count('保留')}</span></div>
      <div class="review-toolbar"><input type="search" data-review-search value="${escapeHtml(runtime.reviewSearch)}" placeholder="問題番号・本文・章を検索"><select data-review-category><option value="all">全分野</option>${CATEGORY_ORDER.map((category) => `<option value="${escapeHtml(category)}" ${runtime.reviewCategory === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select><select data-review-status>${statuses.map((status) => `<option value="${status}" ${runtime.reviewStatus === status ? 'selected' : ''}>${status === 'all' ? '全状態' : status}</option>`).join('')}</select><button class="btn ghost" data-export-reviews>書き出す</button></div>
      <div class="review-list">${items.map((question) => {
        const review = runtime.state.reviews[question.id] ?? { status: '未確認' as ReviewMark, note: '', updatedAt: '' };
        const correctChoice = question.choices.find((choice) => choice.id === question.correctChoiceId);
        return `<article class="review-card ${review.status === '要修正' ? 'needs-fix' : review.status === '承認候補' ? 'candidate-ok' : ''}"><div class="tag-list"><span class="pill">${question.id}</span><span class="pill">${escapeHtml(question.category)}</span><span class="pill orange">${escapeHtml(question.topic)}</span><span class="pill ${review.status === '要修正' ? 'danger' : review.status === '保留' ? 'warn' : review.status === '承認候補' ? 'success' : ''}">${escapeHtml(review.status)}</span></div><h2>${escapeHtml(question.question.ja)}</h2><p><strong>正解：</strong>${escapeHtml(correctChoice?.text.ja ?? '-')}</p><p class="review-source">${escapeHtml(question.source.documentTitle)}／PDF ${question.source.pdfPage}／冊子 ${escapeHtml(question.source.printedPageLabel || '-')}／${escapeHtml(question.source.section)}<br>内容 ${escapeHtml(question.review.content)}・日本語 ${escapeHtml(question.review.languageJa)}・インドネシア語 ${escapeHtml(question.review.languageId)}・権利 ${escapeHtml(question.review.legalRights)}</p>${review.note ? `<div class="review-note"><strong>メモ：</strong>${escapeHtml(review.note)}</div>` : ''}<div class="review-actions"><button class="btn small secondary" data-review-set="${question.id}|承認候補">承認候補</button><button class="btn small danger" data-review-set="${question.id}|要修正">要修正</button><button class="btn small ghost" data-review-set="${question.id}|保留">保留</button><button class="btn small ghost" data-review-set="${question.id}|未確認">未確認</button></div></article>`;
      }).join('') || '<div class="empty-state"><h2>条件に合う問題がありません</h2></div>'}</div>
    `;
  }

  function settingsView(): string {
    const settings = runtime.state.settings;
    return `
      <div class="section-heading"><h1>設定</h1><p>母語補助、復習データ、端末へのインストールを管理します。</p></div>
      <section class="settings-panel"><h2>言語支援</h2><label class="setting-row select-row"><span><strong>アプリの表示言語</strong><small>画面全体の案内・ボタン・設定を切り替えます。問題の日本語は練習のため残ります。</small></span><select data-setting-ui-language><option value="id" ${settings.uiLanguage === 'id' ? 'selected' : ''}>Bahasa Indonesia</option><option value="ja" ${settings.uiLanguage === 'ja' ? 'selected' : ''}>日本語</option></select></label><label class="setting-row"><span><strong>自動支援レベル</strong><small>習得度に応じて母語・やさしい日本語を減らします。</small></span><input type="checkbox" data-setting-checkbox="automaticSupport" ${settings.automaticSupport ? 'checked' : ''}></label><label class="setting-row"><span><strong>ふりがな</strong><small>用語集に登録した専門語へ表示します。</small></span><input type="checkbox" data-setting-checkbox="showFurigana" ${settings.showFurigana ? 'checked' : ''}></label><label class="setting-row"><span><strong>やさしい日本語</strong><small>学習モードだけで表示します。</small></span><input type="checkbox" data-setting-checkbox="showEasyJapanese" ${settings.showEasyJapanese ? 'checked' : ''}></label><label class="setting-row"><span><strong>インドネシア語</strong><small>ネイティブ確認前の機械下書きです。</small></span><input type="checkbox" data-setting-checkbox="showIndonesian" ${settings.showIndonesian ? 'checked' : ''}></label><label class="setting-row select-row"><span><strong>固定支援レベル</strong><small>自動支援OFFのときに使います。</small></span><select data-setting-level ${settings.automaticSupport ? 'disabled' : ''}>${[3,2,1,0].map((level) => `<option value="${level}" ${settings.preferredSupportLevel === level ? 'selected' : ''}>Level ${level}：${escapeHtml(SUPPORT_LEVEL_LABELS[level])}</option>`).join('')}</select></label></section>
      <section class="settings-panel"><h2>学習</h2><label class="setting-row select-row"><span><strong>今日の問題数</strong><small>5～20問から選びます。</small></span><select data-setting-count>${[5,10,15,20].map((count) => `<option value="${count}" ${settings.dailyQuestionCount === count ? 'selected' : ''}>${count}問</option>`).join('')}</select></label><label class="setting-row"><span><strong>source_checked問題を表示</strong><small>内部レビュー用。一般公開版ではOFF固定にします。</small></span><input type="checkbox" data-setting-checkbox="reviewContentEnabled" ${settings.reviewContentEnabled ? 'checked' : ''}></label></section>
      <section class="settings-panel"><h2>端末とデータ</h2><div class="button-stack">${runtime.installPrompt ? '<button class="btn primary" data-install>ホーム画面へインストール</button>' : '<p class="muted">インストールボタンは対応ブラウザで条件を満たすと表示されます。iPhoneは共有メニューの「ホーム画面に追加」を使います。</p>'}<button class="btn ghost" data-export-progress>学習データを書き出す</button><label class="btn ghost file-button">学習データを読み込む<input type="file" accept="application/json" data-import-progress></label><button class="btn danger" data-reset-progress>学習履歴をリセット</button></div></section>
      <section class="settings-panel"><h2>この版について</h2><dl class="definition-list"><div><dt>版</dt><dd>${escapeHtml(APP_VERSION)}</dd></div><div><dt>モード</dt><dd>内部レビュー</dd></div><div><dt>問題</dt><dd>source_checked 80問／approved 0問</dd></div><div><dt>保存</dt><dd>IndexedDB＋localStorage予備</dd></div><div><dt>AI</dt><dd>アプリ利用中は使用しません</dd></div></dl></section>
    `;
  }
}
