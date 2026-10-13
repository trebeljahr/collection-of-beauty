# Physical sizes for the works that had none, October 2026

A plaque in the 3D museum prints a size line only when
`trustworthyRealSize()` returns one. On 13 October 2026, 562 of the 4,555
works had no size at all, and their plaques ended under the byline. Every
one had been asked before: Wikidata and the Commons template had answered
`null`.

A first pass found a size for 419 of them. 412 pass every check and are
printed. 7 are stored but stay hidden, because the scan shows more or less
than the measured object. A second pass the same day went back to the 143
that were left and found 40 more, all printed: see "The second pass"
below. 103 are still `null`; they are listed with the reason in
[real-size-open-2026-10.md](real-size-open-2026-10.md).

All sizes below are width × height in cm, as stored. Sources print height
first unless noted.

## Where each number is recorded

Every entry written in this pass carries a `ref` beside `source` in
`metadata/artwork-dimensions.json`: the record's name, the words it was
read from and its address.

```json
"collection-of-beauty-monet-w109": {
  "widthCm": 226,
  "heightCm": 147,
  "source": "curated",
  "ref": "Wildenstein 1996, no. 109, vol. II, p. 55 (WPI online scan, viewer page 59): \"109 La Jetée du Havre … 147 x 226 cm\""
}
```

build-data reads `widthCm`, `heightCm` and `source` and drops the rest, so
`ref` never reaches `src/data`. `fetch-artwork-dimensions.mjs` keeps an
existing entry whole. A `--force` run still replaces it with the Commons or
Wikidata value and loses the `ref`.

The first pass:

| `source` | Entries | What it is |
| --- | --- | --- |
| `museum` | 168 | The holding museum's own record of the object |
| `curated` | 201 | A catalogue raisonné (114), a museum's record of another impression of the same print (71), an auction lot (10), a heritage database, a lending museum's list or a museum's entry for a loan (6) |
| `wikidata` | 32 | P2048 and P2049 of the item the linked Commons page names |
| `wikimedia-template` | 18 | The `dimensions` field of the linked Commons page |

## How they were found

### The linked Commons page (59)

`fetch-artwork-dimensions.mjs` asked Commons for a page named like the file
on disk. 55 of the 562 works link a page of another name: a file saved as a
preview carries a `960px-` prefix, and some were renamed by hand. The fetch
had found nothing for them and stored `null`, which a plain run never asks
again.

Read from the linked page, 59 works had a size on the page or on its
Wikidata item. Nine were checked against the museum and carry its figure:

