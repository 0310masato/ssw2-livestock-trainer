# 検証レポートの扱い

## 現行v0.5スナップショット

| ファイル | 生成元 | 示す範囲 |
|---|---|---|
| `VALIDATION_REPORT.md` / `.json` | `npm run validate:content` | 問題・用語・出典メタデータの構造検査。公式PDFが配置されている場合だけ、PDFハッシュ・ページ数・本文アンカーも含む。 |
| `E2E_REPORT.json` | `npm run test:e2e:core` | 主要画面、模試、保存言語、360px幅、JavaScript page error。 |
| `PEDAGOGY_E2E_REPORT.json` | `npm run test:e2e:pedagogy` | 支援Level 0〜3、翻訳表示境界、日本語のみ再挑戦、解説表示。 |
| `screenshots/` | Playwright実行 | 自動画面検査時の参考画像。人による実機確認の代替ではない。 |

これらは実行時に上書きされる再生成可能なスナップショットである。GitHub CIの成功を示す正本証跡は、対象commitに紐づくGitHub Actions Run URLとする。ローカルPDF検証の証跡には、対象HEAD、実行日、`SSW2_SOURCE_DIR`を設定したこと、`anchorVerification` の結果を完了報告へ記録する。実行時固有の全文コンソールログを正本レポートとしてコミットしない。

## GitHub CIとローカルPDF検証の違い

GitHub CIには公式PDFを配置しない。CIの `npm run validate:content` は、JSON Schema、件数、ID、参照、権利フラグ、パイロット必須項目、レビューゲート等を検査する一方、次を明示的に `SKIPPED` とする。

- 公式PDFバイナリのハッシュとページ数
- PDF本文を用いる50件の根拠アンカー照合

許可済みローカル環境で `SSW2_SOURCE_DIR` に公式PDF 2冊を配置して実行した場合だけ、上記を含む完全照合になる。レポートJSONでは `anchorVerification.available` と `anchorVerification.skipped`、Markdownでは各検査行の `SKIPPED` 表示を確認する。

「All source IDs and ledger page ranges resolve」のPASSは、PDF未配置時には台帳のdocument IDとページ範囲が有効であることを示す。実際のPDFファイル、ハッシュ、本文アンカーの照合済みという意味ではない。

## 過去版

v0.4.1以前の検証概要と全文ログは `archive/v0.4.1/` に隔離する。これらは履歴参照専用であり、PR #5の現行検証結果やCI結果として引用しない。
