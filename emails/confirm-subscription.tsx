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

export type ConfirmSubscriptionProps = {
  /** Fully-qualified confirmation URL the recipient should click. */
  confirmUrl: string;
  /** Direct image URL for the hero artwork (1280w WebP works fine). */
  heroImageUrl: string;
  /** Permalink to the artwork's detail page on the public site. */
  heroArtworkUrl: string;
  /** Short caption shown under the hero image. */
  heroCaption: string;
  /** Alt text, read by screen readers and shown if images are blocked. */
  heroAlt: string;
};

export default function ConfirmSubscription({
  confirmUrl = "https://example.com/api/newsletter/confirm?token=preview",
  heroImageUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Caspar_David_Friedrich_-_Der_M%C3%B6nch_am_Meer_-_Google_Art_Project.jpg/1280px-Caspar_David_Friedrich_-_Der_M%C3%B6nch_am_Meer_-_Google_Art_Project.jpg",
  heroArtworkUrl = "https://example.com/artwork/preview",
  heroCaption = "The Monk by the Sea · Caspar David Friedrich · 1808",
  heroAlt = "The Monk by the Sea — Caspar David Friedrich",
}: ConfirmSubscriptionProps) {
  const siteUrl = heroArtworkUrl.replace(/\/artwork\/.*$/, "");
  return (
    <Html>
      <Head />
      <Preview>One click to confirm your subscription to A Drop of Beauty.</Preview>
      <Tailwind>
        <Body className="bg-stone-50 font-serif text-stone-900">
          <Container className="mx-auto max-w-[560px] bg-white px-0 py-0">
            <Section className="px-8 pt-8 pb-2 text-center">
              <Text className="m-0 text-[11px] uppercase tracking-[0.22em] text-stone-500">
                A Drop of Beauty
              </Text>
            </Section>

            <Section className="px-0">
              <Link href={heroArtworkUrl} className="block no-underline">
                <Img src={heroImageUrl} alt={heroAlt} width="560" className="w-full" />
              </Link>
              <Text className="m-0 px-8 pt-2 text-center text-xs italic text-stone-500">
                {heroCaption}
              </Text>
            </Section>

            <Section className="px-8 pt-8">
              <Heading
                as="h1"
                className="m-0 font-serif text-2xl font-normal tracking-tight text-stone-900"
              >
                Confirm your subscription
              </Heading>
              <Text className="mt-4 text-base leading-relaxed text-stone-800">
                You're one click away from <strong>A Drop of Beauty</strong>, a weekly letter from
                the{" "}
                <Link
                  href={siteUrl}
                  className="text-stone-900 underline decoration-stone-300 underline-offset-4"
                >
                  Collection of Beauty
                </Link>
                .
              </Text>
              <Text className="mt-3 text-base leading-relaxed text-stone-800">
                Each Sunday brings five public-domain works around a single theme — landscapes,
                solitary figures, scientific illustration, shin-hanga prints, whatever the week's
                thread runs through. Brief editorial notes, full-resolution images, and a link back
                into the gallery for everything that catches your eye.
              </Text>
            </Section>

            <Section className="my-8 px-8 text-center">
              <Link
                href={confirmUrl}
                className="inline-block rounded-md bg-stone-900 px-7 py-3 text-sm font-medium text-white no-underline"
              >
                Confirm my subscription
              </Link>
            </Section>

            <Section className="px-8">
              <Text className="m-0 text-sm text-stone-500">
                Or paste this URL into your browser:
              </Text>
              <Text className="mt-1 break-all text-sm text-stone-500">
                <Link href={confirmUrl} className="text-stone-700 underline decoration-stone-300">
                  {confirmUrl}
                </Link>
              </Text>
            </Section>

            <Hr className="my-8 border-stone-200" />

            <Section className="px-8">
              <Heading
                as="h2"
                className="m-0 font-serif text-base font-normal tracking-tight text-stone-700"
              >
                Why the extra click?
              </Heading>
              <Text className="mt-2 text-sm leading-relaxed text-stone-600">
                A confirmation step (called <em>double opt-in</em>) is how we verify you actually
                own this address and didn't get signed up by a typo or a bot. It's also a
                requirement under European privacy law — your address won't be added to any list
                until you click the button above.
              </Text>
              <Text className="mt-3 text-sm leading-relaxed text-stone-600">
                After you confirm, every email carries a one-click unsubscribe link in the footer.
                Nothing else, ever — no third-party sharing, no ads, no tracking pixels beyond the
                open-rate ping that comes with the sending platform.
              </Text>
            </Section>

            <Section className="mt-8 border-t border-stone-200 px-8 py-6">
              <Text className="m-0 text-xs leading-relaxed text-stone-500">
                If you didn't sign up, ignore this email — no list membership is created until you
                click. The link expires in 21 days.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
