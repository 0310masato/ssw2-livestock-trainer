# 畜産2号トレーナー Alpha v0.4.1 検証報告

> この文書は2026-08-12時点のAlpha v0.4.1検証スナップショットです。現在のv0.5.0パイロット結果は `VALIDATION_REPORT.md`、`E2E_REPORT.json`、`PEDAGOGY_E2E_REPORT.json` を参照してください。

作成日：2026-08-12

## 結論

**内部レビュー用AlphaとしてPASS。**

このPASSは、アプリ構造、公式教材への参照、学習ロジック、PWA構成、主要画面操作が検査を通過したことを示す。インドネシア語ネイティブ確認や人間最終承認を意味せず、公開用 `approved` は0問である。

## 対象

- アプリ：畜産2号トレーナー v0.4.1-alpha-pages-ready
- 問題：80問（すべて `source_checked`）
- 知識カード：100件
- 専門用語：60語
- 独自模式図：5点
- 公式画像・競合コンテンツ：0点

## 公式資料との検査

- コンテンツ検査：18項目PASS
- 検出問題：0件
- 自動PDF根拠アンカー：50/50 PASS
- 既存カードの手動ページ参照：50件維持
- 完全重複問題：0組
- 類似度0.92以上の近似重複：0組
- 公式PDFハッシュ・ページ数：台帳と一致

## コード・学習ロジック

Node標準テストランナーで11件PASS。

- コンテンツ件数・ID
- `source_checked` と `approved` の公開ゲート
- 問題から知識カードへの参照
- 今日の10問の重複防止
- 不正解時の10分後復習
- 習得段階と支援削減
- 50問模試の構成と採点
- PWAマニフェスト
- Service Worker App Shell
- 単体レビューHTMLと独自模式図の埋込み
- noindex、robots.txt、.nojekyllの配信安全設定

## ブラウザ検査

組込みBrowser/IABがこの環境では利用できなかったため、Playwright Chromiumを使用した。さらに実行環境の管理設定によりlocalhost／file URLへのブラウザ遷移が遮断されたため、配布する単体レビューHTMLを `set_content` で読み込んで検査した。

- モバイル：390×844
- デスクトップ：1280×900
- E2E検査：17項目PASS
- JavaScript実行エラー：0件
- 横方向オーバーフロー：なし
- 可視ボタンの高さ：検査対象で40px以上

確認した操作：

1. ホームと9分野
2. 今日の10問
3. 選択肢と回答前の自信
4. 正誤・解説・教材参照
5. 誤答原因の入力ゲート
6. 独自模式図
7. 会社管理者ダッシュボード
8. 80問レビューと承認候補保存
9. 専門用語検索
10. 50問・60分模試と問題移動
11. スマホ・デスクトップ表示

## デザイン照合

比較対象：

- Phase 1ホーム：`work_phase1/.../reports/screenshots/home-mobile.png`
- Phase 1学習：`work_phase1/.../reports/screenshots/study-mobile.png`
- Phase 1管理：`work_phase1/.../reports/screenshots/manager-mobile.png`

実装：

- `reports/screenshots/alpha-home-mobile.png`
- `reports/screenshots/alpha-study-mobile.png`
- `reports/screenshots/alpha-manager-mobile.png`
- `reports/screenshots/alpha-review-mobile.png`
- `reports/screenshots/alpha-home-desktop.png`

`view_image`で参照画面と実装画面を直接確認した。

主な一致点：

- オレンジの2号マークと青緑のブランド
- 淡黄色の内部レビュー警告
- ナビゲーションの文字・選択下線
- ホームの大見出し、主要CTA、4指標
- 学習画面の大きい問題文と4択構造
- 管理画面の4指標、14日活動量、支援判断
- 淡い青緑背景、白いパネル、大きい角丸

修正した差分：

- 画面遷移のスムーズスクロールが固定ヘッダーの全画面キャプチャ位置を不安定にしたため、遷移時を即時スクロールへ変更した。

意図的な差分：

- ホーム主パネルへ今日の進捗を追加
- 未習得時はLevel 3支援を初期ON
- 自信、誤答原因、教材参照、独自図を追加
- デスクトップで分野ボタンを3列化

未説明の重大な視覚差分は確認されなかった。

## 未完了ゲート

- インドネシア語ネイティブ確認：0/80
- 利用者最終確認：未完了
- `language_checked`：0問
- `approved`：0問
- Android／iPhoneの実機PWAインストール：未確認
- GitHub正本リポジトリ：新規作成APIが接続ツールにないため、空リポジトリ作成待ち
- GitHub Actions CI／Pages workflow：ローカル正本候補へ実装済み
- 公開URL：未発行

## 実行コマンド

```bash
npm run verify
```

結果：コンテンツ18項目PASS、Nodeテスト11件PASS、E2E 17項目PASS。
