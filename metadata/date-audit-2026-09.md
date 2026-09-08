# Date accuracy audit

103 works were flagged by heuristic, researched against Wikimedia Commons, Wikidata
and institutional catalogues, then re-checked by an adversarial pass that opened each
cited page itself. Superseded by nothing; supersedes nothing — `date-audit-report.md`
was an earlier, differently-scoped pass and its corrections still stand.

## What was wrong, and why

The catalogue stores one integer per work, `Artwork.year`. Nothing downstream can
distinguish a signed-and-dated 1601 from a number the pipeline invented, and the
pipeline invents numbers in several distinct ways.

**The plausibility trap.** `resolveYear()` in `scripts/normalize-metadata.mjs` tries
date_created, Japanese era, filename, title, description and era phrase in order, and
keeps the first that passes `isPlausible` — a check bounded by the *artist's* birth and
death years. It reads like a safety net and behaves like a corruption engine, because
it is silent: when a stated date fails the gate, the extractor does not stop, it falls
through to a worse source and leaves no trace.

*Winter Landscape with a Bird Trap* is the specimen. The panel is inscribed 1601 and
Commons gives 1601, but the record named Pieter Bruegel the **Elder** (d. 1569), so 1601
failed the gate and `Math.min` over the German description substituted 1564 — the year of
a hard winter mentioned in passing, which is also, by coincidence, the Younger's birth
year. It shipped with `needs_review: false`. The attribution error caused the date error,
and correcting the attribution did not undo it: the year was already baked into the
sidecar.

**Two related mechanisms.** `yearFromFilename` takes `Math.min` over four-digit tokens,
which in an art filename is usually a lifespan's opening year or an accession number —
Benjamin West's `(1738-1820)` became a creation date of 1738. And Wikidata century
markers (`+1650/7`) are read as literal years, so a work dated only to "the 17th century"
ships as an apparently precise 1650.

## How much of this was real

| verdict | n |
| --- | --- |
| confirm — the flagged year was already right | 39 |
| imprecise — genuinely a range, now pinned to a source | 33 |
| change — a sourced, better year | 18 |
| unverified — could not be settled | 13 |

**39 of 103 were false positives.** That number is the most useful thing
in this report: these heuristics are roughly 40% noise, which is worth knowing before
anyone trusts them again without research behind them.

51 corrections survived with a citable source, of which **32 move the
year**; the rest pin a year that was right but derived from a source that could drift.
Confidence across the 51: 28 high, 21 medium, 2 low.

The adversarial pass rejected **11** proposals that the research pass had put
forward — mostly for citing a page about a different version or copy of the same
composition, which is the characteristic way this research goes wrong. Those are recorded
as unverified below, alongside 2 the research simply could not settle.

## Corrections

Grouped by what went wrong. All are in `metadata/date-overrides.json`, each with its
source URL in that file's `_why`.

### A year mined out of free prose (14)

| Artist | Work | Was | Now | As the source words it | Conf. |
| --- | --- | --- | --- | --- | --- |
| Alfred Sisley | "Le jardin Hoschedé à Montgeron" d'A. Sisley | 1839 | 1881 | 1881 | high |
| Charles Le Brun | Les reines de Perse aux pieds d'Alexandre dit aussi la ten | 1650 | 1661 | 1661 | high |
| Gustaf Lundberg | Portrait of Herman Petersen | 1713 | 1750 | 18th century | medium |
| Jan Wandelaar | Albinus skeleton w less muscles | 1697 | 1749 | 1749 | medium |
| Jan Wandelaar | Albinus skeleton w muscles | 1697 | 1749 | 1749 | medium |
| Kawase Hasui | Tabi miyage dai nishū | 1950 | 1921 | 1921 | high |
| Michael Wolgemut | Nuremberg chronicles - Dance of Death | 1440 | 1493 | 1493 | high |
| Pieter Brueghel the Younger | Winter Landscape with a Bird Trap | 1564 | 1601 | 1601 | high |
| Raphael | La Fornarina by Raffaello | 1518 | 1520 | c. 1519–1520 | medium |
| Shitao | Searching for Immortals | 1696 | 1690 | ca. 1690 | high |
| — | Anatomy | 1697 | 1747 | 1747 | high |
| — | The venous and arterial system of the human body. Engravin | 1543 | 1726 | 1726 | high |
| — | Anatomy | 1697 | 1747 | 1747 | high |
| — | Anatomy | 1697 | 1747 | 1747 | high |

