// Static guard: no server-side `catch` in these files may swallow its error.
//
// What this actually proves (and does not):
//   PROVES  - every `catch` in the audited files binds an identifier (no bare
//             `catch {`), its body is not empty (not even comment-only), and
//             the body either logs (`log.`), rethrows (`throw`), or otherwise
//             consumes the bound error (`return validationError(error)`).
//   DOES NOT prove that the log line is meaningful, that the level is right, or
//   that the catch is reachable. Those need a human reading the diff.
//
// Deliberate acceptance of the coarse check: a `catch` that logs and then
// throws, or one that hands the error to a mapper, both count as "handled",
// because the error object is not discarded. That is the invariant we can
// verify mechanically without running the app.
//
// The file list is the contract: add the file to AUDITED when you touch its
// error handling, and a future edit that starts swallowing again fails here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const AUDITED = [
  "lib/auth-server.js",
  "lib/oss.js",
  "lib/tenant.js",
  "app/api/help/signals/route.js",
  "app/api/roadmap/progress/route.js",
  "app/domains/[slug]/page.jsx",
  "app/sitemap.js",
  "app/auth/supabase-callback/route.js"
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

// Blank out comments and string literals so brace counting and the "is the body
// empty" check see code only. Backtick templates are skipped wholesale: no
// catch body in this list interpolates a nested template.
function stripCommentsAndStrings(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      out += " ";
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Every `catch` occurrence with the source of its block body. */
function catchBlocks(file) {
  const raw = read(file);
  const code = stripCommentsAndStrings(raw);
  const found = [];
  const re = /\bcatch\b\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*\))?\s*\{/g;
  let match;
  while ((match = re.exec(code))) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let i = open; i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) throw new Error(`${file}: unbalanced braces after a catch`);
    found.push({
      file,
      binding: match[1] ?? null,
      body: code.slice(open + 1, close),
      line: raw.slice(0, match.index).split("\n").length
    });
  }
  return found;
}

const ALL = AUDITED.flatMap(catchBlocks);

describe("silent-catch audit", () => {
  it("audits a non-empty list of files that each contain a catch", () => {
    expect(AUDITED.length).toBeGreaterThan(0);
    for (const file of AUDITED) {
      expect(catchBlocks(file).length, `${file} has no catch left to audit`).toBeGreaterThan(0);
    }
  });

  it("leaves no empty or comment-only catch body", () => {
    const empty = ALL.filter((c) => c.body.trim() === "");
    expect(
      empty.map((c) => `${c.file}:${c.line}`),
      "catch blocks with no statement at all"
    ).toEqual([]);
  });

  it("binds the error in every catch", () => {
    const unbound = ALL.filter((c) => !c.binding);
    expect(
      unbound.map((c) => `${c.file}:${c.line}`),
      "use `catch (err)` so the error object exists to be logged"
    ).toEqual([]);
  });

  it("logs, rethrows, or consumes the bound error in every catch", () => {
    const discards = ALL.filter((c) => {
      const body = c.body.trim();
      if (/\blog\s*\.\s*(debug|info|warn|error)\s*\(/.test(body)) return false;
      if (/\bthrow\b/.test(body)) return false;
      // Coarse but honest: any *use* of the binding hands the error onward.
      return !(c.binding && new RegExp(`\\b${c.binding}\\b`).test(body));
    });
    expect(
      discards.map((c) => `${c.file}:${c.line} (catch (${c.binding}))`),
      "catch blocks that silently discard the error"
    ).toEqual([]);
  });
});
