import { describe, expect, it } from "vitest";
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
    expect(parseScope("artist:claude-monet")).toEqual({ kind: "artist", slug: "claude-monet" });
    expect(parseScope("movement:Impressionism")).toEqual({
      kind: "movement",
      name: "Impressionism",
    });
    expect(parseScope("decade:1880")).toEqual({ kind: "decade", start: 1880 });
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
      { kind: "artist", slug: "claude-monet" },
      { kind: "movement", name: "Northern Song" },
      { kind: "movement", name: "Ukiyo-e" },
      { kind: "decade", start: 1880 },
    ];
    for (const scope of cases) {
      expect(parseScope(encodeScope(scope))).toEqual(scope);
    }
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
    expect(artworkHref("abc-123", { kind: "artist", slug: "claude-monet" })).toBe(
      "/artwork/abc-123?from=artist:claude-monet",
    );
    expect(artworkHref("abc-123", { kind: "decade", start: 1880 })).toBe(
      "/artwork/abc-123?from=decade:1880",
    );
  });
});

describe("scopeHref", () => {
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
});

describe("scopeLabel", () => {
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
});

describe("resolveScope", () => {
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

  it("buckets decade scope by Math.floor(year / 10) * 10, matching the timeline", () => {
    const start = 1880;
    const resolved = resolveScope({ kind: "decade", start });
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved.every((a) => a.year != null && Math.floor(a.year / 10) * 10 === start)).toBe(
      true,
    );

    const expectedIds = artworkListings
      .filter((a) => a.year != null && Math.floor(a.year / 10) * 10 === start)
      .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title))
      .map((a) => a.id);
    expect(resolved.map((a) => a.id)).toEqual(expectedIds);
  });

  it("returns an empty array for an unknown scope value", () => {
    expect(resolveScope({ kind: "artist", slug: "no-such-artist" })).toEqual([]);
    expect(resolveScope({ kind: "movement", name: "No Such Movement" })).toEqual([]);
    expect(resolveScope({ kind: "decade", start: 990 })).toEqual([]);
  });
});
