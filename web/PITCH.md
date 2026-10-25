# The live pitch

The broadcast page on the plate (`/overlay?plate=1`) shows 22 player dots and the ball, moving
with the match as it streams. This note records what we borrowed, the choreography, and the
decisions behind it. Code: `src/pitch/`. Proof: `npm run test:pitch`. Clips: `npm run film:pitch`.

## The honesty rule, as built

- **Real:** every touch the pitch shows is a real event, at its real coordinates, with its real
  player, in match order. That covers passes (start, end and speed), shots, corners, fouls,
  cards, and the tackle or interception that won a failed pass.
- **Illustrative:** everything between touches. That means where the 21 other players stand,
  who receives a completed pass (the data doesn't name a receiver), and where a shot ends (the
  data has the outcome, not the ball's end point).
- On screen, a calm note sits top right ("Positions illustrative · events from the match feed",
  in EN/MS/ES). While a replay plays, a "Replay 74′" chip shows below it.

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
| Formation anchors that shift with the ball's position | RoboCup 2D teams store a formation as ball-position-dependent anchors ([UT Austin Villa TDP](https://staff.fnwi.uva.nl/a.visser/activities/robocup/RoboCup2013/Symposium/TeamDescriptionPapers/SoccerSimulation/Soccer2D/TDP_UTAustinVilla.pdf), [Cyrus TDP](https://staff.fnwi.uva.nl/a.visser/activities/robocup/RoboCup2013/Symposium/TeamDescriptionPapers/SoccerSimulation/Soccer2D/TDP_Cyrus.pdf), [helios-base](https://github.com/helios-base/helios-base)) | `formation.ts`: 4-3-3 anchors from lineup roles. The block follows the ball (½ along, 0.4 across), stretches with the ball and compacts without it. |
| Separate length and width compactness | Shape analysis in tracking data ([Opta Analyst](https://theanalyst.com/articles/shape-analysis-automatically-detecting-formations/)) | Separate `stretch` and `width` multipliers for in and out of possession. |
| Real running speeds | Speed zones: high-speed running above 5.5 m/s, sprinting above 7 m/s ([PMC EPL study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11474994/), [SciSports](https://support.scisports.com/en/articles/3376037-speed-zones-and-thresholds)) | Average leg speed is 5 m/s for the shape and 6 m/s to reach the ball. Peaks stay at 9.0 m/s or less (tested). |
| Dots, ball and smoothing in tracking visualisations | Metrica sample data on a 105 × 68 m pitch, Friends of Tracking tutorials ([Metrica](https://github.com/metrica-sports/sample-data), [LaurieOnTracking](https://github.com/Friends-of-Tracking-Data-FoTD/LaurieOnTracking)) | Discs in team colours, the ball as a white disc with a ground shadow, monotone smoothing between keys (no overshoot). |
| "Arrive" steering, no teleporting | Reynolds-style seek and arrive ([lecture notes](https://imada.sdu.dk/u/rolf/Edu/DM842/E17/lec2.pdf)) | Every position is a capped move toward a target. Nothing is ever set directly. |
| Only the nearest players press | Common engine practice (to avoid "kids' football") | One or two nearest opponents close down, goal side. Everyone else shifts. |

The numbers for block shift, line spacing and press distance are tuned by eye on the plate, not
taken from a source: engines like Football Manager don't publish theirs.

## The choreography (`plan.ts`, pure)

Inputs are moments, lineups, and an *ideal* display time for each moment. The output is a
timeline of keyframes for the 22 players and the ball, read at any instant by `frame.ts`.

1. **Pick the next moment.** Choose among moments already known (their tick has arrived) that
   are due. Forced moments come first. Otherwise take the most important, preferring one whose
   player is already near. A filler that would start more than 1.5 s late (1.2 s at ×60) is
   skipped. So is one whose player can't reach the spot at a sprint, and one that would block a
   known forced moment.
2. **Approach.** The player runs to just behind the ball's real spot, and the touch waits until
   they arrive. The rest take the shape around the ball, and the nearest opponents press. A
   player with a forced moment coming makes a run toward it up to 8 s early, but only once that
   moment is known.
3. **The ball moves.** It travels the real pass at its real `speed_kmh`, with long passes
   lofted. The receiver, or the real interceptor if they can get there, meets it. A shot flies
   to its illustrative end: in the net, at the keeper, against a blocker, or past the post.
4. **Hold, then fade.** The ball rests for about 1 s and fades. A goal: the scorer wheels away,
   then both teams reset to kick-off. A foul or card: everyone stops, and a card draws players
   in. A corner: the taker goes to the flag and both teams crowd the box.

Planning is **causal**: running it again after a new tick never changes what was already shown
(tested: 0 m at ×1, at most 0.2 m at ×60).

## Speeds

- **×1:** every moment plays at the match's own clock: tick arrival plus the event's second.
  Forced moments are goals, cards, shots, corners and fouls. 392 of 822 moments play, and goals
  land within 0.6 s of their real second.
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

## The look (Ilham's pick, 25 Oct)

One look for everyone, **broadcast**: discs in club colours (keepers white with a team ring), a
dashed line along the real pass, and a 24 px name pill on whoever touches the ball (the real
event's player). L. Quinn, the focus player, gets a soft halo.

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
  lands about 11 s after Space (the goal is at 74:10), not the moment the minute's data arrives.
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
  ×60, playing. On the video frame, controls show on plain visits only; director URLs and
  `?rec=1` record clean.
- **Proof.**
  - `npm run flows -- phone`: the phone and phone-landscape flows.
  - `npm run perf:pitch -- phone`: 390 × 844 with 4× CPU throttling, 59.6 fps, 0.34% dropped
    frames.
  - The camera checks in `test:pitch`.

## Continuous play (the ghost ball)

Between real moments the data has no touches, so a "ghost" ball keeps the game moving:
- It's drawn at half strength.
- The player who has it carries it and passes to teammates (aimed where they will be).
- It's played to the next real spot, arriving exactly when the real ball takes over.

Real touches are unchanged: solid, named, with the real pass line. The ghost never depends on a
moment before that moment is known, so live replanning stays stable. Tested:
- The ball is on screen 91–97% of the time.
- There are no jumps (every move is under 45 m/s).
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
- Reduced motion: the dots and the ball step between key positions, with no travel, sway, fades
  or line fade.
- Offline: the saved match carries every event and both lineups, so the pitch plays without
  the API.

## Proof

- `npm run test:pitch`: speed, bounds, eleven a side, real spots, forced moments, credited
  assists, causal replanning, and the replays.
- `npm run flows`:
  - `overlay-plate`: the canvas draws, the note shows, and `P` brings in the analyst chip.
  - `overlay-clear`: no pitch.
  - `goal-hold`: the score never runs ahead of the alert.
  - `offline-plate`.
- `npm run perf:pitch`: 90 minutes at ×60 on the plate, with frame and long-task budgets.
- `npm run film:pitch`: clips of the lab states at the upload's settings.
