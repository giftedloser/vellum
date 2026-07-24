import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import DOMPurify from "dompurify";
import { marked } from "marked";
import FileTypeIcon from "./FileTypeIcon";
import WindowControls from "./WindowControls";
import { collapsedRecentCount, documentKind, sidebarLabel, touchRecent as moveRecentToFront, visibleRecents, type DocumentKind, type RecentItem } from "./recent";
import { createNote, emptySession, noteTitle, updateDocumentRecovery, type DocumentRecovery, type Note, type SessionState, type Workspace } from "./session";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  FileCode2,
  FileText,
  FileType2,
  Folder,
  FolderOpen,
  FolderPlus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Scan,
  Settings,
  StickyNote,
  Sun,
  Trash2,
  WrapText,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const SourceEditor = lazy(() => import("./SourceEditor"));

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
  kind: DocumentKind;
  modifiedMs: number;
  assetBaseUrl?: string;
  draft?: boolean;
};

type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;
type ContextMenuState = { x: number; y?: number; bottom?: number; maxHeight: number; path?: string; noteId?: string; root?: boolean };
type ViewerMetrics = { contentWidth: number; viewportWidth: number };
type EditorFont = "Caskaydia Code NF" | "JetBrains Mono NF" | "Cascadia Mono" | "Zed Mono NF";
type SidebarMotion = "quick" | "balanced" | "relaxed";
type CollapsibleSection = "pinned" | "open" | "recent";

type Preferences = {
  theme: Theme;
  interfaceScale: number;
  viewerZoom: number;
  sidebarOpacity: number;
  readingWidth: number;
  fontScale: number;
  lineHeight: number;
  editorWrap: boolean;
  editorFontSize: number;
  editorFont: EditorFont;
  autoHideControls: boolean;
  sidebarMotion: SidebarMotion;
};

const appWindow = isTauri() ? getCurrentWindow() : undefined;
const allowedExtensions = ["md", "markdown", "html", "htm", "txt"];
const defaultPreferences: Preferences = {
  theme: "system",
  interfaceScale: 92,
  viewerZoom: 100,
  sidebarOpacity: 84,
  readingWidth: 880,
  fontScale: 95,
  lineHeight: 170,
  editorWrap: true,
  editorFontSize: 14,
  editorFont: "Caskaydia Code NF",
  autoHideControls: true,
  sidebarMotion: "balanced",
};
const sidebarMotionMs: Record<SidebarMotion, number> = { quick: 560, balanced: 700, relaxed: 900 };
const editorFonts: Record<EditorFont, string> = {
  "Caskaydia Code NF": '"CaskaydiaCove NF", "CaskaydiaCove Nerd Font", "Cascadia Mono", monospace',
  "JetBrains Mono NF": '"JetBrainsMono NF", "JetBrainsMono Nerd Font", "Cascadia Mono", monospace',
  "Cascadia Mono": '"Cascadia Mono", Consolas, monospace',
  "Zed Mono NF": '"ZedMono NF", "ZedMono Nerd Font", "Cascadia Mono", monospace',
};
const editorFontNames = Object.keys(editorFonts) as EditorFont[];
const editorFontAliases: Record<string, EditorFont> = {
  "Caskaydia Code NF": "Caskaydia Code NF",
  "JetBrains Mono NF": "JetBrains Mono NF",
  "Cascadia Mono": "Cascadia Mono",
  "Zed Mono NF": "Zed Mono NF",
  "Cascadia Code": "Caskaydia Code NF",
  "Fira Code": "Zed Mono NF",
  "JetBrains Mono": "JetBrains Mono NF",
  "IBM Plex Mono": "Cascadia Mono",
};

