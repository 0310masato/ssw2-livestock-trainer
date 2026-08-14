# スマートフォン実機テスト手順

対象は **v0.5.0 Alpha・Draft PR #5内部レビュー版** です。代表16問は人手レビュー前、全80問は `source_checked`、`approved` は0問です。既存Pages、本番URL、一般公開ホストには配信しません。

## PRレビュー用artifactの取得

1. GitHubへログインし、Draft PR #5の最新commitに対応する成功済みCI Runを開く。
2. Run summaryのArtifactsから、名前が `temporary-pr-review-build-7d-pr-` で始まるものをダウンロードする。PR #5の初回実行なら `temporary-pr-review-build-7d-pr-5-attempt-1` になる。
3. ZIPを展開し、`standalone-review.html` と `index.html`、`app.js`、`sw.js` を含むビルド一式を確認する。
4. 取得したRun URL、commit SHA、端末名、OS、ブラウザ版、確認日をテスト記録へ残す。

artifactの保持期間は7日間です。期限付きのPRレビュー用スナップショットであり、正式配布物、長期保管物、承認済み教材ではありません。リポジトリはpublicであり、GitHubへのサインイン要求は教材のアクセス制限ではありません。機密情報をartifactやレビュー記録へ入れず、再取得時は必ず同じcommitのartifactかを確認します。

## 配信方法の境界

- 内容と基本操作の事前確認には、artifact内の `standalone-review.html` をPCブラウザで開ける。
- スマートフォンでは、artifact内のビルド一式をAndroidの`adb reverse`による端末localhost、承認済みの社内HTTP(S)環境、または同一LANの一時サーバーから開く。
- Service Worker、ホーム画面追加、オフライン起動はsecure contextが必要なため、Androidの端末localhost（`adb reverse`）または承認済みのアクセス制限付きHTTPS環境でだけ確認する。
- 同一LANのHTTPで確認した場合は、表示・操作結果とPWAインストール未確認を分けて記録する。
- GitHub Pages workflow、本番環境、公開トンネルは使用しない。

### Androidで`adb reverse`を使う推奨手順

この方法は外部公開や独自証明書を使わず、USB接続したAndroid端末の`localhost`からPC上の一時サーバーへ接続します。Android Platform Toolsが管理者により導入済みで、レビュー専用PCを利用できる場合だけ実行します。

1. artifactを展開し、PCのlocalhostだけで一時サーバーを起動する。

```powershell
python -m http.server 4173 --bind 127.0.0.1 -d <artifactを展開したフォルダー>
```

2. Androidで開発者向けオプションとUSBデバッグを一時的に有効にし、レビュー専用PCだけを承認する。
3. 別のターミナルで転送を設定する。

```powershell
adb reverse tcp:4173 tcp:4173
```

4. Android Chromeで `http://localhost:4173/` を開き、Service Worker、ホーム画面追加、再読込、オフライン起動を確認する。
5. 終了後、転送とサーバーを停止し、不要ならUSBデバッグとPC承認も解除する。

```powershell
adb reverse --remove tcp:4173
```

`adb devices`等に表示される端末serial、IMEI、アカウント名、通知内容はレビュー記録へ転記しません。証明書・秘密鍵・認証トークンを作成、コピー、artifact化、Git追加しないでください。

### 同一LANの一時サーバーを使う場合

PC上で同一LAN向け一時サーバーを使う例：

```powershell
python -m http.server 4173 -d <artifactを展開したフォルダー>
```

スマートフォンから `http://<PCのLAN内IP>:4173` を開きます。この経路は通常secure contextではないため、PWAインストール・Service Worker確認とは分けて記録します。テスト後はサーバーを終了します。ファイアウォール変更や外部公開が必要な場合は実行せず、管理者へ確認してください。

iPhoneでHTTPSが必要な場合は、管理者が用意したレビュー環境だけを使用します。個人作成の証明書や秘密鍵を共有、記録、Git追加してはいけません。

## 共通の事前条件

- 端末に500MB以上の空き容量がある。
- 端末の表示幅が360px前後になる向き・倍率でも確認する。
- 初回だけ通信できる。
- 個人情報や認証情報を問題レビュー欄へ入力しない。
- 実際の試験合格判定には使わない。

## Android（Chrome）

1. 承認されたレビューURLをChromeで開く。
2. 日本語／Bahasa Indonesiaを切り替え、再読込後も選択が残ることを確認する。
3. 代表16問から各支援Level 0〜3を確認する。
4. 日本語だけで再挑戦し、同じ回答で習熟度・復習予定が二重更新されないことを確認する。
5. 模試を開始し、問題・選択肢・操作UIが日本語だけであることを確認する。
6. 模試を終了し、保存済みのUI言語へ戻ることを確認する。
7. 360px前後で横スクロール、文字切れ、ボタン重なりがないことを確認する。
8. HTTPS環境の場合だけ、Chromeメニューからホーム画面追加とオフライン再起動を確認する。

## iPhone（Safari）

1. 承認されたレビューURLをSafariで開く。
2. 日本語／Bahasa Indonesiaを切り替え、タブを閉じて再度開いても選択が残ることを確認する。
3. 代表16問から各支援Level 0〜3を確認する。
4. 日本語だけで再挑戦し、履歴・習熟度・復習予定を確認する。
5. 模試の日本語限定表示と終了後のUI言語復帰を確認する。
6. 縦向き360px前後と、文字サイズを上げた状態で横スクロールや操作不能がないことを確認する。
7. HTTPS環境の場合だけ、Safariの共有メニューからホーム画面追加とオフライン再起動を確認する。

## 代表16問で記録する項目

- 問題IDとレビューセット番号
- 日本語問題・否定表現・数字・単位の見え方
- ふりがな、やさしい日本語、重要語、全文訳、選択肢訳
- 正答理由と各不正解理由
- 出典名、版、ページ、章
- インドネシア語による正答漏えいの有無
- 操作に迷った箇所と修正案
- 横方向オーバーフローとJavaScriptエラー

問題内容の判定は `public/review-checklist.csv`、4問×4セットの進め方は `docs/PILOT_REVIEW_PLAN.md` を正本とします。

## 不具合報告

GitHubの「スマホ実機テスト報告」Issueテンプレートを使用します。次を含め、個人情報は書きません。

- commit SHAとCI Run URL
- 端末モデルの一般名、OS、ブラウザ版（serial、IMEI、アカウント等の個体識別情報は記録しない）
- 問題IDと支援Level
- 再現手順、期待結果、実際の結果
- PWA／オフラインを確認した場合はHTTPS環境か

JavaScriptエラーは可能ならブラウザ開発者ツールのメッセージを添えます。実機で取得できない場合は、発生操作と画面状態を記録します。

## 学習データを消す場合

アプリの設定画面から学習データを初期化します。ブラウザのサイトデータ削除を行うと、履歴・レビュー状態・言語・支援設定がすべて消えます。テスト記録を保存してから実行してください。

## Indonesian quick guide

1. Unduh artifact dengan nama berawalan `temporary-pr-review-build-7d-pr-` dari CI untuk commit PR #5 yang diuji.
2. Buka build melalui server review internal yang disetujui; jangan gunakan Pages atau host publik.
3. Uji bahasa UI, Level 0–3, coba ulang tanpa bantuan, dan simulasi ujian bahasa Jepang saja.
4. Catat ID soal, perangkat, browser, commit, dan masalah tanpa data pribadi.
5. Uji instalasi PWA dan offline hanya melalui HTTPS internal yang disetujui.
