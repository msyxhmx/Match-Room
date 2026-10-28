// Films the demo video's screen takes from the live Azure website, one take per shot.
// Run: node web/scripts/demo-video/capture.mjs              (every take)
//      node web/scripts/demo-video/capture.mjs s1,s7      (only these; the match run still plays
//                                                          from kick-off, but only these record)
//      node web/scripts/demo-video/capture.mjs s7ov       (the broadcast graphic only)
//
// A plain visit (/?view=matches → Watch The comeback → Kick-off), never a director URL: those open
// the old video frame instead of the web layout. One match run films S3, S4, S6, S1, S7 and S8 in
// order; the overlay page is its own run.
//
// Capture is a CDP screencast (JPEG 100) of a 1920×1440 viewport at device scale 1.5, so frames
// are 2880×2160: the edit can punch in to 140% and pan down the page and stay sharp. Frames arrive
// irregularly (none while the page is still), so each is kept with its timestamp and the take is
// encoded through a concat list with per-frame durations, then resampled to a constant 30 fps.
//
// Writes, under ~/Movies/match-room-demo/takes/ (override with DEMO_OUT):
//   <take>.mp4   2880×2160, 30 fps, H.264 CRF 12
//   <take>.json  { scale, size, events: [{ t, kind, ... }] }: t is seconds into the mp4; clicks are
//                in CSS pixels of the viewport; state events log period, score, minute, play state
// Needs ffmpeg and Google Chrome (or set CHROME_PATH to another Chromium). Not part of `make check`.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "../../node_modules/playwright/index.mjs";

const SITE = "https://victorious-sand-01b516100.2.azurestaticapps.net";
const SCALE = 1.5;
const VIEW = { width: 1920, height: 1440 };
const FPS = 30;
const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const out = process.env.DEMO_OUT ?? resolve(homedir(), "Movies", "match-room-demo", "takes");
const only = (process.argv[2] ?? "").split(",").filter(Boolean);
const wanted = (name) => only.length === 0 || only.includes(name);
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;
const encodes = [];

