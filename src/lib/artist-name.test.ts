import { describe, expect, it } from "vitest";

import { flagArtistName, isPlaceholderArtistName } from "./artist-name";

describe("isPlaceholderArtistName", () => {
  it("catches Commons' repeated placeholder phrases", () => {
    // The repeated form is what Commons actually emits; the single form is
    // what the old backreference regex handled.
    expect(isPlaceholderArtistName("Unknown author Unknown author")).toBe(true);
    expect(isPlaceholderArtistName("Unknown photographer Unknown photographer")).toBe(true);
    expect(isPlaceholderArtistName("Unknown author")).toBe(true);
    expect(isPlaceholderArtistName("unknown")).toBe(true);
    expect(isPlaceholderArtistName("Anonymous")).toBe(true);
    expect(isPlaceholderArtistName("anonymous artist.")).toBe(true);
  });

  it("catches the bare role words left after 'Unknown' is stripped", () => {
    expect(isPlaceholderArtistName("author author")).toBe(true);
    expect(isPlaceholderArtistName("photographer photographer")).toBe(true);
  });

  it("catches instructions left in the Artist field", () => {
    expect(isPlaceholderArtistName("see filename or category")).toBe(true);
    expect(isPlaceholderArtistName("See category")).toBe(true);
  });

  it("leaves real names alone", () => {
    expect(isPlaceholderArtistName("Claude Monet")).toBe(false);
    expect(isPlaceholderArtistName("Giorgione")).toBe(false);
    // A single unrepeated role word is junk, but not confidently "unknown" —
    // don't null it out on that basis alone.
    expect(isPlaceholderArtistName("photographer")).toBe(false);
  });
});

describe("flagArtistName", () => {
  it("flags the uploader handles found in the corpus", () => {
    for (const handle of ["dalbera", "PMRMaeyaert", "Jl FilpoC", "Ji-Elle"]) {
      expect(flagArtistName(handle), handle).toBe("uploader-handle");
    }
  });

  it("flags wiki-user leftovers and names with digits or underscores", () => {
    expect(flagArtistName("User:Someone")).toBe("uploader-handle");
    expect(flagArtistName("w:User:Someone")).toBe("uploader-handle");
    expect(flagArtistName("Shakko_2")).toBe("uploader-handle");
    expect(flagArtistName("Cybershot800i")).toBe("uploader-handle");
  });

  it("reports single-word names as needing confirmation, not as handles", () => {
    // Shape alone cannot separate a mononym painter from a username, so
    // both land here and the corpus test below resolves them against the
    // curated artists DB.
    for (const name of ["Giorgione", "Caravaggio", "Titian", "Akhemen", "Illufant", "Gsimonov"]) {
      expect(flagArtistName(name), name).toBe("unconfirmed-mononym");
    }
  });

  it("leaves ordinary personal names unflagged", () => {
    for (const name of [
      "Claude Monet",
      "J. M. W. Turner",
      "M.C. Escher",
      "Kim Hong-do",
      "Élisabeth Louise Vigée Le Brun",
      "Vigée-Le Brun",
      // A general "capital after lowercase" rule flags all of these.
      "James McNeill Whistler",
      "Pierre-Joseph Redouté",
      "Jean-Léon Gérôme",
      "Jean-Auguste-Dominique Ingres",
      "Henri Fantin-Latour",
      "Georgia O'Keeffe",
      // Generational suffixes are all-caps, not camel-cased handles.
      "Erasmus Quellinus II",
      "Pieter de Jode II",
      "Hans Holbein the Younger",
      "Jean-Honoré Fragonard",
      "Louis-Léopold Boilly",
      "Pierre-Joseph Redouté",
      "Katsushika Hokusai",
      "Tōshūsai Sharaku",
    ]) {
      expect(flagArtistName(name), name).toBeNull();
    }
  });

  it("treats an absent artist as fine — anonymous works get no page", () => {
    expect(flagArtistName(null)).toBeNull();
    expect(flagArtistName(undefined)).toBeNull();
    expect(flagArtistName("")).toBeNull();
  });

  it("flags placeholders ahead of shape", () => {
    expect(flagArtistName("Unknown author Unknown author")).toBe("placeholder");
    expect(flagArtistName("see filename or category")).toBe("placeholder");
  });
});
