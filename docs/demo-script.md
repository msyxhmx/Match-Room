# Demo script (under 2:00)

Owner: Ilham (handed over by Syahmi, 25 Oct 2026). This is the recording script. The reasoning
behind it, the research, per-shot UI requirements, and the capture and edit plans are in
[web/STORYBOARD.md](../web/STORYBOARD.md).

**The cut:** a flash-forward. Open on the 74' equaliser, rewind to kick-off to show how the match
was explained on the way there, then return to 74' to show the same moment three ways.

**Data:** the `comeback` scenario (`SCN-comeback`), followed as `team=NGC`, `player=L. Quinn`,
casual, English, unless a shot says otherwise. Record each shot as its own take with
`from_minute`. Any sped-up take shows the "×60" label.

## Before recording

These must be closed, or the shot's fallback used:
- [#9](https://github.com/msyxhmx/Match-Room/issues/9): the agent trace shows on the half-time screen (S5). Fallback: the Plan B line below.
- [#10](https://github.com/msyxhmx/Match-Room/issues/10): the template wording that appears on camera is fixed (S7, S8).
- [#11](https://github.com/msyxhmx/Match-Room/issues/11): Azure is live. S9 names Azure only if this is closed.

## Shots

| # | Time | What to record | Voiceover |
|---|---|---|---|
| S1 | 0:00–0:09 | Live screen at 74:10: the score flips 1–2 → 2–2, then the "Northgate City make it count" card arrives with "Chance to win: 5% → 28%" | Seventy-four minutes. Northgate City were two down at half-time. Now it's level. But a score doesn't tell you why. |
| S2 | 0:09–0:19 | The same frame, held. Add the "Match-Room Live" lower third in the edit | Match-Room Live explains a football match as it happens. Every moment comes with a reason, and the proof is one tap away. |
| S3 | 0:19–0:36 | Stream from 0' at ×60, cut at 15'. Momentum bars fill; the 14:13 "Against the run of play" card arrives | This is a synthetic match, streamed event by event. At fourteen minutes, Kingston Vale score against the run of play. Northgate had been on top, and Kingston's chance to win jumps from twenty-two to sixty-nine percent. |
| S4 | 0:36–0:50 | Open the 14' card's Facts used sheet: the facts, then the two evidence events with IDs, and the "Checked" marker | Tap any card to see the facts behind it: the two events that made this goal, each with its ID. A validator rejects any number or name it can't trace back to an event. |
| S5 | 0:50–1:07 | Half-time brief "Kingston Vale lead 0-2 at the break", then the agent trace panel | **Plan A:** At half-time, two AI agents write the story. An analyst investigates the first half through its tools. A fact-checker sends back any claim the evidence doesn't support. **Plan B (#9 not closed):** At half-time, the brief is built from those checked insights: what happened, why, and what to watch. |
| S6 | 1:07–1:17 | Stream from 45' at ×60, cut at 73'. Momentum flips to Northgate; "Momentum swings" card; 61' goal | After the break, the match turns. You can watch Northgate take over, minute by minute. |
| S7 | 1:17–1:37 | Back at 74:10: casual EN → switch to Malay (shortcut `L`) → analyst EN (`P`) → cut to the overlay page's `alert` graphic | Back at seventy-four minutes, the player this fan follows equalises. The same facts, for a casual fan in Malay. For an analyst, with expected goals and shot speed. And as a broadcast graphic, ready for a studio. |
| S8 | 1:37–1:45 | Full-time screen: "Northgate City come from behind to win 3-2", dimmed losing score, turning points with chance-to-win swings, player of the match L. Quinn | Full time: three-two. The story lists every turning point and how much it moved the chance to win. |
| S9 | 1:45–1:56 | One Keynote diagram: simulator → live engine → validator → agents → API and stream → web and overlay, with a template-fallback arrow | Under the hood: a match simulator, a live insight engine, a validator, the two agents, and a live stream. It falls back to templates, so the match never stops. |
| S10 | 1:56–2:00 | End card: "Match-Room Live: explain the match, don't just score it", repo URL, "Synthetic data" | Match-Room Live. Explain the match. Don't just score it. |

## Timing

246 words. Measured on 25 Oct with macOS text-to-speech at 150 wpm: 93.5 s. A human read at
140 wpm is about 105 s; with scene changes the total is about 103–115 s. Re-time it after
recording the real voiceover. If it runs over 1:55, cut S6 first, then shorten S2.

## Upload

- Export at 1080p, 30 fps, at least 8 Mbps.
- Upload to YouTube as **Public**, and check the link in a signed-out window.
- Upload an `.srt` caption file.
- Music: one YouTube Audio Library track marked "Attribution not required", ducked under the voice.
