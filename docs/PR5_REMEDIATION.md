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
| REV-001 | P0再是正・自動検証済み | `src/learning-components.ts` | 選択肢のeasyJaはレビュー用データとして保持し、学習者向け画面では回答前後とも生成しない | 代表16問×Level 0〜3の回答前64件・回答後64件でchoice easyJaがDOMにないことを検査 |
| REV-002 | P0再是正・自動検証済み | `e2e/pedagogy_smoke.py` | placeholder正規化だけに依存せず、選択肢の内容差と正答位置の相関、および回答前後のDOM非搭載を検査する | 代表16問×4 Levelの回答前後、明示4問、レビュー画面の回帰検査 |
| REV-003 | 対応・自動検証済み | `src/engine.ts`, `src/views.ts`, `src/pedagogy.ts` | guided/adaptive/japanese_onlyのLevel決定規則を単一化した | mode・mastery・Levelの単体/E2E |
| REV-004 | Issueへ延期 | [Issue #6](https://github.com/0310masato/ssw2-livestock-trainer/issues/6) | 複数タブのlost updateはPR #5で実装せず、Alphaを単一タブ利用に限定 | Issueの2ページE2E受入条件 |
| REV-005 | 対応・自動検証済み | `src/app.ts`, `e2e/smoke.py` | 模試timerを表示中のmock sessionだけで動かす | 模試中断→通常学習→期限→模試再開 |
| REV-006 | 対応・自動検証済み | `src/storage.ts`, `src/app.ts` | import stateを明示検証・再構成し、20 MiB上限を含め不正入力を全体拒否する | HTML相当、未知key、過大配列、無効ID/日時/数値 |
| REV-007 | 対応・自動検証済み | `src/utils.ts` | CSVの式開始文字をquote処理とは別に無害化する | `=`, `+`, `-`, `@`, tab/CR/LFテスト |
| REV-008 | 対応・自動検証済み | `src/utils.ts`, `public/question.schema.json`, `scripts/validate_content.py` | approved条件をSchema・validator・runtimeで共通化した | 各gateと不正日時のnegative fixture |
| REV-009 | 対応・自動検証済み | `scripts/generate_data.mjs` | `src/data.ts`を決定的に全生成し、意味的TypeScript検証後だけatomic置換する | 境界文字列、不正JSON、非配列、重複、失敗時不変 |
| REV-010 | 対応・自動検証済み | `scripts/generate_data.mjs` | COVERAGEを正本JSONから毎回全再計算する | 件数・カテゴリ・status変更fixture |
| REV-011 | 対応・自動検証済み | `scripts/validate_content.py`, `package.json` | 構造検証とPDF必須検証を分離し、明示source dirもfail-closedにした | 未設定SKIP、必須不足FAIL、正常・hash・page・50 anchor |
| REV-012 | P0再是正・自動検証済み | `scripts/build.mjs` | App Shell内容からbuild IDを算出し、versioned URLへ保存する。このアプリの旧cacheだけ削除し他アプリcacheを保持する | build ID単体検査、実Service Worker cache検査 |
| REV-013 | P0再是正・自動検証済み | `e2e/http_pwa_smoke.py`, CI | localhostで実際の旧HEADから新buildへ同一origin更新し、SW・CacheStorage・実IndexedDB・offline起動を検査する | `a6533c3...`→現buildの`page.goto` HTTP E2E |
| REV-014 | 対応・自動検証済み | CI, README, review docs | public repositoryの期限付き一時artifactとして表記を統一した | artifact名・保持期間・非正式配布表示 |
| REV-015 | 対応・自動検証済み | `src/storage.ts`, settings UI | 旧表示checkboxをmigration入力だけにし、mode/Levelを正本化した | 設定UI→IDB→reload→新session E2E |
| REV-016 | 対応・自動検証済み | `.github/workflows/pages.yml`, `.github/workflows/publish-gh-pages-branch.yml` | すべてのPages公開経路を手動実行だけに限定した | workflow trigger静的検査 |

## P0再是正: 選択肢easyJaによる正答推測

Phase 0の独立監査で、Level 3に表示していた選択肢の `easyJa` と `ja` の一致・相違パターンが、次の4問で正答位置だけを識別し得ることを確認した。

- `q045`: 正答dだけ `easyJa === ja`
- `q055`: 正答aだけ `easyJa === ja`
- `q078`: 正答dだけ `easyJa !== ja`
- `q079`: 正答aだけ `easyJa === ja`

DOMのclassや支援領域を均一化しても、表示文字列の言い換え有無、長さ、具体性、自然さと正答が相関すれば内容漏えいは残る。従来の回帰検査はchoice固有文字列をplaceholderへ置換してからDOM署名を比較していたため、この相関を検出できなかった。

PR #5の技術的な境界修正は、選択肢の `easyJa` を学習者向け画面で回答前後とも無効にすることである。フィールドは削除せず、人による原文比較と将来の修正文案検討にだけ使用する。4問の文案変更や他12問の意味品質判定は、この技術修正で完了扱いにしない。answer leakと日本語教材性の人手ゲートを維持し、人が修正文案を確認した後の別PRで問題JSONと生成物を同期し、代表16問全体の回帰を実行する。

回帰検査では、代表16問×Level 0〜3について回答前64件・回答後64件を走査し、選択肢のeasyJa専用要素・class・ARIA・data属性・許可要素以外の残余DOMがないことを確認する。問題文と正答解説のeasyJa、選択肢の日本語・ruby・Level 3のインドネシア語訳は維持する。`ja === easyJa` の配列と正答位置の相関はレポートへ残し、`q045`、`q055`、`q078`、`q079` を既知の人手レビュー対象として列挙する。

## P0再是正: 旧PWA cacheからの漏えいコード継続

独立再監査で、fresh buildでは選択肢easyJaが消えていても、固定cache名を共有する旧PWAから同一originで更新すると、旧`app.js`がcache-firstで継続配信されることを確認した。固定値の手動更新を廃止し、App Shellの相対パスと内容をSHA-256へ入力した先頭16桁をbuild IDとする。`app.js`と`styles.css`のURL、Service Workerのcache名、APP_SHELLを同じbuild IDで区別し、installではHTTP cacheを再利用せず必須responseを検査する。

正式な回帰では旧HEAD `a6533c3a4dd194f48cc5186ed061b06b06019e6f`を別buildとして作成し、同じoriginの配信rootを新buildへ切り替える。旧漏えいfixtureの存在、新buildへの切替、旧owned cache削除、foreign cache保持、offline起動、およびproduction経路の回答前64件・回答後64件を一続きで検査する。更新workerが見つかっても学習途中を自動reloadせず、現在画面を維持して次回reloadで切り替える。

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
