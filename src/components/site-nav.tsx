"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Gallery" },
  { href: "/timeline", label: "Timeline" },
  { href: "/artists", label: "Artists" },
  { href: "/lineage", label: "Lineage" },
  { href: "/gallery-3d", label: "3D Room" },
];

/**
 * Site header. Inline link row on `md+`; hamburger + slide-in drawer
 * on mobile. The flat 5-link row would otherwise overflow horizontally
 * below ~500px — which is every phone. Drawer closes on link tap, ESC,
 * backdrop tap, or route change.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes — happens after a link
  // tap, but also covers anything else that calls router.push.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger; the body intentionally only resets local state
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ESC + body-scroll lock while the drawer is open. Restoring the
  // previous overflow value (rather than blanking it) plays nicely
  // with other components that may already be locking it (e.g. the
  // lightbox).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-serif text-lg tracking-wide hover:opacity-70">
          Collection of Beauty
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 text-sm md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className="rounded-md px-3 py-1.5 hover:bg-[var(--accent)] aria-[current=page]:bg-[var(--accent)]"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Hamburger */}
        <button
          type="button"
          className="-mr-2 inline-flex size-11 items-center justify-center rounded-md md:hidden"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
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
            {open ? (
              <path d="M18 6 6 18M6 6l12 12" />
            ) : (
              <>
                <path d="M3 6h18" />
                <path d="M3 12h18" />
                <path d="M3 18h18" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile drawer + backdrop. `aria-hidden` mirrors `open` so
          screen readers don't see the inert sheet on desktop. */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: ESC is wired up via keydown above; this is a click-outside helper. */}
        <div
          className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        {/* Sheet — semantic <nav> (not a true modal; just a slide-out
            menu) so the link list is exposed as navigation to assistive
            tech and biome's `useSemanticElements` lint stays happy. */}
        <nav
          id="mobile-nav-drawer"
          aria-label="Mobile site navigation"
          className={`absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col gap-1 border-l border-[var(--border)] bg-[var(--background)] p-4 shadow-2xl transition-transform duration-200 ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-serif text-base tracking-wide">Menu</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="-mr-2 inline-flex size-11 items-center justify-center rounded-md hover:bg-[var(--accent)]"
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
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className="rounded-md px-3 py-3 text-base hover:bg-[var(--accent)] aria-[current=page]:bg-[var(--accent)] aria-[current=page]:font-medium"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
