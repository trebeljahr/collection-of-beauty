import { describe, expect, it } from "vitest";
import { getAllListingsInDefaultOrder, getArtworkListingPage } from "@/lib/artwork-pagination";
import {
  artworkHref,
  encodeScope,
  parseScope,
  resolveScope,
  type Scope,
  scopeHref,
  scopeLabel,
} from "@/lib/artwork-scope";
import { artworkListings, getArtworksByArtist } from "@/lib/data";
import { assignEra, getEra } from "@/lib/gallery-eras";

describe("parseScope", () => {
  it("returns null for missing / malformed input", () => {
    expect(parseScope(null)).toBeNull();
    expect(parseScope(undefined)).toBeNull();
    expect(parseScope("")).toBeNull();
    expect(parseScope("artist")).toBeNull();
    expect(parseScope("artist:")).toBeNull();
    expect(parseScope(":foo")).toBeNull();
    expect(parseScope("unknown:foo")).toBeNull();
  });

  it("parses each kind", () => {
    expect(parseScope("gallery")).toEqual({ kind: "gallery" });
    expect(parseScope("artist:claude-monet")).toEqual({ kind: "artist", slug: "claude-monet" });
    expect(parseScope("movement:Impressionism")).toEqual({
      kind: "movement",
      name: "Impressionism",
    });
    expect(parseScope("decade:1880")).toEqual({ kind: "decade", start: 1880 });
    expect(parseScope("era:fin-de-siecle")).toEqual({ kind: "era", id: "fin-de-siecle" });
    expect(parseScope("era:ukiyo-e")).toEqual({ kind: "era", id: "ukiyo-e" });
  });

  it("rejects era ids that aren't in the canonical ERAS list", () => {
    // Movement name, not an era id — must not be coerced.
    expect(parseScope("era:impressionism")).toBeNull();
    expect(parseScope("era:not-an-era")).toBeNull();
    // Case-sensitive: only the lowercase kebab id is accepted.
    expect(parseScope("era:Gothic")).toBeNull();
  });

  it("URL-decodes the value half", () => {
    expect(parseScope("movement:Northern%20Song")).toEqual({
      kind: "movement",
      name: "Northern Song",
    });
    expect(parseScope("movement:Ukiyo-e")).toEqual({ kind: "movement", name: "Ukiyo-e" });
  });

  it("rejects decade values that aren't an integer multiple of 10", () => {
    expect(parseScope("decade:abc")).toBeNull();
    expect(parseScope("decade:1885")).toBeNull();
    expect(parseScope("decade:18.0")).toBeNull();
  });
});

describe("encodeScope", () => {
  it("round-trips with parseScope for each kind", () => {
    const cases: Scope[] = [
      { kind: "gallery" },
      { kind: "artist", slug: "claude-monet" },
      { kind: "movement", name: "Northern Song" },
      { kind: "movement", name: "Ukiyo-e" },
      { kind: "decade", start: 1880 },
      { kind: "era", id: "gothic" },
      { kind: "era", id: "fin-de-siecle" },
      { kind: "era", id: "ukiyo-e" },
    ];
    for (const scope of cases) {
      expect(parseScope(encodeScope(scope))).toEqual(scope);
    }
  });

  it("emits era ids without percent-encoding", () => {
    expect(encodeScope({ kind: "era", id: "fin-de-siecle" })).toBe("era:fin-de-siecle");
    expect(encodeScope({ kind: "era", id: "ukiyo-e" })).toBe("era:ukiyo-e");
  });

  it("percent-encodes spaces in the value half", () => {
    expect(encodeScope({ kind: "movement", name: "Northern Song" })).toBe(
      "movement:Northern%20Song",
    );
  });
});

describe("artworkHref", () => {
  it("returns the bare artwork URL for a null scope", () => {
    expect(artworkHref("abc-123", null)).toBe("/artwork/abc-123");
  });

  it("appends ?from= encoded scope when present", () => {
    expect(artworkHref("abc-123", { kind: "gallery" })).toBe("/artwork/abc-123?from=gallery");
    expect(artworkHref("abc-123", { kind: "artist", slug: "claude-monet" })).toBe(
      "/artwork/abc-123?from=artist:claude-monet",
    );
    expect(artworkHref("abc-123", { kind: "decade", start: 1880 })).toBe(
      "/artwork/abc-123?from=decade:1880",
    );
  });
});

describe("scopeHref", () => {
  it("points gallery scope at the home page", () => {
    expect(scopeHref({ kind: "gallery" })).toBe("/");
  });

  it("points artist scope at the artist page", () => {
    expect(scopeHref({ kind: "artist", slug: "claude-monet" })).toBe("/artist/claude-monet");
  });

  it("points movement scope at the timeline filtered by movement", () => {
    expect(scopeHref({ kind: "movement", name: "Northern Song" })).toBe(
      "/timeline?movement=Northern%20Song",
    );
  });

  it("points decade scope at the corresponding timeline anchor", () => {
    expect(scopeHref({ kind: "decade", start: 1880 })).toBe("/timeline#decade-1880");
  });

  it("points era scope at the per-era page", () => {
    expect(scopeHref({ kind: "era", id: "fin-de-siecle" })).toBe("/era/fin-de-siecle");
    expect(scopeHref({ kind: "era", id: "ukiyo-e" })).toBe("/era/ukiyo-e");
  });
});

