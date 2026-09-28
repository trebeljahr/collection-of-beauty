# Physical-size fixes, September 2026

Commit 19c6303 added `trustworthyRealSize()` in `src/lib/real-size.ts`. It
hid the artwork page's scale view for 897 of the 3,091 works with a size.
This pass fixed the sizes that were wrong at the source. It changed
`metadata/artwork-dimensions.json` and two scripts, not `src/data/*.json`.
After it, 866 works are hidden and 2,225 are drawn.

All sizes below are width × height in cm, as stored. Sources print height
first unless noted.

## Script fixes

- `scripts/build-data.mjs` divided every `wikimedia-template` value over
  400 cm by 10. That mm/cm slip only occurs in Google Art Project's
  `pretty_dimensions` field. It now runs on Google Art Project files only.
  Three works get their true size back from the existing sidecar values:

  | Work | Was | Now |
  | --- | --- | --- |
  | Botticelli, The Temptations of Christ (Sistine Chapel) | 55.5 × 34.55 | 555 × 345.5 |
  | Tintoretto, Marriage at Cana (Santa Maria della Salute) | 53.5 × 43.5 | 535 × 435 |
  | Tintoretto, Prayer in the Garden (Scuola Grande di San Rocco) | 45.5 × 53.8 | 455 × 538 |

