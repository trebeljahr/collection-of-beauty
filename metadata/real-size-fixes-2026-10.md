# Physical sizes for the works that had none, October 2026

A plaque in the 3D museum prints a size line only when
`trustworthyRealSize()` returns one. On 13 October 2026, 562 of the 4,555
works had no size at all, and their plaques ended under the byline. Every
one had been asked before: Wikidata and the Commons template had answered
`null`.

This pass found a size for 419 of them. 412 pass every check and are
printed. 7 are stored but stay hidden, because the scan shows more or less
than the measured object. 143 are still `null`; they are listed with the
reason in [real-size-open-2026-10.md](real-size-open-2026-10.md).

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

## Rules used

- A size is stored only when a record of that object states it. Nothing is
  computed from pixels, added up from parts or taken from a frame.
- A print whose scanned impression cannot be named may take the size of
  another museum's impression of the same block or plate, within 5% of the
  scan's shape (8% for the padded Holbein scans). `source` is `curated`
  and `ref` names the impression.
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
