"use client";

import JoystickController, { type JoystickOnMove, type JoystickOptions } from "joystick-controller";
import { type RefObject, useEffect, useRef } from "react";

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
  /** If provided, the joystick's DOM container is moved into this
   *  element after mount. The library hardcodes `document.body` as the
   *  parent — that breaks the moment any ancestor goes fullscreen
   *  (`element.requestFullscreen()` only paints the fullscreen subtree,
   *  so a sibling in `<body>` is invisible). Pass the fullscreen target
   *  (e.g. the gallery host) so the joystick stays visible. */
  parentRef?: RefObject<HTMLElement | null>;
};

/**
 * React wrapper around joystick-controller. Returns a `getData()`
 * accessor that always reads the latest joystick state — perfect for
 * polling inside a useFrame loop. Pass `cb` if you also want a
 * per-event callback (e.g. immediate look rotation).
 */
export function useJoystick({ params, cb, enabled = true, parentRef }: Options = {}) {
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
    // Reparent into the fullscreen target so the joystick stays visible
    // while the host element is in fullscreen. The library exposes its
    // unique `id`; the container's DOM id is `joystick-container-${id}`.
    // Also bumps z-index so the joystick paints above any HUD overlay
    // that establishes its own stacking context.
    const parentEl = parentRef?.current;
    if (parentEl) {
      const containerEl = document.getElementById(`joystick-container-${joystick.id}`);
      if (containerEl) {
        parentEl.appendChild(containerEl);
        containerEl.style.zIndex = "40";
      }
    }
    return () => {
      joystick.destroy();
      dataRef.current = ZERO;
    };
  }, [enabled, parentRef]);

  return { getData: () => dataRef.current };
}
