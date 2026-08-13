# 畜産2号トレーナー

特定技能2号「畜産農業」の受験者向けに作成した、スマートフォン中心の非公式学習支援PWAです。

このリポジトリは **v0.5.0 Alpha・学習支援パイロット版** です。代表16問だけを新しい日本語学習支援形式へ移行し、残り64問は従来形式のまま保持しています。搭載する80問は公式教材との根拠照合済みですが、インドネシア語ネイティブ確認と利用者最終承認前です。問題状態は `source_checked` のままで、正式な `approved` は0問です。

アプリ版、学習state、問題Schema、Service Worker cacheは別々の互換性境界です。各番号の役割は [バージョン表記の役割](docs/VERSIONING.md) を参照してください。

## この版で動く機能

- 今日の10問：復習、弱点、新規を組み合わせて出題
- 養鶏から学ぶ：肉用鶏・採卵鶏から未経験分野へ展開
- 分野別学習：9分野・80問
- 日本語、やさしい日本語、ふりがな、インドネシア語の切替
- 回答前の自信記録
- 誤答原因の分類：知識、日本語、読み違い、計算、時間、その他
- 間隔反復：10分後、3日、7日、14日、30日
- 50問・60分の模擬試験
- 日本語専門用語63語
- 成績・弱点分析
- 会社管理者向け端末内ダッシュボード
- 80問レビュー画面
- IndexedDB保存とlocalStorage予備
- 学習データのJSON／CSV入出力
- PWAマニフェスト、Service Worker、オフラインApp Shell
- 独自作成の模式図5点

## 重要な品質ゲート

一般公開版では `approved` の問題だけを出題します。この内部レビュー版では、検証のために設定 `reviewContentEnabled` をONにして `source_checked` を表示しています。

```text
source_checked
  ↓ インドネシア語ネイティブ確認
language_checked
  ↓ 利用者テスト・マサトさん最終承認
approved
```

## 参照資料

- `技能測定試験（畜産農業）.pdf`
- `衛生管理（畜産農業）.pdf`

問題文、選択肢、解説、模式図は独自表現です。公式PDFの写真、ページ画像、確認問題の文面、公式ロゴは収録していません。

## 開発環境

このAlphaは、外部パッケージ取得ができない実行環境でも検証可能にするため、依存ゼロのTypeScript PWAとして実装しています。

- TypeScript
- HTML/CSS
- IndexedDB／localStorage
- Service Worker
- Node標準テストランナー
- Playwright Chromiumによる画面検査

React＋Viteへの移行方針は `docs/ADR-0001-alpha-runtime.md` に記録しています。

## 実行

### 単体レビュー版

`dist/standalone-review.html` をブラウザで開きます。模式図を含め、1ファイルで確認できます。Service Workerとインストール検証はHTTP配信版を使います。

### PWA版

```bash
npm run build
npm run serve
```

その後、ブラウザで `http://localhost:4173` を開きます。

## 検証

```bash
npm run check:data-sync
npm run typecheck
npm run validate:content
npm test
npm run test:e2e
```

一括実行：

```bash
npm run verify
```

### GitHub CIの検査範囲

GitHub CIには公式PDFを配置しません。Pull Requestと`main`へのpushでは次を検査します。

- 生成データ同期、JSON Schema、件数、ID、参照整合、権利フラグ
- 代表16問の必須翻訳、ふりがな、正答理由、不正解理由、出典、レビューゲート
- TypeScript、ビルド、Node単体テスト
- 学習支援Level 0〜3、保存、模試の日本語限定と終了後の言語復帰
- Playwright 360px表示、横方向オーバーフロー、JavaScript page error
- PWA配布ファイルと期限付きPRレビューartifact

CI内の `validate:content` は、出典IDと台帳ページ範囲を検査します。ただし公式PDFバイナリがないため、次の2項目はレポート上で明示的に `SKIPPED` になります。

- 公式PDFのハッシュとページ数
- PDF本文を使う50件の根拠アンカー照合

### 許可済みローカル環境のPDF検査

上記2項目を含む完全照合は、公式PDF 2冊を同じフォルダーに置き、`SSW2_SOURCE_DIR` を設定したローカル環境だけで実行します。PDF自体はGitへ追加しません。PyMuPDFを利用でき、次のファイル名が必要です。

```text
<SSW2_SOURCE_DIR>/技能測定試験（畜産農業）.pdf
<SSW2_SOURCE_DIR>/衛生管理（畜産農業）.pdf
```

PowerShell例：

```powershell
$env:SSW2_SOURCE_DIR = 'C:\controlled-source-review'
npm run verify:pdf
```

`reports/VALIDATION_REPORT.json` の `anchorVerification.available=true`、`skipped=false`、`passed=50` を確認します。レポートの扱いと過去版の分離は [reports/README.md](reports/README.md) を参照してください。GitHub CIの成功証跡は、対象commitに紐づくActions Run URLです。

