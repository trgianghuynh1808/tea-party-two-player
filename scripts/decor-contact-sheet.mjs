import { chromium } from "@playwright/test";
import { readdir, mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DECOR_DIR = path.join(REPO_ROOT, "client/public/assets/decor");
const OUT_DIR = path.join(REPO_ROOT, ".agents/screenshots");
const CELL = 160;
const MAX_PER_SHEET = 40;

function isPng(name) {
  return name.toLowerCase().endsWith(".png");
}

async function collectGroups(dir, rel = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = new Map();
  const own = entries.filter((e) => e.isFile() && isPng(e.name)).map((e) => e.name).sort();
  if (own.length > 0) {
    const key = rel === "" ? "root" : rel;
    groups.set(key, own.map((name) => path.join(dir, name)));
  }
  const subdirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  for (const sub of subdirs) {
    const subRel = rel === "" ? sub.name : `${rel}/${sub.name}`;
    const nested = await collectGroups(path.join(dir, sub.name), subRel);
    for (const [key, files] of nested) groups.set(key, files);
  }
  return groups;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sheetName(groupKey, index, total) {
  const safe = groupKey.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return total > 1 ? `task-38-${safe}-${index + 1}.png` : `task-38-${safe}.png`;
}

function buildHtml(title, files) {
  const cells = files
    .map((abs) => {
      const rel = path.relative(DECOR_DIR, abs).split(path.sep).join("/");
      const url = pathToFileURL(abs).href;
      return `<figure class="cell">
        <div class="thumb"><img src="${url}" alt="${rel}"></div>
        <figcaption>${rel}</figcaption>
      </figure>`;
    })
    .join("\n");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #1e1e1e;
    color: #eee;
  }
  h1 { font-size: 18px; margin: 0 0 16px; font-weight: 600; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, ${CELL}px);
    gap: 12px;
    justify-content: start;
  }
  .cell { margin: 0; width: ${CELL}px; }
  .thumb {
    width: ${CELL}px;
    height: ${CELL}px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #555;
    background-color: #cfcfcf;
    background-image:
      linear-gradient(45deg, #b5b5b5 25%, transparent 25%),
      linear-gradient(-45deg, #b5b5b5 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #b5b5b5 75%),
      linear-gradient(-45deg, transparent 75%, #b5b5b5 75%);
    background-size: 20px 20px;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  }
  .thumb img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }
  figcaption {
    font-size: 11px;
    line-height: 1.3;
    margin-top: 4px;
    color: #ddd;
    word-break: break-word;
  }
</style>
</head>
<body>
<h1>${title} (${files.length} ảnh)</h1>
<div class="grid">
${cells}
</div>
</body>
</html>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const groups = await collectGroups(DECOR_DIR);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "decor-sheet-"));
  const created = [];
  try {
    for (const [groupKey, files] of groups) {
      const sheets = chunk(files, MAX_PER_SHEET);
      for (let i = 0; i < sheets.length; i++) {
        const name = sheetName(groupKey, i, sheets.length);
        const outPath = path.join(OUT_DIR, name);
        const htmlPath = path.join(tmpDir, `${name}.html`);
        await writeFile(htmlPath, buildHtml(`decor/${groupKey}`, sheets[i]));
        await page.goto(pathToFileURL(htmlPath).href);
        await page.waitForFunction(() =>
          Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
        );
        await page.screenshot({ path: outPath, fullPage: true });
        created.push(outPath);
      }
    }
  } finally {
    await browser.close();
    await rm(tmpDir, { recursive: true, force: true });
  }
  for (const p of created) console.log(path.relative(REPO_ROOT, p));
  console.log(`\n${created.length} sheet(s) written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
