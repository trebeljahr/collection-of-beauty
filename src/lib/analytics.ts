/** Plausible's queueing stub, installed by the loader script in
 *  src/app/layout.tsx. Typed here rather than in a global .d.ts, since
 *  this module is the only caller. */
type PlausibleFn = (
  event: string,
  options?: { props: Record<string, string | number | boolean> },
) => void;

/**
 * Send a Plausible custom event. Silent when Plausible is absent: on
 * localhost, on any host other than the production domain (the loader
 * checks), and wherever a blocker removed the script.
 */
export function trackEvent(name: string, props?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  try {
    (window as Window & { plausible?: PlausibleFn }).plausible?.(
      name,
      props ? { props } : undefined,
    );
  } catch {
    // Analytics never gets to break the page.
  }
}
