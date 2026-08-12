namespace LivestockApp {
  export type LanguageKey = 'ja' | 'easyJa' | 'id';
  export type QuestionStatus = 'draft' | 'candidate' | 'source_checked' | 'language_checked' | 'approved' | 'suspended' | 'retired';
  export type ErrorReason = 'knowledge' | 'japanese' | 'misread' | 'calculation' | 'time' | 'unsure';
  export type ReviewMark = '未確認' | '承認候補' | '要修正' | '保留';
  export type SessionKind = 'daily' | 'poultry' | 'all' | 'due' | 'category' | 'mock';
  export type ViewName = 'home' | 'study' | 'glossary' | 'results' | 'manager' | 'review' | 'settings';

  export interface LocalizedText {
    ja: string;
    easyJa: string;
    id: string;
  }

  export interface Choice {
    id: string;
    text: LocalizedText;
  }

  export interface SourceRef {
    sourceId: string;
    documentId: string;
    documentTitle: string;
    edition: string;
    pdfPage: number;
    printedPage: number | null;
    printedPageLabel: string;
    section: string;
    locatorNote?: string;
    verificationAnchors?: string[];
  }

  export interface QuestionReview {
    content: string;
    languageJa: string;
    languageId: string;
    legalRights: string;
    reviewerType: string;
    reviewedAt: string;
    approvalByUser: string;
    notes: string;
  }

  export interface Question {
    id: string;
    schemaVersion: string;
    status: QuestionStatus;
    prototypeOnly: boolean;
    category: string;
    topic: string;
    difficulty: number;
    type: 'single_choice';
    sourceFactIds: string[];
    question: LocalizedText;
    choices: Choice[];
    correctChoiceId: string;
    explanation: LocalizedText;
    choiceRationalesJa: Record<string, string>;
    source: SourceRef;
    tags: string[];
    timeSensitive: boolean;
    rights: {
      originalWording: boolean;
      usesOfficialImage: boolean;
      usesCompetitorContent: boolean;
      requiresHumanApproval: boolean;
      assetLicense?: string | null;
    };
    review: QuestionReview;
    errorReasonOptions: ErrorReason[];
    visual?: { assetId: string; altJa: string; rights: string };
  }

  export interface GlossaryItem {
    id: string;
    termJa: string;
    reading: string;
    easyJa: string;
    idn: string;
  }

  export interface HistoryEntry {
    id: string;
    sessionId: string;
    questionId: string;
    factIds: string[];
    category: string;
    topic: string;
    sessionKind: SessionKind;
    selectedChoiceId: string | null;
    correct: boolean;
    elapsedMs: number;
    usedEasyJapanese: boolean;
    usedIndonesian: boolean;
    usedFurigana: boolean;
    supportLevel: number;
    reason: ErrorReason | null;
    confidence: 'sure' | 'unsure' | null;
    at: string;
  }

  export interface MasteryState {
    questionId: string;
    factIds: string[];
    stage: number;
    attempts: number;
    correct: number;
    dueAt: string;
    lastAnsweredAt: string;
    lastCorrect: boolean;
    lastSupportLevel: number;
  }

  export interface MockDraft {
    id: string;
    questionIds: string[];
    answers: Record<string, string>;
    startedAt: string;
    deadlineAt: string;
    currentIndex: number;
  }

  export interface MockResult {
    id: string;
    total: number;
    correct: number;
    accuracy: number;
    unanswered: number;
    startedAt: string;
    finishedAt: string;
    elapsedMs: number;
    categoryResults: Record<string, { total: number; correct: number; accuracy: number }>;
  }

  export interface ReviewRecord {
    status: ReviewMark;
    note: string;
    updatedAt: string;
  }

  export interface UserSettings {
    preferredSupportLevel: 0 | 1 | 2 | 3;
    automaticSupport: boolean;
    showFurigana: boolean;
    showEasyJapanese: boolean;
    showIndonesian: boolean;
    dailyQuestionCount: number;
    reviewContentEnabled: boolean;
  }

  export interface AppState {
    schemaVersion: string;
    history: HistoryEntry[];
    mastery: Record<string, MasteryState>;
    mockDraft: MockDraft | null;
    mockHistory: MockResult[];
    reviews: Record<string, ReviewRecord>;
    settings: UserSettings;
    lastSessionQuestionIds: string[];
    lastOpenedAt: string;
  }

  export interface SessionState {
    id: string;
    kind: SessionKind;
    questionIds: string[];
    index: number;
    selectedChoiceId: string | null;
    answered: boolean;
    startedQuestionAt: number;
    easyJapaneseVisible: boolean;
    indonesianVisible: boolean;
    furiganaVisible: boolean;
    confidence: 'sure' | 'unsure' | null;
    pendingReason: ErrorReason | null;
    completed: boolean;
  }

  export interface CategoryStats {
    category: string;
    answered: number;
    correct: number;
    accuracy: number | null;
    avgTimeSeconds: number | null;
    japaneseReasonRate: number | null;
  }

  export interface AppRuntime {
    view: ViewName;
    state: AppState;
    session: SessionState | null;
    selectedCategory: string | null;
    glossarySearch: string;
    glossaryFilter: string;
    reviewSearch: string;
    reviewStatus: 'all' | ReviewMark;
    reviewCategory: string;
    installPrompt: BeforeInstallPromptEvent | null;
    online: boolean;
    notice: string | null;
    lastMockResult: MockResult | null;
  }

  export interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }
}
