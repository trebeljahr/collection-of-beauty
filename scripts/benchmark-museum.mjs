#!/usr/bin/env node

// Repeatable DEV-build museum measurements. Start an owned dev server first:
// node scripts/benchmark-museum.mjs --base http://127.0.0.1:54321 \
//   --out /private/tmp/museum-before.json --runs 2 --duration 8 --reflection on
// Repeat with identical flags, browser, viewport, assets and machine load.
// --cpu 4 applies CDP CPU slowdown; --uncapped disables frame pacing. Neither
// simulates a particular low-end GPU. --screenshots captures after collection.
// Cold entry uses a fresh context per run; subsequent poses share warm caches.
// Camera motion bypasses collision/input, while the ordinary player, culling,
// texture LOD, HUD and reflection loops keep running. No quality knobs change
// unless --reflection is explicitly supplied. CPU timings are submission time,
// not GPU execution time; wrappers and the development debug HUD add overhead.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const flags = new Map();
const booleanFlags = new Set(["--screenshots", "--uncapped", "--help"]);
const valueFlags = new Set([
  "--base",
  "--out",
  "--runs",
  "--duration",
  "--cpu",
  "--reflection",
  "--only",
  "--width",
  "--height",
  "--dpr",
  "--settle-timeout",
  "--browser",
]);
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (booleanFlags.has(key)) flags.set(key, true);
  else if (valueFlags.has(key) && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    flags.set(key, process.argv[++i]);
  } else throw new Error(`Unknown flag or missing value: ${key}`);
}
if (flags.has("--help")) {
  console.log(
    "node scripts/benchmark-museum.mjs --base URL [--out /tmp/result.json] [--runs 2] [--duration 8] [--cpu 1|4] [--reflection auto|on|off] [--only cold-entry,court,room,approach-turn] [--uncapped] [--screenshots] [--width 1280] [--height 720] [--dpr 1] [--settle-timeout 90] [--browser /path/to/chrome]",
  );
  process.exit(0);
}
function numberArg(key, fallback, min, max, integer = false) {
  const value = Number(flags.get(key) ?? fallback);
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(`${key} must be ${integer ? "an integer" : "a number"} from ${min} to ${max}`);
  }
  return value;
}
const base = flags.get("--base");
if (!base) throw new Error("--base is required: use the URL of an owned development server");
const url = new URL("/gallery-3d?debug=1", base).href;
const out = path.resolve(
  flags.get("--out") ?? path.join(os.tmpdir(), `museum-benchmark-${Date.now()}.json`),
);
if (out === ROOT || out.startsWith(`${ROOT}${path.sep}`))
  throw new Error("Write --out outside the source repository");
const config = {
  url,
  runs: numberArg("--runs", 2, 1, 20, true),
  durationMs: numberArg("--duration", 8, 2, 120) * 1000,
  cpuSlowdown: numberArg("--cpu", 1, 1, 20),
  reflection: flags.get("--reflection") ?? "auto",
  uncapped: flags.has("--uncapped"),
  screenshots: flags.has("--screenshots"),
  viewport: {
    width: numberArg("--width", 1280, 320, 3840, true),
    height: numberArg("--height", 720, 240, 2160, true),
  },
  dpr: numberArg("--dpr", 1, 0.5, 2),
  settleTimeoutMs: numberArg("--settle-timeout", 90, 5, 600) * 1000,
};
if (!["auto", "on", "off"].includes(config.reflection))
  throw new Error("--reflection must be auto, on or off");
const allScenarios = [
  { id: "court", eye: [58.75, 1.75, 43.2], look: [58.75, 6.2, 17.6] },
  { id: "room", eye: [81.25, 1.75, 51.5], look: [81.25, 2.2, 62.4] },
  // Approach Las Meninas along the room's centre aisle, then turn 180° in
  // 250 ms. The 5 m path takes 2.5 s (2 m/s), independent of sample length.
  {
    id: "approach-turn",
    eye: [81.25, 1.75, 51.5],
    look: [81.25, 2.2, 62.4],
    approachM: 5,
    speedMps: 2,
    turnMs: 250,
  },
];
const only = flags.get("--only")?.split(",");
if (only?.some((id) => id !== "cold-entry" && !allScenarios.some((s) => s.id === id)))
  throw new Error("Unknown --only scenario");
