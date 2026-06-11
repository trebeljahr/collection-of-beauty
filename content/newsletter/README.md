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
4. `pnpm sendNewsletter --dry-run` — renders the latest published issue
   without sending.
5. `pnpm sendNewsletter` — sends the latest published issue via
   ListMonk's campaign API to the test list from `.env.development`.
   Use `pnpm sendNewsletter <slug>` to send a specific issue.
6. `NODE_ENV=production pnpm sendNewsletter` — real send to the live
   `LISTMONK_LIST_ID` from `.env.production`. Use
   `NODE_ENV=production pnpm sendNewsletter <slug>` to send a specific
   published issue.

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

## Links in editorial copy

Use ordinary markdown links in `note:` strings and in the body. Link
specialised art terms the first time they appear when a reader may need
the term defined, and prefer the precise Wikipedia article for the
technical sense. Example: `[bokashi](https://en.wikipedia.org/wiki/Bokashi_(printing))`
for Japanese print gradation.

When a sentence names an **artist who is in the catalogue**, link the
site's own artist page instead of Wikipedia: `[Poussin](/artist/nicolas-poussin)`.
Check `src/data/artists.json` for the slug. Wikipedia stays the right
target for people *not* in the collection (patrons, critics, publishers,
scientists) and for artists the catalogue doesn't hold. Site-rooted links
are absolutized automatically in the email and RSS render paths.

Cross-link editions only when the sentence names a real visual or
technical parallel, using archive paths such as
`[Japanese rain](/newsletter/0002-japanese-rain)`. Do not turn common
theme words into links.

## "Already sent" tracking

The `sentArtworkIds()` function in `src/lib/newsletter/editions.ts`
walks every `.md` file in this directory (drafts included) and collects
every artwork id ever referenced. That set is the input to the drafting
helper's "pick 5 unsent works" logic. Git history is the durable
archive — no R2 state file, no database.
