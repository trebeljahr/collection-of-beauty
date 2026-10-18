// Shutdown drain for a Node HTTP server behind Coolify's Traefik.
// Loaded ahead of the server: `node --require ./drain.cjs server.js`.
//
// Coolify replaces a container by starting the new one, waiting for it
// to turn healthy, then running `docker stop` on the old one. Traefik
// keeps routing to the old container until it has EXITED, so a request
// sent to it while it shuts down gets a 502, and one in flight when its
// network goes away hangs until a 504. Two things make Traefik drop a
// container early: a failed check of Traefik's own load-balancer health
// check (added by `hatchkit sync`), and its Docker health leaving `healthy`.
//
// So on SIGTERM this file:
//   1. answers both probes with 503, and nothing else: Docker's at once
//      (Coolify runs it INSIDE the container against 127.0.0.1), Traefik's
//      after PROXY_GRACE_MS (it comes with an X-Hatchkit-Drain header and
//      no X-Forwarded-For; Traefik adds that to every request it forwards,
//      so a visitor can't pose as it). Outside a drain Traefik's probe gets
//      a 200 from here without reaching Next.
//   2. waits SHUTDOWN_DRAIN_SECONDS: time for Traefik's check, or Docker's
//      count of failed probes, to drop it. When neither has happened — a
//      loaded host runs Docker's probes late — it keeps waiting for
//      HEALTH_CHECK_RETRIES of them, up to SHUTDOWN_DRAIN_EXTRA_SECONDS longer.
//   3. then runs the server's own SIGTERM handling (Next.js closes its
//      server and exits): every SIGTERM listener the server registers is
//      held until the drain ends. A server with none gets its HTTP
//      servers closed and the process exited.
//
// SHUTDOWN_DRAIN_SECONDS comes from the Dockerfile and is timed against
// the health checks hatchkit sets on the Coolify app. Unset or
// 0 turns all of this off: dev, tests, and a compose app, whose container
// is stopped BEFORE its replacement starts, so draining only delays that.
// HEALTH_CHECK_PATH lists the probed paths, comma-separated; the default
// is the two hatchkit configures, `/` and `/api/health`. SIGINT (Ctrl-C)
// is never delayed.
//
// SIGTERM has to reach THIS process. `dotenvx run` forwards it and then
// SIGKILLs its command 5 s later, so an image that starts the server
// through dotenvx (or npx) runs drain-entrypoint as PID 1, which signals
// the pid this file writes to HATCHKIT_DRAIN_PIDFILE instead.
"use strict";

const { writeFileSync } = require("node:fs");
const http = require("node:http");
const { isMainThread } = require("node:worker_threads");

const drainMs = Math.max(0, Number(process.env.SHUTDOWN_DRAIN_SECONDS) || 0) * 1000;
// Docker marks a container unhealthy after this many failed probes in a row;
// only then does the proxy stop routing here (hatchkit's Docker drain timing
// is 4 s x 3).
const healthRetries = Math.max(1, Number(process.env.HEALTH_CHECK_RETRIES) || 3);
// A loaded host runs probes late. The drain waits up to this long past
// SHUTDOWN_DRAIN_SECONDS for the failures Docker needs, then stops anyway.
const extraDrainMs = Math.max(0, Number(process.env.SHUTDOWN_DRAIN_EXTRA_SECONDS ?? 5)) * 1000;
const PROBE_MARGIN_MS = 2000;
const healthPaths = (process.env.HEALTH_CHECK_PATH || "/,/api/health")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
// The process exits at the latest this long after the nominal drain: the
// server's own shutdown (or, without one, in-flight requests) gets what is
// left after any drain extension. With the 20 s drain the deadline is 28 s
// after SIGTERM, inside `docker stop`'s 30 s before SIGKILL.
const CLOSE_TIMEOUT_MS = 8000;
// Traefik's own health check (X-Hatchkit-Drain, sent straight from Traefik,
// never forwarded) keeps passing for this long after SIGTERM, at most a
// quarter of the drain: Traefik drops a container on ONE failed check, and
// can take 2 s to add the new one after Coolify starts this stop. One 503
// to it takes this container out of rotation at once.
const PROXY_GRACE_MS = Math.min(4000, drainMs / 4);

// A child this process forks inherits `--require`. Only the process that
// was started with it drains; the child keeps its normal SIGTERM.
const owner = process.env.HATCHKIT_DRAIN_PID;
if (drainMs > 0 && isMainThread && (owner === undefined || owner === String(process.pid))) {
  process.env.HATCHKIT_DRAIN_PID = String(process.pid);
  if (process.env.HATCHKIT_DRAIN_PIDFILE) {
    try {
      writeFileSync(process.env.HATCHKIT_DRAIN_PIDFILE, String(process.pid));
    } catch {
      // Unwritable: the entrypoint signals its own child, as without us.
    }
  }
  install();
}

