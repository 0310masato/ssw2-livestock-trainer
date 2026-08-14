# 問題解説・日本語ポイント作成方針

関連文書: [README](../README.md) / [教材設計概要](PEDAGOGY_SPEC.md) / [学習支援レベル仕様](LEARNING_SUPPORT_SPEC.md) / [翻訳ガイド](INDONESIAN_TRANSLATION_GUIDE.md) / [レビュー・チェックリスト](CONTENT_REVIEW_CHECKLIST.md)

## 1. 目的

解説は「正答を知らせる」だけでなく、畜産知識と試験日本語の両方を振り返れる構造にする。事実根拠は版管理された公式教材に限定し、学習支援としての説明と出典事実を混同しない。

## 2. 回答後に必ず示す構成

1. 正解の選択肢
2. なぜ正しいか
3. 各不正解選択肢がなぜ違うか
4. 重要語1〜5語
5. 問題文で使われた日本語文型・日本語ポイント
6. 教材名、版、PDFページ、章

既存フィールドを次のように再利用する。

- 正答・要約説明: `correctChoiceId` と `explanation`
- 全選択肢の理由: `choiceRationales[choiceId]`
- 重要語: `learningSupport.keyTermIds`
- 文型: `learningSupport.questionPattern` と `languagePointKeys`
- 学習目標・記憶点: `lessonObjective` と `memoryPoint`
- 出典: `source`

正答用に `whyCorrectIdn`、不正解用に `whyWrongIdn` を重複新設せず、選択肢IDで対応する `choiceRationales` を使う。

## 3. 正答理由

- 「Aが正解です」だけで終わらず、正答を支える教材上の事実・数値・手順を短く説明する。
- 問題文と同じ文を繰り返すだけにしない。
- 教材にない因果関係、経験則、例外、最新制度を補わない。
- 数字と単位は問題・選択肢・出典と照合する。
- `ja`、`easyJa`、`id`、`rubyJa` を揃える。

## 4. 不正解理由

- すべての選択肢IDに `choiceRationales` を用意する。正解選択肢にも正答理由を持たせる。
- 何が違うかを、対象、数値、単位、順序、否定、条件のいずれかで特定する。
- 出典が個別の誤り理由を述べていない場合は、「出典教材の記述と一致しない」とし、推測で説明を追加しない。
- 不正解の説明で別の誤情報を学習させない。
- インドネシア語だけが正答を強く示す表現になっていないか確認する。

## 5. 設問意図

設問意図は、何を選ぶ問題かだけを伝え、知識内容や正解条件を先取りしない。

- 単一選択: `Pilih satu jawaban yang paling tepat/benar.`
- 誤り選択: `Pilih pernyataan yang salah.`
- 全選択: `Pilih semua jawaban yang benar.`
- 手順: `Pilih tindakan atau urutan yang sesuai.`
- 計算: `Hitung lalu pilih hasil yang sesuai.`

選択数はデータの `type` と一致させる。現行パイロットがすべて単一選択なら「すべて選ぶ」を見せない。

## 6. 日本語ポイント

`learningSupport.languagePointKeys` は英語snake_caseのキーを使用し、画面文言は日本語・インドネシア語の定義辞書から表示する。パイロットで使用可能なキーは次のとおりとする。

- 重点キー: `most_appropriate`, `incorrect`, `inappropriate`, `prohibited`, `always`, `except`, `in_principle`, `select_all`
- 補助キー: `before_after`, `purpose`, `procedure_first`, `not_included`, `condition`, `at_least`, `calculation`, `correct_statement`, `according_to_source`, `not_listed`, `only`, `most_of`

1問に、その問題の理解に必要なキーだけを付ける。将来キーを増やす場合は表示辞書、翻訳、テストを同じ変更で追加する。

### 否定問題

- 日本語の否定部分と、対応するインドネシア語を両方強調する。
- `incorrect`、`inappropriate`、`except`、`not_included`、`not_listed` 等を付ける。
- 色だけに頼らず、太字・ラベル・補足文を併用する。
- 強調により正答選択肢を示さない。

## 7. 出典表示と著作権

- `source.documentTitle`、`edition`、`pdfPage`、`section` を表示する。
- PDFページと冊子ページが異なる場合は混同しない。冊子ページは値がある場合だけ補足する。
- 問題文、選択肢、解説は独自表現とし、公式教材の本文、図、写真、確認問題、ロゴを大量転載しない。
- 出典ページを示すことは、内容確認済みであることの代替ではない。
- PDFバイナリとアンカーを確認できない環境では、`review.content` を自動でpassへ変更しない。

## 8. 回答前後の境界

- 回答前: 問題文、支援レベルで許可された補助、選択肢のみ。
- 回答後: 正誤、正答理由、全選択肢理由、重要語、日本語ポイント、出典。
- 正答理由、不正解理由、memory pointを回答前DOMへ埋め込まない。
- 模擬試験中は採点まで解説を表示しない。

## 9. レビュー判定

- 出典内容: `status` と `review.content`
- 日本語品質: `review.languageJa`
- ふりがな: `review.furigana`
- 日本語教材性: `review.japaneseLearning`
- インドネシア語: `review.languageId`
- answer leak: `review.answerLeak`
- 権利: `review.legalRights`
- 利用者最終判断: `review.approvalByUser`

どれかが `pending` または `fail` なら、正式な `approved` にしない。
