#!/usr/bin/env node

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const DEFAULT_INPUT = "images/source.png";
const DEFAULT_OUTPUT_BASENAME = "public/tiles/timeline";
const TILE_SIZE = 256;
const OVERLAP = 1;
const JPG_QUALITY = 3;

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function runCapture(command, args) {
  return execFileSync(command, args, { encoding: "utf8" });
}

function getDimensions(inputPath) {
  const json = runCapture("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    inputPath
  ]);
  const parsed = JSON.parse(json);
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error("Could not detect image dimensions.");
  }
  return { width: Number(stream.width), height: Number(stream.height) };
}

function ensureClean(targetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
}

function levelSize(original, level, maxLevel) {
  const factor = 2 ** (maxLevel - level);
  return Math.max(1, Math.ceil(original / factor));
}

function createDziXml(width, height) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Image TileSize="${TILE_SIZE}" Overlap="${OVERLAP}" Format="jpg" xmlns="http://schemas.microsoft.com/deepzoom/2008">
  <Size Width="${width}" Height="${height}"/>
</Image>
`;
}

function main() {
  const inputPath = resolve(process.argv[2] ?? DEFAULT_INPUT);
  const outputBase = resolve(process.argv[3] ?? DEFAULT_OUTPUT_BASENAME);
  const outputDir = dirname(outputBase);
  const tilesRoot = `${outputBase}_files`;
  const dziPath = `${outputBase}.dzi`;

  const { width, height } = getDimensions(inputPath);
  const maxLevel = Math.ceil(Math.log2(Math.max(width, height)));

  mkdirSync(outputDir, { recursive: true });
  ensureClean(tilesRoot);

  const tempRoot = join(tmpdir(), `deepzoom-${Date.now()}`);
  mkdirSync(tempRoot, { recursive: true });

  for (let level = 0; level <= maxLevel; level += 1) {
    const levelWidth = levelSize(width, level, maxLevel);
    const levelHeight = levelSize(height, level, maxLevel);
    const levelDir = join(tilesRoot, String(level));
    const scaledPath = join(tempRoot, `level_${level}.jpg`);

    mkdirSync(levelDir, { recursive: true });

    run("ffmpeg", [
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vf",
      `scale=${levelWidth}:${levelHeight}:flags=lanczos`,
      "-q:v",
      String(JPG_QUALITY),
      scaledPath
    ]);

    const columns = Math.ceil(levelWidth / TILE_SIZE);
    const rows = Math.ceil(levelHeight / TILE_SIZE);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const coreW = Math.min(TILE_SIZE, levelWidth - col * TILE_SIZE);
        const coreH = Math.min(TILE_SIZE, levelHeight - row * TILE_SIZE);

        const leftOverlap = col === 0 ? 0 : OVERLAP;
        const rightOverlap = col === columns - 1 ? 0 : OVERLAP;
        const topOverlap = row === 0 ? 0 : OVERLAP;
        const bottomOverlap = row === rows - 1 ? 0 : OVERLAP;

        const cropX = col * TILE_SIZE - leftOverlap;
        const cropY = row * TILE_SIZE - topOverlap;
        const cropW = coreW + leftOverlap + rightOverlap;
        const cropH = coreH + topOverlap + bottomOverlap;
        const tilePath = join(levelDir, `${col}_${row}.jpg`);

        run("ffmpeg", [
          "-loglevel",
          "error",
          "-y",
          "-i",
          scaledPath,
          "-vf",
          `crop=${cropW}:${cropH}:${cropX}:${cropY}`,
          "-q:v",
          String(JPG_QUALITY),
          tilePath
        ]);
      }
    }
  }

  writeFileSync(dziPath, createDziXml(width, height), "utf8");
  rmSync(tempRoot, { recursive: true, force: true });

  process.stdout.write(`Generated Deep Zoom: ${dziPath}\n`);
}

main();

