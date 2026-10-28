// Builds the demo video from the screen takes, the voiceover mp3s and the HTML graphics.
// Run: node web/scripts/demo-video/build.mjs            (everything: graphics, shots, final)
//      node web/scripts/demo-video/build.mjs s3 s4      (re-render only these shots, then the final)
//
// Inputs, under ~/Movies/match-room-demo/ (override with DEMO_DIR):
//   takes/<take>.mp4 + .json   from capture.mjs (2880×2160 frames of a 1920×1440 CSS viewport)
//   vo/s1.mp3 … s10.mp3        the animatic's voiceover, laid at each shot's start, never sped up
//   stills/s5.jpg              the animatic's S5 still (placeholder until the API is updated)
// Writes match-room-demo.mp4 (1920×1080, 30 fps, H.264 10 Mbit/s, AAC 192k), match-room-demo.srt,
// contact-sheet.jpg, and work/ (rendered graphics and one mp4 per shot).
//
// Every camera move is a list of keyframes [t, x, y, w] in the take's CSS pixels: the frame shows
// the region (x, y) of width w (height w × 9/16), eased in-out between keyframes. 1920 wide is
// 100%; 1371 wide is 140%, the most a 1.5× take allows before it softens.
// Needs ffmpeg and Google Chrome (or set CHROME_PATH to another Chromium). Not part of `make check`.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "../../node_modules/playwright/index.mjs";
import { renderGraphic } from "./render-graphics.mjs";

const DIR = process.env.DEMO_DIR ?? resolve(homedir(), "Movies", "match-room-demo");
const WORK = resolve(DIR, "work");
const FPS = 30;
const GAP = 0.8; // silence after each line, as in the animatic
const DIP = 3; // frames each side of a dip to black (6 in all)
const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = FFMPEG.replace(/ffmpeg$/, "ffprobe");
const only = process.argv.slice(2);
mkdirSync(resolve(WORK, "shots"), { recursive: true });

