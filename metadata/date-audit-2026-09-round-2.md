# Date accuracy audit, round two

Round one is `date-audit-2026-09.md`. It covered the 103 works whose year came from a weak source.
This round covers three other groups: two serially published plate sets, 168 works whose year looks like an artifact, and copyright exposure for 115 works by artists who died after 1955.

## Published sets

**Audubon, *The Birds of America* (Havell edition).** All 435 plates carried 1827, because the pipeline collapsed their stated range "between 1827 and 1838" to its first year.
They are now dated by issue year in 12 plate bands, stored in `plate-set-dates.json`. That changed 405 years. The file records the sources and the caveats.
Two bands rest on inference rather than a printed imprint: 1827 (plates 1–30) and 1831 (plates 101–130).

**Haeckel, *Kunstformen der Natur*.** All 100 plates stay at 1904. Each plate's issue number (Lieferung) is documented, but no citable source gives the year of each issue.
Commons, Wikidata and the title page of the collected 1904 volume all state 1904. The plate numbers are in each record's `credit` field, not the filename, so a per-plate schedule can be joined in later if one is found.

## Round years and lifespan leaks

168 works were flagged. Either the year was a round century or half-century, or it equalled the artist's birth or death year.

| verdict | n |
| --- | --- |
| confirm | 70 |
| imprecise | 71 |
| change | 13 |
| unverified | 14 |

**70 of 168 (41%) were false positives.**
84 corrections passed the check, and 43 of them move the year. The checker rejected 5 proposals.
All accepted corrections are in `date-overrides.json`, each with its source URL in `_why`.

### A year copied from the artist's lifespan (8)

| Artist | Work | Was | Now | As the source words it | Conf. |
| --- | --- | --- | --- | --- | --- |
| Benjamin West | Francis Osborne | 1820 | 1769 | circa 1769 | medium |
| Claude Monet | The Dinner | 1926 | 1868 | 1868/69 | high |
| Claude Monet | Vase of Tulips | 1926 | 1885 | 1885 | high |
| George Frederic Watts | Ellen Terry | 1904 | 1864 | 1864 | high |
| Paul de Vos | Still Life with Servant | 1678 | 1655 | hacia 1650-1660 | medium |
| Peter Paul Rubens | Four Studies of a Head of a Moor | 1640 | 1615 | circa 1614-1616 | medium |
| Peter Paul Rubens | Pierre Paul RUBENS | 1640 | 1633 | ca. 1633 | medium |
| Tsukioka Yoshitoshi | Cassia-tree moon | 1892 | 1886 | March 1886 | medium |

### A century marker read as a year (5)

| Artist | Work | Was | Now | As the source words it | Conf. |
| --- | --- | --- | --- | --- | --- |
| Joachim Patinir | St Christopher Bearing the Christ Child | 1550 | 1520 | first half of the 16th century | medium |
| John Atkinson Grimshaw | Boar Lane | 1850 | 1881 | 1881 | high |
| Paul de Vos | Triumphant Cupid among Emplems of Art and War | 1650 | 1645 | 1645–1650 | medium |
| Qian Xuan | Early Autumn | 1250 | 1280 | 13th century | medium |
| Suzuki Harunobu | Woman Admiring Plum Blossoms at Night | 1750 | 1766 | ca. 1766 | high |

### One year applied to a whole series (4)

| Artist | Work | Was | Now | As the source words it | Conf. |
| --- | --- | --- | --- | --- | --- |
| Martin Schongauer | St. Martin | 1470 | 1480 | 1470–1491 | medium |
| Martin Schongauer | The Madonna and Child in the Courtyard | 1470 | 1474 | ca. 1474 | medium |
| Martin Schongauer | Ornament with Owl Mocked by Day Birds | 1470 | 1480 | 1470–1491 | medium |
| Tsukioka Yoshitoshi | The moon on Musashi Plain | 1892 | 1891 | 1891 | medium |

### A stated range collapsed to one year (24)

