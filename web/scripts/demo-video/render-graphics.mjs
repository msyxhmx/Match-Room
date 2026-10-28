// Renders one demo-video graphic (web/scripts/demo-video/graphics/*.html) to a PNG frame sequence.
// Run: node web/scripts/demo-video/render-graphics.mjs <page[?query]> <outdir> [fps=30]
//   e.g. node web/scripts/demo-video/render-graphics.mjs "label.html?text=Analyst&len=3.6" ./out/label 30
// Opens the page at 1920x1080 and calls window.__seek(t) for each frame, so the result is deterministic.
// Writes <outdir>/0000.png ... with a transparent background (opaque pages stay opaque).
// Uses installed Chrome (Playwright's own Chromium isn't installed). Also exports renderGraphic().

import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "../../node_modules/playwright/index.mjs";

const graphicsDir = resolve(dirname(fileURLToPath(import.meta.url)), "graphics");

// Renders pageQuery (e.g. "caption.html?text=Hi&len=3") into outDir as %04d.png. Returns the frame count.
export async function renderGraphic(browser, pageQuery, outDir, fps = 30) {
  const [file, query] = pageQuery.split(/\?(.*)/s);
  const url = pathToFileURL(resolve(graphicsDir, file)).href + (query ? `?${query}` : "");
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => typeof window.__seek === "function" && typeof window.__length === "number");
    await page.evaluate(() => document.fonts.ready);
    const length = await page.evaluate(() => window.__length);
    const n = Math.ceil(length * fps);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    for (let i = 0; i < n; i++) {
      await page.evaluate((t) => window.__seek(t), i / fps);
      await page.screenshot({ path: resolve(outDir, `${String(i).padStart(4, "0")}.png`), omitBackground: true });
    }
    return n;
  } finally {
    await page.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [pageQuery, outDir, fps] = process.argv.slice(2);
  if (!pageQuery || !outDir) {
    console.error("usage: render-graphics.mjs <page[?query]> <outdir> [fps=30]");
    process.exit(1);
  }
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
  try {
    const n = await renderGraphic(browser, pageQuery, resolve(outDir), Number(fps ?? 30));
    console.log(`rendered ${n} frames of ${pageQuery} to ${outDir}`);
  } finally {
    await browser.close();
  }
}
