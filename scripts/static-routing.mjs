// Redirects and headers of the static site. Redirects are in the syntax of Cloudflare's `_redirects`
// (https://developers.cloudflare.com/workers/static-assets/redirects/):
// `:name` is one path segment, a trailing `*` is the rest of the path and
// comes back as `:splat`. scripts/write-static-routing.mts writes these to
// out/_redirects with the generated ones (renamed ids, editions, the
// press kit and plate-set ZIPs); next.config.mjs hands them to `next dev`.
//
// The two host redirects (www.collectionofbeauty.com and
// beauty.trebeljahr.com to the apex) are not here: `_redirects` matches
// paths only, so they are Cloudflare redirect rules on their zones.

/** [from, to, status]. Static lines first, then the ones with a
 *  placeholder or a splat: Cloudflare wants them in that order. */
export const FIXED_REDIRECTS = [
  // The old press image, linked from earlier copies of the press kit.
  ["/marketing/hero.png", "/marketing/collection-of-beauty-16x9.jpg", 308],
  ["/marketing/hero.jpg", "/marketing/collection-of-beauty-16x9.jpg", 308],
  // Museum screenshots of the tower plan, replaced on 17 October 2026 by
  // views of the block plan. Temporary, since the shots are retaken
  // whenever the museum changes.
  ...[
    ["stairwell", "spiral"],
    ["east-asian", "hokusai"],
    ["impressionism", "water-garden"],
  ].flatMap(([from, to]) =>
    ["", "-large"].map((size) => [
      `/marketing/collection-of-beauty-museum-${from}${size}.jpg`,
      `/marketing/collection-of-beauty-museum-${to}${size}.jpg`,
      307,
    ]),
  ),
  ["/drop", "/drops", 308],
  ["/drops-of-beauty", "/drops", 308],
  ["/drop-of-beauty", "/drops", 308],
  ["/a-drop-of-beauty", "/drops", 308],
  ["/newsletter", "/drops", 308],
  // The German /impressum was renamed when the page was translated.
  ["/impressum", "/imprint", 308],
  // /downloads was removed: the per-set page carries the ZIP and every
  // work carries its own download panel. Both routes were indexed.
  ["/downloads", "/collections", 308],
  // The botanical era floor was merged back into natural-history.
  ["/era/botanical", "/era/natural-history", 308],
  // Plural and US spellings of the section names. Temporary rather than
  // permanent: any of these could become a real route one day, and a
  // cached 308 would shadow it. The 404 page catches the misspellings
  // these don't.
  ["/colors", "/colours", 307],
  ["/color", "/colours", 307],
  ["/colour", "/colours", 307],
  ["/drop/*", "/drops/:splat", 308],
  ["/drops-of-beauty/*", "/drops/:splat", 308],
  ["/drop-of-beauty/*", "/drops/:splat", 308],
  ["/a-drop-of-beauty/*", "/drops/:splat", 308],
  ["/downloads/:slug", "/collection/:slug", 308],
  ["/artworks/:id", "/artwork/:id", 307],
  ["/artists/:slug", "/artist/:slug", 307],
  ["/eras/:id", "/era/:id", 307],
  ["/collections/:slug", "/collection/:slug", 307],
  ["/colors/:family", "/colours/:family", 307],
  ["/color/:family", "/colours/:family", 307],
  ["/colour/:family", "/colours/:family", 307],
];

/** One `_redirects` line. */
export function redirectLine([from, to, status]) {
  return `${from} ${to} ${status}`;
}

/** The same rules as `next.config` redirects, for `next dev`. */
export function toNextRedirects(rules) {
  return rules.map(([from, to, status]) => ({
    source: from.replace(/\/\*$/, "/:splat*"),
    destination: to.replace(/:splat$/, ":splat*"),
    permanent: status === 308 || status === 301,
  }));
}

// Standard browser-hardening headers, on every path. The static site
// sends them from out/_headers (scripts/write-static-routing.mts); `next
// dev` from next.config.mjs.
// Kept conservative on CSP: a strict policy would break the inline
// JSON-LD <script> tags in seo.ts.
export const SECURITY_HEADERS = [
  // Block the browser's content-type sniff, so a misserved JSON file
  // can't be reinterpreted as JS or HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the full URL (incl. query string) to cross-origin
  // navigations. Same-origin requests still get the full referrer,
  // so internal analytics keep working.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Block iframing entirely. The gallery isn't designed to live
  // inside someone else's frame and the lightbox/zoom modal don't
  // play well with frame-ancestor sandboxing anyway.
  { key: "X-Frame-Options", value: "DENY" },
  // Disable powerful features the site doesn't use, so a future
  // third-party script can't suddenly start asking for the
  // microphone / camera / geolocation.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];
