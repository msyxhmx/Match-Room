// UI chrome words in the three languages (DESIGN §8.3). Card text comes from the engine and is
// never translated here. MS and ES entries marked "confirm" are proposals Ilham still checks.
// Sentence case, the engine's own words where it has one ("chance to win", not "odds").

import { createContext, useContext, type ReactNode } from "react";
import type { InsightType, Language, Persona } from "../types/live";

const EN = {
  live: "Live",
  halfTime: "HT",
  fullTime: "FT",
  halfTimeLong: "Half-time",
  fullTimeLong: "Full-time",
  kickOff: "Kick-off",
  synthetic: "Synthetic data",
  pitchNote: "Positions illustrative · events from the match feed",
  /** The movement's source: CC BY 4.0 needs the credit on screen. */
  pitchCredit: "Movement modelled on DFL tracking data (CC BY 4.0)",
  replay: "Replay",
  analystView: "Analyst view · team shape",
  play: "Play",
  pause: "Pause",
  restart: "Restart from kick-off",
  speedChoice: "Speed",
  controls: "Match controls",
  following: "Following",
  casual: "Casual",
  analyst: "Analyst",
  chanceToWin: "Chance to win",
  draw: "Draw",
  factsUsed: "Facts used",
  evidence: "Evidence",
  checked: "Checked by the validator",
  checkedShort: "Checked",
  templateSource: "Written from templates, checked by the validator",
  llmSource: "Written by the agents, checked by the validator",
  yourPlayer: "Your player",
  goal: "Goal",
  goalAgainst: "Goal against",
  keyMoments: "Key moments",
  turningPoints: "Turning points",
  whatHappened: "What happened",
  why: "Why",
  whatToWatch: "What to watch",
  playerOfMatch: "Player of the match",
  agentsAtWork: "The agents at work",
  showAgents: "See how the agents wrote this",
  hideAgents: "Hide the agents",
  agentAnalyst: "Analyst",
  agentFactChecker: "Fact-checker",
  agentPipeline: "Pipeline",
  actionTool: "Tool",
  actionDraft: "Draft",
  actionAccept: "Accepted",
  actionReject: "Rejected",
  actionRetry: "Retry",
  actionSkip: "Skipped",
  actionFallback: "Fallback",
  loading: "Loading the match",
  reconnecting: "Reconnecting",
  offline: "Offline · showing saved match",
  preview: "Preview · synthetic match",
  close: "Close",
  goals: "Goals",
  shots: "Shots",
  xg: "xG",
  passAccuracy: "Pass accuracy",
  touches: "Touches",
  ballWins: "Ball wins",
  involvement: "Touches per 15 minutes",
  momentum: "Momentum",
  emptyMoment: "Moments appear here as they happen",
  changeLanguage: "Change language",
  changeDepth: "Change depth: casual or analyst",
  viewsLabel: "View",
  viewMatches: "Matches",
  viewLive: "Live",
  viewTable: "Table",
  pickMatch: "Pick a match",
  scriptedStoryline: "Scripted storyline",
  moreMatches: "More matches",
  loadingMatches: "Loading more matches…",
  needsServer: "Needs the live server",
  nowShowing: "Now showing",
  versus: "v",
  comebackTitle: "The comeback",
  comebackBlurb: "Two down before the break, then the home side turn it round.",
  seasonTable: "Season table",
  seasonStorylines: "Season storylines",
  seasonPlayed: (n: number) => `${n} matches played`,
  club: "Club",
  tableHead: { p: "P", w: "W", d: "D", l: "L", gd: "GD", xg: "xG", pts: "Pts" },
  tableLong: { p: "Played", w: "Won", d: "Drawn", l: "Lost", gd: "Goal difference", xg: "Expected goals for", pts: "Points" },
  speed: (x: number) => `×${x}`,
  // ---- the web layout (B · Clean Match Card) ----
  languageMenu: "Language",
  languageNames: { en: "English", ms: "Bahasa Melayu", es: "Español" } as Record<Language, string>,
  catchUp: "Just joined? Catch me up",
  catchUpTitle: "The story so far",
  catchUpEmpty: "Nothing big has happened yet.",
  heroTitle: "Explain the match, don't just score it.",
  heroLead: "Pick a match and watch it play out. Live cards tell you why each moment matters — and every number shows its proof.",
  watchMatch: (title: string) => `Watch ${title}`,
  howItWorks: "How it works",
  continueWatching: "Continue watching",
  watch: "Watch",
  featureMomentsTitle: "Live moments",
  featureMomentsBody: "A card for each moment that matters, and why it matters.",
  featureControlTitle: "Control vs chaos",
  featureControlBody: "Who's running the game, minute by minute, and how wild it is.",
  featureStoryTitle: "Half-time story",
  featureStoryBody: "Written by two AI agents. One writes, one fact-checks.",
  storylines: "Storylines",
  storylinesLead: "Scripted matches, each with a different story to explain",
  fullTable: "Full table",
  footerNote: "All match data is synthetic. Built for the Microsoft × Premier League “Inside the Game” developer hackathon.",
  tabOverview: "Overview",
  tabMoments: "Moments",
  tabStats: "Stats",
  tabHalfTime: "Half-time story",
  matchSections: "Match sections",
  yourTeam: "Your team",
  livePitch: "Live pitch",
  flowTitle: "How the match has flowed",
  flowLead: "Momentum: who has the threat, minute by minute",
  flowAbove: (team: string) => `Above the line: ${team} on top`,
  flowBelow: (team: string) => `Below: ${team} on top`,
  now: "Now",
  topStats: "Top stats",
  allStats: "All stats",
  rightNow: "Right now",
  controlShare: (team: string, pct: string) => `${team} have ${pct} of the control right now.`,
  chaosLevel: (word: string) => `Chaos: ${word}`,
  chaosWords: { calm: "calm", lively: "lively", wild: "wild" },
  newestFirst: "Newest first",
  seeAllMoments: "See all moments",
  factsChecked: (n: number) => (n === 1 ? "1 fact checked" : `${n} facts checked`),
  seeProof: "see proof",
  whyItMatters: "Why it matters",
  passing: "Passing",
  pressures: "Pressures",
  positions: { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" } as Record<string, string>,
  statXg: "Expected goals (xG)",
  statShots: "Shots",
  statOnTarget: "Shots on target",
  statPossession: "Possession",
  statPassAccuracy: "Pass accuracy",
  statCorners: "Corners",
  statFouls: "Fouls",
  statsFromEvents: "Worked out from the match events so far.",
  factCheck: "Fact check",
  checkedLong: "Every name and number on this card matches the facts below.",
  chanceOf: (team: string) => `${team}'s chance of winning`,
  before: "Before",
  after: "After",
  eventsBehind: "Match events behind it",
  agentsLead: "Two AI agents wrote this story. The analyst digs through the match and drafts; the fact-checker sends back anything the stats don't support.",
  agentsCaught: (n: number) =>
    n === 1 ? "1 wrong claim caught and fixed before anyone saw it." : `${n} wrong claims caught and fixed before anyone saw them.`,
  agentsClean: "Every draft passed the fact-checker first time.",
  result: "Result",
  watchSecondHalf: "Watch the second half",
  whyWon: (team: string) => `Why ${team} won`,
  whyLevel: "Why it ended level",
  minutesSplit: "How the 90 minutes split",
  inControl: (team: string) => `${team} in control`,
  balanced: "Balanced",
  chaosMinutes: "Chaos",
  minutesShort: (n: number) => `${n} min`,
  fullTimeStats: "Full-time stats",
  replayMatch: "Replay the match",
  seeTable: "See the season table",
  winLines: (home: string, away: string) => `Chance to win: ${home} and ${away}`,
  tableNote: "xG = expected goals: how good a team's chances were, added up. GD = goal difference.",
  position: "Position",
  points: "Points",
  record: "W-D-L",
  xgFor: "Chances created (xG)",
  xgAgainst: "Chances given away (xG against)",
  ordinal: (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`,
  /** The tag on a moment card: what kind of moment it is. */
  insight: {
    goal: "Goal",
    red_card: "Red card",
    big_chance: "Big chance",
    shot_speed: "Shot",
    pass_of_the_moment: "Pass",
    momentum_flip: "Momentum",
    control_shift: "Control",
    chaos_phase: "Chaos",
    pressure_spike: "Pressing",
    win_prob_swing: "Swing",
    tempo_shift: "Tempo",
    player_milestone: "Milestone",
    player_focus: "Player",
  } as Record<InsightType, string>,
};

export type Labels = typeof EN;

const MS: Labels = {
  ...EN,
  live: "Langsung",
  halfTimeLong: "Separuh masa",
  fullTimeLong: "Tamat perlawanan", // confirm
  kickOff: "Sepak mula", // Ilham to choose: or "Sepakan permulaan"
  synthetic: "Data sintetik", // confirm
  pitchNote: "Kedudukan ilustrasi · peristiwa daripada suapan perlawanan", // confirm
  pitchCredit: "Pergerakan dimodelkan pada data penjejakan DFL (CC BY 4.0)", // confirm
  replay: "Ulang tayang", // confirm
  analystView: "Paparan analisis · bentuk pasukan", // confirm
  play: "Main", // confirm
  pause: "Jeda",
  restart: "Mula semula dari sepak mula", // confirm
  speedChoice: "Kelajuan",
  controls: "Kawalan perlawanan", // confirm
  following: "Mengikuti", // confirm
  casual: "Kasual",
  analyst: "Penganalisis",
  chanceToWin: "Peluang menang",
  draw: "Seri",
  factsUsed: "Fakta digunakan", // confirm
  evidence: "Bukti", // confirm
  checked: "Disemak oleh pengesah", // confirm
  checkedShort: "Disemak", // confirm
  templateSource: "Ditulis daripada templat, disemak oleh pengesah", // confirm
  llmSource: "Ditulis oleh ejen, disemak oleh pengesah", // confirm
  yourPlayer: "Pemain anda", // confirm
  goal: "Gol",
  goalAgainst: "Gol lawan", // confirm
  keyMoments: "Detik penting", // confirm
  turningPoints: "Titik perubahan", // confirm
  whatHappened: "Apa yang berlaku", // confirm
  why: "Kenapa", // confirm
  whatToWatch: "Perlu diperhatikan", // confirm
  playerOfMatch: "Pemain terbaik perlawanan",
  agentsAtWork: "Ejen sedang bekerja", // confirm
  showAgents: "Lihat cara ejen menulis ini", // confirm
  hideAgents: "Sembunyikan ejen", // confirm
  agentAnalyst: "Penganalisis",
  agentFactChecker: "Penyemak fakta", // confirm
  agentPipeline: "Saluran", // confirm
  actionTool: "Alat", // confirm
  actionDraft: "Draf",
  actionAccept: "Diterima",
  actionReject: "Ditolak",
  actionRetry: "Cuba semula",
  actionSkip: "Dilangkau", // confirm
  actionFallback: "Sandaran", // confirm
  loading: "Memuatkan perlawanan", // confirm
  reconnecting: "Menyambung semula", // confirm
  offline: "Luar talian · perlawanan yang disimpan", // confirm
  preview: "Pratonton · perlawanan sintetik", // confirm
  close: "Tutup",
  goals: "Gol",
  shots: "Rembatan",
  xg: "xG (jangkaan gol)", // confirm
  passAccuracy: "Ketepatan hantaran", // confirm
  touches: "Sentuhan",
  ballWins: "Rampasan bola",
  involvement: "Sentuhan setiap 15 minit", // confirm
  momentum: "Momentum",
  emptyMoment: "Detik penting akan muncul di sini", // confirm
  changeLanguage: "Tukar bahasa", // confirm
  changeDepth: "Tukar tahap: santai atau analis", // confirm
  viewsLabel: "Paparan",
  viewMatches: "Perlawanan",
  viewLive: "Langsung",
  viewTable: "Jadual",
  pickMatch: "Pilih perlawanan",
  scriptedStoryline: "Jalan cerita berskrip",
  moreMatches: "Lagi perlawanan",
  loadingMatches: "Memuatkan lagi perlawanan…", // confirm
  needsServer: "Perlukan pelayan langsung",
  nowShowing: "Sedang dipaparkan",
  versus: "lwn",
  comebackTitle: "Kebangkitan semula",
  comebackBlurb: "Ketinggalan dua gol sebelum rehat, kemudian tuan rumah membalikkannya.",
  seasonTable: "Jadual musim",
  seasonStorylines: "Cerita musim",
  seasonPlayed: (n: number) => `${n} perlawanan dimainkan`,
  club: "Kelab",
  tableHead: { p: "Mn", w: "Mg", d: "S", l: "K", gd: "BG", xg: "xG", pts: "Mata" },
  tableLong: { p: "Dimainkan", w: "Menang", d: "Seri", l: "Kalah", gd: "Beza gol", xg: "Gol dijangka", pts: "Mata" },
  languageMenu: "Bahasa",
  catchUp: "Baru sertai? Ringkaskan untuk saya", // confirm
  catchUpTitle: "Cerita setakat ini", // confirm
  catchUpEmpty: "Belum ada detik besar lagi.", // confirm
  heroTitle: "Terangkan perlawanan, bukan sekadar skor.", // confirm
  heroLead: "Pilih perlawanan dan tonton ia berlangsung. Kad langsung menerangkan kenapa setiap detik penting — dan setiap nombor ada buktinya.", // confirm
  watchMatch: (title: string) => `Tonton ${title}`,
  howItWorks: "Cara ia berfungsi", // confirm
  continueWatching: "Teruskan menonton", // confirm
  watch: "Tonton",
  featureMomentsTitle: "Detik langsung", // confirm
  featureMomentsBody: "Kad untuk setiap detik penting, dan kenapa ia penting.", // confirm
  featureControlTitle: "Kawalan lwn permainan terbuka", // confirm
  featureControlBody: "Siapa menguasai permainan, minit demi minit, dan betapa terbukanya.", // confirm
  featureStoryTitle: "Cerita separuh masa", // confirm
  featureStoryBody: "Ditulis oleh dua ejen AI. Satu menulis, satu menyemak fakta.", // confirm
  storylines: "Jalan cerita",
  storylinesLead: "Perlawanan berskrip, setiap satu dengan cerita berbeza", // confirm
  fullTable: "Jadual penuh",
  footerNote: "Semua data perlawanan adalah sintetik. Dibina untuk hackathon pembangun Microsoft × Premier League “Inside the Game”.", // confirm
  tabOverview: "Gambaran", // confirm
  tabMoments: "Detik", // confirm
  tabStats: "Statistik",
  tabHalfTime: "Cerita separuh masa", // confirm
  matchSections: "Bahagian perlawanan", // confirm
  yourTeam: "Pasukan anda",
  livePitch: "Padang langsung", // confirm
  flowTitle: "Aliran perlawanan", // confirm
  flowLead: "Momentum: siapa yang mengancam, minit demi minit", // confirm
  flowAbove: (team: string) => `Di atas garisan: ${team} menguasai`, // confirm
  flowBelow: (team: string) => `Di bawah: ${team} menguasai`, // confirm
  now: "Kini",
  topStats: "Statistik utama", // confirm
  allStats: "Semua statistik",
  rightNow: "Sekarang",
  controlShare: (team: string, pct: string) => `${team} memiliki ${pct} penguasaan sekarang.`, // confirm
  chaosLevel: (word: string) => `Permainan terbuka: ${word}`, // confirm
  chaosWords: { calm: "tenang", lively: "rancak", wild: "liar" }, // confirm
  newestFirst: "Terkini dahulu", // confirm
  seeAllMoments: "Lihat semua detik", // confirm
  factsChecked: (n: number) => `${n} fakta disemak`, // confirm
  seeProof: "lihat bukti", // confirm
  whyItMatters: "Kenapa ia penting", // confirm
  passing: "Hantaran",
  pressures: "Tekanan",
  positions: { GK: "Penjaga gol", DF: "Pertahanan", MF: "Pemain tengah", FW: "Penyerang" },
  statXg: "Jangkaan gol (xG)", // confirm
  statShots: "Rembatan",
  statOnTarget: "Rembatan tepat", // confirm
  statPossession: "Penguasaan bola",
  statPassAccuracy: "Ketepatan hantaran", // confirm
  statCorners: "Sepakan sudut",
  statFouls: "Kekasaran", // confirm
  statsFromEvents: "Dikira daripada peristiwa perlawanan setakat ini.", // confirm
  factCheck: "Semakan fakta", // confirm
  checkedLong: "Setiap nama dan nombor pada kad ini sepadan dengan fakta di bawah.", // confirm
  chanceOf: (team: string) => `Peluang ${team} menang`,
  before: "Sebelum",
  after: "Selepas",
  eventsBehind: "Peristiwa perlawanan di sebaliknya", // confirm
  agentsLead: "Dua ejen AI menulis cerita ini. Penganalisis menyelidik perlawanan dan membuat draf; penyemak fakta menolak apa-apa yang tidak disokong statistik.", // confirm
  agentsCaught: (n: number) => `${n} dakwaan salah dikesan dan dibetulkan sebelum sesiapa melihatnya.`, // confirm
  agentsClean: "Setiap draf lulus semakan fakta pada kali pertama.", // confirm
  result: "Keputusan",
  watchSecondHalf: "Tonton separuh masa kedua", // confirm
  whyWon: (team: string) => `Kenapa ${team} menang`, // confirm
  whyLevel: "Kenapa perlawanan seri", // confirm
  minutesSplit: "Pembahagian 90 minit", // confirm
  inControl: (team: string) => `${team} menguasai`, // confirm
  balanced: "Seimbang",
  chaosMinutes: "Permainan terbuka", // confirm
  minutesShort: (n: number) => `${n} min`,
  fullTimeStats: "Statistik penuh", // confirm
  replayMatch: "Ulang tayang perlawanan", // confirm
  seeTable: "Lihat jadual musim", // confirm
  winLines: (home: string, away: string) => `Peluang menang: ${home} dan ${away}`, // confirm
  tableNote: "xG = jangkaan gol: kualiti peluang sesebuah pasukan, dijumlahkan. BG = beza gol.", // confirm
  position: "Kedudukan",
  points: "Mata",
  record: "M-S-K",
  xgFor: "Peluang dicipta (xG)", // confirm
  xgAgainst: "Peluang diberi (xG lawan)", // confirm
  ordinal: (n: number) => `ke-${n}`,
  insight: {
    goal: "Gol",
    red_card: "Kad merah",
    big_chance: "Peluang keemasan", // confirm
    shot_speed: "Rembatan",
    pass_of_the_moment: "Hantaran",
    momentum_flip: "Momentum",
    control_shift: "Penguasaan", // confirm
    chaos_phase: "Permainan terbuka", // confirm, DESIGN §8.5 (not "huru-hara")
    pressure_spike: "Tekanan tinggi", // confirm
    win_prob_swing: "Perubahan peluang", // confirm
    tempo_shift: "Rentak",
    player_milestone: "Pencapaian", // confirm
    player_focus: "Pemain",
  },
};

const ES: Labels = {
  ...EN,
  live: "En directo",
  halfTimeLong: "Descanso",
  fullTimeLong: "Final del partido",
  kickOff: "Saque inicial",
  synthetic: "Datos sintéticos",
  pitchNote: "Posiciones ilustrativas · eventos del partido",
  pitchCredit: "Movimiento modelado con datos de seguimiento de la DFL (CC BY 4.0)",
  replay: "Repetición",
  analystView: "Vista de analista · forma del equipo",
  play: "Reproducir",
  pause: "Pausa",
  restart: "Reiniciar desde el saque inicial",
  speedChoice: "Velocidad",
  controls: "Controles del partido",
  following: "Siguiendo",
  casual: "Aficionado",
  analyst: "Analista",
  chanceToWin: "Probabilidad de victoria",
  draw: "Empate",
  factsUsed: "Datos utilizados",
  evidence: "Pruebas",
  checked: "Comprobado por el validador",
  checkedShort: "Comprobado",
  templateSource: "Escrito con plantillas, comprobado por el validador",
  llmSource: "Escrito por los agentes, comprobado por el validador",
  yourPlayer: "Tu jugador",
  goal: "Gol",
  goalAgainst: "Gol en contra",
  keyMoments: "Momentos clave",
  turningPoints: "Puntos de inflexión",
  whatHappened: "Qué ha pasado",
  why: "Por qué",
  whatToWatch: "Qué vigilar",
  playerOfMatch: "Jugador del partido",
  agentsAtWork: "Los agentes en acción",
  showAgents: "Ver cómo lo escribieron los agentes", // confirm
  hideAgents: "Ocultar los agentes", // confirm
  agentAnalyst: "Analista",
  agentFactChecker: "Verificador",
  agentPipeline: "Sistema",
  actionTool: "Herramienta",
  actionDraft: "Borrador",
  actionAccept: "Aceptado",
  actionReject: "Rechazado",
  actionRetry: "Reintento",
  actionSkip: "Omitido",
  actionFallback: "Alternativa",
  loading: "Cargando el partido",
  reconnecting: "Reconectando",
  offline: "Sin conexión · partido guardado",
  preview: "Vista previa · partido sintético",
  close: "Cerrar",
  goals: "Goles",
  shots: "Tiros",
  xg: "xG (goles esperados)",
  passAccuracy: "Precisión de pase",
  touches: "Toques",
  ballWins: "Recuperaciones",
  involvement: "Toques cada 15 minutos",
  momentum: "Dominio",
  emptyMoment: "Los momentos clave aparecerán aquí",
  changeLanguage: "Cambiar idioma",
  changeDepth: "Cambiar nivel: casual o analista",
  viewsLabel: "Vista",
  viewMatches: "Partidos",
  viewLive: "En vivo",
  viewTable: "Tabla",
  pickMatch: "Elige un partido",
  scriptedStoryline: "Historia guionada",
  moreMatches: "Más partidos",
  loadingMatches: "Cargando más partidos…",
  needsServer: "Necesita el servidor en vivo",
  nowShowing: "En pantalla",
  versus: "v",
  comebackTitle: "La remontada",
  comebackBlurb: "Dos goles abajo antes del descanso, y el local le da la vuelta.",
  seasonTable: "Tabla de la temporada",
  seasonStorylines: "Historias de la temporada",
  seasonPlayed: (n: number) => `${n} partidos jugados`,
  club: "Club",
  tableHead: { p: "PJ", w: "G", d: "E", l: "P", gd: "DG", xg: "xG", pts: "Pts" },
  tableLong: { p: "Jugados", w: "Ganados", d: "Empatados", l: "Perdidos", gd: "Diferencia de goles", xg: "Goles esperados a favor", pts: "Puntos" },
  languageMenu: "Idioma",
  catchUp: "¿Acabas de llegar? Ponme al día",
  catchUpTitle: "Lo que llevamos",
  catchUpEmpty: "Todavía no ha pasado nada importante.",
  heroTitle: "Explica el partido, no solo el marcador.",
  heroLead: "Elige un partido y míralo en directo. Las tarjetas te explican por qué importa cada momento, y cada número muestra su prueba.",
  watchMatch: (title: string) => `Ver ${title}`,
  howItWorks: "Cómo funciona",
  continueWatching: "Seguir viendo",
  watch: "Ver",
  featureMomentsTitle: "Momentos en directo",
  featureMomentsBody: "Una tarjeta por cada momento importante, y por qué importa.",
  featureControlTitle: "Control o ida y vuelta",
  featureControlBody: "Quién manda en el partido, minuto a minuto, y cuánto se ha desatado.",
  featureStoryTitle: "La historia del descanso",
  featureStoryBody: "La escriben dos agentes de IA: uno escribe y otro verifica.",
  storylines: "Historias",
  storylinesLead: "Partidos guionados, cada uno con una historia distinta",
  fullTable: "Tabla completa",
  footerNote: "Todos los datos del partido son sintéticos. Hecho para el hackathon de desarrolladores Microsoft × Premier League “Inside the Game”.",
  tabOverview: "Resumen",
  tabMoments: "Momentos",
  tabStats: "Estadísticas",
  tabHalfTime: "Historia del descanso",
  matchSections: "Secciones del partido",
  yourTeam: "Tu equipo",
  livePitch: "Campo en directo",
  flowTitle: "Cómo ha ido el partido",
  flowLead: "Dominio: quién amenaza, minuto a minuto",
  flowAbove: (team: string) => `Por encima: domina ${team}`,
  flowBelow: (team: string) => `Por debajo: domina ${team}`,
  now: "Ahora",
  topStats: "Estadísticas clave",
  allStats: "Todas las estadísticas",
  rightNow: "Ahora mismo",
  controlShare: (team: string, pct: string) => `${team} tiene el ${pct} del control ahora mismo.`,
  chaosLevel: (word: string) => `Ida y vuelta: ${word}`,
  chaosWords: { calm: "baja", lively: "media", wild: "alta" }, // confirm
  newestFirst: "Más recientes primero",
  seeAllMoments: "Ver todos los momentos",
  factsChecked: (n: number) => (n === 1 ? "1 dato comprobado" : `${n} datos comprobados`),
  seeProof: "ver la prueba",
  whyItMatters: "Por qué importa",
  passing: "Pases",
  pressures: "Presiones",
  positions: { GK: "Portero", DF: "Defensa", MF: "Centrocampista", FW: "Delantero" },
  statXg: "Goles esperados (xG)",
  statShots: "Tiros",
  statOnTarget: "Tiros a puerta",
  statPossession: "Posesión",
  statPassAccuracy: "Precisión de pase",
  statCorners: "Córneres",
  statFouls: "Faltas",
  statsFromEvents: "Calculado con los eventos del partido hasta ahora.",
  factCheck: "Verificación",
  checkedLong: "Cada nombre y cifra de esta tarjeta coincide con los datos de abajo.",
  chanceOf: (team: string) => `Probabilidad de victoria de ${team}`,
  before: "Antes",
  after: "Después",
  eventsBehind: "Eventos del partido que lo respaldan",
  agentsLead: "Dos agentes de IA escribieron esta historia. El analista estudia el partido y redacta; el verificador devuelve todo lo que los datos no respaldan.",
  agentsCaught: (n: number) =>
    n === 1 ? "1 afirmación errónea detectada y corregida antes de que nadie la viera." : `${n} afirmaciones erróneas detectadas y corregidas antes de que nadie las viera.`,
  agentsClean: "Todos los borradores pasaron la verificación a la primera.",
  result: "Resultado",
  watchSecondHalf: "Ver la segunda parte",
  whyWon: (team: string) => `Por qué ganó ${team}`,
  whyLevel: "Por qué acabó en empate",
  minutesSplit: "Cómo se repartieron los 90 minutos",
  inControl: (team: string) => `${team} al mando`,
  balanced: "Equilibrado",
  chaosMinutes: "Ida y vuelta",
  minutesShort: (n: number) => `${n} min`,
  fullTimeStats: "Estadísticas finales",
  replayMatch: "Repetir el partido",
  seeTable: "Ver la tabla de la temporada",
  winLines: (home: string, away: string) => `Probabilidad de victoria: ${home} y ${away}`,
  tableNote: "xG = goles esperados: la calidad de las ocasiones de un equipo, sumada. DG = diferencia de goles.",
  position: "Posición",
  points: "Puntos",
  record: "G-E-P",
  xgFor: "Ocasiones creadas (xG)",
  xgAgainst: "Ocasiones concedidas (xG en contra)",
  ordinal: (n: number) => `${n}.º`,
  insight: {
    goal: "Gol",
    red_card: "Tarjeta roja",
    big_chance: "Ocasión clara",
    shot_speed: "Disparo",
    pass_of_the_moment: "Pase",
    momentum_flip: "Dominio",
    control_shift: "Control",
    chaos_phase: "Ida y vuelta",
    pressure_spike: "Presión alta",
    win_prob_swing: "Vuelco",
    tempo_shift: "Ritmo",
    player_milestone: "Hito",
    player_focus: "Jugador",
  },
};

export const LABELS: Record<Language, Labels> = { en: EN, ms: MS, es: ES };

export function personaLabel(labels: Labels, persona: Persona): string {
  return persona === "analyst" ? labels.analyst : labels.casual;
}

const LabelsContext = createContext<Labels>(EN);

export function LabelsProvider({ language, children }: { language: Language; children: ReactNode }) {
  return <LabelsContext.Provider value={LABELS[language]}>{children}</LabelsContext.Provider>;
}

export function useLabels(): Labels {
  return useContext(LabelsContext);
}
