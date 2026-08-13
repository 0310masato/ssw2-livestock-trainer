# Alpha v0.5.0 状況報告

> 2026-08-13更新：Draft PR #5の代表16問パイロットを、人手レビューと実機テストへ渡す準備段階です。残り64問へのPhase 6展開、`approved` 昇格、merge、Draft解除、Pages配信は行っていません。

## 現在の正本

- Repository: `0310masato/ssw2-livestock-trainer`
- Draft PR: #5
- Branch: `codex/indonesian-learning-support-pilot`
- アプリ版: `0.5.0-alpha-pedagogy`
- 問題: 80問、すべて `source_checked`
- 代表16問: 問題 `schemaVersion: "0.4.0"`
- 残り64問: 問題 `schemaVersion: "0.3.0"`
- `approved`: 0問

バージョン番号ごとの役割は `docs/VERSIONING.md` を参照してください。

## 実装済み

- 公式教材2冊の版・ハッシュ・ページ台帳
- 知識カード100件、問題80問、日本語・インドネシア語専門用語63語
- 独自模式図5点
- 代表16問のふりがな、重要語、翻訳、設問意図、選択肢別解説、日本語ポイント
- 学習支援Level 0〜3と日本語のみ再挑戦
- 支援利用履歴、回答時間、知識不足・日本語不足の端末内保存
- 今日の10問、間隔反復、50問・60分模試、成績・弱点画面
- 模試の日本語限定表示と終了後の保存言語復帰
- IndexedDBとlocalStorageの保存、旧state移行、連続saveのrevision保護
- PWAマニフェスト、Service Worker、単体レビューHTML
- TypeScript、Node、Playwright、コンテンツ検証
- Pull Request CI用の7日間保持内部レビューartifact

## 人手レビュー待ち

代表16問では次の4つの教材ゲートが各16問、合計64件pendingです。

- インドネシア語ネイティブ確認: 16
- ふりがな確認: 16
- 日本語学習支援確認: 16
- 正答漏えい確認: 16

これに `review.approvalByUser` 16件と `device_review` 16件を加え、明示的なpending記録は合計96件です。既存の `content=pass` と `languageJa=pass` は `reviewerType=ai_source_review` の出典照合記録であり、人による日本語・教材性レビュー完了を意味しません。自動検査PASSだけで `language_checked` または `approved` に昇格しません。レビューは `public/review-checklist.csv` と `docs/PILOT_REVIEW_PLAN.md` に従います。

## 検証範囲

GitHub CIは、データ同期、構造、TypeScript、ビルド、単体テスト、Level 0〜3、保存・模試回帰、360px Playwright、JavaScript page error、PWA配布ファイルを検査します。公式PDFをリポジトリへ置かないため、PDFハッシュ・ページ数・本文アンカー50件はCIでは `SKIPPED` です。

公式PDFの完全照合は、許可済みローカル環境で `SSW2_SOURCE_DIR` を設定した場合だけ実行します。現行の実行結果と読み方は `reports/README.md`、GitHub CI結果は対象commitのActions Runを確認します。

## 未完了

- 代表16問の日本語・インドネシア語・操作レビュー
- Android／iPhone実機テスト
- `language_checked`: 0問
- `approved`: 0問
- 残り64問のPhase 6変換
- 複数端末同期、ログイン、会社別権限
- 公開URL

## リリース判断

この版は期限付きartifactで人手レビューを始められる内部Alphaです。正式公開版、翻訳確認済み教材、全80問の新形式版ではありません。次の順序はPR #5 → 代表16問レビュー → 実機テスト → 別途承認後のPhase 6です。
