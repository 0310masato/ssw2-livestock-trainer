namespace LivestockApp {
  export type LanguageKey = 'ja' | 'easyJa' | 'id';
  export type UiLanguage = 'ja' | 'id';
  export type SupportLevel = 0 | 1 | 2 | 3;
  export type StudySupportMode = 'guided' | 'adaptive' | 'japanese_only';
  export type QuestionPatternKey = 'most_appropriate' | 'incorrect' | 'correct' | 'calculation' | 'procedure' | 'which';
  export type JapaneseLanguagePointKey =
    | 'most_appropriate'
    | 'incorrect'
    | 'inappropriate'
    | 'prohibited'
    | 'always'
    | 'except'
    | 'in_principle'
    | 'select_all'
    | 'before_after'
    | 'purpose'
    | 'procedure_first'
    | 'not_included'
    | 'condition'
    | 'at_least'
    | 'calculation'
    | 'correct_statement'
    | 'according_to_source'
    | 'not_listed'
    | 'only'
    | 'most_of'
    | 'which';
  export type ReviewCheckState = 'pending' | 'pass' | 'fail';
  export type QuestionStatus = 'draft' | 'candidate' | 'source_checked' | 'language_checked' | 'approved' | 'suspended' | 'retired';
  export type ErrorReason = 'knowledge' | 'japanese' | 'misread' | 'calculation' | 'time' | 'unsure';
  export type ReviewMark = '未確認' | '承認候補' | '要修正' | '保留';
  export type SessionKind = 'daily' | 'poultry' | 'all' | 'due' | 'category' | 'mock';
  export type ViewName = 'home' | 'study' | 'glossary' | 'results' | 'manager' | 'review' | 'settings';

  export interface RubySegment {
    text: string;
    reading?: string;
  }

  export interface LocalizedText {
    ja: string;
    easyJa: string;
    id: string;
    rubyJa: RubySegment[];
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
    printedPageLabel: string | null;
    section: string;
    locatorNote?: string;
    verificationAnchors?: string[];
  }

  export interface QuestionReview {
    content: ReviewCheckState;
    languageJa: ReviewCheckState;
    languageId: ReviewCheckState | 'pending_native_review';
    legalRights: ReviewCheckState;
    reviewerType: string;
    reviewedAt: string | null;
    approvalByUser: 'pending' | 'approved' | 'rejected';
    notes: string;
    furigana?: ReviewCheckState;
    japaneseLearning?: ReviewCheckState;
    answerLeak?: ReviewCheckState;
  }

  export interface Question {
    id: string;
    schemaVersion: '0.3.0' | '0.4.0';
    status: QuestionStatus;
    prototypeOnly: boolean;
    category: string;
    topic: string;
    difficulty: number;
    type: 'single_choice' | 'true_false' | 'multi_select' | 'ordering' | 'calculation' | 'visual_judgement';
    sourceFactIds: string[];
    question: LocalizedText;
    choices: Choice[];
    correctChoiceId: string;
    explanation: LocalizedText;
    /** @deprecated Use localized choiceRationales. Kept optional for v0.3 data compatibility. */
    choiceRationalesJa?: Record<string, string>;
    choiceRationales: Record<string, LocalizedText>;
    learningSupport: {
      questionPattern: QuestionPatternKey;
      keyTermIds: string[];
      lessonObjective: LocalizedText;
      memoryPoint: LocalizedText;
      languagePointKeys?: JapaneseLanguagePointKey[];
      intentOverride?: LocalizedText;
    };
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
    openedKeywords: boolean;
    openedQuestionTranslation: boolean;
    openedChoiceTranslations: boolean;
    openedAnswerIndonesian: boolean;
    supportLevel: SupportLevel;
    knowledgeGap: boolean;
    japaneseGap: boolean;
    retryOfHistoryId: string | null;
    isRetryWithoutSupport: boolean;
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
    uiLanguage: UiLanguage;
    studySupportMode: StudySupportMode;
    showVocabulary: boolean;
    showQuestionPattern: boolean;
    preferredSupportLevel: SupportLevel;
    dailyQuestionCount: number;
    reviewContentEnabled: boolean;
  }

  export interface AppState {
    schemaVersion: string;
    revision: number;
    updatedAt: string;
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
    supportLevel: SupportLevel;
    easyJapaneseVisible: boolean;
    indonesianVisible: boolean;
    furiganaVisible: boolean;
    keywordsVisible: boolean;
    choiceTranslationsVisible: boolean;
    answerIndonesianVisible: boolean;
    supportUsage: SupportUsage;
    retryOfHistoryId: string | null;
    isRetryWithoutSupport: boolean;
    confidence: 'sure' | 'unsure' | null;
    pendingReason: ErrorReason | null;
    completed: boolean;
  }

  export interface SupportUsage {
    furiganaUsed: boolean;
    easyJapaneseUsed: boolean;
    keywordsOpened: boolean;
    questionTranslationOpened: boolean;
    choiceTranslationsOpened: boolean;
    answerIndonesianOpened: boolean;
  }

  export interface ResolvedSupportPolicy {
    level: SupportLevel;
    showFuriganaInitially: boolean;
    showEasyJapaneseInitially: boolean;
    showKeywordsInitially: boolean;
    showIntent: boolean;
    compactKeywordHints: boolean;
    showQuestionTranslationInitially: boolean;
    allowQuestionTranslation: boolean;
    showChoiceTranslationsInitially: boolean;
    allowChoiceTranslations: boolean;
    showAnswerIndonesianInitially: boolean;
    allowAnswerIndonesian: boolean;
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
