# GitHub Pages配信手順

## 重要

このAlphaは内部レビュー用です。80問は公式教材との根拠照合済みですが、インドネシア語ネイティブ確認と最終承認前です。GitHub PagesのURLは原則としてアクセス制限がなく、`noindex` はセキュリティ機能ではありません。

## 推奨するリポジトリ設定

- Repository: `0310masato/ssw2-livestock-trainer`
- Visibility: **Private**（正本管理）
- Default branch: `main`
- Pages: 問題承認前は無効のまま

スマホでURL配信が必要な場合は、公開リスクを了承したレビュー専用リポジトリ、または認証付きホスティングを使用する。正式公開は `approved` 問題だけになった後に行う。

## Pagesを手動実行する場合

1. GitHubのRepository Settings → PagesでSourceを **GitHub Actions** にする。
2. Actions → **Deploy review build to GitHub Pages** を開く。
3. **Run workflow** を押す。
4. `deploy` jobが成功したら、Environment `github-pages` に表示されたURLを開く。
5. Android Chrome／iPhone Safariで `docs/SMARTPHONE_TEST.md` に沿って確認する。

## 自動実行しない理由

`.github/workflows/pages.yml` は `workflow_dispatch` のみです。pushのたびに未承認問題を公開しないためです。

## CI

`.github/workflows/ci.yml` はpushとPull Requestで次を実行します。

- TypeScript型検査
- ビルド
- Node単体テスト
- PWA配布ファイルの存在確認

公式PDF自体は著作権上リポジトリに含めません。PDFハッシュ・ページ・本文アンカーの完全照合は許可されたローカル環境で実行します。
