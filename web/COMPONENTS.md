# Component specs: Match-Room Live (playbook step 6)

Every component in [DESIGN.md §9.9](DESIGN.md#99-wireframes-step-4), specified so someone
could build it without asking a question. **DESIGN.md wins** if this file and it disagree.
Written 25 Oct 2026.

How step 6 runs:
1. Each component is built from its section below, in the batch order at the end.
2. Each state is shown in the **lab**, run with `npm run dev` and opened at `/lab.html`.
3. `npm run shots` screenshots every state on both canvases and measures it.
4. A reviewer then judges the screenshots against the [review checklist](#review-checklist).

The three hero components (MomentCard, ScoreHeader and the overlay alert) are built in 2–3
looks each, and Ilham picks one.

---

## Rules for every component

**Files.** Each component lives in `src/ui/<Name>/` and has three files:
- `<Name>.tsx`
- `<Name>.module.css`
- `<Name>.lab.tsx`, its states, exported as a `LabModule` (see `src/lab/types.ts`)

Export the component from `src/ui/index.ts`. Never edit `src/styles.css`, `src/components/`
(the old app), `theme.css` or `clubColours.ts`. If you need a token that doesn't exist, stop and
ask.

**Tokens only.**
- Colours: `var(--…)` from `theme.css`. Fonts: `font: var(--type-…)` only, never `font-size` or
  `font-weight`. `npm run check:raw` fails on any raw colour or font.
- Spacing uses `--space-*`. A size with no token, such as a crest or a bar width, is written
  as a `calc()` of space tokens, with a comment saying why.
- Numbers that update get `font-variant-numeric: var(--numeric)`.

**Two canvases, one component.** The same component renders on the 1920×1080 video frame and
the 390-wide phone.
- The type, radius and stroke tokens switch on their own under `.video`, so most components
  need nothing more.
- A size that differs by canvas (a crest, say) uses a `:global(.video) .x { … }` rule.
- A layout that reflows when narrow uses a container query (`container-type: inline-size` on
  the component root).
- **No component takes a `canvas` prop.**

**Props are contract types.** Take `LiveCard`, `Team`, `MatchBrief`, `AgentStep`,
`OverlayMessage`, `PlayerLine` and `Series` as they come (`src/types/`).
- Components never fetch, never read the URL and never hold timers. They are pure: the same
  props always draw the same pixels.
- Event handlers are optional props (`onOpenFacts?`). Without one, the control still renders but
  does nothing.

**Words.**
- UI words come from `useLabels()` (`src/ui/labels.tsx`). Card and brief text is shown exactly
  as the engine wrote it, never re-cased or shortened.
- Numbers and minutes go through `src/ui/format.ts`:
  - `formatScore` gives "2–2", with an en dash.
  - `cardMinute` gives "74'".
  - `swingOf` and `turningSwing` give the win-chance swing, taken from the card's facts.
- **Never round a win chance yourself.** TurningPoint stores 0.685, but its card says 69%.
- Sentence case. Never "odds" or "bet". No emoji.

**Probability honesty (DESIGN §7).**
- Every element that shows a win chance gets `data-role="probability"`.
- Any component that shows one also shows the projection note, with
  `data-role="projection-note"`, in caption2, secondary colour, close to it.
- The shots script fails a frame that has a probability without a note.

**Icons.** Use the `Icon` primitive around Lucide icons only.

**Colour is never the only signal.** Every state colour has a label or an icon too (DESIGN §9.10
table). Glow means "this club", and the label says what happened.

**Depth.**
- Cards are `--surface-card` on `--surface-ground`, with `--radius-card` and **no border and no
  shadow**.
- Only the sheet has `--shadow-sheet`.
- Space separates groups (HIG inset lists), not lines. `--separator` is rare.

**Team glow.** A soft radial gradient of `--home-glow` or `--away-glow` at low opacity, mixed with
`color-mix(in srgb, var(--home-glow) 18%, transparent)`.
- It sits behind content, never behind small text at an opacity that drops its contrast
  under 4.5:1. The axe check measures this.
- Never draw a gradient across the whole card. Compression smears it (DESIGN §6.3).

**Motion: not yet (step 8).** Put a `data-state` on anything that will move, and add no
animations or transitions in step 6. The hooks are:
- the score: `data-state="scored"` on the side that just scored
- the card: `data-state="arriving"`
- the sheet: `data-state="open|closed"`
- the swing bar: `data-state="from|to"`

**Accessibility.**
- Real `<button>`s for anything tappable, with a visible `:focus-visible` ring (`--you-primary`,
  `--stroke` wide).
- Use headings in order.
- Charts are a `<figure>` whose `<figcaption>` states the main message (HIG Charts). The
  decorative SVG is `aria-hidden`.

**Done means:**
- Every state in the component's table exists in its `.lab.tsx`, on both canvases unless the
  table says otherwise.
- `npm run shots -- <Name>` reports **0 problems**.
- `npx tsc -b --noEmit` and `npm run check:raw` pass.
- There is no `console.error`.

---

## Where each screen state lives

Screen-level states are drawn by exactly one component, so nothing falls between two. Step 7
picks which state to pass; step 6 makes each one look right.

| State | Shown by | How |
|---|---|---|
| Loading | `ScoreHeader`, `MomentCard`, `Timeline` | `loading` prop: grey skeleton blocks in `--surface-fill`, same size as the real thing, no shimmer |
| Pre-kick-off | `ScoreHeader` (status "Kick-off", score 0–0 in secondary), `MomentCard` (`empty`), `Timeline` (all minutes empty) | `period: "pre"`, no cards |
| Live | `ScoreHeader` status: Live pill + minute | `period: "1H" \| "2H"` |
| ×60 speed | `ScoreHeader` status, next to the Live pill | `speed` prop > 1: neutral pill "×60" |
| HT / FT | `ScoreHeader` status pill; FT dims the losing score | `period: "HT" \| "FT"` |
| Reconnecting | `TopBar` | `connection: "reconnecting"`: muted pill, RefreshCw icon, "Reconnecting" |
| API down | `TopBar` | `connection: "offline"`: muted pill, CloudOff icon, "Offline · showing saved match". Never the red pill |
| Moment with no why-line | `MomentCard` | `card.why` is `[]`: the why-line and swing are left out, and the card shrinks, leaving no gap |
| Synthetic data + scenario | `TopBar` | always on, every state |
| Agents not run (#9) | `AgentTrace` | `steps` is `[]`: an honest "Written from templates, checked by the validator" |

---

## Layout B budget (video frame)

The safe area is 1728 × 972 at (96, 54). Top to bottom, with `--space-3` (24) between rows:

| Row | Width | Max height |
|---|---|---|
| TopBar | 1728 | 56 |
| ScoreHeader | 1728 | 224 |
| MomentCard | 1440, centred | 460 |
| Timeline | 1728 | 160 |

That totals 972 of 972. MomentCard was 420 and Timeline 176 until the Malay analyst card
measured 456 with nothing cramped (25 Oct); the slack went to the card. A component taller than its row breaks the layout: the lab state for
the longest text (Malay analyst) must still fit. On the phone everything stacks at
`100%` (358 wide with the 16 px gutter).

---

## Primitives (batch 1)

### Icon
`<Icon icon={Check} label?="Checked" />`
- Renders the Lucide component at `size="1em"` and `strokeWidth={2.25}`, so it follows the
  surrounding font size.
- Without a label it's `aria-hidden`; with one it gets `role="img"` and an `aria-label`.
- Lab states: `sizes` shows a Check icon in caption2, body, headline and title1 text on both
  canvases.

### Pill
`<Pill tone="live|neutral|muted|positive|you" icon?={Lucide} size?="caption|body">text</Pill>`
- An inline-flex label with `--radius-pill`. Font `--type-caption1` by default, `--type-callout`
  for `size="body"`.
- Padding is `--space-half` × `--space-1` on the phone and `--space-1` × `--space-2` on video.
  The icon gap is `--space-half`.

| Tone | Fill | Text |
|---|---|---|
| live | `--live-fill` | `--live-on-fill` |
| neutral | `--state-neutral-tint` | `--state-neutral-text` |
| muted | `--state-muted-tint` | `--state-muted-text` |
| positive | `--state-positive-tint` | `--state-positive-text` |
| you | `--you-tag-fill` | `--you-tag-on-fill` |

Lab states: `tones` (all five in a row, EN), `with-icons` (Check positive, RefreshCw muted,
Activity neutral) and `long-ms` (MS labels: "Disemak oleh pengesah", "Langsung").

### Crest
`<Crest teamId="NGC" size="full|badge" name?="Northgate City" />`
- `full` uses `src/assets/crests/<ID>.svg`, and `badge` uses `<ID>-badge.svg`. Load them with
  `import.meta.glob("../../assets/crests/*.svg", { eager: true, query: "?url", import: "default" })`.
- The size comes from the parent through `--crest-size` (default `var(--space-6)`). The crest is
  a square `<img>` with `object-fit: contain`.
- `alt` is `name ?? ""`. Decorative when the team name sits next to it.
- **Unknown team id:** a circle in `--surface-fill`, with the first letter of the id in
  `--text-secondary`. Never a broken image.
- Lab states: `all-full` (all eight clubs at 128 px), `all-badges` (all eight badges at 28 px
  on the phone and 40 px on video) and `missing` (id "XXX").

### ChanceSwing
`<ChanceSwing team={Team} side="home|away" swing={Swing} note={string} />`

The evidence line inside a moment card (DESIGN §7): "Chance to win" then
"Northgate City 5% → 28%".
- **Row 1:** label `chanceToWin` (caption1, secondary), then the team name (caption1, side
  `--*-text`).
- **Row 2:** the numbers, in `--type-title3` with `--numeric`. The `before` value is in
  `--text-secondary`, then a Lucide ArrowRight, then the `after` value in `--text-primary`.
  Wrap both numbers in `data-role="probability"`.
- **Row 3:** a track (`--surface-fill`, height `--space-1` on video and `--space-half` on the
  phone, `--radius-pill`) with:
  - a filled segment from 0 to `after`, in the side's `--*-primary`
  - a 3 px tick (`--text-secondary`) at `before`
  
  `data-state="to"`. In step 8 it animates from `before` to `after`.
- **Row 4:** the note (caption2, secondary, `data-role="projection-note"`).
- Falling swings (`rising: false`) show the same way. The numbers say which way it went.

Lab states: `equaliser` (NGC 5% → 28%), `against` (KST 22% → 69%, away side), `falling` (a
lab-only swing, 69% → 22%, marked as such in its note) and `ms` (Malay label and note).

### ChanceBar (three-way)
`<ChanceBar home={Team} away={Team} projection={WinProjection} />`

Used only inside BriefPanel at half-time (Opta pattern, contained).
- A single track split three ways: home (`--home-primary`), draw (`--surface-fill-strong`) and
  away (`--away-primary`), with 3 px gaps between them.
- Under it, three labels aligned to their segments: "NGC 2%", "Draw 21%", "KST 77%", using
  `formatPct`. Every percentage is `data-role="probability"`.
- A segment under 6% keeps a minimum width of `--space-1`, so it stays visible.
- The note goes under it.

Lab states: `halftime` (brief.halftime projection), `even` (made-up 0.34/0.33/0.33, labelled
lab-only) and `es`.

### Sheet
`<Sheet open onClose title detent="medium|large">children</Sheet>`

A bottom sheet (HIG Sheets):
- a scrim (`--scrim`), and a panel in `--surface-sheet` with `--radius-sheet` top corners and
  `--shadow-sheet`
- a grabber: 5 × 36 on the phone and 8 × 72 on video, `--surface-fill-strong`, `--radius-pill`
- a header row with the title (`--type-title3`) and a close button (Lucide X, aria-label
  `close`)

Sizing:
- Medium is 50% of the frame height, large 88%. The body scrolls inside.
- On video the panel is 1440 wide and centred. Its inner padding keeps all text inside the safe
  area: bottom padding of at least `--safe-y` plus `--space-3`.
- On the phone it's full width.

Behaviour:
- `role="dialog"` with `aria-modal="true"`.
- Focus moves to the panel on open and is trapped. Esc and a scrim click call `onClose`.
- `data-state="open|closed"`. Closed renders nothing (no animation until step 8).
- The sheet is positioned against its nearest positioned ancestor (the frame, or the screen
  root), not `position: fixed`, so the lab can show it in a frame.

Lab states: `medium` and `large` (with a short body of the 14' card's facts as plain text) and
`overflow` (40 rows, scrolls). `place: "fill"`.

---

## Components (batch 2 and on)

### TopBar
`<TopBar meta={MatchMeta} profile={Profile} team?={Team} connection="live|reconnecting|offline" />`

- **Left:** the wordmark (`src/assets/brand/wordmark.svg`, `--space-5` tall on video and
  `--space-3` on the phone; the mark alone on the phone).
- **Then:** the scenario title (`meta.scenario_title`, caption1, secondary).
- **Right, in order:**
  1. the connection notice, only when not `live`
  2. "Following" plus the team name and player, if set (caption1). "Following Northgate City ·
     L. Quinn"
  3. a language code pill (EN/MS/ES, neutral)
  4. a persona pill (`casual` or `analyst` label, neutral)
  5. the **"Synthetic data" pill, which always shows**, with an Info icon
- Height is at most 56 on video. On the phone it wraps to two rows: wordmark and synthetic on
  row 1, the rest on row 2.

| State | Fixture | Canvases |
|---|---|---|
| `live-en` | snapshots.m75 meta + profile | both |
| `analyst-ms` | m75msAnalyst profile (longest labels) | both |
| `reconnecting` | m75, `connection="reconnecting"` | both |
| `offline` | m75, `connection="offline"` | both |
| `no-following` | profile with team and player null | video |

### ScoreHeader ★ hero, 3 looks
`<ScoreHeader home={Team} away={Team} score={Score} period={Period} minute={number} speed?={number} scorers?={{home: string[], away: string[]}} loading? look="a|b|c" />`

- **Content:** home on the left, always. Each side shows:
  - its full crest: `--crest-size` 128 on video, 48 on the phone
  - the team name, in `--type-title3` and the side's `--*-text`
  - its scorers: "K. Quinn 14', 37'" in caption1, secondary. Build the strings with a helper,
    `scorersFrom(cards)`, in `src/ui/format.ts`. It groups goal cards by player, keeps minute
    order and uses `cardMinute`.
- **The centre:**
  - the score, in `--type-score` with `font-stretch: var(--score-stretch)` and `--numeric`,
    using an en dash
  - under it, the status row:
    - live: a Live pill, then the minute (`formatMinute`, title3, `--numeric`), then the ×60
      pill when `speed > 1`
    - HT or FT: a neutral "HT" or "FT" pill
    - pre: a neutral "Kick-off" pill, with the score in `--text-secondary`
- **FT:** the losing side's score digit is in `--text-dimmed-large`. A draw dims neither.
- **Motion hooks:** `data-state="scored"` on a side when `scoredSide` is set (an optional prop).
- **Loading:** fill-coloured blocks the size of each crest, name and score.
- **The 3 looks** (for Ilham to pick; delete the other two afterwards):
  - **a, "Card glow":** a white card the full width, with a soft home glow at its left edge and
    an away glow at its right edge.
  - **b, "Open stage":** no card. The glows sit on the ground behind each crest, and the score is
    the largest thing on the frame, Apple Sports at TV size.
  - **c, "Split tint":** a white card with each half tinted at 6% of its club's glow, split by
    space, not a line. The tint must keep the name text at 4.5:1 or above.

| State | Fixture | Canvases |
|---|---|---|
| `live-74` ×3 looks | m75: 2–2, 74', scorers from m75 cards | both |
| `x60` | m15, speed 60 | video |
| `pre` | snapshots.pre | both |
| `half-time` | snapshots.ht, 0–2 | video |
| `full-time` | snapshots.ft, 3–2, KST dimmed | both |
| `stoppage` | 90+4', `minute: 94` | video |
| `double-digit` | lab-only score 10–9 (width stress) | both |
| `other-clubs` | RIV v HAR, lab-only teams, `clubs` set on the state | video |
| `missing-crest` | away id "XXX" | phone |
| `loading` | `loading` | both |

### MomentCard ★ hero, 3 looks
`<MomentCard card={LiveCard} team?={Team} note={string} onOpenFacts?={() => void} loading? empty? look="a|b|c" />`

The product (DESIGN §5): one moment, why it matters, proof one tap away.

**Tag row** (caption1):
- the minute (`cardMinute`, `--numeric`)
- the type, `labels.insight[card.type]`, with an icon:
  - goal: CircleDot
  - chaos_phase: Activity (the zigzag)
  - momentum_flip and control_shift: TrendingUp
  - pass_of_the_moment: Send
  - shot_speed: Zap
  - pressure_spike: Flame
  - player_focus and player_milestone: User
  - otherwise: Sparkles
- when `tags` has `focus_player`: a `you`-tone "Your player" pill
- when `tags` has `against_your_team` and the type is goal: the tag reads "Goal against", the
  muted tone, **no glow**

**Text:**
- **Headline:** `card.headline` in `--type-title1` (76 px on video), `--text-primary`, at most
  2 lines.
- **Body:** `card.body` in `--type-body`, `--text-secondary`.
- **Why-line, the hero sentence:** `card.why[0]` in `--type-headline` (38 px), `--text-primary`.
  Show `why[1]` only in the analyst persona, as a second line in body.

**Swing:** `ChanceSwing` when `swingOf(card)` isn't null. Take the side and team from
`card.side`, `card.team_id` and the `team` prop.

**Facts used:** a button in `--type-callout`, with a ChevronUp icon. The text is the
`labels.factsUsed` label plus the count: "Facts used · 6". It calls `onOpenFacts`. It sits at the
card's bottom right.

**Club glow:** your team, or a neutral card with a side, takes that side's glow at the top edge
of the card. Goal against has none. Chaos has none and uses the neutral tag.

**States:**
- **No why:** the why-line and swing are both left out, with no empty space.
- **Empty:** the card shows `labels.emptyMoment` centred in `--type-title3`, secondary, with the
  card at its minimum height.
- **Loading:** skeleton lines.

**The 3 looks:**
- **a, "Stacked":** tag, headline, body, then the why-line, then the swing and Facts used button
  in a footer row. The calmest look.
- **b, "Why band":** the why-line and swing sit in a band at the bottom of the card, tinted with
  the side's glow at 8%, so the explanation reads as its own layer.
- **c, "Two columns" (video only):** on the left, the headline, body and why-line, about 60%
  wide. On the right, the swing drawn large (`--type-title1` numbers) with the note. The phone
  falls back to look a via a container query.

| State | Fixture | Canvases |
|---|---|---|
| `equaliser` ×3 looks | cards.equaliser, NGC, your player | both |
| `goal-against` | cards.goalAgainst (S3) | both |
| `chaos` | cards.chaos | video |
| `momentum-flip` | cards.momentumFlip (S6) | video |
| `no-why` | cards.noWhy | both |
| `equaliser-ms` | cards.equaliserMs, `language: "ms"` | both |
| `equaliser-es` | cards.equaliserEs | video |
| `analyst-en` | cards.equaliserAnalyst (S7 step 3) | both |
| `analyst-ms` (**clipping test**) | cards.equaliserMsAnalyst | both |
| `stoppage` | stoppageCard, 90+4' | video |
| `empty` | `empty` | both |
| `loading` | `loading` | both |

### Timeline
`<Timeline series={Series} minute={number} cards={LiveCard[]} selectedId?={string} onSelect?={(id) => void} turningPoints?={TurningPoint[]} title={string} note?={string} loading? />`

One bar per minute (DESIGN §9.7 pattern 4).

**Title:** a `<figcaption>` that states the message: `title`, which is `control.label` (for
example "Northgate City in control"), in caption1 above the chart.

**Bars:**
- 91 slots, minutes 0–90, with an extra gap of `--space-2` between 45 and 46 (half-time).
- For each minute up to `minute`, `series.momentum[i]` (−1..1) draws:
  - a bar **up** from the centre line in `--home-primary` when it's positive
  - a bar **down** in `--away-primary` when it's negative
  - with the height in proportion and a fixed axis (−1..1, DESIGN §9.4)
- Minutes after `minute` are empty stubs in `--surface-fill`, so time left reads at a glance.
  **Never draw data after `minute`.**
- A minute with `series.chaos[i] > 0.8` gets a `--surface-fill` band behind its slot. A chaos
  stretch of 3 or more minutes also gets an Activity icon above its middle.

**Goals:** a filled circle at the goal's minute, in the scorer's `--*-primary`. It sits above
the bars for home and below for away. Its diameter is `--space-3` on video and `--space-2` on
the phone.

**Moment pins:** a hollow ring (`--stroke` outline, `--text-secondary`) for each priority 1–2
card that isn't a goal, above the bars.
- Each pin is a `<button>` with an `aria-label` like "51' Momentum swings to Northgate City",
  and a hit target of at least 44 px.
- The selected pin is filled `--text-primary`, with a 2 px line down to the bars.

**Turning points (FT):**
- above each goal in `turningPoints`, a label "74' · 5% → 28%" (caption2, using `turningSwing`)
- the numbers are `data-role="probability"`, and the `note` shows under the axis

**Axis:** 0', 15', 30', HT, 60', 75', 90' (caption2, secondary).

**Sizes:**
- Video: the full width (1728), 160 high including the title and axis.
- Phone: 358 wide. Bars are 3 px with 1 px gaps, the axis shows 0', HT and 90' only, and pins
  are hidden on the phone (the phone uses a list instead).

**Rendering:** build the bars as an SVG with `preserveAspectRatio="none"`, and the pins and
labels as HTML positioned by percentage, so text never scales.

| State | Fixture | Canvases |
|---|---|---|
| `kickoff` | snapshots.pre (all empty) | both |
| `m15` | snapshots.m15, the 14' goal | both |
| `half-time` | snapshots.ht | video |
| `m75-selected` | snapshots.m75, with the 74' goal card selected | both |
| `full-time-turning` | snapshots.ft, with `briefs.fulltime.turning_points` and the note | both |
| `loading` | `loading` | video |

### FactsSheet
`<FactsSheet open card={LiveCard} note={string} onClose />`

Built on `Sheet` (S4: the proof).
- **Title:** the card headline. Under it, the minute and the type tag.
- **"Facts used":** an inset grouped list. Each row has `label` on the left (body, secondary)
  and `value` on the right (body, primary, `--numeric`). A row whose key starts `win_` has a
  value marked `data-role="probability"`.
- **"Evidence":** one row per `card.evidence`:
  - `description` (body, primary)
  - under it, `event_id` (caption1, secondary, `--numeric`), shown as it is: "SCN-comeback-0208"
  
  Rows are in minute order.
- **Footer:**
  - a `positive` Pill with Check, reading "Checked by the validator"
  - then the source line in caption1, secondary: `labels.templateSource` when
    `card.source === "template"`, otherwise `labels.llmSource`
  - the projection note, if any probability was shown

| State | Fixture | Canvases |
|---|---|---|
| `goal-against-medium` (S4) | cards.goalAgainst, medium | both |
| `equaliser-large` | cards.equaliser, large | video |
| `analyst-ms` | cards.equaliserMsAnalyst | both |
| `no-probability` | cards.chaos (no win facts, so no note) | video |

### BriefPanel
`<BriefPanel brief={MatchBrief} onOpenFacts?={(point) => void} />`

The half-time and full-time story. This is the left column of the HT screen; the agent trace is
the right column.
- **Header:**
  - a `kind` pill: "Half-time" or "Full-time" (neutral)
  - the headline, in `--type-title1`
  - the summary, in `--type-body`, secondary
  - the source line: `summary_source` shown as the template or LLM label, caption1
- **Half-time:**
  - "Why": `brief.why` points
  - "What to watch": `brief.what_to_watch` points
  - `ChanceBar` from `brief.projection`, with the note
- **Full-time:**
  - "Turning points": one row per `turning_points` entry, with:
    - the minute (`--numeric`)
    - a dot in the side's primary colour
    - the title
    - the swing via `turningSwing(tp, brief.what_happened)`, marked as a probability
  - the note
  - `PlayerOfMatch`
- **A point:** its title in `--type-headline` and body in `--type-body`. A point with facts has a
  "Facts used · n" text button.
- **Width:** 1080 on video in the HT layout and 1440 alone at FT. The lab shows it at
  `width: "1080px"` for HT.

| State | Fixture | Canvases |
|---|---|---|
| `half-time` | briefs.halftime | both |
| `full-time` | briefs.fulltime | both |
| `full-time-ms-analyst` | briefs.fulltimeMsAnalyst (longest) | video |

### AgentTrace
`<AgentTrace steps={AgentStep[]} revealed?={number} source="template|llm" />`

The agentic shot (S5). One row per step, in order. `revealed` shows only the first n rows, so
the screen can step through them on camera.
- **Header:** "The agents at work" in `--type-title3`.
- **A row** is a grid with three parts:
  1. the agent name: `agentAnalyst`, `agentFactChecker` or `agentPipeline`, in caption1,
     secondary, at a fixed width so the actions line up
  2. the action pill with its icon:
     - tool: Wrench, neutral
     - draft: PenLine, neutral
     - accept: Check, positive
     - reject: X, muted
     - retry: RotateCcw, muted
     - skip: SkipForward, muted
     - fallback: LifeBuoy, muted
  3. the `detail` in body
- **A reject is visibly heavier:**
  - the row background is `--state-muted-tint` with `--radius-small`
  - the detail is in `--type-headline`
  - the X icon is at title3 size
  - the rejected claim, the text before the first ":", is struck through
- **The final accept** (the last step) gets a positive pill reading "Checked by the validator".
- **Empty (`steps` is `[]`):** a single quiet panel with a Check icon and `labels.templateSource`.
  This is the Plan B (#9), and it must look intentional, not broken.
- **Width:** 600 on video, the right column at HT.

| State | Fixture | Canvases |
|---|---|---|
| `full` | `agentTrace` (lab-only, marked) | both |
| `revealed-5` | `agentTrace`, revealed 5 (stops on the reject) | video |
| `empty` | `[]` | both |
| `ms` | `agentTrace`, `language: "ms"` | video |

### PlayerOfMatch
`<PlayerOfMatch player={PlayerLine} team={Team} focus?={boolean} />`

- **Header:** `playerOfMatch` (caption1, secondary). Then the name in `--type-title2`, with the
  team badge Crest (28/40 px) and "#8 · MF".
- If `focus`, the "Your player" pill.
- **Stats:** three stat blocks: goals, xG (2 decimals) and pass accuracy (%). Each has its value
  in `--type-title3` with `--numeric` and its label in caption1.
  - Pass accuracy is **not** a probability. Don't mark it.
- **Involvement:** a 6-bar mini chart (touches per 15', `player.involvement`) in the team's
  primary colour. It's a figure, with the caption `labels.involvement`.

| State | Fixture | Canvases |
|---|---|---|
| `full-time` | briefs.fulltime.player_of_the_match, focus | both |
| `not-focus` | the same, focus false | video |

### ScoreBug (overlay)
`<ScoreBug home={Team} away={Team} score={string} clock={string} />`

The strict broadcast bug for `/overlay` (DESIGN §9.7). It's used for every overlay graphic.
- A single row: home badge, home short name, the score, away short name, away badge, then the
  clock.
- `--surface-card` with `--radius-small`. Each team code sits on a thin bar of its primary
  colour, as a left/right edge of `--space-half`.
- Codes are in `--type-caption1` (25 px on video, the tvOS minimum), and the score is in
  `--type-callout`, narrow, `--numeric`.
- Height is about 64 on video. It sits top-left inside the safe area.
- Video only. Take `score` and `clock` from overlay `fields` (strings, as sent).

| State | Fixture | Background |
|---|---|---|
| `on-plate` | the 74:10 alert's fields | plate |
| `transparent` | same | transparent |

### OverlayGraphic ★ the alert has 3 looks
`<OverlayGraphic message={OverlayMessage} home={Team} away={Team} look?="a|b|c" />`

One graphic for each `message.graphic`. The page shows only one at a time (DESIGN: never
several overlays). Video only, `place: "fill"`. The component positions itself inside the safe
area and always draws the ScoreBug top-left.

- **alert** (on camera in S7):
  - the goal: `fields.headline` in `--type-title1`, `fields.body` in `--type-body`
  - the team crest
  - glow and type tag as on the MomentCard
  - placed in the lower third
  - It's on a pitch plate, so it needs a solid `--surface-card` panel, never text straight on
    the plate.
  - The looks:
    - **a, "Lower panel":** a full-safe-width panel along the bottom.
    - **b, "Side card":** a 720-wide card on the right, crest above the headline.
    - **c, "Ribbon":** a slim headline-only ribbon, with the body on a second, smaller
      ribbon below.
- **lower_third:** a headline and body panel, bottom left, 960 wide.
- **player_tag:** the player name, "#8" and the team badge, plus the headline. Bottom left,
  compact.
- **stat_bug:** `fields.stat_label` and `fields.stat_value` in a small panel under the ScoreBug.
- **momentum_bar:** `fields.phase_label` with a single horizontal bar. `momentum` (−1..1) fills
  from the centre toward the home side (left) or away side (right) in the club colours.

| State | Fixture | Background |
|---|---|---|
| `alert-74` ×3 looks | overlays.en, graphic alert at minute 74 | plate |
| `alert-74-transparent` | same, look a | transparent |
| `alert-74-ms` | overlays.ms, alert at 74 | plate |
| `alert-14-against` | the alert at 14 | plate |
| `lower-third` | the first lower_third | plate |
| `player-tag` | the first player_tag | plate |
| `stat-bug` | the first stat_bug | plate |
| `momentum-bar` | the first momentum_bar | plate |

---

## Review checklist

`npm run shots` checks the measurable rules on its own. The reviewer, on the strong model,
looks at each screenshot for what it can't measure:

1. **Five-second read.** At the 74' states, the score, the minute and the headline are the
   first three things the eye lands on, in that order.
2. **The why-line is the hero.** It must not compete with the swing numbers or the
   button.
3. **Calm.** No box-in-box, no borders, no more than one tinted area per card, and glows read
   as atmosphere, not decoration.
4. **The half-size shot** (`shots/half/`): the score, clock, headline and why-line are still
   readable (DESIGN §6.4).
5. **Neutral and honest.** Only the two clubs carry colour, plus Live red and the one positive
   green. The note sits next to every chance. "Synthetic data" is visible.
6. **Wording.** Engine text is shown as written, and labels are sentence case. MS and ES don't
   wrap mid-label.
7. **Same parts, same look.** Pills, crests and the swing look the same in every component.

## Build batches

1. **Primitives:** Icon, Pill, Crest, ChanceSwing, ChanceBar, Sheet, plus `scorersFrom` in
   `format.ts`. One builder.
2. **Heroes, 3 looks each:** ScoreHeader, MomentCard, OverlayGraphic alert plus ScoreBug. Up to
   three builders in parallel (separate folders). **Then Ilham picks.**
3. **The rest:** TopBar, Timeline, FactsSheet. Then BriefPanel, AgentTrace and PlayerOfMatch.
4. **Clean-up:** delete the looks Ilham didn't pick, and make sure every component's shots show
   0 problems.

Each batch is reviewed and committed before the next starts.
