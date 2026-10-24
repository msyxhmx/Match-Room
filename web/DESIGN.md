# Design brief: Match-Room Live

Owner: Ilham. Status: draft, 25 Oct 2026. Read the one-page summary first; everything after it is
the reasoning and the rules in detail.

This brief sets **constraints, not values**. The storyboard (playbook step 3) and the design
tokens (step 5) are decided later, inside these rules. If a later decision breaks a rule here,
change the rule here first.

*Labelling, as in [docs/research](../docs/research/pl-studios-gaps-and-ideas.md): a sentence with
a link is a sourced fact. **Inference** is our judgement from the sources. **Proposal** is a design
decision we're making. **To confirm** means a helper couldn't verify it; check before relying on
it.*

---

## One-page summary

**The job.** Show a football match being explained as it happens: every moment says why it
matters, and the proof is one tap away. Judges see this as a 2-minute 1080p video. Fans and studio
producers are the users we design for.

**The direction.** Apple Sports' calm and speed, plus one explained sentence per moment. Apple
Sports is "designed for speed and simplicity"
([Apple](https://www.apple.com/newsroom/2024/02/introducing-apple-sports-a-new-app-for-sports-fans/));
we keep that and add the layer it leaves out: *why*.

**The hero is the explanation, not the number.** The Premier League already shows win probability
and momentum graphics, so Syahmi's research says to use them
["only to explain why it moved"](../docs/research/pl-studios-gaps-and-ideas.md). The moment card
and its why-sentence lead every screen. A win-chance swing appears as evidence *inside* that card,
never as a standalone widget.

**The five rules that matter most**

1. **One moment at a time.** Each screen has one primary thing. Everything else is secondary or
   one tap away.
2. **Every number shows its proof.** "Facts used" and the evidence events are always reachable,
   and the agents' fact-check is visible. This is our trust mechanism and our agentic story.
3. **Designed for a 1080p video first.** The 1920×1080 frame is the main canvas, with all
   content inside the broadcast graphics-safe area. The phone layout comes second.
4. **No betting look.** Say "chance to win", show the projection note, never show odds.
5. **Honest and neutral.** The "Synthetic data" label and the scenario title are always visible.
   The interface stays neutral; only the two clubs carry colour.

**Ask of Ilham:** confirm the Malay terms in [§8](#8-words-on-screen). **Ask of Syahmi:**
the template wording fixes in [§8.4](#84-wording-fixes-for-syahmis-templates).

---

## 1. What we're making

Match-Room Live turns a stream of synthetic football events into explained, evidence-backed
moments. It shows them live, then rolls them up into a half-time brief and a full-time story, in
English, Malay or Spanish, at casual or analyst depth (see the [README](../README.md)).

The website's job is to make that engine **visible and believable in under two minutes**.

## 2. Who it's for, and where they see it

| Audience | Where and how they see it | What they need in 3 seconds |
|---|---|---|
| **Hackathon judges** (primary for the next 3 days) | A YouTube video under 2 minutes, possibly not full screen, possibly at 720p or lower | What's happening, why it matters, and that it's trustworthy |
| **Studio producer** (Premier League Studios) | A gallery screen, plus graphics on air via the overlay feed | The story worth telling right now, ready to go on air |
| **Casual fan** | A phone during a natural break in play, or the morning after for a late kick-off in KL | The score, the one moment that mattered, in their language |
| **Analyst fan** | Desktop or tablet, focused | The numbers behind the moment, with definitions |

- Fans want data "mostly before matches and in breaks rather than during play"
  ([Capgemini](https://www.capgemini.com/gb-en/news/press-releases/over-half-of-sports-fans-are-turning-to-ai-or-gen-ai-for-more-personalised-content/)),
  and 57% fear AI could spread misinformation (same source).
- The PL's relaunched site showed no Malay
  ([Premier League](https://www.premierleague.com/en/news/4337361/premier-league-launches-new-fan-facing-platforms-as-part-of-digital-transformation)).
  **Inference:** a Malay-speaking fan catching up the morning after a late kick-off is our most
  authentic user, and a good on-camera moment.

**So we:** design the video frame first, the phone second. Make the half-time and full-time
screens as good as the live screen, because that's when fans actually look.

## 3. How we're judged

The rules give five criteria at 20% each
([official rules](https://github.com/microsoft/insidethegamehackathon/blob/main/OFFICIAL%20RULES.md)).
What each means for the screen:

| Criterion | The rules ask | What the design must show |
|---|---|---|
| Technological implementation | Synthetic data, quality code, "hero technologies" | The synthetic label; a clean, fast UI that doesn't break on camera |
| Agentic design & innovation | "sophisticated agent orchestration… multi-agent collaboration" | **The analyst and fact-checker agents at work**, visible on the half-time screen |
| Real-world impact | "Could this solution be deployed in a production environment?" | A studio-ready overlay and a fan view built on the same data |
| User experience & presentation | "well-designed and intuitive", "a balanced blend of frontend and backend" | This whole brief |
| Category adherence | Ingest, interpret, explain, render, personalise | Each stage visible at least once in the demo |

**So we:** treat the agent trace and "Facts used" as required screen elements, not extras
([§5](#5-required-elements)).

## 4. Principles

1. **Explain, don't just score.** The why-sentence is the product. A screen with a number and no
   reason is unfinished. *So we* pair every highlighted number with a sentence, and every sentence
   with its facts.
2. **Calm by default, depth on request.** Apple Sports' simplicity: the main view shows little,
   and detail lives in a sheet. Apple says to use sheets for "specific info or a simple task"
   ([HIG: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)). *So we*
   put Facts used, evidence and metric definitions in sheets, not on the main view.
3. **Trust is visible.** Fans fear AI errors, and AI sports recaps have shipped wrong winners
   ([docs/research/landscape.md](../docs/research/landscape.md)). *So we* show where each sentence
   came from (template or AI, checked by the fact-checker) and which events prove it.
4. **One vocabulary.** The screen uses the same words as the engine's text. *So we* take labels
   from [§8](#8-words-on-screen) and never invent a synonym in the UI.
5. **Motion means change.** Apple: add motion "purposefully", keep it "brief and precise", and
   "make motion optional" ([HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)).
   *So we* animate only what changed (a goal, a new moment, a probability swing) and respect
   reduced motion.

### What it is and isn't

| It is | It isn't |
|---|---|
| A broadcast-grade explainer | An admin dashboard |
| One moment at a time | A grid of equal boxes |
| Calm, neutral, team colours only | Neon, gradients, "AI" glow |
| Text-led, with numbers as evidence | Number-led, with text as decoration |
| "Chance to win", a model estimate | Odds, tips, "bet" anything |
| Clearly synthetic, clearly a demo league | Pretending to be the Premier League |

## 5. Required elements

Every design option must have a place for each of these. Their data comes from the endpoints in
[docs/frontend-guide.md](../docs/frontend-guide.md).

| Element | Why it's required | Data |
|---|---|---|
| Score, clock, team short names | The 3-second read | `snapshot.score`, `clock`, `home`/`away` |
| **The current moment**: headline, body, why-sentence | The product | `cards[]` with `priority` 1–2 |
| **Facts used + evidence** (in a sheet) | The trust mechanism | `card.facts_used[]`, `card.evidence[]` |
| Who's in control / chaos phase | Our own named metric | `control.label`, `control.phase` |
| Win-chance swing, *inside* a card | Explains why the projection moved | `card.why[]`, `projection` |
| Projection note, wherever a probability appears | Honesty, no betting reading | `projection.note` |
| Viewer switcher: language, depth, team, player | Personalisation, one stage of the brief | websocket `{profile: …}` |
| **Agent trace** on the half-time story | Agentic design is 20% of the score | `api.halftime(id)` → `meta.agent_trace` (the older half-time report, not the live `MatchBrief`) |
| "I just joined" catch-up | Serves the morning-after fan from [§2](#2-who-its-for-and-where-they-see-it) | `liveApi.catchup(id, minute)` |
| "Synthetic data" label + scenario title | Rules and honesty | `meta.synthetic`, `meta.scenario_title` |
| Overlay page (transparent, for OBS) | Real-world impact, studio-ready | `overlays[]`, `new_overlays` |

- **The agent trace is the weak link.** It exists only on the older half-time report
  (`HalftimeReport.meta.agent_trace` in [types/halftime.ts](src/types/halftime.ts)). The live
  `MatchBrief` that the new half-time screen uses has no trace field. Checked on 25 Oct against
  the local API: `/api/matches/SCN-comeback/halftime` returned `story_source: "template"` and an
  **empty trace**, even though a `.env` file exists. Two ways to show it:
  1. The half-time screen also calls `api.halftime(id)` and shows its trace. No contract change.
  2. Syahmi adds the trace to `MatchBrief`. That's a contract change: `make schema` and
     updated types in the same PR.

  Either way, the demo must be recorded with working Azure OpenAI keys, or the screen must say
  honestly "written from templates, checked by the validator".
- **Proposal:** a standalone momentum chart is optional, and only appears where it explains a
  card (for example, "the chaos phase began at 58'").

## 6. The video frame comes first

### 6.1 Canvas and safe area
- Primary canvas: **1920×1080**. Keep all text and controls inside the **EBU R 95
  graphics-safe area**: a 5% margin on every side, so **x 96–1824, y 54–1026**. The action-safe
  margin is 3.5% ([EBU R 95](https://tech.ebu.ch/docs/r/r095.pdf)).
- Secondary: phone, 390 px wide. Same components, stacked.

### 6.2 Type sizes for a video, not a phone
Apple Sports is a phone app: iOS Body text is 17 pt
([HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)).
At 1920 px wide, watched small on YouTube, that's unreadable. Apple's own scale for a 1080p screen
viewed from a distance is **tvOS**, in the "tvOS built-in text styles" table on the same HIG
page:

| tvOS style | Size / leading (pt) | Weight |
|---|---|---|
| Title 1 | 76 / 96 | Medium |
| Title 2 | 57 / 66 | Medium |
| Title 3 | 48 / 56 | Medium |
| Headline | 38 / 46 | Medium |
| Callout | 31 / 38 | Medium |
| Body | 29 / 36 | Medium |
| Caption 1 | 25 / 32 | Medium |
| Caption 2 | 23 / 30 | Medium |

**Proposal:** use the tvOS scale for the 1920 frame (1 pt = 1 px at 1920×1080) and the iOS scale
for the phone layout. Nothing on the video frame goes below **23 px**, and the score and clock are
at least Title 2. The type scale is set in step 5; these are the limits.

### 6.3 Surviving compression
- YouTube recommends **8 Mbps** for 1080p at 24–30 fps and **12 Mbps** at 48–60 fps
  ([YouTube](https://support.google.com/youtube/answer/1722171)). Export at or above these.
- **Inference:** compression smears hairlines and fine gradients. Make chart strokes and dividers
  at least 2 px, avoid thin text on busy backgrounds, and avoid large soft gradients.

### 6.4 The shrink test
Watch a 1080p recording at half size. The score, clock, current headline and why-sentence must
still be readable. If they aren't, the design fails, however good it looks full size.

## 7. Showing probability honestly

- About **19%** of people misread a win probability as a share of the vote
  ([Pacific Standard](https://psmag.com/news/one-fifth-of-americans-cant-understand-election-predictions/)).
  *So we* always write "chance to win", never a bare percentage.
- The NYT election needle was meant to show uncertainty but mostly made people anxious
  ([Northwestern](https://news.northwestern.edu/stories/2020/10/presidential-plinko-visualizes-data-uncertainty)),
  and forecast visuals raise emotion and trust
  ([Hullman lab, IEEE VIS 2023](https://www.hullmanlab.northwestern.edu/paper/2023/08/01/swaying-the-public.html)).
  *So we* avoid jittery live meters. The probability changes when something happens, and the
  change is explained.
- Apple Sports shows live betting odds that users can turn off
  ([Apple](https://www.apple.com/newsroom/2024/02/introducing-apple-sports-a-new-app-for-sports-fans/)).
  This is where we deliberately differ: **no odds, ever.** PL clubs are removing gambling
  sponsors from shirt fronts from 2026/27
  ([Sky Sports](https://www.skysports.com/football/news/11095/12856367/premier-league-clubs-agree-to-withdraw-gambling-sponsorships-on-front-of-shirts)).
  *So we* use no decimal or fractional odds, no "bet" wording and no bookmaker-style colours, and
  we keep `projection.note` next to every probability.
- **Proposal:** show swings as "5% → 28%" (before and after), the format the engine already
  writes. One clear number pair beats a precise-looking decimal.

## 8. Words on screen

### 8.1 House style
**Proposal**, partly sourced:
- Minutes: `74'`, stoppage `45+2'`. Stoppage time is written with a plus sign
  ([Wikipedia](https://en.wikipedia.org/wiki/Minute_(association_football)), to confirm).
- Score: `2–2` with an en dash, which stands for "to" in scores
  ([Chicago Manual of Style](https://www.chicagomanualofstyle.org/qanda/data/faq/topics/HyphensEnDashesEmDashes/faq0165.html),
  to confirm). The engine writes `2-2` with a hyphen inside card text; the UI chrome uses the en
  dash, and card text stays as the engine writes it.
- Home team on the left, always. `HT`, `FT` in capitals.
- Short names (`NGC`, `KST`) in the score; full names in sentences.
- Sentence case for labels ("Chance to win", not "Chance To Win").
- Card text aims for 25 words or fewer, the target proposed in the
  [PL Studios research](../docs/research/pl-studios-gaps-and-ideas.md).

### 8.2 UI labels in three languages
The engine already writes casual text as "chance of winning" and formal text as "Peluang … untuk
menang" / "Probabilidad de victoria" (`live/templates.py`). UI labels should match.

| Label | EN | MS | ES (Spain) | Status |
|---|---|---|---|---|
| Live | Live | Langsung | En directo | MS seen in media; ES to confirm |
| Half-time | Half-time (HT) | Separuh masa | Descanso | MS verified ([Kosmo](https://www.kosmo.com.my/?p=533561)); ES to confirm |
| Full-time | Full-time (FT) | Tamat perlawanan | Final del partido | To confirm |
| Chance to win | Chance to win | Peluang menang | Probabilidad de victoria | Matches the engine |
| Draw | Draw | Seri | Empate | MS seen in media |
| Facts used | Facts used | Fakta digunakan | Datos utilizados | To confirm |
| Evidence | Evidence | Bukti | Pruebas | To confirm |
| Key moments | Key moments | Detik penting | Momentos clave | To confirm |
| Turning points | Turning points | Titik perubahan | Puntos de inflexión | To confirm |
| Player of the match | Player of the match | Pemain terbaik perlawanan | Jugador del partido | MS verified ([RTM](https://berita.rtm.gov.my/arena/senarai-berita-arena/senarai-artikel/jdt-kekal-dominan-arif-aiman-bangkit-selepas-6-bulan-kecederaan/)) |
| Synthetic data | Synthetic data | Data sintetik | Datos sintéticos | To confirm |
| Casual / Analyst | Casual / Analyst | Kasual / Penganalisis | Aficionado / Analista | **Proposal**, to confirm |
| xG | xG | xG (jangkaan gol) | xG (goles esperados) | ES verified ([Soccerway](https://es.soccerway.com/noticias/goles-esperados-o-xg-que-son-y-para-que-se-puede-usar-su-valor/049xmFT6)); MS gloss is a proposal |

- **Ilham:** you're the native Malay speaker, so please confirm or fix the MS column. The research
  helper couldn't open Dewan Bahasa dan Pustaka or Astro Arena.
- "Penganalisis" rather than "Analis": the helper notes "analis" reads as a finance term in
  Malaysia. To confirm. The C mockup used "Analis", so update it if we keep this.

### 8.3 Spanish variant
**Proposal:** Spain Spanish (es-ES), matching what the engine already writes ("portero",
"córner", "a puerta", "tarjeta roja"). Use "descanso", not "medio tiempo", and "tiempo añadido",
not "compensación". The stoppage-time variants are purely regional
([BBVA/Fundéu](https://www.bbva.com/es/yolollamo-alargue-prolongacion-tiempo-extra-asi-llama-tiempo-descuento-mundo/)).

### 8.4 Wording fixes for Syahmi's templates
These are in `live/templates.py`, which is Syahmi's area; they're listed here so they're not lost:
- MS "suapan sintetik" and ES "feed sintético" → "data sintetik" and "datos sintéticos".
- MS pressure spike "kawasan tinggi" reads as altitude → "di kawasan lawan" (already used
  elsewhere in the file).
- ES deserved goal "{team} lo convierten" is awkward → "Gol merecido de {team}".
- ES momentum flip "{team} mandan ahora" is colloquial → "{team} dominan ahora".
- MS "kecondongan padang" (field tilt) is a literal calque. Consider keeping "field tilt" with a
  gloss (to confirm).

## 9. Visual foundations (constraints for step 5)

### 9.1 Typography
- **System font stack only:** `-apple-system, system-ui, "Helvetica Neue", Arial, sans-serif`.
  On the Mac that records the demo, this renders Apple's system font
  ([WebKit](https://webkit.org/blog/3709/using-the-system-font-in-web-content/)).
- **Never download, self-host or embed SF Pro.** Its licence excludes website content and
  embedding ([Apple Fonts](https://developer.apple.com/fonts/)). We ship no font file. Other
  viewers see their own system font, so the design must still work in Segoe UI or Roboto.
- Tabular figures (`font-variant-numeric: tabular-nums`) for the score, clock and every number
  that updates. **Proposal**; not an Apple-sourced rule.

### 9.2 Colour
- Neutral interface: system-style backgrounds with "base" and "elevated" layers for depth
  ([HIG: Dark mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)).
  Light or dark is decided in step 5.
- **Only the clubs carry colour**, plus one red for "live". The simulator's eight clubs have no
  colours ([sim/teams.py](../sim/teams.py)). **Proposal:** a web-side map `clubColours.ts` with a
  primary and a text-safe colour per club. This doesn't touch the contract.
- **Colour is never the only signal.** Home is always on the left and short names are always
  shown, so the screen reads correctly in greyscale or for colour-blind viewers.
- Contrast: at least 4.5:1 for text up to 17 pt and 3:1 for 18 pt+ or bold
  ([HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).

### 9.3 Layout and depth
- Grouped, inset lists separated by "headers, footers, and additional space"
  ([HIG: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)).
  No borders on every box.
- Sheets for depth: medium (about half height) and large detents, a grabber, swipe or click to
  dismiss, and one sheet at a time
  ([HIG: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)).
- Blur materials only on the control layer (switcher, sheet chrome), never behind content text,
  and sparingly
  ([HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)).

### 9.4 Charts
Apple's chart guidance
([HIG: Charts](https://developer.apple.com/design/human-interface-guidelines/charts)):
- Highlight "a few key pieces of information", and give each chart a title that states its main
  message.
- Keep axes and grid secondary.
- Use a fixed axis where the range is meaningful: 0–100% chance, and −1 to 1 momentum.
- Never hide critical information behind hover.

**Proposal:** every chart is annotated with the moment that explains it, with no unexplained
squiggles. Charts draw only up to the current minute (no future data, the same rule as the
backend).

### 9.5 Icons
SF Symbols terms forbid "app icons, logos, or any other trademarked use", and web use isn't
granted ([HIG: SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)).
**Proposal:** use [Lucide](https://lucide.dev) (open licence), with outline icons at a consistent
stroke. No emoji as icons.

### 9.6 Motion
Brief and purposeful, and optional under reduced motion
([HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion);
[HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).
**Proposal:** 200–350 ms with gentle springs. Only four things move:
- the score changing
- a new moment arriving
- a sheet opening
- the win-chance swing

## 10. Rules from the project and the hackathon
- **Synthetic data only.** Fictional clubs and players ([sim/teams.py](../sim/teams.py)).
- **No unlicensed trademarks** in the video
  ([official rules](https://github.com/microsoft/insidethegamehackathon/blob/main/OFFICIAL%20RULES.md)):
  no Premier League lion or wordmark, no Apple logo, no real club crests. Borrow approaches, not
  marks.
- **The page never breaks.** If the API is down, show the mocks with a clear notice, the same
  "always a fallback" rule as the backend ([docs/architecture.md](../docs/architecture.md)).
- **Contract.** If a screen needs new data, that's a change to `contract/` with Syahmi, using
  `make schema` and the matching types in the same PR ([AGENTS.md](../AGENTS.md)).

## 11. Out of scope for this deadline
- Accounts, saved preferences on a server, push notifications.
- Video or clips (synthetic data has no footage).
- The season table, unless everything else is done.
- A chatbot. The PL already has one, so a judge will read it as derivative
  ([PL Studios research](../docs/research/pl-studios-gaps-and-ideas.md)).

## 12. Open questions
1. **Light or dark** for the video frame? Decide with the style tiles (step 5); test both with the
   shrink test.
2. **Agent trace in the demo:** why is the trace empty locally with a `.env` present (keys
   blank, or the LLM call falling back)? And should the half-time screen make two calls, or
   should the trace move into `MatchBrief`? Ask Syahmi; see [§5](#5-required-elements).
3. **Club colours:** invent eight palettes now, or only NGC and KST for the demo?
4. **Malay labels:** Ilham to confirm [§8.2](#82-ui-labels-in-three-languages).

## 13. How we'll know the design works
These don't depend on our taste. They are step 9 of the playbook.
- **Five-second test:** someone outside the team sees the 74' screen for 5 seconds. They should
  say the home team has come back to 2–2.
- **Shrink test:** [§6.4](#64-the-shrink-test).
- **Contrast** measured at 4.5:1 or better for body text; Lighthouse accessibility check.
- **Malay analyst** text fits without clipping (it's the longest).
- **API off:** the page shows the mocks and a clear notice, and nothing breaks.
- **Under 2:00:** the storyboard runs against the live stream within time.

## Sources
- Our own research: [PL Studios gaps and ideas](../docs/research/pl-studios-gaps-and-ideas.md),
  [landscape](../docs/research/landscape.md).
- Apple: [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
  (typography, sheets, materials, dark mode, motion, accessibility, lists, charts, SF Symbols);
  [Apple Sports launch](https://www.apple.com/newsroom/2024/02/introducing-apple-sports-a-new-app-for-sports-fans/),
  [Apple Sports expansion, May 2026](https://www.apple.com/newsroom/2026/05/apple-sports-expands-to-more-than-90-new-countries-and-regions/);
  [Apple Fonts licence](https://developer.apple.com/fonts/).
- Broadcast and video: [EBU R 95 safe areas](https://tech.ebu.ch/docs/r/r095.pdf);
  [YouTube upload settings](https://support.google.com/youtube/answer/1722171).
- Probability: [Northwestern on the election needle](https://news.northwestern.edu/stories/2020/10/presidential-plinko-visualizes-data-uncertainty);
  [Swaying the Public?](https://www.hullmanlab.northwestern.edu/paper/2023/08/01/swaying-the-public.html);
  [Pacific Standard](https://psmag.com/news/one-fifth-of-americans-cant-understand-election-predictions/).
- Gambling context: [Sky Sports](https://www.skysports.com/football/news/11095/12856367/premier-league-clubs-agree-to-withdraw-gambling-sponsorships-on-front-of-shirts).
- Words: [Kosmo](https://www.kosmo.com.my/?p=533561), [RTM Arena](https://berita.rtm.gov.my/arena/senarai-berita-arena/senarai-artikel/jdt-kekal-dominan-arif-aiman-bangkit-selepas-6-bulan-kecederaan/),
  [Soccerway ES](https://es.soccerway.com/noticias/goles-esperados-o-xg-que-son-y-para-que-se-puede-usar-su-valor/049xmFT6),
  [BBVA/Fundéu](https://www.bbva.com/es/yolollamo-alargue-prolongacion-tiempo-extra-asi-llama-tiempo-descuento-mundo/).
- Visual references for the moodboard: [Apple Sports on Mobbin](https://mobbin.com/explore/flows/e58b59db-e9fe-4b06-9211-b29bc78c84e2),
  [Opta live win probability](https://theanalyst.com/articles/live-win-probability),
  [IBM Wimbledon Win Factors](https://newsroom.ibm.com/2022-06-21-IBM-Reveals-New-AI-and-Cloud-Powered-Fan-Experiences-for-Wimbledon-2022),
  [Bundesliga Match Momentum](https://www.bundesliga.com/en/bundesliga/news/bundesliga-match-facts-aws-match-momentum-34052).
