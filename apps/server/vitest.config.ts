import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,js}"],
    exclude: ["node_modules", "dist", ".turbo"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "src/**",
        "../../packages/validators/src/**",
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
      // Exclude files that are not business logic (entry points, config, routes, sockets, tests)
      exclude: [
        "node_modules/",
        "dist/",
        "db/",
        "src/index.ts",
        "src/create.io.ts",
        "src/types/**",
        "src/config/**",
        "src/routes/**",
        "src/sockets/**",
        "src/lib/env.ts",
        "src/lib/redis.ts",
        "src/middleware/session.ts",
        "src/services/**/*.test.ts",
        "tests/**",
        "**/*.d.ts",
      ],
    },
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@repo/validators": path.resolve(__dirname, "../../packages/validators/src/index.ts"),
    },
  },
});
