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
  to a client component is a regression (3.4 MB into the RSC payload).
- `src/data/*.json` is generated. Don't hand-edit. Re-run
  `pnpm assets:build-data` after touching metadata or the build script.
- `Artwork.dominantColor` (whole-image average) is for placeholder tints
  only. Browse-by-colour uses `Artwork.colorBuckets` — up to three
  colour families read from a *pixel histogram* of the smallest variant.
  The average is useless for hue filtering: it collapses ~all 4,571
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
  (median red strength across the 810 red works is 0.049), so without the
  ranking the family pages open on works with a red accent.
  `colorStrength` is **server-only on purpose** — it is not in
  `ArtworkListing`; read it via `colorStrength()` / `sortByColorStrength()`
  in [`src/lib/artwork-colors.ts`](src/lib/artwork-colors.ts). Do not
  compare strengths across families: `blue: 0.3` is not "more" than
  `gold: 0.5`, since the corpus is full of gold. That comparison is what
  the prior-normalised score exists for.
- `PROBE_CACHE_VERSION` in `build-data.mjs` gates the image-probe cache.
  Bump it whenever the probe emits a new field, or every cached entry
  silently keeps the old shape (this is why v3 exists).

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

## Deep zoom (tiled lightbox)

- ~967 works have a source bigger than the standard variant ladder. For
  those, `pnpm assets:shrink` emits a per-source full-resolution AVIF
  (capped at 16384 px on the long side) **and** `pnpm assets:tiles`
  emits a DZI pyramid at
  `assets-web/<folder>/<basename>/tiles/<level>/<col>_<row>.webp`.
- The pyramid exists because that full-size AVIF is unusable as a single
  image: median ~124 megapixels (up to 265), which is a ~500 MB decode
  and past the decode ceiling mobile Safari enforces. The lightbox used
  to fetch it eagerly on open — p50 4.3 MB, max 89 MB. It no longer does
  for tiled works; see the skip in `lightbox.tsx`'s preload effect.
- **Availability is derived, not stored.** A work has tiles exactly when
  `max(variantWidths) > 4096`, which every client already receives via
  `ArtworkListing`. Don't add a `hasTiles` field — it would be redundant
  bytes in the RSC payload on every gallery page.
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
- The pendant lamp fixture lives in `lamp-fixture.tsx`. Geometry is
  module-scope so room swaps don't reallocate buffers.

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
- **Sending**: CLI only. `pnpm newsletter:send <slug>` is a dry-run
  against `.env.development` (test list). `pnpm newsletter:send <slug>
  --confirm` sends via ListMonk's campaign API to that test list;
  `NODE_ENV=production pnpm newsletter:send <slug> --confirm` switches
  to `.env.production` (live list). `scripts/newsletter-send.sh` picks
  the env file based on `NODE_ENV`. No API route, no cron job. Sending
  requires the relevant `.env.*` file decrypted on the user's machine.
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
- The public archive lives at `/newsletter` (index) and
  `/newsletter/<slug>` (per-edition magazine-style page). Both are
  in the sitemap. Drafts never reach the public surface.

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

## Commits

Concise subject, no Co-Authored-By footer, no AI attribution. Focus on
the *why* rather than the *what* — the diff already shows the what.

## Tests

`pnpm test` runs vitest. Coverage is intentionally narrow — pure
functions in `src/lib/` are the target. React component tests aren't
set up; if you need one, scaffold a Testing Library setup separately.

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

- ~937 paintings lack `realDimensions` — gallery layout falls back to a
  pixel-aspect estimate. Fix is data-side (Wikidata fetch), not
  filter-tightening. See `~/.claude/projects/.../memory/project_dimension_gap.md`.
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
      Wolgemut, van der Goes, Carpaccio, Signorelli). Tagging them
      Renaissance / Northern Renaissance would *promote* them off the
      "Gothic & Early Renaissance" floor onto the 1500–1599 one, which
      is worse than where the year already puts them. A first pass
      added a Rogier van der Weyden entry and did exactly that to his
      eight 1435–1490 works; it was removed.
    - 11 works by artists who died after 1955 (Escher, Metzinger,
      Bonnard, de Chirico, Tanguy, Keith…). Every db entry asserts
      `pd_status: public_domain_worldwide`; don't add one for an
      artist where that isn't true.
    - ~19 one-off minor or unidentified names.
