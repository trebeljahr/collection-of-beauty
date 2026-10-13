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
  in common keep the lead's own design. The pair's placements carry it
  as `Placement.frame`; without one the renderer uses `pickFrameDesign`.
  The slot's wall and lift come from that same frame, so read
  `Placement.frame` wherever a hall work's reach matters.
- A room has fittings besides its four walls: a ceiling height,
  freestanding divider walls and benches
  ([`fittings.ts`](src/lib/gallery-layout/fittings.ts)). They are
  planned from the room's footprint and the doors it has when all 24
  slots are open (`fittingsFor` in `layout-museum.ts`), so a room is
  fitted the same on every storey and its wall can be counted before a
  floor's doors are wired.
  - **Ceiling.** `RoomLayout.ceilingHeight`: 3.4 m when the narrow side
    is 10 m, 5.4 m when it is 17.5 m or more, 4.2 m between and in the
    stairwell. Walls still run to the slab above; the height sets the
    ceiling plane, the laylights and where the picture lights hang. The
    hang keeps a metre under the ceiling, so a 3.4 m room caps a work at
    2.4 m. It does not hang taller than 3.2 m under a taller ceiling.
  - **Dividers.** `RoomLayout.dividers`: segments on grid lines, drawn
    0.4 m thick (`divider-geometry.ts`). A long room (17.5 m or more,
    and 1.4 times its width) gets pairs of wing walls with the middle
    left open. A hall (17.5 m both ways) gets panels either side of its
    axis, stopped where a side door looks across. The Grand Hall gets
    none. No divider stands in a door's line of sight;
    `layout-museum.test.ts` checks it on a floor with every room open.
    A divider is four things, and a new one needs all four:
    1. blocked cell edges, written by `writeDividerEdges` after the
       room-ownership pass, which leaves edges inside one room free;
    2. a collider at its real thickness (`addFittingColliders`), since
       the edge mask alone stops the player 0.1 m inside the plaster;
    3. two runs in `computeRoomRuns`, one per face (`WallRun.divider`,
       `Placement.divider`), and a cut in the room wall a wing wall is
       built off. `dividerWallMetres` counts them when a floor decides
       how many rooms to open: the tower went from 116 rooms to 96;
    4. a wall for the picture light: `wallContextFor` takes the
       divider's face, so the pool stops at its ends.
    Laylights are cut where a divider reaches under them
    (`laylight-layout.ts`).
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
    One in each bay of a long room, two facing the panels of a hall, an
    island of two back to back in any other room 15 m or more across,
    two islands in the Grand Hall. None stands in the walking line
    between doors. A bench is smaller than a cell, so it is in no edge
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
    camera reaches 3.42 m and the lowest ceiling is at 4.0 m; a ceiling
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
- **A second floor plan sits behind `/gallery-3d?plan=block`**
  (`src/lib/gallery-layout/layout-block.ts`). The tower is the museum;
  the block plan exists so Rico can walk it and decide. One rectangular
  block, 117.5 × 62.5 m, on four floors. Its middle is a core of three
  halls, each 27.5 m square: the stair halls. Round the core runs a ring
  of twelve rooms, so the walk from room to room never crosses a stair
  hall. Rooms are the size of the tower's larger ones and take its
  dividers and benches. A floor holds two or three eras, dealt along a
  route that ends in the great hall. Each floor joins two neighbours of
  a row into one long gallery of 45 or 55 m (`BLOCK_PLAN[].merges`),
  differently on every floor, and a hall's square is one more gallery on
  the floors under its stair, so read a floor's rooms through
  `blockFloorRooms(floorIndex)` and never assume the twelve of the
  diagram. A great hall joined to its neighbour is hung like any long
  room: the composed hang needs one centred door. What follows from it:
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
  - **A floor can have several stair wells.** `floorShafts()` in
    `spiral-physics.ts` groups a floor's flights by centre;
    `findStairAbove` / `findStairBelow` stay within a well. The floor
    slab's colliders, the cutout rail, the gate signs and the stair
    hall's light are all built once per well. Do not reach for
    `floor.stairsOut[0]`. The block plan has had no spiral since
    12 October 2026 (next point); this code is what a plan that mixes
    the two would use.
  - **Each hall holds one grand stair and is open above it to the
    roof** ([`grand-stair.ts`](src/lib/gallery-layout/grand-stair.ts),
    drawn by `grand-staircase.tsx`). Middle hall, first floor to second:
    one flight to a half landing and two back along the sides. West
    hall, second to third: two curved flights round a rotunda. East
    hall, third to fourth: one straight flight that narrows to a landing
    at its waist. The way up goes through all three, and they stand next
    to one another (`BLOCK_HALLS`). They are in
    `FloorLayout.grandStairsIn` / `grandStairsOut` / `grandHalls` and
    `MuseumLayout.grandStairs`; `stairsIn` / `stairsOut` and
    `allStaircases` are empty there. Before changing one:
    - **Why one stair to a hall.** The first build stacked a stair of
      every storey in each of three 22.5 m halls. Rico found the halls
      cramped and low: the stair reached to within 3.3 m of the walls,
      and the underside of the next stair hung 5.8 m over every flight.
      A grand stair wants a hall it does not fill and nothing over it.
      `hasFlightAbove` / `hasFlightBelow` still build a stacked hall,
      and the tests cover it; the layout does not use it.
    - **The void is wider than the stair** (`StairOpening`, an outline
      of rectangles that touch, or a disc). Cut only to the stair's own
      footprint, most of the hall kept a 5.9 m ceiling and read as a
      room with a hole in it. A hall keeps 5 m of gallery inside its
      walls on the floors over its stair (`HALL_GALLERY`) and is open
      over the rest: over the hall floor in front of the middle stair,
      over twice the width of the east one. `topFloor` is how high the
      void goes; each floor between is a balcony, fenced all round.
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
    - Under a hall's lowest floor the same square is an ordinary room.
      Pass the visitor's feet height to `grandStairsAt` so that room is
      not taken for the hall.
    - A design is drawn in the hall's own frame, the visitor coming in
      from +z and the first flight rising toward -z, and turned by
      `turns` to face the hall's portal. Physics turns the point
      (`toStairLocal`), the renderer turns the group. Keep both.
    - The stair is masonry to its floor (`solid`): no floor under its
      first flight. The hall floor is walkable under any flight or
      landing with 2.3 m of headroom.
    - Rails are colliders, one short box per 0.7 m at its own height,
      because the capsule is put at the feet's height each frame. The
      floor collider's hole is 0.4 m wider than the opening: a visitor
      on a flight along the opening's edge passes the slab at shoulder
      height.
    - `RoomLayout.floorOpening` / `ceilingOpening` are the holes in a
      stair hall's floor and ceiling (`null` for none). Unset means a
      spiral's stairwell, cut round by rule. The top floor's ceiling is
      closed and glazed: a laylight over a rectangular void, the oculus
      over a round one.
    - A hall's centre is a flight or the open well. Send a visitor to
      `blockArrivalPoint()`, never to the room's centre.
    - In a hall the visitor counts as on its stair (`activeStairId`),
      on a flight or not, on any floor of it. The floor above and the
      floor below are then mounted in full where the hall reaches them,
      and every floor's stair halls always are: a hall shows four
      storeys at once. A stair hall mounted alone has a blind in each
      door to a room that is not (`mountedRooms` in `room-geometry.tsx`),
      or its doors would open on the scene's background. Measured
      headless on an M5: 250 to 810 draw calls in the halls, 960 in the
      55 m gallery.
  - **Benches stand on the room's own lines**
    (`feature-benches.ts`). `planBenches` seats a room from its
    footprint and doors, before the hang. It was made for the tower's
    1.4 m doors: here it seats the composed great hall and nothing with
    panels, where its nave benches come 5 cm too near a panel. Then:
    - a room with panels takes benches in line with a row of panels, in
      the middle of a gap between two of them, and in the middle of an
      aisle 8 m or more wide, opposite a panel (`planPanelBenches`,
      after the hang). Never in the line of a door in the wall beside
      it. Where there are more such places than benches, the ones in
      front of the largest works are taken;
    - a corner room, which no one walks straight through, takes an
      island of two on its centre (`centredIsland`).
    A pass that stood a bench in front of each large work, at the
    distance to see all of it, was walked and thrown out on 13 October
    2026: the benches landed in the 5 m aisle between a panel and the
    wall, off every line of the room. A bench is placed by the room, and
    the works decide only which of the room's places are used. "Largest"
    is by hung area: the listing has no measure of how well known a work
    is. The tower does not use this module.
  - Every band of the plan is an odd number of cells, which puts each
    door in the middle of a cell. The collision grid needs that. Room
    doors are 2.4 m, one cell edge, so they need no jamb colliders. The
    grid is 47 × 25: `computeBlockedEdges` takes `{ x, z }`.
  - An era is hung on its own (`hangZone`): the placer is given only
    its rooms, so spill cannot carry a work into another era. An
    artist's share of the wall goes to their sharpest scans
    (`selectFloorWorks` with a rank).
  - Changed on the way, both on 12 October 2026. `?plan=wings`, 12.5 m
    galleries in rings round a salon, 44 rooms a floor: rooms too
    small, too many, no dividers, too few doors between them. Then this
    block with its three stair halls in a row on the long axis and the
    stairs stacked (tag `museum-block-stacked-stairs-2026-10-12`): see
    "Why one stair to a hall", and the long axis ran through all three
    halls, so the way from room to room led round a stair.
  - Not built: works too large for a room on the stair halls' walls,
    signs at the stairs, ornament beyond balustrades, piers, carpet and
    lamp standards. The design, its sheets and Rico's reference
    photographs are in the vault notes
    `collection-of-beauty-museum-floor-plans.md` and
    `collection-of-beauty-museum-stair-references.md`.
