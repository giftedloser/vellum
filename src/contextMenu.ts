import type { DocumentKind } from "./recent";

export type ContextMenuAction =
  | "open-file"
  | "open-folder"
  | "new-markdown"
  | "new-html"
  | "new-text"
  | "open-target"
  | "toggle-folder"
  | "reveal-target"
  | "toggle-pin"
  | "remove-sidebar"
  | "open-note"
  | "toggle-note-pin"
  | "rename"
  | "delete-note"
  | "undo"
  | "redo"
  | "cut"
  | "copy-editor"
  | "select-all"
  | "find"
  | "save"
  | "save-as"
  | "view-document"
  | "copy-viewer"
  | "reload"
  | "edit-source"
  | "close"
  | "toggle-sidebar"
  | "toggle-theme"
  | "settings";

export type ContextMenuTarget =
  | { kind: "empty" }
  | { kind: "sidebar-entry"; entryKind: "file" | "directory"; root: boolean; expanded: boolean }
  | { kind: "sidebar-progress"; saved: boolean }
  | { kind: "sidebar-note" }
  | {
      kind: "editor";
      documentKind?: DocumentKind;
      saved: boolean;
      dirty: boolean;
      selection: boolean;
      canUndo: boolean;
      canRedo: boolean;
    }
  | { kind: "viewer"; saved: boolean; selection: boolean };

export type ContextMenuSection = {
  label?: string;
  actions: ContextMenuAction[];
};

export function contextMenuSections(target: ContextMenuTarget): ContextMenuSection[] {
  if (target.kind === "empty") {
    return [
      { label: "Open", actions: ["open-file", "open-folder", "new-markdown", "new-html", "new-text"] },
      { label: "View", actions: ["toggle-sidebar", "toggle-theme"] },
      { actions: ["settings"] },
    ];
  }

  if (target.kind === "sidebar-entry") {
    return [{
      actions: [
        target.entryKind === "directory" ? "toggle-folder" : "open-target",
        "reveal-target",
        "toggle-pin",
        ...(target.root ? ["remove-sidebar" as const] : []),
      ],
    }];
  }

  if (target.kind === "sidebar-progress") {
    return [{
      actions: ["open-target", ...(!target.saved ? ["rename" as const] : []), ...(target.saved ? ["reveal-target" as const] : []), "toggle-pin"],
    }];
  }

  if (target.kind === "sidebar-note") {
    return [{ actions: ["open-note", "rename", "toggle-note-pin", "delete-note"] }];
  }

  if (target.kind === "editor") {
    const editing: ContextMenuAction[] = [
      ...(target.canUndo ? ["undo" as const] : []),
      ...(target.canRedo ? ["redo" as const] : []),
      ...(target.selection ? ["cut" as const, "copy-editor" as const] : []),
      "select-all",
      "find",
    ];
    const document: ContextMenuAction[] = [
      ...(target.documentKind && target.dirty ? ["save" as const] : []),
      ...(target.documentKind ? ["save-as" as const] : []),
      ...(target.documentKind && target.documentKind !== "text" ? ["view-document" as const] : []),
      ...(target.documentKind && target.saved ? ["reveal-target" as const] : []),
      "close",
    ];
    return [{ label: "Edit", actions: editing }, { label: target.documentKind ? "Document" : "Note", actions: document }];
  }

  return [{
    label: "Document",
    actions: [
      ...(target.selection ? ["copy-viewer" as const] : []),
      ...(target.saved ? ["reload" as const] : []),
      "edit-source",
      ...(target.saved ? ["reveal-target" as const] : []),
      "close",
    ],
  }];
}
