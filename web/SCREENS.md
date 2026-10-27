# Screens and motion: Match-Room Live (playbook steps 7 and 8)

How the components in [COMPONENTS.md](COMPONENTS.md) become screens, which storyboard shot
each screen makes, and the calls made on the way. **DESIGN.md wins** if this file and it
disagree. Written 25 Oct 2026.

## The screen and state map

Plain visits (no `minute`, `speed`, `play` or `rec` in the address) get the web layout
(DESIGN §9.12, `src/screens/web/`); everything below is the recording path.

Every storyboard shot starts from a URL on the 1920 × 1080 frame. Director keys (hidden, nothing
on screen reveals them): `Space` play/pause, `L` next language, `P` casual ↔ analyst, `F` facts
sheet, `1 3 4 5 6 7 8` jump to that shot's start, paused.

| Shot | URL | Screen and state | Lab state |
|---|---|---|---|
| S1, S2 | `/?minute=73&speed=1`, then `Space` | Live. 74' arrives at real speed: 1–2 → 2–2, the equaliser card, its swing | `Screens--s1-equaliser-74`, `Motion--equaliser-*` |
| S3 | `/?minute=0&speed=60&play=1` | Live at ×60: bars fill, 11:59 chaos, the 14' goal against | `s3-chaos-12`, `s3-goal-against-15` |
| S4 | `/?minute=15`, then `F` | Live with the 14' card's Facts used sheet | `s4-facts-15`, `Motion--facts-sheet` |
| S5 | `/?minute=45` | Half-time: brief (1080) and agents (600), the trace stepping in | `s5-halftime-*` |
| S6 | `/?minute=45&speed=60&play=1` | Live at ×60: momentum swings at 51:59, the 61' goal | `s6-momentum-52`, `s6-goal-62` |
| S7 | `/?minute=74`, then `L`, then `L L P` | Live: the same card in Malay, then analyst English (text cross-fades) | `s7-ms-75`, `s7-analyst-75`, `Motion--reword-ms` |
| S7 | `/overlay?minute=74&plate=1` | Overlay: the alert on the pitch plate | `s7-overlay-plate` |
| S8 | `/?minute=90` | Full-time: 3–2, KST dimmed, headline, player of the match, turning points | `s8-fulltime` |

Other states, each in the lab: pre-kick-off, loading, reconnecting, offline, the overlay between
graphics (score bug alone), and the longest text (Malay analyst) at 75', half-time and full time.

`npm run flows` drives the real app through every row above plus API-off and a dropped stream,
and checks each one (`scripts/flows.mjs`).

## The moment rule (which card holds the stage)

`src/live/stage.ts`, one pure function, `pickStage(cards, atSeconds)`. It replays the match's
cards in order. A card takes the stage when it is at least as important as the one there, or the
one there has used up its hold. Nothing empties the stage mid-match.

**Picked 25 Oct (Ilham): R2, "goals hold".** Only priority 1–2 cards with a why-line take the
stage. A goal holds it for 5 match minutes against anything less important, a notable card for 2.
Priority 3 cards and stat cards with no why-line ("L. Quinn so far") never take it.

Compared and not picked: R1 "newest worth explaining" (no holds, so the 66' chaos card bumped
the 61' goal) and R3 "every notable card" (stat cards on stage at 30', 45' and 60'). The other
two rules stay in `stage.ts` for now, as the record of what was compared.

## Decisions made in step 7

- **Half-time.** No score header: the brief's headline already says "Kingston Vale lead 0-2 at
  the break", and both columns need the height. The brief headline is title2 in the 1080
  column, so it fits one line. The agent trace groups steps by agent (one line per step, a
  hanging indent), and its title stays pinned while the log follows the newest step. Both
  columns scroll inside themselves when text runs long (only the Malay analyst brief does).
- **Half-time plan B** (#9, no agents ran): the brief stands alone at 1440, centred. Its source
  line already says "Written from templates, checked by the validator", so an empty agents
  panel beside it would say it twice.
- **The agent trace** comes from `api.halftime(id).meta.agent_trace` (DESIGN §5 option 1, no
  contract change). If Syahmi adds it to `MatchBrief` instead, it's one line in
  `useMatchFeed.loadTrace`.
- **Full time.** The turning points and their swings are on the timeline only; the brief leaves
  its list out (`turningPoints={false}`) and the player of the match drops the involvement chart
  (`compact`) so the brief fits its 460 row. Saying the swings once also keeps the three "make it
  count" titles (#10) off the frame.
- **Half-time lasts 15 match minutes at playback speed** (15 s at ×60). The stream doesn't pause
  at 45', so the app closes it after the half-time brief and reopens it from 45'.
- **Reconnect:** "Reconnecting", retries at 1, 2 and 4 s, then "Offline · showing saved match"
  and the saved match plays on from the same minute.
- **The saved match** is the stream itself, recorded (`src/live/saved/`, written by
  `scripts/export_lab_fixtures.py`, English, demo profile, 177 KB, loaded only when the API is
  down). Offline uses the same code path as live.
- **A language or persona switch** tells the stream (it applies from the next minute) and
  re-fetches the snapshot at the current minute, so the card on stage is re-worded in place.
- **The frame.** Wider than 700 px, the page is the 1920 × 1080 frame zoomed to fit the window
  (CSS `zoom`), so a laptop sees the same composition as the video. Narrower, the phone layout.
- **A plain visit** opens still at kick-off at ×60 behind a Kick off button; pausing freezes the
  pitch where it is. A URL with `minute` waits for `Space`, and its pause loops the minute's
  headline. At half-time a plain visit shows the brief alone, with a button for the agents.
- **Timeline pins** put that moment on stage until the rule picks a new one.
- **The TopBar's language and persona pills** are buttons in the app (the viewer switcher
  DESIGN §5 requires).
- **Overlay timing:** a frozen minute shows that minute's most important graphic. While playing,
  each graphic stays up for its ttl at our speed, at least 4 s; only a graphic at least as
  important replaces one that's up.

## Motion (step 8)

Only the four hooks move, each 200–350 ms from the tokens in `theme.css`, with `--motion-travel`
at 0 under reduced motion (fades in place):

**Picked 25 Oct (Ilham): M2, "broadcast".** Compared and not picked: M1 "calm" (fades and small
rises; the score read "–2" for about 3 frames) and M3 "pitch" (the card swept in sideways).

| What | Hook | Motion |
|---|---|---|
| The score | the digit's `data-state="scored"` (a new element per value) | rolls like an odometer, 280 ms, firm spring |
| A new moment | `MomentCard` `data-state="arriving"` | rises 40 px with 3% scale, 280 ms, firm spring |
| The swing | `ChanceSwing` track `data-state="from"` | fills before → after, 350 ms, firm spring |
| The sheet | `Sheet` `data-state="open" \| "closed"` | rises over the scrim in 350 ms, drops in 200 ms |
| Re-worded card (S7) | `MomentCard` `data-text="relabel"` | text cross-fades, 200 ms |

**Choreography at 74':** score at 0, card at +120 ms (`--stagger`), swing at +300 ms, all done by
about 650 ms. At ×60 the stage changes at most once a tick (1 s), so nothing stacks: a new card is
a new element, and the old one simply leaves.

**Flags are set before the first paint** (`useLayoutEffect`), so no new card or score shows for a
frame before its motion starts.

`npm run motion` (`scripts/motion.mjs`) films each motion frame by frame (0–1000 ms), in normal and
reduced motion, and checks durations, delays and easing come from the tokens, nothing moves
outside the hooks, everything ends by 700 ms, there is no layout shift, and reduced motion has no
travel and the same final frame.
