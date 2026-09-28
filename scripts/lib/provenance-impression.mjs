// Pick one impression of a Wikidata artwork item for metadata/provenance.json.
//
// fetch-provenance.mjs finds a work's Wikidata item through its P18 image.
// For a painting that item is one object in one museum. For a print it is
// the edition: Knight, Death and the Devil (Q1755464) carries 23 P195
// collections and 29 P217 inventory numbers, one per impression. Folding
// those rows by "first value of each property wins" produced records such as
// collection Rosenwald Collection, location Germanisches Nationalmuseum,
// inventory StN2197 and a Cleveland URL for a scan of the NGA impression.
//
// So the fields are resolved together here:
//
//   - A holding is a current P195 collection plus its organisational parents
//     and children (Rosenwald Collection sits in the National Gallery of
//     Art), and any collection that carries the same inventory number (a
//     museum and the one it merged into). A collection named only as a P217
//     qualifier is a secondary holding: the file can point at it, but on its
//     own it doesn't make a single painting ambiguous, because a wrong
//     qualifier is a common Wikidata slip (a Kunsthaus Zürich number
//     qualified "Kunsthalle Zürich", a Vienna number qualified "Rijksmuseum").
//   - A P217 number belongs to the holding its P195 qualifier names. An
//     unqualified number is used only when the item has one P195 holding.
//   - With several holdings the scanned file decides. Identifiers first: the
//     accession number on its Commons page, an inventory number or NGA_<id>
//     in the filename. Then names: the institution on the Commons page, a
//     museum named in the filename or credit line. Every identifier must
//     agree with the choice; a name decides only when no identifier does.
//     A Commons page that echoes every holding's number is reading Wikidata
//     and says nothing about the file.
//   - With exactly two holdings and nothing from the file (an owner and the
//     museum showing the work, or a former and a current home), Wikidata's
//     own P276 decides when it points at one of them.
//   - P276 is kept only when it is that holding, a room or building in it,
//     or the town it stands in. P973 is kept only when it is not another
//     holding's website.
//
// When no holding can be identified the collection, location and inventory
// are dropped. A blank field is honest; a record that mixes museums is not.
//
// Pure functions, so tests/provenance-impression.test.ts can run them on
// real statement shapes without the network.

const QID = /^Q\d+$/;
// "Unknown value" comes back as a skolem IRI, not an entity or a literal.
const UNKNOWN_VALUE = /^https?:\/\/www\.wikidata\.org\/\.well-known\/genid\//;

// Edges that make one collection part of another, for grouping and for
// matching a named institution to a holding.
const ORG_EDGES = new Set(["P361", "P749", "P127", "P195"]);
// Edges from a room to its wing to its building. P159 (headquarters) is
// left out: it names a town, and two museums in one town share nothing.
const BUILDING_EDGES = new Set(["P361", "P276"]);
const ANCESTOR_DEPTH = 4;
// National Gallery of Art, Washington. Its open-access uploads are named
// "…, NGA_<object id>.jpg".
const NGA = "Q214867";
const STRONG_SIGNALS = new Set(["accession", "filename-inventory", "nga-id"]);

