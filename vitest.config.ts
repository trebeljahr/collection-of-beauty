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
    // Vitest's default is 5 s. Several agent sessions run this suite while
    // the machine is at a load average of 50 to 150, and a starved run
    // takes 90 to 140 s where a quiet one takes 10 to 30. Tests then run
    // 4 to 18 times slower, and which of them cross 5 s changes from run
    // to run: layouts over a catalogue, stair walks, frame picks, a sharp
    // render, the first render of an email. At a load average of 200 to
    // 400, single tests have taken 70 s. None of them waits on anything,
    // so two minutes only delay the report of a real hang. A test that
    // needs more says so itself (`{ timeout: … }`).
    testTimeout: 120_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "src/app/**", "src/components/**"],
    },
  },
});
