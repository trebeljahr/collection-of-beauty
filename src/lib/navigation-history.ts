// The last two in-app URLs, recorded by <NavigationTracker> in the root
// layout. Module scope on purpose: it survives client navigations and
// resets on a full load, which is exactly when there is no in-app page
// to go back to.

let currentUrl: string | null = null;
let previousUrl: string | null = null;
let replacingWith: string | null = null;

export function recordNavigation(url: string): void {
  if (url === currentUrl) return;
  // A replace swaps the current history entry, so the page behind it is
  // still the one it was before. Without this, one prev/next step on the
  // artwork page made "Back to …" think the visitor came from the
  // previous artwork.
  if (replacingWith !== null && pathnameOf(url) === replacingWith) {
    replacingWith = null;
    currentUrl = url;
    return;
  }
  replacingWith = null;
  previousUrl = currentUrl;
  currentUrl = url;
}

/** Call right before a `router.replace` (or a `<Link replace>` click),
 *  so the navigation it causes is recorded as a replace. */
export function noteReplace(href: string): void {
  replacingWith = pathnameOf(href);
}

/** Pathname of the page the visitor client-navigated from, if any. */
export function previousPathname(): string | null {
  return previousUrl ? pathnameOf(previousUrl) : null;
}

export function pathnameOf(url: string): string {
  return new URL(url, "http://x").pathname;
}
