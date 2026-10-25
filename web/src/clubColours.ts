// Colours for the eight fictional clubs in sim/teams.py. The contract has no club colours, so
// they live here, on the web side. Rules (DESIGN §9.2, checked by `npm run check:tokens`):
// - primary: fills and bars, at least 3:1 on white
// - glow: soft gradients only, never text
// - text: team-coloured words, at least 4.5:1 on white and on the grey ground
// - every other club is at least ΔE2000 20 from Northgate Blue, Vale Claret and Live red
// NGC and KST are locked (25 Oct) and must match the defaults in theme.css.

import type { CSSProperties } from "react";

export interface ClubColours {
  name: string;
  colourName: string;
  primary: string;
  glow: string;
  text: string;
}

export const CLUB_COLOURS = {
  NGC: { name: "Northgate City", colourName: "Northgate Blue", primary: "#1D4ED8", glow: "#3B82F6", text: "#1D4ED8" },
  KST: { name: "Kingston Vale", colourName: "Vale Claret", primary: "#8B1E3F", glow: "#C2415E", text: "#8B1E3F" },
  RIV: { name: "Riverside Rovers", colourName: "River Teal", primary: "#0F766E", glow: "#2DD4BF", text: "#0F766E" },
  HAR: { name: "Harbour Athletic", colourName: "Harbour Gold", primary: "#A16207", glow: "#FBBF24", text: "#854D0E" },
  ELM: { name: "Elmstead United", colourName: "Elm Green", primary: "#166534", glow: "#4ADE80", text: "#166534" },
  MIL: { name: "Millbrook Town", colourName: "Mill Black", primary: "#1C1917", glow: "#78716C", text: "#1C1917" },
  ASH: { name: "Ashford Albion", colourName: "Albion Magenta", primary: "#A21CAF", glow: "#E879F9", text: "#A21CAF" },
  QNB: { name: "Queensbridge FC", colourName: "Bridge Olive", primary: "#4D7C0F", glow: "#A3E635", text: "#3F6212" },
} as const satisfies Record<string, ClubColours>;

export type ClubId = keyof typeof CLUB_COLOURS;

// Neutral fallback for an unknown team id, so a new club never breaks the page.
const UNKNOWN: ClubColours = { name: "", colourName: "Grey", primary: "#6E6E73", glow: "#AEAEB2", text: "#6E6E73" };

export function clubColours(teamId: string): ClubColours {
  return (CLUB_COLOURS as Record<string, ClubColours>)[teamId] ?? UNKNOWN;
}

// Inline style that fills theme.css's club slots: <main style={clubSlots("NGC", "KST", "NGC")}>.
export function clubSlots(homeId: string, awayId: string, youId: string = homeId): CSSProperties {
  const slots: Record<string, string> = {};
  for (const [slot, id] of [["home", homeId], ["away", awayId], ["you", youId]] as const) {
    const c = clubColours(id);
    slots[`--${slot}-primary`] = c.primary;
    slots[`--${slot}-glow`] = c.glow;
    slots[`--${slot}-text`] = c.text;
  }
  return slots as CSSProperties;
}
