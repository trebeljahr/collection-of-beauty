import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import * as React from "react";

void React; // referenced by JSX runtime under classic transform

export type ConfirmSubscriptionProps = {
  /** The fully-qualified confirmation URL the recipient should click. */
  confirmUrl: string;
};

export default function ConfirmSubscription({
  confirmUrl = "https://example.com/api/newsletter/confirm?token=preview",
}: ConfirmSubscriptionProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your subscription to A Drop of Beauty</Preview>
      <Tailwind>
        <Body className="bg-stone-50 font-serif text-stone-900">
          <Container className="mx-auto max-w-[560px] bg-white px-8 py-10">
            <Section>
              <Heading
                as="h1"
                className="m-0 font-serif text-2xl font-normal tracking-tight text-stone-900"
              >
                Confirm your subscription
              </Heading>
              <Text className="mt-4 text-base leading-relaxed text-stone-800">
                Thanks for subscribing to <strong>A Drop of Beauty</strong>, the Collection of
                Beauty newsletter. Each Sunday brings five works from the public-domain catalogue,
                all on one theme.
              </Text>
              <Text className="mt-3 text-base leading-relaxed text-stone-800">
                Click the button below to confirm.
              </Text>
            </Section>

            <Section className="my-8 text-center">
              <Link
                href={confirmUrl}
                className="inline-block rounded-md bg-stone-900 px-6 py-3 text-sm font-medium text-white no-underline"
              >
                Confirm subscription
              </Link>
            </Section>

            <Section>
              <Text className="m-0 text-sm text-stone-500">
                Or paste this URL into your browser:
              </Text>
              <Text className="mt-1 break-all text-sm text-stone-500">
                <Link href={confirmUrl} className="text-stone-700 underline decoration-stone-300">
                  {confirmUrl}
                </Link>
              </Text>
            </Section>

            <Section className="mt-8 border-t border-stone-200 pt-6">
              <Text className="m-0 text-xs leading-relaxed text-stone-500">
                If you didn&apos;t sign up, ignore this email. No list membership is created until
                you click.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
