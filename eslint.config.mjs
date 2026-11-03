import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: __dirname
});

export default [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**"]
  },
  // ESLint 9 only walks .js/.mjs/.cjs by default. Without this block the 281
  // .jsx files in app/ and components/ were never linted, so react-hooks and
  // jsx-a11y violations in components could not fail the gate. The rules from
  // the configs above are global and apply once a file is matched here.
  {
    files: ["**/*.jsx"]
  },
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='unsafe'][object.name='sql']",
          message: "sql.unsafe is banned outside load/migrations — use sql tagged templates + zod. If you need it, add an eslint-disable with justification."
        }
      ]
    }
  },
  {
    files: ["load/**/*.js"],
    rules: {
      "no-restricted-syntax": "off"
    }
  }
];
