# Collection of Beauty

A public-domain art gallery built as a Next.js App Router site, with a
WebGL multi-floor museum, a curated weekly newsletter, and a pre-built
asset pipeline (no Next image optimizer in the hot path).

## Stack

- **Next.js 16** (App Router, Server Components, RSC)
- **R3F / Three.js** for the 3D gallery (`/gallery-3d`), lazy-loaded with `ssr: false`
- **Tailwind 4** + a small shadcn/ui-style `components/ui/` set
- **Biome** for format + lint, **vitest** for unit tests
- Pre-resized AVIF/WebP variants served from **Cloudflare R2** via `rclone`
- Deployed as a **standalone** Next build, packaged into a Docker image
  ([`Dockerfile`](Dockerfile)), pushed to GHCR by
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), pulled by **Coolify** via
  [`docker-compose.yml`](docker-compose.yml).

## First-time setup

```sh
pnpm install
pnpm dev   # Next on :3000 + a local asset server on :9837
```

`pnpm dev` spawns `scripts/serve-assets.mjs` alongside Next; it serves
`assets-web/` straight from disk on :9837 and replaced the old
rclone-in-docker container (`docker-compose.yml` now only describes the
deployed app). If you don't have `assets-web/` locally, point the site at
the production bucket instead — `pnpm dev:r2`, or set
`NEXT_PUBLIC_ASSETS_BASE_URL` yourself — otherwise the gallery pages
render with broken images.

## Asset pipeline

```
assets/                 # originals, untouched
  └── audubon-birds/foo.jpg ...
assets-web/             # pre-built variants emitted by shrink
  └── audubon-birds/foo/{256,480,640,960,1280,1920,2560,4096}.avif
                          1280.webp           # the ladder — every rung, every source
                          <fullW>.avif        # only when the full-size encode clears
                                              # FULL_SIZE_MIN_WIDTH (4096 px)
                          tiles/<level>/<col>_<row>.webp
                                              # deep-zoom pyramid, same condition
                          6144.avif           # 3D gallery close-up LOD, only when
                                              # <fullW> is strictly larger than 6144
src/data/               # baked JSON the runtime reads
  artworks.json, artists.json, ...
```

Commands:

| Command | What it does |
| --- | --- |
| `pnpm assets:shrink` | Build AVIF + WebP variants from `assets/` into `assets-web/`. Idempotent. |
| `pnpm assets:tiles` | Build Deep Zoom (DZI) tile pyramids for the ~967 sources that earned a full-size AVIF, so the lightbox can zoom to brushstroke level. Idempotent. Reads `src/data/artworks.json`, so run it **after** `assets:build-data`. |
| `pnpm assets:build-data` | Walk metadata + `assets-web/` and bake `src/data/*.json` consumed by every page. |
| `pnpm assets:sync` | Mirror `assets-web/` to the R2 bucket via rclone. |
| `pnpm assets:verify` | HEAD-check every catalogued variant against the public R2 URL. Run by hand; needs no R2 creds. Pass `--sample 200` for a smoke test, `--check-unshrunk` to also fail on `variantWidths===null` entries. |
| `pnpm assets:verify:bulk` | Same check but lists R2 in one `rclone lsf` pass and verifies set membership. ~10× faster than HEAD-spray; needs R2 creds from `.env.production`. This is the drift gate: `.husky/pre-push` runs it whenever `src/data/artworks.json` is part of the push (it replaced a CI job that false-failed on rate limits). |
| `pnpm assets:prepare` | The full chain: shrink → build-data → tiles → sync. |

You should run `pnpm assets:build-data` whenever you change metadata,
add an artwork, run the shrink pipeline against new originals, or
adjust the variant width ladder. Without it the runtime won't pick up
new variants.

## Development commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next dev server (Turbopack) + local asset server on :9837 fronting `assets-web/`. |
| `pnpm dev:r2` | Same dev server, but with `NEXT_PUBLIC_ASSETS_BASE_URL` set so `<picture>` URLs point at the production R2 bucket. Useful for spotting catalogue ↔ bucket drift before the pre-push check does. Skips the local :9837 server. |
| `pnpm build` | Production build (`output: "standalone"`). |
| `pnpm build:analyze` | Build with `@next/bundle-analyzer` enabled. HTML reports in `.next/analyze/`. |
| `pnpm start` | Run a built site locally. |
| `pnpm typecheck` | `next typegen`, then `tsc --noEmit` over `src/` + `tests/`, then again over `scripts/` via `tsconfig.scripts.json`. |
| `pnpm test` | Run the vitest suite (pure logic). |
| `pnpm test:watch` | Vitest in watch mode. |
| `pnpm test:coverage` | Coverage report (v8). |
| `pnpm format` / `pnpm lint` / `pnpm check` | Biome. |

