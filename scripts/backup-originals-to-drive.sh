#!/usr/bin/env bash
# Third copy of the original artwork files on Google Drive.
#
# The originals in ./assets/ on this Mac are the source of truth. R2 serves
# the web variants (./assets-web/, see sync-assets.sh); this script keeps a
# file-for-file copy of the originals in Drive's existing folders.
#
# - rclone sync --checksum: only new or changed files upload (MD5 compare),
#   so re-runs are cheap.
# - Files on Drive that are no longer here go to Drive's trash (30 days),
#   so the copy matches this folder instead of piling up duplicates.
# - Not copied: _attic/, the assets/assets self-link, assets-web/ (generated).
#
# Usage:
#   scripts/backup-originals-to-drive.sh            # sync
#   scripts/backup-originals-to-drive.sh --dry-run  # show what would change
#
# Env:
#   DRIVE_REMOTE  rclone remote scoped to the Collection of Beauty Drive folder
#                 (default: collection-of-beauty-google-drive:)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
SRC="$ROOT/assets"
REMOTE="${DRIVE_REMOTE:-collection-of-beauty-google-drive:}"

command -v rclone >/dev/null || { echo "rclone is required." >&2; exit 1; }
[ -d "$SRC" ] || { echo "No $SRC on this machine." >&2; exit 1; }

# local folder | Drive folder (the film folders predate the slug names)
MAP=(
  "5-centimeters-per-second|5 Centimeters per Second"
  "nausicaa|Nausicaa"
  "spirited-away|Spirited Away"
  "suzume|Suzume"
  "the-garden-of-words|The Garden of Words"
  "your-name|Your Name"
  "audubon-birds|assets/audubon-birds"
  "collection-of-beauty|assets/collection-of-beauty"
  "kunstformen-images|assets/kunstformen-images"
  "music|assets/music"
  "redoute-lilies|assets/redoute-lilies"
  "redoute-roses|assets/redoute-roses"
)

status=0
for pair in "${MAP[@]}"; do
  local_dir="${pair%%|*}"
  remote_dir="${pair#*|}"
  [ -d "$SRC/$local_dir" ] || { echo "skip $local_dir (missing locally)"; continue; }
  echo "== $local_dir -> $REMOTE$remote_dir"
  rclone sync "$SRC/$local_dir" "$REMOTE$remote_dir" \
    --checksum --drive-use-trash \
    --exclude ".DS_Store" --exclude "._*" \
    --transfers 4 --checkers 8 \
    --stats-one-line --stats 60s -v "$@" || status=$?
done
exit "$status"
