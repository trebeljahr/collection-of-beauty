// Readers for Commons' `imageinfo.extmetadata` blob, shared by the three
// scripts that talk to the Commons API.
//
// The API returns each field as `{ value, source, hidden }`, and `value` is
// HTML: wiki markup rendered to a fragment, entities and all. Everything
// downstream (sidecars, the catalogue, the artwork pages) wants plain text,
// so every read goes through `stripHtml`.
//
// These lived as byte-identical copies in fetch-wikimedia-metadata.mjs,
// resolve-unresolved.mjs and apply-resolve-workflow.mjs. The copies had not
// drifted, but nothing would have caught it if they had: scripts/ was
// excluded from both `pnpm lint` and `pnpm typecheck` until the exclusion
// was lifted, and the duplication is what surfaced when it was.

/** Commons `extmetadata` values are HTML fragments; flatten one to plain
 *  text. Returns null for null/undefined so callers can pass through a
 *  missing field unchanged. */
export function stripHtml(s) {
  if (s == null) return null;
  return String(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** One field out of an `extmetadata` object as plain text, or null when the
 *  blob or the field is absent. */
export function emValue(em, key) {
  return em?.[key] ? stripHtml(em[key].value) : null;
}
