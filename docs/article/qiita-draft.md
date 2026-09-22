---
title: コードを少しずつ壊して、Jevが「本番NG」と言い出す境界を探した ― 48回の審査で見えた3つの意外
tags:
  - Jev
  - TypeScript
  - Next.js
  - AI
  - コードレビュー
private: true
updated_at: ""
id: ""
organization_url_name: null
slide: false
ignorePublish: false
---

正常な TypeScript の関数に、`any`・入力検証の削除・例外の握りつぶし・SQL 文字列結合・`eval()` を一つずつ足していき、そのたびに判断特化 AI「Jev」に「このコード、本番に出していい？」と聞きました。合計 48 回。スコアが変わる地点、つまり Jev の中の「境界」を探す実験です。

先に、いちばん面白かったところを 3 つ。

1. **壊すほど悪くなるとは限らない。** `any` を 1 個入れると REJECT スコアは 42 → 50 で「REJECT」判定。ところが次に入力検証を消したら 46 に**下がって**「CAUTION」に戻りました。独立実験でも修正実験でも同じ方向に動いたので、偶然ではなさそうです
2. **100 に張り付いたら、それ以上は見えない。** SQL 文字列結合で REJECT は 100。そこに `eval()` を足しても 100 は 100。逆に全部壊した状態から `eval()` だけ消しても 100 のままでした
3. **1 点差で有罪と無罪が分かれる。** `any` 入りのコードを 3 回聞くとスコアは 47・48・49。ラベルは CAUTION・CAUTION・REJECT。数字はほぼ同じなのに、判定は割れます

それぞれ「何を見てそう判断したか」も、Jev が返すシグナルから読めました。順番に書きます。

## Jev とは ― 「説明しない審査員」

初見の方向けに、TypeSafe AI の紹介ブログとドキュメント（2026-09-22 取得）から要点だけ。

Jev は TypeSafe AI が 2026 年 9 月 15 日に公開した **System One モデル**の第 1 号です。System One という名前は Kahneman の「速い思考／遅い思考」から来ていて、「知識のある人が 1 秒で下せる判断」を、文章を生成せずに返すことに特化しています。質問の型は 3 つだけ。

| 型 | 答えるもの | 返ってくる値 |
| --- | --- | --- |
| **Choice** | 選択肢のどれか | `choice`（最も確率の高い選択肢）・全選択肢の `probabilities`・`confidence` |
| **Score** | 段階のどこか | `score`・段階ごとの確率・`confidence` |
| **Noul**（Vercel では `boolean`） | Yes か No か | Yes の確率 0〜1 |

ポイントは、**答えが常に確率つきで返ってくる**ことです。公式は RLCD（Reinforcement Learning for Calibrated Decisions）という学習法で、この確率が校正されている（0.8 と言ったら 8 割は当たる）と説明しています。文字列を生成しないので型エラーが起きず、公式ブログの数字では応答 70〜500 ms、入力 $0.042/MTok・出力無料。1 リクエストに複数の質問を入れると並列に評価されます。

LLM にコードレビューをさせると「この行が危険です。理由は…」と説明が返ってきますが、Jev は説明しません。**返すのは判定とその確率だけ。** 理由を書かない審査員です。だからこそ「なぜそう判断したのか」を知りたければ、こちらが入力を少しずつ変えて反応を観察するしかない。それが今回コードを壊した動機です。

今回は 1 リクエストで 3 問を同時に聞いています。

- Choice `production_verdict`：`SHIP` / `CAUTION` / `REJECT` ── この確率を 0〜100 に丸めたものが記事中の**スコア**、`choice` が**判定**
- Noul `has_security_risk`・`has_maintainability_risk` ── 確率 50% 以上のとき「セキュリティリスク 97%」のように**シグナル**として記録（今回のアプリの閾値）

## 準備：直接アカウントは満員だったので Gateway 経由

イベントページが挙げる経路は TypeSafe AI 直接・OpenRouter・Vercel AI Gateway・Cloudflare Workers AI の 4 つ。本命の TypeSafe 直接は、サインアップ画面に「Whoops, we're full」と出て入れませんでした（イベントページの案内では Waitlist 登録が必要）。

