import { describe, expect, it } from "vitest";

import {
  extractPageEvidence,
  foldGraph,
  foldStatements,
  refitLocation,
  reresolveMode,
  resolveImpression,
  scrubStored,
} from "../scripts/lib/provenance-impression.mjs";

// Shapes follow the WDQS JSON results for fetch-provenance's STATEMENTS and
// GRAPH queries; ids and values are real, trimmed to what each case needs.
const E = (q: string) => ({ type: "uri", value: `http://www.wikidata.org/entity/${q}` });
const lit = (value: string) => ({ type: "literal", value });
const RANK = { type: "uri", value: "http://wikiba.se/ontology#NormalRank" };
let st = 0;
const stmt = () => ({ type: "uri", value: `http://www.wikidata.org/entity/statement/S${st++}` });

type Row = Record<string, { type: string; value: string }>;
const collection = (item: string, q: string, label: string, extra: Row = {}): Row => ({
  item: E(item),
  kind: lit("collection"),
  st: stmt(),
  rank: RANK,
  value: E(q),
  valueLabel: lit(label),
  ...extra,
});
const inventory = (item: string, value: string, qcoll?: string): Row => ({
  item: E(item),
  kind: lit("inventory"),
  st: stmt(),
  rank: RANK,
  value: lit(value),
  ...(qcoll ? { qcoll: E(qcoll) } : {}),
});
const location = (item: string, q: string, label: string): Row => ({
  item: E(item),
  kind: lit("location"),
  st: stmt(),
  rank: RANK,
  value: E(q),
  valueLabel: lit(label),
});
const describedAt = (item: string, url: string): Row => ({
  item: E(item),
  kind: lit("describedAt"),
  st: stmt(),
  rank: RANK,
  value: { type: "uri", value: url },
});

type Node = { label: string; edges?: [string, string][]; websites?: string[]; place?: boolean };
const graphOf = (nodes: Record<string, Node>) =>
  Object.fromEntries(
    Object.entries(nodes).map(([q, n]) => [
      q,
      { label: n.label, edges: n.edges ?? [], websites: n.websites ?? [], place: n.place ?? false },
    ]),
  );

const GRAPH = graphOf({
  Q214867: {
    label: "National Gallery of Art",
    edges: [["P131", "Q61"]],
    websites: ["https://www.nga.gov/"],
  },
  Q62274660: { label: "Rosenwald Collection", edges: [["P361", "Q214867"]] },
  Q478695: {
    label: "Germanisches Nationalmuseum",
    edges: [["P131", "Q2090"]],
    websites: ["https://www.gnm.de/"],
  },
  Q657415: {
    label: "Cleveland Museum of Art",
    edges: [["P131", "Q37320"]],
    websites: ["https://www.clevelandart.org/"],
  },
  Q160236: { label: "Metropolitan Museum of Art", websites: ["https://www.metmuseum.org/"] },
  Q61: { label: "Washington, D.C.", place: true },
  Q19675: {
    label: "Louvre Museum",
    edges: [
      ["P276", "Q1075988"],
      ["P131", "Q90"],
    ],
    websites: ["https://www.louvre.fr/"],
  },
  Q3044768: { label: "Department of Paintings of the Louvre", edges: [["P361", "Q19675"]] },
  Q1075988: { label: "Louvre Palace", edges: [["P131", "Q90"]] },
  Q3176333: { label: "Denon Wing", edges: [["P361", "Q1075988"]] },
  Q107236553: { label: "Room 700", edges: [["P361", "Q3176333"]] },
  Q90: { label: "Paris", place: true },
  Q23402: { label: "Musée d'Orsay", edges: [["P131", "Q90"]] },
  Q180788: { label: "National Gallery", websites: ["https://www.nationalgallery.org.uk/"] },
  Q430682: { label: "Tate", websites: ["https://www.tate.org.uk/"] },
  Q194626: { label: "Kunstmuseum Basel", edges: [["P131", "Q78"]] },
  Q78: { label: "Basel", edges: [["P17", "Q39"]], place: true },
  Q183: { label: "Germany", place: true },
  Q252071: { label: "Museum of Fine Arts, Budapest" },
  Q1063029: { label: "Hungarian National Gallery" },
  Q190804: { label: "Rijksmuseum", websites: ["https://www.rijksmuseum.nl/"] },
  Q213322: { label: "Victoria and Albert Museum" },
  Q131336099: { label: "Victoria and Albert Museum", edges: [["P131", "Q188801"]] },
  Q131413924: { label: "Room 87", edges: [["P276", "Q131336099"]] },
});