### Filename digits that were never a year (3)

| Artist | Work | Was | Now | As the source words it | Conf. |
| --- | --- | --- | --- | --- | --- |
| Bartolomeo Nazari | Portrait of a Man | None | 1750 | 18th century | medium |
| Henry Raeburn | The Skating Minister | 1755 | 1795 | c. 1795 (1790s) | high |
| — | Robert Fulton | 1738 | 1806 | 1806 | high |

### Upload / scan timestamps (1)

| Artist | Work | Was | Now | As the source words it | Conf. |
| --- | --- | --- | --- | --- | --- |
| George Frederic Watts | Miss May Prinsep by George Frederic Watts | 1867 | 1867 | 1867-1869 | high |

### Genuinely imprecise, now pinned to a source (15)

| Artist | Work | Was | Now | As the source words it | Conf. |
| --- | --- | --- | --- | --- | --- |
| Annibale Carracci | Susanna and the Elders | 1550 | 1590 | c. 1590/1595 | medium |
| Anthony van Dyck | Pieter Bruegel the Younger | 1620 | 1626 | probably 1626/1641 | medium |
| Bartolomeo Nazari | Old man in an eastern attire | 1750 | 1725 | first half of the 18th century (1700-1750) | medium |
| Carl Spitzweg | Im Dachstübchen | 1849 | 1848 | c. 1848 | low |
| Charles Le Brun | Equestrian portrait of Louis XIV of France | 1650 | 1668 | circa 1668 | high |
| Claude Monet | The Church at Vétheuil | 1850 | 1880 | 1880 | high |
| Cornelis de Vos | The Triumph of Bacchus | 1650 | 1637 | between 1636 and 1638 | medium |
| Edgar Degas | Tänzerinnen in Blau | 1850 | 1897 | 1897 | high |
| Frans Snyders | Greyhound Catching a Young Wild Boar | 1650 | 1620 | c. 1620 | high |
| Giambattista Pittoni | Death of Sophonisba | 1750 | 1716 | between 1716 and 1720 | high |
| Jan Cossiers | Narcissus | 1650 | 1637 | c. 1636–1638 | high |
| Kenkō Shōkei | Kenkō Shōkei - Shōshō Hakkei - Enji Banshō | 1520 | 1510 | c. early 16th century | medium |
| Kim Hong-do | Kim Hong-do | 1780 | 1790 | late 18th century (c. 1775-1800) | medium |
| Qian Xuan | 15 Qian Xuan Eight Flowers National Palace Museum Beijing | 1250 | 1280 | Yuan dynasty, before 1289 | medium |
| Thomas Gainsborough | Portrait of the Artist's Daughters | 1760 | 1764 | c. 1763–64 | medium |

## Left unverified

Not hidden, not guessed. Each keeps the year it already had.

