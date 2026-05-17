"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

const ACK_KEY = "cob.nsfw.ack";
const BLUR_KEY = "cob.nsfw.blur";
const ROOT_ATTR = "nsfwBlur";

type Ack = "shown" | "hidden" | null;

type NsfwApi = {
  /** null until the user has answered the landing acknowledgement. */
  ack: Ack;
  /** Whether sensitive thumbnails should render blurred. */
  blur: boolean;
  setBlur: (next: boolean) => void;
  /** Records the landing-page choice and seeds the blur default. */
  acknowledge: (choice: "shown" | "hidden") => void;
};

const NsfwContext = createContext<NsfwApi | null>(null);

export function useNsfw(): NsfwApi {
  const ctx = useContext(NsfwContext);
  if (!ctx) throw new Error("useNsfw must be used within <NsfwProvider>");
  return ctx;
}

function readAck(): Ack {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(ACK_KEY);
    return v === "shown" || v === "hidden" ? v : null;
  } catch {
    return null;
  }
}

function readBlur(ack: Ack): boolean {
  if (typeof window === "undefined") return ack !== "shown";
  try {
    const v = window.localStorage.getItem(BLUR_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {}
  // Pre-acknowledgement: safest default is blurred. After acknowledgement
  // we'd have written BLUR_KEY, so this branch only runs for users who
  // somehow have ack set but no blur pref — fall back to the ack choice.
  return ack !== "shown";
}

function syncRoot(blur: boolean) {
  if (typeof document === "undefined") return;
  if (blur) document.documentElement.dataset[ROOT_ATTR] = "1";
  else delete document.documentElement.dataset[ROOT_ATTR];
}

export function NsfwProvider({ children }: { children: ReactNode }) {
  // Initial state defaults match the inline boot script in `layout.tsx`:
  // both treat "no ack yet" as "blur on". That keeps the data-attribute
  // and React state aligned across the first paint without needing a
  // hydration-suppressed wrapper around every blurred image.
  const [ack, setAck] = useState<Ack>(null);
  const [blur, setBlurState] = useState<boolean>(true);

  // Hydrate from localStorage on mount. The inline boot script already
  // set the root data-attr, so no flash; this step only catches React
  // up to the DOM truth.
  useEffect(() => {
    const a = readAck();
    const b = readBlur(a);
    setAck(a);
    setBlurState(b);
    syncRoot(b);
  }, []);

  const setBlur = useCallback((next: boolean) => {
    setBlurState(next);
    syncRoot(next);
    try {
      window.localStorage.setItem(BLUR_KEY, next ? "1" : "0");
    } catch {}
  }, []);

  const acknowledge = useCallback(
    (choice: "shown" | "hidden") => {
      setAck(choice);
      try {
        window.localStorage.setItem(ACK_KEY, choice);
      } catch {}
      setBlur(choice === "hidden");
    },
    [setBlur],
  );

  return (
    <NsfwContext.Provider value={{ ack, blur, setBlur, acknowledge }}>
      {children}
      <NsfwLandingModal />
    </NsfwContext.Provider>
  );
}

function NsfwLandingModal() {
  const { ack, acknowledge } = useNsfw();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || ack !== null) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nsfw-ack-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-2xl">
        <h2 id="nsfw-ack-title" className="font-serif text-xl">
          A note before you browse
        </h2>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          This collection includes historical works that depict nudity — bathers, mythological
          subjects, anatomical and figurative studies. You can browse with these works blurred by
          default and reveal individually, or show everything.
        </p>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          You can change this any time in the header menu.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => acknowledge("hidden")}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)]"
          >
            Blur sensitive works
          </button>
          <button
            type="button"
            onClick={() => acknowledge("shown")}
            className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)] hover:opacity-90"
          >
            Show everything
          </button>
        </div>
      </div>
    </div>
  );
}
