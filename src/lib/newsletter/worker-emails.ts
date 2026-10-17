/**
 * The emails the API Worker sends, rendered once at build time
 * (scripts/build-api-worker-data.ts). Rendering React Email in the Worker
 * would load react on every cold start and spend more CPU per request than
 * the Workers Free plan allows (10 ms). The three bodies match what
 * subscribe.ts and the confirm route rendered per request before the site
 * became a static export; a link that differs per recipient is a
 * placeholder (email-placeholders.ts).
 */
import { render } from "@react-email/render";
import { createElement } from "react";
import AlreadySubscribed from "../../../emails/already-subscribed";
import ConfirmSubscription from "../../../emails/confirm-subscription";
import { resolveConfirmHero } from "./confirmation-cover";
import { loadPublishedEditions } from "./editions";
import { CONFIRM_TOKEN_PLACEHOLDER, UNSUBSCRIBE_TOKEN_PLACEHOLDER } from "./email-placeholders";
import { renderEdition } from "./render";

export type RenderedEmail = { subject: string; html: string };

export type WorkerEmails = {
  /** Double opt-in; `CONFIRM_TOKEN_PLACEHOLDER` stands for the token. */
  confirm: RenderedEmail;
  /** The form's answer to an address that is already confirmed. */
  alreadySubscribed: RenderedEmail;
  /**
   * The latest published edition, sent once an address confirms.
   * `UNSUBSCRIBE_TOKEN_PLACEHOLDER` stands for the token, in the footer
   * link and in the List-Unsubscribe header the Worker adds.
   */
  welcome: (RenderedEmail & { edition: string }) | null;
};

function mustHold(html: string, placeholder: string, what: string): string {
  if (!html.includes(placeholder)) {
    throw new Error(`worker-emails: the ${what} email lost its ${placeholder}`);
  }
  return html;
}

export async function renderWorkerEmails(siteUrl: string): Promise<WorkerEmails> {
  const site = siteUrl.replace(/\/+$/, "");
  const hero = resolveConfirmHero(site);
  const confirmHtml = await render(
    createElement(ConfirmSubscription, {
      confirmUrl: `${site}/sub/confirm?token=${CONFIRM_TOKEN_PLACEHOLDER}`,
      heroImageUrl: hero.imageUrl,
      heroArtworkUrl: hero.artworkUrl,
      heroCaption: hero.caption,
      heroAlt: hero.alt,
    }),
  );

  const latest = loadPublishedEditions().at(-1);
  const welcome = latest
    ? await renderEdition({
        edition: latest,
        siteUrl: site,
        unsubscribeUrl: `${site}/sub/unsubscribe?token=${UNSUBSCRIBE_TOKEN_PLACEHOLDER}`,
      })
    : null;

  return {
    confirm: {
      subject: "Confirm your subscription · Drops of Beauty",
      html: mustHold(confirmHtml, CONFIRM_TOKEN_PLACEHOLDER, "confirmation"),
    },
    alreadySubscribed: {
      subject: "You're already on the list · Drops of Beauty",
      html: await render(createElement(AlreadySubscribed, { siteUrl: site })),
    },
    welcome:
      latest && welcome
        ? {
            edition: latest.fileSlug,
            subject: `Welcome — ${welcome.subject}`,
            html: mustHold(welcome.html, UNSUBSCRIBE_TOKEN_PLACEHOLDER, "welcome"),
          }
        : null,
  };
}
