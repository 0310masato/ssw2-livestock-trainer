# 廃止したgh-pages branch配信案

以前は、`dist/`を`gh-pages` branchへforce-pushし、GitHub Pagesをbranch rootから配信する代替案があった。この方式は、Actions Pages方式と設定・操作経路が二重になるため廃止した。

現在の唯一の正本は `.github/workflows/pages.yml` である。

- GitHub Actions Pages deployを使用する。
- `workflow_dispatch`による手動実行だけを許可する。
- Pull Request CI、push、scheduleからは起動しない。
- Draft PR #5の現在段階では実行しない。
- `gh-pages` branchへのpushまたはforce-pushは使用しない。

この文書は履歴説明であり、実行可能なworkflowやコマンドではない。将来Pages公開を検討する場合も、権利・公開範囲・レビュー状態を別途承認してから `.github/workflows/pages.yml` の手動実行可否を判断する。
