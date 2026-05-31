import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import * as React from "react";

void React; // referenced by JSX runtime under classic transform

export type DigestArtwork = {
  id: string;
  title: string;
  artist: string | null;
  year: number | null;
  movement: string | null;
  imageUrl: string;
  artworkUrl: string;
  /**
   * Editorial blurb written specifically for this issue, pre-rendered
   * to HTML from markdown (so `[text](url)` links render as real
   * anchors). Trusted in-repo content. `null` when no note was set.
   */
  noteHtml: string | null;
};

export type WeeklyDigestProps = {
  issueNumber: number;
  issueDate: string; // e.g. "April 19, 2026"
  /** Edition title — the theme this issue explores. */
  title: string;
  /**
   * Pre-rendered HTML from the markdown body. Trusted input (it comes from
   * the repo). Empty string is fine — the section is skipped if so.
   */
  introHtml: string;
  artworks: DigestArtwork[];
  siteUrl: string;
  /** Permalink to the public archive page for this edition. */
  archiveUrl: string;
  /**
   * Literal ListMonk variable for the per-recipient unsubscribe URL.
   * Kept as a templated string so ListMonk substitutes per recipient
   * when it renders the campaign body for delivery. Pass `null` to omit
   * the unsubscribe block entirely — used when the email is sent
   * through a ListMonk transactional template that injects its own
   * unsubscribe footer.
   */
  unsubscribeUrl?: string | null;
};

// ListMonk substitutes this in the rendered campaign body (Go template
// engine). The double-brace literal stays verbatim in the HTML we hand
// off, and ListMonk swaps it for the recipient's signed unsub URL.
const LISTMONK_UNSUBSCRIBE_TOKEN = "{{ UnsubscribeURL }}";

