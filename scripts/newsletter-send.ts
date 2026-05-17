#!/usr/bin/env -S npx tsx
/**
 * CLI sender for newsletter editions.
 *
 *   pnpm newsletter:send <slug>            → dry-run, prints summary
 *   pnpm newsletter:send <slug> --test     → real send to MAILGUN_TEST_LIST
 *   pnpm newsletter:send <slug> --confirm  → real send to MAILGUN_LIST
 *
 * The slug is the filename without `.md`: e.g. `0001-spring-light`. Bare
 * theme slugs also work (the loader matches on either).
 *
 * Sending happens only when --test or --confirm is passed. The default
 * is a dry run that builds the email and prints what would be sent.
 *
 * This script is the only way to send. There is no /api/newsletter/send
 * route, no cron job. Run it from a machine that has the decrypted
 * .env.local — typically your laptop, never the deployed server.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findEdition } from "../src/lib/newsletter/editions";
import { resolveListAddress, sendDigest } from "../src/lib/newsletter/mailgun";
import { renderEdition } from "../src/lib/newsletter/render";

type Target = "dry-run" | "test" | "live";

async function main(): Promise<void> {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const ROOT = path.resolve(__dirname, "..");
  process.chdir(ROOT);

  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));
  const slug = positional[0];

  if (!slug) {
    console.error("usage: pnpm newsletter:send <slug> [--test|--confirm]");
    process.exit(1);
  }

  if (flags.has("--test") && flags.has("--confirm")) {
    console.error("--test and --confirm are mutually exclusive.");
    process.exit(1);
  }

  const target: Target = flags.has("--confirm")
    ? "live"
    : flags.has("--test")
      ? "test"
      : "dry-run";

  const edition = findEdition(slug);
  if (!edition) {
    console.error(`No edition matches "${slug}". Looked under content/newsletter/.`);
    process.exit(1);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://beauty.trebeljahr.com";

  console.info(`[newsletter] ${edition.fileSlug} — "${edition.title}"`);
  console.info(`[newsletter] published: ${edition.publishedAt}`);
  console.info(`[newsletter] subject:   ${edition.subject}`);
  console.info(`[newsletter] artworks:  ${edition.artworks.map((a) => a.id).join(", ")}`);
  if (edition.draft) {
    console.info(`[newsletter] note:      draft=true — won't appear on the public archive yet`);
  }

  const rendered = await renderEdition({ edition, siteUrl });

  if (target === "dry-run") {
    console.info(`[newsletter] dry-run — no email sent.`);
    console.info(`[newsletter] html bytes: ${rendered.html.length}`);
    console.info(`[newsletter] text bytes: ${rendered.text.length}`);
    console.info(
      `[newsletter] pass --test to send to MAILGUN_TEST_LIST or --confirm to send to MAILGUN_LIST.`,
    );
    return;
  }

  const to = resolveListAddress(target === "test" ? "test" : "live");
  const subject = target === "test" ? `[TEST] ${rendered.subject}` : rendered.subject;

  console.info(`[newsletter] sending to: ${to} (target=${target})`);
  const result = await sendDigest({
    subject,
    html: rendered.html,
    text: rendered.text,
    to,
  });
  console.info(`[newsletter] mailgun id: ${result.id ?? "(none)"}`);
  console.info(`[newsletter] done.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
