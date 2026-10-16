# Agent notes — collection-of-beauty

Short orientation for an AI agent (Claude or otherwise) working in this
repo. Read [README.md](README.md) first for the stack and commands; this
file covers conventions and gotchas that aren't obvious from code alone.

## What the project is

A public-domain art gallery (~2,950 works, ~330 artists) shipped as a
Next.js App Router site. The headline feature is a multi-floor WebGL
museum (`/gallery-3d`) where every era is its own storey, connected by
a central spiral staircase.

## Deployment surface

Docker image → GHCR → Coolify. **Not Vercel.** The Vercel CLI / Vercel
knowledge updates that show up in agent sessions are environmental noise
— treat them as informational. Don't propose Vercel-specific
infrastructure (KV, Blob, Edge Functions) unless explicitly asked.

`output: "standalone"` in [`next.config.mjs`](next.config.mjs) is
required by the Dockerfile — don't remove it.

## Data shape

- `src/lib/data.ts` exports two artwork shapes:
  - `Artwork` (full record with description, provenance, credit, etc.)
  - `ArtworkListing` (slim Pick used by every client component)
- The full `Artwork` only belongs in **server-only** code paths: the
  `/artwork/[id]` detail page, `/newsletter/*` pages, the newsletter
  CLI (`scripts/newsletter-*.ts`), and the SEO / JSON-LD generators.
  Anywhere a client component takes an artworks
  array, it should be `ArtworkListing[]`. Server pages pass
  `artworkListings` (the precomputed slim array) — passing `artworks`
  to a client component is a regression (~6 MB into the RSC payload).
- A work has two titles. `Artwork.title` is the source title after
  build-data's cleanup, often still a filename ("NDL-DC 2586549-12
  Kawase Hasui T15 crd"). `englishTitle` comes from
  `metadata/title-overrides.json`, and pages, tiles and plaques show
  `displayTitle()`: `englishTitle` when there is one, else `title`.
  For 802 works the two differ. So a bad `title` is not what a visitor
  reads; check `displayTitle` before calling a title wrong. `title`
  still does three things: it orders the catalogue (year, then title),
  it is the JSON-LD `alternateName` when it differs from the English
  one, and the 3D museum picks frames by words in it. The order matters
  on a museum floor at its 300 cap, where an artist's share is taken at
  an even stride through their works: on 13 October 2026 dropping a
  preview prefix from three Hasui titles swapped 12 of his prints on
  the East Asian floor for 12 others.
- `src/data/*.json` is generated. Don't hand-edit. Re-run
  `pnpm assets:build-data` after touching metadata or the build script.
- `Artwork.dominantColor` (whole-image average) is for placeholder tints
  only. Browse-by-colour uses `Artwork.colorBuckets` — up to three
  colour families read from a *pixel histogram* of the smallest variant.
  The average is useless for hue filtering: it collapses ~all 4,557
  works into one warm wedge (~9 works land anywhere near blue). Scoring
  lives in [`src/lib/color-buckets.mjs`](src/lib/color-buckets.mjs)
  (`.mjs` so build-data imports it untranspiled, like `variant-config.mjs`)
  and is normalised against a corpus prior — a family is listed only when
  a work carries more of it than the collection's own average, otherwise
  "gold" just means "is a painting". Re-measure `FAMILY_PRIOR` if the
  corpus composition shifts materially.
- Membership and amount are **two different numbers**.
  `Artwork.colorBuckets` is the thresholded "is it red at all";
  `Artwork.colorStrength` is the chroma-weighted fraction of the whole
  image, per listed family, and is what `sort=color` ranks by so the
  reddest works head `/colours/red`. Membership is deliberately generous
  (median red strength across the 806 red works is 0.049), so without the
  ranking the family pages open on works with a red accent.
  `colorStrength` is **server-only on purpose** — it is not in
  `ArtworkListing`; read it via `colorStrength()` / `sortByColorStrength()`
  in [`src/lib/artwork-colors.ts`](src/lib/artwork-colors.ts). Do not
  compare strengths across families: `blue: 0.3` is not "more" than
  `gold: 0.5`, since the corpus is full of gold. That comparison is what
  the prior-normalised score exists for.
- `Artwork.thumbHash` is a [ThumbHash](https://evanw.github.io/thumbhash/)
  of the smallest variant: ~20 bytes, unpadded base64 (~28 chars). A tile
  paints it as a blurred preview over the `dominantColor` tint until the
  variant loads, then fades to the pixels. It is in `ArtworkListing` and
  `TimelineListing`; `dominantColor` stays as the fallback underneath.
  - **Decode only in client components** —
    [`src/lib/thumbhash-grid.ts`](src/lib/thumbhash-grid.ts), called from
    `ThumbHashPicture` and `ProgressiveImage`. The hash crosses the RSC
    boundary, the ~240-char data URL never does, which is why the server
    `ArtworkCard` hands the hash to `ResponsiveImage` and not a URL.
  - **Not `thumbHashToDataURL`.** That renders a 32 px RGBA PNG, ~4.3 KB
    of data URL per tile. The fork evaluates the DCT at the cell centres
    of a 6-cell grid at the work's true aspect and writes an uncompressed
    PNG. Its output is byte-identical in V8 and JavaScriptCore, and the
    SSR/hydration match depends on that: keep `Math.round`, and no canvas.
  - `/api/artworks` and the listings form of `/api/artworks/scope` strip
    it (`catalogueListings`, `withoutThumbHash()` in `data.ts`). Their
    consumers, the 3D gallery and the lightbox's prev/next list, paint no
    tiles, and over 4,557 rows the hashes are +117 KB gzipped (+33%).
    `resolveScope` returns a shared cached array, so the strip copies.
  - Only the first `EAGER_BLUR_TILES` (24) tiles of a server-rendered
    grid carry the blur in the HTML (~2.5 KB gzipped). The rest add it
    right after hydration (`useHydrated`), so the server render and the
    hydration render stay identical.
- `PROBE_CACHE_VERSION` in `build-data.mjs` gates the image-probe cache.
  Bump it whenever the probe emits a new field, or every cached entry
  silently keeps the old shape (this is why v3 exists).
- `metadata/provenance.json` comes from `scripts/fetch-provenance.mjs`,
  which finds a work's Wikidata item through its P18 image. For a print
  that item is the whole edition: Knight, Death and the Devil lists 23
  collections and 29 inventory numbers. Reading `wdt:` values one property
  at a time mixed museums: collection from one impression, location,
  number and URL from others. The fix on 28 September 2026 changed 176
  records, 169 of them catalogued. Collection, location,
  inventory and describedAt are now resolved together by
  `scripts/lib/provenance-impression.mjs`, which pairs each P217 with its
  P195 qualifier and picks the holding the Commons file page names. When
  nothing identifies it, those fields stay null. `--reresolve` corrects
  existing entries from their stored QID without touching keys.
  The P18 lookup also matched people, concepts and series whose image is
  the painting: Q2979, the concept of liberty, stood for Delacroix's
  Liberty Leading the People. On 28 September 2026, 95 such ids were
  replaced with the item the Commons page names (`{{Artwork|wikidata=}}`
  or structured-data P6243) and 11 were set to null. After correcting an
  id by hand, pass its key to `--reresolve --keys <file>`. Without it, a
  record whose item has one holding keeps its old fields.
- Artwork ids are minted from filenames, so a rescan, dedup or artist
  merge retires published URLs. `src/data/redirects.json` maps old ids and
  artist slugs to current ones; `pnpm redirects:build`
  (`scripts/build-redirects.ts`) regenerates it from the git history of
  `artworks.json` and runs after `pnpm assets:build-data`. The artwork and
  artist pages serve those as 308s before calling `notFound()`
  (`src/lib/redirects.ts`). Evidence must name one work: same source
  file (`objectKey`), same Commons page, same Commons file, or same artist
  and title within a decade. The source file comes first: an id minted
  again for a file that stayed in place (60 of them, mostly Cyrillic
  names) keeps its redirect when the work's Commons link is corrected.
  Don't add
  word-overlap matching: it mapped "After a success" to "After a failure",
  and a 308 is cached for good. Anything weaker belongs on the 404 page,
  whose "did you mean" matcher is `src/lib/not-found-match.ts`.
- An artist re-attribution that keeps the work's id is visible to one
  redirects run only, the one before it is committed. So the generator
  keeps every artist entry the file already holds while the old slug
  stays retired and the target exists
  (`src/lib/artist-slug-redirects.ts`). Commit `redirects.json` with the
  catalogue change, and delete an artist entry by hand to retire it.
  Voting over every slug an id ever carried was tried and dropped: its
  shared-word guard let `gentile-bellini` through to `giovanni-bellini`.
- `metadata/title-overrides.json` gives a work its English title
  (`englishTitle`), keyed by `<folder>/<filename>`. On 13 October 2026,
  453 works got one. Their titles were in French, German, Spanish,
  Dutch, Russian or Korean, were a file name ("Monet w 235", "Holbein
  Danse Macabre 7"), or carried the artist's name. Wikipedia's lists of
  Monet's and Van Gogh's works name the Commons file beside each
  catalogue number, which settles a title like "Monet w 42". Four
  file-name titles are left: Cézanne's `FWN 1974` and three Hasui
  prints of the NDL album (`ndl-dc-2586550-50`, `-58`, `-74`), which
  neither Commons nor Wikidata names. Two things an entry can change
  besides the title:
  - **The id**, for a file whose name has no Latin letters. The id then
    comes from `englishTitle ?? title`, so a first English title mints
    a new one. One work moved that day (`…-cb9001fb`, Kim Hong-do's
    Chongseokjeong). Its keys in `artwork-dimensions.json`,
    `curator-descriptions.json`, `description-audit-ledger.json` and
    `description-review-proposals.json` were renamed by hand; the
    redirect comes from `pnpm redirects:build`.
  - **A redirect.** Title evidence must name one work. A second work by
    the same artist with the same title within a decade removes the
    redirect of the first. Rubens's Madrid Susanna is "Susanna and the
    Elders (Madrid version)" for that reason. Read the diff of
    `redirects.json` after adding titles.
- A plaque or page says "Unknown" when `artist` is null. That was 75
  works on 13 October 2026, and for 70 the Commons page names the
  artist in a category or the description while its artist field is
  empty or holds the uploader: 40 plates of Holbein's Dance of Death,
  30 others. They have entries in `metadata/artist-overrides.json`,
  each with its evidence under `_why`. 5 stay without an artist: the
  Hungry Ghosts Scroll, Flora Tristan (a lithograph of 1838), the
  Illustrated London News engraving of Carlyle, a plate of Albinus
  that names no engraver, and The Fall of Phaethon, which Commons
  files as "formerly attributed to Jan Carel van Eyck". A name in a
  file's title is not evidence by itself: that last file is named
  after van Eyck.
  The build cuts a known artist's name off the front of a source
  title ("Nicolas Poussin - L'Enlèvement des Sabines"), so an artist
  override can change `title` too.

## Asset URL conventions

- `assets/<folder>/<filename>` is the original.
- `assets-web/<folder>/<basename>/<width>.{avif,webp}` is a pre-built
  variant.
- Runtime URL builders live in `src/lib/utils.ts` — `assetUrl()`,
  `variantUrl()`, `variantSrcSet()`. The widths emitted by `variantSrcSet`
  must match what `pnpm assets:shrink` produced, otherwise the browser
  404s for every missing entry.
- The runtime reads `Artwork.variantWidths` to know which widths exist
  for a given work — populated by `build-data.mjs` from a directory
  scan. New artworks have `variantWidths: null` until shrink + build-data
  run.

## Scans that show their frame

- `metadata/scan-crops.json` cuts a scan before anything is derived
  from it: percent off each side of the displayed original, keyed
  `<folder>/<filename>`. The original stays the Commons file (its SHA-1
  still matches the page). shrink, tiles and build-data apply the cut
  through `scripts/lib/scan-crops.mjs`, so `width`/`height` in the
  catalogue are the cut size. All three must agree: a reader of an
  original that skips the table gets the frame back.
- 14 works were cut on 17 October 2026 after a pass over all 3,376
  scans of the `collection-of-beauty` folder. Rico approved each from
  before/after proofs. He rejected Massys's Portrait of a Woman (the
  arch and columns are painted). Boucher's Resting Girl keeps its
  scan: the frame's four carved corners show inside it, and it hangs
  in a pinned gilt Louis XV frame that swells at the corners
  (`PINNED_FRAMES` in `frame-design.ts`), so the carving reads as the
  inner edge of the frame round it.
- Stuck's small Salome of 1906 (`Franz_von_Stuck_Salome.jpg`) was
  scanned in the frame he designed for it, a temple front in gilt. The
  scan is cut to the canvas, its size is the canvas's (24.7 × 45.7 cm;
  the 56.1 × 76.5 cm stored before was the frame), and the museum
  builds his frame again: the `stuck` style, rails of reeded bands and
  flat panels at real size (scale fixed at 1, pinned weight 1), with
  his grey-blue paintwork (columns, pediment, roundels, title) drawn
  on the panels by `frame-paint.tsx` (`FrameDesign.painted`). A new
  painted frame needs a style, a pin and a drawing there.
- Editing an entry makes that work's variants and tiles stale (they are
  older than the table). Run `pnpm assets:shrink --folder=… --only=…`,
  then build-data, then `assets:tiles --only=…`. A cut can drop a work
  under a full-size rung: the old `<width>.avif` stays in the variant
  folder and build-data lists it. Move it to
  `assets/.rejected/frame-crop-stale-variants/`, never under
  `assets-web/.rejected/`.
- **Polyptychs.** A diptych or triptych photographed as one object
  stays one work: one id, one scan, one set of variants. Its entry in
  `scan-crops.json` lists `panels` (percent of the cut image, left to
  right), build-data copies them to `Artwork.panels` (fractions, in
  `ArtworkListing` for these works only), and the museum hangs each
  panel in a frame of its own, frames touching, in the wall the hang
  gave the whole work (`layoutPanels` in `gallery-layout/polyptych.ts`).
  The canvas is one mesh of a quad per panel on the one texture
  (`panel-geometry.ts`), so the LOD ladder and the painting registry see
  one work. What lies between the panels in the scan, frames or a white
  ground, is not drawn. Pages show the whole scan. Six works have
  panels (17 October 2026): the open Garden of Earthly Delights and its
  closed wings, van der Weyden's Crucifixion (all three also cut),
  Bosch's St Anthony, Dürer's Adam and Eve and the Vienna Diptych.
  Panels with shaped tops (Massys's Joiners' Altarpiece, the Seven
  Sacraments, the Isenheim scans) need a mask and are not done; the
  vault note `collection-of-beauty-polyptychs.md` lists them.

## Originals saved as previews

- Most of `assets/collection-of-beauty` was saved by hand from a
  browser, and a right-click on a Wikipedia page saves the preview: the
  download address is `…/commons/thumb/…/960px-<name>`, and the file is
  960, 1,280 or 2,560 px wide whatever the original holds. macOS keeps
  that address on the file (`xattr -p com.apple.metadata:kMDItemWhereFroms`).
  On 12 October 2026 the Commons file a work's `commonsUrl` names was
  larger than the copy on disk for 422 of the 3,910 works that link to
  one: 381 saved previews, 15 uploaded again larger or saved by a route
  macOS did not record, and 26 where the sidecar names another upload
  of the painting than the file on disk.
- The 26 were sorted the same day. 18 sidecar entries now name the page
  of the file on disk: `source` and `copyright` as
  `fetch-wikimedia-metadata.mjs` writes them, `file_url` without the
  `?utm_…` query the API now appends. A page was accepted on the file's
  SHA-1 (10) or on the exact size of a preview whose download address
  macOS kept (8). `list=allimages&aisha1=<sha1>` finds the page of a
  file that was renamed by hand. A file with no page under its own name
  keeps the link, because the fetch falls back to
  `source.canonical_title`. 4 already named their file: a redirect, an
  older revision, two previews. 4 are open. Boucher's Diana is Sailko's
  photograph under CC BY 3.0, and three files are on no Commons page.
  The Gothenburg Olive Grove is CC BY 4.0 on Commons and "Public
  Domain" in the sidecar. The vault note
  `collection-of-beauty-commons-larger-originals.md` lists all 26.
  A 27th turned up in the refetch. Raphael's School of Athens linked
  `The School of Athens by Raffaello Sanzio da Urbino.jpg`, a user's own
  photograph of 2024 (17,402 px, another crop), while the file on disk
  was `"The School of Athens" by …`, a stitch of 2013 at 3,820 px. It
  was relinked on 13 October 2026, and the same day Rico saw both and
  took the photograph. Its bytes are on disk now under the old name
  `_The_School_of_Athens__by_Raffaello_Sanzio_da_Urbino.jpg`, so the
  id, the variant folder and the side tables stay, and the sidecar
  links the 2024 page again. Name and page disagree for this one work
  on purpose: check it by SHA-1 (`metadata/refetched-originals.json`,
  `otherCommonsFile`), and do not relink it.
