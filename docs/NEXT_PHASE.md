# 次段階の実施順序

## 現在地

- 正本リポジトリ：`0310masato/ssw2-livestock-trainer`
- 作業対象：Draft PR #5、`codex/indonesian-learning-support-pilot`
- 内容：v0.5.0 Alphaの学習支援パイロット（代表16問）
- 公開状態：未公開、`approved` 0問
- パイロット外64問：`schemaVersion: "0.3.0"` のまま

PR #5は、人による代表16問レビューと実機テストを始められる状態へ整える段階にある。レビュー完了前にDraftを解除、merge、既存Pagesへ配信、Phase 6へ着手しない。

## 実施順序

### 1. PR #5のレビュー準備

1. GitHub CIと、公式PDFを配置したローカル検証の範囲を分けて記録する。
2. `public/review-checklist.csv` を代表16問レビューの正本一覧として維持する。
3. `docs/PILOT_REVIEW_PLAN.md` に従い、4問ずつ4セットで確認する。
4. GitHub Actions artifactの `dist` と `standalone-review.html` を内部レビュー用に取得できる状態にする。
5. artifactは期限付きの確認物であり、公開版・長期保管物・承認済み教材ではないことをレビュアーへ伝える。

### 2. 代表16問の人手レビュー

次のゲートを別々に確認する。自動検査PASSだけでレビュー状態を変更しない。

- 日本語内容・出典・正答
- ふりがな
- 日本語学習支援
- インドネシア語ネイティブ確認
- 翻訳による正答漏えい
- 360px表示を含む操作性

指摘は問題ID単位で `public/review-checklist.csv` に記録する。確認前の問題を `language_checked` や `approved` に昇格しない。

### 3. 実機テスト

代表16問の重大な内容不備を解消した後、Android ChromeとiPhone Safariで `docs/SMARTPHONE_TEST.md` の確認を行う。

- 表示言語と支援Level 0〜3
- 保存・再起動・旧state移行
- 日本語だけで再挑戦
- 模試中の日本語限定表示と終了後の言語復帰
- 360px前後の横スクロール
- JavaScriptエラー

PRレビュー用artifactを使い、既存Pagesや本番URLへ公開しない。PWAインストール・Service Workerの確認にHTTPSが必要な場合は、別途承認されたアクセス制限付き環境を用意する。

### 4. PR #5内の整合修正

レビュー指摘は代表16問と既存機能の回帰修正に限定する。修正後はGitHub CIと、公式PDFを配置した許可済みローカル環境の両方で再確認する。PR #5は人手ゲートが完了するまでDraftのまま維持し、merge判断は別指示とする。

### 5. Phase 6（別途判断後）

Phase 6は、代表16問とUIの人手レビュー、実機テスト、翻訳・ふりがな運用の妥当性を確認した後に、別の実装計画として開始する。

- 残り64問を一括機械翻訳だけで完成扱いにしない。
- 4〜8問程度の小さな単位で変換・日本語確認・ネイティブ確認を行う。
- 教材根拠、正答漏えい、用語統一を問題ごとに確認する。
- `approved` 昇格はコンテンツ変換とは分離し、人の最終承認後だけ行う。

## PR #5を次の判断へ進める条件

- 代表16問のレビュー記録と修正判断が問題ID単位で残っている。
- Android／iPhoneの主要操作結果が記録されている。
- GitHub CIがPASSしている。
- 許可済みローカル環境で公式PDFのハッシュ・ページ数・根拠アンカーがPASSしている。
- `approved` は0問のままである。
- 残り64問のID、正答、source、status、`schemaVersion: "0.3.0"` が維持されている。
- 公式PDFがGit差分に含まれていない。

## 履歴：旧計画

新規リポジトリ作成、Git-ready ZIP配布、旧PR #1〜#7への分割案は、GitHub正本とDraft PR #5が作成される前の計画であり、現在の実施手順には使用しない。必要な履歴はGitに残し、今後は上記のPR #5 → 代表16問レビュー → 実機テスト → Phase 6の順序を正本とする。
