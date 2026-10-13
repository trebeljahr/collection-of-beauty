import { describe, expect, it } from "vitest";

import {
  licenceClass,
  publicDomainInGermanyFrom,
  sameFile,
} from "../scripts/lib/commons-refetch.mjs";

describe("sameFile", () => {
  it("matches a saved preview to the page it was saved from", () => {
    expect(
      sameFile("2560px-Courbet_LAtelier_du_peintre.jpg", "File:Courbet LAtelier du peintre.jpg"),
    ).toBe(true);
  });

  it("matches through the punctuation a browser rewrites, and NFD", () => {
    expect(
      sameFile("Carl_Spitzweg_-__The_Bookworm_.jpg", 'File:Carl Spitzweg - "The Bookworm".jpg'),
    ).toBe(true);
    expect(
      sameFile(
        "Kanō_Eitoku_-_Rakuchū_rakugai_zu.jpg".normalize("NFD"),
        "File:Kanō Eitoku - Rakuchū rakugai zu.jpg",
      ),
    ).toBe(true);
    expect(sameFile("David_Brutus.jpeg", "File:David Brutus.JPG")).toBe(true);
  });

  it("cannot match a file that was renamed by hand, only its page to itself", () => {
    // Baldung's Death and the Maiden: a 960 px preview saved under a
    // typed name. `--accept-renamed` then compares the catalogue's
    // title with the title the API answers with.
    const page = "File:Gw11 0001031 20170619 001 Baldung Der Tod und das Maedchen.jpg";
    expect(sameFile("Death and the Maiden Baldung.jpg", page)).toBe(false);
    expect(
      sameFile("File:Gw11_0001031_20170619_001_Baldung_Der_Tod_und_das_Maedchen.jpg", page),
    ).toBe(true);
  });

  it("tells another upload of the same painting apart", () => {
    // Both pairs are real: the sidecar names the second file for the first.
    expect(
      sameFile(
        "El_jardín_de_las_Delicias,_de_El_Bosco.jpg",
        "File:The Garden of Earthly Delights by Bosch High Resolution.jpg",
      ),
    ).toBe(false);
    expect(sameFile("Carl_Spitzweg_036.jpg", "File:Carl Spitzweg - Sonntagsspaziergang.jpg")).toBe(
      false,
    );
  });

  it("tells a title in quotation marks from the same words without them", () => {
    // Real: the file on disk is the first page, a stitch of 2013. The
    // sidecar linked the second, a user's own photograph of 2024.
    const onDisk = "_The_School_of_Athens__by_Raffaello_Sanzio_da_Urbino.jpg";
    expect(sameFile(onDisk, 'File:"The School of Athens" by Raffaello Sanzio da Urbino.jpg')).toBe(
      true,
    );
    expect(sameFile(onDisk, "File:The School of Athens by Raffaello Sanzio da Urbino.jpg")).toBe(
      false,
    );
    // The title as a URL writes it, and a file that kept its quotation marks.
    expect(sameFile(onDisk, 'File:"The_School_of_Athens"_by_Raffaello_Sanzio_da_Urbino.jpg')).toBe(
      true,
    );
    expect(
      sameFile(
        '"The_School_of_Athens"_by_Raffaello_Sanzio_da_Urbino.jpg',
        "File:The School of Athens by Raffaello Sanzio da Urbino.jpg",
      ),
    ).toBe(false);
    // Quotation marks with no space beside them leave no doubled underscore.
    expect(
      sameFile(
        "Rembrandt_Harmensz._van_Rijn_-_Christ_Crucified_Between_the_Two_Thieves_(_The_Three_Crosses_)_-_Google_Art_Project.jpg",
        'File:Rembrandt Harmensz. van Rijn - Christ Crucified Between the Two Thieves ("The Three Crosses") - Google Art Project.jpg',
      ),
    ).toBe(true);
  });
});

describe("licenceClass", () => {
  it("reads every public-domain wording as one class", () => {
    for (const tag of ["Public domain", "Public Domain", "PD-Art", "PD-old-100", "PD"]) {
      expect(licenceClass(tag)).toBe("public-domain");
    }
  });

  it("keeps CC0 and the attribution licences apart from it", () => {
    expect(licenceClass("CC0")).toBe("cc0");
    expect(licenceClass("CC0 1.0 Universal Public Domain Dedication")).toBe("cc0");
    expect(licenceClass("CC BY-SA 4.0")).toBe("cc by-sa 4.0");
    expect(licenceClass("CC BY-SA 4.0")).not.toBe(licenceClass("CC BY 4.0"));
  });

  it("has no class for a missing tag", () => {
    expect(licenceClass(null)).toBeNull();
    expect(licenceClass("")).toBeNull();
  });
});

describe("publicDomainInGermanyFrom", () => {
  it("counts 70 years from the end of the death year", () => {
    // Kawai Gyokudō died in 1957: protected through 2027.
    expect(publicDomainInGermanyFrom(1957)).toBe(2028);
    expect(publicDomainInGermanyFrom(1939)).toBe(2010);
  });
});
