"use client";

import { type RefObject, useEffect, useRef } from "react";

// Anything a browser will Tab to. `[tabindex="-1"]` is excluded on
// purpose: it is programmatically focusable but not part of the tab
// order, so wrapping onto it would strand the user.
const FOCUSABLE_SELECTOR = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

type FocusTrapOptions = {
  /** Everything below is a no-op while this is false. */
  active: boolean;
  /** The modal container. Focus is moved into it and kept inside it. */
  containerRef: RefObject<HTMLElement | null>;
  /** Called on Escape. Omit to leave Escape to the caller. */
  onEscape?: () => void;
  /**
   * Where focus goes when the trap tears down. Defaults to whatever was
   * focused at the moment the trap activated — right for a modal whose
   * trigger lives in another component (the lightbox is opened from a
   * gallery card). Pass a ref when the trigger is known and may not have
   * been the focused element (Safari doesn't focus a clicked button).
   */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Lock body scroll while active. The previous value is restored rather
   * than blanked, so two components locking at once (nav modal over the
   * lightbox, say) don't clobber each other.
   */
  lockScroll?: boolean;
};

/**
 * Focus containment for a `role="dialog" aria-modal="true"` overlay.
 *
 * `aria-modal` is a promise to assistive tech that the rest of the page
 * is unreachable; without a trap it is a lie, and Tab walks the obscured
 * document behind the overlay — worst for a portalled dialog, which
 * lands at the end of `document.body` and so tabs through *everything*
 * first.
 *
 * Focus moves to the first focusable inside the container on activation
 * and back to the trigger on teardown, so a keyboard user doesn't lose
 * their place.
 */
export function useFocusTrap({
  active,
  containerRef,
  onEscape,
  restoreFocusRef,
  lockScroll = true,
}: FocusTrapOptions): void {
  // Held in a ref so an inline `() => setOpen(false)` doesn't re-run the
  // effect on every render — which would re-focus the first element and
  // re-take the scroll lock each time.
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const root = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] => {
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) =>
          !el.hasAttribute("disabled") && el.tabIndex >= 0 && !el.closest('[aria-hidden="true"]'),
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!escapeRef.current) return;
        e.preventDefault();
        escapeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      // Focus sitting outside the dialog (portalled overlay, or a node
      // that was removed) would otherwise Tab into the page behind.
      if (root && activeEl && !root.contains(activeEl)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    const prevOverflow = lockScroll ? document.body.style.overflow : null;
    if (lockScroll) document.body.style.overflow = "hidden";

    // Next frame, so the overlay's own entry animation has committed and
    // the first focusable is really in the DOM.
    const raf = window.requestAnimationFrame(() => {
      focusables()[0]?.focus();
    });

    return () => {
      window.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(raf);
      if (prevOverflow !== null) document.body.style.overflow = prevOverflow;
      const restore = restoreFocusRef?.current ?? previouslyFocused;
      // A trigger unmounted while the modal was open (route change) has
      // nothing to give focus back to; leave it to the document.
      if (restore?.isConnected) restore.focus();
    };
  }, [active, containerRef, restoreFocusRef, lockScroll]);
}
