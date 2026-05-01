#!/usr/bin/env bash
# Mirror ./assets-web/ → an S3-compatible bucket (Cloudflare R2 by default)
# using rclone running in the same docker image already pulled for the
# local dev HTTP server (see docker-compose.yml). No additional install.
#
# Why rclone:
#   - retry + resume on flaky uplinks
#   - per-file multipart for the big originals / 4096px AVIFs
#   - --bwlimit, --transfers, --checkers tunables built in
#   - mature progress + stats reporting
#
# Re-runnable: rclone's `sync` is incremental (skips files whose size
# matches), so this is safe to call after every `pnpm shrink`.
#
# Env (auto-loaded from .env.local if present, same vars as the JS path):
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

# Auto-export every var declared after `set -a`. Mirrors what next dev
# does with .env.local so this script's env model is the same.
if [ -f "$ROOT/.env.local" ]; then
  set -a
  # shellcheck disable=SC1090,SC1091
  source "$ROOT/.env.local"
  set +a
fi

require() {
  if [ -z "${!1:-}" ]; then
    echo "Missing required env var: $1" >&2
    echo "Set it in .env.local or export it in your shell." >&2
    exit 1
  fi
}
require R2_ENDPOINT
require R2_ACCESS_KEY_ID
require R2_SECRET_ACCESS_KEY
require R2_ASSETS_BUCKET

if [ ! -d "$ASSETS_DIR" ]; then
  echo "assets-web/ not found at $ASSETS_DIR — run \`pnpm shrink\` first." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found on PATH. Install Docker Desktop and retry." >&2
  exit 1
fi

# Allocate a TTY only when invoked interactively; pnpm + CI both pipe.
DOCKER_FLAGS=(--rm)
if [ -t 0 ] && [ -t 1 ]; then
  DOCKER_FLAGS+=(-it)
fi

# `:s3:<bucket>` is rclone's ad-hoc remote prefix — backend config comes
# from RCLONE_S3_* env vars, no rclone.conf needed. provider=Cloudflare
# picks the R2-specific quirks (region=auto, etc.).
exec docker run "${DOCKER_FLAGS[@]}" \
  -v "$ASSETS_DIR:/data:ro" \
  -e RCLONE_S3_PROVIDER=Cloudflare \
  -e RCLONE_S3_ENDPOINT="$R2_ENDPOINT" \
  -e RCLONE_S3_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e RCLONE_S3_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  rclone/rclone:latest \
  sync /data ":s3:$R2_ASSETS_BUCKET" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --size-only \
  --transfers 16 \
  --checkers 32 \
  --stats 10s \
  --stats-one-line \
  "$@"
