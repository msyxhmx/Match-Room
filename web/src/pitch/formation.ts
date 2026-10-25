// Formation slots from the lineup, and the shape model: where each player stands for a given
// ball position and possession. Everything here is illustrative (the data has no positions).
//
// Borrowed from 2D match engines (web/PITCH.md): each player has an anchor in the team's block;
// the block's centre follows the ball along the pitch (about half its movement) and across it
// (less), stretches when the team has the ball and compacts without it; the keeper stays near
// goal; only the nearest opponents press.

import { HALF_L, HALF_W, own, type Side, type Vec } from "./geometry";

export type Role = "GK" | "DF" | "MF" | "FW";

export interface SquadPlayer {
  name: string;
  number: number;
  position: string;
  side: Side;
}

export interface Slot {
  /** `${side}:${name}` */
  id: string;
  side: Side;
  name: string;
  number: number;
  role: Role;
  /** Anchor relative to the block centre, in the team's own frame (attacking +x). */
  ax: number;
  ay: number;
}

export const slotId = (side: Side, name: string) => `${side}:${name}`;

const LINE_X: Record<Role, number> = { GK: 0, DF: -15, MF: -1, FW: 13 };
/** Lateral anchors per line size (own frame: +y is the left, facing the attack). */
const SPREAD: Record<number, number[]> = {
  1: [0],
  2: [-9, 9],
  3: [0, -17, 17],
  4: [-23, 23, -8, 8],
  5: [-25, 25, -12, 12, 0],
  6: [-25, 25, -15, 15, -5, 5],
};

const role = (p: string): Role => (p === "GK" || p === "DF" || p === "MF" || p === "FW" ? p : "MF");

/** One team's eleven as slots. Lines follow the lineup's roles (4-3-3 for the demo clubs). */
export function teamSlots(players: SquadPlayer[], side: Side): Slot[] {
  const mine = players.filter((p) => p.side === side).sort((a, b) => a.number - b.number);
  const out: Slot[] = [];
  for (const r of ["GK", "DF", "MF", "FW"] as Role[]) {
    const line = mine.filter((p) => role(p.position) === r);
    const ys = SPREAD[line.length] ?? line.map((_, i) => (i / Math.max(1, line.length - 1) - 0.5) * 50);
    line.forEach((p, i) => {
      // The midfield's centre (the lowest number) sits a little deeper: a holding midfielder.
      const deeper = r === "MF" && line.length === 3 && i === 0 ? -4 : 0;
      // Wide forwards sit a touch deeper than the centre-forward.
      const wide = r === "FW" && line.length === 3 && i > 0 ? -3 : 0;
      out.push({
        id: slotId(side, p.name),
        side,
        name: p.name,
        number: p.number,
        role: r,
        ax: LINE_X[r] + deeper + wide,
        ay: ys[i] ?? 0,
      });
    });
  }
  return out;
}

export function allSlots(players: SquadPlayer[]): Slot[] {
  return [...teamSlots(players, "home"), ...teamSlots(players, "away")];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Shape tuning. Distances in metres. */
export const SHAPE = {
  /** How much of the ball's movement the block follows, along and across. */
  followX: 0.5,
  followY: 0.4,
  /** Block centre offset from the ball line, with and without the ball. */
  withBall: 3,
  without: -9,
  /** Length and width multipliers on the anchors. */
  stretchWith: 1.15,
  stretchWithout: 0.85,
  widthWith: 1.05,
  widthWithout: 0.72,
} as const;

/**
 * Where this slot stands, in world metres, for a ball at `ball` (world) and possession
 * `inPossession`. Pure.
 */
export function shapeAt(slot: Slot, ball: Vec, inPossession: boolean): Vec {
  const b = own(slot.side, ball);
  let p: Vec;
  if (slot.role === "GK") {
    p = { x: -HALF_L + 2 + clamp((b.x + HALF_L) * 0.08, 0, 11), y: clamp(b.y * 0.15, -5, 5) };
  } else {
    const cx = clamp(SHAPE.followX * b.x + (inPossession ? SHAPE.withBall : SHAPE.without), -30, 24);
    const k = inPossession ? SHAPE.stretchWith : SHAPE.stretchWithout;
    const w = inPossession ? SHAPE.widthWith : SHAPE.widthWithout;
    const x = clamp(cx + slot.ax * k, -HALF_L + 5, HALF_L - 6);
    const y = clamp(slot.ay * w + SHAPE.followY * b.y, -HALF_W + 1.5, HALF_W - 1.5);
    p = { x, y };
  }
  return own(slot.side, p);
}

/** Kick-off: each team in its own half, the centre-forward of the kicking team on the spot. */
export function kickoffAt(slot: Slot, kicking: boolean): Vec {
  const p = own(slot.side, shapeAt(slot, { x: 0, y: 0 }, kicking));
  const x = slot.role === "FW" && slot.ay === 0 && kicking ? -0.8 : Math.min(p.x, kicking ? -1 : -10);
  // Outside the centre circle unless kicking off.
  const y = !kicking && Math.hypot(x, p.y) < 10 ? Math.sign(p.y || 1) * 10 : p.y;
  return own(slot.side, { x, y });
}
