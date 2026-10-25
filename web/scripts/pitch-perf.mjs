// The pitch's performance budget (handoff §5): a steady 60 fps for the whole match at ×60.
// Run: npm run perf:pitch            Exits 1 if the budget is missed. Needs a browser; ~2 minutes.
//      npm run perf:pitch -- phone   the live page on a phone (390 × 844, touch, 4× slower CPU:
//                                    a mid-range phone), with the follow camera
//
// Plays /overlay?plate=1 from kick-off at ×60 to full time (90 match minutes plus the 15-minute
// break: about 105 s), on the saved match (its own Vite server proxied to a dead API, so the run
// is the same every time and needs no Python). Measures, in the page:
//   frames    requestAnimationFrame intervals; a frame over 25 ms counts as dropped at 60 Hz
//   long      main-thread tasks over 50 ms (PerformanceObserver "longtask"): the replan on each
//             new tick is the thing to watch
// Budget: under 1% dropped frames and no long task over 100 ms after the page has loaded.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.VITE_API_PROXY = "http://127.0.0.1:9"; // dead: the saved match plays
const server = await createServer({ root, logLevel: "error", server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const phone = process.argv[2] === "phone";
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling"] });
const page = phone
  ? await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  : await browser.newPage({ viewport: { width: 1920, height: 1080 } });
if (phone) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}
await page.goto(phone ? `${base}/?minute=0&play=0` : `${base}/overlay?minute=0&plate=1`);
await page.getByText("Offline").first().waitFor({ timeout: 15000 }).catch(() => undefined);
await page.locator("[data-pitch] canvas").waitFor({ timeout: 15000 });

await page.evaluate(() => {
  const w = window;
  w.__perf = { gaps: [], long: [] };
  let last = performance.now();
  const loop = (t) => {
    w.__perf.gaps.push(t - last);
    last = t;
    if (!w.__perf.stop) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__perf.long.push(e.duration))).observe({ type: "longtask" });
});
await page.keyboard.press(" ");
const t0 = Date.now();
// Until the clock reads 90:00 (or 150 s, whichever first).
while (Date.now() - t0 < 150_000) {
  await new Promise((r) => setTimeout(r, 2000));
  const done = await page.evaluate(() => /90:00|FT/.test(document.body.innerText));
  if (done) break;
}
const r = await page.evaluate(() => {
  window.__perf.stop = true;
  const g = window.__perf.gaps.slice(5).sort((a, b) => a - b);
  const q = (p) => g[Math.floor(p * (g.length - 1))];
  return {
    frames: g.length,
    dropped: g.filter((x) => x > 25).length,
    p50: q(0.5),
    p99: q(0.99),
    worst: g[g.length - 1],
    long: window.__perf.long,
  };
});
const secs = (Date.now() - t0) / 1000;
const share = r.dropped / Math.max(1, r.frames);
const worstLong = Math.max(0, ...r.long);
console.log(`played ${secs.toFixed(0)} s: ${r.frames} frames (${(r.frames / secs).toFixed(1)} fps)`);
console.log(`frame interval p50 ${r.p50.toFixed(1)} ms, p99 ${r.p99.toFixed(1)} ms, worst ${r.worst.toFixed(1)} ms`);
console.log(`dropped (>25 ms): ${r.dropped} (${(share * 100).toFixed(2)}%)`);
console.log(`long tasks: ${r.long.length}, worst ${worstLong.toFixed(0)} ms`);
await browser.close();
await server.close();
const ok = share < 0.01 && worstLong <= 100;
console.log(ok ? "within budget" : "OVER BUDGET");
process.exit(ok ? 0 : 1);
