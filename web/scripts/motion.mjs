// Films every motion frame by frame and measures it, so the motion design is proven by
// numbers, not taste (step 8). Run: npm run motion            (all five shots)
//                                   npm run motion -- equaliser (shot ids containing "equaliser")
//
// Starts its own Vite dev server and, for each Motion--<state>--video lab shot, opens
// /lab.html?shot=<id> at 1920x1080 in two contexts (normal, and reducedMotion: "reduce").
// The page shows the "before" frame; `lab:play` plays the change. The script then pauses every
// animation, seeks it to t = 0, 50, 100, 200, 300, 450, 650, 1000 ms and screenshots each. Writes
//   shots/motion/<state>[-reduced]/<t>.png     the eight frames
//   shots/motion/<state>[-reduced].strip.png   a 4x2 filmstrip, 480 px per tile, in time order (needs ffmpeg)
//   shots/motion/<state>.mp4                   a real-time clip (equaliser variants, reword-ms)
// Exits 1 if any check fails. Not part of `make check`: it needs a browser and ffmpeg.
//
// Checks (normal context unless noted):
//   duration  every animation lasts one of --duration-quick / -moment / -sheet (read from the
//             page, not hard-coded), so no motion invents its own speed
//   delay     every delay is 0, --stagger or --stagger x 2.5: the score, card, swing sequence
//   hook      every animation's target sits inside a motion hook ([data-state=scored|arriving|
//             open|closed|from] or [data-text=relabel]), so motion lives only where specified
//   total     play to the last animation's end (delay + duration) <= 700 ms
//   cls       layout shift (PerformanceObserver) after everything finished < 0.05: motion uses
//             transform and opacity, it doesn't push the layout around
//   no-travel (reduced) at t = 100 ms no animated element has a translate or scale: the
//             Reduce Motion setting turns travel into fades
//   same-end  (reduced) the settled frame matches the normal context's: reduced motion changes
//             the journey, never the destination. Up to 0.01% of pixels (about 200 at 1080p) may
//             differ, for anti-aliasing; a real difference is far larger.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const SAME_END_TOLERANCE = 0.0001; // share of pixels; see same-end above

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "shots", "motion");
const filter = process.argv[2] ?? "";
const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const STATES = ["equaliser-calm", "equaliser-broadcast", "equaliser-pitch", "facts-sheet", "reword-ms"];
const CLIPS = ["equaliser-calm", "equaliser-broadcast", "equaliser-pitch", "reword-ms"];
const TIMES = [0, 50, 100, 200, 300, 450, 650, 1000];
const size = { width: 1920, height: 1080 };

const server = await createServer({ root, logLevel: "error", server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();
const url = (s) => `${base}/lab.html?shot=${encodeURIComponent(`Motion--${s}--video`)}`;

let failed = 0;
try {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const normal = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const reduced = await browser.newContext({ viewport: size, deviceScaleFactor: 1, reducedMotion: "reduce" });

  for (const state of STATES.filter((s) => s.includes(filter))) {
    const problems = [];
    const a = await film(normal, state, "");
    const b = await film(reduced, state, "-reduced");
    problems.push(...a.checks);

    for (const m of b.moving) problems.push(`no-travel: ${m}`);
    const diff = await compare(a.final, b.final);
    if (diff.error) problems.push(`same-end: ${diff.error}`);
    else if (diff.differing / diff.total > SAME_END_TOLERANCE)
      problems.push(`same-end: reduced final frame differs in ${diff.differing} of ${diff.total} pixels (${((100 * diff.differing) / diff.total).toFixed(3)}%)`);

    strip(state, "");
    strip(state, "-reduced");
    if (CLIPS.includes(state)) await clip(state);

    if (problems.length) failed++;
    const mark = problems.length ? "✗" : "✓";
    console.log(`${mark} ${state.padEnd(20)} total ${a.total.toFixed(0)} ms   cls ${a.cls.toFixed(4)}   ${a.count} animations`);
    for (const p of problems) console.log(`      ${p}`);
  }
  await normal.close();
  await reduced.close();
  console.log(`\n${failed ? `${failed} shot(s) failed` : "all motion checks passed"} → shots/motion/`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);

/** Open one shot, play it, seek through TIMES. Returns the check results and the final frame. */
async function film(context, state, suffix) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url(state));
  await page.waitForSelector("[data-shot]");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: false });
  });
  await page.evaluate(
    () =>
      new Promise((done) => {
        window.dispatchEvent(new Event("lab:play"));
        requestAnimationFrame(() => requestAnimationFrame(done));
      }),
  );
  await page.evaluate(() => document.getAnimations().forEach((x) => x.pause()));

  const dir = resolve(out, state + suffix);
  mkdirSync(dir, { recursive: true });
  let moving = [];
  for (const t of TIMES) {
    await page.evaluate(
      (t) =>
        new Promise((done) => {
          for (const x of document.getAnimations()) x.currentTime = t;
          requestAnimationFrame(done);
        }),
      t,
    );
    if (t === 100 && suffix) moving = await page.evaluate(travelling);
    await page.screenshot({ path: resolve(dir, `${t}.png`) });
  }

  // The destination: every animation at its end, then wait for layout shift to settle.
  await page.evaluate(
    () =>
      new Promise((done) => {
        document.getAnimations().forEach((x) => x.finish());
        requestAnimationFrame(() => requestAnimationFrame(done));
      }),
  );
  const measured = await page.evaluate(measure);
  // Then the settled page with the finished animations removed: every motion only animates
  // *from* somewhere, so this is exactly where it ends, without the compositor layer a held
  // animation keeps (that layer anti-aliases text differently and would fail same-end on pixels
  // that aren't a different destination).
  await page.evaluate(
    () =>
      new Promise((done) => {
        document.getAnimations().forEach((x) => x.cancel());
        requestAnimationFrame(() => requestAnimationFrame(done));
      }),
  );
  const final = await page.screenshot();
  await page.close();

  const checks = suffix ? [] : measured.problems;
  for (const e of errors) checks.push(`error: ${e.slice(0, 200)}`);
  if (!suffix && measured.total > 700) checks.push(`total: ${measured.total} ms > 700 ms`);
  if (!suffix && measured.cls >= 0.05) checks.push(`cls: ${measured.cls} >= 0.05`);
  if (!suffix && measured.count === 0) checks.push("animations: none found after lab:play");
  return { checks, final, moving, total: measured.total, cls: measured.cls, count: measured.count };
}

