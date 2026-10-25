// The pitch in metres and the plate's camera.
//
// World frame: origin at the centre spot, X along the length (home attacks +X, to the right on
// the plate, both halves), Y across (+Y is the far touchline, at the top of the plate). The
// camera is the one in web/assets-src/pitch.py, so dots land on the rendered markings exactly.

export const LENGTH = 105;
export const WIDTH = 68;
export const HALF_L = LENGTH / 2;
export const HALF_W = WIDTH / 2;
export const GOAL_HALF = 7.32 / 2;

export type Side = "home" | "away";

export interface Vec {
  x: number;
  y: number;
}

/**
 * An event's 0–100 coordinates (the acting team's frame, x = 100 is the goal it attacks) to
 * world metres. The away team is mirrored: (100 − x, 100 − y).
 */
export function toWorld(side: Side, x: number, y: number): Vec {
  const fx = x / 100 - 0.5;
  const fy = y / 100 - 0.5;
  return side === "home" ? { x: fx * LENGTH, y: fy * WIDTH } : { x: -fx * LENGTH, y: -fy * WIDTH };
}

/** +1 when this side attacks +X. */
export const attackSign = (side: Side) => (side === "home" ? 1 : -1);

/** World point to the side's own frame (attacking +x) and back. Self-inverse. */
export const own = (side: Side, p: Vec): Vec => (side === "home" ? p : { x: -p.x, y: -p.y });

export const clampToPitch = (p: Vec, margin = 0.5): Vec => ({
  x: Math.max(-HALF_L - margin, Math.min(HALF_L + margin, p.x)),
  y: Math.max(-HALF_W - margin, Math.min(HALF_W + margin, p.y)),
});

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- the plate camera (pitch.py: lens 23.5 mm, sensor 36 mm, at (0, −72, 30), tilt 66°) ----------

export const PLATE = { width: 1920, height: 1080 } as const;
const FOCAL_PX = (23.5 / 36) * PLATE.width;
const CAM = { y: -HALF_W - 38, z: 30 };
const TILT = (66 * Math.PI) / 180;
const COS = Math.cos(TILT);
const SIN = Math.sin(TILT);

export interface ScreenPoint {
  u: number;
  v: number;
  /** Pixels per metre at this depth: dots and the ball scale by it. */
  scale: number;
}

/** A world point (z = height in metres) to plate pixels. */
export function project(x: number, y: number, z = 0): ScreenPoint {
  const dy = y - CAM.y;
  const dz = z - CAM.z;
  const zc = dy * SIN - dz * COS;
  const yc = dy * COS + dz * SIN;
  const k = FOCAL_PX / zc;
  return { u: PLATE.width / 2 + x * k, v: PLATE.height / 2 - yc * k, scale: k };
}
