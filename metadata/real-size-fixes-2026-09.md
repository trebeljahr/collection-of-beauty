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

## Plain fetch of the unasked ids, 28 September 2026

1,175 works had no key in `artwork-dimensions.json`. A plain run of
`fetch-artwork-dimensions.mjs` (no `--force`) asked for them and left
every existing entry untouched. It found 903 sizes (783 Wikidata, 120
Commons template) and 272 nulls. Before review, 855 of the 903 passed
`trustworthyRealSize()`. After the fixes below, 880 pass and 23 are hidden.
All 563 works still without a size have an explicit `null`.

### Script fixes

- The generic `H x W unit` pattern matched inside a fraction:
  `19 1/2 by 14 in.; 49.5 by 35.6 cm.` read as `2 by 14 in`. It stored
  Benjamin West's Venus at Her Birth as 35.56 × 5.08. It now reads
  35.6 × 49.5.
- A Google Art Project value labelled inches was millimetres in all 6
  files that carry one. Five read over 10 m and were dropped. The sixth,
  West's Benjamin Franklin Drawing Electricity from the Sky
  (`w256 x h340 in`), read 650 × 864 cm. build-data's over-400 rescale
  turned that into 65 × 86 cm, and the scale view drew it, since a
  rescaled value is not hidden. The parser now skips inch-labelled Google
  Art Project values, and Wikidata answers instead.

Both ids were re-fetched with `--only=<id> --force`; nothing else was.

### Values fixed from the holding museum's record

Width × height in cm, as stored. "Was" is the fetched value.