function install() {
  const servers = new Set();
  let draining = false;
  let finished = false;
  let timer;
  let heldCalls = 0;
  let termAt = 0;
  let failedProbes = 0;
  let unhealthyAt = 0;
  let proxyDroppedAt = 0;
  let release;
  const drained = new Promise((resolve) => {
    release = resolve;
  });

  const isProbe = (req) => {
    const peer = req.socket.remoteAddress;
    const loopback = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
    return loopback && healthPaths.includes((req.url || "").split("?")[0]);
  };
  const isTraefikProbe = (req) =>
    req.headers["x-hatchkit-drain"] !== undefined && req.headers["x-forwarded-for"] === undefined;

  // Every http.Server: track the listening ones, and answer the probes.
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, ...args) {
    if (event === "listening") servers.add(this);
    if (event === "close") servers.delete(this);
    if (event === "request") {
      const [req, res] = args;
      if (isTraefikProbe(req)) {
        const failing = draining && Date.now() - termAt >= PROXY_GRACE_MS;
        if (failing && !proxyDroppedAt) proxyDroppedAt = Date.now();
        res.writeHead(failing ? 503 : 200, {
          "content-type": "text/plain",
          ...(failing ? { connection: "close" } : { "cache-control": "no-store" }),
        });
        res.end(failing ? "draining\n" : "serving\n");
        return true;
      }
      if (draining && isProbe(req)) {
        failedProbes += 1;
        if (failedProbes === healthRetries) unhealthyAt = Date.now();
        res.writeHead(503, { "content-type": "text/plain", connection: "close" });
        res.end("draining\n");
        return true;
      }
    }
    return emit.call(this, event, ...args);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    release();
    const exit = () => process.exit(0);
    // One deadline from SIGTERM, however long the drain itself took.
    const remaining = Math.max(0, termAt + drainMs + CLOSE_TIMEOUT_MS - Date.now());
    // Held listeners ran on this signal, and now run on the promise
    // above. They own the shutdown, but must finish before `docker stop`
    // escalates to SIGKILL; past CLOSE_TIMEOUT_MS cut what is left and exit.
    if (heldCalls > 0) {
      setTimeout(() => {
        for (const server of servers) server.closeAllConnections?.();
        exit();
      }, remaining).unref();
      return;
    }
    let open = servers.size;
    if (open === 0) exit();
    for (const server of servers) {
      server.close(() => {
        open -= 1;
        if (open === 0) exit();
      });
    }
    setTimeout(() => {
      for (const server of servers) server.closeAllConnections?.();
      exit();
    }, remaining).unref();
  };

  // Traefik must have dropped this container: its own check failed once, or
  // Docker saw enough failed probes. Normally that happened long before
  // SHUTDOWN_DRAIN_SECONDS.
  const settle = () => {
    const now = Date.now();
    const seen =
      (proxyDroppedAt > 0 && now - proxyDroppedAt >= PROBE_MARGIN_MS) ||
      (failedProbes >= healthRetries && now - unhealthyAt >= PROBE_MARGIN_MS);
    if (seen || now - termAt >= drainMs + extraDrainMs) return finish();
    timer = setTimeout(settle, 250);
  };

  const onSigterm = () => {
    // A second SIGTERM means stop waiting.
    if (draining) return finish();
    draining = true;
    termAt = Date.now();
    console.log(
      `[drain] SIGTERM: failing the health checks for at least ${drainMs / 1000}s so the proxy stops routing here, then shutting down`,
    );
    timer = setTimeout(settle, drainMs);
  };
  // Registered before process.on is wrapped below, so it is the one
  // SIGTERM listener that runs at once.
  process.on("SIGTERM", onSigterm);

  // Hold every other SIGTERM listener until the drain ends. `once` and
  // `prependOnceListener` go through `on` and `prependListener`.
  const held = new WeakMap();
  const hold = (listener) => {
    if (typeof listener !== "function") return listener;
    let wrapper = held.get(listener);
    if (!wrapper) {
      wrapper = function (...args) {
        heldCalls += 1;
        drained.then(() => listener.apply(this, args));
      };
      held.set(listener, wrapper);
    }
    return wrapper;
  };
  for (const name of ["on", "addListener", "prependListener"]) {
    const original = process[name];
    process[name] = function (event, listener) {
      return original.call(this, event, event === "SIGTERM" ? hold(listener) : listener);
    };
  }
  for (const name of ["off", "removeListener"]) {
    const original = process[name];
    process[name] = function (event, listener) {
      return original.call(
        this,
        event,
        event === "SIGTERM" ? (held.get(listener) ?? listener) : listener,
      );
    };
  }
}
