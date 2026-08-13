# バージョン表記の役割

このリポジトリには、用途が異なる複数のバージョン番号がある。同じ数字へ揃えることより、互換性境界を変えたときだけ該当番号を更新することを優先する。いずれの番号も、問題が人手確認済みまたは `approved` であることを意味しない。

| 表記 | 現在値 | 役割 | 更新する条件 |
|---|---|---|---|
| npm package version | `0.5.0-alpha-pedagogy` | リポジトリ内アプリ一式の開発版識別子。`package.json` と `package-lock.json` で一致させる。 | 機能パックまたは配布候補を区別するとき |
| `APP_VERSION` | `0.5.0-alpha-pedagogy` | 画面表示と学習データexport内に記録するアプリ版。package versionと同じ値を生成データへ反映する。 | package version更新時 |
| 学習state `schemaVersion` | `0.6.0` | 端末内の履歴・設定・復習予定など、保存データ構造の互換性番号。 | state構造やmigration境界を変えるとき |
| 保存キー名の `v0.4` | `state-v0.4` / `livestock2-state-v0.4` | 既存端末データを見つけるための永続キー名。アプリ版ではない。 | migrationを用意して保存先を意図的に切り替えるときだけ |
| 問題 `schemaVersion` | パイロット16問 `0.4.0`、残り64問 `0.3.0` | 問題1件ごとのデータ構造。`0.4.0` は新しい学習支援構造、`0.3.0` は従来構造。 | その問題を人手管理下で新構造へ変換するとき |
| JSON Schema | `livestock2-question-v0.4.schema.json` | `0.3.0` と `0.4.0` の問題を同時検証するSchema定義版。 | 検証契約を変更するとき |
| Service Worker cache | `livestock2-v0.5.0-pr5-remediation` | 古いApp Shell cacheを破棄するための技術的識別子。PR #5是正後のレビューartifactを既存cacheより優先する。 | 配布ファイルを更新し、既存cacheを確実に切り替えるとき |
| exportファイル名 | `..._v0.5.json` / `..._v0.5.csv` | 人が複数の出力を見分けるためのアプリ版ラベル。stateや問題Schemaの版ではない。 | アプリ版ラベルを更新するとき |
| レポート見出し | `Alpha v0.5` | どのアプリ系列の検証スナップショットかを示す。 | 別のアプリ系列を検証するとき |

## 互換性上の注意

- 保存キーの `v0.4` を見た目だけの理由で変更しない。変更すると既存のlocalStorage／IndexedDB stateを読めなくなる可能性がある。
- state `0.6.0` と問題 `0.4.0` は別のデータ構造であり、一致させない。
- 残り64問の `0.3.0` はPhase 6前の意図した状態であり、古いアプリが混在しているという意味ではない。
- Service Worker cache名は配布更新用であり、データmigrationやコンテンツ承認状態には使わない。
- exportファイルの内容には `appVersion` とstate `schemaVersion` の両方を保持し、ファイル名だけで互換性を判断しない。

## レポート表記

現行のv0.5レポートとv0.4.1以前の履歴はディレクトリを分ける。`reports/VALIDATION_REPORT.*`、`reports/E2E_REPORT.json`、`reports/PEDAGOGY_E2E_REPORT.json` は各コマンド実行時の再生成可能なスナップショットであり、GitHub CI成功の正本証跡はGitHub ActionsのRun URLとする。過去の実行ログを現行判定へ流用しない。
