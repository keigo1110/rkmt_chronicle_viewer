#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function run(scriptPath) {
  execFileSync("node", [scriptPath], { stdio: "inherit" });
}

run("scripts/generate-deepzoom.mjs");
run("scripts/generate-ocr.mjs");

