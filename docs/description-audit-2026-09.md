# Description correctness audit — September 2026

Machine-readable proposals: [`metadata/description-review-proposals.json`](../metadata/description-review-proposals.json). This page is the human-readable view of the same data.

## What was checked

- **720 descriptions.** 520 had never been audited: 351 `collection-of-beauty` works added after the 2026-06-17 pass and all 169 Redouté *Les Roses* plates. A further 200 are a seeded random sample of works the 2026-06-17 pass had already marked `accurate`, `minor-fixed` or `fabricated-fixed`, to test whether that pass holds.
- **Method.** Each agent looked at a rendered image of the served asset *before* re-reading the description. It split the text into claims and marked each one supported, contradicted, unsupported or unverifiable. Evidence came from the image, the catalogue record, Wikimedia Commons file metadata, and targeted web lookups.
- **Adversarial second pass.** All 74 `major` / `fabricated` flags went to a second, independent agent. That agent re-read the image itself and tried to refute the finding. Result: 69 kept their severity, 4 were downgraded, 1 was refuted outright. The second agent also rewrote the replacement text on 47 of the 74, usually because the first rewrite carried an ungrounded detail.
- **Not adversarially verified:** the 211 `minor` findings and the 438 `accurate` verdicts. Treat `minor` proposals as single-reviewer output.
- **Source gap.** c82.net, the source for the Redouté plates, sits behind a Cloudflare bot challenge. No page text could be fetched. Those plates were judged from the image, the species name and web lookups only.

## How to apply or reject a proposal

Each entry in `proposals[]` has `status: "pending"` and `decision: null`. To process one:

1. **Check for drift.** Take the live description for `id` from `src/data/artworks.json`. Hash it: `sha256(text).hex.slice(0, 16)`. If the hash differs from `currentDescriptionSha256_16`, someone changed the text after this audit. Re-judge against the image; do not apply blind.
2. **Judge.** Read `issues[]` (each `quote` is a literal substring of the current text), `imageObservation`, and `verifier.reason` when present. Open the image to settle a disagreement: `assets-web/<folder>/<basename>/960.avif`, where `<basename>` is the `evidence.objectKey` filename minus its extension.
3. **Apply a text change** (`action` is `replace-description` or `replace-description+metadata`): set `metadata/curator-descriptions.json[id]` to `proposedDescription`. That file overrides source text in `build-data`, so this works for the 130 ids that have no curator entry yet.
4. **Apply a catalogue change** (`metadataIssues[]`): these are proposals, not verified edits. `build-data` reads overrides from `metadata/title-overrides.json`, `artist-overrides.json`, `movement-overrides.json`, `date-originals.json`, `artwork-dimensions.json` and `provenance.json`. Read the loader in `scripts/build-data.mjs` for the key shape before editing one. Several entries only say "needs checking"; do not invent a value for those.
5. **Record the decision.** Set `status` to `applied` or `rejected` and write one line in `decision`. Add the id to `metadata/description-audit-ledger.json` with a status (`accurate`, `minor-fixed`, `fabricated-fixed`) and a `problem` line, matching the existing ledger shape.
6. **Rebuild** with `pnpm assets:build-data` after a batch of changes.

Entries with `action: "no-change"` need no edit. Add them to the ledger as `accurate` so the next audit can skip them.

## Follow-ups this audit could not close

- **Redouté plate/name mismatch around plates 118–121.** Plates 118 (`rosa-andegavensis-118`), 119 (`rosa-centifolia-bipinnata-119`) and 121 (`rosa-sempervirens-globosa`) show a different rose from the one their title names. Ids 118–120 carry slug-collision suffixes from ingest, so the plate→name mapping probably shifted there. Fixing the prose alone would leave a wrong title. Check plate 120 and the neighbours against the printed plate list before applying these three.
- **Spot-check result.** Of the 200 works the 2026-06-17 pass had signed off, 19 have a `major` defect and 43 a `minor` one; none are fabricated. Among the 104 marked `accurate` then, 8 are now `major`. Scaled to the ~3,975 audited works, that suggests roughly 350–400 more `major` defects in the audited corpus.
- **Six Commons entries** returned HTTP 429 when the evidence files were rebuilt mid-run: Zurbarán *Hercules and the Hydra*, Fragonard *The Stolen Kiss*, Monet *Tulip Fields in Holland*, Delaunay *L'Équipe de Cardiff*, Raphael *Bindo Altoviti*, West *Omnia Vincit Amor*. All six were first audited with Commons metadata. Only West (`major`) was then verified without it; the second reviewer upheld it from the image and web lookups.

## Verdict spread

| Verdict | All | Never audited | Spot-check of 2026-06-17 pass |
|---|---:|---:|---:|
| fabricated | 7 (1.0%) | 7 (1.3%) | 0 (0.0%) |
| major | 63 (8.8%) | 44 (8.5%) | 19 (9.5%) |
| minor | 211 (29.3%) | 168 (32.3%) | 43 (21.5%) |
| accurate | 438 (60.8%) | 300 (57.7%) | 138 (69.0%) |
| unverifiable | 1 (0.1%) | 1 (0.2%) | 0 (0.0%) |
| **total** | **720** | **520** | **200** |

## Proposed actions

| Action | Count |
|---|---:|
| `no-change` | 405 |
| `replace-description` | 228 |
| `replace-description+metadata` | 53 |
| `metadata-only` | 34 |

| Adversarial verify | Count |
|---|---:|
| not-flagged | 646 |
| upheld | 73 |
| refuted | 1 |

## Error kinds

| Kind | Occurrences |
|---|---:|
| unsupported-claim | 144 |
| no-visual-content | 110 |
| invented-detail | 104 |
| style-hype | 80 |
| wrong-colour | 65 |
| wrong-subject | 57 |
| wrong-count | 39 |
| wrong-medium | 15 |
| wrong-attribution | 13 |
| wrong-collection | 11 |
| internal-contradiction | 8 |
| wrong-date | 7 |
| anachronism | 2 |

## Fabricated (7)

The description asserts a scene, anecdote, provenance or physical fact that the image and sources do not support. Highest priority.

### `collection-of-beauty-alfred-sisley-023`

**Villeneuve-la-Garenne** — Alfred Sisley, 1872 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A view across the Seine from a shaded near bank framed by two large trees: sunlit pale houses with red roofs line the far shore above a green bank, a white rowing boat lies on the water, and a bright cloudy sky fills the upper half. Signed and dated Sisley 1872 at lower left. There is no bridge anywhere in the picture.

