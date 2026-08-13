import { config } from "@repo/eslint-config/base";

/**
 * Test files use `as any` casts to fake Prisma/S3/Express mocks whose runtime
 * shape only partially matches the real types (e.g. `prisma as any`). Keeping
 * `no-explicit-any` on here would force dozens of `as unknown as X` double
 * casts with no real safety gain, so it is relaxed for tests only — src/
 * stays strict.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  ...config,
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
