// Films the pitch simulation's lab states frame by frame, for the looks gallery and as proof.
// Run: npm run film:pitch                 (every look, every scene)
//      npm run film:pitch -- analyst      (scenes whose id contains "analyst")
//
// Starts its own Vite server, opens /lab.html?shot=Pitch--<scene>-<persona>--video at 1920x1080 and
// draws each instant with window.__pitchSeek(t) (deterministic: no real-time clock involved).
// Writes, under shots/pitch/:
//   <scene>-<persona>.mp4        30 fps, H.264 at 8 Mbps: what the demo upload will look like
//   <scene>-<persona>.strip.png  a 4x2 filmstrip, 480 px per tile, in time order
// Needs ffmpeg. Not part of `make check`.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "shots", "pitch");
const filter = process.argv[2] ?? "";
const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FPS = 30;
const LOOKS = ["casual", "analyst"];

const server = await createServer({ root, logLevel: "error", server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

// Scene lengths come from the lab module itself, so the clip is exactly one loop.
await page.goto(`${base}/lab.html?shot=Pitch--equaliser-casual--video`);
await page.waitForFunction(() => typeof window.__pitchSeek === "function");
const scenes = await page.evaluate(async () => {
  const mod = await import("/src/screens/Pitch.lab.tsx");
  return Object.fromEntries(Object.entries(mod.PITCH_SCENES).map(([k, v]) => [k, v.length]));
});

mkdirSync(out, { recursive: true });
for (const [scene, length] of Object.entries(scenes)) {
  for (const look of LOOKS) {
    const id = `${scene}-${look}`;
    if (filter && !id.includes(filter)) continue;
    await page.goto(`${base}/lab.html?shot=Pitch--${id}--video`);
    await page.waitForFunction(() => typeof window.__pitchSeek === "function");
    await page.evaluate(() => document.fonts.ready);
    const dir = resolve(out, `.frames-${id}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    const frame = page.locator("[data-shot]");
    const n = Math.round(length * FPS);
    for (let i = 0; i < n; i++) {
      await page.evaluate((t) => window.__pitchSeek(t), i / FPS);
      await frame.screenshot({ path: resolve(dir, `${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 92 });
    }
    const mp4 = resolve(out, `${id}.mp4`);
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", resolve(dir, "%04d.jpg"),
      "-c:v", "libx264", "-b:v", "8M", "-maxrate", "8M", "-bufsize", "16M", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    // Eight evenly spaced frames, tiled 4x2.
    const step = Math.max(1, Math.floor(n / 8));
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", mp4, "-vf",
      `select='not(mod(n\\,${step}))',scale=480:-1,tile=4x2`, "-frames:v", "1", "-update", "1", resolve(out, `${id}.strip.png`)]);
    rmSync(dir, { recursive: true, force: true });
    console.log(`filmed ${id}: ${n} frames, ${length.toFixed(1)} s`);
  }
}

await browser.close();
await server.close();
