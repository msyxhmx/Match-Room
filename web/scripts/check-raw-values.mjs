// Fails if a UI component uses a raw colour or font instead of a token from theme.css
// (DESIGN §9.10: "Components use tokens only"). Run: npm run check:raw
// Scans src/ui/**/*.{css,tsx,ts}, src/screens/ and src/pitch/ (the canvas reads its colours from tokens). Skips theme.css, clubColours.ts, the lab and *.lab.tsx files.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scans = [join(web, "src", "ui"), join(web, "src", "screens"), join(web, "src", "pitch")];

const RULES = [
  [/#[0-9a-fA-F]{3,8}\b(?![-\w])/, "raw hex colour"],
  [/\b(rgba?|hsla?|oklch|lab|lch)\(/, "raw colour function"],
  [/\bfont-(size|family|weight)\s*:/, "raw font property (use font: var(--type-*))"],
  [/\bfont\s*:(?!\s*(var\(--type-|inherit\b))/, "font shorthand not from a --type-* token"],
  [/\b(fontSize|fontFamily|fontWeight)\s*:/, "raw font style in TSX (use a --type-* token)"],
];

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|tsx?)$/.test(name) && !name.endsWith(".lab.tsx")) files.push(p);
  }
};
try {
  for (const scan of scans) walk(scan);
} catch {
  console.log("check:raw: no src/ui yet");
  process.exit(0);
}

let bad = 0;
for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const code = line.replace(/\/\/.*$|\/\*.*?\*\//g, "");
      for (const [re, why] of RULES) {
        if (re.test(code)) {
          bad++;
          console.log(`${relative(web, file)}:${i + 1}  ${why}: ${line.trim()}`);
        }
      }
    });
}
console.log(bad ? `\ncheck:raw: ${bad} raw value(s). Use tokens from src/theme.css.` : `check:raw: ${files.length} files, no raw colours or fonts`);
process.exit(bad ? 1 : 0);
