export type RecentItem = { path: string; lastOpened: number };

export const collapsedRecentCount = 30;

export function documentKind(path: string): "markdown" | "html" {
  return /\.html?$/i.test(path) ? "html" : "markdown";
}

export function touchRecent(items: RecentItem[], path: string, lastOpened = Date.now()) {
  return [{ path, lastOpened }, ...items.filter((item) => item.path !== path)];
}

export function visibleRecents<T>(items: T[], expanded: boolean) {
  return expanded ? items : items.slice(0, collapsedRecentCount);
}

export function sidebarLabel(name: string, file: boolean) {
  if (!file) return name;
  return name.replace(/\.(?:md|markdown|html|htm)$/i, "") || name;
}