![TypeSafe のサインアップ画面。Whoops, we're full と表示されている](https://raw.githubusercontent.com/ramtuc/jev-code-judge/main/docs/article/assets/typesafe-waitlist-full.png)

そこで今回は **Vercel AI Gateway** の `typesafe-ai/jev`（`/v1/evaluate`）を使いました。キーを 1 本発行して環境変数に入れるだけで、その日のうちに実験を始められます。

## 作ったもの

実験用の Web アプリ「Jev Code Judge」です。左が評価対象のコード、右が Jev の判定。Mutation ボタンを押すとコードが書き換わり、その場で再審査されます。

![Jev Code Judge。左にコード、右に CAUTION 56% の判定と保守性リスク 57% のシグナル](https://raw.githubusercontent.com/ramtuc/jev-code-judge/main/docs/article/assets/crop/01-overview-clean.png)

Next.js + React + TypeScript、エディタは Monaco、グラフは Recharts。実装で気をつけたのは 3 点だけです。

- ページを開いただけでは API を呼ばない（Run か Mutation ボタンを押したときだけ課金リクエストが飛ぶ）
- 全試行に Mutation の順序・モード・プロンプト版・トークン数・処理時間を保存し、CSV / JSON で書き出せる
- 累積 / 独立、Production / Security / Maintainability、1 / 3 / 5 回試行を UI で切り替えられる

ソースコードと実測データは [ramtuc/jev-code-judge](https://github.com/ramtuc/jev-code-judge) に公開しています。設計の話（Gateway の設定手順、キーをサーバー側だけに置く構成、シミュレーターとの切り替え、ハマりどころ）は別記事に分けました → [判断特化 AI『Jev』でコードを壊す実験アプリを作った｜Next.js＋Vercel AI Gateway の設計とハマりどころ](https://electwork.net/posts/jev-code-judge-nextjs-vercel-ai-gateway/)

## 実験の型

対象は、入力検証・型・DB アクセス・例外処理がひととおり入った小さな関数です。

```ts
type User = {
  id: string;
  email: string;
};

export async function findUser(id: string): Promise<User | null> {
  if (!id.trim()) {
    throw new Error("id is required");
  }

  try {
    const result = await db.query(
      "SELECT id, email FROM users WHERE id = ?",
      [id]
    );

    return result.rows[0] ?? null;
  } catch (error) {
    logger.error({ error, id }, "Failed to find user");
    throw error;
  }
}
```

壊し方は 5 つ。`id: any` にする／`if (!id.trim())` を消す／`catch { return null; }` にする／SQL をテンプレート文字列で結合する／`eval(id)` を足す。ここでいう Mutation は Mutation Testing の用語ではなく、「評価対象を意図的に少し変える」という意味です。実際の変更は次の節で 1 つずつ示します。

聞き方は 2 通り。**累積**は上から順に積み重ねて判定が反転する地点を見る（各段階 1 回）。**独立**は Clean なコードに 1 つだけ入れて、その壊し方単体の効き目を見る（各 3 回）。累積だけだと「4 個目だから REJECT」なのか「SQL 結合に反応した」のか区別できず、独立だけだと重なったときの挙動が見えないので、両方やります。

質問は「このコードを本番にデプロイして問題ないか」（`production-readiness-v1`）。モデルは Vercel AI Gateway 経由の `typesafe-ai/jev`、実施日は 2026 年 9 月 22 日です。

## 実況：順番に壊していく

### 壊す前から CAUTION だった

何もしない状態で聞くと、判定は CAUTION、REJECT スコアは 42。シグナルは「保守性リスク 57%」。SHIP は 2% しかありません。教科書どおりに書いたつもりの関数でも、Jev は最初から「本番はちょっと待て」と言っていました。

### `any` 1 個で有罪、検証を消したら無罪に戻る

```diff
 type User = {
-  id: string;
+  id: any;
   email: string;
```

`id: any` にすると REJECT は 50 で判定は REJECT。保守性リスクは 57% → 74% に上がります。ここまでは想像どおり。

```diff
 export async function findUser(id: string): Promise<User | null> {
-  if (!id.trim()) {
-    throw new Error("id is required");
-  }
 
   try {
```

次に入力検証の `if` を消しました。予想は「もっと悪くなる」。結果は REJECT 46、判定は CAUTION。**下がった**んです。保守性リスクは 74% のまま、セキュリティリスクは 50% 未満。

### 審査員が黙った瞬間

```diff
-  } catch (error) {
-    logger.error({ error, id }, "Failed to find user");
-    throw error;
+  } catch {
+    return null;
   }
```

```diff
     const result = await db.query(
-      "SELECT id, email FROM users WHERE id = ?",
-      [id]
+      `SELECT id, email FROM users WHERE id = '${id}'`
     );
```

例外を握りつぶすと 61（REJECT）、保守性リスク 77%。そして SQL を文字列結合にした瞬間、REJECT 100・CAUTION 0・SHIP 0。ここで初めて「セキュリティリスク 97%」が点灯し、保守性リスクも 93% に跳ねました。

```diff
 export async function findUser(id: string): Promise<User | null> {
 
+  eval(id);
+
   try {
```

その上に `eval()` を足しても、REJECT は 100 のまま。シグナルだけが 97% → 98%、93% → 96% と微かに動きました。スコアの天井で差が消える、というのはこのことです。

5 つ全部を入れた状態の全文です。

```ts
type User = {
  id: any;
  email: string;
};

export async function findUser(id: string): Promise<User | null> {

  eval(id);

  try {
    const result = await db.query(
      `SELECT id, email FROM users WHERE id = '${id}'`
    );

    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}
```

![Clean（左）と全部壊した状態（右）の判定パネル。CAUTION 56% から REJECT 100% へ](https://raw.githubusercontent.com/ramtuc/jev-code-judge/main/docs/article/assets/crop/verdict-clean-vs-all.png)

## 1 点差で有罪と無罪が分かれる

「検証を消すと下がる」が本当かを確かめるため、Clean に 1 つだけ壊し方を入れて 3 回ずつ聞きました。

![累積と独立の REJECT スコア。右は境界付近のズームで、47〜53 の範囲でラベルが CAUTION と REJECT に割れている](https://raw.githubusercontent.com/ramtuc/jev-code-judge/main/docs/article/assets/fig-reject-scores.png)

- `any`：47・48・49（平均 48.0）── ラベルは CAUTION・CAUTION・**REJECT**
- 入力検証を削除：33・37・37（平均 35.7）── Clean の 42 より低い。3 回とも CAUTION
- 例外を握りつぶす：67・71・64（平均 67.3）── 3 回とも REJECT
- SQL 文字列結合：100・100・100／`eval()`：100・100・100

入力検証を消したコードは、単体でも Clean より低い。累積のときの「下がった」は偶然ではありませんでした。

![any を 3 回聞いた結果。47% CAUTION、48% CAUTION、49% REJECT](https://raw.githubusercontent.com/ramtuc/jev-code-judge/main/docs/article/assets/crop/02-runs-any-x3.png)

`any` の 3 回はスコアの幅が 3 点で、ラベルが割れました。しかもこの 3 回目は「CAUTION 50・REJECT 49」の表示で REJECT。修正実験には同じ表示で CAUTION の試行もあります。アプリは確率を整数に丸めているので、表示の 1 点は生の確率の細かい差を潰しています。公式ドキュメントでは `choice` は最も確率の高い選択肢とされていますが、生の確率を保存していなかったので、この 1 件がどう決まったかは追えていません。境界の上に立っているコードでは、**ラベルは 1 回聞いただけでは信用できない**。これが実務上の結論です。

## 何を見て判定を変えたか

Jev は理由を書きませんが、同時に聞いていた 2 つの Noul が、何に反応したかをかなり素直に映していました。独立実験 3 回の範囲でまとめます。

| 壊し方（単体） | REJECT 平均 | セキュリティリスク | 保守性リスク |
| --- | ---: | ---: | ---: |
| Clean（参考・1 回） | 42 | 50% 未満 | 57% |
| `any` | 48.0 | 50% 未満 | 72〜74% |
| 入力検証を削除 | 35.7 | 50% 未満 | 53〜56% |
| 例外を握りつぶす | 67.3 | 50% 未満 | 74〜75% |
| SQL 文字列結合 | 100 | 97% | 92〜93% |
| `eval()` | 100 | 93〜94% | 92〜93% |

※ セキュリティリスク・保守性リスクは Noul の「Yes の確率」です。今回のアプリは 50% 以上のときだけ値を記録し、50% 未満の実値は保存していないため、表では「50% 未満」としか書けません（Jev が答えなかったわけではありません）。

- **REJECT を 100 に押し上げたのはセキュリティリスクの点灯。** SQL 結合と `eval()` だけがこの Noul を 50% 以上にしました
- **それ以外の壊し方は保守性リスクで見ている。** `any` と例外の握りつぶしは 57% → 72〜75% に上がり、REJECT スコアもそれに連れて動いています
- **入力検証を消すと保守性リスクまで下がる**（57% → 53〜56%）。REJECT スコアが下がったのはこのためです

3 つ目の理由は分かりません。所感としては、`if (!id.trim()) throw` が消えて関数が短くなったことを「保守しやすい」側に読んだのかな、と思っています。仮説なので、早期 `return null` にした版など別の書き方で追試したいところです。

## 観点を変えて聞く

同じ SQL 文字列結合のコードを、質問だけ変えて 3 回ずつ。Production（本番に出せるか）は 100・100・100、Security（セキュリティレビューを通るか）も 100・100・100、Maintainability（長期保守に耐えるか）は 80・82・85（平均 82.3）でした。

![Maintainability 観点の判定。REJECT 82%、セキュリティリスク 96%、保守性リスク 93%](https://raw.githubusercontent.com/ramtuc/jev-code-judge/main/docs/article/assets/crop/06-verdict-maintainability.png)

保守性の観点でも REJECT は REJECT ですが、100 ではなく 82。「何を判定させるか」を変えると、同じコードでもスコアが 2 割動きます。質問文はプロンプト版として固定し、変えたらベースラインを取り直す必要があります。

## 直すと戻るか

最後に、全部壊した状態から 1 つずつ元に戻しました。各段階 3 回です。

![修正実験の推移。eval 削除では 100 のまま、SQL パラメータ化で 51 に落ち、例外処理復元で 38、入力検証復元で 48 に上がり、型復元で 45](https://raw.githubusercontent.com/ramtuc/jev-code-judge/main/docs/article/assets/fig-repair.png)

`eval()` を消しても 100・100・100（シグナルはセキュリティ 98 → 97%、保守性 96〜97 → 93% と下がる）。SQL をパラメータ化した瞬間に 49・53・51（平均 51.0）まで落ちてセキュリティリスクが消え、例外処理を戻すと 38・39・38。ここまでは順当です。

ところが入力検証を戻すと 47・47・51（平均 48.3）に**上がる**。型を戻して Clean に戻すと 43・48・45（平均 45.3）で 3 回とも CAUTION でした（修正実験の最終コードは書式だけ圧縮した同内容）。

最大の変化は SQL のパラメータ化で 100 → 51。`eval()` を消しただけでは天井に隠れて何も見えません。重大な問題が 2 つあるとき、1 つ直した効果はスコアに出ない、ということです。そして入力検証については、累積・独立・修正の 3 つの実験すべてで「無い方が低リスク」。ここまで揃うと、Jev の癖というより、こちらの質問文と criteria が「堅牢性」を含んでいないと考える方が自然だと思っています。

## 速度とコスト

イベントの主題である「高速・低コスト」も数字を残しました。data/ に記録された 47 回分（画面上だけの Clean 1 回を除く）の集計です。

| 項目 | 値 |
| --- | --- |
| 呼び出し回数 | 47 回（＋Clean 1 回） |
| 1 回あたりの所要時間 | 平均 382 ms・中央値 358 ms・最小 292 ms・最大 926 ms |
| 400 ms 以内に返った回数 | 37 / 47 回 |
| 入力トークン | 合計 29,091（1 回平均 619） |
| 出力トークン | 合計 4,025（1 回 85 か 87） |
| 47 回の合計所要時間 | 18.0 秒 |

所要時間はアプリが記録した 1 リクエストの往復（日本から Vercel AI Gateway 経由）です。3 問を同時に聞いても出力は 85 トークン前後で固定。「文章を生成しない」というのはこういう数字になるんだな、というのが実感でした。

費用は、Vercel AI Gateway の Jev モデルページ（2026-09-22 取得）で入力・出力ともに **Free**、「Promotional pricing ends on September 25, 2026」と表示されています。つまりこの実験の Gateway 側の費用は 0。9 月 26 日以降の Gateway 単価は未確認です。参考までに TypeSafe 直接契約の公表単価（入力 $0.042/MTok・出力無料）で計算すると、48 回・入力 29,728 トークンで **$0.0012**。桁を数え直すほど安い。

## ESLint との違い

:::note info
比較用に `no-eval` と `@typescript-eslint/no-explicit-any` を有効にした ESLint に同じコードを通すと、検出できたのは `any` と `eval()` の 2 つだけ。入力検証の削除・例外の握りつぶし・SQL 文字列結合はルールが無いので素通りです。これは性能の話ではなく役割の違いで、ESLint は決めた構文を漏れなく検査し、Jev はコード全体を質問に沿って採点します。SQL Injection には専用ルールや Semgrep を足すべきで、Jev は静的解析の代わりにはなりません。
:::

## 限界

- サンプルコードは 1 種類。Jev 全体の性能評価ではありません
- 確率が校正されているかは公式の説明であって、この実験では検証していません
- 生の確率と `confidence` を保存していないため、境界の 1 件は追跡できていません
- 累積実験では壊し方同士が相互に影響し、判定はプロンプト表現とモデル更新の影響を受けます

## 今後：実用にするには

観察した事実から、そのまま導ける範囲だけ書きます。

1. **スコア単体で閾値にしない。** 壊すほど上がるとは限らず、境界の上では 1 点差でラベルが割れました。同じ入力を N 回投げて多数決を取る、迷ったら CAUTION 側に倒す、といった運用の方が実測の挙動に合っています
2. **PR 全体ではなく差分単位で聞く。** SQL 結合で 100 に張り付くと `eval()` の追加も削除も見えなくなりました。hunk 単位や関数単位で判定すれば、重大な 1 箇所が他の情報を塗り潰すのを避けられます
3. **lint で取れるものは lint に任せる。** `any` と `eval()` は ESLint が確実に拾い、入力検証の削除・例外の握りつぶし・SQL 結合は拾えませんでした。Jev はこの「lint に書けない設計や検証の抜け」に絞る方が役割がはっきりします
4. **PR ゲートに置けるか。** 実測は 1 回 382 ms・入力 619 トークン（15 行の関数）。差分 10 箇所 × 3 回 = 30 回として直列でも約 11 秒、入力 1.9 万トークン。TypeSafe の公表単価なら $0.0008、Gateway は 9 月 25 日までのプロモーション価格では 0 でした（その後は未確認）。CI の 1 ステップとしては現実的な重さで、あとは差分が長くなったときのトークン増を見ればよさそうです
5. **シグナルで振り分け、最終判断は人。** セキュリティリスクが 50% を超えたらセキュリティ担当へ、保守性だけなら通常レビューへ、という振り分けは今回の 2 つの Noul でそのまま組めます。マージするかどうかを Jev に決めさせるのではなく、人が見る順番と観点を決めてもらう使い方です

閾値の置き方、Gateway と GitHub Actions での組み込み、コスト試算の詳細はブログ側で深掘りします → [判断特化 AI『Jev』でコードを壊す実験アプリを作った｜Next.js＋Vercel AI Gateway の設計とハマりどころ](https://electwork.net/posts/jev-code-judge-nextjs-vercel-ai-gateway/)

## まとめ

「壊していけばスコアが単調に上がる」という最初の仮説は外れました。入力検証を消すと下がり、SQL 結合で天井に張り付き、境界の上では 1 点差でラベルが割れる。その一方で、同時に聞いていたシグナルを見れば「セキュリティリスクが点灯したから 100」「保守性リスクが上がったから 61」と、理由を書かない審査員の判断を外側からかなり読めました。

説明を返さないぶん 1 回 360 ms（中央値）・出力 85 トークンで、48 回投げても $0.0012（Gateway のプロモーション期間中は 0）。この速さと安さは「1 回聞いて信じる」ためではなく、**何度も聞いて分布を見る**ために使うものだと思います。次は質問文を変えて「入力検証を消すと下がる」が消えるかと、生の確率を保存して境界の 1 件を追いかけるところからやります。

## 参考

- [TypeSafe AI](https://typesafe.ai/)
- [Introducing System One Models & Jev（TypeSafe AI Blog・2026-09-15）](https://typesafe.ai/blog/introducing-system-one-models-and-jev) ── 2026-09-22 取得
- [TypeSafe AI Docs：Primitives](https://docs.typesafe.ai/primitives)・[Choice](https://docs.typesafe.ai/primitives/choice)・[Confidence](https://docs.typesafe.ai/confidence)・[AI primer（RLCD）](https://docs.typesafe.ai/introduction/machine-learning-primer) ── 2026-09-22 取得
- [Vercel AI Gateway：Jev モデルページ](https://vercel.com/ai-gateway/models/jev) ── 2026-09-22 取得（Price Free・Promotional pricing ends on September 25, 2026）
- [Qiita 公式イベント「あなたはもう試した？判断特化AI『Jev』で遊ぼう！」](https://qiita.com/official-events/dc6e42e0897543216e34)
- [Jev Code Judge のソースコードと実測データ](https://github.com/ramtuc/jev-code-judge)
- [判断特化 AI『Jev』でコードを壊す実験アプリを作った｜Next.js＋Vercel AI Gateway の設計とハマりどころ（electwork.net）](https://electwork.net/posts/jev-code-judge-nextjs-vercel-ai-gateway/)
