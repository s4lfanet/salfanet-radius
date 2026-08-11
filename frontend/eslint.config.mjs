import { createRequire } from "module";

const require = createRequire(import.meta.url);

const nextPlugin = require("@next/eslint-plugin-next");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const reactHooksPlugin = require("eslint-plugin-react-hooks");

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      "billing-radius/**",
      "mobile-app/**",
    ],
  },
  // Next.js core-web-vitals flat config (includes recommended + CWV rules)
  nextPlugin.flatConfig.coreWebVitals,
  // React hooks rules (flat config format)
  reactHooksPlugin.configs["recommended-latest"],
  // TypeScript rules for .ts/.tsx files
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
    },
  },
];

export default eslintConfig;
