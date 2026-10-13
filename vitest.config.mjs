import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // No React plugin: tests import .jsx modules and build elements with
  // createElement (never JSX syntax), and esbuild transforms .jsx natively.
  // Adding @vitejs/plugin-react would be a new dependency for no gain.
  resolve: {
    alias: {
      "@": __dirname
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"]
  }
});
