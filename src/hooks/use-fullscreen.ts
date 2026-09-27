"use client";

import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";

/** Safari on macOS before 16.4, and Safari on iPad, only expose the
 *  prefixed API. lib.dom does not declare it. */
type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function fullscreenElement(): Element | null {
  const doc = document as WebkitDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** Swallow the rejection a refused request returns (no user gesture, a
 *  permissions policy, an iframe without `allowfullscreen`). Older WebKit
 *  returns undefined rather than a promise. */
function quietly(result: Promise<void> | void | undefined): void {
  if (result && typeof result.catch === "function") result.catch(() => {});
}

/**
 * Element fullscreen for `ref`, standard or webkit-prefixed.
 *
 * `supported` is false on the server and on iPhone, where Safari offers
 * fullscreen for <video> only; there the caller's own fixed overlay is
 * the fullscreen. It is read after mount so server and client markup
 * agree.
 *
 * `toggle` must run synchronously inside a user gesture (a click or a key
 * press). Safari refuses a request made after an await.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>): {
  supported: boolean;
  active: boolean;
  toggle(): void;
  exit(): void;
} {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const doc = document as WebkitDocument;
    setSupported(Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled));
    const update = () => setActive(ref.current !== null && fullscreenElement() === ref.current);
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, [ref]);

  const exit = useCallback(() => {
    const el = ref.current;
    if (!el || fullscreenElement() !== el) return;
    const doc = document as WebkitDocument;
    if (doc.exitFullscreen) quietly(doc.exitFullscreen());
    else quietly(doc.webkitExitFullscreen?.());
  }, [ref]);

  const toggle = useCallback(() => {
    const el = ref.current as WebkitElement | null;
    if (!el) return;
    if (fullscreenElement() === el) {
      exit();
      return;
    }
    if (el.requestFullscreen) quietly(el.requestFullscreen({ navigationUI: "hide" }));
    else quietly(el.webkitRequestFullscreen?.());
  }, [ref, exit]);

  // Memoised so callers can list the result as an effect dependency
  // without re-binding their listeners on every render.
  return useMemo(() => ({ supported, active, toggle, exit }), [supported, active, toggle, exit]);
}
