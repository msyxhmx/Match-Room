// Measures the design tokens instead of trusting our eyes. Run: npm run check:tokens
// Fails (exit 1) if any text colour is under 4.5:1 on white or the ground, a large-only colour
// is under 3:1, a club is missing or too close to the demo clubs or Live red, or theme.css and
// clubColours.ts disagree. `--json` prints the measured values for the token sheet instead.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, p), "utf8");
const css = read("../src/theme.css");
const ts = read("../src/clubColours.ts");
const teamsPy = read("../../sim/teams.py");

const WHITE = "#ffffff";
const TEXT_MIN = 4.5; // WCAG 1.4.3
const LARGE_MIN = 3; // WCAG 1.4.3 large text, and 1.4.11 non-text
const DISTINCT_MIN = 20; // ΔE2000 from NGC, KST and Live red
const PAIR_WARN = 10; // ΔE2000 between any two clubs: warn only, they rarely meet on camera

// ---- colour maths (sRGB, WCAG 2.2 relative luminance, CIEDE2000) ----
const channels = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (h) => {
  const [r, g, b] = channels(h).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const lab = (h) => {
  const [r, g, b] = channels(h).map(linear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const deltaE = (c1, c2) => {
  const [L1, a1, b1] = lab(c1);
  const [L2, a2, b2] = lab(c2);
  const rad = Math.PI / 180;
  const Cbar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G);
  const C1 = Math.hypot(ap1, b1), C2 = Math.hypot(ap2, b2);
  const hue = (b, a) => { const h = Math.atan2(b, a) / rad; return h < 0 ? h + 360 : h; };
  const h1 = hue(b1, ap1), h2 = hue(b2, ap2);
  let dh = C1 * C2 === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2, Cb = (C1 + C2) / 2;
  let hb = h1 + h2;
  if (C1 * C2 !== 0) hb = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad)
    + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dT = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cb, SH = 1 + 0.015 * Cb * T;
  const RT = -Math.sin(2 * dT * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
};

// ---- read the :root tokens from theme.css ----
const rootBlock = css.match(/^:root\s*\{([\s\S]*?)^\}/m)?.[1] ?? "";
const tokens = {};
for (const [, name, value] of rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[name] = value.trim();
const hexOf = (name, seen = []) => {
  const v = tokens[name];
  const ref = v?.match(/^var\((--[\w-]+)\)$/);
  if (ref && !seen.includes(name)) return hexOf(ref[1], [...seen, name]);
  return /^#[0-9a-f]{6}$/i.test(v ?? "") ? v.toLowerCase() : null;
};

// ---- read the clubs from clubColours.ts and the ids from sim/teams.py ----
const clubs = {};
const clubRe = /(\w{3}): \{ name: "([^"]+)", colourName: "([^"]+)", primary: "(#\w{6})", glow: "(#\w{6})", text: "(#\w{6})" \}/g;
for (const [, id, name, colourName, primary, glow, text] of ts.matchAll(clubRe)) {
  clubs[id] = { name, colourName, primary: primary.toLowerCase(), glow: glow.toLowerCase(), text: text.toLowerCase() };
}
const simIds = [...teamsPy.matchAll(/^\s+\("([A-Z]{3})", "/gm)].map((m) => m[1]);

// ---- checks ----
const failures = [];
const rows = [];
const check = (label, ratio, min) => {
  const ok = ratio >= min;
  rows.push({ label, ratio: Math.round(ratio * 100) / 100, min, ok });
  if (!ok) failures.push(`${label}: ${ratio.toFixed(2)}:1, needs ${min}:1`);
};

const ground = hexOf("--surface-ground");
if (!ground) failures.push("--surface-ground is missing or not a hex colour");
const names = Object.keys(tokens);
const textTokens = names.filter((n) => (/^--text-/.test(n) || /-text(-large)?$/.test(n)));
const fillTokens = names.filter((n) => n.endsWith("-fill") && tokens[`${n.slice(0, -5)}-on-fill`]);
const tintTokens = names.filter((n) => /^--state-.+-tint$/.test(n));

for (const n of textTokens) {
  const hex = hexOf(n);
  if (!hex) { failures.push(`${n} is not a hex colour (${tokens[n]})`); continue; }
  if (n.endsWith("-large")) check(`${n} on white (large text)`, contrast(hex, WHITE), LARGE_MIN);
  else {
    check(`${n} on white`, contrast(hex, WHITE), TEXT_MIN);
    if (ground) check(`${n} on ground`, contrast(hex, ground), TEXT_MIN);
  }
}
for (const n of fillTokens) {
  const on = `${n.slice(0, -5)}-on-fill`;
  check(`${on} on ${n}`, contrast(hexOf(on), hexOf(n)), TEXT_MIN);
}
for (const n of tintTokens) {
  const text = n.replace(/-tint$/, "-text");
  if (!hexOf(text)) { failures.push(`${n} has no matching ${text}`); continue; }
  check(`${text} on ${n}`, contrast(hexOf(text), hexOf(n)), TEXT_MIN);
}
// Guard against a regex that silently matches nothing.
if (textTokens.length < 8) failures.push(`only ${textTokens.length} text tokens found in theme.css; parser broken?`);
if (fillTokens.length < 2) failures.push(`only ${fillTokens.length} fill pairs found in theme.css; parser broken?`);
if (tintTokens.length < 3) failures.push(`only ${tintTokens.length} state tints found in theme.css; parser broken?`);

const clubIds = Object.keys(clubs);
if (simIds.length !== 8) failures.push(`expected 8 clubs in sim/teams.py, found ${simIds.length}`);
for (const id of simIds) if (!clubs[id]) failures.push(`club ${id} from sim/teams.py has no colours in clubColours.ts`);
for (const id of clubIds) if (!simIds.includes(id)) failures.push(`clubColours.ts has ${id}, which isn't in sim/teams.py`);

for (const [id, c] of Object.entries(clubs)) {
  check(`${id} text on white`, contrast(c.text, WHITE), TEXT_MIN);
  if (ground) check(`${id} text on ground`, contrast(c.text, ground), TEXT_MIN);
  check(`${id} primary on white (non-text)`, contrast(c.primary, WHITE), LARGE_MIN);
}

// The locked demo pair must match theme.css's default slots exactly.
for (const [slot, id] of [["home", "NGC"], ["away", "KST"], ["you", "NGC"]]) {
  for (const key of ["primary", "glow", "text"]) {
    const cssHex = hexOf(`--${slot}-${key}`);
    if (cssHex !== clubs[id]?.[key]) failures.push(`--${slot}-${key} is ${cssHex}, but ${id}.${key} is ${clubs[id]?.[key]}`);
  }
}

const live = hexOf("--live-fill");
const anchors = { NGC: clubs.NGC?.primary, KST: clubs.KST?.primary, Live: live };
const distinct = [];
for (const [id, c] of Object.entries(clubs)) {
  if (id === "NGC" || id === "KST") continue;
  for (const [anchor, hex] of Object.entries(anchors)) {
    if (!hex) continue;
    const d = deltaE(c.primary, hex);
    distinct.push({ club: id, from: anchor, deltaE: Math.round(d * 10) / 10, ok: d >= DISTINCT_MIN });
    if (d < DISTINCT_MIN) failures.push(`${id} is only ΔE ${d.toFixed(1)} from ${anchor}, needs ${DISTINCT_MIN}`);
  }
}
const warnings = [];
for (let i = 0; i < clubIds.length; i++) {
  for (let j = i + 1; j < clubIds.length; j++) {
    const d = deltaE(clubs[clubIds[i]].primary, clubs[clubIds[j]].primary);
    if (d < PAIR_WARN) warnings.push(`${clubIds[i]} and ${clubIds[j]} are only ΔE ${d.toFixed(1)} apart`);
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ clubs, contrast: rows, distinct, warnings, failures }, null, 2));
} else {
  for (const r of rows) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.ratio.toFixed(2).padStart(5)}:1  (min ${r.min})  ${r.label}`);
  for (const d of distinct) console.log(`${d.ok ? "ok  " : "FAIL"} ΔE ${d.deltaE.toFixed(1).padStart(5)}  (min ${DISTINCT_MIN})  ${d.club} vs ${d.from}`);
  for (const w of warnings) console.log(`warn ${w}`);
  console.log(failures.length ? `\n${failures.length} token check(s) failed:\n- ${failures.join("\n- ")}` : `\nAll ${rows.length + distinct.length} token checks passed.`);
}
process.exit(failures.length ? 1 : 0);
