# コンテンツレビュー・チェックリスト

関連文書: [README](../README.md) / [教材設計概要](PEDAGOGY_SPEC.md) / [学習支援レベル仕様](LEARNING_SUPPORT_SPEC.md) / [ふりがな方針](FURIGANA_POLICY.md) / [翻訳ガイド](INDONESIAN_TRANSLATION_GUIDE.md) / [問題解説方針](QUESTION_EXPLANATION_POLICY.md)

## 1. 使い方

このチェックリストは問題単位で使用する。自動検査、人による日本語確認、インドネシア語ネイティブ確認、利用者最終承認は別のゲートであり、一つのPASSで代用しない。

対象パイロット16問:

`q001`, `q004`, `q008`, `q013`, `q016`, `q029`, `q033`, `q035`, `q044`, `q045`, `q049`, `q055`, `q057`, `q078`, `q079`, `q080`

残り64問はPhase 6対象であり、このbranchでは新形式の完成・承認対象にしない。

## 2. レビュー状態の対応

| 観点 | 保存先 | PASSの意味 |
|---|---|---|
| 出典・正答 | `status` + `review.content` | 指定版・ページ・章と事実、数値、単位、正答を確認済み |
| 日本語 | `review.languageJa` | 問題・選択肢・解説が自然で論理的 |
| ふりがな | `review.furigana` | 全対象漢字の読みを文脈付きで確認済み |
| 日本語教材性 | `review.japaneseLearning` | 設問意図、重要語、日本語ポイント、段階支援が適切 |
| インドネシア語 | `review.languageId` | ネイティブが正確さと自然さを確認済み |
| 正答漏えい | `review.answerLeak` | 翻訳・意図・例文から正解を推測させない |
| 著作権 | `review.legalRights` | 独自表現・許可資産・出典表示を確認済み |
| 最終承認 | `review.approvalByUser` | 利用者テスト後の最終判断 |

`sourceChecked` や `indonesianChecked` の重複booleanは作らない。`review.languageId=pending_native_review` は未確認であり、PASSではない。

## 3. 自動検査

- [ ] JSON Schemaに適合する。
- [ ] IDが一意で、正答IDが選択肢に存在する。
- [ ] パイロットは `schemaVersion: "0.4.0"`、非パイロットは `0.3.0` のままである。
- [ ] 問題、全選択肢、解説、全選択肢理由に `ja`、`easyJa`、`id`、`rubyJa` がある。
- [ ] `ja` と `rubyJa[].text` の連結が一致する。
- [ ] 漢字を含むruby segmentにreadingがある。
- [ ] すべての選択肢IDに理由がある。
- [ ] 重要語が1〜5語で、用語集IDが解決する。
- [ ] `questionPattern` と `languagePointKeys` がある。
- [ ] 教材名、版、PDFページ、章がある。
- [ ] reviewの必須観点に欠落がない。
- [ ] `review.languageId != pass` の問題数を「未確認翻訳数」として出力する。
- [ ] PDF不在時はバイナリ・ページ・アンカー検証をSKIPとして明示し、確認済みに昇格させない。
- [ ] 完全重複・近似重複を報告する。

## 4. 出典・正答レビュー

- [ ] `source.documentTitle` と `edition` が参照教材と一致する。
- [ ] `pdfPage` と `section` が該当箇所を指す。
- [ ] PDFバイナリのSHA-256とページ数を台帳と照合した。
- [ ] 正答の事実、数字、単位、範囲、手順を該当ページで確認した。
- [ ] 時期により変わる情報は `timeSensitive` を確認した。
- [ ] 不正解理由に教材外の推測を足していない。
- [ ] `sourceFactIds` が根拠となる知識カードを指す。

判定:

- すべて確認済み: `review.content=pass`、状態遷移条件を満たす場合のみ `source_checked`
- PDF不在・版不明・ページ不一致: `pending` または `fail`

## 5. 日本語・ふりがなレビュー

- [ ] 日本語問題は主教材として単独で成立する。
- [ ] 問題文は何を選ぶか明確である。
- [ ] 否定・例外・最上級・選択数が曖昧でない。
- [ ] 選択肢の文法構造と情報量が不自然に偏らない。
- [ ] 問題、選択肢、解説の全対象漢字に確認済みの読みがある。
- [ ] 同一専門語の読みが用語集と一致する。
- [ ] やさしい日本語が意味・条件を変えていない。
- [ ] `languagePointKeys` が実際の問題文型と一致する。

