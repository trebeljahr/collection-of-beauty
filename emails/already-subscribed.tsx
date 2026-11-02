import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Tailwind,
  Text,
} from "@react-email/components";
import * as React from "react";
import { Inset } from "./inset";

void React; // referenced by JSX runtime under classic transform

export type AlreadySubscribedProps = {
  /** Public site root, linked from the email. */
  siteUrl: string;
};

export default function AlreadySubscribed({
  siteUrl = "https://example.com",
}: AlreadySubscribedProps) {
  return (
    <Html>
      <Head />
      <Preview>This address is on the Drops of Beauty list. You don't need to do anything.</Preview>
      <Tailwind>
        <Body className="bg-white font-serif text-stone-900">
          <Container className="mx-auto max-w-[560px] bg-white px-0 py-0">
            <Inset className="px-8 pt-8 pb-2 text-center">
              <Text className="m-0 text-[11px] uppercase tracking-[0.22em] text-stone-500">
                Drops of Beauty
              </Text>
            </Inset>

            <Inset className="px-8 pt-6">
              <Heading
                as="h1"
                className="m-0 font-serif text-2xl font-normal tracking-tight text-stone-900"
              >
                You're already on the list
              </Heading>
              <Text className="mt-4 text-base leading-relaxed text-stone-800">
                Someone entered this address in the signup form on the{" "}
                <Link
                  href={siteUrl}
                  className="text-stone-900 underline decoration-stone-300 underline-offset-4"
                >
                  Collection of Beauty
                </Link>
                . The address is already subscribed to <strong>Drops of Beauty</strong>, so nothing
                changed.
              </Text>
              <Text className="mt-3 text-base leading-relaxed text-stone-800">
                You don't need to do anything. The next edition will reach you when it goes out.
              </Text>
            </Inset>

            <Hr className="mt-8 mb-0 border-stone-200" />

            <Inset className="px-8 py-6">
              <Text className="m-0 text-xs leading-relaxed text-stone-500">
                If that wasn't you, ignore this email. Each edition sent to the list has an
                unsubscribe link in its footer.
              </Text>
            </Inset>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
