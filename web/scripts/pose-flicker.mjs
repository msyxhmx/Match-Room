// Body flicker check (figures.ts): how often a figure's view (side/front/back), facing (left/right)
// and stand-vs-moving pose switch, and how many of those switches undo themselves within 0.5 s.
// Samples at 60 fps over the planner's live pitch and over the real DFL playback.
//   node scripts/pose-flicker.mjs [planner|real|both] [speed=60] [minutes=13]
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { createServer } = await import(resolve(web, "node_modules/vite/dist/node/index.js"));
const server = await createServer({ root: web, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
const load = (p) => server.ssrLoadModule(p);
const { figurePose, PREV_DT, QUARTER_DT, HALF_DT, FULL_DT } = await load("/src/pitch/figures.ts");
const which = process.argv[2] ?? "both";
const speed = Number(process.argv[3] ?? 60), to = Number(process.argv[4] ?? 13);
const DT = 1 / 60;
const byId = (f) => new Map(f.dots.map((d) => [d.id, d]));

function counter() {
  const c = { view: [0, 0], facing: [0, 0], standMove: [0, 0] };
  const last = new Map();
  let secs = 0;
  return {
    reset: () => last.clear(),
    tick: () => (secs += DT),
    // frames: now, and the ones at the four look-backs
    pose(t, f, fr) {
      const m = [fr.p1, fr.p2, fr.q, fr.h, fr.w].map(byId);
      for (const d of f.dots) {
        const pose = figurePose(d, m[0].get(d.id), f, false, m[1].get(d.id), { q: m[2].get(d.id), h: m[3].get(d.id), w: m[4].get(d.id) });
        const now = { view: pose.view, facing: pose.facing, standMove: pose.move !== undefined ? pose.move >= 0.5 : pose.speed >= 0.5 };
        const L = last.get(d.id) ?? {};
        for (const k of Object.keys(c)) {
          if (L[k] !== undefined && L[k] !== now[k]) { c[k][0]++; if (t - (L[k + "T"] ?? -9) < 0.5) c[k][1]++; L[k + "T"] = t; }
          L[k] = now[k];
        }
        last.set(d.id, L);
      }
    },
    report(label) {
      const pm = (n) => (n / 22 / secs * 60).toFixed(1);
      console.log(`${label}, ${secs.toFixed(0)} s. Per player per minute (undone within 0.5 s):`);
      for (const k in c) console.log(`  ${k.padEnd(10)} ${pm(c[k][0]).padStart(5)}/min   flicker ${pm(c[k][1]).padStart(5)}/min (${(100 * c[k][1] / Math.max(1, c[k][0])).toFixed(0)}%)`);
    },
  };
}

if (which === "planner" || which === "both") {
  const { toMoments } = await load("/src/pitch/moments.ts");
  const { program } = await load("/src/pitch/director.ts");
  const events = JSON.parse(readFileSync(resolve(web, "src/live/saved/events.json"), "utf8"));
  const players = JSON.parse(readFileSync(resolve(web, "src/live/saved/lineups.json"), "utf8")).players;
  const tick = 60 / speed, moments = toMoments(events, { live: true });
  const arrivals = new Map(); const plans = [];
  for (let m = 1; m <= to; m++) {
    arrivals.set(m, m * tick);
    plans.push({ at: m * tick, prog: program(players, moments.filter((x) => arrivals.has(x.minute)), { speed, arrivals: new Map(arrivals), start: 0, initial: { kind: "kickoff", kicking: "home" } }) });
  }
  const planAt = (t) => { let p = plans[0]; for (const q of plans) if (q.at <= t) p = q; return p; };
  const shot = (t) => planAt(t).prog.shotAt(t, { continuous: true });
  const c = counter();
  for (let t = 1; t < to * tick; t += DT) {
    const s = shot(t); if (s.replayOf) continue; c.tick();
    c.pose(t, s.frame, { p1: shot(t - PREV_DT).frame, p2: shot(t - 2 * PREV_DT).frame, q: shot(t - QUARTER_DT).frame, h: shot(t - HALF_DT).frame, w: shot(t - FULL_DT).frame });
  }
  c.report(`planner live pitch, x${speed}, ${to} min`);
}
if (which === "real" || which === "both") {
  const { realTimeline } = await load("/src/pitch/real.ts");
  const { frameAt } = await load("/src/pitch/frame.ts");
  const slice = JSON.parse(readFileSync(resolve(web, "src/pitch/real/slice.json"), "utf8"));
  const passages = slice.passages ?? slice;
  const c = counter();
  for (const p of passages) {
    const tl = realTimeline(p); c.reset();
    for (let t = tl.start + 1; t < tl.end; t += DT) {
      c.tick();
      c.pose(t, frameAt(tl, t), { p1: frameAt(tl, t - PREV_DT), p2: frameAt(tl, t - 2 * PREV_DT), q: frameAt(tl, t - QUARTER_DT), h: frameAt(tl, t - HALF_DT), w: frameAt(tl, t - FULL_DT) });
    }
  }
  c.report(`real DFL playback, ${passages.length} passages`);
}
await server.close();
