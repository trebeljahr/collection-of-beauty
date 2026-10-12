// The decisions refetch-commons-originals.mjs makes without the network,
// kept apart so tests/commons-refetch.test.ts can pin them.

/** German term: 70 years after the end of the author's death year
 *  (§64 UrhG). */
const TERM_YEARS = 70;

/** A filename and a page title name the same file when they agree on
 *  their letters and digits. A browser turns a quote or a colon into an
 *  underscore and a saved preview carries a `1280px-` prefix, so the
 *  punctuation and that prefix are left out. */
export function sameFile(filename, pageTitle) {
  const bare = (s) =>
    String(s)
      .normalize("NFC")
      .replace(/^file:/i, "")
      .replace(/^\d+px-/, "")
      .replace(/\.(jpe?g|png|tiff?|webp|gif)$/i, "")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .toLowerCase();
  return bare(filename) === bare(pageTitle);
}

/** Public-domain tags are worded many ways ("Public domain", "PD-Art",
 *  "PD-old-100"); CC0 is a dedication by a rights holder and is kept
 *  apart. Anything else compares as written. */
export function licenceClass(short) {
  const s = String(short ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s.includes("cc0") || s.includes("creative commons zero")) return "cc0";
  if (/^(public domain|pd\b)/.test(s)) return "public-domain";
  return s;
}

/** First year the German term no longer covers the artist's works. */
export function publicDomainInGermanyFrom(died) {
  return died + TERM_YEARS + 1;
}
