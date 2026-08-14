# PR #5 独立レビュー是正記録

## 目的と境界

この文書は、Draft PR #5 の独立レビューで報告された `REV-001`〜`REV-016` と、`READY_FOR_HUMAN_REVIEW` 後に見つかった非阻害P2の是正状況を追跡する。対象は人手内容レビュー、模試スマホテスト、将来のmerge・PWA配布に必要な技術的安全性・互換性・検証整合であり、問題内容、正答、出典、review gateの人手判定は変更しない。

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
| REV-005 | P2境界再是正・自動検証済み | `src/app.ts`, `e2e/smoke.py` | timerの残時間を一度だけ判定し、deadline直前から期限超過へ跨いでも採点またはticker登録のどちらかを必ず行う | 制御時計のdeadline−1ms→＋1ms、採点・履歴各1回、active ticker 0、結果・保存言語維持 |
| REV-006 | P2再是正・自動検証済み | `src/storage.ts`, `src/app.ts` | import stateを明示検証・再構成し、20 MiB上限を含め不正入力を全体拒否する。永続化成功後だけruntimeを置換する | 不正入力、片方の保存先失敗、両方失敗時rollback、revision境界、import競合 |
| REV-007 | 対応・自動検証済み | `src/utils.ts` | CSVの式開始文字をquote処理とは別に無害化する | `=`, `+`, `-`, `@`, tab/CR/LFテスト |
| REV-008 | 対応・自動検証済み | `src/utils.ts`, `public/question.schema.json`, `scripts/validate_content.py` | approved条件をSchema・validator・runtimeで共通化した | 各gateと不正日時のnegative fixture |
| REV-009 | 対応・自動検証済み | `scripts/generate_data.mjs` | `src/data.ts`を決定的に全生成し、意味的TypeScript検証後だけatomic置換する | 境界文字列、不正JSON、非配列、重複、失敗時不変 |
| REV-010 | 対応・自動検証済み | `scripts/generate_data.mjs` | COVERAGEを正本JSONから毎回全再計算する | 件数・カテゴリ・status変更fixture |
| REV-011 | 対応・自動検証済み | `scripts/validate_content.py`, `package.json` | 構造検証とPDF必須検証を分離し、明示source dirもfail-closedにした | 未設定SKIP、必須不足FAIL、正常・hash・page・50 anchor |
| REV-012 | P2追加是正・自動検証済み | `scripts/build.mjs`, `tests/pwa.test.mjs` | 未展開SW templateもbuild IDへ含め、失敗した新installは新cacheだけ削除する。fetch・navigation fallbackをowned cacheへ限定し、navigationのHTTP cacheを使用しない | SW-only変更ID、503 rollback、foreign同一URL拒否、同一URL offline起動 |
| REV-013 | P2追加是正・自動検証済み | `e2e/http_pwa_smoke.py`, CI | 通常distのHTTP production 64＋64と、二つの実旧HEADからの同一origin更新をCIで検査する | `a6533c3...`／`fd1f892...`→現build、通知・session・履歴・設定・cache・offline |
| REV-014 | 対応・自動検証済み | CI, README, review docs | public repositoryの期限付き一時artifactとして表記を統一した | artifact名・保持期間・非正式配布表示 |
| REV-015 | 対応・自動検証済み | `src/storage.ts`, settings UI | 旧表示checkboxをmigration入力だけにし、mode/Levelを正本化した | 設定UI→IDB→reload→新session E2E |
| REV-016 | feature branch対応済み・remote廃止はIssue管理 | `.github/workflows/pages.yml`, `docs/DEPLOYMENT.md`, [Issue #7](https://github.com/0310masato/ssw2-livestock-trainer/issues/7) | 将来経路は手動Actions Pagesへ統一したが、default branchとGitHub設定に残るlegacy public PagesはPR #5承認後に別作業で廃止する | 現HEADのPages run 0、remote Pages Source・workflow stateをread-only確認 |

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

独立再監査で、fresh buildでは選択肢easyJaが消えていても、固定cache名を共有する旧PWAから同一originで更新すると、旧`app.js`がcache-firstで継続配信されることを確認した。固定値の手動更新を廃止し、App Shellの相対パス・内容とbuild IDをplaceholderにした未展開Service Worker templateをSHA-256へ入力した先頭16桁をbuild IDとする。`app.js`と`styles.css`のURL、Service Workerのcache名、APP_SHELLを同じbuild IDで区別し、SWロジックだけの変更でも新IDにする。installではHTTP cacheを再利用せず必須responseを検査し、失敗時は新build cacheだけを削除する。fetchとnavigation fallbackはowned cacheだけを検索し、navigationのonline取得ではHTTP cacheを使用しない。

正式な回帰では旧HEAD `a6533c3a4dd194f48cc5186ed061b06b06019e6f`と直前版 `fd1f89293b0a2aad3e11ab46a9bda58da28981b4`を別buildとして作成し、各経路で同じorigin・port・browser profileの配信rootを新buildへ切り替える。旧漏えいfixture、旧state移行、設定・履歴、回答途中session、更新通知、手動reload、旧owned cache削除、foreign cache保持、offline起動、および通常distのproduction回答前64件・回答後64件を検査する。更新workerが見つかっても学習途中を自動reloadせず、現在画面を維持して手動reloadで切り替える。さらにSW-only変更へ必須asset 503を注入し、旧worker・旧cache・foreign cache・同一URL offline起動を保つことを検査する。

## P2再是正: 支援利用履歴と模試timer

`usedEasyJapanese` は、回答前に学習者へ実際に表示された問題文または重要語のやさしい日本語だけを記録する。Level 1の短い重要語ヒントを含み、一度表示した後に閉じても使用済みを維持する。選択肢のレビュー用`easyJa`と、回答後に初めて現れる解説は対象外である。Level 1の初期表示・非表示・開閉、Level 2の読みのみ、Level 3の問題文表示をproduction event経路で検査する。

期限切れ模試を再開したときは、同じ残時間判定の結果だけで採点または1秒interval登録を決める。最初の判定がdeadline直前でも、直後の別時計値で採点もticker登録も行われない状態を作らない。採点後はdraft、画面、session、結果を再確認し、履歴が一度だけ増え、active ticker 0の状態を2秒以上維持する。

## P2再是正: importのdurable saveとrevision境界

import元のrevisionは別端末の保存順序であるため、検証後に現在端末のrevisionへrebaseし、次のsafe integerを一度だけ採番する。localStorageとIndexedDBへ同一snapshotを保存し、少なくとも一方が成功した場合だけdurable saveを成功とする。両方が失敗した場合は候補state、現在のruntime、既存の永続stateを変更せず、成功通知も表示しない。

import開始時にはapp内のbarrierを同期的に設ける。開始前から実行中の保存を先に完了させた後、import候補の保存とruntime置換を一つの排他区間で行い、開始後に要求された通常保存は置換後のruntimeを保存する。これにより、遅延したIndexedDB書込み中に旧runtimeの保存要求が来ても、import済みstateを古い内容で上書きしない。同時に二つ目のimportを開始せず、処理中noticeを表示する。

回帰検査では、localStorageのみ失敗、IndexedDBのみ失敗、両方失敗、`Number.MAX_SAFE_INTEGER`境界、import後の連続保存とreloadに加え、遅延File読込・遅延IndexedDB・旧runtimeからの同時保存を組み合わせ、最終runtimeと両保存先がimport候補のままであることを確認する。productionで記録される小数ミリ秒の回答時間もexport/import可能な有限数として受理する。

## 人が再確認する事項

技術的な自動検査に合格しても、代表16問の次のgateはpendingのまま人が確認する。

- 日本語・ふりがな
- 日本語学習教材としての妥当性
- インドネシア語ネイティブ品質
- 内容によるanswer leak
- 実機操作
- 利用者最終承認

固定HEAD `cf2fd9dc6b5bdfe4464a97df1955736634f3d590` は独立再監査で `READY_FOR_HUMAN_REVIEW` と判定された。P0、P1、人手内容レビューを阻害するP2は0件であり、代表16問Set Aの人手内容レビューを開始できる。通常学習スマホテストは内容確認後に行えるが、模試スマホテストは下記timer境界是正を含む後続HEADのCI確認後に開始する。現時点は `approved` 0問、代表16問の6ゲートはすべてpending（合計96件）である。Draft解除、merge、Phase 6、`approved`昇格は引き続き別判断とする。

## READY_FOR_HUMAN_REVIEW後の技術安定化

独立監査で見つかった次の非阻害P2を、問題データとreview gateを変更せず後続commit群で是正する。

- `NEW-P2-TIMER-BOUNDARY`: deadline直前の二重時刻判定を単一化し、期限到達時の自動採点を一度だけ確定する。
- `REAUDIT-P2-005`: 未展開Service Worker templateをcontent build IDへ含め、失敗した新workerが旧active cacheを削除しないようにする。
- `REAUDIT-P2-006`: fetchとnavigation fallbackをowned cacheに限定し、同一originのforeign cacheと分離する。
- `TEST-PROD-PATH-002`: 通常`dist/index.html`のlocalhost HTTP経路で回答前64件・回答後64件をCI検査する。
- `TEST-PWA-UPDATE-001`: `a6533c3`と`fd1f892`の二つの旧版からの更新を実ブラウザで検査し、設定・履歴・回答中session・offline動作を維持する。

技術安定化HEADでは独立再監査を改めて行う。既存legacy public Pagesは使用せず、旧workflow廃止とGitHub Actions PagesへのSource切替を [Issue #7](https://github.com/0310masato/ssw2-livestock-trainer/issues/7) で追跡する。既存`gh-pages` branchの削除、Pages実行、Draft解除、merge、Phase 6はこのcommit群に含めない。

## 既知の制約

端末内stateは単一タブ内の連続保存順を保つが、複数タブ・複数ウィンドウ・ブラウザ版とインストール版を同時に開いた競合更新はまだ統合しない。Issue #6が完了するまで、学習履歴を記録する際は一つのタブまたはウィンドウだけを使用する。
