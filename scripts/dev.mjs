#!/usr/bin/env node
/**
 * One-stop dev runner. Used to be `docker-compose up -d assets && next
 * dev`, but that dragged a whole Colima VM (~2 GB RAM) along just to
 * serve files. Now everything is native Node:
 *
 *   - scripts/build-data.mjs runs once up front
 *   - scripts/serve-assets.mjs spawns as a background child (port 9100)
 *   - `next dev -p 3547` runs in the foreground, with its Node heap
 *     capped at 2 GB so Turbopack can't balloon on long sessions
 *
 * Ctrl+C takes everything down cleanly.
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function log(prefix, msg) {
  process.stdout.write(`[${prefix}] ${msg}\n`);
}

// Rebuild data synchronously first so the JSON is current before Next
// starts watching it.
log("dev", "building data…");
const build = spawnSync(process.execPath, ["scripts/build-data.mjs"], {
  cwd: ROOT,
  stdio: "inherit",
});
if (build.status !== 0) {
  log("dev", `build-data failed with exit ${build.status}`);
  process.exit(build.status ?? 1);
}

const children = [];

function startAssets() {
  const child = spawn(process.execPath, ["scripts/serve-assets.mjs"], {
    cwd: ROOT,
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      log("dev", `assets server exited (code ${code}); shutting down`);
      shutdown(code ?? 0);
    }
  });
  return child;
}

function startNext() {
  // Cap Turbopack / Next's Node heap. Without this it can grow past
  // 4 GB on long-running HMR sessions; with this it GCs earlier and
  // stays bounded.
  const env = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS ?? "", "--max-old-space-size=2048"]
      .filter(Boolean)
      .join(" "),
  };
  const child = spawn("npx", ["next", "dev", "-p", "3547"], { cwd: ROOT, stdio: "inherit", env });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      log("dev", `next dev exited (code ${code}); shutting down`);
      shutdown(code ?? 0);
    }
  });
  return child;
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  // Give children a moment to clean up, then force-exit.
  setTimeout(() => process.exit(code), 500).unref();
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log("dev", "shutting down…");
    shutdown(0);
  });
}

log("dev", "starting asset server on :9100");
children.push(startAssets());

log("dev", "==> http://localhost:3547");
children.push(startNext());
