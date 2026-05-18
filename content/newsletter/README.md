# Newsletter editions

One markdown file per edition. The filename **is** the issue identity:
`NNNN-<theme-slug>.md` where NNNN is a zero-padded 4-digit issue number.

Examples:

- `0001-spring-light.md`
- `0042-japanese-rain.md`
- `0137-birds-of-america.md`

## Workflow

The intended flow is **semi-automatic, manual send**:

1. `pnpm newsletter:draft <theme-slug>` (or run `/newsletter-draft` in
   Claude Code for a guided, themed pick) → scaffolds a new file with
   `draft: true` and 5 candidate artwork ids.
2. Edit the file: refine artwork picks, write the editorial intro
   (markdown body), add per-artwork `note:` blurbs, set `excerpt` and
   `subject`.
3. Flip `draft: true` → `draft: false`.
4. `pnpm newsletter:send <slug>` — dry run, prints summary.
5. `pnpm newsletter:send <slug> --confirm` — sends via ListMonk's
   campaign API to `LISTMONK_TEST_LIST_ID` (a ListMonk list with only
   your address). The destination list is decided by `NODE_ENV`, not by
   a flag, so any non-production shell hits the test list.
6. `NODE_ENV=production pnpm newsletter:send <slug> --confirm` — real
   send to `LISTMONK_LIST_ID`. Only this incantation can reach actual
   subscribers; without `NODE_ENV=production` the script refuses to
   resolve the live list.

There is **no** API send route and **no** cron job. Sending happens
exclusively from the CLI on a machine with a decrypted `.env.local`.

## Frontmatter

```yaml
---
title: "Spring light in early Impressionism"   # required, also default subject
subject: "Issue #1 — Spring light"             # optional, overrides email subject
publishedAt: "2026-05-17"                       # required, ISO date
excerpt: "One paragraph for OG tags and the archive index."  # required
draft: false                                    # optional, default false
cover:                                          # optional; defaults to artworks[0]
  artworkId: "claude-monet-impression-sunrise"
  alt: "Sunrise over Le Havre, 1872"           # optional override
# Alternatively: cover: { src: "/path/foo.webp", alt: "..." } for non-artwork covers.
tags:                                           # optional
  - "impressionism"
  - "spring"
artworks:                                       # exactly 5 entries
  - id: "claude-monet-impression-sunrise"
    note: "Optional editorial blurb shown below this artwork."
  - id: "berthe-morisot-the-cradle"
  - id: "..."
  - id: "..."
  - id: "..."
---

Markdown body — the editorial intro for this issue. Two to four
paragraphs that thread the five works together.
```

Reading time is derived from the body word count (~225 wpm) at parse
time — no need to set it manually.

## "Already sent" tracking

The `sentArtworkIds()` function in `src/lib/newsletter/editions.ts`
walks every `.md` file in this directory (drafts included) and collects
every artwork id ever referenced. That set is the input to the drafting
helper's "pick 5 unsent works" logic. Git history is the durable
archive — no R2 state file, no database.
