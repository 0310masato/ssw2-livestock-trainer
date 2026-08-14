namespace LivestockApp {
  const DB_NAME = 'livestock-level2-trainer';
  const DB_VERSION = 1;
  const STORE_NAME = 'app';
  const STATE_KEY = 'state-v0.4';
  const FALLBACK_KEY = 'livestock2-state-v0.4';
  const CURRENT_SCHEMA_VERSION = '0.6.0';
  const MAX_HISTORY_ENTRIES = 20_000;
  const MAX_MOCK_RESULTS = 1_000;
  const MAX_TEXT_LENGTH = 10_000;
  const REVIEW_MARKS = ['未確認', '承認候補', '要修正', '保留'] as const;
  const SESSION_KINDS = ['daily', 'poultry', 'all', 'due', 'category', 'mock'] as const;
  const ERROR_REASONS = ['knowledge', 'japanese', 'misread', 'calculation', 'time', 'unsure'] as const;
  const DAILY_QUESTION_COUNTS = [5, 10, 15, 20] as const;
  const ROOT_KEYS = [
    'schemaVersion', 'revision', 'updatedAt', 'history', 'mastery', 'mockDraft', 'mockHistory',
    'reviews', 'settings', 'lastSessionQuestionIds', 'lastOpenedAt',
  ] as const;
  const CURRENT_SETTING_KEYS = [
    'uiLanguage', 'studySupportMode', 'showVocabulary', 'showQuestionPattern', 'preferredSupportLevel',
    'dailyQuestionCount', 'reviewContentEnabled',
  ] as const;
  const LEGACY_SETTING_KEYS = ['automaticSupport', 'showFurigana', 'showEasyJapanese', 'showIndonesian'] as const;
  let writeQueue: Promise<void> = Promise.resolve();
  let latestDurableRevision = 0;

  type UnknownRecord = Record<string, unknown>;

  export interface SaveStateResult {
    revision: number;
    updatedAt: string;
    localStorage: boolean;
    indexedDb: boolean;
  }

  export function defaultState(): AppState {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: 0,
      updatedAt: nowIso(),
      history: [],
      mastery: {},
      mockDraft: null,
      mockHistory: [],
      reviews: {},
      settings: {
        uiLanguage: 'id',
        studySupportMode: 'guided',
        showVocabulary: true,
        showQuestionPattern: true,
        preferredSupportLevel: 3,
        dailyQuestionCount: 10,
        reviewContentEnabled: true,
      },
      lastSessionQuestionIds: [],
      lastOpenedAt: nowIso(),
    };
  }

  function isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(record: UnknownRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
  }

  function pathError(path: string, message: string): never {
    throw new Error(`${path} ${message}`);
  }

  function recordAt(value: unknown, path: string): UnknownRecord {
    if (!isRecord(value)) pathError(path, 'must be an object.');
    return value;
  }

  function assertKnownKeys(record: UnknownRecord, allowed: readonly string[], path: string): void {
    const unknown = Object.keys(record).find((key) => !allowed.includes(key));
    if (unknown) pathError(`${path}.${unknown}`, 'is unexpected.');
  }

  function optionalBoolean(record: UnknownRecord, key: string, fallback: boolean, path: string): boolean {
    if (!hasOwn(record, key)) return fallback;
    if (typeof record[key] !== 'boolean') pathError(`${path}.${key}`, 'must be a boolean.');
    return record[key] as boolean;
  }

  function requiredBoolean(record: UnknownRecord, key: string, path: string): boolean {
    if (typeof record[key] !== 'boolean') pathError(`${path}.${key}`, 'must be a boolean.');
    return record[key] as boolean;
  }

  function stringAt(value: unknown, path: string, options?: { nullable?: false; allowEmpty?: boolean }): string;
  function stringAt(value: unknown, path: string, options: { nullable: true; allowEmpty?: boolean }): string | null;
  function stringAt(
    value: unknown,
    path: string,
    options: { nullable?: boolean; allowEmpty?: boolean } = {},
  ): string | null {
    if (options.nullable && value === null) return null;
    if (typeof value !== 'string') pathError(path, options.nullable ? 'must be a string or null.' : 'must be a string.');
    if ((!options.allowEmpty && value.length === 0) || value.length > MAX_TEXT_LENGTH) {
      pathError(path, `must contain 1 to ${MAX_TEXT_LENGTH} characters.`);
    }
    return value;
  }

  function isoAt(value: unknown, path: string, nullable = false): string | null {
    if (nullable && value === null) return null;
    const text = stringAt(value, path);
    if (!isValidIsoTimestamp(text)) {
      pathError(path, 'must be a valid ISO-8601 timestamp.');
    }
    return text;
  }

  function integerAt(value: unknown, path: string, minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
      pathError(path, `must be an integer from ${minimum} to ${maximum}.`);
    }
    return Number(value);
  }

  function finiteNumberAt(value: unknown, path: string, minimum: number, maximum: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
      pathError(path, `must be a finite number from ${minimum} to ${maximum}.`);
    }
    return value;
  }

  function enumAt<T extends string>(value: unknown, values: readonly T[], path: string): T {
    if (typeof value !== 'string' || !values.includes(value as T)) {
      pathError(path, `must be one of: ${values.join(', ')}.`);
    }
    return value as T;
  }

  function arrayAt(value: unknown, path: string, maximum: number): unknown[] {
    if (!Array.isArray(value)) pathError(path, 'must be an array.');
    if (value.length > maximum) pathError(path, `must contain at most ${maximum} items.`);
    return value;
  }

  function questionAt(value: unknown, path: string): Question {
    const id = stringAt(value, path);
    const question = questionById(id);
    if (!question) pathError(path, 'must reference a known questionId.');
    return question;
  }

  function choiceIdAt(value: unknown, question: Question, path: string, nullable = false): string | null {
    if (nullable && value === null) return null;
    const id = stringAt(value, path);
    if (!question.choices.some((choice) => choice.id === id)) pathError(path, `is not a choice of ${question.id}.`);
    return id;
  }

  function stringArrayAt(
    value: unknown,
    path: string,
    maximum: number,
    validate: (value: unknown, itemPath: string) => string = stringAt,
  ): string[] {
    const result = arrayAt(value, path, maximum).map((item, index) => validate(item, `${path}[${index}]`));
    if (new Set(result).size !== result.length) pathError(path, 'must not contain duplicates.');
    return result;
  }

  function inferredLegacyLevel(settings: UnknownRecord): SupportLevel {
    const furigana = settings.showFurigana === true;
    const easy = settings.showEasyJapanese === true;
    const indonesian = settings.showIndonesian === true;
    if (furigana && easy && indonesian) return 3;
    if (furigana && !easy && !indonesian) return settings.showVocabulary === false ? 1 : 2;
    if (furigana) return 2;
    return 0;
  }

  function normalizeSettings(raw: unknown, strict: boolean): UserSettings {
    const base = defaultState().settings;
    if (raw === undefined) return base;
    if (!isRecord(raw)) {
      if (strict) pathError('settings', 'must be an object.');
      return base;
    }
    const allowed = [...CURRENT_SETTING_KEYS, ...LEGACY_SETTING_KEYS];
    if (strict) assertKnownKeys(raw, allowed, 'settings');
    for (const key of [...CURRENT_SETTING_KEYS, ...LEGACY_SETTING_KEYS]) {
      if (hasOwn(raw, key) && !allowed.includes(key)) pathError(`settings.${key}`, 'is unexpected.');
    }

    const legacyBooleans = [...LEGACY_SETTING_KEYS].filter((key) => hasOwn(raw, key));
    if (strict) {
      for (const key of legacyBooleans) optionalBoolean(raw, key, false, 'settings');
    }
    const modeValues = ['guided', 'adaptive', 'japanese_only'] as const;
    const explicitMode = hasOwn(raw, 'studySupportMode') && modeValues.includes(raw.studySupportMode as StudySupportMode)
      ? raw.studySupportMode as StudySupportMode
      : null;
    if (strict && hasOwn(raw, 'studySupportMode') && explicitMode === null) {
      pathError('settings.studySupportMode', `must be one of: ${modeValues.join(', ')}.`);
    }
    const legacyAllFalse = ['showFurigana', 'showEasyJapanese', 'showIndonesian']
      .every((key) => hasOwn(raw, key) && raw[key] === false);
    const inferredLevel = inferredLegacyLevel(raw);
    const mode: StudySupportMode = explicitMode
      ?? (legacyAllFalse ? 'japanese_only' : raw.automaticSupport === true ? 'adaptive' : 'guided');
    const preferred = hasOwn(raw, 'preferredSupportLevel') && Number.isInteger(raw.preferredSupportLevel)
      && Number(raw.preferredSupportLevel) >= 0 && Number(raw.preferredSupportLevel) <= 3
      ? Number(raw.preferredSupportLevel) as SupportLevel
      : mode === 'japanese_only' ? 0 : inferredLevel || 3;
    if (strict && hasOwn(raw, 'preferredSupportLevel')
      && (!Number.isInteger(raw.preferredSupportLevel) || Number(raw.preferredSupportLevel) < 0 || Number(raw.preferredSupportLevel) > 3)) {
      pathError('settings.preferredSupportLevel', 'must be an integer from 0 to 3.');
    }
    const dailyQuestionCount = hasOwn(raw, 'dailyQuestionCount')
      && typeof raw.dailyQuestionCount === 'number'
      && DAILY_QUESTION_COUNTS.includes(raw.dailyQuestionCount as typeof DAILY_QUESTION_COUNTS[number])
      ? raw.dailyQuestionCount
      : base.dailyQuestionCount;
    if (strict && hasOwn(raw, 'dailyQuestionCount') && dailyQuestionCount !== raw.dailyQuestionCount) {
      pathError('settings.dailyQuestionCount', `must be one of: ${DAILY_QUESTION_COUNTS.join(', ')}.`);
    }

    const uiLanguage = hasOwn(raw, 'uiLanguage') && (raw.uiLanguage === 'ja' || raw.uiLanguage === 'id')
      ? raw.uiLanguage
      : base.uiLanguage;
    if (strict && hasOwn(raw, 'uiLanguage') && uiLanguage !== raw.uiLanguage) {
      pathError('settings.uiLanguage', 'must be one of: ja, id.');
    }

    return {
      uiLanguage,
      studySupportMode: mode,
      showVocabulary: optionalBoolean(raw, 'showVocabulary', base.showVocabulary, 'settings'),
      showQuestionPattern: optionalBoolean(raw, 'showQuestionPattern', base.showQuestionPattern, 'settings'),
      preferredSupportLevel: preferred,
      dailyQuestionCount,
      reviewContentEnabled: optionalBoolean(raw, 'reviewContentEnabled', base.reviewContentEnabled, 'settings'),
    };
  }

  function migrateHistory(raw: unknown): HistoryEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord).flatMap((entry) => {
      const question = typeof entry.questionId === 'string' ? questionById(entry.questionId) : undefined;
      if (!question) return [];
      return [{
        ...entry,
        factIds: [...question.sourceFactIds],
        category: question.category,
        topic: question.topic,
        usedEasyJapanese: Boolean(entry.usedEasyJapanese),
        usedIndonesian: Boolean(entry.usedIndonesian),
        usedFurigana: Boolean(entry.usedFurigana),
        openedKeywords: Boolean(entry.openedKeywords),
        openedQuestionTranslation: Boolean(entry.openedQuestionTranslation ?? entry.usedIndonesian),
        openedChoiceTranslations: Boolean(entry.openedChoiceTranslations),
        openedAnswerIndonesian: Boolean(entry.openedAnswerIndonesian),
        supportLevel: ([0, 1, 2, 3].includes(Number(entry.supportLevel)) ? Number(entry.supportLevel) : 3) as SupportLevel,
        knowledgeGap: Boolean(entry.knowledgeGap) || entry.reason === 'knowledge',
        japaneseGap: Boolean(entry.japaneseGap) || entry.reason === 'japanese',
        retryOfHistoryId: typeof entry.retryOfHistoryId === 'string' ? entry.retryOfHistoryId : null,
        isRetryWithoutSupport: Boolean(entry.isRetryWithoutSupport),
      } as HistoryEntry];
    });
  }

  function mergeState(raw: unknown): AppState {
    const base = defaultState();
    if (!isRecord(raw)) return base;
    const revision = Number.isSafeInteger(raw.revision) && Number(raw.revision) >= 0 ? Number(raw.revision) : 0;
    const updatedAt = typeof raw.updatedAt === 'string'
      ? raw.updatedAt
      : typeof raw.lastOpenedAt === 'string' ? raw.lastOpenedAt : base.updatedAt;
    return {
      ...base,
      history: migrateHistory(raw.history),
      mastery: isRecord(raw.mastery) ? raw.mastery as Record<string, MasteryState> : {},
      mockDraft: isRecord(raw.mockDraft) ? raw.mockDraft as unknown as MockDraft : null,
      mockHistory: Array.isArray(raw.mockHistory) ? raw.mockHistory as MockResult[] : [],
      reviews: isRecord(raw.reviews) ? raw.reviews as Record<string, ReviewRecord> : {},
      settings: normalizeSettings(raw.settings, false),
      lastSessionQuestionIds: Array.isArray(raw.lastSessionQuestionIds)
        ? raw.lastSessionQuestionIds.filter((id): id is string => typeof id === 'string' && Boolean(questionById(id)))
        : [],
      revision,
      updatedAt,
      lastOpenedAt: typeof raw.lastOpenedAt === 'string' ? raw.lastOpenedAt : base.lastOpenedAt,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  }

  function validateHistory(raw: unknown): HistoryEntry[] {
    const allowed = [
      'id', 'sessionId', 'questionId', 'factIds', 'category', 'topic', 'sessionKind', 'selectedChoiceId',
      'correct', 'elapsedMs', 'usedEasyJapanese', 'usedIndonesian', 'usedFurigana', 'openedKeywords',
      'openedQuestionTranslation', 'openedChoiceTranslations', 'openedAnswerIndonesian', 'supportLevel',
      'knowledgeGap', 'japaneseGap', 'retryOfHistoryId', 'isRetryWithoutSupport', 'reason', 'confidence', 'at',
    ];
    return arrayAt(raw ?? [], 'history', MAX_HISTORY_ENTRIES).map((item, index) => {
      const path = `history[${index}]`;
      const entry = recordAt(item, path);
      assertKnownKeys(entry, allowed, path);
      const question = questionAt(entry.questionId, `${path}.questionId`);
      if (hasOwn(entry, 'factIds')) {
        stringArrayAt(entry.factIds, `${path}.factIds`, 20);
      }
      if (hasOwn(entry, 'category')) stringAt(entry.category, `${path}.category`, { allowEmpty: true });
      if (hasOwn(entry, 'topic')) stringAt(entry.topic, `${path}.topic`, { allowEmpty: true });
      const selectedChoiceId = choiceIdAt(entry.selectedChoiceId, question, `${path}.selectedChoiceId`, true);
      requiredBoolean(entry, 'correct', path);
      const reason = entry.reason === null ? null : enumAt(entry.reason, ERROR_REASONS, `${path}.reason`);
      const confidence = entry.confidence === null
        ? null
        : enumAt(entry.confidence, ['sure', 'unsure'] as const, `${path}.confidence`);
      const supportLevel = hasOwn(entry, 'supportLevel')
        ? integerAt(entry.supportLevel, `${path}.supportLevel`, 0, 3) as SupportLevel
        : 3;
      return {
        id: stringAt(entry.id, `${path}.id`),
        sessionId: stringAt(entry.sessionId, `${path}.sessionId`),
        questionId: question.id,
        factIds: [...question.sourceFactIds],
        category: question.category,
        topic: question.topic,
        sessionKind: enumAt(entry.sessionKind, SESSION_KINDS, `${path}.sessionKind`),
        selectedChoiceId,
        correct: selectedChoiceId === question.correctChoiceId,
        elapsedMs: finiteNumberAt(entry.elapsedMs, `${path}.elapsedMs`, 0, 7 * 24 * 60 * 60 * 1_000),
        usedEasyJapanese: optionalBoolean(entry, 'usedEasyJapanese', false, path),
        usedIndonesian: optionalBoolean(entry, 'usedIndonesian', false, path),
        usedFurigana: optionalBoolean(entry, 'usedFurigana', false, path),
        openedKeywords: optionalBoolean(entry, 'openedKeywords', false, path),
        openedQuestionTranslation: hasOwn(entry, 'openedQuestionTranslation')
          ? optionalBoolean(entry, 'openedQuestionTranslation', false, path)
          : optionalBoolean(entry, 'usedIndonesian', false, path),
        openedChoiceTranslations: optionalBoolean(entry, 'openedChoiceTranslations', false, path),
        openedAnswerIndonesian: optionalBoolean(entry, 'openedAnswerIndonesian', false, path),
        supportLevel,
        knowledgeGap: hasOwn(entry, 'knowledgeGap')
          ? optionalBoolean(entry, 'knowledgeGap', false, path)
          : reason === 'knowledge',
        japaneseGap: hasOwn(entry, 'japaneseGap')
          ? optionalBoolean(entry, 'japaneseGap', false, path)
          : reason === 'japanese',
        retryOfHistoryId: hasOwn(entry, 'retryOfHistoryId')
          ? stringAt(entry.retryOfHistoryId, `${path}.retryOfHistoryId`, { nullable: true })
          : null,
        isRetryWithoutSupport: optionalBoolean(entry, 'isRetryWithoutSupport', false, path),
        reason,
        confidence,
        at: isoAt(entry.at, `${path}.at`) as string,
      };
    });
  }

  function validateMastery(raw: unknown): Record<string, MasteryState> {
    if (raw === undefined) return {};
    const mastery = recordAt(raw, 'mastery');
    if (Object.keys(mastery).length > QUESTIONS.length) pathError('mastery', `must contain at most ${QUESTIONS.length} records.`);
    const result: Record<string, MasteryState> = {};
    for (const [key, value] of Object.entries(mastery)) {
      const path = `mastery.${key}`;
      const record = recordAt(value, path);
      assertKnownKeys(record, [
        'questionId', 'factIds', 'stage', 'attempts', 'correct', 'dueAt', 'lastAnsweredAt', 'lastCorrect', 'lastSupportLevel',
      ], path);
      const question = questionAt(record.questionId, `${path}.questionId`);
      if (question.id !== key) pathError(`${path}.questionId`, 'must match its object key.');
      if (hasOwn(record, 'factIds')) {
        stringArrayAt(record.factIds, `${path}.factIds`, 20);
      }
      const attempts = integerAt(record.attempts, `${path}.attempts`, 0, 1_000_000);
      const correct = integerAt(record.correct, `${path}.correct`, 0, attempts);
      result[key] = {
        questionId: question.id,
        factIds: [...question.sourceFactIds],
        stage: integerAt(record.stage, `${path}.stage`, 0, 4),
        attempts,
        correct,
        dueAt: isoAt(record.dueAt, `${path}.dueAt`) as string,
        lastAnsweredAt: isoAt(record.lastAnsweredAt, `${path}.lastAnsweredAt`) as string,
        lastCorrect: requiredBoolean(record, 'lastCorrect', path),
        lastSupportLevel: integerAt(record.lastSupportLevel, `${path}.lastSupportLevel`, 0, 3),
      };
    }
    return result;
  }

  function validateMockDraft(raw: unknown): MockDraft | null {
    if (raw === undefined || raw === null) return null;
    const record = recordAt(raw, 'mockDraft');
    assertKnownKeys(record, ['id', 'questionIds', 'answers', 'startedAt', 'deadlineAt', 'currentIndex'], 'mockDraft');
    const questionIds = stringArrayAt(
      record.questionIds,
      'mockDraft.questionIds',
      QUESTIONS.length,
      (value, path) => questionAt(value, path).id,
    );
    const answers = recordAt(record.answers, 'mockDraft.answers');
    if (Object.keys(answers).length > questionIds.length) pathError('mockDraft.answers', 'contains too many entries.');
    const reconstructedAnswers: Record<string, string> = {};
    for (const [questionId, choiceId] of Object.entries(answers)) {
      if (!questionIds.includes(questionId)) pathError(`mockDraft.answers.${questionId}`, 'must reference a question in mockDraft.questionIds.');
      reconstructedAnswers[questionId] = choiceIdAt(
        choiceId,
        questionAt(questionId, `mockDraft.answers.${questionId}`),
        `mockDraft.answers.${questionId}`,
      ) as string;
    }
    return {
      id: stringAt(record.id, 'mockDraft.id'),
      questionIds,
      answers: reconstructedAnswers,
      startedAt: isoAt(record.startedAt, 'mockDraft.startedAt') as string,
      deadlineAt: isoAt(record.deadlineAt, 'mockDraft.deadlineAt') as string,
      currentIndex: integerAt(record.currentIndex, 'mockDraft.currentIndex', 0, Math.max(0, questionIds.length - 1)),
    };
  }

  function validateMockHistory(raw: unknown): MockResult[] {
    return arrayAt(raw ?? [], 'mockHistory', MAX_MOCK_RESULTS).map((item, index) => {
      const path = `mockHistory[${index}]`;
      const record = recordAt(item, path);
      assertKnownKeys(record, ['id', 'total', 'correct', 'accuracy', 'unanswered', 'startedAt', 'finishedAt', 'elapsedMs', 'categoryResults'], path);
      const total = integerAt(record.total, `${path}.total`, 0, QUESTIONS.length);
      const correct = integerAt(record.correct, `${path}.correct`, 0, total);
      const unanswered = integerAt(record.unanswered, `${path}.unanswered`, 0, total);
      const categoryInput = recordAt(record.categoryResults, `${path}.categoryResults`);
      const categoryResults: Record<string, { total: number; correct: number; accuracy: number }> = {};
      const knownCategories = new Set(QUESTIONS.map((question) => question.category));
      for (const [category, value] of Object.entries(categoryInput)) {
        if (!knownCategories.has(category)) pathError(`${path}.categoryResults.${category}`, 'is not a known category.');
        const stats = recordAt(value, `${path}.categoryResults.${category}`);
        assertKnownKeys(stats, ['total', 'correct', 'accuracy'], `${path}.categoryResults.${category}`);
        const categoryTotal = integerAt(stats.total, `${path}.categoryResults.${category}.total`, 0, total);
        categoryResults[category] = {
          total: categoryTotal,
          correct: integerAt(stats.correct, `${path}.categoryResults.${category}.correct`, 0, categoryTotal),
          accuracy: finiteNumberAt(stats.accuracy, `${path}.categoryResults.${category}.accuracy`, 0, 100),
        };
      }
      return {
        id: stringAt(record.id, `${path}.id`),
        total,
        correct,
        accuracy: finiteNumberAt(record.accuracy, `${path}.accuracy`, 0, 100),
        unanswered,
        startedAt: isoAt(record.startedAt, `${path}.startedAt`) as string,
        finishedAt: isoAt(record.finishedAt, `${path}.finishedAt`) as string,
        elapsedMs: integerAt(record.elapsedMs, `${path}.elapsedMs`, 0, 7 * 24 * 60 * 60 * 1_000),
        categoryResults,
      };
    });
  }

  function validateReviews(raw: unknown): Record<string, ReviewRecord> {
    if (raw === undefined) return {};
    const reviews = recordAt(raw, 'reviews');
    if (Object.keys(reviews).length > QUESTIONS.length) pathError('reviews', `must contain at most ${QUESTIONS.length} records.`);
    const result: Record<string, ReviewRecord> = {};
    for (const [questionId, value] of Object.entries(reviews)) {
      questionAt(questionId, `reviews.${questionId}`);
      const path = `reviews.${questionId}`;
      const record = recordAt(value, path);
      assertKnownKeys(record, ['status', 'note', 'updatedAt'], path);
      result[questionId] = {
        status: enumAt(record.status, REVIEW_MARKS, `${path}.status`),
        note: stringAt(record.note, `${path}.note`, { allowEmpty: true }),
        updatedAt: isoAt(record.updatedAt, `${path}.updatedAt`) as string,
      };
    }
    return result;
  }

  function freshness(raw: unknown): [number, number] {
    if (!isRecord(raw)) return [-1, -1];
    const revision = Number.isSafeInteger(raw.revision) && Number(raw.revision) >= 0 ? Number(raw.revision) : 0;
    const timestampValue = typeof raw.updatedAt === 'string'
      ? raw.updatedAt
      : typeof raw.lastOpenedAt === 'string' ? raw.lastOpenedAt : '';
    const timestamp = Date.parse(timestampValue) || 0;
    return [revision, timestamp];
  }

  function freshest(indexed: unknown, fallback: unknown): unknown {
    if (!indexed) return fallback;
    if (!fallback) return indexed;
    const [indexedRevision, indexedTime] = freshness(indexed);
    const [fallbackRevision, fallbackTime] = freshness(fallback);
    if (fallbackRevision !== indexedRevision) return fallbackRevision > indexedRevision ? fallback : indexed;
    return fallbackTime >= indexedTime ? fallback : indexed;
  }

  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is unavailable'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    });
  }

  async function readIndexedDb(): Promise<unknown> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
      transaction.oncomplete = () => database.close();
    });
  }

  async function writeIndexedDb(state: AppState): Promise<void> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        database.close();
        reject(error);
      };
      try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          database.close();
          resolve();
        };
        transaction.onerror = () => fail(transaction.error ?? new Error('IndexedDB write failed'));
        transaction.onabort = () => fail(transaction.error ?? new Error('IndexedDB write aborted'));
      } catch (error) {
        fail(error);
      }
    });
  }

  export async function loadState(): Promise<AppState> {
    let indexed: unknown = null;
    let fallback: unknown = null;
    try {
      indexed = await readIndexedDb();
    } catch (error) {
      console.warn('IndexedDB load failed. Comparing available localStorage state.', error);
    }
    try {
      const text = localStorage.getItem(FALLBACK_KEY);
      if (text) fallback = JSON.parse(text);
    } catch (error) {
      console.warn('Fallback state load failed.', error);
    }
    const state = mergeState(freshest(indexed, fallback));
    latestDurableRevision = Math.max(latestDurableRevision, state.revision);
    state.lastOpenedAt = nowIso();
    return state;
  }

  function nextSafeRevision(stateRevision: number): number {
    if (!Number.isSafeInteger(stateRevision) || stateRevision < 0) {
      throw new Error('State revision must be a non-negative safe integer.');
    }
    const baseRevision = Math.max(stateRevision, latestDurableRevision);
    const nextRevision = baseRevision + 1;
    if (!Number.isSafeInteger(nextRevision)) {
      throw new Error('State revision cannot be incremented safely.');
    }
    return nextRevision;
  }

  async function writeDurableSnapshot(state: AppState, source: AppState): Promise<SaveStateResult> {
    const revision = nextSafeRevision(source.revision);
    const timestamp = nowIso();
    const snapshot: AppState = {
      ...source,
      revision,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
    };
    const serialized = JSON.stringify(snapshot);

    let fallbackSaved = false;
    let fallbackError: unknown = null;
    try {
      localStorage.setItem(FALLBACK_KEY, serialized);
      fallbackSaved = true;
    } catch (error) {
      fallbackError = error;
    }

    let indexedDbSaved = false;
    let indexedDbError: unknown = null;
    try {
      await writeIndexedDb(snapshot);
      indexedDbSaved = true;
    } catch (error) {
      indexedDbError = error;
    }

    if (!fallbackSaved && !indexedDbSaved) {
      throw new AggregateError(
        [fallbackError, indexedDbError],
        'State could not be saved to localStorage or IndexedDB.',
      );
    }
    if (!fallbackSaved) {
      console.warn('localStorage save failed. State is preserved in IndexedDB.', fallbackError);
    }
    if (!indexedDbSaved) {
      console.warn('IndexedDB save failed. State is preserved in localStorage.', indexedDbError);
    }

    latestDurableRevision = revision;
    state.revision = revision;
    state.updatedAt = timestamp;
    state.lastOpenedAt = timestamp;
    return {
      revision,
      updatedAt: timestamp,
      localStorage: fallbackSaved,
      indexedDb: indexedDbSaved,
    };
  }

  export async function saveState(state: AppState): Promise<SaveStateResult> {
    const source = JSON.parse(JSON.stringify(state)) as AppState;
    const write = writeQueue.then(() => writeDurableSnapshot(state, source));
    writeQueue = write.then(() => undefined, () => undefined);
    return write;
  }

  export async function clearProgressKeepReviews(state: AppState): Promise<AppState> {
    const next = defaultState();
    next.reviews = state.reviews;
    next.settings = state.settings;
    next.revision = state.revision;
    await saveState(next);
    return next;
  }

  export function validateImportedState(raw: unknown): AppState {
    const candidate = recordAt(raw, 'state');
    assertKnownKeys(candidate, ROOT_KEYS, 'state');
    if (hasOwn(candidate, 'schemaVersion')) {
      enumAt(candidate.schemaVersion, ['0.4.0', '0.5.0', '0.6.0'] as const, 'schemaVersion');
    }
    const base = defaultState();
    const revision = hasOwn(candidate, 'revision')
      ? integerAt(candidate.revision, 'revision', 0, Number.MAX_SAFE_INTEGER - 1)
      : 0;
    const updatedAt = hasOwn(candidate, 'updatedAt')
      ? isoAt(candidate.updatedAt, 'updatedAt') as string
      : hasOwn(candidate, 'lastOpenedAt') ? isoAt(candidate.lastOpenedAt, 'lastOpenedAt') as string : base.updatedAt;
    const lastOpenedAt = hasOwn(candidate, 'lastOpenedAt')
      ? isoAt(candidate.lastOpenedAt, 'lastOpenedAt') as string
      : base.lastOpenedAt;
    const lastSessionQuestionIds = hasOwn(candidate, 'lastSessionQuestionIds')
      ? stringArrayAt(
        candidate.lastSessionQuestionIds,
        'lastSessionQuestionIds',
        QUESTIONS.length,
        (value, path) => questionAt(value, path).id,
      )
      : [];

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision,
      updatedAt,
      history: validateHistory(candidate.history),
      mastery: validateMastery(candidate.mastery),
      mockDraft: validateMockDraft(candidate.mockDraft),
      mockHistory: validateMockHistory(candidate.mockHistory),
      reviews: validateReviews(candidate.reviews),
      settings: normalizeSettings(candidate.settings, true),
      lastSessionQuestionIds,
      lastOpenedAt,
    };
  }
}
