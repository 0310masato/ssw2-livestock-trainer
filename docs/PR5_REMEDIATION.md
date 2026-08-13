# PR #5 独立レビュー是正記録

## 目的と境界

この文書は、Draft PR #5 の独立レビューで報告された `REV-001`〜`REV-016` の是正状況を追跡する。対象は代表16問の人手レビューを開始する前の技術的な安全性・互換性・検証整合であり、問題内容、正答、出典、review gateの人手判定は変更しない。

- 残り64問を問題schema `0.4.0` へ移行しない。
- 問題を `approved` に昇格しない。
- ふりがな・インドネシア語・教材性・answer leakを人手確認済みとして扱わない。
- Draft解除、merge、Pages公開はこの是正に含めない。

## 指摘対応表

| ID | 状態 | 主な変更場所 | 是正内容 | 回帰証拠 |
|---|---|---|---|---|
| REV-001 | 対応・自動検証済み | `src/learning-components.ts` | Level 3の全選択肢へ実値入りの同一easyJa支援領域を生成する | 代表16問×Level 0〜3、明示4問のDOM検査 |
| REV-002 | 対応・自動検証済み | `e2e/pedagogy_smoke.py` | 全代表問題を走査し、DOM階層・class・ARIA・data属性、hidden回答情報、正答IDを検査する | 16問×4 Level＝64ケース |
| REV-003 | 対応・自動検証済み | `src/engine.ts`, `src/views.ts`, `src/pedagogy.ts` | guided/adaptive/japanese_onlyのLevel決定規則を単一化した | mode・mastery・Levelの単体/E2E |
| REV-004 | Issueへ延期 | [Issue #6](https://github.com/0310masato/ssw2-livestock-trainer/issues/6) | 複数タブのlost updateはPR #5で実装せず、Alphaを単一タブ利用に限定 | Issueの2ページE2E受入条件 |
| REV-005 | 対応・自動検証済み | `src/app.ts`, `e2e/smoke.py` | 模試timerを表示中のmock sessionだけで動かす | 模試中断→通常学習→期限→模試再開 |
| REV-006 | 対応・自動検証済み | `src/storage.ts`, `src/app.ts` | import stateを明示検証・再構成し、20 MiB上限を含め不正入力を全体拒否する | HTML相当、未知key、過大配列、無効ID/日時/数値 |
| REV-007 | 対応・自動検証済み | `src/utils.ts` | CSVの式開始文字をquote処理とは別に無害化する | `=`, `+`, `-`, `@`, tab/CR/LFテスト |
| REV-008 | 対応・自動検証済み | `src/utils.ts`, `public/question.schema.json`, `scripts/validate_content.py` | approved条件をSchema・validator・runtimeで共通化した | 各gateと不正日時のnegative fixture |
| REV-009 | 対応・自動検証済み | `scripts/generate_data.mjs` | `src/data.ts`を決定的に全生成し、意味的TypeScript検証後だけatomic置換する | 境界文字列、不正JSON、非配列、重複、失敗時不変 |
| REV-010 | 対応・自動検証済み | `scripts/generate_data.mjs` | COVERAGEを正本JSONから毎回全再計算する | 件数・カテゴリ・status変更fixture |
| REV-011 | 対応・自動検証済み | `scripts/validate_content.py`, `package.json` | 構造検証とPDF必須検証を分離し、明示source dirもfail-closedにした | 未設定SKIP、必須不足FAIL、正常・hash・page・50 anchor |
| REV-012 | 対応・自動検証済み | `scripts/build.mjs` | このアプリの旧cacheだけ削除し他アプリcacheを保持する | 実Service Worker cache検査 |
| REV-013 | 対応・自動検証済み | `e2e/http_pwa_smoke.py`, CI | localhostでSW・CacheStorage・実IndexedDB・offline更新を検査する | `page.goto` HTTP E2E |
| REV-014 | 対応・自動検証済み | CI, README, review docs | public repositoryの期限付き一時artifactとして表記を統一した | artifact名・保持期間・非正式配布表示 |
| REV-015 | 対応・自動検証済み | `src/storage.ts`, settings UI | 旧表示checkboxをmigration入力だけにし、mode/Levelを正本化した | 設定UI→IDB→reload→新session E2E |
| REV-016 | 対応・自動検証済み | `.github/workflows/pages.yml`, `.github/workflows/publish-gh-pages-branch.yml` | すべてのPages公開経路を手動実行だけに限定した | workflow trigger静的検査 |

## 人が再確認する事項

技術的な自動検査に合格しても、代表16問の次のgateはpendingのまま人が確認する。

- 日本語・ふりがな
- 日本語学習教材としての妥当性
- インドネシア語ネイティブ品質
- 内容によるanswer leak
- 実機操作
- 利用者最終承認

この是正完了後も、すぐに人手レビューや実機利用テストを開始せず、変更後HEADに対する独立再レビューを先に行う。

## 既知の制約

端末内stateは単一タブ内の連続保存順を保つが、複数タブ・複数ウィンドウ・ブラウザ版とインストール版を同時に開いた競合更新はまだ統合しない。Issue #6が完了するまで、学習履歴を記録する際は一つのタブまたはウィンドウだけを使用する。