## ディレクトリ

```text
src/                 アプリ本体
public/              問題、知識カード、用語、独自模式図
scripts/             ビルド・公式根拠検証
tests/               学習エンジン・データ・PWAテスト
e2e/                 Playwright画面検査
docs/                仕様・判断履歴・引継ぎ
reports/             検証結果とスクリーンショット
dist/                配布可能なビルド
```

## 現在の制限

- インドネシア語は機械下書きで、ネイティブ確認前
- `approved` 問題は0問
- 管理者画面は同一端末の履歴のみ
- ログイン、複数端末同期、会社別権限は未実装
- 法律、統計、制度に関する問題は教材版に基づくため、公開前に最新情報との再確認が必要
- 実際の本試験問題・固定合格点は収録しない

## 次の段階

1. Draft PR #5のCIと期限付きPRレビューartifactを確認
2. 代表16問を4問×4セットで人手レビュー
3. 代表16問の指摘と既存機能の回帰だけをPR #5内で修正
4. Android／iPhoneで内部レビュー用実機テスト
5. 結果を確認後、Phase 6を別途計画

この順序の詳細は [次段階の実施順序](docs/NEXT_PHASE.md) と [代表16問レビュー計画](docs/PILOT_REVIEW_PLAN.md) を参照してください。Phase 6開始、`approved` 昇格、Draft解除、merge、公開はそれぞれ別判断です。

## PRレビュー用ビルドとスマホ実機テスト

Draft PR #5の成功したPull Request CI Runから、名前が `temporary-pr-review-build-7d-pr-` で始まるActions artifactを取得できます。PR番号とRun attemptを含みます。保持期間は7日間で、`main` push CIでは生成しません。

- CI: `.github/workflows/ci.yml`
- artifact: `dist`相当のビルド一式と `standalone-review.html`
- 実機手順: `docs/SMARTPHONE_TEST.md`
- バージョン表記: `docs/VERSIONING.md`

このリポジトリはpublicであり、artifactは指定レビュアーだけに制限された保管場所ではありません。未確認翻訳を含む期限付きPR確認物で、正式な配布物、長期保管物、承認済み教材ではありません。`standalone-review.html` は単体表示確認に利用できますが、Service WorkerとPWAインストールの確認にはHTTP配信とsecure contextが必要です。PR #5のレビューでは既存Pages、本番URL、一般公開ホストへ反映しません。

## 既知の制約

端末内stateの連続saveは一つの画面内で順序を保ちますが、複数タブ・複数ウィンドウ・ブラウザ版とインストール版を同時に使った競合更新は未対応です。[Issue #6](https://github.com/0310masato/ssw2-livestock-trainer/issues/6) が完了するまで、学習履歴を記録するときは一つのタブまたはウィンドウだけを使用してください。

### 表示言語

画面上部または設定画面で **日本語／Bahasa Indonesia** を切り替えられます。選択した表示言語は端末内へ保存され、再起動後も維持されます。

表示言語はナビゲーション、説明、ボタン、成績、管理画面、レビュー画面、設定画面に適用されます。問題文と選択肢は日本語練習のため日本語を主表示として残し、既存の「やさしい日本語」「Bahasa Indonesia」学習補助で内容を確認します。

## 教材としての学習設計

この版では、単なるUI翻訳ではなく、インドネシア人学習者が日本語の試験問題を理解するための教材構造を実装しています。

- 日本語問題を最初に提示
- 問題文・選択肢・日本語解説へ全文ふりがな
- やさしい日本語とインドネシア語で意味を確認
- 「最も適切」「誤っている」など問題文の型を説明
- 重要語を漢字・読み・やさしい日本語・インドネシア語で表示
- 正答理由と選択肢別解説を表示
- guided／adaptive／日本語のみを切替
- 模擬試験は日本語のみ

詳細は [docs/PEDAGOGY_SPEC.md](docs/PEDAGOGY_SPEC.md) を参照してください。

### Phase 1 教材・レビュー仕様

- [学習支援レベル仕様](docs/LEARNING_SUPPORT_SPEC.md)
- [ふりがな作成・確認方針](docs/FURIGANA_POLICY.md)
- [インドネシア語翻訳ガイド](docs/INDONESIAN_TRANSLATION_GUIDE.md)
- [問題解説・日本語ポイント作成方針](docs/QUESTION_EXPLANATION_POLICY.md)
- [コンテンツレビュー・チェックリスト](docs/CONTENT_REVIEW_CHECKLIST.md)

このfeature branchでは代表16問だけをパイロットとしてレビューし、残り64問を含む全80問展開（Phase 6）は行いません。機械翻訳はdraftであり、日本語確認、インドネシア語ネイティブ確認、正答漏えい確認、利用者最終承認を別々のゲートとして扱います。
