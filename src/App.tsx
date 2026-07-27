import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { redo, redoDepth, selectAll, undo, undoDepth } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { contextMenuSections, type ContextMenuAction, type ContextMenuTarget } from "./contextMenu";
import FileTypeIcon from "./FileTypeIcon";
import WindowControls from "./WindowControls";
import { collapsedRecentCount, documentKind, sidebarLabel, touchRecent as moveRecentToFront, visibleRecents, withoutContainedFiles, type DocumentKind, type RecentItem } from "./recent";
import { fontScaleOptions, interfaceScaleOptions, normalizeSegmentedPreferences, readingWidthOptions, sidebarOpacityOptions, stepValue, type SegmentOption, type SegmentValue } from "./settings";
import { contentTitle, emptySession, noteTitle, reorderItems, sortNotes, updateDocumentRecovery, type DocumentRecovery, type Note, type SessionState, type Workspace } from "./session";
import {
  AArrowDown,
  AArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  FileOutput,
  FileText,
  FileType2,
  Folder,
  FolderOpen,
  FolderPlus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Redo2,
  RotateCcw,
  Save,
  Scan,
  Scissors,
  Search,
  Settings,
  StickyNote,
  Sun,
  TextSelect,
  Trash2,
  Undo2,
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
  title?: string;
  draft?: boolean;
};

type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;
type ContextMenuState = {
  x: number;
  y?: number;
  bottom?: number;
  maxHeight: number;
  target: ContextMenuTarget;
  path?: string;
  noteId?: string;
  selectedText?: string;
  toggleFolder?: () => void;
};
type ContextMenuRequest = Pick<ContextMenuState, "target" | "path" | "noteId" | "selectedText" | "toggleFolder">;
/* Replaces window.confirm, which rendered as OS browser chrome in WebView2
   and blocked the event loop. resolve is settled exactly once, by whichever
   of confirm, cancel, backdrop click or Escape happens first. */
type ConfirmRequest = { title: string; body: string; confirmLabel: string; danger?: boolean; resolve: (accepted: boolean) => void };
type RenamingItem = { kind: "document" | "note"; id: string; value: string };
type ViewerMetrics = { contentWidth: number; viewportWidth: number };
type EditorFont = "Zed Mono" | "JetBrains Mono" | "Cascadia Mono" | "Consolas";
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
const pinKey = (kind: "document" | "note", id: string) => `${kind}:${id}`;
const defaultPreferences: Preferences = {
  theme: "system",
  interfaceScale: 100,
  viewerZoom: 100,
  sidebarOpacity: 92,
  readingWidth: 880,
  fontScale: 100,
  lineHeight: 170,
  editorWrap: true,
  editorFontSize: 14,
  editorFont: "Zed Mono",
  autoHideControls: true,
  sidebarMotion: "balanced",
};
const sidebarMotionMs: Record<SidebarMotion, number> = { quick: 560, balanced: 700, relaxed: 900 };
const appearanceOptions = [
  { label: "Light", value: "light" },
  { label: "System", value: "system" },
  { label: "Dark", value: "dark" },
] as const;
const sidebarMotionOptions = [
  { label: "Slow", value: "relaxed" },
  { label: "Balanced", value: "balanced" },
  { label: "Fast", value: "quick" },
] as const;
const editorFonts: Record<EditorFont, string> = {
  "Zed Mono": '"Zed Mono", Consolas, monospace',
  "JetBrains Mono": '"JetBrains Mono", Consolas, monospace',
  "Cascadia Mono": '"Cascadia Mono", Consolas, monospace',
  "Consolas": "Consolas, monospace",
};
const editorFontNames = Object.keys(editorFonts) as EditorFont[];
const maxViewerSelectionChars = 1_000_000;
const editorFontAliases: Record<string, EditorFont> = {
  "Zed Mono": "Zed Mono",
  "JetBrains Mono": "JetBrains Mono",
  "Cascadia Mono": "Cascadia Mono",
  "Consolas": "Consolas",
  "Zed Mono NF": "Zed Mono",
  "JetBrains Mono NF": "JetBrains Mono",
  "Caskaydia Code NF": "Cascadia Mono",
  "Cascadia Code": "Cascadia Mono",
  "Fira Code": "Zed Mono",
  "IBM Plex Mono": "Cascadia Mono",
};

function readPreferences(): Preferences {
  const stored = readStored<Partial<Omit<Preferences, "editorFont">> & { editorFont?: string }>("vellum.preferences:v2", readStored("vellum.preferences:v1", {}));
  return normalizeSegmentedPreferences({ ...defaultPreferences, ...stored, editorFont: editorFontAliases[stored.editorFont ?? ""] ?? defaultPreferences.editorFont });
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

/* A low click opens the menu upward and a high one opens it downward, but in
   both directions the anchored edge sits on the pointer. The previous rule
   pinned `bottom: 8` for anything past the halfway mark, which parked the menu
   at the foot of the window: right-clicking just below centre put its menu
   most of a screen away from the cursor. maxHeight is the room actually
   available in whichever direction was chosen. Shared by the sidebar/editor
   path and the viewer-iframe path so the two cannot drift apart. */
function menuPlacement(x: number, y: number) {
  const openUp = y > window.innerHeight / 2;
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - 224)),
    ...(openUp ? { bottom: Math.max(8, window.innerHeight - y) } : { y }),
    maxHeight: (openUp ? y : window.innerHeight - y) - 8,
  };
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

const viewerScript = `(()=>{const root=document.documentElement,indicator=document.createElement("i"),warn=()=>parent.postMessage({type:"vellum-viewer-warning"},"*");indicator.className="vellum-scroll-indicator";root.append(indicator);let timer,frame=0;const measure=()=>{const previous=root.style.zoom;root.style.zoom="1";const contentWidth=Math.max(root.scrollWidth,document.body?.scrollWidth||0);root.style.zoom=previous;parent.postMessage({type:"vellum-viewer-metrics",contentWidth,viewportWidth:innerWidth},"*")};const setZoom=value=>{const zoom=Number(value);if(Number.isFinite(zoom))root.style.zoom=String(Math.max(.5,Math.min(2,zoom/100)))};const renderScroll=target=>{frame=0;const viewport=target===document.scrollingElement,rect=viewport?{top:0,right:innerWidth,height:innerHeight}:target.getBoundingClientRect(),height=Math.max(18,rect.height*rect.height/target.scrollHeight),travel=Math.max(0,rect.height-height),progress=target.scrollTop/Math.max(1,target.scrollHeight-target.clientHeight);indicator.style.top=(rect.top+travel*progress)+"px";indicator.style.left=(rect.right-2)+"px";indicator.style.height=height+"px";indicator.style.opacity=1;clearTimeout(timer);timer=setTimeout(()=>indicator.style.opacity=0,500)};addEventListener("load",measure);addEventListener("resize",measure);addEventListener("error",warn,true);addEventListener("unhandledrejection",warn);addEventListener("message",event=>{if(event.data?.type==="vellum-measure")measure();if(event.data?.type==="vellum-zoom")setZoom(event.data.zoom)});addEventListener("scroll",event=>{const target=event.target===document?document.scrollingElement:event.target;if(!target||frame)return;frame=requestAnimationFrame(()=>renderScroll(target))},true);addEventListener("contextmenu",event=>{event.preventDefault();parent.postMessage({type:"vellum-context-menu",x:event.clientX,y:event.clientY,selectedText:String(getSelection()?.toString()||"")},"*")});addEventListener("keydown",event=>{const key=event.key.toLowerCase();if(event.key==="F3"||((event.ctrlKey||event.metaKey)&&(key==="f"||key==="g")))event.preventDefault();if(event.key==="Escape")parent.postMessage({type:"vellum-viewer-escape"},"*")},true);addEventListener("pointerdown",()=>parent.postMessage({type:"vellum-viewer-pointerdown"},"*"),true)})()`;

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