| Artist | Work | Year kept | Why it is unresolved |
| --- | --- | --- | --- |
| Bartolomeo Nazari | Giambattista Pittoni | None | The Commons Artwork template carries no creation date — the only date on the page is "12 August 2015", which is the upload/scan date of the reproduction, not an inception. The file is a scan |
| Frans Snyders | Lying Lioness | 1650 | Proposal rejected on review:  REJECTED — the cited source did not load for me. https://www.liechtensteincollections.at/en/collections-online/the-lioness returns HTTP 403 (Cloudflare managed  |
| Giorgio de Chirico | The Disquieting Muses | 1950 | Proposal rejected on review:  REJECTED. The cited source does not load: https://gallica.bnf.fr/ark:/12148/bpt6k4226253h/f157.item returns HTTP 403 to WebFetch, and so does the BnF OAI record |
| Giovanni Battista Cimaroli | View of the Brenta | 1750 | Proposal rejected on review:  REJECTED. Two independent grounds. (1) The proposal's central claim - 'I found no source anywhere for the current 1750' - is contradicted by the Commons file pa |
| Gustaf Lundberg | Portrait of Charles de Geer | 1720 | Proposal rejected on review:  REJECTED. The cited page loads, but it does not state the proposed date. I read both the rendered page and the raw wikitext: there is no |date= parameter at all |
| Hans Holbein the Younger | Bad-war | 1520 | Proposal rejected on review:  REJECTED — the cited sourceUrl is the Commons page of a DIFFERENT object. I fetched all three files' raw wikitext. Bad-war.jpg itself: "|Date={{complex date|cen |
| Joachim Patinir | St Christopher Bearing the Christ Child | 1550 | Proposal rejected on review:  REJECTED. The cited source does not state the proposed date. I fetched the Commons page myself: the Artwork template's date field reads "first half of 16th cent |
| Peter Paul Rubens | Man in a Ruff | 1700 | Proposal rejected on review:  REJECTED. The cited Commons page does not state "possibly c. 1650-1750" — it states no date at all. Raw wikitext is a bare "{{Artwork}}" with no parameters, and |
| Peter Paul Rubens | Isabella Brant as Glycera | 1616 | The 1616 is NOT a year - it is the second half of the MFA Boston accession number 38.1616, which the filename carries verbatim. I read the Commons page's raw wikitext: it has NO |date= param |
| Peter Paul Rubens | Madonna and Child | 1650 | Proposal rejected on review:  REJECTED. The cited source does not state the claimed date. The proposal asserts 'the Commons Artwork template's date field is literally 17th century (?)'. I fe |
| Qian Xuan | Early Autumn | 1250 | Proposal rejected on review:  REJECTED. The cited sourceUrl is the Commons file page, which I loaded: its Artwork template gives artist Qian Xuan (1235-1300), title 'Early Autumn', date '13t |
| Sebastiano Ricci | Figure Studies | 1659 | Proposal rejected on review:  REJECTED. The cited Met API record does load and does say what the researcher reports — accession 62.120.6, 'Figure Studies', Sebastiano Ricci, objectDate '1659 |
| Vasily Vereshchagin | Artlib gallery-13875-o | 1877 | Proposal rejected on review:  REJECTED: the cited source does not load. bm.tretyakovgallery.ru refused the connection on both attempts (connect ECONNREFUSED 146.185.192.106:443), so I could  |

## Fixing the pipeline

In priority order. Everything below is in
`scripts/normalize-metadata.mjs` and `scripts/build-data.mjs`.

**1. Give corrections a durable home (`metadata/date-overrides.json`).** There
is no date/year override loader today. `extractYear()` in `build-data.mjs` is
`if ("year" in entry) return entry.year;` — a pure passthrough — so the sidecar
*is* the shipped value, and `normalize-metadata.mjs` overwrites the sidecar in
place. The June audit's 158 corrections therefore live on borrowed time:
**13 of them are already destroyed by a single re-run**, and the re-run is not
hypothetical — `fetch-wikimedia-metadata.mjs` spawns the normalizer
automatically after every `pnpm scrape:fetch`, which the ingest command runs on
every ingest. Ingesting one new painting silently reverts them. Add
`loadDateOverrides()` beside `loadArtistOverrides()`, key it by NFC objectKey,
and apply it with `has`-then-`get` (so an explicit null clears) in place of
`extractYear`. Have the normalizer read the same file and stamp
`year_source: "override"` so the sidecar stays in sync and the overrides are
greppable. Seed it with all 158 June corrections plus the 36 here.

