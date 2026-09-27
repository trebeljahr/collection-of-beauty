"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Whether the viewer has stopped touching the mouse and keyboard for
 * `timeoutMs`. Drives the slideshow's auto-hiding chrome.
 *
 * Mouse movement, wheel and any key press call `wake()`. Touch is left to
 * the caller: on a phone a tap should toggle the chrome, and a
 * `pointermove` from a finger would only ever show it. `hide()` is that
 * toggle's other half. While `enabled` is false the chrome stays up.
 */
export function useIdle(
  enabled: boolean,
  timeoutMs: number,
): { idle: boolean; wake(): void; hide(): void } {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const clear = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const wake = useCallback(() => {
    setIdle(false);
    clear();
    if (!enabledRef.current) return;
    timerRef.current = setTimeout(() => setIdle(true), timeoutMs);
  }, [clear, timeoutMs]);

  const hide = useCallback(() => {
    clear();
    if (enabledRef.current) setIdle(true);
  }, [clear]);

  useEffect(() => {
    if (!enabled) {
      clear();
      setIdle(false);
      return;
    }
    wake();
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "touch") wake();
    };
    const opts = { passive: true } as const;
    window.addEventListener("pointermove", onPointer, opts);
    window.addEventListener("keydown", wake, opts);
    window.addEventListener("wheel", wake, opts);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("wheel", wake);
      clear();
    };
  }, [enabled, wake, clear]);

  return { idle: enabled && idle, wake, hide };
}
