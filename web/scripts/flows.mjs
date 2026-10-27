// Drives the real website through each demo-video shot and checks it works, so the proof
// doesn't depend on eyeballing (handoff §5.8). Run: npm run flows            (all)
//                                                   npm run flows -- S4      (flow names containing "S4")
//
// Starts its own API (.venv uvicorn on a free port) and two Vite servers: one proxied to that API,
// one proxied to a dead port for the offline flow. Each flow gets a fresh 1920×1080 page, fails
// on any console error or pageerror (offline flow: except connection errors), and saves
//   shots/flows/<name>.png
// Exits 1 if any flow fails. Not part of `make check`: it needs a browser and the Python venv.
//
// Flows (what each proves):
//   S1            73' paused, the pitch drawing; Space plays at real speed: the 2–2 waits for the
//                 pitch's 74:10 goal (not before 5 s, by 17 s); no ×60 pill
//   S3            kick-off at ×60 reaches the 14' goal against; the ×60 pill shows
//   S4            F opens the facts sheet with the real event ID and the validator line
//   S5            minute 45 lands on the half-time screen
//   S6            half-time at ×60 resumes and the second-half momentum card arrives
//   S7            L switches to Malay, then L L back to English and P to analyst (xG)
//   S8            minute 90 is the full-time screen at 3–2
//   overlay-plate /overlay?plate=1 shows the alert graphic over the live pitch: its canvas keeps
//                 drawing, the honesty note shows, P adds the analyst lines' chip
//   overlay-clear /overlay without plate is transparent (body and frame), ready for chroma/alpha,
//                 and has no pitch
//   goal-hold     on the plate at ×60 the 61' goal alert and the score wait for the pitch's replay
//                 to show the goal; the score never runs ahead of the alert
//   offline-plate with the API dead the pitch still plays, from the saved events
//   phone         the preview on a phone (390 × 844, touch): the bare link plays from kick-off at
//                 ×60, the follow-camera pitch draws, no sideways scroll, tapping pause / ×1 /
//                 restart / Casual / EN works, the address stays bare, and the page's end clears
//                 the controls bar
//   phone-landscape  a phone held sideways (844 × 390) gets the phone layout, not the shrunk frame
//   offline       with the API dead the saved match shows, and plays on
//   preview       the VITE_PREVIEW build: "Preview · synthetic match" pill (no "Offline"), Space plays
//                 the saved match, L switches it to Malay with no API
//   reconnect     a dropped stream shows "Reconnecting", recovers, and the clock keeps moving

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The saved match is the API's: S4 checks the facts sheet cites its first goal by id.
const savedEvents = JSON.parse(readFileSync(resolve(root, "src/live/saved/events.json"), "utf8"));
const firstGoal = savedEvents.find((e) => e.type === "shot" && e.outcome === "goal");
const repo = resolve(root, "..");
const out = resolve(root, "shots", "flows");
const filter = process.argv[2] ?? "";
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((ok, fail) => {
    const s = netServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

// ---- servers ----
let api = null;
const vites = [];
async function startApi() {
  const port = await freePort();
  api = spawn(resolve(repo, ".venv/bin/python"), ["-m", "uvicorn", "api.main:app", "--port", String(port)], {
    cwd: repo,
    stdio: "ignore",
  });
  api.on("error", (e) => console.error("API failed to start:", e.message));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return url;
    } catch {}
    await sleep(500);
  }
  throw new Error("API did not answer /api/health within 30 s");
}

async function startVite(target) {
  const server = await createServer({
    root,
    logLevel: "silent",
    server: { port: 0, strictPort: false, proxy: { "/api": { target, ws: true } } },
  });
  await server.listen();
  vites.push(server);
  return server.resolvedUrls.local[0].replace(/\/$/, "");
}

// ---- helpers ----
const body = (page) => page.evaluate(() => document.body.innerText);
const h2 = (page, text) => page.locator("h2", { hasText: text }).first();
const score = (page, goals) => page.locator(`section[aria-label="Northgate City ${goals} Kingston Vale"]`);
/** The match minute in the score header, as a number. */
const headerMinute = async (page) =>
  parseInt(await page.locator('section[data-period] [class*="minute"]').first().innerText(), 10);
const pressKey = (page, k) => page.keyboard.press(k);

