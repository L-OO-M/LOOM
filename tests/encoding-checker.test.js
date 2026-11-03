import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The checker walks process.cwd(), so each case gets a fresh temporary tree.
// This pins the two failure classes the CI gate must catch: lossy replacement
// characters (already-destroyed bytes) and invisible C0/DEL controls that the
// old mojibake-only check missed.

const SCRIPT = path.resolve("load/fix-encoding.js");
const dirs = [];

function scratch(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loom-encoding-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), text, "utf8");
  }
  return dir;
}

function run(dir) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, "--check"], {
      cwd: dir,
      encoding: "utf8"
    });
    return { status: 0, output: stdout };
  } catch (error) {
    return {
      status: error.status ?? 1,
      output: `${error.stdout || ""}${error.stderr || ""}`
    };
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("encoding checker", () => {
  it("passes clean text", () => {
    const dir = scratch({ "clean.md": "# Title\n\nNormal — typography is fine.\n" });
    const result = run(dir);
    expect(result.status).toBe(0);
    expect(result.output).toContain("clean");
  });

  it("fails on U+FFFD, which means the original bytes are gone", () => {
    const dir = scratch({ "lossy.md": "Broken \uFFFD text\n" });
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.output).toContain("U+FFFD");
    expect(result.output).toContain("LOSSY");
  });

  it("fails on an invisible C0 control character", () => {
    const dir = scratch({ "control.md": `Before${String.fromCharCode(0x1f)}After\n` });
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.output).toContain("CONTROL");
    expect(result.output).toContain("U+001F");
  });

  it("does not flag tabs, newlines, or carriage returns", () => {
    const dir = scratch({ "whitespace.md": "a\tb\r\nc\n" });
    expect(run(dir).status).toBe(0);
  });
});
