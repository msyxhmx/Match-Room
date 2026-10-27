// Each goal's move in the saved match, for scripts/dfl_match.py (make real-replays): the scoring
// side's passes before the goal, back to the other side's last touch (25 s at most), with each
// touch's spot in world metres as the pitch shows it (moments.ts) and its player's shirt number
// (his slot).
// Run: node scripts/goal-moves.mjs > ../data/goal-moves.json

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom" });
const { toMoments, isGoal } = await server.ssrLoadModule("/src/pitch/moments.ts");
const events = JSON.parse(readFileSync(resolve(root, "src/live/saved/events.json"), "utf8"));
const lineups = JSON.parse(readFileSync(resolve(root, "src/live/saved/lineups.json"), "utf8"));
const moments = toMoments(events);
const number = (side, name) => lineups.players.find((p) => p.side === side && p.name === name)?.number ?? null;

const goals = moments.filter(isGoal).map((goal) => {
  const move = [goal];
  for (const m of moments.filter((m) => m.t < goal.t && m.t >= goal.t - 25).reverse()) {
    if (m.side !== goal.side || m.kind !== "pass") break;
    move.unshift(m);
  }
  return {
    goal: goal.id,
    minute: goal.minute,
    side: goal.side,
    touches: move.map((m) => ({ id: m.id, t: m.t, player: m.player, number: number(m.side, m.player), kind: m.kind, from: m.from })),
  };
});
process.stdout.write(JSON.stringify({ match: events[0]?.event_id?.replace(/-\d+$/, ""), goals }) + "\n");
await server.close();
