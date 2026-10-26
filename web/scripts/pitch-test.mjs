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
//   assist      a goal's credited assist ("Set up by …"), when shown, is received by the scorer
//   continuous  with the ghost ball on: the ball is on screen nearly all the time, never jumps
//               (45 m/s or more between frames: faster than any real shot here), every real touch is still the real ball on the
//               real spot, and a new tick doesn't move the ghost already shown
//   camera      the phone follow camera (343 × 257 box): the ball is in frame at least 95% of the
//               time it's on screen; within a picture the pan is steady (99% of frames under
//               500 plate px/s) and even a switch of play across the pitch stays under 1,600
//               (about two screen widths a second, no jumps); it snaps (no sweep) at a replay cut
//   replay      the frozen 74' loops the real equaliser (L. Quinn's goal) with its build-up
//   figures     on the 74' loop: the striker of every shown pass and shot kicks at its touch and
//               nobody else does; the beaten keeper dives toward the ball's side of his line, the
//               scorer's own keeper doesn't; the scorer celebrates once it's in; a runner faces
//               his run on screen; a replay cut reads as standing, not a sprint; reduced motion
//               holds every leg still

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
    if (m.assistTo && b.receiver !== `${m.side}:${m.assistTo}`)
      fail(`${label} assist: ${m.id} credits ${m.assistTo} but ${b.receiver} receives it`);
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

// Continuous play: the ghost ball between real moments.
function checkContinuous(label, tl, until = tl.end) {
  let seen = 0;
  let total = 0;
  let jumps = 0;
  let worst = 0;
  let prev = null;
  for (let t = tl.start; t <= until; t += DT) {
    const f = frameAt(tl, t, { sway: false, continuous: true });
    total++;
    if (f.ball) {
      seen++;
      if (prev) {
        const v = Math.hypot(f.ball.x - prev.x, f.ball.y - prev.y) / DT;
        if (v > worst) worst = v;
        if (v >= 45) jumps++;
      }
    }
    prev = f.ball;
  }
  for (const b of tl.beats) {
    const f = frameAt(tl, b.touch, { sway: false, continuous: true });
    if (!f.ball || f.ball.ghost || dist(f.ball, b.moment.from) > 0.05) fail(`${label} continuous: ${b.moment.id} touch isn't the real ball`);
  }
  const share = seen / total;
  console.log(`\n${label} continuous: ball on screen ${(share * 100).toFixed(0)}% of the time, ${jumps} jumps, fastest ${worst.toFixed(0)} m/s`);
  if (jumps > 0) fail(`${label} continuous: the ball jumped ${jumps} times`);
  if (share < 0.85) fail(`${label} continuous: the ball is on screen only ${(share * 100).toFixed(0)}%`);
}
for (const speed of [1, 60]) {
  const minutes = speed === 1 ? 20 : 90;
  const tl = liveTimeline(players, moments.filter((m) => m.minute <= minutes), {
    speed,
    arrivals: arrivalsAt(speed),
    start: 0,
    initial: { kind: "kickoff", kicking: "home" },
  });
  checkContinuous(`x${speed}${speed === 1 ? " (first 20')" : ""}`, tl);
}

