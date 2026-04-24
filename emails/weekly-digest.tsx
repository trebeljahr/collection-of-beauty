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

export type DigestArtwork = {
  id: string;
  title: string;
  artist: string | null;
  year: number | null;
  description: string | null;
  movement: string | null;
  imageUrl: string;
  artworkUrl: string;
};

export type WeeklyDigestProps = {
  issueNumber: number;
  issueDate: string; // e.g. "April 19, 2026"
  weekKey: string; // e.g. "2026-W17"
  artworks: DigestArtwork[];
  siteUrl: string;
  /**
   * Literal Mailgun variable for the per-recipient unsubscribe URL. We keep it
   * as a templated string in the rendered HTML so Mailgun can substitute per
   * recipient; during preview, the default is a visible placeholder.
   */
  unsubscribeUrl?: string;
};

// Mailgun substitutes this token at delivery time when sending to a mailing list.
const MAILGUN_UNSUBSCRIBE_TOKEN = "%mailing_list_unsubscribe_url%";

export default function WeeklyDigest({
  issueNumber = 1,
  issueDate = "April 19, 2026",
  weekKey = "2026-W17",
  artworks = PREVIEW_ARTWORKS,
  siteUrl = "https://example.com",
  unsubscribeUrl = MAILGUN_UNSUBSCRIBE_TOKEN,
}: WeeklyDigestProps) {
  const previewText =
    artworks.length > 0
      ? `${artworks[0].title}${artworks[0].artist ? ` by ${artworks[0].artist}` : ""}, and ${artworks.length - 1} more this week.`
      : "This week's gallery picks.";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-stone-50 font-serif text-stone-900">
          <Container className="mx-auto max-w-[640px] bg-white px-8 py-10">
            {/* Header */}
            <Section className="text-center">
              <Text className="m-0 text-xs uppercase tracking-[0.2em] text-stone-500">
                Collection of Beauty · Issue {issueNumber} · {issueDate}
              </Text>
              <Heading
                as="h1"
                className="mt-3 mb-0 font-serif text-3xl font-normal tracking-tight text-stone-900"
              >
                Five for the week
              </Heading>
              <Text className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-stone-600">
                A small selection of paintings, prints, and illustrations from the public domain —
                picked fresh each {"Monday"}.
              </Text>
            </Section>

            <Hr className="my-8 border-stone-200" />

            {/* Artworks */}
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
                {a.description && (
                  <Text className="mt-3 mb-0 text-sm leading-relaxed text-stone-700">
                    {a.description}
                  </Text>
                )}
              </Section>
            ))}

            <Hr className="my-10 border-stone-200" />

            {/* Footer */}
            <Section className="text-center">
              <Text className="m-0 text-sm text-stone-600">
                <Link
                  href={siteUrl}
                  className="text-stone-700 underline decoration-stone-300 underline-offset-4"
                >
                  Browse the full gallery →
                </Link>
              </Text>
              <Text className="mt-6 text-xs leading-relaxed text-stone-500">
                You&apos;re receiving this because you subscribed to the Collection of Beauty weekly
                digest ({weekKey}).
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

// Fixtures used by `email dev` preview and by tests.
const PREVIEW_ARTWORKS: DigestArtwork[] = [
  {
    id: "preview-1",
    title: "Water Lilies",
    artist: "Claude Monet",
    year: 1906,
    description:
      "One of roughly 250 oil paintings in Monet's Water Lilies series, reflecting his garden at Giverny.",
    movement: "Impressionism",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Claude_Monet%2C_Water_Lilies%2C_1906%2C_Ryerson.jpg/800px-Claude_Monet%2C_Water_Lilies%2C_1906%2C_Ryerson.jpg",
    artworkUrl: "https://example.com/artwork/preview-1",
  },
  {
    id: "preview-2",
    title: "The Great Wave off Kanagawa",
    artist: "Katsushika Hokusai",
    year: 1831,
    description:
      "The most famous woodblock print from Hokusai's Thirty-six Views of Mount Fuji series.",
    movement: "Ukiyo-e",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/800px-Tsunami_by_hokusai_19th_century.jpg",
    artworkUrl: "https://example.com/artwork/preview-2",
  },
  {
    id: "preview-3",
    title: "Starry Night",
    artist: "Vincent van Gogh",
    year: 1889,
    description:
      "Painted from memory during van Gogh's stay at the Saint-Paul-de-Mausole asylum in Saint-Rémy-de-Provence.",
    movement: "Post-Impressionism",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/800px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
    artworkUrl: "https://example.com/artwork/preview-3",
  },
  {
    id: "preview-4",
    title: "American Flamingo",
    artist: "John James Audubon",
    year: 1838,
    description:
      "Plate 431 from Audubon's Birds of America, depicting a flamingo in a characteristic stooped feeding posture.",
    movement: null,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/American_Flamingo.jpg/800px-American_Flamingo.jpg",
    artworkUrl: "https://example.com/artwork/preview-4",
  },
  {
    id: "preview-5",
    title: "Discomedusae",
    artist: "Ernst Haeckel",
    year: 1904,
    description:
      "Plate 8 from Kunstformen der Natur, showing the radial symmetry of jellyfish species.",
    movement: null,
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Haeckel_Discomedusae_8.jpg/800px-Haeckel_Discomedusae_8.jpg",
    artworkUrl: "https://example.com/artwork/preview-5",
  },
];
