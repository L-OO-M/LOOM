// Minimal, dependency-free syntax highlighter.
//
// The security report noted "code syntax highlighting is not present" -- every
// snippet rendered as flat <pre> text. A full tokenizer (shiki / prism) would be
// a new runtime dependency for a cosmetic gain, which AGENTS.md forbids. This is
// a deliberately small scanner that classifies comments, strings, numbers and a
// shared keyword set. It is not a parser; over-highlighting a keyword is
// harmless, and it never executes or injects anything -- callers render the
// returned text as React text nodes, never as HTML.

const KEYWORDS = new Set([
  // JS / TS
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "class", "extends",
  "super", "this", "import", "from", "export", "default", "async", "await",
  "try", "catch", "finally", "throw", "typeof", "instanceof", "in", "of",
  "delete", "void", "yield", "static", "get", "set", "interface", "type",
  "enum", "implements", "public", "private", "protected", "readonly", "as",
  // Python
  "def", "elif", "lambda", "pass", "raise", "with", "None", "True", "False",
  "self", "and", "or", "not", "is", "global", "nonlocal", "assert", "del",
  // C / C++ / Java / Go / Rust
  "int", "char", "float", "double", "long", "short", "unsigned", "signed",
  "struct", "union", "typedef", "sizeof", "package", "impl",
  "fn", "mut", "pub", "use", "match", "loop", "func",
  // SQL
  "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "JOIN", "LEFT",
  "RIGHT", "INNER", "OUTER", "ON", "GROUP", "BY", "ORDER", "HAVING", "LIMIT",
  "CREATE", "TABLE", "INDEX", "DROP", "ALTER", "VALUES"
]);

const HASH_COMMENT_LANGS = new Set(["python", "py", "ruby", "rb", "bash", "sh", "shell", "zsh", "yaml", "yml", "perl", "r", "makefile", "make", "toml"]);
const DASH_COMMENT_LANGS = new Set(["sql", "lua", "haskell", "hs", "ada"]);

function buildTokenRegex(lang) {
  const commentParts = ["\\/\\/[^\\n]*", "\\/\\*[\\s\\S]*?\\*\\/"];
  if (HASH_COMMENT_LANGS.has(lang)) commentParts.push("#[^\\n]*");
  if (DASH_COMMENT_LANGS.has(lang)) commentParts.push("--[^\\n]*");
  const comment = `(?:${commentParts.join("|")})`;
  return new RegExp(
    `(${comment})` +                                   // 1 comment
    `|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)` + // 2 string
    `|(\\b\\d[\\d_]*(?:\\.\\d+)?\\b)` +                // 3 number
    `|([A-Za-z_$][A-Za-z0-9_$]*)` +                    // 4 identifier
    `|(\\s+)` +                                        // 5 whitespace
    `|([\\s\\S])`,                                     // 6 other
    "g"
  );
}

/**
 * Classifies `code` into an array of { type, text } tokens.
 * type is one of: "comment" | "string" | "number" | "keyword" | "plain".
 * Adjacent plain tokens are merged so the DOM stays small.
 */
export function highlight(code, language = "") {
  const src = typeof code === "string" ? code : "";
  const lang = String(language || "").toLowerCase();
  const re = buildTokenRegex(lang);
  const tokens = [];
  const push = (type, text) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (type === "plain" && last && last.type === "plain") last.text += text;
    else tokens.push({ type, text });
  };

  let m;
  while ((m = re.exec(src)) !== null) {
    if (!m[0]) { re.lastIndex++; continue; }
    if (m[1] !== undefined) push("comment", m[1]);
    else if (m[2] !== undefined) push("string", m[2]);
    else if (m[3] !== undefined) push("number", m[3]);
    else if (m[4] !== undefined) {
      push(KEYWORDS.has(m[4]) ? "keyword" : "plain", m[4]);
    } else push("plain", m[5] ?? m[6] ?? "");
  }
  return tokens;
}
