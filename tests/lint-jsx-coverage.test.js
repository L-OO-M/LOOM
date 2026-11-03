import { describe, expect, it, vi } from "vitest";
import { ESLint } from "eslint";

// The ESLint API boots a full config graph; under the parallel suite that can
// exceed the default 5s test budget on a cold cache.
vi.setConfig({ testTimeout: 30000 });

// Regression guard for the lint blind spot recorded in
// docs/25-hardening-and-integration-plan.md. ESLint 9's flat config only walks
// .js/.mjs/.cjs unless a config block names .jsx, which meant 281 component
// files bypassed react-hooks and jsx-a11y entirely: `npm run lint` passed while
// a component rendered an undefined `<Meta>`. These tests fail if the glob is
// ever dropped again.
const ROOT = process.cwd();

describe("lint coverage", () => {
  it("lints .jsx files, not just .js", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const results = await eslint.lintFiles(["components/loom"]);

    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((r) => r.filePath.endsWith(".jsx")).length).toBe(results.length);
  });

  it("applies the React and jsx-a11y rule sets to a .jsx file", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const config = await eslint.calculateConfigForFile("components/loom/Drawer.jsx");

    expect(config).toBeTruthy();
    expect(config.rules).toHaveProperty("jsx-a11y/alt-text");
    expect(config.rules).toHaveProperty("react/jsx-no-undef");
    expect(config.rules).toHaveProperty("react-hooks/exhaustive-deps");
  });

  it("does not ignore a .jsx file as unmatched", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const [result] = await eslint.lintText("export function X() { return <Meta />; }", {
      filePath: "components/loom/__lint_probe__.jsx"
    });

    expect(result).toBeTruthy();
    // Unmatched extensions come back with zero rules applied; a matched file
    // resolves `<Meta />` against the React/JSX scope and reports it undefined.
    expect(result.messages.map((m) => m.ruleId)).toContain("react/jsx-no-undef");
  });
});
