# Copyright takedown, September 2026

The site is operated from Germany. On 2026-09-14, 146 works still in copyright under German law were withdrawn:
14 from the catalogue, and 132 more that were never catalogued but were publicly served from the R2 bucket.

## Why this happened

- Commit `e13f642` (2026-05-31) regenerated `metadata/collection-of-beauty.json` without its `pd_status` stamps. That switched off the only copyright filter in `build-data.mjs`.
- The catalogue trusted Commons licence tags. Those describe US and source-country status, not German status, and some were wrong: CC0 on Kasamatsu Shirō prints (died 1991), `PD-Japan` on Torii Kotondo (died 1976).
- `assets:shrink` encodes every original under `assets/<folder>`, catalogued or not, and `assets:sync` uploads the result. So uncatalogued originals were public.

## How it is enforced now

See "Copyright" in `CLAUDE.md`. In short: `metadata/takedowns.json` is checked by build-data, shrink, the Commons fetch and sync. Artists marked `pd_status: "copyrighted"` in `scripts/artists-db.json` are withheld by build-data. Originals and variants are kept, unsynced, under `assets/.rejected/`.

## Removed from the catalogue

| Artist | Died | Work | Public domain in Germany from |
| --- | --- | --- | --- |
| Edward Hopper | 1967 | Morning Sun | 2038-01-01 |
| Edward Hopper | 1967 | Night Shadows - Oct 1922 Shadowland | 2038-01-01 |
| Edward Hopper | 1967 | Nighthawks | 2038-01-01 |
| Elizabeth Keith | 1956 | Old Korea-Keith-BRIDE | 2027-01-01 |
| Giorgio de Chirico | 1978 | The Disquieting Muses | 2049-01-01 |
| Jean Metzinger | 1956 | Jean Metzinger | 2027-01-01 |
| Kasamatsu Shirō | 1991 | De grote lantaarn van de Kannon tempel in Asakusa Asakusa Kannondo ochochin | 2062-01-01 |
| Kasamatsu Shirō | 1991 | De rand van de Shinobazu vijver tijdens een mistige avond. Kasumu yube Shinobazu chihan | 2062-01-01 |
| Kasamatsu Shirō | 1991 | De warme bronnen van Shuzenji Shuzenji onsen | 2062-01-01 |
| M. C. Escher | 1972 | MC Escher Convex and Concave | 2043-01-01 |
| M. C. Escher | 1972 | MC Escher Three Spheres I | 2043-01-01 |
| Pablo Picasso | 1973 | Old guitarist chicago | 2044-01-01 |
| Torii Kotondo | 1976 | Kamisuki | 2047-01-01 |
| Torii Kotondo | 1976 | Woman Before a Mirror | 2047-01-01 |

## Removed from the bucket only (never catalogued)

| Artist | Died | Folders |
| --- | --- | --- |
| M. C. Escher | 1972 | 67 |
| Ernie Barnes | 2009 | 8 |
| Salvador Dalí | 1989 | 7 |
| Edward Gorey | 2000 | 5 |
| Zhang Daqian | 1983 | 3 |
| Huang Junbi | 1991 | 2 |
| Ya Ming (Ye Jiabing) | 2002 | 2 |
| Pablo Picasso | 1973 | 2 |
| Zhao Shao'ang | 1998 | 2 |
| Thierry Van Quickenborne | unknown | 2 |
| Zhao Shao'ang (Chao Shao-an) | 1998 | 2 |
| Wang Ran (王然) | unknown | 1 |
| Song Yuming (宋玉明) | unknown | 1 |
| Unknown (signature possibly Huang Binhong) | unknown | 1 |
| Yang Shanshen | 2004 | 1 |
| He Baili | unknown | 1 |
| Huang Zhou | 1997 | 1 |
| Unverified; signed 賓虹 (Huang Binhong) | unknown | 1 |
| Liu Haisu | 1994 | 1 |
| He Baili (Paklee Ho) | unknown | 1 |
| Huang Junbi (Huang Chun-pi) | 1991 | 1 |
| Bai Xueshi | 2011 | 1 |
| Luo Ming | 1998 | 1 |
| Song Wenzhi | 1999 | 1 |
| Andrew Wyeth | 2009 | 1 |
| Chen Da (陳達, style name Xiaozhou 小舟) | unknown | 1 |
| Li Xiongcai (黎雄才) | 2001 | 1 |
| Jiang Zhaohe (蒋兆和) | 1986 | 1 |
| Dong Shouping (董寿平) | 1997 | 1 |
| Lu Yanshao (陆俨少) | 1993 | 1 |
| Tang Binggeng (unverified; signature reads 秉耕) | unknown | 1 |
| Jean Metzinger | 1956 | 1 |
| Tang Yun (唐云) | 1993 | 1 |
| Pu Quan (溥佺) | 1991 | 1 |
| Bai Xueshi (白雪石) | 2011 | 1 |
| Guan Shanyue (关山月) | 2000 | 1 |
| Li Xiongcai | 2001 | 1 |
| Zhao Wangyun | 1977 | 1 |
| Lu Qingyuan (Lo Ching Yuan) | unknown | 1 |
| René Magritte | 1967 | 1 |
| Unknown modern copyist (reproduction after Vincent van Gogh, after Virginie Demont-Breton) | unknown | 1 |

Works marked "unknown" could not be attributed with confidence. All are modern, so they were withdrawn as a precaution.

## Left online pending legal advice

These authors are out of copyright in their non-EU home country but not under the plain German term. Whether Germany applies the EU rule of the shorter term to them is unresolved.

| Artist | Died | Home term ended | Public domain in Germany from | Works |
| --- | --- | --- | --- | --- |
| Kawase Hasui | 1957 | 2007 (Japan) | 2028-01-01 | 103 catalogued, 28 uncatalogued |
| Kawai Gyokudō | 1957 | 2007 (Japan) | 2028-01-01 | 3 catalogued |
| Pu Xian (catalogued as "Pu Xuan") | 1966 | 2016 (China) | 2037-01-01 | 1 catalogued |
| Pu Ru (Pu Xinyu) | 1963 | 2013 (China) | 2034-01-01 | 2 uncatalogued |
| Wu Hufan | 1968 | 2018 (China) | 2039-01-01 | 1 uncatalogued |
| Lui Shou-kwan (Lü Shoukun) | 1975 | 2025 (China) | 2046-01-01 | 1 uncatalogued |

## Also checked

- 311 uncatalogued bucket folders were each classified twice by independent passes, with an adversarial re-check of every "keep" verdict. The two passes disagreed on one folder, and both verdicts led to removal.
- 28 catalogued artists with no death year on record, or a death year of 1955 or later, were checked.
- Catalogued and kept: Pierre Bonnard (died 1947), Yves Tanguy (1955), Huang Binhong (1955).
- Catalogued and kept, unresolved: a portrait of Levitan attributed to Shurygin (1889). The painter's death year could not be found, but the work's date makes public domain very likely.
- Not on the bucket and out of scope: about 1,670 film stills under `assets/` (Ghibli, Shinkai). They are not in `SOURCE_FOLDERS` and were never synced. Running `pnpm assets:shrink --folder <name>` on them would publish them.

## Bucket deletion

_Pending: filled in once the deletion is verified._
