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

  it("drops wiki-transfer and uploader trails", () => {
    expect(cleanCredit("Originally from en.wikipedia ; description page is/was here .")).toBeNull();
    expect(
      cleanCredit("Originally uploaded to the English Wikipedia by w:User:Blankfaze ."),
    ).toBeNull();
    expect(
      cleanCredit(
        "Transferred from de.wikipedia to Commons by Outisnn . Original uploader was Nocturne at de.wikipedia .",
      ),
    ).toBeNull();
    expect(cleanCredit("Own work Gleb Simonov")).toBeNull();
    expect(cleanCredit("own photo by user:shakko")).toBeNull();
    expect(cleanCredit("Own photograph by User:Spike")).toBeNull();
    expect(cleanCredit("scan by User:Manfred Heyde")).toBeNull();
    expect(cleanCredit("Digital photo by User:Postdlf")).toBeNull();
    expect(
      cleanCredit("Taken from Die imposante Galerie , originally uploaded by Soilwork"),
    ).toBeNull();
    expect(
      cleanCredit(
        "posted to Flickr as Miniature Painting, Sarah Goodridge: Self Portrait by freeparking",
      ),
    ).toBeNull();
    expect(cleanCredit("Flickr [1]")).toBeNull();
    expect(cleanCredit("Uploaded from the Wikipedia Loves Art photo pool on Flickr")).toBeNull();
  });

  it("keeps credits that carry museum or auction provenance", () => {
    expect(cleanCredit("Flickr The Sandiego Museum of Art collection")).toBe(
      "Flickr The Sandiego Museum of Art collection",
    );
    expect(cleanCredit("flickr.com; Sotheby's London,19 June 2007, L07007, lot 7")).toBe(
      "flickr.com; Sotheby's London,19 June 2007, L07007, lot 7",
    );
    expect(cleanCredit("Own work MuseumBarberini Taken on 19 April 2022")).toBe(
      "Own work MuseumBarberini Taken on 19 April 2022",
    );
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
