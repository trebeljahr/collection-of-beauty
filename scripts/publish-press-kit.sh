#!/usr/bin/env bash
# Publish public/press-kit.zip as an append-only content-addressed object on
# the public asset bucket (see scripts/RETAINED-ASSETS.md, "Press kit").
#
# Run only with explicit release authorization, through dotenvx so the R2
# variables come from the encrypted environment:
#   pnpm exec dotenvx run -f .env.production -- bash scripts/publish-press-kit.sh
# Then verify every byte from the public origin before setting "published":
#   node scripts/press-kit-download.mjs --full
#
# `--immutable` refuses to modify an existing object. Nothing is deleted.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for name in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ASSETS_BUCKET; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
done
command -v rclone >/dev/null || { echo "rclone is required." >&2; exit 1; }

node "$ROOT/scripts/press-kit-download.mjs"
read -r OBJECT_PATH FILENAME < <(node --input-type=module -e '
  import { readPressKit } from "'"$ROOT"'/scripts/press-kit-download.mjs";
  const meta = readPressKit();
  console.log(meta.path.slice(1), meta.filename);
')

export RCLONE_S3_PROVIDER=Cloudflare
export RCLONE_S3_ENDPOINT="$R2_ENDPOINT"
export RCLONE_S3_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_S3_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
rclone copyto "$ROOT/public/press-kit.zip" ":s3:$R2_ASSETS_BUCKET/$OBJECT_PATH" \
  --immutable \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --header-upload "Content-Type: application/zip" \
  --header-upload "Content-Disposition: attachment; filename=\"$FILENAME\""
echo "Uploaded. Verify with: node scripts/press-kit-download.mjs --full"
