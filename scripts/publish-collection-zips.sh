#!/usr/bin/env bash
# Publish the plate-set ZIPs built by scripts/build-collection-zips.ts as
# append-only content-addressed objects on the public asset bucket, the
# press kit's scheme (scripts/publish-press-kit.sh).
#
# Run only with explicit release authorization, through dotenvx so the R2
# variables come from the encrypted environment:
#   pnpm exec dotenvx run -f .env.production -- bash scripts/publish-collection-zips.sh
# Then check them from the public origin and mark them published:
#   node scripts/collection-zips.mjs --verify --mark-published
#
# `--immutable` refuses to modify an existing object. Nothing is deleted.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/.collection-zips}"
for name in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ASSETS_BUCKET; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
done
command -v rclone >/dev/null || { echo "rclone is required." >&2; exit 1; }

export RCLONE_S3_PROVIDER=Cloudflare
export RCLONE_S3_ENDPOINT="$R2_ENDPOINT"
export RCLONE_S3_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_S3_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
# The bucket exists; the scoped token may not create buckets.
export RCLONE_S3_NO_CHECK_BUCKET=true

node --input-type=module -e '
  import { readCollectionZips } from "'"$ROOT"'/scripts/collection-zips.mjs";
  for (const set of Object.values(readCollectionZips().sets)) {
    if (!set.published) console.log(set.path.slice(1), set.filename, set.sha256);
  }
' | while read -r OBJECT_PATH FILENAME SHA256; do
  FILE="$OUT/$FILENAME"
  # The archive on disk must be the one the metadata names.
  ACTUAL="$(shasum -a 256 "$FILE" | cut -d" " -f1)"
  if [ "$ACTUAL" != "$SHA256" ]; then
    echo "$FILE does not match its metadata ($ACTUAL != $SHA256); rebuild first." >&2
    exit 1
  fi
  rclone copyto "$FILE" ":s3:$R2_ASSETS_BUCKET/$OBJECT_PATH" \
    --immutable \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --header-upload "Content-Type: application/zip" \
    --header-upload "Content-Disposition: attachment; filename=\"$FILENAME\""
  echo "Uploaded $OBJECT_PATH"
done
echo "Check with: node scripts/collection-zips.mjs --verify --mark-published"
