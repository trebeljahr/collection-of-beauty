#!/usr/bin/env -S npx tsx
/**
 * CLI sender for newsletter editions.
 *
 *   pnpm sendNewsletter                         → send latest published issue to the test list
 *   pnpm sendNewsletter <slug>                  → send that issue to the test list
 *   pnpm sendNewsletter --dry-run               → render latest published issue, no email sent
 *   NODE_ENV=production pnpm sendNewsletter      → send latest published issue to the live list
 *
 * The destination list is decided by NODE_ENV, not by a flag: production
 * loads `.env.production` and goes to the real subscriber list; every
 * other environment loads `.env.development` and goes to the test list.
 * Use `--dry-run` for a render-only preflight. `--confirm` is accepted as
 * a legacy no-op so old muscle memory does not fail.
 *
 * Slug is optional. When omitted, the latest published issue is sent.
 * When provided, use the filename without `.md`, e.g. `0001-spring-light`.
 * Bare theme slugs also work (the loader matches on either).
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

import { findEdition, loadPublishedEditions } from "../src/lib/newsletter/editions";
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

  if (flags.has("--test")) {
    console.error(
      "--test is no longer supported. The test list is selected automatically when NODE_ENV !== 'production'.",
    );
    process.exit(1);
  }

  const allowedFlags = new Set(["--dry-run", "--confirm", "--allow-draft"]);
  const unknownFlags = [...flags].filter((flag) => !allowedFlags.has(flag));
  if (unknownFlags.length > 0) {
    console.error(`Unknown flag${unknownFlags.length === 1 ? "" : "s"}: ${unknownFlags.join(", ")}`);
    console.error("usage: pnpm sendNewsletter [slug] [--dry-run] [--allow-draft]");
    process.exit(1);
  }

  if (positional.length > 1) {
    console.error(`Expected at most one slug, got: ${positional.join(", ")}`);
    console.error("usage: pnpm sendNewsletter [slug] [--dry-run] [--allow-draft]");
    process.exit(1);
  }

  const edition = slug ? findEdition(slug) : latestPublishedEdition();
  if (!edition) {
    const reason = slug
      ? `No edition matches "${slug}". Looked under content/newsletter/.`
      : "No published newsletter editions found. Flip draft: false on an edition first.";
    console.error(reason);
    process.exit(1);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://beauty.trebeljahr.com";
  const production = isProductionSend();
  const dryRun = flags.has("--dry-run");

  if (production && edition.draft && !flags.has("--allow-draft")) {
    console.error(
      `[newsletter] refusing production send for draft edition ${edition.fileSlug}. ` +
        "Set draft: false or pass --allow-draft explicitly.",
    );
    process.exit(1);
  }

  if (flags.has("--confirm")) {
    console.info(`[newsletter] note:      --confirm is legacy; sends are real unless --dry-run is present`);
  }

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

  if (dryRun) {
    console.info(`[newsletter] dry-run — no email sent.`);
    console.info(`[newsletter] html bytes: ${rendered.html.length}`);
    console.info(`[newsletter] text bytes: ${rendered.text.length}`);
    return;
  }

  const campaignName = production
    ? `[Drops of Beauty] ${edition.fileSlug}`
    : `[TEST · ${new Date().toISOString().slice(0, 16)}] ${edition.fileSlug}`;
  const subject = production ? rendered.subject : `[TEST] ${rendered.subject}`;

  console.info(
    production
      ? `[newsletter] sending to live list…`
      : `[newsletter] sending to test list…`,
  );
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

function latestPublishedEdition(): ReturnType<typeof findEdition> {
  return loadPublishedEditions().at(-1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
