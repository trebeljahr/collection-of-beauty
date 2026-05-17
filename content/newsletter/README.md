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
5. `pnpm newsletter:send <slug> --test` — sends to `MAILGUN_TEST_LIST`
   (a Mailgun list with only your address).
6. `pnpm newsletter:send <slug> --confirm` — real send to
   `MAILGUN_LIST`.

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

## "Already sent" tracking

The `sentArtworkIds()` function in `src/lib/newsletter/editions.ts`
walks every `.md` file in this directory (drafts included) and collects
every artwork id ever referenced. That set is the input to the drafting
helper's "pick 5 unsent works" logic. Git history is the durable
archive — no R2 state file, no database.