function TreeNode({ entry, activePath, root = false, removable = false, pinnedPaths, onOpen, onPin, onRemove, onContextMenu }: {
  entry: Entry;
  activePath?: string;
  root?: boolean;
  removable?: boolean;
  pinnedPaths?: string[];
  onOpen: (path: string) => void;
  onPin?: (path: string) => void;
  onRemove?: (path: string) => void;
  onContextMenu: (event: ReactMouseEvent, target: {
    path: string;
    entryKind: Entry["kind"];
    root: boolean;
    expanded: boolean;
    toggleFolder?: () => void;
  }) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isDirectory = entry.kind === "directory";
  const pinned = pinnedPaths?.includes(entry.path) ?? false;
  const label = sidebarLabel(entry.name, !isDirectory);

  return (
    <div className={`tree-node ${root ? "tree-root" : ""}`}>
      <div className={`tree-row-wrap ${root ? "root-row" : onPin ? "pinnable-row" : ""} ${activePath === entry.path ? "active" : ""}`} onContextMenu={(event) => onContextMenu(event, {
        path: entry.path,
        entryKind: entry.kind,
        root: removable,
        expanded,
        toggleFolder: isDirectory ? () => setExpanded((value) => !value) : undefined,
      })}>
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
        {removable && onRemove ? <button type="button" className="tree-remove" onClick={() => onRemove(entry.path)} title="Remove from sidebar" aria-label={`Remove ${entry.name} from sidebar`}><X size={13} /></button> : null}
      </div>
      {isDirectory && expanded && entry.children?.length ? (
        <div className="tree-children">
          {entry.children.map((child) => <TreeNode key={child.path} entry={child} activePath={activePath} pinnedPaths={pinnedPaths} onOpen={onOpen} onPin={onPin} onContextMenu={onContextMenu} />)}
        </div>
      ) : null}
    </div>
  );
}

function SegmentedControl<T extends SegmentValue>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  const moveSelection = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  return (
    <div className="segmented-control" role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return <button key={String(option.value)} type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} className={selected ? "selected" : ""} onClick={() => onChange(option.value)} onKeyDown={(event) => moveSelection(event, index)}>{option.label}</button>;
      })}
    </div>
  );
}

function NumericStepper({ label, value, min, max, step, suffix, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="numeric-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(stepValue(value, -step, min, max))}>−</button>
      <output aria-label={`${label}: ${value}${suffix}`} aria-live="polite">{value}{suffix}</output>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(stepValue(value, step, min, max))}>+</button>
    </div>
  );
}

