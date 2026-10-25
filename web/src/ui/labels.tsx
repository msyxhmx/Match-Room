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
  replay: "Replay",
  analystView: "Analyst view · team shape",
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
  speed: (x: number) => `×${x}`,
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
  replay: "Ulang tayang", // confirm
  analystView: "Paparan analisis · bentuk pasukan", // confirm
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
  replay: "Repetición",
  analystView: "Vista de analista · forma del equipo",
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