- **high/wrong-subject** — "The cast-iron suspension bridge across the Seine at Villeneuve-la-Garenne, with a stone pier at its centre and rowing boats below." → The picture contains no bridge at all. The description belongs to a different Sisley, 'The Bridge at Villeneuve-la-Garenne', which is the one in the Metropolitan Museum. This work is the village view. _(image — no bridge, pier or span is present; the composition is a village on the far bank framed by trees.)_
- **high/wrong-collection** — "now in the Metropolitan Museum of Art (gift of Mr. and Mrs. Henry Ittleson Jr., 1964)" → Wrong museum and wrong credit line. That accession belongs to the Met's 'The Bridge at Villeneuve-la-Garenne'. This painting is in the State Hermitage Museum, St Petersburg. _(web:https://hermitagemuseum.org/digital-collection/28734 and web:https://en.wikipedia.org/wiki/Villeneuve-la-Garenne_(painting) — 'Villeneuve-la-Garenne (Village on the Seine)', 1872, 59 x 80.5 cm, Hermitage; sold to Durand-Ruel in 1872, later Shchukin.)_
- **medium/unsupported-claim** — "during a campaign in the Argenteuil district" → Villeneuve-la-Garenne is on the Seine opposite Saint-Denis, not in the Argenteuil district; the geography is imported along with the wrong painting. _(knowledge / web:https://en.wikipedia.org/wiki/Villeneuve-la-Garenne_(painting).)_
- **metadata/`provenance`** — `null` → `State Hermitage Museum, St Petersburg` _(web:https://hermitagemuseum.org/digital-collection/28734 — the Hermitage holds 'Villeneuve-la-Garenne (Village on the Seine)', 1872.)_

Second reviewer (upheld): Quoted text is in the description. I viewed the image: a Seine view framed by two large tree trunks in shade, pale houses with red and slate roofs on the far bank, a white rowing boat on the water, signed 'Sisley 1872' lower left. No bridge, span or stone pier appears anywhere. The Commons objectName is 'Village au bord de la Seine / Villeneuve-la-Garenne (Village on the Seine)', which is the Hermitage picture; the Met's Ittleson gift is 'The Bridge at Villeneuve-la-Garenne'. The description is of a different painting. The first agent's replacement matches what I see (shaded near bank, two trees, houses on far bank, white boat, signature and date lower left) and the Hermitage attribution fits the Commons title.

**Current:**

> The cast-iron suspension bridge across the Seine at Villeneuve-la-Garenne, with a stone pier at its centre and rowing boats below. Sisley painted the span during a campaign in the Argenteuil district in 1872, oil on canvas, now in the Metropolitan Museum of Art (gift of Mr. and Mrs. Henry Ittleson Jr., 1964).

**Proposed:**

> Sunlit houses of Villeneuve-la-Garenne strung along the far bank of the Seine, seen from the shade of two large trees on the near shore, with a white rowing boat on the water below. Oil on canvas, signed and dated 1872 at the lower left; the picture is in the State Hermitage Museum, St Petersburg.

_Notes: This is the highest-confidence finding in the batch: the description is of a different painting entirely. Sisley made several pictures at Villeneuve-la-Garenne in 1872; the Met's bridge picture (gift of Mr. and Mrs. Henry Ittleson Jr., 1964) is the one described, and the file here is the Hermitage village view (59 x 80.5 cm). I kept the replacement to what the image and the Hermitage record support and left out dimensions since the catalogue row has none._

### `collection-of-beauty-cezanne-fwn-1974`

**FWN 1974** — Paul Cézanne · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Watercolour over pencil on white paper: a still life - a large green melon or watermelon at the centre, a glass tumbler beside it, a red-and-yellow apple to its right, pears and a bottle behind, folded cloth at the left, all drawn in blue contour lines with translucent blue, green and ochre washes and large areas of bare paper.

- **high/wrong-subject** — "A landscape study in pencil and watercolour, the forms of trees and rock laid in with translucent patches of blue and ochre over open paper." → The sheet is a still life of fruit, a glass and drapery on a table. There are no trees, no rock and no landscape anywhere in it. _(image.)_

Second reviewer (upheld): Independently confirmed from the image. The sheet is unambiguously a still life: a large green melon fills the centre, a tall glass tumbler stands to its right, a red-and-yellow apple sits beside the tumbler, further pale green-yellow fruit and loosely brushed cloth/vessel forms occupy the right and left, all over a warm ochre table plane. There is no horizon, no foliage mass, no rock, nothing landscape-like anywhere on the sheet. The description's opening sentence ('the forms of trees and rock') is invented subject matter, which is the definition of fabricated. The remaining two sentences (FWN catalogue number, technique) are supportable from the Commons filename and the cezannecatalogue.com credit and should be kept. I could not open cezannecatalogue.com either, so I add no title or date. The first agent's replacement is substantially right but strips the accents from 'Cezanne' and 'raisonne' (the original description spelled it 'Cézanne') and asserts 'pears' and 'folded cloth' with more confidence than the loose washes support; revised accordingly.

**Current:**

> A landscape study in pencil and watercolour, the forms of trees and rock laid in with translucent patches of blue and ochre over open paper. Catalogued as FWN 1974 in the online Cézanne catalogue raisonné among the works on paper. Cézanne built such sheets from overlapping washes, leaving the white of the paper to carry the light.

**Proposed:**

> A still-life watercolour over pencil: a large green melon at the centre, a glass tumbler beside it and a red-and-yellow apple to its right, with further pale fruit and loosely brushed drapery behind, drawn in blue contour lines and thin washes over bare paper. Catalogued as FWN 1974 in the online Cézanne catalogue raisonné among the works on paper. Cézanne built such sheets from overlapping washes, leaving the white of the paper to carry the light.

_Notes: Only the first sentence was wrong; the catalogue-number sentence (which comes from the Commons filename and the cezannecatalogue.com credit) and the closing technique sentence were kept verbatim. I could not open cezannecatalogue.com (403) to confirm what FWN 1974 is, so I did not add a title, date or collection._

### `collection-of-beauty-durer-selbstportrait`

**dürer selbstportrait** — Albrecht Dürer, 1498 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A strictly frontal, symmetrical bust portrait of a bearded man with long curling brown hair against a black ground, wearing a brown coat with a broad fur collar, one hand raised to the fur at his chest. Inscribed at upper left with the date 1500 and Dürer's AD monogram, and at upper right with a gold Latin inscription ending 'anno XXVIII'. This is the Self-Portrait of 1500 (Munich), not the 1498 Prado picture.

- **high/wrong-subject** — "created in 1498 when the artist was 26 years old" → The image is the 1500 self-portrait: it carries the painted date 1500, the AD monogram, and the Latin inscription recording the artist's twenty-eighth year (anno XXVIII). The 1498 Prado picture is a three-quarter view with a window, a striped cap and gloves — none of which is in this image. _(image — painted date '1500' at upper left and 'anno XXVIII' in the gold inscription at upper right)_
- **high/wrong-collection** — "held in the Prado Museum in Madrid" → The Prado owns the 1498 self-portrait, which is a different picture from the one shown here. _(web:https://commons.wikimedia.org/wiki/File:Durer_self-portrait.jpg — that Commons file (the one the audit tool matched) is the 1498 Prado panel, P02179, and does not match the rendered asset)_
- **medium/invented-detail** — "with the inscription "Das macht Ich nach meiner gestalt" ("I made this according to my features")" → The inscription in the image is in Latin, not German. The German couplet quoted belongs to the 1498 Prado panel, and even there it reads 'Das malt ich nach meiner gestalt'. _(image — the only inscription is Latin, at upper right; knowledge — the Prado panel's German text is 'Das malt ich nach meiner gestalt / Ich war sex und zwanzig Jor alt')_
- **low/style-hype** — "most iconic self-portraits" → Empty superlative; house style avoids 'iconic'. _(house style)_
- **low/no-visual-content** — "The oil-on-panel painting is held in the Prado Museum in Madrid and exemplifies the Northern Renaissance tradition of artist self-portraiture" → Nothing in the description says what is actually in the frame. _(house style — first sentence should describe the picture)_
- **metadata/`year`** — `1498` → `1500` _(image — the panel is inscribed 1500 and 'anno XXVIII')_
- **metadata/`englishTitle`** — `Self-Portrait at 26` → `Self-Portrait at 28` _(image — inscription records the artist's twenty-eighth year)_

Second reviewer (upheld): Confirmed independently from the rendered asset (render.mjs builds img/ from assets-web variants, so this IS the file the site serves). The panel carries '1500' and the AD monogram at upper left and a gold LATIN inscription at upper right reading 'Albertus Durerus Noricus ipsum me propriis sic effin/gebam coloribus aetatis anno XXVIII' — the 1500 Munich self-portrait, frontal, black ground, fur-collared coat, hand at the fur. Nothing in the frame matches the 1498 Prado picture (three-quarter view, window, striped cap, gloves). So 'created in 1498', 'held in the Prado', and the German couplet are all wrong for this image; the German line is also misquoted ('Das macht Ich' for 'Das malt ich'). The whole description is about a different painting: fabricated is the right grade. Note the catalogue row (year 1498, englishTitle 'Self-Portrait at 26', commonsUrl File:Durer_self-portrait.jpg = Prado P02179) is wrong the same way, so the metadata fixes the first agent proposed are also warranted.

**Current:**

> One of Albrecht Dürer's most iconic self-portraits, created in 1498 when the artist was 26 years old. The oil-on-panel painting is held in the Prado Museum in Madrid and exemplifies the Northern Renaissance tradition of artist self-portraiture, with the inscription "Das macht Ich nach meiner gestalt" ("I made this according to my features").

**Proposed:**

> A strictly frontal, symmetrical self-portrait against a black ground: the artist faces the viewer with long curling brown hair falling past his shoulders and a short beard, wearing a brown coat with a broad fur collar, one hand raised to the fur at his chest. The date 1500 and Dürer's AD monogram are inscribed at upper left; the gold Latin inscription at upper right records that he painted himself in his own colours in his twenty-eighth year. The frontal, hieratic format belonged to images of Christ, and Dürer's use of it for his own face is what the panel has been argued over for ever since. Oil on lime panel, Alte Pinakothek, Munich.

_Notes: The mismatch is between the stored ASSET and everything else: the catalogue row (year 1498, englishTitle 'Self-Portrait at 26') and the Commons file the audit tool matched ('File:Durer self-portrait.jpg' = the Prado 1498 panel) both describe the 1498 picture, but the rendered JPEG is unmistakably the 1500 Munich self-portrait. Before applying this rewrite, a human should confirm which file actually sits in assets/collection-of-beauty/. If the asset is the 1500 painting, apply the rewrite and the two metadata fixes; if the asset was rendered wrongly, the original description may be fine. I deliberately left the collection out of the proposed text (the 1500 panel is in the Alte Pinakothek, Munich) so nothing unverified is asserted._

### `collection-of-beauty-eugene-delacroix-the-death-of-sardanapalus-wga6173`

**The Death of Sardanapalus** — Eugène Delacroix, 1827 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Delacroix's Death of Sardanapalus: a bearded king reclines on a huge bed draped in scarlet, watching while nude women are dragged down and stabbed by turbaned attendants; a groom wrestles a rearing white-faced horse at the lower left, and gold vessels, jewels and weapons spill across the shadowed foreground. No severed heads, no fortress wall, no soldiers in uniform.

- **high/wrong-subject** — "Victorious Central Asian troops stand among severed heads and abandoned weapons after the action, the celebration unsettling rather than triumphant." → This describes a different painting entirely. The canvas shows the Assyrian king on his bed amid the slaughter of his harem and horses — there are no standing troops and no severed heads. _(image \| commons — Commons objectName is 'The Death of Sardanapalus', categories include 'Death of Sardanapalus by Eugène Delacroix'.)_
- **high/invented-detail** — "Paired with 'After a failure', the picture insists that battlefield outcomes share a single moral landscape of slaughter." → 'After a failure' is Vasily Vereshchagin's 1868 Turkestan-series canvas (it is record 13 in this same batch). Delacroix's Sardanapalus has no pendant of that name; the text belongs to Vereshchagin's 'After the success' / 'After a failure' pair. _(catalogue record — batch record collection-of-beauty-posle-neudachi is Vereshchagin's 'After a Failure', 1868, Turkestan series; nothing links it to a Delacroix of 1827.)_

Second reviewer (upheld): I read the image myself. It is Delacroix's Death of Sardanapalus: a bearded, turbaned king reclines at upper left on a vast scarlet bed with an elephant-head ornament, a nude woman is sprawled across the bed, a turbaned man at the right stabs a nude woman he holds upright, a dark-skinned attendant drags a richly harnessed white horse at lower left, and gold vessels and jewellery are heaped in the foreground. There are no Central Asian troops, no severed heads and no battlefield. Both quoted sentences are in the description, and the pendant 'After a failure' is Vereshchagin's Turkestan-series title, so the text belongs to another record. The Byron source (the 1821 play Sardanapalus) and the hostile Salon reception of 1827-28 are standard art history. The first agent's replacement is sound, but 'force nude women down onto the bedding at the right' does not match the right-hand group, where the woman is held upright and stabbed. The revised text below fixes that.

**Current:**

> Victorious Central Asian troops stand among severed heads and abandoned weapons after the action, the celebration unsettling rather than triumphant. Paired with 'After a failure', the picture insists that battlefield outcomes share a single moral landscape of slaughter.

**Proposed:**

> The Assyrian king Sardanapalus reclines on a great bed draped in scarlet and watches, unmoving, as his concubines, his horses and his treasure are destroyed around him. A woman lies sprawled across the bed, a turbaned man at the right drives a blade into a nude woman he holds upright, and an attendant drags a harnessed white horse at the lower left. Gold vessels and jewellery are scattered through the dark foreground. Delacroix painted the scene in 1827, taking the subject from Byron's verse drama Sardanapalus; its violence and its saturated reds drew hostile reviews at the Salon.

_Notes: Clear record mix-up rather than a soft hallucination: the existing text is a description of a Vereshchagin battlefield pendant that sits four records away in this same batch. I deliberately left out the collection (the 1827 canvas is in the Louvre, but nothing in the record or the Commons metadata states it, and there is also an 1844 reduced version), so the replacement asserts only the subject, the Byron source and the Salon reception._

### `collection-of-beauty-portrait-of-la-fayette-by-louis-leopold-boilly-1788`

**Marie-Joseph-Yves-Gilbert du Motier** — Louis-Léopold Boilly, 1788 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A full-length standing portrait: Lafayette in a blue coat with red lapels and gold epaulette, white waistcoat and breeches, black boots to the knee, sword at his hip, one hand on his hip and the other holding the bridle of a rearing bay horse; a stormy landscape with distant riders behind, signed 'Boilly pinxit 1788' at lower left.

- **high/wrong-subject** — "A bust portrait" → The picture is a full-length standing portrait, not a bust; the sitter's whole figure, boots and a horse are shown. _(image; commons categories include '18th-century oil portraits of standing men at three-quarter length in military uniforms' and 'Male black boots with spurs in portrait paintings')_
- **high/invented-detail** — "The sitter is shown in civilian dress against a plain ground." → He wears a military uniform (blue coat, red lapels, epaulette, sabre) and stands in a landscape with a rearing horse and distant cavalry, not against a plain ground. _(image; commons categories '18th-century portrait paintings with horses', '1780s military uniforms', 'Justaucorps in art')_

Second reviewer (upheld): Image is unambiguous: a full-length standing figure in a blue military coat with red facings, white waistcoat and breeches, knee boots with spurs and a sabre, one hand on hip and the other holding the bridle of a rearing brown horse, with small mounted figures in a stormy landscape; 'Boilly pinxit 1788' at lower left. The description's 'bust portrait', 'civilian dress' and 'plain ground' are all false. Commons categories agree (military uniforms, horses, boots with spurs). The first agent's replacement is sound except 'gold epaulette': a zoom on the shoulder shows the epaulette is silver/white, so that word is removed.

**Current:**

> A bust portrait of Gilbert du Motier, Marquis de Lafayette, the officer who served in the American and French revolutions. Oil on canvas, dated 1788, formerly attributed to Henri-Pierre Danloux before being given to Boilly. The sitter is shown in civilian dress against a plain ground.

**Proposed:**

> Lafayette stands full-length in a blue uniform coat with red lapels, white waistcoat and breeches and black boots, one hand on his hip and the other holding the bridle of a rearing bay horse, with riders small in the landscape behind. Oil on canvas, signed and dated 1788, formerly attributed to Henri-Pierre Danloux before being given to Boilly.

_Notes: Only the visual content is wrong; artist, date and the Danloux re-attribution are supported by the Commons artist field ('Louis-Leopold Boilly / Formerly attributed to Henri-Pierre Danloux'). Commons categories also place the painting in the Musee national du Chateau de Versailles, which the description does not claim and I did not add._

### `collection-of-beauty-portret-khudozhnika-fedora-antonovicha-bruni`

**Портрет художника Федора Антоновича Бруни** — Andrey Denyer, 1864 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** An OIL PAINTING, not a photograph: an elderly white-haired man in a black coat sits in a carved, red-upholstered armchair, brushes and a sheet of paper in his hands, a large pale cartoon of robed bearded figures and a maulstick behind him at the right. Signed in Cyrillic on the chair arm at lower left, 'А. Горавскiй', with a date.

- **high/wrong-medium** — "Portrait photograph of Fyodor Bruni" → The image is a painted portrait — visible brushwork, a painted cartoon on the wall behind, a painted signature on the chair arm. It is not a photograph. _(image — brushwork throughout and a legible painted Cyrillic signature at lower left)_
- **high/wrong-attribution** — "Taken by photographer Andrey Denyer in the 1860s" → The signature on the chair arm reads 'А. Горавскiй' (Apollinary Goravsky), a painter, followed by a date. Denyer's Bruni portrait is a separate, genuinely photographic work — which is what the Commons file the audit tool matched ('File:Bruni FA.jpg') actually is. _(image — zoomed crop of the signature reads 'А. ГОРАВСКIЙ' with a date below; commons — the matched file is a Denyer photograph, so the metadata does not describe this asset)_
- **metadata/`artist`** — `Andrey Denyer` → `Apollinary Goravsky (А. Горавский)` _(image — painted signature at lower left)_
- **metadata/`year`** — `1864` → `unresolved — the painted date is partly illegible in the render; do not keep 1864, which comes from the Denyer photograph's Commons record` _(image — a four-digit date follows the signature but cannot be read confidently at this resolution)_

Second reviewer (upheld): Upheld, and now settled by external evidence. The image is unmistakably an oil painting — brushwork throughout, a painted cartoon of robed bearded figures on the wall behind, a maulstick, and a painted signature. Zooming the lower left shows the signature on the CHAIR ARMREST reading 'А. Горавскiй' with a date under it. A search confirms Apollinary Goravsky's 'Портрет художника Федора Антоновича Бруни', 1871, oil on canvas 105.4 × 78.5 cm, State Tretyakov Gallery, signed on the armrest 'А. Горавскш 20 III 1871' — an exact match to what is in the frame, including the signature's unusual placement. So 'Portrait photograph', 'Taken by photographer Andrey Denyer', and '1860s' are all wrong, and the catalogue artist/year fields (Denyer, 1864, File:Bruni FA.jpg) belong to a different, genuinely photographic work. Same asset/metadata mismatch pattern as the Dürer record.

**Current:**

> Portrait photograph of Fyodor Bruni (1799–1875), a Russian painter, sculptor, and influential rector of the Imperial Academy of Arts. Taken by photographer Andrey Denyer in the 1860s, showing Bruni in his maturity during his tenure as an academician.

**Proposed:**

> The painter Fyodor Bruni (1799–1875), rector of the Imperial Academy of Arts, seated in a carved, red-upholstered armchair in a black coat, brushes and a folded sheet in his hands; behind him at the right hangs a large pale cartoon of robed, bearded figures with a maulstick propped against it. The canvas is signed and dated in Cyrillic on the chair arm at lower left — 'А. Горавскiй', Apollinary Goravsky, 1871 — who had studied under Bruni at the Academy seventeen years earlier. Oil on canvas, State Tretyakov Gallery.

_Notes: The sitter is right; the medium, the maker and the date are all wrong, and they were wrong in the catalogue row too, so this needs a metadata fix as well as a rewrite. The Commons metadata attached to this record belongs to a Denyer photograph of Bruni, not to the stored asset — the same pattern as the Dürer record in this batch, so the Commons matching for this folder is worth auditing generally. I could not confirm the painting's date or present collection from the web (a Goravsky portrait of Bruni is listed in the Russian Museum's holdings but I could not pin the record), so I left both out of the proposed text._

### `redoute-roses-rosa-centifolia-bipinnata-119`

**Rosa Centifolia** — Pierre-Joseph Redouté, 1824 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A tall upright cane bristling from top to bottom with countless fine straight red-brown prickles, carrying six single, five-petalled WHITE flowers with yellow stamens ranged along its length, above short pinnate sprays of small oval toothed leaflets. There is no double flower and no pink anywhere in the plate.

- **high/wrong-subject** — "with the usual rose-pink double flower of the cabbage rose" → The plate shows single white flowers on a densely bristly cane — a burnet rose, not a cabbage rose. Les Roses plate 119, which is the plate this record's file URL points at (roses-119), is sold in the print trade as 'Prickly variety of Burnet Rose'. _(image — six white single blooms; web:https://www.audubonart.com/product/redoute-roses-pl-119-prickly-variety-of-burnet-rose/ — 'Redouté Roses Pl. 119, Prickly variety of Burnet Rose')_
- **high/wrong-subject** — "Rosa centifolia in its celery-leaved form, the leaflets cut and divided so the foliage resembles celery" → The foliage in the plate is ordinary small oval toothed rose foliage in short pinnate sprays; it is not cut and divided like celery. The description appears to have been written from the record's title rather than from the plate. _(image; the plate-number cross-check above)_
- **metadata/`title`** — `Rosa Centifolia (id rosa-centifolia-bipinnata-119, fileUrl roses-119-light.jpg)` → `A burnet-rose plate — Les Roses pl. 119 is catalogued in the print trade as 'Prickly variety of Burnet Rose' (Rosa pimpinellifolia group)` _(web:https://www.audubonart.com/product/redoute-roses-pl-119-prickly-variety-of-burnet-rose/ ; the same plate-number-to-file-number mapping holds for the other roses in this batch (roses-106 = pl. 106 variegated burnet rose, roses-107 = pl. 107 variety of French rose, roses-148 = pl. 148 monthly rose, roses-032 = pl. 32 field rose, roses-035 = pl. 35 marsh rose))_

Second reviewer (upheld): Quoted text is in the description. The image unambiguously shows seven single, five-petalled white flowers with yellow stamens on a cane densely covered in fine straight prickles, with small rounded toothed leaflets; there is no pink, no double bloom, no celery-cut foliage. The description was written from the slug/title, not the plate. A web search confirms Les Roses pl. 119 is sold as 'Prickly variety of Burnet Rose' (audubonart.com), matching the image. The replacement is grounded: 'stipple engraving, hand-coloured' is confirmed for Les Roses. Record title/slug also needs attention, as the first agent notes.

**Current:**

> Rosa centifolia in its celery-leaved form, the leaflets cut and divided so the foliage resembles celery, with the usual rose-pink double flower of the cabbage rose. Redoute drew it for the third volume of Les Roses, issued in 1824.

**Proposed:**

> A burnet rose in flower: single white blooms with yellow stamens ranged along an upright cane that bristles from end to end with countless fine, nearly straight prickles, above short sprays of small oval toothed leaflets. Like the rest of Les Roses, the plate is a stipple engraving printed in colour and finished by hand.

_Notes: This is the strongest finding in the batch. The description is not a mis-shading of this plate, it is a description of a different rose (the celery-leaved cabbage rose) that matches the catalogue title but not the image. Before applying, someone should decide whether the fix is to the description alone or to the record's identity as well: the title/slug and the image disagree, and I could not fetch c82.net to see which side of that its own page falls on. The proposed replacement deliberately says nothing about volume or variety name, since the plant's exact varietal identity is not settled by what I could verify._

## Major (63)

A substantive claim is contradicted or unsupported, but the description is about the right work.

### `audubon-birds-337-american-bittern`

**American Bittern (Plate 337)** — John James Audubon, 1827 · audubon-birds · prior audit: minor-fixed · confidence high · verify: upheld

> **What the image shows.** Hand-coloured folio plate with wide paper margins: TWO American bitterns in front of a stand of green marsh reeds on a dark mud bank — the farther bird upright with its neck stretched up and bill slightly raised, the nearer bird crouched low and striding forward. Engraved plate number CCCXXXVII upper right; caption "American Bittern / ARDEA MINOR" at the bottom.

- **high/wrong-count** — "three American bitterns among marsh reeds, one with neck stretched upward in the species' characteristic freeze posture and two others in lower, active stances" → The plate shows two birds, not three. There is one upright bird behind and one crouched bird in front; no third bird exists anywhere in the reeds. _(image — enlarged crop at 2x confirms exactly two birds, two heads, two pairs of legs)_
- **medium/wrong-count** — "across all three figures" → Repeats the same miscount, so the error survives a partial fix. _(image)_

Second reviewer (upheld): Confirmed independently at full size and on a 2.4x crop of the whole image area: the plate shows exactly two American bitterns - one standing upright behind with its neck stretched and bill raised, its barred body and tail running off to the left, and one crouched in front striding across the mud bank, its body to the right. Two heads, two bills, two pairs of legs; the mass on the right that could be taken for a third bird is the crouched bird's own wing and back. The description's 'three American bitterns' and the later 'across all three figures' are both verbatim and both wrong, and the row is marked minor-fixed, so an earlier pass did look at it and left the count wrong. The replacement keeps the correct Havell Jr. engraving credit, the 1827-1838 Commons date span and the University of Pittsburgh credit line, and adds nothing ungrounded.

**Current:**

> Plate 337 of Birds of America depicts three American bitterns among marsh reeds, one with neck stretched upward in the species' characteristic freeze posture and two others in lower, active stances. The streaked brown and buff plumage that serves as camouflage in wetland vegetation is rendered in fine tonal gradations across all three figures. Engraved and hand-coloured by Robert Havell Jr., the plate was produced between 1827 and 1838 and is held at the University of Pittsburgh.

**Proposed:**

> Plate 337 of Birds of America depicts two American bitterns among marsh reeds, the farther bird standing upright with its neck stretched up in the species' characteristic freeze posture, the nearer one crouched low as it steps across the mud. The streaked brown and buff plumage that serves as camouflage in wetland vegetation is rendered in fine tonal gradations in both figures. Engraved and hand-coloured by Robert Havell Jr., the plate was produced between 1827 and 1838 and is held at the University of Pittsburgh.

_Notes: This row is marked minor-fixed, so a previous pass looked at it and left the bird count wrong — worth noting for whoever is scoring the earlier audit. Everything else stands: Havell Jr. engraved and hand-coloured the double elephant folio, the 1827–1838 span is the Commons date field, and the University of Pittsburgh is the credit line._

### `audubon-birds-394-i-chestnut-coloured-finch-2-black-headed-siskin-3-black-crown-bunting-4-arctic-ground-finch`

**I. Chestnut-coloured Finch - 2. Black-headed Siskin - 3. Black crown Bunting - 4. Arctic Ground Finch (Plate 394)** — John James Audubon, 1827 · audubon-birds · prior audit: minor-fixed · confidence high · verify: upheld

> **What the image shows.** Five birds, not four: a yellow bird with a black head and black-and-white wings at upper left; a streaked bird with a chestnut nape and black-and-white face reaching for a spider beside a pink bee-balm flower; a grey-breasted sparrow with a yellow crown stripe in the middle; and two large towhee-like birds at the bottom, one brown-headed with an orange breast and one black-headed with rufous sides. The caption reads 'Chestnut coloured Finch. Plectrophanes ornata. 1 Male, spring / Black headed Siskin. Fringilla magellanica. 2 Male / Black crown Bunting. Fringilla atricapilla. 3 Adult male / Arctic Ground Finch. Pipilo arctica. 4 Male, 5 Female.'

- **high/wrong-attribution** — "the bright yellow Chestnut-coloured Finch with black head" → The bright yellow bird with the black head is the Black-headed Siskin (Fringilla magellanica), number 2 in the plate's key. The Chestnut-coloured Finch (Plectrophanes ornata) is the streaked bird reaching for the spider - which the description then lists separately and anonymously as 'a streaked finch catching an insect'. The two are swapped. _(image — a 7x crop of the engraved caption gives the numbered key; Commons categories confirm the species (Calcarius ornatus, Zonotrichia atricapilla, Pipilo maculatus).)_
- **medium/wrong-count** — "Four small seed-eaters are arranged across twigs and grassy ground" → Five birds are shown - the Arctic Ground Finch appears twice, as male and female (numbers 4 and 5 in the caption). Four is the species count, not the bird count. _(image — five birds visible; caption lists '4 Male, 5 Female' for Pipilo arctica.)_
- **medium/wrong-subject** — "a rufous-breasted bird at mid-ground" → The bird in the middle of the plate is the grey-and-streaked Black crown Bunting with a yellow crown stripe; the rufous-breasted bird is the female Arctic Ground Finch at lower left. As written, the list silently drops one of the four named species. _(image — the mid-plate bird has a pale grey breast and a yellow-and-black crown, no rufous.)_
- **low/unsupported-claim** — "groups newly described western species that reached Audubon as study skins during the later phases of the folio's production" → Plausible for a plate this late in the folio, but no source here states how these specimens reached Audubon, and one of the four (the Black-headed Siskin) is not a western North American bird. _(commons/knowledge — Commons gives only the plate number and species categories.)_

Second reviewer (upheld): Quoted text is in the description. The engraved caption reads, left to right: Chestnut coloured Finch (1), Black headed Siskin (2), Black crown Bunting (3), and Arctic Ground Finch (4 male, 5 female). The image shows five birds. At upper left is a yellow, black-headed bird: the siskin, not the Chestnut-coloured Finch. On the branch above is a streaked bird with a chestnut nape and black-and-white face, reaching for a small spider: the Chestnut-collared Longspur (Plectrophanes ornata). In the middle is a grey bird with a yellow crown stripe: the Golden-crowned Sparrow (Black crown Bunting). At the bottom are two towhees. So the identifications are swapped, the count is wrong, and the middle bird is misdescribed as rufous-breasted. The replacement is correct, with two small changes. It names the flower as 'bee-balm', which nothing sources, so I say 'pink flower'. It also ends on the fragment 'University of Pittsburgh', which is a credit line, not description.

**Current:**

> Four small seed-eaters are arranged across twigs and grassy ground: the bright yellow Chestnut-coloured Finch with black head, a streaked finch catching an insect near a pink flower, a rufous-breasted bird at mid-ground, and a dark, rufous-sided Arctic Ground Finch at the base. Plate 394 of Audubon's Birds of America groups newly described western species that reached Audubon as study skins during the later phases of the folio's production.

**Proposed:**

> Five birds of four species are arranged across twigs and grassy ground. The yellow, black-headed Black-headed Siskin perches at upper left. Above it, the streaked, chestnut-naped Chestnut-coloured Finch reaches for a spider beside a pink flower. The grey-breasted, yellow-crowned Black crown Bunting sits in the middle. At the base is a pair of Arctic Ground Finches: the brown-headed, rufous-sided female and the black-headed male. This is Plate 394 of Audubon's Birds of America.

_Notes: Ledger says 'minor-fixed'; the swapped identification survived that pass. All four names in the replacement are taken from the plate's own engraved caption, read at 7x, and match the Commons species categories (Calcarius ornatus, Zonotrichia atricapilla, Pipilo maculatus). I dropped the study-skins sentence rather than restate it unsourced - restore it if the project has a source._

### `collection-of-beauty-1841-millet-jean-francois-portrait-of-louis-alexandre-marolles`

**Portrait of Louis-Alexandre Marolles** — Jean-François Millet, 1841 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A young man shown seated at his easel to roughly three-quarter length, turned toward the viewer, in a loose white painter's smock with a patterned cravat, holding a brush to a canvas at the left with a loaded palette and a fistful of brushes in his other hand; a blue drape hangs over the chair back. Signed and dated at lower right. Handling and support look like pastel on paper rather than oil.

- **high/wrong-subject** — "A bust-length likeness of Louis-Alexandre Marolles, the sitter turned slightly and set against a dark ground" → The portrait is not bust-length and is not a plain likeness: Marolles is shown to about three-quarter length at work, brush in hand, with a palette, brushes, an easel and a canvas. The single sentence that is supposed to say what is in the frame omits everything that makes the picture what it is. _(image — easel, palette and brushes occupy the left and lower half of the sheet; commons categories '19th-century portrait drawings of men at three-quarter length')_
- **high/wrong-medium** — "the canvas is now in the Princeton University Art Museum" → The work is a pastel on paper, not a canvas. _(web:https://artmuseum.princeton.edu/collections/objects/17525 — 'Pastel on paper, 60 x 45 cm, Gift of Joseph F. McCrindle, x1991-185'; also Commons categories 'Pastels by Jean-François Millet (II)' and 'Pastel paintings in the Princeton University Art Museum')_
- **medium/unsupported-claim** — "during his early Cherbourg years" → Nothing supports a Cherbourg origin, and the museum's own note points the other way: Millet shared a studio with Marolles in Paris, where the pair made pastels for sale. _(web:https://artmuseum.princeton.edu/collections/objects/17525 — 'he shared a Paris studio with Marolles during his twenties')_

Second reviewer (upheld): The image shows Marolles seated to about three-quarter length at an easel. He holds a brush to a canvas, with a loaded palette and a fistful of brushes in the other hand, a patterned cravat, a white smock and a blue drape over the chair. It is signed 'Millet 1841' at lower right. 'Bust-length' is wrong. The Princeton record (artmuseum.princeton.edu/collections/objects/17525) gives the medium as pastel, not canvas, and Commons categorises it as a pastel. So the format and medium errors are real. The Cherbourg claim is unsupported, but the first agent's fix is not proven either. Millet was in Cherbourg in 1840-41, and Princeton says only that he shared a Paris studio with Marolles 'in his twenties', without dating the portrait to that period. The proposal's 'in the years he shared a Paris studio' is therefore an inference too. It also says 'on paper', which the Princeton record I read does not state. The corrected text below drops any place of execution and says only 'pastel'.

**Current:**

> A bust-length likeness of Louis-Alexandre Marolles, the sitter turned slightly and set against a dark ground. Millet painted this portrait in 1841 during his early Cherbourg years, well before the rural subjects that made his name; the canvas is now in the Princeton University Art Museum.

**Proposed:**

> Louis-Alexandre Marolles at his easel, shown to three-quarter length in a loose white smock and a patterned cravat. He raises a brush to the canvas and holds a loaded palette and a handful of brushes in his other hand. Millet signed and dated the pastel in 1841. As a young man he shared a small Paris studio with Marolles, who pushed him toward light pastels in an eighteenth-century manner. The portrait is now in the Princeton University Art Museum.

_Notes: Sitter, artist, date and collection were all correct; the format, the medium and the place are the failures. Princeton also notes a faint drawing of a faun on the unfinished canvas in the background — visible only as a scumble in this reproduction, so I left it out. Dimensions (60 x 45 cm) are on the Princeton record if the catalogue wants realDimensions populated._

### `collection-of-beauty-a-hippopotamus-and-crocodile-hunt-p5296`

**The hunting of the hippopotamus** — Peter Paul Rubens, 1615 · collection-of-beauty · prior audit: accurate · confidence high · verify: upheld

> **What the image shows.** A small horizontal panel: two turbaned riders on rearing horses drive spears and a sword down at a bellowing hippopotamus, while a crocodile, hounds and two fallen half-naked hunters tangle across the lower foreground; palms and a pale sea at the right, blue sky above.

- **high/wrong-attribution** — "One of four exotic hunts Rubens painted around 1615 for Maximilian I of Bavaria" → That describes the large Munich canvas (Alte Pinakothek), not this object. The catalogued work is a small copy after Rubens — 24 x 32.8 cm, oil on oak, National Gallery of Ireland NGI.1198, purchased 1951. The description silently promotes a copy to the autograph commission. _(web:http://onlinecollection.nationalgallery.ie/objects/2294 — the NGI records the picture as 'after Peter Paul Rubens', oil on oak panel, 24 x 32.8 cm; commons categories 'Paintings after Peter Paul Rubens' and 'Oil on oak', and the Commons date range 'between 1615 and 1799'.)_
- **medium/style-hype** — "that became a touchstone for Baroque action painting" → Unsupported evaluative claim, and in context it transfers the reputation of the Munich original to this small panel. _(catalogue record — nothing in the row or the Commons metadata supports it.)_
- **metadata/`artist`** — `Peter Paul Rubens` → `after Peter Paul Rubens` _(web:http://onlinecollection.nationalgallery.ie/objects/2294 and commons category 'Paintings after Peter Paul Rubens'. The Commons date range 'between 1615 and 1799' also points away from an autograph work.)_

Second reviewer (upheld): Quoted text is in the description. A web search confirms the NGI record: NGI.1198 is 'after Peter Paul Rubens', oil on oak panel, 24 x 32.8 cm, purchased 1951, while the Maximilian I commission is the large Munich canvas (Alte Pinakothek, 1615-16). Commons also files it under 'Paintings after Peter Paul Rubens' and 'Oil on oak'. So calling this panel one of the hunts Rubens painted for Maximilian is a misattribution of the object, and 'major' is right. The image matches the first agent's replacement: turbaned riders on rearing horses, a raised spear and short blade, a roaring hippopotamus, a crocodile, hounds, two fallen near-naked hunters, palms and a pale strip of water at right. The replacement keeps the commission facts but assigns them to the original, which is correct.

**Current:**

> One of four exotic hunts Rubens painted around 1615 for Maximilian I of Bavaria, blending Flemish pictorial drama with antique pathos. Spear-wielding riders, snarling hounds, and writhing reptiles crash together in a swirling diagonal composition that became a touchstone for Baroque action painting.

**Proposed:**

> Turbaned riders on rearing horses drive spears and a sword down at a bellowing hippopotamus while a crocodile, hounds and two fallen hunters tangle across the foreground, palms and a pale sea closing the view at the right. This small oil on oak panel is a copy after Rubens's Hippopotamus and Crocodile Hunt, one of the hunting scenes he painted around 1615-16 for Maximilian I of Bavaria; it is in the National Gallery of Ireland.

_Notes: The prior ledger status was 'accurate', but the earlier pass appears to have described the Munich original rather than this 24 x 32.8 cm panel. The Maximilian I commission and the group of hunting scenes are real and correctly summarised — they just belong to the other picture. The second sentence of the original description does describe this panel correctly and I kept its substance._

### `collection-of-beauty-adameveparadisecranach`

**Adam and Eve in Paradise** — Lucas Cranach the Elder, 1509 · collection-of-beauty · prior audit: accurate · confidence high · verify: upheld

> **What the image shows.** A woodcut: Eve stands nude beneath a tree reaching up for a fruit while Adam sits at its foot, a hand at his head; around them are stags, goats, sheep, a horse, boars, rabbits and a lion lying in the foreground. Two shields with the Saxon arms hang from a branch, and a tablet nailed to the trunk carries the artist's monogram and the date 1509.

- **high/anachronism** — "reflect his proximity to Luther's circle, where the subject carried fresh theological weight" → The print is dated 1509 on the block. Luther's Ninety-five Theses are 1517 and Cranach's association with Luther dates from about 1520 — a 1509 woodcut cannot reflect proximity to a circle that did not yet exist. _(image — the tablet on the trunk is dated 1509; catalogue record year 1509; commons date '1509')_
- **medium/unsupported-claim** — "Cranach's slender, mannerist nudes" → 'Mannerist' is anachronistic for 1509, and the Eve here is a fairly full-bodied, upright figure rather than the attenuated nudes of Cranach's 1520s-30s panels; the description reads as if written for a later work. _(image)_
- **low/no-visual-content** — "An early treatment of the Fall by the Wittenberg court painter" → Never says what happens in the picture — Eve reaching for the fruit, Adam seated below — nor mentions the dated tablet or the Saxon arms hanging in the tree. _(image)_
- **metadata/`provenance.collection / credit`** — `provenance collection 'British Museum', inventory '1943.3.2884'; credit 'Fine Arts Museums of San Francisco'` → `reconcile — the inventory format and the credit line both point to the Fine Arts Museums of San Francisco, not the British Museum` _(catalogue record: credit and Commons both say 'Fine Arts Museums of San Francisco' and Commons carries the category 'Collections of the Fine Arts Museums of San Francisco', while the provenance block names the British Museum with an accession number in FAMSF's 1943.3.xxxx form. Impressions of a woodcut exist in many collections, so the record may simply be pointing at a different impression than the one reproduced.)_

Second reviewer (upheld): I enlarged the tablet on the trunk. It shows the letters LC, Cranach's winged-serpent device and the date 1509. Cranach had been court painter at Wittenberg since 1505, but his close association with Luther dates from around 1520, after the 1517 theses. The claim that the drawing 'reflects his proximity to Luther's circle, where the subject carried fresh theological weight' is therefore an anachronism and the central claim of the text. 'Mannerist nudes' is also a poor label for a 1509 print. The prior 'accurate' ledger entry does not survive this. The replacement has weak spots of its own. It lists 'goats, sheep, rabbits', but I cannot pick out sheep or rabbits at this resolution. What I can see clearly: several stags, a horse and what looks like a boar at right, a bearded goat, a reclining deer and a single lion asleep in the foreground. The replacement also leaves out the serpent coiled in the branches above Eve, and the fruit Adam already holds. I rewrote it to name only what is clearly visible.

**Current:**

> An early treatment of the Fall by the Wittenberg court painter, set within a paradise teeming with stags, lions, and small game. Cranach's slender, mannerist nudes and crisp linear drawing reflect his proximity to Luther's circle, where the subject carried fresh theological weight.

**Proposed:**

> Eve stands nude against the tree of knowledge and reaches up to pick a fruit. The serpent is coiled in the branches above her. Adam sits beside her with a fruit already in his hand. Around them are stags, a horse, a goat and a reclining deer, and a lion sleeps in the foreground. Two shields with the Saxon arms hang from a branch. A tablet nailed to the trunk carries Cranach's initials, his winged-serpent device and the date 1509. The woodcut is by Lucas Cranach the Elder, court painter to the Elector of Saxony at Wittenberg.

_Notes: This was carrying a prior 'accurate' verdict; the Luther sentence is the reason I am overturning it. Cranach did become Luther's close associate and portraitist, but from around 1520 — eight years after this block was cut — so tying the style and the theology of a 1509 woodcut to 'Luther's circle' is a straightforward anachronism. The Saxon arms and the dated tablet are visible in the sheet (I enlarged the tablet to read the monogram and date). The provenance/credit clash in the record is separate from the description and should be settled by whoever owns the metadata._

### `collection-of-beauty-albert-gleizes-1914-15-portrait-de-florent-schmitt-le-pianiste-pastel-36-x-27-cm`

**Albert Gleizes** — Albert Gleizes, 1914 · collection-of-beauty · prior audit: minor-fixed · confidence medium · verify: upheld

> **What the image shows.** A black-and-white photographic reproduction of a Cubist charcoal or pastel drawing: faceted angular planes, arcs and hatched bars on a light ground, near-abstract, with no clearly legible figure. Signed 'A Gleizes' and dated 15 at the lower right.

- **high/unsupported-claim** — "inscribed to Josep Maria Junoy and published in the Catalan avant-garde review Troços" → Neither the Commons file page nor the catalogue row mentions Junoy or Trocos. The Junoy dedication and Trocos publication attach to a different Gleizes sheet - the 'Esquisse pour le portrait de Jean Cocteau', published in Trocos (no. 2, second series, 1 October 1917) and inscribed 'Pour J. M. Junoy, amicalement, Albert Gleizes, 1915'. A provenance detail appears to have been imported from another work. _(commons - the file page carries only artist, date, medium, dimensions, source (The European Library) and 'black and white photographic reproduction' \| web search for Gleizes + Junoy + Trocos returns the Cocteau sketch, not the Schmitt portrait)_
- **medium/unsupported-claim** — "Faceted planes assemble a dynamic standing figure" → No standing figure can be made out in the reproduction; the sheet reads as near-abstract planes and arcs, and the subtitle 'Le Pianiste' would imply a seated sitter in any case. _(image)_

Second reviewer (upheld): The provenance clause is the real defect and it stands. The Commons file page carries only artist, date, medium, dimensions, source (The European Library) and 'black and white photographic reproduction' — no Junoy, no Troços — and targeted searches for Gleizes + Junoy + Troços return only the Cocteau material (Junoy's 'El Jean Cocteau d'Albert Gleizes', La Veu de Catalunya 1916, and his Troços criticism), never this pastel. A specific, checkable dedication and publication history asserted with no support is the kind of detail that reads as verified and is not, so it should not survive. The 'dynamic standing figure' claim is weaker but I reach the same conclusion from the image myself: the sheet is near-abstract — angular planes, arcs, hatched bars and a few dark wedges on a light ground — with no figure I can resolve, standing or otherwise, and the subtitle 'Le Pianiste' would point to a seated sitter anyway. I confirmed the signature at lower right reads 'A Gleizes' with '15' beneath, so the replacement's closing detail is sound; the replacement keeps every verifiable fact and drops only the two unsupported ones.

**Current:**

> Faceted planes assemble a dynamic standing figure in this Cubist portrait of the composer Florent Schmitt. Gleizes executed the work between 1914 and 1915 at 36 by 27 centimetres; the black-and-white photographic reproduction preserves a pastel that was inscribed to Josep Maria Junoy and published in the Catalan avant-garde review Troços.

**Proposed:**

> A black-and-white photographic reproduction of a Cubist portrait of the composer Florent Schmitt, its subject broken into faceted planes, arcs and hatched bars. Gleizes made the pastel in 1914-15, at 36 by 27 centimetres; the sheet is signed 'A Gleizes' and dated 15 at the lower right.

_Notes: Ledger says minor-fixed, so the Junoy/Trocos clause survived an earlier pass - it is the kind of specific, fluent provenance detail that reads as verified and is not. Medium confidence only because I cannot prove a negative: some catalogue of Gleizes's works on paper may record a Junoy dedication on this sheet too. If an applier can check a Gleizes catalogue raisonne, that would settle it; until then the clause should not stand._

### `collection-of-beauty-alfred-sisley-050`

**Regatta in Molesey** — Alfred Sisley, 1874 · collection-of-beauty · prior audit: never audited · confidence medium · verify: upheld

> **What the image shows.** A riverside regatta under a grey-green sky: three or four very large flags (two Union Jacks, a red-and-gold banner, a white ensign) hang from tall poles, a long line of narrow rowing skiffs is drawn up along the far bank with crowds behind them, figures in white stand on the near bank at the left, and a pavilion sits among trees at the right. No sails or masted sailing craft are visible.

- **high/wrong-subject** — "Sailing boats and spectators on the Thames at Molesey" → There are no sailing boats in the picture. The craft massed along the bank are narrow rowing skiffs, which is what a Molesey regatta was — a rowing event. The verticals that might be mistaken for masts are the flagpoles. _(image — hulls with no masts or sails, drawn up in a long row; the tall verticals carry flags)_
- **medium/invented-detail** — "bright bunting strung along the bank" → The picture's flags are four or five very large individual banners on separate tall poles, not bunting strung along the bank. They are the composition's dominant motif and are mischaracterised. _(image)_

Second reviewer (upheld): The boat error is real. The image has no masts or sails. The long row of craft on the water is rowing boats with crews, and a single sculler sits at lower right. For a painting whose subject is a regatta, misnaming the boats in the only visual sentence justifies 'major'. The first agent's bunting objection is overstated, though, and its fix adds its own error. The three big flags (two Union-Jack ensigns and a red-and-gold banner) hang from a line strung across the top of the picture from the tall pole at left. That is close to 'strung', even if 'along the bank' is loose. Only the smaller flags stand on separate poles. The proposal's 'huge flags hanging from poles' and 'skiffs drawn up along the bank' both misstate this. The second half of the original (1874 English stay, Caillebotte bequest, RF 2787) is sound and kept.

**Current:**

> Sailing boats and spectators on the Thames at Molesey, bright bunting strung along the bank for the local regatta. Sisley painted the scene during a four-month stay in England in 1874, oil on canvas, bequeathed by Gustave Caillebotte and now in the Musée d'Orsay (R.F. 2787).

**Proposed:**

> Rowing boats crowd the Thames at Molesey for the regatta, beneath large flags strung on a line from a tall pole, with more flags on poles along the far bank. Spectators in white stand on the near bank, and a pavilion sits among the trees at right. Sisley painted the scene during a four-month stay in England in 1874, oil on canvas, bequeathed by Gustave Caillebotte and now in the Musée d'Orsay (R.F. 2787).

_Notes: The whole second half of the description is right and is preserved: the four-month 1874 English stay (funded by Jean-Baptiste Faure), the Caillebotte bequest of 1894 and the accession RF 2787 all check out against the Orsay and Joconde records. Only the boats and the flags are wrong, but they are the entire subject of the picture, hence 'major' rather than 'minor'._

### `collection-of-beauty-alfred-sisley-064`

**Banks of the Loing in Moret** — Alfred Sisley, 1892 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A sunlit path beside water, running under a tall stand of poplars whose foliage fills the whole upper right of the canvas; two small figures stand on the path in shadow with more figures further off, water at left and right and a few distant roofs at the centre. Signed 'Sisley' at lower left.

- **high/invented-detail** — "The sky occupies the upper half of the canvas, worked in pale blue and grey above the green riverbank" → False: the upper half of the canvas is dominated by the crowns of tall poplars. Sky is visible only at the upper left and in gaps between trunks. _(image)_
- **medium/invented-detail** — "with low buildings and a stand of trees mirrored in the slow water" → No reflections of buildings or trees are depicted; the buildings are a few tiny distant roofs at the centre, and the water is a flat band at the sides. The picture's actual subject - an avenue of poplars along the path with figures under them - is not described. _(image)_

Second reviewer (upheld): Both quotes are in the description. In the image, tall poplars run diagonally across the canvas along a grassy bank beside a sandy path, and their crowns fill the upper centre and right. Blue sky with white clouds shows mainly at the upper left and between the treetops, so 'sky occupies the upper half' is wrong. The dark water at the far left does faintly reflect the trees on its bank. But the only buildings are tiny pale shapes and a bridge far off between the trunks, and nothing is 'mirrored'. The description misses the actual subject, the line of poplars. The replacement's 'in the shade' and 'toward the water' are loose: the figures stand on a sunlit path beside the canal-like water at left. I tightened it.

**Current:**

> The banks of the river Loing at Moret-sur-Loing, with low buildings and a stand of trees mirrored in the slow water. Sisley settled in the Moret district from 1880 and painted the Loing repeatedly until his death in 1899. The sky occupies the upper half of the canvas, worked in pale blue and grey above the green riverbank.

**Proposed:**

> A sandy path runs beside the Loing at Moret-sur-Loing, next to a line of tall poplars whose crowns fill most of the upper canvas. Two figures stand on the path by the water at left. A bridge and pale buildings show far off between the trunks, under blue sky and white cloud. Sisley settled in the Moret district from 1880 and painted the Loing repeatedly until his death in 1899.

_Notes: The second sentence is kept verbatim and is sound (Sisley moved to the Veneux/Moret area in 1880 and died at Moret in 1899). Both discarded sentences describe a generic river view rather than this canvas, whose composition is dominated by the poplar avenue._

### `collection-of-beauty-allee-de-chataigniers-alfred-sisley`

**Allee de chataigniers - Alfred Sisley** — unattributed · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A wide horizontal landscape: a dense line of leafy trees runs across the middle distance along a low bank, with a large open foreground of bare rock outcrops, scrub and dry grass, under a big pale-blue sky with thin cloud. No avenue, no path, no receding perspective between trunks. Signed at the lower left.

- **high/wrong-subject** — "An avenue of chestnut trees in the woods at La Celle-Saint-Cloud, the path running back between heavy trunks toward a clearing" → There is no avenue and no path in the picture. The canvas shows the edge of a wood seen from outside, across a broad rocky clearing - the composition is a horizontal band of trees with an open rock-strewn foreground. The described scene belongs to a different painting. _(image, plus web:https://www.parismuseescollections.paris.fr/en/node/227063 - the museum page credited on the Commons file identifies this work as Alfred Sisley, 'Lisiere de la foret de Fontainebleau' (Edge of the Fontainebleau Forest), 1865, oil on canvas, 129 x 208 cm, Petit Palais PPP693, described as 'the edge of Fontainebleau Forest ... trees and rocky outcroppings'. The 208:129 ratio matches the image file's proportions.)_
- **medium/unsupported-claim** — "painted in the mid-1860s alongside Bazille in the same woods" → A named companion and a shared painting campaign with no support in the record, the Commons metadata or the museum page. _(commons / web:parismuseescollections - neither mentions Bazille)_
- **metadata/`title`** — `Allee de chataigniers - Alfred Sisley` → `Lisière de la forêt de Fontainebleau` _(The Paris Musees record at the URL credited on the Commons file page (node/227063) names this work Lisiere de la foret de Fontainebleau; the Commons file name and its 'Allee de chataigniers a La Celle-Saint-Cloud' category appear to be a misidentification.)_
- **metadata/`artist`** — `null` → `Alfred Sisley` _(Paris Musees record and Commons category '1865 paintings by Alfred Sisley')_
- **metadata/`year`** — `null` → `1865` _(Paris Musees record; Commons category '1865 paintings by Alfred Sisley')_
- **metadata/`realDimensions`** — `null` → `129 cm high x 208 cm wide` _(Paris Musees record)_
- **metadata/`nationality`** — `null` → `French` _(Paris Musees: Sisley, Paris 1839 - Moret-sur-Loing 1899)_

Second reviewer (upheld): The visual claim is wrong. The image shows a wide open foreground of rock outcrops, scrub and dry grass, with a band of leafy trees across the middle distance under a big sky. There is no path running back between trunks. But the first agent's theory that the file shows a different painting is wrong. Paris Musees node 227063 (PPP693, 129 x 208 cm, signed 'Sisley 65' lower left, Duveen gift 1921) is the same object that Wikipedia and RMN call 'Allee de chataigniers a La Celle-Saint-Cloud'. Wikipedia lists 'Lisiere de la foret de Fontainebleau' as an alternate title. So the title and place are one of two catalogued titles, not an invention. The Bazille link is also plausible from the painting's Salon history. This is a misdescribed composition on a correctly identified work, so major, not fabricated. The replacement should keep the traditional title next to the museum's current one rather than drop it.

**Current:**

> An avenue of chestnut trees in the woods at La Celle-Saint-Cloud, the path running back between heavy trunks toward a clearing. Among Sisley's earliest plein-air canvases, painted in the mid-1860s alongside Bazille in the same woods. Oil on canvas, in his pre-Impressionist Barbizon-inflected manner.

**Proposed:**

> Open ground strewn with bare rock outcrops, scrub and dry grass leads back to a dense band of leafy trees along a low bank, under a broad pale-blue sky. Alfred Sisley signed and dated the canvas 1865 at the lower left, early in his career and still close to the Barbizon manner. It is known as Avenue of Chestnut Trees at La Celle-Saint-Cloud, while the Petit Palais, Paris, which holds it, catalogues it as Edge of the Fontainebleau Forest. It measures 129 by 208 cm.

_Notes: The highest-value finding in this batch. Two problems compound: the catalogue row has null artist, year and movement, and the description was written from a file name that appears to name a different Sisley painting. The museum page linked in the Commons credit field resolves to 'Lisiere de la foret de Fontainebleau', and the image matches it - forest edge with rocky terrain, and an exact aspect-ratio match to 129 x 208 cm. Before applying, someone should confirm whether Commons has mislabelled the file or whether Paris Musees has reassigned the node; the safest reading of the evidence available to me is that the image is the Fontainebleau picture. My replacement avoids naming La Celle-Saint-Cloud or chestnuts at all._

### `collection-of-beauty-bazille-frederic-portrait-of-alphonse-tissie`

**Portrait de M. Alphonse Tissié en cuirassier** — Frédéric Bazille, 1868 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A head-and-shoulders portrait, the sitter turned in three-quarter profile to the left: a moustached man wearing a cuirassier's helmet (steel skull, gilt crest and chinscale, black turban and long black horsehair mane, red plume at the top) over a dark tunic with a red collar, red neckcloth and a red epaulette; plain grey ground with a brown band at the bottom. No breastplate is visible — the picture stops at the shoulders.

- **high/wrong-subject** — "A standing portrait" → The picture is a head-and-shoulders study; the sitter's body below the shoulders is not shown at all, so nothing supports 'standing'. _(image)_
- **medium/invented-detail** — "his plumed helmet and breastplate set off against a plain ground" → No breastplate (cuirass) appears. The sitter wears a dark tunic with a red collar and one red epaulette; the cuirass would be below the visible field. _(image)_

Second reviewer (upheld): Both quotes are in the description. I viewed the painting: it is a head-and-shoulders study cut off at the chest. The sitter is moustached and turned three-quarters left, in a steel helmet with a brass crest, a black horsehair mane and a red plume tip. He wears a dark tunic with a red collar and red fringed epaulettes, against a loosely brushed grey ground. Nothing shows he is standing, and there is no cuirass. Artist, sitter and Musée Fabre are confirmed by Commons. In the replacement, 'neckcloth' is doubtful: the red shape at the left is more likely the far epaulette in perspective. My corrected text avoids it.

**Current:**

> A standing portrait of Alphonse Tissié in the uniform of a cuirassier, his plumed helmet and breastplate set off against a plain ground. Oil on canvas by Bazille, held at the Musée Fabre in Montpellier.

**Proposed:**

> A head-and-shoulders portrait of Alphonse Tissié in a cuirassier's helmet, its steel skull, brass crest and long black horsehair mane set against a loosely brushed grey ground, above a dark tunic with a red collar and red epaulettes. Oil on canvas by Bazille, held at the Musée Fabre in Montpellier.

_Notes: Sitter, artist and collection are right — Commons gives 'Oil painting by Frédéric Bazille, musée Fabre, Montpellier' and the file sits in the Musée Fabre Bazille categories. Only the physical description of the picture is wrong, and it is wrong in both of its specifics._

### `collection-of-beauty-benjamin-west-by-gilbert-stuart-1783-84`

**Portrait of Benjamin West** — Gilbert Stuart, 1785 · collection-of-beauty · prior audit: minor-fixed · confidence high · verify: upheld

> **What the image shows.** A white-haired man in a pale green coat and white stock sits three-quarter view in a red upholstered chair, his hand resting on a stack of two closed gilt-bound books and holding a slim dark implement; a rolled sheet lies on the table before him, a dark green curtain hangs behind, and a large light-toned figure composition stands at the right.

- **high/wrong-collection** — "The portrait is recorded in the collection of the Athenaeum." → There is no such collection. 'The Athenaeum' in the record's credit field is the-athenaeum.org, a public-domain art image website, which is where the Commons file came from - the Commons category is literally 'Images from the-athenaeum.org'. The painting itself is in the National Portrait Gallery, London, commissioned by John Boydell and acquired in 1872. Stating an image host as the holding collection is the kind of error that gets copied onward. _(commons categories 'Images from the-athenaeum.org'; web:https://en.wikipedia.org/wiki/Portrait_of_Benjamin_West_(Stuart,_National_Portrait_Gallery) - 1785, National Portrait Gallery, London)_
- **medium/invented-detail** — "open books" → The books are closed and stacked, spines toward the viewer, with West's hand resting on the top one. The Wikipedia entry likewise describes his hand resting on books, not on an open volume. _(image; web:wikipedia NPG entry)_
- **low/invented-detail** — "a quill" → The implement in his hand is slim and dark with a pale tip - no feather is visible. It reads more like a porte-crayon or stylus. 'Quill' is a guess dressed as an observation. _(image)_
- **metadata/`provenance`** — `null` → `National Portrait Gallery, London` _(web:wikipedia 'Portrait of Benjamin West (Stuart, National Portrait Gallery)' - 1785, NPG London, commissioned by John Boydell, acquired 1872)_

Second reviewer (upheld): Confirmed. The credit and the Commons category 'Images from the-athenaeum.org' show that 'the Athenaeum' is the image website. The portrait is NPG 349 in the National Portrait Gallery, London, commissioned by John Boydell and acquired in 1872 (Wikipedia and NPG search results). In the image the books are closed: an upright gilt-bound volume stands on a flat one, and West's hands rest on top. At zoom the implement is a metal porte-crayon with a pointed tip, not a feather quill. One problem was missed in both the original and the replacement. Stuart lived and worked in West's studio from about 1777 to 1782, then set up on his own, so saying the c.1785 portrait dates from 'the years Stuart spent under West's roof' (or 'working in West's studio') is inaccurate. The corrected text avoids that.

**Current:**

> Benjamin West sits in three-quarter view, a quill and open books before him and a sketch or canvas visible behind, conveying his identity as a practitioner of the intellectual arts. Gilbert Stuart painted his teacher and patron around 1785, during the years Stuart spent under West's roof in London after arriving from America. The portrait is recorded in the collection of the Athenaeum.

**Proposed:**

> Benjamin West sits in three-quarter view in a red chair before a dark green curtain, holding a metal drawing holder. His hands rest on a tall gilt-bound book standing on another, and a rolled sheet lies on the table. A large, pale, unfinished figure composition stands on the canvas behind him at the right. Gilbert Stuart, who had trained in West's London studio, painted his former teacher around 1785 for the publisher John Boydell. The portrait is in the National Portrait Gallery, London.

_Notes: The ledger says this was already 'minor-fixed', and the Athenaeum sentence survived that pass - worth checking whether the same mistake was made on other files sourced from the-athenaeum.org. The canvas behind West is identified in the NPG literature as his then-unfinished Moses Receiving the Law; I left it as 'a large unfinished figure composition' in the replacement because I could not confirm that identification against the museum record itself. Date circa 1785 matches both the Commons date and the record's year field._

### `collection-of-beauty-benjamin-west-omnia-vincit-amor-1809`

**Omnia Vincit Amor Alternative title** — Benjamin West, 1809 · collection-of-beauty · prior audit: minor-fixed · confidence high · verify: upheld

> **What the image shows.** A winged nude youth stands on cloud at the centre, a flaming torch raised in his right hand and a red cord or rein gathered in his left; the cord runs to the right, into the mouth of a dark rearing sea-horse and up toward a large brown eagle, each attended by a putto. A tawny lion lies at the youth's feet, its head turned up toward him. At left a draped woman leans in with both hands open and empty, a putto with white doves beside her. Sea and sky beyond.

- **high/invented-detail** — "while Venus with a flaming sceptre" → There is only one flaming implement in the picture and the description has already given it to Eros. The woman at left holds nothing — both her hands are open and empty. _(image — a single flaming torch, held aloft by the central winged figure; the female figure's hands are visibly empty)_
- **medium/wrong-subject** — "a leash that subdues a lion reclining at his feet" → The red cord runs from Cupid's left hand to the right of the canvas, into the sea-horse's mouth and toward the eagle. The lion lies loose at his feet with no cord attached to it. _(image — the rein is traceable across the canvas to the horse's muzzle)_
- **low/unsupported-claim** — "a dark horse attended by further putti" → The creature is a sea-horse or hippocamp emerging from the water at the right, not a horse on land, and its point is that it stands for the water among the three elements named in the picture's alternative title. _(image; commons — objectName gives the alternative title 'The Power of Love in the Three Elements')_
- **metadata/`title`** — `Omnia Vincit Amor Alternative title` → `Omnia Vincit Amor (alternative title: The Power of Love in the Three Elements)` _(commons — objectName reads 'Omnia Vincit Amor Alternative title(s): The Power of Love in the Three Elements'; the record's title has swallowed the words 'Alternative title' from that string)_

Second reviewer (upheld): Quoted text is present. In the image the only flaming object is the torch raised in the central winged youth's right hand; the woman at left has one hand open in gesture and doves beside her, no sceptre. Red cords from the youth's left hand run to the sea-horse's mouth and toward the eagle; the lion lies unleashed. The Met's own catalogue text (metmuseum.org/art/collection/search/13202) confirms: Venus at left with doves, the young deity 'presumably Hymen' brandishes the torch and holds cords that leash an eagle; eagle, hippocampus and lion stand for Air, Water and Earth. The finding stands, but the first agent's replacement repeats the misidentification of the central figure as Cupid (the Met reads him as Hymen; the small Amor clinging to Venus's drapery is the Cupid), so I corrected the replacement.

**Current:**

> A winged Eros stands triumphant amid clouds, holding a flaming torch and a leash that subdues a lion reclining at his feet, while Venus with a flaming sceptre, putti, and a dark horse attended by further putti fill the allegorical scene. West signed the canvas in 1809, now at the Metropolitan Museum of Art (accession 95.22.1), as one of his late London allegories illustrating Virgil's phrase that love conquers all.

**Proposed:**

> A young winged god, identified by the Metropolitan Museum as probably Hymen, stands on cloud with a flaming torch raised in one hand and red cords gathered in the other, holding an eagle and a sea-horse in check while a lion lies at his feet. Venus leans in from the left with her doves, the small Amor clinging to her drapery, and putti ride the eagle and the sea-horse. The creatures stand for air, water and earth, as the alternative title, The Power of Love in the Three Elements, says. West painted the canvas in 1809 on Virgil's phrase that love conquers all; it is at the Metropolitan Museum of Art, accession 95.22.1.

_Notes: Confidence is medium rather than high on the torch: the arm holding it rises from the central figure's shoulder and reads to me as Cupid's, but the female figure leans in close and someone reading the picture the other way could assign it to her. Either way the description cannot be right, because it gives a flaming object to both of them and the canvas has only one. The rein-to-lion error I am confident about — the cord is traceable to the sea-horse's mouth. The 'three elements' sentence is grounded in the Commons alternative title plus the three animals actually present, not invented. Accession number and Met attribution come straight from the credit field._

### `collection-of-beauty-bogatyy-kirgizskiy-okhotnik-s-sokolom`

**A rich Kyrgyz hunter with a falcon** — Vasily Vereshchagin, 1871 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A standing man inside a yurt - the lattice wall and felt lining are visible behind him - raises his bare right hand, wrapped at the wrist in red cloth, to hold a large unhooded bird of prey with spread wings. He wears a vividly patterned green and red robe, a white felt hat, an embroidered sash and yellow embroidered leather trousers; a gun and a decorated bag hang on the wall behind.

- **high/wrong-subject** — "on horseback" → The hunter is standing on the ground inside a yurt; there is no horse in the picture. _(image - the man's boots are on the earth floor, with the tent's lattice wall behind him)_
- **medium/invented-detail** — "a hooded falcon on his gloved fist" → The bird's head is bare - its beak and eye are plainly visible - and the hand holding it is bare too, with the fingers showing and only a red cloth wrapping at the wrist; no falconry glove and no hood. _(image - 3x crop of the bird and hand)_

Second reviewer (upheld): The image clearly shows the hunter standing on an earth floor inside a yurt, with the lattice wall and felt behind him. There is no horse. The bird's head is unhooded, with beak and eye visible and wings spread. His hand is bare, with red cloth or tassels at the wrist and no falconry glove. 'On horseback' and 'hooded falcon on his gloved fist' are both contradicted by the picture. The first agent's replacement is accurate. It keeps the robe and the 1871 Turkestan-series context, and it correctly hedges the bird as 'bird of prey'. I only added the white felt hat and the gun visible behind him.

**Current:**

> A wealthy Kyrgyz hunter on horseback with a hooded falcon on his gloved fist, dressed in a heavy embroidered robe. Vereshchagin painted the subject in 1871 from observations made on his Central Asian travels for the Turkestan series.

**Proposed:**

> A hunter in a white felt hat stands inside a yurt, raising a large bird of prey on his bare hand, its wings spread wide above him. He wears a vividly patterned robe, an embroidered sash and yellow embroidered leather trousers, with a gun propped against the tent's lattice wall behind him. Vereshchagin painted the subject in 1871, from observations made on his Central Asian travels for the Turkestan series.

_Notes: The embroidered robe and the 1871 date are correct and preserved. Whether the bird is a falcon or an eagle is not settled by the reproduction - the title says falcon, so my replacement says 'bird of prey' rather than contradicting the title. The Turkestan series dating (painted 1871-74 after the 1867-70 travels) is consistent with the sentence as written._

### `collection-of-beauty-boilly-incroyable-parade`

**Boilly incroyable parade** — Louis-Léopold Boilly, 1797 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A dense crowd scene: an incroyable in a broad black hat and high cravat walks arm in arm with a woman in a long trained white-and-blue dress carrying a fur muff, while some twenty onlookers press round them pointing, grinning and jeering; a boy in a red cap and two dogs at the front, a uniformed soldier at the right. The upper half is filled by a pale, thinly painted carriage with a driver and a passenger.

- **high/wrong-subject** — "An 'incroyable', one of the foppish young men of the post-Revolutionary Directory, shown in exaggerated dress with cravat and high collar." → Describes the picture as a single-figure study. The painting is a multi-figure crowd scene (the 'parade' of the title): the incroyable is one small figure at centre, arm in arm with a woman, surrounded by a jeering crowd, dogs and a soldier, with a large grisaille-like carriage occupying the top half of the canvas. _(image - roughly twenty figures, a couple at centre, crowd around them)_

Second reviewer (upheld): The image is plainly a multi-figure street scene: a couple at centre (incroyable in black bicorne-style hat and high cravat, woman in a long white-and-blue dress with a large fur muff), about twenty onlookers, a boy in a red cap, a greyhound and a darker dog at front, a uniformed soldier at right. The description reads as a single-figure costume study and never mentions the crowd, the woman or the carriage, so 'major' is right. The replacement is mostly accurate but overstates the carriage: it is a lightly painted hooded carriage in the upper LEFT, tipping with a passenger's legs flung up and a man in a hat behind, plus a pale horse and shafts behind the crowd at right; it does not 'fill the upper half', and 'driver and passenger' is an interpretation. Revised text describes it more literally.

**Current:**

> An 'incroyable', one of the foppish young men of the post-Revolutionary Directory, shown in exaggerated dress with cravat and high collar. Oil on canvas in a private collection, painted in 1797. Boilly satirised the muscadin fashions then on display along the Parisian boulevards.

**Proposed:**

> An incroyable in a broad black hat and high cravat walks arm in arm with a woman in a long white dress, a large fur muff at her side, through a crowd that presses in to stare, point and jeer. A boy in a red cap and two dogs are at the front, and a soldier stands at the right edge. Above the crowd at upper left a thinly painted hooded carriage lurches past, a passenger's legs thrown in the air. Boilly painted this in 1797, satirising the incroyable and merveilleuse fashions of the Directory years; the picture is in a private collection.

_Notes: Medium cannot be judged from the reproduction; Commons only gives 'L'incroyable parade (collection particuliere)', which supports the private-collection claim, so I kept that and dropped the unsupported 'oil on canvas'. The pale upper scene may be a painted backdrop or a caricature within the picture - I described it literally rather than interpreting it._

### `collection-of-beauty-boilly-louis-leopold-le-doux-reveil-j-7-musee-cognacq-jayfxd`

**Boilly** — Louis-Léopold Boilly, 1795 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A young woman stands upright in a long white chemise and a lace cap tied with pink ribbon, one shoulder and breast bared, one hand on the frame of an open door through which a staircase is visible, looking back over her shoulder into the room. At the right a curtained bed, a chair heaped with a man's red coat, blue breeches and white stockings, and a pair of dark shoes on the floor. No one is lying down and no bedclothes are disturbed in view.

- **high/wrong-subject** — "A sleeping woman waking in disarranged bedclothes" → Contradicted by the image: the single figure is standing, fully dressed in a chemise and cap, moving toward an open door. There is no sleeping figure and no visible bedclothes in disarray. The description's opening sentence describes a scene that is not in the frame. _(image — standing figure at a doorway with a staircase behind, bed and chair of men's clothes at the right)_

Second reviewer (upheld): The quoted opening is in the description, and the image plainly contradicts it. One woman stands upright in a white chemise and a pink-ribboned cap, one breast bared. Her left arm reaches toward an open door with a staircase beyond. At right, a man's red coat, blue breeches and white stockings lie over a chair beside a curtained bed, with shoes on the floor. Nobody is asleep or lying in bedclothes. The first agent's proposal is mostly right, with three small problems. Her hand reaches toward the door rather than resting on its frame. She looks down toward the chair and bed, not 'back into the room'. And it drops the accents from Musée Cognacq-Jay. The correction below fixes those.

**Current:**

> A sleeping woman waking in disarranged bedclothes, the subject of Boilly's 'Le Doux Réveil' (The Gentle Awakening). Oil on canvas, catalogued J 7 in the Musée Cognacq-Jay, Paris. The boudoir scene is one of the lightly erotic interiors Boilly produced in the 1790s.

**Proposed:**

> A young woman in a white chemise and a lace cap tied with pink ribbon, one shoulder and breast bared, reaches toward an open door with a staircase beyond. She glances down toward a curtained bed and a chair heaped with a man's red coat, blue breeches and white stockings, his shoes on the floor beside it. Oil on canvas, catalogued J 7 in the Musée Cognacq-Jay, Paris. The boudoir scene is one of the lightly erotic interiors Boilly produced in the 1790s.

_Notes: Medium (oil on canvas), inventory J 7, the Cognacq-Jay and the 1790s dating are all confirmed (Paris Musees record: oil on canvas, c.1795, J 7, 32.5 x 23.5 cm) and are preserved. The Paris Musees page carries no description of what is depicted, so the replacement is grounded only in the image. One caveat for a human: the picture as rendered does not obviously illustrate a 'sweet awakening', which raises a small possibility that the Commons file (a 'remastered colour' derivative) is mis-titled. Either way the current description does not match the image the site serves._

### `collection-of-beauty-durer-vier-reiter`

**dürer vier reiter** — Albrecht Dürer, 1498 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A black-and-white relief print in bold outline: four horsemen surge from the upper right, one raising a sword, a crowned rider drawing a bow, and a gaunt old Death on a spent nag with a long fork; an angel flies above and trampled figures fill the lower right, while a monstrous hell-mouth swallows a mitred figure at lower left. Durer's AD monogram sits on a tablet at the bottom edge.

- **high/wrong-medium** — "Created in 1498 using copper plate engraving" → The Apocalypse series of 1498 was printed from woodblocks, not engraved copper plates. The image shows the heavy, uniformly weighted relief line of a woodcut, not the fine tapering burin work of an engraving. _(image \| knowledge - Durer's Apocalypse (Die heimliche Offenbarung Johannis, 1498) is a set of fifteen woodcuts; his copper engravings are a separate body of work)_
- **medium/wrong-medium** — "masterwork engraving" → Same error repeated in the first sentence: the sheet is a woodcut. _(image \| knowledge)_
- **low/style-hype** — "remains among the most iconic interpretations of the biblical subject in Western art history" → Empty superlative; also 'masterwork' in the opening clause. The description never says what is actually in the frame. _(house style)_

Second reviewer (upheld): Confirmed independently. The image is unmistakably a relief print: uniform, blocky black line with no tapering burin swells, white paper ground, the bold contour work of the 1498 Apocalypse blocks. Dürer's Apocalypse (Die heimliche Offenbarung Johannis, 1498, German and Latin editions) is a set of fifteen woodcuts; his copper engravings are a separate body of work. The description says both 'masterwork engraving' and 'Created in 1498 using copper plate engraving', so the wrong medium is asserted twice. Everything else the replacement describes checks out against the image: the AD monogram on a tablet at the bottom edge, the angel above, the gaunt Death on a spent nag with a long fork, the crowned rider drawing a bow, and — I cropped and enlarged the lower left to be sure — a hell-mouth swallowing a figure in a jewelled bishop's mitre. Only tightened the replacement: whether Dürer cut the blocks himself or a Formschneider did is still argued, so I changed 'cut the blocks' to 'designed'.

**Current:**

> Albrecht Dürer's masterwork engraving from his Apocalypse series, depicting the four horsemen riding forth as described in the Book of Revelation. Created in 1498 using copper plate engraving, this print exemplifies Northern Renaissance technique and remains among the most iconic interpretations of the biblical subject in Western art history.

**Proposed:**

> A woodcut from Dürer's Apocalypse: four horsemen ride down together from the upper right, one with a raised sword, a crowned rider drawing a bow, and a gaunt Death on a spent nag with a long fork, trampling a crowd underfoot while an angel flies overhead. At the lower left a monstrous hell-mouth swallows a figure in a bishop's mitre. Dürer designed the series and published it himself in 1498 in German and Latin editions; his AD monogram appears on a tablet at the bottom edge.

_Notes: The medium error is the whole finding and is not in doubt - the 1498 Apocalypse is the canonical woodcut series. Everything else in the original text (series, subject, 1498) is right. Commons extmetadata came back empty ('missing': true), so the image plus general knowledge is the basis._

### `collection-of-beauty-frederic-leighton-kittens`

**Kittens** — Frederic Leighton, 1880 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A young woman with reddish-blonde hair sits upright and barefoot on a couch covered with a leopard skin, in a deep plum-purple gown over gold-and-blue drapery, head bowed, pale roses in her lap; one kitten wearing a blue ribbon sits on the drapery beside her shoulder, and two lemons lie on the floor at the lower left.

- **high/wrong-subject** — "A reclining woman in pale drapery plays with a litter of kittens, her arm stretched along a couch" → Four claims in one sentence, all contradicted: she sits upright rather than reclining; the drapery is deep plum-purple, not pale; there is one kitten, not a litter; and she is not playing with it — her head is bowed and her hands hold roses. _(image — verified at full size and on a zoomed crop of the kitten, which is single and seen from behind)_

Second reviewer (upheld): I checked the image myself and every point holds. The figure sits upright on a couch covered with a leopard skin, head bowed, bare feet on the floor. She is not reclining, and her arm is not stretched along the couch. Her gown is a deep plum-purple silk, not pale. Only one kitten is visible, wearing a blue ribbon, on the drapery at the right by her shoulder. She is not playing with it: her right hand holds a small sprig of pale pink roses in her lap. Two lemons with leaves lie at the lower left. The measurements in the second sentence match Commons (47 x 31 in, 119.4 x 78.8 cm), so that sentence stays. The figure reads as a girl rather than a grown woman, and Commons files it under 'Paintings of children'. The replacement below says 'girl' and names the one rose sprig she actually holds.

**Current:**

> A reclining woman in pale drapery plays with a litter of kittens, her arm stretched along a couch. Leighton's canvas measures roughly 119 by 79 cm and treats a domestic subject far removed from the classical and mythological scenes for which he was known.

**Proposed:**

> A barefoot girl in a deep plum gown sits on a couch spread with a leopard skin, her head bowed over a sprig of pale roses in her hand. A single kitten in a blue ribbon perches on the drapery at her shoulder, and two lemons lie on the floor beside her. Leighton's canvas measures roughly 119 by 79 cm and treats a domestic subject far removed from the classical and mythological scenes for which he was known.

_Notes: The second sentence is fine and is preserved: the Commons imageDescription gives 47 x 31 in (119.4 x 78.8 cm), matching 'roughly 119 by 79 cm'. Only the opening scene description is wrong, and it is wrong on posture, colour, count and action, hence 'major' rather than 'minor'. Commons categorises the file under 'Dorothy Dene' and 'Paintings of children'; the description does not name a sitter and the replacement does not either._

### `collection-of-beauty-garcon-au-gilet-rouge-par-paul-cezanne-aquarelle-yorck`

**Garçon au gilet rouge** — Paul Cézanne, 1889 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Watercolour over pencil: a boy in a red waistcoat over a white shirt sits with his legs crossed on a low seat, hands in his lap, a green wash suggesting foliage at left; large areas of paper left bare.

- **high/wrong-collection** — "This watercolour version, in the Barnes Foundation, Philadelphia" → The Barnes Foundation's Boy in a Red Vest is an oil on canvas, one of the four oil versions (the others in the Buhrle Collection, MoMA and the National Gallery of Art). No source places this watercolour at the Barnes; one watercolour of the subject is recorded in a private collection. _(web:https://collection.barnesfoundation.org/objects/6964/ (oil on canvas) and web:https://en.wikipedia.org/wiki/The_Boy_in_the_Red_Vest (four oils, locations listed))_

Second reviewer (upheld): The quoted text is in the description, and the image is plainly a watercolour over pencil - loose washes, visible pencil contours, large areas of bare paper - matching the Commons category '1890s watercolor paintings'. The Barnes Foundation's Boy in a Red Vest is BF20, oil on canvas, 66 x 55 cm, bought by Barnes from Galerie Barbazanges in 1923; the four museum versions of the subject (Barnes, Bührle, MoMA, National Gallery of Art) are all oils, and no source I could find places any watercolour of the subject at the Barnes. The description therefore attaches this sheet to a collection that holds a different work in a different medium. 'Major' is the right severity - artist, model, medium and date are otherwise correct. I kept the reviewer's decision to name no collection rather than guess, and revised only to restore the accents on Cézanne, which the replacement dropped, and to keep the green foliage wash that is actually in the picture.

**Current:**

> The Italian model Michelangelo di Rosa in a red waistcoat, one of several studies Cézanne made of the boy around 1889 to 1890. This watercolour version, in the Barnes Foundation, Philadelphia, leaves the paper bare in places between washes. Cézanne used the repeated pose to test the figure against surrounding space.

**Proposed:**

> The Italian model Michelangelo di Rosa in a red waistcoat, seated with his legs crossed and his hands in his lap, one of several studies Cézanne made of the boy around 1889 to 1890. Watercolour over pencil, a green wash standing in for foliage at the left and the paper left bare in places between the washes. Cézanne used the repeated pose to test the figure against the space around it.

_Notes: The medium (watercolour) and the model are right; the collection is the fabrication - it looks like the Barnes oil was mistaken for this sheet. I left the collection out entirely rather than guess at the watercolour's owner. Date range matches the Commons date field (between 1889 and 1890)._

### `collection-of-beauty-gauguin-paul-sacred-spring-sweet-dreams-nave-nave-moe`

**Sacred Spring: Sweet Dreams** — Paul Gauguin, 1894 · collection-of-beauty · prior audit: fabricated-fixed · confidence high · verify: upheld

> **What the image shows.** Oil painting: two Tahitian women seated on pink ground in the foreground, one resting her head on her hand, the other holding a red-and-yellow mango near her face with white flowers in her hair; behind them a crouching bather and a standing figure in a white wrap by the water, and further off a line of small figures near a carved idol under trees. Inscribed 'NAVE NAVE MOE' and signed at lower left.

- **high/wrong-collection** — "entered the Hermitage Museum with the Shchukin collection" → The painting came to the Hermitage from Ivan Morozov's collection, by way of the State Museum of New Western Art in 1931 - not from Shchukin. _(web:https://en.wikipedia.org/wiki/Nave_nave_moe - acquired by Morozov in 1907, transferred to the Hermitage in 1931)_
- **medium/invented-detail** — "the other holding a small red flower" → She holds a red-and-yellow fruit (a mango); the flowers in the picture are the white blossoms pinned in her hair. _(image - close crop of the right-hand figure)_

Second reviewer (upheld): Both parts hold. Provenance: the canvas was bought by Ivan Morozov in 1907, nationalised into the State Museum of Modern Western Art and transferred to the Hermitage in 1931 - nothing links it to Shchukin, so 'entered the Hermitage Museum with the Shchukin collection' is a false provenance claim, and it survived an earlier pass (the record is already flagged fabricated-fixed), which makes it worth correcting now. Image: on a close crop the right-hand woman holds a rounded red object with a yellow-green shoulder up near her chin - a fruit, not a flower; the flowers in the picture are the white blossoms at her ear and the white lily-like plant in the right foreground. I also checked the reviewer's background reading and it is right: a large carved idol stands under the trees at upper right with a group of dancing figures beside it, plus a crouching bather and a standing figure in a white wrap at the water. My only change to the replacement is 'red fruit' rather than 'red mango' - the mango identification is plausible and common but I could not source it, and the correction does not depend on naming the species.

**Current:**

> Two Tahitian women sit cross-legged in the foreground beside a sacred pool — one in a dreaming reverie with her head resting on her hand, the other holding a small red flower. Behind them, additional figures move near the water's edge in a lush tropical landscape. Inscribed 'Nave nave moe' (Sacred Spring, Sweet Dreams), the canvas was painted in 1894 and entered the Hermitage Museum with the Shchukin collection.

**Proposed:**

> Two Tahitian women sit on the ground in the foreground beside a pool - one in a dreaming reverie with her head resting on her hand, the other holding a red fruit up near her face, white flowers at her ear. Behind them a bather crouches at the water, a figure in a white wrap stands by, and further off a group dances beside a carved idol under the trees. Inscribed 'Nave nave moe' (Sacred Spring, Sweet Dreams), the canvas was painted in 1894; it was bought by Ivan Morozov in 1907 and reached the Hermitage in 1931 by way of the Museum of New Western Art.

_Notes: This one is already marked fabricated-fixed in the ledger, so the Shchukin provenance survived an earlier pass. Morozov provenance and the 1931 transfer are documented. The 'small red flower' is a mango in the image._

### `collection-of-beauty-george-frederic-watts-by-george-andrews`

**George Frederic Watts** — unattributed, 1897 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** An elderly bearded man in a long red robe and black skullcap sits on a stone bench in a vine-shaded loggia, hands folded in his lap, looking to the left. Behind him hangs a large glazed roundel of the Virgin and Child in blue, white and gold; potted orange trees and an oleander stand on the brick paving, with nasturtiums and grass in the foreground.

- **high/no-visual-content** — "This set of images was gathered by User:Dcoetzee from the National Portrait Gallery, London website using a special tool." → The entire description is Wikimedia Commons upload boilerplate about a batch import and its copyright screening. It describes nothing in the picture and would read to a visitor as nonsense. _(catalogue record - the text is a verbatim copy of the Commons imageDescription, including the batch-evaluation and 1923 publication clauses)_
- **metadata/`artist`** — `null` → `unresolved - Commons lists the author as 'anonymous' but categorises the file under Louis Reid Deuchars` _(Commons categories include 'Louis Reid Deuchars' alongside 'Artworks with Wikidata item missing author'; the boilerplate says the painter died 1927, which matches Deuchars (d. 1927). Not certain enough to set.)_

Second reviewer (upheld): The description is copied word for word from the Commons imageDescription boilerplate about Dcoetzee's NPG batch upload and its copyright screening. It says nothing about the painting, so it is unusable. The image matches the first agent's observation: an old bearded man in a red robe and black skullcap sits under a vine-hung porch, a della Robbia-style glazed roundel behind him, potted orange trees and an oleander to the right, nasturtiums at lower left. The replacement has two small over-reads. The seat is a plain wooden bench, not visibly a 'stone bench'. The roundel shows the Virgin kneeling in adoration before the Child, with angels, rather than a generic Virgin and Child. I corrected both.

**Current:**

> This set of images was gathered by User:Dcoetzee from the National Portrait Gallery, London website using a special tool. All images in this batch have been evaluated manually for evidence that the artist probably died before 1939, or that the work is anonymous or pseudonymous and was probably published before 1923. 1897 work, painter died 1927.

**Proposed:**

> An elderly bearded man in a long red robe and a black skullcap sits on a bench under a vine-hung porch, his hands folded, looking away to the left. Behind him hangs a large glazed roundel in blue, white and gold of the Virgin kneeling before the Christ Child, and potted orange trees and an oleander stand on the brick paving, with nasturtiums in the grass at lower left. A portrait of the painter George Frederic Watts dated 1897, in the National Portrait Gallery, London, made after a photograph by George Andrews.

_Notes: Verdict is 'major' rather than 'minor' because the whole text is unusable and its assertions are about a Commons upload batch, not the artwork - a reader is actively misinformed about what they are reading. The NPG holding is supported by the Commons category 'Portrait paintings in the National Portrait Gallery, London', and the 'after a photograph by George Andrews' phrasing comes from the Commons object name. I deliberately did not name the painter._

### `collection-of-beauty-georges-de-la-tour-rixe-de-musiciens-google-art-project`

**The Musicians' Brawl** — Georges de La Tour, 1625 · collection-of-beauty · prior audit: accurate · confidence high · verify: upheld

> **What the image shows.** Five half-length figures crowded against a dark ground in even daylight: a woman in a white headcloth recoiling at the left, an old man with a hurdy-gurdy at his hip gripping a knife and a wooden pipe, a white-bearded man in red and blue reaching at his face with a small object in one hand, and two more men at the right, one grinning and holding a violin, the other with a shawm.

- **high/invented-detail** — "a companion squeezes a lemon to feign a wound" → The lemon is being squeezed into the old hurdy-gurdy player's eyes, to test whether his blindness is genuine; it is not used to fake a wound. _(web:https://www.getty.edu/education/teachers/classroom_resources/curricula/when_art_talks/downloads/musicians_brawl.pdf \| the Getty's account: the central man strikes the old musician with a shawm and squeezes a lemon into his eyes to determine whether his blindness is feigned)_
- **medium/unsupported-claim** — "come to blows over a hurdy-gurdy" → States a cause for the fight that no source gives; the hurdy-gurdy is the old man's own instrument and is not the object being fought over. _(web:https://www.getty.edu/education/teachers/classroom_resources/curricula/when_art_talks/downloads/musicians_brawl.pdf \| describes a brawl between rival itinerant musicians, with the hurdy-gurdy slung on the man who defends himself)_

Second reviewer (upheld): Both quoted phrases are in the description. The Getty (the painting's owner) says the man in the centre hits the hurdy-gurdy player with a shawm and squeezes a lemon into his eyes to test whether his blindness is real. 'Squeezes a lemon to feign a wound' reverses that meaning, and no source says the fight is 'over a hurdy-gurdy'; the instrument hangs on the old man at the left. The image matches the Getty account: a knife in the left man's hand, a pipe between the two, and the bearded man in red reaching at his face. The finding stands. The proposed replacement has flaws, though. It calls all five figures musicians, but one is an old woman. It also reads as if the attacker and the lemon-squeezer were two people, when they are the same man. The revision fixes both.

**Current:**

> Itinerant street musicians come to blows over a hurdy-gurdy, one wielding a knife as a companion squeezes a lemon to feign a wound. La Tour stages the brawl in cool daylight, his earlier Caravaggesque manner before he fully turned to candlelit nocturnes.

**Proposed:**

> Two old street musicians fight while their companions watch. The hurdy-gurdy player at the left defends himself with a knife, as the bearded man in red strikes him with a shawm and squeezes lemon juice into his eyes to test whether his blindness is faked. An old woman at the far left looks on in alarm, and two musicians at the right grin at the fight. La Tour stages the brawl in cool daylight, his earlier Caravaggesque manner before he fully turned to candlelit nocturnes.

_Notes: The prior pass marked this accurate; the lemon reading is the part that does not survive checking. The Getty (which owns the painting) gives the eye test explicitly. I left the second sentence untouched - the daylight handling and the placement before the nocturnes are correct. I counted five figures in the picture, one of them the woman at the left, whom I described only as onlookers to avoid over-identifying her._

### `collection-of-beauty-gugg-madame-cezanne`

**Madame Cézanne** — Paul Cézanne, 1885 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** An unfinished bust-length portrait of a woman: the face modelled in pink, blue and green touches with dark hair, the blouse and shoulders left as blue drawn outlines on bare, unpainted canvas, a loose patch of blue-green brushwork behind her head.

- **high/no-visual-content** — "This file was provided to Wikimedia Commons by the Solomon R. Guggenheim Museum as part of a cooperation project . The Solomon R." → The entire description is a scraped Wikimedia Commons file-donation notice, truncated mid-sentence. It says nothing whatever about the artwork - not the sitter, not the subject, not the fact that the canvas is conspicuously unfinished. _(commons - the text is identical to the file's imageDescription licensing blurb)_

Second reviewer (upheld): The description is word for word the Commons donation boilerplate from sourceEvidence.imageDescription, cut off mid-sentence. It says nothing about the artwork. The image is a clearly unfinished bust portrait: the face is modelled in pink, mauve and green, and blue-green brushwork sits behind the head. The blouse is mostly blue line drawing on bare canvas, but the sitter's left shoulder is filled in dark blue. So the replacement's 'outline drawing' needs a small softening. Its '1885' date sounds firmer than the record supports, since Cézanne portraits of Hortense are usually dated to a span of years. I hedged it to 'about 1885'. Madame Cézanne means Hortense Fiquet, which is standard.

**Current:**

> This file was provided to Wikimedia Commons by the Solomon R. Guggenheim Museum as part of a cooperation project . The Solomon R.

**Proposed:**

> An unfinished bust-length portrait of the artist's wife, Hortense Fiquet. Her face is modelled in touches of pink, mauve and green, and loose blue-green strokes fill the space behind her head. Her blouse is mostly blue line drawing on bare canvas, with dark blue filled in over one shoulder. It dates to about 1885 and belongs to the Thannhauser Collection of the Solomon R. Guggenheim Museum, New York.

_Notes: Graded major because the field contains no description at all, not because a claim is false. Sitter identification follows the work's own title 'Madame Cezanne' (Hortense Fiquet); if the reviewer prefers not to name her, 'Madame Cezanne' alone is safe. Date 1885 and the Guggenheim/Thannhauser location come from the record and Commons categories._

### `collection-of-beauty-huang-binhong-landscape`

**huang-binhong-landscape** — Huang Binhong, 1937 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A vertical hanging scroll in ink and light colour: layered mountains and rock faces built from dense dark dotting and dry brushwork, a small pavilion among trees on a slope, a tiny boat with a figure on the water at lower left, and a column of calligraphy with the artist's signature and red seals at the upper right.

- **high/wrong-attribution** — "the influential Chinese-Taiwanese painter" → Huang Binhong was Chinese; he worked in Shanghai, Beijing and Hangzhou and died in Hangzhou in 1955. Nothing connects him to Taiwan. _(knowledge; commons credit is the Shanghai Museum)_
- **low/unsupported-claim** — "that Binhong championed throughout his career" → 'Binhong' is the given name; the surname is Huang. Using it as a surname is an error of the same kind as calling Van Gogh 'Vincent Gogh'. _(knowledge)_
- **low/no-visual-content** — "A landscape scroll painting by Huang Binhong" → The description never says what is in the picture - mountains, pavilion, boat, inscription and seals all go unmentioned. _(house style / image)_

Second reviewer (upheld): Confirmed. Huang Binhong (1865-1955) was Chinese - born in Jinhua, Zhejiang, ancestral home She County, Anhui, active in Shanghai and Beijing and finally Hangzhou, where he died; 'Chinese-Taiwanese' is wrong (it looks like a confusion with Huang Junbi, who did move to Taiwan). 'Binhong' used as a surname is likewise an error - Huang is the surname. And the description says nothing about the picture, which the image shows to be a hanging scroll of layered mountains in ink and light ochre with a pavilion on a ridge, a small boat carrying one figure at lower left, and a long inscription with signature and a red seal at upper right. One caution about the reviewer's replacement, which is why I rewrote it: the inscription is dated 丙寅八月, the eighth month of a bingyin year, i.e. 1926, not the 1937 that Commons and the record assert. I could not resolve that conflict, so the description should not assert a painting year at all; the Shanghai Museum holding (Commons credit link plus the 'Paintings in the Shanghai Museum' category) is safe. The inscribed quatrain is about an enviable old fisherman with rod and small boat beside the willows, which the boat at lower left answers - grounded and worth saying.

**Current:**

> A landscape scroll painting by Huang Binhong (1865–1955), the influential Chinese-Taiwanese painter, art historian, and journalist. This work exemplifies the traditional Chinese mountain landscape tradition that Binhong championed throughout his career.

**Proposed:**

> A hanging scroll in ink and light colour: mountain slopes built up from dense dark dotting and dry, broken brushwork, a pavilion among trees on a ridge, and a small boat carrying a single figure on the water below. The inscription at the upper right, followed by the artist's signature and a red seal, is a quatrain on an old fisherman with his rod and skiff beside the drooping willows - the boat in the painting answers it. Huang Binhong (1865-1955), a Chinese painter, art historian and journalist who worked in Shanghai, Beijing and finally Hangzhou, built his landscapes from accumulated layers of ink like these. The scroll is in the Shanghai Museum.

_Notes: The nationality error is the substantive finding. The Shanghai Museum attribution comes from the Commons credit link and the 'Paintings in the Shanghai Museum' category; the 1937 date is the Commons date field and matches the record. I did not attempt to read the inscription._

### `collection-of-beauty-indischer-maler-um-1615-i-001`

**Ibrahim 'Adil Shah II holding instruments** — Ali Riza, 1615 · collection-of-beauty · prior audit: minor-fixed · confidence high · verify: upheld

> **What the image shows.** A miniature on a dark ground: a bearded man stands three-quarter left in a night garden, wearing a white jama with a gold-patterned shawl and sash and a gold-and-white turban. His raised right hand holds two small paddle-shaped objects, one gold and one green, against his chest; his lowered left hand holds a bunched dark green cloth. A pale palace with domed pavilions stands at the upper left, dark foliage fills the right, and flowering plants edge the foreground.

- **high/wrong-subject** — "holding a small object — likely a flower — at chest height" → Contradicted by the image and by the record's own title. At 4x zoom the raised hand holds two elongated paddle-shaped objects, one gold and one teal - castanets or clappers, the attribute that identifies Ibrahim 'Adil Shah II as a musician. The record's title and the Commons objectName are both 'Ibrahim 'Adil Shah II holding instruments'. The description also silently drops the dark green kerchief in the lowered hand. _(image (zoomed crops of both hands) and catalogue record title / commons objectName: 'Ibrahim 'Adil Shah II holding instruments')_
- **low/internal-contradiction** — "likely a flower" → The description contradicts the title field of the same catalogue row, which names the instruments. _(catalogue record - title field)_
- **metadata/`movement`** — `null` → `Deccani painting` _(Commons categories place it in 1610s India, Karnataka, Bijapur ruler; description itself calls it Deccani.)_
- **metadata/`nationality`** — `null` → `Indian` _(Commons categories '1610s paintings from India', 'Paintings from India in the British Museum')_

Second reviewer (upheld): Confirmed in the image. The raised hand holds two elongated paddle-shaped objects against the chest, one gold and one green. They are not a flower. The lowered hand holds a bunched green cloth. The row's own title reads 'holding instruments'. The Met's record of this work, and descriptions derived from the British Museum, state that he holds a pair of castanets to show his love of music. The replacement is accurate. One small fix: the palace sits at the upper left beside the foliage, not 'behind the trees'.

**Current:**

> A Deccani miniature of around 1615 depicting Ibrahim Adil Shah II of Bijapur standing in a garden, wearing golden robes over a white garment and a white turban, and holding a small object — likely a flower — at chest height. The refined Bijapur idiom is evident in the jewel-like colour, precise draughtsmanship, and lush landscape setting with a palace visible in the background. The work is attributed to Ali Riza.

**Proposed:**

> Ibrahim 'Adil Shah II of Bijapur stands in a dark garden, a gold-patterned shawl and sash over a white jama and a gold-and-white turban on his head. He holds a pair of small castanets against his chest and a bunched green kerchief in his lowered hand. Flowering plants edge the foreground, dense foliage fills the right, and a pale palace with domed pavilions stands at the upper left. The Deccani miniature dates to about 1615 and is attributed to Ali Riza, the painter known as the Bodleian Painter. It is in the British Museum.

_Notes: Another prior 'minor-fixed' verdict that left the central detail wrong - the hedge 'likely a flower' reads as a guess made without zooming in, and it contradicts the title sitting in the same row. British Museum attribution comes from the Commons credit URL (britishmuseum.org/collection/object/W_1937-0410-0-2) and 'Paintings from India in the British Museum'. 'Castanets' is my identification from the image; if a reviewer prefers to stay closer to the source, 'a pair of small instruments' is exactly what the museum title supports._

### `collection-of-beauty-jean-francois-millet-femme-filature-1855-60`

**Woman Spinning** — Jean-François Millet, 1855 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A woman sits on a rush-seated chair at a treadle spinning wheel in a dim interior, wearing a white cap, red bodice and long pale skirt, holding a wool-wrapped distaff with the thread running to the bobbin; a basket of bobbins stands on the floor at right and a broom hangs on the wall behind.

- **high/wrong-subject** — "A standing woman" → She is seated on a chair, not standing. _(image; commons category '19th-century oil paintings of sitting women at full length')_
- **high/invented-detail** — "her spindle turning at her side" → There is no hand spindle: she works a large treadle spinning wheel, which the description never mentions. _(image - the wheel, treadle, flyer and bobbin occupy the left half of the canvas)_

Second reviewer (upheld): The woman is clearly seated on a rush-seated chair, working a spinning wheel whose wheel, frame and bobbin fill the lower left, her foot on its treadle board; she holds a wool-wrapped distaff. There is no hand spindle at her side and she is not standing. Commons category '19th-century oil paintings of sitting women at full length' agrees. The whole visual sentence is wrong while the dating and Clark ownership are correct, so 'major' is the right severity. The replacement is accurate to the image (distaff, basket of bobbins on the floor) and keeps the correct second sentence.

**Current:**

> A standing woman draws thread from a distaff, her spindle turning at her side. Millet returned to spinners repeatedly in these years; the oil, painted about 1855 to 1860, belongs to the Sterling and Francine Clark Art Institute in Williamstown.

**Proposed:**

> A woman sits at a treadle spinning wheel in a dim interior, drawing thread from the wool-wrapped distaff she holds, a basket of bobbins on the floor beside her. Millet returned to spinners repeatedly in these years; the oil, painted about 1855 to 1860, belongs to the Sterling and Francine Clark Art Institute in Williamstown.

_Notes: Second sentence is correct and preserved verbatim (Commons credit line and categories confirm the Clark, circa 1855-1860). Only the opening visual sentence needed replacing._

### `collection-of-beauty-jean-frederic-bazille-etude-pour-une-vendange-left-1868`

**Étude pour une vendange** — Frédéric Bazille, 1868 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** An empty landscape: rows of vines worked in loose green strokes over red-brown earth in the foreground, a band of green fields and dark trees beyond, low violet hills along the horizon and a pale blue sky with a few white clouds. There is not a single human figure in the picture.

- **high/wrong-subject** — "Figures gathering grapes in a Mediterranean vineyard" → There are no figures at all in this study. It is a pure landscape of the vineyard and the hills behind it — the harvesters belong to the finished composition, not to this panel. _(image — no human figure anywhere in the frame)_

Second reviewer (upheld): Quoted text opens the description verbatim. I read the image and then magnified the foreground and the middle band at 2x looking specifically for stooping harvesters: there is not one human figure in the picture. The only dark upright form in the foreground, at the edge of the red earth path, is a vine trunk with its shadow, not a person. The picture is a pure landscape - vine rows in loose green strokes over red-brown earth, a band of green fields and dark trees, low violet hills, pale sky with a few clouds - so 'Figures gathering grapes' comes from the title, not the panel. The rest of the record sentence is corroborated by the Commons imageDescription (38 x 46 cm, Musee Fabre, Montpellier), and the Bazille family estate at Meric near Montpellier is well established, so the replacement drops nothing true and adds nothing ungrounded.

**Current:**

> Figures gathering grapes in a Mediterranean vineyard, the left panel of a study Bazille made toward a grape-harvest composition. Oil on canvas, 38 by 46 cm, held at the Musée Fabre in Montpellier, the city near which the Bazille family kept their estate at Méric.

**Proposed:**

> A vineyard on a Mediterranean hillside, the vine rows laid in loose green strokes over red earth with fields, dark trees and low violet hills closing the distance under a pale sky. This is the left-hand study Bazille made toward a grape-harvest composition; oil on canvas, 38 by 46 cm, held at the Musée Fabre in Montpellier, the city near which the Bazille family kept their estate at Méric.

_Notes: Classic case of a description written from the title rather than the picture: 'une vendange' implies harvesters, and the study has none. The rest of the record sentence (38 x 46 cm, Musée Fabre) is confirmed by the Commons imageDescription and is preserved verbatim; the Méric estate is well established for the Bazille family._

### `collection-of-beauty-jean-frederic-bazille-little-italian-street-singer-1866`

**Petite Italienne chanteuse des rues** — Frédéric Bazille, 1866 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A girl stands FULL LENGTH on a pavement, seen head to foot in heavy black shoes, wearing a dark hat trimmed with pink and red flowers, a fringed cream shawl over a red bodice, and a green and red banded skirt over a dark underskirt. She holds a violin against her body in one hand and its bow in the other, and looks up and to her right. Behind her is a Paris street corner with tall buildings, a lamp, a dark-coated man at left and blurred figures at right. Signed 'F. Bazille' at lower right.

- **high/wrong-subject** — "shown at half length as a street singer" → The figure is shown full length, feet included. Commons even files the work under '19th-century oil paintings of standing girls at full length'. _(image — the girl's shoes and the pavement are visible at the bottom of the canvas; commons — category '19th-century oil paintings of standing girls at full length')_
- **high/wrong-subject** — "Bazille worked the figure against a plain ground" → The background is a fully painted Paris street corner with buildings, sky, a lamp and other figures — the opposite of a plain ground. _(image)_
- **medium/invented-detail** — "A young Italian girl in a headscarf" → She wears a flower-trimmed hat over a dark hood, not a headscarf. _(image)_
- **medium/wrong-subject** — "concentrating the colour in the costume and complexion" → Not false on its own, but it completes a description of a studio half-length portrait; the picture's most conspicuous object, the violin and bow she is holding, goes unmentioned. _(image — violin and bow held in both hands, centre of the canvas)_

Second reviewer (upheld): All quoted phrases are in the description. The image clearly shows the girl full length down to her black shoes on the pavement, wearing a hat trimmed with pink and red flowers (not a headscarf), holding a violin and bow, against a painted street of tall buildings, cloudy sky, a dark-coated man at left and figures at right; signed 'F. Bazille' lower right. 'Half length' and 'plain ground' are flatly contradicted. Commons category 'standing girls at full length' agrees. Record facts (131 x 98 cm, 1866, Musee Fabre) are correct, so major rather than fabricated is right. Small tweak to the replacement: 'Paris' is not verified from the source evidence, so I say 'city street'; the costume sentence is sourced to Commons ('Ciociaro costume').

**Current:**

> A young Italian girl in a headscarf shown at half length as a street singer. Oil on canvas, 131 by 98 cm, painted in 1866 and held by the Musée Fabre, Montpellier. Bazille worked the figure against a plain ground, concentrating the colour in the costume and complexion.

**Proposed:**

> A girl in a flower-trimmed hat and fringed shawl stands full length on a city pavement, a violin held against her body and its bow in her other hand, with tall buildings and passers-by behind her. Oil on canvas, 131 by 98 cm, painted in 1866 and held by the Musée Fabre, Montpellier. She wears the Italian ciociaro costume, and the canvas is signed at lower right.

_Notes: The record-level facts in the old text are all correct — the Commons imageDescription gives 131 x 98 cm, 1866, Musée Fabre, Montpellier — so I kept that sentence verbatim. What is wrong is the entire visual account: half length, headscarf, plain ground, no instrument. The ciociaro attribution comes from the Commons categories ('Ciociaro costume in 1866'). I stopped short of 'fabricated' only because the identity, medium, size, date and collection are all right; the error is a mis-seen scene rather than an invented provenance._

### `collection-of-beauty-johann-heinrich-fussli-064`

**Johann Heinrich Füssli 064** — Henry Fuseli, 1780 · collection-of-beauty · prior audit: accurate · confidence high · verify: upheld

> **What the image shows.** A monochrome brown-wash drawing on paper heightened with white, not an oil: the nude body of Achilles lies dead and steeply foreshortened across the foreground shore, a round shield beneath him and a long spear beside him; a draped figure sits high on the rocks at the upper right with an arm raised, and a small pale figure skims low over the dark sea at the upper left. An ink inscription runs along the lower left margin and a signature along the lower right.

- **high/wrong-subject** — "Thetis bends in mourning over the corpse of her son Achilles" → Thetis is nowhere near the body. She is seated high on the rocks at the upper right, separated from the corpse by the whole width of the sheet, with one arm raised. The distance between mourner and dead son is the composition's point; 'bends over' collapses it. _(image)_
- **medium/wrong-medium** — "the painter's sinuous neoclassical line" → The work is a wash drawing on paper — visible paper tone, brown monochrome washes, white heightening, and an ink inscription in the margin — not a painting. The Commons categories are self-contradictory on this point ('1780 paintings' and 'German paintings in the Art Institute of Chicago' alongside 'Drawings by Johann Heinrich Füssli in the Art Institute of Chicago'). _(image; commons — categories list the work under both paintings and drawings)_
- **metadata/`medium (not stored on the record)`** — `implied 'painting' by the description` → `monochrome wash drawing on paper, heightened with white` _(image — paper tone, brown washes, ink inscription; commons — 'Drawings by Johann Heinrich Füssli in the Art Institute of Chicago')_

Second reviewer (upheld): Upheld, and the prior ledger status of 'accurate' was wrong. In the image Achilles lies dead and steeply foreshortened across the foreground shore on his round shield, spear beside him; Thetis is a draped figure seated high on the rocky outcrop at the FAR upper right, head bowed on a raised arm, separated from the body by the whole width of the sheet. The Art Institute of Chicago's own curatorial text says exactly this: the dead Achilles fills the foreground sprawled upon his shield, and his mother emerges from a rocky outcropping at right with her arms spread in grief. 'Bends in mourning over the corpse' collapses the distance that is the composition's whole point. The AIC also gives the medium as brush and brown and brownish-red wash over graphite on cream laid paper, 41 × 55.7 cm — matching the record's realDimensions — so this is a drawing, and the image shows paper tone, margins, an ink inscription at lower left and a collector's stamp. I did downgrade the first agent's second issue: 'the painter's sinuous neoclassical line' does not actually assert oil paint, so that is a weak medium complaint on its own; the staging error alone carries the major grade. The first agent's replacement also asserts white heightening, which the AIC medium line does not support — corrected below.

**Current:**

> The sea-nymph Thetis bends in mourning over the corpse of her son Achilles, her grief amplified by the painter's sinuous neoclassical line. Fuseli reinterprets the Homeric scene through the proto-Romantic lens of sublime emotion, giving the figures attenuated, almost weightless poise.

**Proposed:**

> Achilles lies dead across the foreground shore, sprawled on his round shield and steeply foreshortened, his spear along the sand beside him; his mother, the sea-nymph Thetis, sits high on the rocky outcrop at the upper right with an arm raised in grief, and a small pale figure skims low over the dark sea behind. Fuseli built the scene from boldly applied brown and brownish-red washes over graphite on laid paper, with the stage-like setting and violent light-dark contrasts that run through his mythological drawings. The sheet is inscribed in ink along the lower left margin and signed at the lower right.

_Notes: This carries a prior ledgerStatus of 'accurate', which I think was wrong: the earlier pass appears to have accepted the title's narrative without checking the arrangement of the figures. The subject (Thetis mourning the dead Achilles, 1780) is right; the staging and the implied medium are not. Judging medium from a reproduction is genuinely uncertain, so I hedged to 'monochrome wash' rather than naming a specific ink or bistre. I left the small pale figure over the sea at the upper left out of the replacement — it may be a nereid or a bird and I could not tell._

### `collection-of-beauty-john-constable-a-boat-passing-a-lock`

**The Lock** — John Constable, 1824 · collection-of-beauty · prior audit: accurate · confidence high · verify: upheld

> **What the image shows.** An upright landscape: a man in a red waistcoat leans hard on the beam of a wooden lock while a barge with a boy aboard waits in the water at the right; a large tree fills the upper right, a distant church tower and flat meadows lie beyond, and heavy white-and-grey clouds break open across the left of the sky.

- **high/unsupported-claim** — "the picture was the only one of Constable's six-footers to find a buyer during the artist's lifetime" → False. At least three other six-footers sold in Constable's lifetime: The White Horse went to John Fisher for 100 guineas in 1819, Stratford Mill to Fisher in 1820, and The Hay Wain (with View on the Stour and a Yarmouth piece) to the dealer Arrowsmith in 1824. The true and widely reported fact about The Lock is that it sold on the opening day of the 1824 Royal Academy exhibition, to James Morrison. _(web:https://en.wikipedia.org/wiki/The_White_Horse_(Constable) and https://www.nationalgallery.org.uk/paintings/john-constable-stratford-mill and https://en.wikipedia.org/wiki/The_Hay_Wain - all three sold before Constable's death in 1837)_

Second reviewer (upheld): The quoted claim is in the description, and it is false. The White Horse (bought by Fisher in 1819), Stratford Mill (1820) and The Hay Wain (sold to Arrowsmith in 1824) all found buyers in Constable's lifetime. Wikipedia's article on The Lock gives the probable source of the confusion. Morrison bought it for 150 guineas on opening day, 'the only occasion in Constable's career when a painting sold on its first day of exhibition'. It is also the six-footer that remained in private hands. The original garbled these facts into a false superlative. The first agent's replacement adds 'last ... to remain in private hands', which may date. I prefer the opening-day fact, which Wikipedia states outright. The image shows the man heaving on a lever at the lock gate, not leaning on a beam, so I adjusted that phrase too.

**Current:**

> A barge being lowered through the lock at Flatford Mill on the Stour, the lock-keeper leaning on the beam against a clearing sky. Exhibited at the Royal Academy in 1824 and sold on opening day, the picture was the only one of Constable's six-footers to find a buyer during the artist's lifetime.

**Proposed:**

> A barge waits to pass through the lock at Flatford Mill on the Stour, while the lock-keeper in a red waistcoat heaves on the lever of the gate beneath a clearing sky. Exhibited at the Royal Academy in 1824, it was bought on the opening day by the merchant James Morrison. It was the only time in Constable's career that a painting sold on its first day of exhibition.

_Notes: Ledger said 'accurate' - this is a miss by the earlier pass, and the false 'only one' claim is exactly the confident-superlative pattern to watch for. Both replacement facts are sourced: the opening-day sale to James Morrison and the picture's status as the last six-footer in private hands are reported in the coverage of its 2012 Christie's sale. The Flatford Mill location comes from the Commons image description. If the reviewer wants a maximally cautious edit, simply delete the final clause of the original sentence._

### `collection-of-beauty-john-singleton-copley-1738-1815-the-surrender-of-the-dutch-admiral-de-winter-to-admiral-duncan-at-t`

**The Surrender of the Dutch Admiral de Winter to Admiral Duncan at the Battle of Camperdown** — John Singleton Copley, 1799 · collection-of-beauty · prior audit: accurate · confidence high · verify: upheld

> **What the image shows.** Crowded quarterdeck scene: a tall officer in dark uniform with epaulettes and a star strides forward as an officer to his left offers a sword hilt-first; officers, seamen carrying a wounded man, and a bandaged sailor crowd around; a struck flag is gathered at the lower left, a ship burns on the horizon at the left, and boarding-nets and rigging rise at the right.

- **high/unsupported-claim** — "Copley finished the canvas in 1799 for the City of London" → The picture was not commissioned by the City of London. It was a commercial speculation painted without a commission; Copley hoped afterwards to interest the London alderman John Boydell in it, and that came to nothing. _(web:https://en.wikipedia.org/wiki/The_Battle_of_Camperdown — 'produced the work without being commissioned as speculation'; National Galleries of Scotland's own record is summarised the same way ('a commercial speculation rather than a State or private commission'))_

Second reviewer (upheld): The phrase 'for the City of London' is in the description, and it is wrong. The National Galleries of Scotland record (search snippet) calls the picture 'a commercial speculation rather than a State or private commission'. Wikipedia's article on the painting says Copley made it without a commission. He hoped to interest John Boydell, a City of London alderman, but no deal was made. The City of London link probably comes from Copley's Gibraltar painting, not this one. The image agrees with the rest of the description: the central admiral receives a sword held out by an officer on a crowded quarterdeck, and a ship burns at the left. A made-up patron counts as major. The replacement fixes only that clause and keeps the true facts (11 October 1797, Venerable, 1799, NG 2661).

**Current:**

> Admiral Duncan receives the sword of the defeated Vice-Admiral de Winter on the quarterdeck of HMS Venerable after the British victory off Camperdown on 11 October 1797. Copley finished the canvas in 1799 for the City of London, now in the National Galleries of Scotland (NG 2661).

**Proposed:**

> Admiral Duncan receives the sword of the defeated Vice-Admiral de Winter on the quarterdeck of HMS Venerable after the British victory off Camperdown on 11 October 1797. Copley painted the canvas in 1799 as a commercial speculation rather than to commission; it is now in the National Galleries of Scotland (NG 2661).

_Notes: ledgerStatus was 'accurate' — a previous pass let the patronage claim through. Everything else stands: battle date 11 October 1797, Duncan's flagship Venerable, 1799, NG 2661 at the National Galleries of Scotland. Only the seven words about the City of London need replacing._

### `collection-of-beauty-le-fils-de-l-artiste-paul-par-paul-cezanne`

**The Artist's Son** — Paul Cézanne, 1885 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A boy shown from the waist up in a blue-grey jacket over a striped shirt and a small black bowler hat, his face turned slightly and his eyes glancing to the viewer's right; behind him a patterned ochre and blue wall hanging or screen, and at the right edge a dark vertical form.

- **high/unsupported-claim** — "Paul was Cézanne's most frequent sitter." → Cézanne's most frequently portrayed sitter, apart from himself, was his wife Hortense Fiquet, with about 29 known portraits — far more than the portraits of his son. The superlative is false as stated and is the entire closing sentence. _(web:https://en.wikipedia.org/wiki/Marie-Hortense_Fiquet and https://www.metmuseum.org/exhibitions/listings/2014/madame-cezanne — Hortense Fiquet is described as the sitter for 29 portraits and Cézanne's most frequent model besides himself)_
- **low/wrong-colour** — "the face shaded in visible strokes of slate blue" → The face is modelled mainly in warm ochre and pink with cooler shadow along the jaw and neck; 'shaded in visible strokes of slate blue' overstates the blue. _(image — warm flesh tones with cool grey-blue only in the shadowed contours)_

Second reviewer (upheld): The quoted sentence is in the description. A web search confirms that the Met's 'Madame Cézanne' exhibition and the Wikipedia article on Marie-Hortense Fiquet both name Hortense as Cézanne's most frequent model, in 29 canvases. The superlative about Paul is therefore false. Paul was a frequent subject, especially in drawings, and the replacement keeps that point without the false claim. In the image, the face is modelled mostly in warm ochre and pink, with cool blue-grey only in the shadows at the eye, jaw and neck. The 'slate blue' wording overstates this (minor), and the replacement fixes it. The NGA Washington holding and the 1885-1890 date match the record. The patterned ochre background supports 'wall hanging'. The replacement is sound.

**Current:**

> The artist's son Paul shown from the waist up in a blue jacket and a small black bowler hat, glancing sideways. Oil on canvas worked between 1885 and 1890, the face shaded in visible strokes of slate blue, now in the National Gallery of Art, Washington. Paul was Cézanne's most frequent sitter.

**Proposed:**

> The artist's son Paul shown from the waist up in a blue jacket and a small black bowler hat, glancing sideways in front of a patterned wall hanging. Oil on canvas worked between 1885 and 1890, the face modelled in visible strokes with cool shadow along the jaw, now in the National Gallery of Art, Washington. Cézanne painted and drew his son repeatedly from childhood on.

_Notes: The date range and the National Gallery of Art both come straight from the Commons record. The replacement's last sentence keeps the true point (Paul was a recurring subject) without the false superlative. Note the catalogue year field is 1885, the start of the Commons range 1885-1890, which is defensible as-is._

### `collection-of-beauty-le-pont-d-argenteuil-claude-monet`

**Le Pont d` Argenteuil - Claude Monet** — Claude Monet, 1875 · collection-of-beauty · prior audit: minor-fixed · confidence high · verify: upheld

> **What the image shows.** Tall riverside grasses and flowering scrub fill the lower two thirds of the canvas; behind them a long low bridge on close-set slender piers crosses a strip of blue water, and a locomotive trails a plume of smoke along the top of it. Signed 'Cl. M. 75' at lower left.

- **high/wrong-subject** — "the road bridge at Argenteuil looks across dense riverside vegetation toward the rebuilt multi-arched span" → The bridge in the picture is a railway bridge with a train crossing it, not the road bridge, and it is not a multi-arched masonry span. The description also drops the train, which is the point of the picture. _(image — a 3x crop of the upper band shows a locomotive with a smoke plume on a long trestle-like deck; commons categories 'Paintings of the Railway bridge of Argenteuil by Claude Monet' and 'Paintings of trains by Claude Monet'; web:https://www.bellasartes.gob.ar/coleccion/obra/7743/ (via search summary) — the museum text describes a railway bridge crossed by a moving train and notes Wildenstein identified it as the Chatou railway bridge seen from the Ile de Chiard.)_
- **medium/unsupported-claim** — "with the town of Argenteuil visible beyond" → Nothing identifiable as the town is visible, and the museum's own catalogue text places the viewpoint on the Ile de Chiard looking at the Chatou railway bridge. _(image + web:https://www.bellasartes.gob.ar/coleccion/obra/7743/ (via search summary).)_

Second reviewer (upheld): Quoted text is in the description. A 2x crop of the upper band shows a locomotive with a tall smoke plume pulling a line of dark carriages along the bridge deck. This is a railway bridge, not the road bridge, and the train is the key motif the description leaves out. Commons categories say 'Railway bridge of Argenteuil' and 'Paintings of trains'. A web search summary of the MNBA text confirms a railway bridge with wide arches, which Wildenstein identifies as the Chatou railway bridge seen from the Ile de Chiard. The finding overstates one point: the image does show a broad dark arch under the deck, and MNBA mentions wide arches. So 'multi-arched' was not the error, and 'on slender piers' is only partly right. The 'town of Argenteuil visible beyond' is also unsupported, because the dark shapes on the skyline are mostly the train. The first agent's replacement keeps 'at this Seine town', which clashes with the Chatou identification, so I give a tighter replacement.

**Current:**

> Monet's 1875 view of the road bridge at Argenteuil looks across dense riverside vegetation toward the rebuilt multi-arched span, with the town of Argenteuil visible beyond. The composition is unusual in privileging the lush foreground growth over the river itself, rendered with the quick, broken brushwork that defines his Impressionist period at this Seine town. The work is held in the National Museum of Fine Arts, Argentina.

**Proposed:**

> Dense riverside grasses and flowering scrub fill most of the canvas. Beyond them, a railway bridge carries a train across the river on a broad arch and close-set piers, its locomotive trailing a plume of smoke. The composition gives the lush foreground growth more room than the river itself, rendered in quick, broken brushwork. The work is catalogued as Le Pont d'Argenteuil and signed and dated 1875 at lower left. It is held in the National Museum of Fine Arts, Argentina.

_Notes: Ledger says 'minor-fixed', so the road-bridge error survived an earlier pass. The MNBA page itself returns 403 to WebFetch; the Wildenstein/Chatou identification reached me only through a search summary of that page, so I kept it out of the replacement text and said only 'railway bridge', which the image and the Commons categories establish on their own. The last two sentences are preserved verbatim; 'at this Seine town' still works since the picture is catalogued as Le Pont d'Argenteuil._

### `collection-of-beauty-leighton-the-painter-s-honeymoon-1864`

**The Painter's Honeymoon** — Frederic Leighton, 1864 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A dark-haired bearded man and a fair-haired woman lean cheek to cheek over a tilted drawing board; he holds a pencil at the board with one hand while their other hands are clasped together on its edge. Her shot-silk gown, olive-green in shadow and gold in the light, spreads across the lower right of the canvas; behind them a dark interior with a patterned wall and, at the upper right, a potted orange tree bearing fruit beside a window.

- **high/wrong-collection** — "acquired by the Museum of Fine Arts, Boston, in 1912" → The MFA acquired the painting in 1981, not 1912: its accession number is 1981.258, credited to the Charles H. Bayley Picture and Painting Fund. _(web:https://mfaprints.org/products/1981-258 — "Charles H. Bayley Picture and Painting Fund … 1981.258"; MFA object 34445)_
- **low/invented-detail** — "A man guides a woman's hand at a drawing" → He is not guiding her drawing hand: he holds the pencil himself in one hand while his other hand clasps hers on the edge of the board. _(image — enlarged crop of the hands shows two hands interlocked at the board's edge, one with a white cuff, separate from the pencil-holding hand)_

Second reviewer (upheld): The quoted phrase 'acquired by the Museum of Fine Arts, Boston, in 1912' is verbatim in the description and is false. Independent search confirms the MFA accession number is 1981.258, credited to the Charles H. Bayley Picture and Painting Fund; MFA accession numbers are year-prefixed, so the work entered the collection in 1981, not 1912. Nothing supports a 1912 acquisition. I also checked the secondary issue myself: a 2x crop of the hands shows the man holding the pencil in his left hand while his right hand lies clasped over the woman's hand (white cuff, green sleeve) on the board's edge, so 'guides a woman's hand at a drawing' is a genuine over-read, correctly rated low. Everything the replacement adds is grounded: 83.8 x 76.8 cm and the 1866 Royal Academy first exhibition both check out, and the orange tree in fruit at the upper right is plainly visible in the image.

**Current:**

> A man guides a woman's hand at a drawing as she leans against his shoulder, her golden gown set off by darker surroundings. Oil on canvas, 83.8 by 76.8 cm, painted around 1864 and acquired by the Museum of Fine Arts, Boston, in 1912. A genre subject unusual for Leighton, who more often worked in classical and mythological themes.

**Proposed:**

> A man and a woman lean cheek to cheek over a tilted drawing board, his hand on the pencil and their other hands joined at its edge, an orange tree in fruit at the window behind them. Her shot-silk gown of gold and green fills the lower half of the canvas against the dark interior. Oil on canvas, 83.8 by 76.8 cm, painted about 1864 and first exhibited at the Royal Academy in 1866; it is in the Museum of Fine Arts, Boston, accession 1981.258. A genre subject unusual for Leighton, who more often worked in classical and mythological themes.

_Notes: The dimensions in the existing text (83.8 × 76.8 cm) are correct and were kept. The 1912 acquisition date is the real defect — a confident, specific, wrong provenance fact. mfa.org itself returns 403 to automated fetches, so the accession evidence is the MFA's own print-licensing site plus consistent secondary sources; both give 1981.258 / Bayley Fund. The 1866 Royal Academy exhibition comes from the Wikipedia article on the painting._

### `collection-of-beauty-les-papillons`

**Les Papillons** — Louis-Léopold Boilly · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** TWO figures at a stone window ledge: a fair-haired young woman in a loose white dress with a blue hair ribbon stands at the opening, one hand raised flat and the other arm forward, while a young man in dark clothes with a red-brown cloak leans in close behind her, his hands raised together in the same catching gesture. A potted rose in a terracotta pot stands on the sill at the right and a small glass phial hangs on the wall above it. No butterfly is clearly visible in this reproduction.

- **high/wrong-count** — "the figure finished with the close, enamel-smooth handling Boilly favoured" → There are two figures, not one: a young man leans in immediately behind the young woman, his hands raised in the same gesture, and he is half the subject of the picture. _(image — both heads and both pairs of hands are clearly modelled in the upper half of the canvas)_
- **medium/wrong-subject** — "in a small boudoir scene" → The setting is a stone window opening with a sill, a potted rose and a phial hanging on the wall — the pair look out through the frame at the viewer. Nothing indicates a boudoir. _(image — a heavy stone ledge crosses the bottom of the canvas and a masonry reveal frames the figures)_
- **low/unsupported-claim** — "A young woman reaches after butterflies" → The plural butterflies come from the title, not from the picture; no butterfly is discernible in the reproduction, and both figures are simply poised with hands raised. _(image — enlarged crop of the hands shows no insect)_

Second reviewer (upheld): I read the image at full size and at 4x on the hands. There are unmistakably two figures: a fair-haired young woman in a loose white dress with a blue hair ribbon at the front, and a young man in dark clothes with a red-brown cloak leaning in immediately behind her, his hands cupped together in the same gesture - both heads and all four hands are fully modelled, not a shadow or a mistaken passage. The existing description's singular 'the figure' therefore omits half the subject. The setting is likewise wrong: a heavy stone sill crosses the bottom, a masonry reveal frames the pair, a terracotta pot of white roses stands on the sill and a corked glass bottle hangs from a cord on the pier at the right - a window, not a boudoir. No butterfly is discernible anywhere at this resolution, so the plural butterflies do come from the title; correctly rated low. The first agent's replacement is right on the facts but calls the bottle a 'phial' and drops the true remark about Boilly's enamel-smooth handling, so I supply a tightened version.

**Current:**

> A young woman reaches after butterflies in a small boudoir scene, the figure finished with the close, enamel-smooth handling Boilly favoured. The Lille-born painter built his reputation on such intimate genre pictures in Paris from the late 1780s. Oil on canvas.

**Proposed:**

> A fair-haired young woman in a loose white dress stands at a stone window ledge, one hand raised palm-out and the other arm reaching forward, while a young man in dark clothes and a red-brown cloak leans in close behind her with his hands cupped in the same catching gesture. A terracotta pot of white roses sits on the sill at the right and a small corked glass bottle hangs from a cord on the masonry above it, the whole finished with the close, enamel-smooth handling Boilly favoured. The Lille-born painter built his reputation on such intimate genre pictures in Paris from the late 1780s. Oil on canvas.

_Notes: "Oil on canvas" is correct and was kept: the Sotheby's Master Paintings Part II sale (1 February 2024), which is the Commons credit link, catalogues Les Papillons as oil on canvas, 40 × 32.4 cm. The record has no year; the sale record would supply a date if the auditor wants one, but I did not add a date I could not read directly. The title makes butterflies the ostensible subject, so if the full-resolution file shows one, the catching gesture can be tied to it explicitly._

### `collection-of-beauty-levitan-posle-dozhdya`

**Левитан После дождя** — Isaac Levitan, 1889 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A wide Volga view after rain: dark moored barges with bare masts and rowboats along a wet, muddy bank in the foreground, the town of Plyos with a white church strung along the right bank, a steamer far off to the left, and heavy grey cloud breaking over pale water. Signed and dated at the lower left.

- **high/invented-detail** — "Study for a painting" → This is the finished picture, not a study for one. 'After the Rain. Plyos' is a signed, dated 1889 oil on canvas of 80 x 125 cm in the State Tretyakov Gallery; the reproduction shows a fully worked, signed canvas. _(web:https://www.wikiart.org/en/isaac-levitan/after-the-rain-plyos-1889 and gallerix - 1889, oil on canvas, 80 x 125 cm, Tretyakov Gallery, Moscow \| image - signature and date at lower left)_
- **medium/wrong-attribution** — "Russian Romantic landscape artist" → Levitan is a realist landscape painter of the Peredvizhniki circle, not a Romantic; the catalogue row itself gives movement 'Realism'. _(catalogue record - movement: Realism \| knowledge - Levitan is standardly classed as a Russian realist / 'mood landscape' painter)_
- **low/no-visual-content** — "exemplifying the artist's signature atmospheric naturalism and subtle treatment of light and moisture in the landscape" → Boilerplate; nothing in the description says what is in the frame beyond 'the village of Plyos'. _(house style)_

Second reviewer (upheld): Both defects are real. The image is a fully resolved oil painting — worked sky, reflected light on the water, finished architecture along the right bank — and it carries a signature and date at the lower left; nothing about it reads as a study. Independent sources (WikiArt, Gallerix) give 'After the Rain. Plyos', 1889, oil on canvas, 80 x 125 cm, State Tretyakov Gallery, and the row's own Commons categories include 'Paintings by Isaac Levitan in the Tretyakov Gallery', so 'Study for a painting' is a straight invention. 'Russian Romantic landscape artist' also contradicts the catalogue row's own movement tag (Realism); Levitan is standardly placed with the Peredvizhniki realists. The proposed replacement matches what I see — moored barges with bare masts, two beached rowboats, a small steamer far off to the left, the town and its church along the right bank, heavy cloud over pale water — and its Tretyakov sentence is supported by the Commons categorisation, so it can stand.

**Current:**

> Study for a painting by Russian Romantic landscape artist Isaac Levitan. The work depicts the village of Plyos on the Volga River following a rainfall, exemplifying the artist's signature atmospheric naturalism and subtle treatment of light and moisture in the landscape.

**Proposed:**

> Moored barges with bare masts and beached rowboats line a wet Volga bank after a downpour, with the town of Plyos and its white church spread along the far right and heavy cloud breaking over pale water. Isaac Levitan painted it in 1889, during the summers he spent working at Plyos, and signed it at the lower left. The canvas is in the State Tretyakov Gallery, Moscow.

_Notes: Two separate problems: the work is called a study when it is the finished Tretyakov canvas, and Levitan is labelled Romantic against the row's own Realism tag. The Tretyakov location is well attested across sources but the catalogue row carries no provenance, so an applier may prefer to drop that last sentence._

### `collection-of-beauty-liefdespaar-rp-p-ob-12-233`

**Liefdespaar** — Parmigianino, 1513 · collection-of-beauty · prior audit: accurate · confidence high · verify: upheld

> **What the image shows.** A print in fine hatched line: a nude man sits from behind on the ground in a wood, twisting to his right toward a draped woman seated beside him; heavy tree trunks and foliage fill the left and top. Plate mark and paper edges visible.

- **high/wrong-attribution** — "The plate is one of the engravings published after Parmigianino's drawings" → The Rijksmuseum record carried in this record's own source evidence says the opposite: 'prentmaker: Parmigianino, naar eigen ontwerp van: Parmigianino' - Parmigianino was the printmaker, working from his own design. Describing it as a reproductive plate made by someone else after his drawings inverts the single most notable fact about Parmigianino's prints, that he etched his own compositions. The technique is also given as etching, drypoint and engraving, not engraving alone. _(commons imageDescription (Rijksmuseum record): 'Vervaardiger: prentmaker: Parmigianino, naar eigen ontwerp van: Parmigianino ... Fysieke kenmerken: ets, droge naald en gravure')_
- **metadata/`year`** — `1513` → `1513-1540 (range)` _(Rijksmuseum dating in the source evidence is 'Datering: 1513 - 1540'; the record has flattened the range to its lower bound, which for an artist born in 1503 implies a print made at age ten.)_

Second reviewer (upheld): Confirmed. The Rijksmuseum record in sourceEvidence gives 'prentmaker: Parmigianino, naar eigen ontwerp van: Parmigianino' and 'ets, droge naald en gravure'. The Met also catalogues 'The Lovers' as Parmigianino's own etching, drypoint and engraving of about 1527-30. Calling the plate a reproductive engraving 'published after Parmigianino's drawings' misstates who made it. The image matches the rest of the text: a nude man seen from behind turns toward a draped woman in a wooded setting, drawn in fluid etched line. The replacement is grounded in the museum record: sheet 147 x 104 mm, second state of three. Its claim that he was among the first Italian painters to etch is standard art history.

**Current:**

> A pair of lovers sits in a wooded grove, the nude man turning toward the woman beside him. The plate is one of the engravings published after Parmigianino's drawings, the Mannerist designs that carried his eccentric grace north into the print culture of sixteenth-century Europe.

**Proposed:**

> A pair of lovers sits in a wooded grove, the nude man turning toward the woman beside him. Parmigianino made the plate himself, after his own design, in etching, drypoint and engraving - he was among the first Italian painters to work directly on the plate rather than leave his compositions to a professional engraver. The Rijksmuseum sheet, 147 by 104 mm, is a second state of three.

_Notes: Spot-check of a prior 'accurate' verdict, and it does not hold. Every fact in the replacement comes from the Rijksmuseum record quoted in the record's own sourceEvidence: printmaker, technique, sheet size (147 x 104 mm, matching realDimensions 14.7 x 10.4 cm) and 'tweede staat van drie'. The claim that Parmigianino was among the first Italian painters to etch his own designs is standard art history; drop that clause if you want the description to rest on the museum record alone. Note also the 1513 year field, which is almost certainly the low end of a range rather than a date._

### `collection-of-beauty-louis-leopold-boilly-portrait-of-jan-anthony-d-averhoult-1756-1792-google-art-project`

**Portrait of Jan Anthony d'Averhoult** — Louis-Léopold Boilly, 1792 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A full-length seated portrait: a powdered-wig sitter in a dark coat and white cravat sits at a red desk in a vaulted chamber, his right arm extended and open, his other hand on a handbell; an open book lettered 'Constitution ...' lies on the desk with loose papers, a quill and inkstand. Behind him a tiered assembly hall full of small figures; a green curtain, a chair, and at the lower left a red box with a tricolour cockade, books and a rolled sheet.

- **high/wrong-subject** — "the sitter shown bust-length against a plain ground" → The picture is a full-length seated portrait in an elaborate setting — a desk with bell, constitution volume, papers and inkstand, a tiered assembly chamber behind, a curtain, and a red despatch box with a tricolour cockade at the lower left. There is no plain ground and it is not bust-length. _(image — full-length seated figure at a desk in a vaulted assembly hall)_

Second reviewer (upheld): The quoted phrase is in the description. I viewed the image: the sitter is shown at full length, seated on an upholstered armchair at a red desk. His right arm is outstretched and his left fist grips the handle of a handbell. The desk holds an open book with 'Constitution' lettered on the page, loose papers, a quill and an inkstand. Behind him are a vaulted chamber with crowded tiers of figures and a green curtain. At the lower left there is a red box on a stack of boxes, with a tricolour cockade, papers and a rolled sheet. Nothing about it is bust-length or against a plain ground, so the visual sentence is plainly wrong. The replacement is grounded. I only moved the box from 'at his feet' to the lower left, where it actually sits.

**Current:**

> A portrait of Jan Anthony d'Averhoult, the Dutch Patriot of Huguenot descent who chaired parliament in 1792, the year of this likeness and of his death. Oil on canvas by Boilly, the sitter shown bust-length against a plain ground. The portrait dates from the height of the Revolutionary period.

**Proposed:**

> Jan Anthony d'Averhoult sits full-length at a desk in a vaulted assembly chamber, his right arm thrown out and his other hand on a handbell, an open volume lettered Constitution, loose papers, quill and inkstand before him; at the lower left a red box with a tricolour cockade, papers and a rolled sheet, and tiers of small figures fill the hall behind. Boilly painted the Dutch Patriot of Huguenot descent in 1792, the year he chaired the Legislative Assembly and the year of his death. The portrait is in the Centraal Museum, Utrecht.

_Notes: The biographical sentence in the original was sound and is kept in substance; only the visual sentence was wrong. Collection is taken from the Commons categories ('Paintings from France in the Centraal Museum', 'Google Art Project works in Centraal Museum'); I did not find the medium confirmed in the supplied evidence, so 'oil on canvas' was dropped rather than reasserted — restore it if the catalogue row confirms._

### `collection-of-beauty-manet-edouard-portrait-d-ernest-hoschede-et-sa-fille-marthe-google-art-project`

**Portrait d'Ernest Hoschedé et sa fille Marthe** — Édouard Manet, 1876 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A bearded man in a straw boater and grey coat leans on a small round garden table on which stand a glass and a red carafe; a young girl in a red bow and red cap sits behind the table at the right, a garden chair beside her, green foliage and a tree trunk behind. Something pale and furry — probably a small dog — rests across his lap at the lower left. Neither figure holds a flower.

- **high/invented-detail** — "the girl holding a flower" → There is no flower anywhere in the picture. The girl's hands are at the table edge; the only red objects near her are a carafe and glass on the table and her own neck bow. _(image)_
- **medium/invented-detail** — "seated together on a garden bench" → They are seated on separate garden chairs at a small round café-style table, which is the composition's whole point — the Museo Nacional de Bellas Artes' own note remarks that Hoschedé leans on a small table 'as if chatting in a café'. _(image; web:https://www.bellasartes.gob.ar/coleccion/obra/7961/ (via search summary) — 'the attitude of the man leaning on a small table')_

Second reviewer (upheld): Upheld. Zoomed the girl's half of the canvas: her hands are at the table edge and empty — the only red things near her are her own large neck bow, her cap, and the terracotta carafe standing on the table. There is no flower in the picture, so 'the girl holding a flower' is invented. The small round garden table with a glass of red wine and a carafe sits dead centre between the two sitters and is the structural anchor of the composition; the man leans his forearm on it in a boater hat, with a green slatted garden seat behind the girl at the right. 'Seated together on a garden bench' therefore misstates the staging and drops the one object the picture is built around. The rest of the description (plein-air start at Montgeron in 1876, broad open handling, Museo Nacional de Bellas Artes, Buenos Aires) checks out against the museum record. Major is right — one invented object plus a misdescribed setting, in an otherwise sound paragraph. I also examined the pale shape on Hoschedé's lap: it reads as a small brown-and-white dog but is loosely enough brushed that I would not assert it either, so I have kept it out, as the first agent did.

**Current:**

> Ernest Hoschedé and his young daughter Marthe seated together on a garden bench, the girl holding a flower, the paint laid down in broad open strokes. Manet began the plein-air portrait at the Hoschedé estate at Montgeron in 1876; it is now in the Museo Nacional de Bellas Artes, Buenos Aires.

**Proposed:**

> Ernest Hoschedé, in a straw boater, leans on a small round garden table with his daughter Marthe beside him, a wine glass and a red carafe standing between them, the paint laid down in broad open strokes that leave the canvas looking barely finished. Manet began the plein-air portrait at the Hoschedé family's Château de Rottembourg at Montgeron in 1876; it is now in the Museo Nacional de Bellas Artes, Buenos Aires.

_Notes: The contextual half of the description is solid — the Buenos Aires museum's record confirms the 1876 plein-air start at the Château de Rottembourg in Montgeron, the broad unfinished handling, and the collection. Only the first sentence's staging is wrong. I left the dog out of my replacement: the shape on Hoschedé's lap reads as a small spaniel's head at zoom but the passage is loosely brushed enough that I would not assert it._

### `collection-of-beauty-martin-schongauer-nativity-wga21041`

**Nativity** — Martin Schongauer, 1480 · collection-of-beauty · prior audit: accurate · confidence high · verify: upheld

> **What the image shows.** A small painted panel in full colour with visible craquelure: the Virgin kneels in a blue mantle, hands joined, before the naked Child lying on a white cloth over a red drape; Joseph stands at the left in a red robe; the ox and the ass are behind, and three shepherds crowd in at the right, one holding a straw hat; the shed is built of ruined masonry and rough timber posts, opening on a landscape with hills, a river and a distant town.

- **high/wrong-medium** — "the rough stonework and spiky straw rendered in the crisp, hatched line for which Schongauer was renowned" → This is a painted panel in full colour, not a print. 'Crisp, hatched line' describes Schongauer's engravings and cannot be what the viewer sees here; the description imports the technique of a different body of work onto a painting. _(image — a colour painting with craquelure, modelled in paint; Commons categories carry 'WGA form: painting' and Wikidata gives panel dimensions of 28 x 37.8 cm)_
- **medium/no-visual-content** — "An Adoration of the Shepherds set in a ruined Romanesque shed" → Beyond naming the subject, the description says nothing about the figures actually present — the kneeling Virgin, the Child on the red cloth, Joseph, the ox and ass, the three shepherds — and 'Romanesque' is a stylistic label the visible ruin does not establish. _(image vs description)_

Second reviewer (upheld): The quoted text is in the description. The image is plainly a full-colour oil panel with craquelure and modelled flesh and drapery. There is no hatching anywhere, so 'rendered in the crisp, hatched line' carries engraving vocabulary over to a painting. Commons tags it 'WGA form: painting', and the 28 x 37.8 cm size matches the Berlin panel. The description also never names any of the figures. I checked the replacement against the image and every item is there: the Virgin kneeling in blue with joined hands, the Child on a white cloth over a striped red drape, Joseph in red at the left, the ox and ass, three shepherds at the right (one holding a straw hat), and ruined masonry opening onto hills and a town. Schongauer's Colmar base and his influence on the young Durer are standard art history. The replacement keeps the true print/Durer context and adds nothing ungrounded.

**Current:**

> An Adoration of the Shepherds set in a ruined Romanesque shed, the rough stonework and spiky straw rendered in the crisp, hatched line for which Schongauer was renowned. His Late Gothic prints circulated widely and were copied closely by the young Albrecht Dürer.

**Proposed:**

> The Virgin kneels in prayer before the Christ Child, who lies on a white cloth over a red drape in the straw, with Joseph standing at the left, the ox and the ass behind, and three shepherds crowding in at the right; the ruined masonry shed opens on a landscape of hills and a distant town. A small panel painting of about 1480 by Martin Schongauer, a Colmar painter better known for the Late Gothic engravings that circulated widely and were copied closely by the young Albrecht Dürer.

_Notes: Prior ledger status was 'accurate', but the description treats a painting as if it were an engraving. The panel is oil on panel, c. 1480, 37.5 x 28 cm, in the Gemäldegalerie, Berlin (inv. 1629) — matching the record's realDimensions of 28 x 37.8 cm and the composition in the image (source: en.wikipedia.org/wiki/Adoration_of_the_Shepherds_(Martin_Schongauer,_Berlin)). I left the collection out of the replacement text because the record does not carry it; it could safely be added. The Dürer sentence is correct and preserved in substance._

### `collection-of-beauty-mary-stevenson-cassatt-mary-cassatt-self-portrait-google-art-project`

**Mary Cassatt Self-Portrait** — Mary Cassatt, 1880 · collection-of-beauty · prior audit: minor-fixed · confidence high · verify: upheld

> **What the image shows.** A loosely worked watercolour/gouache on paper: a woman half-length in a broad pale bonnet trimmed with ribbon and a dark blue-green dress, her head tilted and her eyes turned toward the viewer; the lower right of the sheet dissolves into unfinished pale washes and a few pink and blue strokes; initialled 'm. C.' at the bottom.

- **high/invented-detail** — "her gaze directed downward as she works at a canvas just visible at the right edge" → No canvas, easel, brush or palette is visible anywhere in the sheet; the right side is bare paper with a few loose washes, which I checked at magnification. Her eyes are turned toward the viewer rather than markedly downward. The invented canvas then carries the next sentence's reading of the work as 'a record of the artist at work'. _(image — magnified crop of the right half shows only unfinished washes on white paper)_
- **low/unsupported-claim** — "a rapid, intimate record of the artist at work rather than a formal posed likeness" → The 'at work' half of the contrast depends on the canvas that is not there; only the 'rapid, informal' half survives. _(image)_

Second reviewer (upheld): The quoted text is in the description. I looked at magnified crops of the image. The right side holds only loose ochre, lilac and pink strokes on bare paper, with no canvas edge. Her eyes look out at the viewer, not down. The National Portrait Gallery's label (si.edu NPG.76.33) confirms both points: she returns the viewer's gaze and keeps her sketching surface hidden. The 'canvas just visible' and 'gaze directed downward' claims are therefore wrong. The replacement is weak in two places. First, it drops the 'artist at work' reading, which the NPG label supports: she presents herself as a professional artist appraising the viewer. Second, it calls the hat 'pale', but the crop shows a large ochre-brown hat with a pale lilac band. My revised text fixes both and uses the museum's own reading of the green strokes as wallpaper and the yellow wash as sunlight.

**Current:**

> Cassatt depicts herself in a large hat and dark dress, her gaze directed downward as she works at a canvas just visible at the right edge. The loosely worked gouache and watercolour over graphite, made around 1880, is a rapid, intimate record of the artist at work rather than a formal posed likeness. The self-portrait belongs to the National Portrait Gallery in Washington.

**Proposed:**

> Cassatt shows herself half-length in a large ochre hat banded in pale lilac and a dark blue-green dress, looking straight back at the viewer. The sheet she is working on stays out of sight, so the artist seems to be studying us rather than the reverse. Green strokes at the upper right suggest wallpaper, and a yellow wash at the left reads as sunlight falling over her shoulder. The gouache and watercolour over graphite dates from around 1880, a year after she began exhibiting with the Impressionists. The self-portrait belongs to the National Portrait Gallery in Washington.

_Notes: Medium, date and collection are all confirmed (National Portrait Gallery, Smithsonian, NPG.76.33, gouache and watercolour over graphite, c. 1880). Only the canvas at the right edge is fabricated. I could not fetch the NPG object page (403), so the judgement rests on the image itself, which I examined at magnification — hence medium rather than high confidence on the verdict, though the absence of any canvas is clear._

### `collection-of-beauty-mavzoley-shakh-i-zinda-v-samarkande`

**Мавзолей Шах-и-Зинда в Самарканде** — unattributed · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A painting, not a photograph: visible canvas weave and opaque brushwork. Brick domes and drum-towers of the Shah-i-Zinda mausoleums with turquoise-and-white tile bands and calligraphic friezes, rising above a bare sunlit slope strewn with fallen slabs and gravestones, under a flat cloudless blue sky.

- **high/wrong-medium** — "Photograph of the Shah-i-Zinda mausoleum ensemble in Samarkand, Uzbekistan" → The image is a painting on canvas (canvas weave and brushwork are visible throughout), almost certainly Vereshchagin's Turkestan-series oil of the same title, not a photograph. _(image; web:https://gallerix.ru/album/Vereshagin/pic/glrx-135870361 - 'Mavzolei Shakh-i-Zinda v Samarkande. 1869-1870' by V. V. Vereshchagin, Tretyakov Gallery)_
- **medium/unsupported-claim** — "This image captures the ornate tilework and facades characteristic of Timurid-era Islamic architecture." → Written as a photographer's caption ('this image captures'), which follows from the same wrong-medium premise. _(image)_
- **metadata/`artist`** — `None` → `Vasily Vereshchagin (probable)` _(web:https://gallerix.ru/album/Vereshagin/pic/glrx-135870361 and http://artpoisk.info/artist/vereschagin_vasiliy_vasil_evich_1842/mavzoley_shah-i-zinda_v_samarkande/ - a Vereshchagin oil of exactly this Russian title, 1869-70, Tretyakov Gallery; the batch also contains two other Vereshchagin Turkestan works)_
- **metadata/`year`** — `None` → `1869-1870` _(same sources - the Vereshchagin canvas is dated 1869-70)_

Second reviewer (upheld): The image is plainly a painting. Canvas weave shows across the flat blue sky, the paint is opaque and brushed, and there are small tack or wear marks along the top edge. It shows ribbed and pointed domes and tiled drums above a bare, eroded slope scattered with grave slabs. That matches Vereshchagin's 1869-70 Turkestan-series oil of this exact Russian title. The sourceEvidence is a mismatched 2018 own-work photograph, which explains the 'Photograph of' error. Calling a 19th-century painting a photograph is a wrong-medium error, so major is the right grade. The replacement stays grounded: it says 'painted view', gives no attribution, and the 11th-15th century build-up of the site is standard history. I would keep it.

**Current:**

> Photograph of the Shah-i-Zinda mausoleum ensemble in Samarkand, Uzbekistan, one of Central Asia's most significant architectural complexes. The site comprises a series of connected mausoleums built from the 11th to 15th centuries along a narrow street on the outskirts of the ancient Silk Road city. This image captures the ornate tilework and facades characteristic of Timurid-era Islamic architecture.

**Proposed:**

> A painted view of the Shah-i-Zinda mausoleum ensemble at Samarkand: brick domes and drum-towers banded with turquoise tilework and calligraphic friezes stand above a bare, sun-bleached slope littered with fallen slabs, under a cloudless sky. The site is a street of mausoleums on the edge of the old city, built up between the 11th and 15th centuries.

_Notes: IMPORTANT: the record's sourceEvidence is a mismatched Commons file - a 2018 own-work photograph by user 'Akhemen' - which is very likely what produced the 'Photograph of...' opening. The catalogued image is a 19th-century painting. I kept the replacement to 'A painted view' rather than asserting oil on canvas, and did not put the attribution into the description text since I can only support it at probable confidence; it is filed under metadataIssues instead. Someone should re-check which source file this asset actually came from._

### `collection-of-beauty-nicolas-poussin-le-massacre-des-innocents-google-art-project`

**Massacre of the Innocents** — Nicolas Poussin, 1625 · collection-of-beauty · prior audit: minor-fixed · confidence high · verify: upheld

> **What the image shows.** A bare-chested soldier in a red cloak plants his foot on a naked infant lying on a white cloth on the pavement and raises a sword above it; the child's mother, in a gold-orange robe, kneels and grabs at the soldier's arm and hair, screaming. At the right a woman in blue flees with her head thrown back, a child behind her; a small mother-and-child group appears in the middle distance and classical architecture rises behind.

- **medium/wrong-subject** — "A soldier raises his sword to strike a mother who clutches her infant on the ground" → The sword is raised over the CHILD, not the mother: the soldier pins the infant to the pavement under his foot, and the mother is not clutching the infant at all — she has hold of the soldier's arm and hair, trying to stop the blow. The sentence inverts victim and assailant's target. _(image — the soldier's bare foot rests on the infant's neck and the blade is poised above the child; the mother's hands are on the soldier)_

Second reviewer (upheld): Upheld. The image is unambiguous even at 960 px: the bare-chested soldier in the red cloak plants his foot on the naked infant lying on a white cloth on the pavement and holds the sword raised above the CHILD; the mother in the gold-orange robe kneels screaming with one hand clamped on his forearm and the other in his hair, trying to stop the blow. She is not clutching the infant and she is not the sword's target, so 'raises his sword to strike a mother who clutches her infant' inverts both. That sentence is the only one that tells the reader what is happening, and this canvas is famous precisely for that gesture, so major is the right grade rather than minor. The remainder of the description holds: the woman in blue at the right does recoil with her head thrown back, and the Musée Condé attribution and 1625–1629 range match the record's own provenance block (Q3224378, PE 305) and the Commons date note. The first agent's replacement is accurate and I would keep it as written.

**Current:**

> A soldier raises his sword to strike a mother who clutches her infant on the ground, while a woman in blue recoils in anguish at right. Poussin condenses the Massacre of the Innocents into a single searing triangle of figures, achieving maximum dramatic force through the stark confrontation of perpetrator, victim, and witness. The painting, dated between 1625 and 1629, is held at the Musée Condé, Chantilly.

**Proposed:**

> A soldier pins a naked infant to the pavement with his foot and raises his sword above it, while the child's mother kneels and grabs at his arm and hair, screaming; at the right a woman in blue flees with her head thrown back. Poussin condenses the Massacre of the Innocents into a handful of figures locked together in the foreground, playing the assailant, the mother and the fleeing witness against one another. The painting, dated between 1625 and 1629, is held at the Musée Condé, Chantilly.

_Notes: The attribution, the dating range and the Chantilly location are all confirmed by the record's own provenance block (Q3224378, Musée Condé, PE 305) and by the Commons date note (Thuillier 1625–26 / Blunt 1628–29). I graded this 'major' rather than 'minor' because the misdescribed clause is the one sentence that tells the reader what is happening in the picture, and it names the wrong victim; a reader taking it at face value would picture a different scene. A reviewer who reads 'strike a mother who clutches her infant' as loose shorthand for the whole group could reasonably downgrade this to minor. The rest of the paragraph I kept nearly verbatim, trimming 'searing triangle' and 'maximum dramatic force', which are hype._

### `collection-of-beauty-paul-gauguin-nafea-faa-ipoipo-1892-oil-on-canvas-101-x-77-cm`

**Paul Gauguin** — Paul Gauguin, 1892 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Two Tahitian women sit in the foreground of a yellow field: the nearer in a red and orange pareo with a white bodice and a pale flower behind her ear, the other behind her in a high-necked pink dress; blue hills, a tree trunk and small distant figures beyond. Inscribed 'NAFEA Faaipoipo' and signed 'P Gauguin 92' along the lower edge.

- **high/wrong-subject** — "depicting a Tahitian scene with philosophical themes of human existence" → The picture's subject is a question about marriage - the inscribed title 'Nafea Faa Ipoipo' means 'When will you marry?' - and it shows two seated women. 'Philosophical themes of human existence' is the standard description of a different Gauguin, 'Where Do We Come From? What Are We? Where Are We Going?', and it is doing all the descriptive work in this sentence. _(image — two women, inscription 'NAFEA Faaipoipo' at lower right; the record's own englishTitle gives 'When Will You Marry?'.)_
- **medium/style-hype** — "monumental oil painting" → At 101 x 77 cm the canvas is a normal easel size; 'monumental' is both hype and factually misleading, and it sits next to the correct dimensions in the same description. _(catalogue record — realDimensions 101 cm high x 77 cm wide.)_
- **low/no-visual-content** — "this 101 x 77 cm canvas is considered one of his most important works" → Unattributed superlative; the description never says what is in the frame. _(house style.)_
- **metadata/`title`** — `Paul Gauguin` → `Nafea Faa Ipoipo (When Will You Marry?)` _(The title field holds the artist's name; the englishTitle field already carries the real title, and the Commons file is 'Paul Gauguin - Nafea Faa Ipoipo (1892).jpg'.)_

Second reviewer (upheld): Quoted text is in the description. The image shows two Tahitian women seated in a yellow field, inscribed 'NAFEA Faaipoipo' at lower right and signed 'P Gauguin 92' on the rock at lower left. 'Philosophical themes of human existence' is generic language belonging to 'Where Do We Come From?' and says nothing true about this canvas's marriage question. 'Monumental' is wrong for a 101 x 77 cm easel picture. The description never states what is in the frame. The replacement matches the image: the flower behind the ear, the red and orange pareo, the pink high-necked dress with white collar, the blue hills. It asserts no owner.

**Current:**

> Paul Gauguin's monumental oil painting depicting a Tahitian scene with philosophical themes of human existence. Completed during the artist's first stay in Tahiti, this 101 x 77 cm canvas is considered one of his most important works, combining Post-Impressionist style with Symbolist ideology.

**Proposed:**

> Two Tahitian women sit in the foreground of a yellow field, the nearer in a red and orange pareo with a white bodice and a flower behind her ear, the other behind her in a high-necked pink dress, with blue hills beyond. Gauguin inscribed the Tahitian title 'Nafea Faa ipoipo' - When will you marry? - at the lower right and signed and dated the canvas 1892. The oil measures 101 by 77 cm and was painted during his first stay in Tahiti.

_Notes: The Commons record for this file came back missing, so the only evidence is the image and the catalogue row - both of which support the replacement text. I deliberately name no owner: the picture was for decades on loan to the Kunstmuseum Basel from the Staechelin collection and was sold privately in 2015, so any collection statement would be a guess._

### `collection-of-beauty-razvaliny-chuguchaka`

**Развалины Чугучака** — Vasily Vereshchagin, 1869 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A wide, bleached landscape: tall yellow grass fills the foreground and is strewn with dozens of human skulls (confirmed at magnification — eye sockets and jawlines are clearly painted), behind which run low ruined crenellated walls with a Chinese pagoda-roofed gate tower, hills and bare trees beyond, under a lilac-grey sky. No living figures and no lions appear.

- **high/wrong-subject** — "with figures and lions amid the desert landscape" → Neither figures nor lions are present. The foreground is scattered with human skulls — the picture's whole point, and precisely what the description leaves out. _(image — magnified crop of the foreground shows unmistakable human skulls; no animal or human figure anywhere. (Commons carries 'Paintings of lions' / 'Chinese guardian lions' categories, but nothing of the kind is visible in this file, so those categories look misapplied.))_
- **low/unsupported-claim** — "the ancient city of Chuguchak" → 'Ancient' overstates it — Chuguchak (Tacheng) was a 19th-century frontier town whose ruin was recent when Vereshchagin saw it, not an antique site. _(knowledge; the painted ruins are freshly broken mud walls and an intact-looking gate tower, not antiquities)_

Second reviewer (upheld): Quoted text is verbatim. I magnified the foreground at 3x independently: the objects strewn through the yellow grass are unmistakable human skulls - rounded crania with dark eye sockets, nasal apertures and jaw lines, dozens of them across the whole width of the field. I also magnified the gate-tower and wall zone at 4x looking for the guardian-lion statues the Commons categories imply: nothing of the kind is visible, and there is no human or animal figure anywhere in the frame. So 'figures and lions amid the desert landscape' is invented, and the skull field - the picture's entire subject, and the reason it belongs to the Turkestan series - is omitted. The 'ancient city' quibble is fair but secondary; Chuguchak/Tacheng was a 19th-century frontier town wrecked in the 1860s unrest, and the painted walls are freshly broken with an intact pagoda-roofed gate tower. The replacement is grounded in what is visible (skulls, grass, broken crenellated walls, pagoda gate tower, bare trees, hills, pale sky) and keeps the series/medium/collection facts that the Commons categories support. Severity stays 'major' rather than 'fabricated' because the subject, place, series and collection in the original are all correct - only the figure/lion clause is invented.

**Current:**

> A landscape painting from Vasily Vereshchagin's Turkestan series depicting the ruins of the ancient city of Chuguchak (Tacheng) in Xinjiang. The composition captures the desolate architectural remains with figures and lions amid the desert landscape. Oil on canvas, now in the Russian Museum.

**Proposed:**

> Human skulls lie scattered through tall yellow grass in front of the broken walls and pagoda-roofed gate tower of Chuguchak (Tacheng) in Xinjiang, with bare trees and hills beyond under a pale sky. The painting belongs to Vereshchagin's Turkestan series; oil on canvas, now in the Russian Museum.

_Notes: I magnified the foreground before calling this, because 'figures and lions' would be an odd thing to invent — the objects are unambiguously skulls, of a piece with Vereshchagin's other Turkestan works. Series, medium and collection are corroborated by the Commons categories ('Turkestan series by Vasily Vereshchagin', 'Oil on canvas paintings in the Russian Museum') and are kept. Commons dates the work between 1869 and 1870, so the record's 1869 is the early bound rather than a firm date._

### `collection-of-beauty-razvaliny-kitayskoy-kumirni-ak-kent`

**Развалины китайской кумирни. Ак-Кент** — Vasily Vereshchagin, 1869 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Oil: whitewashed walls broken open and littered with rubble, two circular moon-gate openings, a tiled Chinese pavilion with upturned eaves standing at the left, autumn-coloured trees behind, two small figures in robes and pointed hats standing in the dry grass in front, deep blue sky.

- **medium/unsupported-claim** — "the painting documents the architectural and cultural traces left by ancient Buddhist settlements along the Silk Road" → Nothing supports 'ancient' or 'Silk Road'. What is depicted is a recently wrecked Qing-era Chinese temple compound - intact whitewash, fresh rubble, standing pavilion - painted on Vereshchagin's 1869-70 Central Asian travels, not an archaeological site. _(image; commons object name 'Ruins of Chinese sanctuary. Ak-Kent' says nothing about age or the Silk Road.)_
- **low/unsupported-claim** — "a Chinese Buddhist temple" → The Russian 'kumirnya' means a Chinese idol temple generally; Commons calls it a 'Chinese sanctuary'. The Buddhist identification is an assumption. _(commons - 'Ruins of Chinese sanctuary. Ak-Kent'.)_
- **low/no-visual-content** — "this work depicts the remains of a Chinese Buddhist temple at Ak-Kent in Kazakhstan" → Nothing in the description tells the reader what is actually in the frame. _(image.)_

Second reviewer (upheld): The image shows a compound whose whitewash is still bright and unweathered, walls snapped off mid-course with fresh angular rubble heaped at their feet, two intact circular moon-gate openings, and a tiled pavilion with upturned eaves still standing at the left - a recently wrecked building, not an archaeological site. Two robed figures in pointed hats stand in dry autumn grass with birds circling overhead. Nothing in the picture, in the Commons record ('Ruins of Chinese sanctuary. Ak-Kent'), or in the Wikidata/Tretyakov data supports 'ancient Buddhist settlements along the Silk Road'. I checked whether this was established art history the first agent simply missed: it is not. Russian sources place the work in the Turkestan series from Vereshchagin's 1869-70 Central Asian travels, when he passed through the region during the suppression of the Dungan revolt and recorded Chinese shrines whose idols had been smashed and wall paintings defaced. The ruin is Qing-era and freshly made. 'Major' is the right severity - the artist, place, series and Tretyakov attribution are all correct, and only the closing interpretive sentence is invented. I kept the first agent's replacement but corrected 'crossing' (the figures are standing still, facing the ruins) and avoided restating the Commons date range as a painting date, since the series itself was executed later in Munich.

**Current:**

> Painted by Russian artist Vasily Vereshchagin during his Central Asian expeditions, this work depicts the remains of a Chinese Buddhist temple at Ak-Kent in Kazakhstan. Created between 1869 and 1870 as part of his Turkestan series, the painting documents the architectural and cultural traces left by ancient Buddhist settlements along the Silk Road.

**Proposed:**

> Whitewashed walls stand broken open above heaps of rubble, pierced by two round moon-gate openings, with a tiled Chinese pavilion still upright at the left and two robed figures in pointed hats standing in the dry autumn grass before them. Vasily Vereshchagin painted the ruined Chinese shrine at Ak-Kent, in present-day Kazakhstan, out of the Central Asian travels of 1869-70 that produced his Turkestan series. The canvas is in the Tretyakov Gallery, Moscow.

_Notes: Tretyakov comes from the record's own provenance block and the Commons category. I deliberately did not state why the compound was in ruins - the regional Chinese settlements were wrecked in the 1860s unrest, but that is not something the image or the record establishes._

### `collection-of-beauty-sans-culotte`

**Sans-culotte** — Louis-Léopold Boilly · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Full-length oil portrait: a man stands on a mound in an open landscape with hills, water and buildings behind, a clay pipe in his mouth, holding up a wooden staff with a hanging flag lettered LIBERTE OU LA MORT. He wears a red-and-yellow vertically striped waistcoat under a short brown jacket with turned-back cuffs, a grey neckcloth, plain dark full-length trousers, a soft dark cap with a cockade, and brown shoes with pale pompoms.

- **high/wrong-subject** — "a pike at his side" → He carries no pike. He holds a flagstaff raised in his right hand, from which hangs a flag inscribed LIBERTE OU LA MORT - the single most conspicuous element of the picture, and the description misses it entirely and replaces it with a weapon. _(image \| flagstaff with lettered flag held aloft; commons \| categories include 'Paintings of flags of France' and 'People with flags in art')_
- **high/wrong-colour** — "the striped trousers" → The trousers are plain dark blue-black; it is the waistcoat that is striped in red and yellow. _(image \| plain dark long trousers, vertically striped waistcoat; commons \| categories 'Button flap trousers', 'Double-breasted waistcoats in art', 'Waistcoats in portrait paintings')_
- **medium/wrong-colour** — "red cap of the Revolutionary Parisian" → He wears a soft dark brown/black cap with a cockade, not the red bonnet rouge the phrase invokes. _(image \| dark cap with a red-and-white cockade at the side)_
- **low/unsupported-claim** — "in the small finished format characteristic of the artist" → No dimensions are in the record or the source, so the size claim rests on nothing. _(catalogue record \| realDimensions is null; commons \| no size given)_
- **metadata/`year`** — `null` → `1792` _(Commons categories include '1792 paintings in Paris' and 'Wars of the French Revolution in 1792'. Treat as a lead rather than a confirmed date - it comes from category tagging, not from a stated date field.)_

Second reviewer (upheld): Independently confirmed from the image. The trousers are plain, dark blue-black and full length; the stripes (red, pink and yellow, vertical) are on the double-breasted waistcoat. The cap is a dark soft cap with a red-and-white cockade, not a red bonnet. There is no pike: his raised right hand holds a wooden flagstaff with a red, pale and dark striped flag lettered 'LIBERTE OU LA MORT', the dominant element of the picture, and a pipe is in his mouth. Three of four visual specifics are wrong and the flag is missed, so major (right artwork, wrong content) is the correct severity. Search settled two further points. First, this is Boilly's portrait of the singer Simon Chenard as a sans-culotte, flag-bearer at the Fete de la Liberte for Savoy on 14 October 1792 (Musee Carnavalet, P8; also the Commons categories). Second, the Carnavalet/RMN records give it as oil on wood, 33.5 x 25.4 cm. So the original's 'small format' was actually true (the first agent's low-severity 'unsupported' note is wrong), but 'Oil on canvas' is wrong, and the first agent's replacement keeps that error. The replacement also drops the well-sourced sitter identification and date. Revised replacement fixes the support, names the sitter and occasion, and adds the clogs visible in the image.

**Current:**

> A standing sans-culotte in the striped trousers, short carmagnole jacket and red cap of the Revolutionary Parisian, a pike at his side. Boilly recorded such figures and the street life of Paris through the 1790s. Oil on canvas, in the small finished format characteristic of the artist.

**Proposed:**

> The singer Simon Chenard in sans-culotte costume stands on a rise before hills and water, a pipe in his mouth, holding up a flag lettered LIBERTE OU LA MORT. He wears a red-and-yellow striped waistcoat under a short brown jacket, a loose neckcloth, long dark trousers, clogs and a dark cap with a cockade. Boilly painted him as he appeared carrying the flag at the Paris festival for the liberty of Savoy on 14 October 1792. Oil on panel, in the small format Boilly favoured.

_Notes: Three of the description's four visual specifics are contradicted by the image, and it omits the flag and the pipe, which are what the picture is about. Still the right artwork, hence major rather than fabricated. Two things I deliberately left out of the replacement: the Commons categories 'Simon Chenard' and 'Carmagnole (clothing)' suggest this is Boilly's well-known portrait of the singer Simon Chenard in sans-culotte costume (Musee Carnavalet), and the flag reads as a French tricolour though one Commons category describes the stripes as black, red and yellow. Both are worth a human check before being written in; the sitter's name in particular would be a good addition if confirmed._

### `collection-of-beauty-the-waterwheel-at-onden-onden-no-suisha-from-the-series-thirty-six-views-of-mount-fuji-fugaku-sanju`

**冨嶽三十六景 隠田の水車-The Waterwheel at Onden** — Katsushika Hokusai, 1830 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Colour woodblock print: a huge waterwheel churns at the left beside a thatched building, water breaking into stylised white curls; villagers carry sacks along the bank, a woman washes vegetables at the water's edge, and a boy at lower right handles a turtle on a string. Snow-capped Mount Fuji stands beyond a flat plain at the right, with a title cartouche upper left and the artist's signature and seals at left.

- **high/invented-detail** — "in the small settlement of Onden in Sagami Province" → Onden was a farming village on the Shibuya river in Musashi Province, just outside Edo - the area of today's Harajuku/Aoyama in Tokyo. It was not in Sagami Province. _(web:https://www.masterpiece-of-japanese-culture.com/paintings/ukiyoe-wood-block-printing/katsushika-hokusai/watermill-onden-thirty-six-views-mount-fuji - Onden lay behind Zenko-ji temple in the Aoyama district, a farming village on the Shibuya river, now Harajuku, Tokyo)_
- **medium/no-visual-content** — "with the waterwheel as the focal point framed by surrounding landscape and architecture" → Generic filler that never names anything actually in the frame - the porters, the woman washing, the boy and the turtle, or Mount Fuji itself, which is the point of the series. _(image)_
- **low/style-hype** — "The composition showcases Hokusai's masterful use of perspective and detail" → Empty praise; 'showcases' and 'masterful' are on the house-style blacklist. _(style guideline)_
- **low/style-hype** — "This is one of the most celebrated examples of Edo period Japanese woodblock printing." → Unsupported superlative that says nothing specific about the print. _(style guideline)_

Second reviewer (upheld): The description does say 'Onden in Sagami Province'. Onden was in the Aoyama/Harajuku area on the Shibuya river, outside Edo, in Musashi Province, so the location is wrong. The other two sentences are generic praise and name nothing in the print. The image shows a thatched mill, a large waterwheel, two sack carriers, a woman carrying a tub, a child at lower LEFT with a turtle on a string, a crouching figure at right dipping a basket in the stream, and snow-capped Fuji at right. The first agent's replacement is mostly sound. It does leave out the woman with the tub. It also calls the crouching figure 'a woman washing vegetables', and neither the sex nor the contents of the basket can be read from the print. I tightened those details.

**Current:**

> A woodblock print from Katsushika Hokusai's series Thirty-six Views of Mount Fuji, depicting a waterwheel in the small settlement of Onden in Sagami Province. The composition showcases Hokusai's masterful use of perspective and detail, with the waterwheel as the focal point framed by surrounding landscape and architecture. This is one of the most celebrated examples of Edo period Japanese woodblock printing.

**Proposed:**

> A woodblock print from Katsushika Hokusai's Thirty-six Views of Mount Fuji. A great waterwheel turns beside a thatched mill at the left, its water breaking into curling white foam. Two villagers carry heavy sacks up the bank, a woman walks past with a tub on her hip, and a figure crouches to rinse a basket in the stream. At lower left a child leads a turtle on a string, and snow-capped Mount Fuji rises beyond the plain at the right. Onden was a farming village on the Shibuya river outside Edo, in what is now the Harajuku district of Tokyo.

_Notes: The Met attribution is grounded in the Commons credit line and the 'Images from Metropolitan Museum of Art' / 'Rogers Fund' categories; the 1830-32 range is the Commons date. The turtle, porters and washing woman are all clearly visible in the print and are corroborated by published descriptions of the plate._

### `collection-of-beauty-thomas-carlyle-oil-painting-1868-painted`

**Thomas Carlyle Oil Painting 1868** — George Frederic Watts, 1868 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A half-length portrait of an elderly white-bearded man in a dark coat and white collar, turned in three-quarter view against a dark ground, both hands resting together on a ledge or chair back in the foreground.

- **high/wrong-collection** — "given by the artist to the National Portrait Gallery, London, in 1895 (NPG 1002)" → This file is the Victoria and Albert Museum version (museum no. F.39), commissioned by John Forster and left to the museum in his 1876 bequest. NPG 1002 is a different Watts portrait of Carlyle, so the provenance sentence is attached to the wrong picture. _(commons credit is the V&A object page collections.vam.ac.uk/item/O133269 and the file is categorised 'Paintings by George Frederic Watts in the Victoria and Albert Museum'; web search confirms the V&A version was commissioned by Forster in May 1868 and bequeathed 1876)_
- **low/wrong-subject** — "A bust portrait" → Both hands are shown resting in front of the sitter, so the picture is half-length rather than a bust. _(image)_

Second reviewer (upheld): The V&A object page (collections.vam.ac.uk O133269, the Commons credit) gives museum no. F.39, 'Bequeathed by John Forster, 1876', and describes three-quarter view 'with crossed hands'; it states the National Portrait Gallery version lacks the hands. The image shows both hands crossed in the foreground, so this file is the V&A picture and the NPG 1002 / 1895 gift provenance belongs to a different canvas. Finding stands. However the proposed replacement introduces an ungrounded quote: Carlyle's documented complaint (V&A and NPG) was that Watts made him 'a delirious-looking mountebank', not 'a mad labourer'; its 'sittings recorded in 1867-68' is also unsupported (sittings are documented from May 1868). Corrected replacement below.

**Current:**

> A bust portrait of the historian and essayist Thomas Carlyle, white-bearded and turned in three-quarter view. Painted by Watts in 1868 and given by the artist to the National Portrait Gallery, London, in 1895 (NPG 1002); Carlyle himself disliked the likeness.

**Proposed:**

> A half-length portrait of the historian and essayist Thomas Carlyle, white-bearded and turned in three-quarter view, his hands crossed in front of him. Watts painted it in 1868 for John Forster, who bequeathed it to the Victoria and Albert Museum in 1876; a version without the hands is in the National Portrait Gallery. Carlyle disliked the likeness, calling himself a 'delirious-looking mountebank' in it.

_Notes: The 'Carlyle disliked the likeness' anecdote is real and I kept it in the sharper documented form ('like a mad labourer'), which V&A/Art UK material repeats. If the catalogue wants the NPG version instead, that is a different painting and a different file._

### `collection-of-beauty-valentin-a-serov-kupanie-loshadi`

**Bathing of a Horse** — Valentin Serov, 1905 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** One naked boy, bent double, washes a dark bay horse standing in shallow water; open sea runs out to a bright horizon with small distant figures or sails; loose, sketchy brushwork, signed 'V.S. 905' lower right.

- **high/wrong-count** — "Two boys lead a dappled horse" → There is one boy, not two, and he is bent over washing the horse rather than leading it. _(image - a single nude figure beside the horse)_
- **medium/wrong-colour** — "dappled horse" → The horse is a dark bay/brown with a light mane; it is not dappled grey. _(image)_
- **medium/unsupported-claim** — "belong to his later landscape work around the Domotkanovo estate" → The setting is open sea, not an inland estate pond. Russian sources place the painting on the shore of the Gulf of Finland, with Serov's own son bathing the horse; Domotkanovo appears to be imported from Serov's earlier 1880s-90s work. _(image - sea horizon; web:https://muzei-mira.com/kartini_russkih_hudojnikov/1463-kupanie-loshadi-serov-1905.html - 'написанная в 1905 году на берегу Финского залива', one boy)_

Second reviewer (upheld): Image confirms one nude boy bent over in the shallows beside a dark brown/bay horse with a light mane, open sea to the horizon, signed 'VS 905' lower right. 'Two boys lead a dappled horse' is wrong on count, action and coat (the two tiny specks far out in the water are distant bathers, not boys leading the horse). A search confirms the painting was made on the Gulf of Finland shore at Serov's dacha at Ino near Terijoki, with his son Alexander (rusmuseumvrm.ru / cyclowiki / valentin-serov.ru), so the Domotkanovo attribution is also wrong. The first agent's replacement is accurate and conservative; keep it.

**Current:**

> Two boys lead a dappled horse into shallow water under a high summer sky, the animal's reflection broken across the surface. Serov painted the canvas in 1905, oil on canvas, now in the State Russian Museum, St Petersburg. The plein-air handling and loose, light-struck water belong to his later landscape work around the Domotkanovo estate.

**Proposed:**

> A naked boy stoops to wash a dark bay horse standing in the shallows, the sea running out behind them to a bright horizon. Serov painted the canvas in 1905, oil on canvas, now in the State Russian Museum, St Petersburg. The loose, light-struck handling of water and sky belongs to his late plein-air work.

_Notes: Date, medium and the Russian Museum are all supported by the Commons categories. I left the Gulf of Finland out of the replacement: the sources I found for it are popular-art sites rather than the museum, so it is better omitted than asserted. What matters is that 'two boys', 'dappled' and 'Domotkanovo' all have to go._

### `collection-of-beauty-vincent-van-gogh-pieta-after-delacroix`

**Pietà** — Vincent van Gogh, 1889 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** The Virgin in a deep blue robe and white headcloth leans back with both arms flung wide over the body of Christ, who lies across her lap with greenish-yellow flesh, red-brown hair and beard and a pale cloth over his hips; behind them a blue-green rock face and a sky streaked yellow and orange, everything worked in short curling strokes. Signed at the right.

- **high/unsupported-claim** — "reflects Van Gogh's deep engagement with Renaissance tradition" → The painting is a copy after Delacroix, a nineteenth-century Romantic — as the record's own English title says. The Saint-Rémy copies were made after prints of Delacroix, Millet, Rembrandt and Doré, not after Renaissance art, so the sentence points at the wrong tradition and at nothing in the picture. _(catalogue record — englishTitle "Pietà (after Delacroix)"; commons file title "Pietà (naar Delacroix)")_
- **medium/wrong-collection** — "Originally housed in the Van Gogh Museum in Amsterdam" → "Originally housed" implies the work has since moved. It is in the Van Gogh Museum now; the inventory number quoted (s0168V1962) is that museum's current one. _(commons — credit "Van Gogh Museum", file title "s0168V1962 - Van Gogh Museum")_
- **medium/no-visual-content** — "The composition depicts the Pietà scene" → Restates the title instead of describing anything: the blue-robed Virgin with outstretched arms, the greenish body of Christ, the cave and the streaked evening sky all go unmentioned. _(image)_

Second reviewer (upheld): Both quotes are in the description. The picture is a copy after a lithograph of Delacroix's Pieta, made at Saint-Remy in 1889 among copies after Delacroix, Millet, Rembrandt and Dore - nineteenth-century and Baroque sources, not Renaissance ones - so 'reflects Van Gogh's deep engagement with Renaissance tradition' points the reader at the wrong tradition and is contradicted by the record's own English title. 'Originally housed in the Van Gogh Museum' is also wrong in a second way beyond implying a move: the museum opened in 1973, so it can be the current holder but never the original one; s0168V1962 is its present inventory number. The description carries no visual content at all, which is fair to flag. I checked the proposed replacement against the image and against Van Gogh's own account of the picture (the corpse lying at the entrance of a cave, evening sky with golden-edged clouds), and the blue-robed Virgin with arms flung wide, the greenish-yellow body, the cave and the streaked sky are all in the reproduction. Replacement is sound.

**Current:**

> Oil painting created by Vincent van Gogh in Saint-Rémy-de-Provence in 1889 as part of his series copying Old Master works. The composition depicts the Pietà scene and reflects Van Gogh's deep engagement with Renaissance tradition. Originally housed in the Van Gogh Museum in Amsterdam (catalog s0168V1962).

**Proposed:**

> The Virgin in a deep blue robe throws both arms wide over the body of Christ, whose greenish-yellow flesh and red hair stand out against a dark cave mouth and a sky streaked with yellow, the whole surface worked in short curling strokes. Van Gogh painted it at Saint-Rémy-de-Provence in 1889 after a print of Delacroix's Pietà, one of a group of paintings he made from other artists' compositions during his stay at the asylum. It is in the Van Gogh Museum, Amsterdam, inventory s0168V1962.

_Notes: The "Renaissance tradition" sentence is the kind of confident, wrong-source claim worth catching — it contradicts the record's own title. I kept "after a print of Delacroix's Pietà" deliberately vague about which print: the Van Gogh Museum attributes his model to a lithograph after Delacroix, but I did not want to name the lithographer without a source in hand. Note the Vatican Museums hold a second Van Gogh Pietà of 1889; the image here matches the Amsterdam version named in the Commons file._

### `collection-of-beauty-watteau-antoine-huit-etudes-de-tetes-de-femme-et-une-tete-d-homme`

**WATTEAU Antoine - Huit études de têtes de femme** — Jean-Antoine Watteau, 1715 · collection-of-beauty · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A chalk study sheet on grey-brown paper with nine heads: four women across the top, four more women below, and at lower right a bearded man with open mouth. Drawn in red, black and white chalk (trois crayons); no visible inscription.

- **high/wrong-collection** — "accession INV 33383" → INV 33383 is a different Watteau sheet in the Louvre — 'Huit études de têtes', eight heads including a young Black sitter and an oboe player, neither of which appears in this image. The sheet actually shown (eight women plus one man's head) is Louvre INV 33384. _(web:https://collections.louvre.fr/en/ark:/53355/cl020210771 (INV 33383 = 'Huit études de têtes', eight heads, young Black male at left, oboe player at bottom) vs web:https://collections.louvre.fr/en/ark:/53355/cl020210772 (INV 33384 = 'Huit études de têtes de femme, et une tête d'homme', black chalk with white highlights and sanguine on grey paper, 0.25 x 0.381 m) — the second matches the image and the record's objectKey filename)_
- **medium/unsupported-claim** — "likely preparatory studies for figures appearing in paintings such as La Conversation and L'amour dans un théâtre italien" → The La Conversation link belongs to the other sheet (INV 33383, where the head of the young Black sitter was reused). For the sheet actually reproduced here the Louvre records only the lower-left study going into 'L'Amour au théâtre italien' (Berlin) and the male head recurring in 'Mezzetin' (Chantilly). _(web:https://collections.louvre.fr/en/ark:/53355/cl020210772 and web:https://collections.louvre.fr/en/ark:/53355/cl020210771)_
- **low/unsupported-claim** — "Created circa 1715–1716" → Commons gives the date as 'S.d.' (undated) and the Louvre record carries no date; the two-year bracket is asserted without backing (the catalogue's own year is a bare 1715). _(commons — date field 'S.d.'; catalogue record year 1715)_
- **metadata/`realDimensions`** — `null` → `{ widthCm: 38.1, heightCm: 25.0 }` _(Louvre INV 33384 record: H. 0.25 m; L. 0.381 m)_

Second reviewer (upheld): The image shows nine heads: four women along the top, four women below and a moustached man at lower right, in red, black and white chalk on grey paper. There is no young Black sitter and no oboe player. I fetched both Louvre records. INV 33383 is 'Huit études de têtes': eight heads including a young Black man at left and an oboe player, and it is the sheet linked to La Conversation (Toledo). INV 33384 is 'Huit études de têtes de femme, et une tête d'homme': black chalk, white highlights and sanguine on grey paper, 0.25 x 0.381 m. That matches the image and the record's objectKey. The Louvre links its lower-left study to L'Amour au théâtre italien (Berlin) and the man's head to Mezzetin (Chantilly). The description gives the wrong accession number and borrows the La Conversation link from the other sheet, so 'major' is right. The Louvre gives no date, only 'early 18th century', so 'circa 1715–1716' is unsupported. I adjusted the replacement in two ways. It said 'the standing woman' in L'Amour au théâtre italien, but the Louvre only says 'the study in the lower left', which is a head, so I removed that phrase. I also added the Mezzetin link, which the Louvre documents.

**Current:**

> A study sheet by the French Rococo master Watteau, comprising eight head studies executed in sanguine, black chalk, and white chalk on gray paper. Created circa 1715–1716, the work features multiple female heads and at least one male head, likely preparatory studies for figures appearing in paintings such as La Conversation and L'amour dans un théâtre italien. Held in the Louvre Museum (accession INV 33383).

**Proposed:**

> A study sheet in sanguine, black chalk and white heightening on grey paper, with eight heads of women and, at lower right, the head of a man. Watteau kept sheets like this as a stock of figures to use when he composed his paintings. The Louvre holds the drawing (INV 33384). It links the lower-left study to L'Amour au théâtre italien in Berlin and the man's head to Mezzetin at Chantilly.

_Notes: The Commons file is titled 'Antoine Watteau, Huit études de têtes', which is the title of the *other* Louvre sheet (INV 33383) — that mis-titling is almost certainly what pulled the wrong accession number and the La Conversation reference into the description. The image itself (nine heads, eight female + one male, no Black sitter, no oboe player) matches INV 33384 and the record's own objectKey filename. I have kept the medium out of the rewrite's wording only as far as the Louvre states it (black chalk, white highlights, sanguine on grey paper), which agrees with the reproduction._

### `collection-of-beauty-william-merritt-chase-still-life-with-hummingbird-google-art-project`

**Still Life with Hummingbird** — William Merritt Chase, 1870 · collection-of-beauty · prior audit: minor-fixed · confidence high · verify: upheld

> **What the image shows.** A tall conical bouquet — red and pink roses, carnations, small white and blue flowers, blades of grass and broad green leaves — rises from a pale moulded vase with relief decoration, against a brushy warm grey-brown ground. A hummingbird hovers with wings raised at the upper left, level with and slightly to the side of the top of the bouquet.

- **high/anachronism** — "reflect Chase's Munich-trained still-life manner in his earliest years" → Chase did not go to Munich until 1872, two years after this picture. An 1870 canvas cannot reflect Munich training. His training to that point was with Barton S. Hays in Indianapolis and at the National Academy of Design in New York. _(web:https://americanart.si.edu/artist/william-merritt-chase-840 and https://nationalacademy.emuseum.com/people/122/william-merritt-chase — Chase entered the Royal Academy in Munich in 1872 and stayed six years; catalogue record — year 1870, corroborated by the Commons date field)_
- **medium/wrong-collection** — "held in the collection identified in museum records as Q1117704" → A raw Wikidata identifier has been left in the reader-facing text as if it were a collection name. Commons identifies the holder plainly. _(commons — categories 'Google Art Project works in Indianapolis Museum of Art', 'American paintings in the Indianapolis Museum of Art', 'Still-life paintings in the Indianapolis Museum of Art')_
- **low/invented-detail** — "A hummingbird hovers at the apex of a dense floral arrangement" → The bird hovers to the left of the bouquet, roughly level with its upper third, not at its apex. _(image)_
- **metadata/`provenance.collection`** — `Q1117704` → `Indianapolis Museum of Art` _(commons — three separate Indianapolis Museum of Art categories on the file; the unresolved Q-id has evidently leaked from the record into the description text)_

Second reviewer (upheld): Quoted text is present. Chase's Munich study beginning in 1872 is well established (he enrolled at the Royal Academy in Munich in 1872), so 'Munich-trained' for an 1870 canvas is an anachronism. The raw Q1117704 in reader-facing text is a real defect; that Wikidata item is the Indianapolis Museum of Art, and the Commons categories name the IMA. Image check: hummingbird hovers to the upper left beside the top of the bouquet, near but not exactly at the apex (minor); vase has grape-cluster relief; ground is warm brown. The replacement is accurate and grounded.

**Current:**

> A hummingbird hovers at the apex of a dense floral arrangement in an ornate vase, the roses, carnations and grasses rendered against a warm ochre ground. The tightly observed bird and academic handling of the blooms reflect Chase's Munich-trained still-life manner in his earliest years. Painted in 1870, the work is held in the collection identified in museum records as Q1117704.

**Proposed:**

> A hummingbird hovers beside the top of a dense conical bouquet — red and pink roses, carnations, small white and blue flowers and blades of grass — set in a pale moulded vase against a warm ochre ground. The tightly observed bird and the careful handling of the blooms belong to Chase's early still-life work, painted in 1870, two years before he left to study at the Royal Academy in Munich. The picture is in the Indianapolis Museum of Art.

_Notes: The Munich claim is the substantive error and is cleanly disprovable from the record's own year. I inverted it rather than deleting it, since 'before Munich' is both true and useful. The collection name comes from the Commons categories; if someone wants the accession, the record already has 58.31. The 'apex' nit is folded into the replacement and would not on its own have justified a verdict above accurate._

### `redoute-roses-rosa-andegavensis-118`

**Rosa Andegavensis** — Pierre-Joseph Redouté, 1824 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** One large, fully double, mid-pink rose of cabbage-rose form with dozens of overlapping petals, flanked by several tight dark-crimson buds and two analytical details showing a receptacle with a ring of yellow stamens; broad pointed leaflets below and a stem thick with red prickles and gland-tipped bristles.

- **high/wrong-colour** — "flowers open pale pink and fade to white" → The plate shows a single saturated mid-pink, many-petalled double flower with dark crimson buds; nothing on the sheet is pale pink fading to white. _(image - 2x crop of the flower head)_
- **medium/wrong-subject** — "a tall hedge shrub" → Rosa x andegavensis is a wild hedgerow rose (R. canina x R. gallica) with single five-petalled flowers; the plant drawn here is a fully double garden rose, so the description of the species does not match the plate it is attached to. _(knowledge of R. x andegavensis Bastard, plus web:https://identify.plantnet.org/fr/weurope/species/Rosa%20x%20andegavensis%20Bastard/data - a canina-group hybrid with simple flowers)_
- **metadata/`title`** — `Rosa Andegavensis` → `needs checking against the c82.net plate order` _(The image is a double pink garden rose, which is not what Rosa x andegavensis looks like; either the image is paired with the wrong title/id (the id carries plate number 118) or the plate is unusual. c82.net could not be fetched to confirm.)_

Second reviewer (upheld): The image shows one large, fully double, mid-pink rose with dark crimson buds and a thick stem with red prickles. Nothing is pale pink fading to white. The collection has a second plate, redoute-roses-rosa-andegavensis-59. That plate shows the actual Anjou rose: single five-petalled white-to-blush flowers with yellow stamens on a slender stem. So the 118 text describes the species of plate 59, not the plant drawn on plate 118. This is a mis-pairing of text or title, not an invented description, and major is the right severity. The first agent's replacement has one error. The two yellow-centred objects are not 'analytical details'. They are flowers on their own stalks that have shed their petals, showing stamens inside the sepals. The pedicels and buds carry glandular bristles, and the main stem carries red prickles.

**Current:**

> Rosa andegavensis, the Anjou rose, a tall hedge shrub whose flowers open pale pink and fade to white, carrying a faint scent of strawberry above oval pointed leaflets. The calyx tube and stalk bristle with gland-tipped hairs, a distinguishing trait recorded in Thory's text.

**Proposed:**

> A single large double rose in mid-pink, its many overlapping petals cupped around a darker centre, with tight dark-crimson buds on bristly stalks around it. Two further flowers have already dropped their petals, leaving rings of yellow stamens inside the sepals. Broad toothed leaflets spread below on a stem thick with red prickles. Plate from Les Roses, drawn by Pierre-Joseph Redouté with text by Claude-Antoine Thory.

_Notes: IMPORTANT: the likelier root cause is a mis-paired image or a mis-transcribed plate title rather than a hallucinated description - the existing text is a decent account of the wild species Rosa x andegavensis, just not of this sheet. Confirm the plate identity before applying my replacement; if the image is wrong, fix the pairing and keep the old text. My replacement deliberately drops the species name and describes only what is on the sheet. Note that the glandular calyx-tube claim in the old text IS visible in the image._

### `redoute-roses-rosa-bifera-pumila`

**Rosa Bifera Pumila** — Pierre-Joseph Redouté, 1824 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Botanical plate: one fully open rose-pink double flower with a bud beside it at the upper right, and at the upper left a group of three green, funnel-shaped calyx tubes with glandular-bristly stalks, one just splitting to show pink. Mid-green toothed leaflets fill the middle; the foot of the plate is a bare green stem with small prickles. No hips are shown.

- **high/invented-detail** — "with red pear-shaped hips at the foot" → No hips appear anywhere on the plate. The foot of the sheet is a prickled green stem with leaves; the only fruit-like bodies are the green, unripe calyx tubes of the buds at the top left. _(image — bottom third of the plate contains only stem and leaflets)_
- **low/wrong-colour** — "its pale-pink double flowers" → The single open flower is a fairly saturated rose-pink, not pale pink; and only one flower is open, the rest are buds. _(image)_

Second reviewer (upheld): Quote is in the description. I viewed the plate: one open double flower at the top right with a half-open pink bud below it, green glandular-bristly buds at the top left, toothed leaflets in the middle, and a bare stem with small prickles at the foot. There are no hips at the foot or anywhere else, so the closing clause describes something absent. The flower is a clear mid rose-pink, so 'pale-pink' is a minor colour slip. The replacement's 'open above a group of green buds' gets the layout wrong: the green buds sit level with the flower at the upper left, not below it. My corrected text fixes that.

**Current:**

> Rosa bifera pumila, a dwarf four-seasons rose barely a foot high, its pale-pink double flowers clustered in upright corymbs above small dark-green leaflets. The stalks and funnel-shaped calyx tubes are coated with rose-scented glandular hairs, with red pear-shaped hips at the foot.

**Proposed:**

> Rosa bifera pumila, a dwarf four-seasons rose barely a foot high, with one rose-pink double flower open at the top beside a half-open bud and a group of green buds. The stalks and funnel-shaped calyx tubes are coated with rose-scented glandular hairs, above small toothed leaflets.

_Notes: The funnel-shaped, glandular calyx tubes are genuinely there and worth keeping; the hips are not. I kept 'barely a foot high' and 'rose-scented' from the original because they read as Thory's text rather than invention, but neither can be checked here (c82.net 403) — drop them if the applying agent wants a strictly image-grounded line._

### `redoute-roses-rosa-canina-burboniana`

**Rosa Canina Burboniana** — Pierre-Joseph Redouté, 1824 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** One large fully double rose in deep rose-pink with a green-yellow eye, a second half-open bloom and two buds above; a long stem armed with dark hooked prickles runs to the bottom of the sheet, ending in a bare prickly cane and a small leafy shoot. There is no fruit anywhere on the plate.

- **high/invented-detail** — "Red ovoid hips ripen at the foot of the plate." → Directly contradicted by the image. The sentence names a location within the sheet ('at the foot of the plate'), so it is an unambiguous claim about what is depicted, and nothing of the kind is there: the foot of the plate carries a bare prickly cane and a small leafy shoot. _(image — the lower third of the sheet shows stem, prickles and a leaf shoot only; no fruit is drawn.)_
- **low/unsupported-claim** — "sweet-scented" → Scent cannot be read from a plate and is not in the record; likely from Thory but unverifiable here. _(sourceEvidence — c82.net behind a bot challenge.)_

Second reviewer (upheld): Quoted sentence is in the description. I viewed the full plate and a crop of the top. No hips or fruit appear anywhere. The foot of the plate shows only the bare prickly cane and a small cluster of leaves. The finding stands. The first agent's replacement is wrong on two points, though. It says the open bloom sits 'above' the half-open flower, but it sits below and to the left of it. It also says 'two buds', but there is one half-open flower at the top and only one closed bud at the upper right. I have corrected the replacement to match the plate.

**Current:**

> Rosa canina burboniana, the Bourbon Island dog rose, a vigorous bushy shrub with strong reddish hooked prickles and glossy leaflets, its sweet-scented flowers of three or four petal ranks in brilliant rose. Red ovoid hips ripen at the foot of the plate.

**Proposed:**

> Rosa canina burboniana, the Bourbon Island dog rose, a vigorous shrub with strong dark hooked prickles and glossy leaflets, its flowers of three or four petal ranks in brilliant rose. A fully open bloom with a yellow centre sits below a half-open flower and a single bud, on a long prickly cane that runs to the foot of the plate.

_Notes: This is the clearest fabrication in the batch after the Sisley: a whole sentence places red hips 'at the foot of the plate', where there are none. Everything else about the plant is consistent with the plate. I changed 'reddish hooked prickles' to 'dark hooked prickles' because the prickles read dark brown rather than red, but that is a shade call, not the reason for the verdict._

### `redoute-roses-rosa-cinnamomea-majalis`

**Rosa Cinnamomea** — Pierre-Joseph Redouté, 1817 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A rose stem with one fully open double flower at the left — many overlapping rose-pink petals around a small yellow centre — plus two double buds; leaflets are ovate and toothed, and the reddish stems carry only a few widely spaced straight prickles.

- **high/wrong-subject** — "single flowers of five heart-notched petals washed red" → The plate shows a DOUBLE flower packed with many petals, not a five-petalled single flower. The description appears to have imported the characteristics of Redouté's other cinnamon-rose plate, 'Rosa cinnamomea flore simplici' (Rosier de Mai à fleurs simples). _(image — the open bloom has dozens of overlapping petals and no visible ring of five; web:https://digitalcollections.nypl.org/items/510d47de-1423-a3d9-e040-e00a18064a99 — the plate is catalogued 'Rosa Cinnamomea Maialis; Rosier de Mai a fleurs doubles' (double-flowered), and a separate plate exists for the single-flowered form)_
- **medium/invented-detail** — "stems crowded with short prickles below" → The lower stems carry only a handful of widely spaced prickles; nothing in the plate is 'crowded'. _(image)_
- **low/wrong-colour** — "washed red" → The flowers read as mid rose-pink, not red-washed. _(image)_

Second reviewer (upheld): Quoted text is verbatim in the description. I read the plate at full size and magnified the open bloom: it is unambiguously DOUBLE - dozens of overlapping rose-pink petals crowded around a small yellow centre - and the two buds at top are double as well; there is no ring of five heart-notched petals anywhere. Colour is mid rose-pink, not 'washed red'. The stems carry only a handful of widely spaced prickles at the nodes, not 'crowded with short prickles'. The cross-contamination hypothesis is confirmed by the sibling file in this same folder, redoute-roses-rosa-cinnamomea.jpg, which IS the single five-petalled crimson-and-white form with heart-notched petals and a yellow boss - exactly what the description recites. WebSearch corroborates the plate title: NYPL catalogues it 'Rosa Cinnamomea Maialis; Rosier de Mai a fleurs doubles' and trade listings describe it as the 'double form of R. majalis'. The proposed replacement claims nothing beyond the image and the plate title, and keeps the correct Josephine/Malmaison sentence verbatim. Severity 'major' is right - one half of the description is wrong-subject, the other half is sound.

**Current:**

> Rosa cinnamomea in its May-flowering form, single flowers of five heart-notched petals washed red above ovate leaflets and stems crowded with short prickles below. Redoute was flower painter to Empress Josephine, and Les Roses grew out of her Malmaison collection.

**Proposed:**

> Rosa cinnamomea in its May-flowering form, the double-flowered Rosier de Mai, its rose-pink blooms packed with overlapping petals above ovate, toothed leaflets on slender stems set with a few scattered prickles. Redoute was flower painter to Empress Josephine, and Les Roses grew out of her Malmaison collection.

_Notes: This is the clearest fabrication in the batch: the botanical description belongs to a different plate. I kept the second sentence verbatim since it is correct and unchanged. c82.net could not be fetched, so the wording of Thory's text is unavailable; the replacement claims nothing beyond the image and the plate's own title._

### `redoute-roses-rosa-collina-fastigiata-120`

**Rosa Collina** — Pierre-Joseph Redouté, 1824 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Two many-petalled (double) blooms side by side in a cluster with three buds — the right one blush white with a ring of yellow stamens showing at the centre, the left a pale lilac-pink — above broad ovate leaflets. The stems carry fine, straight, slender prickles.

- **high/wrong-count** — "soft-pink five-petalled flowers in a loose umbel" → Neither flower on the plate is five-petalled; both are full doubles with many overlapping petals. The colours are also blush-white and pale lilac rather than uniformly soft pink. _(image — two double blooms, one white with visible stamens, one pale lilac)_
- **medium/invented-detail** — "The strong hooked prickles are broadly swollen at the base" → The prickles drawn on the plate are fine and straight, not strong hooked prickles with swollen bases. _(image — slender straight prickles along the stems)_

Second reviewer (upheld): The quoted text is in the description. I viewed the plate: both open blooms are fully double, with many overlapping petals. The left bloom is lilac-pink. The right bloom is blush-white and shows a ring of yellow stamens. There are pink buds as well. No flower is five-petalled. The stem prickles are small, fine and mostly straight, not strong hooked prickles swollen at the base. The first agent read the image correctly. The replacement describes what is visible. It also adds that the plate is a colour-printed, hand-finished stipple engraving, which is well established for Les Roses. It rightly drops the leaf-underside and style claims, which the image cannot confirm.

**Current:**

> Rosa collina in its fastigiate form, soft-pink five-petalled flowers in a loose umbel above ovate-lanceolate leaflets, glossy above and woolly beneath. The strong hooked prickles are broadly swollen at the base, and the styles are free and glabrous.

**Proposed:**

> Rosa collina in its fastigiate form: two many-petalled blooms in a loose cluster with buds above, the right one blush white with a ring of yellow stamens showing at its centre, the left a pale lilac-pink, carried on stems set with fine straight prickles above broad ovate leaflets. The stipple engraving was printed in colour and finished by hand.

_Notes: The petal count is the substantive error and is unambiguous in the plate. I dropped the leaf-texture and style claims ('glossy above and woolly beneath', 'styles free and glabrous') because they cannot be checked from the image and the source text is unreachable — they may well be Thory's, so a reviewer with the Les Roses text could restore them._

### `redoute-roses-rosa-collina-fastigiata-61`

**Rosa Collina** — Pierre-Joseph Redouté, 1821 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Botanical plate: three open five-petalled flowers, white with the faintest pink flush and yellow stamens, clustered at the tip of a shoot with buds; large toothed leaflets below on a reddish stem armed with scattered red-brown prickles. The foot of the plate is a bare leafy shoot end — there are no separate dissection or detail figures anywhere on the sheet.

- **high/invented-detail** — "The dissection figures at the foot enlarge the flower's parts, a botanical convention of the period." → There are no dissection figures on this plate. The foot of the sheet shows the end of the flowering shoot with leaves and a cut stem; nothing is enlarged or dissected. _(image — the lower third of the plate is a leafy shoot on white ground, with no detail figures)_
- **medium/wrong-colour** — "nearly scentless pink flowers" → The flowers are white with only a faint pink flush; 'pink flowers' overstates the colour. _(image — petals are white, blushed pink only at a few edges and on one bud)_

Second reviewer (upheld): Quote is in the description. I viewed the plate: three open flowers with buds at the top, a prickled reddish stem, toothed pinnate leaves, and a cut shoot end at the foot. There are no dissection or enlarged detail figures anywhere, so the whole second sentence describes something the plate does not have. The petals are white with only a faint pink blush, so 'pink flowers' is also off, though that part alone would be minor. The replacement is image-grounded; the colour-printed, hand-finished stipple engraving note is standard for Les Roses.

**Current:**

> A hill rose, Rosa collina fastigiata, nearly scentless pink flowers arranged in an umbel above singly toothed leaflets on a shrub seven or eight feet high. The dissection figures at the foot enlarge the flower's parts, a botanical convention of the period.

**Proposed:**

> A hill rose, Rosa collina fastigiata, its nearly scentless flowers white with a faint pink flush, gathered in a cluster at the tip of the shoot above large toothed leaflets. The stem is armed with scattered red-brown prickles. The stipple engraving was printed in colour and finished by hand, as throughout Les Roses.

_Notes: The dissection-figure sentence is the clear defect — it describes a convention that other Redoute plates use (the eglanteria plate in this same batch does carry a separate hip figure) but that this plate does not. I dropped 'on a shrub seven or eight feet high' from the replacement: it presumably comes from Thory's text, but nothing available here supports it and c82.net is 403, so it is unverifiable rather than wrong. 'Singly toothed' was also dropped because the tooth pattern cannot be settled at this resolution._

### `redoute-roses-rosa-indica-autumnalis`

**Rosa Indica Autumnalis** — Pierre-Joseph Redouté, 1824 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A single large rose-pink double flower and one closed bud on a prickly green stem with toothed, slightly glossy leaflets. The plate has no dissection or enlargement figures anywhere — the sheet below and beside the plant is empty white paper.

- **high/invented-detail** — "The dissection figures at the foot enlarge the flower's parts." → There are no dissection figures on this plate. The area at the foot of the composition is blank paper; only the flowering stem and one bud are drawn. _(image — compare the Ixia plate in this same batch (redoute-lilies-ixia-fusco-citrina), which does carry two outline dissection figures at lower left; this rose plate carries none.)_

Second reviewer (upheld): I read the image myself. The plate shows one large rose-pink double bloom at upper left, a bud (with a second bud tucked behind it) on a separate stalk, and a prickly stem with serrated leaflets on blank white paper. There are no dissection or enlarged-part figures anywhere, including at the foot of the sheet. The claim is a concrete invented detail, and it is checkable against the plate, so 'major' is the right severity. The replacement only drops that sentence and adds what the plate shows: one open bloom, a bud and a prickly stem. Every added detail is visible, and it keeps the original's other content. I found nothing to correct in it.

**Current:**

> Rosa indica autumnalis, the autumn Bengal rose, a China cultivar bearing rose-pink double flowers above smooth toothed foliage. Redoute drew it for Les Roses, which documented species roses and early garden cultivars before the rise of the modern hybrid. The dissection figures at the foot enlarge the flower's parts.

**Proposed:**

> Rosa indica autumnalis, the autumn Bengal rose, a China cultivar bearing rose-pink double flowers above smooth toothed foliage; a single open bloom and one closed bud are shown on a prickly stem. Redoute drew it for Les Roses, which documented species roses and early garden cultivars before the rise of the modern hybrid.

_Notes: Only the last sentence is wrong; the first two sentences are kept verbatim with a clause added for what the plate actually shows. Dissection figures are a real convention in Redouté's Liliacees plates, which is probably where the sentence came from — worth checking whether other rose entries in this folder carry the same borrowed sentence._

### `redoute-roses-rosa-indica-cruenta`

**Rosa Indica** — Pierre-Joseph Redouté, 1817 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** One deep crimson double rose in full bloom with two buds on a reddish-green stem, glossy dark toothed leaflets below, on a plain white ground. No dissection or analytical figures anywhere on the sheet.

- **high/invented-detail** — "The dissection figures at the foot enlarge the flower's parts." → There are no dissection figures on this plate. The lower part of the sheet holds only the stem and leaves; nothing is enlarged or dissected. _(image - the whole sheet is a single flowering branch on white ground)_

Second reviewer (upheld): Quote is verbatim in the description. The image is one flowering branch on bare white ground: one open crimson double rose, several buds, and a leafy stem running off the lower edge. The foot of the sheet holds only stem and leaves, with no enlarged or analytical figures anywhere. The claim is invented. The replacement just deletes that sentence, and the two sentences it keeps match the plate.

**Current:**

> Rosa indica cruenta, a Bengal rose, a China cultivar carrying deep crimson flowers above glossy toothed leaflets. Redoute was flower painter to Empress Josephine, whose garden at Malmaison held the most celebrated rose collection of the age, and Les Roses grew out of it. The dissection figures at the foot enlarge the flower's parts.

**Proposed:**

> Rosa indica cruenta, a Bengal rose, a China cultivar carrying deep crimson flowers above glossy toothed leaflets. Redoute was flower painter to Empress Josephine, whose garden at Malmaison held the most celebrated rose collection of the age, and Les Roses grew out of it.

_Notes: Only the third sentence is wrong; the first two are kept verbatim. Some Redoute plates do carry analytical figures, which is probably where this came from - but not this one._

### `redoute-roses-rosa-indica-pumila-flor-simplici`

**Rosa Indica Pumila** — Pierre-Joseph Redouté, 1821 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Botanical plate: a single-flowered dwarf rose whose one open flower has five clearly rose-pink petals paling to white at the base around a yellow eye of stamens; two spent flowers show bare yellow receptacles; small serrated leaflets on wiry prickly stems. No red hips are shown.

- **high/wrong-colour** — "its five white petals washed with pink" → Inverts the colour. The petals are rose-pink with pale, near-white bases, not white washed with pink - and this is the plate's main subject. _(image; also web:https://www.c82.net/redoute/flower/rosa-indica-pumila (via search) - Thory describes the flowers of Rosa indica pumila as pink.)_
- **medium/invented-detail** — "with oval pale-red hips" → No hips appear on the plate; the two spent flowers show green-yellow receptacles with the petals fallen. _(image.)_
- **low/unsupported-claim** — "above small glossy leaflets" → The leaflets are matte mid-green in the plate; glossiness is not evident. _(image.)_

Second reviewer (upheld): Verified against the plate at full size and on a zoomed crop of the flower. The single open bloom has five broad petals that are a saturated rose-pink over most of their area, paling to near-white only in the inner third around a ring of yellow stamens and a green disc; 'five white petals washed with pink' inverts that and misstates the plate's principal subject. The 'oval pale-red hips' are also not present: the two objects that might be mistaken for them are (a) a spent flower at upper left and another at right, each showing a green receptacle with reflexed sepals and a crown of yellow stamens after petal fall, and (b) a single pink bud at lower left on a green ovoid receptacle - all pre-fruit, none a ripened hip. The leaflets are matte mid-green, so 'glossy' is a further small overstatement. Two genuine errors on the primary subject, but the species, the single-flowered dwarf Bengal identification and the Les Roses / stipple-engraving context are all correct, so 'major' is the right level rather than 'fabricated'. The first agent's replacement is accurate to the image and I found nothing to correct in it.

**Current:**

> A single-flowered dwarf Bengal rose, its five white petals washed with pink rounded at the tip above small glossy leaflets, with oval pale-red hips. Redoute drew it for Les Roses; the stipple engraving was printed in colour and finished by hand in watercolour.

**Proposed:**

> A single-flowered dwarf Bengal rose, its five rose-pink petals paling to white at the base around a ring of yellow stamens, carried on wiry prickly stems with small serrated leaflets; two spent flowers have already shed their petals. Redoute drew it for Les Roses; the stipple engraving was printed in colour and finished by hand in watercolour.

_Notes: Colour is the decisive error and it is unambiguous in the plate. The stipple-engraving sentence is true of Les Roses generally and was kept verbatim._

### `redoute-roses-rosa-rubiginosa-anemone-flora`

**Rosa Rubiginosa** — Pierre-Joseph Redouté, 1824 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** Botanical plate: one large pale-pink double flower (sampled median hue ~343 degrees, low saturation) with a glimpse of yellow stamens, surrounded by many green unopened buds on bristly, hooked-prickled canes with dark green leaflets. No coloured hips.

- **high/wrong-colour** — "its purple flowers tinged with violet" → The single open flower is pale pink, not purple or violet, and there is only one open bloom rather than several. _(image - pixel-sampled median hue ~343 degrees at low saturation, i.e. pale pink)_
- **medium/invented-detail** — "with red hips that darken in autumn cold" → Every fruiting structure in the plate is a green unopened bud; no red hips appear. _(image)_
- **low/unsupported-claim** — "wine-scented leaves" → Sweetbriar foliage is conventionally described as apple-scented; 'wine-scented' is unsupported by anything available here. _(knowledge; c82.net source unavailable)_

Second reviewer (upheld): Independently confirmed from the plate. There is exactly one open bloom and it is unambiguously pale pink (soft rose-pink with a yellow stamen boss), nowhere near purple or violet; the description's 'purple flowers tinged with violet ... arranged in a corymb' matches nothing in the image. Every other reproductive structure is a green, tightly sepalled bud - there is no red hip anywhere on the sheet, so 'red hips that darken in autumn cold' is invented. The species identification and the Volume 3 / 1824 Les Roses attribution are both fine, so 'major' rather than 'fabricated' is the right level. I only reworded the replacement: 'wine-scented' was correctly dropped, but the reviewer's substitute clause ('its glandular leaflets scented') dangles, and the sweetbriar's apple-scented glandular foliage is well established and worth stating properly. Also restored the accent on Redoute.

**Current:**

> An anemone-flowered sweetbriar, Rosa rubiginosa, its purple flowers tinged with violet and arranged in a corymb above wine-scented leaves, with red hips that darken in autumn cold. Redoute drew it for Volume 3 of Les Roses, issued in 1824.

**Proposed:**

> An anemone-flowered sweetbriar, Rosa rubiginosa: one pale-pink, many-petalled bloom opens among a spray of green buds on bristly, prickled canes, its leaflets carrying the scent glands that give the sweetbriar its apple smell. Redouté drew it for the third volume of Les Roses, published in 1824, with botanical text by Claude-Antoine Thory.

_Notes: The colour claim is flatly contradicted by the plate, which is why this is major rather than minor. The volume 3 / 1824 attribution is consistent with the record year and with the publication history of Les Roses, so I kept it._

### `redoute-roses-rosa-sempervirens-globosa`

**Rosa Sempervirens** — Pierre-Joseph Redouté, 1824 · redoute-roses · prior audit: never audited · confidence high · verify: upheld

> **What the image shows.** A rose with three open SINGLE flowers of deep carmine-crimson, each of five broad petals around a ring of yellow stamens, clustered at the centre of the sheet; the foliage is pinnate with many small, matte grey-green leaflets and the main stem is purplish. There are no white flowers anywhere on the plate.

- **high/wrong-colour** — "fragrant white flowers" → Every flower on the plate is deep carmine-crimson. Rosa sempervirens is indeed a white-flowered evergreen climber, which is exactly why this is a problem: the description fits the named plate but not the image that is stored under this id. _(image — three single crimson flowers with yellow stamens; web:https://www.c82.net/redoute/flower/rosa-sempervirens-globosa (via search snippet) confirms the real R. sempervirens globosa plate has white flowers)_
- **medium/wrong-subject** — "with glossy persistent leaflets" → The leaflets in the image are small, matte and grey-green, not the glossy evergreen foliage that defines R. sempervirens. _(image)_
- **metadata/`image asset / title`** — `redoute-roses-rosa-sempervirens-globosa (rendered image shows a crimson single-flowered rose)` → `verify which Les Roses plate the stored asset actually is` _(image vs. the documented R. sempervirens globosa plate, which has white flowers, glossy leaflets and styles united in a hairy column)_

Second reviewer (upheld): Upheld on the contradiction, though not on its cause. Read the plate myself: three fully open single roses of saturated carmine-crimson, five broad petals each around a ring of golden stamens, on pinnate leaves of small, matte grey-green leaflets. There is no white flower anywhere and the foliage is not the glossy dark evergreen of R. sempervirens, so 'fragrant white flowers' and 'glossy persistent leaflets' are false of the image the site serves. Rosa sempervirens is genuinely white-flowered (Kew/Wikipedia), which is why the text reads as a faithful account of the named species rather than of the stored asset — I agree with the first agent that the fault is probably the asset, not the writing, but c82.net is 403 behind Cloudflare so I could not confirm which plate roses-121-light.jpg is. Either way the description contradicts the picture, and 'major' rather than 'fabricated' is the right grade because the text is a real description of a real thing, just not this one. Trimmed the first agent's 'sparsely thorned stem' — I see no thorns on the stem at this resolution.

**Current:**

> A globose-hipped form of Rosa sempervirens, the evergreen climber, with glossy persistent leaflets and fragrant white flowers whose styles join in a single bristled column. Redoute drew it for Volume 3 of Les Roses, issued in 1824.

**Proposed:**

> Deep carmine single roses — three fully open, each of five broad petals around a ring of golden stamens, with smaller half-open blooms among them — cluster at the middle of the sheet. The long arching stem carries pinnate leaves of small, matte grey-green leaflets that thin out towards the top. From Redouté's Les Roses, printed in colour from a stipple engraving and finished by hand.

_Notes: IMPORTANT: the likely fault is the asset, not the text. The description is a faithful account of Redouté's Rosa sempervirens globosa (white flowers, glossy evergreen leaflets, styles joined in a bristled column) — all of which an external summary of the c82.net page confirms — but the JPEG rendered for this id shows a crimson single rose. Someone should check which file is stored under redoute-roses/rosa-sempervirens-globosa before touching the description; if the asset is wrong, fix the asset and keep the original text. My proposed replacement describes only what is in the rendered image and deliberately does not name a species, because I could not identify the plate with confidence._

## Minor (211)

Substance holds; a detail is off. Listed compactly — full issue text and proposed replacements are in the JSON.

| id | prior | issue | proposes new text |
|---|---|---|---|
| `audubon-birds-127-rose-breasted-grosbeak` | minor-fixed | The plant is not spruce. The plate's own engraved caption names it Ground Hemlock, Taxus canadensis - the Canada yew, whose red arils are the 'berries' shown. S | yes |
| `audubon-birds-130-yellow-winged-sparrow` | accurate | The plate shows exactly one bird, not several. I cropped and enlarged the image area to be sure. | yes |
| `audubon-birds-330-ring-plover` | minor-fixed | 'sourceDescription' is an internal field name leaking into public prose; a reader has no idea what it refers to. The species identification itself is right and  | yes |
| `audubon-birds-388-i-nuttall-s-starling-2-yellow-headed-troopial-3-bullock-s-oriole` | minor-fixed | There are two additional figures beyond the three named males, not one: a whole brown streaked bird perched just below the top bird, and a separate head-only st | yes |
| `audubon-birds-395-i-audubon-s-warbler-2-hermit-warbler-3-black-throated-gray-warbler` | fabricated-fixed | Six birds are shown, not three — Audubon plates of this kind pair each species with a second (usually female or immature) bird. The caption names three species; | yes |
| `audubon-birds-424-i-lazuli-finch-2-crimson-necked-bull-finch-3-gray-crowned-linnet-4-cow-pen-bird-5-evening-grosbeak-6-b` | accurate | Seven birds are on the branch, not six. The plate names six species but shows the Evening Grosbeak twice (the yellow-headed male at lower left and the paler bir | yes |
| `audubon-birds-61-great-horned-owl` | minor-fixed | The Birds of America plates are engravings with etching and aquatint, printed and then coloured by hand in Havell's workshop; describing the colour as printed m | yes |
| `audubon-birds-96-columbia-jay` | minor-fixed | The plate is a single double-elephant-folio sheet, not a double-page spread; there is no gutter or second leaf. | yes |
| `collection-of-beauty-13-50-sl1-general-use` | never | The whole description is a scraped museum credit line. It says nothing about what the picture shows, which is what house style asks the first sentence to do. | yes |
| `collection-of-beauty-1872-vereshchagin-triumphierend-anagoria` | accurate | The building shown is the Sher-Dor Madrasa - identifiable by the tiger-and-sun mosaics above the arch - built in the 17th century under the Ashtarkhanids, not i | yes |
| `collection-of-beauty-1880-frederic-leighton-self-portrait` | never | The scarlet gown is Oxford academic dress (Leighton's honorary doctorate of 1879), not Royal Academy regalia; only the chain and medal belong to the Presidency  | yes |
| `collection-of-beauty-1900-cezanne-pine-tree-in-front-of-the-caves-above-chateau-noir` | never | The description is a raw museum label pasted in, not prose, and it says nothing about what the sheet shows. | yes |
| `collection-of-beauty-1902-cezanne-study-of-a-skull` | never | The description is a raw museum tombstone label scraped from Commons, broken mid-measurement ('22. 9') and cut off before the closing bracket. It is not a sente | yes |
| `collection-of-beauty-1906-cezanne-still-life-with-carafe-bottle-and-fruit` | never | This is not a description - it is the museum's tombstone label pasted in raw, cut off mid-sentence with an unclosed parenthesis and a broken number ('62. 5 cm') | yes |
| `collection-of-beauty-2560px-at-sea-off-kazusa-kazusa-no-kairo-from-the-series-thirty-six-views-of-mount-fuji-fugaku-sanj` | never | The print's subject is two large cargo boats under sail with Fuji small on the horizon; the coastline is a thin distant strip. Describing it as a view of the co | yes |
| `collection-of-beauty-2560px-vincent-van-gogh-vissersboten-op-het-strand-van-les-saintes-maries-de-la-mer-google-art-proj` | accurate | The canvas was not made on the excursion. Van Gogh drew the boats on the beach at Saintes-Maries and painted this oil back in his studio in Arles in late June;  | yes |
| `collection-of-beauty-9` | never | The leaf is a study of breaking waves with no landscape and no recession into distance — no ground, hills, trees or receding planes. 'Atmospheric distance' and  | yes |
| `collection-of-beauty-aivazovsky-bosporus` | minor-fixed | Asserts that Aivazovsky was in Constantinople in 1878. He visited the city many times between 1845 and 1890, but nothing here places him there in 1878 - a year  | yes |
| `collection-of-beauty-alfred-sisley-018` | never | The sky is a saturated blue crowded with tall white clouds rather than pale, and the water occupies a narrow strip at the right with no prominent reflection; th | yes |
| `collection-of-beauty-alfred-sisley-020` | never | The location is not given by the record, the title or Commons (which tags the place as unknown). Moret is a reasonable guess for Sisley in 1895 but is asserted  | yes |
| `collection-of-beauty-alfred-sisley-057` | never | The grapes are pale green-gold (white grapes), not black. This is the first thing the description names. | yes |
| `collection-of-beauty-alfred-sisley-065` | never | The trees in the picture are essentially bare — long leafless trunks and branches with only sparse ochre leaves on the far bank — so 'under autumn foliage' over | yes |
| `collection-of-beauty-alfred-sisley-the-road-to-hampton-court-1874-neue-pinakothek-munich-munchen` | never | There are no garden walls; the road is edged by a low wooden post-and-rail fence on one side and by the open river on the other. | yes |
| `collection-of-beauty-ambroise-vollard-avec-un-foulard-rouge` | never | The same sentence has just said Vollard is 'wrapped in a red headscarf', so 'the bare head' contradicts it — his head is covered. And the ground is a cool pale  | yes |
| `collection-of-beauty-ariko-weeps-on-her-boat` | never | Wrong romanisation of the series title. 月百姿 is Tsuki hyakushi (also given as Tsuki no hyakushi); Commons files the print under 'Tsuki hyakushi 38'. 'Tsuki Hyaku | yes |
| `collection-of-beauty-assistants-and-george-frederic-watts-hope-google-art-project` | never | Given as by Watts alone; the source records this version as by Watts with studio assistants. | yes |
| `collection-of-beauty-auguste-renoir-en-ete-la-bohemienne-google-art-project` | minor-fixed | Her hair is not pinned up or back - it falls loose in long ringlets over her shoulders and chest, kept off her face only by a red ribbon, and that loose hair is | yes |
| `collection-of-beauty-auguste-renoir-the-swing-google-art-project` | never | She stands on the ground next to the swing; the swing's plank seat hangs empty at knee height beside her. | yes |
| `collection-of-beauty-bazille-frederic-la-toilette-1869-70-oil-on-canvas-musee-fabre-montpelier` | never | The kneeling servant is handling a green slipper at the nude's foot, not drying it; there is no towel in her hands and a matching green mule lies on the floor b | yes |
| `collection-of-beauty-bazille-frederic-portrait-of-edmond-maitre` | never | The book lies open on a red-draped table in front of him, with his left hand resting on it — not in his lap. The description also omits the cigarette he holds u | yes |
| `collection-of-beauty-bazille-frederic-view-of-the-village-1868` | never | She is sitting on bare earth and grass at the foot of a pine, with her skirt spread on the ground. There is no stone ledge under her. | yes |
| `collection-of-beauty-bazille-nature-morte-au-heron` | never | The heron is not laid on a table - it is suspended head-down by a cord tied to the table above, wings spread; only the smaller birds lie flat, and they lie on a | yes |
| `collection-of-beauty-bazille-pecheur-a-l-epervier` | never | The fisherman is holding the gathered net at his side, before the cast; no net is in flight. | yes |
| `collection-of-beauty-bazille-sutdio-in-the-rue-de-furstenberg` | never | No sky is visible through the doorway in this reproduction — only a green flowered hanging and an indistinct pale area that might be bedding or a lit wall. The  | yes |
| `collection-of-beauty-benjamin-west-venus-at-her-birth-attired-by-the-three-graces` | minor-fixed | There are three attendant female figures — one at the upper left in white and two at the upper right — which is also what the title's 'Three Graces' implies. | yes |
| `collection-of-beauty-boy-skifov-so-slavyanami` | never | A specific literary source is asserted with nothing to back it; the Scythian-Slav conflict is not a Primary Chronicle episode, and the record and Commons say no | yes |
| `collection-of-beauty-bruni-f-a-bogomater-s-mladentsem-v-rozakh-1843` | never | A specific dimension with no backing anywhere: realDimensions is null in the record, Commons gives no size, and I could not find a published measurement for thi | yes |
| `collection-of-beauty-bruni-f-a-golova-madonny-1830-40` | never | The head is upright and strictly frontal, and the eyes are open with the irises fully visible, looking out at the viewer. Neither the inclination nor the lowere | yes |
| `collection-of-beauty-bryullov-nartsiss` | never | 'Academical Hall' is a Wikimedia Commons room category (Russian Museum - Academical Hall No.14), i.e. a hanging location that changes, not a catalogue fact abou | yes |
| `collection-of-beauty-carl-spitzweg-im-dachstubchen-v-1849` | never | The second window is on the adjoining roof roughly one storey down and well within the middle ground, not far below. | yes |
| `collection-of-beauty-carl-spitzweg-the-bookworm` | never | At full resolution the man's profile shows no glasses — no lens, frame or temple arm; he holds the book close to his eyes instead, which is the point of the jok | yes |
| `collection-of-beauty-cb9001fb` | never | A specific ordinal position within the album that nothing in the record, the file name or the Commons metadata supports. Confident specificity with no backing i | yes |
| `collection-of-beauty-cezanne-ambroise-vollard` | never | He is painted balding, with a very high lit forehead, but dark hair is clearly present over the crown and around the sides; 'bald head' overstates it. | yes |
| `collection-of-beauty-cezanne-thyssen` | never | The museum's own catalogue gives the inventory number 1976.68 and says the picture entered the Thyssen-Bornemisza collection in 1976; nothing supports 1993 as t | yes |
| `collection-of-beauty-cole-thomas-the-temple-of-segesta-with-the-artist-sketching-1843` | minor-fixed | The water in the picture lies at the far LEFT edge, not behind the temple, and Segesta looks out over the Gulf of Castellammare — sea, not a lake. Nothing in th | yes |
| `collection-of-beauty-dame-alice-ellen-terry-choosing-by-george-frederic-watts` | never | The whole description is the National Portrait Gallery's boilerplate caption pasted in, including a dangling instruction to consult a 'source website' that the  | yes |
| `collection-of-beauty-durer-academie-de-femme-debout-de-dos-la-main-sur-une-hampe-d-ou-part-un-voile-inv-19058-recto` | accurate | The sheet is dated 1495, the year Dürer returned from Venice to Nuremberg, so the drawing could equally have been made after his return. The record gives only t | yes |
| `collection-of-beauty-durer-dragon-fight` | never | The sheet shows four angels fighting a whole group of dragons and beasts, not Michael alone against a single dragon; the entire lower third of the sheet — a tow | yes |
| `collection-of-beauty-dveri-timura-tamerlana` | never | The Turkestan series comes out of Vereshchagin's Central Asian journeys of 1867-1870; nothing in the record or the Commons metadata connects this canvas to the  | yes |
| `collection-of-beauty-edmund-blair-leighton-the-end-of-the-song-1902` | never | The description is not a description. It is a mangled scrape of the Commons image caption, opening with a stray bracket and carrying the ellipsis brackets and c | yes |
| `collection-of-beauty-el-greco-domenikos-theotokopoulos-laocoon-google-art-project` | never | The description is cut off mid-abbreviation; the last sentence ends on 'Washington, D.' with no closing. | yes |
| `collection-of-beauty-francesco-hayez-incontro-di-giobbe-ed-esau-1844` | never | A sweeping art-historical generalisation stated as fact, carried over verbatim (and awkwardly translated - 'had a lot of luck' renders 'ebbero molta fortuna', i | yes |
| `collection-of-beauty-francois-boucher-diana-che-esce-dal-bagno-1742-01` | never | There is one attendant nymph, not several. The 1742 Salon entry likewise describes Diana with 'one of her companions'. | yes |
| `collection-of-beauty-frederic-bazille-portrait-de-paul-verlaine-comme-une-troubadour` | never | Stated as settled fact, but the catalogue row's own title - and the Commons object name it came from - is 'Portrait of an anonymous as a Troubadour' / 'Portrait | yes |
| `collection-of-beauty-frederic-bazille-the-little-gardener-google-art-project` | never | The boy wears full-length pale trousers, not knee breeches, and a soft broad-brimmed straw hat rather than a flat-topped boater. | yes |
| `collection-of-beauty-frederick-leighton-biondina` | never | The 1879 date is attributed to the Hamburger Kunsthalle, but the only sources carrying it are WikiArt (the Commons credit link) and Art Renewal Center; the muse | yes |
| `collection-of-beauty-fritillaria-imperialis-in-les-liliacees` | never | Nothing supports 'life-size', and it is implausible: a crown imperial stands roughly a metre tall while the Liliacées folio sheet is about half that, and the pl | yes |
| `collection-of-beauty-fujimigahara-in-owari-province-bishu-fujimigahara-from-the-series-thirty-six-views-of-mount-fuji-fu` | never | There are no rice fields, and the subject of the print is the tub-maker working inside a giant barrel through which Fuji is framed; the description omits the fi | yes |
| `collection-of-beauty-g-caillebotte-interieur` | never | The picture has two figures. The seated man reading a newspaper occupies the entire right-hand third of the canvas and is the reason the composition is usually  | yes |
| `collection-of-beauty-g-caillebotte-villas-a-trouville` | accurate | The villas are red brick with dark blue-grey slate roofs, not pastel; and there are two of them clustered on a hillside rather than a line of houses along a coa | yes |
| `collection-of-beauty-galatskaya-bashnya-v-lunnom-svete` | never | The moonlight in this canvas is warm gold-amber, not silver; the masts and rooftops read as dark silhouettes against a gold sky and a gold reflection on the wat | yes |
| `collection-of-beauty-george-frederick-watts-001` | never | Overstated. The collar, neckcloth and jacket are all painted, if thinly and loosely; nothing in the clothing is actually unprimed or unpainted canvas. | yes |
| `collection-of-beauty-ginger-pot-with-pomegranate-and-pears` | never | The ground is not dark. The backdrop behind the still life is a pale blue-grey drapery, lighter in value than most of the fruit; only a small area under the che | yes |
| `collection-of-beauty-giuseppe-arcimboldo-la-primavera-google-art-project` | minor-fixed | The version shown is the Real Academia de Bellas Artes de San Fernando panel, which the Academia dates 1563 (inv. 0606, oil on panel, 66 × 50 cm). 1573 belongs  | yes |
| `collection-of-beauty-glavnaya-ulitsa-v-samarkande-s-vysoty-tsitadeli-rannim-utrom` | never | The picture is painted in cool, flat, whitish-grey and pale ochre; there is no golden light in it. | yes |
| `collection-of-beauty-guercino-martirio-dei-santi-giovanni-e-paolo` | fabricated-fixed | The sword is not raised and is not over the kneeling man: the executioner holds it low and away to his right, blade angled down, while grasping the kneeling fig | yes |
| `collection-of-beauty-hawaiian-fisherman-woodblock-print-by-charles-w-bartlett` | minor-fixed | He is walking - one leg forward, the other heel lifted, wading through the shallows. | yes |
| `collection-of-beauty-hiroshige-kozuke` | never | 'Landmark' is an evaluative claim with nothing behind it; the source only records that the print is No. 26 in the Tosando group of the series. | yes |
| `collection-of-beauty-hodogaya-on-the-tokaido-tokaido-hodogaya-from-the-series-thirty-six-views-of-mount-fuji-fugaku-sanj` | never | The viewpoint here is at road level, level with the travellers, not raised or bird's-eye. This is the description's only concrete claim about the composition. | yes |
| `collection-of-beauty-holbein-danse-macabre-4` | accurate | True of the cycle, but placed as the only description of this sheet it misleads: this block is the labour of Adam after the Fall, with a single skeleton working | yes |
| `collection-of-beauty-holbein-danse-macabre-5` | accurate | Describes the theme of the series, not this plate. This sheet has no victim and no living person in it at all - it is the skeletons' concert that opens the cycl | yes |
| `collection-of-beauty-ivan-k-ayvazovskiy-brig-merkuriy-posle-pobedy-nad-dvumya-turetskimi-korablyami-1848` | never | The squadron is a handful of barely visible masts in the far distance at the left; nothing crowds the horizon. The description also omits the painting's dominan | yes |
| `collection-of-beauty-jacques-louis-david-018` | minor-fixed | The canvas is cut at roughly hip level, which is a half-length portrait; 'three-quarter length' conventionally means the figure shown to below the knees. | yes |
| `collection-of-beauty-january-by-grant-wood-1940-41-cleveland-museum-of-art` | never | The description is an encyclopaedia stub. It never says what the picture shows — snow-covered corn shocks and rabbit tracks — which is the whole point of the wo | yes |
| `collection-of-beauty-jean-francois-millet-calling-home-the-cows-c-1866-nga-168820` | never | The herdsman is standing still and blowing a horn - the act the title names - not driving the animals along. | yes |
| `collection-of-beauty-jean-honore-fragonard-the-stolen-kiss` | accurate | The Hermitage picture is oil on canvas, about 45 by 55 cm, not a panel. | yes |
| `collection-of-beauty-joseph-mallord-william-turner-1775-1851-the-field-of-waterloo-ng500-tate` | accurate | As written, the clause dates the depicted scene three years after the battle. The picture shows the night of the battle itself; it is the painting that came thr | yes |
| `collection-of-beauty-julie-de-graag-december-1917` | never | Nothing supports a series of works about December. The Rijksmuseum subject index reads 'cat. December; Decembre (Ripa)', which points to a months-of-the-year se | yes |
| `collection-of-beauty-kanae-yamamoto-1937-haruna-ko-shoshu` | never | The description never says what the picture shows — a lake, a mountain and a boat — and reduces to a one-line biography lifted from the Commons caption plus a c | yes |
| `collection-of-beauty-kanae-yamamoto-1939-kogen-iizuna` | never | There is no 'Kogen region'. Kogen is the Japanese word for highlands/plateau: the title 'Kogen - Iizuna' means 'Highlands: Iizuna', as the record's own englishT | yes |
| `collection-of-beauty-katsushika-hokusai-1760-1849-ono-waterval-aan-de-kisokaido-1835` | accurate | There are no horses in the print. The loads are carried by the men themselves; one bundle is stacked on the ground. | yes |
| `collection-of-beauty-kochevaya-doroga-v-gorakh-alatau` | never | There is no caravan — three individual horsemen strung along a mountain track, with no pack animals or baggage train in view. | yes |
| `collection-of-beauty-l-homme-au-bonnet-de-coton-par-paul-cezanne-met-dt1408` | never | The cap is predominantly blue-green with white highlights, not white. The Met's own title for this picture is 'The Man in a Blue Cap'. | yes |
| `collection-of-beauty-l-l-boilly-une-loge` | never | The support is canvas, not panel. 'Titled the panel' also attributes the title to Boilly himself, which no source here states. | yes |
| `collection-of-beauty-la-inmaculada-concepcion-de-el-greco-y-su-hijo-museo-thyssen-bornemisza` | minor-fixed | Six full-length angels are discernible - three at the left (one large praying figure, a head behind it and a smaller one holding a book) and three at the right  | yes |
| `collection-of-beauty-le-garcon-au-gilet-rouge-par-paul-cezanne-national-gallery-of-art` | never | Pure boilerplate, and 'careful anatomical structure' runs against the picture, where the boy's right arm is famously elongated well beyond anatomical proportion | yes |
| `collection-of-beauty-le-jardin-hoschede-a-montgeron-d-a-sisley-fondation-vuitton-paris` | never | The whole description is the Commons uploader's transcription of a French wall label plus exhibition marketing copy about the Fondation Louis Vuitton show and i | yes |
| `collection-of-beauty-le-jardinier-vallier-par-paul-cezanne-coll-privee-1906` | never | The figure is built from cream, pale ochre and green patches over dark outlines; it is the surrounding ground that is dark green-brown, and there is very little | yes |
| `collection-of-beauty-les-grands-boulevards-renoir-1875-ng` | never | The boulevard trees are in full, dense leaf across the top third of the canvas, not thin or sparsely leafed. | yes |
| `collection-of-beauty-levitan-u-omuta` | never | Mood is the opposite of what is painted: the picture is dark and heavy, with a shadowed pool under a clouded sky. It also omits the dominant object in the frame | yes |
| `collection-of-beauty-lille-pba-boilly-robespierre` | never | Describes a bust-length portrait against an empty background. The picture is a full-length seated portrait in an interior: desk with papers and quill, red chair | yes |
| `collection-of-beauty-lille-pba-boilly-triomphe-de-marat` | never | No banners appear anywhere in the picture. What is raised above the crowd is hats (several on arms and sticks) and a few plain poles/pike shafts. | yes |
| `collection-of-beauty-lord-frederic-leighton-winding-the-skein-google-art-projectfxd` | never | Only the standing figure is fair-haired. The seated woman has dark brown hair, clearly visible against her white gown. | yes |
| `collection-of-beauty-lord-leighton-frederic-after-vespers-1871` | never | The whole description is a museum catalogue biography pasted in verbatim, prefixed 'Catalogue Entry:'. It never says what the painting shows — not the green gow | yes |
| `collection-of-beauty-louis-leopold-boilly-the-movings-1982-494-art-institute-of-chicago` | never | The load is on a large horse-drawn wagon — the horse is in harness at the left of the cart and a woman is riding on top of the pile. A handcart would be pushed  | yes |
| `collection-of-beauty-louis-leopold-boilly-the-public-viewing-david-s-coronation-at-the-louvre-1810` | never | The open booklet is held by the woman standing beside the officer, not by the soldier; his hands are not on it. | yes |
| `collection-of-beauty-madame-saint-ange-chevrier-louis-leopold-boilly-nationalmuseum-177754` | never | The description field holds the raw Swedish inventory-card text copied verbatim from Commons, prefix and all. Its content is true (a woman in a landscape, seate | yes |
| `collection-of-beauty-maria-de-tassis-by-anthony-van-dyck` | minor-fixed | The collar is a wired standing collar rising behind the head, not a pleated circular ruff. | yes |
| `collection-of-beauty-mc-escher-convex-and-concave` | never | The sheet does not show interlocking geometric forms; it shows a fully rendered architectural interior/exterior with staircases, vaults, figures and lizards, wh | yes |
| `collection-of-beauty-mc-escher-three-spheres-i` | never | Only the top form is a sphere. The middle one is flattened to a cushion and the bottom one to a flat disc - the whole point of the print is the same sphere prog | yes |
| `collection-of-beauty-mishima-pass-in-kai-province-koshu-mishima-goe-from-the-series-thirty-six-views-of-mount-fuji-fugak` | never | The subject of the print — travellers ringing a colossal tree trunk with their outstretched arms — is never mentioned; "the dramatic perspective view through" t | yes |
| `collection-of-beauty-monet-exterieur-de-la-gare-saint-lazare-effet-de-soleil` | accurate | A 'first' claim with nothing behind it. Manet's The Railway (1873) and Monet's own Train in the Countryside and Railway Bridge at Argenteuil (both early 1870s)  | yes |
| `collection-of-beauty-monet-w1032` | accurate | The sailboats are a handful of tiny distant marks on the horizon, not the subject, and they are beyond the rocks rather than beneath them; meanwhile the dominan | yes |
| `collection-of-beauty-nishikawa-sukenobu-1739-ehon-asakayama-16-gris` | never | The count appears wrong and is unsupported by the record or the Commons metadata. Auction and museum descriptions of Ehon Asakayama (1739) describe an album of  | yes |
| `collection-of-beauty-ohara-koson-gatto-e-vasca-con-pesci-rossi-1933-xilografia-colorata` | never | The print's own inscription reads 昭和六年作 - made in Showa 6, that is 1931 - and external sources give the first Watanabe edition as 1931 (Showa 6). The 1933 date  | yes |
| `collection-of-beauty-paris-art-deco-boilly-houdon` | never | Houdon is standing at the modelling stand, not seated. The seated figure in the picture is the sitter at the right. | yes |
| `collection-of-beauty-paul-cezanne-bathers-google-art-project` | never | No figure is reclining; the non-standing figures bend forward or crouch. | yes |
| `collection-of-beauty-paul-cezanne-maison-maria-with-a-view-of-chateau-noir-google-art-project` | never | The two prominent trees in the canvas are bare and leafless, and the surrounding growth is low green scrub. No pines are identifiable in the picture. | yes |
| `collection-of-beauty-paul-cezanne-young-italian-woman-at-a-table-99-pa-40-j-paul-getty-museum` | never | The blouse is plain white; there are no stripes. The strong colour accent is the yellow shawl over her shoulder, which the description omits entirely. | yes |
| `collection-of-beauty-paul-gauguin-044` | fabricated-fixed | Not all of them are resting: one woman is ironing a white cloth at a table, which is a conspicuous element of the composition and is left out entirely. | yes |
| `collection-of-beauty-peter-paul-rubens-1577-1640-after-hercules-and-the-nemean-lion-wm-1608-1948-apsley-house` | accurate | A specific source for this composition, asserted as fact. Rubens certainly drew after the Belvedere Torso, but nothing in the record, the Commons metadata or an | yes |
| `collection-of-beauty-pierre-auguste-renoir-042` | never | The chemise is open down the front and pushed off both shoulders, leaving both breasts bare; it has not slipped from one shoulder. | yes |
| `collection-of-beauty-pierre-auguste-renoir-106` | never | Two problems in one sentence. 'After' implies a copy or a reproduction — the Courtauld says the statuette is BY Maillol. And the statuette as painted is creamy- | yes |
| `collection-of-beauty-pierre-auguste-renoir-107` | never | He does not hold a medallion - he wears one at his cravat, and what he holds is an open newspaper. The attribute has been moved from his collar to his hand and  | yes |
| `collection-of-beauty-pierre-auguste-renoir-diana-1867` | never | The dimensions are wrong; the picture measures 199.5 x 129.5 cm. | yes |
| `collection-of-beauty-pierre-paul-rubens-le-miracle-de-saint-just` | never | The cephalophore saint is at the right of the picture and is bent sharply forward, not standing at centre. The figure at centre is a clothed young onlooker reco | yes |
| `collection-of-beauty-portrait-de-victor-chocquet-par-paul-cezanne-yorck` | never | The ground behind the sitter is an open field of hatched green and blue-grey strokes; no wallpaper pattern, no repeat, no interior detail is visible. Patterned  | yes |
| `collection-of-beauty-portrait-of-the-artist-s-daughters-probably-early-1760s-by-thomas-gainsborough-1727-1788-img-7281` | never | Only one daughter is seated; the elder stands behind her. The description also omits the drawing stylus, the portfolio of drawings and the statuette, which are  | yes |
| `collection-of-beauty-preferans` | never | Only three of the figures are men at the cards; the yawning figure at right and the standing figure at the back read as women, and neither is playing. 'A gather | yes |
| `collection-of-beauty-prodazha-rebenka-nevolnika` | never | The picture belongs to Vereshchagin's Turkestan cycle and Russian catalogue sources place the scene in a Central Asian shop, with the seated merchant and a slav | yes |
| `collection-of-beauty-redoute-flowers01` | never | A specific physical claim with nothing behind it: the record carries no dimensions for this sheet and the source metadata says nothing about scale. | yes |
| `collection-of-beauty-reflection-in-lake-at-misaka-in-kai-province-koshu-misaka-suimen-from-the-series-thirty-six-views-o` | never | There is no Lake Misaka. Misaka is the pass from which the view is taken; the water is Lake Kawaguchi. The Japanese title says 'water surface at Misaka'. | yes |
| `collection-of-beauty-rembrandt-harmensz-van-rijn-christ-crucified-between-the-two-thieves-the-three-crosses-google-art-p` | never | The Three Crosses is a drypoint (with burin work from the third state); it is not an etching. The Met catalogues this impression as drypoint. | yes |
| `collection-of-beauty-renoir-joseph-durand-ruel-1882-jpg-pinterestlarge` | never | The background is an abstract mottled weave of mauve, blue and green brushstrokes with no legible foliage, and the white chair back at the right reads as an int | yes |
| `collection-of-beauty-repin-ukrainka-u-pletnya` | never | Repin was born in Chuhuiv, in the Kharkiv region of present-day Ukraine, not in Russia. 'Russian-born' is factually wrong even though the record's nationality f | yes |
| `collection-of-beauty-reunion-d-artistes-dans-l-atelier-d-isabey-louis-leopold-boilly-musee-du-louvre-peintures-rf-1290bi` | never | The description is the raw Commons caption and its URL has been truncated mid-address, so the sentence points the reader at a source that does not resolve. | yes |
| `collection-of-beauty-reunion-de-famille-frederic-bazille-musee-d-orsay-rf-2749` | never | The sequence is inverted. The canvas was exhibited at the Salon of 1868 and reworked afterwards — the dog in the foreground was painted out and replaced by the  | yes |
| `collection-of-beauty-sadovaya-kalitka-v-chuguchake` | never | This painting contains no figures and no customs; the sentence describes the artist's oeuvre in general and says nothing about the picture. | yes |
| `collection-of-beauty-searching-for-immortals-met-dp162813` | never | The description never says what is in the frame - no trees, no bank, no figure, no seals or inscription. Both sentences are provenance plus generic praise. | yes |
| `collection-of-beauty-self-portrait-by-george-frederic-watts-1864` | never | The background is not plain: a panelled door/wainscot with mouldings fills it, and the panel edges are clearly drawn. | yes |
| `collection-of-beauty-shichirigahama-in-sagami-province-soshu-shichirigahama-from-the-series-thirty-six-views-of-mount-fu` | never | There is no human activity in the print - no figures, no boats, no work. The only trace of habitation is a handful of thatched roofs on the hillside. The senten | yes |
| `collection-of-beauty-sir-david-wilkie-s-residence-in-kensington-london-by-william-collins-1841-painted-just-after-wilkie` | never | What is painted is a detached villa standing in its own garden with lawn and trees, not a townhouse; 'important' is unsupported puffery. | yes |
| `collection-of-beauty-snowscape` | never | The source describes the support as paper, not silk. | yes |
| `collection-of-beauty-sotatsu-dragons-and-clouds` | never | The reproduction in the catalogue is one six-panel screen carrying one dragon (Freer F1905.229, the left screen). The object as a whole is a pair, but the image | yes |
| `collection-of-beauty-spyashchaya-tsarevna` | never | The description never says what is in the picture. The sleeping court, the jester, the gusli player, the bear and the girl asleep over the open book are the who | yes |
| `collection-of-beauty-summer-study-from-the-bingzi-year` | never | Pure filler: it says nothing about the picture and asserts a 'productive period of artistic exploration' that nothing in the record supports. The description ne | yes |
| `collection-of-beauty-sumo-wrestling-toads-by-hoson` | minor-fixed | The orange leaf is not floating: a toad at right holds it up in its hand, brandished the way a sumo referee holds a gunbai fan. | yes |
| `collection-of-beauty-tabi-miyage-dai-sanshu-boshu-futomi-by-kawase-hasui` | fabricated-fixed | Two figures crouch together below the gate, not one, and there are at least two beached boats at the right, not one. | yes |
| `collection-of-beauty-tago-bay-near-ejiri-on-the-tokaido-tokaido-ejiri-tago-no-ura-ryaku-zu-from-the-series-thirty-six-vi` | never | 1830 is late Edo, not mid-Edo; the period runs 1603-1868 and the Thirty-six Views belong to its last decades. | yes |
| `collection-of-beauty-the-artist-s-wife` | never | She is standing, full length, beside a chair — not seated. The chair in the picture holds drawings, not the sitter. | yes |
| `collection-of-beauty-the-disquieting-muses` | never | The two principal figures are faceless tailors'-dummy mannequins, one draped and standing on a fluted plinth and one seated with an egg head — not classical fem | yes |
| `collection-of-beauty-the-equatorial-jungle` | never | The collection statement is cut off mid-word: it should read Washington, D.C. The description string simply ends there. | yes |
| `collection-of-beauty-the-muscles-of-the-hand-after-albinus-and-of-the-foot-aft-wellcome-v0007837` | accurate | The plate carries four figures - two hands and two feet - not one of each. | yes |
| `collection-of-beauty-the-muscles-of-the-human-body-fourth-layer-seen-from-the-f-wellcome-v0007799` | never | The sentence is a truncated copy of the Commons caption and breaks off mid-name, leaving the printmaker identified only as 'A. E.'. The full attribution is Arna | yes |
| `collection-of-beauty-the-river-le-fleuve-renoir-1885` | never | The figure is not seated: he reclines full length across the whole width of the canvas, in the pose of a river god tipping water from an urn — the detail that g | yes |
| `collection-of-beauty-the-virgin-with-chancellor-rolin-by-jan-van-eyck-louvre-webp` | never | This is a donor portrait (Virgin and Child with a kneeling donor and a crowning angel), not a sacra conversazione, which by definition groups saints around the  | yes |
| `collection-of-beauty-v-gorakh-alatau` | never | The picture is not a mountain view: its subject is a stag standing in a flowering meadow, with the mountains reduced to a hazy backdrop. The record's own englis | yes |
| `collection-of-beauty-valentin-aleksandrovich-serov-odissey-i-navsikaya` | never | The description never says what is actually in the frame — the shore, the mule cart, Nausicaa driving, the attendants, the solitary figure of Odysseus. It names | yes |
| `collection-of-beauty-various-objects` | never | Only the small genre sheet at upper right is pinned; the letters are tied under a cord, and the picture's other illusionistic objects (purse, flask, scissors, f | yes |
| `collection-of-beauty-venice-the-dogana-and-san-giorgio-maggiore-by-joseph-mallord-william-turner-1834-oil-on-canvas-view` | never | The entire description is a truncated fragment that breaks off mid-name, and what it does say is an empty value judgement ('masterwork') with no visual or factu | yes |
| `collection-of-beauty-viktor-vasnetsov-bogatyri-google-art-project` | never | Mamontov's conversion of a barn at Abramtsevo into a top-lit studio is real, but it dates from 1881, when Vasnetsov resumed the canvas — no source places the 18 | yes |
| `collection-of-beauty-vnutrennost-yurty-bogatogo-kirgiza` | never | The walls shown are the yurt's wooden lattice frame and painted ribs, not felt hung with textiles. The pattern in the picture is painted decoration on the dome  | yes |
| `collection-of-beauty-watts-marie-fox` | never | The description is the Commons metadata pasted verbatim and it breaks off mid-citation at 'London, 1874, p.' — the sentence never completes and the quotation it | yes |
| `collection-of-beauty-windows-open-simultaneously-first-part-third-motif-by-robert-delaunay` | accurate | Calling it a panel implies a wood support. The source says oil on canvas. | yes |
| `collection-of-beauty-winners-by-vasily-vereshchagin-1878` | minor-fixed | The field is dry golden-brown stubble under a bright sky, not grey. | yes |
| `collection-of-beauty-wla-metmuseum-water-lilies-by-claude-monet` | never | Raw museum tombstone label scraped from Commons, truncated mid-donor-name. No description of the painting. | yes |
| `collection-of-beauty-yoshida-on-the-tokaido-tokaido-yoshida-from-the-series-thirty-six-views-of-mount-fuji-fugaku-sanjur` | never | The sheet is a figure-filled interior genre scene — a teahouse with seven or eight travellers — in which Fuji appears as a small distant motif. Describing it as | yes |
| `kunstformen-images-haeckel-nudibranchia` | accurate | The Facelina (figure 2 in the plate's key order) has crimson cerata tipped with white, not orange tips. The orange-yellow animal on the plate is a different fig | yes |
| `redoute-lilies-allium-biulcum` | accurate | The umbel in the plate is not spherical and not full: the flowers hang loosely and nod to one side on slender unequal stalks, which is the plate's most distinct | yes |
| `redoute-lilies-allium-triquetrum` | accurate | The bulb as drawn is white to pale greenish, with no reddish tunics anywhere. | yes |
| `redoute-lilies-amaryllis-formosissima` | accurate | Plate 5 cannot have opened a volume — plate 1 does. The sensible claim is that plate 5 appeared in the first volume. | yes |
| `redoute-lilies-iris-xyphioides` | accurate | The plate shows one open flower, not two. (Two flowers per stem is correct species botany for Iris xiphioides, but the sentence is framed as 'Plate 212 shows... | yes |
| `redoute-lilies-veltheimia-glauca` | accurate | The plate figures no capsule. Its two analytical vignettes show the perianth opened out with its six stamens and, beside it, the pistil - nothing three-winged a | yes |
| `redoute-lilies-veratrum-nigrum` | accurate | Veratrum nigrum is the black FALSE hellebore (Melanthiaceae). 'Black hellebore' without qualification is the standard common name of Helleborus niger, an unrela | yes |
| `redoute-roses-rosa-alpina-laevis` | never | The petals in the plate are mauve-pink, not vivid red. The paling toward the base is correct; the hue is not. | yes |
| `redoute-roses-rosa-arvensis` | never | The canes in the plate are green to grey-green; it is the hooked prickles that are red. Botanical descriptions of the species also give it weak trailing GREEN s | yes |
| `redoute-roses-rosa-candolleana-elegans` | never | No ripe hip appears in the plate; the reddish bodies at upper right and left are unopened buds with their sepals, and the receptacles beneath them are green-gre | yes |
| `redoute-roses-rosa-canina-nitens` | never | Two unsupported assertions in one clause: a bare superlative, and a characterisation of Les Roses as a record of species roses. Les Roses documents mostly garde | yes |
| `redoute-roses-rosa-centifolia-bullata` | never | Spatial relation reversed: the bullate leaves sit below the bloom in the plate, not above it. | yes |
| `redoute-roses-rosa-centifolia-flore-simplici` | never | The open bloom carries about eight broad petals in a single spread, not five. The contrast the sentence draws (single rather than full double) is right; the cou | yes |
| `redoute-roses-rosa-cinnamomea` | never | Rosa cinnamomea (R. majalis) is a northern and central European to Siberian species, not a southern European one. Neither the image nor the record supports the  | yes |
| `redoute-roses-rosa-clynophylla` | never | "Smooth" reads as unarmed, but the plate plainly draws several prickles along the main stem and side branches. | yes |
| `redoute-roses-rosa-collina-monsoniana` | never | The open flower carries roughly ten petals in two ranks (semi-double), not five. | yes |
| `redoute-roses-rosa-damascena` | never | The single coloured bud is clear pink with a slightly deeper rose centre, not deep red. | yes |
| `redoute-roses-rosa-damascena-celsiana` | never | The plate shows a cluster of four or more open blooms, not one, and the dominant central bloom is white/blush rather than pink. | yes |
| `redoute-roses-rosa-damascena-coccinea` | never | The petals as drawn are crimson-carmine with a magenta cast, not purple; the varietal epithet 'coccinea' means scarlet. | yes |
| `redoute-roses-rosa-dumetorum` | never | No hip is depicted. Standing as its own sentence between two descriptions of the plate, it reads as an account of something in the frame that is not there. | yes |
| `redoute-roses-rosa-eglanteria` | never | Apple-scented foliage is the diagnostic character of the sweet briar (Rosa rubiginosa), not of the yellow rose shown here. The plate's yellow five-petalled flow | yes |
| `redoute-roses-rosa-eglanteria-subrubra` | never | The outer face of the petals in this plate is pale pink; nothing yellow appears on the petal reverses. Red-within/yellow-without is the colouring of Rosa eglant | yes |
| `redoute-roses-rosa-gallica-agatha-delphiniana` | never | Nothing resembling a hip is depicted. Placed in the middle of the visual description, the sentence reads as a description of the plate, and the plate shows only | yes |
| `redoute-roses-rosa-gallica-agatha-parvula-violacea` | never | The bloom reads crimson/deep carmine in the plate (sampled median hue ~346 degrees, well away from violet). The variety epithet 'violacea' is probably what prom | yes |
| `redoute-roses-rosa-gallica-flore-marmoreo` | never | Inverted. In the plate the spots are paler than the ground - whitish flecks on both the pale pink inner petals and the deep rose outer ones. The deeper rose is  | yes |
| `redoute-roses-rosa-gallica-giganteo` | never | No hip is drawn on this plate. Sitting between a description of the flower and the publication note, the sentence reads as if the hip were in the frame; if it c | yes |
| `redoute-roses-rosa-gallica-granati` | never | The open bloom is a soft mid-pink; only the unopened buds are deeper. 'Deep-toned' overstates it. | yes |
| `redoute-roses-rosa-gallica-maheka-flore-subsimplici` | never | The bloom carries no pink: the petals are a uniform deep crimson to purple-maroon. | yes |
| `redoute-roses-rosa-gallica-purpurea-velutina-parva` | never | Sources record only that the variety was raised by the nurseryman Van Eeden in the Netherlands before 1810. No source found supports Van Eeden planting, or bein | yes |
| `redoute-roses-rosa-gallica-purpuro-violacea-magna` | never | Both flowers on the plate are fully double with quartered, petal-packed centres; no tuft of styles is shown. | yes |
| `redoute-roses-rosa-gallica-stapeliae-flora` | never | Magnified, the spots are darker than the petal ground - deep red to maroon - not tawny-yellow. | yes |
| `redoute-roses-rosa-gallica-versicolor` | never | The compound leaves in the plate carry five leaflets (a terminal plus two pairs), not seven, and they are broadly ovate rather than oblong. | yes |
| `redoute-roses-rosa-hispida-argentea` | never | No fruit is shown on the plate. Phrased as a species trait rather than as something depicted, so it is unsupported rather than flatly contradicted, but nothing  | yes |
| `redoute-roses-rosa-hudsoniana-salicifolia` | never | The canes in the plate are brown-purple to grey, not green. 'Smooth' and 'thornless' do match the plate. | yes |
| `redoute-roses-rosa-hudsoniana-subcorymbosa` | never | The stems in the plate are green, not reddish. | yes |
| `redoute-roses-rosa-indica-sertulata` | never | The pale base is right, but the outer part of the petals is a deep carmine-crimson, not 'tender pink'. As written the description implies a pale blush rose; the | yes |
| `redoute-roses-rosa-indica-stelligera` | never | The flowers are a deep crimson/carmine red with a pale white centre, not rose-pink. | yes |
| `redoute-roses-rosa-indica-vulgaris` | never | Read on its own this says the canes are unarmed, and the plate's most conspicuous feature is a row of stout hooked red prickles down the main cane. Thory's text | yes |
| `redoute-roses-rosa-kamtchatica` | never | The flower in the plate is a deep carmine or magenta pink, not orange-red, and the hip is bright scarlet, not red-brown. | yes |
| `redoute-roses-rosa-longifolia` | never | The flowers are flat and open with the yellow stamens fully visible; there are no crumpled, rolled inner petals. The same phrase appears verbatim in this batch' | yes |
| `redoute-roses-rosa-lucida` | never | The plate shows paired reddish prickles at each leaf node, drawn prominently. The canes are smooth between the nodes but are not unarmed, so a flat 'smooth cane | yes |
| `redoute-roses-rosa-malmundariensis` | never | The hips in the plate are green, not red — they are drawn unripe. | yes |
| `redoute-roses-rosa-muscosa` | never | The open flower in the plate carries a single whorl of about nine or ten petals, not five. | yes |
| `redoute-roses-rosa-nivea` | never | The plant in the plate is conspicuously armed: red-brown prickles run along the main stem and the side branches. | yes |
| `redoute-roses-rosa-pimpinellifolia-flore-rubro-multiplici` | never | The flowers as drawn are semi-double, with roughly two to four ranks of petals and the stamens plainly visible at the centre — not five to seven rows, which wou | yes |
| `redoute-roses-rosa-pimpinellifolia-inermis` | never | The flowers in the plate are white to the palest blush pink, not red at any depth. | yes |
| `redoute-roses-rosa-pumila` | never | Reads as a description of the plate, but no hips are shown: the sheet has flowers, buds, stems and leaves only. | yes |
| `redoute-roses-rosa-rosenbergiana` | never | The rose tinge sits on the outer petals and the bud tips; the centre of the open flower is white with yellow stamens. | yes |
| `redoute-roses-rosa-rubiginosa-aculeatissima` | never | The blooms range from mid-pink to a distinctly deep rose-pink; the right-hand flower in the plate is saturated, not pale. | yes |
| `redoute-roses-rosa-rubiginosa-vaillantiana` | never | A specific comparative botanical assertion about the whole rubiginosa group holding their colour until the petals drop, with nothing in the image, the record or | yes |
| `redoute-roses-rosa-rubrifolia` | never | The open flowers are clearly rose-pink with a white base to the petals; nothing in the plate is greenish-white. | yes |
| `redoute-roses-rosa-sepium-rosea` | never | No hips appear on the plate; the sentence is placed as a description of what is shown. | yes |
| `redoute-roses-rosa-tomentosa` | never | The finder was Pierre-Joseph Redoute himself, who lived at Meudon; 'Josephine Redoute' conflates him with the Empress Josephine, his patron. The date and place  | yes |
| `redoute-roses-rosa-villosa-terebenthina` | never | The petals are pink, deepest at the edges; "red" overstates the hue in the plate. | yes |

## Refuted by the second reviewer (1)

Flagged on the first pass, knocked down on adversarial review. Recorded so the same false positive is not re-raised.

| id | first-pass claim | why it fell |
|---|---|---|
| `collection-of-beauty-frederick-leighton-memories` | The source record identifies the sitter as Dorothy Dene herself, not a sister. The name is also misspelled: Dorothy Dene was born Ada Alice  | The finding is refuted. The Leighton House / RBKC catalogue record for this picture (lordleightonsdrawings, workid 790, 'Memories', c.1883, oil on canvas) states that Edith Pullen, sister of Leighton's friend and favourite model Dorothy Dene, sat for it, and q |

## Catalogue-field corrections (87)

Problems in the record itself (year, artist, title, dimensions) rather than the prose. These need `metadata/*-overrides.json` edits plus a `pnpm assets:build-data` rerun, not a description swap.

| id | field | current | proposed | evidence |
|---|---|---|---|---|
| `collection-of-beauty-alfred-sisley-023` | provenance | null | State Hermitage Museum, St Petersburg | web:https://hermitagemuseum.org/digital-collection/28734 — the Hermitage holds 'Villeneuve-la-Garenne (Village on the Seine)', 1872. |
| `collection-of-beauty-durer-selbstportrait` | year | 1498 | 1500 | image — the panel is inscribed 1500 and 'anno XXVIII' |
| `collection-of-beauty-durer-selbstportrait` | englishTitle | Self-Portrait at 26 | Self-Portrait at 28 | image — inscription records the artist's twenty-eighth year |
| `collection-of-beauty-portret-khudozhnika-fedora-antonovicha-bruni` | artist | Andrey Denyer | Apollinary Goravsky (А. Горавский) | image — painted signature at lower left |
| `collection-of-beauty-portret-khudozhnika-fedora-antonovicha-bruni` | year | 1864 | unresolved — the painted date is partly illegible in the render; do not keep 1864, which comes from the Denyer photograph's Commons record | image — a four-digit date follows the signature but cannot be read confidently at this resolution |
| `redoute-roses-rosa-centifolia-bipinnata-119` | title | Rosa Centifolia (id rosa-centifolia-bipinnata-119, fileUrl roses-119-light.jpg) | A burnet-rose plate — Les Roses pl. 119 is catalogued in the print trade as 'Prickly variety of Burnet Rose' (Rosa pimpinellifolia group) | web:https://www.audubonart.com/product/redoute-roses-pl-119-prickly-variety-of-burnet-rose/ ; the same plate-number-to-file-number mapping holds for the other roses in this batch ( |
| `collection-of-beauty-a-hippopotamus-and-crocodile-hunt-p5296` | artist | Peter Paul Rubens | after Peter Paul Rubens | web:http://onlinecollection.nationalgallery.ie/objects/2294 and commons category 'Paintings after Peter Paul Rubens'. The Commons date range 'between 1615 and 1799' also points awa |
| `collection-of-beauty-adameveparadisecranach` | provenance.collection / credit | provenance collection 'British Museum', inventory '1943.3.2884'; credit 'Fine Arts Museums of San Francisco' | reconcile — the inventory format and the credit line both point to the Fine Arts Museums of San Francisco, not the British Museum | catalogue record: credit and Commons both say 'Fine Arts Museums of San Francisco' and Commons carries the category 'Collections of the Fine Arts Museums of San Francisco', while t |
| `collection-of-beauty-allee-de-chataigniers-alfred-sisley` | title | Allee de chataigniers - Alfred Sisley | Lisière de la forêt de Fontainebleau | The Paris Musees record at the URL credited on the Commons file page (node/227063) names this work Lisiere de la foret de Fontainebleau; the Commons file name and its 'Allee de cha |
| `collection-of-beauty-allee-de-chataigniers-alfred-sisley` | artist | null | Alfred Sisley | Paris Musees record and Commons category '1865 paintings by Alfred Sisley' |
| `collection-of-beauty-allee-de-chataigniers-alfred-sisley` | year | null | 1865 | Paris Musees record; Commons category '1865 paintings by Alfred Sisley' |
| `collection-of-beauty-allee-de-chataigniers-alfred-sisley` | realDimensions | null | 129 cm high x 208 cm wide | Paris Musees record |
| `collection-of-beauty-allee-de-chataigniers-alfred-sisley` | nationality | null | French | Paris Musees: Sisley, Paris 1839 - Moret-sur-Loing 1899 |
| `collection-of-beauty-benjamin-west-by-gilbert-stuart-1783-84` | provenance | null | National Portrait Gallery, London | web:wikipedia 'Portrait of Benjamin West (Stuart, National Portrait Gallery)' - 1785, NPG London, commissioned by John Boydell, acquired 1872 |
| `collection-of-beauty-benjamin-west-omnia-vincit-amor-1809` | title | Omnia Vincit Amor Alternative title | Omnia Vincit Amor (alternative title: The Power of Love in the Three Elements) | commons — objectName reads 'Omnia Vincit Amor Alternative title(s): The Power of Love in the Three Elements'; the record's title has swallowed the words 'Alternative title' from th |
| `collection-of-beauty-george-frederic-watts-by-george-andrews` | artist | null | unresolved - Commons lists the author as 'anonymous' but categorises the file under Louis Reid Deuchars | Commons categories include 'Louis Reid Deuchars' alongside 'Artworks with Wikidata item missing author'; the boilerplate says the painter died 1927, which matches Deuchars (d. 1927 |
| `collection-of-beauty-indischer-maler-um-1615-i-001` | movement | null | Deccani painting | Commons categories place it in 1610s India, Karnataka, Bijapur ruler; description itself calls it Deccani. |
| `collection-of-beauty-indischer-maler-um-1615-i-001` | nationality | null | Indian | Commons categories '1610s paintings from India', 'Paintings from India in the British Museum' |
| `collection-of-beauty-johann-heinrich-fussli-064` | medium (not stored on the record) | implied 'painting' by the description | monochrome wash drawing on paper, heightened with white | image — paper tone, brown washes, ink inscription; commons — 'Drawings by Johann Heinrich Füssli in the Art Institute of Chicago' |
| `collection-of-beauty-liefdespaar-rp-p-ob-12-233` | year | 1513 | 1513-1540 (range) | Rijksmuseum dating in the source evidence is 'Datering: 1513 - 1540'; the record has flattened the range to its lower bound, which for an artist born in 1503 implies a print made a |
| `collection-of-beauty-mavzoley-shakh-i-zinda-v-samarkande` | artist | None | Vasily Vereshchagin (probable) | web:https://gallerix.ru/album/Vereshagin/pic/glrx-135870361 and http://artpoisk.info/artist/vereschagin_vasiliy_vasil_evich_1842/mavzoley_shah-i-zinda_v_samarkande/ - a Vereshchagi |
| `collection-of-beauty-mavzoley-shakh-i-zinda-v-samarkande` | year | None | 1869-1870 | same sources - the Vereshchagin canvas is dated 1869-70 |
| `collection-of-beauty-paul-gauguin-nafea-faa-ipoipo-1892-oil-on-canvas-101-x-77-cm` | title | Paul Gauguin | Nafea Faa Ipoipo (When Will You Marry?) | The title field holds the artist's name; the englishTitle field already carries the real title, and the Commons file is 'Paul Gauguin - Nafea Faa Ipoipo (1892).jpg'. |
| `collection-of-beauty-sans-culotte` | year | null | 1792 | Commons categories include '1792 paintings in Paris' and 'Wars of the French Revolution in 1792'. Treat as a lead rather than a confirmed date - it comes from category tagging, not |
| `collection-of-beauty-watteau-antoine-huit-etudes-de-tetes-de-femme-et-une-tete-d-homme` | realDimensions | null | { widthCm: 38.1, heightCm: 25.0 } | Louvre INV 33384 record: H. 0.25 m; L. 0.381 m |
| `collection-of-beauty-william-merritt-chase-still-life-with-hummingbird-google-art-project` | provenance.collection | Q1117704 | Indianapolis Museum of Art | commons — three separate Indianapolis Museum of Art categories on the file; the unresolved Q-id has evidently leaked from the record into the description text |
| `redoute-roses-rosa-andegavensis-118` | title | Rosa Andegavensis | needs checking against the c82.net plate order | The image is a double pink garden rose, which is not what Rosa x andegavensis looks like; either the image is paired with the wrong title/id (the id carries plate number 118) or th |
| `redoute-roses-rosa-sempervirens-globosa` | image asset / title | redoute-roses-rosa-sempervirens-globosa (rendered image shows a crimson single-flowered rose) | verify which Les Roses plate the stored asset actually is | image vs. the documented R. sempervirens globosa plate, which has white flowers, glossy leaflets and styles united in a hairy column |
| `audubon-birds-395-i-audubon-s-warbler-2-hermit-warbler-3-black-throated-gray-warbler` | year | 1827 | circa 1837 | 1827 is the start of the whole double elephant folio (Commons gives 'between 1827 and 1838'). Plate 395 belongs to the last part of the series and depicts species from Townsend and |
| `collection-of-beauty-1900-cezanne-pine-tree-in-front-of-the-caves-above-chateau-noir` | title | 1900 | Pine Tree in Front of the Caves above Château Noir | commons — the file name begins with the year, which has been parsed as the title; Commons objectName is 'Pin et rochers près des grottes au-dessus de Château Noir' and the label gi |
| `collection-of-beauty-1902-cezanne-study-of-a-skull` | title | 1902 | Study of a Skull | commons objectName '1902, Cezanne, Study of a Skull' and the label text; the current title is just the year |
| `collection-of-beauty-1906-cezanne-still-life-with-carafe-bottle-and-fruit` | title | 1906 | Still Life with Carafe, Bottle, and Fruit | Commons objectName is '1906, Cézanne, Still Life with Carafe, Bottle, and Fruit'; the current title is the leading year, sliced off the file name. |
| `collection-of-beauty-ariko-weeps-on-her-boat` | year | 1885 | 1886 | commons — date '1886-09' and credit 'Original publication: 1886 Japan'. The series as a whole ran 1885-1892, but this sheet is dated to September 1886. |
| `collection-of-beauty-assistants-and-george-frederic-watts-hope-google-art-project` | artist | George Frederic Watts | George Frederic Watts and assistants | commons \| artist field 'George Frederic Watts and workshop'; the Commons file name begins 'Assistants and George Frederic Watts' |
| `collection-of-beauty-bruni-f-a-bogomater-s-mladentsem-v-rozakh-1843` | realDimensions | null | leave null | the description's '64 by 40 cm' has no source; do not backfill the record from it |
| `collection-of-beauty-cezanne-ambroise-vollard` | artist | null | Paul Cézanne | commons imageDescription 'Portrait of Ambroise Vollard (1899). Petit Palais, Paris' and category 'Ambroise Vollard (Paul Cezanne - Petit Palais)'; the catalogue row leaves artist,  |
| `collection-of-beauty-cezanne-thyssen` | title | Cezanne-Thyssen | Seated Man | web:https://www.museothyssen.org/en/collection/artists/cezanne-paul/seated-man \| the current title is the Commons filename, not a title |
| `collection-of-beauty-dame-alice-ellen-terry-choosing-by-george-frederic-watts` | year | 1904 | 1864 | NPG 5048 dates 'Choosing' to 1864; 1904 is Watts's death year, taken from the Commons PD boilerplate ('author died in 1904'). Commons' own date field says the portrait was probably |
| `collection-of-beauty-edmund-blair-leighton-the-end-of-the-song-1902` | year | null | 1902 | Commons date field '1902 date QS:P571,+1902-00-00T00:00:00Z/9'; the canvas is also signed and dated 1902 at lower left, visible in the image, and the filename carries (1902). |
| `collection-of-beauty-francesco-hayez-incontro-di-giobbe-ed-esau-1844` | title | Incontro di Giobbe ed Esaù | Incontro di Giacobbe ed Esaù | commons \| 'Giobbe' is Job; the subject and the englishTitle are Jacob (Giacobbe), and the Commons category on the file is 'Incontro tra Esau e Giacobbe by Francesco Hayez'. The er |
| `collection-of-beauty-frederick-leighton-biondina` | year | 1870 | unresolved — 1870 (Commons) vs 1879 (WikiArt / Art Renewal Center) | Commons date field and categories say 1870; WikiArt and ARC say 1879, both locating it at the Hamburger Kunsthalle. The description and the record contradict each other; neither si |
| `collection-of-beauty-g-caillebotte-interieur` | year | null | 1880 | The composition (woman at the window seen from behind, man reading in an armchair at right) is Caillebotte's 'Intérieur' / 'Interior, Woman at the Window', consistently dated 1880  |
| `collection-of-beauty-galatskaya-bashnya-v-lunnom-svete` | realDimensions | null | { widthCm: 80, heightCm: 52 } | Sotheby's London, 26 November 2012, lot 5 (the record's own credit line) lists the canvas as 52 x 80 cm — the same figures the description already gives |
| `collection-of-beauty-george-frederick-watts-001` | realDimensions | null | 53.3 x 38.1 cm | web:https://commons.wikimedia.org/wiki/File:George_Frederick_Watts_001.jpg — the file page gives 53.3 x 38.1 cm, confirming the figure in the description. |
| `collection-of-beauty-giuseppe-arcimboldo-la-primavera-google-art-project` | year | 1573 | 1563 | Real Academia de Bellas Artes de San Fernando catalogue, inv. 0606; Commons places the file in that collection |
| `collection-of-beauty-holbein-danse-macabre-4` | artist | null | Hans Holbein the Younger | the description and the Commons categories ('Danse Macabre (Holbein)', 'Paintings by Hans Holbein der Juengere with fur') both identify the cycle; the record currently has no artis |
| `collection-of-beauty-holbein-danse-macabre-4` | year | null | 1538 (published) or c. 1526 (designed) | standard publication history of the Lyon Trechsel edition, also asserted by the existing description |
| `collection-of-beauty-ivan-k-ayvazovskiy-brig-merkuriy-posle-pobedy-nad-dvumya-turetskimi-korablyami-1848` | realDimensions | null | 123.5 x 190 cm | Russian Museum virtual catalogue entry for 'Бриг «Меркурий» после победы над двумя турецкими судами встречается с русской эскадрой', 1848, холст, масло, 123,5 x 190 см (https://rus |
| `collection-of-beauty-january-by-grant-wood-1940-41-cleveland-museum-of-art` | year | 1940 | 1940-41 | commons date field: 'between 1940 and 1941'. The single-year value loses the range, though a single number may be all the schema takes. |
| `collection-of-beauty-kanae-yamamoto-1937-haruna-ko-shoshu` | movement | Shin-hanga | Sōsaku-hanga (or none — this work is an oil painting, not a print) | The work is an oil painting per Commons; Yamamoto Kanae is the founding figure of the sōsaku-hanga movement, which stood in opposition to shin-hanga. |
| `collection-of-beauty-kanae-yamamoto-1939-kogen-iizuna` | movement | Shin-hanga | Sosaku-hanga (or none) | The work is an oil painting, not a print, and Yamamoto Kanae is the founding figure of the sosaku-hanga (creative print) movement, not of shin-hanga, which was the rival publisher- |
| `collection-of-beauty-kanae-yamamoto-1939-kogen-iizuna` | realDimensions | {widthCm: 39, heightCm: 27, source: 'series-default'} | drop, or replace with a measured figure | A print-series default size has been applied to an oil painting; the Commons record gives no dimensions. |
| `collection-of-beauty-kochevaya-doroga-v-gorakh-alatau` | year | 1869 | 1869-1870 (or keep 1869 and note the range) | commons — date given as 'between 1869 and 1870' |
| `collection-of-beauty-le-jardin-hoschede-a-montgeron-d-a-sisley-fondation-vuitton-paris` | year | 1839 | 1881 | The museum wall label transcribed on Commons reads 'Montgeron, 1881'; 1839 is Sisley's date of birth, taken from '(1839-1899)' in the same label. |
| `collection-of-beauty-les-grands-boulevards-renoir-1875-ng` | credit | The National Gallery, London | note that this is the Commons photo credit, not the owning collection | Commons categories place the painting in the Philadelphia Museum of Art ('The Grands Boulevards (1875) by Pierre-Auguste Renoir in the Philadelphia Museum of Art'); the description |
| `collection-of-beauty-maria-de-tassis-by-anthony-van-dyck` | realDimensions | 93 × 120 cm (width × height, source: wikidata) | 92 × 129 cm | commons imageDescription: "Maria de Tassis oil on canvas 129 x 92 cm circa 1629 - 1630" — the height differs from the record's 120 cm by 9 cm. |
| `collection-of-beauty-mc-escher-convex-and-concave` | sourceEvidence | Commons File:Concave-et-convexe.jpg — a 2010 photograph of the roof of the Chateau de Chambord by Helene Rival | no usable Commons record for this sheet (the scraped file is a different work entirely) | sourceEvidence — objectName 'Concave-et-convexe', artist 'Helene Rival', date 2010-08-12, categories about slate roofs at Chambord; the image under audit is Escher's lithograph |
| `collection-of-beauty-ohara-koson-gatto-e-vasca-con-pesci-rossi-1933-xilografia-colorata` | year | 1933 | 1931 | Print inscription 昭和六年作 (Showa 6 = 1931) read from the image, corroborated by external listings giving a 1931 Watanabe first edition. The 1933 in the record traces to the Commons f |
| `collection-of-beauty-sadovaya-kalitka-v-chuguchake` | provenance.collection | Tretyakov Gallery (from Wikidata Q24089304) | verify against Russian Museum | commons categories: 'Oil on canvas paintings in the Russian Museum' and 'Paintings by Vasily Vereshchagin in the Russian Museum' - the two sources disagree about which museum holds |
| `collection-of-beauty-searching-for-immortals-met-dp162813` | year | 1696 | unverified - leave as is but flag | Commons date field is empty and the leaf carries no legible date; 1696 has no visible source in the record. |
| `collection-of-beauty-summer-study-from-the-bingzi-year` | artist | Pu Xuan | Pu Xian (溥僩) | Commons artist field reads 'Pu Xian' and the file title is 溥僩; 僩 is normally romanised xiàn/xiǎn, not xuan. Low confidence — worth a check against how the artist is listed elsewher |
| `collection-of-beauty-the-muscles-of-the-human-body-fourth-layer-seen-from-the-f-wellcome-v0007799` | artist | null | Arnauld-Éloi Gautier d'Agoty | commons — imageDescription and category 'Arnauld-Éloi Gautier-Dagoty'; the plate is lettered 'A. E. G. D. pin. et sculp.' |
| `collection-of-beauty-viktor-vasnetsov-bogatyri-google-art-project` | year | 1881 | 1898 (completion), or record the 1881-1898 range | commons — 'from 1881 until 1898'; the description itself says the picture was finished in 1898, which sits oddly against a catalogue year of 1881 |
| `collection-of-beauty-4344-vis-print-14762kopie` | year | 1610 | 1615-1620 | commons imageDescription: 'Peter Paul Rubens, Studie van een oude vrouw, 1615-1620, olieverf op eiken paneel, 50,2 x 40,6 cm' - the record's 1610 is not supported by the source the |
| `collection-of-beauty-albinus-tabulae-sceleti-tabula-ii-wellcome-l0023549` | artist |  | Jan Wandelaar, after Bernhard Siegfried Albinus | image \| the engraved line at the lower left of the plate names Wandelaar as both draughtsman and engraver, and the running head names Albinus |
| `collection-of-beauty-albinus-tabulae-sceleti-tabula-ii-wellcome-l0023549` | year |  | 1747 | knowledge \| Tabulae sceleti et musculorum corporis humani was published at Leiden in 1747, the date the description itself gives |
| `collection-of-beauty-amor-vincet-omnia` | artist | null | Caravaggio (Michelangelo Merisi da Caravaggio) | Commons imageDescription: 'Amor Vincit Omnia (c. 1601-1602), by Caravaggio. Oil on canvas, 156 cm x 113 cm. Gemaldegalerie, Berlin' - the description already names Caravaggio, so t |
| `collection-of-beauty-claude-monet-entree-du-port-de-trouville` | title | en | Entrance to the Port of Trouville | The title field has captured the language tag 'en' from the Commons objectName string; englishTitle already holds the real title. |
| `collection-of-beauty-claude-monet-on-the-boat-google-art-project` | title | Google Art Project | On the Boat | commons \| the file is 'Claude Monet - On the Boat - Google Art Project.jpg' and the objectName field gives the Japanese title 舟遊び; the stored title is a fragment of the filename |
| `collection-of-beauty-fourth-muscle-man-by-vesalius-wellcome-l0001647` | year | null | 1555 | commons category 'De humani corporis fabrica 1555'; the printed page number 221 in Liber II is consistent with the enlarged second edition rather than the 1543 first |
| `collection-of-beauty-fourth-muscle-man-by-vesalius-wellcome-l0001647` | artist | null | After Andreas Vesalius (blocks attributed to the circle of Titian / Jan Stephan van Calcar) | commons objectName 'Fourth muscle man, by Vesalius.'; the attribution of the blocks is traditional and should stay hedged |
| `collection-of-beauty-hieronymous-bosch-tondals-visions` | artist | Hieronymus Bosch | Follower of Hieronymus Bosch | commons artist field 'Follower of Hieronymus Bosch', file title 'Follower of Jheronimus Bosch 037.jpg', category 'Followers of Jheronimus Bosch' - the description itself already sa |
| `collection-of-beauty-hieronymous-bosch-tondals-visions` | year | null | c. 1550 (mid-16th century) | commons date field 'mid 16th century date QS:P571,+1550-00-00T00:00:00Z/7' |
| `collection-of-beauty-holbein-danse-macabre-34` | artist | null | Hans Holbein the Younger (designer) | Commons categorises the file under 'Danse Macabre (Holbein)'; the description already attributes the series to Holbein, so the null artist field is a gap rather than a conflict. No |
| `collection-of-beauty-jan-van-der-hoecke-antwerp-1611-antwerp-or-brussels-1651-the-battle-of-nordlingen-1634-rcin-400100-` | artist | Peter Paul Rubens | Jan van der Hoecke | Royal Collection Trust catalogues RCIN 400100 as by 'Jan van der Hoecke (Antwerp 1611 - Antwerp or Brussels 1651)'; Commons lists 'Jan van den Hoecke / Jacob Jordaens / Peter Paul  |
| `collection-of-beauty-jean-francois-millet-shepherd-tending-his-flock-google-art-project` | year | null | early 1860s | commons date field reads 'early 1860s' and the categories include '1860s paintings in the Brooklyn Museum'. The row currently has no year at all, which is why the description had t |
| `collection-of-beauty-jean-frederic-bazille-reclining-nude-1864` | artist | null | Frederic Bazille | Commons title and categories ('Paintings by Frederic Bazille in the Musee Fabre'); the record's own title string already names him, and the description does too, so the null artist |
| `collection-of-beauty-jeune-fille-au-piano-par-paul-cezanne` | year | 1866 | 1868 (or a 1868-1869 range) | web:https://hermitagemuseum.org/digital-collection/28717 (via search summary) — the Hermitage dates the canvas circa 1868 and gives 57.8 x 92.5 cm; other literature dates it 1869.  |
| `collection-of-beauty-joseph-mallord-william-turner-1775-1851-waves-breaking-against-the-wind-n02881-national-gallery` | provenance.collection | National Gallery | Tate | the same provenance block gives location 'Tate' and describedAt tate.org.uk/art/artworks/turner-waves-breaking-against-the-wind-n02881; N02881 is a Tate (Turner Bequest) number |
| `collection-of-beauty-kanae-yamamoto-1938-kami-ide-no-fuji` | movement | Shin-hanga | Sosaku-hanga | Yamamoto Kanae is the founding figure of the sosaku-hanga (creative print) movement, the rival tendency to shin-hanga - the description itself says so, contradicting the record. Th |
| `collection-of-beauty-kanae-yamamoto-dutch-girl-in-landscape` | year | 1946 | c. 1910s (Yamamoto's European years, 1912-16) | commons date field is 'before 1946', a copyright-derived upper bound, not a date of execution; Yamamoto died in 1946 |
| `collection-of-beauty-kanae-yamamoto-dutch-girl-in-landscape` | movement | Shin-hanga | Sosaku-hanga | Yamamoto Kanae is the founding figure of sosaku-hanga (creative prints), the movement usually set in opposition to shin-hanga; the description itself says so |
| `collection-of-beauty-katsushika-hokusai-tempesta-sotto-la-vetta-dalla-serie-delle-36-vedute-del-monte-fuji-1831-ca` | title | Katsushika Hokusai | Rainstorm Beneath the Summit | The title field currently repeats the artist's name (it is the Commons file name); englishTitle already carries 'Rainstorm Beneath the Summit, from Thirty-six Views of Mount Fuji'. |
| `collection-of-beauty-kreshchenie-rusi` | realDimensions | null | 187 x 214 cm (w x h), oil on canvas | Russian sources for the 1890 Tretyakov Gallery canvas give 214 x 187 cm, matching the figure already quoted in the description |
| `collection-of-beauty-kuroda-seiki-kohan00-6-1b` | movement | Nihonga | Yōga (Western-style painting) | image \| knowledge — this is an oil on canvas in a plein-air European manner, and Kuroda Seiki is the central figure of Yōga, the Western-style school, which is defined in oppositi |
| `collection-of-beauty-marktjaffagustavbauernfeind1887` | year | 1877 | 1887 | The Commons filename ('MarktJaffaGustavBauernfeind1887'), WikiArt and other Commons copies date it 1887, while this file's extmetadata says 1877. Bauernfeind's first journey to the |
| `collection-of-beauty-monet-truthahne` | year | 1877 | 1876-77 (painted 1876 at Montgeron, dated 1877) | commons categories date it 1876 ('1876 paintings from France', '1876 oil on canvas paintings in France') while the picture is signed and usually catalogued 1877; both are in circul |
| `collection-of-beauty-monet-w849` | year | null | 1883 | web:https://www.phillips.com/detail/claude-monet/HK010321/31 — 'Pavots dans un vase de Chine', painted in 1883, oil on canvas 100 x 61 cm, matching the record's realDimensions of 6 |
| `collection-of-beauty-monet-wildenstein-1996-1497` | year | null | 1897 (verify) | the title is the Wildenstein catalogue number 1497; Monet painted his four Giverny chrysanthemum canvases in 1897, which is the group this close-up flower-bed composition belongs t |
| `collection-of-beauty-old-guitarist-chicago` | movement | Cubism | Blue Period | The picture is a 1903-04 Blue Period work, several years before Picasso's Cubism; the description itself says 'from his Blue Period', so the row contradicts its own text. |
| `collection-of-beauty-paul-cezanne-bouteille-carafe-broc-et-citrons` | title | Bottle | Bottle, Carafe, Jug and Lemons | commons objectName — 'Bouteille, carafe, cruche et citrons' / 'Bottle, carafe, jug and lemons'; the current title looks like a truncation of the full one. |
| `collection-of-beauty-paul-cezanne-the-murder-google-art-project` | year | 1867 | consider c.1870 or 1867-1870 | Commons date is '(1867 - 1870)' and the Walker Art Gallery / Art UK entry dates it c.1870; the description's 'around 1870' therefore disagrees with the record's flat 1867 rather th |
| `collection-of-beauty-plate-from-le-brun-bowles-s-passions-of-the-soul-circa-1785-wellcome-l0012148` | artist |  | after Charles Le Brun, printed for Carington Bowles | image \| the imprint at the foot of the plate names Carington Bowles; the designs are Le Brun's, as the description says |
| `collection-of-beauty-portrait-of-a-woman-met-dp-1419-01` | year | 1781 | unknown / circa 1800-1815 | Commons date is 'between 1781 and 1845', i.e. the artist's working-life span rather than a date for this picture; the sitter's high-waisted white dress, short puffed sleeves and go |
| `collection-of-beauty-reservist-of-the-first-division-malevich-1914` | realDimensions | null | 53.7 x 44.8 cm | The description's own figures, which match MoMA's stated size for this work (about 53.6-53.7 x 44.8 cm). Worth confirming against the MoMA object page before backfilling. |
| `collection-of-beauty-robert-delaunay-1913-l-equipe-de-cardiff-oil-on-canvas-326-208-cm-musee-d-art-moderne-de-la-ville-d` | realDimensions | null | 208 cm wide x 326 cm high | commons file title 'Robert Delaunay, 1913, L'Équipe de Cardiff, oil on canvas, 326 × 208 cm, Musée d'Art Moderne de la ville de Paris' and web:https://en.wikipedia.org/wiki/Cardiff |
| `collection-of-beauty-robert-delaunay-c-1906-paysage-au-disque-solaire-oil-on-canvas-54-x-46-cm-musee-national-d-art-mode` | movement | Cubism | Neo-Impressionism (for this 1906 work) | Commons categorises the file under 'Neo-Impressionist paintings' / 'Neo-impressionism'; the description likewise calls Delaunay a Neo-Impressionist. Low priority - the field may be |
| `collection-of-beauty-sekiya-village-on-the-sumida-river-sumidagawa-sekiya-no-sato-from-the-series-thirty-six-views-of-mo` | year | 1829 | c. 1830-32 | Commons date field: 'circa 1830 ... -32'; the Met dates the series c.1830-32 |
| `collection-of-beauty-shaw-john-byam-liston-now-is-pilgrim-fair-autumn-s-charge` | year | null | leave null | Commons only records '2008 (upload date)', which is the file date, not the painting date - nothing here supports filling the year in |
| `collection-of-beauty-the-venous-and-arterial-system-of-the-human-body-engraving-wellcome-v0007816el` | year | 1543 | 1726 (impression) / after a 1543 woodcut | commons imageDescription: 'Engraving by J. Wandelaar, 1726, after a woodcut, 1543.' The catalogued year is the date of the source woodcut, not of this engraving. Flagging only; eit |
| `collection-of-beauty-vasily-vereshchagin-russian-1842-1904-the-road-of-the-war-prisoners-1878-1879` | realDimensions | widthCm 320.5, heightCm 202.6 (source: wikidata) | widthCm 298.9, heightCm 181 (the Brooklyn Museum's own figures; 320.5 x 202.6 looks like a framed measurement) | commons imageDescription — '71 1/4 x 117 11/16 x 2 1/4 in. (181 x 298.9 x 5.7 cm)', which is also what the description text in the record itself states in inches |
