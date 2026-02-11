# Chronicle Viewer

10K級作品画像をDeep Zoom配信し、OCR検索から該当位置へジャンプできるビューワーです。  
`plan.md`の方針に沿って、Vercelでそのまま公開できる構成にしています。

## Tech stack

- Next.js (App Router)
- OpenSeadragon (Deep Zoom viewer)
- Fuse.js (クライアント側あいまい検索)
- ffmpeg + tesseract (ローカルのアセット生成)

## 1. セットアップ

```bash
npm install
```

## 2. 画像アセット生成

`images/source.png` から以下を生成します。

- `public/tiles/timeline.dzi`
- `public/tiles/timeline_files/**`
- `public/ocr/entries.json`

```bash
npm run prepare:assets
```

個別実行:

```bash
npm run prepare:tiles
npm run prepare:ocr
```

## 3. 開発

```bash
npm run dev
```

## 4. 本番ビルド

```bash
npm run build
npm run start
```

## 5. Vercelデプロイ

1. このリポジトリをGitHubへpush
2. VercelでImport
3. Build Command: `npm run build`
4. OutputはNext.js標準設定のままでOK
5. デプロイ

## UX仕様

- 初期表示は全体俯瞰、ミニマップ付き
- `/` で検索欄フォーカス
- Enterで該当領域へジャンプ + 一時ハイライト
- `n` / `p` で一致結果を巡回
- `?q=keyword` で共有リンク起動時に検索復元

## OCR補正

`data/ocr-overrides.json` に手動エントリを追加すると、OCR誤認識の補正に使えます。

```json
[
  {
    "id": "manual-001",
    "text": "Incremental Gaussian Splatting",
    "norm": "incremental gaussian splatting",
    "bbox": [8120, 1680, 520, 42],
    "conf": 1,
    "kind": "line"
  }
]
```

