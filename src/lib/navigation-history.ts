// The last two in-app URLs, recorded by <NavigationTracker> in the root
// layout. Module scope on purpose: it survives client navigations and
// resets on a full load, which is exactly when there is no in-app page
// to go back to.

let currentUrl: string | null = null;
let previousUrl: string | null = null;

export function recordNavigation(url: string): void {
  if (url === currentUrl) return;
  previousUrl = currentUrl;
  currentUrl = url;
}

/** Pathname of the page the visitor client-navigated from, if any. */
export function previousPathname(): string | null {
  return previousUrl ? new URL(previousUrl, "http://x").pathname : null;
}
