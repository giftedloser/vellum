import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

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

function withProtectedSegments(value: string, transform: (protect: (segment: string) => string) => string) {
  const protectedSegments: string[] = [];
  const protect = (segment: string) => {
    const index = protectedSegments.push(segment) - 1;
    return `\uE000${index}\uE001`;
  };
  let output = transform(protect);
  output = output.replace(/\uE000(\d+)\uE001/g, (_match, index) => protectedSegments[Number(index)] ?? "");
  return output;
}

function highlightMarkdown(value: string) {
  const escaped = escapeHtml(value);
  return withProtectedSegments(escaped, (protect) => {
    let output = escaped.replace(/```[\s\S]*?```|`[^`\n]+`/g, (segment) => protect(`<span class="tok-code">${segment}</span>`));
    output = output.replace(/\[[^\]\n]+\]\([^\)\n]+\)/g, (segment) => protect(`<span class="tok-link">${segment}</span>`));
    return output
      .replace(/(^|\n)(#{1,6})([^\n]*)/g, '$1<span class="tok-heading">$2$3</span>')
      .replace(/(\*\*[^*\n]+\*\*|__[^_\n]+__)/g, '<span class="tok-strong">$1</span>')
      .replace(/(^|\n)(\s*(?:[-*+] |\d+\. ))/g, '$1<span class="tok-marker">$2</span>')
      .replace(/(^|\n)(\s*&gt;[^\n]*)/g, '$1<span class="tok-quote">$2</span>');
  });
}

function highlightTag(segment: string) {
  return segment.replace(/(&lt;\/?)([A-Za-z][\w:-]*)([\s\S]*?)(&gt;)/, (_match, open, tag, rest, close) => {
    const attributes = String(rest).replace(
      /([\w:-]+)(\s*=\s*)("[^"]*"|'[^']*')/g,
      '<span class="tok-attr">$1</span>$2<span class="tok-string">$3</span>',
    );
    return `${open}<span class="tok-tag">${tag}</span>${attributes}${close}`;
  });
}

function highlightCss(value: string) {
  return value
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>')
    .replace(/("[^"]*"|'[^']*')/g, '<span class="tok-string">$1</span>')
    .replace(/([\w-]+)(\s*:)/g, '<span class="tok-css-property">$1</span>$2')
    .replace(/\b(\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms|deg)?)\b/g, '<span class="tok-number">$1</span>');
}

function highlightJavaScript(value: string) {
  return value
    .replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, '<span class="tok-comment">$1</span>')
    .replace(/(`(?:\\.|[^`])*`|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')/g, '<span class="tok-string">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|class|new|import|export|from|async|await|try|catch|throw|true|false|null|undefined)\b/g, '<span class="tok-keyword">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
}

function highlightHtml(value: string) {
  const escaped = escapeHtml(value);
  return withProtectedSegments(escaped, (protect) => {
    let output = escaped.replace(/&lt;!--[\s\S]*?--&gt;/g, (segment) => protect(`<span class="tok-comment">${segment}</span>`));
    output = output.replace(/(&lt;style\b[\s\S]*?&gt;)([\s\S]*?)(&lt;\/style&gt;)/gi, (_match, open, body, close) => protect(`${highlightTag(open)}${highlightCss(body)}${highlightTag(close)}`));
    output = output.replace(/(&lt;script\b[\s\S]*?&gt;)([\s\S]*?)(&lt;\/script&gt;)/gi, (_match, open, body, close) => protect(`${highlightTag(open)}${highlightJavaScript(body)}${highlightTag(close)}`));
    return output.replace(/&lt;\/?[A-Za-z][\s\S]*?&gt;/g, highlightTag);
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
    const source = value.toLocaleLowerCase();
    const needle = query.toLocaleLowerCase();
    let index = source.indexOf(needle, Math.max(input.selectionEnd, 0));
    if (index < 0) index = source.indexOf(needle);
    if (index < 0) return;
    input.focus();
    input.setSelectionRange(index, index + query.length);
  };

  useEffect(() => {
    const input = textarea.current;
    if (!input) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape" && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        input.focus();
      }
    };
    input.addEventListener("keydown", onKeyDown);
    return () => input.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

  return (
    <div
      className={`source-editor ${wrap ? "wrap" : "nowrap"}`}
      style={{ "--editor-font-size": `${fontSize}px`, "--editor-font-family": fontFamily } as CSSProperties}
    >
      {searchOpen ? (
        <div className="editor-search" role="search">
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") findNext(); }} aria-label="Find in document" placeholder="Find" />
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
