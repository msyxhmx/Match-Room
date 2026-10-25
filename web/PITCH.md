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

## Open decisions

- Which look (gallery): tracking, broadcast or tactical.
- At ×60, hold the goal alert until the replay's goal lands (on the plate only).
- The note pill's contrast over the grey sky (white on a 20% scrim) needs checking against DESIGN's 4.5:1.
