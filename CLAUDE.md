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
  `/artwork/[id]` detail page, `/api/newsletter/*` routes, and the SEO
  / JSON-LD generators. Anywhere a client component takes an artworks
  array, it should be `ArtworkListing[]`. Server pages pass
  `artworkListings` (the precomputed slim array) — passing `artworks`
  to a client component is a regression (3.4 MB into the RSC payload).
- `src/data/*.json` is generated. Don't hand-edit. Re-run
  `pnpm assets:build-data` after touching metadata or the build script.

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