// Knight, Death and the Devil: one item, many impressions.
const KNIGHT = "Q1755464";
const knightRows = [
  collection(KNIGHT, "Q62274660", "Rosenwald Collection"),
  collection(KNIGHT, "Q214867", "Q214867"),
  collection(KNIGHT, "Q478695", "Germanisches Nationalmuseum"),
  collection(KNIGHT, "Q657415", "Cleveland Museum of Art"),
  collection(KNIGHT, "Q160236", "Metropolitan Museum of Art"),
  inventory(KNIGHT, "1943.3.3519", "Q214867"),
  inventory(KNIGHT, "1941.1.20", "Q214867"),
  inventory(KNIGHT, "StN2197", "Q478695"),
  inventory(KNIGHT, "1965.231", "Q657415"),
  inventory(KNIGHT, "19.73.110", "Q160236"),
  location(KNIGHT, "Q478695", "Germanisches Nationalmuseum"),
  location(KNIGHT, "Q214867", "Q214867"),
  location(KNIGHT, "Q657415", "Cleveland Museum of Art"),
  describedAt(KNIGHT, "https://clevelandart.org/art/1965.231"),
  describedAt(
    KNIGHT,
    "https://sempub.ub.uni-heidelberg.de/duerer.online/de/wisski/navigate/36787/view",
  ),
];
const knight = () => foldStatements(knightRows).get(KNIGHT);
const KNIGHT_FILE = "Albrecht_Dürer,_Knight,_Death_and_Devil,_1513,_NGA_6637.jpg";

describe("foldStatements", () => {
  it("keeps each P217 with the collection it is qualified with", () => {
    const item = knight();
    expect(
      item.inventories.find((i: { value: string }) => i.value === "StN2197").collections,
    ).toEqual(["Q478695"]);
    // An "en" label that is just the QID means Wikidata has no English label.
    expect(item.collections.find((c: { id: string }) => c.id === "Q214867").label).toBeNull();
  });

  it("skips an inventory number given as unknown value", () => {
    const item = foldStatements([
      {
        ...inventory("Q9", "x"),
        value: { type: "uri", value: "http://www.wikidata.org/.well-known/genid/913a59ab" },
      },
    ]).get("Q9");
    expect(item.inventories).toEqual([]);
  });

  it("marks ended collections and skips unknown values", () => {
    const item = foldStatements([
      collection("Q1", "Q180788", "National Gallery", { end: lit("1955-01-01T00:00:00Z") }),
      collection("Q1", "Q430682", "Tate"),
      {
        ...collection("Q1", "Q0", "x"),
        value: { type: "uri", value: "http://www.wikidata.org/.well-known/genid/d5bfbd37" },
      },
    ]).get("Q1");
    expect(item.collections.map((c: { id: string; ended: boolean }) => [c.id, c.ended])).toEqual([
      ["Q180788", true],
      ["Q430682", false],
    ]);
  });
});

describe("foldGraph", () => {
  it("gives every requested qid a node and collects edges, sites and population", () => {
    const g = foldGraph(
      [
        {
          x: E("Q62274660"),
          xLabel: lit("Rosenwald Collection"),
          p: { type: "uri", value: "http://www.wikidata.org/prop/direct/P361" },
          y: E("Q214867"),
        },
        { x: E("Q61"), xLabel: lit("Washington, D.C."), pop: lit("689545") },
      ],
      ["Q62274660", "Q61", "Q999"],
    );
    expect(g.Q62274660.edges).toEqual([["P361", "Q214867"]]);
    expect(g.Q61.place).toBe(true);
    expect(g.Q999).toEqual({ label: null, edges: [], websites: [], place: false });
  });
});

