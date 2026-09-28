import { tokenize } from "./not-found-match";

/**
 * Which retired /artist/<slug> URLs get a permanent redirect, and where
 * to. scripts/build-redirects.ts collects the evidence from the git
 * history of the catalogue; the rule lives here so it can be tested
 * without one.
 *
 * A retired slug maps to the slug its works carry now, when at least two
 * thirds of them agree and the two names share a word. The second test
 * keeps a corrected attribution from redirecting one person's page to
 * another's.
 *
 * The history keeps only each work's newest record, so a slug that
 * changes on a work whose id survives is visible to one run only: the
 * one made before the change is committed. The next run sees the new
 * slug on both sides and has no vote left for the old one. So an entry
 * a run once wrote is kept for as long as its old slug stays retired and
 * its target still exists. A 308 is cached for good, so a redirect that
 * was served once should keep being served.
 */

const MIN_AGREEMENT = 2 / 3;

export type SlugMove = { from: string; to: string };

/**
 * @param moves one entry per retired work sighting: the slug the history
 *   last saw on a work, and the slug that work carries now
 * @param currentSlugs every artist slug in the current catalogue
 * @param previous the `artists` map of the redirects.json this run replaces
 */
export function artistSlugRedirects(
  moves: Iterable<SlugMove>,
  currentSlugs: ReadonlySet<string>,
  previous: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const { from, to } of moves) {
    if (currentSlugs.has(from)) continue;
    const tally = votes.get(from) ?? new Map<string, number>();
    tally.set(to, (tally.get(to) ?? 0) + 1);
    votes.set(from, tally);
  }

  const out: Record<string, string> = {};
  for (const [slug, tally] of votes) {
    const total = [...tally.values()].reduce((sum, n) => sum + n, 0);
    const [winner, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    const shared = tokenize(slug).some((w) => tokenize(winner).includes(w));
    if (count / total >= MIN_AGREEMENT && shared) out[slug] = winner;
  }

  // A fresh vote wins over an old entry: it says where the works are now.
  for (const [slug, target] of Object.entries(previous)) {
    if (Object.hasOwn(out, slug) || currentSlugs.has(slug) || !currentSlugs.has(target)) continue;
    out[slug] = target;
  }
  return out;
}
