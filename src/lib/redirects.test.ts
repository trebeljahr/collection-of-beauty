import { describe, expect, it } from "vitest";
import redirectsJson from "@/data/redirects.json";
import { artworks, getArtist, getArtwork } from "@/lib/data";
import { artistRedirect, artworkRedirect } from "./redirects";

const REDIRECTS = redirectsJson as {
  artworks: Record<string, string>;
  artists: Record<string, string>;
};

describe("src/data/redirects.json", () => {
  it("only points at works and artists that exist", () => {
    for (const target of Object.values(REDIRECTS.artworks))
      expect(getArtwork(target)).not.toBeNull();
    for (const target of Object.values(REDIRECTS.artists)) expect(getArtist(target)).not.toBeNull();
  });

  it("never shadows a current id", () => {
    for (const old of Object.keys(REDIRECTS.artworks)) expect(getArtwork(old)).toBeNull();
  });
});

describe("artworkRedirect", () => {
  const work = artworks[0];

  it("sends a renamed id to its new home for good", () => {
    const [old, current] = Object.entries(REDIRECTS.artworks)[0];
    expect(artworkRedirect(old)).toEqual({ href: `/artwork/${current}`, permanent: true });
  });

  it("fixes the spelling without making it canonical", () => {
    expect(artworkRedirect(`${work.id.toUpperCase()})`)).toEqual({
      href: `/artwork/${work.id}`,
      permanent: false,
    });
    const bare = work.id.slice(work.folder.length + 1);
    expect(artworkRedirect(bare)).toEqual({ href: `/artwork/${work.id}`, permanent: false });
  });

  it("leaves unknown ids to the 404 page", () => {
    expect(artworkRedirect("no-such-work-anywhere")).toBeNull();
    expect(artworkRedirect("")).toBeNull();
  });
});

describe("artistRedirect", () => {
  it("follows a renamed slug", () => {
    const [old, current] = Object.entries(REDIRECTS.artists)[0];
    expect(artistRedirect(old)).toEqual({ href: `/artist/${current}`, permanent: true });
  });

  it("fixes case and accents", () => {
    expect(artistRedirect("Claude-Monet")).toEqual({
      href: "/artist/claude-monet",
      permanent: false,
    });
  });
});
