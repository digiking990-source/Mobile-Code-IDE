"use strict";

const fs = require("node:fs");
const path = require("node:path");

const source = path.resolve(__dirname, "..", "node_modules", "pyodide");
const target = path.resolve(__dirname, "..", "www", "pyodide");
const runtimeFiles = [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "pyodide-lock.json",
  "python_stdlib.zip"
];
const notice = [
  "CodeStudio offline Python runtime",
  "",
  "Pyodide is distributed under the Mozilla Public License 2.0.",
  "Source and license: https://github.com/pyodide/pyodide",
  "",
  "CPython and the bundled Python standard library are distributed under the",
  "Python Software Foundation License.",
  "License: https://docs.python.org/3/license.html",
  "",
  "See pyodide-lock.json for runtime package metadata."
].join("\n");

for (const filename of runtimeFiles) {
  const from = path.join(source, filename);
  const to = path.join(target, filename);
  if (!fs.existsSync(from)) {
    throw new Error(`Python runtime file is missing: ${from}. Run npm install first.`);
  }
}

fs.mkdirSync(target, { recursive: true });
for (const staleFile of ["pyodide.js", "pyodide.asm.js"]) {
  const stalePath = path.join(target, staleFile);
  if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
}
for (const filename of runtimeFiles) {
  fs.copyFileSync(path.join(source, filename), path.join(target, filename));
}
fs.writeFileSync(path.join(target, "NOTICE.txt"), notice, "utf8");
console.log(`Copied offline Python runtime (${runtimeFiles.length} files) to ${target}`);
