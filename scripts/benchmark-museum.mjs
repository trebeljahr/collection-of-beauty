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
// initTexture attempts cover explicit initialization after hook attachment,
// not lazy render-time uploads. Their source-byte estimates are not traffic.
// --cpu-profile records separate CDP CPU samples for non-cold scenarios only;
// profiling adds overhead, so compare those runs separately from normal runs.

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
const booleanFlags = new Set(["--screenshots", "--uncapped", "--cpu-profile", "--help"]);
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
    "node scripts/benchmark-museum.mjs --base URL [--out /tmp/result.json] [--runs 2] [--duration 8] [--cpu 1|4] [--reflection auto|on|off] [--only cold-entry,court,room,approach-turn] [--uncapped] [--screenshots] [--cpu-profile] [--width 1280] [--height 720] [--dpr 1] [--settle-timeout 90] [--browser /path/to/chrome]",
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
  cpuProfile: flags.has("--cpu-profile"),
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
  const entryMilestones = { firstEnterEnabledAtMs: null, enterClickAtMs: null };
  const isEnter = (button) => button && /^Enter/.test(button.textContent.trim());
  const enabledObserver = new MutationObserver(() => {
    const button = [...document.querySelectorAll("button")].find(isEnter);
    if (button && !button.disabled) {
      entryMilestones.firstEnterEnabledAtMs = performance.now();
      enabledObserver.disconnect();
    }
  });
  enabledObserver.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled"],
  });
  const onEnterClick = (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!isEnter(button) || button.disabled) return;
    entryMilestones.enterClickAtMs = performance.now();
    document.removeEventListener("click", onEnterClick, true);
  };
  document.addEventListener("click", onEnterClick, true);
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
    const partialFrameBuckets = [];
    const initTextureAttempts = [];
    let initTextureInstrumentationErrors = 0;
    const mainRenderTimings = [];
    const readinessSamples = [];
    const milestones = {
      firstMainRenderAtMs: null,
      firstMainRenderCompletedAtMs: null,
      firstMainRenderAfterEnterAtMs: null,
      firstMainRenderAfterEnterCompletedAtMs: null,
      firstAllMountedBasesPresentAtMs: null,
      firstForegroundQueuesDrainedAtMs: null,
      firstAllMountedBasesPresentAfterEnterAtMs: null,
      firstForegroundQueuesDrainedAfterEnterAtMs: null,
    };
    const longTasks = [];
    const states = {};
    let hook = null;
    let hookAt = null;
    let renderOriginal;
    let matrixOriginal;
    let initTextureOriginal;
    let renderWrapper;
    let matrixWrapper;
    let initTextureWrapper;
    let renderDepth = 0;
    let last = null;
    let lastMain = null;
    let raf;
    let stopped = false;
    let deadline;
    let stateReadAt = 0;
    let bucket;
    let bucketStarted = started;
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
      initTextureAttempts: 0,
      initTextureMs: 0,
      initTexturePixels: 0,
      initTextureEstimatedRgbaMipBytes: 0,
      initTextureThrown: 0,
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
    function readReadiness(snapshot, atMs) {
      const t = snapshot.textures;
      // Avoid declaring the empty scene ready before its paintings mount.
      const mounted = snapshot.registeredPaintings > 0 && snapshot.stats.calls > 0;
      const allMountedBasesPresent = mounted && snapshot.missingBases.length === 0;
      // Historical metric name: activeLoads also includes active encoded
      // prefetch, so this is observed-queue drain, not painting-only readiness.
      const foregroundQueuesDrained =
        mounted &&
        t.activeLoads === 0 &&
        t.queuedLoads === 0 &&
        t.queued === 0 &&
        t.inFlight === 0 &&
        t.hiresInFlight === 0 &&
        t.preloadInFlight === 0;
      readinessSamples.push({
        atMs,
        registeredPaintings: snapshot.registeredPaintings,
        missingBases: snapshot.missingBases.length,
        allMountedBasesPresent,
        foregroundQueuesDrained,
        activeLoads: t.activeLoads,
        queuedLoads: t.queuedLoads,
        queuedUploads: t.queued,
        inFlight: t.inFlight,
        hiresInFlight: t.hiresInFlight,
        preloadInFlight: t.preloadInFlight,
        hiresFailedUrls: t.hiresFailedUrls,
      });
      if (allMountedBasesPresent) milestones.firstAllMountedBasesPresentAtMs ??= atMs;
      if (foregroundQueuesDrained) milestones.firstForegroundQueuesDrainedAtMs ??= atMs;
      if (entryMilestones.enterClickAtMs !== null && entryMilestones.enterClickAtMs >= started) {
        if (allMountedBasesPresent) milestones.firstAllMountedBasesPresentAfterEnterAtMs ??= atMs;
        if (foregroundQueuesDrained) milestones.firstForegroundQueuesDrainedAfterEnterAtMs ??= atMs;
      }
    }
    function finishBucket(now, timestamp, partial = null) {
      const record = {
        intervalMs: partial ? null : timestamp - last,
        startTimeMs: bucketStarted,
        endTimeMs: now,
        rafStartTimeMs: last,
        rafEndTimeMs: timestamp,
        callbackAtMs: timestamp === null ? null : now,
        partial,
        ...bucket,
        renderExcludingSceneMatrixMs: Math.max(
          0,
          bucket.renderMs - bucket.sceneMatrixInsideRenderMs,
        ),
      };
      (partial ? partialFrameBuckets : frames).push(record);
      bucket = emptyBucket();
      bucketStarted = now;
    }
    function attach() {
      hook = window.__galleryBenchmark;
      if (!hook) return;
      hookAt = performance.now();
      if (reflection !== "auto") window.__galleryFloorReflection?.(reflection === "on");
      const { renderer, scene } = hook;
      renderOriginal = renderer.render;
      matrixOriginal = scene.updateMatrixWorld;
      initTextureOriginal = renderer.initTexture;
      initTextureWrapper = function (...args) {
        const startTimeMs = performance.now();
        let thrown = true;
        try {
          const result = initTextureOriginal.apply(this, args);
          thrown = false;
          return result;
        } finally {
          const endTimeMs = performance.now();
          try {
            const texture = args[0];
            const width = Number(texture?.image?.width) || 0;
            const height = Number(texture?.image?.height) || 0;
            const pixels = width * height;
            // Source RGBA8 + mip estimate, matching the pool's accounting.
            // This is neither measured transfer bytes nor GPU execution time.
            const estimatedRgbaMipBytes = Math.round(pixels * 4 * 1.34);
            const durationMs = endTimeMs - startTimeMs;
            initTextureAttempts.push({
              startTimeMs,
              endTimeMs,
              durationMs,
              uuid: texture?.uuid ?? null,
              version: texture?.version ?? null,
              name: texture?.name ?? "",
              width,
              height,
              pixels,
              estimatedRgbaMipBytes,
              thrown,
            });
            bucket.initTextureAttempts++;
            bucket.initTextureMs += durationMs;
            bucket.initTexturePixels += pixels;
            bucket.initTextureEstimatedRgbaMipBytes += estimatedRgbaMipBytes;
            bucket.initTextureThrown += Number(thrown);
          } catch {
            // Instrumentation must never replace the renderer's result/error.
            initTextureInstrumentationErrors++;
          }
        }
      };
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
          const end = performance.now();
          const ms = end - start;
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
            mainRenderTimings.push({ startTimeMs: start, endTimeMs: end });
            if (milestones.firstMainRenderAtMs === null) {
              milestones.firstMainRenderAtMs = start;
              milestones.firstMainRenderCompletedAtMs = end;
            }
            if (
              entryMilestones.enterClickAtMs !== null &&
              entryMilestones.enterClickAtMs >= started &&
              start >= entryMilestones.enterClickAtMs &&
              milestones.firstMainRenderAfterEnterAtMs === null
            ) {
              milestones.firstMainRenderAfterEnterAtMs = start;
              milestones.firstMainRenderAfterEnterCompletedAtMs = end;
            }
          }
        }
      };
      scene.updateMatrixWorld = matrixWrapper;
      renderer.render = renderWrapper;
      renderer.initTexture = initTextureWrapper;
    }
    function stop(reason = "complete") {
      if (stopped) return done;
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(deadline);
      const ended = performance.now();
      finishBucket(ended, null, "final");
      if (hook) {
        if (hook.renderer.render === renderWrapper) hook.renderer.render = renderOriginal;
        if (hook.renderer.initTexture === initTextureWrapper)
          hook.renderer.initTexture = initTextureOriginal;
        if (hook.scene.updateMatrixWorld === matrixWrapper)
          hook.scene.updateMatrixWorld = matrixOriginal;
      }
      const shellEnd = shellRenders();
      const snapshot = hook?.snapshot() ?? null;
      const contextLost = hook?.renderer.getContext().isContextLost() ?? null;
      const entry = { ...entryMilestones };
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
          partialFrameBuckets,
          initTextureAttempts,
          initTextureInstrumentationErrors,
          mainRenderTimings,
          readinessSamples,
          milestones: { ...entry, ...milestones },
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
      const now = performance.now();
      finishBucket(now, timestamp, last === null ? "initial" : null);
      last = timestamp;
      if (!hook) attach();
      if (hook && now - stateReadAt >= 250) {
        const snapshot = hook.snapshot();
        const state = snapshot.reflection.state;
        states[state] = (states[state] ?? 0) + 1;
        readReadiness(snapshot, performance.now());
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
    endCold: () => {
      enabledObserver.disconnect();
      document.removeEventListener("click", onEnterClick, true);
      return cold.stop();
    },
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
function intervalDistribution(values) {
  return {
    ...distribution(values),
    over33ms: values.filter((value) => value > 33).length,
    over50ms: values.filter((value) => value > 50).length,
  };
}
function summarizeInitTexture(attempts, buckets) {
  const complete = buckets.filter((bucket) => !bucket.partial);
  const classify = (count) => (count === 0 ? "none" : count === 1 ? "one" : "multiple");
  const coincident = { none: [], one: [], multiple: [] };
  const nextFrame = { none: [], one: [], multiple: [] };
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    if (bucket.partial) continue;
    coincident[classify(bucket.initTextureAttempts)].push(bucket.intervalMs);
    if (i > 0) nextFrame[classify(buckets[i - 1].initTextureAttempts)].push(bucket.intervalMs);
  }
  const intervalsByCount = (groups) =>
    Object.fromEntries(
      Object.entries(groups).map(([key, values]) => [key, intervalDistribution(values)]),
    );
  return {
    count: attempts.length,
    thrown: attempts.filter((attempt) => attempt.thrown).length,
    cpuMs: distribution(attempts.map((attempt) => attempt.durationMs)),
    totalCpuMs: attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0),
    pixels: attempts.reduce((sum, attempt) => sum + attempt.pixels, 0),
    estimatedRgbaMipBytes: attempts.reduce(
      (sum, attempt) => sum + attempt.estimatedRgbaMipBytes,
      0,
    ),
    perCompleteRafBucket: {
      count: distribution(complete.map((bucket) => bucket.initTextureAttempts)),
      cpuMs: distribution(complete.map((bucket) => bucket.initTextureMs)),
      estimatedRgbaMipBytes: distribution(
        complete.map((bucket) => bucket.initTextureEstimatedRgbaMipBytes),
      ),
    },
    attemptsWithoutMainRender: buckets
      .filter((bucket) => bucket.mainRenders === 0)
      .reduce((sum, bucket) => sum + bucket.initTextureAttempts, 0),
    rafIntervalMsByAttemptCount: {
      coincident: intervalsByCount(coincident),
      nextFrame: intervalsByCount(nextFrame),
    },
  };
}
function summarize(sample) {
  const intervals = sample.frames.map((f) => f.intervalMs);
  const activeFrames = sample.frames.filter((f) => f.mainRenders > 0);
  const buckets = [...sample.frames, ...sample.partialFrameBuckets].sort(
    (a, b) => a.startTimeMs - b.startTimeMs,
  );
  const perRenderedFrame = {};
  // Keep legacy distributions restricted to the original full RAF metrics.
  for (const key of [
    "renderMs",
    "sceneMatrixMs",
    "sceneMatrixInsideRenderMs",
    "renderCalls",
    "drawCalls",
    "triangles",
    "mainDrawCalls",
    "mainTriangles",
    "mainRenderMs",
    "mainRenders",
    "renderExcludingSceneMatrixMs",
  ]) {
    perRenderedFrame[key] = distribution(activeFrames.map((f) => f[key]));
  }
  const windowSummary = (startTimeMs, endTimeMs) => {
    if (startTimeMs === null || endTimeMs === null || endTimeMs < startTimeMs) return null;
    const contained = buckets.filter(
      (bucket) => bucket.startTimeMs >= startTimeMs && bucket.endTimeMs <= endTimeMs,
    );
    const complete = contained.filter((bucket) => !bucket.partial);
    const attempts = sample.initTextureAttempts.filter(
      (attempt) => attempt.startTimeMs >= startTimeMs && attempt.startTimeMs < endTimeMs,
    );
    const mainRenders = sample.mainRenderTimings.filter(
      (render) => render.startTimeMs >= startTimeMs && render.endTimeMs <= endTimeMs,
    );
    return {
      startTimeMs,
      endTimeMs,
      elapsedMs: endTimeMs - startTimeMs,
      initTextureObservedFromMs:
        sample.rendererHookAtMs !== null && sample.rendererHookAtMs < endTimeMs
          ? Math.max(startTimeMs, sample.rendererHookAtMs)
          : null,
      completeRafBuckets: complete.length,
      boundaryRafBucketsExcluded:
        sample.frames.filter(
          (frame) => frame.startTimeMs < endTimeMs && frame.endTimeMs > startTimeMs,
        ).length - complete.length,
      rafIntervalMs: intervalDistribution(complete.map((frame) => frame.intervalMs)),
      mainRenderIntervalMs: intervalDistribution(
        mainRenders.slice(1).map((render, i) => render.startTimeMs - mainRenders[i].startTimeMs),
      ),
      initTexture: summarizeInitTexture(attempts, contained),
      longTaskOverlapMs: sample.longTasks.reduce(
        (sum, task) =>
          sum +
          Math.max(
            0,
            Math.min(endTimeMs, task.startTime + task.duration) -
              Math.max(startTimeMs, task.startTime),
          ),
        0,
      ),
    };
  };
  const enterAt = sample.milestones.enterClickAtMs;
  const coldWindows =
    enterAt !== null && enterAt >= sample.started
      ? {
          preHook: windowSummary(sample.started, sample.rendererHookAtMs),
          hookToEnter: windowSummary(sample.rendererHookAtMs, enterAt),
          enterToReady: windowSummary(enterAt, sample.readyAtMs ?? sample.ended),
        }
      : null;
  return {
    ...sample,
    summary: {
      rafIntervalMs: intervalDistribution(intervals),
      mainRenderIntervalMs: intervalDistribution(sample.mainIntervals),
      perRenderedFrame,
      initTexture: summarizeInitTexture(sample.initTextureAttempts, buckets),
      coldWindows,
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
  let readySinceAtMs = null;
  let latest;
  while (Date.now() - started < config.settleTimeoutMs) {
    if (errors.length || network.failures.length)
      throw new Error(
        `Page/asset errors: ${JSON.stringify({ errors, failures: network.failures })}`,
      );
    const observed = await page.evaluate(() => ({
      snapshot: window.__galleryBenchmark?.snapshot(),
      atMs: performance.now(),
    }));
    latest = observed.snapshot;
    const pending = network.pending();
    const t = latest?.textures;
    // Encoded speculative prefetch is not required for this rendered view.
    // Base/hi-res/preload decoding, GPU uploads and missing mounted bases are.
    // activeLoads also includes active speculative encoded prefetch.
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
    if (ready) {
      quietSince ??= Date.now();
      readySinceAtMs ??= observed.atMs;
    } else {
      quietSince = null;
      readySinceAtMs = null;
    }
    if (quietSince !== null && Date.now() - quietSince >= 1500)
      return {
        waitedMs: Date.now() - started,
        readySinceAtMs,
        readyAtMs: observed.atMs,
        snapshot: latest,
        network: pending,
      };
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
async function measureScenario(page, session, scenario, run) {
  const measure = () =>
    page.evaluate(
      ({ scenario: s, duration }) => window.__museumBenchmarkHarness.measure(s, duration),
      { scenario, duration: config.durationMs },
    );
  if (!config.cpuProfile) return { sample: await measure(), cpuProfile: null };

  const directory = out.replace(/\.json$/i, "") + "-profiles";
  await mkdir(directory, { recursive: true });
  const cpuProfile = {
    path: path.join(directory, `run-${run}-${scenario.id}.cpuprofile`),
    samplingIntervalUs: 1000,
    startedAtMs: null,
    endedAtMs: null,
  };
  let sample;
  let profiling = false;
  await session.send("Profiler.enable");
  try {
    await session.send("Profiler.setSamplingInterval", { interval: cpuProfile.samplingIntervalUs });
    await session.send("Profiler.start");
    profiling = true;
    cpuProfile.startedAtMs = await page.evaluate(() => performance.now());
    sample = await measure();
  } finally {
    try {
      if (profiling) {
        cpuProfile.endedAtMs = await page.evaluate(() => performance.now()).catch(() => null);
        const { profile } = await session.send("Profiler.stop");
        await writeFile(cpuProfile.path, JSON.stringify(profile));
      }
    } finally {
      await session.send("Profiler.disable");
    }
  }
  return { sample, cpuProfile };
}
function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

async function main() {
  const launch = await browserOptions();
  const report = {
    schemaVersion: 2,
    status: "running",
    startedAt: new Date().toISOString(),
    config,
    methodology: {
      build: "development with debug HUD enabled",
      framePercentiles:
        "nearest-rank; legacy frames and percentiles contain complete RAF intervals; initial/final buckets are in partialFrameBuckets; main-render intervals begin after hook attachment",
      cpu: "wall time inside renderer.render, all passes; sceneMatrixMs wraps only the root scene updateMatrixWorld (inclusive subtree cost); GPU time is not measured",
      motion:
        "camera pose at RAF boundaries, fixed 2 m/s 5 m approach then 180-degree turn over 250 ms; bypasses collision/input",
      cache:
        "fresh browser context each run; ordered scenarios share in-memory caches within that run; server/OS caches are not cleared",
      readiness:
        "mounted base textures, observed texture queues and image requests settled; activeLoads includes active speculative encoded prefetch, while queued speculative prefetch may remain",
      instrumentation:
        "renderer/scene/initTexture wrappers only during collection; debug snapshot read at most every 250 ms; no screenshot during collection; wrapper overhead counts against the upload pump budget",
      initTexture:
        "explicit initTexture attempts after rendererHookAtMs, including no-ops and thrown calls; excludes pre-hook and lazy draw-time uploads; duration is synchronous CPU/submission wall time, not GPU execution; estimated bytes are source width*height*4*1.34, not transfer bytes",
      attribution:
        "buckets span collector callback wall times; RAF timestamps are stored separately; coincident and nextFrame group full RAF intervals by attempts in that bucket or its predecessor, including buckets without main renders; association does not prove causality",
      milestones:
        "performance.now clock; Enter enabled observed by DOM mutation; actual click observed in capture listener; legacy enterAtMs remains pre-Playwright-click; first main render completion means CPU submission completed, not presentation; readiness samples are observed at 250 ms cadence and can become unready again; historical ForegroundQueuesDrained fields include active speculative prefetch through activeLoads",
      coldWindows:
        "pre-hook, hook to actual Enter, Enter to confirmed ready; windows keep only contained RAF buckets and report boundary exclusions; attempts assigned by call start; readyAtMs includes settle quiet/stability padding",
      cpuProfile:
        "optional CDP CPU sampling at 1000 microseconds for non-cold measure calls only; raw profiles have profiler overhead and exclude settle/screenshots; page performance.now markers are taken just after Profiler.start and just before Profiler.stop, while sample.started/ended bound collection",
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
          ...summarize({ ...cold, readyAtMs: coldReady.readyAtMs }),
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
        const { sample, cpuProfile } = await measureScenario(page, session, scenario, run);
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
          ...(cpuProfile ? { cpuProfile } : {}),
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
