// Encoding repair and detection.
//
// WHY THIS EXISTS
//
// Several files contained mojibake: UTF-8 bytes decoded as cp1252 and written
// back as text. A middle dot (U+00B7) arrived as U+00C2 U+00B7 -- two Latin-1
// characters -- and was visible to students as garbage in rendered JSX.
//
// WHY NOT AN AUTO-FIXING PRE-COMMIT HOOK
//
// The usual suggestion is a hook that repairs and runs `git add .`. That is
// deliberately not what this does:
//
//   1. `git add .` stages the entire working tree, including work you had not
//      finished. One hook misfire commits unrelated changes.
//   2. Silently rewriting text on every commit makes a wrong fix permanent and
//      unremarkable. A check that FAILS keeps a human in the loop, which is
//      what you want for text that cannot be mechanically verified.
//
// So --check prints file:line and exits non-zero, for CI and for a deliberate
// pre-commit run. The default mode repairs and prints exactly what it changed.
//
// REPAIR STRATEGY
//
// Recovery is one round trip: take a run of damaged characters, re-encode each
// as its single byte (latin1), then decode those bytes as UTF-8. That undoes
// exactly one layer of misreading and nothing else.
//
// Three guards make it safe:
//
//   - Only runs of TWO OR MORE characters are considered. A lone U+00E9 is
//     ordinary accented text, not damage.
//   - A run is only replaced if the result contains no U+FFFD. A run that is
//     not actually UTF-8 produces a replacement character and is left alone,
//     which is what protects real accented text like "cafe" from being mangled.
//   - U+FFFD already in the text is LOSSY -- the original bytes are gone -- so
//     it is reported for a human and never guessed at.
//
// Usage:
//   node load/fix-encoding.js           repair what is safely repairable
//   node load/fix-encoding.js --check   report only, exit 1 if anything is wrong

import fs from "node:fs";
import path from "node:path";

// Latin-1 supplement plus the cp1252 characters that occupy the 0x80-0x9F byte
// range, because that is where the continuation bytes of a misread 3-byte
// UTF-8 sequence land (a misread em-dash, for example).
const CP1252_HIGH =
  "\\u0080-\\u00FF" +
  "\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039" +
  "\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC\\u2122" +
  "\\u0161\\u203A\\u0153\\u017E\\u0178";

// A maximal run of suspect characters.
const RUN = new RegExp("[" + CP1252_HIGH + "]{2,}", "g");
const LOSSY = /\uFFFD/g;
const SCAN_EXT = /\.(js|jsx|mjs|cjs|json|md|mdx|css|html|yml|yaml|sql|txt)$/i;
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".next-docs", "coverage",
  "test-results", "playwright-report", ".screenshots", "out"
]);

function walk(root, files = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (SCAN_EXT.test(entry.name)) files.push(full);
  }
  return files;
}

const BOM = "\uFEFF";

/**
 * Strip a leading UTF-8 BOM.
 *
 * This is the ROOT CAUSE of the mojibake, not a cosmetic extra. Every file that
 * ended up corrupted had been saved with a byte-order mark; a tool then read it
 * as cp1252 and the BOM plus the following UTF-8 bytes became visible garbage.
 *
 * A BOM is also a live hazard independent of mojibake: in an ES module it is a
 * syntax error, and it breaks naive string comparisons on the first import.
 * Removing it is safe -- U+FEFF is not a whitespace character to JavaScript's
 * tokenizer, it is a signature, and stripping it changes no content.
 */