describe("scopeLabel", () => {
  it("labels gallery scope as `gallery`", () => {
    expect(scopeLabel({ kind: "gallery" })).toBe("gallery");
  });

  it("looks up the artist name for an artist scope", () => {
    expect(scopeLabel({ kind: "artist", slug: "claude-monet" })).toBe("Claude Monet");
  });

  it("falls back to the slug when the artist is unknown", () => {
    expect(scopeLabel({ kind: "artist", slug: "definitely-not-a-real-artist" })).toBe(
      "definitely-not-a-real-artist",
    );
  });

  it("returns the movement name verbatim", () => {
    expect(scopeLabel({ kind: "movement", name: "Impressionism" })).toBe("Impressionism");
  });

  it("formats the decade as `<start>s`", () => {
    expect(scopeLabel({ kind: "decade", start: 1880 })).toBe("1880s");
  });

  it("uses the era title for an era scope", () => {
    expect(scopeLabel({ kind: "era", id: "fin-de-siecle" })).toBe(getEra("fin-de-siecle").title);
    expect(scopeLabel({ kind: "era", id: "gothic" })).toBe(getEra("gothic").title);
  });
});

describe("resolveScope", () => {
  it("returns the full collection in the home page's default order for the gallery scope", () => {
    const resolved = resolveScope({ kind: "gallery" });
    const expected = getAllListingsInDefaultOrder();
    expect(resolved).toBe(expected);
    expect(resolved.length).toBe(artworkListings.length);
  });

  it("returns the artist's works in the same order as the artist page", () => {
    const slug = "claude-monet";
    const resolved = resolveScope({ kind: "artist", slug });
    const expectedIds = getArtworksByArtist(slug)
      .sort((a, b) => (a.year ?? 99999) - (b.year ?? 99999))
      .map((a) => a.id);
    expect(resolved.map((a) => a.id)).toEqual(expectedIds);
  });

  it("filters movement listings to that movement and sorts year asc", () => {
    const resolved = resolveScope({ kind: "movement", name: "Impressionism" });
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved.every((a) => a.movement === "Impressionism")).toBe(true);
    for (let i = 1; i < resolved.length; i++) {
      const prev = resolved[i - 1].year ?? Number.MAX_SAFE_INTEGER;
      const curr = resolved[i].year ?? Number.MAX_SAFE_INTEGER;
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  it("returns every dated work in timeline order for decade scope, so prev/next walks past the entry decade's boundary", () => {
    const resolved = resolveScope({ kind: "decade", start: 1880 });
    expect(resolved.length).toBeGreaterThan(0);
    // Spans more than the entry decade: works outside 1880s are present.
    expect(resolved.some((a) => a.year != null && Math.floor(a.year / 10) * 10 !== 1880)).toBe(
      true,
    );
    expect(resolved.every((a) => a.year != null)).toBe(true);

    const expectedIds = artworkListings
      .filter((a) => a.year != null)
      .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title))
      .map((a) => a.id);
    expect(resolved.map((a) => a.id)).toEqual(expectedIds);

    // Anchor decade doesn't change the list — only used by scopeHref/scopeLabel.
    const other = resolveScope({ kind: "decade", start: 1700 });
    expect(other.map((a) => a.id)).toEqual(expectedIds);
  });

  it("returns an empty array for an unknown scope value", () => {
    expect(resolveScope({ kind: "artist", slug: "no-such-artist" })).toEqual([]);
    expect(resolveScope({ kind: "movement", name: "No Such Movement" })).toEqual([]);
  });

  it("filters era scope to works whose assignEra matches and walks the era page's paginated order", () => {
    const resolved = resolveScope({ kind: "era", id: "fin-de-siecle" });
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved.every((a) => assignEra(a) === "fin-de-siecle")).toBe(true);

    // Lightbox prev/next must traverse exactly the sequence the era page
    // renders: era filter + seeded shuffle, stitched across pages.
    const paged: string[] = [];
    let offset: number | null = 0;
    while (offset != null) {
      const page = getArtworkListingPage({
        era: "fin-de-siecle",
        sort: "shuffle",
        offset,
        limit: 120,
      });
      paged.push(...page.items.map((a) => a.id));
      offset = page.nextOffset;
    }
    expect(resolved.map((a) => a.id)).toEqual(paged);
  });

  it("era scope excludes works whose assignEra returns null", () => {
    const resolved = resolveScope({ kind: "era", id: "gothic" });
    expect(resolved.length).toBeGreaterThan(0);
    // No nulls leak through — every entry resolves to *some* era.
    expect(resolved.every((a) => assignEra(a) !== null)).toBe(true);
    expect(resolved.every((a) => assignEra(a) === "gothic")).toBe(true);
  });

  it("ukiyo-e era returns only movement-tagged works (yearMin > yearMax)", () => {
    const resolved = resolveScope({ kind: "era", id: "ukiyo-e" });
    // Each surviving listing must have a movement that maps to ukiyo-e —
    // the year-fallback can't place anything here because yearMin=9999 > yearMax=0.
    expect(resolved.every((a) => a.movement != null)).toBe(true);
    expect(resolved.every((a) => assignEra(a) === "ukiyo-e")).toBe(true);
  });

  it("era scope interleaves single-artist cohorts instead of clumping them", () => {
    // natural-history is the stress case: 435 Audubon plates vs ~100
    // Haeckel plates. Year order put every Audubon before the first
    // Haeckel; the artist-spread shuffle should keep runs short.
    const resolved = resolveScope({ kind: "era", id: "natural-history" });
    expect(resolved.length).toBeGreaterThan(400);
    let run = 1;
    let maxRun = 1;
    for (let i = 1; i < resolved.length; i++) {
      run = resolved[i].artist === resolved[i - 1].artist ? run + 1 : 1;
      maxRun = Math.max(maxRun, run);
    }
    expect(maxRun).toBeLessThanOrEqual(8);
  });
});
