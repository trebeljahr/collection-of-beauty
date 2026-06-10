# Date Audit Report

## Summary

- Total candidates flagged: 286
- Wikidata-resolved fixes: 37
- Agent-researched proposals: 185 (119 real year-changes + 65 confirmed-correct + 1 inconclusive null-out)
- False positives (Wikidata or research agrees with current year): 129 (64 Wikidata, 65 agent-researched)
- Real fixes total: 156 (37 Wikidata + 119 agent year-changes)

Heuristic counts (from candidates-enriched.json flags):

- year-equals-artist-birth: 89
- year-before-artist-turned-8: 94
- date-created-is-upload-timestamp: 94
- filename-year-mismatch: 97
- year-before-artist-born: 1
- year-after-artist-died: 6

(Each candidate may be flagged by more than one heuristic; counts sum to more than 286.)

Confidence breakdown across the 156 real fixes:

- High: 112 (23 Wikidata precision >= 9 + 89 agent high)
- Medium: 33 (9 Wikidata precision 8 + 24 agent medium)
- Low / inconclusive: 12 (5 Wikidata precision <= 7 + 5 agent low + 2 agent inconclusive)

## High-confidence fixes

Wikidata records with precision >= 9 (year or month) AND yearChange === true, plus agent-researched proposals with confidence "high". Sorted by artist, then current year.

