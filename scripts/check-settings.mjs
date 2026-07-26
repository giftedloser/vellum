import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/settings.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const settings = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

assert.deepEqual(settings.normalizeSegmentedPreferences({
  interfaceScale: 85,
  sidebarOpacity: 70,
  readingWidth: 1020,
  fontScale: 110,
}), {
  interfaceScale: 80,
  sidebarOpacity: 65,
  readingWidth: 880,
  fontScale: 95,
});
assert.equal(settings.stepValue(50, -10, 50, 200), 50);
assert.equal(settings.stepValue(190, 10, 145, 195), 195);
assert.equal(settings.stepValue(22, 1, 11, 22), 22);

console.log("Settings behavior passed.");
