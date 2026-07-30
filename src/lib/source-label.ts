// Human label for the upstream source of an artwork file. Most works come
// from Wikimedia Commons, but not all — the Redouté plates, for instance,
// are Nicholas Rougeux's restorations hosted on c82.net. Labelling those
// "Wikimedia Commons" is a false attribution, so the badge label is
// derived from the source URL's host instead of hardcoded.

const KNOWN_HOSTS: Record<string, string> = {
  "commons.wikimedia.org": "Wikimedia Commons",
  "upload.wikimedia.org": "Wikimedia Commons",
  "www.wikidata.org": "Wikidata",
  "c82.net": "c82.net",
  "www.loc.gov": "Library of Congress",
  "www.rijksmuseum.nl": "Rijksmuseum",
  "www.metmuseum.org": "The Met",
};

const GENERIC_FALLBACK = "Original source";

/**
 * Display name for a source URL — a curated name for hosts we know,
 * otherwise the bare hostname (`example.org/foo` → `example.org`).
 * Returns a generic label for empty/unparseable input so the caller
 * never renders a broken pill.
 */
export function sourceLabel(url: string | null | undefined): string {
  const host = sourceHost(url);
  if (!host) return GENERIC_FALLBACK;
  return KNOWN_HOSTS[host] ?? host;
}

/** Hostname of a source URL with a leading `www.` kept (the KNOWN_HOSTS
 *  keys carry it where the site actually serves that way). Null when the
 *  URL is missing or unparseable. */
function sourceHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    // Try the host as-is first, then without `www.`, so both
    // `c82.net` and `www.c82.net` hit the same entry.
    if (KNOWN_HOSTS[host]) return host;
    const bare = host.replace(/^www\./, "");
    return KNOWN_HOSTS[bare] ? bare : host.replace(/^www\./, "");
  } catch {
    return null;
  }
}
