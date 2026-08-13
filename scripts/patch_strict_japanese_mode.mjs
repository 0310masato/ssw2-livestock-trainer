import { readFile, writeFile } from 'node:fs/promises';

async function update(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No change made to ${path}`);
  await writeFile(path, after, 'utf8');
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing ${label}`);
  return source.replace(search, replacement);
}

await update('src/pedagogy.ts', (source) => {
  const helperMarker = '  export function renderGuidedQuestionCard(\n';
  const helpers = `  function renderJapaneseOnlyReasonPanel(selected: ErrorReason | null): string {
    return \`<section class="reason-panel" data-no-ui-translation="true">
      <h2>なぜ間違えましたか？</h2>
      <p>次の出題を調整するために1つ選んでください。</p>
      <div class="reason-grid">\${(Object.keys(ERROR_REASON_LABELS) as ErrorReason[]).map((reason) => \`
        <button class="reason-button \${selected === reason ? 'active' : ''}" data-reason="\${reason}">
          <span lang="ja">\${escapeHtml(ERROR_REASON_LABELS[reason])}</span>
        </button>\`).join('')}
      </div>
    </section>\`;
  }

  function renderJapaneseOnlyQuestionCard(
    question: Question,
    session: SessionState,
    settings: UserSettings,
    correct: boolean,
    supportLevel: number,
    total: number,
  ): string {
    const correctChoice = question.choices.find((choice) => choice.id === question.correctChoiceId);
    return \`
      <article class="question-card japanese-only-card" data-no-ui-translation="true">
        <div class="question-number">問題 \${session.index + 1} / \${total} ・ 支援レベル \${supportLevel} ・ \${escapeHtml(question.status)}</div>
        <h1 class="question-text" lang="ja">\${escapeHtml(question.question.ja)}</h1>
        \${question.visual ? \`<figure class="question-visual"><img src="\${assetPath(question.visual.assetId)}" alt="\${escapeHtml(question.visual.altJa)}"><figcaption>独自作成の学習用模式図</figcaption></figure>\` : ''}
        <div class="confidence-row" aria-label="回答前の自信">
          <span>自信：</span>
          <button class="confidence-button \${session.confidence === 'sure' ? 'active' : ''}" data-confidence="sure">分かる</button>
          <button class="confidence-button \${session.confidence === 'unsure' ? 'active' : ''}" data-confidence="unsure">迷っている</button>
        </div>
        <div class="choice-list">
          \${question.choices.map((choice) => renderChoice(choice, question, session, settings)).join('')}
        </div>
        \${!session.answered ? \`<button class="btn primary full" data-answer \${session.selectedChoiceId ? '' : 'disabled'}>回答する</button>\` : \`
          <section class="answer-panel \${correct ? 'correct' : 'wrong'}">
            <h2>\${correct ? '正解です' : '不正解です'}</h2>
            <p><strong>正解：</strong>\${escapeHtml(correctChoice?.text.ja ?? '')}</p>
            <p>\${escapeHtml(question.explanation.ja)}</p>
            <div class="source-citation"><strong>参照：</strong>\${escapeHtml(question.source.documentTitle)}／\${escapeHtml(question.source.edition)}／PDF \${question.source.pdfPage}／冊子 \${escapeHtml(question.source.printedPageLabel || '-')}／\${escapeHtml(question.source.section)}</div>
          </section>
          \${!correct ? renderJapaneseOnlyReasonPanel(session.pendingReason) : ''}
          <button class="btn primary full" data-next \${!correct && !session.pendingReason ? 'disabled' : ''}>\${session.index + 1 >= total ? '結果を見る' : '次の問題'}</button>
        \`}
      </article>\`;
  }

`;
  source = replaceRequired(source, helperMarker, `${helpers}${helperMarker}`, 'guided renderer marker');
  source = replaceRequired(
    source,
    `  ): string {
    const pattern = patternHelp(question);`,
    `  ): string {
    if (!settings.showFurigana && !settings.showEasyJapanese && !settings.showIndonesian) {
      return renderJapaneseOnlyQuestionCard(question, session, settings, correct, supportLevel, total);
    }
    const pattern = patternHelp(question);`,
    'guided renderer start',
  );
  return source;
});

await update('e2e/pedagogy_smoke.py', (source) => {
  const marker = "    record(checks, 'no_runtime_errors', not page_errors)\n";
  const addition = `    page.evaluate("""() => {
      const session = LivestockApp.runtime.session;
      LivestockApp.runtime.state.settings.studySupportMode = 'japanese_only';
      session.selectedChoiceId = null;
      session.answered = false;
      session.pendingReason = null;
      session.confidence = null;
      session.furiganaVisible = false;
      session.easyJapaneseVisible = false;
      session.indonesianVisible = false;
      LivestockApp.render();
    }""")
    page.wait_for_timeout(150)
    japanese_card = page.locator('.japanese-only-card')
    record(checks, 'japanese_only_card', japanese_card.count() == 1)
    record(checks, 'japanese_only_has_no_indonesian_content', japanese_card.locator('[lang="id"]').count() == 0)
    record(checks, 'japanese_only_has_no_learning_scaffold', page.locator('.lesson-vocabulary, .question-pattern-guide, .support-box').count() == 0)

    record(checks, 'no_runtime_errors', not page_errors)
`;
  return replaceRequired(source, marker, addition, 'pedagogy browser final check');
});

await update('tests/pwa.test.mjs', (source) => replaceRequired(
  source,
  "  assert.match(app, /studySupportMode/);",
  "  assert.match(app, /studySupportMode/);\n  assert.match(app, /japanese-only-card/);\n  assert.match(app, /renderJapaneseOnlyQuestionCard/);",
  'compiled pedagogy assertions',
));

await update('CHANGELOG.md', (source) => source.includes('日本語のみモードでは学習補助を完全に非表示')
  ? source
  : `${source.trimEnd()}\n- 日本語のみモードでは、インドネシア語・ふりがな・語彙カード・問題文解説を完全に非表示\n`);