// ---- runs in the page ----

const hook = '[data-state="scored"], [data-state="arriving"], [data-state="open"], [data-state="closed"], [data-state="from"], [data-text="relabel"]';
const describe = (el) => `<${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : ""}>`;

function measure() {
  const root = getComputedStyle(document.documentElement);
  const ms = (name) => parseFloat(root.getPropertyValue(name));
  const durations = ["--duration-quick", "--duration-moment", "--duration-sheet"].map(ms);
  const stagger = ms("--stagger");
  const delays = [0, stagger, stagger * 2.5];
  const hookSel = '[data-state="scored"], [data-state="arriving"], [data-state="open"], [data-state="closed"], [data-state="from"], [data-text="relabel"]';
  const name = (el) => `<${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""}>`;
  const problems = [];
  let total = 0;
  const anims = document.getAnimations();
  for (const a of anims) {
    const timing = a.effect.getTiming();
    const el = a.effect.target;
    const what = `${name(el)}${a.effect.pseudoElement ?? ""} ${a.animationName ?? a.transitionProperty ?? ""}`;
    if (!durations.includes(timing.duration)) problems.push(`duration: ${what} lasts ${timing.duration} ms, tokens are ${durations.join("/")}`);
    if (!delays.includes(timing.delay)) problems.push(`delay: ${what} waits ${timing.delay} ms, allowed ${delays.join("/")}`);
    if (!el.closest(hookSel)) problems.push(`hook: ${what} is outside every motion hook`);
    total = Math.max(total, timing.delay + timing.duration);
  }
  return { problems, total, cls: window.__cls ?? 0, count: anims.length };
}

/** Elements whose current transform moves or scales anything. */
function travelling() {
  const out = [];
  const seen = new Set();
  for (const a of document.getAnimations()) {
    const el = a.effect.target;
    if (seen.has(el)) continue;
    seen.add(el);
    const t = getComputedStyle(el, a.effect.pseudoElement).transform;
    if (t === "none") continue;
    const m = t.match(/matrix\(([^)]+)\)/)?.[1].split(",").map(Number);
    const identity = m && [1, 0, 0, 1, 0, 0].every((v, i) => Math.abs(m[i] - v) < 0.001);
    if (!identity) out.push(`<${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}> transform ${t}`);
  }
  return out;
}

/** Pixel-compare two PNG buffers by decoding both in a blank page. */
async function compare(x, y) {
  const page = await browser.newPage();
  try {
    await page.goto("about:blank");
    return await page.evaluate(
      async ([p, q]) => {
        const load = async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, c.width, c.height);
        };
        const [i, j] = await Promise.all([load(p), load(q)]);
        if (i.width !== j.width || i.height !== j.height) return { error: "frame sizes differ" };
        let differing = 0;
        for (let k = 0; k < i.data.length; k += 4)
          if (i.data[k] !== j.data[k] || i.data[k + 1] !== j.data[k + 1] || i.data[k + 2] !== j.data[k + 2] || i.data[k + 3] !== j.data[k + 3]) differing++;
        return { differing, total: i.width * i.height };
      },
      [x.toString("base64"), y.toString("base64")],
    );
  } finally {
    await page.close();
  }
}

// ---- ffmpeg ----

/** Eight frames into one 4x2 sheet, 480 px per tile, in time order (this ffmpeg has no drawtext,
 *  so the tiles are unlabelled: left to right, top to bottom = TIMES). */
function strip(state, suffix) {
  const dir = resolve(out, state + suffix);
  const target = resolve(out, `${state}${suffix}.strip.png`);
  const inputs = TIMES.flatMap((t) => ["-i", resolve(dir, `${t}.png`)]);
  const graph = TIMES.map((_, i) => `[${i}:v]scale=480:-1[v${i}]`).join(";") + `;${TIMES.map((_, i) => `[v${i}]`).join("")}concat=n=${TIMES.length}:v=1:a=0,tile=4x2[out]`;
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", target]);
}

/** A real-time recording of the shot playing, as a small mp4. */
async function clip(state) {
  const dir = resolve(out, `${state}.rec`);
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir, size } });
  const page = await context.newPage();
  await page.goto(url(state));
  await page.waitForSelector("[data-shot]");
  await page.waitForTimeout(600);
  await page.evaluate(() => window.dispatchEvent(new Event("lab:play")));
  await page.waitForTimeout(1400);
  const video = page.video();
  await page.close();
  const webm = await video.path();
  await context.close();
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", webm, "-vf", "scale=960:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", "-movflags", "+faststart", resolve(out, `${state}.mp4`)]);
  rmSync(dir, { recursive: true, force: true });
}
