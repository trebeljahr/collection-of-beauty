"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { movedEnoughToWake } from "@/lib/slideshow";

type Point = { x: number; y: number };

export type UseIdleOptions = {
  /** Asked when the timeout runs out. True keeps the chrome up for
   *  another round, e.g. while the mouse rests on a control. */
  stayAwake?: () => boolean;
  /** Whether a key press wakes the chrome. False for a key the caller
   *  handles itself, like one that toggles the chrome. */
  keyWakes?: (event: KeyboardEvent) => boolean;
};

/**
 * Whether the viewer has stopped touching the mouse and keyboard for
 * `timeoutMs`. Drives the slideshow's auto-hiding chrome.
 *
 * Mouse movement, wheel and any key press call `wake()`, except keys
 * `keyWakes` turns down.
 *
 * Once idle, the pointer must move `WAKE_MOVE_PX` from where it rested
 * to wake the chrome, so jitter and synthetic moves do not.
 *
 * Touch is left to the caller: on a phone a tap should toggle the chrome,
 * and a `pointermove` from a finger would only ever show it. `hide()` is
 * that toggle's other half; `graceMs` ignores pointer moves for that long
 * after it. While `enabled` is false the chrome stays up.
 */
export function useIdle(
  enabled: boolean,
  timeoutMs: number,
  { stayAwake, keyWakes }: UseIdleOptions = {},
): { idle: boolean; wake(): void; hide(graceMs?: number): void } {
  const [idle, setIdle] = useState(false);
  const idleRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const stayAwakeRef = useRef(stayAwake);
  stayAwakeRef.current = stayAwake;
  const keyWakesRef = useRef(keyWakes);
  keyWakesRef.current = keyWakes;
  // Last known pointer position, and where it was when the chrome hid.
  const pointerRef = useRef<Point | null>(null);
  const restRef = useRef<Point | null>(null);
  const graceUntilRef = useRef(0);

  const clear = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const goIdle = useCallback(() => {
    idleRef.current = true;
    restRef.current = pointerRef.current;
    setIdle(true);
  }, []);

  const arm = useCallback(() => {
    clear();
    if (!enabledRef.current) return;
    timerRef.current = setTimeout(function expire() {
      if (stayAwakeRef.current?.()) {
        timerRef.current = setTimeout(expire, timeoutMs);
        return;
      }
      timerRef.current = null;
      goIdle();
    }, timeoutMs);
  }, [clear, goIdle, timeoutMs]);

  const wake = useCallback(() => {
    idleRef.current = false;
    graceUntilRef.current = 0;
    setIdle(false);
    arm();
  }, [arm]);

  const hide = useCallback(
    (graceMs = 0) => {
      clear();
      if (!enabledRef.current) return;
      graceUntilRef.current = graceMs > 0 ? performance.now() + graceMs : 0;
      goIdle();
    },
    [clear, goIdle],
  );

  useEffect(() => {
    if (!enabled) {
      clear();
      idleRef.current = false;
      setIdle(false);
      return;
    }
    wake();
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const at = { x: e.clientX, y: e.clientY };
      pointerRef.current = at;
      if (!idleRef.current) {
        arm();
        return;
      }
      // Still settling after "Hide controls": where the pointer ends up
      // is where it rests.
      if (performance.now() < graceUntilRef.current) {
        restRef.current = at;
        return;
      }
      const rest = restRef.current;
      if (!rest) {
        restRef.current = at;
        return;
      }
      if (movedEnoughToWake(rest, at)) wake();
    };
    const onKey = (e: KeyboardEvent) => {
      if (keyWakesRef.current?.(e) ?? true) wake();
    };
    const onWheel = () => wake();
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      clear();
    };
  }, [enabled, wake, arm, clear]);

  return { idle: enabled && idle, wake, hide };
}
