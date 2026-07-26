export type RecentItem = { path: string; modifiedMs: number };
export type DocumentKind = "markdown" | "html" | "text";

export const collapsedRecentCount = 30;
/* How many entries are kept on disk, as opposed to how many are shown
   before the More button. Without a cap the stored list grew forever. */
export const maxRecentCount = 300;

export function documentKind(path: string): DocumentKind {
  if (/\.html?$/i.test(path)) return "html";
  return /\.txt$/i.test(path) ? "text" : "markdown";
}

export function touchRecent(items: RecentItem[], path: string, modifiedMs: number) {
  return [{ path, modifiedMs }, ...items.filter((item) => item.path !== path)].slice(0, maxRecentCount);
}

export function visibleRecents<T>(items: T[], expanded: boolean) {
  return expanded ? items : items.slice(0, collapsedRecentCount);
}

export function withoutContainedFiles<T extends { kind: "file" | "directory"; path: string }>(items: T[]) {
  const folders = items.filter((item) => item.kind === "directory").map((item) => item.path);
  return items.filter((item) => item.kind === "directory" || !folders.some((folder) =>
    item.path.startsWith(`${folder}\\`) || item.path.startsWith(`${folder}/`)));
}

export function sidebarLabel(name: string, file: boolean) {
  if (!file) return name;
  return name.replace(/\.(?:md|markdown|html|htm|txt)$/i, "") || name;
}
