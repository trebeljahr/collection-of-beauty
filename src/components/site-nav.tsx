"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIs3DActive } from "@/components/gallery-3d-state";

const LINKS: ReadonlyArray<{ href: string; label: string; sub?: string }> = [
  { href: "/", label: "Gallery", sub: "Browse the full collection" },
  { href: "/timeline", label: "Timeline", sub: "Eight centuries of art, in order" },
  { href: "/artists", label: "Artists", sub: "Painters, illustrators, makers" },
  { href: "/gallery-3d", label: "3D Room", sub: "Walk through a virtual museum" },
];

const ROUTE_3D = "/gallery-3d";
// Must stay in sync with `--animate-nav-slide-out-down` in globals.css.
const SLIDE_OUT_MS = 320;

/**
 * Site header. The site-wide nav is presented as a full-screen modal
 * triggered by a hamburger button — same UX on desktop and mobile,
 * intended to feel like a destination rather than a strip of buttons.
 *
 * The modal traps focus, locks body scroll, dismisses on ESC, on
 * backdrop click, on link tap, and on route change. While the user is
 * inside the 3D experience (post-Enter on the loading overlay), the
 * entire header renders `null` — read from `useIs3DActive()` — so the
 * museum visit isn't framed by the page header.
 *
 * Clicking the "3D Room" entry kicks off a synchronised cross-fade:
 * the modal slides downward off-screen while the new route mounts and
 * its content slides in from the top, so the user feels the gallery
 * "drop in" from the menu rather than seeing a flash of route loading.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  // True for the brief window between clicking "3D Room" in the modal
  // and the slide-out animation completing. While set, the
  // pathname-change effect skips its setOpen(false) so the modal stays
  // mounted and visible during its slide-down.
  const [closingTo3D, setClosingTo3D] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const is3DActive = useIs3DActive();

  const modalRef = useRef<HTMLDivElement | null>(null);
  // Hamburger gets focus back on close so keyboard users don't lose
  // their place. Captured at the moment the modal opens.
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Close the modal whenever the route changes — happens on link tap
  // and any other router.push. Skipped while a 3D-room transition is
  // running so the slide-down animation can play uninterrupted; once
  // the slide-out timeout fires it sets open=false itself.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the only trigger; closingTo3D is read as a guard, the value captured at render time is what we want
  useEffect(() => {
    if (closingTo3D) return;
    setOpen(false);
  }, [pathname]);

  // ESC + Tab focus trap + body-scroll lock while open. Restoring the
  // previous overflow value (rather than blanking it) plays nicely with
  // other components that may already be locking scroll (lightbox,
  // 3D experience).
  useEffect(() => {
    if (!open) return;
    const root = modalRef.current;

    const focusables = (): HTMLElement[] => {
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute("disabled"));
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Initial focus on first link inside the modal.
    const id = window.requestAnimationFrame(() => {
      focusables()[0]?.focus();
    });

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      window.cancelAnimationFrame(id);
      triggerRef.current?.focus();
    };
  }, [open]);

  // 3D-Room click: animate the modal sliding down while the route push
  // mounts the gallery (which has its own slide-in-from-top animation).
  // The two motions look like a single sheet sliding downward — the
  // menu off-screen at the bottom, the gallery into place from above.
  // Under `prefers-reduced-motion` the animation is skipped (in CSS),
  // so we close the modal up-front rather than waiting for the
  // SLIDE_OUT_MS timer, which would otherwise leave the modal mounted
  // for 320ms with nothing visibly animating.
  const handleClick3D = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // If the user is already on /gallery-3d we just close — no
      // animation is meaningful, and triggering one would freeze the
      // modal on top until it finishes.
      if (pathname === ROUTE_3D) return;
      // Modifier-clicks (open in new tab, etc.) bypass the choreography.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setOpen(false);
        router.push(ROUTE_3D);
        return;
      }
      setClosingTo3D(true);
      router.push(ROUTE_3D);
    },
    [pathname, router],
  );

  // Drive the slide-out unmount with a timer keyed to the animation
  // duration. animationend would be ideal, but the event isn't reliably
  // dispatched across all rendering contexts when an animation utility
  // class is swapped on a node that already had an animation running —
  // the modal would freeze in the slide-out state. The timeout matches
  // SLIDE_OUT_MS in globals.css.
  useEffect(() => {
    if (!closingTo3D) return;
    const id = window.setTimeout(() => {
      setClosingTo3D(false);
      setOpen(false);
    }, SLIDE_OUT_MS);
    return () => window.clearTimeout(id);
  }, [closingTo3D]);

  if (is3DActive) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-serif text-lg tracking-wide hover:opacity-70">
          Collection of Beauty
        </Link>

        <button
          ref={triggerRef}
          type="button"
          className="-mr-2 inline-flex size-11 items-center justify-center rounded-md hover:bg-[var(--accent)]"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="site-nav-modal"
          onClick={() => setOpen((v) => !v)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18" />
            <path d="M3 12h18" />
            <path d="M3 18h18" />
          </svg>
        </button>
      </nav>

      {open && (
        // `key` flip on closingTo3D forces a clean remount when the
        // 3D-room transition kicks in. Without it, swapping the
        // `animate-*` className on a node that still has a recently-run
        // animation property doesn't reliably restart the animation in
        // every browser, so animationend never fires and the modal
        // would freeze in its open state. Remounting starts the
        // slide-out from a fresh element.
        <div
          key={closingTo3D ? "closing" : "open"}
          ref={modalRef}
          id="site-nav-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className={`fixed inset-0 z-50 flex flex-col bg-[var(--background)]/95 backdrop-blur-md ${
            closingTo3D ? "animate-nav-slide-out-down" : "animate-nav-fade-in"
          }`}
          // 100dvh keeps the modal full-height on mobile browsers whose
          // address bar shrinks the layout viewport on scroll.
          style={{ minHeight: "100dvh" }}
        >
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4 md:py-6">
            <Link href="/" className="font-serif text-lg tracking-wide hover:opacity-70 md:text-xl">
              Collection of Beauty
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="-mr-2 inline-flex size-11 items-center justify-center rounded-md hover:bg-[var(--accent)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-12">
            <ul className="flex flex-col gap-2 md:gap-3">
              {LINKS.map((l) => {
                const active = pathname === l.href;
                const is3D = l.href === ROUTE_3D;
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={is3D ? handleClick3D : undefined}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-baseline justify-between gap-6 rounded-lg border border-transparent px-5 py-5 transition hover:border-[var(--border)] hover:bg-[var(--accent)] md:py-7 ${
                        active ? "border-[var(--border)] bg-[var(--accent)]" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-serif text-3xl tracking-tight md:text-5xl">
                          {l.label}
                        </span>
                        {l.sub && (
                          <span className="text-sm text-[var(--muted-foreground)] md:text-base">
                            {l.sub}
                          </span>
                        )}
                      </div>
                      <span
                        aria-hidden="true"
                        className="font-serif text-2xl text-[var(--muted-foreground)] transition group-hover:translate-x-1 group-hover:text-[var(--foreground)] md:text-3xl"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}
