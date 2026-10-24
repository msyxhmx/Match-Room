# Demo video storyboard: Match-Room Live

Owner: Ilham (video lead). Status: draft, 25 Oct 2026. This is a **proposed replacement** for
[docs/demo-script.md](../docs/demo-script.md), which is Syahmi's file and stays untouched until
he agrees.

The storyboard is also a **build spec**. None of these screens exist yet, so every shot says what
the UI must do for the shot to be recordable ("UI needs"). The rules require the project to work
as shown in the video
([official rules](https://github.com/microsoft/insidethegamehackathon/blob/main/OFFICIAL%20RULES.md)),
so every shot is something the product really does.

Read with [DESIGN.md](DESIGN.md). Same labelling: a link is a sourced fact; **Inference** and
**Proposal** are ours.

---

## 1. What the research says

### Winning hackathon videos
We studied 12 winners using their transcripts:
- The 5 [Microsoft AI Agents Hackathon 2025 winners](https://microsoft.github.io/AI_Agents_Hackathon/winners/).
- 7 [Gemini API Developer Competition winners](https://developers.googleblog.com/announcing-the-winners-of-the-gemini-api-developer-competition/).

What they show:
- **The short winners are our template.**
  - [Gaze Link](https://www.youtube.com/watch?v=y_U1vkEC9PA) (Best Android, 2:13) states the problem in one sentence by 0:16. It then demonstrates, says in one line where the model sits, and ends on its purpose.
  - [Jayu](https://www.youtube.com/watch?v=shnW3VerkiM) (Best Overall, 3:00) is about 85% live demo, with no architecture slide.
- **The Microsoft winners run 4–6 minutes,** so they can spend 25–50 s on the problem. We can't.
- **What we borrow from Microsoft:** put the agents' work *on screen*, then one short diagram that names each agent.
  - [RiskWise](https://www.youtube.com/watch?v=ubnzboSC8NM) (Best Overall) shows a per-agent reasoning log as an explainability feature.
  - ModelProof shows the agents as labelled panels.
- **Voiceover over screen capture is the norm.** Faces appear only briefly, if at all.
- **Endings are 5–15 s:** one line of value, a URL, or a joke.

Devpost's own advice ([6 tips](https://info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video), paraphrased):
- Lead with the pitch.
- Show live use rather than slides.
- **Don't speed up the audio** to fit the limit.

### Sports-AI launch videos
These are the products closest to ours, studied from transcripts:
[Bundesliga Win Probability](https://www.youtube.com/watch?v=0rt4g-mOUuU),
[Bundesliga Match Momentum](https://www.youtube.com/watch?v=JsJPAcVeKAM),
[Bundesliga xGoals](https://www.youtube.com/watch?v=5flVB9ef0uM),
[F1 Undercut Threat](https://www.youtube.com/watch?v=SDVUFTgeGFg),
[IBM Wimbledon Match Chat](https://www.youtube.com/watch?v=GdqPh5f9Dew).

What they share:
1. **Open on the moment, not the brand.** Match Momentum opens on a commentator's cry, "the game is turned on its head".
2. **One match, one number moving, one stated consequence.** For example, Bochum v Bremen's win probability moving to 92% after a late goal.
3. **Trust from one concrete, countable fact,** not a disclaimer. xGoals is "trained by analyzing more than 40,000 shots".
4. **Name the thing in one sentence with what it outputs:** "Introducing undercut threat, a new F1 insight powered by AWS".
5. **A one-line metaphor for the chart.** Match Momentum is "almost like an ECG".
6. **Close by repeating the name.**

The [Premier League + Microsoft launch film](https://www.youtube.com/watch?v=-P35wAhOP6c) is a brand film that never shows the product working. **Inference:** a judge who has seen that will notice if we *do* show ours working.

### Craft numbers
- **Narration pace:** about 140–160 wpm for explainers (voiceover vendors; no standards body). We write **240–260 words**, not 300, so the demo has room to breathe.
- **YouTube intro:** YouTube measures how many viewers are still watching after 30 s, and says to revise the opening if that number is low ([YouTube Help](https://support.google.com/youtube/answer/9314415)).
- **Captions:** required for prerecorded video with audio ([WCAG 1.2.2](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html)). Keep to at most 20 characters per second and 42 characters per line ([Netflix](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-Timed-Text-Style-Guide)).
- **Music:** only from the [YouTube Audio Library](https://support.google.com/youtube/answer/3376882), filtered to "Attribution not required". The rules ban unlicensed music.
- **Upload:** 1080p at 8 Mbps (30 fps) ([YouTube](https://support.google.com/youtube/answer/1722171)). Set it to **Public**, because the rules say "publicly visible" and Unlisted is hidden from search ([YouTube](https://support.google.com/youtube/answer/157177)).

## 2. The idea of the cut

**Proposal: a flash-forward.**
1. Open on the 74th minute, the hero moment from DESIGN.md, the second the follower's own player equalises.
2. Rewind to kick-off and show how the product explained the match on the way there.
3. Return to the 74th minute as the payoff, where the same moment is shown three ways.

**Why this structure:**
- It meets the "open on the moment" rule.
- It gives the video a story: two down, then level.
- It lets the hero moment carry the personalisation demo instead of spending a separate scene on it.

**One sentence the video must leave behind:** *"It explains the match as it happens, and every
claim comes with its proof."*

## 3. Shot list

Times are targets. The script is measured in [§5](#5-timing). Data is the `SCN-comeback`
scenario with profile `team=NGC&player=L. Quinn`, casual, EN, unless the shot says otherwise.
Rubric codes:
- **T** technical
- **A** agentic
- **I** impact
- **U** UX and presentation
- **C** category stages: Ingest, Interpret, Explain, Render, Personalise

### S1 · 0:00–0:09 · Hook: the equaliser
- **On screen:** the live screen at 74:10. The score flips 1–2 → 2–2. The moment card slides up with "Northgate City make it count" and the why-line **"Chance to win: 5% → 28%"**. Synthetic data label visible.
- **Data:** `GET /api/matches/SCN-comeback/live?minute=75&…` (the card at 74:10). Why-line from the engine: "Their chance of winning moves from 5% to 28%."
- **VO:** "Seventy-four minutes. Northgate City were two down at half-time. Now it's level. But a score doesn't tell you why."
- **Serves:** U (hook), C (Explain).
- **UI needs:**
  - the score-change animation
  - the moment card arriving
  - the why-line inside the card (DESIGN §5)
  - start at any minute via a URL parameter

### S2 · 0:09–0:19 · Name and promise
- **On screen:** the same screen, still. A lower-third title "Match-Room Live", added in the edit, not by the app.
- **VO:** "Match-Room Live explains a football match as it happens. Every moment comes with a reason, and the proof is one tap away."
- **Serves:** U, C.
- **UI needs:** none.

### S3 · 0:19–0:36 · Kick-off to the first goal
- **On screen:**
  - the stream from kick-off at speed 60, with a visible **"×60"** speed label
  - momentum bars filling minute by minute
  - at 14:13 the "Against the run of play: Kingston Vale score" card arrives, in the against-your-team state
- **Data:** websocket `stream?speed=60&from_minute=0`, cut at 15'. Card body: "K. Quinn scores for Kingston Vale. It's 0-1. Set up by K. Kovac." Why: "Their chance of winning moves from 22% to 69%."
- **VO:** "This is a synthetic match, streamed event by event. At fourteen minutes, Kingston Vale score against the run of play. Northgate had been on top, and Kingston's chance to win jumps from twenty-two to sixty-nine percent."
- **Serves:** C (Ingest, Interpret, Explain), T (synthetic data).
- **UI needs:**
  - the speed label while playback is faster than real time
  - per-minute momentum bars (DESIGN §9.7)
  - the against-your-team card state

### S4 · 0:36–0:50 · The proof
- **On screen:**
  - tap the card, and the **Facts used** sheet slides up: Player K. Quinn, Score 0-1, Win chance before 22% / after 69%, Assist K. Kovac
  - then two evidence rows with their IDs: "13' K. Kovac (KST) pass 26 m", "14' K. Quinn (KST) scores (0.52 xG)"
  - a "Checked" marker
- **Data:** `card.facts_used`, `card.evidence` (event IDs `SCN-comeback-…`).
- **VO:** "Tap any card to see the facts behind it: the two events that made this goal, each with its ID. A validator rejects any number or name it can't trace back to an event."
- **Serves:** A (trust mechanism), U, T.
- **UI needs:**
  - the sheet (DESIGN §9.3)
  - evidence rows showing event IDs
  - a "Checked" marker. Wording must be honest: the validator runs on template and LLM text alike, per [architecture.md](../docs/architecture.md).

### S5 · 0:50–1:07 · Half-time, and the agents at work
- **On screen:**
  - the half-time brief: "Kingston Vale lead 0-2 at the break", plus what to watch
  - then the **agent trace**: the analyst's tool calls, then the fact-checker accepting cards and rejecting one, with one retry
- **Data:** stream `halftime` message (`MatchBrief`), plus `GET /api/matches/SCN-comeback/halftime` → `meta.agent_trace`. **See risk R1.**
- **VO, Plan A** (trace working): "At half-time, two AI agents write the story. An analyst investigates the first half through its tools. A fact-checker sends back any claim the evidence doesn't support."
- **VO, Plan B** (no trace): "At half-time, the brief is built from those checked insights: what happened, why, and what to watch." Plan B is weaker on A (20%), so Plan A is worth real effort.
- **Serves:** A (the 20% shot), C (Explain).
- **UI needs:**
  - the half-time screen
  - a trace panel, with one row per agent step: agent, action, and outcome (`accept` / `reject` / `retry`)

### S6 · 1:07–1:17 · The swing
- **On screen:** the stream from 46' to 73' at ×60. The momentum bars flip from claret (KST) to blue (NGC). The "Momentum swings to Northgate City" card arrives around 52'. Ferreira's goal at 61' makes it 1-2.
- **Data:** websocket `stream?speed=60&from_minute=45`.
- **VO:** "After the break, the match turns. You can watch Northgate take over, minute by minute."
- **Serves:** C (Interpret), U.
- **UI needs:** the same as S3.

### S7 · 1:17–1:37 · The payoff, three ways
- **On screen:** back at 74:10, the same goal:
  1. **casual English**, as in S1
  2. a hidden shortcut switches to **Bahasa Melayu**: "L. Quinn menjaringkan gol untuk Northgate City. Kedudukan kini 2-2."
  3. then **analyst English**: "L. Quinn scores from a 0.22 xG chance, struck at 89 km/h", plus "Northgate City had created more: 2.14 xG to 1.29."
  4. then cut to the **overlay page**: the `alert` graphic on a pitch plate
- **Data:** websocket `{profile: {language: "ms"}}`, then `{persona: "analyst", language: "en"}`. Overlay: `GET /overlays?until=75` → the `alert` graphic at 74:10.
- **VO:** "Back at seventy-four minutes, the player this fan follows equalises. The same facts, for a casual fan in Malay. For an analyst, with expected goals and shot speed. And as a broadcast graphic, ready for a studio."
- **Serves:** C (Personalise, Render), I (studio-ready), U.
- **UI needs:**
  - a profile switch with a smooth text transition
  - the overlay route with a transparent background (for OBS) and a pitch-plate background for the video
  - the strict score bug (DESIGN §9.7)
- **See risk R2** for the Malay headline.

### S8 · 1:37–1:45 · Full time
- **On screen:** "Northgate City come from behind to win 3-2". The losing score is dimmed. Turning points, each with its win-chance swing: 14' (22→68%), 37' (61→88%), 74' (5→28%), 87' (10→96%). Player of the match: L. Quinn.
- **Data:** stream `fulltime` message, or `GET /brief/fulltime`.
- **VO:** "Full time: three-two. The story lists every turning point and how much it moved the chance to win."
- **Serves:** C (Explain), U.
- **UI needs:**
  - the full-time screen
  - the dimmed losing score
  - the turning points list
- **See risk R2** for the duplicate headline.

### S9 · 1:45–1:56 · How it's built
- **On screen:** one diagram, built in Keynote, not the app:
  - simulator → live engine (metrics, insights) → validator → analyst + fact-checker agents → API and websocket → website and overlay
  - a template fallback arrow
  - "Azure" appears only if it's live (R3)
- **VO:** "Under the hood: a match simulator, a live insight engine, a validator, the two agents, and a live stream. It falls back to templates, so the match never stops."
- **Serves:** T, A, C.
- **UI needs:** none.

### S10 · 1:56–2:00 · Close
- **On screen:** "Match-Room Live: explain the match, don't just score it". The repo URL. "Synthetic data". No Premier League marks.
- **VO:** "Match-Room Live. Explain the match. Don't just score it."
- **Serves:** U.

## 4. Script, in one block (for timing and captions)

```
Seventy-four minutes. Northgate City were two down at half-time. Now it's level. But a score doesn't tell you why.
Match-Room Live explains a football match as it happens. Every moment comes with a reason, and the proof is one tap away.
This is a synthetic match, streamed event by event. At fourteen minutes, Kingston Vale score against the run of play. Northgate had been on top, and Kingston's chance to win jumps from twenty-two to sixty-nine percent.
Tap any card to see the facts behind it: the two events that made this goal, each with its ID. A validator rejects any number or name it can't trace back to an event.
At half-time, two AI agents write the story. An analyst investigates the first half through its tools. A fact-checker sends back any claim the evidence doesn't support.
After the break, the match turns. You can watch Northgate take over, minute by minute.
Back at seventy-four minutes, the player this fan follows equalises. The same facts, for a casual fan in Malay. For an analyst, with expected goals and shot speed. And as a broadcast graphic, ready for a studio.
Full time: three-two. The story lists every turning point and how much it moved the chance to win.
Under the hood: a match simulator, a live insight engine, a validator, the two agents, and a live stream. It falls back to templates, so the match never stops.
Match-Room Live. Explain the match. Don't just score it.
```

## 5. Timing

Measured on 25 Oct: the script block above was read by macOS text-to-speech
(`say -r 150`) and timed with `afinfo`. A human read will differ, so re-time it after recording
the voiceover.

| | Value |
|---|---|
| Word count | 246 |
| Synthetic read at 150 wpm (`say`) | 93.5 s |
| Human read at a slower 140 wpm (arithmetic) | 105.4 s |
| Plus about 1 s per scene change (9 changes) | about 103–115 s |
| Limit | under 120 s |

The slow-read case leaves about 5 s of margin. If the real read runs long, apply R5.

## 6. States the video reveals

This is the input for step 5's colour and component states. Each state appears on camera at least
once:
- **Live**, plus the ×60 speed label
- **Goal for your team** (S1, S7) and **goal against your team** (S3)
- **Your player** tag (S1, S7)
- **Chaos phase** (S3; the 11:59 card)
- **Momentum swing** (S6)
- **Sheet open**, with facts and evidence (S4)
- **Checked** marker (S4)
- **Agent trace:** tool, draft, accept, reject, retry (S5)
- **Half-time** (S5) and **full-time**, with the dimmed loser (S8)
- **Language switch** EN → MS, and **persona switch** casual → analyst (S7)
- **Overlay graphics:** `alert` on camera (S7). `lower_third`, `momentum_bar` and `player_tag` exist but aren't shown.

## 7. Capture plan

**Proposal**, to test before Tuesday:
- **Director controls** (a named UI requirement): hidden keyboard shortcuts, so no menu is ever clicked on camera.
  - Jump to minute: `?minute=74`, plus number keys for the scene starts.
  - Switch language: `L`. Switch persona: `P`.
  - Open the sheet: `F`. Pause: `Space`.
  - Nothing on screen reveals the shortcuts.
- **Takes, not one run.** At speed 60 the full match lasts 90 s, so record each shot as its own take with `from_minute`. Sped-up play always shows the ×60 label, so nothing misleads.
- **Clean capture:**
  - a fresh browser profile with no bookmarks bar or extensions
  - Do Not Disturb on
  - an enlarged cursor
  - a 1920×1080 window
  - **To test:** the MacBook screen is narrower than 1920 points, so check the window size and text sharpness before the real takes.
  - Screen Studio (paid, auto-zoom) or the Mac's built-in recorder (⇧⌘5).
- **Voiceover:** a human voice (Ilham or Syahmi), recorded in a quiet room, separate from the screen takes. Don't speed it up (Devpost).

## 8. Edit plan

- **Tool:** iMovie (free, fastest) or DaVinci Resolve (free, more control). Cut to the voiceover; screen takes follow the words.
- **Captions:** upload an `.srt` to YouTube. Burn in only the key lines, such as the why-lines and the S7 language labels, in case judges watch muted or small. At most 20 characters per second.
- **Music:** one YouTube Audio Library track marked "Attribution not required", ducked well under the voice. Judge by ear on laptop speakers; start around −18 dB.
- **Export:** 1080p, 30 fps, at least 8 Mbps.
- **Upload:** Public. Test the link in a signed-out window.

## 9. Risks: what has to be true before recording

| # | Risk | Owner | By |
|---|---|---|---|
| **R1** | **The agent trace is empty.** Locally, `/halftime` returned `story_source: "template"` and no trace with a `.env` present, and `MatchBrief` has no trace field (DESIGN §5). S5 Plan A needs working Azure OpenAI keys, plus either a second call from the half-time screen or the trace added to `MatchBrief`. | Syahmi | Mon 26 Oct, evening |
| **R2** | **Template text visible on camera.** All of these are on screen (DESIGN §8.5):<br>• S7, Malay headline: "Northgate City akhirnya berjaya" (vague).<br>• S8: the 74' and 87' turning points share one title, "Northgate City make it count".<br>• S3, if recorded in Malay: "Di luar jangkaan" (wrong meaning). We record S3 in English. | Syahmi (templates), Ilham (Malay check) | Mon 26 Oct |
| **R3** | **Azure claims.** The README says Azure deployment is not live. S9 names Azure only if it is live when we record. The rules also require a working version available for testing. | Ilham, with Syahmi | Tue 27 Oct, before recording |
| R4 | **Speed honesty.** Every sped-up take shows ×60; no cut shows something the product can't do. | Ilham | at recording |
| R5 | **Length.** If the human read runs over 1:55, cut S6 first, then shorten S2. | Ilham | at editing |

## 10. What we deliberately left out

- **Spanish on camera.** Three languages are in the switcher, but showing two keeps the time.
- **A chatbot.** The Premier League already has one (DESIGN §11).
- **A face on camera.** None of the short winners needed one, and it costs about 10 s.
- **A long problem section.** The Microsoft winners' 25–50 s problem sections suit 4–6 minute videos, not ours.
