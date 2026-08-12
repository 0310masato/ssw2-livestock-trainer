# スマートフォン実機テスト手順

対象は **v0.4.1 Alpha・内部レビュー版** です。搭載問題は `source_checked` であり、公開用 `approved` ではありません。

## 事前条件

- HTTPSで配信されたGitHub Pages等のURLを使うこと
- 端末に500MB以上の空き容量があること
- 初回だけ通信できること
- 実際の試験合格判定には使わないこと

## Android（Chrome）

1. 配布されたHTTPS URLをChromeで開く。
2. ホーム画面の「今日の10問」を1問だけ解き、表示崩れがないことを確認する。
3. Chrome右上のメニューから「アプリをインストール」または「ホーム画面に追加」を選ぶ。
4. ホーム画面の「畜産2号」アイコンから起動する。
5. 機内モードにして再起動し、ホームと以前読み込んだ学習画面が開くか確認する。

## iPhone（Safari）

1. 配布されたHTTPS URLをSafariで開く。ChromeではなくSafariを使用する。
2. 共有ボタンを押し、「ホーム画面に追加」を選ぶ。
3. 名前が「畜産2号」になっていることを確認して追加する。
4. ホーム画面のアイコンから起動する。
5. 一度オンラインで主要画面を開いた後、機内モードで再起動できるか確認する。

## 最低限の確認項目

- 今日の10問を開始・完了できる
- 選択肢が指で押しやすい
- 日本語、やさしい日本語、インドネシア語を切り替えられる
- 回答後に正解・解説・教材参照が表示される
- 誤答原因を選べる
- 50問・60分模試を開始できる
- 画面を閉じても履歴が残る
- オフライン再起動できる
- 360px前後の画面で横スクロールが発生しない

## 不具合報告

GitHubの「スマホ実機テスト報告」Issueテンプレートを使用する。問題内容の指摘は、画面に表示される問題IDを記録する。

## 学習データを消す場合

アプリの設定画面から学習データを初期化する。ブラウザのサイトデータ削除を行うと、履歴・レビュー状態・設定がすべて消える。

## Indonesian quick guide

1. Buka URL HTTPS dengan Chrome di Android atau Safari di iPhone.
2. Pilih **Tambahkan ke layar utama / Add to Home Screen**.
3. Buka ikon **畜産2号**.
4. Coba 10 soal harian, pilihan bahasa, dan mode simulasi.
5. Setelah halaman pernah dibuka secara online, aktifkan mode pesawat dan coba buka lagi.
6. Laporkan masalah beserta ID soal. Jangan menuliskan informasi pribadi.
