# Alpha v0.5 Content Validation Report

**Overall: PASS**

> PASSは構造・参照・権利フラグ・自動検査が通ったことを示します。公開用approvedを意味しません。

## Counts

- Knowledge cards: 100
- Questions: 80
- Glossary: 60
- Original SVG assets: 5

## Checks

- **PASS** — JSON Schema validation: 0 error(s)
- **PASS** — Knowledge-card count: 100 / 100
- **PASS** — Alpha-question count: 80 / 80
- **PASS** — Glossary count: 60 / 60
- **PASS** — Unique question IDs: 
- **PASS** — Unique fact IDs: 
- **PASS** — Unique glossary IDs: 
- **PASS** — All question-to-fact references resolve: []
- **PASS** — Every correctChoiceId exists: []
- **PASS** — All source documents and PDF pages exist: []
- **PASS** — Rights flags prohibit official/competitor reuse: []
- **PASS** — All questions remain source_checked (not auto-approved): []
- **PASS** — All multilingual fields are populated: []
- **PASS** — All questions include ruby and pedagogical support: []
- **PASS** — All declared original visual assets exist: []
- **PASS (warning)** — Official-source binary verification: SKIPPED: official PDFs are not mounted in this CI environment; source IDs and page ranges were checked against source-ledger.json.
- **PASS (warning)** — Automated PDF anchor verification: SKIPPED: 50 anchored facts require the mounted official PDFs. Run npm run validate:content in the controlled source-review environment for full verification.
- **PASS** — No exact duplicate question wording: []
- **PASS** — Near-duplicate review queue: 0 pair(s) at similarity >= 0.92

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
- 残り: ネイティブ確認、利用者操作テスト、マサトさん最終承認