function App() {
  const [roots, setRoots] = useState<Entry[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>(() => readStored("vellum.recent:v2", []));
  const [pinned, setPinned] = useState<string[]>(() => readStored("vellum.pinned:v2", []));
  const [pinnedNotes, setPinnedNotes] = useState<string[]>(() => readStored("vellum.pinnedNotes:v1", []));
  const [pinOrder, setPinOrder] = useState<string[]>(() => readStored("vellum.pinOrder:v1", []));
  const [folderWorkspaces, setFolderWorkspaces] = useState<Record<string, Workspace>>(() => readStored("vellum.folderWorkspaces:v1", {}));
  const [session, setSession] = useState<SessionState>(emptySession);
  const [activeDocument, setActiveDocument] = useState<OpenDocument>();
  const [activeNoteId, setActiveNoteId] = useState<string>();
  const [draftContent, setDraftContent] = useState("");
  const [editMode, setEditMode] = useState(false);
  // Opening a file from Explorer is a read-first launch, so it starts with the
  // sidebar collapsed and never writes that back over the saved preference.
  const startupLaunch = useRef(Boolean(localStorage.getItem("vellum.startup-document:v1")));
  const [sidebarOpen, setSidebarOpen] = useState(() => startupLaunch.current ? false : readStored("vellum.sidebarOpen:v1", true));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest>();
  const [renamingItem, setRenamingItem] = useState<RenamingItem>();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [pinDrop, setPinDrop] = useState<{ key: string; after: boolean }>();
  const [draggedPinKey, setDraggedPinKey] = useState<string>();
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
  const editorView = useRef<EditorView | null>(null);
  const contextMenuElement = useRef<HTMLDivElement>(null);
  const contextMenuReturnFocus = useRef<HTMLElement | null>(null);
  const contextMenuScroll = useRef<HTMLDivElement>(null);
  const libraryRestored = useRef(false);
  const documentRestored = useRef(false);
  const sessionReady = useRef(false);
  const sessionWritable = useRef(true);
  const lastPersisted = useRef<string>(undefined);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const sessionRef = useRef(session);
  const openRequest = useRef(0);
  const rootsRef = useRef<Entry[]>([]);
  const activeDocumentRef = useRef<OpenDocument | undefined>(undefined);
  const pinPointer = useRef<{ key: string; pointerId: number; startX: number; startY: number; dragging: boolean } | undefined>(undefined);
  const suppressPinClick = useRef(false);
  const cancelRename = useRef(false);

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
  useEffect(() => { activeDocumentRef.current = activeDocument; }, [activeDocument]);

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
    if (contextMenu) requestAnimationFrame(() => contextMenuElement.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }, [contextMenu]);

  const touchRecent = useCallback((path: string, modifiedMs: number) => {
    setRecent((current) => moveRecentToFront(current, path, modifiedMs));
  }, []);

  const askConfirm = useCallback((request: Omit<ConfirmRequest, "resolve">) =>
    new Promise<boolean>((resolve) => setConfirmRequest({ ...request, resolve })), []);

  const settleConfirm = (accepted: boolean) => {
    confirmRequest?.resolve(accepted);
    setConfirmRequest(undefined);
  };

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
      touchRecent(path, modifiedMs);
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
      touchRecent(entry.path, await invoke<number>("path_recent_ms", { path: entry.path }));
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
        if (pinnedNotes.includes(activeNote.id)) {
          setPinned((current) => current.includes(entry.path) ? current : [...current, entry.path]);
          setPinOrder((current) => current.map((key) => key === pinKey("note", activeNote.id) ? pinKey("document", entry.path) : key));
        }
        setPinnedNotes((current) => current.filter((id) => id !== activeNote.id));
        updateSession((current) => ({
          ...current,
          notes: current.notes.filter((note) => note.id !== activeNote.id),
          documents: current.documents.filter((document) => document.path !== entry.path),
          active: { type: "document", path: entry.path },
          workspace: "notes",
        }));
        touchRecent(entry.path, modifiedMs);
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
        if (modifiedMs !== activeDocument.modifiedMs && !await askConfirm({
          title: "Overwrite newer file?",
          body: "This file changed outside Vellum since you opened it. Saving replaces the newer version on disk.",
          confirmLabel: "Overwrite",
          danger: true,
        })) return;
      }

      const modifiedMs = await invoke<number>("write_document", { path, content: draftContent });
      const entry = await invoke<Entry>("scan_path", { path });
      const assetBaseUrl = documentKind(entry.path) === "html" ? await invoke<string>("document_asset_base", { path: entry.path }) : undefined;
      setActiveDocument({ path: entry.path, name: entry.name, content: draftContent, kind: documentKind(entry.path), modifiedMs, assetBaseUrl });
      setRoots((current) => current.some((item) => item.path === entry.path) ? current : [...current, entry]);
      if (pinned.includes(activeDocument.path)) {
        setPinned((current) => [...current.filter((path) => path !== activeDocument.path && path !== entry.path), entry.path]);
        setPinOrder((current) => current.map((key) => key === pinKey("document", activeDocument.path) ? pinKey("document", entry.path) : key));
      }
      updateSession((current) => ({
        ...current,
        documents: current.documents.filter((document) => document.path !== activeDocument.path && document.path !== entry.path),
        active: { type: "document", path: entry.path },
        workspace: documentKind(entry.path) === "text" ? "notes" : "documents",
      }));
      touchRecent(entry.path, modifiedMs);
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
    if (!activeDocument || activeDocument.draft) return;
    if (dirty && !await askConfirm({
      title: "Discard unsaved changes?",
      body: "Reloading replaces what you have here with the version saved on disk.",
      confirmLabel: "Discard and reload",
      danger: true,
    })) return;
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
    setActiveDocument({ path, name: draft.name, content: draft.content, kind: draft.kind, modifiedMs: 0, title: draft.title, draft: true });
    setDraftContent(draft.content);
    setViewerMetrics(undefined);
    setViewerWarning(false);
    setEditMode(true);
    updateSession((current) => ({ ...current, active: { type: "document", path }, workspace: draft.kind === "text" ? "notes" : "documents" }));
  }, [updateSession]);

  const deleteNote = useCallback(async (id: string) => {
    const note = sessionRef.current.notes.find((item) => item.id === id);
    if (!note) return;
    if (!await askConfirm({
      title: "Delete note?",
      body: `"${noteTitle(note)}" has never been saved to a file. Deleting it cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    })) return;
    updateSession((current) => ({
      ...current,
      notes: current.notes.filter((item) => item.id !== id),
      active: current.active?.type === "note" && current.active.id === id ? null : current.active,
    }));
    setPinnedNotes((current) => current.filter((item) => item !== id));
    setPinOrder((current) => current.filter((key) => key !== pinKey("note", id)));
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
        activeDocument.draft ? { draft: true, kind: activeDocument.kind, name: activeDocument.name, title: activeDocument.title } : undefined,
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
      const storedRecent = readStored<RecentItem[]>("vellum.recent:v2", []);
      const recentPaths = storedRecent.length ? storedRecent.map((item) => item.path) : restored.map((entry) => entry.path);
      const refreshedRecent = await Promise.all(recentPaths.filter((path) => !missing.has(path)).map(async (path) => ({
        path,
        modifiedMs: await invoke<number>("path_recent_ms", { path }).catch(() => 0),
      })));
      if (cancelled) return;
      setRecent(refreshedRecent);
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

  // A second launch no longer starts its own process; the single-instance
  // plugin hands its arguments to this window instead. The sidebar is left
  // alone here on purpose: collapsing it is right for a cold launch, but
  // would be jarring in a window you are already working in.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen<{ path: string }>("vellum://open-document", (event) => {
      if (event.payload?.path) void openDocument(event.payload.path);
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, [openDocument]);

  useEffect(() => {
    const dialog = settingsDialog.current;
    if (settingsOpen && !dialog?.open) dialog?.showModal();
    if (!settingsOpen && dialog?.open) dialog.close();
  }, [settingsOpen]);

  useEffect(() => {
    const dialog = confirmDialog.current;
    if (confirmRequest && !dialog?.open) dialog?.showModal();
    if (!confirmRequest && dialog?.open) dialog.close();
  }, [confirmRequest]);

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
  useEffect(() => localStorage.setItem("vellum.pinOrder:v1", JSON.stringify(pinOrder)), [pinOrder]);
  useEffect(() => localStorage.setItem("vellum.folderWorkspaces:v1", JSON.stringify(folderWorkspaces)), [folderWorkspaces]);
  useEffect(() => {
    if (startupLaunch.current) return;
    localStorage.setItem("vellum.sidebarOpen:v1", JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);
  useEffect(() => localStorage.setItem("vellum.collapsedSections:v1", JSON.stringify(collapsedSections)), [collapsedSections]);

  // The effect below is a trailing debounce, so typing produces one write per
  // pause rather than a stream. This guard covers the other case: the effect
  // re-running when something unrelated changed the session object without
  // changing its contents. Marked persisted only after the write succeeds, so
  // a failed write is retried rather than silently swallowed.
  const persistSession = useCallback(async (value: SessionState) => {
    if (!sessionWritable.current) return;
    const serialized = JSON.stringify(value);
    if (serialized === lastPersisted.current) return;
    if (isTauri()) await invoke("save_session", { session: serialized });
    else localStorage.setItem("vellum.session:v1", serialized);
    lastPersisted.current = serialized;
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
      // Pointer events inside the frame never reach the parent window, so a
      // click on a rendered HTML document would otherwise leave the menu open.
      if (event.data?.type === "vellum-viewer-pointerdown") {
        closeMenu();
        return;
      }
      if (event.data?.type === "vellum-viewer-escape") {
        dismissContextMenu();
        return;
      }
      if (event.data?.type !== "vellum-context-menu") return;
      const rect = htmlFrame.current.getBoundingClientRect();
      const x = Number(event.data.x);
      const y = Number(event.data.y);
      const selectedText = event.data.selectedText;
      if (!Number.isFinite(x) || !Number.isFinite(y) || typeof selectedText !== "string" || selectedText.length > maxViewerSelectionChars) return;
      const document = activeDocumentRef.current;
      if (!document) return;
      const menuY = Math.max(8, rect.top + y);
      contextMenuReturnFocus.current = htmlFrame.current;
      // ponytail: a scripted document can forge this message and its text.
      // Copy remains user-triggered; add a private channel only if spoofing
      // becomes a demonstrated clipboard-poisoning problem.
      setContextMenu({
        ...menuPlacement(rect.left + x, menuY),
        target: { kind: "viewer", saved: !document.draft, selection: Boolean(selectedText) },
        path: document.draft ? undefined : document.path,
        selectedText,
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
    if (event.key === "Escape" && contextMenu) { dismissContextMenu(); return; }
    if (event.key === "Escape" && addMenuOpen) { setAddMenuOpen(false); return; }
    if (event.key === "Escape" && settingsOpen) { setSettingsOpen(false); return; }
    // Swallow every key WebView2 binds to its own unstyled find bar, not just
    // Ctrl+F: F3 and Ctrl+G open and advance the same bar, and F3 carries no
    // modifier, so it used to escape past the check below. CodeMirror binds
    // these on contentDOM and has already run by the time this bubbles to
    // window, so preventDefault here stops the native bar without costing the
    // editor its own find. The viewer iframe is a separate document and
    // suppresses them itself; see viewerScript.
    if (event.key === "F3") { event.preventDefault(); return; }
    if (!modifier) return;
    const key = event.key.toLowerCase();
    if (key === "f" || key === "g") { event.preventDefault(); return; }
    if (key === "n") { event.preventDefault(); newDocument("text"); }
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

  // Both outputs are only mounted when the editor is closed. Without the
  // editMode guard every keystroke paid for a full parse and sanitize whose
  // result was discarded (measured 5.1ms per keystroke on a 53KB document).
  const renderedMarkdown = useMemo(() => {
    if (editMode || !activeDocument || activeDocument.kind !== "markdown") return "";
    return DOMPurify.sanitize(marked.parse(draftContent, { async: false }) as string);
  }, [activeDocument, draftContent, editMode]);

  const renderedHtml = useMemo(() => {
    if (editMode || !activeDocument || activeDocument.kind !== "html") return "";
    return prepareHtml(draftContent, resolvedTheme, activeDocument.assetBaseUrl);
  }, [activeDocument, draftContent, editMode, resolvedTheme]);

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
  const recentCandidates = [...recent]
    .sort((a, b) => b.modifiedMs - a.modifiedMs)
    .flatMap((item) => {
      if (pinnedSet.has(item.path) || openPaths.has(item.path)) return [];
      const entry = findEntry(roots, item.path);
      if (entry?.kind === "directory" && (folderWorkspaces[item.path] ?? "documents") !== workspace) return [];
      const filtered = entry ? filterEntryForWorkspace(entry, workspace) : undefined;
      if (!filtered) return [];
      return [filtered];
    });
  const recentEntries = withoutContainedFiles(recentCandidates);
  const displayedRecentEntries = visibleRecents(recentEntries, recentExpanded);
  const hiddenRecentCount = recentEntries.length - displayedRecentEntries.length;
  const displayedNotes = sortNotes(session.notes);
  const pinnedInternalNotes = pinnedNotes.flatMap((id) => {
    const note = displayedNotes.find((item) => item.id === id);
    return note ? [note] : [];
  });
  const inProgressInternalNotes = displayedNotes.filter((note) => !pinnedNotes.includes(note.id));
  const allPinKeys = [...pinnedNotes.map((id) => pinKey("note", id)), ...pinned.map((path) => pinKey("document", path))];
  const allPinKeySet = new Set(allPinKeys);
  const orderedPinKeys = [...pinOrder.filter((key) => allPinKeySet.has(key)), ...allPinKeys.filter((key) => !pinOrder.includes(key))];
  const visibleNotePins = new Map(pinnedInternalNotes.map((note) => [pinKey("note", note.id), note]));
  const visibleDocumentPins = new Set([...pinnedProgressItems, ...pinnedEntries].map((item) => pinKey("document", item.path)));
  const visiblePinKeys = orderedPinKeys.filter((key) =>
    (workspace === "notes" && visibleNotePins.has(key)) || visibleDocumentPins.has(key));

  function removeSidebarItem(path: string) {
    setRecent((current) => current.filter((item) => item.path !== path));
    setPinned((current) => current.filter((item) => item !== path));
    setPinOrder((current) => current.filter((key) => key !== pinKey("document", path)));
    setRoots((current) => current.filter((entry) => entry.path !== path));
    setFolderWorkspaces((current) => Object.fromEntries(Object.entries(current).filter(([item]) => item !== path)));
  }

  async function togglePin(path: string) {
    const key = pinKey("document", path);
    if (pinned.includes(path)) {
      setPinned((current) => current.filter((item) => item !== path));
      setPinOrder((current) => current.filter((item) => item !== key));
    } else {
      setPinned((current) => [...current, path]);
      setPinOrder((current) => [...current.filter((item) => item !== key), key]);
      if (!recent.some((item) => item.path === path)) touchRecent(path, await invoke<number>("path_recent_ms", { path }));
    }
  }

  function toggleNotePin(id: string) {
    const key = pinKey("note", id);
    if (pinnedNotes.includes(id)) {
      setPinnedNotes((current) => current.filter((item) => item !== id));
      setPinOrder((current) => current.filter((item) => item !== key));
    } else {
      setPinnedNotes((current) => [...current, id]);
      setPinOrder((current) => [...current.filter((item) => item !== key), key]);
    }
  }

  function pinDragProps(key: string) {
    const targetAt = (x: number, y: number) => {
      const target = document.elementFromPoint(x, y)?.closest<HTMLElement>(".pinned-drag-item");
      const targetKey = target?.dataset.pinKey;
      if (!target || !targetKey) return;
      const bounds = target.getBoundingClientRect();
      return { key: targetKey, after: y >= bounds.top + bounds.height / 2 };
    };
    const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
      const pointer = pinPointer.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      if (pointer.dragging) {
        event.preventDefault();
        const target = cancelled ? undefined : targetAt(event.clientX, event.clientY);
        if (target) setPinOrder(() => reorderItems(orderedPinKeys, pointer.key, target.key, target.after));
        suppressPinClick.current = true;
        window.setTimeout(() => { suppressPinClick.current = false; }, 0);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      pinPointer.current = undefined;
      setPinDrop(undefined);
      setDraggedPinKey(undefined);
    };
    return {
      "data-pin-key": key,
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        pinPointer.current = { key, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
        const pointer = pinPointer.current;
        if (!pointer || pointer.pointerId !== event.pointerId) return;
        if (!pointer.dragging && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 4) return;
        if (!pointer.dragging) {
          pointer.dragging = true;
          setDraggedPinKey(pointer.key);
        }
        event.preventDefault();
        const target = targetAt(event.clientX, event.clientY);
        if (target) setPinDrop(target);
      },
      onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => finish(event),
      onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => finish(event, true),
      onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!suppressPinClick.current) return;
        event.preventDefault();
        event.stopPropagation();
      },
    };
  }

  function pinDropClass(key: string) {
    return pinDrop?.key === key ? ` drop-${pinDrop.after ? "after" : "before"}` : "";
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

  function dismissContextMenu(restoreFocus = true) {
    setContextMenu(undefined);
    if (restoreFocus) requestAnimationFrame(() => contextMenuReturnFocus.current?.focus());
  }

  function showContextMenu(event: ReactMouseEvent, request?: ContextMenuRequest) {
    event.preventDefault();
    event.stopPropagation();
    setAddMenuOpen(false);
    const element = event.target instanceof Element ? event.target : undefined;
    const rect = element?.getBoundingClientRect();
    const menuX = event.clientX || rect?.left || 8;
    const menuY = Math.max(8, event.clientY || rect?.bottom || 8);
    let next = request;
    if (!next && element?.closest(".source-editor") && editorView.current) {
      const view = editorView.current;
      next = {
        target: {
          kind: "editor",
          documentKind: activeNote ? undefined : activeDocument?.kind,
          saved: Boolean(activeDocument && !activeDocument.draft),
          dirty,
          selection: view.state.selection.ranges.some((range) => !range.empty),
          canUndo: undoDepth(view.state) > 0,
          canRedo: redoDepth(view.state) > 0,
        },
        path: activeDocument?.draft ? undefined : activeDocument?.path,
      };
    } else if (!next && element?.closest(".document") && activeDocument) {
      const selectedText = window.getSelection()?.toString() ?? "";
      const copyableText = selectedText.length <= maxViewerSelectionChars ? selectedText : undefined;
      next = {
        target: { kind: "viewer", saved: !activeDocument.draft, selection: Boolean(copyableText) },
        path: activeDocument.draft ? undefined : activeDocument.path,
        selectedText: copyableText,
      };
    }
    contextMenuReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setContextMenu({
      ...menuPlacement(menuX, menuY),
      ...(next ?? { target: { kind: "empty" } }),
    });
  }

  function showTreeContextMenu(event: ReactMouseEvent, item: {
    path: string;
    entryKind: Entry["kind"];
    root: boolean;
    expanded: boolean;
    toggleFolder?: () => void;
  }) {
    showContextMenu(event, {
      target: { kind: "sidebar-entry", entryKind: item.entryKind, root: item.root, expanded: item.expanded },
      path: item.path,
      toggleFolder: item.toggleFolder,
    });
  }

  function commitRename(item: RenamingItem) {
    const value = item.value.trim().slice(0, 80);
    setRenamingItem(undefined);
    if (!value) return;
    if (item.kind === "note") {
      updateSession((current) => ({ ...current, notes: current.notes.map((note) => note.id === item.id ? { ...note, title: value } : note) }));
      return;
    }
    const draft = sessionRef.current.documents.find((document) => document.path === item.id && document.draft);
    if (!draft) return;
    const title = sidebarLabel(value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-"), true);
    if (!title) return;
    const name = ensureExtension(title, draft.kind ?? documentKind(item.id));
    updateSession((current) => ({ ...current, documents: current.documents.map((document) => document.path === item.id ? { ...document, name, title } : document) }));
    setActiveDocument((current) => current?.path === item.id ? { ...current, name, title } : current);
  }

  function inlineRename(item: RenamingItem) {
    return <input
      className="sidebar-rename"
      value={item.value}
      maxLength={80}
      aria-label="Rename unsaved item"
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setRenamingItem({ ...item, value: event.currentTarget.value })}
      onBlur={(event) => {
        if (cancelRename.current) {
          cancelRename.current = false;
          setRenamingItem(undefined);
        } else {
          commitRename({ ...item, value: event.currentTarget.value });
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelRename.current = true;
          event.currentTarget.blur();
        }
      }}
    />;
  }

  function renderNoteRow(note: Note) {
    const notePinned = pinnedNotes.includes(note.id);
    const renaming = renamingItem?.kind === "note" && renamingItem.id === note.id ? renamingItem : undefined;
    return (
      <div key={note.id} className={`tree-row-wrap note-row ${activeNoteId === note.id ? "active" : ""}`} onContextMenu={(event) => showContextMenu(event, { target: { kind: "sidebar-note" }, noteId: note.id })}>
        {renaming ? <div className="tree-row"><span className="tree-chevron" /><FileTypeIcon kind="text" size={13} />{inlineRename(renaming)}</div> : <button type="button" className="tree-row" onClick={() => openNote(note.id)} title={noteTitle(note)}>
          <span className="tree-chevron" />
          <FileTypeIcon kind="text" size={13} />
          <span className="tree-label" onDoubleClick={() => setRenamingItem({ kind: "note", id: note.id, value: note.title || note.fallbackTitle })}>{noteTitle(note)}</span>
        </button>}
        <span className="unsaved-dot sidebar-unsaved-dot" role="img" aria-label="Unsaved" />
        <button type="button" className="tree-remove tree-pin" onClick={() => toggleNotePin(note.id)} title={notePinned ? "Unpin" : "Pin"} aria-label={`${notePinned ? "Unpin" : "Pin"} ${noteTitle(note)}`}>{notePinned ? <PinOff size={12} /> : <Pin size={12} />}</button>
      </div>
    );
  }

  function renderProgressRow(item: DocumentRecovery) {
    const kind = item.kind ?? documentKind(item.path);
    const name = item.name ?? basename(item.path);
    const label = item.draft ? item.title || contentTitle(item.content, sidebarLabel(name, true)) : sidebarLabel(name, true);
    const itemPinned = pinned.includes(item.path);
    const renaming = item.draft && renamingItem?.kind === "document" && renamingItem.id === item.path ? renamingItem : undefined;
    return (
      <div key={item.path} className={`tree-row-wrap pinnable-row ${activeDocument?.path === item.path ? "active" : ""}`} onContextMenu={(event) => showContextMenu(event, {
        target: { kind: "sidebar-progress", saved: !item.draft },
        path: item.path,
      })}>
        {renaming ? <div className="tree-row"><span className="tree-chevron" /><FileTypeIcon kind={kind} size={14} />{inlineRename(renaming)}</div> : <button type="button" className="tree-row" onClick={() => item.draft ? openDraft(item.path) : void openDocument(item.path)} title={label}>
          <span className="tree-chevron" /><FileTypeIcon kind={kind} size={14} /><span className="tree-label" onDoubleClick={() => item.draft && setRenamingItem({ kind: "document", id: item.path, value: item.title || sidebarLabel(name, true) })}>{label}</span>
        </button>}
        <span className="unsaved-dot sidebar-unsaved-dot" role="img" aria-label="Unsaved" />
        <button type="button" className="tree-remove tree-pin" onClick={() => togglePin(item.path)} title={itemPinned ? "Unpin" : "Pin"} aria-label={`${itemPinned ? "Unpin" : "Pin"} ${name}`}>{itemPinned ? <PinOff size={12} /> : <Pin size={12} />}</button>
      </div>
    );
  }

  function contextActionLabel(action: ContextMenuAction) {
    switch (action) {
      case "open-file": return "Open file";
      case "open-folder": return "Open folder";
      case "new-markdown": return "New Markdown";
      case "new-html": return "New HTML";
      case "new-text": return "New Text File";
      case "open-target":
      case "open-note": return "Open";
      case "toggle-folder": return contextMenu?.target.kind === "sidebar-entry" && contextMenu.target.expanded ? "Collapse" : "Expand";
      case "reveal-target": return "Open in Explorer";
      case "toggle-pin": return contextMenu?.path && pinned.includes(contextMenu.path) ? "Unpin" : "Pin";
      case "remove-sidebar": return "Remove from sidebar";
      case "toggle-note-pin": return contextMenu?.noteId && pinnedNotes.includes(contextMenu.noteId) ? "Unpin note" : "Pin note";
      case "rename": return "Rename";
      case "delete-note": return "Delete note";
      case "undo": return "Undo";
      case "redo": return "Redo";
      case "cut": return "Cut";
      case "copy-editor":
      case "copy-viewer": return "Copy";
      case "select-all": return "Select All";
      case "find": return "Find";
      case "save": return "Save";
      case "save-as": return "Save As";
      case "view-document": return "View document";
      case "reload": return "Reload";
      case "edit-source": return "Edit source";
      case "close": return activeNote ? "Close note" : "Close";
      case "toggle-sidebar": return sidebarOpen ? "Collapse sidebar" : "Expand sidebar";
      case "toggle-theme": return "Switch theme";
      case "settings": return "Settings";
    }
  }

  function contextActionIcon(action: ContextMenuAction) {
    switch (action) {
      case "open-file": return <Plus size={14} />;
      case "open-folder": return <FolderPlus size={14} />;
      case "new-markdown": return <FileTypeIcon kind="markdown" size={14} />;
      case "new-html": return <FileTypeIcon kind="html" size={14} />;
      case "new-text": return <FileTypeIcon kind="text" size={14} />;
      case "open-target": return contextMenu?.path && isSupported(contextMenu.path) ? documentIcon(contextMenu.path, 14) : <FolderOpen size={14} />;
      case "toggle-folder": return contextMenu?.target.kind === "sidebar-entry" && contextMenu.target.expanded ? <FolderOpen size={14} /> : <Folder size={14} />;
      case "reveal-target": return <ExternalLink size={14} />;
      case "toggle-pin": return contextMenu?.path && pinned.includes(contextMenu.path) ? <PinOff size={14} /> : <Pin size={14} />;
      case "remove-sidebar": return <X size={14} />;
      case "open-note": return <StickyNote size={14} />;
      case "toggle-note-pin": return contextMenu?.noteId && pinnedNotes.includes(contextMenu.noteId) ? <PinOff size={14} /> : <Pin size={14} />;
      case "rename": return <Pencil size={14} />;
      case "delete-note": return <Trash2 size={14} />;
      case "undo": return <Undo2 size={14} />;
      case "redo": return <Redo2 size={14} />;
      case "cut": return <Scissors size={14} />;
      case "copy-editor":
      case "copy-viewer": return <Copy size={14} />;
      case "select-all": return <TextSelect size={14} />;
      case "find": return <Search size={14} />;
      case "save": return <Save size={14} />;
      case "save-as": return <FileOutput size={14} />;
      case "view-document": return <FileText size={14} />;
      case "reload": return <RefreshCw size={14} />;
      case "edit-source": return <FileCode2 size={14} />;
      case "close": return <X size={14} />;
      case "toggle-sidebar": return sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />;
      case "toggle-theme": return resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />;
      case "settings": return <Settings size={14} />;
    }
  }

  function contextActionShortcut(action: ContextMenuAction) {
    switch (action) {
      case "open-file": return "Ctrl O";
      case "open-folder": return "Ctrl Shift O";
      case "new-text": return "Ctrl N";
      case "undo": return "Ctrl Z";
      case "redo": return "Ctrl Y";
      case "cut": return "Ctrl X";
      case "copy-editor":
      case "copy-viewer": return "Ctrl C";
      case "select-all": return "Ctrl A";
      case "find": return "Ctrl F";
      case "save": return "Ctrl S";
      case "save-as": return "Ctrl Shift S";
      case "view-document":
      case "edit-source": return "Ctrl E";
      case "reload": return "Ctrl R";
      case "close": return "Ctrl W";
      case "toggle-sidebar": return "Ctrl B";
      case "settings": return "Ctrl ,";
      default: return undefined;
    }
  }

  async function copyViewerText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      focused?.focus();
      if (!copied) setError("Vellum could not copy the selected text.");
    }
  }

  function runEditorAction(action: ContextMenuAction) {
    const view = editorView.current;
    if (!view) return;
    dismissContextMenu(false);
    view.focus();
    if (action === "undo") undo(view);
    else if (action === "redo") redo(view);
    else if (action === "select-all") selectAll(view);
    else if (action === "find") openSearchPanel(view);
    else if (action === "cut" || action === "copy-editor") {
      // ponytail: WebView2 blocks programmatic paste. Add
      // tauri-plugin-clipboard-manager only if Paste becomes required.
      document.execCommand(action === "cut" ? "cut" : "copy");
    }
  }

  async function runContextAction(action: ContextMenuAction) {
    const menu = contextMenu;
    if (!menu) return;
    if (["undo", "redo", "cut", "copy-editor", "select-all", "find"].includes(action)) {
      runEditorAction(action);
      return;
    }
    const path = menu.path;
    const noteId = menu.noteId;
    const selectedText = menu.selectedText;
    dismissContextMenu();
    switch (action) {
      case "open-file": await choosePath(); break;
      case "open-folder": await chooseFolder(); break;
      case "new-markdown": newDocument("markdown"); break;
      case "new-html": newDocument("html"); break;
      case "new-text": newDocument("text"); break;
      case "open-target":
        if (!path) break;
        if (menu.target.kind === "sidebar-progress" && !menu.target.saved) openDraft(path);
        else await openDocument(path);
        break;
      case "toggle-folder": menu.toggleFolder?.(); break;
      case "reveal-target":
        if (path) await revealItemInDir(path).catch((cause) => setError(String(cause)));
        break;
      case "toggle-pin": if (path) togglePin(path); break;
      case "remove-sidebar": if (path) removeSidebarItem(path); break;
      case "open-note": if (noteId) openNote(noteId); break;
      case "toggle-note-pin": if (noteId) toggleNotePin(noteId); break;
      case "rename":
        if (noteId) {
          const note = sessionRef.current.notes.find((item) => item.id === noteId);
          if (note) setRenamingItem({ kind: "note", id: noteId, value: note.title || note.fallbackTitle });
        } else if (path) {
          const draft = sessionRef.current.documents.find((item) => item.path === path && item.draft);
          if (draft) setRenamingItem({ kind: "document", id: path, value: draft.title || sidebarLabel(draft.name ?? basename(path), true) });
        }
        break;
      case "delete-note": if (noteId) await deleteNote(noteId); break;
      case "save": await saveCurrent(false); break;
      case "save-as": await saveCurrent(true); break;
      case "view-document": setEditMode(false); break;
      case "copy-viewer": if (selectedText) await copyViewerText(selectedText); break;
      case "reload": await reloadDocument(); break;
      case "edit-source": setEditMode(true); break;
      case "close": closeDocument(); break;
      case "toggle-sidebar": setSidebarOpen((value) => !value); break;
      case "toggle-theme": toggleTheme(); break;
      case "settings": setSettingsOpen(true); break;
      default: break;
    }
  }

  function handleContextMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismissContextMenu();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
        : event.key === "ArrowDown" ? (current + 1) % buttons.length
          : (current <= 0 ? buttons.length : current) - 1;
    buttons[next]?.focus();
  }

  const resolvedContextMenu = contextMenu ? contextMenuSections(contextMenu.target) : [];

  return (
    <main className={`app-shell ${htmlMode ? "html-mode" : ""} ${sidebarOpen ? "" : "sidebar-collapsed"} ${preferences.autoHideControls ? "" : "controls-always-visible"} ${draggedPinKey ? "pin-dragging" : ""}`} onContextMenu={showContextMenu}>
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
              {visiblePinKeys.flatMap((key) => {
                const note = visibleNotePins.get(key);
                if (note) return [<div key={key} className={`pinned-drag-item${draggedPinKey === key ? " is-dragging" : ""}${pinDropClass(key)}`} {...pinDragProps(key)}>{renderNoteRow(note)}</div>];
                const path = key.slice("document:".length);
                const progress = pinnedProgressItems.find((item) => item.path === path);
                if (progress) return [<div key={key} className={`pinned-drag-item${draggedPinKey === key ? " is-dragging" : ""}${pinDropClass(key)}`} {...pinDragProps(key)}>{renderProgressRow(progress)}</div>];
                const entry = pinnedEntries.find((item) => item.path === path);
                return entry ? [<div key={key} className={`pinned-drag-item${draggedPinKey === key ? " is-dragging" : ""}${pinDropClass(key)}`} {...pinDragProps(key)}><TreeNode entry={entry} activePath={activePath} root pinnedPaths={pinned} onOpen={openDocument} onPin={togglePin} onRemove={removeSidebarItem} onContextMenu={showTreeContextMenu} /></div>] : [];
              })}
              {!pinnedEntries.length && !pinnedProgressItems.length && (workspace !== "notes" || !pinnedInternalNotes.length) ? <div className="section-empty">Empty</div> : null}
            </div> : null}
          </section>
          <section className="sidebar-section open-section">
            <button type="button" className="section-label section-toggle" aria-expanded={!collapsedSections.open} onClick={() => toggleSection("open")}>{collapsedSections.open ? <ChevronRight size={11} /> : <ChevronDown size={11} />}In Progress</button>
            {!collapsedSections.open ? <div className="tree">
              {workspace === "notes" ? inProgressInternalNotes.map(renderNoteRow) : null}
              {openItems.map(renderProgressRow)}
              {!openItems.length && (workspace !== "notes" || !inProgressInternalNotes.length) ? <div className="section-empty">Empty</div> : null}
            </div> : null}
          </section>
          <section className={`sidebar-section recent-section ${collapsedSections.recent ? "collapsed" : ""}`}>
            <button type="button" className="section-label section-toggle" aria-expanded={!collapsedSections.recent} onClick={() => toggleSection("recent")}>{collapsedSections.recent ? <ChevronRight size={11} /> : <ChevronDown size={11} />}Recent</button>
            {!collapsedSections.recent ? <div className="tree">
              {displayedRecentEntries.map((entry) => <TreeNode key={entry.path} entry={entry} activePath={activePath} root removable pinnedPaths={pinned} onOpen={openDocument} onPin={togglePin} onRemove={removeSidebarItem} onContextMenu={showTreeContextMenu} />)}
              {hiddenRecentCount > 0 ? <button type="button" className="recent-more" onClick={() => setRecentExpanded(true)} aria-expanded="false">More ({hiddenRecentCount})</button> : null}
              {recentExpanded && recentEntries.length > collapsedRecentCount ? <button type="button" className="recent-more" onClick={() => setRecentExpanded(false)} aria-expanded="true">Show less</button> : null}
              {!recentEntries.length ? <div className="section-empty">Empty</div> : null}
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
              <div className="welcome"><div className="welcome-content"><h1>Vellum</h1><p>A quiet place to read, edit, and organize documents and notes.</p><div className="welcome-actions"><button type="button" onClick={choosePath}>Open a file</button><button type="button" className="secondary" onClick={() => newDocument("text")}>New text file</button></div><div className="welcome-shortcuts"><span><kbd>Ctrl O</kbd> Open file</span><span><kbd>Ctrl N</kbd> New text file</span></div></div></div>
            ) : activeNote || activeDocument?.kind === "text" || editMode ? (
              <div className="editor-shell"><Suspense fallback={<div className="welcome"><p>Loading editor…</p></div>}><SourceEditor key={editorKey} value={draftContent} language={editorLanguage!} wrap={preferences.editorWrap} fontSize={preferences.editorFontSize} fontFamily={editorFonts[preferences.editorFont]} onChange={changeDraft} onViewChange={(view) => { editorView.current = view; }} /></Suspense></div>
            ) : activeDocument?.kind === "markdown" ? (
              <article key={activeDocument.path} className="document markdown-body" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
            ) : activeDocument ? (
              <iframe key={activeDocument.path} ref={htmlFrame} className="html-frame" title={activeDocument.name} srcDoc={renderedHtml} sandbox="allow-forms allow-scripts" allow="clipboard-write" referrerPolicy="no-referrer" onLoad={() => { htmlFrame.current?.contentWindow?.postMessage({ type: "vellum-zoom", zoom: preferences.viewerZoom }, "*"); htmlFrame.current?.contentWindow?.postMessage({ type: "vellum-measure" }, "*"); }} />
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
              <button type="button" onClick={() => void saveCurrent(true)} title="Save As (Ctrl+Shift+S)" aria-label="Save As"><FileOutput size={14} /></button>
              {!activeNote && activeDocument ? <button type="button" disabled={!dirty} onClick={() => {
                setDraftContent(activeDocument.content);
                updateSession((current) => ({ ...current, documents: current.documents.filter((document) => document.path !== activeDocument.path) }));
              }} title="Revert" aria-label="Revert unsaved changes"><RotateCcw size={14} /></button> : null}
              <button type="button" className={preferences.editorWrap ? "active" : ""} onClick={() => setPreferences((current) => ({ ...current, editorWrap: !current.editorWrap }))} title="Word wrap" aria-label="Toggle word wrap"><WrapText size={14} /></button>
              {editorLanguage === "text" ? <div className="editor-counts" title="Words / characters" aria-label={`${wordCount} words, ${draftContent.length} characters`}>{wordCount} / {draftContent.length}</div> : null}
              <span className="control-divider" aria-hidden="true" />
              <button type="button" onClick={() => setPreferences((current) => ({ ...current, editorFontSize: Math.max(11, current.editorFontSize - 1) }))} title="Decrease editor text" aria-label="Decrease editor text"><AArrowDown size={15} /></button>
              <button type="button" className="zoom-value" onClick={() => setPreferences((current) => ({ ...current, editorFontSize: 14 }))} title="Reset editor text size">{preferences.editorFontSize}px</button>
              <button type="button" onClick={() => setPreferences((current) => ({ ...current, editorFontSize: Math.min(22, current.editorFontSize + 1) }))} title="Increase editor text" aria-label="Increase editor text"><AArrowUp size={15} /></button>
              <details
                className="font-picker"
                onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }}
                onKeyDown={(event) => {
                  // Every other overlay closes on Escape; this one only closed
                  // on blur, so Escape did nothing while it was open.
                  if (event.key !== "Escape" || !event.currentTarget.hasAttribute("open")) return;
                  event.stopPropagation();
                  event.currentTarget.removeAttribute("open");
                  event.currentTarget.querySelector("summary")?.focus();
                }}
              >
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
            {/* Outside the mode branches so these keep one fixed position in
                both modes. Reload and Close previously lived only in the
                context menu, so no single surface held every document action. */}
            <span className="control-divider" aria-hidden="true" />
            <button type="button" disabled={!activeDocument || activeDocument.draft} onClick={() => void reloadDocument()} title="Reload from disk (Ctrl+R)" aria-label="Reload from disk"><RefreshCw size={14} /></button>
            <button type="button" onClick={closeDocument} title="Close (Ctrl+W)" aria-label="Close"><X size={14} /></button>
          </div></div> : null}
        </section>
      </section>

      {addMenuOpen ? <div className="sidebar-add-menu" role="menu" aria-label="Add to sidebar" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); void choosePath(); }}><FileText size={15} /><span><strong>Add file</strong><small>Choose Markdown, HTML, or text</small></span></button>
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); void chooseFolder(); }}><FolderPlus size={15} /><span><strong>Add folder</strong><small>Browse documents in the sidebar</small></span></button>
        <div className="sidebar-add-separator" />
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); newDocument("markdown"); }}><FileTypeIcon kind="markdown" size={15} /><span><strong>New Markdown</strong><small>Create an empty .md document</small></span></button>
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); newDocument("html"); }}><FileTypeIcon kind="html" size={15} /><span><strong>New HTML</strong><small>Create an HTML starter document</small></span></button>
        <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); newDocument("text"); }}><FileTypeIcon kind="text" size={15} /><span><strong>New Text File</strong><small>Create an empty .txt document</small></span></button>
      </div> : null}

      {contextMenu ? <div
        ref={contextMenuElement}
        className="context-menu"
        role="menu"
        style={{ left: contextMenu.x, top: contextMenu.y, bottom: contextMenu.bottom, maxHeight: contextMenu.maxHeight }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={handleContextMenuKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
      ><div ref={contextMenuScroll} className="context-menu-scroll" style={{ maxHeight: Math.max(0, contextMenu.maxHeight - 2) }} onScroll={(event) => { const menu = event.currentTarget; setContextMenuScrollHint(menu.scrollHeight <= menu.clientHeight + 1 ? undefined : menu.scrollTop + menu.clientHeight >= menu.scrollHeight - 1 ? "up" : "down"); }}>
        {resolvedContextMenu.map((section, sectionIndex) => <div key={`${section.label ?? "actions"}-${sectionIndex}`}>
          {sectionIndex ? <div className="context-menu-separator" /> : null}
          {section.label ? <div className="context-menu-label">{section.label}</div> : null}
          {section.actions.map((action) => <button
            key={action}
            type="button"
            role="menuitem"
            className={action === "delete-note" ? "context-danger" : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void runContextAction(action)}
          >{contextActionIcon(action)}{contextActionLabel(action)}{contextActionShortcut(action) ? <span>{contextActionShortcut(action)}</span> : null}</button>)}
        </div>)}
      </div>{contextMenuScrollHint ? <div className="context-menu-more" aria-hidden="true">{contextMenuScrollHint === "up" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</div> : null}</div> : null}

      <dialog ref={settingsDialog} className="modal-backdrop" aria-labelledby="settings-title" onCancel={() => setSettingsOpen(false)} onClose={() => setSettingsOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <section className="settings-panel">
          <div className="settings-scroll">
            <header><h2 id="settings-title">Settings</h2><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={17} /></button></header>
            <h3 className="settings-group-label">Interface</h3>
            <div className="setting-row"><div><strong>Appearance</strong><span>Choose how the application chrome is rendered.</span></div><SegmentedControl label="Appearance" value={preferences.theme} options={appearanceOptions} onChange={(theme) => setPreferences((current) => ({ ...current, theme }))} /></div>
            <div className="setting-row"><div><strong>Interface scale</strong><span>Zoom the entire application without changing the window.</span></div><SegmentedControl label="Interface scale" value={preferences.interfaceScale} options={interfaceScaleOptions} onChange={(interfaceScale) => setPreferences((current) => ({ ...current, interfaceScale }))} /></div>
            <div className="setting-row"><div><strong>Sidebar transparency</strong><span>Adjust the translucency of the saved workspace.</span></div><SegmentedControl label="Sidebar transparency" value={preferences.sidebarOpacity} options={sidebarOpacityOptions} onChange={(sidebarOpacity) => setPreferences((current) => ({ ...current, sidebarOpacity }))} /></div>
            <div className="setting-row"><div><strong>Sidebar motion</strong><span>Choose how quickly the sidebar collapses and expands.</span></div><SegmentedControl label="Sidebar motion" value={preferences.sidebarMotion} options={sidebarMotionOptions} onChange={(sidebarMotion) => setPreferences((current) => ({ ...current, sidebarMotion }))} /></div>
            <div className="setting-row"><div><strong>Auto-hide controls</strong><span>Fade the document controls until the pointer approaches.</span></div><label className="switch"><input aria-label="Auto-hide document controls" type="checkbox" checked={preferences.autoHideControls} onChange={(event) => setPreferences((current) => ({ ...current, autoHideControls: event.target.checked }))} /><span aria-hidden="true" /></label></div>
            <h3 className="settings-group-label">Reading</h3>
            <div className="setting-row"><div><strong>Viewer zoom</strong><span>Set the default zoom for Markdown and HTML documents.</span></div><NumericStepper label="Viewer zoom" value={preferences.viewerZoom} min={50} max={200} step={10} suffix="%" onChange={(viewerZoom) => { setFitToWidth(false); setPreferences((current) => ({ ...current, viewerZoom })); }} /></div>
            <div className="setting-row"><div><strong>Reading width</strong><span>Set the maximum width of rendered Markdown.</span></div><SegmentedControl label="Markdown reading width" value={preferences.readingWidth} options={readingWidthOptions} onChange={(readingWidth) => setPreferences((current) => ({ ...current, readingWidth }))} /></div>
            <div className="setting-row"><div><strong>Text scale</strong><span>Scale rendered document typography.</span></div><SegmentedControl label="Markdown text scale" value={preferences.fontScale} options={fontScaleOptions} onChange={(fontScale) => setPreferences((current) => ({ ...current, fontScale }))} /></div>
            <div className="setting-row"><div><strong>Line spacing</strong><span>Adjust the rhythm of rendered Markdown paragraphs.</span></div><NumericStepper label="Markdown line spacing" value={preferences.lineHeight} min={145} max={195} step={10} suffix="%" onChange={(lineHeight) => setPreferences((current) => ({ ...current, lineHeight }))} /></div>
            <h3 className="settings-group-label">Editor</h3>
            <div className="setting-row"><div><strong>Word wrap</strong><span>Wrap long lines in every editor mode.</span></div><label className="switch"><input aria-label="Editor word wrap" type="checkbox" checked={preferences.editorWrap} onChange={(event) => setPreferences((current) => ({ ...current, editorWrap: event.target.checked }))} /><span aria-hidden="true" /></label></div>
            <div className="setting-row"><div><strong>Editor font</strong><span>Use an installed editor font with safe system fallbacks.</span></div><details
              className="font-picker settings-font-picker"
              onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || !event.currentTarget.hasAttribute("open")) return;
                event.stopPropagation();
                event.currentTarget.removeAttribute("open");
                event.currentTarget.querySelector("summary")?.focus();
              }}
            >
              <summary aria-label="Editor font" style={{ fontFamily: editorFonts[preferences.editorFont] }}><span>{preferences.editorFont}</span><ChevronDown size={13} /></summary>
              <div className="font-picker-menu" role="menu" aria-label="Editor fonts">
                {editorFontNames.map((font) => <button key={font} type="button" role="menuitemradio" aria-checked={font === preferences.editorFont} className={font === preferences.editorFont ? "active" : ""} style={{ fontFamily: editorFonts[font] }} onClick={(event) => { setPreferences((current) => ({ ...current, editorFont: font })); event.currentTarget.closest("details")?.removeAttribute("open"); }}>{font}</button>)}
              </div>
            </details></div>
            <div className="setting-row"><div><strong>Editor text size</strong><span>Adjust source text without changing rendered documents.</span></div><NumericStepper label="Editor text size" value={preferences.editorFontSize} min={11} max={22} step={1} suffix="px" onChange={(editorFontSize) => setPreferences((current) => ({ ...current, editorFontSize }))} /></div>
            <div className="setting-row"><div><strong>Reset all settings</strong><span>Restore every setting to Vellum's defaults.</span></div><button type="button" className="reset-button" onClick={() => setPreferences(defaultPreferences)}><RefreshCw size={14} /> Reset</button></div>
          </div>
        </section>
      </dialog>

      <dialog
        ref={confirmDialog}
        className="modal-backdrop"
        aria-labelledby="confirm-title"
        onCancel={(event) => { event.preventDefault(); settleConfirm(false); }}
        onClick={(event) => { if (event.target === event.currentTarget) settleConfirm(false); }}
      >
        {confirmRequest ? (
          <section className="confirm-panel" role="alertdialog" aria-describedby="confirm-body">
            <h2 id="confirm-title">{confirmRequest.title}</h2>
            <p id="confirm-body">{confirmRequest.body}</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" onClick={() => settleConfirm(false)}>Cancel</button>
              {/* Cancel is first in source order, so showModal focuses it.
                  That is the right default when the action is destructive. */}
              <button type="button" className={confirmRequest.danger ? "confirm-accept danger" : "confirm-accept"} onClick={() => settleConfirm(true)}>{confirmRequest.confirmLabel}</button>
            </div>
          </section>
        ) : null}
      </dialog>
    </main>
  );
}

export default App;