- To read `source` and `copyright` again for a few entries, run the
  fetch script in a scratch root. Copy `fetch-wikimedia-metadata.mjs`,
  `normalize-metadata.mjs`, `artists-db.json`, `scripts/lib/` and
  `metadata/takedowns.json` there, put one empty file per work in its
  `assets/<folder>/`, named as the Commons page, and run it. It asks
  for those pages only and writes a sidecar there; copy the two blocks
  over. A run in the repo rewrites every entry of the folder.
- `scripts/refetch-commons-originals.mjs --ids=<file>` downloads a
  work's own file at full size and keeps the filename and the id. It
  checks the download against the SHA-1 the API reports, and skips a
  work when the page is another file, the licence class differs from
  the catalogue's, the page carries a deletion tag, or the artist's
  German term is still running. The replaced copy goes to
  `assets/.rejected/replaced-smaller/` and the replacement is recorded
  in `metadata/refetched-originals.json`. 333 works were done that day:
  23 from the museum's unhung list, then 310 of the other 373 on Rico's
  word. 63 were left: 43 for the German term (Kawase Hasui 41, Kawai
  Gyokudō 2), 9 where the licence class differs (5 Hokusai prints are
  CC0 on Commons and "Public domain" in the sidecar, 4 carry a licence
  string that is not a plain tag), 4 with no death year for the artist
  and no year for the work, and 7 where the larger upload is another
  picture. The vault note
  `collection-of-beauty-commons-larger-originals.md` lists both sets.
- The 9 and the 4 were left for what the catalogue recorded, and were
  run again on 13 October 2026. The 9 entries got `source` and
  `copyright` from their own page, and all 9 were fetched. Of the 4,
  page 184 of Vesalius's Fabrica got the year its page states (1543,
  `metadata/date-overrides.json`) and was fetched. Three stay, because
  their pages state no year: Carp Leaping up a Cascade (no date), the
  coloured wave after Hokusai ("19th century") and the Gainsborough
  imitator's Cattle Watering by a Stream ("undated"). The script needs
  a death year, or a year 170 years back. With the seven of the next
  point, Bonnard's nude and the three Rico took on sight (below),
  `metadata/refetched-originals.json` holds 354 works.
- Correcting a link can make a work a candidate. Eight of the 18
  relinked works are previews of the page they now name. Seven were
  fetched on 13 October 2026 on Rico's word: Carpaccio's
  Hunting on the Lagoon (1,280 → 6,506 px), Hokusai's wave from One
  Hundred Views, Boucher's Resting Girl, Gérôme's Ave Caesar, Van
  Gogh's Moulin de la Galette, Rops's Pornokratès and Baldung's Death
  and the Maiden (960 → 2,810 px). The script left Hasui's
  Daikon-gashi for the German term.
- `sameFile()` cannot match a file that was renamed by hand. The
  Baldung is `Death and the Maiden Baldung.jpg` on disk and
  `Gw11 0001031 20170619 001 Baldung Der Tod und das Maedchen.jpg` on
  Commons. `--accept-renamed=<id>` takes such a work. Pass an id once
  the file is matched to the page another way: its SHA-1 is a revision
  of the page, or macOS kept the page's preview address on it. Every
  other check still runs, the picture check included. Bonnard's Nude
  Against the Light (960 → 1,338 px) is the second such file. The
  script left it until `scripts/artists-db.json` gave Bonnard his
  dates: it reads the death year from the catalogue's artist record,
  and an artist with no db entry has none.
- A larger upload on the same page is not always the same picture. Two
  Mucha canvases were uploaded again in June 2026 as paler photographs
  with another crop; one shows the frame along its top edge. The script
  compares proportions and a 32 × 32 reduction of both files and
  leaves such a work alone unless its id is passed to
  `--accept-changed`. Of 317 downloads in the second run it stopped 12.
  Look at both files before passing an id. Rico's rule, 12 October 2026:
  a slight colour change at the same framing is acceptable (Gauguin's
  Self-Portrait with Halo and Snake, mean difference 7.7 of 255, a
  newer capture from the same museum). Five were taken that way.
  Another crop, a paler or a much darker photograph is not the same
  picture, and those go to Rico with both files side by side. On
  13 October 2026 he took three of five: Tuxen's Christian IX (same
  framing, mean difference 15.1, 1,600 → 5,752 px), Giorgione's Tempest
  (another photograph; the old copy was 800 px with a "© GA-VE" mark)
  and Raphael's School of Athens (another Commons file, 3,820 →
  17,402 px). He kept Sargent's Olmsted (546 → 755 px) and Spitzweg's
  Bookworm (1,256 → 1,500 px). A large gain outweighed a change of
  colour or crop; a small one did not. The two Mucha canvases stay as
  they were.
- `sameFile()` compares letters, digits and underscores, with the
  title written the way a browser saves it: a space becomes an
  underscore, and so does a quotation mark. Until 13 October 2026 it
  compared letters and digits only, and took
  `_The_School_of_Athens__by_Raffaello_Sanzio_da_Urbino.jpg`, the name
  a browser gives the page `"The School of Athens" by …`, for the page
  `The School of Athens by …`. The picture check stopped that download.
  The Commons API reads the name the same wrong way: it drops a leading
  underscore and folds two into one, so a lookup by that filename
  answers with the page that has no quotation marks. 18 works link a
  title with quotation marks, and this is the only one whose title
  without them is a page too. `fetch-wikimedia-metadata.mjs` asks for
  the page the sidecar records when the page a name found fails
  `sameFile()` and the recorded one passes it (`recordedTitleFor` in
  `scripts/lib/commons-batch.mjs`), and prints the file. It can only do
  that while the sidecar holds the right page: a new file of this kind
  gets the wrong page on its first fetch. Since Rico took the 2024
  photograph, the School of Athens records the page without quotation
  marks, the lookup by name stands, and that is the right answer.
- After it, encode by file: `pnpm assets:shrink
  --folder=collection-of-beauty --only=<part of the filename>`, then
  build-data, then `pnpm assets:tiles --only=<part of the filename>`
  (tiles read the catalogue, so they come after build-data). Without
  `--only` both scripts take on a backlog that is not yours: on 12
  October 2026 a dry run of shrink listed 56 other stale sources in
  the folder (436 over all folders). On 13 October 157 of the 1,119
  tile pyramids existed on disk (2 from the first trial, 155 from the
  refetches). The lightbox falls back to the plain image for the other
  962.
- A work's probe in `metadata/.cache/image-probe.json` is keyed on the
  mtime of its variant folder, and `assets:tiles` adds a `tiles/`
  folder there. So the first build-data after a tile run probes those
  works again and writes the same values. Copy the cache to the main
  checkout after that run, not before the tiles.
- Encoding is the slow part. The 310 sources of the second run took
  4 h 40 min on five lanes while other sessions held the machine at a
  load average of 60 to 240; their 139 pyramids took 6 minutes on
  seven lanes once the machine was quiet. Start the lanes with
  `unsetopt bgnice` first: zsh runs a background job at nice 5. Never
  kill a shrink run to restart it: it writes each variant in place, and
  a cut-off file with a fresh mtime counts as done.

## Deep zoom (tiled lightbox)

- ~1,115 works have a source big enough that its full-size encode clears
  `FULL_SIZE_MIN_WIDTH` (4096 px, in
  [`variant-config.mjs`](src/lib/variant-config.mjs)). For those,
  `pnpm assets:shrink` emits a per-source full-resolution AVIF
  (capped at 16384 px on the long side) **and** `pnpm assets:tiles`
  emits a DZI pyramid at
  `assets-web/<folder>/<basename>/tiles/<level>/<col>_<row>.webp`.
- The pyramid exists because that full-size AVIF is unusable as a single
  image: median ~124 megapixels (up to 265), which is a ~500 MB decode
  and past the decode ceiling mobile Safari enforces. The lightbox used
  to fetch it eagerly on open — p50 4.3 MB, max 89 MB. It no longer does
  for tiled works; see the skip in `lightbox.tsx`'s preload effect.
- **Availability is derived, not stored.** A work has tiles exactly when
  `max(variantWidths) > FULL_SIZE_MIN_WIDTH`, which every client already
  receives via `ArtworkListing`. Don't add a `hasTiles` field — it would
  be redundant bytes in the RSC payload on every gallery page.
- **The threshold is not the ladder max, and must never become it
  again.** `FULL_SIZE_MIN_WIDTH` lives in `variant-config.mjs` and
  `TILE_MIN_WIDTH` in `deep-zoom-config.mjs` imports it. It used to be
  spelled `Math.max(...VARIANT_WIDTHS)` in `shrink-sources.mjs` and
  hand-copied as a literal `4096` in the tile config, which coupled two
  unrelated policies: raising the ladder would have stripped the
  full-size AVIF *and* the pyramid from every work in between, and the
  viewers degrade silently rather than erroring, so nothing would fail.
- **Above-ladder widths are not all full-size encodes.** There is a
  second one: `GALLERY_LOD_WIDTH` (6144), the 3D gallery's close-up
  texture rung. It is deliberately **not** a member of `VARIANT_WIDTHS`,
  because every ladder rung is emitted for every source (shrink clamps
  the pixels but keeps the rung's filename), so a 6144 ladder rung would
  land on all ~4,570 works, make `max(variantWidths) > 4096` true
  catalogue-wide, and hand a pyramid to ~3,600 works that have none.
  Instead it is emitted per source and only when the full-size rung is
  *strictly larger* than 6144 — which keeps `max(variantWidths)` equal to
  the full-size width, exactly as before. Anything reading "the largest
  variant" depends on that gate; `src/lib/deep-zoom.test.ts` pins it.
- Tile geometry lives in `src/lib/deep-zoom-config.mjs`, shared between
  the build script and the runtime the same way `variant-config.mjs` is.
  `deepZoomSize()` must return the same pair on both sides or the viewer
  requests tile coordinates that were never written — the tiler resizes
  to exactly that pair rather than letting `fit: "inside"` round.
- Tiles are WebP because libvips `dzsave` accepts only jpeg/png/webp
  (AVIF is not a valid suffix). WebP also decodes faster, which matters
  when one pan decodes dozens of tiles.
- `openseadragon` is dynamically imported inside the viewer's effect, so
  it stays in its own ~338 KB async chunk and never reaches the main
  bundle. It touches `window` at module scope, so it must never be
  statically imported from anything a server component pulls in.
- The viewer probes `tiles/0/0_0.webp` before mounting and falls back to
  the plain `<img>` path when it 404s. That probe is deliberate:
  OpenSeadragon's `open-failed` never fires for an inline tile source,
  and OSD 6's default WebGL drawer doesn't raise `tile-drawn` at all.
- **Ordering:** tiles are not covered by `pnpm assets:verify`, which
  checks catalogued variants only. A catalogue rebuilt ahead of
  `assets:tiles` + `assets:sync` will claim tiles that 404; the viewer
  degrades cleanly, but the deep zoom is silently missing until the
  bucket catches up.

## 3D gallery internals

- `src/components/gallery-3d/index.tsx` is the entrypoint. Lazy-loaded
  from `src/app/gallery-3d/gallery-3d-client.tsx` with `ssr: false`.
- Three.js touches `window` on import, so anything that pulls
  `from "three"` at the top of a file ends up in a client chunk and
  must not be imported by a server component directly.
- `painting-registry.ts` keeps a bounded set of painting meshes so
  Player aim/click raycasts don't traverse the entire scene.
- `texture-cache.ts` is module-scope so it survives the Canvas remount
  used to recover from WebGL context loss. **Don't** initialize it
  inside a component or hook.
- The Grand Hall (spawn and floor-teleport room) is composed, not
  filled: [`grand-hall.ts`](src/lib/gallery-layout/grand-hall.ts)
  hangs the floor's largest high-resolution works in mirrored,
  height-matched pairs, biggest pair beside the stairwell door. Its
  candidates are picked before `selectFloorWorks` samples the era, and
  `distributePaintings` skips the hall so spill can't break the
  symmetry. A floor with fewer than 4 composable works falls back to
  the ordinary hang. Both works of a pair hang in one frame
  (`pickPairDesign`), drawn from the looks both schools hang in, each
  weighted by how well it suits both pictures. Two schools with no look
  in common keep the lead's own design. The hall frames for its wall
  colour and keeps to one family of finishes like any room
  (`roomHanging` over its whole pool, before a pair is chosen, because
  a pair's frame decides the wall the pair claims). The placements
  carry the frame as `Placement.frame`; without one the renderer uses
  `pickFrameDesign`.
  The slot's wall and lift come from that same frame, so read
  `Placement.frame` wherever a hall work's reach matters.
- A room has fittings besides its four walls: a ceiling height,
  freestanding divider walls and benches
  ([`fittings.ts`](src/lib/gallery-layout/fittings.ts)). They are
  planned from the room's footprint and the doors it has when all 24
  slots are open (`fittingsFor` in `layout-museum.ts`), so a room is
  fitted the same on every storey and its wall can be counted before a
  floor's doors are wired.
  - **Ceiling.** `RoomLayout.ceilingHeight`: 4.6 m when the narrow side
    is 10 m, 6.6 m when it is 17.5 m or more, 5.6 m between and in the
    stairwell ("How high things are", below). Walls still run to the
    slab above; the height sets the ceiling plane, the laylights and
    where the picture lights hang. The hang keeps 1.4 m under the
    ceiling, so even a 4.6 m room takes a work to the 3.2 m cap.
  - **Dividers.** `RoomLayout.dividers`: segments on grid lines, drawn
    0.4 m thick (`divider-geometry.ts`) and planned in
    [`divider-plans.ts`](src/lib/gallery-layout/divider-plans.ts). A
    room is divided in one of six ways (`DividerStyle`):
    - `rows`: panels either side of the room's axis, stopped where a
      side door looks across. One 7.5 m panel, or two of 5 m;
    - `long-rows`: the same rows with panels of 7.5 and 12.5 m;
    - `bays`: pairs of wing walls with the middle left open;
    - `staggered`: single wing walls from alternate sides;
    - `pinwheel`: four panels, each a quarter turn from the last, in a
      room 22.5 m or more both ways;
    - `cross-rows`: rows along the room's other axis.
    The plan names a style for each room: `SLOT_STYLES` in the tower,
    `BLOCK_PLAN[].styles` in the block plan. A room not named, or named
    a style it has no place for, takes rows when it is a hall (17.5 m
    both ways) and bays when it is a long room (17.5 m or more, and 1.4
    times its width). The Grand Hall gets none. Until 13 October 2026
    every hall had the same four panels and every long room the same
    paired wing walls, and Rico found it repetitive: both plans' tests
    check that two neighbours are not divided alike.
  - **Door screens.** A wall 2.5 m inside a door and parallel to it,
    5 m long, or 2.5 m in front of a 1.4 m door in a wall under 15 m.
    `Divider.bare` names the face toward the door, which hangs nothing.
    That face is drawn darker than the room's walls (`screenShade` in
    `wall-light.ts`): nothing casts a shadow, so in the wall's own
    colour it and the wall the door is cut in were one surface, and the
    door read as walled up. Rico, 13 October 2026: the screens "look a
    bit bad because they have exactly the same color". The step is 0.06
    of lightness (the cube root of luminance), which is 0.56 of the
    light on midnight blue and 0.82 on cream: one factor would take a
    smaller step off a deep wall than off a pale one. The screen's ends
    and its hung face keep the wall's colour. The back is its own
    geometry and material (`PaletteMaterials.screen`): one draw call
    more in a room with a screen.
    The face toward the room takes one picture, the largest of the
    room's works that fits it, hung on the middle of the screen
    (`hangFeatures`, `WallRun.feature`). A room of small sheets has no
    work that holds 4.4 m alone and hangs the screen like any wall. The
    plan names each screen by its room and the room its door leads to:
    `SLOT_SCREENS`, `BLOCK_PLAN[].screens`. Before adding one:
    - never in front of a portal, never on both sides of one door, and
      only where 12.5 m of room lie behind the door;
    - in the tower a slot is fitted once for every storey, so a screen
      goes only at a door to a slot that opens no later than its own
      (`SLOT_STAGES`). At any other door it would stand in front of a
      blank wall on the storeys that open fewer rooms;
    - a door stands in the middle of a cell, so a 5 m screen ends on
      half lines. `writeDividerEdges` blocks whole cells only; the rest
      is the collider and `clearOfFittings`;
    - a screened door has no line of sight to keep. A row runs on past
      it, and the door in the wall opposite looks at the screen's
      picture. No other divider stands in an open door's line of sight;
      `layout-museum.test.ts` checks it on a floor with every room open;
    - two walls keep 5 m apart face to face, 2.5 m end to end in one
      line and 3.75 m corner to corner (`clash`). A row or a wing wall
      that would stand nearer a screen is left out.
  - A divider is four things, and a new one needs all four:
    1. blocked cell edges, written by `writeDividerEdges` after the
       room-ownership pass, which leaves edges inside one room free;
    2. a collider at its real thickness (`addFittingColliders`), since
       the edge mask alone stops the player 0.1 m inside the plaster;
    3. two runs in `computeRoomRuns`, one per face (`WallRun.divider`,
       `Placement.divider`; one run for a screen), and a cut in the room
       wall a wing wall is built off. `dividerWallMetres` counts them
       when a floor decides how many rooms to open: the tower went from
       116 rooms to 96;
    4. a wall for the picture light: `wallContextFor` takes the
       divider's face, so the pool stops at its ends.
    Laylights are cut where a divider reaches under them
    (`laylight-layout.ts`). Each sits 10 cm up in a hole in the ceiling
    with a plaster reveal round it (`RECESS_M`, `ceilingAround` in
    `laylight.tsx`); Rico asked for 5 to 10 cm on 17 October 2026.
  - **Portals.** The doors between the rooms of the stair column
    (`Door.portal`, 3.5 × 3.0 m; every other door is 1.4 × 2.4 m). A
    door centre sits mid-cell, so a portal opens three cell edges
    (`doorOpenHalfSpan`) and is narrower than the three cells: the
    physics world closes each jamb with a collider, and
    `fitsDoorwayApertures` does the same without one. A portal costs
    the Grand Hall's front and back walls 2.1 m each, so the composed
    hang takes smaller second pairs there, or none (Baroque: 8 works,
    12 before).
  - **Benches.** `RoomLayout.benches`, modelled in `bench-geometry.ts`.
    They follow how the room's walls are set out (`arrangementOf`): one
    in each bay between wing walls, two facing the panels of a room of
    rows, an island of two back to back in any other room 15 m or more
    across, two islands in the Grand Hall. A door screen seats nothing,
    and no bench stands within a metre of one. None stands in the
    walking line between doors; a screened door has none. A bench is smaller than a cell, so it is in no edge
    mask: it is a box collider, and `clearOfFittings` in
    `canAcceptPhysicsMove` applies the same rectangle when the physics
    world has not loaded.
  - A bench can be jumped onto and over. It is a wall while the feet are
    under the seat (`clearsBenches`, 0.45 m less a 5 cm step) and ground
    once they are not. A jump lifts the feet 0.82 m. Three places apply
    that one height, and they must agree:
    1. `GalleryCollisionController.move` leaves the bench colliders out
       of the cast. The collider stays 1.5 m tall: at seat height the
       capsule's round end meets it on the curve and the controller
       rides up it without a jump.
    2. `clearOfFittings` takes `overBenches` and then tests dividers
       only.
    3. The player's vertical step stands the body on the seat where
       `benchUnder` finds a bench under it. The seat is not a collider:
       the physics world only answers horizontal moves.
    The feet height is read at the start of a frame, before the eye
    height is damped. Read after it, getting up from a crouch puts the
    feet under the seat and the body drops into the bench. The seat
    carries a body out to one radius (0.30 m) past its edge, less than
    the 0.32 m the collider keeps a walking body off, so a jump in
    place beside a bench lands on the floor.
    Nothing stops a jump at the ceiling. Off a bench on tiptoe the
    camera reaches 3.42 m and the lowest ceiling is at 4.6 m; a ceiling
    under 3.6 m would need a clamp.
  - A bench can stand on a room's centre, so nothing sends the player
    to a raw room centre: use `arrivalPoint`.
  - Dividers and benches are part of `galleryLayoutIdentity`. Change
    where they stand and every saved visit restarts once in its floor's
    Grand Hall.
- **Jump has one code path.** `jump()` in `player.tsx` checks `enabled`
  and `grounded`. The Space key calls it, and the touch HUD's Jump button
  calls it through `PlayerHandle`, the Player's `ref`. The button stands
  above the look stick and is placed from that stick's position
  (`LOOK_STICK_AT` in `index.tsx`) and the knob's throw (`JOYSTICK_REACH`
  in `use-joystick.ts`). A touch control is a sibling of the canvas: a tap
  on it must not reach the canvas's `pointerdown`, which opens the work
  under the crosshair.
