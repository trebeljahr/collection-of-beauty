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
  /** Editorial blurb written specifically for this issue. */
  note: string | null;
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
   * Literal Mailgun variable for the per-recipient unsubscribe URL. Kept
   * as a templated string so Mailgun substitutes per recipient.
   */
  unsubscribeUrl?: string;
};

const MAILGUN_UNSUBSCRIBE_TOKEN = "%mailing_list_unsubscribe_url%";

export default function WeeklyDigest({
  issueNumber = 1,
  issueDate = "April 19, 2026",
  title = "Five for the week",
  introHtml = "",
  artworks = PREVIEW_ARTWORKS,
  siteUrl = "https://example.com",
  archiveUrl = "https://example.com/newsletter/0001-preview",
  unsubscribeUrl = MAILGUN_UNSUBSCRIBE_TOKEN,
}: WeeklyDigestProps) {
  const previewText =
    artworks.length > 0
      ? `${title}. ${artworks[0].title}${artworks[0].artist ? ` by ${artworks[0].artist}` : ""} and ${artworks.length - 1} more.`
      : title;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-stone-50 font-serif text-stone-900">
          <Container className="mx-auto max-w-[640px] bg-white px-8 py-10">
            <Section className="text-center">
              <Text className="m-0 text-xs uppercase tracking-[0.2em] text-stone-500">
                A Drop of Beauty · Issue {issueNumber} · {issueDate}
              </Text>
              <Heading
                as="h1"
                className="mt-3 mb-0 font-serif text-3xl font-normal tracking-tight text-stone-900"
              >
                {title}
              </Heading>
            </Section>

            {introHtml.length > 0 && (
              <>
                <Hr className="my-8 border-stone-200" />
                <Section>
                  <div
                    className="text-base leading-relaxed text-stone-800 [&_a]:text-stone-900 [&_a]:underline [&_a]:decoration-stone-300 [&_a]:underline-offset-4 [&_em]:italic [&_p]:my-3 [&_strong]:font-semibold"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted in-repo markdown rendered via remark
                    dangerouslySetInnerHTML={{ __html: introHtml }}
                  />
                </Section>
              </>
            )}

            <Hr className="my-8 border-stone-200" />

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
                  <Link href={a.artworkUrl} className="text-stone-900 no-underline">
                    {a.title}
                  </Link>
                </Heading>
                <Text className="m-0 text-sm text-stone-600">
                  {a.artist ?? "Unknown artist"}
                  {a.year ? ` · ${a.year}` : ""}
                  {a.movement ? ` · ${a.movement}` : ""}
                </Text>
                {a.note && (
                  <Text className="mt-3 mb-0 text-sm leading-relaxed text-stone-700">{a.note}</Text>
                )}
              </Section>
            ))}

            <Hr className="my-10 border-stone-200" />

            <Section className="text-center">
              <Text className="m-0 text-sm text-stone-600">
                <Link
                  href={archiveUrl}
                  className="text-stone-700 underline decoration-stone-300 underline-offset-4"
                >
                  Read this issue on the web →
                </Link>
              </Text>
              <Text className="mt-2 text-sm text-stone-600">
                <Link
                  href={siteUrl}
                  className="text-stone-700 underline decoration-stone-300 underline-offset-4"
                >
                  Browse the full gallery
                </Link>
              </Text>
              <Text className="mt-6 text-xs leading-relaxed text-stone-500">
                You&apos;re receiving this because you subscribed to <em>A Drop of Beauty</em>, the
                Collection of Beauty newsletter.
                <br />
                <Link
                  href={unsubscribeUrl}
                  className="text-stone-500 underline decoration-stone-300 underline-offset-2"
                >
                  Unsubscribe
                </Link>
              </Text>
              <Text className="mt-4 text-[10px] uppercase tracking-widest text-stone-400">
                All works public domain or openly licensed.
              </Text>
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
    note: "Painted at Giverny in the years Monet ripped up his garden and let the pond take over.",
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
    note: null,
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
    note: null,
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
    note: null,
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
    note: null,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Haeckel_Discomedusae_8.jpg/800px-Haeckel_Discomedusae_8.jpg",
    artworkUrl: "https://example.com/artwork/preview-5",
  },
];
