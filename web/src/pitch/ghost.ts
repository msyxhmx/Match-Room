// Continuous play: the ball between real moments. The data has no touches there, so this is
// illustration, drawn as a "ghost" ball so a viewer can tell it from the real one. The planner
// (plan.ts, `play`) plays it: its holder carries it, passes on to a teammate who meets it, the
// nearest opponent presses, and the shape follows it. Before the next real moment it's played to
// that moment's spot and arrives exactly when the real ball takes over. Real touches stay exactly
// where and when the events say.
//
// Pure: read from the timeline's ghost segments and the dots' planned positions. Planning never
// makes the ghost depend on a moment before that moment is known, so planning again after a new
// tick doesn't change what was already shown.

import { trackAt } from "./frame";
import type { Vec } from "./geometry";
import { feetOf, type Timeline } from "./plan";

/** A pass slows a little as it travels (starts at 1.3× its average speed, not 2×). */
const ease = (u: number) => u + 0.3 * u * (1 - u);

function feet(tl: Timeline, id: string, t: number): Vec | null {
  const tr = tl.tracks[id];
  if (!tr || (tr.offAt !== null && t >= tr.offAt)) return null;
  return feetOf(trackAt(tr.keys, t), tr.slot.side);
}

function segAt(tl: Timeline, i: number, t: number): Vec | null {
  const s = tl.ghost[i];
  if (s.kind === "fly") {
    // No start of its own: where the stretch before leaves the ball.
    const from = s.from ?? (i > 0 ? segAt(tl, i - 1, s.t0) : null);
    if (!from) return null;
    const e = ease((t - s.t0) / Math.max(1e-6, s.t1 - s.t0));
    return { x: from.x + (s.to.x - from.x) * e, y: from.y + (s.to.y - from.y) * e };
  }
  const f = feet(tl, s.by, t);
  if (!f) return null;
  if (s.blendFrom && s.blendTill && t < s.blendTill) {
    const u = (t - s.t0) / Math.max(1e-6, s.blendTill - s.t0);
    const e = u * u * (3 - 2 * u);
    return { x: s.blendFrom.x + (f.x - s.blendFrom.x) * e, y: s.blendFrom.y + (f.y - s.blendFrom.y) * e };
  }
  return f;
}

/** The ghost ball at t, or null when there is none (a dead ball, a goal's reset). */
export function ghostAt(tl: Timeline, t: number): Vec | null {
  const segs = tl.ghost;
  // The last segment starting by t.
  let lo = 0;
  let hi = segs.length - 1;
  let i = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].t0 <= t) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (i < 0) return null;
  const s = segs[i];
  if (t >= (s.kind === "fly" && s.gone !== undefined ? s.gone : s.t1)) return null;
  return segAt(tl, i, t);
}
