namespace LivestockApp {
  const REVIEW_INTERVAL_DAYS = [0, 3, 7, 14, 30];

  export function isDue(mastery: MasteryState | undefined, at = new Date()): boolean {
    if (!mastery) return false;
    return new Date(mastery.dueAt).getTime() <= at.getTime();
  }

  export function seenQuestionIds(state: AppState): Set<string> {
    return new Set(state.history.map((entry) => entry.questionId));
  }

  export function calculateCategoryStats(state: AppState): CategoryStats[] {
    const grouped = new Map<string, HistoryEntry[]>();
    for (const entry of state.history) {
      const list = grouped.get(entry.category) ?? [];
      list.push(entry);
      grouped.set(entry.category, list);
    }

    return CATEGORY_ORDER.map((category) => {
      const entries = grouped.get(category) ?? [];
      const correct = entries.filter((entry) => entry.correct).length;
      const wrongWithReason = entries.filter((entry) => !entry.correct && entry.reason);
      const japaneseReasons = wrongWithReason.filter((entry) => entry.reason === 'japanese').length;
      return {
        category,
        answered: entries.length,
        correct,
        accuracy: entries.length ? Math.round((correct / entries.length) * 100) : null,
        avgTimeSeconds: entries.length
          ? Math.round(entries.reduce((sum, entry) => sum + entry.elapsedMs, 0) / entries.length / 1000)
          : null,
        japaneseReasonRate: wrongWithReason.length
          ? Math.round((japaneseReasons / wrongWithReason.length) * 100)
          : null,
      };
    });
  }

  export function weakestCategories(state: AppState, count = 3): string[] {
    const stats = calculateCategoryStats(state)
      .filter((item) => item.answered >= 2)
      .sort((left, right) => (left.accuracy ?? 101) - (right.accuracy ?? 101));
    return stats.slice(0, count).map((item) => item.category);
  }

  function takeUnique(pool: readonly Question[], count: number, selected: Set<string>, seed: number): Question[] {
    const result: Question[] = [];
    for (const question of shuffle(pool, seed)) {
      if (selected.has(question.id)) continue;
      selected.add(question.id);
      result.push(question);
      if (result.length >= count) break;
    }
    return result;
  }

  export function buildDailyQueue(state: AppState, requestedCount = state.settings.dailyQuestionCount): string[] {
    const questions = activeQuestions(state);
    const selected = new Set<string>();
    const result: Question[] = [];
    const todaySeed = Number(dateKey(new Date()).replaceAll('-', ''));
    const duePool = questions.filter((question) => isDue(state.mastery[question.id]));
    const weak = new Set(weakestCategories(state, 3));
    const weakPool = questions.filter((question) => weak.has(question.category));
    const seen = seenQuestionIds(state);
    const newPool = questions.filter((question) => !seen.has(question.id));

    const dueTarget = Math.min(4, requestedCount);
    result.push(...takeUnique(duePool, dueTarget, selected, todaySeed + 1));
    result.push(...takeUnique(weakPool, Math.min(3, requestedCount - result.length), selected, todaySeed + 2));
    result.push(...takeUnique(newPool, Math.min(3, requestedCount - result.length), selected, todaySeed + 3));
    result.push(...takeUnique(questions, requestedCount - result.length, selected, todaySeed + 4));
    return result.slice(0, requestedCount).map((question) => question.id);
  }

  export function buildPoultryQueue(state: AppState, count = 10): string[] {
    const questions = activeQuestions(state);
    const selected = new Set<string>();
    const result: Question[] = [];
    const seed = Date.now();
    for (const category of POULTRY_PATH) {
      const remaining = count - result.length;
      if (remaining <= 0) break;
      const target = category === '肉用鶏' ? Math.min(5, remaining) : category === '採卵鶏' ? Math.min(2, remaining) : 1;
      result.push(...takeUnique(questions.filter((question) => question.category === category), target, selected, seed + result.length));
    }
    result.push(...takeUnique(questions, count - result.length, selected, seed + 100));
    return result.slice(0, count).map((question) => question.id);
  }

  export function buildAllQueue(state: AppState, count = 10): string[] {
    return shuffle(activeQuestions(state), Date.now()).slice(0, count).map((question) => question.id);
  }

  export function buildDueQueue(state: AppState, limit = 20): string[] {
    const due = activeQuestions(state)
      .filter((question) => isDue(state.mastery[question.id]))
      .sort((left, right) => {
        const leftDue = state.mastery[left.id]?.dueAt ?? '';
        const rightDue = state.mastery[right.id]?.dueAt ?? '';
        return leftDue.localeCompare(rightDue);
      });
    return due.slice(0, limit).map((question) => question.id);
  }

  export function buildCategoryQueue(state: AppState, category: string, count = 10): string[] {
    return shuffle(activeQuestions(state).filter((question) => question.category === category), Date.now())
      .slice(0, count)
      .map((question) => question.id);
  }

