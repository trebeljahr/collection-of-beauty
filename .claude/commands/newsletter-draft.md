---
description: Curate a new newsletter edition — pick five visually varied works around a theme and scaffold the markdown file.
argument-hint: <theme description, e.g. "Japanese rain" or "interiors lit by one window">
---

You are curating a new edition of the Collection of Beauty newsletter — five public-domain works around a single idea, with editorial copy. The output is a markdown file under `content/newsletter/` with `draft: true`, ready for the user to review and send.

## Input

Theme from user: **$ARGUMENTS**

If the theme is empty or vague, ask the user for a one-sentence theme before doing anything else. Don't guess.

## Voice (non-negotiable)

Match the ricos.site house voice:

- Restrained, factual, specific. No hype words: no "stunning", "breathtaking", "must-see", "iconic", "masterpiece", "the future of".
- Concrete sensory detail over adjectives. "The post-rider's umbrella is the only solid shape" beats "a breathtaking depiction of resilience".
- Short sentences are fine. Fragments are fine.
- Prose, not bullets, in the editorial body. No emoji. No marketing voice.
- Open editorial copy on the theme, not the project. Don't write "this issue explores…" — just start.

## Steps

### 1. Confirm theme + angle

Restate the theme in one sentence. Propose 2–3 distinct angles the edition could take. Example for "Japanese rain":

- ukiyo-e woodblocks with falling rain lines (Hiroshige, Yoshida, Kawase Hasui)
- a wider net: any East Asian rain imagery across centuries and media
- night rain specifically — wet pavement, lamplight, reflections

Ask the user to pick before doing any selection work. The angle is what makes the edition feel curated rather than thematic-keyword-search.

### 2. Build the "already sent" set

Every artwork id ever referenced in `content/newsletter/*.md` (drafts included) is off-limits. Build the set:

```bash
grep -rhE "^\s*-\s*id:" content/newsletter/*.md 2>/dev/null \
  | sed -E 's/.*id:[[:space:]]*"?([^"#]+)"?.*/\1/' \
  | tr -d ' ' | sort -u
```

Keep this list. Cross-reference every candidate against it.

### 3. Search the catalogue

Full catalogue: `src/data/artworks.json` (~2,950 entries). Don't read the whole file — query with `jq`. Each entry has at minimum `id`, `title`, `artist`, `year`, `description`, `folder`, `width`, `height`, `realDimensions`, and often `tags`.

Useful patterns:

```bash
# Keyword in title or description (case-insensitive)
jq -c '.[] | select(((.title // "") + " " + (.description // "")) | ascii_downcase | test("rain|shower|monsoon"))' src/data/artworks.json | head -60

# By artist (exact match)
jq -c '.[] | select(.artist == "Utagawa Hiroshige")' src/data/artworks.json

# By year range
jq -c '.[] | select((.year // 0) >= 1830 and (.year // 0) <= 1860)' src/data/artworks.json

# By tag (when present)
jq -c '.[] | select((.tags // []) | index("seascape"))' src/data/artworks.json
```

Cast a wide net first (60–100 candidates), then prune. Drop anything in the already-sent set immediately.

### 4. Curate for visual variety + thematic coherence

Pick exactly **five** works. The theme must be unmistakable in every one of them. Within that, optimise for variety:

- **Palette varies.** Don't ship five sepia woodblocks or five blue seascapes. Aim for at least three distinct dominant palettes (e.g. high-key pastels, deep indigo + white, warm earth tones, monochrome ink, etc.).
- **Medium varies** where the theme allows. Oil, watercolour, woodblock print, drawing, natural-history plate, photograph. If the theme is single-medium by nature (e.g. ukiyo-e), vary composition density, palette, and time of day instead.
- **Orientation varies.** Mix portrait, landscape, and roughly square. Don't ship five horizontal panoramas.
- **Era spread** when the theme allows — span at least two centuries, schools, or geographies.
- **Artist diversity.** Never two works by the same artist unless the theme is explicitly that one artist.

If you're uncertain whether a candidate fits visually, view the image. Path pattern: `assets-web/<folder>/<basename>/960.webp` where `<basename>` is the `objectKey` without extension. Use the `Read` tool on the image file. Most artworks have a 960px variant; if not, try 640 or 1280.

Write down a one-line justification for each pick — what does it contribute to the variety constraint? You'll need this for the report at the end.

### 5. Scaffold the file

Derive a kebab-case slug from the theme. Constraints (enforced by the script): `^[a-z0-9][a-z0-9-]*$`. Examples: `japanese-rain`, `interiors-one-window`, `birds-of-america`. Keep it under 40 characters.

Run the scaffolder with the five explicit ids:

```bash
pnpm newsletter:draft <theme-slug> --title "Full title here" id1 id2 id3 id4 id5
```

The script:
- picks the next issue number (highest existing + 1, zero-padded)
- writes `content/newsletter/NNNN-<slug>.md` with `draft: true`
- validates that all five ids exist in the catalogue
- refuses to overwrite an existing file

If the script errors on a slug collision or unknown id, fix and retry.

### 6. Fill in the file

The scaffolded file has placeholder frontmatter and a `TODO` body. Edit it:

- **`title`**: short and specific. "Japanese rain" — good. "An exploration of rain in Edo-period woodblock printing" — too long.
- **`subject`**: usually `Issue NN — <title>`. This is the email subject line; keep it under ~60 chars.
- **`excerpt`**: one sentence, ~140 chars. Used for OG tags and the archive index. State what the issue contains in concrete terms, not why it's beautiful.
- **`tags`**: 2–4 lowercase kebab-case tags. E.g. `ukiyo-e`, `weather`, `edo-period`.
- **`cover`**: leave it pointing at the lead artwork (the first id), or swap to the work that has the strongest single image at small sizes.
- **Per-artwork `note:`** blurbs — uncomment the `# note:` line for each work and write one to three sentences. Anchor in something specific you can see. Not "this striking work depicts a rainy scene" — instead "Three figures lean into the same diagonal, the only verticals are the umbrella ribs."
- **Body (editorial intro)**, replacing the `TODO` paragraph: two to four short paragraphs threading the five works together. Open on the theme, not the project. Mention specific works by their painters. End on a small observation, not a sign-off. Plain markdown prose, no headings.

### 7. Do not flip the draft flag

Leave `draft: true`. The user reviews and flips manually before sending. Don't run any `pnpm newsletter:send` command.

### 8. Report

Output a short summary:

- the scaffolded file path
- the five chosen artworks (`id` — short title — artist) with the one-line variety justification for each
- the three CLI commands the user runs next:
  - `pnpm newsletter:send <fileSlug>` — dry run
  - `pnpm newsletter:send <fileSlug> --confirm` — sends to `MAILGUN_TEST_LIST` (any non-production NODE_ENV picks the test list)
  - `NODE_ENV=production pnpm newsletter:send <fileSlug> --confirm` — real send to `MAILGUN_LIST`

## Hard rules

- Never reuse an id that grep returned in step 2.
- Never pick five works that share a single dominant colour.
- Never write hype language or marketing voice into the file.
- Never flip `draft: true` → `false`. That's the user's call.
- Never run `pnpm newsletter:send` — sending is a manual user step on a machine with decrypted `.env.local`.
- If you can't find five works that satisfy both the theme and the variety constraints, stop and tell the user. Don't ship a weak edition to hit the count.
