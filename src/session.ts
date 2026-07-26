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

export function contentTitle(content: string, fallback: string) {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim();
  const clipped = firstLine?.slice(0, 48).replace(/\s+\S*$/, "");
  return firstLine && firstLine.length > 48 ? `${clipped || firstLine.slice(0, 48)}…` : firstLine || fallback;
}

export function noteTitle(note: Note) {
  return contentTitle(note.content, note.fallbackTitle);
}

export function sortNotes(notes: Note[]) {
  return [...notes].sort((a, b) =>
    b.updatedAt - a.updatedAt ||
    a.fallbackTitle.localeCompare(b.fallbackTitle, undefined, { numeric: true }) ||
    a.id.localeCompare(b.id)
  );
}

export function reorderItems(items: string[], source: string, target: string) {
  const from = items.indexOf(source);
  const to = items.indexOf(target);
  if (from < 0 || to < 0 || from === to) return items;
  const reordered = [...items];
  reordered.splice(to, 0, reordered.splice(from, 1)[0]);
  return reordered;
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
