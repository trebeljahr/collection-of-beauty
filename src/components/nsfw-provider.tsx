"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

export type NsfwMode = "hide" | "blur" | "show";

const STORAGE_KEY = "cob:nsfw-mode";
const DEFAULT_MODE: NsfwMode = "blur";
const MODES: NsfwMode[] = ["blur", "show", "hide"];

type NsfwApi = {
  /** Active mode. Always returns the default until the post-mount
   *  hydration effect runs — keeps SSR markup deterministic so the
   *  first paint never flips after localStorage reads. */
  mode: NsfwMode;
  setMode: (mode: NsfwMode) => void;
  /** Cycle blur → show → hide → blur. Wired to the nav toggle. */
  cycleMode: () => void;
  /** True once the mounted effect has finished reading localStorage.
   *  Components that need the *real* user-chosen value (e.g. "should
   *  I drop NSFW items from this list right now?") should gate on
   *  this; otherwise hydration mismatch + first-paint flicker. */
  hydrated: boolean;
};

const NsfwContext = createContext<NsfwApi | null>(null);

export function useNsfw(): NsfwApi {
  const ctx = useContext(NsfwContext);
  if (!ctx) throw new Error("useNsfw must be used within <NsfwProvider>");
  return ctx;
}

export function NsfwProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<NsfwMode>(DEFAULT_MODE);
  const [hydrated, setHydrated] = useState(false);

  // Read the persisted preference once on mount. Doing this on the
  // server would diverge between SSR and client first paint; doing
  // it inside useState's lazy initializer would too (the initializer
  // runs on the server). The post-mount effect is the only safe
  // place — first paint matches SSR, the second paint reflects the
  // user's prior choice.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "hide" || raw === "blur" || raw === "show") {
        setModeState(raw);
      }
    } catch {
      // localStorage can throw in private-mode Safari; fall through
      // with the default.
    }
    setHydrated(true);
  }, []);

  const setMode = useCallback((next: NsfwMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — preference simply won't persist this session
    }
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const idx = MODES.indexOf(prev);
      const next = MODES[(idx + 1) % MODES.length];
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return (
    <NsfwContext.Provider value={{ mode, setMode, cycleMode, hydrated }}>
      {children}
    </NsfwContext.Provider>
  );
}

export const NSFW_MODE_LABELS: Record<NsfwMode, string> = {
  hide: "NSFW: Hidden",
  blur: "NSFW: Blurred",
  show: "NSFW: Shown",
};
