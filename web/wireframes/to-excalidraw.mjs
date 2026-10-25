import fs from "node:fs";
const sk = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let n = 0; const now = 1792886000000;
const base = (type, x, y, w, h, extra = {}) => ({
  id: `mr-${type}-${++n}`, type, x, y, width: w, height: h, angle: 0,
  strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2,
  strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null,
  seed: 1000 + n * 7, version: 1, versionNonce: 2000 + n * 11, isDeleted: false, boundElements: null,
  updated: now, link: null, locked: false, ...extra });
const text = (x, y, s, size = 16, extra = {}) => base("text", x, y, Math.max(8, s.length * size * 0.55), size * 1.25, {
  text: s, originalText: s, fontSize: size, fontFamily: 1, textAlign: "left", verticalAlign: "top",
  containerId: null, lineHeight: 1.25, autoResize: true, ...extra });
const els = [];
els.push(text(0, -120, "Match-Room Live · wireframes (step 4)", 36));
els.push(text(0, -70, "Crazy 8s for the live screen, then layout B (chosen). Frames are 1920x1080 scaled to 25%.", 18, { strokeColor: "#555555" }));
const S = 0.25, FW = 1920 * S, FH = 1080 * S, GAP = 60;
sk.forEach((s, i) => {
  const ox = (i % 4) * (FW + GAP), oy = Math.floor(i / 4) * (FH + 140);
  els.push(base("rectangle", ox, oy, FW, FH, { strokeColor: "#adb5bd" }));
  els.push(text(ox, oy + FH + 10, s.name, 18));
  els.push(text(ox, oy + FH + 36, s.verdict === "candidate" ? "goes forward" : s.verdict, 14, { strokeColor: "#868e96" }));
  s.els.forEach(e => {
    const x = ox + e.x * S, y = oy + e.y * S, w = e.w * S, h = e.h * S;
    if (e.t === "r" || e.t === "bars") els.push(base("rectangle", x + 2, y + 2, w - 4, h - 4,
      { backgroundColor: e.hatch ? "#dee2e6" : e.big ? "#e9ecef" : "transparent", fillStyle: e.hatch ? "hachure" : "solid", strokeWidth: e.big ? 2 : 1 }));
    if (e.t === "lines") for (let k = 0; k < e.n; k++) els.push(base("line", x, y + k * 14, e.w * S, 0, { points: [[0, 0], [e.w * S * (k === e.n - 1 ? 0.6 : 1), 0]], strokeColor: "#868e96", lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null }));
    if (e.l) els.push(text(x + 8, y + 6, e.l, 13));
  });
});
// layout B at 50%
const BX = 0, BY = 2 * (FH + 140) + 80, B = 0.5;
els.push(text(BX, BY - 50, "Chosen: B · Centre stage (50%)", 28));
els.push(base("rectangle", BX, BY, 1920 * B, 1080 * B, { strokeColor: "#adb5bd" }));
els.push(base("rectangle", BX + 96 * B, BY + 54 * B, 1728 * B, 1026 * B - 54 * B, { strokeColor: "#ced4da", strokeStyle: "dashed", strokeWidth: 1 }));
const box = (x, y, w, h, l, big) => { els.push(base("rectangle", BX + x * B, BY + y * B, w * B, h * B, { backgroundColor: big ? "#e9ecef" : "#ffffff", roundness: { type: 3 } })); els.push(text(BX + x * B + 12, BY + y * B + 10, l, big ? 22 : 16)); };
box(96, 54, 1728, 50, "Top bar: LIVE · scenario · following NGC · L. Quinn · EN · Synthetic data");
box(96, 124, 1728, 190, "1 Score header: NGC 2 · 74' · 2 KST (team glow on each end)");
box(250, 334, 1420, 464, "2 THE MOMENT: Northgate City make it count / why: Chance to win 5% → 28% / three-way bar + note / [Facts used]", true);
box(96, 806, 1728, 220, "4 Timeline: one bar per minute, ● goals, ○ moments (tap to select), ‹ earlier ›");
const scene = { type: "excalidraw", version: 2, source: "https://excalidraw.com", elements: els,
  appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {} };
fs.writeFileSync(process.argv[3], JSON.stringify(scene, null, 1));
console.log(els.length, "elements");