describe("extractPageEvidence", () => {
  it("reads the institution marker and the accession row of an {{Artwork}} page", () => {
    const html = `<td id="fileinfotpl&#95;art&#95;gallery" class="fileinfo-paramfield">Collection</td>
<td><div class="vcard">National Gallery of Art</div>
<div style="display: none;">institution QS:P195,Q214867</div></td>
</tr>
<tr>
<td id="fileinfotpl&#95;art&#95;id" class="fileinfo-paramfield" lang="en">Accession number</td>
<td>
<div class="identifier">
1943.3.3519</div></td>`;
    expect(extractPageEvidence(html)).toEqual({
      institutions: ["Q214867"],
      accession: "1943.3.3519",
    });
  });

  it("returns nothing for a page without the template", () => {
    expect(extractPageEvidence("<p>no template</p>")).toEqual({
      institutions: [],
      accession: null,
    });
  });
});

describe("resolveImpression", () => {
  it("takes every field from the impression the Commons page names", () => {
    const res = resolveImpression(knight(), GRAPH, {
      filename: KNIGHT_FILE,
      page: { institutions: ["Q214867"], accession: "1943.3.3519" },
    });
    expect(res).toEqual({
      collection: "National Gallery of Art",
      collectionWikidataId: "Q214867",
      location: "National Gallery of Art",
      inventory: "1943.3.3519",
      // Cleveland's page is another impression; the Heidelberg catalogue
      // could show any of them.
      describedAt: null,
      basis: "accession",
    });
  });

  it("uses NGA_<id> in the filename, but won't guess between two NGA impressions", () => {
    const res = resolveImpression(knight(), GRAPH, { filename: KNIGHT_FILE });
    expect(res.basis).toBe("nga-id");
    expect(res.collection).toBe("National Gallery of Art");
    expect(res.inventory).toBeNull();
  });

  it("drops the fields when nothing identifies the impression", () => {
    const res = resolveImpression(knight(), GRAPH, { filename: "Knight_Death_Devil.jpg" });
    expect(res).toMatchObject({
      collection: null,
      location: null,
      inventory: null,
      describedAt: null,
      basis: "unresolved",
    });
  });

  it("drops the fields when the file's signals disagree", () => {
    const res = resolveImpression(knight(), GRAPH, {
      filename: KNIGHT_FILE,
      page: { institutions: ["Q478695"], accession: "StN2197" },
    });
    expect(res.basis).toBe("conflict");
    expect(res.collection).toBeNull();
  });

  it("drops the fields when the page names a museum the item doesn't list", () => {
    const res = resolveImpression(knight(), GRAPH, {
      filename: "Knight_Death_Devil_Cleveland_Museum_of_Art.jpg",
      page: { institutions: ["Q23402"], accession: null },
    });
    expect(res.basis).toBe("conflict");
  });

  it("names a museum mentioned in the credit line", () => {
    const res = resolveImpression(knight(), GRAPH, {
      filename: "Knight.jpg",
      credit: "Metropolitan Museum of Art, Open Access",
    });
    expect(res).toMatchObject({
      collection: "Metropolitan Museum of Art",
      inventory: "19.73.110",
      location: null,
      basis: "named",
    });
  });

  it("treats a department and its museum as one holding, with a room as location", () => {
    const item = foldStatements([
      collection("Q2", "Q19675", "Louvre Museum"),
      collection("Q2", "Q3044768", "Department of Paintings of the Louvre"),
      inventory("Q2", "INV 1794", "Q3044768"),
      location("Q2", "Q107236553", "Room 700"),
      describedAt("Q2", "https://collections.louvre.fr/ark:/53355/cl010062370"),
    ]).get("Q2");
    expect(resolveImpression(item, GRAPH, { filename: "x.jpg" })).toEqual({
      collection: "Department of Paintings of the Louvre",
      collectionWikidataId: "Q3044768",
      location: "Room 700",
      inventory: "INV 1794",
      describedAt: "https://collections.louvre.fr/ark:/53355/cl010062370",
      basis: "one-holding",
    });
  });

  it("ignores a former collection and the number it gave the work", () => {
    const item = foldStatements([
      collection("Q3", "Q180788", "National Gallery", { end: lit("1955-01-01T00:00:00Z") }),
      collection("Q3", "Q430682", "Tate"),
      inventory("Q3", "NG526", "Q180788"),
      inventory("Q3", "N00526", "Q430682"),
    ]).get("Q3");
    expect(resolveImpression(item, GRAPH, { filename: "x.jpg" })).toMatchObject({
      collection: "Tate",
      inventory: "N00526",
      basis: "one-holding",
    });
  });

  it("drops a location that is neither the museum nor where it stands", () => {
    const item = foldStatements([
      collection("Q4", "Q194626", "Kunstmuseum Basel"),
      location("Q4", "Q183", "Germany"),
    ]).get("Q4");
    expect(resolveImpression(item, GRAPH, { filename: "x.jpg" })).toMatchObject({
      collection: "Kunstmuseum Basel",
      location: null,
    });
    const inBasel = foldStatements([
      collection("Q5", "Q194626", "Kunstmuseum Basel"),
      location("Q5", "Q78", "Basel"),
    ]).get("Q5");
    expect(resolveImpression(inBasel, GRAPH, { filename: "x.jpg" }).location).toBe("Basel");
  });

  it("accepts a room in a second item that carries the museum's name", () => {
    const item = foldStatements([
      collection("Q10", "Q213322", "Victoria and Albert Museum"),
      location("Q10", "Q131413924", "Room 87"),
    ]).get("Q10");
    expect(resolveImpression(item, GRAPH, { filename: "x.jpg" }).location).toBe("Room 87");
  });

  it("does not let a shared city pass as the same building", () => {
    const item = foldStatements([
      collection("Q6", "Q23402", "Musée d'Orsay"),
      location("Q6", "Q107236553", "Room 700"),
    ]).get("Q6");
    expect(resolveImpression(item, GRAPH, { filename: "x.jpg" }).location).toBeNull();
  });
});