**2. Stop the silent demotion; emit a conflict report.** Replace the boolean
`isPlausible` with a three-state verdict — `ok` / `unknown` (no lifespan on
file) / `impossible` — and collect every extractor's answer into a ranked
candidate list instead of short-circuiting. When the record's *stated*
`date_created` is the thing that fails the lifespan check, **keep it** and
record the conflict: a lifespan mismatch is evidence the *artist* is wrong or
the object is a later copy, and in neither reading is "mine a number out of a
German sentence" the right answer. Then write a third report,
`needs_review_date_conflicts.txt`. Today the pipeline knows about all six
Le Brun/Honthorst demotions and every Bird-Trap-class mis-gating and tells
nobody.

**3. Strip attribution qualifiers before the lifespan lookup.** `artistDates()`
hands the raw artist string to the alias matcher, which happily resolves
`"After Peter Paul Rubens / Gustave Doré"` to Rubens. For
`/^(after|copy after|circle of|follower of|school of|workshop of|attributed to|manner of|studio of)\b/i`,
return `null` for the gate — a copyist's dates are unknown and the master's are
affirmatively the wrong ones. This alone fixes the Doré sheet that ships as
1620 and the Holbein copy that ships as `null` despite carrying an explicit
century.

**4. Rewrite `yearFromFilename` as mask → reject → select.** Mask lifespan
ranges (`1577-1640`), accession patterns (`38.1616`, `R.1990-58.23`,
`1943.116`), auction lot codes (`2013_HGK_03211_…`), ISO stamps and long digit
blobs; reject anything `>= 2000` or outside the artist's lifespan; then return
a year **only if exactly one survives**. Replacing `Math.min` with "unique or
nothing" is the single highest-value line change: every filename false positive
found had ≥2 candidates, every true positive had exactly one. Only 31 shipped
works use `year_source: "filename"`, so the blast radius is small.

**5. Restrict description mining to dating idioms.** `Math.min` over free prose
is the Bird Trap mechanism and touches 38 shipped works. Accept a description
year only inside
`/(painted|created|executed|dated|completed|signed|made)\b[^.]{0,40}?\b(1[2-9]\d{2})\b/i`
or a leading `^\(?(1[2-9]\d{2})\)?[,.]`, and abstain when two idiomatic matches
disagree. Apply the same lifespan-range mask to titles, and move
`era_phrase(date_created)` **above** filename/title/description in the
precedence order — a curator writing "second half of the 18th century" in the
date field outranks a parenthetical in a title every time. That reordering
alone fixes both Lundberg pastels.

**6. Carry precision, don't invent it.** `yearFromEraPhrase` turns "late 12th
century" into the integer 1180, stored indistinguishably from a signed 1180 —
28 shipped works. Return a `precision` (`"year" | "decade" | "century"`),
persist it as `entry.year_precision`, pass it through as
`Artwork.yearPrecision`, and render "12th century" rather than "1180" on the
detail page when it is not `"year"`. Relatedly, stop discarding
decade/century-precision Wikidata inceptions (`if (precision < 9) continue`) —
26 shipped works fall through to a *worse* source because of it; a
decade-precision P571 should rank above filename and title, not below them.

**7. Close the 644-work blind spot.** `DEFAULT_FILES` lists three sidecars;
`SOURCE_FOLDERS` ships five. `redoute-lilies.json` (475) and
`redoute-roses.json` (169) have a `year` on every entry and `year_source` on
none — they have never been through the normalizer. Import `SOURCE_FOLDERS`
instead of maintaining a second list, make `extractYear`'s naive
`\b(\d{3,4})\b` fallback `console.warn` and return null, and assert in
`assets:verify` that every entry in every source folder has a `year_source`.

---

## What this audit could not see

The candidate set was built from three heuristics: a year derived from a weak source, a
year contradicting a stated `date_created`, and a year impossible for the artist on the
record. Everything outside that is untouched, and two gaps are worth naming.

A **plausible wrong year from a plausible source** is invisible here — if `date_created`
itself is wrong on Commons, nothing in this audit questions it. Roughly 2,150 works take
their year from `wikidata_qs` and were never examined.

And the heuristics are **coupled to the artist being right**. The Bird Trap sat
unflagged through the previous audit precisely because the wrong artist made its wrong
year look reasonable. Every future attribution fix should re-run this candidate query.
