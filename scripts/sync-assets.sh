#!/usr/bin/env bash
# Mirror ./assets-web/ → an S3-compatible bucket (Cloudflare R2 by default)
# using rclone: natively when it's on PATH, otherwise via the
# rclone/rclone image.
#
# It used to be docker-only, on the reasoning that the image was already
# pulled for the local dev HTTP server. That stopped being true when
# scripts/dev.mjs replaced docker-compose with a native Node asset server
# — leaving Docker Desktop as a multi-GB dependency whose only remaining
# job was copying files. `brew install rclone` is the smaller ask, so a
# native binary wins when present.
#
# Why rclone:
#   - retry + resume on flaky uplinks
#   - per-file multipart for the big originals / 4096px AVIFs
#   - --bwlimit, --transfers, --checkers tunables built in
#   - mature progress + stats reporting
#
# Re-runnable: rclone's `sync` is incremental (skips files whose size
# matches), so this is safe to call after every `pnpm assets:shrink`.
#
# Env loading: package.json's `assets:sync` invokes this via `dotenvx run`
# which decrypts .env.production and layers .env.local on top before exec.
# So the four R2 vars below can live in either file (encrypted in
# .env.production for cross-machine sharing, plaintext in .env.local for
# per-machine overrides).
#
# Required env:
#   R2_ENDPOINT             https://<account-id>.r2.cloudflarestorage.com
#   R2_ACCESS_KEY_ID        R2 API token, write access to the assets bucket
#   R2_SECRET_ACCESS_KEY    ↑
#   R2_ASSETS_BUCKET        bucket name
#
# Any extra args are forwarded to `rclone sync`, e.g.:
#   pnpm assets:sync -- --dry-run
#   pnpm assets:sync -- --bwlimit 10M
#   pnpm assets:sync -- --include 'audubon-birds/**'
#   pnpm assets:sync -- -P                  # show the live progress bar

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT="$( dirname "$SCRIPT_DIR" )"
ASSETS_DIR="$ROOT/assets-web"

require() {
  if [ -z "${!1:-}" ]; then
    echo "Missing required env var: $1" >&2
    echo "Add it (encrypted) to .env.production or to .env.local." >&2
    exit 1
  fi
}
require R2_ENDPOINT
require R2_ACCESS_KEY_ID
require R2_SECRET_ACCESS_KEY
require R2_ASSETS_BUCKET

if [ ! -d "$ASSETS_DIR" ]; then
  echo "assets-web/ not found at $ASSETS_DIR — run \`pnpm assets:shrink\` first." >&2
  exit 1
fi

HAVE_RCLONE=0; command -v rclone >/dev/null 2>&1 && HAVE_RCLONE=1
HAVE_DOCKER=0; command -v docker >/dev/null 2>&1 && HAVE_DOCKER=1
if [ "$HAVE_RCLONE" -eq 0 ] && [ "$HAVE_DOCKER" -eq 0 ]; then
  echo "Neither rclone nor docker found on PATH." >&2
  echo "Install one: \`brew install rclone\` (preferred) or Docker Desktop." >&2
  exit 1
fi

# pnpm forwards `pnpm assets:sync -- <args>` to the script as `-- <args>`.
# rclone interprets a literal `--` as end-of-flags, which would turn
# `--dry-run` etc. into positional args. Drop the leading separator so
# both `pnpm assets:sync --dry-run` and `pnpm assets:sync -- --dry-run`
# work the same way.
if [ "${1:-}" = "--" ]; then shift; fi

# Flags shared by both execution paths. The source path is the one thing
# that differs: native rclone reads assets-web/ where it lives, the
# container sees it bind-mounted at /data.
#
# Flag rationale:
#   --fast-list   one recursive ListObjects pass instead of per-dir; on
#                 a 31k-object bucket this is the difference between
#                 30s and many minutes of listing.
#   --progress    refreshing dashboard rendered in place on a TTY.
#                 Without -v the dashboard isn't pushed up the screen by
#                 per-file logs.
#   --stats 5s    fallback rate when there's no TTY — progress degrades
#                 to periodic stats blocks instead of in-place redraw.
# To opt back into per-file lines for debugging: pnpm assets:sync -- -v
RCLONE_FLAGS=(
  --header-upload "Cache-Control: public, max-age=31536000, immutable"
  --size-only
  --fast-list
  --transfers 16
  --checkers 32
  --stats 5s
  --progress
)

echo "[sync] starting rclone (assets-web/ → :s3:$R2_ASSETS_BUCKET)"
echo "[sync] expect a quiet ~30s while --fast-list pulls the remote index,"
echo "[sync] then per-file activity once transfers begin."

# `:s3:<bucket>` is rclone's ad-hoc remote prefix — backend config comes
# from RCLONE_S3_* env vars, no rclone.conf needed. provider=Cloudflare
# picks the R2-specific quirks (region=auto, etc.).
export RCLONE_S3_PROVIDER=Cloudflare
export RCLONE_S3_ENDPOINT="$R2_ENDPOINT"
export RCLONE_S3_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_S3_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

if [ "$HAVE_RCLONE" -eq 1 ]; then
  echo "[sync] using native rclone ($(rclone version | head -1))"
  exec rclone sync "$ASSETS_DIR" ":s3:$R2_ASSETS_BUCKET" "${RCLONE_FLAGS[@]}" "$@"
fi

# Container fallback. Allocate a pseudo-TTY when stdout is a terminal so
# rclone's --progress can draw its refreshing dashboard. Only check
# stdout: pnpm inherits stdout from the user's terminal but routinely
# closes/pipes stdin, so requiring `-t 0` would force the log-line
# fallback for every pnpm-wrapped invocation. -t alone (no -i) avoids
# docker errors when stdin isn't attached.
DOCKER_FLAGS=(--rm)
if [ -t 1 ]; then
  DOCKER_FLAGS+=(-t)
fi

echo "[sync] using rclone/rclone container (no native rclone on PATH)"
exec docker run "${DOCKER_FLAGS[@]}" \
  -v "$ASSETS_DIR:/data:ro" \
  -e RCLONE_S3_PROVIDER \
  -e RCLONE_S3_ENDPOINT \
  -e RCLONE_S3_ACCESS_KEY_ID \
  -e RCLONE_S3_SECRET_ACCESS_KEY \
  rclone/rclone:latest \
  sync /data ":s3:$R2_ASSETS_BUCKET" "${RCLONE_FLAGS[@]}" "$@"