// A Turner Bequest painting: the National Gallery's P195 was never given an
// end date when the work moved to the Tate, so both look current.
const TURNER = "Q28538587";
const turnerRows = [
  collection(TURNER, "Q430682", "Tate"),
  collection(TURNER, "Q180788", "National Gallery"),
  inventory(TURNER, "N02065", "Q430682"),
  inventory(TURNER, "NG2065", "Q180788"),
  location(TURNER, "Q430682", "Tate"),
];
const turner = () => foldStatements(turnerRows).get(TURNER);

describe("resolveImpression with two holdings", () => {
  it("lets a number in the filename outrank a museum's name", () => {
    const res = resolveImpression(turner(), GRAPH, {
      filename: "Turner_-_A_Ship_Aground_-_N02065_-_National_Gallery.jpg",
    });
    expect(res).toMatchObject({
      collection: "Tate",
      inventory: "N02065",
      basis: "filename-inventory",
    });
  });

  it("falls back on P276 when the file says nothing", () => {
    expect(resolveImpression(turner(), GRAPH, { filename: "x.jpg" })).toMatchObject({
      collection: "Tate",
      location: "Tate",
      inventory: "N02065",
      basis: "location",
    });
  });

  it("won't fall back when the page gives a number neither holding has", () => {
    const res = resolveImpression(turner(), GRAPH, {
      filename: "x.jpg",
      page: { institutions: [], accession: "RP-P-1956-743" },
    });
    expect(res).toMatchObject({ collection: null, basis: "unresolved" });
  });

  it("ignores a page that echoes every holding's number", () => {
    // The {{Artwork}} template read Wikidata: both numbers, and an
    // institution marker that is just the first P195 value.
    const res = resolveImpression(turner(), GRAPH, {
      filename: "x.jpg",
      page: { institutions: ["Q180788"], accession: "N02065 ( Tate ) NG2065 ( National Gallery )" },
    });
    expect(res.basis).toBe("location");
    expect(res.collection).toBe("Tate");
  });

  it("treats one number under two collections as one object", () => {
    const item = foldStatements([
      collection("Q7", "Q1063029", "Hungarian National Gallery"),
      collection("Q7", "Q252071", "Museum of Fine Arts, Budapest"),
      inventory("Q7", "266.B", "Q252071"),
      inventory("Q7", "266.B", "Q1063029"),
    ]).get("Q7");
    const res = resolveImpression(item, GRAPH, {
      filename: "x.jpg",
      previous: { collectionWikidataId: "Q1063029" },
    });
    expect(res).toMatchObject({
      collection: "Hungarian National Gallery",
      inventory: "266.B",
      basis: "one-holding",
    });
  });

  it("matches an archived museum page to the museum", () => {
    const item = foldStatements([
      collection("Q8", "Q190804", "Rijksmuseum"),
      describedAt("Q8", "https://web.archive.org/web/20160309172951/https://www.rijksmuseum.nl/x"),
      describedAt("Q8", "https://example.org/catalogue/x"),
    ]).get("Q8");
    expect(resolveImpression(item, GRAPH, { filename: "x.jpg" }).describedAt).toBe(
      "https://web.archive.org/web/20160309172951/https://www.rijksmuseum.nl/x",
    );
  });
});

