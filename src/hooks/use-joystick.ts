"use client";

import JoystickController, { type JoystickOnMove, type JoystickOptions } from "joystick-controller";
import { type RefObject, useEffect, useRef } from "react";

// joystick-controller (v2) calls `crypto.randomUUID()` to mint per-
// instance DOM ids. That API is restricted to *secure contexts* (HTTPS
// or localhost), so on a phone hitting the dev server via LAN IP
// (http://192.168.x.x:PORT) the call throws "randomUUID is not a
// function" and the joystick never mounts. Polyfill with a unique-
// enough string at import time — the library only uses the result as
// a DOM id suffix (it strips dashes and concatenates), so any
// alphanumeric collision-resistant id works.
if (typeof window !== "undefined" && typeof window.crypto?.randomUUID !== "function") {
  Object.defineProperty(window.crypto, "randomUUID", {
    value: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    configurable: true,
    writable: true,
  });
}

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
  // Library-side opacity is 1.0 — we set per-element alpha in the CSS
  // overrides keyed off `controllerClass` / `joystickClass` below so we
  // can give the knob full opacity (it's the bit the user actually
  // grabs) while keeping the surrounding pad subtler. Setting opacity
  // < 1 here would multiply through and dim everything together.
  opacity: 1,
  maxRange: 80,
  radius: 70,
  joystickRadius: 40,
  joystickClass: "gallery-joystick-knob",
  controllerClass: "gallery-joystick-pad",
  containerClass: "gallery-joystick-container",
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
    // that establishes its own stacking context, and forces
    // `touch-action: none` inline on the whole subtree so mobile
    // browsers can't reinterpret a finger-drag as a scroll/zoom and
    // fire pointercancel — which the library handles by snapping the
    // knob back to centre. CSS class rules in globals.css cover the
    // same ground but inline-style wins over any specificity surprise.
    const parentEl = parentRef?.current;
    const containerEl = document.getElementById(`joystick-container-${joystick.id}`);
    const controllerEl = document.getElementById(`joystick-controller-${joystick.id}`);
    const knobEl = document.getElementById(`joystick-${joystick.id}`);
    if (parentEl && containerEl) {
      parentEl.appendChild(containerEl);
      containerEl.style.zIndex = "40";
    }
    for (const el of [containerEl, controllerEl, knobEl]) {
      if (!el) continue;
      el.style.touchAction = "none";
      el.style.userSelect = "none";
      el.style.webkitUserSelect = "none";
      // The two -webkit-* properties below aren't typed on
      // CSSStyleDeclaration but iOS Safari reads them — set via
      // setProperty so TypeScript's typings don't trip us.
      el.style.setProperty("-webkit-touch-callout", "none");
      el.style.setProperty("-webkit-tap-highlight-color", "transparent");
    }
    return () => {
      joystick.destroy();
      dataRef.current = ZERO;
    };
  }, [enabled, parentRef]);

  return { getData: () => dataRef.current };
}