/** The pitch canvas is drawing: its frame count goes up, and it has dots on it. */
async function pitchDrawing(page, timeout = 5000) {
  const canvas = page.locator("[data-pitch] canvas");
  await canvas.waitFor({ timeout });
  const count = () => canvas.evaluate((c) => Number(c.dataset.frames ?? 0));
  const a = await count();
  await sleep(600);
  const b = await count();
  if (!(b > a)) throw new Error(`the pitch canvas isn't drawing (frames ${a} → ${b})`);
  const inked = await canvas.evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++;
    return n;
  });
  if (inked < 50) throw new Error("the pitch canvas is empty");
}

async function noPill(page) {
  const t = await body(page);
  if (t.includes("×60")) throw new Error('"×60" is on screen');
}

// ---- the flows ----
function flows(live, dead, preview) {
  return [
    {
      name: "S1",
      url: `${live}/?minute=73&speed=1`,
      async run(page) {
        await noPill(page);
        if ((await score(page, "1–2").count()) === 0) throw new Error("not at 1–2 before Space");
        await pitchDrawing(page);
        await pressKey(page, " ");
        // The goal is at 74:10: at real speed the score and its card wait for the pitch to show it.
        await sleep(5000);
        if ((await score(page, "2–2").count()) > 0) throw new Error("2–2 showed before the pitch's goal");
        await score(page, "2–2").waitFor({ timeout: 12000 });
        await h2(page, "level it").waitFor({ timeout: 4000 });
        await noPill(page);
      },
    },
    {
      name: "S3",
      url: `${live}/?minute=0&speed=60&play=1`,
      async run(page) {
        await h2(page, "Against the run of play").waitFor({ timeout: 20_000 });
        if (!(await body(page)).includes("×60")) throw new Error('no "×60" pill');
      },
    },
    {
      name: "S4",
      url: `${live}/?minute=15`,
      async run(page) {
        await pressKey(page, "f");
        const d = page.getByRole("dialog");
        await d.waitFor({ timeout: 4000 });
        const t = await d.innerText();
        for (const s of [firstGoal.event_id, "Checked by the validator"])
          if (!t.includes(s)) throw new Error(`facts sheet is missing "${s}"`);
      },
    },
    {
      name: "S5",
      url: `${live}/?minute=45`,
      async run(page) {
        await page.waitForSelector("[data-screen=halftime]", { timeout: 5000 });
      },
    },
    {
      name: "S6",
      url: `${live}/?minute=45&speed=60&play=1`,
      async run(page) {
        // 58:59 brings two second-half cards at once; the newer ("take control") holds the stage.
        // From 45' at ×60 it shows after about 17 s.
        await h2(page, /Momentum swings to Northgate City|Northgate City take control/).waitFor({ timeout: 30_000 });
      },
    },
    {
      name: "S7",
      url: `${live}/?minute=74`,
      async run(page) {
        await pressKey(page, "l");
        await page.getByText("menjaringkan").first().waitFor({ timeout: 4000 });
        await pressKey(page, "l");
        await pressKey(page, "l");
        await pressKey(page, "p");
        await page.getByText("xG").first().waitFor({ timeout: 4000 });
      },
    },
    {
      name: "S8",
      url: `${live}/?minute=90`,
      async run(page) {
        await page.waitForSelector("[data-screen=fulltime]", { timeout: 5000 });
        const t = await page.locator("[data-screen=fulltime]").innerText();
        if (!/3\s*[–-]\s*2/.test(t) && !(await page.locator('[aria-label*="3–2"]').count()))
          throw new Error("full-time score is not 3–2");
      },
    },
    {
      name: "overlay-plate",
      url: `${live}/overlay?minute=74&plate=1`,
      async run(page) {
        const g = page.locator("[data-graphic=alert]").first();
        await g.waitFor({ timeout: 5000 });
        if (!(await g.innerText()).includes("level it")) throw new Error('alert lacks "level it"');
        await pitchDrawing(page);
        await page.getByText("Positions illustrative").first().waitFor({ timeout: 2000 });
        await pressKey(page, "p");
        await page.locator('[data-pitch][data-analyst="true"]').waitFor({ timeout: 3000 });
        await page.getByText("Analyst view").first().waitFor({ timeout: 2000 });
      },
    },
    {
      name: "goal-hold",
      url: `${live}/overlay?minute=60&plate=1`,
      async run(page) {
        await page.locator("[data-pitch] canvas").waitFor({ timeout: 5000 });
        await pressKey(page, " ");
        // Sample the score bug and the alert until the alert shows.
        let sawHeld = false;
        for (let i = 0; i < 120; i++) {
          const s = await page.evaluate(() => ({
            alert: !!document.querySelector("[data-graphic=alert]"),
            replay: document.body.innerText.includes("61′"),
            text: document.body.innerText,
          }));
          const oneTwo = /1\s*[–-]\s*2/.test(s.text);
          if (s.alert) {
            if (!oneTwo) throw new Error("the alert is up but the score isn't 1–2");
            if (!sawHeld) throw new Error("never saw the 61' replay with the score still 0–2");
            return;
          }
          if (oneTwo) throw new Error("the score went to 1–2 before the goal alert");
          if (s.replay) sawHeld = true;
          await sleep(50);
        }
        throw new Error("the 61' goal alert never showed");
      },
    },
    {
      name: "offline-plate",
      url: `${dead}/overlay?minute=74&plate=1`,
      offline: true,
      async run(page) {
        await pitchDrawing(page, 12000);
        await pressKey(page, " ");
        await sleep(1500);
        await pitchDrawing(page);
      },
    },
    {
      name: "overlay-clear",
      url: `${live}/overlay?minute=74`,
      async run(page) {
        await page.waitForSelector("[data-graphic=alert]", { timeout: 5000 });
        const bg = await page.evaluate(() => ({
          body: getComputedStyle(document.body).backgroundColor,
          video: getComputedStyle(document.querySelector("div.video")).backgroundColor,
        }));
        for (const [k, v] of Object.entries(bg))
          if (v !== "rgba(0, 0, 0, 0)") throw new Error(`${k} background is ${v}`);
        if (await page.locator("[data-pitch]").count()) throw new Error("the transparent page has a pitch");
      },
    },
    {
      name: "offline",
      url: `${dead}/?minute=74`,
      offline: true,
      async run(page) {
        await page.getByText("Offline · showing saved match").first().waitFor({ timeout: 6000 });
        await h2(page, "level it").waitFor({ timeout: 6000 });
        await pressKey(page, " ");
        await sleep(3000);
        const m = await headerMinute(page);
        if (m <= 75) throw new Error(`the minute is ${m}', not past 75'`);
      },
    },
    {
      name: "preview",
      url: `${preview}/?minute=73`,
      async run(page) {
        await page.getByText("Preview · synthetic match").first().waitFor({ timeout: 6000 });
        if ((await body(page)).includes("Offline")) throw new Error('"Offline" is on screen');
        await pressKey(page, " ");
        await sleep(3000);
        const m = await headerMinute(page);
        if (m <= 74) throw new Error(`the minute is ${m}', not past 74'`);
        await pressKey(page, "l");
        await page.getByText("Pratonton").first().waitFor({ timeout: 4000 });
      },
    },
    {
      name: "phone",
      url: `${preview}/?view=live`,
      device: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
      async run(page) {
        await page.getByText("Preview · synthetic match").first().waitFor({ timeout: 6000 });
        const bar = page.locator("[data-role=match-controls]:visible");
        await bar.waitFor({ timeout: 4000 });
        await page.locator('[data-pitch][data-follow="true"]').waitFor({ timeout: 4000 });
        await pitchDrawing(page);
        // The bare link waits on its Kick off button, then plays.
        const kick = page.locator("[data-role=kick-off]");
        await kick.waitFor({ timeout: 4000 });
        await sleep(1500);
        const clock = page.locator('section[data-period] [class*="minute"]');
        if (await clock.count()) throw new Error("the bare link played before Kick off");
        await kick.tap();
        await clock.first().waitFor({ timeout: 4000 });
        const m0 = await headerMinute(page);
        await sleep(2500);
        const m1 = await headerMinute(page);
        if (!(m1 > m0)) throw new Error(`Kick off didn't start the match (${m0}' → ${m1}')`);
        if (await kick.count()) throw new Error("the Kick off button stayed after kick-off");
        if (!(await body(page)).includes("×60")) throw new Error("no ×60 pill on the bare link");
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 0) throw new Error(`the page scrolls sideways by ${wide} px`);
        // Pause holds the clock.
        await bar.getByRole("button", { name: "Pause" }).tap();
        const p0 = await headerMinute(page);
        await sleep(2000);
        if ((await headerMinute(page)) !== p0) throw new Error("pause didn't stop the clock");
        // ...and the pitch: a plain visit's pause freezes the picture (no headline loop).
        const frames = () => page.locator("[data-pitch] canvas").first().getAttribute("data-frames");
        const f0 = await frames();
        await sleep(1500);
        if ((await frames()) !== f0) throw new Error("the pitch kept moving while paused");
        await bar.getByRole("button", { name: "Play" }).tap();
        // ×1: the speed pill goes (speed honesty: it shows only above ×1).
        await bar.getByRole("button", { name: "×1" }).tap();
        await sleep(1500);
        const status = await page.locator("section[data-period]").first().innerText();
        if (status.includes("×60")) throw new Error("the ×60 pill stayed after ×1");
        // Restart: back to kick-off, playing.
        await bar.getByRole("button", { name: /Restart/ }).tap();
        await sleep(2500);
        if ((await headerMinute(page)) > 3) throw new Error("restart didn't go back to kick-off");
        // The top bar's buttons: persona, then language.
        await page.getByRole("button", { name: /Change depth/ }).tap();
        await page.getByText("Analyst view").first().waitFor({ timeout: 3000 }).catch(() => undefined);
        await page.locator("header").getByText("Analyst").first().waitFor({ timeout: 3000 });
        await page.getByRole("button", { name: /Change language/ }).tap();
        await page.getByText("Pratonton").first().waitFor({ timeout: 4000 });
        if (/minute=|play=/.test(page.url())) throw new Error(`the address isn't bare: ${page.url()}`);
        // The end of the page clears the bar.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await sleep(400);
        const clear = await page.evaluate(() => {
          const barTop = [...document.querySelectorAll("[data-role=match-controls]")]
            .map((b) => b.getBoundingClientRect())
            .find((r) => r.height > 0).top;
          const kids = [...document.querySelectorAll("[data-screen] > *")].map((e) => e.getBoundingClientRect().bottom);
          return barTop - Math.max(...kids);
        });
        if (clear < 0) throw new Error(`the page's end hides ${-clear} px behind the controls`);
      },
    },
    {
      name: "phone-landscape",
      url: `${preview}/?view=live`,
      device: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
      async run(page) {
        await page.locator("[data-role=match-controls]:visible").waitFor({ timeout: 4000 });
        if (await page.locator(".video").count()) throw new Error("a sideways phone got the shrunk video frame");
        const w = await page.locator("[data-pitch-view]").first().evaluate((e) => e.getBoundingClientRect().width);
        if (w < 700) throw new Error(`the pitch is only ${Math.round(w)} px wide`);
        await pitchDrawing(page);
      },
    },
    {
      name: "picker",
      url: `${live}/`,
      device: { viewport: { width: 375, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      async run(page) {
        // A bare visit lands on the picker: four storylines, then the organic matches.
        await page.locator("[data-screen=matches]").waitFor({ timeout: 6000 });
        await page.locator("button[data-match]:not([disabled])").nth(5).waitFor({ timeout: 6000 });
        const wide = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if ((await wide()) > 0) throw new Error(`the picker scrolls sideways by ${await wide()} px`);
        if ((await page.locator("[data-screen=matches] li button").count()) < 5) throw new Error("the picker lists too few matches");
        // Table view fits the phone.
        await page.getByRole("button", { name: "Table", exact: true }).tap();
        await page.locator("[data-screen=table] tbody tr").first().waitFor({ timeout: 4000 });
        if ((await wide()) > 0) throw new Error(`the table scrolls sideways by ${await wide()} px`);
        if (!/view=table/.test(page.url())) throw new Error(`the view isn't in the address: ${page.url()}`);
        await page.getByRole("button", { name: "Matches", exact: true }).tap();
        // Pick another storyline: kick-off, paused behind the Kick off button, its own teams.
        await page.locator("button[data-match=SCN-red-card]").tap();
        await page.locator("[data-role=kick-off]").waitFor({ timeout: 6000 });
        if (!/match=SCN-red-card/.test(page.url()) || !/view=live/.test(page.url())) throw new Error(`bad address: ${page.url()}`);
        if (await page.locator('section[data-period] [class*="minute"]').count()) throw new Error("a picked match didn't open at kick-off");
        if ((await body(page)).includes("Northgate")) throw new Error("the old match's teams are still on screen");
      },
    },
    {
      name: "picker-preview",
      url: `${preview}/`,
      device: { viewport: { width: 375, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      async run(page) {
        // No server: the comeback alone, playable.
        await page.locator("button[data-match=SCN-comeback]:not([disabled])").waitFor({ timeout: 6000 });
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 0) throw new Error(`the picker scrolls sideways by ${wide} px`);
        await page.getByRole("button", { name: "Table", exact: true }).tap();
        await page.locator("[data-screen=table] tbody tr").first().waitFor({ timeout: 4000 });
      },
    },
    {
      name: "reconnect",
      url: `${live}/?minute=10&speed=60&play=1`,
      async before(page) {
        // Dev mode opens two sockets at load; drop the newest one (the app's live one) once,
        // after it has delivered 3 messages, from the server side.
        let dropped = false;
        let opened = 0;
        await page.routeWebSocket(/\/stream/, (ws) => {
          const server = ws.connectToServer();
          let seen = 0;
          const id = ++opened;
          server.onMessage((m) => {
            ws.send(m);
            if (++seen === 3 && !dropped && id === opened) {
              dropped = true;
              server.close();
              ws.close();
            }
          });
          ws.onMessage((m) => server.send(m));
          ws.onClose(() => server.close());
        });
      },
      async run(page) {
        const minute = () => headerMinute(page);
        await page.getByText("Reconnecting").first().waitFor({ timeout: 8000 });
        await page.getByText("Reconnecting").first().waitFor({ state: "hidden", timeout: 6000 });
        const at = await minute();
        await sleep(3000);
        if ((await minute()) <= at) throw new Error(`the minute stayed at ${at}' after reconnecting`);
      },
    },
  ];
}

// ---- run ----
const results = [];
let browser = null;
try {
  const apiUrl = await startApi();
  const live = await startVite(apiUrl);
  const dead = await startVite("http://127.0.0.1:9");
  // The preview build reads VITE_PREVIEW when Vite loads its env, so set it just for this server.
  process.env.VITE_PREVIEW = "1";
  const preview = await startVite("http://127.0.0.1:9");
  delete process.env.VITE_PREVIEW;
  browser = await chromium.launch();

  for (const flow of flows(live, dead, preview)) {
    if (!flow.name.includes(filter)) continue;
    const t0 = Date.now();
    const ctx = await browser.newContext(flow.device ?? { viewport: { width: 1920, height: 1080 } });
    let page = null;
    let error = null;
    try {
      page = await ctx.newPage();
      page.errors = [];
      page.on("console", (m) => m.type() === "error" && page.errors.push(m.text()));
      page.on("pageerror", (e) => page.errors.push(String(e)));
      await flow.before?.(page);
      await page.goto(flow.url);
      await page.waitForSelector("[data-screen]", { timeout: 10_000 });
      await flow.run(page);
      const bad = page.errors.filter((e) => !(flow.offline && /WebSocket|ECONNREFUSED|proxy|Failed to load resource|500|502|504|net::/i.test(e)));
      if (bad.length) throw new Error(`console error: ${bad[0].slice(0, 200)}`);
    } catch (e) {
      error = String(e.message ?? e).split("\n")[0];
    }
    if (page) await page.screenshot({ path: resolve(out, `${flow.name}.png`) }).catch(() => {});
    await ctx.close();
    results.push({ name: flow.name, error, ms: Date.now() - t0 });
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`${error ? "✗" : "✓"} ${flow.name.padEnd(14)} ${s.padStart(5)} s${error ? `  ${error}` : ""}`);
  }
} catch (e) {
  console.error("flows could not run:", e.message);
  results.push({ name: "setup", error: e.message, ms: 0 });
} finally {
  await browser?.close();
  for (const v of vites) await v.close();
  api?.kill();
}
const failed = results.filter((r) => r.error).length;
console.log(`\n${results.length} flows, ${failed} failed → shots/flows/`);
process.exit(failed ? 1 : 0);