- **How high things are, and what may hang.** Three numbers Rico set
  on 12 October 2026; a change to any of them changes
  `galleryLayoutIdentity`.
  - Ceilings (`world-coords.ts`): 4.0 m in a room 10 m wide or less,
    4.8 m as standard, 5.7 m in a hall. They were 3.4, 4.2 and 5.4 and
    felt low. The slab above is at 5.92 m, so 5.7 is near the limit;
    more height means a larger `FLOOR_SEPARATION` and a spiral with
    more steps.
  - `PAINTING_FLOOR_GAP` is 0.4 m, measured to the frame's bottom edge.
    A work's height cap is the ceiling less that gap and a metre for the
    frame's top rail and the picture light, and never more than 3.2 m.
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
- The stairwell hangs no works, so it has its own light
  (`stairwell-light.tsx`, geometry in `stairwell-light-rig.ts`), built
  the same way:
  - a plaster ceiling a storey up, with a glazed ring round the well.
    On the top floor the ring closes into an oculus;
  - six wall washers along each wall. Their pools are one mesh for the
    room. A fragment adds the can it stands under and that can's two
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
  - `frame-styles.ts`: 30 mouldings, from the Baroque leaf torus to a
    strip frame. Each is a builder. It takes the ornament for its sight
    moulding, its field and its crown, and two structural alternates, so
    one style yields dozens of profiles: a print mat comes 44 to 88 mm
    wide, single or double, with or without a line, in six frames. Many
    also take a flat liner inside them (`StyleOptions.liner`). A profile
    is shaded once per combination and cached.
  - `frame-design.ts`: which frame a work gets (`pickFrameDesign`). A
    design is a *look* (52: a moulding and the finishes it comes in),
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
    title (portrait, landscape, still life) bias it too, and so do size
    and shape: a narrow moulding goes to small works, a tabernacle frame
    to sacred subjects, a hanging scroll to an upright painting on silk
    and a flat mount to a wide one. Warmth comes from `colorBuckets`,
    because `dominantColor` calls nearly every painting warm brown. The pick is a weighted draw on a hash of the
    id, so the server, the browser and every visit agree. Everything it
    reads is in `ArtworkListing`, which `/api/artworks/museum` serves
    whole. Strip `colorBuckets`, `dominantColor`, `title` or
    `nationality` from that response and the frames stop matching their
    pictures, with no error.
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
    bottom extent (`frameDropOf`), not its reach: a scroll's roller
    hangs up to 23 cm below its painting.
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
    frame, a hanging scroll and an Oxford frame return `rails`: straight
    lengths along one side of the canvas, cut square and closed at the
    ends (`addRail`). Rails that cross must not share a surface: the
    Oxford frame's uprights stand 2 mm proud, and a tabernacle's
    entablature is taller at its inner face than the pilasters are
    deep. A style may also return `blocks`, a carved square on each
    corner (`addBlocks`).
  - `/gallery-3d/frames` is a debug sheet of works in their frames, lit
    as in the galleries: `?m=Baroque` for a school, `?look=hogarth` for
    a look, `?n=12&cols=4` for fewer and larger, `?page=2` for more.
