"use client";

import JoystickController, { type JoystickOnMove, type JoystickOptions } from "joystick-controller";
import { useEffect, useRef } from "react";

const ZERO: JoystickOnMove = {
  x: 0,
  y: 0,
  leveledX: 0,
  leveledY: 0,
  angle: 0,
  distance: 0,
};

const defaultParameters: JoystickOptions = {
  x: "15%",
  y: "15%",
  opacity: 0.55,
  maxRange: 80,
  radius: 70,
  joystickRadius: 40,
  joystickClass: "joystick",
  containerClass: "joystick-container",
  distortion: false,
  mouseClickButton: "ALL",
  hideContextMenu: true,
};

type Options = {
  /** Optional override for `defaultParameters`. */
  params?: JoystickOptions;
  /** Per-event callback (fires whenever the joystick onMove fires —
   *  pointerdown, pointermove, pointerup-reset). */
  cb?: (data: JoystickOnMove) => void;
  /** When false the joystick is not mounted (and any existing
   *  instance is destroyed). Useful for desktop/mobile gating. */
  enabled?: boolean;
};

/**
 * React wrapper around joystick-controller. Returns a `getData()`
 * accessor that always reads the latest joystick state — perfect for
 * polling inside a useFrame loop. Pass `cb` if you also want a
 * per-event callback (e.g. immediate look rotation).
 */
export function useJoystick({ params, cb, enabled = true }: Options = {}) {
  const dataRef = useRef<JoystickOnMove>(ZERO);
  const cbRef = useRef(cb);
  cbRef.current = cb;

  // biome-ignore lint/correctness/useExhaustiveDependencies: params is intentionally read only on mount — re-creating the joystick on every render would tear down its DOM mid-touch
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const merged: JoystickOptions = { ...defaultParameters, ...params };
    const joystick = new JoystickController(merged, (data) => {
      dataRef.current = data;
      cbRef.current?.(data);
    });
    return () => {
      joystick.destroy();
      dataRef.current = ZERO;
    };
  }, [enabled]);

  return { getData: () => dataRef.current };
}