判定:

- 日本語: `review.languageJa=pass|pending|fail`
- ふりがな: `review.furigana=pass|pending|fail`
- 日本語教材性: `review.japaneseLearning=pass|pending|fail`

## 6. インドネシア語ネイティブレビュー

- [ ] 全文訳が日本語の意味と一致する。
- [ ] 数字、単位、否定、例外、比較、義務・禁止が一致する。
- [ ] 専門語が共通用語集と一致し、必要な日本語・読みを併記する。
- [ ] 4つの選択肢で用語と文体が統一されている。
- [ ] 設問意図は選び方だけを示し、答えを含まない。
- [ ] 正答理由と各不正解理由が自然で正確である。
- [ ] 逐語訳臭、意味不明、過度に長い文を修正した。
- [ ] 日本語確認者とは別のネイティブ確認記録がある。

判定:

- 機械翻訳・初稿のみ: `pending_native_review`
- ネイティブ確認済み: `pass`
- 意味の誤りあり: `fail`

## 7. answer leakレビュー

回答前のLevel 3表示を、問題・全文訳・設問意図・重要語・例文・全選択肢訳まで並べて確認する。

- [ ] 正解選択肢だけ説明が長い、具体的、自然になっていない。
- [ ] 全文訳へ正答語や正答条件を追加していない。
- [ ] 設問意図が正解の内容を説明していない。
- [ ] 重要語の定義・例文が当該問題の正解を直接示さない。
- [ ] 重要語の選定・組合せだけで、正解候補を特定したり消去法で一つに絞ったりできない。
- [ ] 否定強調は設問条件だけを示し、選択肢を誘導しない。
- [ ] 正答理由、選択肢別理由、memory pointが回答前DOMに存在しない。

判定: `review.answerLeak=pass|pending|fail`

## 8. 著作権・権利レビュー

- [ ] 問題、選択肢、解説は独自表現である。
- [ ] 公式PDF本文、確認問題、写真、図、ロゴを大量転載していない。
- [ ] 画像は独自作成または利用条件を記録した資産である。
- [ ] 民間サイトの問題・解説・画像・コードを転載していない。
- [ ] 教材名、版、ページ、章を示している。
- [ ] `rights.usesOfficialImage=false`、`usesCompetitorContent=false` と実態が一致する。

判定: `review.legalRights=pass|pending|fail`

## 9. UI・学習履歴レビュー

- [ ] Level 3、2、1、0が [学習支援レベル仕様](LEARNING_SUPPORT_SPEC.md) 通りに表示される。
- [ ] 重要語、全文訳、選択肢訳、回答後インドネシア語の開閉が `openedKeywords`、`openedQuestionTranslation`、`openedChoiceTranslations`、`openedAnswerIndonesian` へ保存される。
- [ ] ふりがな、やさしい日本語、インドネシア語の既存履歴が維持される。
- [ ] 解答時間と誤答理由 `knowledge` / `japanese` が保存される。
- [ ] 「日本語だけでもう一度解く」が元履歴を上書きしない。
- [ ] 言語と支援レベルが再起動後も維持される。
- [ ] 360px幅で横スクロール、文字重なり、ボタン欠けがない。
- [ ] JavaScript console/page errorがない。

## 10. 模擬試験ゲート

UI言語をインドネシア語、保存支援レベルをLevel 3にしてから模擬試験を開始する。

- [ ] 問題文と選択肢は日本語だけである。
- [ ] `<ruby>` / `<rt>` がDOMにない。
- [ ] `[lang="id"]` の教材コンテンツがDOMにない。
- [ ] やさしい日本語、重要語、設問意図、翻訳ボタン、支援toggleがない。
- [ ] 採点前に正誤、正答、解説、選択肢別理由がない。
- [ ] 50問・60分、問題移動、中断復帰、採点が従来通り動く。

## 11. 昇格条件

```text
draft / candidate
  ↓ 出典・日本語・ふりがな・教材性・権利レビュー
source_checked
  ↓ インドネシア語ネイティブ確認 + answer leak確認
language_checked
  ↓ 利用者テスト + 最終承認
approved
```

- 自動検査PASSは人によるレビューの代替ではない。
- 1観点でも `pending` / `pending_native_review` / `fail` があれば `approved` にしない。
- このbranchでは代表16問のパイロット品質確認までを行い、全80問展開、全80問approved化、mergeは行わない。
