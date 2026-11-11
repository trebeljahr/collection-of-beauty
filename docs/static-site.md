# The static site on Cloudflare Workers

collectionofbeauty.com is a Next static export (`output: "export"`) served
by two Cloudflare Workers. Design and the reasons for each choice:
`ai-work-notes/projects/collection-of-beauty/collection-of-beauty-cloudflare-static-design-2026-10-15.md`.

| Worker | Code | Serves |
| --- | --- | --- |
| `collection-of-beauty` | none, assets only ([`wrangler.jsonc`](../wrangler.jsonc)) | every page, chunk and data file in `out/` |
| `collection-of-beauty-api` | [`workers/api`](../workers/api) | `/api/newsletter/*` (signup, confirm, unsubscribe) and `/api/download/*` (one variant with a filename) |

Requests to static files are free and unlimited on every Workers plan,
and have no requests-per-second limit; each newsletter or download
request counts as a Worker request. On Workers Free that is 100,000 a day
across the account and 10 ms of CPU each (so the emails are rendered at
build time), and 20,000 files per upload, which the export does not fit.
On Workers Paid ($5 a month, account-wide): 100,000 files, no daily cap,
10 million requests a month included.

## What replaced the server

- **Pages.** Every artwork, artist, era, colour, plate set and published
  edition is prebuilt (`generateStaticParams`, `dynamicParams = false`).
  No page reads `searchParams`: `/play`, `/sub/*` (the confirm and
  unsubscribe buttons included) and the frames sheet read the query in
  the browser.
- **Newsletter.** The Next route handlers became the API Worker
  (`workers/api/src/newsletter.ts`, same behaviour as on 11 November 2026):
  signup answers before ListMonk is asked about the address and mails
  through `ctx.waitUntil`, confirm is a button that posts, unsubscribe
  takes the page's button and RFC 8058 one-click. Emails are rendered at
  build time with placeholders for the tokens
  (`src/lib/newsletter/worker-emails.ts`).
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

Nothing runs until the repository variable
`COLLECTION_OF_BEAUTY_SITE_ROLLOUT_MODE` is set: `manual` uploads on push
and waits for a dispatch of `deploy`; `automatic` uploads, activates and
verifies. Unset, a push changes nothing anywhere: the Coolify app keeps
serving its last image until the routes below move the site.

Two dispatch operations exist for the cutover and after it: `activate`
turns a commit's uploaded versions on without the HTTP check (before the
routes below exist, the public site is still Coolify and cannot show the
commit; with no route, nothing a visitor sees changes), and `secrets` sets
the API Worker's secrets from `.env.production` (see `workers/api/README.md`).

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

## Press kit

`public/press-kit.zip` (about 35 MB, over the 25 MiB a Workers static file
may be) is a local build output, gitignored, and never uploaded: while
`scripts/press-kit-download.json` says `"published": true`, `_redirects`
answers `/press-kit.zip` with a 307 to the content-addressed object
`/downloads/v1/<sha256>/collection-of-beauty-press-kit.zip` on the asset
host, which serves ranges for resumed downloads. With `"published": false`
the path is a 404. Published 2026-10-05, on 2026-10-17 with the
block-plan screenshots, and on 2026-11-02 with the current English titles
in its credits (each object verified by full SHA-256 from the public
origin). To publish a changed press kit, with release authorization:

1. `pnpm marketing:press-kit-zip`. It reads the vault's press-kit note, so it
   runs on Rico's machine. Changed bytes write a new `sha256`, `bytes` and
   `path` to the metadata and set `"published": false`; the same bytes change
   nothing.
2. `pnpm exec dotenvx run -f .env.production -- bash scripts/publish-press-kit.sh`
   (the local zip must match the metadata; append-only
   `rclone copyto --immutable`, attachment and immutable headers).
3. `node scripts/press-kit-download.mjs --full`: status, length, attachment,
   ranges, caching and the full SHA-256 from the public origin.
4. Set `"published": true`, commit, deploy.

CI runs `press-kit-download.mjs --ci` before a build: the metadata must say
`"published": true`, and the object must pass every check of step 3, full
SHA-256 included. To release while a rebuild waits, restore the last
published metadata: its object is still there. `scripts/sync-assets.sh`
excludes `downloads/**`, because `rclone sync` would delete these objects
(the plate-set ZIPs live there too). Never delete a published object; a new
press kit gets a new SHA path. Confirm the production `R2_ASSETS_BUCKET`
serves `https://assets.collectionofbeauty.com` before step 2.

## Limits

Workers Paid: 100,000 files per version, 25 MiB per file;
`write-static-routing.mts` fails the build past either. The export is about
44,000 files, most of them the eight files Next writes per artwork page, so
Workers Free (20,000) does not fit it.

## Local

- `pnpm build && pnpm preview` serves `out/` with `_redirects` and
  `_headers` applied, as the Worker does.
- `pnpm dev:api` runs the API Worker; `pnpm dev` proxies its two paths.
