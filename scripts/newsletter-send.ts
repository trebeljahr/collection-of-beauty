#!/usr/bin/env -S npx tsx
/**
 * CLI sender for newsletter editions.
 *
 *   pnpm newsletter:send <slug>                              → dry-run
 *   pnpm newsletter:send <slug> --confirm                    → send via ListMonk to LISTMONK_TEST_LIST_ID
 *   NODE_ENV=production pnpm newsletter:send <slug> --confirm → send via ListMonk to LISTMONK_LIST_ID
 *
 * The destination list is decided by NODE_ENV, not by a flag — production
 * goes to the real subscriber list (`LISTMONK_LIST_ID`), every other
 * environment goes to a test list (`LISTMONK_TEST_LIST_ID`) that should
 * only contain your own address. `--confirm` is the dry-run-vs-actual-send
 * switch; without it the script just builds the email and prints what
 * would be sent.
 *
 * Slug is the filename without `.md`: e.g. `0001-spring-light`. Bare
 * theme slugs also work (the loader matches on either).
 *
 * This script is the only way to send. There is no /api/newsletter/send
 * route, no cron job. Run it from a machine that has the decrypted
 * .env.local — typically your laptop, never the deployed server.
 *
 * Sending uses ListMonk's campaign API: a draft campaign is created
 * with the rendered HTML body, then flipped to `running`. ListMonk
 * delivers via its configured Amazon SES SMTP transport.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findEdition } from "../src/lib/newsletter/editions";
import { describeListTarget, isProductionSend, sendCampaign } from "../src/lib/newsletter/listmonk";
import { renderEdition } from "../src/lib/newsletter/render";

async function main(): Promise<void> {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const ROOT = path.resolve(__dirname, "..");
  process.chdir(ROOT);

  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));
  const slug = positional[0];

  if (!slug) {
    console.error("usage: pnpm newsletter:send <slug> [--confirm]");
    console.error("       NODE_ENV=production … --confirm sends to the real list");
    process.exit(1);
  }

  if (flags.has("--test")) {
    console.error(
      "--test is no longer supported. The test list is selected automatically when NODE_ENV !== 'production'.",
    );
    process.exit(1);
  }

  const edition = findEdition(slug);
  if (!edition) {
    console.error(`No edition matches "${slug}". Looked under content/newsletter/.`);
    process.exit(1);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://beauty.trebeljahr.com";
  const production = isProductionSend();

  console.info(`[newsletter] ${edition.fileSlug} — "${edition.title}"`);
  console.info(`[newsletter] published: ${edition.publishedAt}`);
  console.info(`[newsletter] subject:   ${edition.subject}`);
  console.info(`[newsletter] artworks:  ${edition.artworks.map((a) => a.id).join(", ")}`);
  console.info(`[newsletter] env:       NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}`);
  console.info(`[newsletter] target:    ${describeListTarget()}`);
  if (edition.draft) {
    console.info(`[newsletter] note:      draft=true — won't appear on the public archive yet`);
  }

  // Always render with the ListMonk campaign placeholder. The CLI never
  // sends via the tx path, so the `{{ UnsubscribeURL }}` literal in the
  // rendered HTML is exactly what ListMonk needs to substitute per
  // recipient when delivering the campaign.
  const rendered = await renderEdition({ edition, siteUrl, unsubscribeMode: "listmonk-campaign" });

  if (!flags.has("--confirm")) {
    console.info(`[newsletter] dry-run — no email sent.`);
    console.info(`[newsletter] html bytes: ${rendered.html.length}`);
    console.info(`[newsletter] text bytes: ${rendered.text.length}`);
    console.info(
      production
        ? `[newsletter] pass --confirm to send to the production list.`
        : `[newsletter] pass --confirm to send to the test list. Set NODE_ENV=production to target the real list.`,
    );
    return;
  }

  const campaignName = production
    ? `[A Drop of Beauty] ${edition.fileSlug}`
    : `[TEST · ${new Date().toISOString().slice(0, 16)}] ${edition.fileSlug}`;
  const subject = production ? rendered.subject : `[TEST] ${rendered.subject}`;

  console.info(`[newsletter] creating campaign…`);
  const result = await sendCampaign({
    name: campaignName,
    subject,
    html: rendered.html,
    text: rendered.text,
  });
  console.info(`[newsletter] campaign id: ${result.id}`);
  console.info(`[newsletter] admin URL:   ${result.url}`);
  console.info(`[newsletter] status:      running (ListMonk is dispatching via SES)`);
  console.info(`[newsletter] done.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