export const qidOf = (uri) => String(uri ?? "").replace(/^.*\/entity\//, "");

const rankOf = (uri) => {
  const r = String(uri ?? "").replace(/^.*#/, "");
  if (r === "PreferredRank") return "preferred";
  if (r === "DeprecatedRank") return "deprecated";
  return "normal";
};

export function emptyItem() {
  return { collections: [], inventories: [], locations: [], describedAt: [] };
}

// Fold statement rows from fetch-provenance's STATEMENTS query into one
// record per item. One row per statement × optional qualifier, so values
// and qualifiers are collected by statement node first.
export function foldStatements(bindings) {
  const byItem = new Map();
  const byStatement = new Map();
  for (const b of bindings) {
    const item = qidOf(b.item?.value);
    const kind = b.kind?.value;
    if (!QID.test(item) || !kind || !b.value) continue;
    let rec = byItem.get(item);
    if (!rec) {
      rec = emptyItem();
      byItem.set(item, rec);
    }
    const key = b.st?.value;
    if (!key || UNKNOWN_VALUE.test(b.value.value)) continue;
    let st = byStatement.get(key);
    if (!st) {
      const rank = rankOf(b.rank?.value);
      const value = b.value.value;
      const label = b.valueLabel?.value ?? null;
      if (kind === "collection" || kind === "location") {
        const id = qidOf(value);
        if (!QID.test(id)) continue;
        st = { id, label: label === id ? null : label, rank, ended: false };
        if (kind === "collection") st.inventories = [];
        rec[kind === "collection" ? "collections" : "locations"].push(st);
      } else if (kind === "inventory") {
        st = { value, rank, collections: [] };
        rec.inventories.push(st);
      } else if (kind === "describedAt") {
        st = { url: value, rank, collections: [] };
        rec.describedAt.push(st);
      } else {
        continue;
      }
      byStatement.set(key, st);
    }
    if (b.end && "ended" in st) st.ended = true;
    if (b.qinv && st.inventories && !st.inventories.includes(b.qinv.value)) {
      st.inventories.push(b.qinv.value);
    }
    if (b.qcoll && st.collections) {
      const q = qidOf(b.qcoll.value);
      if (QID.test(q) && !st.collections.includes(q)) st.collections.push(q);
    }
  }
  return byItem;
}

const pidOf = (uri) => String(uri ?? "").replace(/^.*\//, "");

// Fold rows from fetch-provenance's GRAPH query into
// { [qid]: { label, edges: [[pid, qid]], websites: [url], place } }.
// Every requested qid gets a node, rows or not, so the caller can tell
// "fetched, nothing there" from "not fetched yet".
export function foldGraph(bindings, requested = []) {
  /** @type {Record<string, { label: string | null, edges: [string, string][], websites: string[], place: boolean }>} */
  const graph = {};
  const node = (q) => (graph[q] ??= { label: null, edges: [], websites: [], place: false });
  for (const q of requested) node(q);
  for (const b of bindings) {
    const x = qidOf(b.x?.value);
    if (!QID.test(x)) continue;
    const n = node(x);
    const label = b.xLabel?.value;
    if (label && label !== x) n.label = label;
    if (b.p && b.y) {
      const y = qidOf(b.y.value);
      const p = pidOf(b.p.value);
      if (QID.test(y) && !n.edges.some(([ep, ey]) => ep === p && ey === y)) n.edges.push([p, y]);
    }
    if (b.web && !n.websites.includes(b.web.value)) n.websites.push(b.web.value);
    if (b.pop) n.place = true;
  }
  return graph;
}

// Evidence the Commons file page gives about the impression it shows. The
// {{Artwork}} template writes a hidden "institution QS:P195,Q…" marker for
// its collection row and a plain accession-number row. On pages that pull
// both from Wikidata they list every impression, which the caller treats as
// no evidence at all.
export function extractPageEvidence(html) {
  if (!html) return { institutions: [], accession: null };
  const institutions = [
    ...new Set([...html.matchAll(/institution QS:P195,(Q\d+)/g)].map((m) => m[1])),
  ];
  const row =
    /id="fileinfotpl(?:_|&#95;)art(?:_|&#95;)id"[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/.exec(
      html,
    );
  const accession = row
    ? decodeEntities(row[1].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim()
    : "";
  return { institutions, accession: accession || null };
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Lower-case words and digits only, so "INV 1794", "INV_1794" and
// "inv. 1794" compare equal.
const words = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Whole-token containment on the words() form.
const containsWords = (haystack, needle) => !!needle && ` ${haystack} `.includes(` ${needle} `);

// Short numbers such as "136" or "70.1" turn up in any filename as a year or
// a size, so only distinctive inventory numbers count as filename evidence.
const distinctiveInventory = (w) => w.replace(/ /g, "").length >= 5 && /\d/.test(w);

// The Wayback Machine archives museum pages under its own host; the site a
// snapshot belongs to is the one in its path.
function hostOf(url) {
  const archived = /^https?:\/\/web\.archive\.org\/web\/[^/]+\/(.+)$/i.exec(url ?? "");
  if (archived) return hostOf(archived[1]);
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const sameSite = (a, b) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

// Everything reachable from `id` over `edges` (all edges when null), up to
// ANCESTOR_DEPTH steps. Nodes in `stop` are reached but not climbed past.
function ancestors(graph, id, edges, stop = null) {
  const seen = new Set();
  let frontier = [id];
  for (let d = 0; d < ANCESTOR_DEPTH && frontier.length; d++) {
    const next = [];
    for (const q of frontier) {
      if (stop?.has(q)) continue;
      for (const [p, y] of graph[q]?.edges ?? []) {
        if (edges && !edges.has(p)) continue;
        if (y === id || seen.has(y)) continue;
        seen.add(y);
        next.push(y);
      }
    }
    frontier = next;
  }
  return seen;
}

// A place in the geographic sense: a city, region or country. The graph
// marks nodes with a population; anything reached through P131 or P17 is a
// territory by definition of those properties.
function placeSet(graph) {
  const places = new Set();
  for (const [q, n] of Object.entries(graph)) {
    if (n.place) places.add(q);
    for (const [p, y] of n.edges ?? []) if (p === "P131" || p === "P17") places.add(y);
  }
  return places;
}

// Two items with one name are one institution: the Uffizi has two items
// labelled "Uffizi Gallery", the V&A one for the museum and one for its
// building, and statements use both.
const sameName = (graph, a, b) => {
  const la = words(graph[a]?.label);
  return !!la && !QID.test(graph[a]?.label ?? "") && la === words(graph[b]?.label);
};

// One collection is part of the other, or both carry the same name.
const orgRelated = (graph, a, b) =>
  a === b ||
  ancestors(graph, a, ORG_EDGES).has(b) ||
  ancestors(graph, b, ORG_EDGES).has(a) ||
  sameName(graph, a, b);

// Drop deprecated statements; keep preferred ones separate so a caller can
// still tell which one Wikidata calls the main value.
const live = (list) => list.filter((s) => s.rank !== "deprecated");

function buildHoldings(item, graph) {
  const current = live(item.collections).filter((c) => !c.ended);
  const known = new Set(item.collections.map((c) => c.id));
  const members = [...new Set(current.map((c) => c.id))];
  // A P217 qualifier naming a collection absent from P195 may still say
  // where an impression is.
  for (const inv of live(item.inventories)) {
    for (const q of inv.collections) if (!known.has(q) && !members.includes(q)) members.push(q);
  }

  // Union collections that are parts of one another.
  const parent = new Map(members.map((m) => [m, m]));
  const find = (x) => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (orgRelated(graph, members[i], members[j])) union(members[i], members[j]);
    }
  }
  // One number under two collections is one object in both: a museum and
  // the one it merged into (266.B at the Hungarian National Gallery and the
  // Museum of Fine Arts, Budapest), or an owner and the museum showing it.
  // Separate impressions carry separate numbers.
  const byNumber = new Map();
  for (const c of current)
    for (const v of c.inventories) byNumber.set(v, [...(byNumber.get(v) ?? []), c.id]);
  for (const inv of live(item.inventories)) {
    const qs = inv.collections.filter((q) => parent.has(q));
    byNumber.set(inv.value, [...(byNumber.get(inv.value) ?? []), ...qs]);
  }
  for (const qs of byNumber.values()) for (const q of qs.slice(1)) union(qs[0], q);
  const byRoot = new Map();
  for (const m of members) {
    const r = find(m);
    if (!byRoot.has(r)) byRoot.set(r, { members: [], inventories: [], primary: false });
    byRoot.get(r).members.push(m);
  }
  const holdings = [...byRoot.values()];
  const holdingOf = (q) => holdings.find((h) => h.members.includes(q)) ?? null;

  for (const c of current) {
    const h = holdingOf(c.id);
    h.primary = true;
    for (const v of c.inventories) h.inventories.push({ value: v, collection: c.id });
  }
  const primary = holdings.filter((h) => h.primary);
  for (const inv of live(item.inventories)) {
    if (inv.collections.length === 0) {
      if (primary.length === 1) primary[0].inventories.push({ value: inv.value, collection: null });
      continue;
    }
    for (const q of inv.collections) {
      // A number qualified with an ended collection is a former number.
      const h = holdingOf(q);
      if (h) h.inventories.push({ value: inv.value, collection: q });
    }
  }
  // One entry per number, with every collection it is qualified with.
  for (const h of holdings) {
    const byValue = new Map();
    for (const { value, collection } of h.inventories) {
      if (!byValue.has(value)) byValue.set(value, { value, collections: [] });
      if (collection && !byValue.get(value).collections.includes(collection)) {
        byValue.get(value).collections.push(collection);
      }
    }
    h.inventories = [...byValue.values()];
  }
  return holdings;
}

// Holdings a set of named institutions points at. `stray` is true when one
// of them matches no holding: the file shows an impression Wikidata does not
// list for this item.
function holdingsForInstitutions(graph, holdings, qids) {
  const hit = new Set();
  let stray = false;
  for (const q of qids) {
    const matched = holdings.filter((h) => h.members.some((m) => orgRelated(graph, m, q)));
    if (matched.length === 0) stray = true;
    for (const h of matched) hit.add(h);
  }
  return { hit, stray };
}

function holdingsForText(holdings, text, test) {
  const hit = new Set();
  const matched = new Map();
  for (const h of holdings) {
    for (const inv of h.inventories) {
      if (test(inv.value, text)) {
        hit.add(h);
        if (!matched.has(h)) matched.set(h, []);
        matched.get(h).push(inv.value);
      }
    }
  }
  return { hit, matched };
}

// How well location `l` fits a holding: 4 the holding itself, 3 a room or
// building inside it, 2 a building it shares, 1 the town it stands in, 0 not
// at all (another impression's museum, or a stray value like a country the
// museum isn't in). A shared town alone is not a fit: the Musée d'Orsay and
// the Louvre's Room 700 are both in Paris.
function locationFit(graph, places, members, l) {
  if (members.some((m) => m === l || sameName(graph, m, l))) return 4;
  const lUp = [...ancestors(graph, l, null)];
  if (members.some((m) => lUp.some((a) => a === m || sameName(graph, a, m)))) return 3;
  const lBuildings = ancestors(graph, l, BUILDING_EDGES, places);
  for (const m of members) {
    for (const a of ancestors(graph, m, BUILDING_EDGES, places)) {
      if (!places.has(a) && lBuildings.has(a)) return 2;
    }
  }
  if (members.some((m) => ancestors(graph, m, null).has(l))) return 1;
  return 0;
}

// What --reresolve should do with a stored record:
//   "full"      the item has more than one live P195 or P217 value, so the
//               record may mix impressions: resolve every field again.
//   "location"  one collection, but the stored location doesn't fit it (a
//               country it isn't in, another version's museum): replace
//               only the location, with a fitting P276 or null.
//   null        leave it. Records outside this set keep their fields even
//               where Wikidata changed since they were fetched; following
//               that drift is a refresh, not a fix.
export function reresolveMode(item, graph, stored) {
  const collections = new Set(live(item.collections).map((c) => c.id));
  const inventories = new Set(live(item.inventories).map((i) => i.value));
  if (collections.size > 1 || inventories.size > 1) return "full";
  const c = stored?.collectionWikidataId;
  if (!stored?.location || !QID.test(c ?? "")) return null;
  const l = item.locations.find((s) => labelOf(graph, item, s.id) === stored.location);
  if (!l) return null;
  return locationFit(graph, placeSet(graph), holdingMembers(item, graph, c), l.id) === 0
    ? "location"
    : null;
}

// The best-fitting live P276 for the stored collection, or null.
export function refitLocation(item, graph, stored) {
  const members = holdingMembers(item, graph, stored.collectionWikidataId);
  const places = placeSet(graph);
  let best = null;
  for (const l of live(item.locations).filter((s) => !s.ended)) {
    const score = locationFit(graph, places, members, l.id);
    if (score > 0 && (!best || score > best.score)) best = { id: l.id, score };
  }
  return best ? labelOf(graph, item, best.id) : null;
}

const holdingMembers = (item, graph, c) =>
  buildHoldings(item, graph).find((h) => h.members.includes(c))?.members ?? [c];

// Stored values an older fetch wrote before the resolver learned to read
// them, fixed in place on records --reresolve otherwise leaves alone. An
// "unknown value" IRI where a collection or number should be becomes null.
// A bare QID where the collection's or location's name should be (labels
// were English-only then, and many museums now carry only a "mul" label)
// becomes that item's label, or null when it has none.
export function scrubStored(stored, item, graph) {
  const out = { ...stored };
  for (const f of ["collection", "collectionWikidataId", "location", "inventory", "describedAt"]) {
    if (UNKNOWN_VALUE.test(out[f] ?? "")) out[f] = null;
  }
  for (const f of ["collection", "location"]) {
    if (QID.test(out[f] ?? "")) out[f] = labelOf(graph, item ?? emptyItem(), out[f]);
  }
  return out;
}

// QIDs stored where a name should be, so the caller can fetch their labels.
export const storedLabelQids = (stored) =>
  [stored?.collection, stored?.location].filter((v) => QID.test(v ?? ""));

function labelOf(graph, item, q) {
  const fromGraph = graph[q]?.label;
  if (fromGraph && !QID.test(fromGraph)) return fromGraph;
  const st = [...item.collections, ...item.locations].find((s) => s.id === q && s.label);
  return st?.label ?? null;
}

// evidence: {
//   filename,               the local filename (and/or Commons title)
//   credit,                 Commons credit line, may be null
//   page: { institutions, accession } | null   from extractPageEvidence()
//   previous,               the stored record, if any. Only breaks ties
//                           between values that are equally valid, so a
//                           re-run doesn't churn a Louvre work between its
//                           INV and MR numbers.
// }
// graph: { [qid]: { label, edges: [[prop, qid]], websites: [url], place } }
export function resolveImpression(item, graph, evidence = {}) {
  const holdings = buildHoldings(item, graph);
  const previous = evidence.previous ?? null;
  const filenameWords = words(evidence.filename);
  const signals = [];
  const invInName = holdingsForText(
    holdings,
    filenameWords,
    (v, t) => distinctiveInventory(words(v)) && containsWords(t, words(v)),
  );

  if (holdings.length > 1) {
    // A page whose {{Artwork}} template reads Wikidata echoes every
    // holding's number, and its institution marker is then just one of the
    // P195 values. Only a page that gives one holding's numbers speaks for
    // the file.
    const page = evidence.page ?? null;
    const acc = page?.accession
      ? holdingsForText(holdings, words(page.accession), (v, t) => containsWords(t, words(v)))
      : null;
    // The institution marker is only consulted when the number can't speak:
    // on a page whose number is a Tate "N" number and whose marker says
    // National Gallery, the number is the part a human typed.
    const echo = !!acc && acc.hit.size > 1;
    if (acc && !echo) signals.push({ name: "accession", ...acc });
    if (invInName.hit.size) signals.push({ name: "filename-inventory", ...invInName });
    const nga = /(?:^|[^a-z])nga[ _]?(\d{2,})(?!\d)/i.exec(evidence.filename ?? "");
    if (nga) signals.push({ name: "nga-id", ...holdingsForInstitutions(graph, holdings, [NGA]) });
    if (!echo && !acc?.hit.size && page?.institutions?.length) {
      signals.push({
        name: "institution",
        ...holdingsForInstitutions(graph, holdings, page.institutions),
      });
    }
    const named = new Set();
    const creditWords = words(evidence.credit);
    for (const h of holdings) {
      for (const m of h.members) {
        const w = words(labelOf(graph, item, m));
        if (w.length < 4) continue;
        if (containsWords(filenameWords, w) || containsWords(creditWords, w)) named.add(h);
      }
    }
    if (named.size) signals.push({ name: "named", hit: named });
  }

  // Signals are in order of strength. An identifier (an accession number,
  // a number in the filename, an NGA object id) outranks a museum's name:
  // "…N02065 - National Gallery.jpg" is a Tate number under the name of the
  // gallery that held the Turner Bequest before 1955. A name decides only
  // when no identifier does, and then every signal must agree with it.
  const primary = holdings.filter((h) => h.primary);
  // An edition: more than one holding has its own number, so one museum's
  // several numbers may be several impressions, and a third-party page may
  // show any of them.
  const edition = holdings.filter((h) => h.inventories.length > 0).length > 1;
  const places = placeSet(graph);
  const locations = live(item.locations).filter((s) => !s.ended);
  const strong = signals.filter((s) => STRONG_SIGNALS.has(s.name));
  const agrees = (h, list) =>
    list.every((s) => s.hit.size === 0 || s.hit.has(h)) &&
    !list.some((s) => s.stray && s.hit.size === 0);
  let chosen = null;
  let basis = "unresolved";
  const decisive = signals.find((s) => s.hit.size === 1);
  const unknownNumber = signals.some((s) => s.name === "accession" && s.hit.size === 0);
  const choose = (h, name, judges) => {
    if (agrees(h, judges)) {
      chosen = h;
      basis = name;
    } else {
      basis = "conflict";
    }
  };
  if (holdings.length === 1) {
    chosen = holdings[0];
    basis = "one-holding";
  } else if (decisive) {
    choose(
      [...decisive.hit][0],
      decisive.name,
      STRONG_SIGNALS.has(decisive.name) ? strong : signals,
    );
  } else if (unknownNumber) {
    // The page gives a number none of the holdings has, so the file shows an
    // impression this item doesn't list. Neither fallback below may guess.
    basis = "unresolved";
  } else if (primary.length === 1) {
    choose(primary[0], "one-collection", signals);
  } else if (holdings.length === 2) {
    // Two holdings and nothing from the file: an owner and the museum that
    // shows the work, or a former and a current home. Wikidata's own P276
    // settles it when it points at one of them. Not for three or more,
    // which is an edition, where P276 says nothing about this impression.
    const fits = holdings.filter((h) =>
      locations.some((l) => locationFit(graph, places, h.members, l.id) > 0),
    );
    if (fits.length === 1) choose(fits[0], "location", signals);
  }

  const out = {
    collection: null,
    collectionWikidataId: null,
    location: null,
    inventory: null,
    describedAt: null,
    basis,
  };

  const holdingSites = (h) => {
    const sites = new Set();
    for (const m of h.members) {
      for (const q of [m, ...ancestors(graph, m, ORG_EDGES)]) {
        if (places.has(q)) continue;
        for (const w of graph[q]?.websites ?? []) {
          const host = hostOf(w);
          if (host) sites.add(host);
        }
      }
    }
    return [...sites];
  };
  const urlIn = (url, sites) => {
    const host = hostOf(url);
    return !!host && sites.some((s) => sameSite(host, s));
  };

  const urls = live(item.describedAt);
  if (holdings.length === 0) {
    // No collection at all, so nothing for a location or number to
    // contradict, unless there are several of them.
    const locIds = [...new Set(locations.map((l) => l.id))];
    if (locIds.length === 1) out.location = labelOf(graph, item, locIds[0]);
    const invs = [...new Set(live(item.inventories).map((i) => i.value))];
    if (invs.length === 1) out.inventory = invs[0];
    out.describedAt = pickUrl(urls, () => true);
    out.basis = "no-collection";
    return out;
  }
  if (!chosen) return out;

  // Inventory: a number the file names, else the holding's own. Several
  // numbers in one holding are alternate numbers of one object when the
  // item is a single work (a Louvre painting's INV and MR), but may be two
  // impressions when the item is an edition, so those need the file to say.
  const accessionSignal = signals.find((s) => s.name === "accession" && s.matched?.has(chosen));
  const named = accessionSignal?.matched.get(chosen) ?? invInName.matched.get(chosen) ?? null;
  let pool = named ? chosen.inventories.filter((i) => named.includes(i.value)) : chosen.inventories;
  if (!named && pool.length > 1 && edition) pool = [];
  const inv = pool.find((i) => i.value === previous?.inventory) ?? pool[0] ?? null;
  out.inventory = inv?.value ?? null;

  // Collection: the one the inventory number is qualified with (the stored
  // one if the number has several), else the stored one if it is part of
  // this holding, else the holding's outermost member (the museum rather
  // than a department of it).
  const stored = chosen.members.includes(previous?.collectionWikidataId)
    ? previous.collectionWikidataId
    : null;
  const qualifiers = (inv?.collections ?? []).filter((q) => chosen.members.includes(q));
  let collectionId = qualifiers.includes(stored) ? stored : (qualifiers[0] ?? stored);
  if (!collectionId) {
    collectionId =
      chosen.members.find((m) => {
        const up = ancestors(graph, m, ORG_EDGES);
        return !chosen.members.some((o) => o !== m && up.has(o));
      }) ?? chosen.members[0];
  }
  out.collectionWikidataId = collectionId;
  out.collection = labelOf(graph, item, collectionId);

  // Location: the best-fitting P276 (see locationFit), the stored one if it
  // fits at all. A museum that doesn't fit is a rival for describedAt below.
  let best = null;
  const elsewhere = [];
  for (const l of locations) {
    const score = locationFit(graph, places, chosen.members, l.id);
    const label = labelOf(graph, item, l.id);
    const kept = !!previous?.location && label === previous.location;
    if (score > 0 && (!best || (kept && !best.kept) || (score > best.score && !best.kept))) {
      best = { label, score, kept };
    }
    if (score === 0 && !places.has(l.id)) elsewhere.push({ members: [l.id] });
  }
  if (best) out.location = best.label;

  // describedAt: the holding's own page first. A page on a rival holding's
  // site describes a different impression. A third-party page (a catalogue,
  // a photo archive) is kept unless the item is an edition, whose
  // catalogue page may show any impression.
  const mine = holdingSites(chosen);
  const rivals = [...holdings.filter((h) => h !== chosen), ...elsewhere].flatMap(holdingSites);
  const own = (s) => s.collections.some((q) => chosen.members.includes(q)) || urlIn(s.url, mine);
  const rival = (s) =>
    s.collections.some((q) => !chosen.members.includes(q)) ||
    (urlIn(s.url, rivals) && !urlIn(s.url, mine));
  const valid = (s) => own(s) || (!edition && !rival(s));
  out.describedAt =
    pickUrl(urls, (s) => s.url === previous?.describedAt && valid(s)) ??
    pickUrl(urls, own) ??
    pickUrl(urls, valid);
  return out;
}

function pickUrl(urls, accept) {
  const ok = urls.filter(accept);
  return (ok.find((s) => s.rank === "preferred") ?? ok[0])?.url ?? null;
}
