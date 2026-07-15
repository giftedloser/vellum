import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  ChevronDown,
  ChevronRight,
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
  X,
  ZoomIn,
  ZoomOut,
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
  interfaceScale: number;
  viewerZoom: number;
  sidebarOpacity: number;
  readingWidth: number;
  fontScale: number;
  lineHeight: number;
  rememberTabs: boolean;
};

const appWindow = isTauri() ? getCurrentWindow() : undefined;
const allowedExtensions = ["md", "markdown", "html", "htm"];
const defaultPreferences: Preferences = {
  theme: "system",
  interfaceScale: 92,
  viewerZoom: 100,
  sidebarOpacity: 84,
  readingWidth: 880,
  fontScale: 95,
  lineHeight: 170,
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

function prepareHtml(content: string, zoom: number, theme: ResolvedTheme) {
  const thumb = theme === "dark" ? "rgba(220,212,196,.24)" : "rgba(92,78,54,.28)";
  const viewerStyle = `<style data-vellum-viewer>*{scrollbar-width:none}::-webkit-scrollbar{display:none;width:0;height:0}.vellum-scroll-indicator{position:fixed;z-index:2147483647;width:2px;border-radius:999px;background:${thumb};pointer-events:none;opacity:0;transition:opacity 120ms}</style><script data-vellum-viewer>(()=>{const indicator=document.createElement("i");indicator.className="vellum-scroll-indicator";document.documentElement.append(indicator);let timer;addEventListener("scroll",event=>{const target=event.target===document?document.scrollingElement:event.target;if(!target)return;const viewport=target===document.scrollingElement;const rect=viewport?{top:0,right:innerWidth,height:innerHeight}:target.getBoundingClientRect();const height=Math.max(18,rect.height*rect.height/target.scrollHeight);const travel=Math.max(0,rect.height-height);const progress=target.scrollTop/Math.max(1,target.scrollHeight-target.clientHeight);indicator.style.top=(rect.top+travel*progress)+"px";indicator.style.left=(rect.right-2)+"px";indicator.style.height=height+"px";indicator.style.opacity=1;clearTimeout(timer);timer=setTimeout(()=>indicator.style.opacity=0,500)},true)})()</script>`;
  return /<\/head>/i.test(content)
    ? content.replace(/<\/head>/i, `${viewerStyle}</head>`)
    : `${viewerStyle}${content}`;
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
          type="button"
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
          <button type="button" className="tree-remove" onClick={() => onRemove(entry.path)} title="Remove from library" aria-label={`Remove ${entry.name} from library`}>
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
  const [sidebarOpen, setSidebarOpen] = useState(() => readStored("vellum.sidebarOpen:v1", true));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(() => ({ ...defaultPreferences, ...readStored("vellum.preferences:v1", defaultPreferences) }));
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [error, setError] = useState<string>();
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const libraryRestored = useRef(false);

  const activeDocument = documents.find((document) => document.path === activePath);
  const htmlMode = activeDocument?.kind === "html";

  const openDocument = useCallback(async (path: string) => {
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
    const index = documents.findIndex((item) => item.path === path);
    const next = documents.filter((item) => item.path !== path);
    setDocuments(next);
    if (activePath === path) setActivePath(next[Math.max(0, index - 1)]?.path);
  }, [activePath, documents]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const savedRoots = readStored<string[]>("vellum.library:v1", []);
      const entries = await Promise.all(savedRoots.map(async (path) => {
        try { return await invoke<Entry>("scan_path", { path }); } catch { return undefined; }
      }));
      if (cancelled) return;
      setRoots(entries.filter((entry): entry is Entry => Boolean(entry)));
      libraryRestored.current = true;

      if (!preferences.rememberTabs) return;
      const savedTabs = readStored<string[]>("vellum.tabs:v1", []);
      const savedActive = readStored<string | undefined>("vellum.activeTab:v1", undefined);
      await Promise.all(savedTabs.map((path) => openDocument(path)));
      if (!cancelled && savedActive && savedTabs.includes(savedActive)) {
        setActivePath(savedActive);
      }
    };

    void restore();
    return () => { cancelled = true; };
  }, [openDocument, preferences.rememberTabs]);

  useEffect(() => {
    const dialog = settingsDialog.current;
    if (settingsOpen && !dialog?.open) dialog?.showModal();
    if (!settingsOpen && dialog?.open) dialog.close();
  }, [settingsOpen]);

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
    document.documentElement.style.setProperty("--line-height", String(preferences.lineHeight / 100));
    document.documentElement.style.setProperty("--viewer-zoom", `${preferences.viewerZoom}%`);
    if (isTauri()) void getCurrentWebview().setZoom(preferences.interfaceScale / 100);
    localStorage.setItem("vellum.preferences:v1", JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    const indicator = document.createElement("i");
    indicator.className = "scroll-indicator";
    document.body.append(indicator);
    let timer: number | undefined;
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      const rect = target.getBoundingClientRect();
      const height = Math.max(18, rect.height * rect.height / target.scrollHeight);
      const travel = Math.max(0, rect.height - height);
      const progress = target.scrollTop / Math.max(1, target.scrollHeight - target.clientHeight);
      indicator.style.top = `${rect.top + travel * progress}px`;
      indicator.style.left = `${rect.right - 2}px`;
      indicator.style.height = `${height}px`;
      indicator.style.opacity = "1";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { indicator.style.opacity = "0"; }, 500);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.clearTimeout(timer);
      indicator.remove();
    };
  }, []);

  useEffect(() => {
    if (libraryRestored.current) localStorage.setItem("vellum.library:v1", JSON.stringify(roots.map((entry) => entry.path)));
  }, [roots]);
  useEffect(() => localStorage.setItem("vellum.sidebarOpen:v1", JSON.stringify(sidebarOpen)), [sidebarOpen]);
  useEffect(() => {
    if (preferences.rememberTabs) {
      localStorage.setItem("vellum.tabs:v1", JSON.stringify(documents.map((document) => document.path)));
      localStorage.setItem("vellum.activeTab:v1", JSON.stringify(activePath));
    } else {
      localStorage.removeItem("vellum.tabs:v1");
      localStorage.removeItem("vellum.activeTab:v1");
    }
  }, [documents, activePath, preferences.rememberTabs]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
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
        void openDocument(activeDocument.path);
      } else if (key === "w" && activePath) {
        event.preventDefault();
        closeDocument(activePath);
      }
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const renderedMarkdown = useMemo(() => {
    if (!activeDocument || activeDocument.kind !== "markdown") return "";
    return DOMPurify.sanitize(marked.parse(activeDocument.content, { async: false }) as string);
  }, [activeDocument]);

  const renderedHtml = useMemo(() => {
    if (!activeDocument || activeDocument.kind !== "html") return "";
    return prepareHtml(activeDocument.content, preferences.viewerZoom, resolvedTheme);
  }, [activeDocument, preferences.viewerZoom, resolvedTheme]);

  function removeRoot(path: string) {
    setRoots((current) => current.filter((entry) => entry.path !== path));
  }

  function toggleTheme() {
    setPreferences((current) => ({ ...current, theme: resolvedTheme === "dark" ? "light" : "dark" }));
  }

  return (
    <main className={`app-shell ${htmlMode ? "html-mode" : ""} ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <div
        className={`global-drag-region ${sidebarOpen ? "sidebar-visible" : ""}`}
        role="presentation"
        data-tauri-drag-region
        onDoubleClick={() => appWindow?.toggleMaximize()}
      />
      <section className="workspace">
        <aside className="sidebar" aria-label="Document library and application controls">
          <nav className="sidebar-rail" aria-label="Collapsed sidebar controls">
            <span className="brand-mark rail-mark" data-tauri-drag-region aria-hidden="true">V</span>
            <span className="rail-spacer" />
            <button type="button" onClick={choosePath} title="Open file (Ctrl+O)" aria-label="Open file"><Plus size={15} /></button>
            <button type="button" disabled={!activeDocument} onClick={() => setPreferences((current) => ({ ...current, viewerZoom: Math.max(50, current.viewerZoom - 10) }))} title="Zoom out" aria-label="Zoom out"><ZoomOut size={15} /></button>
            <button type="button" disabled={!activeDocument} onClick={() => setPreferences((current) => ({ ...current, viewerZoom: Math.min(200, current.viewerZoom + 10) }))} title="Zoom in" aria-label="Zoom in"><ZoomIn size={15} /></button>
            <button type="button" onClick={() => setSettingsOpen(true)} title="Settings (Ctrl+,)" aria-label="Open settings"><Settings size={15} /></button>
            <button type="button" onClick={() => setSidebarOpen(true)} title="Show sidebar (Ctrl+B)" aria-label="Show sidebar"><PanelLeftOpen size={16} /></button>
          </nav>
          <header
            className="sidebar-titlebar"
            data-tauri-drag-region
          >
            <div className="brand" data-tauri-drag-region>
              <span className="brand-mark" aria-hidden="true">V</span>
              <span>Vellum</span>
            </div>
            <div className="window-controls">
              <button type="button" onClick={() => appWindow?.minimize()} aria-label="Minimize"><Minus size={13} /></button>
              <button type="button" onClick={() => appWindow?.toggleMaximize()} aria-label="Maximize"><Maximize2 size={12} /></button>
              <button type="button" className="close" onClick={() => appWindow?.close()} aria-label="Close"><X size={14} /></button>
            </div>
          </header>

          <section className="sidebar-section library-section">
            <div className="section-label"><Folder size={12} /> Pinned</div>
            <div className="tree">
              {roots.length ? roots.map((entry) => (
                <TreeNode key={entry.path} entry={entry} activePath={activePath} onOpen={openDocument} onRemove={removeRoot} root />
              )) : (
                <div className="empty-sidebar">
                  <p>Add a file or folder to start your library.</p>
                  <button type="button" onClick={chooseFolder}>Open folder</button>
                </div>
              )}
            </div>
          </section>

          <footer className="sidebar-controls" aria-label="Viewer and application controls">
            <div className="viewer-tools">
              <button type="button" onClick={() => setSidebarOpen(false)} title="Hide sidebar (Ctrl+B)" aria-label="Hide sidebar"><PanelLeftClose size={16} /></button>
              <span className="viewer-tools-spacer" />
              <button type="button" disabled={!activeDocument} onClick={() => setPreferences((current) => ({ ...current, viewerZoom: Math.max(50, current.viewerZoom - 10) }))} title="Zoom out" aria-label="Zoom out"><ZoomOut size={15} /></button>
              <button type="button" className="zoom-value" disabled={!activeDocument} onClick={() => setPreferences((current) => ({ ...current, viewerZoom: 100 }))} title="Reset viewer zoom" aria-label={`Reset viewer zoom, currently ${preferences.viewerZoom}%`}>{preferences.viewerZoom}%</button>
              <button type="button" disabled={!activeDocument} onClick={() => setPreferences((current) => ({ ...current, viewerZoom: Math.min(200, current.viewerZoom + 10) }))} title="Zoom in" aria-label="Zoom in"><ZoomIn size={15} /></button>
            </div>
            <nav className="sidebar-command-bar" aria-label="Application controls">
              <button type="button" onClick={choosePath} title="Open file (Ctrl+O)" aria-label="Open file"><Plus size={15} /></button>
              <button type="button" onClick={chooseFolder} title="Open folder (Ctrl+Shift+O)" aria-label="Open folder"><FolderPlus size={15} /></button>
              <button type="button" disabled={!activeDocument} onClick={() => activeDocument && openDocument(activeDocument.path)} title="Reload (Ctrl+R)" aria-label="Reload document"><RefreshCw size={15} /></button>
              <button type="button" onClick={toggleTheme} title="Toggle theme" aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}>
                {resolvedTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button type="button" onClick={() => setSettingsOpen(true)} title="Settings (Ctrl+,)" aria-label="Open settings"><Settings size={15} /></button>
            </nav>
          </footer>
        </aside>

        <section className="main-pane">
          <div className="content-area">
            {error ? <div className="error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => setError(undefined)} aria-label="Dismiss error"><X size={14} /></button></div> : null}
            {!activeDocument ? (
              <div className="welcome">
                <span className="welcome-mark" aria-hidden="true">V</span>
                <h1>Vellum</h1>
                <p>A quiet place for rendered documents.</p>
                <div className="welcome-actions">
                  <button type="button" onClick={choosePath}>Open file</button>
                  <button type="button" className="secondary" onClick={chooseFolder}>Open folder</button>
                </div>
                <div className="welcome-shortcuts"><kbd>Ctrl O</kbd> file <span>·</span> <kbd>Ctrl Shift O</kbd> folder</div>
              </div>
            ) : activeDocument.kind === "markdown" ? (
              <article className="document markdown-body" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
            ) : (
              <iframe
                className="html-frame"
                title={activeDocument.name}
                srcDoc={renderedHtml}
                sandbox="allow-forms allow-modals allow-popups allow-scripts"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </section>
      </section>

      <dialog
        ref={settingsDialog}
        className="modal-backdrop"
        aria-labelledby="settings-title"
        onCancel={() => setSettingsOpen(false)}
        onClose={() => setSettingsOpen(false)}
      >
          <section className="settings-panel">
            <header>
              <div><span className="eyebrow">Vellum</span><h2 id="settings-title">Settings</h2></div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings" autoFocus><X size={17} /></button>
            </header>
            <div className="setting-row">
              <div><strong>Appearance</strong><span>Choose how the application chrome is rendered.</span></div>
              <select aria-label="Appearance" value={preferences.theme} onChange={(event) => setPreferences((current) => ({ ...current, theme: event.target.value as Theme }))}>
                <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>
            </div>
            <div className="setting-row range-row">
              <div><strong>Interface scale</strong><span>Zoom the entire application without changing the window.</span></div>
              <label><input aria-label="Interface scale" type="range" min="80" max="110" step="5" value={preferences.interfaceScale} onChange={(event) => setPreferences((current) => ({ ...current, interfaceScale: Number(event.target.value) }))} /><span>{preferences.interfaceScale}%</span></label>
            </div>
            <div className="setting-row range-row">
              <div><strong>Viewer zoom</strong><span>Set the default zoom for Markdown and HTML documents.</span></div>
              <label><input aria-label="Viewer zoom" type="range" min="50" max="200" step="10" value={preferences.viewerZoom} onChange={(event) => setPreferences((current) => ({ ...current, viewerZoom: Number(event.target.value) }))} /><span>{preferences.viewerZoom}%</span></label>
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
            <div className="setting-row range-row">
              <div><strong>Line spacing</strong><span>Adjust the rhythm of rendered Markdown paragraphs.</span></div>
              <label><input aria-label="Markdown line spacing" type="range" min="145" max="195" step="5" value={preferences.lineHeight} onChange={(event) => setPreferences((current) => ({ ...current, lineHeight: Number(event.target.value) }))} /><span>{preferences.lineHeight}%</span></label>
            </div>
            <div className="setting-row">
              <div><strong>Restore session</strong><span>Reopen document tabs from the previous session.</span></div>
              <label className="switch"><input aria-label="Restore previous session" type="checkbox" checked={preferences.rememberTabs} onChange={(event) => setPreferences((current) => ({ ...current, rememberTabs: event.target.checked }))} /><span aria-hidden="true" /></label>
            </div>
            <div className="setting-row">
              <div><strong>Reset appearance</strong><span>Restore Vellum's default scale, reading, and theme settings.</span></div>
              <button type="button" className="reset-button" onClick={() => setPreferences(defaultPreferences)}><RefreshCw size={14} /> Reset</button>
            </div>
          </section>
      </dialog>
    </main>
  );
}

export default App;