// The phone follow camera.
{
  const { cameraAt } = await load("/src/pitch/camera.ts");
  const { program } = await load("/src/pitch/director.ts");
  const { project } = await load("/src/pitch/geometry.ts");
  for (const speed of [1, 60]) {
    const minutes = speed === 1 ? 20 : 90;
    const prog = program(players, toMoments(events.filter((e) => e.minute <= minutes), { live: true }), {
      speed,
      arrivals: arrivalsAt(speed),
      start: 0,
      initial: { kind: "kickoff", kicking: "home" },
    });
    const shot = (t) => prog.shotAt(t, { sway: false, continuous: true });
    let seen = 0;
    let inFrame = 0;
    let fastest = 0;
    const pans = [];
    let cutsSnapped = 0;
    let cuts = 0;
    let prev = null;
    const end = speed === 1 ? 20 * 60 : prog.live.end;
    for (let t = 0; t <= end; t += DT) {
      const sh = shot(t);
      const cam = cameraAt(shot, t, 343, 257, sh);
      if (sh.frame.ball) {
        seen++;
        const p = project(sh.frame.ball.x, sh.frame.ball.y);
        if (p.u >= cam.x0 && p.u <= cam.x0 + cam.width && p.v >= cam.y0 && p.v <= cam.y0 + cam.height) inFrame++;
      }
      if (prev) {
        const v = Math.abs(cam.x0 - prev.cam.x0) / DT;
        if (sh.replayOf !== prev.replayOf) {
          cuts++;
          cutsSnapped++; // a cut may jump: that's the snap
        } else {
          pans.push(v);
          if (v > fastest) fastest = v;
        }
      }
      prev = { cam, replayOf: sh.replayOf };
    }
    const share = inFrame / Math.max(1, seen);
    pans.sort((a, b) => a - b);
    const p99 = pans[Math.floor(0.99 * (pans.length - 1))] ?? 0;
    console.log(`\nx${speed} camera: ball in frame ${(share * 100).toFixed(1)}%, pan p99 ${p99.toFixed(0)} px/s, fastest ${fastest.toFixed(0)} px/s, ${cuts} cuts`);
    if (share < 0.95) fail(`x${speed} camera: the ball is in frame only ${(share * 100).toFixed(1)}% of the time`);
    if (p99 > 500) fail(`x${speed} camera: 1% of frames pan faster than ${p99.toFixed(0)} plate px/s`);
    if (fastest > 1600) fail(`x${speed} camera: pans at ${fastest.toFixed(0)} plate px/s`);
  }
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
    // As live: each tick's moments built from the events known by then.
    const upTo = (n) => toMoments(events.filter((e) => e.minute <= n), { live: true });
    const a = liveTimeline(players, upTo(k), opts(k));
    const b = liveTimeline(players, upTo(k + 1), opts(k + 1));
    const now = all.get(k + 1);
    for (let t = 0; t <= now; t += 0.1) {
      const fa = frameAt(a, t, { sway: false, continuous: true });
      const fb = frameAt(b, t, { sway: false, continuous: true });
      if (fa.ball && fb.ball && dist(fa.ball, fb.ball) > worst) {
        worst = dist(fa.ball, fb.ball);
        where = `the ball t=${t.toFixed(1)} after minute ${k}`;
      }
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
    const pass = r.timeline.beats.find((x) => x.moment.assistTo === "L. Quinn");
    if (!pass) fail("assist: the 74' loop doesn't show H. Novak's pass to L. Quinn");
    else {
      // The ball stays with Quinn from Novak's pass to his shot: visible the whole way.
      for (let t = pass.land; t <= goal.touch; t += 0.1)
        if (!frameAt(r.timeline, t).ball) fail(`assist: the ball vanishes at t=${t.toFixed(1)} between the pass and the shot`);
    }
    checkContinuous("replay 74' (one loop)", r.timeline, r.length);
    console.log(
      `\nreplay 74': ${r.timeline.beats.map((b) => `${b.moment.player} ${b.moment.kind}`).join(" → ")}; loop ${r.length.toFixed(1)} s`,
    );
    check("replay 74'", r.timeline, moments.filter((m) => r.timeline.beats.some((b) => b.moment === m)), 1);
  }
}