| Artist | Work | Was | Now | As the source words it | Conf. |
| --- | --- | --- | --- | --- | --- |
| Adolph von Menzel | Frederick the Great Playing the Flute at Sanssouci | 1850 | 1852 | between 1850 and 1852 | high |
| Emperor Huizong of Song | Finches and Bamboo | 1100 | 1113 | early 12th century | high |
| Gilbert Stuart | John Adams | 1800 | 1807 | c. 1800/1815 | medium |
| Giuseppe Bartolomeo Chiari | Susannah and the Elders | 1700 | 1713 | between circa 1700 and circa 1727 | medium |
| Gustav Bauernfeind | At the Dome of the Rock and the Fountain of Qayt Bay | 1900 | 1895 | signed and dated lower left: G. Bauernfeind M 95 | high |
| Gustave Doré | Gustave Doré-Mont Sainte-Odile avec mur païen | 1883 | 1879 | 4e quart 19e siècle | medium |
| Hieronymus Bosch | Death and the Miser | 1500 | 1487 | c. 1485/1490 | medium |
| Ivan Aivazovsky | Буря над Евпаторией Айвазовский | 1900 | 1861 | 1861 | medium |
| Jacques-Louis David | Jaques-louis david comte | 1825 | 1816 | 1816 | high |
| Jean-Honoré Fragonard | The See-Saw | 1750 | 1751 | ca. 1750 - 1752 | high |
| Martin Schongauer | Saint John on Patmos | 1470 | 1480 | 1470–1491 | medium |
| Martin Schongauer | The Third Wise Virgin | 1470 | 1480 | 1470–1491 | medium |
| Martin Schongauer | Wild Woman Holding a Shield with a Lion's Head | 1470 | 1480 | 1470–1491 | medium |
| Martin Schongauer | A Foolish Virgin in Half-Figure | 1470 | 1480 | 1470–1491 | medium |
| Martin Schongauer | Death of the Virgin | 1470 | 1472 | 1470–74 | high |
| Martin Schongauer | Griffin | 1470 | 1480 | 1470–91 | medium |
| Ohara Koson | Blauwe irissen | 1900 | 1915 | 1900 - 1930 | medium |
| Paul Gauguin | Mother and daughter | 1900 | 1901 | 1901 or 1902 | high |
| Peter Paul Rubens | Bust of Pseudo-Seneca | 1600 | 1613 | 1600–1626 | medium |
| Peter Paul Rubens | English: The Feast of Herod | 1600 | 1636 | circa 1635–1638 | high |
| Rembrandt van Rijn | The Man with the Golden Helmet | 1650 | 1655 | 1650/60 | medium |
| Sebastiano Ricci | Diana and Her Dog | 1700 | 1717 | between 1717 and 1720 | high |
| Utagawa Kunisada | Snow Scene | 1800 | 1830 | 1830–1839 | high |
| Valentin Serov | Portrait of Princess Zinaida Yusupova | 1900 | 1902 | 1902 | high |

### Datable only to a range (1)

| Artist | Work | Was | Now | As the source words it | Conf. |
| --- | --- | --- | --- | --- | --- |
| Edgar Degas | Dancers | 1900 | 1899 | ca. 1899 | medium |

### Other (1)

| Artist | Work | Was | Now | As the source words it | Conf. |
| --- | --- | --- | --- | --- | --- |
| Jean-Auguste-Dominique Ingres | Oedipus and the Sphinx | 1800 | 1808 | 1808 | high |

41 more corrections keep the same year. They pin a year that came from a range, so the record now carries the source's own wording.

## Left unverified

