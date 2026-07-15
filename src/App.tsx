import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  Maximize2,
  Minus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Sun,
  X,
} from "lucide-react";

type Entry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: Entry[];
};

type Document = {
  path: string;
  name: string;
  content: string;
  kind: "markdown" | "html";
};

const appWindow = getCurrentWindow();
const allowedExtensions = ["md", "markdown", "html", "htm"];

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function extension(path: string) {
  return path.split(".").at(-1)?.toLowerCase() ?? "";
}

function isSupported(path: string) {
  return allowedExtensions.includes(extension(path));
}

function TreeNode({ entry, activePath, onOpen }: { entry: Entry; activePath?: string; onOpen: (path: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const isDirectory = entry.kind === "directory";

  return (
    <div className="tree-node">
      <button
        className={`tree-row ${activePath === entry.path ? "active" : ""}`}
        onClick={() => (isDirectory ? setExpanded((value) => !value) : onOpen(entry.path))}
        title={entry.path}
      >
        <span className="tree-chevron">
          {isDirectory ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
        </span>
        {isDirectory ? expanded ? <FolderOpen size={15} /> : <Folder size={15} /> : extension(entry.path).startsWith("htm") ? <FileCode2 size={15} /> : <FileText size={15} />}
        <span className="tree-label">{entry.name}</span>
      </button>
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
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [error, setError] = useState<string>();

  const activeDocument = documents.find((document) => document.path === activePath);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const renderedMarkdown = useMemo(() => {
    if (!activeDocument || activeDocument.kind !== "markdown") return "";
    return DOMPurify.sanitize(marked.parse(activeDocument.content, { async: false }) as string);
  }, [activeDocument]);

  async function addPath(path: string) {
    try {
      setError(undefined);
      const entry = await invoke<Entry>("scan_path", { path });
      setRoots((current) => current.some((item) => item.path === entry.path) ? current : [...current, entry]);
      if (entry.kind === "file") await openDocument(entry.path);
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function choosePath() {
    const selected = await open({ multiple: false, directory: false, filters: [{ name: "Documents", extensions: allowedExtensions }] });
    if (typeof selected === "string") await addPath(selected);
  }

  async function chooseFolder() {
    const selected = await open({ multiple: false, directory: true });
    if (typeof selected === "string") await addPath(selected);
  }

  async function openDocument(path: string) {
    if (!isSupported(path)) return;
    try {
      setError(undefined);
      const content = await invoke<string>("read_document", { path });
      const document: Document = {
        path,
        name: basename(path),
        content,
        kind: extension(path).startsWith("htm") ? "html" : "markdown",
      };
      setDocuments((current) => current.some((item) => item.path === path) ? current.map((item) => item.path === path ? document : item) : [...current, document]);
      setActivePath(path);
    } catch (cause) {
      setError(String(cause));
    }
  }

  function closeDocument(path: string) {
    setDocuments((current) => {
      const index = current.findIndex((item) => item.path === path);
      const next = current.filter((item) => item.path !== path);
      if (activePath === path) setActivePath(next[Math.max(0, index - 1)]?.path);
      return next;
    });
  }

  return (
    <main className="app-shell">
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className="brand-mark">V</span>
          <span>Vellum</span>
        </div>
        <div className="window-controls">
          <button onClick={() => appWindow.minimize()} aria-label="Minimize"><Minus size={14} /></button>
          <button onClick={() => appWindow.toggleMaximize()} aria-label="Maximize"><Maximize2 size={13} /></button>
          <button className="close" onClick={() => appWindow.close()} aria-label="Close"><X size={15} /></button>
        </div>
      </header>

      <section className={`workspace ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <aside className="sidebar">
          <div className="sidebar-heading">
            <span>Library</span>
            <div className="sidebar-actions">
              <button onClick={choosePath} title="Open file"><Plus size={15} /></button>
              <button onClick={chooseFolder} title="Open folder"><FolderOpen size={15} /></button>
            </div>
          </div>
          <div className="tree">
            {roots.length ? roots.map((entry) => <TreeNode key={entry.path} entry={entry} activePath={activePath} onOpen={openDocument} />) : (
              <div className="empty-sidebar">
                <p>No files open</p>
                <button onClick={chooseFolder}>Open a folder</button>
              </div>
            )}
          </div>
          <div className="sidebar-footer">Markdown · HTML</div>
        </aside>

        <section className="main-pane">
          <div className="toolbar">
            <button onClick={() => setSidebarOpen((value) => !value)} title="Toggle sidebar">
              {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>
            <div className="tabs">
              {documents.map((document) => (
                <button key={document.path} className={`tab ${activePath === document.path ? "active" : ""}`} onClick={() => setActivePath(document.path)}>
                  {document.kind === "html" ? <FileCode2 size={14} /> : <FileText size={14} />}
                  <span>{document.name}</span>
                  <X size={13} className="tab-close" onClick={(event) => { event.stopPropagation(); closeDocument(document.path); }} />
                </button>
              ))}
            </div>
            <div className="toolbar-actions">
              {activeDocument ? <button onClick={() => openDocument(activeDocument.path)} title="Reload"><RefreshCw size={16} /></button> : null}
              <button onClick={() => setTheme((value) => value === "light" ? "dark" : "light")} title="Toggle theme">
                {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>
          </div>

          <div className="content-area">
            {error ? <div className="error-banner">{error}</div> : null}
            {!activeDocument ? (
              <div className="welcome">
                <span className="welcome-mark">V</span>
                <h1>Vellum</h1>
                <p>A quiet place for rendered documents.</p>
                <div className="welcome-actions">
                  <button onClick={choosePath}>Open file</button>
                  <button className="secondary" onClick={chooseFolder}>Open folder</button>
                </div>
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
    </main>
  );
}

export default App;
