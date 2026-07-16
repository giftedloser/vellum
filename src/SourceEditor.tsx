import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";

type Props = {
  value: string;
  language: "markdown" | "html";
  wrap: boolean;
  fontSize: number;
  fontFamily: string;
  onChange: (value: string) => void;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function highlightMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/(^|\n)(#{1,6})([^\n]*)/g, '$1<span class="tok-heading">$2$3</span>')
    .replace(/(```[\s\S]*?```|`[^`\n]+`)/g, '<span class="tok-code">$1</span>')
    .replace(/(\*\*[^*\n]+\*\*|__[^_\n]+__)/g, '<span class="tok-strong">$1</span>')
    .replace(/(\[[^\]\n]+\]\([^\)\n]+\))/g, '<span class="tok-link">$1</span>')
    .replace(/(^|\n)(\s*(?:[-*+] |\d+\. ))/g, '$1<span class="tok-marker">$2</span>')
    .replace(/(^|\n)(\s*&gt;[^\n]*)/g, '$1<span class="tok-quote">$2</span>');
}

function highlightHtml(value: string) {
  return escapeHtml(value)
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>')
    .replace(/(&lt;\/?)([A-Za-z][\w:-]*)([^&]*?)(&gt;)/g, (_match, open, tag, rest, close) => {
      const attributes = String(rest).replace(/([\w:-]+)(\s*=\s*)("[^"]*"|'[^']*')/g, '<span class="tok-attr">$1</span>$2<span class="tok-string">$3</span>');
      return `${open}<span class="tok-tag">${tag}</span>${attributes}${close}`;
    });
}

export default function SourceEditor({ value, language, wrap, fontSize, fontFamily, onChange }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const highlight = useRef<HTMLPreElement>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const highlighted = useMemo(
    () => language === "html" ? highlightHtml(value) : highlightMarkdown(value),
    [language, value],
  );

  const syncScroll = () => {
    if (!textarea.current || !highlight.current) return;
    highlight.current.scrollTop = textarea.current.scrollTop;
    highlight.current.scrollLeft = textarea.current.scrollLeft;
  };

  const findNext = () => {
    const input = textarea.current;
    if (!input || !query) return;
    const haystack = value.toLocaleLowerCase();
    const needle = query.toLocaleLowerCase();
    let index = haystack.indexOf(needle, Math.max(input.selectionEnd, 0));
    if (index < 0) index = haystack.indexOf(needle);
    if (index < 0) return;
    input.focus();
    input.setSelectionRange(index, index + query.length);
  };

  const applyEdit = (next: string, selectionStart: number, selectionEnd = selectionStart) => {
    onChange(next);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "f") {
      event.preventDefault();
      setSearchOpen(true);
      return;
    }
    if (event.key === "Escape" && searchOpen) {
      event.preventDefault();
      setSearchOpen(false);
      textarea.current?.focus();
      return;
    }

    const input = event.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;

    if (event.key === "Tab") {
      event.preventDefault();
      const replacement = "  ";
      applyEdit(`${value.slice(0, start)}${replacement}${value.slice(end)}`, start + replacement.length);
      return;
    }

    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
    const closing = pairs[event.key];
    if (!closing || modifier || event.altKey) return;

    event.preventDefault();
    const selected = value.slice(start, end);
    const insertion = `${event.key}${selected}${closing}`;
    const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
    if (selected) applyEdit(next, start + 1, end + 1);
    else applyEdit(next, start + 1);
  };

  return (
    <div
      className={`source-editor ${wrap ? "wrap" : "nowrap"}`}
      style={{ "--editor-font-size": `${fontSize}px`, "--editor-font-family": fontFamily } as CSSProperties}
    >
      {searchOpen ? (
        <div className="editor-search" role="search">
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") findNext(); if (event.key === "Escape") { setSearchOpen(false); textarea.current?.focus(); } }} aria-label="Find in document" placeholder="Find" />
          <button type="button" onClick={findNext}>Next</button>
          <button type="button" onClick={() => { setSearchOpen(false); textarea.current?.focus(); }} aria-label="Close search">×</button>
        </div>
      ) : null}
      <pre ref={highlight} className="editor-highlight" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `${highlighted}\n` }} />
      <textarea
        ref={textarea}
        className="editor-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onEditorKeyDown}
        onScroll={syncScroll}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap={wrap ? "soft" : "off"}
        aria-label={`${language === "html" ? "HTML" : "Markdown"} source editor`}
      />
    </div>
  );
}