- **Frame maps** (`frame-maps.ts`) are procedural: 13 tiling
  DataTextures built once when `frame-materials.ts` loads, 8.8 MiB on
  the GPU with mips, shared by every frame. Nothing is downloaded.
  - Surface maps tile in metres along the rail (u) and along the profile
    (v), so grain turns at each mitre: gold leaf in squares with a wear
    mask in alpha, walnut and ash with roughness in alpha, crazed
    lacquer, shippō silk in grey, canvas weave, paper.
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
  (`frame-env.ts`, the room gradient plus bright lamp spots), assigned in
  `RoomEnvironment`. A material can take less of it through
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
    Paused on the stairs, where two storeys are mounted in full. Given
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
    `FloorScene`). On the block plan a floor has three stair halls and
    so three shafts; their fittings are one group, drawn while any of
    the three is seen.
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
    (`SKIRTING_SINK`): the stairwell's floor lies 5 mm low, and the
    slit under its skirting showed the dark outside once the room
    behind was hidden.
  - Draw calls of the frame's own render on an M5 at 2560 × 1440,
    Baroque floor, one walk, culling off → on: 357 → 221 at the Grand
    Hall spawn, 666 → 446 along the hall, 859 → 403 across it, 1,151 →
    334 from the south-west room looking back, 1,325 → 382 half-way up
    the stair with two storeys mounted. Triangles fall with them
    (197,926 → 51,828 in the south-west room). On the block plan: 848 →
    302 from the great hall looking north through the stair hall, 970 →
    399 across a corner room, 912 → 210 half-way up the middle stair.
    53 poses picked at random on the Baroque floor went from 590 to 215
    on average. The mirror pass stays where it was: 150 to 240 draw
    calls on the tower, 220 to 450 on the block plan. The HUD's `rooms`
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

