// Map a license string from artworks.json (`Artwork.license`) to its
// canonical info — display label, URL, and whether the work is in the
// public domain. Wikimedia rarely populates `copyright.license_url`,
// so we synthesise these from the short license name instead.
//
// Coverage today (audited 2026-04 against metadata/*.json):
//   2236  Public domain
//    111  CC0
//     34  CC BY-SA 4.0
//     14  CC BY 4.0
//      7  CC BY-SA 3.0
//      5  CC BY 2.0
//      2  No restrictions
//      2  CC BY 3.0
//      1  CC BY-SA 2.5

export type LicenseInfo = {
  /** Short display name from the source data, possibly capitalised. */
  short: string;
  /** Canonical URL to the license text. */
  url: string;
  /** True for Public Domain / CC0 / "No restrictions" — works that
   *  carry no copyright requirements at all. */
  isPublicDomain: boolean;
};

export function getLicenseInfo(license: string | null | undefined): LicenseInfo {
  const s = (license ?? "Public domain").trim();

  if (/^public\s*domain$/i.test(s)) {
    return {
      short: "Public domain",
      url: "https://creativecommons.org/publicdomain/mark/1.0/",
      isPublicDomain: true,
    };
  }
  if (/^cc0/i.test(s)) {
    return {
      short: "CC0",
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
      isPublicDomain: true,
    };
  }
  // CC BY <version>, CC BY-SA <version>, etc. Version may be "4.0" or "4".
  const m = s.match(/^CC\s+(BY(?:-(?:SA|NC|ND|NC-SA|NC-ND))?)\s+(\d(?:\.\d)?)/i);
  if (m) {
    const variant = m[1].toLowerCase();
    const version = m[2].includes(".") ? m[2] : `${m[2]}.0`;
    return {
      short: s,
      url: `https://creativecommons.org/licenses/${variant}/${version}/`,
      isPublicDomain: false,
    };
  }
  if (/no\s*restrictions/i.test(s)) {
    return {
      short: "No known restrictions",
      url: "https://commons.wikimedia.org/wiki/Commons:Reuse_of_PD-Art_photographs",
      isPublicDomain: true,
    };
  }
  // Unknown license string — fall back to the Commons reference page so
  // the link at least leads somewhere informative.
  return {
    short: s,
    url: "https://commons.wikimedia.org/wiki/Commons:Copyright_tags",
    isPublicDomain: false,
  };
}
