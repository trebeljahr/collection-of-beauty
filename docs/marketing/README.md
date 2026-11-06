# Marketing images

Every image used to show Collection of Beauty outside the site: the press
kit, the README, and the GitHub social preview card. Each set is made by a
script, so it can be made again after the collection or the museum changes.
[`manifest.json`](manifest.json) lists every file with its pixel size, bytes,
SHA-256, source and the script that writes it (`pnpm marketing:manifest`).

The press images, the museum screenshots and screenshots of the site are CC0,
as the [press page](https://collectionofbeauty.com/press) states. The works
in them are in the public domain.

## Where the files are

| Folder | What | Made by |
| --- | --- | --- |
| [`public/marketing/`](../../public/marketing/) | Press images and museum screenshots. The site serves them at `/marketing/<file>`, and `/press-kit.zip` holds them all. | `pnpm marketing:images`, `pnpm marketing:screenshots` |
| [`screenshots/`](screenshots/) | Screenshots of the 2D site, for the README. | `pnpm marketing:site-screenshots` |
| [`social-preview/`](social-preview/) | The GitHub social preview card, four options, and the works each shows. | `pnpm marketing:social-preview` |

`public/marketing/` belongs to its two scripts: `pnpm marketing:images`
deletes every file in it except the museum screenshots before it writes the
kit. Keep other files out of it.

## Press images

Made by [`scripts/build-marketing-images.mjs`](../../scripts/build-marketing-images.mjs),
last rendered on 16 September 2026. The same public-domain works hang whole
on a plain wall, in justified rows, in each format. Every file has a
`-large.jpg` twin at twice the size (up to 5,120 px).
[`credits.txt`](../../public/marketing/credits.txt) names the works in each.

| File | Pixels | Use |
| --- | --- | --- |
| `collection-of-beauty-16x9.jpg` | 2560 × 1440 | Article header, slides, video thumbnail. Light, with title. |
| `collection-of-beauty-16x9-dark.jpg` | 2560 × 1440 | The same, dark. |
| `collection-of-beauty-16x9-works.jpg` | 3840 × 2160 | Works only, no text. |
| `collection-of-beauty-1x1.jpg` | 1080 × 1080 | Instagram, Mastodon or Bluesky post. |
| `collection-of-beauty-4x5.jpg` | 1080 × 1350 | Instagram feed post. |
| `collection-of-beauty-9x16-dark.jpg` | 1080 × 1920 | Story. |
| `collection-of-beauty-3x1.jpg` | 1500 × 500 | X or LinkedIn header, newsletter banner. |
| `collection-of-beauty-og.jpg` | 1200 × 630 | Link preview. The site ships the same image as `src/app/opengraph-image.png`. |

The two 16:9 images with a stats line say "250+ artists", the count when
they were rendered. The catalogue has 312 artists today, so the next
`pnpm marketing:images` run prints "300+".

## Museum screenshots

Made by [`scripts/build-museum-screenshots.mjs`](../../scripts/build-museum-screenshots.mjs)
on 17 October 2026, in the museum's current plan (four floors round a court),
with the on-screen controls hidden. 2560 × 1440, plus a 5120 × 2880
`-large.jpg` twin. The script needs a dev server, because it sets the camera
through the `?debug` hook.

| File | Shows |
| --- | --- |
| `collection-of-beauty-museum-court.jpg` | The central court, open through all four floors. |
| `collection-of-beauty-museum-stair-hall.jpg` | The west grand staircase, Veronese's Feast in the House of Levi over its landing. |
| `collection-of-beauty-museum-salon.jpg` | The Grand Salon, the Last Judgment on its far wall. |
| `collection-of-beauty-museum-mona-lisa.jpg` | The Mona Lisa on a free-standing wall, a bench in front. |
| `collection-of-beauty-museum-baroque.jpg` | A crimson Baroque gallery, Las Meninas. |
| `collection-of-beauty-museum-spiral.jpg` | The spiral stair. |
| `collection-of-beauty-museum-water-garden.jpg` | Monet's room, the 17 m Two Willows. |
| `collection-of-beauty-museum-hokusai.jpg` | The Hokusai room. |
| `collection-of-beauty-museum-natural-history.jpg` | Audubon's room. |

## Site screenshots

Made by [`scripts/capture-site-screenshots.mjs`](../../scripts/capture-site-screenshots.mjs)
on 6 November 2026 from the live site, read-only, with analytics blocked.
The pages are ones that look the same on every visit (the home page
shuffles its grid).

| File | Pixels | Page |
| --- | --- | --- |
| `screenshots/collection-of-beauty-site-colours-blue.jpg` | 3200 × 2000 (1600 × 1000 at 2×) | `/colours/blue` |
| `screenshots/collection-of-beauty-site-artwork.jpg` | 3200 × 2000 (1600 × 1000 at 2×) | Vermeer's Girl with a Pearl Earring |
| `screenshots/collection-of-beauty-site-artwork-phone.jpg` | 1170 × 2532 (390 × 844 at 3×) | The same page on a phone |

`--base http://127.0.0.1:<port>` takes them from a local server instead.

## GitHub social preview

Made by [`scripts/build-social-preview.mjs`](../../scripts/build-social-preview.mjs)
on 7 November 2026. Each option is the press images' design at 2:1: the
same walls, the same pool of works hung whole in justified rows, the same
Georgia title block. The formats are `SOCIAL_PREVIEW_FORMATS` in
[`scripts/build-marketing-images.mjs`](../../scripts/build-marketing-images.mjs),
laid out by the same code as the press images. The counts in the text come
from `src/data/summary.json` when the cards are rendered (4,000+ works).
1280 × 640 PNG, each under 1 MB (saved as a 256-colour PNG when a
full-colour one is larger), text 64 px or more from the edges.
[`credits.txt`](social-preview/credits.txt) names the works on each card.

| File | Option |
| --- | --- |
| `social-preview/social-preview-a.png` | A. Light. Works on the left, title on the right, as in the link preview and the 16:9 image. |
| `social-preview/social-preview-b.png` | B. Dark. The same layout on the dark wall of the 16:9 dark image. |
| `social-preview/social-preview-c.png` | C. Light. Works only, no text, as in the 16:9 works image. |
| `social-preview/social-preview-d.png` | D. Light. Title on the left, works on the right, as in the 3:1 banner. |

The cards are not part of the press kit: `pnpm marketing:images` does not
render them and `/press` does not list them. GitHub takes the card under
Settings → General → Social preview; it has no API for it.
`--review <folder>` also writes the four PNGs and a `review-sheet.jpg` of
all four to that folder.