| Artist | Work | Year kept | Reason |
| --- | --- | --- | --- |
| Claude Monet | dahlias | 1926 | The Commons Artwork template's date field is {{other date|before|1926}} — a terminus ante quem derived from Monet's death, not an inception — and the source field is a bare wikiart.org artist URL. The |
| Kanae Yamamoto | Dutch girl in landscape | 1946 | The Commons Artwork template's date field is {{other date|before|1946}} — a copyright terminus tied to Yamamoto's death year, not an inception — and there is no wikidata, institution or accession fiel |
| Peter Paul Rubens | Madonna and Child | 1650 | The Commons file page's description section is a bare {{Artwork}} with no parameters at all — no date, no institution, no accession — plus a PD-Art licence tag and two categories. Wikidata Q119926800  |
| Claude Monet | Dahlias | 1926 | The 1926 is not a creation date at all. The Commons Artwork template's date field is literally {{otherdate|by|1926}} — "by 1926", a terminus ante quem manufactured from Monet's death year, which is ex |
| Giorgio de Chirico | The Disquieting Muses | 1950 | Could not settle which object this reproduction shows. The Commons file page (File:Giorgio de Chirico - Les muses inquiétantes.jpg) does give "1950" in its date field, but its only source is https://g |
| Peter Paul Rubens | Man in a Ruff | 1700 | The Commons file page carries no date to read: I fetched the raw wikitext and the entire description section is a bare {{Artwork}} with no parameters at all, followed by {{PD-Art|PD-old-auto-expired|d |
| Giovanni Battista Cimaroli | View of the Brenta | 1750 | Rejected on review:  REJECTED. The cited source does not state the proposed year. I opened the Met API record for accession 1975.1.91, which is the right object. It gives objectDate 'late 18th century |
| Viktor Vasnetsov | Спящая царевна | 1900 | Rejected on review:  REJECTED. The cited ru.wikipedia article loads, and its infobox and text do say 1926 ('Картина была закончена в 1926 году'). Wikidata Q19973633 also has P571 1926. But 1926 is Vas |
| Rudolf Ernst | Rudolf Ernst After Prayers | 1932 | The current 1932 is demonstrably not a creation date: the Commons Artwork template's date field is {{other date|by|1932}} — "by 1932" — which is a copyright-safety upper bound derived from Ernst's dea |
| Sebastiano Ricci | Figure Studies | 1659 | No source anywhere states a creation date for this sheet. The Commons Artwork template's |date= is {{other date|between|1659|1734}} — which is Sebastiano Ricci's birth and death years verbatim, i.e. a |
| Ogata Kōrin | KorinsScreen | 1700 | Rejected on review:  REJECTED: I could not confirm that the file shows the object the source describes. Wikidata Q33162756 does say '18. century' for Korin's Waves at Matsushima at the MFA Boston (11. |
| Suzuki Harunobu | Harunobu 2 Pers | 1750 | Rejected on review:  REJECTED. The cited source is the Wikipedia article on Suzuki Harunobu, not a page about this work. It gives the 1765 origin of nishiki-e and his 1765-1770 print output, but it do |
| Claude Monet | Monet w1558 | 1900 | I read the Commons file page's raw wikitext (https://commons.wikimedia.org/w/index.php?title=File:Monet_w1558.jpg&action=raw): it is a bare {{Information}} template with no Artwork date/inception at a |
| Peter Paul Rubens | Woman with a Mirror | 1640 | Rejected on review:  REJECTED as a date-only change, because the proposed year fails the lifespan check. The source itself is sound. I fetched the Kassel page (altemeister.museum-kassel.de/33828/). It |

## Copyright exposure

> **Open item.** No works were removed and no licences were changed. Deciding what to take down is the operator's call.

Commit `e13f642` (2026-05-31) regenerated `collection-of-beauty.json` and dropped every `pd_status` stamp. Before that commit the file held 77 `uraa_restricted` stamps, and `keepEntry()` in build-data excludes works with that stamp.
Today the file holds none, and nothing runs `mark-copyright-status.mjs`. **50 of those 77 works are live now, and every one serves full-size downloads.**

The old filter cannot simply be restored. `mark-copyright-status.mjs` stamped any work dated 1931 or later, so a bad date produced a bad stamp. Rubens, Monet and Dong Yuan are on the list for that reason alone. Each work needs its own check.

| Artist | Live works previously stamped `uraa_restricted` |
| --- | --- |
| Kawase Hasui | 10 |
| Hiroshi Yoshida | 7 |
| Grant Wood | 5 |
| Tsuchiya Kōitsu | 4 |
| Kanae Yamamoto | 4 |
| Kasamatsu Shirō | 3 |
| Claude Monet | 2 |
| Edward Hopper | 2 |
| John Byam Liston Shaw | 2 |
| Dong Yuan | 1 |
| Nishikawa Sukenobu | 1 |
| Takahashi Shōtei | 1 |
| Rudolf Ernst | 1 |
| Ohara Koson | 1 |
| Yamakawa Shūhō | 1 |
| Pu Xuan | 1 |
| Elizabeth Keith | 1 |
| Yves Tanguy | 1 |
| Eugene de Blaas | 1 |
| Peter Paul Rubens | 1 |

### Per-artist findings for the six artists who died after 1955


#### Before the per-artist findings: two corrections to the brief

**1. None of the six artists is marked `public_domain_worldwide` in the db.** In `scripts/artists-db.json`:
- Picasso and Hopper are `copyrighted`.
- Kawase Hasui, Kawai Gyokudō, Torii Kotondo and Kasamatsu Shirō are `public_domain_in_most_jurisdictions`.

Nothing in the build or the site reads that field. Each work's "Public domain" / "CC0" label comes from its Commons licence tag (`copyright.copyrighted` / `license_short`). The footer says "All works shown are in the public domain or openly licensed", and the download panel offers full resolution. The db flag has no effect, whether it is right or wrong.

**2. A copyright filter used to exist, and it was lost on 2026-05-31.**
- `scripts/mark-copyright-status.mjs` stamps `pd_status: "uraa_restricted"` on Japanese-artist works dated 1931 or later, and on any work dated 1931 or later.
- `keepEntry()` in `scripts/build-data.mjs:927` drops those works.
- Commit `e13f642` ("ingest: add 512 works from collection-of-beauty-2 batch") regenerated `metadata/collection-of-beauty.json` without those stamps. Today 0 of 3,701 entries carry `pd_status`, so the filter drops nothing. No package script runs `mark-copyright-status.mjs`.
- At `e13f642^`, `src/data/artworks.json` held only three works by these six artists: Night Shadows and the two Kotondo prints.
- Works that were stamped then and are published now: Nighthawks, Morning Sun, 10 Hasui prints from 1931 or later, and all 3 Kasamatsu prints. The Old Guitarist was stamped `copyrighted` and is also published now.
- The same lost filter re-admitted works by artists outside this audit. At `e13f642^` these were stamped `uraa_restricted` and are live now: Hiroshi Yoshida 7, Grant Wood 5, Tsuchiya Kōitsu 4, Yamamoto Kanae 4, Elizabeth Keith 1, Yves Tanguy 1, Takahashi Shōtei 1, among others. I did not investigate them.

The operator is in Germany (per `src/app/imprint/page.tsx`), so German/EU law is the most directly relevant. The US matters because Commons and most reuse run through US rules.

---

#### Kasamatsu Shirō: the claim does not hold anywhere (3 works)

- **Death:** 14 June 1991.
  - Wikidata Q3482366 (no references on the statement).
  - Art Institute of Chicago records give "1898–1991".
  - The Ota Memorial Museum held a "没後30年記念" (30th anniversary of his death) exhibition.
- **Works:** 1932, 1934 and 1937, all published by Watanabe Shōzaburō. All three are Rijksmuseum uploads with CC0 on Commons.
- **Japan:** He died after 1967, so the 2018 extension applies. Protected until the end of 2061.
- **EU / Germany:** Life+70, and Japan's term is no shorter. Protected until the end of 2061.
- **US:** Published abroad between 1931 and 1977, and still protected in Japan on 1 Jan 1996, so US copyright was restored. The term is 95 years from publication:
  - 1932 print: PD 1 Jan 2028
  - 1934 print: PD 1 Jan 2030
  - 1937 print: PD 1 Jan 2033
- **Rijksmuseum's "Copyright: Publiek domein" is mistaken**, and so is the CC0 on the Commons files. A museum cannot waive a copyright it does not own. AIC marks his works `is_public_domain: false`.
- **Verdict: wrong.** These works are in copyright in Japan, the EU and the US. The db's `public_domain_in_most_jurisdictions` is wrong, and so is the site's "CC0" label. The old filter excluded all three.

#### Torii Kotondo: PD in the US only (2 works)

- **Death:** 13 July 1976.
  - NDL Authorities give "鳥居, 言人, 1900-1976".
  - Wikidata Q11674932.
  - AIC gives "Japanese, 1900-1976".
- **Works:** Kamisuki (1929) and Woman Before a Mirror (1930), both Walters Art Museum images.
- **Japan:** Life+50 would have run to the end of 2026. He was still protected on 30 Dec 2018, so the term became life+70. Protected until the end of 2046.
- **EU / Germany:** Protected until the end of 2046. Even countries with life+50 keep him protected until the end of 2026.
- **US:** Both prints were published before 1931, so they are PD.
- **The Commons tag is wrong.** It is `{{Walters Art Museum license|type=2D|PD-Japan}}`, and PD-Japan does not apply to an artist who died in 1976. The Walters record lists him only as "active 1st half 20th century", which is probably where the tag came from. AIC marks Kamisuki `is_public_domain: false`.
- **Verdict: wrong as "most jurisdictions".** The honest status is PD in the US only; copyrighted in Japan and the EU until 2046. Both works are affected. The old filter would not have caught them, because both are dated before 1931.

#### Pablo Picasso: PD in the US only (1 work)

- **Death:** 8 April 1973. Wikidata Q5593 (23 references); AIC gives 1881–1973.
- **Work:** The Old Guitarist, late 1903 to early 1904, AIC 28067.
- **US:** PD. AIC's own publication history lists a reproduction in *The Sun* on 14 March 1915 and in the AIC Annual Report in 1926, both before 1931. English Wikipedia hosts the image locally with `{{PD-US-expired-abroad|out_of_copyright_in=2054}}`.
- **Spain:** He died before 7 Dec 1987, so the fourth transitional provision of the Spanish Intellectual Property Law gives life+80. Protected until the end of 2053.
- **France / Germany / rest of the EU:** Life+70. Protected until the end of 2043.
- **Japan:** Protected until the end of 2043.
- **Commons and AIC agree it is not free outside the US.**
  - Commons deleted its copy on 2026-06-19 as a "Copyright violation", citing the en.wiki tag. The catalogue's `commonsUrl` now points to a deleted file.
  - AIC's API returns `is_public_domain: false` with "© Estate of Pablo Picasso / Artists Rights Society (ARS), New York".
- **Verdict:** The db's `copyrighted` is right in effect. The site's "Public domain" label holds in the US only.

#### Edward Hopper: at best US-only, and 1 of 3 is unverified even there (3 works)

- **Death:** 15 May 1967. Wikidata Q203401 (15 references); AIC gives 1882–1967.
- **EU / Germany:** Life+70, protected until the end of 2037. For a German operator the rule of the shorter term does not help. The 1892 US–Germany treaty requires national treatment, so US works get the full German term (COMMUNIA, 2024).

Per work:
- **Night Shadows (1922):** PD in the US. Published in *Shadowland* in October 1922, before 1931; Commons tags it `PD-1923`. Copyrighted in Germany until 2037.
- **Nighthawks (1942):** PD in the US only on a non-renewal theory, and that theory is contested.
  - The Commons file cites a former AIC page ("Copyright Law: Publishing Art and the Public Domain"). That page says the painting is PD in the US because copyright was not renewed after publication in AIC's 1942 annual-exhibition catalogue.
  - Commons kept the file at a 2013 deletion request with "No consensus to delete".
  - AIC's current API returns `is_public_domain: false`.
- **Morning Sun (c. 1952):** Unverified even in the US.
  - The Commons tag is `{{PD-Art|PD-old-auto-1964|deathyear=1967}}`. That template assumes publication before 1964 without renewal. The file page gives no publication or renewal evidence.
  - The image is a visitor's phone photo.
  - If the painting counts as unpublished before 1978, US copyright runs until at least 2038.
- **Verdict:** The db's `copyrighted` is right in effect. Honest labels: Night Shadows is PD in the US only; Nighthawks is PD in the US only, contested; Morning Sun is unverified. None is PD in Germany or the EU.

#### Kawase Hasui: defensible for 92 works, not for 10–11 from 1931 or later (103 works)

- **Death:** 7 November 1957.
  - Tobunken's obituary entry from the Nihon Bijutsu Nenkan (東文研アーカイブデータベース 8828).
  - Wikidata Q344166.
  - AIC gives 1883–1957.
- **Japan:** PD. The term expired at the end of 2007, and the 2018 extension does not revive expired terms (Agency for Cultural Affairs Q&A).
- **EU / Germany:** PD by the rule of the shorter term. Term Directive 2006/116/EC Art. 7(1) limits a third-country author's work to its home-country term. No treaty exception exists for Japan.
- **US, works published before 1931:** PD.
- **US, works published 1931 or later:** Copyright was restored (still protected in Japan on 1 Jan 1996). The term is 95 years from publication.

Affected works, dated 1931 or later in the catalogue (11):

| Catalogue year | Works | US public domain from |
|---|---|---|
| 1931 | NDL S06, Shinagawa, Snow in Mukojima | 1 Jan 2027 |
| 1933 | NDL S0806, S0807, S0812 | 1 Jan 2029 |
| 1940 | Evening at Tagonoura | 2036 |
| 1952 | Heirin-ji | 2048 |
| 1953 | Snow over Zojoji Temple | 2049 |
| 1953 | Kyōto Daigoku-den | see note |
| 1957 | Konjikidō in Snow, Hiraizumi | 2053 |

- **Kyōto Daigoku-den:** Its Commons page dates it 大正11年出版 (published 1922), and the catalogue's `commonsUrl` misspells the filename. If 1922 is right, it is PD in the US and the real count is 10. I changed no dates.
- **CC0 tags:** Three "Aichi Prefectural Museum of Art" uploads (1931, 1940, 1952) are tagged CC0, which cannot waive Hasui's US copyright.
- **Commons tags on the pre-1931 works:** Most use `PD-art-two|PD-Japan|PD-old-60-expired` with no US tag. The US basis (published before 1931) still holds.
- AIC marks even his 1921 prints `is_public_domain: false`. AIC applies a life-based rule, so that flag does not decide US status.
- **Verdict:** `public_domain_in_most_jurisdictions` is defensible for the pre-1931 works, and arguably close to worldwide. It is **wrong for the 10–11 works from 1931 or later**, which are copyrighted in the US. Accuracy of the year is what decides each work's status.

#### Kawai Gyokudō: defensible (3 works)

- **Death:** 30 June 1957.
  - Tobunken obituary entry 8857.
  - Wikidata Q3194330.
- **Works:** Futsuka Zuki (1907) and Parting Spring (1916, two files). Both are MOMAT paintings. Parting Spring was shown at the 10th Bunten and is an Important Cultural Property (文化遺産オンライン).
- **Japan:** PD since the end of 2007.
- **EU / Germany:** PD by the rule of the shorter term.
- **US:** PD if a reproduction was published before 1931. That is plausible for a Bunten exhibit, but I did not verify it. If the paintings count as unpublished, US status would turn on first-publication dates I could not establish. The Commons tags carry no US tag.
- **Verdict:** `public_domain_in_most_jurisdictions` is **defensible**. Affected works: 0 confirmed; US status of all 3 is unverified.

---

#### Summary

| Artist | Died | db flag | Honest status | Works affected |
|---|---|---|---|---|
| Kasamatsu Shirō | 1991 | most jurisdictions | Copyrighted in Japan, EU and US (US PD 2028–2033) | 3 of 3 |
| Torii Kotondo | 1976 | most jurisdictions | PD in US only; copyrighted in Japan and EU until 2046 | 2 of 2 |
| Pablo Picasso | 1973 | copyrighted | PD in US only; Spain until 2053, rest of EU until 2043 | 1 of 1 |
| Edward Hopper | 1967 | copyrighted | Best case PD in US only; copyrighted in Germany/EU until 2037 | 3 of 3 (Morning Sun unverified even in US) |
| Kawase Hasui | 1957 | most jurisdictions | PD for pre-1931 works; 1931+ copyrighted in US | 10–11 of 103 |
| Kawai Gyokudō | 1957 | most jurisdictions | Defensible; US publication unverified | 0 confirmed (3 US-unverified) |

#### Sources
- Wikidata entities (P570 and P7763): [Q3482366](https://www.wikidata.org/wiki/Q3482366), [Q11674932](https://www.wikidata.org/wiki/Q11674932), [Q5593](https://www.wikidata.org/wiki/Q5593), [Q203401](https://www.wikidata.org/wiki/Q203401), [Q344166](https://www.wikidata.org/wiki/Q344166), [Q3194330](https://www.wikidata.org/wiki/Q3194330)
- Tobunken obituaries: [Hasui](https://www.tobunken.go.jp/materials/bukko/8828.html), [Gyokudō](https://www.tobunken.go.jp/materials/bukko/8857.html)
- Death years, other: [NDL Authorities, Kotondo](https://id.ndl.go.jp/auth/ndlna/00824930); [Ota Memorial Museum, Kasamatsu](https://www.ukiyoe-ota-muse.jp/kasamatsu-shiro-the-last-shin-hanga-prints-artist/)
- Art Institute of Chicago API records: [artworks/28067](https://api.artic.edu/api/v1/artworks/28067), [artworks/111628](https://api.artic.edu/api/v1/artworks/111628), [artworks/5392](https://api.artic.edu/api/v1/artworks/5392), plus artwork search results for Kasamatsu and Hasui
- Commons file pages and logs: licence templates for all 115 files, fetched through the API; the [Nighthawks deletion request](https://commons.wikimedia.org/wiki/Commons:Deletion_requests/File:Nighthawks_by_Edward_Hopper_1942.jpg); the deletion log for File:Old guitarist.jpg (2026-06-19)
- [en.wikipedia File:Old_guitarist_chicago.jpg](https://en.wikipedia.org/wiki/File:Old_guitarist_chicago.jpg)
- Japan: [Agency for Cultural Affairs, term-extension Q&A](https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/kantaiheiyo_chosakuken/1411890.html)
- EU: [Directive 2006/116/EC, Art. 1 and 7](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32006L0116)
- Germany: [COMMUNIA on the 1892 US–Germany treaty](https://communia-association.org/2024/09/02/how-mickey-mouse-entered-the-public-domain-in-2024-but-not-in-germany/)
- US: [Cornell public-domain chart, updated 1 Jan 2026](https://guides.library.cornell.edu/copyright/publicdomain)
- Spain: [Real Decreto Legislativo 1/1996, fourth transitional provision](https://noticias.juridicas.com/external/nj_masterunizar/rdleg1-1996.html)
- Parting Spring: [文化遺産オンライン](https://online.bunka.go.jp/heritages/detail/27124)

Repo files checked: `scripts/artists-db.json`, `scripts/mark-copyright-status.mjs`, `scripts/build-data.mjs`, `metadata/collection-of-beauty.json`, `src/app/layout.tsx`, `src/app/imprint/page.tsx`. Per-work Commons licence data: `(per-work Commons licence data, not archived)`. No project files were edited.

## Still unaudited

- About 2,150 works take their year from Wikidata (`wikidata_qs`). Neither round examined them unless a heuristic flagged them.
- 246 works carry no year.
- The extractor changes proposed in round one are not implemented. Until they are, new ingests will produce the same artifacts, and each correction must go into an override file.
