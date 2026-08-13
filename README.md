# 畜産2号トレーナー

特定技能2号「畜産農業」の受験者向けに作成した、スマートフォン中心の非公式学習支援PWAです。

このリポジトリは **v0.5.0 Alpha・学習支援パイロット版** です。代表16問だけを新しい日本語学習支援形式へ移行し、残り64問は従来形式のまま保持しています。搭載する80問は公式教材との根拠照合済みですが、インドネシア語ネイティブ確認と利用者最終承認前です。問題状態は `source_checked` のままで、正式な `approved` は0問です。

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

`validate:content` は公式PDFのハッシュ、ページ数、根拠アンカーを確認します。既定値は `/mnt/data` です。別の保存場所を使う場合は、2ファイルを同じフォルダーに置いて `SSW2_SOURCE_DIR` を指定します（PDF自体はGitへ追加しません）。

```text
/mnt/data/技能測定試験（畜産農業）.pdf
/mnt/data/衛生管理（畜産農業）.pdf
```

PowerShell例：

```powershell
$env:SSW2_SOURCE_DIR = 'C:\controlled-source-review'
npm run validate:content
```

GitHub CIでは著作権上PDFをリポジトリへ含めず、データ同期、構造、型、ビルド、学習ロジック、360px Playwright、模試の日本語限定、PWA構成を検査します。公式PDFとの完全照合は、許可されたローカル環境で実行します。

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

1. イカデさんによる20問テスト結果を反映
2. インドネシア語ネイティブ確認
3. 問題を `language_checked` へ昇格
4. マサトさん最終承認後に `approved` へ昇格
5. GitHub正本へ登録し、React＋Vite版または本構成の継続をADRで決定
6. URL公開・Android／iPhone実機テスト

## GitHub正本とスマホ実機テスト

v0.4.1ではGitHub登録後の検証に必要なCI、手動Pages workflow、Android／iPhone手順を追加しています。

- CI: `.github/workflows/ci.yml`
- Pages（手動実行のみ）: `.github/workflows/pages.yml`
- 実機手順: `docs/SMARTPHONE_TEST.md`
- 配信上の注意: `docs/DEPLOYMENT.md`

未承認問題の意図しない公開を防ぐため、Pagesはpushでは起動しません。`workflow_dispatch` を明示的に実行した場合だけ配信します。`robots.txt` と `noindex` は検索回避の補助であり、アクセス制限ではありません。

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