  export function buildMockQueue(state: AppState, count = 50): string[] {
    const questions = activeQuestions(state);
    if (questions.length <= count) return shuffle(questions, Date.now()).map((question) => question.id);

    const selected = new Set<string>();
    const result: Question[] = [];
    const categoryWeights: Record<string, number> = {
      '肉用鶏': 9,
      '採卵鶏': 6,
      '豚': 8,
      '乳用牛': 6,
      '肉用牛': 5,
      '安全衛生': 10,
      '畜産共通': 3,
      '軽種馬': 1,
      '養蜂': 1,
    };
    const seed = Date.now();
    for (const category of CATEGORY_ORDER) {
      const target = Math.min(categoryWeights[category] ?? 1, count - result.length);
      result.push(...takeUnique(questions.filter((question) => question.category === category), target, selected, seed + result.length));
    }
    result.push(...takeUnique(questions, count - result.length, selected, seed + 999));
    return result.slice(0, count).map((question) => question.id);
  }

  export function effectiveSupportLevel(state: AppState, question: Question): 0 | 1 | 2 | 3 {
    if (!state.settings.automaticSupport) return state.settings.preferredSupportLevel;
    const mastery = state.mastery[question.id];
    if (!mastery) return 3;
    if (mastery.stage >= 4) return 0;
    if (mastery.stage >= 3) return 1;
    if (mastery.stage >= 2) return 2;
    return 3;
  }

  export function supportSettingsForLevel(level: number): Pick<UserSettings, 'showFurigana' | 'showEasyJapanese' | 'showIndonesian'> {
    if (level <= 0) return { showFurigana: false, showEasyJapanese: false, showIndonesian: false };
    if (level === 1) return { showFurigana: false, showEasyJapanese: false, showIndonesian: false };
    if (level === 2) return { showFurigana: true, showEasyJapanese: true, showIndonesian: false };
    return { showFurigana: true, showEasyJapanese: true, showIndonesian: true };
  }

  export function recordAnswer(
    state: AppState,
    question: Question,
    options: {
      sessionId: string;
      sessionKind: SessionKind;
      selectedChoiceId: string | null;
      elapsedMs: number;
      usedEasyJapanese: boolean;
      usedIndonesian: boolean;
      usedFurigana: boolean;
      supportLevel: number;
      reason: ErrorReason | null;
      confidence: 'sure' | 'unsure' | null;
      answeredAt?: Date;
    },
  ): HistoryEntry {
    const answeredAt = options.answeredAt ?? new Date();
    const correct = options.selectedChoiceId === question.correctChoiceId;
    const previous = state.mastery[question.id];
    let stage = previous?.stage ?? 0;

    if (correct) {
      const usedStrongSupport = options.usedIndonesian || options.usedEasyJapanese || options.supportLevel >= 2;
      const slow = options.elapsedMs > 120_000;
      if (!usedStrongSupport && !slow && options.confidence !== 'unsure') stage = clamp(stage + 1, 1, 4);
      else stage = Math.max(stage, 1);
    } else {
      stage = 0;
    }

    const dueAt = correct
      ? addDaysIso(answeredAt, REVIEW_INTERVAL_DAYS[stage] ?? 30)
      : addMinutesIso(answeredAt, 10);

    state.mastery[question.id] = {
      questionId: question.id,
      factIds: question.sourceFactIds,
      stage,
      attempts: (previous?.attempts ?? 0) + 1,
      correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
      dueAt,
      lastAnsweredAt: answeredAt.toISOString(),
      lastCorrect: correct,
      lastSupportLevel: options.supportLevel,
    };

    const entry: HistoryEntry = {
      id: uid('answer'),
      sessionId: options.sessionId,
      questionId: question.id,
      factIds: question.sourceFactIds,
      category: question.category,
      topic: question.topic,
      sessionKind: options.sessionKind,
      selectedChoiceId: options.selectedChoiceId,
      correct,
      elapsedMs: Math.max(0, options.elapsedMs),
      usedEasyJapanese: options.usedEasyJapanese,
      usedIndonesian: options.usedIndonesian,
      usedFurigana: options.usedFurigana,
      supportLevel: options.supportLevel,
      reason: options.reason,
      confidence: options.confidence,
      at: answeredAt.toISOString(),
    };
    state.history.push(entry);
    return entry;
  }

  export function dueCount(state: AppState): number {
    return activeQuestions(state).filter((question) => isDue(state.mastery[question.id])).length;
  }

  export function learnedCount(state: AppState): number {
    return seenQuestionIds(state).size;
  }

  export function overallAccuracy(state: AppState): number {
    return state.history.length
      ? Math.round((state.history.filter((entry) => entry.correct).length / state.history.length) * 100)
      : 0;
  }

  export function reviewStageLabel(stage: number): string {
    if (stage <= 0) return '要復習';
    if (stage === 1) return '3日後';
    if (stage === 2) return '7日後';
    if (stage === 3) return '14日後';
    return '30日後';
  }
}
