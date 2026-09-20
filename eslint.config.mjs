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