function run(cmd, args) {
  return new Promise((ok, fail) => {
    let err = "";
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let outText = "";
    p.stdout.on("data", (d) => (outText += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("exit", (code) => (code === 0 ? ok(outText) : fail(new Error(`${cmd} ${code}\n${err.slice(-2000)}`))));
  });
}
const duration = async (f) =>
  Number(await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));
const take = (name) => JSON.parse(readFileSync(resolve(DIR, "takes", `${name}.json`), "utf8"));
/** Seconds into a take of the first event matching test. */
function at(name, test, what) {
  const e = take(name).events.find(test);
  if (!e) throw new Error(`${name}: no ${what}`);
  return e.t;
}
const firstMinute = (name, m) => at(name, (e) => e.kind === "minute" && parseInt(e.value, 10) >= m, `minute ${m}`);
const clickAt = (name, label) => take(name).events.find((e) => e.kind === "click" && e.label === label);

// ---- the voiceover and the shot list ----

const VO = {
  s1: "Seventy-four minutes. Northgate City were two down at half-time. Now it's level. But a score doesn't tell you why.",
  s2: "Match-Room Live explains a football match as it happens. Every moment comes with a reason, and the proof is one tap away.",
  s3: "This is a synthetic match, streamed event by event. At fourteen minutes, Kingston Vale score against the run of play. Northgate had been on top, and Kingston's chance to win jumps from twenty-four to fifty-three percent.",
  s4: "Tap any card to see the facts behind it: the two events that made this goal, each with its ID. A validator rejects any number or name it can't trace back to an event.",
  s5: "At half-time, two AI agents write the story. An analyst investigates the first half through its tools. A fact-checker sends back any claim the evidence doesn't support.",
  s6: "After the break, the match turns. You can watch Northgate take over, minute by minute.",
  s7: "Back at seventy-four minutes, the player this fan follows equalises. The same facts, for a casual fan in Malay. For an analyst, with expected goals and shot speed. And as a broadcast graphic, ready for a studio.",
  s8: "Full time: three-two. The story lists every turning point and how much it moved the chance to win.",
  s9: "Under the hood: a match simulator, a live insight engine, a validator, the two agents, and a live stream. It falls back to templates, so the match never stops.",
  s10: "Match-Room Live. Explain the match. Don't just score it.",
};
const IDS = Object.keys(VO);

/** Approximate time of a phrase inside a line: by characters, which the TTS reads near-evenly. */
function phraseAt(id, phrase, dur) {
  const i = VO[id].indexOf(phrase);
  if (i < 0) throw new Error(`${id}: "${phrase}" not in the voiceover`);
  return (i / VO[id].length) * dur;
}

// Each shot is one or more parts. A part is a take (or still, or graphic) window with a camera,
// overlays (graphics frames at a time), and click highlights (CSS px of the take, at take time).
function shots(D) {
  const S = {};

  // S1: the equaliser lands on "Now it's level"; a slow punch-in on the score and the 74' card.
  {
    const flip = at("s1", (e) => e.kind === "score" && e.value?.includes("2–2"), "2–2");
    const len = D.s1 + GAP;
    const f = phraseAt("s1", "Now it's level", D.s1);
    const inT = flip + 0.3 - f; // the score repaints about 0.3 s after its aria-label changes
    S.s1 = [{ take: "s1", in: inT, len, cam: [[0, 0, 0, 1920], [f - 0.8, 0, 0, 1920], [f + 0.6, ...CAM.s1score], [f + 1.6, ...CAM.s1score], [len, ...CAM.s1end]] }];
    S.s1.hold = inT + len; // S2 freezes the take here
  }

  // S2: hold S1's last frame; the lower third slides in.
  S.s2 = [{ take: "s1", freeze: S.s1.hold, len: D.s2 + GAP, cam: [[0, ...CAM.s1end]], gfx: [{ dir: "lower-third", at: 0 }], dipOut: true }];

  // S3: kick-off at ×60, full frame (the ×60 pill in view), then a punch-in on the 14' card.
  {
    const len = D.s3 + GAP;
    // At ×60 the 14' card and the 0–1 wait for the pitch's replay, so both land at 17'. The
    // punch-in settles on the card just before then: the Chance to win panel turns 54% as it lands.
    const card = at("s3", (e) => e.kind === "score" && e.value?.includes("0–1"), "0–1");
    // 8 s in puts the header at 13' on "fourteen minutes" and the 14' tick just after "score".
    const c = 8.0;
    const inT = card - c;
    S.s3 = [{ take: "s3", in: inT, len, cam: [[0, 0, 0, 1920], [c - 1.6, 0, 0, 1920], [c - 0.2, ...CAM.s3card], [len, ...CAM.s3cardEnd]], dipIn: true }];
  }

  // S4: the click on "6 facts checked", then a pan down the sheet to the event IDs and the check.
  {
    const len = D.s4 + GAP;
    const c = clickAt("s4", "6 facts checked");
    const inT = c.t - 1.2;
    S.s4 = [{ take: "s4", in: inT, len, cam: CAM.s4(len), clicks: [c] }];
  }

  // S5: placeholder until the API is updated: the animatic's still, a slow zoom to the agents.
  S.s5 = [{ still: resolve(DIR, "stills", "s5.jpg"), len: D.s5 + GAP, cam: CAM.s5(D.s5 + GAP) }];

  // S6: the take's last 6.85 s at plain ×60, untouched. N. Vidal's 61' goal reaches the score at
  // 66' (it waits for the pitch's replay), so the 1–2 lands about 5 s in, on "minute by minute".
  S.s6 = [{ take: "s6", in: take("s6").length - (D.s6 + GAP) - 0.05, len: D.s6 + GAP, cam: [[0, 0, 0, 1920]], dipOut: true }];

  // S7: back at 74' (a dip), then Malay, Analyst, and the broadcast graphic; a label per beat.
  {
    const lang = clickAt("s7", "language ms");
    const an = clickAt("s7", "Analyst");
    const b = [phraseAt("s7", "The same facts", D.s7), phraseAt("s7", "For an analyst", D.s7), phraseAt("s7", "And as a broadcast", D.s7), D.s7 + GAP];
    S.s7 = [
      { take: "s7", in: lang.t - b[0] + 0.6, len: b[0], cam: [[0, ...CAM.s7wide], [b[0], ...CAM.s7wide]], clicks: [lang], dipIn: true },
      { take: "s7", in: lang.t + 0.6, len: b[1] - b[0], cam: [[0, ...CAM.s7wide], [0.7, ...CAM.s7wide], [1.9, ...CAM.s7ms], [b[1] - b[0], ...CAM.s7msEnd]], label: "Casual · Bahasa Melayu" },
      { take: "s7", in: an.t - 0.8, len: b[2] - b[1], cam: [[0, ...CAM.s7wide], [1.0, ...CAM.s7wide], [2.2, ...CAM.s7an], [b[2] - b[1], ...CAM.s7anEnd]], clicks: [an], label: "Analyst" },
      { take: "s7ov", in: 0.5, len: b[3] - b[2], cam: [[0, 0, 0, 1920], [b[3] - b[2], 0, 0, 1920]], label: "Broadcast graphic", labelTop: 160 }, // below the overlay's score bug
    ];
  }

  // S8: the Full-time story: a punch-in on the headline, then a pan across the turning points.
  {
    const len = D.s8 + GAP;
    const story = at("s8", (e) => e.kind === "period" && e.value === "FT", "full time") + CAM.s8delay;
    S.s8 = [{ take: "s8", in: story, len, cam: CAM.s8(len) }];
  }

  S.s9 = [{ graphic: "pipeline", len: D.s9 + GAP }];
  S.s10 = [{ graphic: "endcard", len: 6.5 }];
  return S;
}

// Camera framings, in CSS px of the take ([x, y, width]); set from looking at the takes' frames.
// The page is 1920×1440: the score sits near y 200, the Key moments card at x 1200–1540, y 960–1160.
const CAM = {
  s1score: [125, 40, 1670], // 115% on the score
  s1end: [250, 480, 1670], // 115% on the 74' card and the chance panel
  s3card: [570, 681, 1350], // 142% on the 14' card, below the Chance to win panel's 54%
  s3cardEnd: [585, 690, 1330],
  // From the card's "6 facts checked" to the sheet's top, then down to its two event IDs while
  // "Checked by the validator" stays in frame.
  s4: (len) => [[0, 0, 300, 1920], [2.0, 0, 300, 1920], [3.8, 549, 0, 1371], [6.6, 549, 0, 1371], [9.0, 549, 222, 1371], [len, 549, 222, 1371]],
  // Placeholder still (1920×1080): the headline, then 115% toward The agents at work's rejected step.
  s5: (len) => [[0, 0, 0, 1920], [2.5, 0, 0, 1920], [len, 250, 141, 1670]],
  s7wide: [0, 0, 1920],
  s7ms: [420, 596, 1500], // the chance panel, momentum and the Malay 74' card
  s7msEnd: [430, 600, 1480],
  s7an: [282, 448, 1371], // 140%: the pitch's team-shape lines and the analyst card's xG and km/h
  s7anEnd: [290, 452, 1355],
  s8delay: 3.5,
  s8: (len) => [[0, 0, 0, 1920], [1.0, 0, 0, 1920], [2.4, 380, 430, 1371], [3.8, 380, 430, 1371], [6.0, 300, 660, 1371], [len, 300, 660, 1371]],
};

// Burned-in key lines (the S7 labels are the parts' labels). Exact voiceover words, ≤ 42 a line.
const KEYLINES = [
  { id: "s1", text: "But a score doesn't tell you why." },
  { id: "s3", text: "Kingston's chance to win jumps from\ntwenty-four to fifty-three percent." },
];

// ---- camera maths: ffmpeg expressions for an eased keyframe path ----

const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
function camAt(cam, t) {
  if (t <= cam[0][0]) return cam[0].slice(1);
  for (let i = 0; i < cam.length - 1; i++) {
    const [t0, ...a] = cam[i];
    const [t1, ...b] = cam[i + 1];
    if (t <= t1) {
      const e = ease((t - t0) / (t1 - t0 || 1));
      return a.map((v, k) => v + (b[k] - v) * e);
    }
  }
  return cam.at(-1).slice(1);
}
/** An ffmpeg expression for one camera channel (k: 0 x, 1 y, 2 w) over the part's time t. */
function camExpr(cam, k) {
  let expr = String(cam.at(-1)[k + 1]);
  for (let i = cam.length - 2; i >= 0; i--) {
    const [t0, ...a] = cam[i];
    const [t1, ...b] = cam[i + 1];
    const p = `clip((t-${t0})/${Math.max(t1 - t0, 0.001)},0,1)`;
    const e = `if(lt(${p},0.5),4*pow(${p},3),1-pow(-2*${p}+2,3)/2)`;
    expr = `if(lt(t,${t1}),${a[k]}+(${b[k] - a[k]})*${e},${expr})`;
  }
  return expr;
}
/** Where a CSS point of the take lands in the 1920×1080 output at part time t. */
function toOutput(cam, t, x, y) {
  const [cx, cy, cw] = camAt(cam, t);
  const z = 1920 / cw;
  return [Math.round((x - cx) * z), Math.round((y - cy) * z)];
}

// ---- rendering ----

async function renderPart(browser, id, i, part) {
  const file = resolve(WORK, "shots", `${id}-${i}.mp4`);
  const frames = Math.round(part.len * FPS);
  const args = ["-y", "-loglevel", "error"];
  const filters = [];
  let cssW = 1920;
  let cssH = 1080;
  // The base picture.
  if (part.take) {
    const t = take(part.take);
    cssW = t.size.width;
    cssH = t.size.height;
    const src = resolve(DIR, "takes", `${part.take}.mp4`);
    if (part.freeze !== undefined) args.push("-ss", part.freeze.toFixed(3), "-i", src);
    else args.push("-ss", Math.max(0, part.in).toFixed(3), "-i", src);
  } else if (part.still) {
    args.push("-loop", "1", "-framerate", String(FPS), "-i", part.still);
  } else {
    args.push("-framerate", String(FPS), "-i", resolve(WORK, "graphics", part.graphic, "%04d.png"));
  }
  const cam = part.cam ?? [[0, 0, 0, 1920]];
  let base = "[0:v]";
  if (part.freeze !== undefined) filters.push(`${base}trim=end_frame=1,loop=loop=-1:size=1,setpts=N/${FPS}/TB[b0]`);
  else if (part.take && part.in < 0) filters.push(`${base}tpad=start_duration=${(-part.in).toFixed(3)}:start_mode=clone,setpts=PTS-STARTPTS[b0]`);
  else filters.push(`${base}fps=${FPS},setpts=PTS-STARTPTS[b0]`);
  // Camera: scale per frame so the region is 1920 wide, then crop it.
  if (part.graphic) filters.push(`[b0]scale=1920:1080,tpad=stop_mode=clone:stop_duration=10[v0]`);
  else {
    const W = camExpr(cam, 2);
    const scale = `scale=w='trunc(${cssW}*1920/(${W})/2)*2':h=-2:eval=frame:flags=lanczos`;
    // Clamp to the picture ourselves: crop's iw/ih keep the first frame's size as the scale changes.
    const crop = `crop=1920:1080:'clip(${camExpr(cam, 0)}*1920/(${W}),0,${cssW}*1920/(${W})-1920)':'clip(${camExpr(cam, 1)}*1920/(${W}),0,${cssH}*1920/(${W})-1080)'`;
    filters.push(`[b0]tpad=stop_mode=clone:stop_duration=10,${scale},${crop},setsar=1[v0]`);
  }
  // Overlays: graphics, labels, key-line captions, click rings.
  const over = [...(part.gfx ?? [])];
  if (part.label) {
    const top = part.labelTop ? `&top=${part.labelTop}` : "";
    over.push({ dir: await gfx(browser, `label.html?text=${encodeURIComponent(part.label)}&len=${part.len.toFixed(2)}${top}`), at: 0 });
  }
  for (const k of part.keylines ?? []) over.push({ dir: await gfx(browser, `caption.html?text=${encodeURIComponent(k.text)}&len=${k.len.toFixed(2)}`), at: k.at });
  for (const c of part.clicks ?? []) {
    const t = c.t - part.in;
    const [x, y] = toOutput(cam, t, c.x, c.y);
    over.push({ dir: await gfx(browser, `click.html?x=${x}&y=${y}`), at: Math.max(0, t) });
  }
  let last = "[v0]";
  over.forEach((o, k) => {
    args.push("-framerate", String(FPS), "-i", resolve(WORK, "graphics", o.dir, "%04d.png"));
    filters.push(`[${k + 1}:v]setpts=PTS-STARTPTS+${o.at.toFixed(3)}/TB[o${k}]`);
    filters.push(`${last}[o${k}]overlay=eof_action=pass:format=auto[v${k + 1}]`);
    last = `[v${k + 1}]`;
  });
  // Dips to black at the flash-back and the return to 74'.
  const fades = [];
  if (part.dipIn) fades.push(`fade=t=in:st=0:d=${DIP / FPS}`);
  if (part.dipOut) fades.push(`fade=t=out:st=${(frames - DIP) / FPS}:d=${DIP / FPS}`);
  filters.push(`${last}${fades.length ? fades.join(",") + "," : ""}format=yuv420p[out]`);
  args.push("-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", String(frames), "-r", String(FPS),
    "-c:v", "libx264", "-preset", "medium", "-crf", "12", file);
  await run(FFMPEG, args);
  return file;
}

const rendered = new Map();
async function gfx(browser, query) {
  const name = query.replace(/\.html/, "").replace(/[^a-z0-9]+/gi, "-").slice(0, 80);
  if (!rendered.has(name)) {
    rendered.set(name, renderGraphic(browser, query, resolve(WORK, "graphics", name), FPS));
  }
  await rendered.get(name);
  return name;
}

// ---- captions (.srt): each line split into cues of ≤ 2 × 42 characters, ≤ 20 per second ----

function cues(text) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 42) {
      lines.push(cur.trim());
      cur = w;
    } else cur = `${cur} ${w}`;
    if (/[.,:?]$/.test(w) && cur.trim().length > 28) {
      lines.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  const out = [];
  for (let i = 0; i < lines.length; i += 2) out.push(lines.slice(i, i + 2));
  return out;
}
const stamp = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
function srt(starts, D) {
  const rows = [];
  for (const id of IDS) {
    const groups = cues(VO[id]);
    const total = groups.reduce((n, g) => n + g.join(" ").length, 0);
    let t = starts[id];
    for (const g of groups) {
      const len = (g.join(" ").length / total) * D[id];
      const cps = g.join(" ").length / len;
      if (cps > 20) console.warn(`  ! ${id} cue at ${cps.toFixed(1)} cps: "${g.join(" ")}"`);
      rows.push([t, t + len, g.join("\n")]);
      t += len;
    }
  }
  return rows.map(([a, b, text], i) => `${i + 1}\n${stamp(a)} --> ${stamp(Math.min(b, a + 7))}\n${text}\n`).join("\n");
}

