import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", ".turbo", "dist", "tests/e2e"],
    setupFiles: ["./tests/setup.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "components/**/*.{ts,tsx}",
        "app/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
      ],
    },
  },
});
