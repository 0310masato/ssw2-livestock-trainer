namespace LivestockApp {
  export function createMockDraft(state: AppState, durationMinutes = 60): MockDraft {
    const started = new Date();
    return {
      id: uid('mock'),
      questionIds: buildMockQueue(state, 50),
      answers: {},
      startedAt: started.toISOString(),
      deadlineAt: addMinutesIso(started, durationMinutes),
      currentIndex: 0,
    };
  }

  export function mockSecondsRemaining(draft: MockDraft, at = new Date()): number {
    return Math.max(0, Math.ceil((new Date(draft.deadlineAt).getTime() - at.getTime()) / 1000));
  }

  export function gradeMock(draft: MockDraft, finishedAt = new Date()): MockResult {
    let correct = 0;
    let unanswered = 0;
    const categoryMap: Record<string, { total: number; correct: number; accuracy: number }> = {};

    for (const questionId of draft.questionIds) {
      const question = questionById(questionId);
      if (!question) continue;
      const answer = draft.answers[questionId];
      const isCorrect = answer === question.correctChoiceId;
      if (!answer) unanswered += 1;
      if (isCorrect) correct += 1;
      const category = categoryMap[question.category] ?? { total: 0, correct: 0, accuracy: 0 };
      category.total += 1;
      if (isCorrect) category.correct += 1;
      categoryMap[question.category] = category;
    }

    for (const category of Object.values(categoryMap)) {
      category.accuracy = category.total ? Math.round((category.correct / category.total) * 100) : 0;
    }

    const total = draft.questionIds.length;
    return {
      id: draft.id,
      total,
      correct,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
      unanswered,
      startedAt: draft.startedAt,
      finishedAt: finishedAt.toISOString(),
      elapsedMs: Math.max(0, finishedAt.getTime() - new Date(draft.startedAt).getTime()),
      categoryResults: categoryMap,
    };
  }
}
