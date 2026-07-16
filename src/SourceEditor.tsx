import { useEffect, useRef, type CSSProperties } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, dropCursor, EditorView, keymap } from "@codemirror/view";
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

function languageExtension(language: Props["language"]) {
  return language === "html" ? html({ autoCloseTags: false }) : markdown();
}

function visualTheme(dark: boolean, fontSize: number, fontFamily: string) {
  const palette = dark
    ? {
        foreground: "#d8d1c5",
        muted: "#8f9a86",
        heading: "#d3a36d",
        keyword: "#dda097",
        attribute: "#d0b272",
        string: "#9bc39f",
        link: "#82b4d0",
        code: "#c1a4df",
        selection: "rgba(211, 163, 109, .22)",
        active: "rgba(255, 255, 255, .025)",
      }
    : {
        foreground: "#342f29",
        muted: "#78806f",
        heading: "#9c6b38",
        keyword: "#8b4f45",
        attribute: "#8a6b32",
        string: "#4f7556",
        link: "#3d6f8f",
        code: "#7b5f9e",
        selection: "rgba(156, 107, 56, .18)",
        active: "rgba(52, 47, 41, .025)",
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
        padding: "74px 30px 42px",
        caretColor: palette.foreground,
      },
      ".cm-line": { padding: "0" },
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
      { tag: tags.heading, color: palette.heading, fontWeight: "650" },
      { tag: [tags.keyword, tags.tagName], color: palette.keyword },
      { tag: [tags.attributeName, tags.propertyName], color: palette.attribute },
      { tag: [tags.string, tags.url], color: palette.string },
      { tag: [tags.link, tags.processingInstruction], color: palette.link },
      { tag: [tags.monospace, tags.regexp], color: palette.code },
      { tag: [tags.comment, tags.quote], color: palette.muted, fontStyle: "italic" },
      { tag: [tags.strong, tags.emphasis], fontWeight: "650" },
      { tag: tags.invalid, textDecoration: "underline wavy" },
    ])),
  ];
}

export default function SourceEditor({ value, language, wrap, fontSize, fontFamily, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>();
  const onChangeRef = useRef(onChange);
  const applyingExternal = useRef(false);
  const languageConfig = useRef(new Compartment()).current;
  const wrapConfig = useRef(new Compartment()).current;
  const themeConfig = useRef(new Compartment()).current;
  const dark = useRef(resolvedDarkTheme());

  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        languageConfig.of(languageExtension(language)),
        wrapConfig.of(wrap ? EditorView.lineWrapping : []),
        themeConfig.of(visualTheme(dark.current, fontSize, fontFamily)),
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
      view.current = undefined;
    };
  }, []);

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
      dark.current = nextDark;
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
