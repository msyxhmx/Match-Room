// Proof for the pitch choreography (web/src/pitch), the part that isn't taste (handoff §6.5).
// Run: npm run test:pitch      Exits 1 on any failure. Needs no browser.
//
// On the saved comeback match (every event, both lineups), at ×1 and ×60, from kick-off:
//   on-pitch    no player ever leaves the pitch (sampled every 1/30 s)
//   speed       nobody moves faster than a sprint (9.5 m/s, sway off)
//   eleven      at most 11 dots per team, and a red card takes one off for good
//   real-spot   at every shown moment's touch the ball is at the event's real coordinates and
//               the named player's dot is on it; a shown tackle/interception's player is at the
//               ball when it arrives
//   order       shown moments keep the match's order
//   stable      planning again after a new tick moves nothing already shown by more than 0.5 m
//   forced      every goal and card is shown (at ×1 every shot, corner and foul too)
//   replay      the frozen 74' loops the real equaliser (L. Quinn's goal) with its build-up

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({ root, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
const load = (p) => server.ssrLoadModule(p);
const { toMoments, isGoal } = await load("/src/pitch/moments.ts");
const { frameAt } = await load("/src/pitch/frame.ts");
const { liveTimeline, replayMinute } = await load("/src/pitch/schedule.ts");
const { isForced } = await load("/src/pitch/plan.ts");
const { HALF_L, HALF_W, dist } = await load("/src/pitch/geometry.ts");

const events = JSON.parse(readFileSync(resolve(root, "src/live/saved/events.json"), "utf8"));
const lineups = JSON.parse(readFileSync(resolve(root, "src/live/saved/lineups.json"), "utf8"));
const players = lineups.players;

let failures = 0;
const fail = (msg) => {
  failures++;
  if (failures <= 40) console.log("  FAIL", msg);
};

const SPRINT = 9.5;
const DT = 1 / 30;

function arrivalsAt(speed, from = 0) {
  const a = new Map();
  for (let m = from; m <= 90; m++) a.set(m, (m - from) * (60 / speed) + (m > 45 ? 15 * 60 / speed : 0));
  return a;
}

function check(label, tl, moments, speed) {
  console.log(`\n${label}: ${tl.beats.length} moments shown, ${tl.dropped.length} skipped, ${tl.end.toFixed(1)} s`);
  const prev = new Map();
  let maxV = 0;
  let maxAt = "";
  for (let t = tl.start; t <= tl.end; t += DT) {
    const f = frameAt(tl, t, { sway: false });
    const per = { home: 0, away: 0 };
    for (const d of f.dots) {
      per[d.side]++;
      if (Math.abs(d.x) > HALF_L + 0.6 || Math.abs(d.y) > HALF_W + 0.6)
        fail(`${label} on-pitch: ${d.id} at (${d.x.toFixed(1)}, ${d.y.toFixed(1)}) t=${t.toFixed(2)}`);
      const p = prev.get(d.id);
      if (p) {
        const v = Math.hypot(d.x - p.x, d.y - p.y) / DT;
        if (v > maxV) {
          maxV = v;
          maxAt = `${d.id} t=${t.toFixed(2)}`;
        }
      }
      prev.set(d.id, d);
    }
    if (per.home > 11 || per.away > 11) fail(`${label} eleven: ${per.home}/${per.away} at t=${t.toFixed(2)}`);
  }
  if (maxV > SPRINT) fail(`${label} speed: ${maxV.toFixed(1)} m/s (${maxAt})`);
  console.log(`  top speed ${maxV.toFixed(1)} m/s (${maxAt})`);

  let lastT = -1;
  let lags = [];
  for (const b of tl.beats) {
    const m = b.moment;
    const f = frameAt(tl, b.touch, { sway: false });
    if (!f.ball || dist(f.ball, m.from) > 0.05) fail(`${label} real-spot: ball not at ${m.id} at its touch`);
    const actor = f.dots.find((d) => d.id === b.actor);
    if (!actor || dist(actor, m.from) > 1.2) fail(`${label} real-spot: ${m.player} not on the ball for ${m.id}`);
    if (b.winnerShown) {
      const g = frameAt(tl, b.land, { sway: false });
      const w = g.dots.find((d) => d.id === b.receiver);
      if (!w || dist(w, m.to) > 1.2) fail(`${label} real-spot: winner ${m.winner.player} not at the ball for ${m.id}`);
    }
    if (m.t < lastT) fail(`${label} order: ${m.id} after a later moment`);
    lastT = m.t;
    lags.push(b.touch - b.ideal);
  }
  const shown = new Set(tl.beats.map((b) => b.moment.id));
  for (const m of moments) if (isForced(m, speed) && !shown.has(m.id)) fail(`${label} forced: ${m.kind} ${m.id} not shown`);
  lags.sort((a, b) => a - b);
  const pct = (q) => (lags.length ? lags[Math.floor(q * (lags.length - 1))].toFixed(2) : "-");
  console.log(`  lag behind ideal: median ${pct(0.5)} s, p90 ${pct(0.9)} s, max ${pct(1)} s`);
  const goals = tl.beats.filter((b) => isGoal(b.moment));
  console.log(
    "  goals land",
    goals.map((b) => `${b.moment.minute}' +${(b.land - (b.ideal - (b.moment.t % 60) / speed)).toFixed(2)}s`).join(", "),
  );
  const why = {};
  for (const d of tl.dropped) why[d.reason] = (why[d.reason] ?? 0) + 1;
  console.log("  skipped:", JSON.stringify(why));
}

const moments = toMoments(events);
console.log(`${events.length} events → ${moments.length} moments`);

for (const speed of [1, 60]) {
  const tl = liveTimeline(players, moments, {
    speed,
    arrivals: arrivalsAt(speed),
    start: 0,
    initial: { kind: "kickoff", kicking: "home" },
  });
  check(`x${speed}`, tl, moments, speed);
}

// Live: planning again after each tick never changes what was already on screen.
for (const speed of [1, 60]) {
  const all = arrivalsAt(speed);
  const opts = (upTo) => ({
    speed,
    arrivals: new Map([...all].filter(([m]) => m <= upTo)),
    start: 0,
    initial: { kind: "kickoff", kicking: "home" },
  });
  let worst = 0;
  let where = "";
  for (const k of [10, 30, 44, 60, 74, 86]) {
    const a = liveTimeline(players, moments.filter((m) => m.minute <= k), opts(k));
    const b = liveTimeline(players, moments.filter((m) => m.minute <= k + 1), opts(k + 1));
    const now = all.get(k + 1);
    for (let t = 0; t <= now; t += 0.1) {
      const fa = frameAt(a, t, { sway: false });
      const fb = frameAt(b, t, { sway: false });
      for (const d of fa.dots) {
        const e = fb.dots.find((x) => x.id === d.id);
        const gap = e ? dist(d, e) : 99;
        if (gap > worst) {
          worst = gap;
          where = `${d.id} t=${t.toFixed(1)} after minute ${k}`;
        }
      }
    }
  }
  if (worst > 0.5) fail(`x${speed} stable: a new tick moved the past by ${worst.toFixed(2)} m (${where})`);
  else console.log(`\nx${speed} stable: a new tick moves what was shown by at most ${worst.toFixed(2)} m`);
}

// A red card: one off, for good.
{
  const ev = events.filter((e) => e.minute <= 20);
  const red = { ...ev.find((e) => e.side === "away" && e.type === "pass"), event_id: "TEST-red", type: "card", outcome: "red" };
  red.second = 59;
  red.minute = 10;
  const ms = toMoments([...ev, red]);
  const tl = liveTimeline(players, ms, { speed: 1, arrivals: arrivalsAt(1), start: 0, initial: { kind: "kickoff", kicking: "home" } });
  const b = tl.beats.find((x) => x.moment.id === "TEST-red");
  if (!b) fail("eleven: the red card wasn't shown");
  else {
    const after = frameAt(tl, b.end + 1).dots.filter((d) => d.side === "away").length;
    const later = frameAt(tl, tl.end).dots.filter((d) => d.side === "away").length;
    if (after !== 10 || later !== 10) fail(`eleven: away has ${after}/${later} after a red card`);
    else console.log("\nred card: away down to 10 and stays 10");
  }
}

// At x60, every goal and card gets a replay with the real player on the real spot.
{
  const { cutsToReplay, BUILD_UP, replayMoment } = await load("/src/pitch/schedule.ts");
  const out = [];
  for (const m of moments.filter(cutsToReplay)) {
    const r = replayMoment(players, moments, m, BUILD_UP.cut);
    const b = r && r.timeline.beats.find((x) => x.moment === m);
    if (!b) fail(`forced: no replay for the ${m.minute}' ${m.kind}`);
    else {
      out.push(`${m.minute}' ${m.kind} lands ${b.land.toFixed(1)} s in`);
      check(`replay ${m.minute}' cut`, r.timeline, [], 1);
    }
  }
  console.log("\nx60 replays: " + out.join(", "));
}

// The frozen 74': the real equaliser.
{
  const r = replayMinute(players, moments, 74);
  const goal = r && r.timeline.beats.find((b) => isGoal(b.moment));
  if (!r || !goal || goal.moment.player !== "L. Quinn") fail("replay: 74' doesn't loop L. Quinn's goal");
  else {
    console.log(
      `\nreplay 74': ${r.timeline.beats.map((b) => `${b.moment.player} ${b.moment.kind}`).join(" → ")}; loop ${r.length.toFixed(1)} s`,
    );
    check("replay 74'", r.timeline, moments.filter((m) => r.timeline.beats.some((b) => b.moment === m)), 1);
  }
}

await server.close();
console.log(failures ? `\n${failures} failure(s)` : "\nall pitch checks pass");
process.exit(failures ? 1 : 0);
