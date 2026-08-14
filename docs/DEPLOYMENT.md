# GitHub Pages配信手順

## 重要

このAlphaは内部レビュー用です。80問は公式教材との根拠照合済みですが、インドネシア語ネイティブ確認と最終承認前です。GitHub PagesのURLは原則としてアクセス制限がなく、`noindex` はセキュリティ機能ではありません。

Draft PR #5の代表16問レビューでは、Pull Request CIの7日間保持artifact（`temporary-pr-review-build-7d-pr-`で始まる名前）を使用します。既存Pages workflowを実行せず、本番・公開URLへ反映しません。

このリポジトリはpublicです。GitHubへのサインインがartifact取得時に求められる場合でも、それを教材のアクセス制限とは扱いません。artifactへ機密情報、公式PDF、証明書、秘密鍵、利用者データ、端末固有IDを入れてはいけません。artifactは期限付きのPR確認物であり、正式配布物や承認済み教材ではありません。

## 現在のリポジトリ境界

- Repository: `0310masato/ssw2-livestock-trainer`
- Visibility: **Public**（アクセス制限なし。このPRでは変更しない）
- Default branch: `main`
- Pages: 問題承認前は無効のまま

アクセス制限付きの正本管理やスマホ向けURL配信が必要な場合は、このpublicリポジトリのartifactを制限手段とせず、別途承認したprivateリポジトリまたは認証付きホスティングを使用する。正式公開は `approved` 問題だけになった後に行う。

## Pages手順（PR #5では使用禁止）

以下は将来、公開範囲と権利を別途承認した場合だけ使用できる唯一の正本手順です。現在は実行禁止です。

1. GitHubのRepository Settings → PagesでSourceを **GitHub Actions** にする。
2. Actions → **Deploy review build to GitHub Pages** を開く。
3. **Run workflow** を押す。
4. `deploy` jobが成功したら、Environment `github-pages` に表示されたURLを開く。
5. Android Chrome／iPhone Safariで `docs/SMARTPHONE_TEST.md` に沿って確認する。

## 自動実行しない理由

Pages公開の正本は `.github/workflows/pages.yml` だけで、`workflow_dispatch` の手動実行だけを許可する。Pull Request CI、push、scheduleからは起動しない。`gh-pages` branchへのforce-push方式はworkflowを削除し、[廃止した代替案](archive/GH_PAGES_BRANCH_ALTERNATIVE.md)として履歴だけを残した。PR #5のレビューではPages workflowを実行しない。

## CI

`.github/workflows/ci.yml` はpushとPull Requestで次を実行します。

- 生成データ同期とコンテンツ構造検査
- TypeScript型検査
- ビルド
- Node単体テスト
- 360px Playwright、学習支援Level 0〜3、模試・保存回帰
- localhostの実HTTP配信を使うPlaywright（`page.goto`、manifest・asset取得、Service Worker登録、所有cacheだけの更新、実IndexedDB再読込、オフライン再読込）
- JavaScript page error検査
- PWA配布ファイルの存在確認
- Pull Request時だけ、7日間保持の一時レビューartifact作成。Pages deployは起動しない

既存の単体HTMLを使う`set_content` E2Eも継続し、教材UIの細かな表示境界を確認します。HTTP E2Eはそれを置き換えず、Service Worker、HTTP asset、実ブラウザ保存、cache更新という配信経路固有の不足を補います。HTTPテスト用サーバーは毎回ephemeral portで起動し、成功・失敗にかかわらず終了処理を行います。

公式PDF自体は著作権上リポジトリに含めません。GitHub CIではPDFハッシュ・ページ数・本文アンカー50件を明示的に `SKIPPED` とし、完全照合は `SSW2_SOURCE_DIR` を設定した許可済みローカル環境だけで実行します。
