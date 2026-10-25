// Screenshots every lab state and measures it against the design rules, so a review only has
// to judge taste. Run: npm run shots            (all)
//                      npm run shots -- Moment  (shot ids containing "Moment")
//
// Starts its own Vite dev server, opens /lab.html?shot=<id> for each shot at 1:1, and writes
//   shots/<id>.png        full size
//   shots/half/<id>.png   50%, for the shrink test (DESIGN §6.4)
//   shots/report.json     every measured problem, per shot
//   shots/index.html      a contact sheet with the problems listed under each shot
// Exits 1 if any rule fails. Not part of `make check`: it needs a browser.
//
// Rules (DESIGN §5–§9, docs/component-specs.md "Measured checks"):
//   min-font     video text >= 23 px (tvOS Caption 2), phone >= 11 px (iOS Caption 2)
//   safe-area    video text inside x 96–1824, y 54–1026 (EBU R 95); phone text inside the 16 px gutter
//   clipped      text cut off by overflow, an ellipsis or a line clamp
//   note         a [data-role=probability] number with no [data-role=projection-note] in the frame
//   words        "odds", "bet" and their MS/ES forms anywhere but the projection note
//   emoji        any emoji (icons are Lucide)
//   axe          axe-core WCAG 2.2 A/AA violations inside the frame
//   error        the component threw, or logged a console error

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "shots");
const filter = process.argv[2] ?? "";