const scenarios = allScenarios.filter((s) => !only || only.includes(s.id));
if (scenarios.some((s) => s.id === "approach-turn") && config.durationMs < 4000)
  throw new Error("approach-turn needs --duration at least 4 seconds");
const includeCold = !only || only.includes("cold-entry");

// Installed before the document. The collector can therefore record cold
// entry's RAF/long-task stalls before React exposes its dev renderer hook.
function installHarness({ reflection }) {
  globalThis.__museumShellRenders = 0;
  const shellRenders = () => Number(globalThis.__museumShellRenders ?? 0);
  const fakeLock = (element) => {
    Object.defineProperty(Document.prototype, "pointerLockElement", {
      configurable: true,
      get: () => element,
    });
    setTimeout(() => document.dispatchEvent(new Event("pointerlockchange")), 0);
  };
  Element.prototype.requestPointerLock = function () {
    fakeLock(this);
    return Promise.resolve();
  };
  Document.prototype.exitPointerLock = () => fakeLock(null);
  Element.prototype.requestFullscreen = () => Promise.resolve();
  const pose = (scenario, elapsed = 0) => {
    const cam = window.__galleryCamera;
    if (!cam) return;
    const travel = Math.min(scenario.approachM ?? 0, (elapsed / 1000) * (scenario.speedMps ?? 0));
    cam.position.set(scenario.eye[0], scenario.eye[1], scenario.eye[2] + travel);
    cam.lookAt(...scenario.look);
    if (scenario.approachM) {
      const turnStart = (scenario.approachM / scenario.speedMps) * 1000;
      const turn = Math.max(0, Math.min(1, (elapsed - turnStart) / scenario.turnMs));
      cam.rotateY(turn * Math.PI);
    }
    cam.updateMatrixWorld();
  };
  function collector(scenario = null, durationMs = null) {
    const started = performance.now();
    const shellStart = shellRenders();
    const frames = [];
    const longTasks = [];
    const states = {};
    let hook = null;
    let hookAt = null;
    let renderOriginal;
    let matrixOriginal;
    let renderWrapper;
    let matrixWrapper;
    let renderDepth = 0;
    let last = null;
    let lastMain = null;
    let raf;
    let stopped = false;
    let deadline;
    let stateReadAt = 0;
    let bucket;
    const emptyBucket = () => ({
      renderMs: 0,
      sceneMatrixMs: 0,
      sceneMatrixInsideRenderMs: 0,
      renderCalls: 0,
      drawCalls: 0,
      triangles: 0,
      mainDrawCalls: 0,
      mainTriangles: 0,
      mainRenderMs: 0,
      mainRenders: 0,
    });
    const mainIntervals = [];
    bucket = emptyBucket();
    let resolve;
    const done = new Promise((r) => {
      resolve = r;
    });
    const observe = (entries) => {
      for (const entry of entries)
        longTasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
    };
    const longTaskSupported = PerformanceObserver.supportedEntryTypes.includes("longtask");
    const observer = longTaskSupported
      ? new PerformanceObserver((list) => observe(list.getEntries()))
      : null;
    observer?.observe({ type: "longtask", buffered: false });
    function attach() {
      hook = window.__galleryBenchmark;
      if (!hook) return;
      hookAt = performance.now();
      if (reflection !== "auto") window.__galleryFloorReflection?.(reflection === "on");
      const { renderer, scene } = hook;
      renderOriginal = renderer.render;
      matrixOriginal = scene.updateMatrixWorld;
      matrixWrapper = function (...args) {
        const start = performance.now();
        try {
          return matrixOriginal.apply(this, args);
        } finally {
          const ms = performance.now() - start;
          bucket.sceneMatrixMs += ms;
          if (renderDepth > 0) bucket.sceneMatrixInsideRenderMs += ms;
        }
      };
      renderWrapper = function (...args) {
        const primary =
          args[0] === scene &&
          args[1] === window.__galleryCamera &&
          renderer.getRenderTarget() === null;
        const start = performance.now();
        const top = renderDepth++ === 0;
        const beforeCalls = renderer.info.render.calls;
        const beforeTriangles = renderer.info.render.triangles;
        try {
          return renderOriginal.apply(this, args);
        } finally {
          renderDepth--;
          const ms = performance.now() - start;
          const calls = renderer.info.render.calls - (renderer.info.autoReset ? 0 : beforeCalls);
          const triangles =
            renderer.info.render.triangles - (renderer.info.autoReset ? 0 : beforeTriangles);
          if (top) {
            bucket.renderMs += ms;
            bucket.drawCalls += calls;
            bucket.triangles += triangles;
            bucket.renderCalls++;
          }
          if (primary) {
            bucket.mainRenders++;
            bucket.mainRenderMs += ms;
            bucket.mainDrawCalls += calls;
            bucket.mainTriangles += triangles;
            if (lastMain !== null) mainIntervals.push(start - lastMain);
            lastMain = start;
          }
        }
      };
      scene.updateMatrixWorld = matrixWrapper;
      renderer.render = renderWrapper;
    }
    function stop(reason = "complete") {
      if (stopped) return done;
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(deadline);
      const ended = performance.now();
      if (hook) {
        if (hook.renderer.render === renderWrapper) hook.renderer.render = renderOriginal;
        if (hook.scene.updateMatrixWorld === matrixWrapper)
          hook.scene.updateMatrixWorld = matrixOriginal;
      }
      const shellEnd = shellRenders();
      const snapshot = hook?.snapshot() ?? null;
      const contextLost = hook?.renderer.getContext().isContextLost() ?? null;
      // Let the observer receive the final long task before disconnecting.
      setTimeout(() => {
        if (observer) {
          observe(observer.takeRecords());
          observer.disconnect();
        }
        const heap = performance.memory;
        resolve({
          reason,
          started,
          ended,
          elapsedMs: ended - started,
          rendererHookAtMs: hookAt,
          shellRenders: {
            available: "__museumShellRenders" in globalThis,
            before: shellStart,
            after: shellEnd,
            delta: shellEnd - shellStart,
          },
          frames,
          mainIntervals,
          reflectionStates: states,
          longTasks: longTasks.filter(
            (task) => task.startTime < ended && task.startTime + task.duration > started,
          ),
          longTaskSupported,
          heap: heap
            ? {
                usedJSHeapSize: heap.usedJSHeapSize,
                totalJSHeapSize: heap.totalJSHeapSize,
                jsHeapSizeLimit: heap.jsHeapSizeLimit,
              }
            : null,
          snapshot,
          contextLost,
        });
      }, 100);
      return done;
    }
    function frame(timestamp) {
      if (!hook) attach();
      if (last !== null)
        frames.push({
          intervalMs: timestamp - last,
          ...bucket,
          renderExcludingSceneMatrixMs: Math.max(
            0,
            bucket.renderMs - bucket.sceneMatrixInsideRenderMs,
          ),
        });
      bucket = emptyBucket();
      last = timestamp;
      const now = performance.now();
      if (hook && now - stateReadAt >= 250) {
        const state = hook.snapshot().reflection.state;
        states[state] = (states[state] ?? 0) + 1;
        stateReadAt = now;
      }
      if (scenario) pose(scenario, now - started);
      if (durationMs !== null && now - started >= durationMs) {
        stop();
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    if (durationMs !== null) deadline = setTimeout(() => stop("raf-timeout"), durationMs + 10000);
    return { done, stop };
  }
  const cold = collector();
  window.__museumBenchmarkHarness = {
    pose,
    endCold: () => cold.stop(),
    measure: (scenario, durationMs) => collector(scenario, durationMs).done,
  };
}

function distribution(values) {
  if (!values.length) return { count: 0, mean: null, p50: null, p95: null, p99: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return {
    count: values.length,
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1),
  };
}
function summarize(sample) {
  const intervals = sample.frames.map((f) => f.intervalMs);
  const activeFrames = sample.frames.filter((f) => f.mainRenders > 0);
  const perRenderedFrame = {};
  for (const key of Object.keys(activeFrames[0] ?? {}).filter((key) => key !== "intervalMs")) {
    perRenderedFrame[key] = distribution(activeFrames.map((f) => f[key]));
  }
  return {
    ...sample,
    summary: {
      rafIntervalMs: {
        ...distribution(intervals),
        over33ms: intervals.filter((v) => v > 33).length,
        over50ms: intervals.filter((v) => v > 50).length,
      },
      mainRenderIntervalMs: {
        ...distribution(sample.mainIntervals),
        over33ms: sample.mainIntervals.filter((v) => v > 33).length,
        over50ms: sample.mainIntervals.filter((v) => v > 50).length,
      },
      perRenderedFrame,
      longTaskMs: distribution(sample.longTasks.map((t) => t.duration)),
      longTaskTotalMs: sample.longTasks.reduce((sum, task) => sum + task.duration, 0),
    },
  };
}

function trackNetwork(page) {
  const images = new Set();
  const failures = [];
  const cancelled = [];
  let lastImageChange = Date.now();
  const isImage = (request) =>
    request.resourceType() === "image" ||
    /\.(?:avif|webp|jpe?g|png)(?:[?#]|$)/i.test(request.url());
  const isAsset = (request) =>
    isImage(request) ||
    ["font", "script", "stylesheet", "fetch", "xhr", "document"].includes(request.resourceType());
  page.on("request", (request) => {
    if (isImage(request)) {
      images.add(request);
      lastImageChange = Date.now();
    }
  });
  const finish = (request) => {
    if (images.delete(request)) lastImageChange = Date.now();
  };
  page.on("requestfinished", finish);
  page.on("requestfailed", (request) => {
    finish(request);
    const error = request.failure()?.errorText ?? "unknown failure";
    if (isAsset(request))
      (/ERR_ABORTED/.test(error) ? cancelled : failures).push({ url: request.url(), error });
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && isAsset(response.request()))
      failures.push({ url: response.url(), status: response.status() });
  });
  const pending = () => ({
    imageRequests: [...images].map((r) => r.url()),
    imageQuietMs: Date.now() - lastImageChange,
  });
  return { failures, cancelled, pending };
}

async function settle(page, network, errors) {
  const started = Date.now();
  let quietSince = null;
  let latest;
  while (Date.now() - started < config.settleTimeoutMs) {
    if (errors.length || network.failures.length)
      throw new Error(
        `Page/asset errors: ${JSON.stringify({ errors, failures: network.failures })}`,
      );
    latest = await page.evaluate(() => window.__galleryBenchmark?.snapshot());
    const pending = network.pending();
    const t = latest?.textures;
    // Encoded speculative prefetch is not required for this rendered view.
    // Base/hi-res/preload decoding, GPU uploads and missing mounted bases are.
    const ready =
      t &&
      t.activeLoads === 0 &&
      t.queuedLoads === 0 &&
      t.queued === 0 &&
      t.inFlight === 0 &&
      t.hiresInFlight === 0 &&
      t.preloadInFlight === 0 &&
      latest.missingBases.length === 0 &&
      t.hiresFailedUrls === 0 &&
      latest.stats.calls > 0 &&
      pending.imageRequests.length === 0 &&
      pending.imageQuietMs >= 1000;
    if (ready) quietSince ??= Date.now();
    else quietSince = null;
    if (quietSince !== null && Date.now() - quietSince >= 1500)
      return { waitedMs: Date.now() - started, snapshot: latest, network: pending };
    await page.waitForTimeout(250);
  }
  throw new Error(
    `Assets did not settle in ${config.settleTimeoutMs} ms: ${JSON.stringify({ snapshot: latest, network: network.pending() })}`,
  );
}

async function browserOptions() {
  const args = [
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--mute-audio",
    "--enable-precise-memory-info",
  ];
  if (process.platform === "darwin") args.push("--use-angle=metal");
  if (config.uncapped) args.push("--disable-frame-rate-limit", "--disable-gpu-vsync");
  let executablePath = flags.get("--browser");
  if (!executablePath) {
    const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
    const shells = existsSync(cache)
      ? (await readdir(cache))
          .filter((name) => name.startsWith("chromium_headless_shell-"))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .reverse()
      : [];
    for (const shell of shells) {
      const candidate = path.join(
        cache,
        shell,
        `chrome-headless-shell-mac-${process.arch === "arm64" ? "arm64" : "x64"}`,
        "chrome-headless-shell",
      );
      if (existsSync(candidate)) {
        executablePath = candidate;
        break;
      }
    }
  }
  return { headless: true, args, ...(executablePath ? { executablePath } : { channel: "chrome" }) };
}
function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

async function main() {
  const launch = await browserOptions();
  const report = {
    schemaVersion: 1,
    status: "running",
    startedAt: new Date().toISOString(),
    config,
    methodology: {
      build: "development with debug HUD enabled",
      framePercentiles:
        "nearest-rank; RAF intervals include pre-renderer document frames during cold entry; main-render intervals begin only after the debug hook mounts",
      cpu: "wall time inside renderer.render, all passes; sceneMatrixMs wraps only the root scene updateMatrixWorld (inclusive subtree cost); GPU time is not measured",
      motion:
        "camera pose at RAF boundaries, fixed 2 m/s 5 m approach then 180-degree turn over 250 ms; bypasses collision/input",
      cache:
        "fresh browser context each run; ordered scenarios share in-memory caches within that run; server/OS caches are not cleared",
      readiness:
        "mounted base textures, foreground texture queues and image requests settled; speculative encoded prefetch may remain",
      instrumentation:
        "renderer/scene wrappers only during collection; debug snapshot read at 4 Hz; no screenshot during collection",
    },
    source: {
      root: ROOT,
      commit: git("rev-parse", "HEAD"),
      status: git("status", "--porcelain"),
      diffSha256: createHash("sha256")
        .update(git("diff", "HEAD", "--", "src", "scripts"))
        .digest("hex"),
      untrackedSource: await Promise.all(
        execFileSync(
          "git",
          ["ls-files", "--others", "--exclude-standard", "-z", "--", "src", "scripts"],
          { cwd: ROOT, encoding: "utf8" },
        )
          .split("\0")
          .filter(Boolean)
          .sort()
          .map(async (file) => ({
            path: file,
            sha256: createHash("sha256")
              .update(await readFile(path.join(ROOT, file)))
              .digest("hex"),
          })),
      ),
      harnessSha256: createHash("sha256")
        .update(await readFile(fileURLToPath(import.meta.url)))
        .digest("hex"),
    },
    machine: {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadAverage: os.loadavg(),
      node: process.version,
    },
    browser: { launch },
    results: [],
  };
  await mkdir(path.dirname(out), { recursive: true });
  const save = () => writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  let browser;
  let context;
  try {
    browser = await chromium.launch(launch);
    report.browser.version = browser.version();
    for (let run = 1; run <= config.runs; run++) {
      console.log(`Run ${run}/${config.runs}: cold entry`);
      context = await browser.newContext({
        viewport: config.viewport,
        deviceScaleFactor: config.dpr,
      });
      await context.route(/plausible|google-analytics\.com|googletagmanager\.com/, (route) =>
        route.fulfill({ status: 204, body: "" }),
      );
      await context.addInitScript(installHarness, { reflection: config.reflection });
      const page = await context.newPage();
      const network = trackNetwork(page);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const session = await context.newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: config.cpuSlowdown });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.settleTimeoutMs });
      const entered = page.getByRole("button", { name: /^Enter/ });
      await entered.waitFor({ timeout: config.settleTimeoutMs });
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll("button")].some(
            (b) => /^Enter/.test(b.textContent.trim()) && !b.disabled,
          ),
        null,
        { timeout: config.settleTimeoutMs },
      );
      const enterAtMs = await page.evaluate(() => performance.now());
      await entered.click();
      await page.waitForFunction(
        () => Boolean(window.__galleryBenchmark && window.__galleryCamera),
        null,
        { timeout: config.settleTimeoutMs },
      );
      const coldReady = await settle(page, network, errors);
      const cold = await page.evaluate(() => window.__museumBenchmarkHarness.endCold());
      if (!cold.snapshot || cold.contextLost || !cold.frames.some((f) => f.mainRenders > 0))
        throw new Error("Cold entry never produced a valid rendered museum frame");
      if (includeCold)
        report.results.push({
          run,
          scenario: "cold-entry",
          enterAtMs,
          ready: coldReady,
          ...summarize(cold),
        });
      report.browser.environment ??= await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory ?? null,
        devicePixelRatio,
        timeOrigin: performance.timeOrigin,
        gpu: window.__galleryBenchmark.snapshot().stats.gpu,
      }));
      for (const scenario of scenarios) {
        console.log(`Run ${run}/${config.runs}: ${scenario.id}`);
        await page.evaluate((s) => window.__museumBenchmarkHarness.pose(s), scenario);
        const ready = await settle(page, network, errors);
        const sample = await page.evaluate(
          ({ scenario: s, duration }) => window.__museumBenchmarkHarness.measure(s, duration),
          { scenario, duration: config.durationMs },
        );
        if (
          sample.reason !== "complete" ||
          sample.contextLost ||
          sample.frames.filter((f) => f.mainRenders > 0).length < 10
        )
          throw new Error(
            `Incomplete sample: ${scenario.id}, reason=${sample.reason}, contextLost=${sample.contextLost}`,
          );
        const readyAfter = await settle(page, network, errors);
        const result = {
          run,
          scenario: scenario.id,
          path: scenario,
          ready,
          readyAfter,
          ...summarize(sample),
        };
        if (config.screenshots) {
          const directory = out.replace(/\.json$/i, "") + "-screenshots";
          await mkdir(directory, { recursive: true });
          result.screenshot = path.join(directory, `run-${run}-${scenario.id}.png`);
          result.screenshotCamera = await page.evaluate(() => ({
            position: window.__galleryCamera.position.toArray(),
            quaternion: window.__galleryCamera.quaternion.toArray(),
            fov: window.__galleryCamera.fov,
          }));
          await page.screenshot({
            path: result.screenshot,
            timeout: 60000,
            style: ".gallery-canvas-host ~ *, nextjs-portal { visibility: hidden !important; }",
          });
        }
        report.results.push(result);
        const interval = result.summary.rafIntervalMs;
        console.log(
          `  p50 ${interval.p50.toFixed(2)} ms; p95 ${interval.p95.toFixed(2)} ms; >50 ms ${interval.over50ms}; shell renders ${sample.shellRenders.delta}`,
        );
        await save();
      }
      report.results.push({
        run,
        scenario: "network",
        cancelledRequests: network.cancelled,
        errors,
        failures: network.failures,
      });
      await context.close();
      context = null;
    }
    report.status = "complete";
  } catch (error) {
    report.status = "failed";
    report.error = error.stack ?? String(error);
    throw error;
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    report.endedAt = new Date().toISOString();
    await save();
    console.log(`${report.status}: ${out}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
