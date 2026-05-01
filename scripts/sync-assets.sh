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
  echo "assets-web/ not found at $ASSETS_DIR — run \`pnpm shrink\` first." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found on PATH. Install Docker Desktop and retry." >&2
  exit 1
fi

# pnpm forwards `pnpm assets:sync -- <args>` to the script as `-- <args>`.
# rclone interprets a literal `--` as end-of-flags, which would turn
# `--dry-run` etc. into positional args. Drop the leading separator so
# both `pnpm assets:sync --dry-run` and `pnpm assets:sync -- --dry-run`
# work the same way.
if [ "${1:-}" = "--" ]; then shift; fi

# Allocate a pseudo-TTY when stdout is a terminal so rclone's --progress
# can draw its refreshing dashboard. Only check stdout: pnpm inherits
# stdout from the user's terminal but routinely closes/pipes stdin, so
# requiring `-t 0` would force the log-line fallback for every
# pnpm-wrapped invocation. -t alone (no -i) avoids docker errors when
# stdin isn't attached.
DOCKER_FLAGS=(--rm)
if [ -t 1 ]; then
  DOCKER_FLAGS+=(-t)
fi

echo "[sync] starting rclone (assets-web/ → :s3:$R2_ASSETS_BUCKET)"
echo "[sync] expect a quiet ~30s while --fast-list pulls the remote index,"
echo "[sync] then per-file activity once transfers begin."

# `:s3:<bucket>` is rclone's ad-hoc remote prefix — backend config comes
# from RCLONE_S3_* env vars, no rclone.conf needed. provider=Cloudflare
# picks the R2-specific quirks (region=auto, etc.).
#
# Flag rationale:
#   --fast-list   one recursive ListObjects pass instead of per-dir; on
#                 a 31k-object bucket this is the difference between
#                 30s and many minutes of listing.
#   --progress    refreshing dashboard rendered in place when stdout is a
#                 TTY (the -t we passed to docker above). Without -v the
#                 dashboard isn't pushed up the screen by per-file logs.
#   --stats 5s    fallback rate when there's no TTY — progress degrades
#                 to periodic stats blocks instead of in-place redraw.
# To opt back into per-file lines for debugging: pnpm assets:sync -- -v
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
  --fast-list \
  --transfers 16 \
  --checkers 32 \
  --stats 5s \
  --progress \
  "$@"