- `scripts/fetch-artwork-dimensions.mjs` read `{{Size}}` numbers by
  position and ignored `width=` / `height=` names. It stored
  `{{Size|unit=cm|width=31|height=35.1}}` (Carracci's Susanna) as 35.1 wide.

## Google Art Project template values under 400 cm

These had no knowable unit, so the scale view hid all 17. Each now carries
the holding museum's figure (`source: "museum"`).

| Work | Was | Now | Source |
| --- | --- | --- | --- |
| Dürer, Head of an Old Man, Albertina 3167 | 28.2 × 41.5 | 28.2 × 41.5 | [Albertina](https://sammlungenonline.albertina.at/objects/13507): "41,5 × 28,2 cm" |
| Rembrandt, The Windmill, AGSA 673G2 | 20.9 × 14.6 | 20.9 × 14.6 | [AGSA](https://www.agsa.sa.gov.au/collection-publications/collection/works/the-windmill/26704/): "14.6 x 20.9 cm (plate)" |
| Utamaro, Hairdresser, AGSA 838G66 | 27 × 38 | 27.6 × 38 | [AGSA](https://www.agsa.sa.gov.au/collection-publications/collection/works/hairdresser-kamiyui/26782/): "38.0 x 27.6 cm (image & sheet)" |
| Yoshitoshi, The Moon on Musashi Plain, AGSA 20054G73 | 22 × 33 | 24.2 × 36 | [AGSA](https://www.agsa.sa.gov.au/collection-publications/collection/works/the-moon-on-musashi-plain-musashino-no-tsuki/28233/): "36.0 x 24.2 cm (sheet)"; the scan shows the sheet |
| Turner, Line Fishing off Hastings, V&A FA.207 | 76.2 × 58.4 | 76.2 × 58.4 | [V&A](https://collections.vam.ac.uk/item/O82565/): 58.4 × 76.2 cm, marked "estimate" |
| Constable, Stonehenge, V&A 1629-1888 | 59.7 × 38.7 | 59.1 × 38.7 | [V&A](https://collections.vam.ac.uk/item/O74470/): height 38.7, width 59.1 |
| Monet, The Road to Vétheuil, Phillips 1378 | 71.12 × 58.42 | 72.7 × 59.4 | [Phillips](https://www.phillipscollection.org/collection/road-vetheuil): "59.4 x 72.7 cm" |
| Monet, The Cliff of Aval, Israel Museum L-B83.006 | 91.7 × 65.5 | 91.7 × 65.5 | [Israel Museum (archived)](http://web.archive.org/web/20211016050106/https://www.imj.org.il/en/collections/193325): "65.5 x 91.7 cm" |
| Monet, Pond with Water Lilies, Israel Museum B97.0483 | 72 × 101.5 | 72 × 101.5 | [Israel Museum (archived)](http://web.archive.org/web/20220419202457/https://www.imj.org.il/collections/202197): height 101.5, width 72 |
| "Gainsborough", Cattle Watering by a Stream, YCBA B1977.14.6174 | 362 × 295 | 36.2 × 29.5 | [YCBA](https://collections.britishart.yale.edu/catalog/tms:9916): "Sheet: … (29.5 x 36.2 cm)" |
| Gainsborough, Hilly Landscape…, YCBA B1998.14.1 | 381 × 279 | 38.1 × 27.9 | [YCBA](https://collections.britishart.yale.edu/catalog/tms:10095): "Sheet: … (27.9 x 38.1 cm)" |
| Turner, Fisherman's Cottage, Dover, YCBA B1975.4.747 | 200 × 133 | 20 × 13.3 | [YCBA](https://collections.britishart.yale.edu/catalog/tms:5453): "Sheet: … (13.3 x 20 cm)" |
| Turner, Clare Hall and King's College Chapel, YCBA B2001.2.1292 | 276 × 200 | 27.6 × 20 | [YCBA](https://collections.britishart.yale.edu/catalog/tms:46395): "Sheet: … (20 x 27.6 cm)" |
| Turner, The Angler, YCBA B1977.14.4208 | 156 × 229 | 15.6 × 22.9 | [YCBA](https://collections.britishart.yale.edu/catalog/tms:5481): "Sheet: … (22.9 x 15.6 cm)" |
| Whistler, Green and Silver: Beaulieu, Freer F1899.25a-b | 216 × 129 | 21.6 × 12.9 | [Freer (archived)](http://web.archive.org/web/20220812175427/https://asia.si.edu/object/F1899.25a-b/): "H x W: 12.9 × 21.6 cm" |
| Carracci, The Butcher's Shop, Kimbell AP 1980.08 | 71 × 59 | 71 × 59.7 | [Kimbell (archived)](http://web.archive.org/web/20260823212713/https://kimbellart.org/collection/ap-198008): "59.7 x 71 cm" |
| Munch, The Brooch. Eva Mudocci, Munchmuseet MM.G.00255-24 | 53.2 × 76 | 46.8 × 60.9 | [Munchmuseet](https://www.munch.no/en/object/MM.G.00255-24): "Motiv (Motif): 609 × 468 mm"; the stored value was the sheet, the scan shows the motif |

Six were millimetres read as centimetres. YCBA attributes Cattle Watering by
a Stream to an "imitator of Thomas Gainsborough". The catalogue now names
that imitator too (see below).

## Other wrong values

| Work | Was | Now | Source |
| --- | --- | --- | --- |
| Carracci, Susanna and the Elders (NGA) | 35.1 × 31 | 31.2 × 34.7 | [NGA 1976.48.1](https://www.nga.gov/artworks/55841-susanna-and-elders): "plate: 34.7 x 31.2 cm" |
| Monet, Nymphéas (W1698) | 92.6 × 81.3 | 89.3 × 93.8 | [Christie's](https://www.christies.com/en/lot/lot-6367904): "37 x 35 1⁄4 in. (93.8 x 89.3 cm.)"; the old value was from the Commons file's wrong Wikidata link, Q20190858 (Houses of Parliament, Sunset) |
| Monet, Palm Trees at Bordighera (W875) | 65 × 81 | 73 × 92 | [Wildenstein 1996, vol. II, p. 326](https://view.publitas.com/wildenstein-plattner-institute-ol46yv9z6qv6/c-r_claude_monet_volume_ii_wildenstein_institute/page/330-331): "875 … 92 x 73 cm"; 65 × 81 is the Met's W877 |
| Monet, Corner of the Pond at Montgeron (W419) | 194 × 173 | 81.5 × 60 | Wildenstein 1996, vol. II, p. 171: "60.0 x 81.5 cm"; the study for W420, whose 172 × 193 cm had been stored |
| Monet, Jean Monet Sleeping (W108), Ny Carlsberg Glyptotek | 81 × 60 | 50 × 42 | Wildenstein 1996, vol. II, p. 55: "108 … 42 x 50 cm" |
| Rubens, The Elevation of the Cross (oil sketch), Louvre MI 964 | 462 × 341 | 37 × 32 | [Louvre](https://collections.louvre.fr/en/ark:/53355/cl010059872): "Hauteur : 0,32 m ; Largeur : 0,37 m"; the old value was the Antwerp triptych's centre panel, turned |
| Rubens, St Ambrose and Emperor Theodosius, KHM GG 524 | 246 × 362 | 248.5 × 308 | [KHM](https://www.khm.at/en/artworks/st-ambrose-and-emperor-theodosius-1618): "Overall: 308 cm × 248,5 cm"; Wikidata's 362 × 246 matched no source |
| Rubens, The Consequences of War, Palazzo Pitti inv. 1912 n. 86 | 305 × 206 | 345 × 206 | [Polo Museale Fiorentino catalogue (archived)](http://web.archive.org/web/20250222213952/http://www.polomuseale.firenze.it/catalogo/scheda.asp?nctn=00129547&value=1): "(Altezza per Larghezza) 206 x 345" |
| Shitao, Searching for Immortals, leaf g, Met 1989.363.154 | 27.3 × 14.9 | 31.4 × 21 | [Met](https://www.metmuseum.org/art/collection/search/49179): "8 1/4 × 12 3/8 in. (21 × 31.4 cm)"; the old figure was the Met's 2017 metadata |
| Hiroshi Yoshida, Kumoi Cherry Trees, Toledo 1939.381 | 45.1 × 29.4 | 74.3 × 58.4 | [Toledo](https://emuseum.toledomuseum.org/objects/50744/kumoi-cherry-trees): "paper: 23 x 29 1/4 in. (58.4 x 74.3 cm)"; the scan shows the sheet |
| Natoire, The Triumph of Bacchus (1736) | 160 × 194 | 151.8 × 219 | [Christie's](https://www.christies.com.cn/en/lot/lot-6410955): "86 1/4 x 59 3/4 in. (219 x 151.8 cm.), each"; also Sotheby's L12033 lot 40. The old figure matched no Natoire Bacchus |

The Monet works (W1698, W875, W419, W108) and Natoire carry
`source: "curated"`, since their figures come from a catalogue raisonné or
an auction house rather than the owner's collection page.

`artwork-dimensions.json` does not record where a value came from beyond
`source`. A `--force` run of `fetch-artwork-dimensions.mjs` overwrites
every entry above with the Commons or Wikidata value again.

## Still hidden, with a correct size

The stored value is right, but the scan shows something else.

- Wang Meng, Dwelling in the Qingbian Mountains: the scan includes the
  mount and colophons (21% off).
- Parmigianino, Madonna with the Long Neck: the scan is a detail of the
  head (19%).
- Rembrandt, The Abduction of Ganymede: the Commons file is a crop (20%).
- Audubon plate 162, Zenaida Dove: cut to the picture area (17.6%).

A full-frame scan would make each of them drawable. Everything else hidden
is hidden by design: 644 Redouté sheet sizes on cut-out scans, 214
`series-default` print formats and 4 Vesalius page sizes.

## Metadata errors found on the way

Both are fixed.

- The Elevation of the Cross: the description described the Antwerp
  triptych for St Walburga, and the sidecar in
  `metadata/collection-of-beauty.json` pointed to the triptych file on
  Commons, with the triptych's date, 1610. The image is byte-identical to
  [File:Peter Paul Rubens - The Elevation of the Cross.JPG](https://commons.wikimedia.org/wiki/File:Peter_Paul_Rubens_-_The_Elevation_of_the_Cross.JPG),
  the Louvre sketch. The sidecar now points there and takes its date,
  circa 1620 (Wikidata Q29655273; the Louvre gives 1600–1625). The Louvre
  record calls the sketch the modello for the tenth ceiling painting in the
  galleries of the Jesuit church in Antwerp. The description now says so,
  through verified span edits.
- Cattle Watering by a Stream: `metadata/artist-overrides.json` records it
  as "Imitator of Thomas Gainsborough", like the catalogue's one other
  qualified name, "Follower of Rogier van der Weyden". The alias matcher
  found "Thomas Gainsborough" inside the qualified name and filed the work
  under him again, so build-data now matches an override against
  artists-db by exact name only (`matchArtistExact`). No earlier override
  changes. The work has no date and the imitator no artists-db entry, so
  `metadata/movement-overrides.json` tags it Rococo to keep it in the 3D
  museum. The description's sentence placing it among Gainsborough's own
  landscapes is replaced by the attribution.
