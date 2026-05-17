# Collection of Beauty

A public-domain art gallery built as a Next.js App Router site, with a
WebGL multi-floor museum, a curated Mailgun newsletter, and a pre-built
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
docker-compose up -d assets   # rclone-backed asset server at :9100
pnpm dev                       # Next on :3000
```

The dev server expects `NEXT_PUBLIC_ASSETS_BASE_URL` (or the docker
asset server above) to be reachable, otherwise the gallery pages will
render with broken images.

## Asset pipeline

```
assets/                 # originals, untouched
  └── audubon-birds/foo.jpg ...
assets-web/             # pre-built variants emitted by shrink
  └── audubon-birds/foo/{256,480,640,960,1280,1920,2560,4096}.avif
                          1280.webp
src/data/               # baked JSON the runtime reads
  artworks.json, artists.json, ...
```

Commands:

| Command | What it does |
| --- | --- |
| `pnpm assets:shrink` | Build AVIF + WebP variants from `assets/` into `assets-web/`. Idempotent. |
| `pnpm assets:build-data` | Walk metadata + `assets-web/` and bake `src/data/*.json` consumed by every page. |
| `pnpm assets:sync` | Mirror `assets-web/` to the R2 bucket via rclone. |
| `pnpm assets:prepare` | The full chain: shrink → build-data → sync. |

You should run `pnpm assets:build-data` whenever you change metadata,
add an artwork, run the shrink pipeline against new originals, or
adjust the variant width ladder. Without it the runtime won't pick up
new variants.

## Development commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next dev server (Turbopack). |
| `pnpm build` | Production build (`output: "standalone"`). |
| `pnpm build:analyze` | Build with `@next/bundle-analyzer` enabled. HTML reports in `.next/analyze/`. |
| `pnpm start` | Run a built site locally. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm test` | Run the vitest suite (pure logic). |
| `pnpm test:watch` | Vitest in watch mode. |
| `pnpm test:coverage` | Coverage report (v8). |
| `pnpm format` / `pnpm lint` / `pnpm check` | Biome. |

The pre-commit hook (husky + lint-staged) runs `biome check --write`
on staged files only.

## Architecture quick map

- `src/app/` — App Router pages. The `/artwork/[id]` detail page imports
  the full `Artwork` type; every other route uses the slim
  `ArtworkListing` projection from `src/lib/data.ts` to keep the RSC
  payload small (artworks.json is ~3.4 MB).
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
- `src/app/newsletter/` — public archive index + per-edition pages.
- `src/lib/newsletter/` — edition loader, email render, subscribe-flow
  HMAC + rate limit, Mailgun client.
- `src/app/api/newsletter/{subscribe,confirm}/` — only the
  user-facing double-opt-in routes. **Sending is CLI-only** — see
  `pnpm newsletter:send`. There is no cron, no scheduled task, no
  send API route.
- `scripts/newsletter-draft.ts` / `scripts/newsletter-send.ts` — the
  CLI surface. `pnpm newsletter:draft <slug>` scaffolds a new issue;
  `pnpm newsletter:send <slug> [--test|--confirm]` renders and sends.

## Deployment

CI builds the Docker image on push to `main` and pushes
`ghcr.io/trebeljahr/collection-of-beauty:latest`. Coolify pulls and
restarts on a webhook. No staging environment — the asset bucket and
the Mailgun account are shared between dev and prod, so a careful
local `--dry-run` is the only pre-flight.

## Memory & onboarding for AI agents

See [`CLAUDE.md`](CLAUDE.md) for the per-project agent notes (worktree
conventions, gotchas, what NOT to touch).