// ---- main ----

const D = {};
for (const id of IDS) D[id] = await duration(resolve(DIR, "vo", `${id}.mp3`));
const S = shots(D);
// Key lines go on the part that holds their words.
for (const k of KEYLINES) {
  const start = phraseAt(k.id, k.text.split("\n")[0], D[k.id]);
  const words = k.text.replace("\n", " ").length / VO[k.id].length;
  let off = 0;
  for (const part of S[k.id]) {
    if (start < off + part.len) {
      (part.keylines ??= []).push({ text: k.text, at: start - off, len: Math.min(words * D[k.id] + 0.6, off + part.len - start) });
      break;
    }
    off += part.len;
  }
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
const files = [];
const starts = {};
let clock = 0;
try {
  for (const g of ["lower-third", "pipeline", "endcard"]) {
    if (!existsSync(resolve(WORK, "graphics", g, "0000.png"))) await gfx(browser, `${g}.html`).then((n) => console.log(`  rendered ${n}`));
  }
  for (const id of IDS) {
    starts[id] = clock;
    for (const [i, part] of S[id].entries()) {
      const file = resolve(WORK, "shots", `${id}-${i}.mp4`);
      if (only.length === 0 || only.includes(id) || !existsSync(file)) {
        await renderPart(browser, id, i, part);
        console.log(`  ✓ ${id}-${i} (${part.len.toFixed(2)} s)`);
      }
      files.push(file);
      clock += Math.round(part.len * FPS) / FPS;
    }
  }
} finally {
  await browser.close();
}

// Join the shots, lay each line at its shot's start, and encode the upload.
writeFileSync(resolve(WORK, "shots.txt"), files.map((f) => `file '${f}'`).join("\n"));
const audioIn = IDS.flatMap((id) => ["-i", resolve(DIR, "vo", `${id}.mp3`)]);
const delays = IDS.map((id, i) => `[${i + 1}:a]aresample=48000,adelay=${Math.round(starts[id] * 1000)}:all=1[a${i}]`);
const mix = `${delays.join(";")};${IDS.map((_, i) => `[a${i}]`).join("")}amix=inputs=${IDS.length}:normalize=0:dropout_transition=0,apad[aout]`;
const mp4 = resolve(DIR, "match-room-demo.mp4");
// macOS's AudioToolbox AAC holds a true 192k in CBR mode; ffmpeg's own AAC drops to ~150k on speech.
const AAC = (await run(FFMPEG, ["-hide_banner", "-encoders"])).includes("aac_at")
  ? ["-c:a", "aac_at", "-aac_at_mode", "cbr", "-b:a", "192k"]
  : ["-c:a", "aac", "-b:a", "192k"];
await run(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", resolve(WORK, "shots.txt"), ...audioIn,
  "-filter_complex", mix, "-map", "0:v", "-map", "[aout]", "-shortest",
  // Constant 10 Mbit/s: an average target undershoots badly on a still UI, and the spec is ≥ 8.
  "-c:v", "libx264", "-preset", "slow", "-b:v", "10M", "-minrate", "10M", "-maxrate", "10M", "-bufsize", "20M",
  "-x264-params", "nal-hrd=cbr", "-pix_fmt", "yuv420p", "-r", String(FPS),
  ...AAC, "-ar", "48000", "-movflags", "+faststart", mp4]);
writeFileSync(resolve(DIR, "match-room-demo.srt"), srt(starts, D));

// A contact sheet: one frame from the middle of each shot.
const mids = IDS.map((id, i) => (starts[id] + (starts[IDS[i + 1]] ?? clock)) / 2);
await run(FFMPEG, ["-y", "-loglevel", "error", "-i", mp4, "-vf",
  `select='${mids.map((m) => `eq(n\\,${Math.round(m * FPS)})`).join("+")}',scale=640:-1,tile=2x5`,
  "-frames:v", "1", "-update", "1", resolve(DIR, "contact-sheet.jpg")]);
writeFileSync(resolve(WORK, "timeline.json"), JSON.stringify({ starts, length: clock }, null, 1));
console.log(`built ${mp4}: ${(await duration(mp4)).toFixed(2)} s`);