const server = await createServer({ root, logLevel: "error", server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");

const browser = await chromium.launch();
const full = await browser.newContext({ deviceScaleFactor: 1 });
const half = await browser.newContext({ deviceScaleFactor: 0.5 });

let failed = 0;
const report = [];
try {
  const index = await full.newPage();
  await index.goto(`${base}/lab.html`);
  await index.waitForFunction(() => Array.isArray(window.__LAB_SHOTS__));
  const all = await index.evaluate(() => window.__LAB_SHOTS__);
  const shots = all.filter((s) => s.id.includes(filter));
  if (!filter) rmSync(out, { recursive: true, force: true });
  mkdirSync(resolve(out, "half"), { recursive: true });

  for (const shot of shots) {
    const page = await full.newPage();
    await page.setViewportSize({ width: shot.width, height: shot.height });
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    const url = `${base}/lab.html?shot=${encodeURIComponent(shot.id)}`;
    await page.goto(url);
    await page.waitForSelector("[data-shot]");
    await page.evaluate(() => document.fonts.ready);

    const problems = await page.evaluate(measure, shot.canvas);
    for (const e of errors) problems.push({ rule: "error", detail: e.slice(0, 300) });
    const axe = await new AxeBuilder({ page })
      .include("[data-shot]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    for (const v of axe.violations)
      problems.push({ rule: "axe", detail: `${v.id}: ${v.help} (${v.nodes.length})` });

    await page.screenshot({ path: resolve(out, `${shot.id}.png`), omitBackground: shot.transparent });
    await page.close();

    const small = await half.newPage();
    await small.setViewportSize({ width: shot.width, height: shot.height });
    await small.goto(url);
    await small.waitForSelector("[data-shot]");
    await small.screenshot({ path: resolve(out, "half", `${shot.id}.png`), omitBackground: shot.transparent });
    await small.close();

    if (problems.length) failed++;
    report.push({ ...shot, problems });
    const mark = problems.length ? `✗ ${problems.length}` : "✓";
    console.log(`${mark.padEnd(5)} ${shot.id}`);
    for (const p of problems) console.log(`      ${p.rule}: ${p.detail}`);
  }

  writeFileSync(resolve(out, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(out, "index.html"), contactSheet(report));
  console.log(`\n${report.length} shots, ${failed} with problems → shots/index.html`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);

// ---- runs in the page ----
function measure(canvas) {
  const frame = document.querySelector("[data-shot]");
  const box = frame.getBoundingClientRect();
  const problems = [];
  const add = (rule, detail) => problems.push({ rule, detail });
  const short = (t) => (t.length > 60 ? `${t.slice(0, 57)}…` : t);

  if (frame.querySelector("[data-lab-error]")) add("error", "the component threw (see the frame)");

  const minFont = canvas === "video" ? 23 : 11;
  const safe =
    canvas === "video"
      ? { left: 96, right: 1824, top: 54, bottom: 1026 }
      : { left: 16, right: box.width - 16, top: 0, bottom: box.height }; // the phone gutter

  const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
  const seenFont = new Set();
  const seenSafe = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (!text) continue;
    const el = node.parentElement;
    if (el.closest(".sr-only, [aria-hidden=true]")) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
    const rects = [...(() => {
      const r = document.createRange();
      r.selectNodeContents(node);
      return r.getClientRects();
    })()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) continue;

    const size = parseFloat(style.fontSize);
    if (size < minFont && !seenFont.has(el)) {
      seenFont.add(el);
      add("min-font", `${size}px "${short(text)}"`);
    }
    // Text scrolled out of view inside a scroll container (a sheet body) isn't on screen yet.
    let scroller = el.parentElement;
    while (scroller && scroller !== frame && !/auto|scroll/.test(getComputedStyle(scroller).overflowY))
      scroller = scroller.parentElement;
    const view = scroller && scroller !== frame ? scroller.getBoundingClientRect() : null;
    for (const r of rects) {
      if (view && (r.bottom <= view.top || r.top >= view.bottom)) continue;
      const x1 = r.left - box.left, x2 = r.right - box.left, y1 = r.top - box.top, y2 = r.bottom - box.top;
      if ((x1 < safe.left - 0.5 || x2 > safe.right + 0.5 || y1 < safe.top - 0.5 || y2 > safe.bottom + 0.5) && !seenSafe.has(el)) {
        seenSafe.add(el);
        add("safe-area", `"${short(text)}" at x ${Math.round(x1)}–${Math.round(x2)}, y ${Math.round(y1)}–${Math.round(y2)}`);
      }
    }
  }

  for (const el of frame.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    if (!el.textContent.trim() || style.display === "none") continue;
    const clips = style.overflowX !== "visible" || style.overflowY !== "visible";
    const overX = el.scrollWidth > el.clientWidth + 1;
    const overY = el.scrollHeight > el.clientHeight + 1;
    const scrolls = /auto|scroll/.test(style.overflowY);
    if (clips && (overX || (overY && !scrolls)) && el !== frame && !el.closest(".sr-only"))
      add("clipped", `<${el.tagName.toLowerCase()} class="${el.className}"> "${short(el.textContent.trim())}"`);
    if (style.textOverflow === "ellipsis" && overX) add("clipped", `ellipsis on "${short(el.textContent.trim())}"`);
  }

  if (frame.querySelector("[data-role=probability]") && !frame.querySelector("[data-role=projection-note]"))
    add("note", "a probability is shown without projection.note");

  const clone = frame.cloneNode(true);
  clone.querySelectorAll("[data-role=projection-note]").forEach((n) => n.remove());
  const words = clone.textContent.match(/\b(odds|bets?|betting|bookmakers?)\b|cuotas?|apuestas?|taruhan|pertaruhan/gi);
  if (words) add("words", `found ${[...new Set(words)].join(", ")}`);
  const emoji = frame.textContent.match(/\p{Extended_Pictographic}/gu);
  if (emoji) add("emoji", `found ${[...new Set(emoji)].join(" ")}`);
  return problems;
}

function contactSheet(report) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const items = report
    .map(
      (s) => `<figure class="${s.canvas}${s.problems.length ? " bad" : ""}">
  <a href="${esc(s.id)}.png"><img src="${esc(s.id)}.png" loading="lazy" alt=""></a>
  <figcaption><b>${esc(s.id)}</b><br>${esc(s.note)}${s.problems.length ? `<ul>${s.problems.map((p) => `<li><b>${p.rule}</b> ${esc(p.detail)}</li>`).join("")}</ul>` : ""}</figcaption>
</figure>`,
    )
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Lab shots</title>
<style>body{font:13px/1.4 system-ui;margin:24px;background:#fafafa}main{display:flex;flex-wrap:wrap;gap:24px}
figure{margin:0;background:#fff;padding:8px;border-radius:8px}figure.video img{width:640px}figure.phone img{width:195px}
figure.bad{outline:3px solid #d70015}img{display:block;background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 0 0/16px 16px}
figcaption{max-width:640px;margin-top:6px}ul{margin:4px 0 0;padding-left:16px;color:#b00020}</style>
<h1>Lab shots</h1><p>${report.length} shots · ${report.filter((s) => s.problems.length).length} with problems</p><main>${items}</main>`;
}
