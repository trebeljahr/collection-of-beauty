import { flushReleaseState } from "./release-session";

// A tab opened before a deploy still runs the old build's client
// chunks. Once the new container is live those chunks are gone, so the
// next lazy chunk or client navigation mixes two builds and Turbopack
// throws — "module factory is not available", or a plain chunk 404.
// Nothing is wrong with the page; the tab is stale. A full reload
// fetches matching HTML and chunks and fixes it.

const STALE_DEPLOY_PATTERNS = [
  /module factory is not available/i,
  /ChunkLoadError/,
  /Loading chunk [\w-]+ failed/i,
  /Failed to load chunk/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
];

const RELOAD_KEY = "cob:stale-deploy-reload";
// A second skew error inside this window means the reload didn't help
// (e.g. a genuinely broken deploy), so show the error card instead of
// looping.
const RELOAD_WINDOW_MS = 30_000;

export function isStaleDeployError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.name}: ${error.message}`;
  return STALE_DEPLOY_PATTERNS.some((pattern) => pattern.test(text));
}

/** Reloads the page once for a stale-deploy error. Returns true if it did. */
export function reloadIfStaleDeploy(error: unknown): boolean {
  return isStaleDeployError(error) && reloadForReleaseChange();
}

export function reloadForReleaseChange(): boolean {
  if (!flushReleaseState()) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: without a loop guard, don't risk reloading forever.
    return false;
  }
  window.location.reload();
  return true;
}