describe("reresolveMode", () => {
  it("resolves an edition again in full", () => {
    expect(reresolveMode(knight(), GRAPH, { collectionWikidataId: "Q62274660" })).toBe("full");
  });

  it("refits only a location that doesn't fit its collection", () => {
    const item = foldStatements([
      collection("Q4", "Q194626", "Kunstmuseum Basel"),
      location("Q4", "Q183", "Germany"),
      location("Q4", "Q78", "Basel"),
    ]).get("Q4");
    const stored = { collectionWikidataId: "Q194626", location: "Germany" };
    expect(reresolveMode(item, GRAPH, stored)).toBe("location");
    expect(refitLocation(item, GRAPH, stored)).toBe("Basel");
    expect(reresolveMode(item, GRAPH, { ...stored, location: "Basel" })).toBeNull();
  });

  it("leaves a record whose location Wikidata no longer lists", () => {
    const item = foldStatements([collection("Q4", "Q194626", "Kunstmuseum Basel")]).get("Q4");
    expect(
      reresolveMode(item, GRAPH, { collectionWikidataId: "Q194626", location: "Room 1" }),
    ).toBeNull();
  });
});

describe("scrubStored", () => {
  const GENID = "http://www.wikidata.org/.well-known/genid/febc0c58ee3f26c80588e69bfd04e90f";

  it("clears an unknown value stored as collection or number", () => {
    const stored = {
      collection: GENID,
      collectionWikidataId: GENID,
      location: "Van Gogh Museum",
      inventory: GENID,
    };
    expect(scrubStored(stored, undefined, GRAPH)).toEqual({
      collection: null,
      collectionWikidataId: null,
      location: "Van Gogh Museum",
      inventory: null,
    });
  });

  it("replaces a bare QID with the item's label, or null when it has none", () => {
    const stored = { collection: "Q214867", collectionWikidataId: "Q214867", location: "Q999" };
    expect(scrubStored(stored, undefined, GRAPH)).toEqual({
      collection: "National Gallery of Art",
      collectionWikidataId: "Q214867",
      location: null,
    });
  });

  it("leaves a clean record as it is", () => {
    const stored = { collection: "Tate", collectionWikidataId: "Q430682", inventory: "N02065" };
    expect(scrubStored(stored, undefined, GRAPH)).toEqual(stored);
  });
});