function run(cmd, args) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "inherit"] });
    p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`))));
  });
}

// ---- a take: screencast frames + an event log on the same clock ----

class Take {
  constructor(page, cdp, name, size) {
    Object.assign(this, { page, cdp, name, size, frames: [], events: [], n: 0 });
    this.dir = resolve(out, `.frames-${name}`);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir);
    this.onFrame = (f) => {
      const file = resolve(this.dir, `${String(this.n++).padStart(6, "0")}.jpg`);
      writeFileSync(file, Buffer.from(f.data, "base64"));
      this.frames.push({ file, ts: f.metadata.timestamp });
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    };
  }

  async start() {
    // A screencast only sends a frame when the page repaints, so a paused page (or a sheet sliding
    // in over one) films as a few held frames. A 2 px corner dot, flickering between two
    // near-transparent alphas, keeps the compositor painting every vsync without showing.
    await this.page.evaluate(() => {
      const dot = Object.assign(document.createElement("div"), { id: "__keepalive" });
      dot.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;z-index:2147483647;pointer-events:none";
      document.body.append(dot);
      let on = false;
      const tick = () => {
        if (!dot.isConnected) return;
        on = !on;
        dot.style.background = `rgb(128 128 128 / ${on ? 0.012 : 0.008})`;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    this.cdp.on("Page.screencastFrame", this.onFrame);
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 100,
      maxWidth: Math.round(this.size.width * SCALE),
      maxHeight: Math.round(this.size.height * SCALE),
    });
    this.log("start");
    console.log(`  ● recording ${this.name}`);
  }

  log(kind, data = {}) {
    this.events.push({ wall: now(), kind, ...data });
  }

  async stop() {
    this.log("stop");
    const end = now();
    await this.cdp.send("Page.stopScreencast");
    this.cdp.off("Page.screencastFrame", this.onFrame);
    await this.page.evaluate(() => document.getElementById("__keepalive")?.remove()).catch(() => {});
    const { frames, events, name, dir } = this;
    if (frames.length < 2) throw new Error(`take ${name} got ${frames.length} frames`);
    // Timestamps sometimes step back a frame or two: keep arrival order, never let time go back.
    for (let i = 1; i < frames.length; i++) frames[i].ts = Math.max(frames[i].ts, frames[i - 1].ts);
    const t0 = frames[0].ts;
    const list = frames
      .map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.ts ?? end) - f.ts).toFixed(4)}`)
      .join("\n");
    writeFileSync(resolve(dir, "list.txt"), `${list}\nfile '${frames.at(-1).file}'\n`);
    const log = {
      take: name,
      scale: SCALE,
      size: this.size,
      length: +(end - t0).toFixed(3),
      events: events.map(({ wall, ...e }) => ({ t: +(wall - t0).toFixed(3), ...e })),
    };
    writeFileSync(resolve(out, `${name}.json`), JSON.stringify(log, null, 1));
    console.log(`  ■ ${name}: ${frames.length} frames, ${log.length.toFixed(1)} s, encoding`);
    const mp4 = resolve(out, `${name}.mp4`);
    encodes.push(
      run(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", resolve(dir, "list.txt"),
        "-vf", `fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "fast", "-crf", "12",
        "-movflags", "+faststart", mp4])
        .then(() => rmSync(dir, { recursive: true, force: true }))
        .then(() => console.log(`  ✓ ${name}.mp4`)),
    );
  }
}

// ---- the page ----

const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }), args: [`--force-device-scale-factor=${SCALE}`] });

async function open(size) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: SCALE });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  return { page, cdp };
}

/** Polls the score card and controls, and logs every change into the current take. */
function watch(page) {
  const w = { take: null, state: {}, stopped: false };
  (async () => {
    while (!w.stopped) {
      const s = await page
        .evaluate(() => {
          const card = document.querySelector("section[data-period]");
          const main = document.querySelector("[data-role=match-controls] [data-main]");
          return {
            period: card?.dataset.period ?? null,
            score: card?.getAttribute("aria-label") ?? null,
            minute: card?.querySelector('[class*="minute"]')?.textContent ?? null,
            play: main?.getAttribute("aria-label") ?? null,
          };
        })
        .catch(() => null);
      if (s) {
        for (const k of Object.keys(s)) {
          if (s[k] !== w.state[k]) w.take?.log(k, { value: s[k] });
        }
        w.state = s;
      }
      await sleep(100);
    }
  })();
  return w;
}

const minute = (w) => parseInt(w.state.minute ?? "0", 10) || 0;
async function until(w, test, what, timeout = 240_000) {
  const t = Date.now();
  while (!test(w.state)) {
    if (Date.now() - t > timeout) throw new Error(`timed out waiting for ${what} (state ${JSON.stringify(w.state)})`);
    await sleep(50);
  }
}

/** Clicks a locator's centre with the mouse, and logs where (CSS px of the viewport). */
async function click(w, locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label}: no box`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await locator.page().mouse.move(x, y, { steps: 8 });
  w.take?.log("click", { label, x: +x.toFixed(1), y: +y.toFixed(1), box });
  await locator.page().mouse.click(x, y);
}

/** Chooses a language in the native select (its popup never paints), logged as a click. */
async function language(w, page, value) {
  const sel = page.locator("select").first();
  const box = await sel.boundingBox();
  w.take?.log("click", { label: `language ${value}`, x: box.x + box.width / 2, y: box.y + box.height / 2, box });
  await sel.selectOption(value);
}

async function record(page, cdp, w, name, size, body) {
  if (!wanted(name)) return body(null);
  const take = new Take(page, cdp, name, size);
  await take.start();
  w.take = take;
  for (const [k, value] of Object.entries(w.state)) take.log(k, { value });
  try {
    await body(take);
  } finally {
    w.take = null;
    await take.stop();
  }
}

// ---- the match run: S3, S4, S6, S1, S7, S8 ----

async function matchRun() {
  const { page, cdp } = await open(VIEW);
  const w = watch(page);
  await page.goto(`${SITE}/?view=matches`);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Watch The comeback" }).click();
  const kickOff = page.getByRole("button", { name: "Kick-off", exact: true });
  await kickOff.waitFor();
  await sleep(1500);
  const main = page.locator("[data-role=match-controls] [data-main]");

  // S3: kick-off at ×60 to about 18', the ×60 pill in frame. The 14' goal card is the payoff.
  await record(page, cdp, w, "s3", VIEW, async () => {
    await sleep(1500);
    await click(w, kickOff, "Kick-off");
    await until(w, () => minute(w) >= 18, "18'");
    // S4: pause, then open the 14' moment's facts sheet.
    await click(w, main, "Pause");
    await until(w, (s) => s.play === "Play", "paused");
    await sleep(2000);
  });

  await record(page, cdp, w, "s4", VIEW, async () => {
    await sleep(1500);
    const facts = page.getByRole("button", { name: /6 facts? checked/i }).first();
    await click(w, facts, "6 facts checked");
    await page.getByText("Checked by the validator").first().waitFor({ timeout: 10_000 });
    await sleep(3000);
    // The sheet may scroll: bring the evidence events into view, slowly, so the edit can follow.
    const ids = page.getByText(/SCN-comeback-0201/).first();
    if (await ids.count()) await ids.scrollIntoViewIfNeeded();
    await sleep(6000);
  });
  await page.keyboard.press("Escape");
  await sleep(800);
  const close = page.getByRole("button", { name: /close/i });
  if (await page.getByText("Checked by the validator").first().isVisible().catch(() => false)) {
    if (await close.count()) await close.first().click();
  }
  await sleep(800);
  await main.click();
  await until(w, (s) => s.play === "Pause", "playing again");

  // S6: 57' → 67' at plain ×60: the momentum card, N. Vidal's 61' goal, "in control".
  await until(w, () => minute(w) >= 56, "56'");
  await record(page, cdp, w, "s6", VIEW, async () => {
    await until(w, () => minute(w) >= 67, "67'");
    await sleep(800);
  });

  // S1: the run-up at ×60, switch to ×1 at 73', and the 74' equaliser lands at real speed.
  await until(w, () => minute(w) >= 71, "71'");
  await record(page, cdp, w, "s1", VIEW, async () => {
    await until(w, () => minute(w) >= 73, "73'");
    await click(w, page.getByRole("button", { name: "×1", exact: true }), "×1");
    await until(w, (s) => (s.score ?? "").includes("2–2"), "2–2", 180_000);
    await sleep(12_000);
  });

  // S7: pause after the equaliser, Malay, back to English, then Analyst.
  await record(page, cdp, w, "s7", VIEW, async () => {
    await sleep(1500);
    if (w.state.play === "Pause") await click(w, main, "Pause");
    await sleep(2000);
    await language(w, page, "ms");
    await sleep(7000);
    await language(w, page, "en");
    await sleep(5500);
    await click(w, page.getByRole("button", { name: "Analyst", exact: true }), "Analyst");
    await sleep(7000);
  });
  const ms = await page.evaluate(() => document.body.innerText);
  writeFileSync(resolve(out, "s7-analyst.txt"), ms);

  // S8: back to casual, play out at ×60 to full time, open the Full-time story.
  await page.getByRole("button", { name: "Casual", exact: true }).click();
  await page.getByRole("button", { name: "×60", exact: true }).click();
  await main.click();
  await until(w, () => minute(w) >= 88, "88'");
  await record(page, cdp, w, "s8", VIEW, async () => {
    await until(w, (s) => s.period === "FT", "full time", 120_000);
    await sleep(2500);
    const tab = page.getByRole("button", { name: /^Full-time/ }).or(page.getByRole("tab", { name: /^Full-time/ }));
    const story = page.getByText(/come from behind to win 3.2/).first();
    if (!(await story.isVisible().catch(() => false)) && (await tab.count())) await click(w, tab.first(), "Full-time tab");
    // The headline is split across elements, so match on the page's text, not one node.
    await page.waitForFunction(() => /come from behind to win 3.2/.test(document.body.innerText), null, { timeout: 20_000 });
    await sleep(10_000);
  });
  writeFileSync(resolve(out, "s8-text.txt"), await page.evaluate(() => document.body.innerText));
  w.stopped = true;
  await page.context().close();
}

// ---- the broadcast graphic: /overlay?plate=1 ----

async function overlayRun() {
  const size = { width: 1920, height: 1080 };
  const { page, cdp } = await open(size);
  const w = watch(page);
  // A plain overlay visit first; the overlay-plate flow's minute=74 if that doesn't show "level it".
  for (const url of [`${SITE}/overlay?plate=1`, `${SITE}/overlay?minute=74&plate=1`]) {
    await page.goto(url);
    const g = page.locator("[data-graphic=alert]").first();
    const ok = await g
      .waitFor({ timeout: 8000 })
      .then(async () => (await g.innerText()).includes("level it"))
      .catch(() => false);
    console.log(`  overlay ${url}: ${ok ? "shows" : "no"} "level it"`);
    if (!ok) continue;
    await record(page, cdp, w, "s7ov", size, async (take) => {
      take?.log("url", { value: url });
      await sleep(9000);
    });
    break;
  }
  w.stopped = true;
  await page.context().close();
}

try {
  if (only.length === 0 || only.some((n) => ["s1", "s3", "s4", "s6", "s7", "s8"].includes(n))) await matchRun();
  if (wanted("s7ov")) await overlayRun();
} finally {
  await browser.close();
  await Promise.all(encodes);
}
