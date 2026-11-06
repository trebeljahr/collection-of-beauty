# Newsletter delivery: ListMonk and SES

Subscriber storage and dispatch live in a self-hosted ListMonk instance
configured (by Hatchkit) to deliver via Amazon SES SMTP in eu-west-1.
The app never talks to SES directly — it talks to ListMonk's HTTP API,
which in turn fans out via SES. The double-opt-in confirmation email
is rendered from React Email (`emails/confirm-subscription.tsx`) and
dispatched through ListMonk's transactional template, as is the note a
confirmed subscriber gets in its place (`emails/already-subscribed.tsx`); digests
go through ListMonk campaigns, which auto-substitute
`{{ UnsubscribeURL }}` per recipient. The welcome issue is transactional,
where ListMonk substitutes no such link, so it carries a signed link to
`/sub/unsubscribe`.
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
[`.env.example`](../.env.example) for the full contract.
