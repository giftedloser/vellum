export type Workspace = "documents" | "notes";
export type DocumentKind = "markdown" | "html" | "text";

export type Note = {
  id: string;
  fallbackTitle: string;
  content: string;
  updatedAt: number;
};

export type DocumentRecovery = {
  path: string;
  content: string;
  baseModifiedMs: number;
  updatedAt: number;
  kind?: DocumentKind;
  name?: string;
  draft?: boolean;
};

export type ActiveItem =
  | { type: "note"; id: string }
  | { type: "document"; path: string };

export type SessionState = {
  version: 1;
  notes: Note[];
  documents: DocumentRecovery[];
  active: ActiveItem | null;
  workspace: Workspace;
};

export function emptySession(): SessionState {
  return { version: 1, notes: [], documents: [], active: null, workspace: "documents" };
}

export function noteTitle(note: Note) {
  return note.content.split(/\r?\n/).find((line) => line.trim())?.trim() || note.fallbackTitle;
}

export function sortNotes(notes: Note[]) {
  return [...notes].sort((a, b) =>
    b.updatedAt - a.updatedAt ||
    a.fallbackTitle.localeCompare(b.fallbackTitle, undefined, { numeric: true }) ||
    a.id.localeCompare(b.id)
  );
}

export function createNote(notes: Note[], now = Date.now(), id = crypto.randomUUID()): Note {
  const next = Math.max(0, ...notes.map((note) => Number(note.fallbackTitle.match(/^Untitled (\d+)$/)?.[1]) || 0)) + 1;
  return { id, fallbackTitle: `Untitled ${next}`, content: "", updatedAt: now };
}

export function updateDocumentRecovery(
  documents: DocumentRecovery[],
  path: string,
  content: string,
  baseModifiedMs: number,
  baselineContent: string,
  now = Date.now(),
  details: Pick<DocumentRecovery, "kind" | "name" | "draft"> = {},
) {
  if (content === baselineContent && !details.draft) return documents.filter((document) => document.path !== path);
  const recovery = { path, content, baseModifiedMs, updatedAt: now, ...details };
  return documents.some((document) => document.path === path)
    ? documents.map((document) => document.path === path ? recovery : document)
    : [recovery, ...documents];
}
