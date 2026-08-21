import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "vendor/**", "**/*.min.js"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        Phaser: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "no-console": "off",
    },
  },
  {
    files: ["sw.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
];
