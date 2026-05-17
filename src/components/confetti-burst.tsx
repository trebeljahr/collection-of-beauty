"use client";

import { useEffect } from "react";

/**
 * Fires a sequenced confetti burst once on mount, then unmounts cleanly.
 *
 * Implementation notes:
 *   - canvas-confetti is dynamically imported so the dep stays out of
 *     the initial page bundle (it's ~12 KB gz and only ever runs on
 *     this one route).
 *   - `prefers-reduced-motion: reduce` is honored — we skip the burst
 *     entirely for users who've opted out of decorative motion.
 *   - The burst fires across three staggered shots from different
 *     origins so it feels less like a single pop and more like a small
 *     celebration. ~1.4 s end-to-end; non-blocking via canvas overlay.
 */
export function ConfettiBurst() {
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let cancelled = false;

    (async () => {
      const { default: confetti } = await import("canvas-confetti");
      if (cancelled) return;

      const colors = ["#c9a86a", "#7a6f5a", "#cfd8d2", "#b85c38", "#1b365d"];

      // First shot — big, center-bottom.
      confetti({
        particleCount: 110,
        spread: 75,
        startVelocity: 55,
        origin: { x: 0.5, y: 0.7 },
        colors,
        scalar: 1.05,
      });

      // Side shots a beat later, biased upward to make the spread feel framed.
      setTimeout(() => {
        if (cancelled) return;
        confetti({
          particleCount: 70,
          angle: 60,
          spread: 65,
          startVelocity: 50,
          origin: { x: 0, y: 0.75 },
          colors,
        });
        confetti({
          particleCount: 70,
          angle: 120,
          spread: 65,
          startVelocity: 50,
          origin: { x: 1, y: 0.75 },
          colors,
        });
      }, 220);

      // Slow trailing sparkle — smaller, drifty.
      setTimeout(() => {
        if (cancelled) return;
        confetti({
          particleCount: 40,
          spread: 110,
          startVelocity: 30,
          gravity: 0.6,
          drift: 0.4,
          ticks: 220,
          origin: { x: 0.5, y: 0.5 },
          colors,
          scalar: 0.8,
        });
      }, 700);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