- **The museum is the block plan** (`/gallery-3d`,
  `src/lib/gallery-layout/layout-block.ts`) since 17 October 2026. The
  tower before it is behind `/gallery-3d?plan=tower`, and its code stays
  (tag `museum-tower-default-2026-10-17` is the last main with the tower
  as default). `precomputed.ts` and `/gallery-3d/plan` show the block
  plan; `build-museum-screenshots.mjs` walks the tower. One rectangular
  block, 117.5 × 62.5 m, on four floors, the same plan on each. Down
  its middle runs a spine of five bays: a stair hall 27.5 m wide and
  20 m deep at each end, a court 27.5 m square in the centre, and a
  gallery of 17.5 m between each pair. A stair hall's end wall stands
  three cells inside the building's end wall; the strip between is no
  room (`cellOwner` -1, not walkable). North and south of the spine a range runs
  the length of the block: a long gallery (47.5 × 17.5 m), a stair
  tower (22.5 × 17.5 m) beside the court, a long gallery. So a floor is
  six galleries (`BLOCK_ROOMS`), two stair halls and the court
  (`BLOCK_HALLS`) and two spiral rooms (`BLOCK_SPIRALS`). The galleries
  take the tower's dividers and benches. A floor holds two or three
  eras, each in rooms that touch or stand either side of a stair tower
  (`BLOCK_PLAN[].zones`). What follows from it:
  - **Four stairs, each in the same place on every floor.** Rico, 13
    October 2026, of the plan before (a hall at the centre and both
    ends of the spine, one stair to a hall, each between another pair
    of floors): the staircase "should be at the end and not in the
    center of the building", one "at either side", the spirals "at the
    top and bottom"; the stairs "don't 'stack' on the same levels
    neatly"; and "something like a 'gallery' from above" is worth
    keeping. So:
    - a grand stair at each end of the spine, on every storey, one over
      another (the loggia, next point but two);
    - the tower's spiral north and south of the court, through every
      floor, its first step toward the court's door (`entryAngle`);
    - the court has no stair. It is where a visit starts and where a
      visitor sent to a floor lands (`GREAT_HALL`, `isAnchor`).
    From the court's floor one axis ends in the two grand stairs and
    the other in the two spirals.
  - **A stair hall has three doors, on every floor: the portal of the
    spine, which its stair's foot faces** (`hallFront`), **and one in
    each side wall** (`HALL_SIDE_DOOR`). Rico's verdict on the plan
    with three halls wall to wall, 13 October 2026: two stairs stood in
    adjoining rooms, and the rooms were "accessible from their
    backs/sides". So:
    - no two halls share a wall. Keep a gallery between them;
    - no door behind the stair or into its flights. The side doors
      open from the gallery beside the stair into the long gallery
      behind the side wall, 11.25 m in from the front wall, by the foot
      of the side flight. Rico asked for them on 17 October 2026,
      pointing at the bare wall between Liberty and the balustrade that
      then ended the side gallery: "here should be a door for the stair
      ways". Until then a hall had the portal only. The door splits the
      side wall in two stretches, one pair of works each
      (`stairHallHang`), and the
      long galleries were divided and seated again for the new door:
      54 benches where there were 61;
    - a room in a corner of the block would then have one door. That is
      why each range is two long galleries and not five rooms.
      `layout-block.test.ts` fails on a gallery with one door;
    - a long gallery meets the court at one cell, in the court's
      corner. Two rooms get a door when they share three cells of wall
      (`MIN_SHARED_CELLS`);
    - a stair hall does not have to be a room of the grid. Rico: its
      size "doesn't have to match the other parts of the building" as
      long as the way in and out makes sense. The halls are 27.5 m
      wide because he found 22.5 m cramped, and 20 m deep since
      17 October 2026, when the end wall moved onto the landings. A grand stair's frame is the square its front
      wall makes (`half`); `back` is how far its end wall stands from
      the centre.
  - A floor there holds several eras, so read a room's era through
    `eraOfRoom()` and a floor's name through `floorTitle()`
    (`room-era.ts`), never `ERAS[room.floorIndex]`. `FloorLayout.era`
    is the floor's first: the id a saved visit is filed under.
  - **Walls there are two-sided.** A room that carries its own era
    draws all four of its walls with `wallInside`, a front-side-only
    material, and ignores `suppressWalls`; its neighbour does the same
    from the other side. The two planes lie on one line and face
    opposite ways, so there is no z-fight and each room is its own
    colour. In the tower a shared wall is one two-sided plane.
  - **A floor has two spiral wells.** `floorShafts()` in
    `spiral-physics.ts` groups a floor's flights by centre;
    `findStairAbove` / `findStairBelow` stay within a well. The floor
    slab's colliders, the cutout rail, the gate signs and the stair
    room's light are all built once per well. Do not reach for
    `floor.stairsOut[0]`. A spiral's room is `isStairwell` with
    `floorOpening` unset; a hall's is `isStairwell` with it set. The
    player tries the spiral first and a hall after it, so the two never
    answer for one point.
  - **The stair halls are loggias and the middle hall is a court**
    ([`grand-stair.ts`](src/lib/gallery-layout/grand-stair.ts), drawn
    by `grand-staircase.tsx`). They are in `FloorLayout.grandStairsIn`
    / `grandStairsOut` / `grandHalls` and `MuseumLayout.grandStairs`:
    three stairs to a stair hall, and one object with no flights for
    the court. Before changing one:
    - **A loggia** (`design: "loggia"`) is the imperial stair on every
      storey: one flight up the middle to a half landing, two back
      along the sides, each storey's over the last (`hasFlightAbove` /
      `hasFlightBelow`). It stands in the front of its hall, a lobby
      6.25 m deep between the door and its foot on every floor
      (`LOGGIA.lobby`). A side flight arrives on the lobby and the next
      middle flight leaves from it. Each half landing is 16 m wide and
      6.95 m deep and runs back to the end wall, which carries it: no
      void behind it and no piers. The opening in each floor is the
      stair's footprint, from the end wall to the lobby, and touches
      the wall (`StairOpening`; the floor and ceiling round it are
      built from rectangles). On every floor a gallery 5.75 m wide runs
      beside the stair from the lobby to the end wall. The lowest
      landing is masonry to the floor (`FlatPatch.solid`), as its
      middle flight is. The end wall's middle 16 m has a landing in
      front of it and no floor (`RoomLayout.endWall`): its skirting
      stops where the opening meets the wall, and its washers hang a
      ceiling's height over the landing, under the next one. Over the
      top landing that is mid-air, so those cans hang on stems from
      the roof.
    - **Why the end wall stands on the landings.** Until 17 October
      2026 the void behind the landings ran on to the end wall, 11.45 m
      deep, and that wall stood sheer for 24 m with the largest works
      up to 21 m over the floor. Rico: "this space is still a bit meh".
      The same day the wall moved in a cell, with a void 3.95 m deep
      behind the landings, a gallery 5 m deep along the wall on every
      storey and four piers under each landing's far edge. Rico,
      standing on a landing: the middle section "pushed further out",
      the wall "brought to touch that stair case floor", the columns
      removed or spaced to frame one or two works, so that works hang
      "all the way along" the wall from the landing up. Hence the 20 m
      hall and the deep landing. A visitor on it stands up to 6.95 m
      from the wall, and the wall is clear for 8.1 m to the next
      landing's underside.
    - **Why the void is beside the stair.** The first build stacked a
      stair of every storey in three halls 22.5 m square, cut only to
      the stair's footprint. Rico found the halls cramped and low: the
      stair reached to within 3.3 m of the walls and the soffit of the
      next stair hung 5.8 m over every flight. The plan after it gave
      each hall one stair with the hall open over it, and he found
      that a stair in another place on each floor reads worse. In a
      loggia a flight has the next one 8.1 m over it (5.8 m while the
      storey was 6.12 m); the hall has its height behind the stair,
      and every half landing looks into it. `arcs` and `hourglass` and the single `imperial` are
      still built and tested; no plan uses them.
    - **The court** (`design: "court"`) has no patches. Its one object
      runs from the first floor to the top (`topFloor`): floor from
      wall to wall on the first, a gallery 5 m wide round a square
      opening on each floor above (`HALL_GALLERY`), a portal in every
      wall. The player does not treat it as a stair to load ahead for.
    - **Walkways cross the court's void** (`GrandStair.bridges`), 3.5 m
      wide, from a portal to the one opposite. Rico asked on 17 October
      2026 for walkways "connecting the sides" of the court: one a
      floor, north to south on the second and fourth floors, east to
      west on the third (`CourtBridges` "alternate";
      `/gallery-3d?bridges=none` shows the open void). A cross on every
      floor and a cross on the third floor alone were built and shown
      him the same day, and he chose this: "I want no crosses." Never
      put two walkways on one floor. A walkway is floor: `openingOn(stair,
      floor)` is the void less that floor's walkways, and the room's
      `floorOpening` / `ceilingOpening` are built from it, so the deck,
      its soffit, the fences and what the player may stand on all follow
      from the one list. Every fenced edge of the court has a stone beam
      under it, 0.75 m deep (`StairRail.beam`), the gallery's edge
      included. Over the top floor's walkway the laylight is two panes.
      Not in `galleryLayoutIdentity`: a pose saved on a walkway and
      restored with another pattern stands over the void.
    - **A grand stair has no state.** It is a list of surfaces
      (`patches`): each a piece of plan with a height over it. Where the
      visitor stands is the highest surface no more than 0.4 m above
      their feet (`grandSurfaceAt`), hall floors, galleries and
      balconies included. A move is allowed when it ends on one
      (`grandMoveAllowed`). The spiral's cumulative angle, its landing
      tolerances and its floor-swap arcs have no counterpart: the rule
      does not ask which floor is current. The floor follows the
      visitor's height (`grandFloorFor`), past the half-way point and
      not on it.
    - A design is drawn in the hall's own frame, the visitor coming in
      from +z and the first flight rising toward -z, and turned by
      `turns` to face the hall's portal. Physics turns the point
      (`toStairLocal`), the renderer turns the group. Keep both.
    - The lowest stair of a hall is masonry to its floor (`solid`): no
      floor under its middle flight. The hall floor is walkable under
      any flight or landing with 2.3 m of headroom, so a visitor walks
      past the stair on the first floor into the hall behind it.
    - Rails are colliders, one short box per 0.7 m at its own height,
      because the capsule is put at the feet's height each frame. The
      floor collider's hole is 0.4 m wider than the opening: a visitor
      on a flight along the opening's edge passes the slab at shoulder
      height.
    - `RoomLayout.floorOpening` / `ceilingOpening` are the holes in a
      hall's floor and ceiling (`null` for none). Unset means a
      spiral's stairwell, cut round by rule. The top floor's ceiling is
      closed and glazed: a laylight over the void.
    - **A stair is cut off at its hall's walls** (`WALL_CLEAR` in
      `grand-staircase.tsx`). A wall is a plane with no thickness, and
      the room behind draws its own on the same line. A sheer hall's
      gallery fence ends at the side wall, and the post there is
      centred on the wall line. Until 13 October 2026 the 12 such posts
      of the loggias each stood 22 cm into the long gallery next door.
      Every box of a stair goes through `Solid`, which stops it 2 cm
      inside the wall, and 2 cm inside `back` toward the end wall. A
      part of a hall drawn another way has to stay inside the wall
      lines itself.
    - A hall's centre is a flight or the open well. Send a visitor to
      `blockArrivalPoint()`, never to the room's centre: the floor
      keys, the map and a restored visit all use it. It answers for the
      tower too.
    - In a hall the visitor counts as on its stair (`activeStairId`),
      on a flight or not, on any floor of it. The floor above and the
      floor below are then mounted in full (`activeHallFloors` in
      `index.tsx`: the floors of every stair that stands in that hall),
      and every floor's halls and stair rooms always are: a hall shows
      four storeys at once. The galleries of those two floors keep
      their stand-ins ("Works in full take the texture pool", below).
      One of them mounted alone has a blind in
      each door to a room that is not (`mountedRooms` in
      `room-geometry.tsx`), or its doors would open on the scene's
      background. The floor's mirror pass runs in a hall as in any
      room ("A room's light is the room's", below). Measured headless on
      an M5 at 2560 × 1440, room culling on: 90 to 140 draw calls in a
      stair hall, 290 to 610 in a gallery, 1,020 to 1,180 in the court,
      which shows sixteen doors. The mirror pass adds 80 in a stair hall
      and 270 in the court.
  - **A baluster is turned, and stone is shaded by the way it faces**
    (`grand-staircase.tsx`). Nothing in the scene casts a shadow. With
    one tone for every upright face, a square post's two visible faces
    matched and a balustrade read as a paper cut-out (Rico, 13 October
    2026: the architecture's depth "is not coming through" in the
    posts). Now a face that looks sideways takes its share of the light
    by compass direction, 0.70 to 0.92 (`faceShade`, `SIDE_LIGHT`). The
    light comes along the hall's x axis, so risers, which look along z,
    stay under the treads. A baluster is a block, a neck, a belly and a
    taper (`BALUSTER_PROFILE`), dark at its foot and darkest under the
    cap. 48 triangles each, about 50,000 a stair hall.
  - **The room places the bench, and the bench places the work**
    (`feature-benches.ts`, and `anchorToBenches` in
    `place-paintings.ts`). Rico asked for both at once on 13 October
    2026: benches "aligned with the rooms proportions and with the
    images". So the order is fixed: dividers, then benches, then the
    hang.
    - `planBenches` seats a room from its footprint and doors. It was
      made for the tower's 1.4 m doors: here it seats the rooms of wing
      walls, bay by bay, and nothing with panels, where its nave benches
      come 5 cm too near a panel. A bench of its that stands within
      2.2 m of a divider is left out, and so is any bench with less
      than 4 m of floor to a wall of its room (`BENCH_WALL_FLOOR`): the
      end bay of a long gallery is 7.5 m.
    - A room with panels takes benches in line with a row of panels, in
      the middle of a gap between two of them, and in the middle of an
      aisle 8 m or more wide, opposite a panel (`planPanelBenches`).
      Never in the line of a door in the wall beside it. A place counts
      only where the bench looks at a wall or a panel within reach
      (`benchAnchors`).
    - `centredIsland` and `wallIsland` seat a room with no walls but a
      door screen. The plan has none today: every gallery is divided.
    - The two galleries of the spine have a door in all four walls. In
      rows, every line of their panels is one of two walking lines.
      They are seated where their walls leave a place: one of the eight
      has no bench.
    - **A door screen has a bench square in front of it**
      (`screenBenches`), parallel to it, on its middle, 3.5 to 4.5 m
      from its face, so the bench looks at the screen's one picture.
      Rico, 17 October 2026, of the American gallery, where the
      Washington Family hung on the screen and the benches stood in
      line with the panels beside it: he wanted a bench facing "the
      divider wall with a nice big image on it". A bench may stand in
      the line of the door behind the screen and of a door opposite
      that looks at it: the screen already stands across both. Any
      other bench within 6.5 m of it is left out (`SCREEN_BENCH_ROOM`);
      at 4 m the two read as a waiting room. All 12 screens of the plan
      have their bench.
    - The hang gives each door screen its one picture first
      (`hangFeatures`). Then it finds what each bench looks at: the
      nearest wall or panel face square in front of it and behind it,
      within 9.5 m (`benchAnchors`). It hangs the room's largest works
      there, each centred on its bench, cuts the run in two either side
      of the work, and hangs the rest of the room on what is left
      (`hangForBenches`). On 13 October 2026 all 61 benches of the
      galleries had a work centred on them. There are 54 since the
      stair halls' side doors (17 October); not recounted.
    - The court's first floor has four islands of two (`courtIslands`),
      one in front of each stretch of its north and south walls, 6.5 m
      off the wall and beside both lines between its doors. The giant
      of a stretch hangs with its canvas on the stretch's middle
      (`stretchMiddle`), so each island has one centred on it. The
      floors above are a gallery 5 m wide and have no seat.
    Two earlier passes were walked and thrown out that day. A bench in
    front of each large work, at the distance to see all of it, landed
    in the 5 m aisle between a panel and the wall. A bench on the
    room's lines with the hang left alone had no work behind it. Do not
    place a bench from a work's position, and do not move a bench
    without the hang. "Largest" is by hung area: the listing has no
    measure of how well known a work is. The tower uses none of this:
    `distributePaintings` anchors only when asked.
  - Every band of the plan is an odd number of cells, which puts each
    door in the middle of a cell. The collision grid needs that. Room
    doors are 2.4 m, one cell edge, so they need no jamb colliders. The
    grid is 47 × 25: `computeBlockedEdges` takes `{ x, z }`.
  - **A long gallery in rows has a row of panels down each side of its
    nave.** `rows` (`divider-plans.ts`) set one panel in a stretch of
    hall no door looks across, however long. A stretch of 12 cells or
    more takes as many as fit, a panel's length apart
    (`PANEL_ROW_MIN_CELLS`). The tower's longest stretch is 7 cells.
  - **No two rooms that share a door are divided the same way**
    (`BLOCK_PLAN[].styles`), and each floor has three door screens
    (`BLOCK_PLAN[].screens`): see "Dividers" and "Door screens" above.
    A long gallery and the gallery of the spine it opens into are rows
    beside wing walls, or rows of another length, and a floor has four
    arrangements or five. No room of the plan is large enough for a
    pinwheel now: that was the square under a stair hall. A style is
    the plan's wish: a room with a screen at a side door has no place
    for paired wing walls and falls back to rows, so look at the plan
    after naming one.
  - An era is hung on its own (`hangZone`): the placer is given only
    its rooms, so spill cannot carry a work into another era. An
    artist's share of the wall goes to their sharpest scans
    (`selectFloorWorks` with a rank).
  - **An era's rooms fit its works.** Rico, 13 October 2026: "Rooms
    shouldn't read as sparse and room layout/sizes should fit the number
    of images that there are." Every era covers its wall to within 0.02
    of the plan's share (0.475, 0.40 for the two floors of prints), and
    every room to within 0.04. `block-fit.test.ts` holds the plan to
    that against the real catalogue. Three things do it:
    - `zones` names an era's rooms, and `styles` sets how much wall a
      room has: a long gallery is 153 m staggered, 184 m in bays and 187
      to 194 m in rows; a gallery of the spine 89 to 128 m. The Gothic
      era has 69 works sharp enough to hang, 86 m of them. In three
      rooms of an earlier plan they covered a third of the wall and
      read as a collection with works missing. It has one long gallery
      now, `sw` in long rows with a door screen: 173 m, 0.45. An era
      that grows or shrinks gets other rooms or other walls. Do not
      leave it thin.
    - `hangZone` takes works until the sample covers the wall. It took
      a count from the era's mean footprint, and an artist's sharpest
      scans are their smaller works: two eras with over twice the works
      they needed covered 0.38.
    - `fillRooms` deals each room to the nearest work ("Where in a
      room a work hangs").
    The tower's Gothic floor is the same 69 works in four rooms and is
    not fixed: 0.21 to 0.23 in the three that are not the Grand Hall.
    One room fewer is not possible there (rooms open in mirrored
    pairs), and the one room behind the stair alone would be at 0.69.
  - It hangs 1,481 works (17 October 2026): 1,339 in 24 galleries, 66
    in the court and the stair halls, 28 in the salon and 48 in the
    spiral rooms, 46 of them tall works ("A spiral room's storeys hang
    tall works", below). Each corner of the block is part of a long gallery, which has less
    wall than the rooms it could be: the plan before hung 1,726, 1,663
    of them in 43 rooms.
  - **Works in full take the texture pool, nearest room first**
    ([`reveal-budget.ts`](src/lib/gallery-layout/reveal-budget.ts);
    `useRoomWorks` and `RoomReveals` in `room-geometry.tsx`). The rule
    holds for the tower too; this plan is where it was found. A work in
    full pins its 480 px base texture, 1.3 MiB on average, and the base
    pool is 256 MiB: about 200 works. A room comes into reach 14 m off
    on the plan and stays until 34 m. On 13 October 2026 the rooms in
    reach hung more than the pool holds, on both plans:
    - a hall mounts the floor above and the floor below in full, and
      reach is measured on the plan. From the court's gallery on the
      third floor 670 works were in full, from a stair hall there 562;
    - from the middle of a floor every gallery of it is within 34 m, so
      a floor that had been walked stayed in full: 437 works from the
      first floor's court, 300 on the tower's Natural History floor.
    The pool evicts what was touched longest ago, and the LOD tick
    touches the works in full in the order they mounted. So the first
    textures to go were those of the room the visitor stood in: of 411
    works in full where a visit starts, 193 textures were in the pool.
    Nothing loads an evicted base again. three.js uploads it once more
    when it next draws it, outside the pool's count. What bounds it now:
    - **A gallery shows its works in full on the visitor's floor only**
      (`worksInFull`), and on the floor a spiral is taking them to. A
      hall shows its works from every storey.
    - **The rooms in reach are ranked once a frame, and take 85 % of
      the pool in that order** (`REVEAL_BYTE_BUDGET`, 217.6 MiB). The
      rest keep their stand-ins. A room that does not fit is passed
      over for a smaller one further off. The other 15 % is for the
      256 px previews of works still loading and for what a room just
      gave up.
    - **Rank** is distance on the plan plus height. A room with no door
      to where the visitor stands counts 14 m further (`DETOUR_M`):
      where a visit starts, the two galleries of the spine, seen through
      the court's portals, come before the long galleries behind its
      south wall. A room in full counts 3 m nearer (`HOLD_M`), so two
      rooms that vie for the last of the pool do not change places
      while a visitor paces. The storeys of a hall rank as one room, by
      distance alone: its giants cross the storeys and all of them
      together cost less than one gallery (40 MiB for the court and a
      stair hall).
    - `RoomReveals` measures every room from one camera position. When
      each room measured itself in its own frame callback, the frame
      after a floor key ranked half the rooms from the old place, and a
      room that fitted was denied and gave its works up.
    - A room that loses its place gives its works up 8 a frame
      (`STAND_INS_PER_FRAME`): it can lose it a few metres from the
      visitor.
    Before raising a room's works or its size, look at what its works
    cost (`roomRevealBytes`). The visitor's own room is granted whatever
    it costs, and `reveal-budget.test.ts` fails on a room over the
    budget. The largest is the fourth floor's north-west gallery: 83
    works, 155 MiB. A tower room and the rooms its doors lead to always
    fit together (215 MiB at most, Natural History west). The galleries
    of the spine, with four doors each, do not: the fourth floor's west
    one and its neighbours cost 330 MiB, and one of its two long
    galleries keeps its stand-ins. On a spiral here the floor above
    takes the pool from the floor below in the last quarter of the
    climb; in the tower the rooms off the stairwell fit on both floors.
    Do not raise the pool to make room.

    At rest on 13 October 2026 (`?debug`, headless, 1600 × 900), works
    in full before → after. After, each had its base in the pool at
    every pose (`paintings registered N · base in pool N`). Before, the
    pool held 140 to 206 textures wherever more than 200 works were in
    full, previews among them:
    - first floor: where a visit starts 411 → 144, the court's centre
      411 → 144, a stair hall's lobby 376 → 144, a long gallery 148 →
      148, the court after a walk round the floor 437 → 148;
    - third floor: where a visit starts 670 → 177, a stair hall's lobby
      562 → 183, a long gallery 146 → 146, the court after a walk round
      the floor 184 after;
    - tower: where a visit starts 50 → 50 (83.6 MiB both times), by the
      Natural History stairwell 213 → 124, its Grand Hall after a walk
      round the floor 300 → 95.
    `window.__galleryReveals()` lists each room's claim and the works
    in full that have no base in the pool. The court's middle is open
    over the first floor: a camera set there on another floor falls to
    the first, and the reading is the first floor's.
  - Changed on the way. `?plan=wings`, 12.5 m galleries in rings round
    a salon, 44 rooms a floor: rooms too small, too many, no dividers,
    too few doors between them. Then this block with its three stair
    halls 40 m apart on the long axis and the stairs stacked (tag
    `museum-block-stacked-stairs-2026-10-12`): see "Why the void is
    beside the stair", and a hall was a room on the way from one
    gallery to the next. Then the three halls wall to wall in the
    middle of the block, inside a ring of twelve rooms, a door in all
    four walls of each (tag `museum-block-core-of-three-2026-10-13`):
    see "A stair hall has one door". Then a hall at the centre and both
    ends of the spine, one stair to a hall, five rooms to a range
    joined differently on each floor (tag
    `museum-block-spine-of-three-2026-10-13`): see "Four stairs".
  - **Works too large for a room hang in the halls, at their real
    size** ([`giants.ts`](src/lib/gallery-layout/giants.ts)). A room
    hangs nothing over 3.2 m, so the Wedding at Cana (9.94 m) hung at a
    third of the size its plaque gave. Rico, 13 October 2026, of a
    Tintoretto 5.38 m tall: "it's supposed to be 4.65 meters by 5.38m".
    - A giant is a work with an audited size (`trustworthyRealSize`), a
      side over 3.2 m, and 400 texture pixels a metre at that size
      (`GIANT_MIN_PX_PER_METRE`). A room's works need 1,000. The largest
      have the least: Cana 412, the Coronation of Napoleon 418. Raise
      the number to 1,000 and 33 of the 70 go back to their rooms at
      the room's limit.
    - Candidates come from the era buckets, which hold only works sharp
      enough for a room (`bucketByEra`). 45 more works pass the giant's
      rule and fail the room's: Bosch's Garden of Earthly Delights, the
      Surrender of Breda, Sōtatsu's Wind God and Thunder God. They hang
      nowhere. Whether a hall should take them is Rico's call.
    - **One work to a stretch.** The first hang put every tall work on
      one wall, in two tiers 0.8 m apart, and two works on a stretch of
      a hall's storey. Rico: the big paintings "cluster too close
      together". A stretch is the wall between a door and a corner, or
      beside a stair; the work's canvas hangs on its middle.
    - A giant hangs on the floor of its era, in three passes
      (`hangGiants` in `layout-block.ts`). Each storey of a stair hall
      takes the largest work of its floor on the middle of its end
      wall, or first a work too long for any other stretch
      (`stairHallHang().axes`). The court then takes one work to a
      stretch (`hangHallStoreys`): in a room that is not full, the
      north and south walls fill first, then the west and east walls a
      stretch at a time, so walls that face each other hold alike, and
      what a full floor leaves over goes to the floors above, and to
      the ones under it last. The stair halls then hang pairs from
      what is left (`stairHallHang().pairs`, "A stair hall's storey is one
      composition", below).
    - A frame fits a storey up to 7.66 m (`STOREY_FRAME_ROOM`), and the
      wall over a landing up to 7.56 m (over the top landing, to the
      roof): every giant of the catalogue. The tallest is the Triumph of Frederick
      Henry, 7.49 m in its frame. That is why the storey is 8.4 m.
    - `Placement.giant` drops the picture light: the hall's washers
      light the wall ("A hall is lit by rows of wall washers", below). Every plaque hangs
      beside its frame with its centre 1.45 m over the room's floor
      (`PLAQUE_EYE`), whatever the height of the work: until 17 October
      2026 it hung beside the canvas middle, and a tall work lifted off
      the floor took it to 2.2 m. `Placement.plaque` moves it to the
      eye level of another floor (`dy`), sideways (`dx`), or leaves it
      out (`null`, a work with no floor in front of it at its own
      height). A work over a stair hall's landing has its plaque at eye
      level over the landing.
    - **Every frame in a hall starts 0.4 m over its floor or landing**
      (`seatedCenter` in `giants.ts`), whatever its size. Rico, 17
      October 2026, of a pair hung on the centre line of a canvas twice
      as tall beside it: "the images should start at the same height
      in those rooms". Before, a pair shared a centre line and a
      smaller work hung by `packRun`'s eye-level rule. The court, the
      stair halls, the spiral rooms and the salon all hang so; the one
      exception is the salon's work over its axis work.
    - All 71 giants hang (17 October 2026): 32 in the court, 34 in the
      stair halls, 3 in the spiral rooms and 2 in their era's galleries
      at real size (The Seven Works of Mercy, Heroes), which no pair
      took. A spiral room's giant is only what fits no stretch of a
      hall but an end wall (`fitsStretch`): the north spiral's outer
      wall is 22.5 m with no door. That is Les Nuages, whose floor's
      two end walls hang the other two Orangerie panels, and the
      Qingming handscroll, 11.86 m. Each hangs on its storey's axis
      (`stairHallHang(...).axes`, `ownFloor`). Since the salon's door
      cut the south spiral's outer wall, the Yangtze handscroll
      (11.15 m) hangs in the East Asian galleries (`must`).
  - **A spiral room's storeys hang tall works** (`hangTallInSpirals`,
    `tallSize`). Rico, 17 October 2026: "the spiral stair case rooms
    could also hold tall paintings nicely". Until then five of the
    eight storeys hung nothing. A tall work is 1.8 m or more at its
    trusted real size and 1.25 times as tall as wide: full-length
    portraits, altarpieces. The pass runs after the galleries, from
    the works they left, so it changes no gallery. A storey is hung as
    a stair hall's storey: the outer wall is the end wall, the wall
    toward the court the front, and a work hangs only on its own
    floor. The south spiral's outer wall has the salon's door, so it
    hangs a pair either side of it and no work on the axis (`Bay.end`
    null). It runs after the salon too, which took El Greco's
    Annunciation. 46 works on 17 October 2026, 6 to 9 a storey on the
    first three floors, among them Rembrandt's Prodigal Son, the
    Isenheim saints as a pair, Gainsborough's full-lengths and
    Whistler's White Girl. The top floor's eras have no tall work left
    over: the north storey keeps its handscroll and the south one
    hangs nothing. They are `giant` placements: washers, no picture
    light.
    - The tower has no such wall: its stairwell is one storey high
      between slabs. Giants hang there as before, at 3.2 m.
  - **The galleries hang at real size too.** Rico, 17 October 2026: the
    3.2 m limit "should still not apply" in the rooms, "I want the
    paintings in their real sizes". The block plan's hang passes
    `HangOptions.realSize` (`place-paintings.ts`):
    - A work with a trusted size (`trustworthyRealSize`) hangs at that
      size and is never shrunk to a wall. A run takes it only when it is
      long enough for the frame and plaque, and when the canvas is no
      taller than the ceiling allows: 5.2 m under 6.6 m (4.3 m under
      5.7 m until the storey grew on 17 October 2026). One that no
      wall of its era's rooms holds is left out of the era before the
      sample (`fitsSomeRun` in `hangZone`). The Last Judgment, 13.7 m,
      was such a work; it hangs in the salon now (next point).
    - A giant no hall and no spiral room took hangs first in its era's
      rooms (`must`), and so does every work the salon's rule admits and
      the salon has no place for (next point but one), at real size.
    - A work whose size is not trusted keeps the 3.2 m cap: nobody
      knows how large it is. Two hang so on the top floor, Kim
      Hong-do's Gunseondo (5.76 m in the catalogue) and Chen Rong's
      Nine Dragons (9.58 m). Both scans are another shape than the
      museum's size (3.5:1 against 4.3:1, 27:1 against 21:1).
    - Which works may hang in a gallery: the room's rule judges a work
      at 3.2 m (`sharpEnoughToHang`), and a work over 3.2 m the salon's
      rule admits (`salonSize`) hangs too, at real size.
    - The tower keeps the cap.
  - **The salon** (`design: "salon"`, `buildSalon` in `grand-stair.ts`,
    `hangSalon` in `giants.ts`). Rico, 17 October 2026, of the Last
    Judgment left out at its real size: "stuff like this is *exactly*
    what I want", and he asked for a room over more than one storey for
    such works. A hall 37.5 m square beyond the block's south front
    (grid rows 25 to 39; `BLOCK_GRID` is 47 × 40), four storeys high,
    entered from the south spiral's room on every floor (`SALON_DOOR`):
    the court's short axis runs on through the spiral into it.
    - A gallery 5 m deep runs along its front and side walls on every
      floor above the first; the side galleries reach the far wall. The
      far wall stands sheer (`RoomLayout.sheer`, depth 0). The same
      morning Rico found works hung high over a void "meh" in the stair
      halls, so only the far wall's middle hangs over a void: the axis
      work on the hall floor and one work by the same hand over it.
    - The long galleries beside it (`sw`, `se`) share 7.5 m of its
      front wall and have no door to it: a door there stood in the line
      of the door screen in front of their door to the spiral.
    - It has its own rule for a scan (`SALON_MIN_PX_PER_METRE`, 250: sharp
      from 4 m), so it reads the whole catalogue, not the era buckets.
      It takes what the halls left, largest first, after the halls and
      before the spiral rooms.
    - The hang (17 October 2026, 28 works): the Last Judgment on the far
      wall, the Creation of Adam 3 m over it, the Siege of Pskov and the
      Valley of Tears beside it; on each storey a pair on each half of
      the side walls and a pair on the front wall either side of the
      door. A pair is two works of like size (`PAIR_MAX_UNLIKE`), led by
      the largest work that has such a partner, so a work with no like
      partner hangs nowhere: Rhythm No. 1 (5.92 × 5.38 m) and the Two
      Willows (17 m).
    - 35 more works pass the salon's rule and have no place in it: works
      3.3 to 4.8 m wide that fail the room's rule (the Garden of Earthly
      Delights, El Jaleo, Wind God and Thunder God), the Two Willows and
      Rhythm No. 1. Rico, 17 October 2026: "let the 34 salon-eligible
      works that have no place in the salon hang in their era's
      galleries at real size". 34 do, the Two Willows on the long south
      wall of the third floor's south-west gallery. Rhythm No. 1,
      5.38 m tall, is taller than a gallery's 5.2 m and hangs nowhere:
      the spiral rooms, which take the tall works the galleries leave
      (`hangTallInSpirals`, given the same pool), have no work of like
      size to pair it with.
    - Below 250 px a metre, waiting on a larger scan: the two Slav Epic
      canvases, Grunwald, Tintoretto's Last Supper, Courbet's Kill of
      the Deer and the Saint Louis Water Lilies. The vault note
      `collection-of-beauty-giant-larger-scans.md` collects candidates.
    - Floor benches: two islands 13 m in front of the far wall, 4 m
      either side of the axis (`salonIslands`).
  - **A stair hall's storey is one composition about its stair's
    axis** (`stairHallHang` in `giants.ts`). Rico asked on 17 October
    2026 for the hall's works to be arranged "more beautifully and not
    as chaotic". Every work hangs on the middle of a stretch:
    - **End wall over the landing**: the axis work, hung from the half
      landing and seen from the foot of the stair. Beside it on the
      landing a pair, one on the middle of each part of the 16 m left
      over, not taller than it and at least 0.55 of its height
      (`FLANK_MIN_HEIGHT`). Both parts keep clear of the axis work's
      plaque, so they mirror each other. The axis works are 8.8 to
      13.1 m wide, so no landing has room for the pair today. The top
      storey has no landing of its own and no axis work: its wall
      there is the one over the landing below.
    - **End wall beside the landing**: a pair, one on each stretch
      between the landing's end and the corner (5.25 m), over the
      storey's floor.
    - **Side walls**: each split in two stretches. A pair across the
      stair on the halves nearer the end wall, then a pair on the halves
      nearer the door.
    - **Front wall**: a pair, one either side of the portal.
    A pair is two works of like size (`unlike`, at most 1.5 m apart),
    by one hand or of one era where the pool has such
    two (`kin`), and of the storey's own floor unless it has none alike
    (`AWAY_COST`). Nothing hangs alone where a pair belongs: a storey
    with too few works leaves both stretches bare. The East Asian and
    Impressionist floors have few giants, and their hall storeys hang
    three works.
    No plan has a sheer wall now. The support for one stays, for an
    imperial stair that asks for it (`GrandStair.sheerWall`) and for
    `RoomLayout.sheer`, which nothing sets: walls 4 mm inside their
    lines and `wallInsetOf(room)` for what lies on them, one-sided
    skirting left out where there is no floor (`SkirtingClip`), and
    washers that skip the sheer wall (`washedWalls`). A hole that
    touches a shape's edge does not triangulate, so a hall's floor and
    ceiling round an opening of rectangles are still built from the
    rectangles left (`rectsAround` in `stair-opening.ts`).
  - **A hall is lit by rows of wall washers, set out about its
    works.** Rico, 13 October 2026, of the halls as first hung: "a bit
    random stuff going on with the lights". One row to a wall stood by
    its own count: on the court's 27.5 m wall a can hung 0.84 m to one
    side of each work's centre. The first answer was wrong. It took
    the washers off every wall with a work and lit each giant from
    across the hall, by a pool that ended 0.9 to 1.8 m from its frame
    all round (`dbc2a56`). Rico the same evening: "the weird 'back
    lights' instead of the beautiful light cones that were there
    before". Now:
    - Every wall of a hall's storey has its washers, a row to each
      stretch between a door and a corner (`washStretches` in
      `stairwell-light-rig.ts`). A row is even about the middle of its
      stretch, or about the one work the stretch holds, so a giant has
      the same cones on either side of it.
    - **A row that ends at a corner is set out from the corner**: its
      end can stands `WASH_CORNER_GAP` (2.25 m) from it, on both walls,
      and the count is what puts the rest nearest 3.75 m apart, odd or
      even (`spanWashRow`). Until 17 October 2026 each row was set out
      from its own length, half a gap in from each end, and the two
      walls of a stair hall's corner had their end cans 1.5 and 2.5 m
      from it: the near can's pool was cut down the corner line beside
      a dim wall. Rico: "it looks broken". A court stretch now has three
      cans, the middle one over its giant.
    - A giant has no light of its own. Do not light a work by a glow
      that follows its frame: he read it as a back light.
    - A stretch lights the half of each door's lintel next to it. The
      shader adds a fragment's own can and one each side, so a stretch
      under 5 m lights itself only.
    - The tower's stairwell hangs nothing and keeps one row to a wall,
      and so does a spiral room with no work. One that hangs a work is
      washed a row to each stretch, like a hall.
    - A work's cans are one mesh (`PaintingLight`): a wide work in a
      room had two draw calls for them.
  - **A hall or a stair room is one colour through every storey**
    (`RoomLayout.paletteEra`, read through `paletteOfRoom`): the pale
    stone of the Gothic rooms. Before, each storey took its floor's
    first era, and a hall was four bands. The room's `era` is still the
    floor's, so the HUD names the floor.
  - **A loggia's floors are signed on two pylons at its foot**
    (`stairSignPosts` in `grand-stair.ts`, drawn by `GrandStairSigns`),
    the spiral gate's post and plaques: either side of the middle
    flight, midway to the side flights' heads, backed onto the
    balustrade between them, where no one walks. Both carry the floor
    above over the floor below, so the pair is symmetric. Each is a
    box collider. Signs name floors by `floorTitle`, on the spiral
    gates too; a name over 24 characters is set at 0.07 m.
  - Not built: ornament beyond balustrades, piers, carpet and lamp
    standards. The design, its sheets and Rico's
    reference photographs are in the vault notes
    `collection-of-beauty-museum-floor-plans.md` and
    `collection-of-beauty-museum-stair-references.md`.
- **How high things are, and what may hang.** Three numbers Rico set
  on 12 October 2026; a change to any of them changes
  `galleryLayoutIdentity`.
  - Ceilings (`world-coords.ts`): 4.6 m in a room 10 m wide or less,
    5.6 m as standard, 6.6 m in a hall. They were 3.4, 4.2 and 5.4 and
    felt low, then 4.0, 4.8 and 5.7 under a slab at 5.92 m. On
    17 October 2026 the storey went from 6.12 to 8.4 m
    (`FLOOR_SEPARATION`) so the largest works hang on one storey of a
    stair hall; Rico: "make all the rooms somewhat taller". The slab
    is now at 8.2 m. The spiral took 36 steps for it (0.233 m each, 26
    before) and a grand stair 52 risers (0.162 m, 40 before), the
    flights the same length.
  - `PAINTING_FLOOR_GAP` is 0.4 m, measured to the frame's bottom edge.
    A work's height cap is the ceiling less that gap and a metre for the
    frame's top rail and the picture light, and in the tower never more
    than 3.2 m. The block plan's galleries have no such cap (see "The
    galleries hang at real size too").
  - A work hangs only if its texture has 1,000 pixels for each metre of
    its hung width (`sharpness.ts`): sharp for a visitor a metre away on
    a 2,560 px screen. The widest texture is the 4096 rung, or 6144
    where that rung exists, and never more than the source. 353 of
    4,555 works fail (12 October 2026), most of them large canvases
    from small scans. Do
    not raise the threshold past 1,280: that is all a 3.2 m canvas has
    on the 4096 rung.
  - Dividers add wall to a room and do not count when a floor decides
    how many rooms to open (`roomWallMetres` in `layout-museum.ts`).
    Counted, they closed rooms and filled the rest: 30 works a room
    where it had been 25.
- **Where in a room a work hangs** (`place-paintings.ts`) is decided
  in two steps. `tryAssign` puts a work in a room, spill included.
  `evenOutRoom` then deals the room's works over its runs again:
  largest first, each to the run whose gap is widest. A run's gap is
  its bare wall divided by its works plus one, which is the spacing
  `packRun` hangs it at, ends included. Before changing it:
  - **A work keeps 0.5 m of plaster** to a door's casing, to a corner
    and to the face of a wing wall (`DOOR_CLEARANCE`, `WALL_MARGIN`),
    and a run under 1.4 m hangs nothing (`MIN_RUN_LENGTH`). Until
    17 October 2026 it was 0.35 m from the opening, which left 0.21 m
    to a portal's casing, and 0.3 m from a corner, and a 1.15 m pier
    between a portal and a wing wall hung a small canvas. Rico: "too
    close to the divider wall and also too close to the door frame".
    22 works of the block plan and 46 of the tower hung on such piers.
    The casing widths are `DOOR_TRIM` and `PORTAL_TRIM`
    (`world-coords.ts`), which `wall.tsx` draws. The tower opened 6
    rooms more for the wall it lost (108 → 114 galleries), and the
    block plan took 71 works fewer to keep its coverage, until its
    share went up to 0.475 and 0.40 (`BLOCK_WALL_COVERAGE`): the same
    works hang closer, a median gap of 1.22 m where it was 1.34 m. A door
    screen's face is 4 m now, and its picture is the largest that fits
    with its canvas on the screen's middle (`centredFootprint`).
  - Until 13 October 2026 a run took works by the share of its length
    they covered, and `packRun` stopped a gap at 2 m and centred the
    group. A long wall with a few works then stood bare for metres at
    each end, next to a 4.4 m panel hung at 0.8 m gaps. Beside a door a
    bare end read as a work taken down. On the block plan the widest
    bare stretch went from 5.7 m to 2.6 m, and stretches over 1.6
    times their room's median gap from 138 to 1. On the tower the
    widest went from 5.4 m to 3.3 m.
  - A run with nothing on it counts twice its length
    (`BARE_RUN_WEIGHT`). At 1 the tower left 44 panel faces bare
    beside hung ones. At 3, a room with as many runs as works hung one
    on each, and an 11.9 m wall had 4.9 m either side of its canvas.
    At 2 the tower has 18 bare runs: 15 under 1.5 m and 3 panel faces,
    where it had 18 bare panel faces before.
  - What is left of a run beside a work hung for a bench
    (`WallRun.abuts`) is a gap, not a bare run. Counted as bare, a 1 m
    sliver of a panel took a small sheet 10 cm from the bench's work:
    10 runs of the block plan hung that way on 13 October.
  - `evenOutRoom` deals every run of the room. A run whose works are
    set on purpose has to be kept out of it, as the works for benches
    are (`Container.fixed`).
  - It evens a room out; it cannot fill one. A room with too few works
    for its wall hangs thin all round, and that is the floor plan's to
    change (block plan: "An era's rooms fit its works").
  - Which room a work goes to is `fillRooms`: each room a share of the
    floor's works in proportion to its wall. A room stops at the work
    that brings the floor nearest to what its rooms so far are owed.
    Until 13 October 2026 each room stopped short of its own share and
    the last took the rest: the tower's Baroque floor ended with 0.71
    of the wall covered in its last room and 0.39 in the room that
    mirrors it (now 0.48 and 0.46), and a 17.5 m room of the block plan
    with 0.56.
  - **What `fillRooms` deals is in curated order**
    ([`curation.ts`](src/lib/gallery-layout/curation.ts)). Until 17
    October 2026 an era's works were shuffled by id hash and grouped by
    movement, so a room was a random draw from a wide movement: one
    Baroque gallery hung 17 artists of four countries, and two rooms of
    a floor were both "Baroque". Rico asked for rooms that "make sense".
    Now `curatedQueue` orders by school (movement and country:
    "Flemish Baroque", "Spanish Golden Age"), a country's schools
    together, countries and schools by median year, each artist's works
    together by date. Natural history goes by author. A room's sign is
    `roomTitle`: the artist with half its works, else the school with
    half, else a pair of schools, else the era. Duplicate signs on a
    floor are allowed (the `· Part N` suffixes were dropped earlier).
    The sampling and the wall budget are unchanged, so the coverage
    tests hold; `galleryLayoutIdentity` changed on both plans.
  - After `evenOutRoom`, `gatherArtists` swaps works of near-equal
    claim (within 0.25 m) between runs when that puts more of one
    artist's works on one run, and `evenOutRoom` prefers a run already
    holding the artist when its gap is within 0.8 of the widest. Runs
    an artist's works span in a room: block plan 2.66 → 1.97, tower
    3.24 → 2.76.
- **The map draws each room in its wall colour** (`mapFillOf` in
  `minimap.tsx`), with ink chosen for contrast (`inkOn`), and marks the
  visitor's room with a gold rim inside its walls, not a fill. Before
  17 October 2026 the fill was the floor tint brightened, and the
  visitor's room turned gold.
- **There are no three.js lights on the works, on purpose.** Each
  painting has a picture light (`painting-light.tsx`, geometry in
  `painting-light-rig.ts`): a ceiling can and the pool it throws, drawn
  as one shader quad on the wall and floor behind the frame, with the
  frame's shadow inside it. A real `SpotLight` per work would be priced
  into every wall fragment, and a floor mounts dozens of works at once.
  The quad multiplies what is already on screen, so:
  - the fill light (ambient + hemisphere in `index.tsx`, environment
    intensity in `room-env-map.tsx`) is kept low. Raise it and the pools
    clip to white on pale walls;
  - a pool is clipped to its own wall: doorways and room corners are cut
    out (`wallContextFor`), or it would brighten the next room seen
    through the door;
  - on the floor a pool fades to nothing within 1.5 m of a doorway's
    threshold (`THRESHOLD_FADE_M`, `thresholdFadeGlsl`), on whichever
    wall the door is. A pool stops where its room does, and in a doorway
    nothing hides the stop: it showed as a line across the floor from
    jamb to jamb, about 30 % brighter on the side with a work or a
    washer near the door. The stairwell's washers fade the same way.
    Anything new that lights a floor has to reach a threshold at zero;
  - frames, canvas and plaque sit in front of the quad and are not lit
    by it. The plaque card and the mat board carry their own emissive
    for that reason, and frame materials add the light themselves (see
    the frame maps below).
- **Bloom is per light, not a pass** ([`glow.ts`](src/components/gallery-3d/glow.ts)).
  Rico, 17 October 2026: the stair halls' lamp globes should look
  switched on, and lights generally want "a little bit" of bloom. A
  full-screen bloom would render the frame into its own target and
  change the output transform the mirror pass and the multiplied pools
  are matched to. So a light carries a camera-facing quad, drawn
  additively, pulled toward the camera by half its radius and faded by
  the fog. A lens glow has a direction and shows only from in front.
  The globes are an opal shader (white middle, warm rim, past tone
  mapping). Picture-light lenses are one batch for the scene
  (`GlowField`, `setGlows`): a mesh per work was a draw call per work.
  A stair's lamps and a hall's washers are one glow mesh each.
- **A room's light is the room's, never the visitor's.** Rico, 13
  October 2026, of the block plan: "it shouldn't look like the lights
  are turning on/off when going between rooms". Three things did, each
  by keying light to where the visitor stood. The tower has one palette
  a floor and rooms 17.5 m across at most, behind 1.4 m doors, so it
  showed none of them.
  - **The fill.** One environment map lit the whole scene: the map of
    the room the visitor was in (`scene.environment`). In the block plan
    it changed in every doorway between two palettes. One step from the
    court into the Baroque gallery took 21 % off the frame's mean
    brightness (luma 90 to 71 of 255), one step from the
    Post-Impressionist gallery into the Modernist one added 25 %. Now a
    material carries the map of its own room's palette as its `envMap`
    ([`room-light.ts`](src/components/gallery-3d/room-light.ts)), and a
    room looks the same from inside as through a door:
    - walls and ceilings are made per palette (`litByRoom`);
    - what every room shares is cloned once per palette (`inRoomLight`):
      frame surfaces, plaque, bench, skirting, laylight frames. A clone
      runs its base's program and differs in one texture. A new mesh
      that stands in a room takes its material through `inRoomLight`,
      or it is lit as the stairs are;
    - `scene.environment` is left to what belongs to no one room
      (`stairPalette` in `index.tsx`): the floor's palette in the tower,
      the halls' stone on every storey of the block plan. Never key it
      to the room the visitor is in. Three things take it: the stairs
      and their rails, the floors, and the casing of a door.
    - **A floor is not lit as its room.** It is the one surface that
      runs on through a doorway. The first build lit each floor by its
      room's map, and the parquet stepped in brightness on the threshold
      of every door between a pale room and one in a deep colour, a line
      from jamb to jamb: a quarter brighter in the west stair hall than
      in the blue gallery beside it, a third from the ochre gallery to
      the white one. Rico, 13 October 2026: a "clear separation line on
      the floor that looks broken". The floor just beyond a threshold
      over the floor just before it, at ten doors: 0.80 to 1.32 then,
      0.97 to 1.06 now, and what is left is the next room's reflection
      coming in over half a metre. What a room gives its floor is that
      reflection. The per-room tints (`roomAccents`) are about 1 % at a
      door and stay.
    - **A door's casing is one material for both its rooms.** Where two
      rooms each draw the wall between them (the block plan), both put a
      casing on the same spot and its jamb faces lie in one plane. Lit
      as two rooms they flickered in stripes of the two.
  - **The floor's reflection** was paused in a hall, the court included.
    With the pass off a floor shows the even sheen of the environment
    map, with it on the room itself, which in a crimson room is far
    darker: a gallery's floor changed as the visitor stepped out of the
    hall. The pass now runs in a hall and is paused on a spiral only.
    Up a grand stair's flight it thins out with the eye's height
    (`FLIGHT_FADE_M`, 3.6 to 4.1 m over the floor) and is gone before
    the storey above becomes the visitor's.
  - **The picture lights** mounted with their works, once the visitor
    came within 14 m of a room, and faded in. A room seen through a
    portal from further off stood bare and unlit, and lit up as the
    visitor walked to it. Every work of a mounted floor now keeps its
    light and a stand-in (`useRoomWorks` in `room-geometry.tsx`,
    `StandIn` in `painting.tsx`): the band of its frame in the finish's
    colour and its canvas as the ThumbHash preview. Neither downloads
    anything. Within 14 m the work is revealed in full (frame, textures,
    plaque), past 34 m it goes back to its stand-in, and the light is
    one component through both. Do not raise the two distances to keep
    more works in full: the rooms within them already hang more than
    the base texture pool holds, and take it nearest first (block plan:
    "Works in full take the texture pool").
  - **The check.** Two camera poses 10 cm apart, either side of the
    line where the visitor's room changes, the same view. Their frames
    may differ by parallax only. On 13 October 2026 the mean luma of
    such a pair differed by 0.05 to 0.4 of 255 at six doorways between
    two palettes and at the 14 m line. Before, it differed by 19 to 31
    at the two doorways measured. A door between two rooms of one
    palette differs by 1.1, all of it parallax. The tower's frames did
    not change: at 8 poses on three floors the mean difference from
    main was under 0.04 of 255, all of it rooms seen through a door
    that are now lit. Those rooms cost up to 72 draw calls more.
  The scene's fog (`index.tsx`, 20 to 80 m) is left as it was. Down the
  block plan's spine a room 50 m off is half dark through it.
- The tower's stairwell hangs no works, so it has its own light
  (`stairwell-light.tsx`, geometry in `stairwell-light-rig.ts`), built
  the same way. A hall of the block plan has the same washers, a row to
  each stretch of its walls ("A hall is lit by rows of wall washers",
  above):
  - a plaster ceiling a storey up, with a glazed ring round the well.
    On the top floor a glazed dome closes it, rising 0.75 of its rim's
    radius over the ceiling (`dome()`, `DOME_RISE`), shaded darker
    toward the rim because the glass is unlit;
  - the glass stops a metre short of the washers' cans
    (`glazingOuterR`). Rico, 17 October 2026: no light hangs on the
    glass. A spiral room of the block plan is 17.5 m deep, so its dome
    has a 5.85 m rim and its lower floors have no ring (`ringFits`);
    the tower's stairwell keeps its 8.35 m ring;
  - wall washers along each wall, an even count, the end cans
    `WASH_CORNER_GAP` from the corners: six on a 22.5 m wall, four on a
    17.5 m one. Their pools are one mesh for the
    room. A fragment adds the can nearest it and that can's two
    neighbours, so a cone may not reach a gap and a half along the wall
    (`stairwell-light-rig.test.ts` pins it);
  - the stair's materials reflect the frames' lamp map, so a tread's top
    takes about twice the light of the flight's underside;
  - a step light under every nosing, baked into the treads' vertex
    colours (`staircase.tsx`).
  A flight's balusters and brackets are merged into one geometry each
  (`mergeBoxes`). As a mesh apiece they were about 100 draw calls a
  stairwell, which is what pays for the light.
- Frames are moulding profiles swept round the canvas with mitred
  corners (`frame-geometry.ts`). What is swept is decided in three
  modules of `src/lib/gallery-layout/`, none with three.js in it because
  the hang reads them too:
  - `frame-profiles.ts`: the tools to draw a cross-section, and
    `shadeProfile`, which works out occlusion, burnished high points and
    wear from the shape. Set `ao`, `rough` or `wear` on a point only to
    override it (mats do).
  - `frame-styles.ts`: 29 mouldings, from the Baroque leaf torus to a
    strip frame. Each is a builder. It takes the ornament for its sight
    moulding, its field and its crown, and two structural alternates, so
    one style yields dozens of profiles: a print mat comes 44 to 88 mm
    wide, single or double, with or without a line, in six frames. Many
    also take a flat liner inside them (`StyleOptions.liner`). A profile
    is shaded once per combination and cached.
  - `frame-design.ts`: which frame a work gets (`pickFrameDesign`). A
    design is a *look* (51: a moulding and the finishes it comes in),
    its ornament, one finish per material slot, and the work's own
    numbers: how heavy the moulding is cut, how worn and how polished it
    is, how much dirt sits in its hollows, how deep its carving, the
    exact tone of its gold or its mat. On 12 October 2026 each of the
    4,555 works had a design no other work has, cut from 621 different
    mouldings (`frame-design.test.ts` pins 97 %).
  - **The picture chooses with the school.** School and date name the
    looks a museum would plausibly have the work in, weighted
    (`looksFor`). `readPicture` then shifts the weights: a dark painting
    takes gilding, a high-key one a pale or painted frame, gold is
    warmed beside a cool picture and cooled beside a warm one, a mat or
    a silk mount takes its tone from the sheet. Country and words in the
    title (portrait, landscape, still life) bias it too, and so does
    size: a narrow moulding goes to small works, a tabernacle frame to
    sacred subjects. A painting on silk hangs in a flat silk mount,
    upright or wide. Warmth comes from `colorBuckets`,
    because `dominantColor` calls nearly every painting warm brown. The pick is a weighted draw on a hash of the
    id, so the server, the browser and every visit agree. Everything it
    reads is in `ArtworkListing`, which `/api/artworks/museum` serves
    whole. Strip `colorBuckets`, `dominantColor`, `title` or
    `nationality` from that response and the frames stop matching their
    pictures, with no error.
  - **A room frames its works together.** `pickFrameDesign(work)` is a
    work's own frame. Hung in those, a wall mixed gilt, black, white
    and oak, and Rico found it too mixed ("bunt") on 13 October 2026:
    two neighbours on a wall shared a family of finishes in 55 % of
    1,748 pairs, a finish in 18 %. What hangs is now chosen once more,
    under a `Hanging` (`roomHanging`, `wallHanging`), when every work
    has its wall:
    - The wall colour scores each finish (`wallFit`, OKLab distance). A
      finish within 0.05 of the wall keeps a quarter of its weight, 0.6
      as leaf; one 0.2 away keeps all of it. Maple, ash and gold sink
      into the ochre of the Post-Impressionist rooms, walnut into the
      charcoal of the East Asian ones. Frames within 0.12 of their wall:
      42 % → 7 % on the Post-Impressionist floor, 55 % → 24 % on the
      East Asian one, where the pale mats do the separating.
    - A room draws one family of finishes (`FinishFamily`: gilt, silver,
      dark, wood, pale, red, and silk for every silk mount) from
      what its works would choose one by one. A moulding that comes in
      the family is 30 times likelier, and once drawn it takes no
      finish outside it (`mainOptions`). With the family only a pull on
      the finish too, one work in fourteen kept a finish of its own,
      and a green-stained frame stood among five white ones. A school
      with no moulding in the family keeps its own.
    - A wall draws one frame to lead with. A wall is all its runs,
      either side of a door. That moulding is 3 times likelier and its
      finish 6 times.
    - Liners, accents, mats and silks are drawn once a wall, for the
      mean tone of its works: one mat board and one silk a wall.
    After it neighbours share a family in 94 % of pairs, a finish in
    58 % and a moulding in 50 % (20 % before). A family is drawn about
    as often as the works would choose it, so a floor keeps its mix
    from room to room: 144 of the 169 pairings of a moulding with a
    finish still hang in the tower.
    - Every draw is still on the work's id, with the room's pull as a
      weight. A work the room's choice already suits keeps its own
      frame, and a hanging with no wall, family or lead gives it back
      exactly.
    - **Walls are measured with the own frame, and framed after.**
      `wallFootprint` and `tryAssign` never see a `Hanging`, so the
      pulls change no room count and not the tower's
      `galleryLayoutIdentity`. `packRun` takes the chosen frames; where
      they overfill a run, the works that gained most go back to their
      own. A work hung for a bench or alone on a door screen takes the
      room's frame only where it reaches no further than its own. For
      one of these reasons 3 of the tower's 2,771 works hang in their
      own frame (13 October 2026). The Grand Hall is the
      exception: it is composed with its hanging, so a pull can change
      which pairs fit a wall, and in the block plan where the hall's
      benches stand, which is part of that plan's identity. On
      13 October 2026 it changed neither, on either plan. The giants
      of the block plan's stair halls (`giants.ts`) hang in their own
      frames.
    - Every hung work carries its frame in `Placement.frame`. Read a
      placed work's frame as `p.frame ?? pickFrameDesign(p.artwork)`.
    - It is a second design for every hung work, and the tower's
      layout takes a tenth to a fifth longer for it (290 to 330 ms of
      CPU against 260 to 300, warm, on an M5 under load). It was two
      fifths before `draw` hashed its strings one at a time and a
      work's candidates were kept from the room's question to the
      wall's (`readingOf`). Neither changes a draw: the own frames of
      all 4,555 works came out the same.
  - **A frame's width is part of the hang.** `sideClearance()` in
    `place-paintings.ts` reserves the frame on both sides of a canvas
    and the plaque beyond it; the Grand Hall uses the same number
    (`frameReach`). A Barbizon frame with a linen liner on a 3.2 m
    canvas reaches 23 cm, a strip frame 1 cm. Widening a profile, its
    scale range, a liner or a design's `weight` adds wall demand, which
    adds rooms, which changes `galleryLayoutIdentity` and sends every
    visitor with a saved position back to the room's centre. The move
    from ten frames to these added up to 1.7 cm of mean reach a floor
    and no room: check both numbers after touching a width.
  - **Reach is to the sides.** `frameReach` is how far a frame goes
    left and right. `frameExtents` adds `top` and `bottom`, which differ
    only for a frame built from rails, and the hang lifts a work by its
    bottom extent (`frameDropOf`), not its reach: a tabernacle frame's
    plinth hangs up to 15 cm below its painting.
  - **Swells.** A style may return a `Swell`: the moulding beyond a
    pivot pushes outward at the corners and the middle of each rail
    (Louis XV, Régence). The geometry cuts those rails into stations
    3.5 cm apart, and a shell from the carve atlas takes the place of
    the running ornament there. `ear` steps the corners out square (a
    Kent frame); `cartouche` with no push carves the shells on a
    straight frame, and `plain` leaves it bare between them (a panel
    frame). A swept frame is about 2,600 triangles (3,900 at most) where
    the mean over the catalogue is 860. `frameReach` counts the swell.
  - **Rails and blocks.** Three styles are not mitred. A tabernacle
    frame, an Oxford frame and Stuck's frame return `rails`: straight
    lengths along one side of the canvas, cut square and closed at the
    ends (`addRail`). Rails that cross must not share a surface: the
    Oxford frame's uprights stand 2 mm proud, and a tabernacle's
    entablature is taller at its inner face than the pilasters are
    deep. A style may also return `blocks`, a carved square on each
    corner (`addBlocks`).
  - **No work hangs as a scroll.** Rico, 13 October 2026: "I would
    like to have no scrolls but only frames." Until that day an upright
    painting on silk hung as a hanging scroll. The first build was a
    slab of silk 3.6 cm proud of the wall, and he found its top and
    bottom "too long", "not properly like scrolls", "weird/glitchy". A
    second build lay flat on the wall, in three cloths, on a roller with
    a knob at each end, by a cord from a nail (commit 0fe0fa0). He saw
    it and asked for frames. The `scroll` style and look are gone, with
    the cord, the rails built as two ends and the picture plane on the
    wall that only it used. Every Classical East Asian and Nihonga
    painting hangs in the silk mount (`silkMount`), a frame like any
    other. Do not bring a scroll back without asking him. On both plans
    `galleryLayoutIdentity`, the rooms and the number of works hung
    stayed as they were; the works of those rooms moved along their
    walls, since a mount is wider than a scroll's silk was.
  - **The pool is dark behind the rectangle the light is given.**
    `PaintingLight` takes a frame as one rectangle and lights no wall
    behind it. It was given the larger of the frame's reach up and its
    reach down, both ways. It now gets the frame's own height and
    `frameCenterY`, how far the frame's middle lies above the canvas's.
    A tabernacle frame's entablature reaches 15.2 cm up at scale 1 and
    its plinth 11.3 cm down, so the rectangle ended 3.9 cm under the
    plinth. `buildLightRig` still aims by the larger reach.
  - `/gallery-3d/frames` is a debug sheet of works in their own frames,
    lit as in the galleries: `?m=Baroque` for a school, `?look=hogarth`
    for a look, `?id=<id>,<id>` for named works, `?n=12&cols=4` for
    fewer and larger, `?page=2` for more.
    `?hung=1` frames the sheet as a room would, each row as one wall,
    and `?era=baroque` puts it on another era's wall.
- **Frame maps** (`frame-maps.ts`) are procedural: 13 tiling
  DataTextures built once when `frame-materials.ts` loads, 8.8 MiB on
  the GPU with mips, shared by every frame. Nothing is downloaded.
  - Surface maps tile in metres along the rail (u) and along the profile
    (v), so grain turns at each mitre: gold leaf in squares with a wear
    mask in alpha, walnut and ash with roughness in alpha, crazed
    lacquer, shippō silk in grey, canvas weave, paper. The silk's
    figure is woven at 226 on a ground of 200 (`SILK_THREAD`). In
    white, the lattice was all a mount showed.
  - The carve atlas (512 × 1,536) has one row per ornament, 25 of them:
    pearl, leaf, egg and dart, laurel, flute, ripple, rope, punchwork,
    acanthus, guilloche, shell, scales, Greek key, gadroon, ribbon and
    stick, bead and reel, hammering, oak, water leaf, lattice, husks,
    wave scroll, rosette, dentils, bamboo. A profile point names a
    `band`; the geometry's second uv set (`aCarveUv`) points that
    stretch at its row. 150 texel rows are free.
  - Carving is set out from the corners (`carvePeriods`): the two halves
    of a rail run mirrored and hold a whole number of periods, and the
    mitre continues at the ornament's own pitch, so the pattern meets
    itself across the joint. An ornament must look right mirrored. The
    directional ones (acanthus, gadroon, ribbon, rope) meet tip to tip
    at the centre of a rail, as carvers set them out.
  - They are DataTextures on purpose. three uploads them again after
    the Canvas remounts for a lost context. A render target here would
    need the per-renderer cache `room-env-map.tsx` uses.
- Frame materials (`frame-materials.ts`): nine, one per *surface*
  (leaf, leaf on oak, dark wood, pale wood, lacquer, paint, mat board,
  silk, cloth). A finish is a surface in a colour, and the colour is in
  the frame's vertices, with its wear, polish and carving depth
  (`aFrame`, and `color` = tint × occlusion). A frame is one draw call
  per material it uses: one for 45 % of works, two for 35 %, three for
  20 % (a Hogarth frame: black, gilt beads, mat). So yellow, lemon and red
  gold and silver leaf are one material, and oak, maple and mahogany are
  ash grain under a tint. Add a finish in `FINISHES`
  (`frame-design.ts`); add a material only for a surface that needs
  another map. Each is a stock `MeshStandardMaterial` with one patch,
  `patchFrameShader`, which adds:
  - the carve atlas as a second normal map, per-vertex roughness, red
    bole on worn gilt, and a directional term for the picture light,
    which is shader arithmetic on the frame and not a three.js light;
  - the tangent frame from the metre uv: three builds it from the map's
    own uv, and a map with an uneven `repeat` (wood: 0.64 × 0.16 m) then
    loses most of its relief on one axis;
  - **shading by distance** (`frameFar`). From across a room a bead or a
    carved leaf is smaller than a pixel. Each pixel then lands on a
    different facet, and on polished metal under the lamps of the frame
    environment map that is a glint on one frame and none on the next:
    the gilt crawled as the visitor walked, which read as z-fighting.
    Past 2 mm of moulding a pixel the maps fade, the normal leans toward
    the frame's face and the roughness rises to 0.62; by 10 mm a pixel
    the frame is a smooth matte band with its baked shadows. Keep any
    new high-frequency detail under that fade.
  Frame and fixture metal reflect their own environment map
  (`frame-env.ts`, the room gradient plus bright lamp spots), each
  room's own (`room-light.ts`). A material can take less of it through
  `userData.envScale`: leaf takes 0.6, so the picture light models its
  carving and the room's reflection does not flatten it.
- Tone mapping is Khronos Neutral, so a pale palette colour shows on
  screen as authored (a deep wall skips it, see the next point). The
  environment map's light is pulled most of the way to grey (`asLight`):
  a cream wall lit by its own cream comes out khaki.
- Wall and ceiling colours are per era, in the `Palette` objects of
  [`gallery-eras.ts`](src/lib/gallery-eras.ts). Each is modelled on a
  real room that hangs that period, and the comment above it names the
  room and says how well the colour is sourced: crimson on the Baroque
  floor after the damask of the Wallace Collection's Great Gallery,
  midnight blue on the Renaissance floor after the Louvre's Salle des
  États. Two have no written source (Rococo is read from photographs,
  Natural History rests on one temporary show), so check the comment
  before quoting a room as fact. Three functions in
  [`wall-light.ts`](src/components/gallery-3d/wall-light.ts) make a deep
  colour work, and each returns a pale wall unchanged:
  - `wallAsLightSource`. The environment map is painted from the wall
    colour, so a dark wall dimmed its own room, ceiling and floor
    included. The wall enters the map lifted to the grey of the cream
    the fill was tuned on.
  - `isDeepWall`. Neutral subtracts the weakest channel from all three,
    up to 0.04 in linear light. On crimson that took green to zero and
    the wall rendered signal red, so a deep wall's material is
    `toneMapped: false`.
  - `poolGainScale`. A pool multiplies the wall, so on midnight blue or
    charcoal it added almost nothing. The gain on the wall rises as the
    wall's brightest channel falls, capped at 2.
  The hex is about what shows inside a pool. Between pools the fill puts
  a wall near 0.43 of it in linear light, so judge a new colour in a
  screenshot, never from the swatch.
- **Walls are one flat colour. Two wall textures were tried and taken
  out.** Photographed textures first: their baked occlusion fought the
  lighting round the frames. Then a damask on the crimson Baroque walls,
  drawn as a procedural roughness map (`Palette.wallPattern`,
  `wall-damask.ts`): Rico did not like it and had it removed on
  12 October 2026. Do not add a wall pattern without asking him. Wall
  planes still carry UVs in metres (`MetrePlane` in `wall.tsx`).
- The parquet reflects the room: one more render of the scene each
  frame, from a camera mirrored under the floor of the storey the
  visitor is on, blurred and fed to every floor material on that storey
  in place of the environment map's radiance
  (`floor-reflection.tsx`; shader patch, mirror camera and frame-rate
  guard in `floor-mirror.ts`). three's indirect-specular term then
  applies Fresnel and roughness, so it is a few percent underfoot and a
  clear sheen toward the far wall. Before changing it:
  - **Three gates, and no other quality tier.** Off on touch devices.
    Paused on a spiral, where two storeys are mounted in full. Given
    up for the rest of the visit once most frames run under 48 fps for
    three 1.5 s windows in a row (`createFrameRateGuard`). Off means the
    floor materials compile to three's stock shader
    (`#ifdef FLOOR_REFLECTION`).
  - **What the mirror leaves out.** Small parts sit on
    `UNREFLECTED_LAYER`: fixtures, frame mouldings, plaques and their
    text, skirting, door trim, balusters. A three.js layer is not
    inherited, so a new small mesh sets `layers={UNREFLECTED_LAYER}`
    itself; forget it and the part costs a draw call in both passes.
    The works of rooms more than 5 m from the visitor are hidden for
    the pass as well (`registerMirrorRoom`): three culls by frustum
    only and would draw them behind the walls. Room culling (below)
    does not apply to the pass.
  - **The mirror target is flagged `isXRRenderTarget`**, in the
    canvas's colour space, so three gives it the canvas's output
    transform and both passes run the same shader programs. An ordinary
    target would compile a second variant of every program and look it
    up again whenever a material changes pass. The picture lights'
    pools multiply the framebuffer, so they also need the same encoding
    to look the same. The flag is internal to three. After an upgrade,
    check that `programs` on the debug HUD does not jump when the
    reflection comes on and that the floor is not too bright or dark.
  - **The frame's own render reuses the mirror render's world
    matrices** (`scene.matrixWorldAutoUpdate = false` for that one
    render). An object moved in a `useFrame` mounted after
    `<FloorReflection>` would be drawn a frame late. Nothing does today.
  - Cost on an M5 at 2560 × 1440, frame-rate cap lifted: 2.5 → 3.1 ms a
    frame at the Baroque Grand Hall spawn, 3.9 → 4.4 ms in the
    Impressionism north hall. The pass adds 140 to 185 draw calls and
    about 11,000 triangles, and holds 60 fps there. `?debug` prints it
    on the HUD's `mirror` line, and
    `window.__galleryFloorReflection(true | false | null)` pins it on
    or off for an A/B at one pose.
- Rooms and works the visitor cannot see are not drawn. three culls by
  the view frustum only, so a storey used to draw every room and every
  mounted work in the direction of view, walls or not. Once a frame the
  ones that cannot be on screen get `visible = false`. The test is a
  portal walk over the door graph, with no three.js in it:
  [`room-visibility.ts`](src/lib/gallery-layout/room-visibility.ts).
  [`room-culling.ts`](src/components/gallery-3d/room-culling.ts) holds
  the scene objects and sets the flags (`<RoomCulling>`, mounted after
  `<Player>` and before `<FloorReflection>`). Before changing either:
  - **The walk.** The room the camera is in is seen whole. A room next
    to it is seen through the door between them, in the part of the
    screen that door covers. A room beyond is seen in the part both
    doors cover. The walk ends where that part is empty, so it has no
    depth limit: a limit would hide the last room of an enfilade. It
    reads room boxes, `Door.connectsTo` and `isStairwell`, and nothing
    of the plan. Within 0.75 m of a door the visitor counts as standing
    in both rooms. A camera in no mounted room gets everything drawn.
  - **A stairwell is one room through every storey** (`shaft`: the
    stairwells that stand on one footprint). Reach one and each mounted
    storey's is seen, and the walk goes on through all their doors. The
    well is not tested as an opening. A storey's flights, railings and
    stairwell lights are drawn with it (`registerShaftFittings`, from
    `FloorScene`). On the block plan a floor has five: two stair
    halls, the court and two spiral rooms. Their fittings are one
    group, drawn while any of the five is seen.
  - **A room is three kinds of object.** Its contents (floor, ceiling,
    laylights, dividers, benches, works) are one group. Its walls are
    one group a side, outside that group: a wall between two rooms is
    drawn while either is seen (`wallSharers`). Where both rooms draw
    the wall, both copies stay, or a patterned wall changes its figure
    when the neighbour comes into view. Its works: in a room seen
    through a door, a work is drawn only if its bounds can show in the
    part of the screen the door covers. `Painting` measures the bounds
    from what it has mounted, after every render.
  - **What it cannot see for you.** An opening between rooms that is
    not a `Door` (a window, a balcony, an arcade) hides the room behind
    it until the walk is given it as an opening. A mesh that belongs to
    a room goes inside the room's contents group; outside it, it is
    drawn always.
  - **The floor's mirror pass is drawn without it**
    (`suspendRoomCulling`). The mirror camera is under the floor and
    sees every room from below, past the foot of the walls, and its
    image is blurred, so the floor along a wall takes colour from the
    room behind that wall. With that room hidden the strip went up to
    13 levels of 255 darker, and changed when a door came into view.
  - **How it was checked.** `room-visibility.test.ts` follows 2.44
    million rays from 6,512 poses through rooms and doors, on a floor
    of the tower and a floor of the block plan. Every room a ray enters
    must be in the answer, in a rectangle that holds the ray. In the
    browser the frame with culling on was compared with the frame with
    it off at 79 poses, 70 on the tower and 9 on the block plan
    (`window.__galleryRoomCulling(false)` draws everything). What still
    differs is one pixel wide and was a leak in the old picture: a
    picture light's floor pool showing through the bottom row of the
    skirting, and specks where a hidden room's ceiling meets the shared
    wall edge-on. The skirting now runs 12 mm below the floor
    (`SKIRTING_SINK`): the stairwell's floor lay 5 mm low, and the
    slit under its skirting showed the dark outside once the room
    behind was hidden. It lies at the floor's level since 17 October
    2026: 5 mm low, it left the top of the lintel over the same door
    on the storey below standing above it (a hall's walls run a whole
    storey), a line of wall colour across every threshold of a stair
    hall and the court above the first floor.
  - Draw calls of the frame's own render on an M5 at 2560 × 1440,
    Baroque floor, one walk, culling off → on: 357 → 221 at the Grand
    Hall spawn, 666 → 446 along the hall, 859 → 403 across it, 1,151 →
    334 from the south-west room looking back, 1,325 → 382 half-way up
    the stair with two storeys mounted. Triangles fall with them
    (197,926 → 51,828 in the south-west room). On the block plan's first
    floor (13 October 2026): 980 → 285 from a gallery of the spine
    looking at a stair hall, 158 → 88 on a half landing of that hall,
    596 → 510 along a long gallery, 1,187 → 1,021 where a visit starts
    in the court, which shows its sixteen doors whatever is culled.
    53 poses picked at random on the Baroque floor went from 590 to 215
    on average. The mirror pass stays where it was: 150 to 240 draw
    calls on the tower, 130 to 190 on the block plan. The HUD's `rooms`
    line prints rooms and works drawn of those mounted.
  - Frame time with the cap lifted, across the Grand Hall (604 → 403
    draw calls on a fresh load), the two states alternating in one
    page: 10.3 → 8.5 ms with the floor reflection on, 8.6 → 6.6 ms with
    it off, so 17% and 22% less. Other sessions held the machine at a
    load average near 400 that day, which makes both figures about
    three times a quiet M5's: keep the ratio, not the milliseconds.
    Touch devices run without the mirror pass and get the larger share.
- Two ways to aim the camera headless, where Chromium refuses pointer
  lock. `scripts/build-museum-screenshots.mjs` stubs the Pointer Lock
  API and walks with timed keys, which changes nothing in the app but
  lands a little differently each run. For an exact, repeatable pose
  (a before/after comparison), `?debug` exposes the camera as
  `window.__galleryCamera`: set its position and quaternion, then
  screenshot. Launch with `--use-angle=metal` for a real GPU.

## Museum music

- The 3D museum plays 13 recordings in the background
  (`use-gallery-music.ts`), a shuffled round at a time: each plays once
  before any plays again, and a new round never opens with the piece the
  last one ended on (`src/lib/shuffle-bag.ts`). The rest of the round is
  in localStorage (`cob-music-bag`). Nothing downloads before the Enter
  click. It replaced the Pixabay ambient loop on 17 October 2026.
- The pieces are from Rico's Spotify playlist "Beautiful Stillness",
  where the composer died before 1956. The Spotify recordings are in
  copyright, so each is another recording: one its performer released
  under CC or into the public domain (Musopen, Commons, Free Music
  Archive), or a 78 published before 1963, which is free in the EU
  (rights ran 50 years until 2013 and the extension revived none).
  Four of the 78s are still protected in the US; the site follows
  German law, as for the paintings. Do not take a recording from
  Spotify, YouTube or a modern CD reissue's own mastering claim.
- `src/lib/gallery-music.ts` holds each track's source, SHA-1, licence
  and rights note; `/gallery-3d/music` prints the credits CC BY and BY-SA
  require. `pnpm music:build` downloads to `assets/music/` and encodes
  to `assets-web/music/v1/<id>.mp3` (-18 LUFS, linear gain, 78s mono).
  The files reach the asset origin only through `pnpm assets:sync`.
  They are served immutable: a re-encode goes to `music/v2/`
  (`MUSIC_DIR`), never over v1.
- Not in `public/audio/`: that folder is copied into every release
  (`scripts/RETAINED-ASSETS.md`), and 70 MB of music would ride along.

## Newsletter

- Editions live in `content/newsletter/NNNN-<theme-slug>.md` — one
  markdown file per issue. Frontmatter holds title, publishedAt,
  excerpt, draft flag, and exactly five `artworks` entries (id +
  optional editorial note).
- The git history of `content/newsletter/` *is* the archive. No R2
  state file, no database, no "have we sent this artwork before"
  table. `sentArtworkIds()` in `src/lib/newsletter/editions.ts` walks
  the markdown files (drafts included) and returns the union of every
  featured id.
- **Drafting**: `/newsletter-draft` slash command guides the curation
  flow, then calls `pnpm newsletter:draft <theme-slug>` to scaffold
  the file. The file lands with `draft: true` — flip it after editing.
- **Sending**: CLI only, and **there is no confirm gate** —
  `--dry-run` is the only flag that stops a real send.
  `pnpm sendNewsletter <slug> --dry-run` renders the edition and sends
  nothing; `pnpm sendNewsletter <slug>` creates *and starts* a real
  ListMonk campaign against `.env.development` (test list);
  `NODE_ENV=production pnpm sendNewsletter <slug>` switches to
  `.env.production` (live list). The slug is optional — omitted, the
  latest published edition is used. A production send of a
  `draft: true` edition is refused unless `--allow-draft` is passed.
  `pnpm newsletter:send` is an alias; `scripts/newsletter-send.sh`
  picks the env file based on `NODE_ENV`. No API route, no cron job.
  Sending requires the relevant `.env.*` file decrypted on the user's
  machine.
- **ListMonk + SES setup (Hatchkit-provisioned)**: lists, API user,
  SES SMTP wiring, and most env vars are produced by `hatchkit
  provision`. Both `.env.production` and `.env.development` carry the
  same variable name `LISTMONK_LIST_ID` with different numeric values
  (prod list vs dev list). `resolveListId()` in
  `src/lib/newsletter/listmonk.ts` reads that single var without any
  NODE_ENV branching. From-address falls back to `SES_FROM_EMAIL`
  unless `LISTMONK_FROM` is set. The two passthrough templates the
  app needs (`LISTMONK_TX_TEMPLATE_ID` + `LISTMONK_CAMPAIGN_TEMPLATE_ID`)
  are created idempotently by `pnpm listmonk:bootstrap`; the script
  prints the ids to paste into both env files.
- **The app sends the opt-in email, not ListMonk.** The subscribe form
  creates the ListMonk subscriber on *no* list (`ensureSubscriber`) so
  `/api/tx` can deliver the HMAC confirmation email; only the confirm
  route adds `LISTMONK_LIST_ID`, as `confirmed`. Lists 3 (prod) and 4
  (test) are `optin: double` since 28 September 2026 (Hatchkit had
  created them single), so ListMonk campaigns reach `confirmed` members
  only. That holds only while membership is added as `confirmed`, with
  `preconfirm_subscriptions: true` on every create: ListMonk sends its
  own opt-in email (`app.send_optin_confirmation` is on) for an
  `unconfirmed` membership on a double list, next to ours.
- **Confirmation emails that never arrive** are usually SES, not code.
  SES in eu-west-1 is in sandbox and delivers only to verified
  addresses. `/api/tx` queues the email and returns 200 before SMTP
  runs, so the form shows "Check your inbox" either way. The SES
  rejection shows only in ListMonk's `GET /api/logs`.
- The public archive lives at `/newsletter` (index) and
  `/newsletter/<slug>` (per-edition magazine-style page). Both are
  in the sitemap. Drafts never reach the public surface.
- The email header is the issue's five works framed on a gallery wall,
  a JPEG rendered on request by `/newsletter/<slug>/wall.jpg` (sharp,
  sources fetched from the CDN, kept in memory). Nothing is committed,
  so **sharp is a runtime dependency** — keep it in `dependencies`.
  Only the works are in the picture; the title under it is live HTML on
  the wall's base colour, and the image's bottom rows must stay exactly
  that colour or a seam shows. Drafts render too, for test sends. The
  send CLI fetches the image first and refuses a live send when the
  deployed site does not serve it.
- `/newsletter/<slug>` opens with the same wall, but not the JPEG: it
  inlines the wall SVG (`wall-svg.ts`, the string sharp rasterises) and
  lays the works over it as `<picture>` elements, so the page gets
  srcsets and ThumbHash blurs. Change the drawing in `wall-svg.ts` and
  both headers follow. On the page each framed work links to
  `#<artwork.id>`, the id of its `<figure>` below; the email's frames
  are not links.

## Copyright

The site is operated from Germany, so a work is publishable only once the
German term has ended: 70 years after the end of the author's death year
(§64 UrhG). Commons licence tags do not settle this. They describe US and
source-country status, and several catalogued works carried a wrong CC0 or
`PD-Japan` tag.

- `metadata/takedowns.json` lists works that are still in copyright.
  `scripts/lib/takedowns.mjs` enforces it in build-data, shrink, the Commons
  fetch and `assets:sync`, which refuses to run while a listed variant dir
  exists. All four checks are needed: shrink encodes every file under
  `assets/<folder>` whether or not it is catalogued, and sync publishes
  whatever shrink wrote. That is how 132 uncatalogued in-copyright images
  ended up publicly served from the bucket.
- build-data also withholds every work by an artist whose `artists-db.json`
  `pd_status` is exactly `"copyrighted"`, which catches a re-ingest under a
  new filename. Use it only for artists whose term runs well into the
  future: the field has no expiry, so it would keep blocking a work after it
  enters the public domain.
- Taken-down originals are in `assets/.rejected/copyright/` and their
  variants in `assets/.rejected/copyright-variants/`. Neither is read or
  synced. Never put anything under `assets-web/.rejected/`: sync publishes it.
- Open question for a lawyer: whether the EU rule of the shorter term applies
  to non-EU authors who are out of copyright at home but not under the plain
  German term. Kawase Hasui and Kawai Gyokudō (both died 1957), Pu Xian and
  Pu Ru stay online pending that answer. They become public domain in Germany
  on 1 January 2028 at the latest (Pu Ru: 2034, Pu Xian: 2037).
- Details and sources: `metadata/copyright-takedown-2026-09.md`.

## Worktree workflow

The user works in `.claude/worktrees/<slug>` and merges into `main` via
fast-forward only. The dev server runs from the main worktree at
`/Users/rico/projects/collection-of-beauty`, **not** from a worktree —
so worktree-only changes don't show up in dev until they're merged.
Standard flow for an agent:

1. Make the change in the worktree
2. Typecheck (`pnpm typecheck`)
3. Commit on the worktree branch
4. `git rebase main` from inside the worktree
5. From the main worktree: `git stash` (if dirty), `git merge --ff-only <branch>`, `git stash pop`

The user explicitly does **not** want PRs opened. Don't run `gh pr create`
unless asked.

`assets/` and `assets-web/` are one directory for every worktree.
build-data probes what is on disk, so a run while another session
replaces originals writes that session's sizes and variants into
`src/data`. Read the diff work by work before committing it.

## Prose

Every word a visitor reads — page copy, meta descriptions, era blurbs,
press kit, newsletter — follows [docs/writing-style.md](docs/writing-style.md).
Read it before writing or editing any user-facing string. The short
version: name a concrete fact, prefer numbers to adjectives, and avoid
the machine cadences (`noun, noun, noun — summarising phrase`,
`X, not Y` punchlines, `no A, no B, no C`, peacock terms). Copy here has
drifted back into those shapes twice already, so a set of strings should
be read *together* — a repeated skeleton across eleven blurbs is the
tell, not any one of them.

## Commits

Concise subject, no Co-Authored-By footer, no AI attribution. Focus on
the *why* rather than the *what* — the diff already shows the what.

## Tests

`pnpm test` runs vitest. Coverage is intentionally narrow — pure
functions in `src/lib/` are the target. React component tests aren't
set up; if you need one, scaffold a Testing Library setup separately.

Several sessions run the suite while the machine is at a load average of
50 to 150. A starved run takes 90 to 140 s where a quiet one takes 10 to
30, and a test then runs 4 to 18 times slower. Two rules follow:

- **No `expect` in a loop over the catalogue, a texture or a geometry.**
  A call costs about 0.08 ms on a quiet machine. The 15,800 calls of one
  test in `artwork-colors.test.ts` were 1.3 s of it there and 4.9 to
  9.5 s in a starved run; the test now takes 10 ms. Read the values in a
  plain loop, keep the one nearest the limit and the id, triangle or
  texel it belongs to, and assert once with that name as the message.
  Keep a NaN once met (`value < least || Number.isNaN(value)`), or the
  next value replaces it and the test passes. For a yes-or-no rule,
  collect the ids that break it and assert that the list is empty.
- **`testTimeout` in `vitest.config.ts` is 120 s**, where vitest's
  default is 5 s. Tests whose cost is the work under test (a layout over
  a catalogue, a stair walk, a sharp render, the first render of an
  email) crossed 5 s in starved runs, other ones each run, and single
  tests have taken 70 s at a load average of 200 to 400. None waits on
  anything. A test that needs longer sets its own:
  `frame-design.test.ts > variety` picks a frame for every work, 9 s
  quiet and 46 s starved, and has `{ timeout: 300_000 }`.

## Things that look like bugs but aren't

- **`THREE.WebGLRenderer: Context Lost.` in dev** — Fast Refresh
  occasionally drops the GL context. The gallery handles this by
  remounting the canvas (see the `canvasKey` state in `index.tsx`).
- **`unsupported GPOS/GSUB table` warnings** — from Three's font
  pipeline when rendering text labels in some browsers. Harmless.
- **Sitemap shows "stale" works** — it's `revalidate=86400`, so a new
  artwork doesn't appear in the sitemap for up to a day after deploy.
  That's intentional; rerunning the build immediately re-renders it.

## Outstanding tickets (memory)

- 101 of 4,555 works lack `realDimensions`, all in the
  `collection-of-beauty` folder (13 October 2026). They were 562 that
  morning. Two passes that day found 461 sizes, each from a record of
  the object. The first found 419: 168 from the holding museum, 108
  Monets from the Wildenstein catalogue, 47 Holbein woodcuts from museum
  impressions, 59 from the Commons page the work links. The second found
  42 of the 143 that were left, 12 of them in records that open only in
  Rico's Chrome: the British Museum, Honolulu, the Dorotheum's lot
  archive, the Musei Civici di Venezia, the RKD, MFA Boston and the
  Academy of Arts museum in St Petersburg.
  `metadata/real-size-fixes-2026-10.md` tells how, and
  `metadata/real-size-open-2026-10.md` lists the 101 with what the
  search found. Before taking up one of them:
  - Each new entry has a `ref` beside `source` in
    `metadata/artwork-dimensions.json`: the record, the words read and
    the address. build-data drops it. A `--force` fetch loses it.
  - The fetch asked Commons by the filename on disk and stored a final
    `null` for 55 works that link a page of another name. It now asks
    for the linked page. A `null` there means that page and its
    Wikidata item have no size.
  - A scan that is a detail gets no size, since the hang would size it
    as the whole painting. Fifteen scans are details, crops or show more
    than the work; seven are listed with the whole work's size.
  - A bot check is never worked round. In Chrome, honolulu.emuseum.com
    and blanton.emuseum.com passed their check by themselves on
    13 October. collections.louvre.fr asks for a click, so Holbein's
    Head of a Woman waits for a person. catalog.shm.ru, agkg.ru and
    sammlung-online.berlin.museum refuse Chrome as well.
  - A figure from a source the rules do not list goes to Rico, drawn
    as an outline on the scan. On 13 October he saw seven and took the
    two that fit their scan to 1%: Kim Hong-do's Samgongbulhwando from
    the Encyclopedia of Korean Culture, which names the holder, and
    Boilly's Barrel Game from the National Gallery's caption as a blog
    reprints it. He left five: a catalogue entry whose plate nobody saw
    (Bakst's Awakening, 10% off), two captions that do not fit their own
    illustration (Aivazovsky's Passage of the Jews, Kustodiev's Blue
    House) and two works with figures that disagree (Byam Shaw, Boilly's
    Two Young Friends). Each `ref` of the two says it was his word.
  - A print may take another museum's impression of the same block or
    plate within 5% of the scan's shape, also where the scanned
    impression's own record has no size. A joined triptych takes only a
    size a record states for the joined sheets.
  - Web search is one allowance of 200 for a turn, shared by every agent
    in it. Fourteen research agents used it up two thirds of the way
    through their batches; five agents with a limit each used 117. Give
    search to the works that need it, and read known records (museum
    APIs, the catalogue raisonné) without it.
  - Monet's catalogue raisonné is online as page scans. Its text cannot
    be parsed: read the entry from the page image.
- Of the 4,454 works with a size, `trustworthyRealSize()` in
  [`real-size.ts`](src/lib/real-size.ts) hides 882 from the plaque, the
  scale view, the JSON-LD and every caption. 862 are hidden by design:
  644 Redouté sheet sizes on cut-out scans, 214 `series-default` print
  formats, 4 Vesalius page sizes. Showing those would be a product
  decision, such as a line labelled as the sheet size. 1 is a Google Art
  Project template value with no knowable unit: the Philbrook lists only
  the frame of Copley's Portrait of a Lady. The other 19 have a size the
  scan does not match: a correct size on a cropped, mounted or obliquely
  photographed scan, which needs a full-frame scan from Commons, not a
  new number. Five have no record that settles them (Rubens's
  Crucifixion of Saint Peter, Le Brun's Capture of Ghent, Kustodiev's
  Fair, Vereshchagin's Darjeeling temple and Forgotten Soldier). Fixes go
  into `metadata/artwork-dimensions.json` with a researched `source`,
  never into `src/data/*.json`. The file's comments give each rule;
  `metadata/real-size-fixes-2026-09.md` and `-2026-10.md` give the
  sources for past fixes.
- Hidden is not harmless. The 3D gallery sizes each painting from the
  raw `realDimensions` long edge (`sizeWork()` in `place-paintings.ts`),
  and the Grand Hall leads with the largest works. A value ten times too
  big, such as Malevich's Suprematism at 805 cm tall, would hang there.
  Three details hang as large as their whole painting for that reason:
  Parmigianino's Madonna with the Long Neck (the head and bust, hung
  219 cm tall), Rembrandt's Ganymede (177 cm) and David's Paris and
  Helen (181 cm). Works hung at real size in the block plan's stair
  halls are safe: `giants.ts` takes `trustworthyRealSize()`.
- A new size changes how large a work hangs, and so the wall a floor
  needs. The 419 sizes kept both plans at their room totals (tower 119,
  block 52) but moved two tower floors (Renaissance 13 → 11 rooms,
  Ukiyo-e 9 → 11) and changed `galleryLayoutIdentity` on both plans.
  The 42 of the second pass left both plans' rooms and identities as
  they were. Two changes on the tower's Ukiyo-e floor cancel: seven
  prints hang smaller than the 0.9 m a work without a size gets, which
  alone takes two rooms off (117), and Kim Hong-do's screen, 4.18 m
  long, hangs at the room's 3.2 m limit, which brings them back. In the
  block plan the screen hangs at its real size in the top floor's
  court.
  `real-size.test.ts` holds one rule that moves with such data: no
  trusted work is longer than 10 times its reference in the scale view.
  It was 6 until nine works over 10.5 m came in, the longest Monet's
  Les Deux Saules at 17 m (`MAX_SIDE_CM` is 2,000 for it).
- 95 works lack a `movement` tag (13 October 2026, ~2% of the corpus) — they fall
  through to year-based era assignment in
  [`gallery-eras.ts`](src/lib/gallery-eras.ts). All come from the
  `collection-of-beauty` folder; `audubon-birds` and
  `kunstformen-images` are 100% tagged. The bulk of the old gap (775)
  was closed by adding ~110 artists to `scripts/artists-db.json`; what
  remains is deliberate or unfixable-by-alias:
    - 2 of the 5 works with no `artist`. Nothing to match an alias
      against — they need per-artwork
      `metadata/movement-overrides.json` entries or year fallback.
    - 28 Boilly works. He has a db entry (so the five spelling
      variants collapse onto one artist page) but `movement: null` —
      his works here split evenly across 1781–1799 and 1803–1830, so
      per-work year fallback beats any single tag.
    - 17 pre-1500 works (van der Weyden, Uccello, Mantegna, Witz,
      Wolgemut, van der Goes, Carpaccio, Signorelli). The year already
      puts them on the "Gothic & Early Renaissance" floor. `assignEra`
      now keeps Renaissance-tagged works dated before 1500 there too;
      before that rule, tag routing sent 56 of them to the 1500s floor
      and left the ground floor with 17 works.
    - A few works by artists who died in or shortly before 1955
      (Bonnard, Tanguy). Their German term has ended. Works still in
      copyright are no longer catalogued; see "Copyright" below.
    - ~19 one-off minor or unidentified names.
