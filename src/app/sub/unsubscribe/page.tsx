import type { Metadata } from "next";
import { UnsubscribeBody } from "./unsubscribe-body";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

/**
 * Where the welcome issue's footer link lands. The page changes nothing:
 * `POST /api/newsletter/unsubscribe` (the API Worker) checks the token when
 * the button is pressed, and sends the visitor back here with the outcome.
 */
export default function UnsubscribePage() {
  return <UnsubscribeBody />;
}
