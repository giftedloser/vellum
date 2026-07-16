import { useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
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

const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
const wrapCompartment = new Compartment();
const typographyCompartment = new Compartment();

function editorTheme(fontSize: number, fontFamily: string) {
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: `${fontSize}px`,
      background: "transparent",
    },
    ".cm-scroller": {
      fontFamily,
      lineHeight: "1.62",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "76px 28px 40px",
      caretColor: "currentColor",
    },
    ".cm-gutters": {
      background: "transparent",
      border: "none",
      paddingTop: "76px",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "color-mix(in srgb, currentColor 5%, transparent)",
    },
    "&.cm-focused": {
      outline: "none",
    },
  });
}

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
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        languageCompartment.of(language === "html" ? html() : markdown()),
        themeCompartment.of(theme === "dark" ? oneDark : []),
        wrapCompartment.of(wrap ? EditorView.lineWrapping : []),
        typographyCompartment.of(editorTheme(fontSize, fontFamily)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });

    view.current = new EditorView({ state, parent: host.current });
    return () => {
      view.current?.destroy();
      view.current = undefined;
    };
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: languageCompartment.reconfigure(language === "html" ? html() : markdown()),
    });
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({
      effects: themeCompartment.reconfigure(theme === "dark" ? oneDark : []),
    });
  }, [theme]);

  useEffect(() => {
    view.current?.dispatch({
      effects: wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap]);

  useEffect(() => {
    view.current?.dispatch({
      effects: typographyCompartment.reconfigure(editorTheme(fontSize, fontFamily)),
    });
  }, [fontFamily, fontSize]);

  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() === value) return;
    current.dispatch({
      changes: { from: 0, to: current.state.doc.length, insert: value },
      selection: { anchor: Math.min(current.state.selection.main.head, value.length) },
    });
  }, [value]);

  return <div className="source-editor" ref={host} role="textbox" aria-label={`${language} source editor`} />;
}
