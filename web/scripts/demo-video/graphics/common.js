// Shared helpers for the demo-video graphics. Every page draws from window.__seek(t) only:
// no CSS transitions or timers, so the renderer can step through time frame by frame.
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2; };
// progress 0..1 of a window [start, start + dur], eased
const ramp = (t, start, dur) => easeInOut((t - start) / dur);
const params = new URLSearchParams(location.search);
