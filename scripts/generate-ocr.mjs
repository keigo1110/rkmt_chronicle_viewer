#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const DEFAULT_INPUT = "images/source.png";
const DEFAULT_OUTPUT = "public/ocr/entries.json";
const DEFAULT_OVERRIDES = "data/ocr-overrides.json";
const DEFAULT_LINES_OUTPUT = "public/ocr/lines.json";
const DEFAULT_WORDS_OUTPUT = "public/ocr/words.json";

function normalizeText(input) {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTsv(tsv) {
  const [headerLine, ...rows] = tsv.trim().split(/\r?\n/);
  const headers = headerLine.split("\t");
  return rows.map((row) => {
    const values = row.split("\t");
    const entry = {};
    headers.forEach((key, index) => {
      entry[key] = values[index] ?? "";
    });
    return entry;
  });
}

function groupLines(wordRows) {
  const groups = new Map();

  for (const row of wordRows) {
    const level = Number(row.level ?? 0);
    const text = (row.text ?? "").trim();
    const conf = Number(row.conf ?? -1);
    if (level !== 5 || !text || conf < 20) {
      continue;
    }

    const key = [row.page_num, row.block_num, row.par_num, row.line_num].join(":");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push({
      text,
      conf,
      left: Number(row.left ?? 0),
      top: Number(row.top ?? 0),
      width: Number(row.width ?? 0),
      height: Number(row.height ?? 0),
      wordNum: Number(row.word_num ?? 0)
    });
  }

  const lineEntries = [];
  const wordEntries = [];

  for (const [key, words] of groups.entries()) {
    words.sort((a, b) => a.wordNum - b.wordNum);
    const text = words.map((w) => w.text).join(" ").trim();
    if (!text) {
      continue;
    }
    const norm = normalizeText(text);
    if (!norm) {
      continue;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let confSum = 0;

    for (const word of words) {
      minX = Math.min(minX, word.left);
      minY = Math.min(minY, word.top);
      maxX = Math.max(maxX, word.left + word.width);
      maxY = Math.max(maxY, word.top + word.height);
      confSum += word.conf;
      const wordNorm = normalizeText(word.text);
      if (wordNorm.length >= 2) {
        wordEntries.push({
          id: `word-${key}-${word.wordNum}`,
          text: word.text,
          norm: wordNorm,
          context: text,
          bbox: [word.left, word.top, word.width, word.height],
          conf: Math.min(1, Math.max(0, word.conf / 100)),
          kind: "word"
        });
      }
    }

    lineEntries.push({
      id: `line-${key}`,
      text,
      norm,
      context: text,
      bbox: [minX, minY, maxX - minX, maxY - minY],
      conf: Math.min(1, Math.max(0, confSum / words.length / 100)),
      kind: "line"
    });
  }

  return [...lineEntries, ...wordEntries];
}

function loadOverrides(overridesPath) {
  if (!existsSync(overridesPath)) {
    return [];
  }
  const raw = readFileSync(overridesPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter((item) => item && typeof item.text === "string" && Array.isArray(item.bbox))
    .map((item, index) => ({
      id: item.id ?? `override-${index}`,
      text: item.text,
      norm: item.norm ?? normalizeText(item.text),
      context: typeof item.context === "string" ? item.context : item.text,
      bbox: item.bbox,
      conf: typeof item.conf === "number" ? item.conf : 1,
      kind: item.kind === "word" ? "word" : "line"
    }));
}

function main() {
  const inputPath = resolve(process.argv[2] ?? DEFAULT_INPUT);
  const outputPath = resolve(process.argv[3] ?? DEFAULT_OUTPUT);
  const overridesPath = resolve(process.argv[4] ?? DEFAULT_OVERRIDES);
  const linesOutputPath = resolve(process.argv[5] ?? DEFAULT_LINES_OUTPUT);
  const wordsOutputPath = resolve(process.argv[6] ?? DEFAULT_WORDS_OUTPUT);

  const tempRoot = resolve(tmpdir(), `ocr-${Date.now()}`);
  const tempOutputBase = resolve(tempRoot, "scan");
  mkdirSync(tempRoot, { recursive: true });

  execFileSync(
    "tesseract",
    [inputPath, tempOutputBase, "-l", "eng", "--psm", "11", "--dpi", "300", "tsv"],
    { stdio: "inherit" }
  );

  const tsv = readFileSync(`${tempOutputBase}.tsv`, "utf8");
  const rows = parseTsv(tsv);
  const generatedEntries = groupLines(rows);
  const overrideEntries = loadOverrides(overridesPath);
  const outputEntries = [...overrideEntries, ...generatedEntries];
  const lineEntries = outputEntries.filter((entry) => entry.kind === "line");
  const wordEntries = outputEntries.filter((entry) => entry.kind === "word");

  mkdirSync(dirname(outputPath), { recursive: true });
  mkdirSync(dirname(linesOutputPath), { recursive: true });
  mkdirSync(dirname(wordsOutputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(outputEntries, null, 2), "utf8");
  writeFileSync(linesOutputPath, JSON.stringify(lineEntries, null, 2), "utf8");
  writeFileSync(wordsOutputPath, JSON.stringify(wordEntries, null, 2), "utf8");
  rmSync(tempRoot, { recursive: true, force: true });

  process.stdout.write(
    `Generated OCR index: ${outputPath} (${outputEntries.length} entries, lines:${lineEntries.length}, words:${wordEntries.length})\n`
  );
}

main();