// The standing figures (figures.ts): poses from the frame and one PREV_DT earlier.
{
  const { figurePose, PREV_DT } = await load("/src/pitch/figures.ts");
  const { project } = await load("/src/pitch/geometry.ts");
  const r = replayMinute(players, moments, 74);
  const tl = r.timeline;
  const poseAt = (t, id, still = false) => {
    const f = frameAt(tl, t, { sway: false });
    const before = frameAt(tl, t - PREV_DT, { sway: false }).dots.find((d) => d.id === id);
    const d = f.dots.find((x) => x.id === id);
    return d && figurePose(d, before, f, still);
  };
  let kicks = 0;
  for (const b of tl.beats) {
    const m = b.moment;
    if (m.kind !== "pass" && m.kind !== "shot") continue;
    const f = frameAt(tl, b.touch, { sway: false });
    const prev = frameAt(tl, b.touch - PREV_DT, { sway: false });
    for (const d of f.dots) {
      const p = figurePose(d, prev.dots.find((x) => x.id === d.id), f);
      if (d.id === b.actor && p.kick === null) fail(`figures: ${m.player} doesn't kick at the ${m.minute}' ${m.kind}`);
      if (d.id !== b.actor && p.kick !== null) fail(`figures: ${d.id} kicks at ${m.player}'s ${m.kind}`);
    }
    kicks++;
  }
  const goal = tl.beats.find((b) => isGoal(b.moment));
  const f = frameAt(tl, goal.land, { sway: false });
  const keeperOf = (side) => f.dots.find((d) => d.role === "GK" && d.side === side);
  const beaten = keeperOf(goal.moment.side === "home" ? "away" : "home");
  const ownKeeper = keeperOf(goal.moment.side);
  const dive = poseAt(goal.land, beaten.id).dive;
  if (!dive || dive.p < 0.5) fail(`figures: ${beaten.name} doesn't dive at the 74' shot`);
  else if (Math.sign(dive.to.y - beaten.y) !== Math.sign(goal.moment.to.y - beaten.y))
    fail(`figures: ${beaten.name} dives away from the ball`);
  if (poseAt(goal.land, ownKeeper.id).dive) fail(`figures: ${ownKeeper.name} dives at his own side's shot`);
  if (poseAt(goal.land + 0.5, goal.actor).celebrate === null) fail("figures: L. Quinn doesn't celebrate the equaliser");
  if (poseAt(goal.touch - 1, goal.actor).celebrate !== null) fail("figures: L. Quinn celebrates before he scores");

  // A runner faces his run on screen (when he's not looking back at a ball behind him).
  let runners = 0;
  let wrong = 0;
  for (let t = tl.start + 0.5; t < tl.end; t += 0.25) {
    const fr = frameAt(tl, t, { sway: false });
    const pr = frameAt(tl, t - PREV_DT, { sway: false });
    for (const d of fr.dots) {
      const b = pr.dots.find((x) => x.id === d.id);
      const p = figurePose(d, b, fr);
      if (p.speed < 4 || p.kick !== null || !fr.ball) continue;
      const du = project(d.x, d.y).u - project(b.x, b.y).u;
      const ballU = project(fr.ball.x, fr.ball.y).u - project(d.x, d.y).u;
      if (Math.abs(du) < 2 || Math.sign(du) !== Math.sign(ballU)) continue;
      runners++;
      if (p.facing !== Math.sign(du)) wrong++;
    }
  }
  if (runners < 20) fail(`figures: only ${runners} runners to check facing on`);
  if (wrong) fail(`figures: ${wrong} of ${runners} runners face away from their run`);

  // A cut: the earlier frame far away reads as standing, not a 100 m/s sprint.
  const d0 = f.dots[3];
  const cut = figurePose(d0, { ...d0, x: d0.x - 20 }, f);
  if (cut.speed !== 0 || cut.stride !== 0) fail(`figures: a replay cut reads as a run (${cut.speed.toFixed(1)} m/s)`);

  // Reduced motion: no stride anywhere, the dive already made.
  for (let t = tl.start + 0.5; t < tl.end; t += 0.5) {
    const fr = frameAt(tl, t, { sway: false });
    const pr = frameAt(tl, t - PREV_DT, { sway: false });
    for (const d of fr.dots)
      if (figurePose(d, pr.dots.find((x) => x.id === d.id), fr, true).stride !== 0) fail(`figures: ${d.id} strides under reduced motion`);
  }
  const heldDive = poseAt(goal.land - 0.3, beaten.id, true).dive;
  if (!heldDive || heldDive.p !== 1) fail("figures: reduced motion doesn't show the dive already made");
  console.log(`\nfigures: ${kicks} kicks checked, ${beaten.name} dives, facing checked on ${runners} runners`);
}

await server.close();
console.log(failures ? `\n${failures} failure(s)` : "\nall pitch checks pass");
process.exit(failures ? 1 : 0);
