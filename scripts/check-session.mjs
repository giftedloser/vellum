import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/session.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const session = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const notes = [
  { id: "b", fallbackTitle: "Untitled 2", content: "", updatedAt: 10 },
  { id: "a", fallbackTitle: "Untitled 1", content: "\n  First line  \nSecond", updatedAt: 20 },
];

assert.deepEqual(session.emptySession(), {
  version: 1,
  notes: [],
  documents: [],
  active: null,
  workspace: "documents",
});
assert.equal(session.noteTitle(notes[0]), "Untitled 2");
assert.equal(session.noteTitle(notes[1]), "First line");
assert.deepEqual(session.createNote(notes, 30, "c"), {
  id: "c",
  fallbackTitle: "Untitled 3",
  content: "",
  updatedAt: 30,
});
assert.deepEqual(session.sortNotes(notes).map((note) => note.id), ["a", "b"]);

const recovery = { path: "notes.txt", content: "draft", baseModifiedMs: 10, updatedAt: 20 };
assert.deepEqual(session.updateDocumentRecovery([], "notes.txt", "draft", 10, "saved", 20), [recovery]);
assert.deepEqual(session.updateDocumentRecovery([recovery], "notes.txt", "saved", 10, "saved", 30), []);
const olderRecovery = { path: "older.txt", content: "older", baseModifiedMs: 5, updatedAt: 5 };
assert.deepEqual(
  session.updateDocumentRecovery([recovery, olderRecovery], "older.txt", "edited", 5, "saved", 30).map((item) => item.path),
  ["notes.txt", "older.txt"],
);

const draft = {
  path: "draft://Untitled.md",
  content: "",
  baseModifiedMs: 0,
  updatedAt: 40,
  kind: "markdown",
  name: "Untitled.md",
  draft: true,
};
assert.deepEqual(
  session.updateDocumentRecovery([], draft.path, draft.content, 0, "", 40, {
    kind: "markdown",
    name: draft.name,
    draft: true,
  }),
  [draft],
);

console.log("Session behavior passed.");
