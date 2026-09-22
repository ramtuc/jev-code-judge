# Jev Code Judge

コードへMutationを段階的に加え、Jevの本番投入判定が変化する地点を観察する実験アプリです。

Production、Security、Maintainabilityの3つの判定観点、累積・独立Mutation、1・3・5回の反復試行に対応しています。実験結果はCSVまたはJSONで保存できます。

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## 記事と実験データ

Qiita向けの原稿、実測データ、スクリーンショットは[`docs/article`](docs/article)に保存しています。実験の再実行コマンドは[`docs/article/README.md`](docs/article/README.md)を参照してください。

## 判定モード

### ローカルシミュレーター

APIキーが設定されていない場合に使用します。ルールベースの模擬判定なので、画面開発やMutationの動作確認には利用できますが、実験結果としては扱いません。

### Jev Live：Vercel AI Gateway

TypeSafe AIの直接アクセスを待たずに利用できます。VercelでAI GatewayのAPIキーを発行し、`.env.example`を`.env.local`へコピーして次のように設定します。

```dotenv
JEV_PROVIDER=vercel
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
```

APIキーはサーバー側からのみ参照され、ブラウザへは送信されません。キー設定後に開発サーバーを再起動すると、画面右上に`JEV READY`と表示されます。`Run judgment`またはMutationボタンで最初の実判定を行うと、表示が`JEV LIVE`へ変わります。ページを表示しただけではAPIを呼び出しません。

Vercel経由では、`https://ai-gateway.vercel.sh/v1/evaluate`の`typesafe-ai/jev`を使用します。

### Jev Live：TypeSafe AIへ直接接続

TypeSafe AIのAPIキーを取得できた場合は、次の設定へ切り替えます。

```dotenv
JEV_PROVIDER=typesafe
TYPESAFE_API_KEY=your_typesafe_key
```

直接接続では、`https://api.typesafe.ai/v1/systemone`の`jev-latest`を使用します。

どちらの接続先でも、APIがエラーになった場合はローカル判定へ自動的には切り替えません。実測値と模擬値を同じ履歴へ混ぜないためです。エクスポートには接続元として`vercel-ai-gateway`または`jev-direct`を記録します。

## Mutation

- Replace type with `any`
- Remove validation
- Swallow exception
- SQL concatenation
- Add `eval`

各Mutationの適用後に判定を実行し、`SHIP`、`CAUTION`、`REJECT`のスコア、リスクシグナル、経過時間、トークン使用量を記録します。結果はCSVまたはJSONで出力できます。

## 検証

```bash
npm run lint
npm run build
```

詳しい実験計画は[kikaku.md](./kikaku.md)を参照してください。
