# 記事素材

Qiita記事と、その根拠となるスクリーンショット・実験データを保存するディレクトリです。

## 構成

- `qiita-draft.md`: Qiitaへ転載する本文
- `assets/`: 記事用スクリーンショット
- `data/`: UIから書き出した実測CSV・JSON

## スクリーンショットの再作成

まず、撮影対象のモードで開発サーバーを起動します。

```bash
npm run dev
```

別のターミナルから次を実行します。

```bash
npm run capture:article
```

この処理はClean判定とMutationボタンを操作するため、`JEV_PROVIDER=vercel`の場合は合計9回のAPIリクエストが発生します。画面確認だけなら、一時的に`JEV_PROVIDER=typesafe`としてローカルシミュレーターを使います。

記事へ掲載する最終画像は、Vercel AI Gateway経由の実測画面へ差し替えます。シミュレーター画像はレイアウト確認にのみ使用します。

## 独立Mutation実験

`any`以外の4種類をそれぞれ3回評価し、結果と比較画面を保存します。Vercel AI Gatewayを使用する場合は合計12回のAPIリクエストが発生します。

```bash
npm run experiment:isolated
```

## 質問別比較・修正実験・ESLint比較

```bash
npm run experiment:perspectives
npm run experiment:repair
npm run experiment:eslint
```

質問別比較は9回、修正実験は18回のAPIリクエストが発生します。ESLint比較はローカル処理だけで完結します。
