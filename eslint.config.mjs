import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

const myRules = {
  // https://eslint.org/docs/latest/rules/max-len
  "max-len": [
    "error",
    {
      code: 80,
      ignoreComments: false,
      ignoreRegExpLiterals: true,
      ignoreStrings: false,
      ignoreTemplateLiterals: true,
      ignoreUrls: true,
    },
  ],
  "one-var": [
    "error"= "never"
  ]
};

export default defineConfig([
  {
    files: ["src/**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": hooksPlugin,
      "@next/next": nextPlugin,
    },
    rules: {
      ...eslint.configs.all.rules,
      ...tseslint.configs.recommendedTypeChecked.rules,
      ...tseslint.configs.stylisticTypeChecked.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...hooksPlugin.configs["recommended-latest"].rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...myRules,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
]);
