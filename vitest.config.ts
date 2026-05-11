import path from "node:path";
import { defineConfig } from "vitest/config";

// Vitest config. Mirrors tsconfig's `@/*` alias so tests can import
// source files the same way components do, and excludes the worktrees /
// build outputs from the scan so a CI run doesn't accidentally pick up
// duplicated tests from a stale worktree.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: [".next/**", "node_modules/**", ".claude/worktrees/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "src/app/**", "src/components/**"],
    },
  },
});
