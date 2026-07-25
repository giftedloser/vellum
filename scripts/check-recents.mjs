import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/recent.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const recent = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const history = Array.from({ length: 31 }, (_, index) => ({ path: `${index}.md`, lastOpened: 31 - index }));
const reopened = recent.touchRecent(history, "10.md", 100);

assert.equal(reopened.length, 31);
assert.deepEqual(reopened[0], { path: "10.md", lastOpened: 100 });
assert.equal(recent.visibleRecents(reopened, false).length, 30);
assert.equal(recent.visibleRecents(reopened, true).length, 31);
assert.equal(recent.sidebarLabel("notes.v2.markdown", true), "notes.v2");
assert.equal(recent.sidebarLabel("notes.v2.txt", true), "notes.v2");
assert.equal(recent.sidebarLabel("docs.v2", false), "docs.v2");
assert.equal(recent.documentKind(String.raw`\\?\C:\Users\Marshall\mixed\README.md`), "markdown");
assert.equal(recent.documentKind(String.raw`\\?\C:\Users\Marshall\mixed\page.html`), "html");
assert.equal(recent.documentKind(String.raw`\\?\C:\Users\Marshall\mixed\notes.TXT`), "text");

// The stored list is capped so it cannot grow without bound.
const overflowing = Array.from({ length: recent.maxRecentCount + 40 }, (_, index) => ({ path: `old-${index}.md`, lastOpened: index }));
const capped = recent.touchRecent(overflowing, "fresh.md", 999);
assert.equal(capped.length, recent.maxRecentCount);
assert.deepEqual(capped[0], { path: "fresh.md", lastOpened: 999 });
assert.equal(capped.at(-1).path, `old-${recent.maxRecentCount - 2}.md`);

console.log("Recent history behavior passed.");
