import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/only-throw-error": ["error", { allow: [{ from: "lib", name: "never" }] }],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "scripts/", "test/", "config.json5", "eslint.config.js", "vitest.config.ts"],
  },
);