| ID (short tail) | Artist | Title | Current year | Proposed year | Proposed date string | Source | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| albert-gleizes-1914-woman-with-animals-... | Albert Gleizes | Woman with animals | 1914 | 1914 | February 1914 | curator-descriptions + commons (1914 paintings) | False positive flag — Gleizes finished the canvas Feb 1914, shown Salon des Indépendants spring 1914. |
| sir-anthony-van-dyck-charles-i-1600-49-google-art-project | Anthony van Dyck | Charles I | 1635 | 1635 | 1635 | commons.wikimedia.org/wiki/File:Sir_Anthony_Van_Dyck_-_Charles_I_(1600-49) | Commons earliest_date 1635, latest "Before June 1636"; "1600" in filename is sitter's birth. |
| pinacoteca-querini-stampalia-angelo-maria-querini-bartolomeo-nazari | Bartolomeo Nazari | Angelo Maria Querini | 1740 | 1740 | c. 1740 | commons + curator-descriptions | Commons "after 1726" terminus; curator dates portrait c. 1740, after sitter's 1727 cardinal elevation. |
| benjamin-west-1738-1820-the-departure-of-regulus-rcin-405416 | Benjamin West | The Departure of Regulus | 1769 | 1769 | 1769 | en.wikipedia.org/wiki/Benjamin_West | West's first commission for George III, 1769, RCIN 405416. False positive — 1738/1820 is West's lifespan. |
| benjamin-west-1738-1820-the-oath-of-hannibal-rcin-405417 | Benjamin West | The Oath of Hannibal | 1770 | 1770 | 1770 | commons.wikimedia.org/wiki/File:Benjamin_West_(1738-1820)_-_The_Oath_of_Hannibal | Commons Date 1770; pendant to The Departure of Regulus for George III. |
| benjamin-west-1738-1820-sir-joseph-banks-1743-1820-1st-bt-gcb-prs-lcnug-1989-9-usher-gallery | Benjamin West | Sir Joseph Banks | 1771 | 1771 | between 1771 and 1772 | commons + curator-descriptions | Commons Date "between 1771 and 1772"; painted after Banks's return from Cook's first Pacific voyage. |
| benjamin-west-1738-1820-the-death-of-chevalier-bayard-rcin-407525 | Benjamin West | The Death of Chevalier Bayard | 1772 | 1772 | 1772 | curator-descriptions.json | West painted for George III in 1772; RCIN 407525, Royal Collection. False positive on filename lifespan. |
| benjamin-west-1738-1820-the-wife-of-arminius-brought-captive-to-germanicus-rcin-405683 | Benjamin West | The Wife of Arminius brought captive to Germanicus | 1773 | 1773 | 1773 | curator-descriptions.json | Painted 1773 for George III's Windsor history series; RCIN 405683. |
| benjamin-west-1738-1820-george-iv-when-prince-of-wales-with-frederick... | Benjamin West | George IV, when Prince of Wales, with Frederick, Duke of York | 1777 | 1777 | 1777 | curator-descriptions + commons category | Commons category "George, Prince of Wales in 1777"; sitters' ages match 1777. |
| benjamin-west-1738-1820-the-institution-of-the-order-of-the-garter-rcin-407521 | Benjamin West | The Institution of the Order of the Garter | 1787 | 1787 | 1787 | commons.wikimedia.org/wiki/File:Benjamin_West_(1738-1820)_-_The_Institution_of_the_Order_of_the_Garter | Commons Artwork template Date 1787; George III Windsor commission. |
| benjamin-west-1738-1820-edward-iii-crossing-the-somme-rcin-404566 | Benjamin West | Edward III Crossing the Somme | 1788 | 1788 | 1788 | curator-descriptions.json | Painted 1788, Windsor history cycle for George III, RCIN 404566. |
| benjamin-west-1738-1820-edward-iii-with-the-black-prince-after-the-battle-of-crecy-rcin-407523 | Benjamin West | Edward III with the Black Prince after the Battle of Crécy | 1788 | 1788 | 1788 | commons + curator-descriptions | Commons Date 1788; Windsor Audience Chamber cycle, RCIN 407523. |
| benjamin-west-1738-1820-the-burghers-of-calais-rcin-404927 | Benjamin West | The Burghers of Calais | 1789 | 1789 | 1789 | commons.wikimedia.org/wiki/File:Benjamin_West_(1738-1820)_-_The_Burghers_of_Calais | Commons Date 1789; RCIN 404927, Royal Collection. |
| narcissus-caravaggio-1594-96-edited | Caravaggio | Narcissus | 1600 | 1597 | c. 1597–1599 | en.wikipedia.org/wiki/Narcissus_(Caravaggio) | Wikipedia infobox 1597–1599; early Roman period under Cardinal del Monte. |
| bellows-cliffdwellers | George Bellows | Cliff Dwellers | 1913 | 1913 | May 1913 | commons.wikimedia.org/wiki/File:Bellows_CliffDwellers | Commons date 1913-05; curator confirms May 1913 for Pennsylvania Academy Spring Exhibition. |
| gilbert-stuart-1755-1828-john-philip-kemble-npg-49-national-portrait-gallery | Gilbert Stuart | John Philip Kemble | 1785 | 1785 | 1785 | curator-descriptions.json | Painted 1785 around Kemble's London Hamlet debut; NPG 49. False positive on artist lifespan filename. |
| gilbert-stuart-1755-1828-sarah-siddons-nee-kemble-npg-50-national-portrait-gallery | Gilbert Stuart | Sarah Siddons | 1787 | 1787 | 1787 | commons + curator-descriptions | Commons Date 1787; NPG 50, Stuart's London period. |
| gilbert-stuart-george-washington-lansdowne-portrait-google-art-project | Gilbert Stuart | George Washington (Lansdowne) | 1796 | 1796 | April 12, 1796 | commons.wikimedia.org/wiki/File:Gilbert_Stuart_-_George_Washington_(Lansdowne_Portrait) | Commons pretty_display_date "April 12, 1796"; earliest=latest=1796. |
| gilbert-stuart-george-washington-the-athenaeum-portrait-google-art-project | Gilbert Stuart | George Washington (Athenaeum) | 1796 | 1796 | 1796 | commons + curator-descriptions | Commons earliest=latest=1796; curator confirms 12 April 1796 start. |
| col-tempo-by-giorgione | Giorgione | Col tempo | 1506 | 1506 | c. 1506 | curator-descriptions + commons | Curator confirms c. 1506 Accademia attribution; Giorgione died 1510. |
| starry-night-over-the-rhone | Vincent van Gogh | Starry Night Over the Rhône | 1888 | 1888 | September 1888 | commons.wikimedia.org/wiki/File:Starry_Night_Over_the_Rhone | Commons Artwork date 1888-09 Arles; Van Gogh letter to Theo 28 Sep 1888. |
| vincent-willem-van-gogh-128 | Vincent van Gogh | Still Life: Vase with Twelve Sunflowers | 1888 | 1888 | August 1888 | commons.wikimedia.org/wiki/File:Vincent_Willem_van_Gogh_128 | Commons date 1888-08; F.456/JH.1561 Munich Sunflowers, Arles August 1888. |
| vincent-van-gogh-0013 | Vincent van Gogh | The Painter on His Way to Work | 1888 | 1888 | July 1888 | commons.wikimedia.org/wiki/File:Vincent_Van_Gogh_0013 | Commons Date July 1888, Arles; F448/JH1491, destroyed 1945 Magdeburg fire. |
| carnegiemuseumofvincentgoghafterrain | Vincent van Gogh | Wheat Fields after the Rain | 1890 | 1890 | July 1890 | en.wikipedia.org/wiki/Wheat_Fields_(Van_Gogh_series) | Painted July 1890 in Auvers-sur-Oise, just before Van Gogh's death. |
| el-tres-de-mayo-by-francisco-de-goya-from-prado-thin-black-margin | Francisco Goya | El Tres de Mayo | null | 1814 | 1814 | commons.wikimedia.org/wiki/File:El_Tres_de_Mayo_(Prado) | Commons Year field "In 1814"; commissioned by Spanish provisional government, painted six years after the event. |
| francis-picabia-1911-12-paysage-a-cassis | Francis Picabia | Paysage à Cassis | 1911 | 1911 | December 1911 | commons + curator-descriptions | Commons date 1911-12; brief Fauve-derived phase pre-1912 Section d'Or Cubism. |
| francois-boucher-1703-1770-landscape-with-a-watermill-ng6374-national-gallery | François Boucher | Landscape with a Watermill | 1755 | 1755 | 1755 | commons + curator-descriptions | Commons Date 1755; signed-and-dated by Boucher. NG6374. |
| venice-aristotele-by-francesco-hayez-in-gallerie-accademia-venice | Francesco Hayez | Aristotele | 1811 | 1811 | 1811 | wikidata Q66023532 + commons + curator | Wikidata inception 1811; Gallerie dell'Accademia Venice; Hayez Venetian Accademia training. |
| francesco-hayez-incontro-di-giobbe-ed-esau-1844 | Francesco Hayez | Incontro di Giacobbe ed Esaù | 1844 | 1844 | 1844 | it.wikipedia.org/wiki/Francesco_Hayez | Italian Wikipedia: "Incontro di Giacobbe ed Esaù (1844)"; Pinacoteca Tosio-Martinengo, Brescia. |
| portret-van-willem-ii-1626-50-prins-van-oranje-en-zijn-echtgenote-maria-stuart-1631-60-rijksmuseum | Gerard van Honthorst | Portret van Willem II | 1647 | 1647 | 1647 | rijksmuseum.nl/en/collection/SK-A-871 | Rijksmuseum SK-A-871, Dating 1647; filename numbers are sitters' lifespan dates. |
| frederik-hendrik-1584-1647-prins-van-oranje-atelier-of-gerard-van-honthorst-1650 | Workshop of Gerard van Honthorst | Frederik Hendrik | 1650 | 1650 | 1650 | commons + Rijksmuseum SK-A-178 | Commons Date 1650; posthumous workshop replica (Frederik Hendrik d. 1647) to pair with Amalia van Solms portrait. |
| gherardo-delle-notti-adoration-of-the-child | Gerard van Honthorst | Adoration of the Child | 1619 | 1619 | c. 1619–1620 | commons + curator-descriptions | Commons "Painted ca. 1619-1620"; Uffizi panel, source of the "Gherardo delle Notti" nickname. |
| musee-de-capodimonte-le-greco-portrait-de-giulio-clovio-en-1571-572-01 | El Greco | Portrait of Giulio Clovio | 1571 | 1571 | c. 1571–72 | en.wikipedia.org/wiki/Portrait_of_Giulio_Clovio | Wikipedia c. 1571; Capodimonte dating; El Greco Roman period. |
| cardinal-fernando-nino-de-guevara-1541-1609-met-dt854 | El Greco | Portrait of a Cardinal | 1600 | 1600 | c. 1600 | commons.wikimedia.org/wiki/File:Cardinal_Fernando_Niño_de_Guevara | Commons {{other date|~|1600}}; Met dates ca. 1600. False positive on sitter lifespan. |
| el-greco-domenikos-theotokopoulos-saint-jerome-c-1610-1614-nga-12204 | El Greco | Saint Jerome | 1610 | 1610 | c. 1610/1614 | commons.wikimedia.org/wiki/File:El_Greco_-_Saint_Jerome_NGA_12204 | Commons Date "c. 1610/1614"; NGA accession 1943.7.6. |
| john-singer-sargent-atlas-and-the-hesperides-1922-1925 | John Singer Sargent | Atlas and the Hesperides | 1922 | 1922 | c. 1922–1925 | commons.wikimedia.org/wiki/File:John_Singer_Sargent_-_Atlas_and_the_Hesperides | Commons "between circa 1922 and circa 1925"; MFA Boston rotunda mural, completed near Sargent's April 1925 death. |
| john-singleton-copley-mrs-benjamin-pickman-mary-toppan-1744-1817-1966-79-3-yale-university-art-gall | John Singleton Copley | Mrs. Benjamin Pickman | 1763 | 1763 | 1763 | commons.wikimedia.org/wiki/File:John_Singleton_Copley_-_Mrs._Benjamin_Pickman | Commons categorizes 1763; pre-Revolutionary Boston portrait. False positive on sitter lifespan. |
| john-singleton-copley-testa-di-negro-1777-78-ca-cropped | John Singleton Copley | Head of a Negro (study for Watson and the Shark) | 1777 | 1777 | 1777–78 | commons + curator-descriptions | Commons "Head of a Negro, 1777 or 1778"; preparatory study for Watson and the Shark exhibited RA 1778. |
| john-singleton-copley-1738-1815-the-surrender-of-the-dutch-admiral-de-winter-to-admiral-duncan-at-t | John Singleton Copley | The Surrender of the Dutch Admiral de Winter to Admiral Duncan | 1799 | 1799 | 1799 | commons + en.wikipedia.org/wiki/John_Singleton_Copley | Commons Date 1799; commemorative canvas of 11 October 1797 Battle of Camperdown. |
| james-abbott-mcneill-whistler-rotherhithe-etching-1860-dallas-museum-of-art | James McNeill Whistler | Rotherhithe | 1860 | 1860 | 1860 | commons.wikimedia.org/wiki/File:James_Abbott_McNeill_Whistler,_Rotherhithe | Commons description states 1860 completion; Wedmore 66 in Thames Set. |
| joachim-wtewael-portrait-of-christina-wtewael-van-halen-1568-1629-google-art-project | Joachim Wtewael | Portrait of Christina Wtewael van Halen | 1601 | 1601 | 1601 | commons.wikimedia.org/wiki/File:Joachim_Wtewael_-_Portrait_of_Christina_Wtewael_van_Halen | Commons earliest_date = pretty_display = 1601; "1568-1629" is sitter lifespan. |
| harlech-castle-from-tygwyn-ferry-summer-s-evening-twilig | J. M. W. Turner | Harlech Castle | null | 1799 | 1799 | en.wikipedia.org/wiki/List_of_paintings_by_J._M._W._Turner | Wikipedia Turner list: 1799, 87×119.4 cm, Yale Center for British Art. |
| juan-gris-1915-nature-morte-a-la-nappe-a-carreaux-still-life-with-checked-tablecloth-... | Juan Gris | Nature morte à la nappe à carreaux | 1915 | 1915 | March 1915 | commons.wikimedia.org/wiki/File:Juan_Gris,_1915,_Nature_morte_a_la_nappe_a_carreaux | Commons Artwork date 1915-03; Synthetic Cubism period. |
| ohara-koson-gatto-e-vasca-con-pesci-rossi-1933-xilografia-colorata | Ohara Koson | Cat and Bowl with Goldfish | 1933 | 1933 | 1933 | commons.wikimedia.org/wiki/File:Ohara_koson,_gatto_e_vasca_con_pesci_rossi | Commons Art photo template date 1933; within Koson's lifespan (1877–1945). |
| death-of-the-virgin-met-dp819968 | Martin Schongauer | Death of the Virgin | 1450 | 1470 | c. 1470–75 | en.wikipedia.org/wiki/Martin_Schongauer | Schongauer engravings undated; museum consensus c. 1470–75. Current 1450 = birth year. |
| griffin-met-dp820017 | Martin Schongauer | Griffin | 1450 | 1470 | 1470–91 | collectionapi.metmuseum.org/.../336196 | Met objectDate "1470–91"; accession 27.54.5. |
| ornament-with-owl-mocked-by-day-birds-met-dp820025 | Martin Schongauer | Ornament with Owl Mocked by Day Birds | 1450 | 1470 | 1470–1491 | collectionapi.metmuseum.org/.../336197 | Met objectDate "1470–1491"; Schongauer's death year as endpoint. |
| saint-john-on-patmos-met-dp819993 | Martin Schongauer | Saint John on Patmos | 1450 | 1470 | 1470–1491 | collectionapi.metmuseum.org/.../336161 | Met accession 40.8.2, objectDate 1470–1491. |
| st-martin-met-dp820015 | Martin Schongauer | St. Martin | 1450 | 1470 | 1470–1491 | collectionapi.metmuseum.org/.../367020 | Met accession 22.10.1; Petit Palais impression refines to 1475–1480. |
| the-madonna-and-child-in-the-courtyard-met-dp819972 | Martin Schongauer | The Madonna and Child in the Courtyard | 1450 | 1470 | 1470–1491 | collectionapi.metmuseum.org/.../367005 | Met Date 1470–1491; engravings produced from c. 1469 onward. |
| the-third-wise-virgin-met-dp820013 | Martin Schongauer | The Third Wise Virgin | 1450 | 1470 | 1470–1491 | collectionapi.metmuseum.org/.../367026 | Met objectDate 1470–1491 (accession 40.8.3). |
| wild-woman-holding-a-shield-with-a-lion-s-head-met-mm47655 | Martin Schongauer | Wild Woman Holding a Shield with a Lion's Head | 1450 | 1470 | 1470–1491 | collectionapi.metmuseum.org/.../367034 | Met objectDate 1470–1491 (accession 28.26.9). |
| robert-delaunay-rythmes-1934 | Robert Delaunay | Rhythms | 1934 | 1934 | 1934 | commons + curator-descriptions + en.wikipedia.org/wiki/Robert_Delaunay | Commons Date "1934 ; 2014-11-09"; Wikipedia and curator confirm 1934 late Rythmes cycle, Centre Pompidou. |
| sarah-goodridge-elizabeth-greenleaf-parsons-1758-1829-1956-63-fogg-museum | Sarah Goodridge | Elizabeth Greenleaf Parsons | 1820 | 1820 | 1820 | commons.wikimedia.org/wiki/File:Sarah_Goodridge_-_Elizabeth_Greenleaf_Parsons | Commons Date 1820; Fogg Museum 1956.63. "1758-1829" is sitter's lifespan. |
| rain-at-kofukuji-temple-5759571352 | Tsuchiya Kōitsu | Rain at Kofukuji Temple | 1937 | 1937 | June 1937 | commons.wikimedia.org/wiki/File:Rain_at_Kofukuji_Temple | Commons date 1937-06; categories "1937 paintings", "1937 in Nara". |
| het-drijvende-paviljoen-te-katada-in-de-sneeuw-yuki-no-katada-ukimido-titel-op-object-ak-mak-1636 | Tsuchiya Kōitsu | Het drijvende paviljoen te Katada in de sneeuw | 1934 | 1934 | March 1934 | commons.wikimedia.org/wiki/File:Het_drijvende_paviljoen_te_Katada | Commons Datering "mar-1934"; published by Watanabe Shōzaburō. "1636" is Rijksmuseum accession. |
| akashi-strand-akashi-no-hama-titel-op-object-ak-mak-1637 | Tsuchiya Kōitsu | Akashi strand Akashi no hama | 1957 | 1934 | 1934 | fujiarts.com + scriptum.com + asianartscollection.com | Multiple dealer/archive listings date original design 1934 (Watanabe Shōzaburō). 1957 "na" is later impression; Kōitsu died 1949. |
| bamboo-grove-5759026915 | Hiroshi Yoshida | Bamboo Grove | 1939 | 1939 | 1939 | commons.wikimedia.org/wiki/File:Bamboo_Grove | Commons date "1939, digital img 2011-05-25"; San Diego Museum of Art. |
| duchess-of-polignac-by-e-vigee-lebrun-1787-atheneum | Élisabeth Louise Vigée Le Brun | Yolande-Martine-Gabrielle de Polastron | 1782 | 1782 | 1782 | commons + en.wikipedia.org/wiki/Yolande_de_Polastron | Commons Information template Date 1782; Versailles MV 8971. Filename "1787" is uploader error. |
| vigee-lebrun-elisabeth-louise-charles-alexandre-de-calonne-1734-1802-google-art-project | Élisabeth Louise Vigée Le Brun | Portrait of Charles-Alexandre de Calonne | 1784 | 1784 | 1784 | commons.wikimedia.org/wiki/File:Vigée-Lebrun_-_Charles-Alexandre_de_Calonne | Commons earliest=latest=1784; "1734-1802" is sitter Calonne's lifespan. |
| three-sisters-by-yamakawa-shuho-1898-1944-painted-screen-1936-honolulu-museum-of-art-02 | Yamakawa Shūhō | Three Sisters | 1936 | 1936 | Showa 11 (1936) | commons.wikimedia.org/wiki/File:Three_Sisters_by_Yamakawa_Shuho | Commons Artwork date Showa 11 (1936); Honolulu MoA acc. 11822.1. |
| bakst-uhzin1902 | Léon Bakst | Dinner | 1902 | 1902 | 1902 | en.wikipedia.org/wiki/Léon_Bakst | Wikipedia: "Dinner, 1902, oil on canvas, 150 × 100 cm; Russian Museum." |
| negro-boy-by-l-bakst-1910-magma | Léon Bakst | Negro boy | 1950 | 1910 | 1910 | commons + curator-descriptions | Commons template date 1910; MAGMA collection, Ballets Russes period. 1950 implausible (Bakst d. 1924). |
| philipp-otto-runge-pedro-sobre-el-mar | Philipp Otto Runge | Peter on the sea | 1806 | 1806 | July 1806 | wikidata.org/wiki/Q2081033 | Wikidata P571 = July 1806; Hamburger Kunsthalle inv. 1007. |
| katsushika-hokusai-1760-1849-in-de-paarden-was-waterval-1835 | Katsushika Hokusai | The Yoshitsune Horse-Washing Falls at Yoshino | 1760 | 1835 | 1835 | commons + curator-descriptions | Hokusai's "A Tour of the Waterfalls" series, c. 1832–1835. 1760 was artist's birth year. |
| katsushika-hokusai-tempesta-sotto-la-vetta-dalla-serie-delle-36-vedute-del-monte-fuji-1831-ca | Katsushika Hokusai | Rainstorm Beneath the Summit (Sanka Hakuu) | 1831 | 1831 | c. 1831 | commons + en.wikipedia.org/wiki/Thirty-six_Views_of_Mount_Fuji | 36 Views of Mt Fuji c. 1830–1832; filename "1831 ca." matches. |
| besneeuwde-ochtend-in-koishikawa-rijksmuseum-ak-mak-1588 | Katsushika Hokusai | Koishikawa in the Morning after a Snowfall | 1830 | 1830 | c. 1830-1835 | commons.wikimedia.org/wiki/File:Besneeuwde_ochtend_in_Koishikawa | Commons date "circa 1830-1835"; Rijksmuseum AK-MAK-1588. |
| a-colored-version-of-the-big-wave-from-100-views-of-the-fuji-2nd-volume | Katsushika Hokusai | A colored version of the Big wave (Fugaku Hyakkei vol. 2) | 1850 | 1835 | 1835 | en.wikipedia.org/wiki/One_Hundred_Views_of_Mount_Fuji | Vol. 2 of 100 Views of Mt Fuji published 1835; original 1850 impossible (Hokusai d. 1849). |
| hokusai-manga-01 | Katsushika Hokusai | Hokusai Manga 01 | 1850 | 1814 | 1814 | en.wikipedia.org/wiki/Hokusai_Manga | Volume 1 published 1814 when artist was 55; 1850 impossible (Hokusai d. 1849). |
| sokokura-by-hiroshige1 | Utagawa Hiroshige | Sokokura, from Seven Hot Springs of Hakone | 1852 | 1852 | 1852 | commons.wikimedia.org/wiki/File:Sokokura_by_Hiroshige1 | MFA Boston source; Seven Hot Springs of Hakone series, 1852. |
| 13-50-sl1-general-use | William Merritt Chase | Studio Interior | 1849 | 1882 | c. 1882 | commons (Brooklyn Museum 13.50) | Brooklyn Museum date ca. 1882; current 1849 was artist's birth year. Confidence inherited from agent (medium) but museum source treated as high. |
| arabian-nights-3-by-john-frederick-lewis | John Frederick Lewis | An Armenian lady, Cairo | 1804 | 1855 | 1855 | commons category "1855 paintings by John Frederick Lewis" + en.wikipedia.org/wiki/John_Frederick_Lewis | Categorized in 1855 paintings; Wikipedia confirms "An Armenian lady, Cairo" 1855 oil on panel. |
| edgar-degas-1834-1917-the-bath-woman-supporting-her-back-pastel-on-paper-c-1887 | Edgar Degas | The Bath: Woman Scrubbing her Back | 1887 | 1887 | c. 1887 | commons.wikimedia.org/wiki/File:Edgar_Degas_-_The_Bath_pastel | Commons {{other date|ca|1887}}; Honolulu Museum of Art. False positive — 1834-1917 in filename is Degas's lifespan. |
| p-1948-sc-276-scaled-aspect-ratio-16-9-3-scaled | Claude Monet | (P.1948.SC.276 — Antibes/Esterel landscape) | 1888 | 1888 | 1888 | commons.wikimedia.org/wiki/File:P.1948.SC.276 | Commons Date 8 August 1888; Wildenstein W1192, 1888 Antibes/Esterel campaign. "1948" is accession number. |
| the-luncheon-by-claude-monet-stadel-frankfurt-am-main-germany-2017 | Claude Monet | The Luncheon (Städel Museum) | 1868 | 1868 | 1868 | commons.wikimedia.org/wiki/File:The_Luncheon_by_Claude_Monet_-_Städel | Commons "1868 ; 2017-07-12"; category "The Luncheon (1868) by Claude Monet". |
| monet-w472 | Claude Monet | Bouquet de glaïeuls | 1840 | 1878 | 1878 | wikidata Q123171204 | Wikidata P571 = 1878; settlement at Vétheuil 1878. Current 1840 was Monet's DOB. |
| monet-w159 | Claude Monet | Camille sitting on the beach at Trouville | 1840 | 1870 | 1870 | curator-descriptions + Wildenstein W.159 | Curator: "summer of 1870" Trouville honeymoon; sand reportedly in paint. |
| monet-w429 | Claude Monet | Evening at Argenteuil | 1840 | 1876 | 1876 | commons.wikimedia.org/wiki/File:Monet_w429 + Wildenstein | Commons categorizes "1876 landscape paintings from France"; Argenteuil 1876 group. |
| monet-w109 | Claude Monet | The Jetty at Le Havre | 1840 | 1868 | 1868 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W109 = "The Jetty at Le Havre", 1868, 147 × 226 cm. |
| monet-w148 | Claude Monet | Road at Louveciennes, Melting Snow, Sunset | 1840 | 1869 | 1869 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.148 = "Road at Louveciennes, Melting Snow, Sunset", 1869. |
| monet-w1725 | Claude Monet | Nymphéas (Water Lilies), W.1725 | 1840 | 1908 | 1908 | commons category + en.wikipedia.org/wiki/Water_Lilies_(Monet_series) | Wikipedia Water Lilies table: W.1725 = 1908; Commons "Water Lilies (1908)". |
| monet-w1786 | Claude Monet | Nymphéas (Water Lilies) W.1786 | 1840 | 1914 | 1914–1917 | en.wikipedia.org/wiki/Water_Lilies_(Monet_series) | Wikipedia table: W.1786 = "Water-Lilies, 1914–1917, private, 130×150 cm". |
| monet-w182 | Claude Monet | Windmills at Zaandam | 1840 | 1871 | 1871 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.182 = "Windmills at Zaandam" 1871, Netherlands trip. |
| monet-w1884 | Claude Monet | Le Bassin aux nymphéas (Water Lily Pond) | 1840 | 1918 | 1918 | commons category Wildenstein 1884 | "w1884" is catalogue number not year; Commons "Der Seerosenteich 1918" Hasso Plattner Collection. |
| monet-w197 | Claude Monet | Argenteuil, seen from the Small Arm of the Seine | 1840 | 1872 | 1872 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.197 = "Argenteuil, seen from the Small Arm of the Seine" 1872. |
| monet-w222 | Claude Monet | The Promenade at Argenteuil | 1840 | 1872 | 1872 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.222 = "The Promenade at Argenteuil" 1872, 53×73 cm. |
| monet-w265 | Claude Monet | Sailing at Sainte-Adresse | 1840 | 1873 | 1873 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.265 = "Sailing at Sainte-Adresse" 1873, 48×74 cm. |
| monet-w357 | Claude Monet | Monet w357 (Argenteuil snowscape) | 1840 | 1875 | 1875 | commons categories + curator-descriptions | Commons "1875 landscape paintings from France"; curator: "outdoor canvas from 1875". |
| monet-w368 | Claude Monet | Monet w368 | 1840 | 1875 | 1875 | commons categories | Commons "1875 marine paintings", "1875 paintings from France". |
| monet-w386 | Claude Monet | Monet w386 | 1840 | 1875 | 1875 | commons + curator-descriptions | Commons "1875 landscape paintings"; curator: "garden or riverbank motif from 1875". |
| monet-w397 | Claude Monet | Monet w397 (Argenteuil reflections) | 1840 | 1876 | 1876 | commons.wikimedia.org/wiki/File:Monet_w397 | Commons "1876 landscape paintings", Argenteuil; curator: "year of second Impressionist exhibition". |
| monet-w419 | Claude Monet | Coin de l'étang à Montgeron | 1840 | 1876 | 1876 | commons categories | Commons "1876 landscape paintings"; Hoschedé Montgeron decorative-panels commission. |
| monet-w502 | Claude Monet | Vétheuil (W502) | 1840 | 1878 | 1878 | commons.wikimedia.org/wiki/File:Monet_w502 | Commons "1878 landscape paintings", "Vétheuil by Claude Monet"; Monet moved to Vétheuil 1878. |
| monet-w58 | Claude Monet | Path in the Forest | 1840 | 1865 | 1865 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.58 = "Path in the Forest" 1865, 79×58 cm, Sammlung Rau für UNICEF. |
| monet-w601 | Claude Monet | The Small Arm of the Seine at Vetheuil | 1840 | 1880 | 1880 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.601 = "The Small Arm of the Seine at Vetheuil" 1880; bracketed by W.600/W.602 also 1880. |
| monet-w649 | Claude Monet | Monet w649 (Fécamp cliff) | 1840 | 1881 | 1881 | commons category "Paintings of Fécamp" | W644-W658 all 1881 Fécamp scenes; curator: "1881 season Vetheuil and the coast". |
| monet-w653 | Claude Monet | Cliff at Grainval near Fécamp | 1840 | 1881 | 1881 | commons + curator-descriptions | Commons "1881 landscape paintings from France"; curator: "1881 Vetheuil-to-coast season". |
| monet-w658 | Claude Monet | Monet w658 | 1840 | 1881 | 1881 | commons category + curator-descriptions | Commons "Paintings of Fécamp" alongside W644-W656a (all 1881); curator states 1881. |
| monet-w662 | Claude Monet | Marine Pourville | 1840 | 1881 | 1881 | commons category + curator-descriptions | Commons: "Marine Pourville (1881)... Abbaye de Flaran (W662)". |
| monet-w663 | Claude Monet | A Stormy Sea (Mer agitée) | 1840 | 1884 | c. 1884 | wikidata Q59504767 | Wikidata P571 = +1884, qualifier circa; NGC accession 4636 (1946). |
| monet-w664 | Claude Monet | Cliffs of Les Petites-Dalles | 1840 | 1881 | 1881 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.664 = "Cliffs of Les Petites-Dalles" 1881, 60×74 cm. |
| monet-w668 | Claude Monet | Vetheuil at Sunset | 1840 | 1881 | 1881 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.668 = "Vetheuil at Sunset" 1881, 52×62 cm. |
| monet-w679 | Claude Monet | Landscape on the Île Saint-Martin | 1840 | 1881 | 1881 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W679 = "Landscape on the Ile Saint Martin" 1881. |
| monet-w683 | Claude Monet | Monet w683 (Vétheuil sunflower garden) | 1840 | 1881 | 1881 | commons categories + curator-descriptions | Commons "Sunflowers by Claude Monet", "Vétheuil by Claude Monet"; curator: "1881". |
| monet-w691 | Claude Monet | The Garden Gate | 1840 | 1881 | 1881 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.691 = "The Garden Gate" 1881, 73×60 cm. |
| monet-w706 | Claude Monet | Monet w706 | 1840 | 1882 | 1882 | curator-descriptions + commons categories | Curator: 1882, Poissy + Normandy coast; Commons Dieppe + Normandie. |
| monet-w717 | Claude Monet | Monet w717 | 1840 | 1882 | 1882 | commons.wikimedia.org/wiki/File:Monet_w717 | Commons "1882 landscape paintings"; Pourville/Normandy. |
| monet-w724 | Claude Monet | Monet w724 | 1840 | 1882 | 1882 | curator-descriptions + commons + Wildenstein | Curator: "1882 Normandy season, Pourville–Poissy"; Commons Dieppe/Normandie. |
| monet-w736 | Claude Monet | The Customs Officer's Cottage, Varengeville | 1840 | 1882 | 1882 | en.wikipedia.org/wiki/Varengeville-sur-Mer + curator | Wikipedia cites "La maison du douanier de Varengeville 1882"; 1882 Pourville/Varengeville campaign. |
| monet-w757 | Claude Monet | Monet w757 | 1840 | 1882 | 1882 | commons.wikimedia.org/wiki/File:Monet_w757 | Commons "1880s paintings by Claude Monet", "Pourville by Claude Monet"; Staatsgalerie Stuttgart. |
| monet-w764 | Claude Monet | Pourville | 1840 | 1882 | 1882 | commons category + curator-descriptions | Commons: "Pourville (1882) Claude Monet (W 764)"; 1882 Normandy campaign. |
| monet-w772 | Claude Monet | Monet w772 (Étretat seascape) | 1840 | 1882 | 1882 | curator-descriptions + commons categories | Curator: "1882 campaign, cliffs cropped tight"; Commons "Paintings of Étretat by Claude Monet". |
| monet-w776 | Claude Monet | Monet w776 | 1840 | 1882 | 1882 | commons.wikimedia.org/wiki/File:Monet_w776 | Commons "1882 landscape paintings"; "Pourville by Claude Monet". |
| monet-w778a | Claude Monet | The Pointe de l'Ailly, low tide (variant) | 1840 | 1882 | 1882 | Wildenstein catalogue lookup | W778 = "La Pointe de l'Ailly, marée basse" 1882; "a" suffix denotes variant from same campaign. |
| monet-w787 | Claude Monet | Monet w787 (Pourville cliffs at dawn) | 1840 | 1882 | 1882 | commons category | Commons "Pourville by Claude Monet" identifies W787 as "Seashore and Cliffs of Pourville in the Morning (1882)", Tokyo Fuji Art Museum. |
| monet-w807 | Claude Monet | Beach in Pourville | 1840 | 1882 | 1882 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.807 = "Beach in Pourville" 1882, National Museum, Poznań. |
| monet-w835 | Claude Monet | Monet w835 (Port-Villez) | 1840 | 1883 | 1883 | commons category + curator-descriptions | Commons "Paintings of the Seine in Port-Villez"; adjacent W836 dated 1883; curator: 1883. |
| monet-w867 | Claude Monet | Monet w867 (Maison du jardinier / Bordighera) | 1840 | 1884 | 1884 | commons category | Commons "Maison du jardinier (W867) 1884"; Mediterranean Bordighera trip. |
| monet-w868 | Claude Monet | Olive trees study, Bordighera | 1840 | 1884 | 1884 | en.wikipedia.org/wiki/Claude_Monet | Bordighera Jan 18 – Apr 5, 1884; 38 Bordighera paintings including olive trees study. |
| monet-w885 | Claude Monet | Monet w885 (Dolceacqua) | 1840 | 1884 | 1884 | commons category "Italy by Claude Monet" + Wildenstein | Commons "Italy by Claude Monet", "Dolceacqua"; 1884 Riviera trip. |
| monet-w891a | Claude Monet | Monet w891a (Riviera) | 1840 | 1884 | 1884 | curator-descriptions.json | Curator: "1884 sojourn in Bordighera and Menton". |
| monet-w891b | Claude Monet | Monet w891b (Monaco) | 1840 | 1884 | 1884 | commons categories + en.wikipedia.org/wiki/Claude_Monet | Commons "Paintings of Monaco"; Monet's only Mediterranean campaign was 1884. |
| monet-w892 | Claude Monet | Monte Carlo seen from Roquebrune | 1840 | 1884 | 1884 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.892 = "Monte Carlo seen from Roquebrune" 1884, Portland Museum of Art. |
| monet-w81 | Claude Monet | Monet w81 (Ferme Saint-Siméon winter) | 1840 | 1867 | 1867 | commons category + adjacent W.82 dated 1867 | Honfleur winter campaign 1866–67; W.82 documented 1867. |
| 35390682010-46099096b2-o-w1449 | Claude Monet | The Customs House (La Cabane du douanier) | null | 1897 | 1897 | flickr (gandalfsgallery) + commons category | Flickr source dates 1897, 65×92 cm; W1462–W1471 cluster all 1897 Normandy. |
| claude-monet-sailing-boat-evening-effect | Claude Monet | Sailing Boat, Evening Effect | null | 1885 | 1885 | commons.wikimedia.org/wiki/File:Claude_Monet_-_Sailing_Boat,_Evening_Effect | Commons description "Sailing Boat, Evening Effect (1885)... Musée Marmottan Monet"; W.1027. |
| monet-w-290-autumn-effect-in-argenteuil | Claude Monet | Autumn Effect at Argenteuil | null | 1873 | 1873 | courtauld.ac.uk/highlights/autumn-effect-at-argenteuil | Courtauld: "Autumn Effect at Argenteuil, 1873"; W.290. |
| monet-w-763-the-path | Claude Monet | Le chemin creux (The Hollow Path) | null | 1882 | 1882 | commons.wikimedia.org/wiki/File:Le_chemin_creux_(1882)_W_763 | Commons date 1882; signed "Claude Monet 82". |
| monet-w0145 | Claude Monet | Snow at Sunset (W.145) | null | 1869 | 1869 | commons.wikimedia.org/wiki/File:Monet_w0145 | Commons "1869 paintings by Claude Monet"; W.145 = "Snow at Sunset". |
| monet-w1010 | Claude Monet | La Falaise d'Amont | null | 1885 | 1885 | commons category "Paintings of Étretat by Claude Monet" | Commons identifies W1010 = "La Falaise d'Amont (1885)"; Monet's 1885 Étretat campaign. |
| monet-w1018 | Claude Monet | The Rock Needle and the Porte d'Aval | null | 1885 | 1885 | commons.wikimedia.org/wiki/File:Monet_w1018 | Commons "Falaise d'Aval, Etretat in art"; W1014-W1018 in 1885 Étretat sequence. |
| monet-w1032 | Claude Monet | Sailboats off the Aiguille | null | 1885 | 1885 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.1032 = "Sailboats off the Aiguille" 1885, 65×81 cm; 1885 Étretat (Hôtel Blanquet). |
| monet-w1048 | Claude Monet | Falaise et Porte d'Amont, mer agitée | null | 1885 | 1885 | commons.wikimedia.org/wiki/File:Monet_w1048 | Surrounding Wildenstein numbers (W.1011, W.1028, W.1034, W.1041) all 1885 Étretat per Wikidata. |
| monet-w1245 | Claude Monet | Effect of Spring at Giverny (W.1245) | null | 1890 | 1890 | commons categories | Commons "1890 landscape paintings from France", "1890s paintings by Claude Monet". |
| monet-w1656 | Claude Monet | Le bassin des nymphéas (nuages) | null | 1903 | 1903 | en.wikipedia.org/wiki/Water_Lilies_(Monet_series) | Wikipedia: W.1656 = "Water-Lilies, Clouds" 1903 (cluster W.1656-W.1660 all 1903). |
| monet-w1726 | Claude Monet | Water Lilies (W.1726) | null | 1908 | 1908 | commons category | Adjacent W.1724, W.1725, W.1727 all explicitly 1908 on Commons; 1908 Nymphéas exhibited Durand-Ruel 1909. |
| monet-w224 | Claude Monet | Argenteuil, Late Afternoon | null | 1872 | 1872 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.224 = "Argenteuil, Late Afternoon" 1872; adjacent W.223/225 also 1872. |
| monet-w421 | Claude Monet | Monet w421 (Montgeron train) | null | 1877 | 1877 | commons.wikimedia.org/wiki/File:Monet_w421 | Commons "1877 paintings from France"; W421 in 1877 Montgeron series (Hoschedé). |
| monet-w526 | Claude Monet | Landscape. Vétheuil | null | 1879 | 1879 | en.wikipedia.org/wiki/List_of_paintings_by_Claude_Monet | Wikipedia: W.526 = "Landscape. Vétheuil" 1879, Musée d'Orsay. |
| monet-w871 | Claude Monet | Study of Olive Trees in Bordighera (W.871) | null | 1884 | 1884 | commons category "Bordighera by Claude Monet" | Commons: "Olive trees study, 1884 - Claude Monet"; Bordighera Jan–Apr 1884. |
| monet-w875 | Claude Monet | Palm Trees at Bordighera | null | 1884 | 1884 | commons + curator-descriptions | Curator: "Palms at Bordighera, painted on Monet's 1884 trip to the Riviera". |
| monet-w928 | Claude Monet | Jonquilles (W.928) | null | 1885 | 1885 | commons.wikimedia.org/wiki/File:Monet_w928 | Commons "1880s paintings by Claude Monet | 1885"; "1885 paintings from France". |
| pm-147978-b-tournai | Claude Monet | La Pointe du Cap Martin | null | 1884 | 1884 | commons.wikimedia.org/wiki/File:PM_147978_B_Tournai | Commons Artwork Date 1884; Musée des Beaux-Arts Tournai; Cap Martin with Renoir. |
| portrait-de-madame-de-verninac-by-david-louvre-rf1942-16-n2 | Jacques-Louis David | Portrait of Madame de Verninac | null | 1799 | 1799 | curator-descriptions.json | David painted 1799, Salon de 1799; Louvre RF 1942-16. "Coyau" was photographer, not painter. |
| the-massacre-of-the-innocents-peter-paul-rubens-unframed | Peter Paul Rubens | The Massacre of the Innocents (Alte Pinakothek) | null | 1636 | 1636–1638 | en.wikipedia.org/wiki/Massacre_of_the_Innocents_(Rubens) | Second version 1636–1638; Alte Pinakothek inv. 572. |
| **Wikidata fixes** | | | | | | | |
| gentileschi-artemisia-esther-before-ahasuerus-c-1628-1635 | Artemisia Gentileschi | Esther before Ahasuerus | 1628 | 1629 | 1629 | wikidata (precision 8) | Wikidata P571 1629-01-01; medium precision (decade-level). |
| claudemonetbanksoftheseine | Claude Monet | Banks of the Seine at Lavacourt | null | 1879 | 1879 | wikidata (precision 9) | Wikidata P571 1879-01-01; high precision. |
| monet-w24 | Claude Monet | Monet w24 | null | 1863 | 1863 | wikidata (precision 9) | Wikidata P571 1863-01-01; high precision. |
| monet-w684 | Claude Monet | Monet w684 | 1840 | 1881 | 1881 | wikidata (precision 9) | Wikidata P571 1881-01-01; current value was Monet's DOB. |
| monet-w694 | Claude Monet | Monet w694 | 1840 | 1881 | 1881 | wikidata (precision 9) | Wikidata P571 1881-01-01; current value was Monet's DOB. |
| monet-w759 | Claude Monet | Monet w759 | 1840 | 1882 | 1882 | wikidata (precision 9) | Wikidata P571 1882-01-01; current value was Monet's DOB. |
| monet-w1883 | Claude Monet | The Water-Lily Pond | 1840 | 1916 | 1916 | wikidata (precision 9) | Wikidata P571 1916-01-01; "1883" was Wildenstein catalogue number. |
| wla-metmuseum-water-lilies-by-claude-monet | Claude Monet | Water Lilies p | 1840 | 1919 | 1919 | wikidata (precision 9) | Wikidata P571 1919-01-01; current value was Monet's DOB. |
| bemberg-fondation-toulouse-self-portrait-paintings-by-henri-fantin-latour | Henri Fantin-Latour | Self-portrait | 1860 | 1861 | 1861 | wikidata (precision 9) | Wikidata P571 1861-01-01; high precision. |
| the-rising-squall-hot-wells-from-st-vincent-s-rock-bristol | J. M. W. Turner | The Rising Squall | 1775 | 1792 | 1792 | wikidata (precision 9) | Wikidata P571 1792-01-01; "1775" was Turner's birth year. |
| joseph-mallord-william-turner-1775-1851-calais-sands-at-low-water-poissards-collecting-bait | J. M. W. Turner | Calais Sands at Low Water | 1832 | 1830 | 1830 | wikidata (precision 9) | Wikidata P571 1830-01-01; high precision. |
| barcelona-lake-lucerne-the-bay-of-uri-from-above-brunnen | J. M. W. Turner | Lake Lucerne; the Bay of Uri | 1841 | 1844 | 1844 | wikidata (precision 9) | Wikidata P571 1844-01-01; high precision. |
| jacob-jordaens-naked-old-man-standing | Jacob Jordaens | Naked old man | 1600 | 1639 | 1639 | wikidata (precision 9) | Wikidata P571 1639-01-01; high precision. |
| katsushika-hokusai-1760-1849-ono-waterval-aan-de-kisokaido-1835 | Katsushika Hokusai | Ono Waterfall on the Kisokaidō | 1760 | 1835 | 1835 | wikidata (precision 9) | Wikidata P571 1835-01-01; "1760" was Hokusai's birth year. |
| katsushika-hokusai-1760-1849-veld-in-de-owari-provincie-1829-33 | Katsushika Hokusai | The Amida Falls (Kisokaidō) | 1760 | 1833 | 1833 | wikidata (precision 9) | Wikidata P571 1833-01-01; "1760" was Hokusai's birth year. |
| peter-paul-rubens-1577-1640-teresa-of-avila-s-vision-of-the-dove-pd-43-1999-fitzwilliam-museum | Peter Paul Rubens | St Teresa of Avila's vision of the dove | 1614 | 1635 | 1635 | wikidata (precision 9) | Wikidata P571 1635-01-01; high precision. |
| 4344-vis-print-14762kopie | Peter Paul Rubens | Study of an Old Woman | 1615 | 1610 | 1610 | wikidata (precision 9) | Wikidata P571 1610-01-01; high precision. |
| peter-paul-rubens-1577-1640-the-bacchanal-776b-gemaldegalerie | Peter Paul Rubens | Drunken Silenus | 1618 | 1619 | 1619 | wikidata (precision 9) | Wikidata P571 1619-01-01; high precision. |
| botticelli-a-virgem-e-o-menino-com-um-anjo | Sandro Botticelli | Madonna and Child with an Angel | 1450 | 1465 | 1465 | wikidata (precision 9) | Wikidata P571 1465-01-01; "1450" was extracted from "15th century" generic date. |
| the-famous-scenes-of-the-sixty-states-55-awa | Utagawa Hiroshige | Awa Province: Naruto Whirlpools | 1855 | 1853 | 1853 | wikidata (precision 9) | Wikidata P571 1853-01-01; high precision. |
| at-eternity-s-gate-vincent-van-gogh | Vincent van Gogh | At Eternity's Gate | null | 1890 | May 1890 | wikidata (precision 10) | Wikidata P571 1890-05-01; month-precision. |
| evening-landscape-at-moonrise-van-gogh | Vincent van Gogh | Evening landscape at moonrise | null | 1889 | July 1889 | wikidata (precision 10) | Wikidata P571 1889-07-01; month-precision. |
| flowering-meadow-with-trees-and-dandelions-vincent-van-gogh | Vincent van Gogh | Flowering meadow with trees and dandelions | null | 1890 | April 1890 | wikidata (precision 10) | Wikidata P571 1890-04-01; month-precision. |
| monet-w1061 | "flicker" (uploader) | Monet w1061 | null | 1886 | 1886 | wikidata (precision 9) | Wikidata P571 1886-01-01; uploader name in artist field needs correction. |

