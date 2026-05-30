#!/usr/bin/env bash
# Picks the right Hatchkit-emitted env file before invoking the
# newsletter-send TypeScript entrypoint:
#
#   pnpm sendNewsletter                    → .env.development (test list)
#   NODE_ENV=production pnpm sendNewsletter → .env.production  (live list)
#
# Both env files carry the same `LISTMONK_LIST_ID` variable name; the
# value differs (Hatchkit provisions one list per environment). The app
# code reads `LISTMONK_LIST_ID` directly with no NODE_ENV branching, so
# everything else falls out of which env file dotenvx loads here.
set -euo pipefail

ENV_FILE=".env.development"
if [ "${NODE_ENV:-}" = "production" ]; then
  ENV_FILE=".env.production"
fi

exec pnpm exec dotenvx run \
  -f "$ENV_FILE" \
  -f .env.local \
  --ignore=MISSING_ENV_FILE \
  -- tsx scripts/newsletter-send.ts "$@"
