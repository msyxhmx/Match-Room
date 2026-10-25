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
//   S1            73' paused; Space plays at real speed to the 2–2 equaliser; no ×60 pill
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
//   offline       with the API dead the saved match shows, and plays on
//   reconnect     a dropped stream shows "Reconnecting", recovers, and the clock keeps moving

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
function flows(live, dead) {
  return [
    {
      name: "S1",
      url: `${live}/?minute=73&speed=1`,
      async run(page) {
        await noPill(page);
        if ((await score(page, "1–2").count()) === 0) throw new Error("not at 1–2 before Space");
        await pressKey(page, " ");
        await score(page, "2–2").waitFor({ timeout: 4000 });
        await h2(page, "make it count").waitFor({ timeout: 4000 });
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
        for (const s of ["SCN-comeback-0208", "Checked by the validator"])
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
        await h2(page, "Momentum swings to Northgate City").waitFor({ timeout: 12_000 });
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
        if (!(await g.innerText()).includes("make it count")) throw new Error('alert lacks "make it count"');
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
        await h2(page, "make it count").waitFor({ timeout: 6000 });
        await pressKey(page, " ");
        await sleep(3000);
        const m = await headerMinute(page);
        if (m <= 75) throw new Error(`the minute is ${m}', not past 75'`);
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
  browser = await chromium.launch();

  for (const flow of flows(live, dead)) {
    if (!flow.name.includes(filter)) continue;
    const t0 = Date.now();
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
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
