# Writing style

House rules for every word a visitor reads: page copy, meta
descriptions, era blurbs, press kit, newsletter. Written down because
copy on this site keeps drifting back into the same machine-sounding
shapes, and "that reads like AI" is not a useful review comment unless
the alternative is specified.

The voice already exists in the repo. `/about`, the press FAQ and the
press quotes are the reference recordings — first person, specific,
willing to say what the project is *not* good at. Match those.

## The one rule

**Say a fact the reader did not have.** If a sentence can be deleted
without losing information, it was decoration. Most AI-sounding copy is
not wrong; it is empty in a rhythmically pleasing way.

## Shapes to avoid

These are structural, not lexical. A sentence can contain no banned
word and still be obviously generated.

- **The tricolon epigram.** `Noun, noun, noun — summarising phrase.`
  ("Drama, tenebrism, motion — Caravaggio's shadow across Europe.")
  Three nouns is the giveaway; the em dash promises a payoff and
  delivers a restatement. One or two concrete things, then stop.
- **X, not Y / X rather than Y** as a closing punchline, after the
  paragraph has already made the point. ("The correction loop is the
  point, not an afterthought.")
- **Not just X, but Y** and **more than just X**. Always.
- **Anaphoric negation.** "No ads, no trackers, no cookie banners."
  One negation is a fact; three is a jingle.
- **From X to Y to Z** range-triplets. ("From Renaissance masters to
  20th-century modernists to natural-history illustrators.")
- **The short sentence as drum hit.** A three-word fragment placed
  after a long sentence to feel weighty. Fine once in a long piece,
  never as a paragraph ending twice on one page.
- **Template repetition.** Eleven blurbs built from one sentence
  pattern read as generated even when each is individually fine. Vary
  length and grammatical shape across a set.
- **Grand vagueness.** "The moments that shaped them", "the natural
  world catalogued", "eight centuries of art". Says nothing checkable.

## Words to avoid

From Wikipedia's *Words to watch* (puffery, editorialising) plus the
lexicon that current LLMs over-emit:

- Puffery: masterpiece, master, iconic, legendary, timeless, beloved,
  renowned, celebrated, breathtaking, stunning, exquisite, sublime
  (except as the actual art-historical term), visionary.
- LLM tells: delve, tapestry, landscape (figurative), realm, journey,
  testament, showcase, underscore (as "emphasise"), intricate,
  meticulous, vibrant, seamless, robust, curated (as a compliment),
  elevate, unlock, harness, foster, nuanced, multifaceted.
- Editorialising: notably, interestingly, of course, obviously,
  arguably, essentially, it's worth noting, importantly.
- Hedges: simply, just, truly, quite, rather (as intensifier).

Peacock terms are also factually wrong here. The collection is one
person's taste and says so on `/about`; calling its artists "masters"
contradicts the page next door.

## What to do instead

- **Name the thing.** "Tempera on panel over gold leaf" beats "the
  long medieval morning". Materials, dates, counts, places, titles.
- **Numbers over adjectives.** 435 plates, 1827–1838, 16,384 px.
  Numbers are the only part of the copy nobody suspects of being
  generated, and this project has real ones everywhere.
- **Admit the gaps.** "Metadata is imperfect", "some dates drift by a
  decade", "Les Liliacées is short of the full set". The corrections
  loop is the most human thing on the site; it only works because the
  copy is honest about it.
- **First person where it is genuinely personal.** `/about` and the
  press quotes are Rico's, and read like it. Chrome copy (nav, meta
  descriptions, cards) stays impersonal and short.
- **Let the images do the work.** `fractal.garden` carries an entire
  exhibition on a title and a subtitle. A gallery page does not need
  an essay above the grid.
- **A list is fine when it is a list.** "Vermilion, crimson, madder
  lake" is a pigment enumeration, not a tricolon; it is exhaustive of
  a category rather than decorative. The tell is a summarising clause
  bolted on after it.

## The em dash

Not banned. It is banned as a *hinge for an epigram*. Used for a
genuine aside or an apposition it is fine and appears throughout the
codebase comments. If the text after the dash restates the text before
it, cut the dash and the restatement.

## Length

Meta descriptions stay under ~155 characters (Google truncates).
Era blurbs are one sentence, clamped to two lines on the `/eras`
cards, so ≤ ~110 characters. Page intros are one short paragraph;
anything longer belongs on `/about` or `/press`.

## Checking a sweep

Grep is only good for the lexical half. For the structural half, read
a set of strings **together** — blurbs, taglines, card subtitles — and
look for a repeated skeleton. That is what gives the game away.
