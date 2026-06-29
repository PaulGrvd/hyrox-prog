#!/usr/bin/env node
/**
 * refresh-data.js — sync the program data from the CSV into index.html.
 *
 * index.html embeds the program as a JS template literal (`const CSV = ` ... `;`)
 * so the page works by double-clicking the file (no server / no fetch needed).
 * This script re-reads the source CSV and replaces that embedded block, then
 * validates the result. It does NOT touch the user's tracking data (localStorage).
 *
 * Run from the repo root:   node scripts/refresh-data.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.join(ROOT, "prepa_hyrox_bordeaux_solo_open.csv");
const HTML_PATH = path.join(ROOT, "index.html");

let csv = fs.readFileSync(CSV_PATH, "utf8").replace(/\r\n/g, "\n").replace(/\s+$/, "");
let html = fs.readFileSync(HTML_PATH, "utf8");

// Escape so the CSV is a safe JS template-literal body: backslash, backtick, ${
const escaped = csv.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const re = /const CSV = `[\s\S]*?`;/;
if (!re.test(html)) { console.error("ERROR: `const CSV = ` block not found in index.html"); process.exit(1); }
html = html.replace(re, "const CSV = `" + escaped + "`;");
fs.writeFileSync(HTML_PATH, html);

// Validate with the same parser the page uses.
function parseCSV(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') {} else field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const rows = parseCSV(csv);
const headers = rows.shift();
const data = rows.filter(r => r[0]);
const bad = data.filter(r => r.length !== headers.length);
console.log(`Refreshed index.html — columns: ${headers.length}, sessions: ${data.length}, malformed rows: ${bad.length}`);
if (bad.length) { console.error("WARNING: some rows have an unexpected column count."); process.exit(1); }
console.log("OK. Next: commit + push to redeploy (GitHub Pages auto-builds main).");
