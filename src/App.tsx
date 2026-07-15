import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Maximize2,
  Minus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Trash2,
  X,
} from "lucide-react";

type Entry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: Entry[];
};

type OpenDocument = {
  path: string;
  name: string;
  content: string;
  kind: "markdown" | "html";
};

type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

type Preferences = {
  theme: Theme;
  sidebarOpacity: number;
  readingWidth: number;
  fontScale: number;
  rememberTabs: boolean;
};

const appWindow = getCurrentWindow();
const allowedExtensions = ["md", "markdown", "html", "htm"];
const defaultPreferences: Preferences = {
  theme: "system",
  sidebarOpacity: 84,
  readingWidth: 880,
  fontScale: 100,
  rememberTabs: true,
};

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function extension(path: string) {
  return path.split(".").at(-1)?.toLowerCase() ?? "";
}

function isSupported(path: string) {
  return allowedExtensions.includes(extension(path));
}

function documentIcon(path: string, size = 15) {
  return extension(path).startsWith("htm")
    ? <FileCode2 size={size} className="icon-html" aria-hidden="true" />
    : <FileText size={size} className="icon-markdown" aria-hidden="true" />;
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function TreeNode({ entry, activePath, onOpen, onRemove, root = false }: {
  entry: Entry;
  activePath?: string;
  onOpen: (path: string) => void;
  onRemove?: (path: string) => void;
  root?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const isDirectory = entry.kind === "directory";

  return (
    <div className={`tree-node ${root ? "tree-root" : ""}`}>
      <div className={`tree-row-wrap ${activePath === entry.path ? "active" : ""}`}>
        <button
          className="tree-row"
          onClick={() => (isDirectory ? setExpanded((value) => !value) : onOpen(entry.path))}
          title={entry.path}
          aria-expanded={isDirectory ? expanded : undefined}
        >
          <span className="tree-chevron">
            {isDirectory ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
          </span>
          {isDirectory
            ? expanded ? <FolderOpen size={16} className="icon-folder" /> : <Folder size={16} className="icon-folder" />
            : documentIcon(entry.path)}
          <span className="tree-label">{entry.name}</span>
        </button>
        {root && onRemove ? (
          <button className="tree-remove" onClick={() => onRemove(entry.path)} title="Remove from library" aria-label={`Remove ${entry.name} from library`}>
            <X size={13} />
          </button>
        ) : null}
      </div>
      {isDirectory && expanded && entry.children?.length ? (
        <div className="tree-children">
          {entry.children.map((child) => (
            <TreeNode key={child.path} entry={child} activePath={activePath} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function App() {
  const [roots, setRoots] = useState<Entry[]>([]);
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(() => readStored("vellum.sidebarOpen", true));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>(() => readStored("vellum.recents", []));
  const [preferences, setPreferences] = useState<Preferences>(() => ({ ...defaultPreferences, ...readStored("vellum.preferences", defaultPreferences) }));
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [error, setError] = useState<string>();

  const activeDocument = documents.find((document) => document.path === activePath);
  const htmlMode = activeDocument?.kind === "html";

  const openDocument = useCallback(async (path: string, addToRecent = true) => {
    if (!isSupported(path)) return;
    try {
      setError(undefined);
      const content = await invoke<string>("read_document", { path });
      const nextDocument: OpenDocument = {
        path,
        name: basename(path),
        content,
        kind: extension(path).startsWith("htm") ? "html" : "markdown",
      };
      setDocuments((current) => current.some((item) => item.path === path)
        ? current.map((item) => item.path === path ? nextDocument : item)
        : [...current, nextDocument]);
      setActivePath(path);
      if (addToRecent) {
        setRecentPaths((current) => [path, ...current.filter((item) => item !== path)].slice(0, 8));
      }
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  const choosePath = useCallback(async () => {
    const selected = await open({ multiple: false, directory: false, filters: [{ name: "Documents", extensions: allowedExtensions }] });
    if (typeof selected !== "string") return;
    try {
      const entry = await invoke<Entry>("scan_path", { path: selected });
      setRoots((current) => current.some((item) => item.path === entry.path) ? current : [...current, entry]);
      await openDocument(entry.path);
    } catch (cause) {
      setError(String(cause));
    }
  }, [openDocument]);

  const chooseFolder = useCallback(async () => {
    const selected = await open({ multiple: false, directory: true });
    if (typeof selected !== "string") return;
    try {
      const entry = await invoke<Entry>("scan_path", { path: selected });
      setRoots((current) => current.some((item) => item.path === entry.path) ? current : [...current, entry]);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  const closeDocument = useCallback((path: string) => {
    setDocuments((current) => {
      const index = current.findIndex((item) => item.path === path);
      const next = current.filter((item) => item.path !== path);
      setActivePath((currentActive) => currentActive === path ? next[Math.max(0, index - 1)]?.path : currentActive);
      return next;
    });
  }, []);

  useEffect(() => {
    const savedRoots = readStored<string[]>("vellum.library", []);
    void Promise.all(savedRoots.map(async (path) => {
      try { return await invoke<Entry>("scan_path", { path }); } catch { return undefined; }
    })).then((entries) => setRoots(entries.filter((entry): entry is Entry => Boolean(entry))));

    if (preferences.rememberTabs) {
      const savedTabs = readStored<string[]>("vellum.tabs", []);
      const savedActive = readStored<string | undefined>("vellum.activeTab", undefined);
      void Promise.all(savedTabs.map((path) => openDocument(path, false))).then(() => {
        if (savedActive && savedTabs.includes(savedActive)) setActivePath(savedActive);
      });
    }
  }, [openDocument, preferences.rememberTabs]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved: ResolvedTheme = preferences.theme === "system" ? (media.matches ? "dark" : "light") : preferences.theme;
      setResolvedTheme(resolved);
      document.documentElement.dataset.theme = resolved;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [preferences.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-opacity", String(preferences.sidebarOpacity / 100));
    document.documentElement.style.setProperty("--reading-width", `${preferences.readingWidth}px`);
    document.documentElement.style.setProperty("--font-scale", String(preferences.fontScale / 100));
    localStorage.setItem("vellum.preferences", JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => localStorage.setItem("vellum.library", JSON.stringify(roots.map((entry) => entry.path))), [roots]);
  useEffect(() => localStorage.setItem("vellum.recents", JSON.stringify(recentPaths)), [recentPaths]);
  useEffect(() => localStorage.setItem("vellum.sidebarOpen", JSON.stringify(sidebarOpen)), [sidebarOpen]);
  useEffect(() => {
    if (preferences.rememberTabs) {
      localStorage.setItem("vellum.tabs", JSON.stringify(documents.map((document) => document.path)));
      localStorage.setItem("vellum.activeTab", JSON.stringify(activePath));
    } else {
      localStorage.removeItem("vellum.tabs");
      localStorage.removeItem("vellum.activeTab");
    }
  }, [documents, activePath, preferences.rememberTabs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (event.key === "Escape" && settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (!modifier) return;
      const key = event.key.toLowerCase();
      if (key === "o") {
        event.preventDefault();
        void (event.shiftKey ? chooseFolder() : choosePath());
      } else if (key === "b") {
        event.preventDefault();
        setSidebarOpen((value) => !value);
      } else if (key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (key === "r" && activeDocument) {
        event.preventDefault();
        void openDocument(activeDocument.path, false);
      } else if (key === "w" && activePath) {
        event.preventDefault();
        closeDocument(activePath);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeDocument, activePath, chooseFolder, choosePath, closeDocument, openDocument, settingsOpen]);

  const renderedMarkdown = useMemo(() => {
    if (!activeDocument || activeDocument.kind !== "markdown") return "";
    return DOMPurify.sanitize(marked.parse(activeDocument.content, { async: false }) as string);
  }, [activeDocument]);

  function removeRoot(path: string) {
    setRoots((current) => current.filter((entry) => entry.path !== path));
  }

  function toggleTheme() {
    setPreferences((current) => ({ ...current, theme: resolvedTheme === "dark" ? "light" : "dark" }));
  }

  return (
    <main className={`app-shell ${htmlMode ? "html-mode" : ""}`}>
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className="brand-mark" aria-hidden="true">V</span>
          <span>Vellum</span>
        </div>
        <div className="window-controls">
          <button onClick={() => appWindow.minimize()} aria-label="Minimize"><Minus size={14} /></button>
          <button onClick={() => appWindow.toggleMaximize()} aria-label="Maximize"><Maximize2 size={13} /></button>
          <button className="close" onClick={() => appWindow.close()} aria-label="Close"><X size={15} /></button>
        </div>
      </header>

      <section className={`workspace ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <aside className="sidebar" aria-label="Document library" aria-hidden={!sidebarOpen}>
          <div className="sidebar-top">
            <div className="sidebar-heading">
              <span>Library</span>
              <div className="sidebar-actions">
                <button onClick={choosePath} title="Save a file" aria-label="Add file"><Plus size={15} /></button>
                <button onClick={chooseFolder} title="Save a folder" aria-label="Add folder"><FolderPlus size={15} /></button>
              </div>
            </div>

            {recentPaths.length ? (
              <section className="sidebar-section recent-section">
                <div className="section-label"><Clock3 size={12} /> Recent</div>
                <div className="recent-list">
                  {recentPaths.map((path) => (
                    <button key={path} className={`recent-item ${activePath === path ? "active" : ""}`} onClick={() => openDocument(path)} title={path}>
                      {documentIcon(path, 14)}
                      <span>{basename(path)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <section className="sidebar-section library-section">
            <div className="section-label"><Folder size={12} /> Saved</div>
            <div className="tree">
              {roots.length ? roots.map((entry) => (
                <TreeNode key={entry.path} entry={entry} activePath={activePath} onOpen={openDocument} onRemove={removeRoot} root />
              )) : (
                <div className="empty-sidebar">
                  <p>Save files or folders here for quick access.</p>
                  <button onClick={chooseFolder}>Add folder</button>
                </div>
              )}
            </div>
          </section>

          <div className="sidebar-footer">
            <span>Markdown · HTML</span>
            <button onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Open settings"><Settings size={15} /></button>
          </div>
        </aside>

        <section className="main-pane">
          <div className="toolbar">
            <button onClick={() => setSidebarOpen((value) => !value)} title="Toggle sidebar (Ctrl+B)" aria-label="Toggle sidebar">
              {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>
            <div className="tabs" role="tablist" aria-label="Open documents">
              {documents.map((document) => (
                <button key={document.path} role="tab" aria-selected={activePath === document.path} className={`tab ${activePath === document.path ? "active" : ""}`} onClick={() => setActivePath(document.path)} title={document.path}>
                  {documentIcon(document.path, 14)}
                  <span>{document.name}</span>
                  <X size={13} className="tab-close" aria-label={`Close ${document.name}`} onClick={(event) => { event.stopPropagation(); closeDocument(document.path); }} />
                </button>
              ))}
            </div>
            <div className="toolbar-actions">
              {activeDocument ? <button onClick={() => openDocument(activeDocument.path, false)} title="Reload (Ctrl+R)" aria-label="Reload document"><RefreshCw size={16} /></button> : null}
              <button onClick={toggleTheme} title="Toggle theme" aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}>
                {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button onClick={() => setSettingsOpen(true)} title="Settings (Ctrl+,)" aria-label="Open settings"><Settings size={16} /></button>
            </div>
          </div>

          <div className="content-area">
            {error ? <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError(undefined)} aria-label="Dismiss error"><X size={14} /></button></div> : null}
            {!activeDocument ? (
              <div className="welcome">
                <span className="welcome-mark" aria-hidden="true">V</span>
                <h1>Vellum</h1>
                <p>A quiet place for rendered documents.</p>
                <div className="welcome-actions">
                  <button onClick={choosePath}>Open file</button>
                  <button className="secondary" onClick={chooseFolder}>Open folder</button>
                </div>
                <div className="welcome-shortcuts"><kbd>Ctrl O</kbd> file <span>·</span> <kbd>Ctrl Shift O</kbd> folder <span>·</span> <kbd>Ctrl B</kbd> sidebar</div>
              </div>
            ) : activeDocument.kind === "markdown" ? (
              <article className="document markdown-body" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
            ) : (
              <iframe
                className="html-frame"
                title={activeDocument.name}
                srcDoc={activeDocument.content}
                sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
              />
            )}
          </div>
        </section>
      </section>

      {settingsOpen ? (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span className="eyebrow">Vellum</span><h2 id="settings-title">Settings</h2></div>
              <button onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={17} /></button>
            </header>
            <div className="setting-row">
              <div><strong>Appearance</strong><span>Choose how the application chrome is rendered.</span></div>
              <select value={preferences.theme} onChange={(event) => setPreferences((current) => ({ ...current, theme: event.target.value as Theme }))}>
                <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>
            </div>
            <div className="setting-row range-row">
              <div><strong>Sidebar transparency</strong><span>Adjust the translucency of the saved workspace.</span></div>
              <label><input aria-label="Sidebar transparency" type="range" min="65" max="100" value={preferences.sidebarOpacity} onChange={(event) => setPreferences((current) => ({ ...current, sidebarOpacity: Number(event.target.value) }))} /><span>{preferences.sidebarOpacity}%</span></label>
            </div>
            <div className="setting-row range-row">
              <div><strong>Reading width</strong><span>Set the maximum width of rendered Markdown.</span></div>
              <label><input aria-label="Markdown reading width" type="range" min="680" max="1180" step="20" value={preferences.readingWidth} onChange={(event) => setPreferences((current) => ({ ...current, readingWidth: Number(event.target.value) }))} /><span>{preferences.readingWidth}px</span></label>
            </div>
            <div className="setting-row range-row">
              <div><strong>Text scale</strong><span>Scale rendered document typography.</span></div>
              <label><input aria-label="Markdown text scale" type="range" min="85" max="125" step="5" value={preferences.fontScale} onChange={(event) => setPreferences((current) => ({ ...current, fontScale: Number(event.target.value) }))} /><span>{preferences.fontScale}%</span></label>
            </div>
            <div className="setting-row">
              <div><strong>Restore session</strong><span>Reopen document tabs from the previous session.</span></div>
              <label className="switch"><input type="checkbox" checked={preferences.rememberTabs} onChange={(event) => setPreferences((current) => ({ ...current, rememberTabs: event.target.checked }))} /><span aria-hidden="true" /></label>
            </div>
            <div className="setting-row">
              <div><strong>Recent history</strong><span>Clear the list without removing saved library items.</span></div>
              <button className="danger-button" onClick={() => setRecentPaths([])}><Trash2 size={14} /> Clear</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;
