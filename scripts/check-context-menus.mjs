import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/contextMenu.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const menus = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const rows = (target) => menus.contextMenuSections(target).flatMap((section) => section.actions);

assert.deepEqual(rows({ kind: "empty" }), [
  "open-file", "open-folder", "new-note", "new-markdown", "new-html", "new-text",
  "toggle-sidebar", "toggle-theme", "settings",
]);
assert.deepEqual(rows({ kind: "sidebar-entry", entryKind: "file", root: true, expanded: false }), [
  "open-target", "reveal-target", "toggle-pin", "remove-sidebar",
]);
assert.deepEqual(rows({ kind: "sidebar-entry", entryKind: "directory", root: false, expanded: true }), [
  "toggle-folder", "reveal-target", "toggle-pin",
]);
assert.deepEqual(rows({ kind: "sidebar-progress", saved: true }), ["open-target", "reveal-target", "toggle-pin"]);
assert.deepEqual(rows({ kind: "sidebar-progress", saved: false }), ["open-target", "toggle-pin"]);
assert.deepEqual(rows({ kind: "sidebar-note" }), ["open-note", "toggle-note-pin", "delete-note"]);
assert.deepEqual(rows({
  kind: "editor",
  documentKind: "markdown",
  saved: true,
  dirty: true,
  selection: true,
  canUndo: true,
  canRedo: false,
}), ["undo", "cut", "copy-editor", "select-all", "find", "save", "save-as", "view-document", "reveal-target", "close"]);
assert.deepEqual(rows({
  kind: "editor",
  documentKind: "text",
  saved: false,
  dirty: false,
  selection: false,
  canUndo: false,
  canRedo: true,
}), ["redo", "select-all", "find", "save-as", "close"]);
assert.deepEqual(rows({
  kind: "editor",
  saved: false,
  dirty: false,
  selection: false,
  canUndo: false,
  canRedo: false,
}), ["select-all", "find", "close"]);
assert.deepEqual(rows({ kind: "viewer", saved: true, selection: true }), [
  "copy-viewer", "reload", "edit-source", "reveal-target", "close",
]);
assert.deepEqual(rows({ kind: "viewer", saved: false, selection: false }), ["edit-source", "close"]);

console.log("Context menu behavior passed.");
