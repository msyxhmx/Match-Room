# The live pitch

The broadcast page on the plate (`/overlay?plate=1`) shows 22 players and the ball, moving
with the match as it streams. This note records what we borrowed, the choreography, and the
decisions behind it. Code: `src/pitch/`. Proof: `npm run test:pitch`. Clips: `npm run film:pitch`.

## The honesty rule, as built

- **Real:** every touch the pitch shows is a real event, at its real coordinates, with its real
  player, in match order. That covers passes (start, end and speed), shots, corners, fouls,
  cards, and the tackle or interception that won a failed pass.
- **One exception, goal replays (Ilham's call, 27 Oct):** a goal's replay may be played by a
  real recorded move (below, "Goal replays played by a real move"). Then each touch is still
  made by the right player, in order, but where the real move made it: up to 25 m from the
  event's spot. The live pitch never does this; its touches stay exact.
- **Illustrative:** everything between touches, now drawn from real movement (below, "Real
  movement"). That means where the 21 other players stand,
  who receives a completed pass (the data doesn't name a receiver), and where a shot ends (the
  data has the outcome, not the ball's end point).
- On screen, a calm note sits top right ("Positions illustrative · events from the match feed",
  in EN/MS/ES), with the data credit as a quieter second line ("Movement modelled on DFL
  tracking data (CC BY 4.0)"). While a replay plays, a "Replay 74′" chip shows below it.

## What the data allows (checked on the comeback match, 25 Oct)

- 1,300 events become 822 *moments*. A moment is one real chain: pressure on the passer, the
  pass, and the tackle or interception at the pass's end, all in the same second. Inside a
  second the chain is consistent: 169 of 173 wins sit at the failed pass's end.
- Between seconds the events are independent draws. A pass's end is not the next pass's start.
  For example, H. Novak's pass at 74:07 ends 26 m from where L. Quinn shoots at 74:10. **So the
  ball fades out between moments** rather than travel along a path that never happened.
- **One exception, so the graphics agree with the dots:** the goal alert names an assist ("Set
  up by H. Novak"), using the engine's rule in `live/insights.py`: the scoring side's last
  completed pass from the minute before. The pitch makes the scorer the receiver of that pass,
  and he carries the ball to his real shooting spot. The shot waits until he gets there.
  Tested: a credited assist is always received by the scorer.
- Roles don't constrain spots. Keepers pass from x = 86, and one keeper takes a corner. The
  planner skips a keeper's *filler* pass outside his box. A forced moment always plays, even a
  keeper's corner.
- Pressure rows name players far from their role (a forward pressing at x = 17). The pitch shows
  pressure as generic pressing by the nearest one or two opponents, and doesn't claim the row.

## Research: what we borrowed

| Idea | Source | How it's used |
|---|---|---|
| Formation anchors that shift with the ball's position | RoboCup 2D teams store a formation as ball-position-dependent anchors ([UT Austin Villa TDP](https://staff.fnwi.uva.nl/a.visser/activities/robocup/RoboCup2013/Symposium/TeamDescriptionPapers/SoccerSimulation/Soccer2D/TDP_UTAustinVilla.pdf), [Cyrus TDP](https://staff.fnwi.uva.nl/a.visser/activities/robocup/RoboCup2013/Symposium/TeamDescriptionPapers/SoccerSimulation/Soccer2D/TDP_Cyrus.pdf), [helios-base](https://github.com/helios-base/helios-base)) | `formation.ts`: for a 4-3-3, the anchors are now real (below). For any other lineup, the rules remain: anchors from lineup roles, each line following the ball by its own share (the back line 0.55 along and 0.25 across, the midfield 0.4 and 0.6, the forwards 0.3 and 0.4), less far from the ball; the block stretches with the ball and compacts without it. |
| Separate length and width compactness | Shape analysis in tracking data ([Opta Analyst](https://theanalyst.com/articles/shape-analysis-automatically-detecting-formations/)) | Separate `stretch` and `width` multipliers for in and out of possession. |
| Real running speeds | Speed zones: high-speed running above 5.5 m/s, sprinting above 7 m/s ([PMC EPL study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11474994/), [SciSports](https://support.scisports.com/en/articles/3376037-speed-zones-and-thresholds)) | Gaits of 1.5 (walk), 3.5 (jog) and 5 m/s (run), 6 m/s to reach the ball. Peaks stay under 9.5 m/s (tested). |
| Dots, ball and smoothing in tracking visualisations | Metrica sample data on a 105 × 68 m pitch, Friends of Tracking tutorials ([Metrica](https://github.com/metrica-sports/sample-data), [LaurieOnTracking](https://github.com/Friends-of-Tracking-Data-FoTD/LaurieOnTracking)) | Discs in team colours, the ball as a white disc with a ground shadow, monotone smoothing between keys (no overshoot). |
| "Arrive" steering, no teleporting | Reynolds-style seek and arrive ([lecture notes](https://imada.sdu.dk/u/rolf/Edu/DM842/E17/lec2.pdf)) | Every position is a stepped move toward a target, with speeding-up and braking limits and a slow-down to arrive. The only direct set is the last step of a run that is due on a spot, which lands it exactly on time. |
| Only the nearest players press | Common engine practice (to avoid "kids' football") | One or two nearest opponents close down, goal side. Everyone else shifts. |
| Real movement | DFL / Sportec open tracking data, Bassek et al. 2025 (CC BY 4.0) | The team shape, the wander, gaits, press distance, lofted passes, the ghost's pace, and the bands `test:pitch` judges against (below, "Real movement"). |

The block shift, line spacing and press distance were tuned by eye on the plate until 27 Oct;
they now come from real tracking data (below).

## The choreography (`plan.ts`, pure)

Inputs are moments, lineups, and an *ideal* display time for each moment. The output is a
timeline of keyframes for the 22 players and the ball, read at any instant by `frame.ts`.

1. **Pick the next moment.** Choose among moments already known (their tick has arrived) that
   are due. Forced moments come first. Otherwise take the most important, preferring one whose
   player is already near. A filler that would start more than 1.5 s late (1.2 s at ×60) is
   skipped. So is one whose player can't reach the spot at a sprint, and one that would block a
   known forced moment.
2. **Approach.** The player runs to just behind the ball's real spot, and the touch waits until
   they arrive. The rest take the shape around the ball with their off-ball jobs (below), the
   nearest opponents press and the next one covers. A player with a forced moment coming makes a
   run toward it up to 8 s early, but only once that moment is known.
3. **The ball moves.** It travels the real pass at its real `speed_kmh`, with long passes
   lofted. The receiver, or the real interceptor if they can get there, meets it. A shot flies
   to its illustrative end: in the net, at the keeper, against a blocker, or past the post.
4. **Hold, then fade.** The ball rests for about 1 s and fades. A goal: the scorer is off at once
   toward the corner flag, his nearest teammates chase him, the rest of his side drift toward him,
   and the side that conceded stops where it is; then the scorer is mobbed and everyone walks back
   for the kick-off. A foul or card: everyone stops, and a card draws players in. A corner: the
   taker goes to the flag and both teams crowd the box.

Planning is **causal**: running it again after a new tick never changes what was already shown
(tested: at most 0.35 m at ×1, 0.08 m at ×60, against a 0.5 m limit). A live plan plays on
past its last moment until well after the next tick is due (two ticks' time; one at the end of
a half), exactly as the next plan does while it waits.

So the live page doesn't replan the whole session on every tick: each tick's plan **carries on
from the last** (`PlanOptions.resume`). The planner keeps checkpoints of its state at each
moment's turn, and picks up from the last one the new moments can't have changed; a re-render
with no new tick reuses the plan as it is. Tested: a resumed plan is the same plan as one made
from the start. A replan takes about 5 ms a tick at ×1 (35 ms on main before this), 1 ms at ×60.

### How players move (`plan.ts`, `formation.ts`; Ilham's brief, 26 Oct; real data, 27 Oct)

Every player is stepped every 0.2 s (the first version slid the whole block at a run the moment
the ball moved). Since 27 Oct the numbers come from real tracking data ("Real movement", below):

- **Need, not habit.** Within a deadband of his spot a player stands: 1.5 m near the ball, up to
  4 m far from it. Otherwise he walks (1.35 m/s), jogs (2.9) or runs (4.6), by the gap and the
  urgency (a switch of play, a turnover, a run into the box, recovering goal side). He speeds up
  at 3 m/s² and brakes at 4.5 m/s² (between the real p90 and p99), and slows down to arrive.
- **Staggered.** Each player reacts to a new picture after his own delay, 0.2 to 0.8 s (from his
  role and `hash01` of his id). Delays use only what is already known, so planning stays causal.
- **Bent runs.** Each picture, each free run bends 5 to 25° one way or the other and straightens
  near the spot.
- **Due on a spot.** A player who must be somewhere at an instant (on the ball, meeting a pass)
  waits for the moment a natural pace needs, then runs a smooth curve from his current speed that
  lands exactly on time (arriving at up to 3 m/s, onto the ball). The V_ACTOR and V_RUN caps hold.
- **The shape.** For a 4-3-3, each slot's spot is the real average for the ball's position, with
  or without the ball, read smoothly between cells; each player is up to 1.5 m off it, and his
  gait speeds 0.9 to 1.1×, from `hash01`. Other lineups keep the rule-based block.
- **Wander.** Each player drifts off his spot as real players do: by the real spread for his slot
  (5–10 m RMS), 57% of it shared with his team (a line steps up together), on slow waves.
- **Off-ball jobs** (`teamJobs`). With the ball: one forward runs in behind (into the box at a
  run) or checks short, the ball-side full-back overlaps when the ball is wide, the nearest
  midfielder offers a short option, the far side walks. Without it, the press and the cover
  (the real shape already has the forwards' defending spots).
- **The press.** The nearest opponent stands goal side, 2.6 m off a pressed passer, 6 m
  otherwise; a second presser cuts the lane inside. In play, the holder's nearest opponent
  closes him down 3–7 m off.
- **The approach** to a real moment is re-pictured every 1.2 s, so nobody arrives and freezes
  while the ball is about to be played.

Measured by `test:pitch` (outfield, frames 1/15 s apart, as drawn, while the ball is in play):

| | 26 Oct (74' loop) | Now: 74' loop | Now: ×1 71'–80' | Real (every 40 s, middle 90%) |
|---|---|---|---|---|
| Standing (under 0.5 m/s) | 28% | 3% | 4% | 1–7% |
| Walk / jog / run | 27 / 24 / 20% | 26 / 56 / 14% | 40 / 46 / 10% | 43 / 39 / 12% (median) |
| Sprint (6 m/s and up) | 1% | 1% | 0% | up to 6% |
| Same-way co-movement, median | 50% | 70% | 56% | 50–70% |
| Spread of speeds from real | 0.29 | 0.18 | 0.07 | within 0.22 |

At ×1 between moments, players stood 84% of the time before the ghost was played; now 4%. The
74' loop is a goal-scoring attack, so it jogs more and moves more together than an average
passage, at the top of the real range.

## Real movement (DFL tracking data, 27 Oct)

Positions stay illustrative (the feed has none), but how players move is now taken from real
football rather than tuned by eye.

- **The data.** DFL / Sportec Solutions open data: Bassek et al. 2025, "An integrated dataset of
  spatiotemporal and event data in elite soccer", *Scientific Data*
  ([doi 10.1038/s41597-025-04505-y](https://doi.org/10.1038/s41597-025-04505-y); files on
  [figshare 28196177](https://springernature.figshare.com/articles/dataset/28196177)). Seven
  Bundesliga / 2. Bundesliga matches from 2022/23, all 22 players and the ball at 25 Hz, with
  events. Licence **CC BY 4.0**: free to use with credit, which the pitch gives on screen under
  the honesty note and here. We don't use StatsBomb 360 (its terms forbid redistribution).
- **The extract.** `make motion-data` runs `scripts/dfl_extract.py` on the 2.6 GB of XML in
  `data/dfl/` (gitignored; figshare's download page needs a browser). It turns every match into
  our world frame (105 × 68 m, home attacking +x in both halves), fits each side's eleven to our
  4-3-3 slots from DFL position codes (4-2-3-1 and 4-3-3 sides; back threes and 4-4-2 left out),
  and drops every name. It writes `src/pitch/real/`:
  - `slice.json` (226 KB): six anonymised 40 s passages at 5 Hz (a build-up, a turnover, a
    switch, a shot, a corner, a counter). Only the lab and the tests load it.
  - `shape.json` (10 KB, shipped): each slot's average spot for the ball's position, with and
    without the ball, and how far players wander off it.
  - `stats.json`: the numbers below.
- **Real playback.** `real.ts` plays a passage through our own figures and camera (Pitch lab:
  `Pitch--real-*`). It looks like football, and it keeps the real numbers through `frameAt`
  (standing, gaits and co-movement within a point or two of the raw keys, no stop-start), so
  the drawing was never the problem: the movement was.

### What it changed

| | Real (DFL) | Before | Now |
|---|---|---|---|
| Gaits: walk, jog, run | 1.35, 2.9, 4.6 m/s | 1.5, 3.5, 5 | from real |
| Deadband (stands within) | stands 1–7% of the time | 3–7 m | 1.5–4 m |
| Runs bend | | 15–55° | 5–25° |
| Nearest opponent to a passer | 2.7–9.1 m, median 5 | ~2 m, behind him | goal side, 2.6 m under pressure, else 6; 3–7 m in play |
| Lofted passes | 10–20% under 30 m, 40% at 30–45 m, all past 45 m | every pass over 28 m | as real, by length |
| Team shape | per ball cell, with and without the ball | rule-based block | the real table |
| Wander off the spot | 5–10 m RMS a slot, 57% shared by the team, slow | none | as real |
| A holder keeps the ball | median 1.35 s | 2.6 s (ghost) | ~1.35 s |
| Pass speed by length | 6 m/s at 5 m, 9.5 at 25, 16 at 50 | 16 (ghost) | 4.9 + 0.19 d |

### The checks, re-set from real football

The old bands (standing 25–35%, co-movement 50% or less) were set by eye, and real football
fails them. `test:pitch` now judges ours against every 40 s window of play in the 7 matches
(562 windows, `stats.json` "per40s"): standing, sprinting and co-movement in the real middle 90%,
and the spread of speeds no further from real than 95% of real windows. Around the ball, against
2,922 real completed passes: the nearest opponent to the passer (real 2.7–9.1 m; ours 4.0), the
receiver's speed (1.5–3.7 m/s; ours 2.8) and approach (real receivers don't run onto the pass:
−1.8 to 0.9 m/s toward it; ours −1.5), and the lofted share by length (within 15 points).

### Goal replays played by a real move (27 Oct)

The planner's replays are exact but look planned. A real recorded move looks like football, so
a goal's replay is now played by one when it fits.

- **Finding the move.** `make real-replays` (`web/scripts/goal-moves.mjs`, then
  `scripts/dfl_match.py`) takes each goal's move from the saved match: the scoring side's passes
  back to the other side's last touch, and the shot. It searches all 167 open-play shots in the
  7 matches for a real move with the same touches in the same order, by the same pattern of
  players (who touches twice), each within 2.5 s of ours. A keeper on the ball must be our keeper.
  It turns the move so the scoring side attacks our way, mirrors it if that fits better, and
  stretches the pitch (15% at most) to put the real shot on ours when it can.
- **The cap.** Every real touch must land within **25 m** of our event's spot (Ilham chose 25 m
  over 15 m, which fitted only the last 2–3 touches of each goal). Both sides must have eleven
  throughout, and nobody may move faster than 9 m/s (faster is a tracking glitch). The move
  with the most of our touches wins.
- **Playing it** (`replays.ts`). Each dot follows a real player: our touchers are the real
  touchers, the keepers the keepers, the rest the slot nearest their place in the team's shape.
  Each of our touches is a beat at its real touch; the real ball runs to the shot, then our shot
  flies into the net. Real players overrunning a line are kept within 0.5 m of it. The frozen
  minute's loop and the replay cut into ×60 both use it; a goal with no fitting move keeps the
  planner's replay, and so do cards.
- **On the saved match** (`real/replays.json`, 53 KB, shipped):

  | Goal | Real touches | How far from our spots |
  |---|---|---|
  | 14′ | 2 of 3 | 11, 8 m |
  | 37′ | 3 of 3 | 5, 17, 10 m |
  | 61′ | 3 of 3 | 19, 18, 2 m |
  | 74′ | 3 of 7 | 16, 14, 19 m |
  | 87′ | 2 of 4 | 10, 8 m |

  A replay shows only the real move's touches, so it's shorter than the planner's: the 74′ loop
  is 8 s (Quinn, Ekwueme, Quinn's goal) instead of about 20. Other matches have no real moves
  and keep the planner's replays.
- **Proof.** `test:pitch` "real move": every goal with a fitting move is replayed by it (cut and
  loop), each touch by the right player, on the ball, within 25 m of its spot. The other checks
  (speed, on-pitch, eleven, continuity) run on the real replays too. Lab: `Pitch--goal<min>-real`
  and `-planner`, side by side.

### Not done

A third layer, real clips (motion matching) for the 3–5 players around the ball, wasn't built:
with the two layers above, every ball-area number is already inside the real range, so it had
nothing measurable left to win (the bar for keeping a layer). `slice.json` and the extract are
ready for it.

## Speeds

- **×1:** every moment plays at the match's own clock: tick arrival plus the event's second.
  Forced moments are goals, cards, shots, corners and fouls. 403 of 822 moments play. A goal's
  ball crosses the line 0.7–4.5 s after its real second (the shot's flight included; 0.6–5.9 s
  before the real movement): it waits for its player to get there, and the events' spots
  are independent draws, so he may be 20 m away.
- **×60:** a minute a second is too fast for real-speed play. Nothing is forced. The flow plays
  what fits, and the shape drifts in between. Each **goal and card cuts to a short replay**
  (TV grammar: a 0.18 s dip, "Replay 61′", then back to live). The player starts a few strides
  away, so the ball lands 1.1–2.0 s after the cut.
- **Paused** (S7 opens paused on 74′): the minute's headline moment loops with its build-up,
  10 s at ×1.

## Geometry

The plate's camera comes from `assets-src/pitch.py`: lens 23.5 mm on a 36 mm sensor, at
(0, −72, 30) m, tilted 66°. `geometry.ts` projects pitch metres onto plate pixels with it. The
projected penalty spot and arcs land on the render's own (the spot at about (293, 510); see the
`Pitch--calibration` lab state). Dots scale with depth: about 19 px across on the far touchline,
45 px on the near one. Home attacks to the right in both
halves. The data has no ends, and a fixed direction reads better in a short clip.

## The look (Ilham's pick, 25 Oct; figures 26 Oct; bodies 27 Oct)

One look for everyone, **broadcast**: standing figures in club colours (keepers in white with
team trim), a dashed line along the real pass, and a 24 px name pill on whoever touches the ball
(the real event's player). L. Quinn, the focus player, gets a soft ring.

The bodies (`figures.ts`) follow the movement, purely from this frame and two earlier ones:
- **Gaits by speed.** Standing (shifting weight, breathing), a walk (short stride, low arms), a
  jog, a sprint (long stride, knees up, leaning in about 15°, arms pumping). Stride length and
  cadence both rise with speed (0.9, 1.4 and 1.7 strides a second at a walk, jog and sprint).
  The legs follow the ground actually covered (`frame.ts` gives each dot its metres and strides),
  and the swing is sized to the stride on screen, so feet don't skate.
- **Lean** into speeding up and back when braking (from the third frame), 20° at most.
- **Views.** Side on, or from the front or back when the run is mostly toward or away from the
  camera on screen. From the back, the shirt number shows in the trim colour.
- **Actions from the beats.** The kick; small dribble touches while carrying; a control pose for a
  pass's receiver; a slide for the real tackler or interceptor; a jump for a lofted pass; the
  keeper set in a crouch while the ball is in his third, then the dive, or for a save, down to
  gather it; the scorer running off with his arms out.

**Analyst** adds the team shape. With the persona switch (`P`, the same switch S7 already
shows), each team's back line, midfield and front line are joined up, fading in over 300 ms. The
team without the ball is drawn stronger, because its shape is what an analyst reads. A chip
reading "Analyst view · team shape" shows while the lines are on. The gallery also tried flat
"tracking" discs (clean but anonymous) and an always-on "tactical" look (the two teams' lines
cross in midfield).

## On the live match page (Ilham's pick, 25 Oct: layout A "pitch stage")

- The live page leads with the pitch. The top bar comes first, then the pitch at full width with
  the score riding on it. That score bar is `ScoreHeader variant="bug"`: the same rolling score,
  and the same Live / minute / ×60 pills, so speed honesty holds. The moment card sits below.
- The timeline now lives on the half-time and full-time screens only. Without lineups, the page
  falls back to the old layout B.
- `PitchView` crops the plate to the pitch and scales it to the box. When it is shown smaller,
  marks and labels are drawn larger (dots 14 px and up, pills 23 px or more). On a phone the
  honesty note becomes a caption under the pitch.
- **The goal card and the score wait for the pitch,** as on the overlay. At ×1 the 74' equaliser
  lands about 12 s after Space (the goal is at 74:10), not the moment the minute's data arrives.
  S1 is now a longer, truer shot.

## On a phone (mobile pass, 25 Oct)

- **The follow camera.** On a phone held upright (a pitch box under 600 px), the pitch is a 4:3
  box shown about 2.3× closer. It pans with the ball like a TV camera; during a real pass it
  frames the whole pass.
  - It's a pure function of time (`camera.ts`): a triangle-weighted average over the last 2 s,
    and it snaps at replay cuts.
  - The canvas draws at the phone's own pixels, not 1920 × 1080.
  - Under reduced motion it doesn't pan: you see the whole pitch.
  - Tested: the ball is in frame 97.5–100% of the time; pans stay under 500 plate px/s for 99%
    of frames; a switch of play peaks around 1,060.
- **Labels under the picture.** On a small pitch, the honesty note, "Replay 74′" and "Analyst
  view" sit in a row under it.
- **Controls.** The playback controls (play / pause, restart, ×1 / ×60) are pinned to the bottom,
  clear of the home indicator. Language and persona are the top bar's buttons, marked with a
  small chevron.
- **The page itself.**
  - The top bar is two rows.
  - The timeline is back under the moment card, since the phone page scrolls.
  - The empty state is one line.
- **Sideways.** A phone held sideways (under 500 px tall) gets the phone layout: the whole pitch
  with the score on it, a one-row top bar and compact corner controls.
- **The address.** A plain visit keeps a bare address, so the link always opens at kick-off at
  ×60, still, behind a Kick off button. On the video frame, controls show on plain visits only; director URLs and
  `?rec=1` record clean.
- **Proof.**
  - `npm run flows -- phone`: the phone and phone-landscape flows.
  - `npm run perf:pitch -- phone`: 390 × 844 with 4× CPU throttling: 0.21–0.27% dropped frames
    (27 Oct, two runs; main measured 1.05–1.09% alternately on the same machine).
  - The camera checks in `test:pitch`.

## Continuous play (the ghost ball)

Between real moments the data has no touches, so a "ghost" ball keeps the game moving. It's
drawn at half strength, and since 27 Oct the planner plays it (`plan.ts`, `play`), so the
players play with it:
- Its holder carries it a few metres on (about the real 1.35 s), the nearest opponent closes him
  down goal side 3–7 m off, and the shape follows the ball.
- He passes 8–32 m to where a teammate is heading, at a real pass's speed for the length, and
  that teammate is due on it.
- Once the next real moment is known, play goes on until its player must set off; then the ghost
  is played to the real spot, landing exactly when the real ball takes over. A pass decided
  before then that can't make it vanishes from that instant.
- Restarts: after a shot wide the keeper takes a goal kick, after a foul the other side a free
  kick. After a goal everyone waits in the kick-off picture, the ball on the centre spot, until
  the next real moment is known (a feed may restart a minute later): that moment is the kick-off
  itself, or the ghost kicks off then. The ghost stays 0.3 m inside the lines.

Real touches are unchanged: solid, named, with the real pass line. The ghost never depends on a
moment before that moment is known, so live replanning stays stable. `ghost.ts` only reads the
planner's segments. Tested:
- The ball is on screen 89–98% of the time.
- There are no jumps (every move is under 45 m/s).
- The ghost never leaves the pitch.
- Real touches are still the real ball on the real spot.

## Preview build

`npm run build:preview` plays the saved synthetic match as the main source, labelled "Preview ·
synthetic match", with every language and persona saved, so `L` and `P` work without the API.

## On the overlay page

- Only on the plate (`?plate=1`). The transparent OBS page never draws a pitch.
- Paused: the minute's headline loops. Playing: the live programme (`PitchLayer.tsx`).
- **The goal alert and the score wait for the pitch.** On the plate, a goal alert is held until
  the pitch reports the ball crossing the line, and the score bug doesn't count that goal until
  then. At ×60 the replay's goal lands about 1.6 s after its cut. If the pitch never reports it,
  the alert goes up anyway after 6 s (75 s at ×1).
- Reduced motion: the players and the ball step between key positions, with no travel, fades
  or line fade. Bodies hold their poses: no stride, bob, lean or jump, the dive shown already made.
- Offline: the saved match carries every event and both lineups, so the pitch plays without
  the API.

## Proof

- `npm run test:pitch`: speed, bounds, eleven a side, real spots, forced moments, credited
  assists, causal replanning, resumed plans, the ghost in bounds, the replays, the bodies (gait
  by speed, cadence, lean, back view, tackle, jump, crouch and save at their beats, reduced
  motion), and movement against real football: the motion bands and the play around the ball
  (below, "Real movement").
- `npm run flows`:
  - `overlay-plate`: the canvas draws, the note shows, and `P` brings in the analyst chip.
  - `overlay-clear`: no pitch.
  - `goal-hold`: the score never runs ahead of the alert.
  - `offline-plate`.
- `npm run perf:pitch`: 90 minutes at ×60 on the plate, with frame and long-task budgets.
- `npm run film:pitch`: clips of the lab states at the upload's settings.
