/** Small, tab-local recovery records. No request is replayed after a reload. */
const PREFIX = "cob:release-state:";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const pending = new Map<string, unknown>();
const snapshots = new Map<string, () => unknown>();
const holds = new Set<symbol>();

export function readReleaseState<T>(key: string, valid: (value: unknown) => value is T): T | null {
  if (typeof window === "undefined") return null;
  try {
    const record = JSON.parse(sessionStorage.getItem(PREFIX + key) ?? "null");
    if (
      record?.schema === 1 &&
      Number.isFinite(record.savedAt) &&
      Date.now() - record.savedAt >= 0 &&
      Date.now() - record.savedAt <= MAX_AGE &&
      valid(record.value)
    )
      return record.value;
  } catch {
    /* Missing, blocked and invalid records are not state. */
  }
  return null;
}

export function rememberReleaseState(key: string, value: unknown): boolean {
  pending.set(key, value);
  try {
    const encoded = JSON.stringify({ schema: 1, savedAt: Date.now(), value });
    if (encoded.length > 32_768) return false;
    sessionStorage.setItem(PREFIX + key, encoded);
    pending.delete(key);
    return true;
  } catch {
    return false;
  }
}

export function registerReleaseSnapshot(key: string, snapshot: () => unknown): () => void {
  snapshots.set(key, snapshot);
  return () => {
    // A replaced registration owns the key now; an older unmount must not
    // overwrite its recovery record with a stale snapshot.
    if (snapshots.get(key) !== snapshot) return;
    // React can unmount a failed segment before its error boundary reloads it.
    const value = snapshot();
    if (value !== undefined) rememberReleaseState(key, value);
    if (snapshots.get(key) === snapshot) snapshots.delete(key);
  };
}

export function holdReleaseReload(): () => void {
  const token = Symbol();
  holds.add(token);
  return () => {
    holds.delete(token);
  };
}

export function flushReleaseState(): boolean {
  for (const [key, snapshot] of snapshots) {
    try {
      const value = snapshot();
      if (value !== undefined) rememberReleaseState(key, value);
    } catch {
      return false;
    }
  }
  for (const [key, value] of pending) rememberReleaseState(key, value);
  return pending.size === 0 && holds.size === 0;
}

export function installReleaseNavigationGuard(): () => void {
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (flushReleaseState()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  const pageHide = () => {
    flushReleaseState();
  };
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", pageHide);
  return () => {
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("pagehide", pageHide);
  };
}
