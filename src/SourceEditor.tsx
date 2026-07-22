import { useEffect, useRef, type CSSProperties } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, drawSelection, dropCursor, EditorView, keymap, type DecorationSet, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";

type Props = {
  value: string;
  language: "markdown" | "html";
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
  return language === "html" ? html({ autoCloseTags: false }) : [markdown(), markdownBlockStyles];
}

function visualTheme(dark: boolean, fontSize: number, fontFamily: string) {
  const palette = dark
    ? {
        foreground: "oklch(0.87 0 0)",
        muted: "oklch(0.68 0 0)",
        heading: "oklch(0.82 0 0)",
        keyword: "oklch(0.78 0 0)",
        attribute: "oklch(0.74 0 0)",
        string: "oklch(0.71 0 0)",
        link: "oklch(0.8 0 0)",
        code: "oklch(0.76 0 0)",
        selection: "oklch(0.82 0 0 / .22)",
        active: "rgba(255, 255, 255, .025)",
      }
    : {
        foreground: "oklch(0.3 0 0)",
        muted: "oklch(0.52 0 0)",
        heading: "oklch(0.36 0 0)",
        keyword: "oklch(0.4 0 0)",
        attribute: "oklch(0.44 0 0)",
        string: "oklch(0.47 0 0)",
        link: "oklch(0.38 0 0)",
        code: "oklch(0.42 0 0)",
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
      ".cm-panels": {
        color: "var(--vellum-control-fg)",
        backgroundColor: "var(--vellum-control-bg-hover)",
        border: "1px solid var(--vellum-control-border)",
        boxShadow: "var(--vellum-control-shadow)",
        backdropFilter: "blur(14px) saturate(120%)",
      },
      ".cm-panels.cm-panels-top": {
        top: "58px",
        right: "24px",
        left: "auto",
        width: "auto",
        borderRadius: "10px",
      },
      ".cm-search": { padding: "5px" },
      ".cm-search input": {
        height: "28px",
        border: "0",
        borderRadius: "6px",
        padding: "0 8px",
        color: "inherit",
        backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
        outline: "none",
      },
      ".cm-search button": {
        height: "28px",
        border: "0",
        borderRadius: "6px",
        color: "inherit",
        backgroundColor: "transparent",
      },
      ".cm-search button:hover": {
        backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)",
      },
      ".cm-tooltip": {
        color: "var(--vellum-control-fg)",
        backgroundColor: "var(--vellum-control-bg-hover)",
        border: "1px solid var(--vellum-control-border)",
        borderRadius: "8px",
        boxShadow: "var(--vellum-control-shadow)",
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
      style={{ "--editor-font-size": `${fontSize}px`, "--editor-font-family": fontFamily } as CSSProperties}
      aria-label={`${language === "html" ? "HTML" : "Markdown"} source editor`}
    />
  );
}
