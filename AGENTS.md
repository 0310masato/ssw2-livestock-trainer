# 畜産2号トレーナー 作業ガイド

## 目的と入口
特定技能2号・畜産農業の非公式学習支援PWA。概要・品質ゲート・実機確認資料の入口は [README.md](README.md)、配布上の注意は [NOTICE.md](NOTICE.md)。実際の実行定義は [package.json](package.json) を確認する。
`src/` はアプリ、`public/` は教材、`scripts/` は生成・検証、`tests/` と `e2e/` は検証、`docs/` は仕様・判断履歴。

## 教材の品質境界
公式教材の根拠照合、インドネシア語の確認、利用者の承認を別段階として扱う。`source_checked`、`language_checked`、`approved` をテスト成功だけで昇格させない。
日本語問題を主表示とし、補助訳・ふりがな・解説が正答を一意に保つことを確認する。レビュー用出題と承認済み教材の出題を混同しない。
公式PDFのページ画像・写真・ロゴ・問題原文を新たにリポジトリへ複製しない。利用者の学習履歴をテストで上書きしない。

## 実行・検証
作業ディレクトリはリポジトリルート。Node.js・TypeScriptとPythonを使うため、package.jsonと対象スクリプトの実環境を確認する。
- ビルド・ローカル配信: `npm run build`、`npm run serve`。
- 型と学習ロジック: `npm run typecheck`、`npm test`。
- 教材根拠: `npm run validate:content`。許可された公式PDFが必要で、PDF不在を教材照合PASSにしない。
- 画面: `npm run test:e2e`。Playwright等の前提を確認する。単体HTML確認とService Worker・HTTP配信・実機確認を区別する。
- 一括: `npm run verify`。必要な資料・環境がない検査は理由を添えて未実施とする。

## 反映と完了
文書のみなら差分・参照先・記述整合を確認し、ローカルでは `git diff --check`、リモート編集では読戻しで確認する。
公開トリガーはREADMEの説明だけでなく [.github/workflows/pages.yml](.github/workflows/pages.yml) を確認する。手動実行に加え、同workflowのmain更新が配信トリガーとなる設定を無視しない。
文書・教材の確認を、Pages実行・配信許可・正式教材承認と混同しない。変更した機能の検証と必要な仕様更新を完了し、教材の審査状態と実機未確認を別に報告する。
