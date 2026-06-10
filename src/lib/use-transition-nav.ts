"use client";

import { useRouter } from "next/navigation";
import { type MouseEvent, useCallback } from "react";

type Options = {
  /** Use `router.replace` instead of `router.push`. Keeps the back stack
   *  shallow when navigating between sibling pages (e.g. prev/next on the
   *  artwork detail page, so a single back tap returns to the gallery). */
  replace?: boolean;
  /** Element to tag with `view-transition-name` just before the transition
   *  starts. Lets the gallery tile share a name with the detail-page hero
   *  so the browser animates the FLIP automatically. */
  vtElement?: HTMLElement | null;
  vtName?: string;
};

/** Wrap a Next.js soft navigation in `document.startViewTransition` when
 *  the browser supports it. Falls back to a plain `router.push`/`replace`
 *  on browsers without the View Transitions API (Firefox today).
 *
 *  Returns a click handler suitable for `<Link onClick={...}>` or any
 *  anchor — intercepts only plain left clicks; modifier-clicks (open in
 *  new tab, etc.) defer to the default behaviour.
 */
export function useTransitionNav() {
  const router = useRouter();
  return useCallback(
    (e: MouseEvent<HTMLElement>, href: string, options: Options = {}) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const navigate = () => {
        if (options.replace) router.replace(href);
        else router.push(href);
      };

      const startVT = (
        document as Document & {
          startViewTransition?: (cb: () => void | Promise<void>) => unknown;
        }
      ).startViewTransition;

      if (!startVT) {
        e.preventDefault();
        navigate();
        return;
      }

      e.preventDefault();
      if (options.vtElement && options.vtName) {
        options.vtElement.style.viewTransitionName = options.vtName;
      }
      startVT.call(document, navigate);
    },
    [router],
  );
}

/** Imperative variant for keyboard / non-anchor navigation. Same
 *  startViewTransition + fallback behaviour, minus the click-event
 *  guards. */
export function useTransitionPush() {
  const router = useRouter();
  return useCallback(
    (href: string, options: Omit<Options, "vtElement" | "vtName"> = {}) => {
      const navigate = () => {
        if (options.replace) router.replace(href);
        else router.push(href);
      };

      const startVT = (
        document as Document & {
          startViewTransition?: (cb: () => void | Promise<void>) => unknown;
        }
      ).startViewTransition;

      if (!startVT) {
        navigate();
        return;
      }
      startVT.call(document, navigate);
    },
    [router],
  );
}
