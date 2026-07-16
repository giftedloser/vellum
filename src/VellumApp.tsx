import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { ChevronDown, ChevronRight, FileCode2, FileText, Folder, FolderOpen, FolderPlus, Maximize2, Minus, Moon, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Plus, RefreshCw, RotateCcw, Save, Settings, Sun, WrapText, X, ZoomIn, ZoomOut, Scan } from "lucide-react";

const SourceEditor = lazy(() => import("./Editor"));
type Entry = { name: string; path: string; kind: "file" | "directory"; children?: Entry[] };
type OpenDocument = { path: string; name: string; content: string; kind: "markdown" | "html"; modifiedMs: number; draft?: boolean };
type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";
type RecentItem = { path: string; kind: "file" | "directory"; lastOpened: number };
type EditorFont = "JetBrains Mono" | "Cascadia Code" | "IBM Plex Mono" | "Fira Code";
type Preferences = { theme: Theme; viewerZoom: number; sidebarOpacity: number; readingWidth: number; fontScale: number; lineHeight: number; rememberDocument: boolean; editorWrap: boolean; editorFontSize: number; editorFont: EditorFont };

const appWindow = isTauri() ? getCurrentWindow() : undefined;
const allowedExtensions = ["md", "markdown", "html", "htm"];
const defaults: Preferences = { theme: "system", viewerZoom: 100, sidebarOpacity: 84, readingWidth: 880, fontScale: 95, lineHeight: 170, rememberDocument: true, editorWrap: true, editorFontSize: 14, editorFont: "JetBrains Mono" };
const fontStacks: Record<EditorFont, string> = {
  "JetBrains Mono": '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
  "Cascadia Code": '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
  "IBM Plex Mono": '"IBM Plex Mono", "Cascadia Code", Consolas, monospace',
  "Fira Code": '"Fira Code", "Cascadia Code", Consolas, monospace',
};
function readStored<T>(key: string, fallback: T): T { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function basename(path: string) { return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path; }
function extension(path: string) { return path.split(".").at(-1)?.toLowerCase() ?? ""; }
function isSupported(path: string) { return allowedExtensions.includes(extension(path)); }
function kindFor(path: string): "markdown" | "html" { return extension(path).startsWith("htm") ? "html" : "markdown"; }
function documentIcon(path: string, size = 15) { return kindFor(path) === "html" ? <FileCode2 size={size} className="icon-html" /> : <FileText size={size} className="icon-markdown" />; }
function findEntry(entries: Entry[], path: string): Entry | undefined { for (const entry of entries) { if (entry.path === path) return entry; const nested = entry.children && findEntry(entry.children, path); if (nested) return nested; } }
function topRootFor(entries: Entry[], path: string): Entry | undefined { return entries.find((entry) => path === entry.path || path.startsWith(`${entry.path}\\`) || path.startsWith(`${entry.path}/`)); }
const viewerScript = `(()=>{const root=document.documentElement,indicator=document.createElement("i");indicator.className="vellum-scroll-indicator";root.append(indicator);let timer;const measure=()=>{const previous=root.style.zoom;root.style.zoom="1";const contentWidth=Math.max(root.scrollWidth,document.body?.scrollWidth||0);root.style.zoom=previous;parent.postMessage({type:"vellum-viewer-metrics",contentWidth,viewportWidth:innerWidth},"*")};const setZoom=value=>{const zoom=Number(value);if(Number.isFinite(zoom))root.style.zoom=String(Math.max(.5,Math.min(2,zoom/100)))};addEventListener("load",measure);addEventListener("resize",measure);addEventListener("message",event=>{if(event.data?.type==="vellum-measure")measure();if(event.data?.type==="vellum-zoom")setZoom(event.data.zoom)});addEventListener("scroll",event=>{const target=event.target===document?document.scrollingElement:event.target;if(!target)return;const viewport=target===document.scrollingElement,rect=viewport?{top:0,right:innerWidth,height:innerHeight}:target.getBoundingClientRect(),height=Math.max(18,rect.height*rect.height/target.scrollHeight),travel=Math.max(0,rect.height-height),progress=target.scrollTop/Math.max(1,target.scrollHeight-target.clientHeight);indicator.style.top=(rect.top+travel*progress)+"px";indicator.style.left=(rect.right-2)+"px";indicator.style.height=height+"px";indicator.style.opacity=1;clearTimeout(timer);timer=setTimeout(()=>indicator.style.opacity=0,500)},true)})()`;
function prepareHtml(content: string, theme: ResolvedTheme) { const thumb = theme === "dark" ? "rgba(220,212,196,.24)" : "rgba(92,78,54,.28)"; const injected = `<style>*{scrollbar-width:none}::-webkit-scrollbar{display:none}.vellum-scroll-indicator{position:fixed;z-index:2147483647;width:2px;border-radius:999px;background:${thumb};pointer-events:none;opacity:0;transition:opacity 120ms}</style><script>${viewerScript}</script>`; return /<\/head>/i.test(content) ? content.replace(/<\/head>/i, `${injected}</head>`) : `${injected}${content}`; }

function TreeNode({ entry, activePath, pinned, onOpen, onPin, onRemove }: { entry: Entry; activePath?: string; pinned: boolean; onOpen: (path: string) => void; onPin: (path: string) => void; onRemove: (path: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const directory = entry.kind === "directory";
  return <div className="tree-node"><div className={`tree-row-wrap ${activePath === entry.path ? "active" : ""}`}>
    <button className="tree-row" type="button" title={entry.path} onClick={() => directory ? setExpanded((v) => !v) : onOpen(entry.path)}><span className="tree-chevron">{directory ? expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/> : null}</span>{directory ? expanded ? <FolderOpen size={16} className="icon-folder"/> : <Folder size={16} className="icon-folder"/> : documentIcon(entry.path)}<span className="tree-label">{entry.name}</span></button>
    <button className="tree-remove tree-pin" type="button" onClick={() => onPin(entry.path)} title={pinned ? "Unpin" : "Pin"}>{pinned ? <PinOff size={12}/> : <Pin size={12}/>}</button>
    <button className="tree-remove" type="button" onClick={() => onRemove(entry.path)} title="Remove from sidebar"><X size={12}/></button>
  </div>{directory && expanded && entry.children?.length ? <div className="tree-children">{entry.children.map((child) => <TreeNode key={child.path} entry={child} activePath={activePath} pinned={pinned} onOpen={onOpen} onPin={onPin} onRemove={onRemove}/>)}</div> : null}</div>;
}

export default function VellumApp() {
  const [roots, setRoots] = useState<Entry[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>(() => readStored("vellum.recent:v2", []));
  const [pinned, setPinned] = useState<string[]>(() => readStored("vellum.pinned:v2", []));
  const [activeDocument, setActiveDocument] = useState<OpenDocument>();
  const [draftContent, setDraftContent] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => readStored("vellum.sidebarOpen:v1", true));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(() => ({ ...defaults, ...readStored("vellum.preferences:v2", readStored("vellum.preferences:v1", defaults)) }));
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [error, setError] = useState<string>();
  const htmlFrame = useRef<HTMLIFrameElement>(null);
  const activePath = activeDocument?.path;
  const dirty = Boolean(activeDocument && draftContent !== activeDocument.content);
  const touchRecent = useCallback((path: string, kind: "file" | "directory") => setRecent((current) => [{ path, kind, lastOpened: Date.now() }, ...current.filter((item) => item.path !== path)].slice(0, 30)), []);
  const confirmDiscard = useCallback(() => !dirty || window.confirm("Discard unsaved changes?"), [dirty]);

  const openDocument = useCallback(async (path: string) => {
    if (!isSupported(path) || !confirmDiscard()) return;
    try {
      const [content, modifiedMs] = await Promise.all([invoke<string>("read_document", { path }), invoke<number>("document_modified_ms", { path })]);
      setActiveDocument({ path, name: basename(path), content, kind: kindFor(path), modifiedMs }); setDraftContent(content); setEditMode(false); setError(undefined);
      const owner = topRootFor(roots, path); touchRecent(owner?.path ?? path, owner?.kind ?? "file");
    } catch (cause) { setError(String(cause)); }
  }, [confirmDiscard, roots, touchRecent]);

  const addPath = useCallback(async (directory: boolean) => {
    const selected = await open({ multiple: false, directory, filters: directory ? undefined : [{ name: "Documents", extensions: allowedExtensions }] });
    if (typeof selected !== "string") return;
    try { const entry = await invoke<Entry>("scan_path", { path: selected }); setRoots((current) => current.some((item) => item.path === entry.path) ? current : [...current, entry]); touchRecent(entry.path, entry.kind); if (entry.kind === "file") await openDocument(entry.path); } catch (cause) { setError(String(cause)); }
  }, [openDocument, touchRecent]);

  const saveCurrent = useCallback(async (saveAs = false) => {
    if (!activeDocument) return;
    let path = activeDocument.path;
    if (activeDocument.draft || saveAs) { const selected = await save({ defaultPath: activeDocument.name, filters: [{ name: activeDocument.kind === "html" ? "HTML" : "Markdown", extensions: activeDocument.kind === "html" ? ["html", "htm"] : ["md", "markdown"] }] }); if (!selected) return; path = selected; }
    else { const currentModified = await invoke<number>("document_modified_ms", { path }); if (currentModified !== activeDocument.modifiedMs && !window.confirm("This file changed outside Vellum. Overwrite the newer version?")) return; }
    try { const modifiedMs = await invoke<number>("write_document", { path, content: draftContent }); const next = { ...activeDocument, path, name: basename(path), kind: kindFor(path), content: draftContent, modifiedMs, draft: false }; setActiveDocument(next); if (!roots.some((entry) => entry.path === path)) setRoots((current) => [...current, { name: basename(path), path, kind: "file" }]); touchRecent(path, "file"); } catch (cause) { setError(String(cause)); }
  }, [activeDocument, draftContent, roots, touchRecent]);

  const newDocument = useCallback((kind: "markdown" | "html") => { if (!confirmDiscard()) return; const content = kind === "html" ? "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>Untitled</title>\n</head>\n<body>\n  \n</body>\n</html>\n" : ""; const name = kind === "html" ? "Untitled.html" : "Untitled.md"; setActiveDocument({ path: `draft://${name}`, name, content, kind, modifiedMs: 0, draft: true }); setDraftContent(content); setEditMode(true); }, [confirmDiscard]);

  useEffect(() => { localStorage.setItem("vellum.recent:v2", JSON.stringify(recent)); }, [recent]);
  useEffect(() => { localStorage.setItem("vellum.pinned:v2", JSON.stringify(pinned)); }, [pinned]);
  useEffect(() => { localStorage.setItem("vellum.sidebarOpen:v1", JSON.stringify(sidebarOpen)); }, [sidebarOpen]);
  useEffect(() => { localStorage.setItem("vellum.preferences:v2", JSON.stringify(preferences)); document.documentElement.style.setProperty("--sidebar-opacity", String(preferences.sidebarOpacity / 100)); document.documentElement.style.setProperty("--reading-width", `${preferences.readingWidth}px`); document.documentElement.style.setProperty("--font-scale", String(preferences.fontScale / 100)); document.documentElement.style.setProperty("--line-height", String(preferences.lineHeight / 100)); document.documentElement.style.setProperty("--viewer-zoom", `${preferences.viewerZoom}%`); }, [preferences]);
  useEffect(() => { const media = matchMedia("(prefers-color-scheme: dark)"); const apply = () => { const value = preferences.theme === "system" ? media.matches ? "dark" : "light" : preferences.theme; setResolvedTheme(value); document.documentElement.dataset.theme = value; }; apply(); media.addEventListener("change", apply); return () => media.removeEventListener("change", apply); }, [preferences.theme]);
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; addEventListener("beforeunload", handler); return () => removeEventListener("beforeunload", handler); }, [dirty]);
  useEffect(() => { let cancelled = false; void (async () => { const saved = readStored<string[]>("vellum.library:v1", []); const entries = await Promise.all(saved.map(async (path) => { try { return await invoke<Entry>("scan_path", { path }); } catch { return undefined; } })); if (!cancelled) setRoots(entries.filter((entry): entry is Entry => Boolean(entry))); })(); return () => { cancelled = true; }; }, []);
  useEffect(() => { localStorage.setItem("vellum.library:v1", JSON.stringify(roots.map((entry) => entry.path))); }, [roots]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => { const mod = event.ctrlKey || event.metaKey; if (!mod) return; const key = event.key.toLowerCase(); if (key === "s" && activeDocument) { event.preventDefault(); void saveCurrent(event.shiftKey); } else if (key === "e" && activeDocument) { event.preventDefault(); setEditMode((value) => !value); } else if (key === "o") { event.preventDefault(); void addPath(event.shiftKey); } else if (key === "b") { event.preventDefault(); setSidebarOpen((value) => !value); } });
  useEffect(() => { addEventListener("keydown", onKeyDown); return () => removeEventListener("keydown", onKeyDown); }, []);

  const renderedMarkdown = useMemo(() => activeDocument?.kind === "markdown" ? DOMPurify.sanitize(marked.parse(activeDocument.content, { async: false }) as string) : "", [activeDocument]);
  const renderedHtml = useMemo(() => activeDocument?.kind === "html" ? prepareHtml(activeDocument.content, resolvedTheme) : "", [activeDocument, resolvedTheme]);
  const pinnedEntries = pinned.map((path) => findEntry(roots, path)).filter((entry): entry is Entry => Boolean(entry));
  const recentEntries = recent.filter((item) => !pinned.includes(item.path)).map((item) => findEntry(roots, item.path)).filter((entry): entry is Entry => Boolean(entry));
  const removeSidebarItem = (path: string) => { setRecent((items) => items.filter((item) => item.path !== path)); setPinned((items) => items.filter((item) => item !== path)); setRoots((items) => items.filter((item) => item.path !== path)); };
  const togglePin = (path: string) => setPinned((items) => items.includes(path) ? items.filter((item) => item !== path) : [path, ...items]);

  return <main className={`app-shell ${activeDocument?.kind === "html" ? "html-mode" : ""} ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
    <div className={`global-drag-region ${sidebarOpen ? "sidebar-visible" : ""}`} data-tauri-drag-region onDoubleClick={() => appWindow?.toggleMaximize()} />
    <section className="workspace"><aside className="sidebar"><nav className="sidebar-rail"><img className="rail-mark" src={resolvedTheme === "dark" ? "/vellum-v-parchment.svg" : "/vellum-v-ink.svg"} alt=""/><span className="rail-spacer"/><button onClick={() => void addPath(false)}><Plus size={15}/></button><button onClick={() => void addPath(true)}><FolderPlus size={15}/></button><button onClick={() => setSidebarOpen(true)}><PanelLeftOpen size={16}/></button></nav>
      <header className="sidebar-titlebar" data-tauri-drag-region><div className="brand"><span className="brand-name"><span className="brand-initial">V</span>ellum</span></div></header>
      <section className="sidebar-section pinned-section"><div className="section-label"><Pin size={11}/> Pinned</div><div className="tree">{pinnedEntries.map((entry) => <TreeNode key={entry.path} entry={entry} activePath={activePath} pinned onOpen={openDocument} onPin={togglePin} onRemove={removeSidebarItem}/>)}{!pinnedEntries.length && <div className="section-empty">Nothing pinned</div>}</div></section>
      <section className="sidebar-section recent-section"><div className="section-label"><RefreshCw size={11}/> Recent</div><div className="tree">{recentEntries.map((entry) => <TreeNode key={entry.path} entry={entry} activePath={activePath} pinned={false} onOpen={openDocument} onPin={togglePin} onRemove={removeSidebarItem}/>)}{!recentEntries.length && <div className="section-empty">Open a file or folder</div>}</div></section>
      <footer className="sidebar-controls"><nav className="sidebar-command-bar"><button onClick={() => void addPath(false)} title="Open file"><Plus size={15}/></button><button onClick={() => void addPath(true)} title="Open folder"><FolderPlus size={15}/></button><button onClick={() => newDocument("markdown")} title="New Markdown"><FileText size={15}/></button><button onClick={() => newDocument("html")} title="New HTML"><FileCode2 size={15}/></button><button onClick={() => setPreferences((p) => ({ ...p, theme: resolvedTheme === "dark" ? "light" : "dark" }))}>{resolvedTheme === "dark" ? <Sun size={15}/> : <Moon size={15}/>}</button><button onClick={() => setSettingsOpen(true)}><Settings size={15}/></button><button onClick={() => setSidebarOpen(false)}><PanelLeftClose size={16}/></button></nav></footer></aside>
      <section className="main-pane"><div className="window-controls-hotspot"><div className="window-controls"><button onClick={() => appWindow?.minimize()}><Minus size={13}/></button><button onClick={() => appWindow?.toggleMaximize()}><Maximize2 size={12}/></button><button className="close" onClick={() => { if (confirmDiscard()) appWindow?.close(); }}><X size={14}/></button></div></div>
        {activeDocument && <div className="editor-mode-toggle"><button className={!editMode ? "active" : ""} onClick={() => setEditMode(false)}>View</button><button className={editMode ? "active" : ""} onClick={() => setEditMode(true)}>Edit{dirty && <span className="unsaved-dot"/>}</button></div>}
        <div className="content-area">{error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(undefined)}><X size={14}/></button></div>}
          {!activeDocument ? <div className="welcome"><h1>Vellum</h1><p>A quiet place for rendered documents.</p><div className="welcome-actions"><button onClick={() => void addPath(false)}>Open file</button><button className="secondary" onClick={() => void addPath(true)}>Open folder</button></div></div>
          : editMode ? <div className="editor-shell"><div className="editor-controls-hotspot"><div className="editor-controls"><button onClick={() => void saveCurrent(false)} disabled={!dirty && !activeDocument.draft} title="Save"><Save size={14}/></button><button onClick={() => void saveCurrent(true)} title="Save As">Save As</button><button onClick={() => setDraftContent(activeDocument.content)} disabled={!dirty} title="Revert"><RotateCcw size={14}/></button><button className={preferences.editorWrap ? "active" : ""} onClick={() => setPreferences((p) => ({ ...p, editorWrap: !p.editorWrap }))} title="Word wrap"><WrapText size={14}/></button><button onClick={() => setPreferences((p) => ({ ...p, editorFontSize: Math.max(11, p.editorFontSize - 1) }))}><ZoomOut size={14}/></button><button onClick={() => setPreferences((p) => ({ ...p, editorFontSize: Math.min(22, p.editorFontSize + 1) }))}><ZoomIn size={14}/></button><select value={preferences.editorFont} onChange={(e) => setPreferences((p) => ({ ...p, editorFont: e.target.value as EditorFont }))}><option>JetBrains Mono</option><option>Cascadia Code</option><option>IBM Plex Mono</option><option>Fira Code</option></select></div></div><Suspense fallback={<div className="welcome"><p>Loading editor…</p></div>}><SourceEditor value={draftContent} language={activeDocument.kind} theme={resolvedTheme} wrap={preferences.editorWrap} fontSize={preferences.editorFontSize} fontFamily={fontStacks[preferences.editorFont]} onChange={setDraftContent}/></Suspense></div>
          : activeDocument.kind === "markdown" ? <article className="document markdown-body" dangerouslySetInnerHTML={{ __html: renderedMarkdown }}/>
          : <iframe ref={htmlFrame} className="html-frame" title={activeDocument.name} srcDoc={renderedHtml} sandbox="allow-forms allow-modals allow-popups allow-scripts" referrerPolicy="no-referrer"/>}
        </div>{!editMode && <div className="viewer-zoom-hotspot"><div className="viewer-zoom-controls"><button disabled={!activeDocument} onClick={() => setPreferences((p) => ({ ...p, viewerZoom: Math.max(50, p.viewerZoom - 10) }))}><ZoomOut size={15}/></button><button className="zoom-value" disabled={!activeDocument} onClick={() => setPreferences((p) => ({ ...p, viewerZoom: 100 }))}>{preferences.viewerZoom}%</button><button disabled={!activeDocument}><Scan size={15}/></button><button disabled={!activeDocument} onClick={() => setPreferences((p) => ({ ...p, viewerZoom: Math.min(200, p.viewerZoom + 10) }))}><ZoomIn size={15}/></button></div></div>}</section></section>
    {settingsOpen && <dialog open className="modal-backdrop"><section className="settings-panel"><header><div><span className="eyebrow">Vellum</span><h2>Settings</h2></div><button onClick={() => setSettingsOpen(false)}><X size={17}/></button></header><h3 className="settings-group-label">Editor</h3><div className="setting-row"><div><strong>Word wrap</strong><span>Wrap long Markdown and HTML lines by default.</span></div><label className="switch"><input type="checkbox" checked={preferences.editorWrap} onChange={(e) => setPreferences((p) => ({ ...p, editorWrap: e.target.checked }))}/><span/></label></div><div className="setting-row"><div><strong>Code font</strong><span>Use an installed coding font with safe fallbacks.</span></div><select value={preferences.editorFont} onChange={(e) => setPreferences((p) => ({ ...p, editorFont: e.target.value as EditorFont }))}><option>JetBrains Mono</option><option>Cascadia Code</option><option>IBM Plex Mono</option><option>Fira Code</option></select></div><div className="setting-row range-row"><div><strong>Editor text size</strong><span>Adjust source text without changing rendered documents.</span></div><label><input type="range" min="11" max="22" value={preferences.editorFontSize} onChange={(e) => setPreferences((p) => ({ ...p, editorFontSize: Number(e.target.value) }))}/><span>{preferences.editorFontSize}px</span></label></div></section></dialog>}
  </main>;
}