The pre-commit hook (husky + lint-staged) runs `biome check --write`
on staged files only; the pre-push hook runs the R2 drift check, and
only when the catalogue changed. Typecheck and tests are gated in CI
(see [Deployment](#deployment)).

## Architecture quick map

- `src/app/` — App Router pages. The `/artwork/[id]` detail page and the
  newsletter edition pages read the full `Artwork` type server-side;
  anything handed to a client component is the slim `ArtworkListing`
  projection from `src/lib/data.ts`, which keeps the RSC payload small
  (artworks.json is ~6 MB).
- `src/components/gallery-3d/` — the WebGL museum. Lazy-loaded from
  `src/app/gallery-3d/gallery-3d-client.tsx`. Has its own readme in
  the directory headers — start with `index.tsx`.
- `src/components/gallery-3d/painting-registry.ts` — bounded raycast
  target list, so aim/click doesn't traverse hundreds of meshes.
- `src/components/gallery-3d/texture-cache.ts` — LRU + rAF-paced GPU
  upload queue for the painting textures.
- `src/lib/gallery-layout/` — pure functions that take an
  `ArtworkListing[]` and produce the museum's per-floor room layout,
  door positions, and painting placements. Covered by unit tests.
- `src/lib/seo.ts`, `src/app/sitemap.ts`, `src/app/robots.ts` — SEO
  surface. Sitemap is revalidated daily.
- `content/newsletter/NNNN-<theme>.md` — newsletter editions, one
  markdown file per issue. Frontmatter + body. The git history is the
  archive; there is no state file. See
  [`content/newsletter/README.md`](content/newsletter/README.md).
- `src/app/drops/` + `src/app/newsletter/` — the public archive. `/drops`
  is the index and `/newsletter/<slug>` the canonical edition page; the
  other half of each pair (`/newsletter`, `/drops/<slug>`) is a permanent
  redirect kept so older links resolve.
- `src/lib/newsletter/` — edition loader, email render, subscribe-flow
  HMAC + rate limit, ListMonk HTTP client.
- `src/app/api/newsletter/{subscribe,confirm}/` — only the
  user-facing double-opt-in routes. **Sending is CLI-only** — see
  `pnpm sendNewsletter`. There is no cron, no scheduled task, no
  send API route.
- `scripts/newsletter-draft.ts` / `scripts/newsletter-send.ts` — the
  CLI surface. `pnpm newsletter:draft <slug>` scaffolds a new issue;
  `pnpm sendNewsletter` sends the latest published issue against
  `.env.development` (the test list); `pnpm sendNewsletter <slug>`
  sends a specific issue; `--dry-run` renders without sending; prefixing
  `NODE_ENV=production` switches to `.env.production` (the live list).
  `pnpm newsletter:send` remains an alias. Env-file selection happens
  in `scripts/newsletter-send.sh`.

### ListMonk + SES

Subscriber storage and dispatch live in a self-hosted ListMonk instance
configured (by Hatchkit) to deliver via Amazon SES SMTP in eu-west-1.
The app never talks to SES directly — it talks to ListMonk's HTTP API,
which in turn fans out via SES. The double-opt-in confirmation email
is rendered from React Email (`emails/confirm-subscription.tsx`) and
dispatched through ListMonk's transactional template; weekly digests
go through ListMonk campaigns, which auto-substitute
`{{ UnsubscribeURL }}` per recipient.
Email image URLs always use the deployed assets bucket (or
`NEWSLETTER_ASSETS_BASE_URL`) so inboxes never receive localhost-only
image sources from local dev.
The visible sender is controlled by `LISTMONK_FROM`; replies go to
`LISTMONK_REPLY_TO` when set.

`hatchkit provision` creates the prod + dev lists, the API user, the
SES SMTP wiring, and all `LISTMONK_*` / `SES_*` env vars except the
two template ids. After provisioning, run `pnpm listmonk:bootstrap`
once to create the two passthrough templates the app needs; the
script prints the resulting `LISTMONK_TX_TEMPLATE_ID` and
`LISTMONK_CAMPAIGN_TEMPLATE_ID` to paste into both env files. See
`.env.example` for the full contract.

## Deployment

On push to `main`, CI first runs `pnpm typecheck` + `pnpm test`, then
builds the Docker image and pushes
`ghcr.io/trebeljahr/collection-of-beauty:latest`. Coolify pulls and
restarts on a webhook. No staging environment — the asset bucket and
the ListMonk instance are shared between dev and prod (separated by
list id), so `pnpm sendNewsletter --dry-run` is the pre-flight.

## Memory & onboarding for AI agents

See [`CLAUDE.md`](CLAUDE.md) for the per-project agent notes (worktree
conventions, gotchas, what NOT to touch).
