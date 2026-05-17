import { describe, expect, it } from "vitest";
import { estimateReadingTimeMinutes, parseEdition } from "./editions";

describe("estimateReadingTimeMinutes", () => {
  it("returns 0 for empty body", () => {
    expect(estimateReadingTimeMinutes("")).toBe(0);
    expect(estimateReadingTimeMinutes("   \n\n  ")).toBe(0);
  });

  it("rounds up so short bodies show 1 min", () => {
    expect(estimateReadingTimeMinutes("a single sentence here.")).toBe(1);
  });

  it("scales with word count", () => {
    const words = Array(450).fill("word").join(" "); // ~2 min at 225 wpm
    expect(estimateReadingTimeMinutes(words)).toBe(2);
  });
});

const FIVE_IDS = ["a", "b", "c", "d", "e"] as const;

function minimalFrontmatter(extra: Record<string, string> = {}): string {
  const extraLines = Object.entries(extra)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---
title: "Test issue"
publishedAt: "2026-05-17"
excerpt: "Just a test."
${extraLines}
artworks:
${FIVE_IDS.map((id) => `  - id: "${id}"`).join("\n")}
---

Body paragraph.
`;
}

describe("parseEdition", () => {
  it("parses required fields + defaults", () => {
    const ed = parseEdition("0042-spring-light.md", minimalFrontmatter());
    expect(ed.number).toBe(42);
    expect(ed.themeSlug).toBe("spring-light");
    expect(ed.fileSlug).toBe("0042-spring-light");
    expect(ed.subject).toBe("Test issue");
    expect(ed.draft).toBe(false);
    expect(ed.tags).toEqual([]);
    expect(ed.cover).toBeNull();
    expect(ed.readingTimeMinutes).toBe(1);
    expect(ed.artworks.map((a) => a.id)).toEqual([...FIVE_IDS]);
  });

  it("rejects malformed filename", () => {
    expect(() => parseEdition("nope.md", minimalFrontmatter())).toThrow(/NNNN-theme-slug/);
    expect(() => parseEdition("12-foo.md", minimalFrontmatter())).toThrow(/NNNN-theme-slug/);
  });

  it("requires exactly 5 artwork entries", () => {
    const bad = `---
title: "Test"
publishedAt: "2026-05-17"
excerpt: "x"
artworks:
  - id: "a"
  - id: "b"
---
body`;
    expect(() => parseEdition("0001-test.md", bad)).toThrow(/exactly 5/);
  });

  it("parses tags array", () => {
    const md = minimalFrontmatter({ tags: '["one", "two"]' });
    const ed = parseEdition("0001-test.md", md);
    expect(ed.tags).toEqual(["one", "two"]);
  });

  it("rejects non-string tag entries", () => {
    const md = minimalFrontmatter({ tags: "[1, 2]" });
    expect(() => parseEdition("0001-test.md", md)).toThrow(/tags\[0\]/);
  });

  it("parses cover with artworkId", () => {
    const md = `---
title: "Test"
publishedAt: "2026-05-17"
excerpt: "x"
cover:
  artworkId: "lead-artwork"
  alt: "Lead artwork caption"
artworks:
${FIVE_IDS.map((id) => `  - id: "${id}"`).join("\n")}
---
body`;
    const ed = parseEdition("0001-test.md", md);
    expect(ed.cover).toEqual({ artworkId: "lead-artwork", alt: "Lead artwork caption" });
  });

  it("parses cover with src + alt", () => {
    const md = `---
title: "Test"
publishedAt: "2026-05-17"
excerpt: "x"
cover:
  src: "/uploads/custom.webp"
  alt: "A custom cover"
artworks:
${FIVE_IDS.map((id) => `  - id: "${id}"`).join("\n")}
---
body`;
    const ed = parseEdition("0001-test.md", md);
    expect(ed.cover).toEqual({ src: "/uploads/custom.webp", alt: "A custom cover" });
  });

  it("requires alt when cover.src is set", () => {
    const md = `---
title: "Test"
publishedAt: "2026-05-17"
excerpt: "x"
cover:
  src: "/uploads/custom.webp"
artworks:
${FIVE_IDS.map((id) => `  - id: "${id}"`).join("\n")}
---
body`;
    expect(() => parseEdition("0001-test.md", md)).toThrow(/cover.alt is required/);
  });

  it("flags an empty cover object", () => {
    const md = `---
title: "Test"
publishedAt: "2026-05-17"
excerpt: "x"
cover: {}
artworks:
${FIVE_IDS.map((id) => `  - id: "${id}"`).join("\n")}
---
body`;
    expect(() => parseEdition("0001-test.md", md)).toThrow(/cover must set/);
  });
});