## Medium-confidence fixes

Wikidata records with precision 8 (decade) AND yearChange, plus agent-researched proposals with confidence "medium". Sorted by artist, then current year.

| ID (short tail) | Artist | Title | Current year | Proposed year | Proposed date string | Source | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ma-yuan-dancing-and-singing-peasants-returning-from-work | Ma Yuan | Dancing and Singing | 1160 | 1200 | c. 1200 | TheArtWolf, Museum Without Walls, en.wikipedia.org/wiki/Ma_Yuan_(painter) | Beijing Palace Museum lifespan-range only; secondary sources converge on c. 1200. |
| ca-rezzonico-matrimonio-mistico-di-santa-caterina-inv-236-biagio-pupini-detto-dalle-lame | Biagio Pupini | Matrimonio mistico di Santa Caterina | null | 1530 | c. 1530–1540 | en.wikipedia.org/wiki/Biagio_Pupini | Pupini "active mainly during 1530–1540"; no documented specific year. Low-confidence by agent but listed here as 1530 = start of documented period. |
| peter-paul-rubens-1577-1640-after-hercules-and-the-nemean-lion-wm-1608-1948-apsley-house | after Peter Paul Rubens | Hercules and the Nemean Lion | 1577 | 1639 | c. 1639 (after Rubens's prototype) | wikidata Q106862980 + commons | Rubens prototype c. 1639; copy date unknown. Confidence low per agent. |
| peter-paul-rubens-1577-1640-after-man-in-a-ruff-r-1990-58-23-colchester-and-ipswich-museums-service | after Peter Paul Rubens | Man in a Ruff | 1577 | 1650 | possibly c. 1650–1750 | vads.ac.uk/digital/collection/NIRP/id/36109 | VADS bracket "possibly about 1650 – possibly about 1750"; after Rubens copy. |
| peter-paul-rubens-1577-1640-school-of-the-lamentation-1-op-0049-durham-university | school of Peter Paul Rubens | The Lamentation | 1577 | 1610 | c. 1610–1640 | wikidata Q119940779 + commons | No primary date; school work, plausibly Antwerp studio period 1610–1640. Confidence inconclusive per agent. |
| colonel-john-bullock | Thomas Gainsborough | Colonel John Bullock | 1731 | 1770 | early 1770s | commons + curator-descriptions | Commons "early 1770s"; curator "Bath years". "1731" was sitter Bullock's birth year. |
| hampstead-heath-by-john-constable-watercolour | John Constable | Hampstead Heath | 1776 | 1820 | c. 1820–35 | commons + Constable biography | Constable rented at Hampstead from 1819; Heath cloud studies c. 1820–35. Confidence low per agent. |
| pythagoras-advocating-vegetarianism-1618-20-peter-paul-rubens | Peter Paul Rubens | Pythagoras advocating vegetarianism | 1628 | 1628 | between 1628 and 1630 | commons.wikimedia.org/wiki/File:Pythagoras_advocating_vegetarianism | Commons "between 1628 and 1630"; Royal Collection 403500. Filename "1618-20" is uploader mistake. |
| david-s-leonidas-and-thermoplyae | Jacques-Louis David | David's Leonidas and Thermoplyae | 1826 | 1826 | 1826 | commons.wikimedia.org/wiki/File:David's_Leonidas_and_Thermoplyae | Laugier's 1826 calcographic engraving after David's 1799–1814 Louvre painting. Current year refers to engraving, not painting. |
| barcelona-shipping-1825-30-william-turner-in-tate-britain | J. M. W. Turner | Shipping | 1825 | 1825 | c. 1825–30 | tate.org.uk/art/artworks/turner-shipping-n02879 | Tate: "Shipping, c. 1825–30?". |
| the-mantree-bosch | Hieronymus Bosch | The Tree Man | 1455 | 1500 | c. 1500 | commons.wikimedia.org/wiki/File:The_ManTree_Bosch | Commons "circa 1500"; Albertina inv. 7876; "1455" was Bosch's birth year. |
| kaigetsudo-ando-standing-portrait-of-a-courtesan-c-1705-1710-hanging-scroll-... | Kaigetsudō Ando | Standing Portrait of a Courtesan | 1705 | 1705 | c. 1705–1710 | commons.wikimedia.org/wiki/File:Kaigetsudo_Ando_-_Standing_Portrait | Commons {{other date|circa|1705|1710}}. |
| kim-hong-do-hwaseongpalgyeong | Kim Hong-do | Hwaseongpalgyeong | 1745 | 1796 | c. 1796 | curator-descriptions + en.wikipedia.org/wiki/Hwaseong_Fortress | Curator: documents fortress completed 1796; Kim served Jeongjo's court till 1800. |
| songhamaenghodo | Kim Hong-do | Songhamaenghodo | 1745 | 1780 | c. 1780 | commons + Korean scholarly sources | Late 18th century Jeongjo period; Kang Se-hwang collaboration constrains to before 1791. |
| carl-spitzweg-der-maler-auf-einer-waldlichtung-unter-einem-schirm-liegend | Carl Spitzweg | Der Maler auf einer Waldlichtung | 1850 | 1850 | c. 1850 | commons.wikimedia.org/wiki/File:Carl_Spitzweg | Commons "Ca. 1850"; Joachim Nagel, Carl Spitzweg (Belser 2008). |
| hokusai-manga-02 | Katsushika Hokusai | Hokusai Manga 02 | 1850 | 1815 | 1815 | en.wikipedia.org/wiki/Hokusai_Manga | Volume 2 issued 1815 (vols 1-10 from 1814-1819); 1850 impossible. |
| in-the-water-by-eugen-von-blaas-1843-1931 | Eugene de Blaas | In the Water by Eugen von Blaas | 1843 | 1905 | early 20th century (c. 1905) | commons.wikimedia.org/wiki/File:In_the_Water_by_Eugen_von_Blaas | Commons "early 20th century"; "1843" was artist's birth year. Confidence low per agent. |
| monet-yellow-irises-1917 | Claude Monet | Yellow Irises | 1926 | 1917 | c. 1914–1917 | commons + wikiart.org + curator-descriptions | WikiArt catalogue 1917; curator describes late Giverny iris series 1914–1917; "1926" was death-year placeholder. |
| monet-w1897 | Claude Monet | Le Bassin aux nymphéas (W.1897) | 1897 | 1917 | 1917–19 | commons category + wikidata Q106729777 | "1897" was Wildenstein catalogue number, not year; canvas painted 1917–19 at age 77–79. |
| monet-w1900 | Claude Monet | Le Bassin aux nymphéas (W.1900) | 1900 | 1917 | 1917 (range 1917–1919) | wikidata Q135653073 | Wikidata P571 1917; "1900" was Wildenstein catalogue number. |
| monet-w1976 | Claude Monet | Agapanthus Triptych centre panel | null | 1915 | c. 1915–1926 | clevelandart.org/art/1960.81 + en.wikipedia.org/wiki/Water_Lilies | "1976" is W catalogue number; left panel (Cleveland) dates c. 1915–26; centre = W.1976. |
| monet-w327 | Claude Monet | Monet w327 | 1840 | 1874 | c. 1874 | commons + curator-descriptions + Wildenstein | Commons "1870s paintings", "Argenteuil"; curator "mid-1870s Argenteuil". |
| monet-w752 | Claude Monet | Monet w752 | 1840 | 1882 | 1882 | curator-descriptions + commons + Wildenstein | Curator: "1882, swift confident touch"; W752 in 1882 Normandy sequence. |
| monet-w753 | Claude Monet | Monet w753 | 1840 | 1882 | 1882 | commons category Pourville + curator | W751–W787 uniformly 1882 Pourville/Normandy; curator "early-1880s plein-air practice". |
| monet-w767 | Claude Monet | Monet w767 | 1840 | 1882 | 1882 | commons category "Pourville by Claude Monet" | Adjacent W-numbers (W766, W771) all 1882 Pourville; curator "Normandy production". |
| monet-w1558 | Claude Monet | Waterloo Bridge, Overcast | null | 1900 | 1900–1903 | en.wikipedia.org/wiki/Waterloo_Bridge_(Monet_series) | Series produced 1900–1904; W.1555 = 1900, W.1594 = 1902; observed from Savoy Hotel. Confidence low per agent. |
| monet-w1200 | Claude Monet | Meadow at Giverny, Morning Effect (W.1200) | null | 1888 | 1888 | commons category "Paintings of meadows in Giverny by Claude Monet" | W.1199 = "Meadow at Giverny" 1888 Kreeger Museum; W.1200 shares meadow/morning subject. |
| monet-w922 | Claude Monet | Jonquilles (W.922) | null | 1882 | 1882–85 | Wildenstein lookup | "1882-1885 (W 922). Panneau... salon de Durand-Ruel"; 35 rue de Rome commission. |
| **Wikidata medium-precision fixes** | | | | | | | |
| gentileschi-artemisia-esther-before-ahasuerus-c-1628-1635 | Artemisia Gentileschi | Esther before Ahasuerus | 1628 | 1629 | c. 1629 | wikidata (precision 8) | Wikidata decade-level inception 1629. |
| monet-ice-floes-on-the-seine-at-bougival-1868 | Claude Monet | Glaçons à Bougival | 1926 | 1867 | c. 1867 | wikidata (precision 8) | Wikidata decade-level inception 1867; "1926" was Monet's death year. |
| christ-on-the-cross-peter-paul-rubens-unframed | Peter Paul Rubens | Christ on the Cross | null | 1610 | c. 1610 | wikidata (precision 8) | Wikidata decade-level inception 1610. |
| peter-paul-rubens-1577-1640-christ-giving-the-keys-of-heaven-to-saint-peter-b-116-gemaldegalerie | Peter Paul Rubens | Christ Giving the Keys to St. Peter | 1613 | 1614 | c. 1614 | wikidata (precision 8) | Wikidata decade-level inception 1614. |
| peter-paul-rubens-1577-1640-portrait-of-an-elderly-man-776f-gemaldegalerie | Peter Paul Rubens | Portrait of an Old Man | 1622 | 1623 | c. 1623 | wikidata (precision 8) | Wikidata decade-level inception 1623. |
| peter-paul-rubens-1577-1640-diana-hunting-deer-774-gemaldegalerie | Peter Paul Rubens | Diana on the stag hunt | 1630 | 1632 | c. 1632 | wikidata (precision 8) | Wikidata decade-level inception 1632. |
| peter-paul-rubens-1577-1640-diana-and-two-nymphs-surprised-by-satyrs-while-bathing-762c-gemaldegale | Peter Paul Rubens | Diana and two nymphs surprised by satyrs while bathing | 1635 | 1636 | c. 1636 | wikidata (precision 8) | Wikidata decade-level inception 1636. |
| joseph-mallord-william-turner-1775-1851-the-battle-of-trafalgar-as-seen-from-the-mizen-starboard-sh | J. M. W. Turner | The Battle of Trafalgar | 1806 | 1807 | c. 1807 | wikidata (precision 8) | Wikidata decade-level inception 1807. |
| the-conspiracy-of-the-batavians-under-claudius-civilis-rembrandt-harmensz-van-rijn-nationalmuseum-1 | Rembrandt van Rijn | The Conspiracy of the Batavians under Claudius Civilis | 1597 | 1661 | c. 1661 | wikidata (precision 8) | Wikidata decade-level inception 1661; "1597" was likely a mis-parse. |

## Low-confidence / inconclusive

Agent-researched proposals with confidence "low" or "inconclusive", plus Wikidata records with precision <= 7 (centuries / millennia).

| ID (short tail) | Artist | Title | Current year | Proposed year | Proposed date string | Source | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ca-rezzonico-matrimonio-mistico-di-santa-caterina-inv-236-biagio-pupini-detto-dalle-lame | Biagio Pupini | Matrimonio mistico di Santa Caterina | null | 1530 | c. 1530–1540 | en.wikipedia.org/wiki/Biagio_Pupini | No documented year; Pupini active mainly 1530–1540. Plausible range 1510–1570. |
| peter-paul-rubens-1577-1640-after-hercules-and-the-nemean-lion-wm-1608-1948-apsley-house | after Peter Paul Rubens | Hercules and the Nemean Lion | 1577 | 1639 | c. 1639 (after Rubens's prototype) | wikidata Q106862980 | Apsley House copy date unknown; using Rubens prototype c. 1639 as placeholder. Another "after Rubens" Nemean Lion (Q111712918) is c. 1800. |
| peter-paul-rubens-1577-1640-copy-after-madonna-and-child-pcf48-lady-margaret-hall | (copy after) Peter Paul Rubens | Madonna and Child | 1577 | null | undated | artuk.org/discover/artworks/madonna-and-child-222366 | No execution date on Art UK, Wikidata, Commons, or curator description. Agent recommends nulling year and tagging undated. |
| peter-paul-rubens-1577-1640-after-man-in-a-ruff-r-1990-58-23-colchester-and-ipswich-museums-service | after Peter Paul Rubens | Man in a Ruff | 1577 | 1650 | possibly c. 1650–1750 | vads.ac.uk/digital/collection/NIRP/id/36109 | VADS bracket spans full century; earliest plausible 1650 (~10 years post-Rubens). |
| peter-paul-rubens-1577-1640-school-of-the-lamentation-1-op-0049-durham-university | school of Peter Paul Rubens | The Lamentation | 1577 | 1610 | c. 1610–1640 | wikidata Q119940779 | School work; no documented date; plausibly produced during/after Rubens's Antwerp studio period. |
| hampstead-heath-by-john-constable-watercolour | John Constable | Hampstead Heath | 1776 | 1820 | c. 1820–35 | commons + Constable biography | British Museum source link dead. Constable rented at Hampstead from 1819; cloud studies c. 1820–35. |
| in-the-water-by-eugen-von-blaas-1843-1931 | Eugene de Blaas | In the Water by Eugen von Blaas | 1843 | 1905 | early 20th century (c. 1905) | commons.wikimedia.org/wiki/File:In_the_Water_by_Eugen_von_Blaas | Commons only specifies "early 20th century"; 1905 is midpoint placeholder. Derivative on Commons dated 1914. |
| prado-los-desastres-de-la-guerra-no-04-las-mugeres-dan-valor | Francisco Goya | Disasters of War No. 04 - Las mugeres dan valor | null | 1810 | c. 1810–1815 | es.wikipedia.org/wiki/Los_desastres_de_la_guerra + en.wikipedia.org/wiki/The_Disasters_of_War | Series 1810–1815; Plate 4 in war-scenes group (plates 1–47) conventionally c. 1810–1812. |
| prado-los-desastres-de-la-guerra-no-46-esto-es-malo | Francisco Goya | Disasters of War No. 46 - Esto es malo | null | 1810 | c. 1810–14 | en.wikipedia.org/wiki/The_Disasters_of_War | War-scene plates (1-47) conventionally c. 1810-1814; 1863 publication date ≠ execution. |
| monet-w1558 | Claude Monet | Waterloo Bridge, Overcast | null | 1900 | 1900–1903 | en.wikipedia.org/wiki/Waterloo_Bridge_(Monet_series) | Wildenstein number specific entry not retrievable; bracketed by W.1555 (1900) and W.1594 (1902). |
| **Wikidata low-precision fixes** | | | | | | | |
| peter-paul-rubens-schule-der-lachende-philosoph-demokrit-7043-bavarian-state-painting-collections | Peter Paul Rubens (school) | Der lachende Philosoph | 1577 | 1608 | c. 17th c. (1608 millennium-level) | wikidata (precision 6 - millennium) | Very coarse precision; 1577 was Rubens DOB. |
| peter-paul-rubens-kopie-nach-ecce-homo-1922-bavarian-state-painting-collections | Peter Paul Rubens (copy) | Ecce homo | 1577 | 1608 | c. 17th c. (1608 millennium-level) | wikidata (precision 6 - millennium) | Very coarse precision; 1577 was Rubens DOB. |
| georges-de-la-tour-022 | Georges de La Tour | The Dream of Saint Joseph | 1600 | 1700 | c. 1700 (century-level) | wikidata (precision 7 - century) | Century-level precision only; La Tour died 1652, so 1700 attribution is likely wrong for this object. Verify before applying. |
| ike-taiga-orchids-1975-268-94-metropolitan-museum-of-art | Ike no Taiga | Orchids | 1723 | 1749 | c. 1749 (century-level) | wikidata (precision 7 - century) | Century-level precision; "1723" was likely artist's birth year. |
| joseph-mallord-william-turner-1775-1851-rocky-coast-n05499-national-gallery | J. M. W. Turner | Rocky Coast | 1825 | 1827 | c. 1827 (century-level) | wikidata (precision 7 - century) | Century-level precision; modest year-shift. |

## False positives (heuristic noise)

The following records had their flagged dates confirmed by Wikidata or by agent research — no change is needed.

**Wikidata-confirmed false positives (64):**

- a-foolish-virgin-in-half-figure-met-dp820007 - Martin Schongauer - "A Foolish Virgin in Half-Figure" (1450; Wikidata low confidence agreement, monitor)
- durer-hieronymus-holzschuher-1469-1529-mit-deckel-1526-557e - Albrecht Dürer - "Portrait of Hieronymus Holzschuher" (1526)
- the-lawyer-possibly-ulrich-zasius-1461-1536-humanist-jurist-giuseppe-arcimboldo-nationalmuseum-1589 - Giuseppe Arcimboldo - "The Lawyer" (1566)
- david-with-the-head-of-goliath-caravaggio-1610 - Caravaggio - "David with the Head of Goliath" (1605)
- peter-paul-rubens-1577-1640-neptune-and-amphitrite-776a-gemaldegalerie - Peter Paul Rubens - "Neptune and Amphitrite" (1614)
- peter-paul-rubens-diana-cazadora-1617-1620 - Peter Paul Rubens - "Diana returning from the Hunt" (1617)
- peter-paul-rubens-1577-1640-head-study-of-a-bearded-man-pd-13-1980-fitzwilliam-museum - Peter Paul Rubens - "Head Study of a Bearded Man" (1617)
- portrait-of-a-woman-probably-susanna-lunden-susanna-fourment-1599-1628-met-ep1976-218-r - Peter Paul Rubens - "Portrait of a Woman" (1625)
- rubens-landscape-with-rainbow1632-1635 - Peter Paul Rubens - "Landscape with a Rainbow" (1632)
- judith-and-her-maid-abra-with-the-head-of-holofernes-by-artemisia-gentileschi-ca-1645-1650 - Artemisia Gentileschi - "Judith and her maid Abra with the Head of Holofernes" (1645)
- thomas-gainsborough-1727-1788-commodore-later-vice-admiral-the-honourable-augustus-hervey-1724-1779 - Thomas Gainsborough - "Commodore the Hon. Augustus Hervey" (1767)
- madame-grand-noel-catherine-vorlee-1761-1835-met-dp320094 - Élisabeth Louise Vigée Le Brun - "Madame Grand" (1783)
- thomas-gainsborough-1727-1788-romantic-landscape-with-sheep-at-a-spring-03-1396-royal-academy-of-ar - Thomas Gainsborough - "Romantic Landscape with Sheep at a Spring" (1783)
- joseph-wright-of-derby-1734-1797-a-moonlight-with-a-lighthouse-coast-of-tuscany-n05882-national-gal - Joseph Wright of Derby - "A Moonlight with a Lighthouse" (1789)
- comtesse-de-la-chatre-marie-charlotte-louise-perrette-aglae-bontemps-1762-1848-met-dp320086 - Élisabeth Louise Vigée Le Brun - "Comtesse de la Châtre" (1789)
- elisabeth-vigee-lebrun-portrait-of-lady-hamilton-1761-1815 - Élisabeth Louise Vigée Le Brun - "Portrait of Emma" (1790)
- joseph-mallord-william-turner-1775-1851-buttermere-lake-with-part-of-cromackwater-cumberland-a-show - J. M. W. Turner - "Buttermere Lake" (1798)
- joseph-mallord-william-turner-1775-1851-shipping-by-a-breakwater-n00469-national-gallery - J. M. W. Turner - "Shipping by a Breakwater" (1798)
- joseph-mallord-william-turner-1775-1851-grenoble-seen-from-the-river-drac-with-mont-blanc-in-the-di - J. M. W. Turner - "Grenoble Seen from the River Drac with Mont Blanc in the Distance" (1802)
- joseph-mallord-william-turner-1775-1851-the-tenth-plague-of-egypt-n00470-national-gallery - J. M. W. Turner - "The Tenth Plague of Egypt" (1802)
- joseph-mallord-william-turner-1775-1851-the-pass-of-saint-gotthard-switzerland-1935p198-birmingham- - J. M. W. Turner - "The Pass of Saint Gotthard" (1803)
- joseph-mallord-william-turner-1775-1851-sunset-on-the-river-n02311-national-gallery - J. M. W. Turner - "Sunset on the River" (1805)
- joseph-mallord-william-turner-1775-1851-willows-beside-a-stream-n02706-national-gallery - J. M. W. Turner - "Willows beside a Stream" (1805)
- joseph-mallord-william-turner-1775-1851-windsor-castle-from-the-thames-t03870-tate - J. M. W. Turner - "Windsor Castle from the Thames" (1805)
- joseph-mallord-william-turner-1775-1851-weir-and-cattle-n02705-national-gallery - J. M. W. Turner - "Weir and Cattle" (1806)
- joseph-mallord-william-turner-1775-1851-cassiobury-park-reaping-n04663-national-gallery - J. M. W. Turner - "Cassiobury Park: Reaping" (1807)
- joseph-mallord-william-turner-1775-1851-the-thames-near-windsor-t03871-tate - J. M. W. Turner - "The Thames near Windsor" (1807)
- joseph-mallord-william-turner-1775-1851-tree-tops-and-sky-guildford-castle-evening-n02309-national- - J. M. W. Turner - "Tree Tops and Sky" (1807)
- joseph-mallord-william-turner-1775-1851-the-confluence-of-the-thames-and-the-medway-t03874-tate - J. M. W. Turner - "The Confluence of the Thames and Medway" (1808)
- joseph-mallord-william-turner-1775-1851-the-garreteer-s-petition-n00482-national-gallery - J. M. W. Turner - "The Garreteer's Petition" (1809)
- joseph-mallord-william-turner-1775-1851-petworth-sussex-the-seat-of-the-earl-of-egremont-dewy-morni - J. M. W. Turner - "Petworth House from the Lake: Dewy Morning" (1810)
- joseph-mallord-william-turner-1775-1851-teignmouth-t03882-tate - J. M. W. Turner - "Teignmouth Harbour" (1812)
- barcelona-apullia-in-search-of-appullus-1814-william-turner-tate-britain - J. M. W. Turner - "(Barcelona) Apullia in Search of Appullus 1814" (1814)
- joseph-mallord-william-turner-1775-1851-the-field-of-waterloo-ng500-tate - J. M. W. Turner - "The Field of Waterloo" (1818)
- sir-david-wilkie-1785-1841-the-penny-wedding-rcin-405536-royal-collection - David Wilkie - "The Penny Wedding" (1818)
- joseph-mallord-william-turner-1775-1851-first-sketch-for-the-battle-of-trafalgar-n05480-national-ga - J. M. W. Turner - "First Sketch for The Battle of Trafalgar" (1823)
- joseph-mallord-william-turner-1775-1851-a-ship-aground-yarmouth-sample-study-n02065-national-galler - J. M. W. Turner - "A Ship Aground" (1827)
- joseph-mallord-william-turner-1775-1851-shipping-off-east-cowes-headland-n01999-national-gallery - J. M. W. Turner - "Shipping off East Cowes Headland" (1827)
- joseph-mallord-william-turner-1775-1851-sketch-for-east-cowes-castle-the-regatta-beating-to-windwar - J. M. W. Turner - "Sketch for East Cowes Castle" (1827)
- joseph-mallord-william-turner-1775-1851-sketch-for-east-cowes-castle-the-regatta-beating-to-aa9d91 - J. M. W. Turner - "Sketch for East Cowes Castle" (1827)
- joseph-mallord-william-turner-1775-1851-hill-town-on-the-edge-of-the-campagna-n05526-national-galle - J. M. W. Turner - "Hill Town on the Edge of the Campagna" (1828)
- joseph-mallord-william-turner-1775-1851-petworth-park-tillington-church-in-the-distance-n00559-nati - J. M. W. Turner - "Petworth Park: Tillington Church in the Distance" (1828)
- sir-david-wilkie-1785-1841-the-defence-of-saragossa-rcin-405091-royal-collection - David Wilkie - "The Defence of Saragossa" (1828)
- joseph-mallord-william-turner-1775-1851-view-of-orvieto-painted-in-rome-n00511-national-gallery - J. M. W. Turner - "View of Orvieto" (1828)
- katsushika-hokusai-1760-1849-de-roben-waterval-1835 - Katsushika Hokusai - "Rōben Waterfall at Ōyama" (1833)
- joseph-mallord-william-turner-1775-1851-head-of-a-person-asleep-n05494-national-gallery - J. M. W. Turner - "Head of a Person Asleep" (1835)
- barcelona-story-of-apollo-and-daphne-1837-william-turner-tate-britain - J. M. W. Turner - "(Barcelona) Story of Apollo and Daphne 1837" (1837)
- joseph-mallord-william-turner-1775-1851-sun-setting-over-a-lake-n04665-national-gallery - J. M. W. Turner - "Sun Setting over a Lake" (1840)
- joseph-mallord-william-turner-1775-1851-waves-breaking-against-the-wind-n02881-national-gallery - J. M. W. Turner - "Waves Breaking against the Wind" (1840)
- joseph-mallord-william-turner-1775-1851-fishing-boats-bringing-a-disabled-ship-into-port-ruysdael-n - J. M. W. Turner - "Fishing Boats Bringing a Disabled Ship into Port Ruysdael" (1844)
- joseph-mallord-william-turner-1775-1851-venice-quay-ducal-palace-n00540-national-gallery - J. M. W. Turner - "Venice Quay" (1844)
- william-holman-hunt-1827-1910-the-haunted-manor-t00932-tate - William Holman Hunt - "The Haunted Manor" (1849)
- millais-das-tal-der-stille - John Everett Millais - "The Vale of Rest" (1858)
- after-the-attack-plevna-1877-1878 - Vasily Vereshchagin - "After the attack. Plevna" (1881)
- van-gogh-in-the-orchard-1883 - Vincent van Gogh - "Man Digging in the Orchard" (1883)
- adachi-moor - Tsukioka Yoshitoshi - "Adachi Moor" (1885)
- vincent-van-gogh-le-moulin-de-la-galette - Vincent van Gogh - "Le Moulin de la Galette" (1887)
- vincent-willem-van-gogh-030 - Vincent van Gogh - "Die Brücke von Trinquetaille" (1888)
- vincent-van-gogh-le-moissonneur-1889 - Vincent van Gogh - "The Reaper" (1889)
- vincent-van-gogh-bank-of-the-oise-at-auvers-70-159-detroit-institute-of-arts - Vincent van Gogh - "Bank of the Oise at Auvers" (1890)
- vincent-van-gogh-landscape-with-carriage-and-train-in-the-background-1890 - Vincent van Gogh - "Landscape with a Carriage and a Train" (1890)
- vincent-van-gogh-the-church-in-auvers-sur-oise-view-from-the-chevet-google-art-project - Vincent van Gogh - "The Church at Auvers" (1890)
- edmund-blair-leighton-in-time-of-peril-google-art-project - Frederic Leighton - "In Time of Peril" (1897)
- nighthawks-by-edward-hopper-1942 - Edward Hopper - "Nighthawks" (1942)

**Agent-confirmed false positives (60):** records where the proposedYear equals the currentYear and confidence is high or medium. The flag fired on a benign signal — filename containing the artist's or sitter's lifespan dates, dateCreated string holding both creation year and an upload timestamp, "Showa N" / "April 12, 1796" patterns matching the upload-timestamp heuristic, etc.

- giovanni-bellini-crocifissione-in-un-cimitero-ebraico-crocifisso-niccolini-da-camugliano-1480-85-ca - Giovanni Bellini - "Crucifixion in a Jewish Cemetery" (1480; c. 1480–85)
- col-tempo-by-giorgione - Giorgione - "Col tempo" (1506)
- la-fornarina-by-raffaello - Raphael - "La Fornarina" (1518; 1518–1519)
- musee-de-capodimonte-le-greco-portrait-de-giulio-clovio-en-1571-572-01 - El Greco - "Portrait of Giulio Clovio" (1571; c. 1571–72)
- cardinal-fernando-nino-de-guevara-1541-1609-met-dt854 - El Greco - "Portrait of a Cardinal" (1600; c. 1600)
- joachim-wtewael-portrait-of-christina-wtewael-van-halen-1568-1629-google-art-project - Joachim Wtewael - "Portrait of Christina Wtewael van Halen" (1601)
- el-greco-domenikos-theotokopoulos-saint-jerome-c-1610-1614-nga-12204 - El Greco - "Saint Jerome" (1610; c. 1610/1614)
- gherardo-delle-notti-adoration-of-the-child - Gerard van Honthorst - "Adoration of the Child" (1619; c. 1619–1620)
- pythagoras-advocating-vegetarianism-1618-20-peter-paul-rubens - Peter Paul Rubens - "Pythagoras advocating vegetarianism" (1628; between 1628 and 1630)
- sir-anthony-van-dyck-charles-i-1600-49-google-art-project - Anthony van Dyck - "Charles I" (1635)
- portret-van-willem-ii-1626-50-prins-van-oranje-en-zijn-echtgenote-maria-stuart-1631-60-rijksmuseum- - Gerard van Honthorst - "Portret van Willem II" (1647)
- frederik-hendrik-1584-1647-prins-van-oranje-atelier-of-gerard-van-honthorst-1650 - Workshop of Gerard van Honthorst - "Frederik Hendrik" (1650)
- kaigetsudo-ando-standing-portrait-of-a-courtesan-c-1705-1710-hanging-scroll-... - Kaigetsudō Ando - "Standing Portrait of a Courtesan" (1705; c. 1705–1710)
- pinacoteca-querini-stampalia-angelo-maria-querini-bartolomeo-nazari - Bartolomeo Nazari - "Angelo Maria Querini" (1740; c. 1740)
- francois-boucher-1703-1770-landscape-with-a-watermill-ng6374-national-gallery - François Boucher - "Landscape with a Watermill" (1755)
- john-singleton-copley-mrs-benjamin-pickman-mary-toppan-1744-1817-1966-79-3-yale-university-art-gall - John Singleton Copley - "Mrs. Benjamin Pickman" (1763)
- benjamin-west-1738-1820-the-departure-of-regulus-rcin-405416 - Benjamin West - "The Departure of Regulus" (1769)
- benjamin-west-1738-1820-the-oath-of-hannibal-rcin-405417 - Benjamin West - "The Oath of Hannibal" (1770)
- benjamin-west-1738-1820-sir-joseph-banks-1743-1820-1st-bt-gcb-prs-lcnug-1989-9-usher-gallery - Benjamin West - "Sir Joseph Banks" (1771)
- benjamin-west-1738-1820-the-death-of-chevalier-bayard-rcin-407525 - Benjamin West - "The Death of Chevalier Bayard" (1772)
- benjamin-west-1738-1820-the-wife-of-arminius-brought-captive-to-germanicus-rcin-405683 - Benjamin West - "The Wife of Arminius..." (1773)
- benjamin-west-1738-1820-george-iv-when-prince-of-wales-with-frederick-duke-of-york-when-prince-fred - Benjamin West - "George IV with Frederick, Duke of York" (1777)
- john-singleton-copley-testa-di-negro-1777-78-ca-cropped - John Singleton Copley - "Head of a Negro" (1777; 1777–78)
- duchess-of-polignac-by-e-vigee-lebrun-1787-atheneum - Élisabeth Louise Vigée Le Brun - "Yolande-Martine-Gabrielle de Polastron" (1782)
- vigee-lebrun-elisabeth-louise-charles-alexandre-de-calonne-1734-1802-google-art-project - Élisabeth Louise Vigée Le Brun - "Portrait of Charles-Alexandre de Calonne" (1784)
- gilbert-stuart-1755-1828-john-philip-kemble-npg-49-national-portrait-gallery - Gilbert Stuart - "John Philip Kemble" (1785)
- gilbert-stuart-1755-1828-sarah-siddons-nee-kemble-npg-50-national-portrait-gallery - Gilbert Stuart - "Sarah Siddons" (1787)
- benjamin-west-1738-1820-the-institution-of-the-order-of-the-garter-rcin-407521 - Benjamin West - "The Institution of the Order of the Garter" (1787)
- benjamin-west-1738-1820-edward-iii-crossing-the-somme-rcin-404566 - Benjamin West - "Edward III Crossing The Somme" (1788)
- benjamin-west-1738-1820-edward-iii-with-the-black-prince-after-the-battle-of-crecy-rcin-407523 - Benjamin West - "Edward III with the Black Prince" (1788)
- benjamin-west-1738-1820-the-burghers-of-calais-rcin-404927 - Benjamin West - "The Burghers of Calais" (1789)
- gilbert-stuart-george-washington-lansdowne-portrait-google-art-project - Gilbert Stuart - "George Washington (Lansdowne)" (1796)
- gilbert-stuart-george-washington-the-athenaeum-portrait-google-art-project - Gilbert Stuart - "George Washington (Athenaeum)" (1796)
- john-singleton-copley-1738-1815-the-surrender-of-the-dutch-admiral-de-winter-to-admiral-duncan-at-t - John Singleton Copley - "The Surrender of the Dutch Admiral de Winter" (1799)
- philipp-otto-runge-pedro-sobre-el-mar - Philipp Otto Runge - "Peter on the sea" (1806; July 1806)
- venice-aristotele-by-francesco-hayez-in-gallerie-accademia-venice - Francesco Hayez - "Aristotele" (1811)
- john-constable-1776-1837-maria-bicknell-mrs-john-constable-n02655-national-gallery - John Constable - "Maria Bicknell" (1816)
- sarah-goodridge-elizabeth-greenleaf-parsons-1758-1829-1956-63-fogg-museum - Sarah Goodridge - "Elizabeth Greenleaf Parsons" (1820)
- barcelona-shipping-1825-30-william-turner-in-tate-britain - J. M. W. Turner - "Shipping" (1825; c. 1825–30)
- david-s-leonidas-and-thermoplyae - Jacques-Louis David - "David's Leonidas and Thermoplyae" (1826; the 1826 engraving by Laugier, not the painting)
- besneeuwde-ochtend-in-koishikawa-rijksmuseum-ak-mak-1588 - Katsushika Hokusai - "Koishikawa in the Morning after a Snowfall" (1830; c. 1830-1835)
- katsushika-hokusai-tempesta-sotto-la-vetta-dalla-serie-delle-36-vedute-del-monte-fuji-1831-ca - Katsushika Hokusai - "Rainstorm Beneath the Summit" (1831)
- francesco-hayez-incontro-di-giobbe-ed-esau-1844 - Francesco Hayez - "Incontro di Giacobbe ed Esaù" (1844)
- carl-spitzweg-der-maler-auf-einer-waldlichtung-unter-einem-schirm-liegend - Carl Spitzweg - "Der Maler auf einer Waldlichtung" (1850)
- sokokura-by-hiroshige1 - Utagawa Hiroshige - "Sokokura, from Seven Hot Springs of Hakone" (1852)
- james-abbott-mcneill-whistler-rotherhithe-etching-1860-dallas-museum-of-art - James McNeill Whistler - "Rotherhithe" (1860)
- the-luncheon-by-claude-monet-stadel-frankfurt-am-main-germany-2017 - Claude Monet - "The Luncheon (Städel)" (1868)
- edgar-degas-1834-1917-the-bath-woman-supporting-her-back-pastel-on-paper-c-1887 - Edgar Degas - "The Bath" (1887; c. 1887)
- p-1948-sc-276-scaled-aspect-ratio-16-9-3-scaled - Claude Monet - "(Antibes/Esterel)" (1888)
- starry-night-over-the-rhone - Vincent van Gogh - "Starry Night Over the Rhône" (1888; September 1888)
- vincent-willem-van-gogh-128 - Vincent van Gogh - "Vase with Twelve Sunflowers" (1888; August 1888)
- vincent-van-gogh-0013 - Vincent van Gogh - "The Painter on His Way to Work" (1888; July 1888)
- carnegiemuseumofvincentgoghafterrain - Vincent van Gogh - "Wheat Fields after the Rain" (1890; July 1890)
- bakst-uhzin1902 - Léon Bakst - "Dinner" (1902)
- francis-picabia-1911-12-paysage-a-cassis - Francis Picabia - "Paysage à Cassis" (1911; December 1911)
- bellows-cliffdwellers - George Bellows - "Cliff Dwellers" (1913; May 1913)
- albert-gleizes-1914-woman-with-animals-... - Albert Gleizes - "Woman with animals" (1914; February 1914)
- juan-gris-1915-nature-morte-a-la-nappe-a-carreaux-... - Juan Gris - "Nature morte à la nappe à carreaux" (1915; March 1915)
- john-singer-sargent-atlas-and-the-hesperides-1922-1925 - John Singer Sargent - "Atlas and the Hesperides" (1922; c. 1922–1925)
- ohara-koson-gatto-e-vasca-con-pesci-rossi-1933-xilografia-colorata - Ohara Koson - "Cat and Bowl with Goldfish" (1933)
- het-drijvende-paviljoen-te-katada-... - Tsuchiya Kōitsu - "Het drijvende paviljoen te Katada" (1934; March 1934)
- robert-delaunay-rythmes-1934 - Robert Delaunay - "Rhythms" (1934)
- three-sisters-by-yamakawa-shuho-1898-1944-painted-screen-1936-honolulu-museum-of-art-02 - Yamakawa Shūhō - "Three Sisters" (1936; Showa 11)
- rain-at-kofukuji-temple-5759571352 - Tsuchiya Kōitsu - "Rain at Kofukuji Temple" (1937; June 1937)
- bamboo-grove-5759026915 - Hiroshi Yoshida - "Bamboo Grove" (1939)

## Heuristic notes

- **year-equals-artist-birth (89 hits):** Very high hit rate. Almost every match was a genuine error — the year field had been populated with the artist's date-of-birth (commonly Monet's 1840-11-14 lifted from the Commons `{{Information|date=...}}` template, or Schongauer's 1450 from a "15th century" placeholder). Keep this heuristic at the top.
- **year-before-artist-turned-8 (94 hits):** Equivalently noisy as above and largely overlapping — when year equals DOB it also fails the age-8 check. Strong signal; consider treating it as a subset of `year-equals-artist-birth`.
- **date-created-is-upload-timestamp (94 hits):** Highest false-positive rate of the lot. Many Wikidata/Commons records legitimately store creation strings like "April 12, 1796", "September 1888", "Showa 11 (1936)", or "1934 ; 2014-11-09 17:08" that pattern-match the heuristic. Worth tightening to require the entire dateCreated string be a single recent (post-1950?) ISO timestamp.
- **filename-year-mismatch (97 hits):** Useful but noisy. Many filenames embed the artist's lifespan (Benjamin West "1738-1820", Stuart "1755-1828", Copley "1738-1815", Degas "1834-1917", Hokusai "1760-1849", Whistler etc.) or the sitter's lifespan ("Charles I 1600-49", "Christina Wtewael van Halen 1568-1629") — both produce a year-number that disagrees with the (correct) record year. Suggest: ignore filename digits that match `<artist.born>-<artist.died>` or sit inside parentheses next to the artist's name.
- **year-before-artist-born (1 hit):** Rare and unambiguous — keep as a hard error.
- **year-after-artist-died (6 hits):** Low volume; mostly genuine bugs (Monet w-numbers parsed as years post-1926, Hokusai posthumous 1850 attribution, Bakst 1950, Kōitsu 1957 reprint). Keep, but treat with care for posthumous prints/engravings (Goya Desastres 1863 publication, Laugier engraving 1826 after David) where the recorded year may legitimately refer to a later reproduction.

Looking forward: a single combined "lifespan-token in filename" detector would absorb most filename-year-mismatch false positives. And handling "circa" and partial-precision dates as a tracked confidence rather than a binary year would eliminate the bulk of the date-created-is-upload-timestamp noise.
