# Landscape research: AI match intelligence for football

Compiled 22 Oct 2026 for the Microsoft × Premier League "Inside the Game" hackathon.
This is a map of what exists and what to read, not a pitch. Idea "seeds" at the end are
deliberately small so the team can grow its own direction.

**How to read the source marks**

- ✅ opened and read (by us or a research helper) on 22 Oct 2026
- 🔎 seen only in search results; open before quoting
- ⚠️ vendor, league or union claim; not independent

---

## 1. The brief and how it is judged

Source: hackathon site (Challenges tab and About page), read in Chrome ✅.

The single challenge is **"The Synthetic Match Insights Engine for Premier League Studio"**. It
asks for one pipeline with five stages:

1. **Ingest** synthetic events as they happen (passes, shots, tackles, possession changes,
   pressure, metadata).
2. **Interpret** them into stats, patterns and context.
3. **Explain** why a moment matters, not just that it happened.
4. **Render** it so it can sit on screen alongside the match ("timed and machine-readable enough
   to be rendered as synchronized graphical overlays").
5. **Personalise** it: analyst vs casual fan as "two genuinely different experiences"; favourite
   club, player, a player-focus mode, language.

Also listed: player name tagging with speed/distance indicators, pass quality (distance,
accuracy, difficulty), ball and shot speed, auto-eventing from video, narratives and recaps,
explainability ("control vs chaos, tactical pressure changes, game rhythm"), **data innovation**
(create or extend synthetic datasets), multi-language output. Quote: "a Project that only
generates metrics has no audience, and a solution that only personalizes has nothing to
personalize."

**Rubric (20% each):** technical implementation · agentic design & innovation · real-world impact
(incl. production readiness) · UX & presentation · adherence to the category.
**Side prizes:** best use of Microsoft Foundry · best enterprise solution · best multi-agent
orchestration · best Azure cloud-native integration.
**Dates:** submissions close 27 Oct 2026; winners 20 Nov. Demo video under 2 minutes; public repo.

---

## 2. What the other ~520 teams are building

Method: read the first 81 project cards, then probed the site's AI search with topic queries
(22 Oct). The search is semantic and ranked, so "none found" means nothing relevant in the top
results, not a proven zero.

| Theme | Crowding | Examples (project names as listed) |
|---|---|---|
| Multi-agent "AI studio crew" + fact-checker + producer approval | Very high (dozens) | Check Complete, PitchMind, The Gallery, Control Room IQ, MatchDirector, Virtual Studio Crew, Second Half, Director's Cut |
| Fan personas + multilingual | Very high | EveryFan (beginner/analyst/player/Arabic), Matchday Crew (EN/Swahili/JP), Sauti (Kiswahili), MatchGist (SMS/voice/watch) |
| AI commentary / co-commentator | High | Matchday Companion, Pundit Studio, Mic'd Up, Both Ends (rival-fan spin with a "Spin Auditor") |
| What-if / counterfactual simulation | Medium (~7) | Second Guess (most-liked card seen), Chronos XI, MatchLens What-If, PULSE XI, InsideLens, **The Half-Time Lab** ("Watch the first half. Coach the second.") |
| Accuracy measured vs ground truth | Low–medium | MatchDesk ("accuracy measured against a hidden ground truth"), Narrative VAR |
| Accessibility (blind / low-vision audio) | Low (~3–4) | Audio Eyes (spatial audio), Blind-side, Sauti |
| Teaching new fans | Low | Coach in Your Ear, Standfolk |
| Prediction / odds + game | Low | Lasso ("out-predict the AI Gaffer"), ChanceCast |
| Computer-vision auto-eventing | Low | Spotter, ATLAS |
| Multi-match / whole matchday | None found | — |
| Women's football | None found | — |
| Synthetic-data realism / validation | None found | — |

Takeaway: verification, personas, multilingual and multi-agent are now the *baseline*, not a
differentiator.

---

## 3. Shipped industry products

| Product | What it does | Data | Notes / limits | Source |
|---|---|---|---|---|
| Premier League Companion (Microsoft, 2025) | Copilot-style Q&A over ~30 seasons of stats, 300k articles, 9k videos; gated to MyPremierLeague | Archive, not live | TechRadar called launch version "useless" (3 fixed prompts). PL architect: early work "has either disappeared or completely changed". Live overlays were announced, not confirmed shipped | [Microsoft](https://news.microsoft.com/source/2025/07/01/premier-league-and-microsoft-announce-five-year-strategic-partnership-to-personalize-the-fan-experience-with-ai-for-1-8-billion-people/) 🔎 · [TechTarget](https://www.techtarget.com/data-technologies/feature/Microsoft-helps-Premier-League-fuel-fan-experience-with-AI) 🔎 · [TechRadar](https://www.techradar.com/computing/artificial-intelligence/the-premier-league-companion-is-a-new-ai-powered-tool-for-soccer-fans-but-its-useless-at-least-for-now) 🔎 |
| Bundesliga Match Facts (AWS/DFL) | 16 facts in 2025-26: Match Momentum, Shot Speed, Ball Recovery Time, Keeper Efficiency, Win Probability, Shot Efficiency, Passing Profile, Attacking Zones, Most Pressed Player, Average Positions: Trends, xGoals, Speed Alert, Average Position, Set Piece Threat, Skill, Pressure Handling | Tracking + events | Numbers, not narrative; same for every viewer | [Bundesliga list](https://www.bundesliga.com/en/bundesliga/stats/bmf-zone/2025-2026) ✅ · [xGoals explainability (SageMaker Clarify)](https://aws.amazon.com/ko/blogs/korea/explaining-bundesliga-match-facts-xgoals-using-amazon-sagemaker-clarify) 🔎 |
| LaLiga Beyond Stats / Mediacoach (Azure) | 50+ fan metrics; app personalisation, vertical clips | Optical tracking, 16 cams, 25 Hz | No generative narrative found | [Microsoft, Feb 2025](https://news.microsoft.com/source/emea/2025/02/laliga-transforma-la-experiencia-futbolistica-y-su-gestion-interna-con-la-ia-de-microsoft/?lang=es) 🔎 |
| Stats Perform: Opta Vision, OptaAI Studio | Search, live dashboard, auto graphics for media; 2025 Broadcast Tech of the Year (BBC Euro 2024) | Events + tracking | B2B for editors, not fans | [Stats Perform](https://www.statsperform.com/insights/broadcast-technology-of-the-year-award/) 🔎 |
| Genius Sports / Second Spectrum: Data Zone, GeniusIQ | Augmented broadcast (L-bar stats, on-pitch graphics); PL semi-automated offside from 12 Apr 2025 | Optical tracking, ~30 cams | One view for all | [GeniusIQ](https://businesswire.com/news/home/20240808054635/en/Genius-Sports-Launches-GeniusIQ-to-Accelerate-the-AI-Revolution-in-Global-Sport) 🔎 · [Data Zone](https://www.broadcastnow.co.uk/broadcasting/premier-league-productions-to-deliver-data-zone-broadcasts/5186505.article) 🔎 · [SAOT](https://insidersport.com/2024/08/14/premier-league-semi-automated-offside/) 🔎 |
| Amazon Prime Vision | Alternate feed with stats, tactical maps, momentum bar (NFL, then Champions League) | Tracking + video | Shared alternate feed, not per-viewer | [Amazon](https://aboutamazon.com/news/aws/prime-video-thursday-night-football-next-gen-stats-ai-features) 🔎 |
| IBM at Wimbledon (watsonx) | "Match Chat" live Q&A, "Likelihood to Win" | Scoring + tracking | Tennis; closest shipped live LLM chat | [IBM, Jun 2025](https://newsroom.ibm.com/2025-06-17-the-all-england-lawn-tennis-club-and-ibm-launch-new-ai-features-for-real-time-wimbledon-fan-engagement) 🔎 |
| WSC Sports | Auto-cut personalised highlight clips; gen-AI division since 2024 | Video + events | Clips, not explanations | [NBA](https://pr.nba.com/nba-wsc-sports-technologies-partnership) 🔎 |
| BBC Sport "My Club Daily" (Aug 2025 pilot) | ChatGPT rewrites BBC articles into a script, ElevenLabs voices it; editor-checked, labelled AI | BBC text | "The AI tools will not create stories" | [Broadcast Now](https://www.broadcastnow.co.uk/tech-innovation/bbc-sport-to-launch-genai-football-audio-updates/5207851.article) ✅ |
| DAZN | "Scores" stats engine; live player chats with AI translation | Stats feed | Personalisation plans unclear | [Broadcast Now](https://www.broadcastnow.co.uk/tech-innovation/dazn-unveils-scores/5204111.article) 🔎 |
| SkillCorner | Tracking + physical data from broadcast video; 180+ competitions | Broadcast video | "Up to 98%" accuracy is a vendor claim ⚠️ | [SkillCorner physical data](https://skillcorner.com/physical-data) 🔎 |
| FIFA / Lenovo, World Cup 2026 | "Football AI Pro" assistant (pre/post match), 3D avatar offside, Referee View | FIFA data | Announcements only | [Advanced Television](https://www.advanced-television.com/2026/01/07/fifa-lenovo-unveil-ai-powered-innovations-for-world-cup/) 🔎 |

Not usefully covered: Sky Sports, Apple MLS, Fox, TNT, Magnifi, Hawk-Eye (no PL role found).

### When AI sports text goes wrong (useful for the "why trust us" story)

- **MLS, Oct 2025:** recaps labelled "Created by MLS Generative AI" with a note that they had "not
  been reviewed by editorial staff"; one pulled after showing in Google. [CO/AI](https://getcoai.com/news/mls-publishes-ai-generated-match-summaries-without-human-review/) ✅
- **ESPN, Jul 2026:** AI-authored recap headline implied the wrong winner; two fixes needed.
  [Front Office Sports](https://frontofficesports.com/espn-blames-human-headline-error-ai-article/) ✅
- **Gannett / Lede AI:** paused AI high-school recaps after ridicule. [Bend Bulletin](https://bendbulletin.com/?p=502384) 🔎

---

## 4. Academic research

### Core football models
- **VAEP**, Decroos et al., "Actions Speak Louder Than Goals" (KDD 2019). Values every action. [arXiv 1802.07127](https://arxiv.org/abs/1802.07127) ✅
- **xT**, Karun Singh (c. 2018–19). Grid model of ball-move value; easy overlay. [Blog](https://karun.in/blog/expected-threat.html) ✅
- **OBV**, StatsBomb (2021). [Hudl blog](https://www.hudl.com/blog/introducing-on-ball-value-obv) 🔎
- **EPV**, Fernández, Bornn, Cervone (Sloan 2019; journal 2021). Tracking-based, decomposed. [Sloan](https://www.sloansportsconference.com/research-papers/decomposing-the-immeasurable-sport-a-deep-learning-expected-possession-value-framework-for-soccer) 🔎 · [arXiv 2011.09426](https://arxiv.org/abs/2011.09426) 🔎
- **Pressure**, Andrienko et al., "Visual analysis of pressure in football" (DMKD 2017), later used by the Bundesliga. [Open access](https://openaccess.city.ac.uk/id/eprint/17464/) 🔎
- **Pitch control**, Spearman et al. (Sloan 2017). No primary PDF found; secondary only.

### Win probability and calibration
- Robberechts, Van Haaren, Davis, "A Bayesian Approach to In-Game Win Probability in Soccer" (KDD 2021). [arXiv 1906.05029](https://arxiv.org/abs/1906.05029) ✅
- Brill, Yurko, Wyner, "Exploring the Difficulty of Estimating Win Probability" (2024, rev. 2025): correlated play-by-play data inflates bias and variance. [arXiv 2406.16171](https://arxiv.org/abs/2406.16171) ✅
- Rahimian et al., in-game outcome prediction with offline RL (Machine Learning 2024). [mlanthology](https://mlanthology.org/mlj/2024/rahimian2024mlj-ingame) 🔎

### Event-sequence / foundation models
- Mendes-Neves et al., "Forecasting Events in Soccer Matches Through Language" (2024). [arXiv 2402.06820](https://arxiv.org/abs/2402.06820) ✅ · player-performance follow-up [2402.06815](https://arxiv.org/abs/2402.06815) 🔎 · ECML PKDD 2025 [unified LEM](https://mlanthology.org/ecmlpkdd/2025/mendesneves2025ecmlpkdd-scalable) 🔎
- Baron et al., "A Foundation Model for Soccer" (2024). [arXiv 2407.14558](https://arxiv.org/abs/2407.14558) ✅
- **ScoutGPT**, Hong et al., "Modeling Matches as Language…" (Mar 2026). NanoGPT on K League events + Monte Carlo what-if lineups. [arXiv 2603.15212](https://arxiv.org/abs/2603.15212) ✅
- **EventGPT**, Hong et al. (Dec 2025). Next action, location, timing and value; 5 PL seasons; transfer simulation. [arXiv 2512.17266](https://arxiv.org/abs/2512.17266) ✅
- **TacticAI**, Wang et al. (DeepMind + Liverpool, Nature Comms 2024). Corner kicks. [arXiv 2310.10553](https://arxiv.org/abs/2310.10553) ✅

### Language and sport
- **"Input Matters"**, Sundararajan, Sripada, Reiter (INLG 2025). 3,312 annotated factual errors in
  180 NBA summaries; JSON input cut errors 65–69% vs plain text; input structure explains >80% of
  error variance. The closest study to "can we trust AI match text". [arXiv 2510.21034](https://arxiv.org/abs/2510.21034) ✅
- RotoWire, Wiseman et al. (EMNLP 2017). Data-to-text testbed; claim-checking metrics. [arXiv 1707.08052](https://arxiv.org/abs/1707.08052) ✅
- SportSett:Basketball, Thomson, Reiter, Sripada (2020). [ACL Anthology](https://aclanthology.org/2020.intellang-1.4) 🔎
- SoccerNet-Caption (2023) [arXiv 2304.04565](https://arxiv.org/abs/2304.04565) ✅ · MatchTime (2024) [arXiv 2406.18530](https://arxiv.org/abs/2406.18530) ✅ · GOAL (2023) [arXiv 2303.14655](https://arxiv.org/abs/2303.14655) 🔎
- "Towards Universal Soccer Video Understanding" / MatchVision (CVPR 2025). [arXiv 2412.01820](https://arxiv.org/abs/2412.01820) 🔎
- SoccerRAG (2024). [arXiv 2406.01273](https://arxiv.org/abs/2406.01273) 🔎
- Survey on AI game commentary (2025). [arXiv 2506.17294](https://arxiv.org/abs/2506.17294) 🔎
- "Why Would I Trust Your Numbers?" on explaining xG/VAEP (2021). [arXiv 2105.13778](https://arxiv.org/abs/2105.13778) 🔎

### Synthetic data and simulators
- Google Research Football (AAAI 2020). [arXiv 1907.11180](https://arxiv.org/abs/1907.11180) 🔎
- Self-exciting point processes for corner events (2026). [arXiv 2601.07980](https://arxiv.org/abs/2601.07980) 🔎
- Neural velocity completion from event-based positions (2025). [arXiv 2505.16199](https://arxiv.org/abs/2505.16199v1) 🔎

**Not found in any search:** a football-specific faithfulness/hallucination benchmark; a standard
for validating synthetic football events; academic work on per-fan personalisation of football
content.

---

## 5. Open datasets and tools

| Name | What | Licence (as checked) | Link |
|---|---|---|---|
| StatsBomb Open Data | Events (+360 frames for some matches) | Attribution required; full licence PDF unread | [GitHub](https://github.com/statsbomb/open-data) ✅ |
| Wyscout public dataset (Pappalardo et al. 2019) | One season, seven competitions | **Unconfirmed**; one catalogue says non-commercial | [DOI](https://doi.org/10.1038/s41597-019-0247-7) |
| Metrica sample data | 3 matches, tracking + events | No licence file; "acknowledge the source" | [GitHub](https://github.com/metrica-sports/sample-data) ✅ |
| SkillCorner open data | 10 A-League 2024/25 matches, broadcast tracking | MIT, credit requested | [GitHub](https://github.com/SkillCorner/opendata) ✅ |
| socceraction | SPADL, xT, VAEP | MIT | [GitHub](https://github.com/ML-KULeuven/socceraction) ✅ |
| kloppy | Vendor-neutral loading | BSD-3 | [GitHub](https://github.com/PySport/kloppy) ✅ |
| mplsoccer | Pitch plots | MIT | [GitHub](https://github.com/andrewRowlinson/mplsoccer) ✅ |
| databallpy / floodlight | Tracking + event tools | MIT | [databallpy](https://github.com/Alek050/databallpy) ✅ · [floodlight](https://github.com/floodlight-sports/floodlight) ✅ |

The hackathon allows synthetic data only; real datasets are for calibrating or validating a
generator, and that use should be checked against the rules first.

---

## 6. Sports science you can (and can't) use

Ranked by how honestly each maps onto event data.

| Finding | Evidence | What it could become on synthetic data | Source |
|---|---|---|---|
| Pressure on the receiver lowers pass completion (R = −0.34, 25,418 passes) | One peer-reviewed study; modest effect | Pass-success odds that change with pressure events | [German NT study](https://lida.sport-iat.de/dfb/Record/4077293?lng=en) 🔎 · [StatsBomb "Under Pressure"](https://blogarchive.statsbomb.com/articles/soccer/under-pressure/) 🔎 |
| FIFA Enhanced Football Intelligence (line breaks, receptions between lines, forced turnovers) | Governing-body definitions ⚠️ | Progression *proxies*, labelled as proxies | [FIFA](https://inside.fifa.com/innovation/media-releases/fifa-to-introduce-enhanced-football-intelligence-at-fifa-world-cup-2022-tm) 🔎 · [open implementation (Zurich)](https://capuana.ifi.uzh.ch/publications/PDFs/24098_An_Open_Source_Implementation_of_FIFA_s_Enhanced_Football_Intelligence.pdf) 🔎 |
| Peak-demand periods: the busiest minutes far exceed match averages | Systematic review 2022 + later studies | "Busiest 5 minutes" from event tempo (not metres) | [Review](https://pmc.ncbi.nlm.nih.gov/articles/PMC9331336) 🔎 |
| Game state and running: leaders tend to run less | **Mixed**; a 28-study review found trivial effects | Score-state tempo, worded with a hedge | [UCL study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10126199/) 🔎 · [Trewin review](https://ro.ecu.edu.au/ecuworkspost2013/11282) 🔎 |
| Scanning before receiving links to better passing (Jordet 2020; 9,574 possessions) | Observational, small effect | Only as a clearly labelled *simulated* variable | [Frontiers](https://pmc.ncbi.nlm.nih.gov/articles/PMC7573254) 🔎 |
| Five substitutes: more sprints, ~4.2 subs per match | LaLiga-run, observational ⚠️ | Substitution timing / impact cards | [LaLiga](https://www.laliga.com/en-GB/news/two-scientific-studies-from-laligas-sports-research-and-mediacoach-department-confirm-the-benefits-of-five-substitutions) 🔎 |
| Fixture congestion: 54% of 1,500 monitored players at high workload (2023/24) | Union report ⚠️ | "Days since last match" context chip | [FIFPRO](https://fifpro.org/en/articles/2024/09/workload-demands-on-players-spiral-as-competitions-expand-and-governing-bodies-fail-to-meet-duty-of-care) 🔎 |
| Shot speed / sprint alerts (Bundesliga Match Facts) | Shipped product | The brief's ball-speed and speed-indicator items | [Shot Speed](https://bundesliga.com/en/bundesliga/news/shot-speed-aws-bmf-match-facts-dfl-latest-matchday-25288) 🔎 |
| Referee body cams broadcast at Club World Cup 2025; IFAB then allowed them on TV | Governing-body announcement | "Referee view" card tied to an event | [World Soccer Talk](https://worldsoccertalk.com/news/ref-cam-makes-history-fifa-approves-club-world-cup-innovation-for-all-leagues/) 🔎 |
| VAR: PL claims 96% correct vs 82% before | League claim ⚠️ | Quote only with attribution | [Sky Sports](https://www.skysports.com/football/news/11095/13066177/var-premier-league-claims-96-per-cent-of-referee-decisions-are-correct-so-what-is-future-of-technology-in-football) 🔎 |

**Avoid** (judges with a sports-science background will notice):
- ACWR injury-risk scores: the method is contested ([Impellizzeri et al. 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7534938/) 🔎; [2025 meta-analysis](https://pubmed.ncbi.nlm.nih.gov/41029871/) 🔎).
- Menstrual-cycle performance prediction: UEFA's 2025 consensus says the evidence doesn't support it ([BMJ OSEM](https://pmc.ncbi.nlm.nih.gov/articles/PMC12458775) 🔎).
- Heart rate or biometrics: not available, and showing them would look invented.
- Metres, sprints or skeletal metrics from events alone, unless the synthetic feed includes them.

---

## 7. Competitions and what judges reward

- **NFL Big Data Bowl.** 2026 winner "Ghostbusters" (Lucca Ferraz) scored defenders against
  "ghost" baselines while the ball is in the air ([Rice News](https://news.rice.edu/news/2026/classroom-combine-champion-rice-student-wins-nfl-analytics-title) 🔎; the page didn't load on our check). 2025 winners
  (NYU) found pre-snap coverage "tells" ([NYU](https://www.sps.nyu.edu/about/news-and-ideas/articles/preston-robert-tisch-institute-for-global-sport/2025/nyu-duo-crowned-winners-of-the-2025-nfl-big-data-bowl.html) 🔎). Judged by club analysts, with finalists presenting at the Combine ([NFL Ops](https://operations.nfl.com/gameday/analytics/big-data-bowl) ✅).
- **MIT Sloan research papers.** 2025 winner: penalty-kick placement (Syracuse) ([Syracuse](https://news.syr.edu/2025/03/18/falk-college-research-team-wins-prestigious-sports-analytics-research-paper-competition/) 🔎).
- **Pattern (our inference from a small sample):** winners have one named, explainable idea tied to
  a decision someone makes, and they present it clearly. Complexity alone doesn't win.
- Not covered: SoccerNet challenges, StatsBomb Conference, OptaPro Forum, Kaggle football.

---

## 8. Fans and broadcast production

**Fans** (weak primary data; check before quoting)
- Gen Z: 51% say highlights are replacing live games ([Bango, 2026](https://bango.com/51-of-gen-z-say-highlights-are-replacing-live-games/) 🔎). Second-screen figures range from 31% to 93% depending on the survey, so don't quote one without its source.
- Women's football: 76% of fans say coverage is lacking ([SportBusiness/Sportfive](https://www.sportbusiness.com/news/fans-seek-more-womens-football-coverage-sportfive-report/) 🔎). Women's stats coverage is thin ([The IX](https://www.theixsports.com/the-ix-soccer/fbrefs-loss-advanced-stats-womens-soccer-data-accessibility/) 🔎).
- Accessibility: from Oct 2026 Sky offers live subtitles (~210 PL games) and live audio description (~109) ([ISPreview](https://www.ispreview.co.uk/index.php/2026/10/sky-sports-to-introduce-live-subtitles-and-live-descriptive-audio-commentary.html) 🔎).
- PL reach: ~1.9bn followers in 189 countries ([Front Office Sports](https://frontofficesports.com/videos/how-the-premier-league-expanded-fandom-beyond-matchday-fos-explains-presented-by-microsoft/) 🔎). Don't mix viewing, fan and follower counts on one slide.
- Worth opening: Capgemini "Beyond the game" (12,017 fans in 11 countries); PwC Global Sports Survey, 9th edition (2026).

**Production**
- IBC 2025: Chyron and Vizrt pushed AI-automated, data-driven graphics with fewer operators ([Vizrt recap](https://www.vizrt.com/blog/ibc-2025-recap/) 🔎, [Chyron](https://www.sportsvideo.org/2025/09/03/ibc-2025-chyron-announces-key-themes/) 🔎).
- How data reaches graphics: Vizrt Datacenter reads REST, Kafka, Stats Perform and Tracab feeds and maps key/value pairs into scene placeholders ([docs](https://docs.vizrt.com/datacenter-user-guide/2.4/Configuring_Datasets.html) 🔎). So a timed JSON feed of insights is a realistic "render" output.

---

## 9. Microsoft tools worth knowing

| Capability | Why it may matter | Doc |
|---|---|---|
| Foundry agent evaluations | Rubric evaluators generated from agent instructions; pass thresholds; can run in GitHub Actions | [Evaluate agents](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/evaluate-agent) ✅ |
| Foundry tracing / observability | OpenTelemetry traces of agent runs | [Trace agents](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/trace-agent-setup) 🔎 |
| A2A in Foundry | Agent-to-agent calls; incoming A2A is preview and text-only | [A2A tool](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/agent-to-agent) 🔎 |
| Agent Framework (Foundry provider) | Code-first agents on Foundry | [Learn](https://learn.microsoft.com/en-us/agent-framework/agents/providers/microsoft-foundry) 🔎 |
| Fabric Activator | No-code stateful rules over event streams (BECOMES, INCREASES), per object ID | [Activator](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/data-activator/activator-introduction) ✅ |
| Azure AI Speech avatar | Real-time talking avatar, 1080p; limited regions | [Avatar](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/what-is-text-to-speech-avatar) ✅ |
| Azure AI Content Understanding | Structured output from video/audio | [REST API](https://learn.microsoft.com/en-us/rest/api/content-understanding) 🔎 |
| Foundry docs hub (updated 19 Oct 2026) | Start here; includes an AI Red Teaming Agent (preview) | [Hub](https://learn.microsoft.com/en-us/azure/foundry/) ✅ |

---

## 10. White spaces supported by evidence

| Gap | Evidence |
|---|---|
| No football benchmark for factual accuracy of AI match text | Academic search found none; nearest is the basketball "Input Matters" study; MLS and ESPN failures show the cost |
| No standard for checking that synthetic football data is realistic | Academic search found none; brief lists "data innovation"; no hackathon team found |
| Products show the same view to everyone | Match Facts, Data Zone and Prime Vision are shared feeds; Companion personalises on account data |
| Prediction numbers come without reasons | Win Probability (Bundesliga) and Likelihood to Win (IBM) are numbers |
| Win-probability calibration is shaky | Brill et al. 2024–25 |
| Event foundation models are built for scouting, not live fan use | LEM, ScoutGPT and EventGPT all target valuation and transfers |
| Live AI explanation for football has barely shipped | Shipped AI text is post-match recaps; live chat exists in tennis |
| Whole-matchday and women's-football coverage | No hackathon project found; strong fan demand for women's coverage |

---

## 11. Seeds (prompts, not pitches)

Small starting points the team can combine or reject:

- What would a "nutrition label" for an AI match claim look like?
- Could a fan *feel* the difference between a calibrated 60% and an overconfident one?
- Which single number would a casual fan actually remember at half-time?
- What if the synthetic generator itself were the product, scored against real-world distributions?
- What does a matchday look like from the league table's point of view, rather than one pitch?
- Who watches football and is served worst by today's graphics?
- Which sports-science finding survives the trip from tracking data to event data, and which doesn't?

---

## 12. Read first (top 15)

1. The brief itself (hackathon Challenges tab), re-read with the rubric in mind
2. [Input Matters (INLG 2025)](https://arxiv.org/abs/2510.21034): factual errors in AI sports summaries
3. [Robberechts et al., in-game win probability](https://arxiv.org/abs/1906.05029)
4. [Brill et al., difficulty of win probability](https://arxiv.org/abs/2406.16171)
5. [VAEP](https://arxiv.org/abs/1802.07127) and [xT](https://karun.in/blog/expected-threat.html)
6. [EventGPT](https://arxiv.org/abs/2512.17266) and [ScoutGPT](https://arxiv.org/abs/2603.15212)
7. [Bundesliga Match Facts 2025-26](https://www.bundesliga.com/en/bundesliga/stats/bmf-zone/2025-2026)
8. [Microsoft × PL announcement](https://news.microsoft.com/source/2025/07/01/premier-league-and-microsoft-announce-five-year-strategic-partnership-to-personalize-the-fan-experience-with-ai-for-1-8-billion-people/) and [TechTarget interview](https://www.techtarget.com/data-technologies/feature/Microsoft-helps-Premier-League-fuel-fan-experience-with-AI)
9. [MLS AI recaps](https://getcoai.com/news/mls-publishes-ai-generated-match-summaries-without-human-review/) and [ESPN wrong-winner headline](https://frontofficesports.com/espn-blames-human-headline-error-ai-article/)
10. [FIFA EFI](https://inside.fifa.com/innovation/media-releases/fifa-to-introduce-enhanced-football-intelligence-at-fifa-world-cup-2022-tm) and its [open implementation](https://capuana.ifi.uzh.ch/publications/PDFs/24098_An_Open_Source_Implementation_of_FIFA_s_Enhanced_Football_Intelligence.pdf)
11. [Pressure vs pass success study](https://lida.sport-iat.de/dfb/Record/4077293?lng=en) and [Jordet scanning](https://pmc.ncbi.nlm.nih.gov/articles/PMC7573254)
12. [Foundry: evaluate agents](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/evaluate-agent)
13. [Fabric Activator](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/data-activator/activator-introduction)
14. [StatsBomb open data](https://github.com/statsbomb/open-data) and [socceraction](https://github.com/ML-KULeuven/socceraction)
15. [IBM Wimbledon Match Chat](https://newsroom.ibm.com/2025-06-17-the-all-england-lawn-tennis-club-and-ibm-launch-new-ai-features-for-real-time-wimbledon-fan-engagement)

## Known gaps in this research

Not covered or thin: Sky Sports and Apple/Fox/TNT products; SoccerNet, StatsBomb Conference,
OptaPro and Kaggle prior art; primary fan surveys (Nielsen, Ofcom, Deloitte); pressing physical
cost; women's ACL research; new EFI metrics at Club World Cup 2025 / World Cup 2026. Many links are
🔎, so open them before quoting in the pitch.