function stripBom(text) {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

const countRuns = (text) => (text.match(RUN) || []).length + (text.match(LOSSY) || []).length;

/**
 * Reverse the cp1252 mapping for the 0x80-0x9F byte range.
 *
 * Node has no cp1252 codec and its 'latin1' cannot represent characters above
 * U+00FF -- so `Buffer.from(str, "latin1")` silently truncates a character like
 * a curly quote, which is exactly the byte that starts most 3-byte mojibake
 * runs. That made every repair fail.
 *
 * These are the code points cp1252 places in 0x80-0x9F. Decoding through this
 * table is what turns a misread em-dash back into three real bytes.
 */
const CP1252_REVERSE = new Map(
  Object.entries({
    "\u20AC": 0x80, "\u0192": 0x82, "\u201A": 0x82, "\u201E": 0x84,
    "\u2026": 0x85, "\u2020": 0x86, "\u2021": 0x87, "\u02C6": 0x88,
    "\u2030": 0x89, "\u0160": 0x8A, "\u2039": 0x8B, "\u0152": 0x8C,
    "\u017D": 0x8D, "\u017E": 0x8E, "\u0178": 0x8F, "\u2018": 0x91,
    "\u2019": 0x92, "\u201C": 0x93, "\u201D": 0x94, "\u2022": 0x95,
    "\u2013": 0x96, "\u2014": 0x97, "\u02DC": 0x98, "\u2122": 0x99,
    "\u0161": 0x9A, "\u203A": 0x9B, "\u0153": 0x9C, "\u017E\u0178": 0x9E,
    "\u0178\u017D": 0x9F
  }).map(([cp, byte]) => [cp, byte])
);

/** Bytes for a damaged run, or null if any character has no cp1252 byte. */
function toCp1252Bytes(run) {
  const bytes = [];
  for (const ch of run) {
    const code = ch.codePointAt(0);
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    if (CP1252_REVERSE.has(ch)) {
      bytes.push(CP1252_REVERSE.get(ch));
      continue;
    }
    return null; // not cp1252-encodable; leave the text alone
  }
  return bytes;
}

/**
 * One round trip on a single run. Returns null when the run is not safely
 * repairable, which is the common case and the reason this cannot corrupt text.
 */
function repairRun(run) {
  const bytes = toCp1252Bytes(run);
  if (bytes === null) return null;

  let candidate;
  try {
    // Fatal UTF-8: an invalid sequence throws instead of yielding U+FFFD, so
    // ordinary text in the suspect range is rejected outright rather than
    // half-decoded.
    candidate = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
  if (candidate.includes("\uFFFD")) return null;
  if (countRuns(candidate) >= countRuns(run)) return null;
  return candidate;
}

function repairText(text) {
  let fixedCount = 0;
  const out = text.replace(RUN, (run) => {
    const fixed = repairRun(run);
    if (fixed === null) return run;
    fixedCount += 1;
    return fixed;
  });
  return { text: out, fixedCount };
}

function codepoints(str) {
  return [...str]
    .map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"))
    .join("+");
}

const check = process.argv.includes("--check");
const root = process.cwd();
const files = walk(root);

const repaired = [];
const lossy = [];
const suspicious = [];

for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const relative = path.relative(root, file).replace(/\\/g, "/");
  const hadBom = text.startsWith(BOM);
  if (hadBom) text = stripBom(text);

  const lossyLines = [];
  text.split("\n").forEach((line, i) => {
    if (/\uFFFD/.test(line)) lossyLines.push({ line: i + 1, seq: ["\uFFFD"] });
  });

  const runLines = [];
  text.split("\n").forEach((line, i) => {
    const found = line.match(RUN);
    if (found && found.length) runLines.push({ line: i + 1, seq: [...new Set(found)] });
  });

  const { text: fixed, fixedCount } = repairText(text);
  const bomFixed = hadBom && fixedCount === 0;

  if (fixedCount > 0) {
    repaired.push({ file: relative, lines: runLines, fixedCount, bomFixed });
  } else if (hadBom) {
    // Only a BOM to remove. Still worth doing, and still worth a CI failure:
    // it is the upstream cause of the corruption above.
    repaired.push({ file: relative, lines: [], fixedCount: 0, bomFixed: true });
  } else if (runLines.length) {
    // Suspicious but unrepairable. Almost always legitimate typography, so it is
    // surfaced without failing -- see the severity model below.
    suspicious.push({ file: relative, lines: runLines });
  }

  if (!check && (fixedCount > 0 || bomFixed)) fs.writeFileSync(file, fixed, "utf8");

  // Lossy damage is always a hard failure, repaired file or not.
  if (lossyLines.length) lossy.push({ file: relative, lines: lossyLines });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const total = repaired.length + lossy.length + suspicious.length;
if (total === 0) {
  console.log("encoding check: clean - no mojibake in " + files.length + " files");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Severity model
//
// Not every suspicious run is damage. Legitimate typography -- a right double
// quote followed by an ellipsis, an en dash next to a section sign -- lands in
// the same code-point range and must NOT be rewritten. Those are reported as
// warnings and do not fail the check, because a check that fails on correct text
// gets disabled, and a disabled check catches nothing.
//
// FAIL on: repairable mojibake (a regression we can and should fix), and on
//         U+FFFD (already lossy, needs a human).
// WARN on: runs that look suspect but have no safe round trip.
// ---------------------------------------------------------------------------

console.log((check ? "encoding check" : "encoding repair") + " - " + files.length + " files scanned\n");

if (repaired.length) {
  console.log((check ? "FAILED: " : "repaired ") + repaired.length + " file(s)");
  for (const { file, lines, fixedCount, bomFixed } of repaired) {
    const what = [
      fixedCount ? fixedCount + " mojibake run(s)" : null,
      bomFixed ? "UTF-8 BOM" : null
    ].filter(Boolean).join(" + ");
    console.log("  " + (check ? "FOUND  " : "FIXED  ") + file + "  (" + what + ")");
    for (const l of lines.slice(0, 4)) console.log("          L" + l.line + "  " + codepoints(l.seq.join("")));
    if (lines.length > 4) console.log("          ... +" + (lines.length - 4) + " more");
  }
  console.log("");
}

if (lossy.length) {
  console.log("FAILED: " + lossy.length + " file(s) contain U+FFFD");
  for (const { file, lines } of lossy) {
    console.log("  LOSSY   " + file);
    for (const l of lines) console.log("          L" + l.line + "  U+FFFD");
  }
  console.log("  These are unrecoverable: the original bytes were already discarded.\n");
}

if (suspicious.length) {
  console.log("note: " + suspicious.length + " run(s) look unusual but are probably legitimate text (not modified)");
  for (const { file, lines } of suspicious) {
    console.log("  OK?     " + file);
    for (const l of lines.slice(0, 2)) console.log("          L" + l.line + "  " + codepoints(l.seq.join("")));
  }
  console.log("");
}

if (check && (repaired.length || lossy.length)) {
  console.log("Run `node load/fix-encoding.js` to repair the recoverable ones.");
  process.exit(1);
}
if (!check && repaired.length) {
  console.log("Re-run with --check to confirm clean.");
}
process.exit(lossy.length ? 1 : 0);