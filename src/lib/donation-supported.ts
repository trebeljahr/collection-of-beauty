/* The shared donate page on ricos.site sends donors back here as
   `/?supported=1`. Arrival records the moment under the same key
   ricos.site uses, so a later inline ask can stay quiet for 90 days after
   it (ricos.site's `isInQuietPeriod`). Nothing reads the value yet. */

export const DONATE_URL = "https://ricos.site/donate/collection-of-beauty";
export const SUPPORTED_QUERY_KEY = "supported";
export const SUPPORTED_AT_STORAGE_KEY = "donation-supported-at";

const SUPPORTED_PAIR = `${SUPPORTED_QUERY_KEY}=1`;

/** The path, query and hash of `href` with `supported=1` removed, or null
 *  when it carries no such pair. The other pairs are kept byte for byte:
 *  a URLSearchParams round trip would re-encode them (`%20` becomes `+`). */
export function withoutSupportedParam(href: string): string | null {
  const url = new URL(href);
  const pairs = url.search.slice(1).split("&");
  const kept = pairs.filter((pair) => pair !== SUPPORTED_PAIR);
  if (kept.length === pairs.length) return null;
  const query = kept.join("&");
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

type SupportedWindow = {
  location: { href: string };
  history: Pick<History, "state" | "replaceState">;
  localStorage: Pick<Storage, "setItem">;
};

/** Stores the arrival time and strips `supported=1` from the address bar.
 *  Returns whether the URL carried it. The storage write is best effort:
 *  reading `localStorage` itself throws when storage is blocked, and the
 *  URL is cleaned either way. */
export function consumeSupportedParam(win: SupportedWindow, now = Date.now()): boolean {
  const next = withoutSupportedParam(win.location.href);
  if (next === null) return false;
  try {
    win.localStorage.setItem(SUPPORTED_AT_STORAGE_KEY, String(now));
  } catch {
    // Private mode or blocked site data.
  }
  // Passing the current state keeps the App Router's entry intact.
  win.history.replaceState(win.history.state, "", next);
  return true;
}
