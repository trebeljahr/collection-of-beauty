// Shuffle without repeats: every id plays once, in random order, before
// any plays again. A new round is shuffled again, and never opens with
// the id the last round ended on, so no piece plays twice in a row.
//
// Pure, and takes its random source, so the museum's player and the
// test share it. The player keeps the rest of the round in
// localStorage, which carries a visitor's round across visits.

/** Fisher–Yates over a copy. `random` returns [0, 1). */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A fresh round of `ids`. When `last` is the round's first, it trades
 *  places with a random other, so a round boundary never repeats. */
export function newRound(
  ids: readonly string[],
  last: string | null,
  random: () => number = Math.random,
): string[] {
  const round = shuffled(ids, random);
  if (round.length > 1 && last !== null && round[0] === last) {
    const j = 1 + Math.floor(random() * (round.length - 1));
    [round[0], round[j]] = [round[j], round[0]];
  }
  return round;
}

/**
 * The next id to play and the ids left in the round after it.
 * `remaining` is what is left of the current round, possibly stored on
 * an older track list: ids no longer in `ids` are dropped, and ids
 * added since stay out until the next round, so nothing in a stored
 * round plays twice.
 */
export function nextFromBag(
  ids: readonly string[],
  remaining: readonly string[],
  last: string | null,
  random: () => number = Math.random,
): { next: string | null; remaining: string[] } {
  if (ids.length === 0) return { next: null, remaining: [] };
  const known = new Set(ids);
  let round = remaining.filter((id) => known.has(id));
  if (round.length === 0) round = newRound(ids, last, random);
  const [next, ...rest] = round;
  return { next, remaining: rest };
}
