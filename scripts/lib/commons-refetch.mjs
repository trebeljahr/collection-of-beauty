// The decisions refetch-commons-originals.mjs makes without the network,
// kept apart so tests/commons-refetch.test.ts can pin them.

/** German term: 70 years after the end of the author's death year
 *  (§64 UrhG). */
const TERM_YEARS = 70;

/** A filename and a page title name the same file when they agree on
 *  their letters, digits and underscores, once the title is written the
 *  way a browser saves it: a space becomes an underscore, and so does a
 *  character a filename may not hold, such as a quote or a colon. Other
 *  punctuation is left out, and so is the `1280px-` prefix of a saved
 *  preview.
 *
 *  The underscores are what tells a title in quotation marks from the
 *  same words without them. `_The_School_of_Athens__by_Raffaello…` on
 *  disk is the name of the page `"The School of Athens" by Raffaello…`.
 *  The page `The School of Athens by Raffaello…` is another photograph
 *  of the fresco, and comparing letters alone took the two for one
 *  file. */
export function sameFile(filename, pageTitle) {
  const saved = (s) =>
    String(s)
      .normalize("NFC")
      .replace(/^file:/i, "")
      .replace(/^\d+px-/, "")
      .replace(/\.(jpe?g|png|tiff?|webp|gif)$/i, "")
      .replace(/[ "*/:?\\]/g, "_")
      .replace(/[^\p{L}\p{N}_]+/gu, "")
      .toLowerCase();
  return saved(filename) === saved(pageTitle);
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
