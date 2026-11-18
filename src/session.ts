export type Workspace = "documents" | "notes";
export type DocumentKind = "markdown" | "html" | "text";

export type Note = {
  id: string;
  fallbackTitle: string;
  title?: string;
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
  title?: string;
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
  let start = 0;
  while (start < content.length) {
    const end = content.indexOf("\n", start);
    const line = content.slice(start, end === -1 ? undefined : end).trim();
    if (line) {
      if (line.length <= 48) return line;
      const prefix = line.slice(0, 48);
      return `${prefix.replace(/\s+\S*$/, "") || prefix}…`;
    }
    if (end === -1) break;
    start = end + 1;
  }
  return fallback;
}

export function noteTitle(note: Note) {
  return note.title || contentTitle(note.content, note.fallbackTitle);
}

export function sortNotes(notes: Note[]) {
  return [...notes].sort((a, b) =>
    b.updatedAt - a.updatedAt ||
    a.fallbackTitle.localeCompare(b.fallbackTitle, undefined, { numeric: true }) ||
    a.id.localeCompare(b.id)
  );
}

export function reorderItems(items: string[], source: string, target: string, after = false) {
  const from = items.indexOf(source);
  if (from < 0 || !items.includes(target) || source === target) return items;
  const reordered = [...items];
  reordered.splice(from, 1);
  reordered.splice(reordered.indexOf(target) + Number(after), 0, source);
  return reordered;
}

export function updateDocumentRecovery(
  documents: DocumentRecovery[],
  path: string,
  content: string,
  baseModifiedMs: number,
  baselineContent: string,
  now = Date.now(),
  details: Pick<DocumentRecovery, "kind" | "name" | "title" | "draft"> = {},
) {
  if (content === baselineContent && !details.draft) return documents.filter((document) => document.path !== path);
  const recovery = { path, content, baseModifiedMs, updatedAt: now, ...details };
  return documents.some((document) => document.path === path)
    ? documents.map((document) => document.path === path ? recovery : document)
    : [recovery, ...documents];
}