function readPreferences(): Preferences {
  const stored = readStored<Partial<Omit<Preferences, "editorFont">> & { editorFont?: string }>("vellum.preferences:v2", readStored("vellum.preferences:v1", {}));
  return { ...defaultPreferences, ...stored, editorFont: editorFontAliases[stored.editorFont ?? ""] ?? defaultPreferences.editorFont };
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function extension(path: string) {
  return path.split(".").at(-1)?.toLowerCase() ?? "";
}

function isSupported(path: string) {
  return allowedExtensions.includes(extension(path));
}

function ensureExtension(path: string, kind: DocumentKind) {
  const valid = kind === "html" ? ["html", "htm"] : kind === "markdown" ? ["md", "markdown"] : ["txt"];
  return valid.includes(extension(path)) ? path : `${path}.${valid[0]}`;
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function findEntry(entries: Entry[], path: string): Entry | undefined {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    const child = entry.children ? findEntry(entry.children, path) : undefined;
    if (child) return child;
  }
}

function pathIsInside(root: string, path: string) {
  if (root === path) return true;
  return path.startsWith(`${root}\\`) || path.startsWith(`${root}/`);
}

function rootForPath(roots: Entry[], path: string) {
  return roots.find((entry) => pathIsInside(entry.path, path));
}

function filterEntryForWorkspace(entry: Entry, workspace: Workspace): Entry | undefined {
  if (entry.kind === "file") {
    const text = documentKind(entry.path) === "text";
    return (workspace === "notes") === text ? entry : undefined;
  }
  return { ...entry, children: entry.children?.flatMap((child) => {
    const filtered = filterEntryForWorkspace(child, workspace);
    return filtered ? [filtered] : [];
  }) };
}

const viewerScript = `(()=>{const root=document.documentElement,indicator=document.createElement("i"),warn=()=>parent.postMessage({type:"vellum-viewer-warning"},"*");indicator.className="vellum-scroll-indicator";root.append(indicator);let timer,frame=0;const measure=()=>{const previous=root.style.zoom;root.style.zoom="1";const contentWidth=Math.max(root.scrollWidth,document.body?.scrollWidth||0);root.style.zoom=previous;parent.postMessage({type:"vellum-viewer-metrics",contentWidth,viewportWidth:innerWidth},"*")};const setZoom=value=>{const zoom=Number(value);if(Number.isFinite(zoom))root.style.zoom=String(Math.max(.5,Math.min(2,zoom/100)))};const renderScroll=target=>{frame=0;const viewport=target===document.scrollingElement,rect=viewport?{top:0,right:innerWidth,height:innerHeight}:target.getBoundingClientRect(),height=Math.max(18,rect.height*rect.height/target.scrollHeight),travel=Math.max(0,rect.height-height),progress=target.scrollTop/Math.max(1,target.scrollHeight-target.clientHeight);indicator.style.top=(rect.top+travel*progress)+"px";indicator.style.left=(rect.right-2)+"px";indicator.style.height=height+"px";indicator.style.opacity=1;clearTimeout(timer);timer=setTimeout(()=>indicator.style.opacity=0,500)};addEventListener("load",measure);addEventListener("resize",measure);addEventListener("error",warn,true);addEventListener("unhandledrejection",warn);addEventListener("message",event=>{if(event.data?.type==="vellum-measure")measure();if(event.data?.type==="vellum-zoom")setZoom(event.data.zoom)});addEventListener("scroll",event=>{const target=event.target===document?document.scrollingElement:event.target;if(!target||frame)return;frame=requestAnimationFrame(()=>renderScroll(target))},true);addEventListener("contextmenu",event=>{event.preventDefault();parent.postMessage({type:"vellum-context-menu",x:event.clientX,y:event.clientY},"*")})})()`;

function prepareHtml(content: string, theme: ResolvedTheme, baseUrl?: string) {
  const thumb = theme === "dark" ? "oklch(1 0 0 / .24)" : "oklch(0 0 0 / .28)";
  const viewer = `${baseUrl ? `<base href="${baseUrl}">` : ""}<style data-vellum-viewer>*{scrollbar-width:none}::-webkit-scrollbar{display:none;width:0;height:0}.vellum-scroll-indicator{position:fixed;z-index:2147483647;width:2px;border-radius:999px;background:${thumb};pointer-events:none;opacity:0;transition:opacity 120ms}</style><script data-vellum-viewer>${viewerScript}</script>`;
  return /<head(?:\s[^>]*)?>/i.test(content)
    ? content.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${viewer}`)
    : `${viewer}${content}`;
}

function documentIcon(path: string, size = 15) {
  return <FileTypeIcon kind={documentKind(path)} size={size} />;
}

function TreeNode({ entry, activePath, root = false, pinnedPaths, onOpen, onPin, onRemove, onContextMenu }: {
  entry: Entry;
  activePath?: string;
  root?: boolean;
  pinnedPaths?: string[];
  onOpen: (path: string) => void;
  onPin?: (path: string) => void;
  onRemove?: (path: string) => void;
  onContextMenu: (event: ReactMouseEvent, path: string, root: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isDirectory = entry.kind === "directory";
  const pinned = pinnedPaths?.includes(entry.path) ?? false;
  const label = sidebarLabel(entry.name, !isDirectory);

  return (
    <div className={`tree-node ${root ? "tree-root" : ""}`}>
      <div className={`tree-row-wrap ${root ? "root-row" : onPin ? "pinnable-row" : ""} ${activePath === entry.path ? "active" : ""}`} onContextMenu={(event) => onContextMenu(event, entry.path, root)}>
        <button
          type="button"
          className="tree-row"
          onClick={() => isDirectory ? setExpanded((value) => !value) : onOpen(entry.path)}
          title={entry.path}
          aria-expanded={isDirectory ? expanded : undefined}
        >
          <span className="tree-chevron">{isDirectory ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}</span>
          {isDirectory ? expanded ? <FolderOpen size={16} className="icon-folder" /> : <Folder size={16} className="icon-folder" /> : documentIcon(entry.path)}
          <span className="tree-label">{label}</span>
        </button>
        {onPin ? (
          <button type="button" className="tree-remove tree-pin" onClick={() => onPin(entry.path)} title={pinned ? "Unpin" : "Pin"} aria-label={`${pinned ? "Unpin" : "Pin"} ${entry.name}`}>
            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
        ) : null}
        {root && onRemove ? <button type="button" className="tree-remove" onClick={() => onRemove(entry.path)} title="Remove from sidebar" aria-label={`Remove ${entry.name} from sidebar`}><X size={13} /></button> : null}
      </div>
      {isDirectory && expanded && entry.children?.length ? (
        <div className="tree-children">
          {entry.children.map((child) => <TreeNode key={child.path} entry={child} activePath={activePath} pinnedPaths={pinnedPaths} onOpen={onOpen} onPin={onPin} onContextMenu={onContextMenu} />)}
        </div>
      ) : null}
    </div>
  );
}

function App() {
  const [roots, setRoots] = useState<Entry[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>(() => readStored("vellum.recent:v2", []));
  const [pinned, setPinned] = useState<string[]>(() => readStored("vellum.pinned:v2", []));
  const [pinnedNotes, setPinnedNotes] = useState<string[]>(() => readStored("vellum.pinnedNotes:v1", []));
  const [folderWorkspaces, setFolderWorkspaces] = useState<Record<string, Workspace>>(() => readStored("vellum.folderWorkspaces:v1", {}));
  const [session, setSession] = useState<SessionState>(emptySession);
  const [activeDocument, setActiveDocument] = useState<OpenDocument>();
  const [activeNoteId, setActiveNoteId] = useState<string>();
  const [draftContent, setDraftContent] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => readStored("vellum.sidebarOpen:v1", true));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [contextMenuScrollHint, setContextMenuScrollHint] = useState<"down" | "up">();
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<CollapsibleSection, boolean>>>(() => readStored("vellum.collapsedSections:v1", {}));
  const [viewerMetrics, setViewerMetrics] = useState<ViewerMetrics>();
  const [fitToWidth, setFitToWidth] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [error, setError] = useState<string>();
  const [viewerWarning, setViewerWarning] = useState(false);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const htmlFrame = useRef<HTMLIFrameElement>(null);
  const contextMenuScroll = useRef<HTMLDivElement>(null);
  const libraryRestored = useRef(false);
  const documentRestored = useRef(false);
  const sessionReady = useRef(false);
  const sessionWritable = useRef(true);
  const sessionRef = useRef(session);
  const openRequest = useRef(0);
  const rootsRef = useRef<Entry[]>([]);

  const activePath = activeDocument?.draft ? undefined : activeDocument?.path;
  const activeNote = activeNoteId ? session.notes.find((note) => note.id === activeNoteId) : undefined;
  const workspace = session.workspace;
  const hasActiveItem = Boolean(activeDocument || activeNote);
  const htmlMode = activeDocument?.kind === "html";
  const dirty = Boolean(activeDocument && draftContent !== activeDocument.content);
  const editorKey = activeNote ? `note:${activeNote.id}` : activeDocument ? `document:${activeDocument.path}` : "";
  const editorLanguage = activeNote ? "text" : activeDocument?.kind;
  const wordCount = draftContent.trim() ? draftContent.trim().split(/\s+/).length : 0;

  useEffect(() => { rootsRef.current = roots; }, [roots]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const updateSession = useCallback((update: (current: SessionState) => SessionState) => {
    setSession((current) => {
      const next = update(current);
      sessionRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const menu = contextMenuScroll.current;
    setContextMenuScrollHint(menu && menu.scrollHeight > menu.clientHeight + 1 ? "down" : undefined);
  }, [contextMenu]);

  const touchRecent = useCallback((path: string) => {
    setRecent((current) => moveRecentToFront(current, path));
  }, []);

  const openDocument = useCallback(async (path: string) => {
    if (!isSupported(path)) return;
    const request = ++openRequest.current;
    try {
      setError(undefined);
      setViewerWarning(false);
      let owner = rootForPath(rootsRef.current, path);
      if (!owner) {
        owner = await invoke<Entry>("scan_path", { path });
        if (request !== openRequest.current) return;
        rootsRef.current = [...rootsRef.current, owner];
        setRoots((current) => current.some((entry) => entry.path === owner!.path) ? current : [...current, owner!]);
      }
      const [content, modifiedMs, assetBaseUrl] = await Promise.all([
        invoke<string>("read_document", { path }),
        invoke<number>("document_modified_ms", { path }),
        documentKind(path) === "html" ? invoke<string>("document_asset_base", { path }) : undefined,
      ]);
      if (request !== openRequest.current) return;
      const recovery = sessionRef.current.documents.find((document) => document.path === path);
      const restoredDraft = recovery?.content !== content ? recovery : undefined;
      setViewerMetrics(undefined);
      setFitToWidth(false);
      setActiveNoteId(undefined);
      const kind = documentKind(path);
      setActiveDocument({ path, name: basename(path), content, kind, modifiedMs: restoredDraft?.baseModifiedMs ?? modifiedMs, assetBaseUrl });
      setDraftContent(restoredDraft?.content ?? content);
      setEditMode(kind === "text" || Boolean(restoredDraft));
      updateSession((current) => ({
        ...current,
        documents: recovery?.content === content ? current.documents.filter((document) => document.path !== path) : current.documents,
        active: { type: "document", path },
        workspace: kind === "text" ? "notes" : "documents",
      }));
      touchRecent(path);
    } catch (cause) {
      if (request === openRequest.current) setError(String(cause));
    }
  }, [touchRecent, updateSession]);

  const choosePath = useCallback(async () => {
    const notesWorkspace = sessionRef.current.workspace === "notes";
    const selected = await open({ multiple: false, directory: false, filters: [{ name: notesWorkspace ? "Text" : "HTML and Markdown", extensions: notesWorkspace ? ["txt"] : ["md", "markdown", "html", "htm"] }] });
    if (typeof selected !== "string") return;
    try {
      const entry = await invoke<Entry>("scan_path", { path: selected });
      setRoots((current) => current.some((item) => item.path === entry.path) ? current : [...current, entry]);
      rootsRef.current = rootsRef.current.some((item) => item.path === entry.path) ? rootsRef.current : [...rootsRef.current, entry];
      await openDocument(entry.path);
    } catch (cause) {
      setError(String(cause));
    }
  }, [openDocument]);

  const chooseFolder = useCallback(async () => {
    const targetWorkspace = sessionRef.current.workspace;
    const selected = await open({ multiple: false, directory: true });
    if (typeof selected !== "string") return;
    try {
      const entry = await invoke<Entry>("scan_path", { path: selected });
      setRoots((current) => current.some((item) => item.path === entry.path) ? current : [...current, entry]);
      setFolderWorkspaces((current) => ({ ...current, [entry.path]: targetWorkspace }));
      touchRecent(entry.path);
      updateSession((current) => ({ ...current, workspace: targetWorkspace }));
    } catch (cause) {
      setError(String(cause));
    }
  }, [touchRecent, updateSession]);

  const saveCurrent = useCallback(async (saveAs = false) => {
    if (activeNote) {
      try {
        const safeTitle = noteTitle(activeNote).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().slice(0, 80) || activeNote.fallbackTitle;
        const selected = await save({
          defaultPath: `${safeTitle}.txt`,
          filters: [{ name: "Text", extensions: ["txt"] }],
        });
        if (typeof selected !== "string") return;
        const path = ensureExtension(selected, "text");
        const modifiedMs = await invoke<number>("write_document", { path, content: draftContent });
        const entry = await invoke<Entry>("scan_path", { path });
        setActiveNoteId(undefined);
        setActiveDocument({ path: entry.path, name: entry.name, content: draftContent, kind: "text", modifiedMs });
        setRoots((current) => current.some((item) => item.path === entry.path) ? current : [...current, entry]);
        if (pinnedNotes.includes(activeNote.id)) setPinned((current) => current.includes(entry.path) ? current : [...current, entry.path]);
        setPinnedNotes((current) => current.filter((id) => id !== activeNote.id));
        updateSession((current) => ({
          ...current,
          notes: current.notes.filter((note) => note.id !== activeNote.id),
          documents: current.documents.filter((document) => document.path !== entry.path),
          active: { type: "document", path: entry.path },
          workspace: "notes",
        }));
        touchRecent(entry.path);
      } catch (cause) {
        setError(String(cause));
      }
      return;
    }
    if (!activeDocument) return;
    try {
      let path = activeDocument.path;
      if (activeDocument.draft || saveAs) {
        const filter = activeDocument.kind === "html"
          ? { name: "HTML", extensions: ["html", "htm"] }
          : activeDocument.kind === "markdown"
            ? { name: "Markdown", extensions: ["md", "markdown"] }
            : { name: "Text", extensions: ["txt"] };
        const selected = await save({
          defaultPath: activeDocument.name,
          filters: [filter],
        });
        if (typeof selected !== "string") return;
        path = ensureExtension(selected, activeDocument.kind);
      } else {
        const modifiedMs = await invoke<number>("document_modified_ms", { path });
        if (modifiedMs !== activeDocument.modifiedMs && !window.confirm("This file changed outside Vellum. Overwrite the newer version?")) return;
      }

      const modifiedMs = await invoke<number>("write_document", { path, content: draftContent });
      const entry = await invoke<Entry>("scan_path", { path });
      const assetBaseUrl = documentKind(entry.path) === "html" ? await invoke<string>("document_asset_base", { path: entry.path }) : undefined;
      setActiveDocument({ path: entry.path, name: entry.name, content: draftContent, kind: documentKind(entry.path), modifiedMs, assetBaseUrl });
      setRoots((current) => current.some((item) => item.path === entry.path) ? current : [...current, entry]);
      if (pinned.includes(activeDocument.path)) setPinned((current) => [...current.filter((path) => path !== activeDocument.path && path !== entry.path), entry.path]);
      updateSession((current) => ({
        ...current,
        documents: current.documents.filter((document) => document.path !== activeDocument.path && document.path !== entry.path),
        active: { type: "document", path: entry.path },
        workspace: documentKind(entry.path) === "text" ? "notes" : "documents",
      }));
      touchRecent(entry.path);
    } catch (cause) {
      setError(String(cause));
    }
  }, [activeDocument, activeNote, draftContent, pinned, pinnedNotes, touchRecent, updateSession]);

  const newDocument = useCallback((kind: DocumentKind) => {
    const content = kind === "html"
      ? '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Untitled</title>\n</head>\n<body>\n  \n</body>\n</html>\n'
      : "";
    const name = kind === "html" ? "Untitled.html" : kind === "markdown" ? "Untitled.md" : "Untitled.txt";
    const path = `draft://${crypto.randomUUID()}/${name}`;
    setActiveNoteId(undefined);
    setActiveDocument({ path, name, content, kind, modifiedMs: 0, draft: true });
    setDraftContent(content);
    setViewerMetrics(undefined);
    setViewerWarning(false);
    setFitToWidth(false);
    setEditMode(true);
    updateSession((current) => ({
      ...current,
      documents: [{ path, content, baseModifiedMs: 0, updatedAt: Date.now(), kind, name, draft: true }, ...current.documents],
      active: { type: "document", path },
      workspace: kind === "text" ? "notes" : "documents",
    }));
  }, [updateSession]);

  const closeDocument = useCallback(() => {
    openRequest.current += 1;
    setViewerMetrics(undefined);
    setViewerWarning(false);
    setActiveDocument(undefined);
    setActiveNoteId(undefined);
    setDraftContent("");
    setEditMode(false);
    updateSession((current) => ({ ...current, active: null }));
  }, [updateSession]);

  const reloadDocument = useCallback(async () => {
    if (!activeDocument || activeDocument.draft || (dirty && !window.confirm("Discard this recovered draft and reload the file from disk?"))) return;
    updateSession((current) => ({ ...current, documents: current.documents.filter((document) => document.path !== activeDocument.path) }));
    await openDocument(activeDocument.path);
  }, [activeDocument, dirty, openDocument, updateSession]);

  const openNote = useCallback((id: string) => {
    const note = sessionRef.current.notes.find((item) => item.id === id);
    if (!note) return;
    openRequest.current += 1;
    setActiveDocument(undefined);
    setActiveNoteId(id);
    setDraftContent(note.content);
    setViewerMetrics(undefined);
    setViewerWarning(false);
    setEditMode(true);
    updateSession((current) => ({ ...current, active: { type: "note", id }, workspace: "notes" }));
  }, [updateSession]);

  const openDraft = useCallback((path: string) => {
    const draft = sessionRef.current.documents.find((document) => document.path === path && document.draft && document.kind && document.name);
    if (!draft?.kind || !draft.name) return;
    openRequest.current += 1;
    setActiveNoteId(undefined);
    setActiveDocument({ path, name: draft.name, content: draft.content, kind: draft.kind, modifiedMs: 0, draft: true });
    setDraftContent(draft.content);
    setViewerMetrics(undefined);
    setViewerWarning(false);
    setEditMode(true);
    updateSession((current) => ({ ...current, active: { type: "document", path }, workspace: draft.kind === "text" ? "notes" : "documents" }));
  }, [updateSession]);

  const newNote = useCallback(() => {
    const note = createNote(sessionRef.current.notes);
    updateSession((current) => ({
      ...current,
      notes: [note, ...current.notes],
      active: { type: "note", id: note.id },
      workspace: "notes",
    }));
    setActiveDocument(undefined);
    setActiveNoteId(note.id);
    setDraftContent("");
    setViewerMetrics(undefined);
    setViewerWarning(false);
    setEditMode(true);
  }, [updateSession]);

  const deleteNote = useCallback((id: string) => {
    const note = sessionRef.current.notes.find((item) => item.id === id);
    if (!note || !window.confirm(`Delete "${noteTitle(note)}"? This cannot be undone.`)) return;
    updateSession((current) => ({
      ...current,
      notes: current.notes.filter((item) => item.id !== id),
      active: current.active?.type === "note" && current.active.id === id ? null : current.active,
    }));
    setPinnedNotes((current) => current.filter((item) => item !== id));
    if (activeNoteId === id) {
      setActiveNoteId(undefined);
      setDraftContent("");
      setEditMode(false);
    }
  }, [activeNoteId, updateSession]);

  const changeDraft = useCallback((content: string) => {
    setDraftContent(content);
    if (!activeNoteId) return;
    updateSession((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === activeNoteId ? { ...note, content, updatedAt: Date.now() } : note),
    }));
  }, [activeNoteId, updateSession]);

  useEffect(() => {
    if (!sessionReady.current || !activeDocument) return;
    updateSession((current) => ({
      ...current,
      documents: updateDocumentRecovery(
        current.documents,
        activeDocument.path,
        draftContent,
        activeDocument.modifiedMs,
        activeDocument.content,
        Date.now(),
        activeDocument.draft ? { draft: true, kind: activeDocument.kind, name: activeDocument.name } : undefined,
      ),
    }));
  }, [activeDocument, draftContent, updateSession]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const savedRoots = readStored<string[]>("vellum.library:v1", []);
      const entries = await Promise.all(savedRoots.map(async (path) => {
        try { return await invoke<Entry>("scan_path", { path }); } catch { return undefined; }
      }));
      if (cancelled) return;
      const restored = entries.filter((entry): entry is Entry => Boolean(entry));
      const missing = new Set(savedRoots.filter((_, index) => !entries[index]));
      setRoots(restored);
      rootsRef.current = restored;
      setRecent((current) => current.length ? current.filter((item) => !missing.has(item.path)) : restored.map((entry, index) => ({ path: entry.path, lastOpened: Date.now() - index })));
      setPinned((current) => current.filter((path) => !missing.has(path)));
      libraryRestored.current = true;
      const startupDocument = readStored<string | undefined>("vellum.startup-document:v1", undefined);
      localStorage.removeItem("vellum.startup-document:v1");
      let restoredSession = emptySession();
      try {
        const stored = isTauri()
          ? await invoke<string | null>("load_session")
          : localStorage.getItem("vellum.session:v1");
        if (stored) restoredSession = JSON.parse(stored) as SessionState;
      } catch (cause) {
        sessionWritable.current = false;
        if (!cancelled) setError(`Vellum could not load its recovery session: ${String(cause)}`);
      }
      if (cancelled) return;
      sessionRef.current = restoredSession;
      setSession(restoredSession);
      sessionReady.current = true;
      if (startupDocument) {
        await openDocument(startupDocument);
      } else if (restoredSession.active?.type === "note") {
        openNote(restoredSession.active.id);
      } else if (restoredSession.active?.type === "document") {
        const activePath = restoredSession.active.path;
        const activeRecovery = restoredSession.documents.find((document) => document.path === activePath);
        if (activeRecovery?.draft) openDraft(activePath);
        else await openDocument(activePath);
      }
      if (!cancelled) documentRestored.current = true;
    };
    void restore();
    return () => { cancelled = true; };
  }, [openDocument, openDraft, openNote]);

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
    document.documentElement.style.setProperty("--sidebar-motion", `${sidebarMotionMs[preferences.sidebarMotion] ?? 700}ms`);
    localStorage.setItem("vellum.preferences:v2", JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (isTauri()) void getCurrentWebview().setZoom(preferences.interfaceScale / 100);
  }, [preferences.interfaceScale]);

  useEffect(() => {
    const indicator = document.createElement("i");
    indicator.className = "scroll-indicator";
    document.body.append(indicator);
    let timer: number | undefined;
    let frame = 0;
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Element) || frame) return;
      const target = event.target;
      if (target.closest(".context-menu")) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
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
      });
    };
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      indicator.remove();
    };
  }, []);

  useEffect(() => {
    if (libraryRestored.current) localStorage.setItem("vellum.library:v1", JSON.stringify(roots.map((entry) => entry.path)));
  }, [roots]);
  useEffect(() => localStorage.setItem("vellum.recent:v2", JSON.stringify(recent)), [recent]);
  useEffect(() => localStorage.setItem("vellum.pinned:v2", JSON.stringify(pinned)), [pinned]);
  useEffect(() => localStorage.setItem("vellum.pinnedNotes:v1", JSON.stringify(pinnedNotes)), [pinnedNotes]);
  useEffect(() => localStorage.setItem("vellum.folderWorkspaces:v1", JSON.stringify(folderWorkspaces)), [folderWorkspaces]);
  useEffect(() => localStorage.setItem("vellum.sidebarOpen:v1", JSON.stringify(sidebarOpen)), [sidebarOpen]);
  useEffect(() => localStorage.setItem("vellum.collapsedSections:v1", JSON.stringify(collapsedSections)), [collapsedSections]);

  const persistSession = useCallback(async (value: SessionState) => {
    if (!sessionWritable.current) return;
    const serialized = JSON.stringify(value);
    if (isTauri()) await invoke("save_session", { session: serialized });
    else localStorage.setItem("vellum.session:v1", serialized);
  }, []);

  useEffect(() => {
    if (!sessionReady.current || !sessionWritable.current) return;
    const timer = window.setTimeout(() => {
      void persistSession(session).catch((cause) => setError(`Vellum could not save its recovery session: ${String(cause)}`));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [persistSession, session]);

  useEffect(() => {
    if (!documentRestored.current) return;
    localStorage.removeItem("vellum.document:v1");
    localStorage.removeItem("vellum.tabs:v1");
    localStorage.removeItem("vellum.activeTab:v1");
  }, [session.active]);

  useEffect(() => {
    if (!appWindow) return;
    let unlisten: (() => void) | undefined;
    let closing = false;
    void appWindow.onCloseRequested(async (event) => {
      if (closing) return;
      event.preventDefault();
      try {
        await persistSession(sessionRef.current);
        closing = true;
        await appWindow.destroy();
      } catch (cause) {
        setError(`Vellum could not preserve the current session: ${String(cause)}`);
      }
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, [persistSession]);

  useEffect(() => {
    const closeMenu = () => { setContextMenu(undefined); setAddMenuOpen(false); };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== htmlFrame.current?.contentWindow) return;
      if (event.data?.type === "vellum-viewer-metrics") {
        const contentWidth = Number(event.data.contentWidth);
        const viewportWidth = Number(event.data.viewportWidth);
        if (Number.isFinite(contentWidth) && Number.isFinite(viewportWidth) && contentWidth > 0 && viewportWidth > 0) setViewerMetrics({ contentWidth, viewportWidth });
        return;
      }
      if (event.data?.type === "vellum-viewer-warning") {
        setViewerWarning(true);
        return;
      }
      if (event.data?.type !== "vellum-context-menu") return;
      const rect = htmlFrame.current.getBoundingClientRect();
      const x = Number(event.data.x);
      const y = Number(event.data.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const menuY = Math.max(8, rect.top + y);
      setContextMenu({
        x: Math.max(8, Math.min(rect.left + x, window.innerWidth - 224)),
        ...(menuY > window.innerHeight / 2 ? { bottom: 8 } : { y: menuY }),
        maxHeight: menuY > window.innerHeight / 2 ? window.innerHeight - 16 : window.innerHeight - menuY - 8,
      });
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    if (!fitToWidth) return;
    const nextZoom = htmlMode && viewerMetrics ? Math.max(50, Math.min(200, Math.floor(viewerMetrics.viewportWidth / viewerMetrics.contentWidth * 100))) : 100;
    setPreferences((current) => current.viewerZoom === nextZoom ? current : { ...current, viewerZoom: nextZoom });
  }, [fitToWidth, htmlMode, viewerMetrics]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (event.key === "Escape" && contextMenu) { setContextMenu(undefined); return; }
    if (event.key === "Escape" && addMenuOpen) { setAddMenuOpen(false); return; }
    if (event.key === "Escape" && settingsOpen) { setSettingsOpen(false); return; }
    if (!modifier) return;
    const key = event.key.toLowerCase();
    if (key === "n") { event.preventDefault(); newNote(); }
    else if (key === "s" && hasActiveItem) { event.preventDefault(); void saveCurrent(event.shiftKey); }
    else if (key === "e" && activeDocument && activeDocument.kind !== "text") { event.preventDefault(); setEditMode((value) => !value); }
    else if (key === "o") { event.preventDefault(); void (event.shiftKey ? chooseFolder() : choosePath()); }
    else if (key === "b") { event.preventDefault(); setSidebarOpen((value) => !value); }
    else if (key === ",") { event.preventDefault(); setSettingsOpen(true); }
    else if (key === "r" && activeDocument && !editMode) { event.preventDefault(); void reloadDocument(); }
    else if (key === "w" && hasActiveItem) { event.preventDefault(); closeDocument(); }
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const renderedMarkdown = useMemo(() => {
    if (!activeDocument || activeDocument.kind !== "markdown") return "";
    return DOMPurify.sanitize(marked.parse(draftContent, { async: false }) as string);
  }, [activeDocument, draftContent]);

  const renderedHtml = useMemo(() => {
    if (!activeDocument || activeDocument.kind !== "html") return "";
    return prepareHtml(draftContent, resolvedTheme, activeDocument.assetBaseUrl);
  }, [activeDocument, draftContent, resolvedTheme]);

  useEffect(() => {
    if (!htmlMode || editMode) return;
    htmlFrame.current?.contentWindow?.postMessage({ type: "vellum-zoom", zoom: preferences.viewerZoom }, "*");
  }, [editMode, htmlMode, preferences.viewerZoom]);

  const pinnedEntries = pinned.flatMap((path) => {
    if (session.documents.some((document) => document.path === path)) return [];
    const entry = findEntry(roots, path);
    if (entry?.kind === "directory" && (folderWorkspaces[path] ?? "documents") !== workspace) return [];
    const filtered = entry ? filterEntryForWorkspace(entry, workspace) : undefined;
    return filtered ? [filtered] : [];
  });
  const pinnedSet = new Set(pinned);
  const workspaceProgressItems = session.documents
    .filter((item) => (workspace === "notes") === ((item.kind ?? documentKind(item.path)) === "text"));
  const pinnedProgressItems = workspaceProgressItems.filter((item) => pinned.includes(item.path));
  const openItems = workspaceProgressItems
    .filter((item) => !pinned.includes(item.path));
  const openPaths = new Set(openItems.map((item) => item.path));
  const recentEntries = [...recent]
    .sort((a, b) => b.lastOpened - a.lastOpened)
    .flatMap((item) => {
      if (pinnedSet.has(item.path) || openPaths.has(item.path)) return [];
      const entry = findEntry(roots, item.path);
      if (entry?.kind === "directory" && (folderWorkspaces[item.path] ?? "documents") !== workspace) return [];
      const filtered = entry ? filterEntryForWorkspace(entry, workspace) : undefined;
      if (!filtered) return [];
      return [filtered];
    });
  const displayedRecentEntries = visibleRecents(recentEntries, recentExpanded);
  const hiddenRecentCount = recentEntries.length - displayedRecentEntries.length;
  const displayedNotes = session.notes;
  const pinnedInternalNotes = displayedNotes.filter((note) => pinnedNotes.includes(note.id));
  const inProgressInternalNotes = displayedNotes.filter((note) => !pinnedNotes.includes(note.id));

  function removeSidebarItem(path: string) {
    setRecent((current) => current.filter((item) => item.path !== path));
    setPinned((current) => current.filter((item) => item !== path));
    setRoots((current) => current.filter((entry) => entry.path !== path));
    setFolderWorkspaces((current) => Object.fromEntries(Object.entries(current).filter(([item]) => item !== path)));
  }

  function togglePin(path: string) {
    setPinned((current) => current.includes(path) ? current.filter((item) => item !== path) : [...current, path]);
    if (!recent.some((item) => item.path === path)) touchRecent(path);
  }

  function toggleNotePin(id: string) {
    setPinnedNotes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleSection(section: CollapsibleSection) {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function toggleTheme() {
    setPreferences((current) => ({ ...current, theme: resolvedTheme === "dark" ? "light" : "dark" }));
  }

  function fitViewer() {
    setFitToWidth(true);
    htmlFrame.current?.contentWindow?.postMessage({ type: "vellum-measure" }, "*");
  }

  function showContextMenu(event: ReactMouseEvent, path?: string, root = false, noteId?: string) {
    event.preventDefault();
    event.stopPropagation();
    setAddMenuOpen(false);
    const menuY = Math.max(8, event.clientY);
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)),
      ...(menuY > window.innerHeight / 2 ? { bottom: 8 } : { y: menuY }),
      maxHeight: menuY > window.innerHeight / 2 ? window.innerHeight - 16 : window.innerHeight - menuY - 8,
      path,
      noteId,
      root,
    });
  }

  function renderNoteRow(note: Note) {
    const notePinned = pinnedNotes.includes(note.id);
    return (
      <div key={note.id} className={`tree-row-wrap note-row ${activeNoteId === note.id ? "active" : ""}`} onContextMenu={(event) => showContextMenu(event, undefined, false, note.id)}>
        <button type="button" className="tree-row" onClick={() => openNote(note.id)} title={noteTitle(note)}>
          <span className="tree-chevron" />
          <FileTypeIcon kind="text" size={13} />
          <span className="tree-label">{noteTitle(note)}</span>
        </button>
        <span className="unsaved-dot sidebar-unsaved-dot" role="img" aria-label="Unsaved" />
        <button type="button" className="tree-remove tree-pin" onClick={() => toggleNotePin(note.id)} title={notePinned ? "Unpin" : "Pin"} aria-label={`${notePinned ? "Unpin" : "Pin"} ${noteTitle(note)}`}>{notePinned ? <PinOff size={12} /> : <Pin size={12} />}</button>
      </div>
    );
  }

  function renderProgressRow(item: DocumentRecovery) {
    const kind = item.kind ?? documentKind(item.path);
    const name = item.name ?? basename(item.path);
    const itemPinned = pinned.includes(item.path);
    return (
      <div key={item.path} className={`tree-row-wrap pinnable-row ${activeDocument?.path === item.path ? "active" : ""}`}>
        <button type="button" className="tree-row" onClick={() => item.draft ? openDraft(item.path) : void openDocument(item.path)} title={name}>
          <span className="tree-chevron" /><FileTypeIcon kind={kind} size={14} /><span className="tree-label">{sidebarLabel(name, true)}</span>
        </button>
        <span className="unsaved-dot sidebar-unsaved-dot" role="img" aria-label="Unsaved" />
        <button type="button" className="tree-remove tree-pin" onClick={() => togglePin(item.path)} title={itemPinned ? "Unpin" : "Pin"} aria-label={`${itemPinned ? "Unpin" : "Pin"} ${name}`}>{itemPinned ? <PinOff size={12} /> : <Pin size={12} />}</button>
      </div>
    );
  }

  return (
    <main className={`app-shell ${htmlMode ? "html-mode" : ""} ${sidebarOpen ? "" : "sidebar-collapsed"} ${preferences.autoHideControls ? "" : "controls-always-visible"}`} onContextMenu={showContextMenu}>
      <div className={`global-drag-region ${sidebarOpen ? "sidebar-visible" : ""}`} role="presentation" data-tauri-drag-region onDoubleClick={() => appWindow?.toggleMaximize()} />
      <section className="workspace">
        <aside className="sidebar" aria-label="Workspace sidebar and application controls">
          <header className="sidebar-titlebar" data-tauri-drag-region>
            <div className="brand" data-tauri-drag-region>
              <span className="brand-name" data-tauri-drag-region><span className="brand-initial">V</span><span className="brand-rest">ellum</span></span>
            </div>
            <WindowControls />
          </header>
          <nav className="sidebar-section workspace-switch" aria-label="Workspace">
            {(["documents", "notes"] as Workspace[]).map((value) => (
              <button key={value} type="button" aria-label={value === "documents" ? "HTML and Markdown" : "TXT and notes"} title={value === "documents" ? "HTML and Markdown" : "TXT and notes"} aria-pressed={workspace === value} onClick={() => updateSession((current) => ({ ...current, workspace: value }))}>
                {value === "documents" ? <Code2 size={13} /> : <FileType2 size={13} />}
              </button>
            ))}
          </nav>
          <div className="sidebar-scroll">
          <section className="sidebar-section pinned-section">
            <button type="button" className="section-label section-toggle" aria-expanded={!collapsedSections.pinned} onClick={() => toggleSection("pinned")}>{collapsedSections.pinned ? <ChevronRight size={11} /> : <ChevronDown size={11} />}Pinned</button>
            {!collapsedSections.pinned ? <div className="tree">
              {workspace === "notes" ? pinnedInternalNotes.map(renderNoteRow) : null}
              {pinnedProgressItems.map(renderProgressRow)}
              {pinnedEntries.map((entry) => <TreeNode key={entry.path} entry={entry} activePath={activePath} root pinnedPaths={pinned} onOpen={openDocument} onPin={togglePin} onRemove={removeSidebarItem} onContextMenu={showContextMenu} />)}
              {!pinnedEntries.length && !pinnedProgressItems.length && (workspace !== "notes" || !pinnedInternalNotes.length) ? <div className="section-empty">Nothing pinned</div> : null}
            </div> : null}
          </section>
          <section className="sidebar-section open-section">
            <button type="button" className="section-label section-toggle" aria-expanded={!collapsedSections.open} onClick={() => toggleSection("open")}>{collapsedSections.open ? <ChevronRight size={11} /> : <ChevronDown size={11} />}In Progress</button>
            {!collapsedSections.open ? <div className="tree">
              {workspace === "notes" ? inProgressInternalNotes.map(renderNoteRow) : null}
              {openItems.map(renderProgressRow)}
              {!openItems.length && (workspace !== "notes" || !inProgressInternalNotes.length) ? <div className="section-empty">Nothing in progress</div> : null}
            </div> : null}
          </section>
          <section className={`sidebar-section recent-section ${collapsedSections.recent ? "collapsed" : ""}`}>
            <button type="button" className="section-label section-toggle" aria-expanded={!collapsedSections.recent} onClick={() => toggleSection("recent")}>{collapsedSections.recent ? <ChevronRight size={11} /> : <ChevronDown size={11} />}Recent</button>
            {!collapsedSections.recent ? <div className="tree">
              {displayedRecentEntries.map((entry) => <TreeNode key={entry.path} entry={entry} activePath={activePath} root pinnedPaths={pinned} onOpen={openDocument} onPin={togglePin} onRemove={removeSidebarItem} onContextMenu={showContextMenu} />)}
              {hiddenRecentCount > 0 ? <button type="button" className="recent-more" onClick={() => setRecentExpanded(true)} aria-expanded="false">More ({hiddenRecentCount})</button> : null}
              {recentExpanded && recentEntries.length > collapsedRecentCount ? <button type="button" className="recent-more" onClick={() => setRecentExpanded(false)} aria-expanded="true">Show less</button> : null}
              {!recentEntries.length ? <div className="section-empty">No recent items</div> : null}
            </div> : null}
          </section>
          </div>
          <footer className="sidebar-controls" aria-label="Viewer and application controls">
            <nav className="sidebar-command-bar" aria-label="Application controls">
              <button type="button" className={addMenuOpen ? "active" : ""} onClick={() => setAddMenuOpen((open) => !open)} title="Add or create" aria-label="Add file, folder, or document" aria-expanded={addMenuOpen}><Plus size={15} /></button>
              <button type="button" onClick={toggleTheme} title="Toggle theme" aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}>{resolvedTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />}</button>
              <button type="button" onClick={() => setSettingsOpen(true)} title="Settings (Ctrl+,)" aria-label="Open settings"><Settings size={15} /></button>
              <button type="button" onClick={() => setSidebarOpen((open) => !open)} title={`${sidebarOpen ? "Hide" : "Show"} sidebar (Ctrl+B)`} aria-label={`${sidebarOpen ? "Hide" : "Show"} sidebar`}>{sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}</button>
            </nav>
          </footer>
        </aside>
        <section className="main-pane">
          <div className="content-area">
            {error ? <div className="error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => setError(undefined)} aria-label="Dismiss error"><X size={14} /></button></div> : null}
            {viewerWarning ? <div className="error-banner viewer-warning" role="status"><span>Some HTML resources or browser features were blocked or failed to load.</span><button type="button" onClick={() => setViewerWarning(false)} aria-label="Dismiss warning"><X size={14} /></button></div> : null}
            {!hasActiveItem ? (
              <div className="welcome"><div className="welcome-content"><h1>Vellum</h1><p>A quiet place to read, edit, and organize documents and notes.</p><div className="welcome-actions"><button type="button" onClick={choosePath}>Open a file</button><button type="button" className="secondary" onClick={newNote}>New note</button></div><div className="welcome-shortcuts"><span><kbd>Ctrl O</kbd> Open file</span><span><kbd>Ctrl N</kbd> New note</span></div></div></div>
            ) : activeNote || activeDocument?.kind === "text" || editMode ? (
              <div className="editor-shell"><Suspense fallback={<div className="welcome"><p>Loading editor…</p></div>}><SourceEditor key={editorKey} value={draftContent} language={editorLanguage!} wrap={preferences.editorWrap} fontSize={preferences.editorFontSize} fontFamily={editorFonts[preferences.editorFont]} onChange={changeDraft} /></Suspense></div>
            ) : activeDocument?.kind === "markdown" ? (
              <article key={activeDocument.path} className="document markdown-body" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
            ) : activeDocument ? (
              <iframe key={activeDocument.path} ref={htmlFrame} className="html-frame" title={activeDocument.name} srcDoc={renderedHtml} sandbox="allow-forms allow-modals allow-popups allow-scripts" allow="clipboard-write" referrerPolicy="no-referrer" onLoad={() => { htmlFrame.current?.contentWindow?.postMessage({ type: "vellum-zoom", zoom: preferences.viewerZoom }, "*"); htmlFrame.current?.contentWindow?.postMessage({ type: "vellum-measure" }, "*"); }} />
            ) : null}
          </div>
          {hasActiveItem ? <div className="document-controls-wrap"><div className="document-controls" aria-label={activeNote || editMode ? "Editor controls" : "Viewer controls"}>
            {activeDocument && activeDocument.kind !== "text" ? <><div className="document-mode-toggle" aria-label="Document mode">
              <button type="button" className={!editMode ? "active" : ""} aria-pressed={!editMode} onClick={() => setEditMode(false)}>View</button>
              <button type="button" className={editMode ? "active" : ""} aria-pressed={editMode} onClick={() => setEditMode(true)}>Edit{dirty ? <span className="unsaved-dot" aria-label="Unsaved changes" /> : null}</button>
            </div>
            <span className="control-divider" aria-hidden="true" /></> : null}
            {activeNote || activeDocument?.kind === "text" || editMode ? <>
              <button type="button" disabled={!activeNote && !dirty && !activeDocument?.draft} onClick={() => void saveCurrent(false)} title="Save (Ctrl+S)" aria-label="Save"><Save size={14} /></button>
              <button type="button" className="save-as-control" onClick={() => void saveCurrent(true)} title="Save As (Ctrl+Shift+S)">Save As</button>
              {!activeNote && activeDocument ? <button type="button" disabled={!dirty} onClick={() => {
                setDraftContent(activeDocument.content);
                updateSession((current) => ({ ...current, documents: current.documents.filter((document) => document.path !== activeDocument.path) }));
              }} title="Revert" aria-label="Revert unsaved changes"><RotateCcw size={14} /></button> : null}
              <button type="button" className={preferences.editorWrap ? "active" : ""} onClick={() => setPreferences((current) => ({ ...current, editorWrap: !current.editorWrap }))} title="Word wrap" aria-label="Toggle word wrap"><WrapText size={14} /></button>
              {editorLanguage === "text" ? <div className="editor-counts" aria-label={`${wordCount} words, ${draftContent.length} characters`}><span>{wordCount} words</span><span>{draftContent.length} characters</span></div> : null}
              <span className="control-divider" aria-hidden="true" />
              <button type="button" onClick={() => setPreferences((current) => ({ ...current, editorFontSize: Math.max(11, current.editorFontSize - 1) }))} title="Decrease editor text" aria-label="Decrease editor text"><ZoomOut size={14} /></button>
              <button type="button" className="zoom-value" onClick={() => setPreferences((current) => ({ ...current, editorFontSize: 14 }))} title="Reset editor text size">{preferences.editorFontSize}px</button>
              <button type="button" onClick={() => setPreferences((current) => ({ ...current, editorFontSize: Math.min(22, current.editorFontSize + 1) }))} title="Increase editor text" aria-label="Increase editor text"><ZoomIn size={14} /></button>
              <details className="font-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }}>
                <summary aria-label="Editor font" style={{ fontFamily: editorFonts[preferences.editorFont] }}><span>{preferences.editorFont}</span><ChevronDown size={13} /></summary>
                <div className="font-picker-menu" role="menu" aria-label="Editor fonts">
                  {editorFontNames.map((font) => <button key={font} type="button" role="menuitemradio" aria-checked={font === preferences.editorFont} className={font === preferences.editorFont ? "active" : ""} style={{ fontFamily: editorFonts[font] }} onClick={(event) => { setPreferences((current) => ({ ...current, editorFont: font })); event.currentTarget.closest("details")?.removeAttribute("open"); }}>{font}</button>)}
                </div>
              </details>
            </> : <>
              <button type="button" onClick={() => { setFitToWidth(false); setPreferences((current) => ({ ...current, viewerZoom: Math.max(50, current.viewerZoom - 10) })); }} title="Zoom out" aria-label="Zoom out"><ZoomOut size={15} /></button>
              <button type="button" className="zoom-value" onClick={() => { setFitToWidth(false); setPreferences((current) => ({ ...current, viewerZoom: 100 })); }} title="Reset viewer zoom" aria-label={`Reset viewer zoom, currently ${preferences.viewerZoom}%`}>{preferences.viewerZoom}%</button>
              <button type="button" className={fitToWidth ? "active" : ""} onClick={fitViewer} title="Fit to width" aria-label="Fit document to width"><Scan size={15} /></button>
              <button type="button" onClick={() => { setFitToWidth(false); setPreferences((current) => ({ ...current, viewerZoom: Math.min(200, current.viewerZoom + 10) })); }} title="Zoom in" aria-label="Zoom in"><ZoomIn size={15} /></button>
            </>}
          </div></div> : null}
        </section>
      </section>

      {addMenuOpen ? <div className="sidebar-add-menu" role="menu" aria-label="Add to sidebar" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); void choosePath(); }}><FileText size={15} /><span><strong>Add file</strong><small>Choose Markdown, HTML, or text</small></span></button>
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); void chooseFolder(); }}><FolderPlus size={15} /><span><strong>Add folder</strong><small>Browse documents in the sidebar</small></span></button>
        <div className="sidebar-add-separator" />
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); newNote(); }}><StickyNote size={15} /><span><strong>New Note</strong><small>Create a persistent scratch note</small></span></button>
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); newDocument("markdown"); }}><FileText size={15} /><span><strong>New Markdown</strong><small>Create an empty .md document</small></span></button>
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); newDocument("html"); }}><FileCode2 size={15} /><span><strong>New HTML</strong><small>Create an HTML starter document</small></span></button>
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); newDocument("text"); }}><FileType2 className="icon-text" size={15} /><span><strong>New Text File</strong><small>Create an empty .txt document</small></span></button>
      </div> : null}

      {contextMenu ? <div className="context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y, bottom: contextMenu.bottom, maxHeight: contextMenu.maxHeight }} onPointerDown={(event) => event.stopPropagation()}><div ref={contextMenuScroll} className="context-menu-scroll" style={{ maxHeight: Math.max(0, contextMenu.maxHeight - 2) }} onScroll={(event) => { const menu = event.currentTarget; setContextMenuScrollHint(menu.scrollHeight <= menu.clientHeight + 1 ? undefined : menu.scrollTop + menu.clientHeight >= menu.scrollHeight - 1 ? "up" : "down"); }}>
        <div className="context-menu-label">Open</div>
        <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); void choosePath(); }}><Plus size={14} />Open file<span>Ctrl O</span></button>
        <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); void chooseFolder(); }}><FolderPlus size={14} />Open folder<span>Ctrl Shift O</span></button>
        <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); newNote(); }}><StickyNote size={14} />New Note<span>Ctrl N</span></button>
        <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); newDocument("markdown"); }}><FileText size={14} />New Markdown</button>
        <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); newDocument("html"); }}><FileCode2 size={14} />New HTML</button>
        <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); newDocument("text"); }}><FileType2 className="icon-text" size={14} />New Text File</button>
        {contextMenu.path && isSupported(contextMenu.path) ? <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); void openDocument(contextMenu.path!); }}>{documentIcon(contextMenu.path, 14)}Open selected</button> : null}
        <div className="context-menu-separator" />
        <div className="context-menu-label">Document</div>
        <button type="button" role="menuitem" disabled={!activeDocument || activeDocument.draft} onClick={() => { setContextMenu(undefined); void reloadDocument(); }}><RefreshCw size={14} />Reload<span>Ctrl R</span></button>
        <button type="button" role="menuitem" disabled={!hasActiveItem} onClick={() => { setContextMenu(undefined); void saveCurrent(false); }}><Save size={14} />Save<span>Ctrl S</span></button>
        <button type="button" role="menuitem" disabled={!activeDocument || activeDocument.kind === "text"} onClick={() => { setContextMenu(undefined); setEditMode((value) => !value); }}>{editMode ? <FileText size={14} /> : <FileCode2 size={14} />}{editMode ? "View document" : "Edit source"}<span>Ctrl E</span></button>
        <button type="button" role="menuitem" disabled={!hasActiveItem} onClick={() => { setContextMenu(undefined); closeDocument(); }}><X size={14} />Close<span>Ctrl W</span></button>
        <div className="context-menu-separator" />
        <div className="context-menu-label">View</div>
        <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); setFitToWidth(false); setPreferences((current) => ({ ...current, viewerZoom: 100 })); }}><ZoomIn size={14} />Reset zoom<span>{preferences.viewerZoom}%</span></button>
        <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); setSidebarOpen((value) => !value); }}>{sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}{sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}<span>Ctrl B</span></button>
        <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); toggleTheme(); }}>{resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}Switch theme</button>
        {contextMenu.path ? <><div className="context-menu-separator" /><button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); togglePin(contextMenu.path!); }}>{pinned.includes(contextMenu.path) ? <PinOff size={14} /> : <Pin size={14} />}{pinned.includes(contextMenu.path) ? "Unpin" : "Pin"}</button>{contextMenu.root ? <button type="button" role="menuitem" className="context-danger" onClick={() => { setContextMenu(undefined); removeSidebarItem(contextMenu.path!); }}><X size={14} />Remove from sidebar</button> : null}</> : null}
        {contextMenu.noteId ? <><div className="context-menu-separator" /><button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); toggleNotePin(contextMenu.noteId!); }}>{pinnedNotes.includes(contextMenu.noteId) ? <PinOff size={14} /> : <Pin size={14} />}{pinnedNotes.includes(contextMenu.noteId) ? "Unpin note" : "Pin note"}</button><button type="button" role="menuitem" className="context-danger" onClick={() => { const id = contextMenu.noteId!; setContextMenu(undefined); deleteNote(id); }}><Trash2 size={14} />Delete note</button></> : null}
        <div className="context-menu-separator" />
        <button type="button" role="menuitem" onClick={() => { setContextMenu(undefined); setSettingsOpen(true); }}><Settings size={14} />Settings<span>Ctrl ,</span></button>
      </div>{contextMenuScrollHint ? <div className="context-menu-more" aria-hidden="true">{contextMenuScrollHint === "up" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</div> : null}</div> : null}

      <dialog ref={settingsDialog} className="modal-backdrop" aria-labelledby="settings-title" onCancel={() => setSettingsOpen(false)} onClose={() => setSettingsOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <section className="settings-panel">
          <header><h2 id="settings-title">Settings</h2><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={17} /></button></header>
          <h3 className="settings-group-label">Interface</h3>
          <div className="setting-row"><div><strong>Appearance</strong><span>Choose how the application chrome is rendered.</span></div><select aria-label="Appearance" value={preferences.theme} onChange={(event) => setPreferences((current) => ({ ...current, theme: event.target.value as Theme }))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
          <div className="setting-row range-row"><div><strong>Interface scale</strong><span>Zoom the entire application without changing the window.</span></div><label><input aria-label="Interface scale" type="range" min="80" max="110" step="5" value={preferences.interfaceScale} onChange={(event) => setPreferences((current) => ({ ...current, interfaceScale: Number(event.target.value) }))} /><span>{preferences.interfaceScale}%</span></label></div>
          <div className="setting-row range-row"><div><strong>Sidebar transparency</strong><span>Adjust the translucency of the saved workspace.</span></div><label><input aria-label="Sidebar transparency" type="range" min="65" max="100" value={preferences.sidebarOpacity} onChange={(event) => setPreferences((current) => ({ ...current, sidebarOpacity: Number(event.target.value) }))} /><span>{preferences.sidebarOpacity}%</span></label></div>
          <div className="setting-row"><div><strong>Sidebar motion</strong><span>Choose how quickly the sidebar collapses and expands.</span></div><select aria-label="Sidebar motion" value={preferences.sidebarMotion} onChange={(event) => setPreferences((current) => ({ ...current, sidebarMotion: event.target.value as SidebarMotion }))}><option value="quick">Quick</option><option value="balanced">Balanced</option><option value="relaxed">Relaxed</option></select></div>
          <div className="setting-row"><div><strong>Auto-hide controls</strong><span>Fade the document controls until the pointer approaches.</span></div><label className="switch"><input aria-label="Auto-hide document controls" type="checkbox" checked={preferences.autoHideControls} onChange={(event) => setPreferences((current) => ({ ...current, autoHideControls: event.target.checked }))} /><span aria-hidden="true" /></label></div>
          <h3 className="settings-group-label">Reading</h3>
          <div className="setting-row range-row"><div><strong>Viewer zoom</strong><span>Set the default zoom for Markdown and HTML documents.</span></div><label><input aria-label="Viewer zoom" type="range" min="50" max="200" step="10" value={preferences.viewerZoom} onChange={(event) => { setFitToWidth(false); setPreferences((current) => ({ ...current, viewerZoom: Number(event.target.value) })); }} /><span>{preferences.viewerZoom}%</span></label></div>
          <div className="setting-row range-row"><div><strong>Reading width</strong><span>Set the maximum width of rendered Markdown.</span></div><label><input aria-label="Markdown reading width" type="range" min="680" max="1180" step="20" value={preferences.readingWidth} onChange={(event) => setPreferences((current) => ({ ...current, readingWidth: Number(event.target.value) }))} /><span>{preferences.readingWidth}px</span></label></div>
          <div className="setting-row range-row"><div><strong>Text scale</strong><span>Scale rendered document typography.</span></div><label><input aria-label="Markdown text scale" type="range" min="85" max="125" step="5" value={preferences.fontScale} onChange={(event) => setPreferences((current) => ({ ...current, fontScale: Number(event.target.value) }))} /><span>{preferences.fontScale}%</span></label></div>
          <div className="setting-row range-row"><div><strong>Line spacing</strong><span>Adjust the rhythm of rendered Markdown paragraphs.</span></div><label><input aria-label="Markdown line spacing" type="range" min="145" max="195" step="5" value={preferences.lineHeight} onChange={(event) => setPreferences((current) => ({ ...current, lineHeight: Number(event.target.value) }))} /><span>{preferences.lineHeight}%</span></label></div>
          <h3 className="settings-group-label">Editor</h3>
          <div className="setting-row"><div><strong>Word wrap</strong><span>Wrap long lines in every editor mode.</span></div><label className="switch"><input aria-label="Editor word wrap" type="checkbox" checked={preferences.editorWrap} onChange={(event) => setPreferences((current) => ({ ...current, editorWrap: event.target.checked }))} /><span aria-hidden="true" /></label></div>
          <div className="setting-row"><div><strong>Editor font</strong><span>Use an installed editor font with safe system fallbacks.</span></div><select aria-label="Editor font" value={preferences.editorFont} onChange={(event) => setPreferences((current) => ({ ...current, editorFont: event.target.value as EditorFont }))}>{editorFontNames.map((font) => <option key={font} style={{ fontFamily: editorFonts[font] }}>{font}</option>)}</select></div>
          <div className="setting-row range-row"><div><strong>Editor text size</strong><span>Adjust source text without changing rendered documents.</span></div><label><input aria-label="Editor text size" type="range" min="11" max="22" value={preferences.editorFontSize} onChange={(event) => setPreferences((current) => ({ ...current, editorFontSize: Number(event.target.value) }))} /><span>{preferences.editorFontSize}px</span></label></div>
          <div className="setting-row"><div><strong>Reset appearance</strong><span>Restore Vellum's default scale, reading, editor, and theme settings.</span></div><button type="button" className="reset-button" onClick={() => setPreferences(defaultPreferences)}><RefreshCw size={14} /> Reset</button></div>
        </section>
      </dialog>
    </main>
  );
}

export default App;