| Work | Stored | Source |
| --- | --- | --- |
| Veronese, The Feast in the House of Levi | 1309 × 560 | [Gallerie dell'Accademia](https://www.gallerieaccademia.it/convito-casa-di-levi): "Tela, cm 560 x 1309". Commons says 555 × 1280, Wikidata 560 × 1039 |
| Gainsborough, Giovanna Baccelli, Tate T02000 | 148.6 × 226.7 | Tate: "support: 2267 x 1486 mm". Wikidata and Commons had the two turned |
| Delaunay, Tour Eiffel (1926), AMVP 2412 | 104 × 170 | [Paris Musées](https://www.parismuseescollections.paris.fr/fr/musee-d-art-moderne/oeuvres/tour-eiffel): "Hauteur 170 cm, Largeur 104 cm". The Commons filename's 169 × 86 cm is in no museum record |
| Monet, Reflections of Clouds on the Water-Lily Pond, one panel, MoMA 666.1959.a-c | 424.8 × 200 | MoMA: "Each … (200 x 424.8 cm), overall … (200 x 1276 cm)" |
| The same triptych, a gallery photograph | 1276 × 200 | The same record. Hidden: the photograph is taken at an angle |
| Monet, four Nymphéas panels at the Orangerie | 1275 × 200 (three), 1700 × 200 | [Musée de l'Orangerie](https://www.musee-orangerie.fr/fr/oeuvres/les-deux-saules-196306): "H. 200 ; L. 1275 cm", and "H. 200 ; L. 1700 cm" for Les Deux Saules |

The fetch now asks for the page the catalogue links (`commonsFileTitle()`).

Tate's published dataset has a column `width` that holds the first number
of "support: H x W mm", which is the height. That is why Tate sizes arrive
turned on Wikidata. The September pass met eight of them.

### Monet, from the catalogue raisonné (108)

106 Monet files carry their Wildenstein number in the name. The Wildenstein
Plattner Institute has the 1996 catalogue online as page scans, at
`view.publitas.com/wildenstein-plattner-institute-ol46yv9z6qv6/c-r_claude_monet_volume_<ii|iii|iv>_wildenstein_institute/`.
Vol. II holds W1–968, vol. III W969–1595, vol. IV W1596–1983.

- `search?q=<word>` answers with the pages whose text holds the word, and
  `spreads.json?page=<1|2|3>` with the text and image address of every page.
- The text cannot be parsed. Columns run into one another, and a number
  stands beside another entry's size. A first attempt took W962a's
  44.5 × 55.5 cm for W962, which prints no size.
- So each entry was read from the page image: the number, the French title
  and the size line, and for most the catalogue's illustration against the
  scan. `ref` quotes the heading and gives the volume, the printed page and
  the viewer page.

101 of the 106 have a size. Seven Monets without a number in the filename
were tied to their entry by title, date and owner and read the same way.

What the catalogue did not give:

- W891a (Self-Portrait in His Studio) and W962 print no size line.
- W706 (Port of Dieppe, Evening) prints "69 x 73 cm". The catalogue's own
  illustration is as wide as the scan, about 1.25 to 1, so the printed
  size is not used. Wikidata repeats it.
- `Monet_w835.jpg` shows the picture the catalogue illustrates as W834,
  and `Monet_w1675.jpg` the one it illustrates as W1676. The size of the
  number in the filename does not fit (835) or fits only loosely (1675),
  and the size of the neighbour was not taken.
- W919, Red and Pink Poppies: "119.5 (original size: 128.5) x 37.0 cm".
  128.5 is stored, because the scan shows the full height.
- Wikidata disagrees with the catalogue on W386 (80 × 60.5 upright, where
  the canvas is 61 × 80 landscape), W58, W148 and W1781.

### Museum records and other citable sources (205)

The rest were researched work by work: the holding museum's record first,
then a catalogue raisonné, a heritage database or an auction lot for works
in private hands. Each number was read in the raw page, API answer or PDF
text, and each `ref` quotes it. Records that often answered:

- Tretyakov Gallery: `my.tretyakov.ru/api/v1/gallery/getById/?id=<n>`
  returns the size and inventory number as JSON.
- Russian Museum: `rusmuseumvrm.ru`, "Холст, масло. 80,5 x 71".
- Wellcome Collection: `api.wellcomecollection.org/catalogue/v2/works/<id>`,
  field `physicalDescription` ("platemark 56.2 x 41.5 cm").
- National Museum of Korea: `emuseum.go.kr`, one record per album leaf.
- SMB Berlin: `smb.museum-digital.de/json/object/<id>` while
  `recherche.smb.museum` is down.
- Paris Musées: the size is in the IIIF manifest, not on the page.
- POP: `api.pop.culture.gouv.fr/search/simple?text=…&bases[]=joconde`.
- The Met: `/public/collection/v1/search` was retired on 1 October 2026;
  `/v1.1/search` answers.

### Holbein's Dance of Death (47)

The 47 woodcuts are scans of one reproduction set, each padded to
1000 × 1279 px, so the scanned impression cannot be named. Each carries
the size of a museum's impression of that woodcut: 37 from the
Metropolitan Museum's set (19.57.x, each sheet measured, 6.4–6.7 ×
4.8–5 cm), one from Minneapolis, nine from the Rijksmuseum. The
Rijksmuseum states one image size, 65 × 50 mm, on every print of its set.
Those nine are a set figure and their `ref` says so.

## The second pass (40)

The first pass ran 20 research agents on one allowance of 200 web
searches, which ran out two thirds of the way through, and it could not
open records that refuse `curl`. The second pass took the 143 works that
were left. It had Rico's real Chrome for those records, five agents with
a search limit each (117 of the 200 used), and it looked at every scan
before it took a size.

| `source` | Entries | What it is |
| --- | --- | --- |
| `museum` | 14 | The holding museum's own record |
| `curated` | 26 | A catalogue raisonné or the owner's own catalogue (6), a museum's record of another impression of the same print (7), the publication of a museum that showed or borrowed the work (7), an auction lot or dealer listing of that picture (5), the RKD (1) |

### Records read in a browser, or reachable again (14)

| Work | Stored | Record |
| --- | --- | --- |
| Claude Lorrain, Study of Mules | 25.7 × 14.3 | [British Museum, Oo,6.40](https://www.britishmuseum.org/collection/object/P_Oo-6-40): "Height: 143 millimetres / Width: 257 millimetres" |
| Constable, Hampstead Heath | 20.6 × 12.4 | [British Museum, 1900,0824.505](https://www.britishmuseum.org/collection/object/P_1900-0824-505): "Height: 124 millimetres / Width: 206 millimetres" |
| Eugene de Blaas, A Chat | 118 × 90 | [Dorotheum, 31 May 2007, lot 174](https://www.dorotheum.com/en/l/1939765/): "The Conversation, signed and dated Eg. de Blaas 1905, oil on canvas, 90 x 118 cm" |
| Ludwig Deutsch, The Nubian Palace Guard | 46.8 × 56 | [Dorotheum, 29 November 2006, lot 152](https://www.dorotheum.com/en/l/1939753/): "oil on panel, 56 x 46.8 cm" |
| Pupini, Mystic Marriage of Saint Catherine | 36 × 44 | [Musei Civici di Venezia, inv. 236](https://www.archiviodellacomunicazione.it/sicap/OpereArte/376869/?WEB=MuseiVE): "Altezza 44 Larghezza 36" |
| Bartlett, Amritsar | 31.4 × 23.7 | [Honolulu Museum of Art, 5381b](https://honolulu.emuseum.com/objects/24250): "Sheet: 9 5/16 x 12 3/8 in. (23.7 x 31.4 cm)" |
| Bartlett, Prayers at Sunset | 41.3 × 28.9 | [Honolulu, 5377](https://honolulu.emuseum.com/objects/11396): "Sheet: 11 3/8 x 16 1/4 in. (28.9 x 41.3 cm)" |
| Bartlett, Silk Merchants, India | 37 × 25.4 | [Honolulu, 5371](https://honolulu.emuseum.com/objects/11390): "Image: 10 x 14 9/16 in. (25.4 x 37 cm)"; the scan is trimmed to the image |
| Honthorst, Man with viola da gamba | 67.5 × 84 | [RKDimages 308637](https://rkd.nl/images/308637), Lviv Art Museum, inv. 789: "84 x 67.5 cm" |
| Keisai Eisen, Water Dragon | 26.5 × 37 | [MFA Boston, 11.22534](https://collections.mfa.org/objects/215131), another impression: "Vertical ôban; 37 x 26.5 cm" |
| Bolotov, Portrait of Ivan Aivazovsky | 73 × 93 | [Museum of the Academy of Arts, Ж-196](https://collection.artsacademymuseum.org/entity/OBJECT/29535): "Размер 93х73 см" |
| Levitan, Portrait of Sofia Kuvshinnikova | 57 × 88 | [The same museum, МБр Ж-72](https://collection.artsacademymuseum.org/entity/OBJECT/92042): "Размер 88х57" |
| Fantin-Latour, Vase of Flowers with a Coffee Cup | 39.5 × 47.6 | [Christie's New York, 14 May 2022, lot 819](https://www.christies.com/en/lot/lot-6369573): "18 7⁄8 x 15 5⁄8 in. (47.6 x 39.5 cm.)" |
| Rubens, Drunken Silenus | 266 × 212 | [Gemäldegalerie Berlin, 776B](https://id.smb.museum/object/867087): "Bildmaß: 212 x 266 cm". The museum's search site was down in the first pass |

What the browser found on the way:

- honolulu.emuseum.com and blanton.emuseum.com passed their Cloudflare
  check by themselves, with no click. Nothing was clicked through
  anywhere.
- The Dorotheum's press page gave de Blaas's picture as "€ 684.000" and
  the lot shows EUR 721.050. Both are a hammer price of 570,000, with a
  premium of 20% and of 26.5%. For Deutsch the two prices are the same.
- Three sites refuse Chrome as well: `collections.louvre.fr` (an "I am
  not a robot" box), `catalog.shm.ru` (403) and the Astrakhan gallery's
  `agkg.ru` (blocked). The Astrakhan record was read on ar.culture.ru.

### Monet (3)

The two files that carry a neighbour's Wildenstein number were compared
with the catalogue's illustrations side by side.

- `Monet_w835.jpg` is the picture illustrated as 834, La Seine à
  Port-Villez: "60 x 100 cm" (vol. II, p. 310). Stored 100 × 60.
- `Monet_w1675.jpg` is the picture illustrated as 1676, Nymphéas:
  "89 x 100 cm" (vol. IV, p. 761). Stored 100 × 89.
- W706, Port of Dieppe, Evening, is in the Dixon Gallery and Gardens,
  Memphis (1996.2.7). Its
  [entry on Google Arts & Culture](https://artsandculture.google.com/asset/port-of-dieppe-evening-claude-monet/FgE8ekQvMHflqw)
  reads "Physical Dimensions: 23 x 28 3/8 inches". Stored 72.1 × 58.4.
  The catalogue prints "69 x 73 cm", which its own illustration
  contradicts.

### Researched work by work (23)

| Work | Stored | Record |
| --- | --- | --- |
| Gleizes, The Bathers | 171 × 105 | [Musée d'Art Moderne de Paris, AMVP 1126](https://www.navigart.fr/mamparis/artwork/albert-gleizes-les-baigneuses-180000000000860): "105 x 171 cm". The museum's own site has the size; Paris Musées does not |
| Gérôme, Entry of the Christ at Jerusalem | 127 × 80 | Musée de Vesoul, catalogue of 1981, no. 153: "T. H. 0,80; L. 1,27" |
| William Collins, Sir David Wilkie's residence | 50.8 × 35.5 | [National Galleries of Scotland, NG 2818](https://www.nationalgalleries.org/art-and-artists/92738): "35.50 x 50.80 cm". The visitor's photograph stops about a tenth short at the right and the bottom |
| Levitan, Water lilies | 128 × 95 | [Astrakhan Picture Gallery on ar.culture.ru](https://ar.culture.ru/ru/subject/nenyufary-1): "95x128 см" |
| Dürer, Two Squirrels | 24.8 × 25.4 | Weale and Richter, catalogue of the Earl of Northbrook's pictures (1889), no. 18: "Vellum. 10 × 9¾ in." |
| Watts, Marie Fox | 86.4 × 111.8 | Princess Marie Liechtenstein, Holland House (1874), vol. 1, p. 237: "The canvas of the original picture is 44 inches by 34." The house's own account, by the sitter |
| Gilbert Stuart, Jérôme Bonaparte | 59.7 × 71.8 | Park, Gilbert Stuart (1926), no. 90: "Canvas, 28¼ x 23½ inches" |
| Turner, The Devil's Bridge | 62.8 × 76.8 | Tate, Turner Worldwide, TW1813 (Butlin and Joll 147): "support: 768 x 628 mm" |
| Sargent, Francis Brooks Chadwick | 25.1 × 33.7 | The Met's record of the panel on loan: "13 1/4 x 9 7/8 in. (33.7 x 25.1 cm)" |
| Picabia, Optophone | 60 × 72 | Camfield, Francis Picabia, Guggenheim Museum 1970, no. 77: "28 3/8 x 23 5/8\" (72 x 60 cm.)" |
| Juan Gris, Still Life with Fruit Dish and Mandolin | 65 × 92 | Rosenthal, Juan Gris, University Art Museum, Berkeley 1983, fig. 21: "92 x 65 cm", Cooper no. 303 |
| Boilly, The Incredible Parade | 51 × 39.3 | Musée Cognacq-Jay, press kit of 2022, p. 18: "Huile sur panneau, 39,3 × 51 cm". The caption stands under the scan's picture; the first pass had turned it down because that was inferred |
| Aivazovsky, Catholicos Khrimyan near Echmiadzin | 101 × 155 | Tretyakov Gallery Magazine, no. 4 2016: "155 × 101. Феодосийская картинная галерея" |
| Aivazovsky, Storm over Eupatoria | 317.3 × 206.6 | Tretyakov Gallery Magazine, no. 1 2017: "206,6 × 317,3. ГМЗ Царское Село". The Russian Museum's record of an exhibition of 2021 rounds it to 210 × 318 |
| Aivazovsky, Stormy sea at night | 106 × 89 | Tretyakov Gallery Magazine, no. 4 2016: "89 × 106. ГМЗ «Павловск»" |
| Inness, Frosty Morning, Montclair | 112.1 × 76.5 | M.S. Rau's listing of 2019: "Canvas: 30 1/8\" high x 44 1/8\" wide". The Commons file is the dealer's own |
| Lundberg, Portrait of Charles de Geer | 50 × 65 | Uppsala Auktionskammare, 2 June 2009, lot 17: "Pasteller, 65 x 50 respektive 66 x 52"; Jeffares J.503.1231 |
| Kustodiev, Tsar Nicholas II | 24.8 × 24.7 | [State Russian Museum, Аф-50848](https://rusmuseumvrm.ru/data/collections/engraving/af-50848/index.php): "Хромолитография. 24,7 х 24,8". The scan is the print after the portrait, not the oil |
| Gautier d'Agoty, The muscles of the human body | 39.69 × 55.72 | [Minneapolis, P.84.8](https://collections.artsmia.org/art/55852), another impression: "(55.72 x 39.69 cm) (plate)" |
| Redouté, Fritillaria imperialis | 35.56 × 52.07 | [Minneapolis, P.18,251](https://collections.artsmia.org/art/72995), another impression: "(52.07 x 35.56 cm) (plate)". The first pass had turned down a sheet size |
| Hasui, Gion Bridge at Hondo in Amakusa | 23 × 30.1 | [Art Institute of Chicago, 1990.607.639](https://www.artic.edu/artworks/197318), another impression: "Paper: 30.1 × 23 cm". The Rijksmuseum's record of the scanned sheet says 230 × 230 mm |
| Kunisada, Craftsmen | 74.7 × 36.1 | Rijksmuseum, RP-P-2015-26-2135, the three sheets as one object: "beeld: hoogte 361 mm x breedte 747 mm" |
| Kuniyoshi, Hawk | 23.6 × 69.5 | Fine Arts Museums of San Francisco, 54755.1065, a vertical diptych: "69.5 x 23.6 cm (image)" |

The Tretyakov Gallery Magazine is the gallery's own journal. The three
Aivazovskys are captions in its issues for the gallery's Aivazovsky
exhibition of 2016, to which Feodosia and the palace museums lent. Each
caption names the holder, and its illustration is the scan's picture.

A record that states inches alone is stored at 2.54 cm to the inch, to
one decimal, and its `ref` keeps the inches.

## Rules used

- A size is stored only when a record of that object states it. Nothing is
  computed from pixels, added up from parts or taken from a frame.
- A print whose scanned impression cannot be named may take the size of
  another museum's impression of the same block or plate, within 5% of the
  scan's shape (8% for the padded Holbein scans). `source` is `curated`
  and `ref` names the impression. The same holds where the scanned
  impression is named and its record has no size (the Wellcome's Gautier
  d'Agoty, Hamburg's Eisen) or a slip (the Rijksmuseum's Hasui).
- A joined diptych or triptych takes a size only from a record that
  states it for the joined sheets. Sheet sizes are not added up.
- A scan that is a detail gets no size. The hang sizes a work from the
  long edge of the stored size, so a detail would hang as large as the
  whole painting. Eight details are listed in the open file with the
  whole work's size.
- A correct size on a scan that shows more or less than the object is
  stored and stays hidden by the shape check. The tolerance is unchanged.

Stored and hidden (7):

| Work | Stored | Why hidden |
| --- | --- | --- |
| Chen Rong, Nine Dragons, MFA Boston 17.1697 | 958.4 × 46.2 | The scan runs on into the colophons (26% off) |
| Kim Hong-do, Gunseondo, Leeum | 575.8 × 132.8 | The scan is proportionally taller: mount (21%) |
| Huang Binhong, Landscape, Shanghai Museum | 65 × 127.1 | The scan is taller: mount (24%) |
| Le Brun, Alexander and Porus, Louvre INV 2897 | 1264 × 470 | The scan is cut at the sides (15.5%) |
| Turner, The Bright Stone of Honour | 123 × 93 | The scan is cut top and bottom (16%) |
| Copy after Holbein, Battle Scene, Albertina 17243 | 95.8 × 27.6 | The book reproduction shows three quarters of the sheet |
| Monet, MoMA triptych, gallery photograph | 1276 × 200 | Photographed at an angle (20%) |

## Sizes that were already stored

Two of the 15 hidden sizes were fixed.

| Work | Was | Now | Source |
| --- | --- | --- | --- |
| Wierix, Portrait of Quinten Massijs | 12 × 15.3 (Commons template) | 12.1 × 20.2 | [Boijmans Van Beuningen, OB 2862 10 (PK)](https://www.boijmans.nl/collectie/kunstwerken/119523/quintinvs-mesivs-anverpianvs-pictor-quinten-metsys), the museum's second impression: "Hoogte 202 mm / Breedte 121 mm". The scan is its impression BdH 14962, which has no online record. The old figure is the portrait without title and verses |
| David, Portrait of the Comte de Turenne, Glyptotek MIN 1900 | 81 × 112, unit not knowable | 81 × 112 (`museum`) | The [Glyptotek's entry on Google Arts & Culture](https://artsandculture.google.com/asset/_/RQE9W7iRpt1VoA): "w810 x h1120 mm" |

The other 13 are unchanged:

- The size is right and the scan shows less: Parmigianino's Madonna with
  the Long Neck (the head and bust), Rembrandt's Ganymede (the upper part),
  David's Paris and Helen (the two figures, upright, of a landscape
  canvas), Aivazovsky's self-portrait of 1874 (the head), Audubon's plate
  162. The first three hang too large in the museum: the hang takes the
  long edge of the whole painting, 219, 177 and 181 cm.
- The size is right and the scan shows more: Wang Meng's Qingbian
  Mountains (mount and colophons), Gauguin's L'Esprit moderne (both covers;
  the Saint Louis record gives the closed book, 17.9 × 32.1 × 2.1 cm).
- No record settles it:
  - Rubens, Crucifixion of Saint Peter. RKD repeats 310 × 170. Two
    photographs of the altarpiece agree on a shape near 0.68.
  - Le Brun, Capture of Ghent. A lobed ceiling canvas. The Versailles
    record and Joconde give no size, and 4 × 6 m is on Versailles' Google
    entry only.
  - Kustodiev, Fair. It is "На ярмарке", 1910, Radishchev Museum,
    Saratov, whose pages state no size.
  - Vereshchagin's Buddhist Temple in Darjeeling and Forgotten Soldier, as
    in September.
- Copley, Portrait of a Lady, Philbrook 1943.2: the Commons page carries
  'Unframed canvas: 36 × 28" (91.4 × 71.1 cm)', which is the stored value,
  but the Philbrook site answers 403 and its Google entry lists no size.

## What changed in the code

- `MAX_SIDE_CM` in `src/lib/real-size.ts` is 2,000, was 1,500. Les Deux
  Saules is 17 m long.
- The scale view's invariant in `real-size.test.ts` allows a work up to 10
  times its reference, was 6. Nine trusted works are longer than 10.5 m.
- `fetch-artwork-dimensions.mjs` asks for the linked Commons page.

## What changed in the museum

Measured on the catalogue before and after, both floor plans:

| | Tower | Block plan (`?plan=block`) |
| --- | --- | --- |
| Rooms | 119, unchanged in total. Renaissance 13 → 11, Ukiyo-e 9 → 11 | 52, unchanged |
| Works hung | 2,786 → 2,771 | 1,612 → 1,610 |
| Works hung at real size in the stair halls | none in this plan | 60 → 63 |
| `galleryLayoutIdentity` | changed | changed |

The second pass was measured the same way on the block plan as it stood
that evening (four floors, 44 rooms with halls and stair rooms):

| | Tower | Block plan (`?plan=block`) |
| --- | --- | --- |
| Rooms | 119 → 117: Ukiyo-e 11 → 9 | 44, unchanged |
| Works hung | 2,771, unchanged | 1,387 → 1,389 |
| Works hung at real size in the stair halls | none in this plan | 68, unchanged |
| `galleryLayoutIdentity` | changed | unchanged |

Seven of the 40 hang on the Ukiyo-e floor: four Japanese prints and
Bartlett's three woodcuts. Each hung with a long edge of 0.9 m, and five
of them are under 45 cm. The floor needs two rooms fewer.

A saved visit restarts once in its floor's Grand Hall. A work with no size
hung with a long edge of 0.9 m; with a size it hangs at that size, between
0.45 and 3.2 m in a room. In the block plan seven works join the stair
halls at their real size (Veronese's Feast in the House of Levi, three
Orangerie panels, one panel of MoMA's triptych, the centre panel of the
Agapanthus triptych, Copley's Victory of Lord Duncan) and four leave them (two Tintorettos, Jordaens's Triumph of Frederik Hendrik,
Rubens's Miracles of St Francis Xavier).

## Catalogue errors noticed on the way

None is fixed here: titles and attributions were being edited in another
session on the same day. Checked against the catalogue of 13 October.

Monet:

- `monet-water-lilies-1914-26`, titled "Water Lilies (Saint Louis Art
  Museum, 1914-26)", is MoMA's triptych 666.1959.a-c.
- `Monet_w835.jpg` shows W834, La Seine à Port-Villez, and
  `Monet_w1675.jpg` shows W1676.
- W649 carries W650's title: it is Sea Study Seen from the Cliffs. W683
  carries W684's: it is Garden at Vétheuil, the Norton Simon picture.
  W1121 is The Rain. W772 is The Sea at Pourville.
- "Bouquet of Mallows" is the Courtauld's Vase of Flowers, P.1932.SC.275
  (W626). "Los nenúfares" is the McNay's Water Lilies, W1863.
- The two Dahlias, dated 1926, are W937 and W932 of 1883. Red and Pink
  Poppies is W919 of the same year. All three are door panels for
  Durand-Ruel's drawing room.

Other works:

- "Portrait of Giambattista Pittoni" under Bartolomeo Nazari is Pietro
  Monaco's engraving after Nazari's portrait.
- `durer-vier-reiter` links a Commons page that does not exist. The file
  is the Chester Beatty impression, CBL WEp 0021.
- Goravsky's portrait of Bruni links `File:Bruni_FA.jpg`, a photograph.
  The scan is `File:Портрет художника Федора Антоновича Бруни.jpg`.
- "Bad-war", under Holbein the Younger, and "Battle Scene", under After
  Hans Holbein the Younger, are two crops of one sheet: an anonymous copy
  after Holbein, Albertina 17243, drawn after 1524.
- Dates. Bauernfeind's Wailing Wall is the canvas of 1904 (1887 stored).
  Surikov's Menshikov in Beryozovo is 1883 (1888). Vasnetsov's Monomakh
  is about 1895 (1870). Bakst's Uriel Acosta is a watercolour of 1892
  (1893). The Tretyakov dates Vereshchagin's Requiem 1878–79 (1877), and
  the Kunsthalle zu Kiel Bryullov's Italian Morning 1824 (1823).
- Titles. `degas-deux-danseuses` ("Degas") is Deux danseuses, Shelburne
  1972-69.6. `cezanne-fwn-1974` is Nature morte au melon vert, 1902–06,
  a watercolour. Renoir's "The river" is Nu dans un paysage (Le Fleuve).
  Picabia's "Transparence" is Sphinx, Centre Pompidou JP 668 P. His cover
  of 291 is that of nos. 5–6, not no. 1.
- "Chinese Warship Ting Yuang Visiting Japan" shows the captured Zhenyuan
  on public view. "At the Shore of the Sumida River" is Tōto Ommayagashi
  no zu. `kisokaido14-itahana` is no. 15 of the series. The two "Udaipur"
  files of 1916 are different prints.
- Kim Hong-do's "Drunken Monk under a Pine Tree" shows a figure playing
  the mouth organ (吹笙), not a monk.
- Repin's Ukrainian Woman by a Wattle Fence is not in the Latvian national
  catalogue, which the provenance names. Levitan's "Spring in Italy" and
  "Golden Autumn" are not the Tretyakov paintings of those names.
  Malevich's Suprematist Composition left the Stedelijk in 2008.
- "Tab. V: Fetus with Umbilical Cord and Placenta" is from Albinus's
  Tabulae VII uteri mulieris gravidae, not the Tabulae sceleti.

Noticed in the second pass:

- Dürer's Two Squirrels is not an Albertina sheet. It was in the Earl of
  Northbrook's collection and went to a sale on 3 May 1940; the sheet is
  dated 1512 (1492 stored).
- Kustodiev's "Tsar Nicholas II" is the chromolithograph of 1915 after
  his portrait (State Russian Museum, Аф-50848), not the oil.
- Le Brun's "Anger" is Hebert's print after Le Brun of about 1770
  (Wellcome 32625i), cropped, not a drawing of 1668. "Plate from Le
  Brun, Bowles's Passions of the Soul" is plate 2, Attention.
- "Sir David Wilkie's residence in Kensington London" is View of Sir
  David Wilkie's House in Vicarage Place, Kensington, 1841–1842,
  National Galleries of Scotland, NG 2818.
- Turner's Devil's Bridge is in a private collection in the UK and dates
  from about 1803–4 (Tate, Turner Worldwide). It was photographed on
  loan at the Ashmolean.
- Fantin-Latour's "Vase of Flowers with a Coffee Cup" is Nature morte à
  la tasse de café, signed and dated 1865.
- De Blaas's "Curiosity" is the colour plate of Pears' Annual 1892 after
  the painting. His "A Chat" was sold as The Conversation.
- Dates. The Astrakhan gallery dates Levitan's Water Lilies 1890 (1895
  stored). The Tretyakov Gallery Magazine dates Aivazovsky's Stormy Sea
  at Night 1861 (1849). MAK Vienna dates Kunisada's Evening Snow at Ueno
  1847–1852 (no year stored). Lundberg's Charles de Geer is the pendant
  of a pastel dated 1766 (1720 stored).
- Holders. Kustodiev's Blue House is at Peterhof. Sargent's Francis
  Brooks Chadwick belongs to the Andersen Foundation and is on loan to
  the Orlando Museum of Art. The file of Yoshitoshi's Adachi Moor is the
  uploader's own impression, not LACMA's. Nothing supports the Khanenko
  Museum for Gérôme's Hookah Lighter. Gérôme's Entry of the Christ is
  no. 945.2.15 at Vesoul; Commons gives 945.2.14 to it and to the sketch.
- Redouté's "Centifolia Rose, Anemone and Clematis" is from Choix des
  plus belles fleurs, not Les Roses.
- Bartlett's Hana, Maui Coast comes from Douglas Frazer Fine Art. His
  "Udaipur" is the second of two designs of 1916 with that title.
- The Encyclopedia of Korean Culture judges the album of the Four
  Districts of Mount Geumgang a close copy after Kim Hong-do.
