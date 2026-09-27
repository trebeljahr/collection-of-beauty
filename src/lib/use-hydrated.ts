"use client";

import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};

/**
 * False in the server render and in the render that hydrates it; true
 * everywhere else — right after hydration, and from the very first render
 * of anything mounted on the client (a client navigation, a load-more
 * batch). The same idiom gallery-browser.tsx uses for its `clientMount`.
 *
 * Use it for markup the server must not send but a client-mounted
 * component may render straight away: React re-renders the hydrated tree
 * once with `true`, so the server HTML and the hydration render still
 * match exactly.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}
