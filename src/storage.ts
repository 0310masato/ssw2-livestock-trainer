namespace LivestockApp {
  const DB_NAME = 'livestock-level2-trainer';
  const DB_VERSION = 1;
  const STORE_NAME = 'app';
  const STATE_KEY = 'state-v0.4';
  const FALLBACK_KEY = 'livestock2-state-v0.4';

  export function defaultState(): AppState {
    return {
      schemaVersion: '0.4.2',
      history: [],
      mastery: {},
      mockDraft: null,
      mockHistory: [],
      reviews: {},
      settings: {
        uiLanguage: 'id',
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

  function mergeState(raw: unknown): AppState {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const candidate = raw as Partial<AppState>;
    const candidateSettings = candidate.settings ?? {};
    const settings: UserSettings = {
      ...base.settings,
      ...candidateSettings,
      uiLanguage: candidateSettings.uiLanguage === 'ja' ? 'ja' : 'id',
    };
    return {
      ...base,
      ...candidate,
      history: Array.isArray(candidate.history) ? candidate.history : [],
      mastery: candidate.mastery && typeof candidate.mastery === 'object' ? candidate.mastery : {},
      mockDraft: candidate.mockDraft ?? null,
      mockHistory: Array.isArray(candidate.mockHistory) ? candidate.mockHistory : [],
      reviews: candidate.reviews && typeof candidate.reviews === 'object' ? candidate.reviews : {},
      settings,
      lastSessionQuestionIds: Array.isArray(candidate.lastSessionQuestionIds) ? candidate.lastSessionQuestionIds : [],
      lastOpenedAt: nowIso(),
      schemaVersion: '0.4.2',
    };
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
    try {
      const indexed = await readIndexedDb();
      if (indexed) return mergeState(indexed);
    } catch (error) {
      console.warn('IndexedDB load failed. Falling back to localStorage.', error);
    }

    try {
      const text = localStorage.getItem(FALLBACK_KEY);
      if (text) return mergeState(JSON.parse(text));
    } catch (error) {
      console.warn('Fallback state load failed.', error);
    }
    return defaultState();
  }

  export async function saveState(state: AppState): Promise<void> {
    state.lastOpenedAt = nowIso();
    try {
      await writeIndexedDb(state);
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('IndexedDB save failed. Using localStorage.', error);
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
    }
  }

  export async function clearProgressKeepReviews(state: AppState): Promise<AppState> {
    const next = defaultState();
    next.reviews = state.reviews;
    next.settings = state.settings;
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
