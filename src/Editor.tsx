import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput, foldGutter } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";

type Props = {
  value: string;
  language: "markdown" | "html";
  theme: "light" | "dark";
  wrap: boolean;
  fontSize: number;
  fontFamily: string;
  onChange: (value: string) => void;
};

export default function Editor({ value, language, theme, wrap, fontSize, fontFamily, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), history(), foldGutter(), drawSelection(), dropCursor(),
        EditorState.allowMultipleSelections.of(true), indentOnInput(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(), closeBrackets(), rectangularSelection(), crosshairCursor(), highlightSelectionMatches(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
        language === "html" ? html() : markdown(), theme === "dark" ? oneDark : [], wrap ? EditorView.lineWrapping : [],
        EditorView.theme({
          "&": { height: "100%", fontSize: `${fontSize}px`, background: "transparent" },
          ".cm-scroller": { fontFamily, lineHeight: "1.62", overflow: "auto" },
          ".cm-content": { padding: "76px 28px 40px" },
          ".cm-gutters": { background: "transparent", border: "none", paddingTop: "76px" },
          ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, currentColor 5%, transparent)" },
          ".cm-focused": { outline: "none" },
        }),
        EditorView.updateListener.of((update) => { if (update.docChanged) onChangeRef.current(update.state.doc.toString()); }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => { view.current?.destroy(); view.current = undefined; };
  }, [language, theme, wrap, fontSize, fontFamily]);

  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() === value) return;
    current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: value } });
  }, [value]);

  return <div className="source-editor" ref={host} />;
}
