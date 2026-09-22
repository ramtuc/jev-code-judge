# 記事素材

Qiita記事と、その根拠となるスクリーンショット・実験データを保存するディレクトリです。

## 構成

- `qiita-draft.md`: Qiitaへ転載する本文（画像は公開リポジトリの raw URL を参照）
- `qiita-draft.v1.md`: 再構成前の原稿（退避）
- `assets/`: 記事用スクリーンショット（1440x1544 の全画面）と `typesafe-waitlist-full.png`
- `assets/crop/`: 全画面スクショから切り出したパネル（`make_figures.py` が生成）
- `assets/fig-*.png`: `data/` から描いた要約図（同上）
- `data/`: UIから書き出した実測CSV・JSON
- `make_figures.py`: 切り出しと要約図の生成スクリプト

## 切り出し画像と要約図の再生成

```bash
py -3.10 docs/article/make_figures.py        # crop と fig の両方
py -3.10 docs/article/make_figures.py crop   # 切り出しだけ
py -3.10 docs/article/make_figures.py fig    # 要約図だけ
```

Pillow と matplotlib が必要です。切り出し座標はスクショが 1440x1544 であることを前提にしています。

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