| Work | Was | Now | Source |
| --- | --- | --- | --- |
| West, Pylades and Orestes Brought as Victims before Iphigenia, Tate N00126 | 100.3 × 126.4 | 126.4 × 100.3 | [Tate](https://www.tate.org.uk/art/artworks/west-pylades-and-orestes-brought-as-victims-before-iphigenia-n00126): "support: 1003 x 1264 mm" |
| West, Cleombrotus Ordered into Banishment by Leonidas II, Tate N00121 | 138.4 × 185.4 | 185.4 × 138.4 | [Tate](https://www.tate.org.uk/art/artworks/west-cleombrotus-ordered-into-banishment-by-leonidas-ii-king-of-sparta-n00121): "support: 1384 x 1854 mm" |
| Copley, The Death of Major Peirson, Tate N00733 | 251.5 × 365.8 | 365.8 × 251.5 | [Tate](https://www.tate.org.uk/art/artworks/copley-the-death-of-major-peirson-n00733): "support: 2515 x 3658 mm" |
| Turner, Sketch for 'East Cowes Castle, the Regatta Beating to Windward' No. 2, Tate N01994 | 45.7 × 61 | 61 × 45.7 | [Tate](https://www.tate.org.uk/art/artworks/turner-sketch-for-east-cowes-castle-the-regatta-beating-to-windward-no-2-n01994): "support: 457 x 610 mm" |
| Watts, Self-portrait (1864), Tate N01561 | 64.8 × 52.1 | 52.1 × 64.8 | [Tate](https://www.tate.org.uk/art/artworks/watts-self-portrait-n01561): "support: 648 x 521 mm" |
| Watts, Love and Life, Tate N01641 | 222.2 × 121.9 | 121.9 × 222.2 | [Tate](https://www.tate.org.uk/art/artworks/watts-love-and-life-n01641): "support: 2222 x 1219 mm" |
| Watts and assistants, Hope, Tate N01640 | 142.2 × 111.8 | 111.8 × 142.2 | [Tate](https://www.tate.org.uk/art/artworks/watts-hope-n01640): "support: 1422 x 1118 mm" |
| Klee, Walpurgis Night, Tate T00669 | 50.8 × 47 | 47 × 50.8 | [Tate](https://www.tate.org.uk/art/artworks/klee-walpurgis-night-t00669): "support: 508 x 470 mm" |
| Bazille, The Little Gardener, MFAH 76.236 | 128 × 168.9 | 168.9 × 128 | [MFAH](https://emuseum.mfah.org/objects/3575/the-little-gardener): "50 3/8 × 66 1/2 inches (128 × 168.9 cm)" |
| Delacroix, Rider Attacked by a Jaguar, NG Prague O 4774 | 28.5 × 23.5 | 23 × 28 | [NG Prague](https://sbirky.ngprague.cz/en/dielo/CZE:NG.O_4774): "height 28 cm width 23 cm" |
| El Greco, Adoration of the Magi, Museo Soumaya | 42.8 × 51 | 51.1 × 42.4 | [Museo Soumaya on Google Arts & Culture](https://artsandculture.google.com/asset/adoraci%C3%B3n-de-los-reyes-magos-dom%C3%A9nikos-theotok%C3%B3poulos-el-greco/IgHeno4v6PvnhQ): "42.4 x 51.1 cm"; the scan is landscape |
| David, Le Serment du Jeu de paume (drawing), Louvre RF 1914 | 66 × 101.2 | 101.2 × 66 | [Louvre](https://collections.louvre.fr/en/ark:/53355/cl020114798): "Height 0.66 m; Length 1.012 m" |
| Vasnetsov, Preference, Tretyakov inv. 5224 | 84 × 136 | 136 × 84 | [Tretyakov](https://my.tretyakov.ru/app/masterpiece/20927): "Размер - 84 x 136" |
| Malevich, Suprematism (Supremus No. 56), Russian Museum Ж-1421 | 71 × 805 | 71 × 80.5 | [Russian Museum](https://rusmuseumvrm.ru/data/collections/painting/19_20/zh_1421/index.php): "Холст, масло. 80,5 x 71" |
| Manet, Ernest Hoschedé and his Daughter Marthe, MNBA Buenos Aires 7961 | 13 × 9.7 | 130 × 97.5 | [MNBA](https://www.bellasartes.gob.ar/coleccion/obra/7961/): "Medidas: 97,5 x 130 cm." |
| Raphael, Saint George and the Dragon, NGA 1937.1.26 | 215 × 285 | 21.5 × 28.5 | [NGA](https://www.nga.gov/collection/art-object-page.28.html): "overall: 28.5 x 21.5 cm" |
| Cassatt, Self-Portrait, NPG.76.33 | 246 × 327 | 24.6 × 33.1 | [NPG](https://npg.si.edu/object/npg_NPG.76.33): "Sheet: 33.1cm x 24.6cm"; the scan shows the sheet |
| Goodridge, Gilbert Stuart, NPG.92.120 | 71 × 83 | 7.1 × 8.3 | [NPG](https://npg.si.edu/object/npg_NPG.92.120): "Ivory: 8.3 x 7.1cm"; our file is cropped to the case opening |
| Wtewael, Mars and Venus Surprised by Vulcan, Getty 83.PC.274 | 155 × 203 | 15.5 × 20.3 | [Getty](https://www.getty.edu/art/collection/objects/715/): "Unframed: 20.3 × 15.5 cm" |
| Wtewael, The Adoration of the Shepherds, Centraal Museum 7390 | 106 × 86 | 106.9 × 86.7 | [Centraal Museum](https://www.centraalmuseum.nl/en/collection/7390-de-aanbidding-van-de-herders-joachim-wtewael): "hoogte 86.7 cm breedte 106.9 cm" |
| West, Benjamin Franklin Drawing Electricity from the Sky, PMA 1958-132-1 | 650.24 × 863.6 (built as 65 × 86.4) | 25.6 × 34 | [PMA](https://philamuseum.org/collection/object/57044): "13 3/8 × 10 1/16 inches (34 × 25.6 cm)" |
| Gauguin, Nevermore, Courtauld P.1932.SC.163 | 161 × 60 | 116 × 60.5 | [Courtauld](https://gallerycollections.courtauld.ac.uk/object-p-1932-sc-163): "Height: 60.5 cm (canvas) Width: 116 cm (canvas)" |
| El Greco, Laocoön, NGA 1946.18.1 | 193 × 142 | 172.5 × 137.5 | [NGA](https://www.nga.gov/collection/art-object-page.33253.html): "overall: 137.5 x 172.5 cm" |
| Copley, Mrs. George Watson, SAAM 1991.189 | 110.17 × 147.32 | 101.6 × 126.7 | [SAAM](https://americanart.si.edu/artwork/mrs-george-watson-32432): "49 7/8 x 40 in. (126.7 x 101.6 cm)" |
| Gauguin, Barbarian Tales, Museum Folkwang | 109 × 150 | 90.5 × 131.5 | [Museum Folkwang on Google Arts & Culture](https://artsandculture.google.com/asset/contes-barbares-barbarian-tales-paul-gauguin/YgG_lk-tyTVL6A): "Height 131.5 cm, Width 90.5 cm"; Folkwang's own record gives the framed 150 × 109 × 8 cm |
| Stuart, George Washington (The Athenaeum Portrait), NPG.80.115 | 88 × 121.9 | 94 × 121.9 | [NPG](https://npg.si.edu/object/npg_NPG.80.115): "121.9cm x 94cm" |
| Bellini, Saint Jerome in the Wilderness, Barber Institute 49.1 | 22.9 × 44 | 30 × 44.2 | [Barber Institute](https://barber.org.uk/giovanni-bellini-about-1430-1516/): "44.2 x 30 cm" |
| Serov, Portrait of Ivan Morozov (1910), Tretyakov inv. 10872 | 23 × 29.5 | 77 × 63.5 | [Tretyakov](https://my.tretyakov.ru/app/masterpiece/20806): "Размер - 63,5 x 77"; the Commons page cites the same inventory number with 29.5 × 23 |
| Cézanne, Bathers (Les Grandes Baigneuses), NG6359 | 191 × 136 | 196.1 × 136.7 | [Cézanne catalogue raisonné FWN 979](https://www.cezannecatalogue.com/catalogue/entry.php?id=830): "136.7 x 196.1 cm (includes added strip of canvas)". The [National Gallery](https://www.nationalgallery.org.uk/paintings/paul-cezanne-bathers-les-grandes-baigneuses) gives the composition, 127.2 × 196.1; the scan shows the full canvas |
| West, Dr Richard Price, National Library of Wales | 87.5 × 185 | 72.4 × 92.8 | Christie's, 23 November 2004 ([via Invaluable](https://www.invaluable.com/artist/1738-benjamin-pcu21cwrok/sold-at-auction-prices/?page=7)): "36 1/2 x 28 1/2 in. (92.8 x 72.4 cm.)". The library's record, "1850 x 875 mm. framed", is a different shape from the painting |

Cézanne and Price carry `source: "curated"`; the rest carry `"museum"`.

The failure classes, in order of count:

- Width and height reversed on Wikidata or Commons: 13. All 8 Tate works
  came in turned, as if Tate's "height x width" had been read as width
  first. The other 8 new Tate works fit as given.
- Google Art Project units. Four template values were millimetres read
  as centimetres (Raphael, Cassatt, Goodridge, Wtewael's Getty panel).
  One was the reverse: Manet's `w130 x h97 mm` is centimetres. Where the
  template and Wikidata differ more than twofold, the fetch trusts the
  template, and on Google Art Project files that picked the wrong side
  6 times in 16. It also passed Malevich's `h8050 mm` through, since
  Wikidata carried the same slip.
- Framed sizes: Barbarian Tales (Folkwang's record has an 8 cm depth),
  and probably Mrs. George Watson.
- Other wrong numbers: Nevermore's width (161 for 116), Laocoön (matches
  neither NGA figure), the Athenaeum Portrait's width, Bellini's width,
  Serov's Morozov, Cézanne's Bathers and Richard Price.

No new Wikidata item names a different artist, and no two new works
share an item. The known wrong-link case, a Commons page whose
`|wikidata=` points at another painting (Monet W1698), did not recur.

### Still hidden, not fixed

- 13 Google Art Project template values. Most look right (Walker Art
  Gallery's Death of Nelson 247 × 182, Kimbell's May Sartoris 90 × 152),
  but a template value from those files has no knowable unit, so the
  rule hides them. One is Boilly's Jan Anthony d'Averhoult, stored
  42 × 55: Google Arts & Culture gives 42.6 × 55.2 cm, Wikidata the same
  numbers in millimetres, and the Centraal Museum's own record was
  unreachable.
- Correct size, scan shows less: Michelangelo's Creation of Adam (the
  fresco, 570 × 280, on a crop), David's Les Amours de Pâris et d'Hélène
  (a portrait crop of a landscape canvas), Aivazovsky's 1874 self-portrait
  (the file is named "cropped"), Gauguin's L'Esprit Moderne et le
  Catholicisme (one cover's size, a scan of both).
- Scan and size disagree, cause unknown: Rubens's Crucifixion of Saint
  Peter (170 × 310), Le Brun's Capture of Ghent (400 × 600), Wierix's
  Portrait of Quinten Massijs (12 × 15.3), and Kustodiev's Fair (71 × 120,
  from secondary sites only).
- Vereshchagin, Buddhist Temple in Darjeeling: the Tretyakov gives
  38 × 40.7, but its own photograph is landscape (1.49).
- Vereshchagin, The Forgotten Soldier (Mykolaiv): only the 4.5 m height
  is confirmed. Published widths range from 248 to 293 cm, and none
  matches the scan.

### Catalogue duplicates found on the way

Two new works are second files of works already catalogued, with the
same size: Titian's Fiesta campestre is Le Concert champêtre, and
Creación de Adán is The Creation of Adam.
