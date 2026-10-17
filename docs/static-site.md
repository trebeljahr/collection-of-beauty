# The static site on Cloudflare Workers

collectionofbeauty.com is a Next static export (`output: "export"`) served
by two Cloudflare Workers. Design and the reasons for each choice:
`ai-work-notes/projects/collection-of-beauty/collection-of-beauty-cloudflare-static-design-2026-10-15.md`.

| Worker | Code | Serves |
| --- | --- | --- |
| `collection-of-beauty` | none, assets only ([`wrangler.jsonc`](../wrangler.jsonc)) | every page, chunk and data file in `out/` |
| `collection-of-beauty-api` | [`workers/api`](../workers/api) | `/api/newsletter/*` (double opt-in) and `/api/download/*` (one variant with a filename) |

Requests to static files are not counted against the Workers quota; each
newsletter or download request is.

## What replaced the server

- **Pages.** Every artwork, artist, era, colour, plate set and published
  edition is prebuilt (`generateStaticParams`, `dynamicParams = false`).
  No page reads `searchParams`: `/play`, `/sub/*` and the frames sheet
  read the query in the browser.
- **Data.** What `/api/artworks/page`, `/scope`, `/timeline/*`,
  `/surprise` and `/not-found` computed per request is prebuilt under
  `/data/` (`src/app/data/**`, keys in
  [`src/lib/static-data/keys.ts`](../src/lib/static-data/keys.ts)).
  A search is answered in the browser by the same ordering code
  ([`artwork-order.ts`](../src/lib/artwork-order.ts),
  [`timeline-core.ts`](../src/lib/timeline-core.ts)) over
  `/data/museum.json`. `/api/artworks` stays as the public dataset.
- **Redirects and headers.** [`scripts/static-routing.mjs`](../scripts/static-routing.mjs)
  holds next.config's old list; [`scripts/write-static-routing.mts`](../scripts/write-static-routing.mts)
  adds the press kit, plate-set ZIPs, renamed ids and edition aliases and
  writes `out/_redirects` and `out/_headers`, checking Cloudflare's limits.
  A misspelt artwork or artist URL is moved on by the 404 page
  ([`static-data/not-found.ts`](../src/lib/static-data/not-found.ts)).
- **Plate-set ZIPs.** Built once by `pnpm collections:zips`, published to
  the asset bucket at `/downloads/v1/<sha256>/<name>.zip`
  (`scripts/publish-collection-zips.sh`, then
  `node scripts/collection-zips.mjs --verify --mark-published`), and
  linked through `/api/collections/<slug>`.
- **Release skew.** Each upload carries the hashed chunks of the two
  releases before it ([`scripts/carry-static.mjs`](../scripts/carry-static.mjs),
  `/release-assets.json`). Open tabs poll `/releases.json` and reload once
  their release has dropped out.

## Deploys

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):

1. `build` exports, carries, compiles the API Worker's data
   (`pnpm api:data`) and runs `wrangler versions upload --tag <sha>` for
   both Workers. Nothing is live.
2. `deploy` ([`scripts/worker-release.mjs`](../scripts/worker-release.mjs))
   activates the API Worker, then the site, and requires
   `scripts/verify-release.mjs` to see the commit; on failure it puts both
   previous versions back.

A one-step `wrangler deploy` left seconds of 404s on new chunks on the
canary; keep upload and activation apart. Do not mark `/_next/static/*`
immutable in `_headers`: the rule also covers 404s, which the edge and the
browser then keep for a year.

Rollback: dispatch `deploy` with the earlier commit, or
`npx wrangler versions deploy <version>@100% -c <config>`.

Secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts edit on the account; it
never touches routes) and `CLOUDFLARE_ACCOUNT_ID`, beside the existing
`DOTENV_PRIVATE_KEY_PRODUCTION`. The API Worker's own secrets are set once
with `wrangler secret put` (see its README).

## Routes and zone settings

Made once through the Cloudflare API, not by `wrangler`, so the deploy
token needs no route permission and a deploy never moves one. Zone
`collectionofbeauty.com`:

| Pattern | Worker |
| --- | --- |
| `collectionofbeauty.com/*` | `collection-of-beauty` |
| `collectionofbeauty.com/api/newsletter/*` | `collection-of-beauty-api` |
| `collectionofbeauty.com/api/download/*` | `collection-of-beauty-api` |
| `collectionofbeauty.com/.well-known/acme-challenge/*` | none: the origin, while Traefik holds a certificate |

Redirect rules: `www.collectionofbeauty.com` → apex, and `http://` →
`https://` except the ACME path (a Worker on a route answers plain HTTP
itself). `beauty.trebeljahr.com` → apex is a rule on the `trebeljahr.com`
zone. Deleting the `collectionofbeauty.com/*` route sends the site back to
the origin within seconds.

## Limits

Workers Paid: 100,000 files per version, 25 MiB per file;
`write-static-routing.mts` fails the build past either. The export is about
44,000 files, most of them the eight files Next writes per artwork page, so
Workers Free (20,000) does not fit it.

## Local

- `pnpm build && pnpm preview` serves `out/` with `_redirects` and
  `_headers` applied, as the Worker does.
- `pnpm dev:api` runs the API Worker; `pnpm dev` proxies its two paths.