- 563 of 4,555 works lack `realDimensions`, all in the
  `collection-of-beauty` folder (28 September 2026). Every one was
  asked and has no answer (`null` in `metadata/artwork-dimensions.json`):
  neither Wikidata nor the Commons template gives a size. A plain run of
  `scripts/fetch-artwork-dimensions.mjs` asks for nothing more, so each
  needs a size researched by hand. Without a size the gallery layout
  falls back to a pixel-aspect estimate. Fix is data-side, not
  filter-tightening.
- Of the 3,992 works with a size, `trustworthyRealSize()` in
  [`real-size.ts`](src/lib/real-size.ts) hides 877 from the scale view,
  the JSON-LD and every caption. 862 are hidden by design: 644 Redouté
  sheet sizes on cut-out scans, 214 `series-default` print formats, 4
  Vesalius page sizes. 2 are Google Art Project template values, which
  have no knowable unit and no size on the museum's own record: the
  Philbrook lists only the frame of Copley's Portrait of a Lady, and the
  Glyptotek has no online record of David's Comte de Turenne. The other
  13 have a size the scan does not match: mostly a correct size on a
  cropped or mounted scan, which needs a full-frame scan, not a new
  number. Fixes go
  into `metadata/artwork-dimensions.json` with a researched `source`,
  never into `src/data/*.json`. The file's comments give each rule;
  `metadata/real-size-fixes-2026-09.md` gives the sources for past fixes.
- Hidden is not harmless. The 3D gallery sizes each painting from the
  raw `realDimensions` long edge (`sizeWork()` in `place-paintings.ts`),
  and the Grand Hall leads with the largest works. A value ten times too
  big, such as Malevich's Suprematism at 805 cm tall, would hang there.
- 100 paintings lack a `movement` tag (~2% of the corpus) — they fall
  through to year-based era assignment in
  [`gallery-eras.ts`](src/lib/gallery-eras.ts). All come from the
  `collection-of-beauty` folder; `audubon-birds` and
  `kunstformen-images` are 100% tagged. The bulk of the old gap (775)
  was closed by adding ~110 artists to `scripts/artists-db.json`; what
  remains is deliberate or unfixable-by-alias:
    - 25 anonymous works (no `artist`). Nothing to match an alias
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
