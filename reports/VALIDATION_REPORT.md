# Alpha v0.5 Content Validation Report

**Overall: PASS**

> このファイルは再生成可能な正本サマリーです。GitHub Actionsの実行ログやartifact一覧そのものではありません。

> PASSは構造・参照・権利フラグ・この実行範囲で利用可能な自動検査が通ったことを示します。公開用approvedを意味しません。

## Verification scope

- Current report scope: `local-controlled-source-review`
- Official PDFs available in this run: yes
- GitHub PR CI: リポジトリ内のデータ同期、Schema、型、単体テスト、E2E、ビルドを検査します。公式PDFをGitへ保存しないため、標準CIではPDFバイナリのSHA-256、ページ数、本文アンカー照合をSKIPします。
- Controlled local review: `SSW2_SOURCE_DIR` に公式PDF 2冊を配置した場合だけ、PDFのSHA-256、ページ数、本文アンカー照合を追加実行します。

## Counts

- Knowledge cards: 100
- Questions: 80
- Glossary: 63
- Original SVG assets: 5

## Checks

- **PASS** — JSON Schema validation: 0 error(s)
- **PASS** — Knowledge-card count: 100 / 100
- **PASS** — Alpha-question count: 80 / 80
- **PASS** — Glossary count: 63 / 63
- **PASS** — Unique question IDs: 
- **PASS** — Unique fact IDs: 
- **PASS** — Unique glossary IDs: 
- **PASS** — All question-to-fact references resolve: []
- **PASS** — Every correctChoiceId exists: []
- **PASS** — All source IDs and ledger page ranges resolve: []
- **PASS** — Rights flags prohibit official/competitor reuse: []
- **PASS** — All questions remain source_checked (not auto-approved): []
- **PASS** — All multilingual fields are populated: []
- **PASS** — All questions include ruby and pedagogical support: []
- **PASS** — All declared original visual assets exist: []
- **PASS** — Representative question-schema 0.4 pilot count: 16 / 16
- **PASS** — Review checklist has one row for each of the 80 questions: rows=80, duplicates=[], idDiff=[]
- **PASS** — Review checklist canonical fields match question data: []
- **PASS** — Pilot review checklist exposes four 4-question sets, source metadata, device status, and correction notes: sets={'A': 4, 'C': 4, 'D': 4, 'B': 4}, nonpilotSets=[], metadata=[]
- **PASS** — Pilot required translations are populated: []
- **PASS** — Pilot kanji ruby segments have readings: []
- **PASS** — Pilot correct-answer reasons are populated: []
- **PASS** — Pilot wrong-choice reasons are populated: []
- **PASS** — Pilot wrong-choice reasons are choice-specific: []
- **PASS** — Pilot questions have 1 to 5 key terms: []
- **PASS** — Pilot questions identify at least one Japanese language point: []
- **PASS** — Pilot question and choice translations retain Japanese term annotations and readings for kanji: []
- **PASS** — Pilot questions identify source title, edition, page, and section: []
- **PASS** — Pilot review gates are explicit: []
- **PASS** — Official-source hashes and page counts match ledger: []
- **PASS** — Automated PDF anchor verification: 50/50 anchored facts passed; 50 legacy facts retain manual page references
- **PASS** — No exact duplicate question wording: []
- **PASS** — Near-duplicate review queue: 0 pair(s) at similarity >= 0.92
- **PASS (warning)** — Pilot native-Indonesian review queue: 16 / 16 pilot question(s) remain outside approved until languageId=pass

## Coverage

- 乳用牛: 8問
- 安全衛生: 15問
- 採卵鶏: 10問
- 畜産共通: 4問
- 肉用牛: 7問
- 肉用鶏: 19問
- 豚: 15問
- 軽種馬: 1問
- 養蜂: 1問

## Approval Gate

- source_checked: 80
- approved: 0
- インドネシア語ネイティブ確認: 0/80
- 代表16問の review.languageId 未確認: 16
- 代表16問の review.furigana 未確認: 16
- 代表16問の review.japaneseLearning 未確認: 16
- 代表16問の review.answerLeak 未確認: 16
- 代表16問の review.approvalByUser 未確認: 16
- 代表16問の device_review 未確認: 16
- 代表16問の未確認ゲート記録合計: 96
- 残り: 代表16問の人手レビュー、実機テスト、マサトさん最終承認
