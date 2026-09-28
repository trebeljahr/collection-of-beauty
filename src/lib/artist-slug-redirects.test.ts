import { describe, expect, it } from "vitest";
import { artistSlugRedirects, type SlugMove } from "./artist-slug-redirects";

const move = (from: string, to: string): SlugMove => ({ from, to });

describe("artistSlugRedirects", () => {
  const current = new Set(["isaac-levitan", "probably-lambert-sustris", "titian", "paul-de-vos"]);

  it("follows a retired slug to where two thirds of its works went", () => {
    const moves = [
      move("isaac-ilyich-levitan", "isaac-levitan"),
      move("isaac-ilyich-levitan", "isaac-levitan"),
      move("isaac-ilyich-levitan", "titian"),
    ];
    expect(artistSlugRedirects(moves, current)).toEqual({
      "isaac-ilyich-levitan": "isaac-levitan",
    });
  });

  it("leaves a slug whose works scattered", () => {
    const moves = [move("paul-de-vos-titian", "paul-de-vos"), move("paul-de-vos-titian", "titian")];
    expect(artistSlugRedirects(moves, current)).toEqual({});
  });

  it("never sends one person's page to someone who shares no name", () => {
    expect(artistSlugRedirects([move("lambert-sustris", "titian")], current)).toEqual({});
  });

  it("ignores works whose slug never changed", () => {
    expect(artistSlugRedirects([move("titian", "titian")], current)).toEqual({});
  });

  it("keeps an entry the last run wrote once the history no longer votes for it", () => {
    // 9226f56 re-attributed a work without changing its id. Its record now
    // carries the new slug on both sides, so no move names the old one.
    const moves = [move("probably-lambert-sustris", "probably-lambert-sustris")];
    const previous = { "lambert-sustris": "probably-lambert-sustris" };
    expect(artistSlugRedirects(moves, current, previous)).toEqual(previous);
  });

  it("drops a kept entry when its old slug names an artist again", () => {
    const previous = { titian: "probably-lambert-sustris" };
    expect(artistSlugRedirects([], current, previous)).toEqual({});
  });

  it("drops a kept entry whose target is gone", () => {
    const previous = { "lambert-sustris": "possibly-lambert-sustris" };
    expect(artistSlugRedirects([], current, previous)).toEqual({});
  });

  it("prefers a fresh vote to a kept entry", () => {
    const moves = [move("isaac-ilyich-levitan", "isaac-levitan")];
    const previous = { "isaac-ilyich-levitan": "titian" };
    expect(artistSlugRedirects(moves, current, previous)).toEqual({
      "isaac-ilyich-levitan": "isaac-levitan",
    });
  });
});
