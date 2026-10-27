# Design brief: Match-Room Live

Owner: Ilham (Syahmi has handed over all frontend decisions). Status: draft, 25 Oct 2026. Read the one-page summary first; everything after it is
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

**Locked 25 Oct (Ilham):** a **light** interface, with **Northgate Blue v Vale Claret** as the
demo clubs' colours. See [§9.2](#92-colour).

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

**Ask of Ilham:** confirm the Malay terms in [§8.3](#83-ui-labels-in-three-languages). **Ask of Syahmi:**
the template wording fixes in [§8.5](#85-wording-fixes-for-the-engines-templates).

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
- Plain visits (the shared link) get the web layout instead, at any width (§9.12). The frame
  is for recordings: director URLs, `?rec=1` and the overlay.

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

### 8.2 How real match reports are written (the benchmark)
We write like sports journalists in each language, not like a translation. The benchmark is
published Premier League match reports from October 2026. Both helpers read **post-match
reports**; no minute-by-minute live blogs were reachable.

**Malay** ([RTM Arena](https://berita.rtm.gov.my/arena/senarai-berita-arena/senarai-artikel/liverpool-bangkit-atasi-southampton-3-1/), [Kosmo](https://www.kosmo.com.my/?p=758913), Sinar Harian, Utusan):
- Formal, neutral news prose. Only quotes are casual.
- Standard verbs: *menjaringkan*, *menyamakan kedudukan*, *mendahului*, *bangkit*,
  *menewaskan*, *memecah kebuntuan*, *dilayangkan kad merah*, *dibuang padang*.
- Scores are bare ("menewaskan Leicester City 3-1", "seri 1-1"). Minutes are "pada minit
  ke-74". Stoppage time is "masa kecederaan".
- Example: "kembali menyamakan kedudukan menerusi Darwin Nunez pada minit ke-51" ([RTM](https://berita.rtm.gov.my/arena/senarai-berita-arena/senarai-artikel/liverpool-bangkit-atasi-southampton-3-1/)).
- "Peluang" means a **scoring chance** in match reports, not a probability. So "Peluang menang"
  needs its context (§7) to read as "chance to win".
- Stats such as xG and possession are rare in Malay reports. **Inference:** gloss xG once, as
  "jangkaan gol".

**Spanish, Spain** ([Marca](https://www.marca.com/futbol/premier-league/cronica/2026/10/17/gol-victor-munoz-lidera-remontada-liverpool-brentford.html), [Soccerway ES](https://es.soccerway.com/noticias/futbol-premier-league-el-aston-villa-voltea-el-partido-y-derrota-1-2-al-tottenham-en-su-estadio/QTmK2BAa)):
- Lively, with short punchy sentences mixed with long ones.
- Standard verbs: *remontar*, *dar la vuelta*, *empatar*, *ver la roja*.
- Score in brackets ("(1-2)") or as a noun ("el 1-1"). Minutes as "en el 74'". Stoppage time is
  "el añadido".
- Stats are common: "tiro a puerta" and "presión muy alta" ([Marca](https://www.marca.com/futbol/premier-league/cronica/2026/10/17/gran-haaland-historico-maresca.html)), and controlling the
  ball as "se hizo con el control de la pelota" ([Marca](https://www.marca.com/futbol/premier-league/cronica/2026/10/18/arsenal-anestesia-nottingham-forest-vence-unico-tiro-puerta.html)).

*So we* match the register: Malay formal and plain, Spanish livelier. Casual cards may be
shorter than news prose, but they use the same verbs.

### 8.3 UI labels in three languages
UI labels must match the engine's wording. The engine writes "chance of winning" (casual EN) and
"Peluang {team} untuk menang" / "Probabilidad de victoria" (`live/templates.py`).

| Label | EN | MS | ES (Spain) | Basis |
|---|---|---|---|---|
| Live | Live | Langsung | En directo | MS seen in media; ES to confirm |
| Kick-off | Kick-off | Sepak mula | Saque inicial | **Ilham to choose**: "sepak mula" or "sepakan permulaan" |
| Half-time | Half-time (HT) | Separuh masa | Descanso | MS: RTM uses "rehat separuh masa" ([RTM](https://berita.rtm.gov.my/arena/senarai-berita-arena/senarai-artikel/liverpool-bangkit-atasi-southampton-3-1/)) |
| Full-time | Full-time (FT) | Tamat perlawanan | Final del partido | To confirm |
| Chance to win | Chance to win | Peluang menang | Probabilidad de victoria | Matches the engine |
| Draw | Draw | Seri | Empate | MS verified ([RTM](https://berita.rtm.gov.my/arena/senarai-berita-arena/senarai-artikel/solanke-selamatkan-tottenham-carrick-terus-tertekan/)) |
| Comeback | Comeback | Bangkit | Remontada | Verified ([RTM](https://berita.rtm.gov.my/arena/senarai-berita-arena/senarai-artikel/liverpool-bangkit-atasi-southampton-3-1/); [Marca](https://www.marca.com/futbol/premier-league/cronica/2026/10/17/gol-victor-munoz-lidera-remontada-liverpool-brentford.html)) |
| Equaliser | Equaliser | Gol penyamaan | Gol del empate | Verified ([RTM](https://berita.rtm.gov.my/arena/senarai-berita-arena/senarai-artikel/solanke-selamatkan-tottenham-carrick-terus-tertekan/)); ES own knowledge |
| In control | In control | Menguasai permainan | Controla el partido | Matches the engine; ES see [Marca](https://www.marca.com/futbol/premier-league/cronica/2026/10/18/arsenal-anestesia-nottingham-forest-vence-unico-tiro-puerta.html) |
| Pressing | Pressing | Tekanan tinggi | Presión alta | ES verified ([Marca](https://www.marca.com/futbol/premier-league/cronica/2026/10/17/gran-haaland-historico-maresca.html)); MS to confirm |
| Facts used | Facts used | Fakta digunakan | Datos utilizados | UI term, to confirm |
| Evidence | Evidence | Bukti | Pruebas | UI term, to confirm |
| Key moments | Key moments | Detik penting | Momentos clave | To confirm |
| Turning points | Turning points | Titik perubahan | Puntos de inflexión | To confirm |
| Player of the match | Player of the match | Pemain terbaik perlawanan | Jugador del partido | MS verified ([RTM](https://berita.rtm.gov.my/arena/senarai-berita-arena/senarai-artikel/jdt-kekal-dominan-arif-aiman-bangkit-selepas-6-bulan-kecederaan/)) |
| Synthetic data | Synthetic data | Data sintetik | Datos sintéticos | To confirm |
| Casual / Analyst | Casual / Analyst | Kasual / Penganalisis | Aficionado / Analista | **Proposal**; "analis" may read as a finance term |
| xG | xG | xG (jangkaan gol) | xG (goles esperados) | ES verified ([Soccerway](https://es.soccerway.com/noticias/goles-esperados-o-xg-que-son-y-para-que-se-puede-usar-su-valor/049xmFT6)); MS gloss is a proposal |

**Ilham** (native Malay speaker) confirms the MS column after this draft. Everything marked "to
confirm" is our best reading, not yet checked by a person.

### 8.4 Spanish variant
**Proposal:** Spain Spanish (es-ES), matching what the engine already writes ("portero",
"córner", "a puerta", "tarjeta roja") and the Marca benchmark. Use "descanso", not "medio
tiempo", and "tiempo añadido", not "compensación". The stoppage-time variants are purely regional
([BBVA/Fundéu](https://www.bbva.com/es/yolollamo-alargue-prolongacion-tiempo-extra-asi-llama-tiempo-descuento-mundo/)).

### 8.5 Wording fixes for the engine's templates
These are in `live/templates.py` (Syahmi's area). Line numbers are as of 25 Oct.

| Line | Now | Suggested | Why |
|---|---|---|---|
| 25 (MS) | "Di luar jangkaan: {team} menjaringkan gol" | "{team} menjaringkan gol walaupun ditekan" | "Di luar jangkaan" means "unexpected", not "against the run of play" |
| 37 (MS) | "{team} akhirnya berjaya" | "Gol yang wajar buat {team}" | Vague; this is the "deserved goal" card |
| 41 (ES) | "{team} lo convierten" | "Gol merecido de {team}" | Awkward |
| 85–86 (MS) | "dibuang padang. {team} perlu bermain dengan sepuluh orang" | "{player} dilayangkan kad merah. {team} beraksi dengan 10 pemain" | Matches [RTM](https://berita.rtm.gov.my/arena/senarai-berita-arena/senarai-artikel/solanke-selamatkan-tottenham-carrick-terus-tertekan/) and [Kosmo](https://www.kosmo.com.my/?p=758913) |
| 94 (ES) | "{player} es expulsado" | "{player} ve la roja" | Matches "vio la roja" ([Marca](https://www.marca.com/futbol/premier-league/cronica/2026/10/17/gol-victor-munoz-lidera-remontada-liverpool-brentford.html)) |
| 144 / 149 | "suapan sintetik" / "feed sintético" | "data sintetik" / "datos sintéticos" | Half-English calques |
| 204 (ES) | "{team} mandan ahora" | "{team} dominan ahora" | Slang; Marca writes "dominio" |
| 247, 255, 481 | "Fasa huru-hara" / "Fase caótica" | "Permainan terbuka" / "Partido de ida y vuelta" | Literal calque. Judgement call, to confirm. "Huru-hara" appears about 10 times (index, season, roll-ups), so rename all of them or none |
| 277 (MS) | "kawasan tinggi" | "di kawasan lawan" | Reads as altitude |

These are suggestions. Each one needs a native-speaker read before it changes, and changing
`templates.py` means re-running `make schema` so the mocks match.

## 9. Visual foundations (constraints for step 5)

### 9.1 Typography
- **Locked 25 Oct (Ilham): system font stack only:**
  `-apple-system, system-ui, "Helvetica Neue", Arial, sans-serif`. On the Mac that records the
  demo, this renders Apple's system font
  ([WebKit](https://webkit.org/blog/3709/using-the-system-font-in-web-content/)). Judges see the
  video, so they see SF Pro.
- **Drop Barlow Condensed and IBM Plex Sans** (currently loaded in `web/index.html`). They belong
  to the old Halftime Insights look. Avoid the usual AI-default faces too: Inter, Space Grotesk,
  Geist, and uppercase monospace labels on every panel.
- **Narrow scores:** `font-stretch: 75%` on the system font (§9.7). Windows shows normal-width
  digits. **Open for step 5:** a downloaded condensed face for score digits only, if we want the
  narrow look everywhere.
- **Never download, self-host or embed SF Pro.** Its licence excludes website content and
  embedding ([Apple Fonts](https://developer.apple.com/fonts/)). We ship no font file. Other
  viewers see their own system font, so the design must still work in Segoe UI or Roboto.
- Tabular figures (`font-variant-numeric: tabular-nums`) for the score, clock and every number
  that updates. **Proposal**; not an Apple-sourced rule.

### 9.2 Colour
- **Locked: light.** A neutral, Apple-style light interface: a grey ground with white cards, using
  "base" and "elevated" layers for depth
  ([HIG: Dark mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)).
  Dark mode is out of scope for the demo.
- **Only the clubs carry colour**, plus one red for "live". The simulator's eight clubs have no
  colours ([sim/teams.py](../sim/teams.py)), so we keep a web-side map `clubColours.ts` with a
  primary, a glow and a text-safe colour per club. This doesn't touch the contract.
- **Locked: Option A, "Classic"**, chosen from two style tiles on 25 Oct:

  | Role | Colour | Contrast on white |
  |---|---|---|
  | Northgate City (NGC), "Northgate Blue" | `#1D4ED8` | 6.7:1 |
  | NGC glow (soft gradient only, never text) | `#3B82F6` | n/a |
  | Kingston Vale (KST), "Vale Claret" | `#8B1E3F` | 8.9:1 |
  | KST glow (soft gradient only, never text) | `#C2415E` | n/a |
  | Live (filled pill, white text) | `#D70015` | 5.4:1 |
  | Secondary text | `#6E6E73` | 5.1:1 |
  | Ground | `#F2F2F7` | n/a |
  | Losing score at full time (large text only) | `#8E8E93` | 3.3:1 |

  The pair stays distinct under simulated protanopia, deuteranopia and tritanopia (Machado 2009
  matrices). Under protanopia, claret reads as dark grey-brown against blue, so the teams are told
  apart mainly by lightness. Home on the left and short names (§9.2, next bullet) cover the rest.
- **Done in step 5:** the other six clubs have palettes, by the same rules: text colour at least
  4.5:1 on white, and distinct from both demo clubs and from the Live red. See
  [§9.10](#910-design-tokens-step-5).
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

### 9.7 Patterns from the moodboard (step 2)
Studied 25 Oct from Apple Sports, Bundesliga Match Momentum, Opta, and DixonBaxi's Premier League
graphics. Each pattern was redrawn with our own data rather than copied.

1. **Team colour as a soft glow** on neutral surfaces. The clubs are the only strong colour.
   ([Apple Sports](https://www.apple.com/newsroom/2024/02/introducing-apple-sports-a-new-app-for-sports-fans/))
2. **A huge, narrow score, where the losing side dims** at full time. On a Mac,
   `font-stretch: 75%` on the system font rendered 14% narrower in our test, with no font
   download. **To confirm** in Safari and on Windows.
3. **The proof in a sheet:** Facts used and evidence slide up from the moment card.
4. **Momentum as per-minute bars**, home up and away down, split at half-time, with goals pinned
   on.
   ([Bundesliga](https://aws.amazon.com/blogs/media/bundesliga-match-fact-match-momentum-revealing-the-games-invisible-pulse))
5. **Motion borrowed from the pitch**, used sparingly: a momentum shift sweeps sideways, a goal
   rises.
   ([DixonBaxi](https://www.itsnicethat.com/news/dixonbaxi-premier-league-field-of-play-120816))

Used, but contained:
- the three-way chance bar (Opta), only inside a card
- mirrored stat bars (Apple Sports), only in the analyst sheet
- the strict score bug (PL graphics), only on the overlay page

Avoided:
- a grid of equal boxes
- anything resembling odds
- several overlays on screen at once

Note: the PL broadcast score bug is only 38 px tall with 28 pt codes. That works on a TV, but
our YouTube-window demo needs the larger tvOS sizes in §6.2.

### 9.8 Storyboard (step 3)
The demo video, shot by shot, with the UI each shot needs, is in [STORYBOARD.md](STORYBOARD.md).
It adds two requirements to [§5](#5-required-elements):
- **Hidden director controls:** keyboard shortcuts to jump minutes and switch language or
  persona, so no menu is clicked on camera.
- **A visible speed label** whenever playback runs faster than real time.

### 9.9 Wireframes (step 4)
Done 25 Oct. Method: a priority guide per screen
([A List Apart](https://alistapart.com/article/priority-guides-a-content-first-alternative-to-wireframes/)),
eight rough sketches of the live screen (Crazy 8s), then three grey candidates at 1920×1080 with
real API text, measured against each other. The sketches and chosen layout can be edited in
[wireframes/match-room.excalidraw](wireframes/match-room.excalidraw).

**Locked 25 Oct (Ilham): B · Centre stage.** Top to bottom:
- a full-width score header
- the moment card centred, with a 76 px headline
- a full-width match timeline: one bar per minute, ● goals, ○ moments you can tap

Measured on the rendered frames, against two columns (A) and a feed (C), B gives the moment the
largest share of the safe area (39% vs 35% and 28%) and the largest headline, with the fewest
boxes. The timeline also carries the turning points at full time, so one component serves S3,
S6 and S8.

**Component inventory for step 6:**
- `ScoreHeader`
- `MomentCard`, with the chance bar and the Facts used button
- `Timeline`, with momentum bars, moment pins and turning-point labels
- `FactsSheet`
- `BriefPanel`, for half-time and full-time
- `AgentTrace`
- `PlayerOfMatch`
- `ScoreBug` and `OverlayGraphic`, for the overlay page
- `TopBar`, for profile and synthetic label

The phone uses the same parts, stacked: header, moment, compact timeline, list.

**States still to design (step 6):** loading, pre-kick-off, reconnecting, API down (mocks plus
a notice), and a moment with no why-line.

### 9.10 Design tokens (step 5)
Done 25 Oct. The tokens live in [src/theme.css](src/theme.css), and the club palettes in
[src/clubColours.ts](src/clubColours.ts). Components use tokens only, never a raw colour or
size. `npm run check:tokens` measures every colour pair rather than trusting our eyes. It runs
in `make lint` and in CI, and fails the build if a text colour drops under 4.5:1 on white or on
the ground. On 25 Oct, all 64 checks passed. The
[token sheet](https://claude.ai/artifact/EvsxJMVyTgShXUWtLTcAAm) renders the real `theme.css`
for review.

**Colour.**
- Neutrals:
  - the ground `#F2F2F7` is the base layer
  - cards and the sheet are white, the elevated layer
  - fills are `#E5E5EA` (pills, empty minutes, the chance-bar track)
  - primary text is `#1D1D1F`, and secondary is `#6E6E73` (4.54:1 on the ground: passing, but
    with no room to go lighter)
- **Club slots:** components read `--home-*`, `--away-*` and `--you-*` (the viewer's team).
  `clubSlots(home, away, you)` fills them from `clubColours.ts` on the match root. The defaults
  are NGC and KST, and the check confirms they match the TS map exactly.
- **The eight clubs.** "Distinct" means at least ΔE2000 20 from Northgate Blue, Vale Claret and
  Live red. That's the gap between the two locked demo colours and Live (KST to Live is 21.8).
  Every blue, cyan, slate and purple we tried came out under 20 from Northgate Blue, so no other
  club uses those hues.

  | Club | Name | Primary | Glow | Text | Text on white | Closest of NGC / KST / Live |
  |---|---|---|---|---|---|---|
  | NGC | Northgate Blue (locked) | `#1D4ED8` | `#3B82F6` | `#1D4ED8` | 6.7:1 | n/a |
  | KST | Vale Claret (locked) | `#8B1E3F` | `#C2415E` | `#8B1E3F` | 8.9:1 | n/a |
  | RIV | River Teal | `#0F766E` | `#2DD4BF` | `#0F766E` | 5.5:1 | 36 (NGC) |
  | HAR | Harbour Gold | `#A16207` | `#FBBF24` | `#854D0E` | 6.9:1 | 25 (Live) |
  | ELM | Elm Green | `#166534` | `#4ADE80` | `#166534` | 7.1:1 | 49 (NGC) |
  | MIL | Mill Black | `#1C1917` | `#78716C` | `#1C1917` | 17.5:1 | 29 (KST) |
  | ASH | Albion Magenta | `#A21CAF` | `#E879F9` | `#A21CAF` | 6.3:1 | 22 (NGC) |
  | QNB | Bridge Olive | `#4D7C0F` | `#A3E635` | `#3F6212` | 7.1:1 | 61 (Live) |

  Every primary is at least 3:1 on white, the WCAG 1.4.11 bar for bars and fills. Gold and olive
  primaries are too light for small text, so those clubs have a darker text colour.
- **Semantic states (STORYBOARD §6).** Each state has a label or icon, so colour is never the
  only signal. To keep red meaning "live", the only hue we add is one green:

  | State | Colour | Also shown by |
  |---|---|---|
  | Live | `--live-fill` `#D70015`, white text | "LIVE" pill, and the ×60 speed label next to it |
  | Goal for | the scoring club's glow and primary | "Goal" label with the scorer |
  | Goal against | `--state-muted-*` (grey, no glow) | "Goal against" label |
  | Your player | `--you-tag-*`, a black pill with white text | the "Your player" tag |
  | Chaos phase | `--state-neutral-*` | "Chaos" label and a zigzag icon; the timeline shows both clubs' bars |
  | Checked, accepted | `--state-positive-*` `#1F7A35` (the one extra hue) | tick icon and "Checked" |
  | Agent trace: tool, draft | `--state-neutral-*` | wrench icon and "Tool"; pencil icon and "Draft" |
  | Rejected, retry | `--state-muted-*` | cross or retry icon, with the draft struck through |
  | HT / FT | `--state-neutral-*` | "HT" / "FT" pill; at FT the loser's score is `--text-dimmed-large` |
  | Offline | `--state-muted-*` | an "Offline · showing saved match" notice, never the red pill |

  **The one exception to "only the clubs carry colour"** is the positive green, used for the
  fact-check tick: that tick is our trust mechanism, so it earns a colour. The green is
  `#1F7A35` rather than Apple's accessible green (from memory `#248A3D`, which measured 4.40:1,
  under the bar).

**Type.** The same role names on both canvases (`--type-title1` … `--type-caption2`, plus
`--type-score`), each a full `font` shorthand. The iOS values sit on `:root` and the tvOS values
under `.video`, so no component branches on the canvas. The sizes and weights are checked
against the HIG Typography tables: iOS is Regular (Headline Semibold), and tvOS is Medium.
- **Score:** 152 px bold on video (2× Title 1), and 56 px on the phone, with
  `font-stretch: var(--score-stretch)` (75%).
- `--numeric: tabular-nums` applies to every number that updates.
- **Decided: no condensed digit font.** We stay on `font-stretch: 75%` of the system font. The
  demo is recorded on a Mac, so judges see the narrow SF digits. A downloaded face would add a
  second family, a licence to check and a font load, all for Windows viewers who aren't the
  audience for the video.

**Space, radii, depth.**
- An 8-point grid, `--space-1` (8) to `--space-12` (96), plus `--space-half` (4) for icon gaps.
- On video: `--safe-x` 96 and `--safe-y` 54 (EBU R 95), and `--gutter` equals the safe margin.
  On the phone the gutter is 16.
- Radii: cards are 20 on the phone and 28 on video; sheets 24 and 40; pills fully round.
- `--stroke` is 2 px on the phone and 3 px on video, the minimum for lines and chart strokes
  (§6.3).
- The sheet is the only thing with a shadow (`--shadow-sheet`, cast upwards). Cards sit on the
  ground without one.

**Motion.**
- Durations: `--duration-quick` 200 ms (score, fades), `--duration-moment` 280 ms (a new card)
  and `--duration-sheet` 350 ms (the sheet, the chance swing).
- `--ease-spring` is a gentle spring: damping 0.8, about 1.5% overshoot, close to SwiftUI's
  default spring (damping 0.825, per Apple's Animation docs). It's written as CSS `linear()`,
  which is Baseline since Dec 2023 (Safari 17.2), with a cubic-bezier fallback.
- **Reduce Motion:** `--motion-travel` becomes 0, so components multiply their translate
  distances by it and the spring becomes a plain ease. Things fade in place instead of moving,
  as the HIG Accessibility page asks ("replacing transitions… with fades").

### 9.11 Brand assets: crests, wordmark, pitch plate
Done 25 Oct. Review them in place in the
[assets mockup](https://claude.ai/artifact/5Fdh9aBkdmYGdVcjGf3oD3). Each source and script lives in
[assets-src/](assets-src/) so it can be re-made.

- **Crests, round 3** ([src/assets/crests/](src/assets/crests/), made by
  `assets-src/crests/final.py`). Each fictional club has a story: its town, founding year,
  nickname, motto and emblem, in [assets-src/crests/IDENTITY.md](assets-src/crests/IDENTITY.md).
  The process:
  - **Round 1** used one template eight times. Ilham rejected it.
  - **Round 2** varied the containers but had no layers or stories. Ilham found it too simple.
  - **Round 3** followed the Premier League's structure: a different container per club, one
    local emblem, and layers (a name ring or ribbon, a year, a motto).
  - A sketch round of 24 options (`assets-src/crests/sketches/`), then Ilham's picks:

  | Club | Pick | Container | Emblem | Lettering |
  |---|---|---|---|---|
  | NGC | NGC-2 | classic shield | gatehouse under a north star | NORTHGATE chief, 18·79, *Porta Patens* |
  | KST | KST-1 | classic shield, arched top | heron in the river valley | KINGSTON VALE, EST 1894 |
  | RIV | RIV-2 | roundel | kingfisher on a reed | RIVERSIDE ROVERS, Riverside Park, 18·86 |
  | HAR | HAR-1 | modern heraldic | lighthouse, anchor, wavy sea | HARBOUR ATHLETIC, *Lux in Tempestate* |
  | ELM | ELM-3 | roundel, colours inverted | elm leaf | ELMSTEAD UNITED, Elmstead Lane, 19·02 |
  | MIL | MIL-1 | wordmark-led | waterwheel over the brook | MILLBROOK, TOWN · 1888 |
  | ASH | ASH-1 | quartered shield | ash sprig, cliffs, ford stones, year | ASHFORD ALBION |
  | QNB | QNB-3 | shield with a gold chief | crown over a three-arch bridge | *Over and Onward* |

  **Two files per club.**
  - `<ID>.svg` is the full crest, for 96 px and up: the video score header, the end card and
    the thumbnail.
  - `<ID>-badge.svg` keeps the container and emblem without lettering, for 28 px: the phone
    and the score bug.

  **Set rules:**
  - the club colour plus white, with one shared crest gold `#C9A13B` and ink as accents
  - flat fills
  - lettering in Oswald (SIL OFL), outlined; the font file isn't committed

  **Checks** (`assets-src/check_crests.py`):
  - **Contrast.** Every club colour is at least 3:1 on white and on the ground. Ribbon
    lettering is ink on gold at 6.9:1. Gold on white is only 2.4:1, so gold stays an accent.
  - **Greyscale.** The closest badges at 28 px (KST/HAR) differ on 40% of their pixels, and
    the closest full crests (NGC/QNB) on 46%. ELM's roundel is inverted against RIV's to
    keep these apart.
  - **YouTube downscale.** After shrinking to 480p and saving as JPEG at quality 30, the
    closest pair still differs on 37%; the pass mark we set is 15%. Mottos go soft at that
    size, but outlines and emblems survive.
  - **Look-alikes, checked against the Premier League reference sheet:**
    - medium risk: NGC (a blue shield with a building, like Everton) and QNB (a green and gold
      shield, like Norwich)
    - every other club is low risk
    - the mockup lists what each crest must keep to stay different

- **Wordmark and mark** ([src/assets/brand/](src/assets/brand/), made by `assets-src/brand.py`):
  - **Wordmark:** "Match-Room **Live**", outlined, so it needs no font.
  - **Mark:** a match clock. An ink ring, a kick-off tick, the match so far as a blue sector,
    and a pin at 74'.
  - **Letters:** **Hanken Grotesk Bold** (SIL OFL), the closest open face to the system font.
    We can't outline SF Pro or Helvetica for a logo (licence), and §9.1 rules out Inter. The
    font file isn't committed.
  - **Favicons:** `public/favicon.svg`, `favicon-32.png` and `apple-touch-icon.png` (180, opaque).
- **Video stills** (`assets-src/renders/`, made by `render.sh` with headless Chrome):
  - **End card (S10):** 1920×1080.
  - **YouTube thumbnail:** 1280×720. It leads with the 74' moment (2–2, 5% → 28%) and the hook
    "A score doesn't say why", then the name. Like every chance figure, it carries the
    `projection.note` (§7). It passes the shrink test at 320×180, though the note itself can't be
    read at that size.
- **Pitch plate** (`public/plates/pitch.png`, from `assets-src/pitch.py` in Blender 5.2, Eevee; the
  app loads `public/plates/pitch.webp`, the same render as WebP at quality 90, 35 KB instead of
  1.7 MB; re-export it after a new render, and `--pitch-grass` fills the pitch until it loads):
  - a 105×68 m pitch with FIFA markings and 18 stripes
  - two goals for soft shadows
  - no stadium, crowd, boards or logos
  - plainly a render, not footage

### 9.12 The web layout (B · Clean Match Card, 27 Oct)

Plain visits (the shared link, judges on their own laptop or phone) get a **scrolling web page**
instead of the shrunk 1920 × 1080 frame. Director URLs, `?rec=1` and `/overlay` keep the video
frame exactly as §6 describes, so the demo recording is unchanged. Picked on 27 Oct from three
mockups (night broadcast, clean match card, matchday poster), then designed screen by screen for
laptop and phone.

- **Look:** light and calm, like a sports card in search results. Grey ground, white cards
  (radius 20, a soft card shadow), one column of content up to 1240 px.
- **Team colours are the only colours.** Menus, tabs and buttons are ink, grey and white; the
  active item is an ink pill. Signals: green = checked (`--state-positive-*`), red = live
  (`--state-live-*`), amber = chaos (`--state-chaos-*`, `--chaos-bar`).
- **Every claim shows its proof:** each card carries a green "N facts checked" link that opens
  the fact check (a drawer on a laptop, a bottom sheet on a phone): the facts used, the
  win-chance swing, and the match events with their ids.
- **Type:** Figtree (`--font-web`, Google Fonts, system fallback) for the web layout only; the
  video frame stays on the system font (§9.1). Tokens `--type-web-*`, smaller on a phone.
- **Screens** (`src/screens/web/`): Matches (one-line pitch, now showing, features, storylines,
  more matches, table peek), the match (score card with tabs Overview / Moments / Stats /
  Half-time story / Full-time and the controls; the stories open by themselves at the break and
  at full time), the season table, the fact check and the "Just joined? Catch me up" sheet.
- **Stats:** the engine's metrics when the stream sends them; otherwise (the saved match) counted
  from the events with the engine's definitions, minus xG (the saved events round it).

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
1. ~~Light or dark?~~ **Decided 25 Oct: light** ([§9.2](#92-colour)).
2. **Agent trace in the demo:** why is the trace empty locally with a `.env` present (keys
   blank, or the LLM call falling back)? And should the half-time screen make two calls, or
   should the trace move into `MatchBrief`? Ask Syahmi; see [§5](#5-required-elements).
3. ~~Club colours?~~ **Decided 25 Oct:** Northgate Blue v Vale Claret for the demo. The other six
   were set in step 5 ([§9.10](#910-design-tokens-step-5)).
4. **Malay labels:** Ilham to confirm [§8.3](#83-ui-labels-in-three-languages).

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