export default function WeeklyDigest({
  issueNumber = 1,
  issueDate = "April 19, 2026",
  title = "Five for the week",
  introHtml = "",
  artworks = PREVIEW_ARTWORKS,
  siteUrl = "https://example.com",
  archiveUrl = "https://example.com/newsletter/0001-preview",
  unsubscribeUrl = LISTMONK_UNSUBSCRIBE_TOKEN,
}: WeeklyDigestProps) {
  const previewText =
    artworks.length > 0
      ? `${title}. ${artworks[0].title}${artworks[0].artist ? ` by ${artworks[0].artist}` : ""} and ${artworks.length - 1} more.`
      : title;

  return (
    <Html>
      <Head>
        {/*
          Descendant styling for the markdown-rendered intro block.
          react-email's <Tailwind> compiler can't reliably express
          arbitrary descendant variants like `[&_a]:underline` — it
          flattens them onto the wrapping <div>, and CSS inheritance
          then underlines every <p> inside. So we hand-write the
          descendant rules into a real <style> block instead.
        */}
        <style>{`
          .intro-prose em, .note-prose em { font-style: italic; }
          .intro-prose p { margin-top: 0.75rem; margin-bottom: 0.75rem; }
          .intro-prose strong, .note-prose strong { font-weight: 600; }
          .note-prose p { margin: 0; }
        `}</style>
      </Head>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-stone-50 font-serif text-stone-900">
          <Container className="mx-auto max-w-[640px] bg-white px-0 py-0">
            <Section className="bg-stone-950 px-8 py-9 text-center">
              <Text className="m-0 text-[11px] uppercase tracking-[0.24em] text-stone-300">
                A Drop of Beauty
              </Text>
              <Heading
                as="h1"
                className="mx-auto mt-4 mb-0 max-w-[520px] font-serif text-[34px] font-normal leading-tight text-stone-50"
              >
                {title}
              </Heading>
              <Text className="mt-4 mb-0 text-xs uppercase tracking-[0.18em] text-stone-400">
                Issue {issueNumber} · {issueDate}
              </Text>
              <Link
                href={archiveUrl}
                className="mt-6 inline-block rounded-full border border-stone-600 px-4 py-2 text-xs uppercase tracking-[0.16em] text-stone-100 no-underline"
              >
                Read on the web
              </Link>
            </Section>

            <Section className="px-8 py-10">
              {introHtml.length > 0 && (
                <>
                  <Section>
                    <div
                      className="intro-prose text-base leading-relaxed text-stone-800"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted in-repo markdown rendered via remark
                      dangerouslySetInnerHTML={{ __html: introHtml }}
                    />
                  </Section>
                  <Hr className="my-8 border-stone-200" />
                </>
              )}

              {artworks.map((a, i) => (
                <Section key={a.id} className={i > 0 ? "mt-10" : ""}>
                  <Link href={a.artworkUrl} className="block no-underline">
                    <Img
                      src={a.imageUrl}
                      alt={a.title}
                      width="576"
                      className="w-full rounded-md border border-stone-200"
                    />
                  </Link>
                  <Heading
                    as="h2"
                    className="mt-4 mb-1 font-serif text-xl font-normal text-stone-900"
                  >
                    <Link
                      href={a.artworkUrl}
                      style={{
                        color: "#1c1917",
                        textDecorationLine: "underline",
                        textDecorationColor: "#d6d3d1",
                        textUnderlineOffset: "4px",
                      }}
                    >
                      <span style={{ color: "#1c1917" }}>{a.title}</span>
                    </Link>
                  </Heading>
                  <Text className="m-0 text-sm text-stone-600">
                    {a.artist ?? "Unknown artist"}
                    {a.year ? ` · ${a.year}` : ""}
                    {a.movement ? ` · ${a.movement}` : ""}
                  </Text>
                  {a.noteHtml && (
                    <div
                      className="note-prose mt-3 text-sm leading-relaxed text-stone-700"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted in-repo markdown rendered via remark
                      dangerouslySetInnerHTML={{ __html: a.noteHtml }}
                    />
                  )}
                </Section>
              ))}

              <Hr className="my-10 border-stone-200" />

              <Section className="text-center">
                <Text className="m-0 text-sm text-stone-600">
                  <Link
                    href={siteUrl}
                    className="text-stone-700 underline decoration-stone-300 underline-offset-4"
                  >
                    Browse the full gallery
                  </Link>
                </Text>
                {unsubscribeUrl !== null && (
                  <Text className="mt-6 text-xs leading-relaxed text-stone-500">
                    You&apos;re receiving this because you subscribed to <em>A Drop of Beauty</em>,
                    the Collection of Beauty newsletter.
                    <br />
                    <Link
                      href={unsubscribeUrl}
                      className="text-stone-500 underline decoration-stone-300 underline-offset-2"
                    >
                      Unsubscribe
                    </Link>
                  </Text>
                )}
                <Text className="mt-4 text-[10px] uppercase tracking-widest text-stone-400">
                  All works public domain or openly licensed.
                </Text>
              </Section>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

const PREVIEW_ARTWORKS: DigestArtwork[] = [
  {
    id: "preview-1",
    title: "Water Lilies",
    artist: "Claude Monet",
    year: 1906,
    movement: "Impressionism",
    noteHtml:
      "<p>Painted at Giverny in the years Monet ripped up his garden and let the pond take over.</p>",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Claude_Monet%2C_Water_Lilies%2C_1906%2C_Ryerson.jpg/800px-Claude_Monet%2C_Water_Lilies%2C_1906%2C_Ryerson.jpg",
    artworkUrl: "https://example.com/artwork/preview-1",
  },
  {
    id: "preview-2",
    title: "The Great Wave off Kanagawa",
    artist: "Katsushika Hokusai",
    year: 1831,
    movement: "Ukiyo-e",
    noteHtml: null,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/800px-Tsunami_by_hokusai_19th_century.jpg",
    artworkUrl: "https://example.com/artwork/preview-2",
  },
  {
    id: "preview-3",
    title: "Starry Night",
    artist: "Vincent van Gogh",
    year: 1889,
    movement: "Post-Impressionism",
    noteHtml: null,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/800px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
    artworkUrl: "https://example.com/artwork/preview-3",
  },
  {
    id: "preview-4",
    title: "American Flamingo",
    artist: "John James Audubon",
    year: 1838,
    movement: null,
    noteHtml: null,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/American_Flamingo.jpg/800px-American_Flamingo.jpg",
    artworkUrl: "https://example.com/artwork/preview-4",
  },
  {
    id: "preview-5",
    title: "Discomedusae",
    artist: "Ernst Haeckel",
    year: 1904,
    movement: null,
    noteHtml: null,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Haeckel_Discomedusae_8.jpg/800px-Haeckel_Discomedusae_8.jpg",
    artworkUrl: "https://example.com/artwork/preview-5",
  },
];
