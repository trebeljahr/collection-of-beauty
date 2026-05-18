import { describe, expect, it } from "vitest";

import { cleanCredit } from "../scripts/build-data.mjs";

describe("cleanCredit", () => {
  it("drops Google Cultural Institute zoom boilerplate", () => {
    expect(
      cleanCredit("JgEImTKh_ZlKTA at Google Cultural Institute maximum zoom level"),
    ).toBeNull();
    expect(
      cleanCredit("HQGtPypGGry5Rw at Google Cultural Institute , zoom level maximum"),
    ).toBeNull();
    expect(
      cleanCredit(
        "oQF0nQM_PVBZeQ at Google Cultural Institute zoom level Scaled down from second-highest",
      ),
    ).toBeNull();
  });

  it("drops Google Art Project and Google Arts & Culture source stubs", () => {
    expect(cleanCredit("Google Art Project: Home - pic Maximum resolution.")).toBeNull();
    expect(
      cleanCredit("Google Art Project: Home - pic Maximum resolution. Colours edited by uploader"),
    ).toBeNull();
    expect(cleanCredit("Google Arts & Culture: Home - pic")).toBeNull();
    expect(cleanCredit("Google Arts & Culture — FgGVLnB_DCXFdw")).toBeNull();
    expect(cleanCredit("Google Art & Culture")).toBeNull();
  });

  it("drops uploader and placeholder source boilerplate", () => {
    expect(cleanCredit("Own work , Yelkrokoyade , 2012-07-13")).toBeNull();
    expect(cleanCredit("own work, current photo taken by user Cybershot800i.")).toBeNull();
    expect(cleanCredit("art database")).toBeNull();
    expect(cleanCredit("[1] [ dead link ]")).toBeNull();
    expect(cleanCredit("[1] and [2]")).toBeNull();
    expect(cleanCredit("[1] aufgerufen am 18. August 2012")).toBeNull();
  });

  it("cleans boilerplate items from colon and slash numbered citation lists", () => {
    expect(
      cleanCredit(
        "1: Unknown source Unknown source 2: Stiftung Sammlung E.G. Bührle 3: ArtDaily.com",
      ),
    ).toBe("Stiftung Sammlung E.G. Bührle; ArtDaily.com");
    expect(
      cleanCredit(
        "1./2. The AMICA Library 3. Unknown source Unknown source 4. The Cleveland Museum of Art",
      ),
    ).toBe("The AMICA Library; The Cleveland Museum of Art");
    expect(cleanCredit("1. Bridgeman Art Library : Object 879692 2. Google Arts & Culture")).toBe(
      "Bridgeman Art Library : Object 879692",
    );
  });
});
