import { useEffect, useRef } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { closeSearchPanel, highlightSelectionMatches, openSearchPanel, searchKeymap, searchPanelOpen } from "@codemirror/search";
import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, drawSelection, dropCursor, EditorView, keymap, type DecorationSet, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";

type Props = {
  value: string;
  language: "markdown" | "html" | "text";
  wrap: boolean;
  fontSize: number;
  fontFamily: string;
  onChange: (value: string) => void;
};

function resolvedDarkTheme() {
  return document.documentElement.dataset.theme === "dark";
}

function markdownLineClass(text: string) {
  if (/^#\s/.test(text)) return "cm-md-h1";
  if (/^##\s/.test(text)) return "cm-md-h2";
  if (/^###\s/.test(text)) return "cm-md-h3";
  if (/^#{4,6}\s/.test(text)) return "cm-md-heading";
  if (/^\s*>\s?/.test(text)) return "cm-md-quote";
  if (/^\s*(```|~~~)/.test(text)) return "cm-md-fence";
  if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(text)) return "cm-md-list";
  return text.trim() ? "cm-md-body" : "cm-md-blank";
}

function visibleMarkdownDecorations(view: EditorView) {
  const decorations = new RangeSetBuilder<Decoration>();
  for (const range of view.visibleRanges) {
    let position = range.from;
    while (position <= range.to) {
      const line = view.state.doc.lineAt(position);
      decorations.add(line.from, line.from, Decoration.line({ class: markdownLineClass(line.text) }));
      position = line.to + 1;
    }
  }
  return decorations.finish();
}

const markdownBlockStyles = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = visibleMarkdownDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) this.decorations = visibleMarkdownDecorations(update.view);
  }
}, { decorations: (plugin) => plugin.decorations });

function languageExtension(language: Props["language"]) {
  if (language === "html") return html({ autoCloseTags: false });
  return language === "markdown" ? [markdown(), markdownBlockStyles] : [];
}

/* Lucide-style glyphs masked into the search controls. mask-image is used
   rather than background-image so each icon inherits currentColor and picks
   up hover and checked states for free. */
function toggleSearchPanel(view: EditorView) {
  return searchPanelOpen(view.state) ? closeSearchPanel(view) : openSearchPanel(view);
}

function icon(body: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const ICON_UP = '<path d="m18 15-6-6-6 6"/>';
const ICON_DOWN = '<path d="m6 9 6 6 6-6"/>';
const ICON_ALL = '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>';
const ICON_REPLACE = '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>';
const ICON_REPLACE_ALL = '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>';
const ICON_CASE = '<path d="m3 15 4-8 4 8"/><path d="M4 13h6"/><circle cx="18" cy="12" r="3"/><path d="M21 9v6"/>';
const ICON_REGEXP = '<path d="M17 3v10"/><path d="m12.67 5.5 8.66 5"/><path d="m12.67 10.5 8.66-5"/><path d="M9 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z"/>';
const ICON_WORD = '<circle cx="7" cy="12" r="3"/><path d="M10 9v6"/><circle cx="17" cy="12" r="3"/><path d="M14 7v8"/><path d="M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1"/>';
const ICON_CLOSE = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';

function visualTheme(dark: boolean, fontSize: number, fontFamily: string) {
  const palette = dark
    ? {
        foreground: "oklch(0.87 0 0)",
        muted: "oklch(0.68 0 0)",
        heading: "#d3a36d",
        keyword: "#dda097",
        attribute: "#d0b272",
        string: "#9bc39f",
        link: "#82b4d0",
        code: "#c1a4df",
        selection: "oklch(0.82 0 0 / .22)",
        active: "rgba(255, 255, 255, .025)",
      }
    : {
        foreground: "oklch(0.3 0 0)",
        muted: "oklch(0.52 0 0)",
        heading: "#9c6b38",
        keyword: "#8b4f45",
        attribute: "#8a6b32",
        string: "#4f7556",
        link: "#3d6f8f",
        code: "#7b5f9e",
        selection: "oklch(0.3 0 0 / .18)",
        active: "oklch(0.3 0 0 / .025)",
      };

  return [
    EditorView.theme({
      "&": {
        height: "100%",
        color: palette.foreground,
        backgroundColor: "transparent",
        fontFamily,
        fontSize: `${fontSize}px`,
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily,
        lineHeight: "1.62",
        scrollbarWidth: "none",
      },
      ".cm-scroller::-webkit-scrollbar": { display: "none" },
      ".cm-content": {
        minHeight: "100%",
        padding: "74px 30px 88px",
        caretColor: palette.foreground,
      },
      ".cm-line": { padding: "1px 0" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: `${palette.selection} !important`,
      },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: palette.foreground },
      ".cm-activeLine": { backgroundColor: palette.active },
      /* Docked to the bottom edge as one line, rounded on the top corners
         only. absolute (not fixed) resolves against .cm-editor, so the bar
         centres on the document pane and shifts with the sidebar on its own.
         Surface is the sidebar's: same panel tint, same opacity token, same
         grain, so it reads as part of the app shell rather than as a second
         floating control bar. */
      ".cm-panels": {
        position: "absolute",
        zIndex: "40",
        top: "auto",
        right: "auto",
        bottom: "0",
        left: "50%",
        width: "max-content",
        maxWidth: "calc(100% - 48px)",
        padding: "5px",
        color: "var(--text-body)",
        backgroundColor: "rgba(var(--panel-rgb), calc(var(--sidebar-opacity) * .94))",
        backgroundImage: "url('/textures/grain.png')",
        backgroundRepeat: "repeat",
        backgroundSize: "1024px 1024px",
        backgroundAttachment: "fixed",
        backgroundBlendMode: "var(--paper-blend)",
        border: "1px solid var(--border)",
        borderBottom: "0",
        borderRadius: "12px 12px 0 0",
        boxShadow: "var(--editor-control-shadow)",
        backdropFilter: "blur(22px) saturate(118%)",
        transform: "translateX(-50%)",
        /* Without this the bar inherits the editor's monospace face. */
        fontFamily: "var(--font-ui)",
      },
      ".cm-panels-top, .cm-panels-bottom": { borderTop: "0", borderBottom: "0" },
      ".cm-search": {
        display: "flex",
        alignItems: "center",
        gap: "2px",
        padding: "0",
      },
      /* CodeMirror separates find and replace with a <br>. */
      ".cm-search br": { display: "none" },
      /* Source order is find, buttons, toggles, replace. Reorder so the two
         fields sit together on the left and the actions follow. */
      ".cm-search input[name=search]": { order: "1" },
      ".cm-search input[name=replace]": { order: "2", marginRight: "4px" },
      ".cm-search button[name=prev]": { order: "3" },
      ".cm-search button[name=next]": { order: "4" },
      ".cm-search button[name=select]": { order: "5" },
      ".cm-search button[name=replace]": { order: "6" },
      ".cm-search button[name=replaceAll]": { order: "7" },
      ".cm-search button[name=close]": { order: "9" },
      ".cm-search .cm-textfield": {
        height: "36px",
        /* Shrinks rather than overflowing once the window is narrow. */
        flex: "0 1 128px",
        minWidth: "0",
        margin: "0",
        border: "0",
        borderRadius: "9px",
        padding: "0 10px",
        color: "var(--text-body)",
        backgroundColor: "color-mix(in srgb, var(--text-secondary) 12%, transparent)",
        fontFamily: "var(--font-ui)",
        fontSize: "12px",
        outline: "none",
      },
      /* Text buttons become icon buttons: the label is hidden and a lucide
         glyph is masked in so it inherits currentColor on hover. */
      ".cm-search .cm-button": {
        position: "relative",
        flex: "none",
        width: "34px",
        height: "36px",
        margin: "0",
        padding: "0",
        border: "0",
        borderRadius: "9px",
        color: "var(--text-secondary)",
        backgroundColor: "transparent",
        backgroundImage: "none",
        fontSize: "0",
      },
      ".cm-search .cm-button::after": {
        content: "''",
        position: "absolute",
        inset: "0",
        backgroundColor: "currentColor",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "15px 15px",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        WebkitMaskSize: "15px 15px",
      },
      ".cm-search .cm-button:hover": {
        color: "var(--text-body)",
        backgroundColor: "var(--hover)",
      },
      ".cm-search button[name=prev]::after": { maskImage: icon(ICON_UP), WebkitMaskImage: icon(ICON_UP) },
      ".cm-search button[name=next]::after": { maskImage: icon(ICON_DOWN), WebkitMaskImage: icon(ICON_DOWN) },
      ".cm-search button[name=select]::after": { maskImage: icon(ICON_ALL), WebkitMaskImage: icon(ICON_ALL) },
      ".cm-search button[name=replace]::after": { maskImage: icon(ICON_REPLACE), WebkitMaskImage: icon(ICON_REPLACE) },
      ".cm-search button[name=replaceAll]::after": { maskImage: icon(ICON_REPLACE_ALL), WebkitMaskImage: icon(ICON_REPLACE_ALL) },
      /* Checkboxes become toggle buttons matching the word-wrap control:
         the native box is hidden and the label carries the pressed state. */
      ".cm-panel.cm-search label": {
        order: "8",
        position: "relative",
        flex: "none",
        width: "34px",
        height: "36px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0",
        padding: "0",
        borderRadius: "9px",
        color: "var(--text-secondary)",
        /* CodeMirror's own base theme sets font-size: 80% on this selector and
           wins on injection order even at equal specificity, so the label text
           has to be forced off to leave just the masked icon. */
        fontSize: "0 !important",
        cursor: "pointer",
      },
      ".cm-panel.cm-search label:hover": { color: "var(--text-body)", backgroundColor: "var(--hover)" },
      ".cm-panel.cm-search label:has(input:checked)": { color: "var(--accent)", backgroundColor: "var(--active)" },
      ".cm-panel.cm-search label input": {
        position: "absolute",
        width: "1px",
        height: "1px",
        margin: "0",
        opacity: "0",
      },
      ".cm-panel.cm-search label::after": {
        content: "''",
        position: "absolute",
        inset: "0",
        backgroundColor: "currentColor",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "15px 15px",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        WebkitMaskSize: "15px 15px",
      },
      ".cm-panel.cm-search label:nth-of-type(1)::after": { maskImage: icon(ICON_CASE), WebkitMaskImage: icon(ICON_CASE) },
      ".cm-panel.cm-search label:nth-of-type(2)::after": { maskImage: icon(ICON_REGEXP), WebkitMaskImage: icon(ICON_REGEXP) },
      ".cm-panel.cm-search label:nth-of-type(3)::after": { maskImage: icon(ICON_WORD), WebkitMaskImage: icon(ICON_WORD) },
      /* Must match CodeMirror's own selector shape, which absolutely positions
         this at right: 4px, where it sat on top of "replace all". */
      ".cm-panel.cm-search button[name=close]": {
        /* relative, not static: the ::after icon must anchor to the button
           rather than escaping to the panel. */
        position: "relative",
        flex: "none",
        width: "34px",
        height: "36px",
        margin: "0 0 0 2px",
        padding: "0",
        border: "0",
        borderRadius: "9px",
        color: "var(--text-secondary)",
        backgroundColor: "transparent",
        fontSize: "0",
      },
      ".cm-panel.cm-search button[name=close]::after": {
        content: "''",
        position: "absolute",
        inset: "0",
        backgroundColor: "currentColor",
        maskImage: icon(ICON_CLOSE),
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "15px 15px",
        WebkitMaskImage: icon(ICON_CLOSE),
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        WebkitMaskSize: "15px 15px",
      },
      ".cm-panel.cm-search button[name=close]:hover": {
        color: "var(--text-body)",
        backgroundColor: "var(--hover)",
      },
      ".cm-tooltip": {
        color: "var(--editor-control-fg)",
        backgroundColor: "var(--editor-control-bg-hover)",
        border: "1px solid var(--editor-control-border)",
        borderRadius: "8px",
        boxShadow: "var(--editor-control-shadow)",
      },
      "&.cm-focused": { outline: "none" },
    }, { dark }),
    syntaxHighlighting(HighlightStyle.define([
      { tag: tags.heading1, color: palette.heading, fontWeight: "700" },
      { tag: tags.heading2, color: palette.heading, fontWeight: "700" },
      { tag: tags.heading3, color: palette.heading, fontWeight: "680" },
      { tag: [tags.heading4, tags.heading5, tags.heading6], color: palette.heading, fontWeight: "680" },
      { tag: [tags.keyword, tags.tagName], color: palette.keyword },
      { tag: [tags.attributeName, tags.propertyName], color: palette.attribute },
      { tag: [tags.string, tags.url], color: palette.string },
      { tag: [tags.link, tags.processingInstruction], color: palette.link, textDecoration: "underline", textUnderlineOffset: "2px" },
      { tag: [tags.monospace, tags.regexp], color: palette.code },
      { tag: [tags.comment, tags.quote], color: palette.muted, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "750" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.invalid, textDecoration: "underline wavy" },
    ])),
  ];
}

export default function SourceEditor({ value, language, wrap, fontSize, fontFamily, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const applyingExternal = useRef(false);
  const initialConfig = useRef({ value, language, wrap, fontSize, fontFamily }).current;
  const languageConfigRef = useRef<Compartment>(null);
  const wrapConfigRef = useRef<Compartment>(null);
  const themeConfigRef = useRef<Compartment>(null);
  if (languageConfigRef.current === null) languageConfigRef.current = new Compartment();
  if (wrapConfigRef.current === null) wrapConfigRef.current = new Compartment();
  if (themeConfigRef.current === null) themeConfigRef.current = new Compartment();
  const languageConfig = languageConfigRef.current;
  const wrapConfig = wrapConfigRef.current;
  const themeConfig = themeConfigRef.current;

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!host.current) return;

    const state = EditorState.create({
      doc: initialConfig.value,
      extensions: [
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        languageConfig.of(languageExtension(initialConfig.language)),
        wrapConfig.of(initialConfig.wrap ? EditorView.lineWrapping : []),
        themeConfig.of(visualTheme(resolvedDarkTheme(), initialConfig.fontSize, initialConfig.fontFamily)),
        keymap.of([
          // Listed before searchKeymap so these win: the stock bindings only
          // open the panel, so the shortcut could never close it again.
          // The "search-panel" scope matters as much as the toggle: CodeMirror
          // binds its keymap to contentDOM, and the panel lives outside it, so
          // without this the shortcut did nothing while the cursor was in the
          // Find field, and the unhandled key fell through to WebView2's own
          // find bar.
          { key: "Mod-f", run: toggleSearchPanel, scope: "editor search-panel" },
          { key: "Mod-h", run: toggleSearchPanel, scope: "editor search-panel" },
          ...closeBracketsKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applyingExternal.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    view.current = new EditorView({ state, parent: host.current });
    view.current.focus();

    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, [initialConfig, languageConfig, themeConfig, wrapConfig]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    applyingExternal.current = true;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    applyingExternal.current = false;
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: languageConfig.reconfigure(languageExtension(language)) });
  }, [language, languageConfig]);

  useEffect(() => {
    view.current?.dispatch({ effects: wrapConfig.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap, wrapConfig]);

  useEffect(() => {
    const applyTheme = () => {
      const nextDark = resolvedDarkTheme();
      view.current?.dispatch({ effects: themeConfig.reconfigure(visualTheme(nextDark, fontSize, fontFamily)) });
    };
    applyTheme();
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [fontFamily, fontSize, themeConfig]);

  return (
    <div
      ref={host}
      className="source-editor"
      aria-label={`${language === "html" ? "HTML" : language === "markdown" ? "Markdown" : "Plain text"} source editor`}
    />
  );
}
