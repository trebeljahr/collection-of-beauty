#!/usr/bin/env node
// Print the API Worker's secrets as the JSON object `wrangler secret bulk`
// reads on stdin, from the environment `dotenvx run -f .env.production`
// decrypts. Only for that pipe (deploy.yml, operation `secrets`):
//
//   dotenvx run --quiet -f .env.production -- node scripts/api-worker-secrets.mjs \
//     | wrangler secret bulk -c workers/api/wrangler.jsonc
//
// Fails, printing names only, when a required value is missing or still
// encrypted (a missing DOTENV_PRIVATE_KEY_PRODUCTION).
const REQUIRED = [
  "LISTMONK_URL",
  "LISTMONK_API_USER",
  "LISTMONK_API_TOKEN",
  "LISTMONK_LIST_ID",
  "LISTMONK_TX_TEMPLATE_ID",
  "LISTMONK_FROM",
  "NEWSLETTER_TOKEN_SECRET",
];
const OPTIONAL = ["LISTMONK_REPLY_TO", "SES_FROM_EMAIL", "SENTRY_DSN"];

const usable = (value) =>
  typeof value === "string" && value !== "" && !value.startsWith("encrypted:");
const missing = REQUIRED.filter((name) => !usable(process.env[name]));
if (missing.length > 0) {
  console.error(`api-worker-secrets: missing or still encrypted: ${missing.join(", ")}`);
  process.exit(1);
}
const out = {};
for (const name of [...REQUIRED, ...OPTIONAL]) {
  if (usable(process.env[name])) out[name] = process.env[name];
}
process.stdout.write(JSON.stringify(out));
