import { globalIgnores } from "eslint/config";
import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  globalIgnores([
    // Plain static service worker asset — not part of the module graph.
    "public/sw.js",
  ]),
];
