"use client";

import { Text } from "@react-three/drei";
import { type ComponentProps, Suspense } from "react";

/**
 * drei's <Text> in a Suspense boundary of its own. Use it for every text
 * in a scene; `scene-text.test.ts` fails on a direct import of drei's.
 *
 * drei's <Text> suspends until troika has its font (`suspend()` keyed on
 * font and characters), and R3F 9 throws a suspension it does not catch
 * inside the canvas out of <Canvas> itself. The nearest boundary above
 * the museum's canvas is next/dynamic's, so the first plaque or floor
 * sign to mount hid the whole museum, its HUD and its loading curtain
 * behind that boundary's fallback until the font arrived, and held back
 * every other mesh of the scene's first commit with it. Here a text
 * waiting on its font draws nothing, and nothing else waits for it.
 */
export function SceneText(props: ComponentProps<typeof Text>) {
  return (
    <Suspense fallback={null}>
      <Text {...props} />
    </Suspense>
  );
}
