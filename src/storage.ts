namespace LivestockApp {
  const DB_NAME = 'livestock-level2-trainer';
  const DB_VERSION = 1;
  const STORE_NAME = 'app';
  const STATE_KEY = 'state-v0.4';
  const FALLBACK_KEY = 'livestock2-state-v0.4';
  let writeQueue: Promise<void> = Promise.resolve();

  export function defaultState(): AppState {
    return {
      schemaVersion: '0.6.0',
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
        automaticSupport: true,
        showFurigana: true,
        showEasyJapanese: true,
        showIndonesian: true,
        dailyQuestionCount: 10,
        reviewContentEnabled: true,
      },
      lastSessionQuestionIds: [],
      lastOpenedAt: nowIso(),
    };
  }

  function normalizedSupportLevel(value: unknown): SupportLevel {
    const numeric = Number(value);
    return ([0, 1, 2, 3] as const).includes(numeric as SupportLevel) ? numeric as SupportLevel : 3;
  }

  function migrateHistory(raw: unknown): HistoryEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object').map((entry) => ({
      ...entry,
      usedEasyJapanese: Boolean(entry.usedEasyJapanese),
      usedIndonesian: Boolean(entry.usedIndonesian),
      usedFurigana: Boolean(entry.usedFurigana),
      openedKeywords: Boolean(entry.openedKeywords),
      openedQuestionTranslation: Boolean(entry.openedQuestionTranslation ?? entry.usedIndonesian),
      openedChoiceTranslations: Boolean(entry.openedChoiceTranslations),
      openedAnswerIndonesian: Boolean(entry.openedAnswerIndonesian),
      supportLevel: normalizedSupportLevel(entry.supportLevel),
      knowledgeGap: Boolean(entry.knowledgeGap) || entry.reason === 'knowledge',
      japaneseGap: Boolean(entry.japaneseGap) || entry.reason === 'japanese',
      retryOfHistoryId: typeof entry.retryOfHistoryId === 'string' ? entry.retryOfHistoryId : null,
      isRetryWithoutSupport: Boolean(entry.isRetryWithoutSupport),
    })) as HistoryEntry[];
  }

  function mergeState(raw: unknown): AppState {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const candidate = raw as Partial<AppState>;
    const candidateSettings: Partial<UserSettings> = candidate.settings ?? {};
    const settings: UserSettings = {
      ...base.settings,
      ...candidateSettings,
      uiLanguage: candidateSettings.uiLanguage === 'ja' ? 'ja' : 'id',
      studySupportMode: ['guided', 'adaptive', 'japanese_only'].includes(String(candidateSettings.studySupportMode))
        ? candidateSettings.studySupportMode as StudySupportMode
        : 'guided',
      showVocabulary: candidateSettings.showVocabulary !== false,
      showQuestionPattern: candidateSettings.showQuestionPattern !== false,
      preferredSupportLevel: normalizedSupportLevel(candidateSettings.preferredSupportLevel),
      automaticSupport: candidateSettings.automaticSupport !== false,
      showFurigana: candidateSettings.showFurigana !== false,
      showEasyJapanese: candidateSettings.showEasyJapanese !== false,
      showIndonesian: candidateSettings.showIndonesian !== false,
    };
    return {
      ...base,
      ...candidate,
      history: migrateHistory(candidate.history),
      mastery: candidate.mastery && typeof candidate.mastery === 'object' ? candidate.mastery : {},
      mockDraft: candidate.mockDraft ?? null,
      mockHistory: Array.isArray(candidate.mockHistory) ? candidate.mockHistory : [],
      reviews: candidate.reviews && typeof candidate.reviews === 'object' ? candidate.reviews : {},
      settings,
      lastSessionQuestionIds: Array.isArray(candidate.lastSessionQuestionIds) ? candidate.lastSessionQuestionIds : [],
      revision: Number.isInteger(candidate.revision) && Number(candidate.revision) >= 0 ? Number(candidate.revision) : 0,
      updatedAt: typeof candidate.updatedAt === 'string'
        ? candidate.updatedAt
        : typeof candidate.lastOpenedAt === 'string' ? candidate.lastOpenedAt : base.updatedAt,
      lastOpenedAt: typeof candidate.lastOpenedAt === 'string' ? candidate.lastOpenedAt : base.lastOpenedAt,
      schemaVersion: '0.6.0',
    };
  }

  function freshness(raw: unknown): [number, number] {
    if (!raw || typeof raw !== 'object') return [-1, -1];
    const candidate = raw as Partial<AppState>;
    const revision = Number.isInteger(candidate.revision) ? Number(candidate.revision) : 0;
    const timestamp = Date.parse(candidate.updatedAt ?? candidate.lastOpenedAt ?? '') || 0;
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
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
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
    state.lastOpenedAt = nowIso();
    return state;
  }

  export async function saveState(state: AppState): Promise<void> {
    const timestamp = nowIso();
    state.revision = Math.max(0, Number(state.revision) || 0) + 1;
    state.updatedAt = timestamp;
    state.lastOpenedAt = timestamp;
    const serialized = JSON.stringify(state);
    localStorage.setItem(FALLBACK_KEY, serialized);
    const snapshot = JSON.parse(serialized) as AppState;
    const write = writeQueue.catch(() => undefined).then(() => writeIndexedDb(snapshot));
    writeQueue = write.catch(() => undefined);
    try {
      await write;
    } catch (error) {
      console.warn('IndexedDB save failed. State is preserved in localStorage.', error);
    }
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
    if (!raw || typeof raw !== 'object') throw new Error('JSON object is required.');
    const candidate = raw as Partial<AppState>;
    if (candidate.history && !Array.isArray(candidate.history)) throw new Error('history must be an array.');
    if (candidate.mockHistory && !Array.isArray(candidate.mockHistory)) throw new Error('mockHistory must be an array.');
    return mergeState(candidate);
  }
}
