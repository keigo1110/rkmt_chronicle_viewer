# Implementation Plan (Derived from `plan.md`)

## Goal

大判作品画像を、Vercel上で高速に鑑賞できる体験にする。  
要件は以下:

- Deep Zoom (地図品質のパン/ズーム)
- OCR検索 (即時候補)
- ヒット位置へのジャンプ + ハイライト
- 共有リンク (`?q=...`)
- モバイル操作の安定性

## Build Plan

1. Asset pipeline
- 入力: `images/source.png` (10198x3164)
- 出力:
  - `public/tiles/timeline.dzi`
  - `public/tiles/timeline_files/**`
  - `public/ocr/entries.json`

2. Viewer app
- Next.js App Routerで静的ページを構築
- OpenSeadragonでDZIを表示
- 検索UI + キーボード操作 + 結果巡回
- bbox overlayハイライト

3. Deploy readiness
- Next.js production build成功
- Vercelでそのままビルド可能な設定
- タイル/OCR静的配信キャッシュヘッダ

## Implementation Notes

- `vips`非依存で動くように、Deep Zoom生成は`ffmpeg`ベースの自前スクリプトで実装
- OCRは`tesseract` TSVを行/単語でインデックス化し、`norm`を付与
- OCR補正は`data/ocr-overrides.json`で手動上書き可能

## Validation

- 生成済みアセット:
  - tiles: 725 files / 約8.3MB
  - OCR index: 474 entries
- `npm run build` 成功 (Static prerender)

