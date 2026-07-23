import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const files = ["index.html", "src/styles.css", "src/refinement.css", "src/final.css", "src/control-system.css", "src/editor.css", "src/App.tsx", "src/SourceEditor.tsx", "src/FileTypeIcon.tsx"];
const allowedChromatic = new Set([
  "#3b82f6", "#e44d26", "#7b5f9e", "#c1a4df", "#4f7556", "#7f1d1d", "#b8463c", "#b83228", "#c43b32",
  "rgba(157,43,34,.18)", "rgba(190,50,40,.08)", "rgba(190,50,40,.35)",
]);
const allowedSyntaxColors = new Set([
  "#d3a36d", "#dda097", "#d0b272", "#9bc39f", "#82b4d0", "#c1a4df",
  "#9c6b38", "#8b4f45", "#8a6b32", "#4f7556", "#3d6f8f", "#7b5f9e",
]);

for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/#[\da-f]{3,8}\b|rgba?\([^)]*\)/gi)) {
    const color = match[0].replace(/\s+/g, "").toLowerCase();
    const linePrefix = source.slice(source.lastIndexOf("\n", match.index) + 1, match.index);
    const syntaxColor = file === "src/SourceEditor.tsx"
      && allowedSyntaxColors.has(color)
      && /^\s*(heading|keyword|attribute|string|link|code):\s*["']?$/.test(linePrefix);
    if (allowedChromatic.has(color) || syntaxColor || color.includes("var(")) continue;
    const channels = color.startsWith("#")
      ? (color.length === 4 ? [...color.slice(1)].map((value) => parseInt(value + value, 16)) : [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)].map((value) => parseInt(value, 16)))
      : color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    assert(channels && Math.max(...channels) === Math.min(...channels), `${file} contains a chromatic theme color: ${match[0]}`);
  }
  for (const match of source.matchAll(/oklch\(\s*[\d.]+\s+([\d.-]+)/gi)) {
    assert.equal(Number(match[1]), 0, `${file} contains a chromatic OKLCH theme color: ${match[0]}`);
  }
}

const texture = await readFile("public/textures/grain.png");
assert.equal(createHash("sha256").update(texture).digest("hex"), "5f370c5d40d477f59965320ba333d50580826056e6837226662a5ab4cccd8a89");
console.log("Neutral theme and original texture checks passed.");
