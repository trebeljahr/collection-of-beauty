# collection-of-beauty-api

The part of collectionofbeauty.com that is not a static file. It runs on two
routes of the `collectionofbeauty.com` zone; the rest of the host is the
assets-only Worker `collection-of-beauty` (`docs/static-site.md`).

| Route | Does |
| --- | --- |
| `POST /api/newsletter/subscribe` | JSON `{ email, website }`. Answers `{ ok }` for every valid address, before ListMonk is asked about it, then mails either the confirmation link or an "already on the list" note (`ctx.waitUntil`). `{ error, message }` with 400, 429, or 502 when ListMonk's health check fails. |
| `GET /api/newsletter/confirm?token=…` | Links sent before November 2026. Seals the token and answers 303 → `/sub/confirm?token=…`. Changes nothing. |
| `POST /api/newsletter/confirm?token=…` | The button on `/sub/confirm`. Adds the address to the list as `confirmed` and sends the latest edition as a welcome, with a signed unsubscribe link and `List-Unsubscribe` headers; 303 → `/sub/confirmed[?welcome=1]`, errors 303 → `/sub/error?reason=…`. |
| `GET /api/newsletter/unsubscribe?token=…` | The welcome copy's `List-Unsubscribe` address. 303 → `/sub/unsubscribe?token=…`. Changes nothing. |
| `POST /api/newsletter/unsubscribe?token=…` | The page's button (303 back to the page) or a mail client's RFC 8058 one-click (200, 400 or 500). |
| `GET /api/download/<id>?w=<width>&f=<avif\|webp>` | Pipes one variant from the asset host with `Content-Disposition: attachment` and a filename. Only files the catalogue lists. |

These are the Next route handlers the site had until it became a static
export, ported on 11 November 2026 (`src/app/api/newsletter/*` in git
history). The ListMonk client and token code are the send CLI's own
(`src/lib/newsletter/listmonk.ts`, `tokens.ts`), reached through
`process.env` under `nodejs_compat`. Rate limit: 5 subscribe posts a minute
per client IP, an IPv6 client by its /64 (`SUBSCRIBE_LIMITER`). Logs and
error reports carry no address and no IP. Errors go to GlitchTip when
`SENTRY_DSN` is set (`src/report.ts`).

## Build-time data

`pnpm api:data` (`scripts/build-api-worker-data.ts`) writes
`generated/emails.json` (the confirmation, already-subscribed and welcome
emails, rendered by `src/lib/newsletter/worker-emails.ts` with placeholders
for the per-recipient tokens) and
`generated/downloads.json` (the catalogue's downloadable files). Both are
gitignored and rebuilt by every deploy, so a new edition or a re-shrunk work
reaches the Worker with the next push.

## Secrets

From the encrypted `.env.production`, by CI, never printed: dispatch the
**Site on Cloudflare** workflow with operation `secrets`
(`scripts/api-worker-secrets.mjs` piped into `wrangler secret bulk`). Run it
once at the cutover and again after a value changes; each run deploys a new
version of the API Worker with the code it already runs. Required:
`LISTMONK_URL`, `LISTMONK_API_USER`, `LISTMONK_API_TOKEN`, `LISTMONK_LIST_ID`,
`LISTMONK_TX_TEMPLATE_ID`, `LISTMONK_FROM`, `NEWSLETTER_TOKEN_SECRET`; also
set when present: `LISTMONK_REPLY_TO`, `SES_FROM_EMAIL`, `SENTRY_DSN`.

`NEWSLETTER_TOKEN_SECRET` must stay the value the Next server used, or every
confirmation and unsubscribe link already in an inbox fails.

## Local

```sh
pnpm dev:api        # wrangler dev on :8790, with a .dev.vars beside this file
pnpm dev            # proxies /api/newsletter and /api/download to it
```

`.dev.vars` (gitignored) holds the same names; point `LISTMONK_LIST_ID` at
the test list from `.env.development`.

Tests run with the repository's suite: `pnpm exec vitest run workers`.
