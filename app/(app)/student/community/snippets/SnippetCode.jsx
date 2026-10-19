import { highlight } from "@/lib/highlight";

// Server component: the highlighter runs on the server, so no highlighting JS
// ships to the browser. Text is rendered as React text nodes -- never as HTML --
// so a snippet containing markup cannot inject anything.

const TOKEN_STYLE = {
  comment: { color: "var(--text-muted)", fontStyle: "italic" },
  keyword: { color: "var(--accent)", fontWeight: 600 },
  string: { color: "var(--success)" },
  number: { color: "var(--warn)" }
};

export function CodeBlock({ code, language }) {
  const tokens = highlight(code, language);
  return (
    <pre className="overflow-auto p-4 pt-2 font-mono text-xs leading-6" style={{ color: "var(--text)" }}>
      <code>
        {tokens.map((t, i) => (
          <span key={i} style={TOKEN_STYLE[t.type]}>{t.text}</span>
        ))}
      </code>
    </pre>
  );
}
