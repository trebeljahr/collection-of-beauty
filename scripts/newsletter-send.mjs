#!/usr/bin/env node
/**
 * Thin wrapper that re-execs the real TS sender under tsx. Keeps the
 * pnpm script signature simple and lets the implementation live in a
 * type-checked .ts file.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const target = path.resolve(__dirname, "newsletter-send.ts");
const tsx = path.resolve(__dirname, "..", "node_modules", ".bin", "tsx");

const child = spawn(tsx, [target, ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
