#!/bin/bash
#
# Upload one of the asset subfolders into the shared MinIO
# (container: great-gates-minio-1, bucket: collection-of-beauty).
#
# Usage:
#   bash scripts/upload-to-minio.sh <folder>   # e.g. kunstformen-images
#   bash scripts/upload-to-minio.sh --all      # all PD folders
#
# PD folders (safe to publish):
#   collection-of-beauty   (~12 GB)
#   audubon-birds          (~24 GB)
#   kunstformen-images     (~200 MB)
#
# Anime folders are NOT uploaded even with --all: they're copyrighted per
# metadata/README.json ("private/reference use only").

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ASSETS_DIR="$ROOT_DIR/assets"

MINIO_CONTAINER="${MINIO_CONTAINER:-great-gates-minio-1}"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://127.0.0.1:9000}"
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"
BUCKET="${MINIO_BUCKET:-collection-of-beauty}"

PD_FOLDERS=(collection-of-beauty audubon-birds kunstformen-images)

if [ $# -eq 0 ]; then
  echo "usage: bash scripts/upload-to-minio.sh <folder>|--all"
  echo "  folders: ${PD_FOLDERS[*]}"
  exit 1
fi

# Ensure mc alias + bucket + public-read
docker exec "$MINIO_CONTAINER" mc alias set local "$MINIO_ENDPOINT" "$MINIO_USER" "$MINIO_PASS" > /dev/null
docker exec "$MINIO_CONTAINER" mc mb --ignore-existing "local/$BUCKET" > /dev/null
docker exec "$MINIO_CONTAINER" mc anonymous set download "local/$BUCKET" > /dev/null

upload_one() {
  local folder="$1"
  local src="$ASSETS_DIR/$folder"
  if [ ! -d "$src" ]; then
    echo "skip: $src does not exist"
    return
  fi
  local size
  size=$(du -sh "$src" | cut -f1)
  echo "==> uploading $folder ($size) into local/$BUCKET/$folder/"
  docker run --rm \
    --network host \
    -e "MC_HOST_local=http://${MINIO_USER}:${MINIO_PASS}@127.0.0.1:9000" \
    -v "$src:/src:ro" \
    minio/mc:latest \
    mirror --overwrite --quiet /src "local/$BUCKET/$folder"
}

if [ "$1" = "--all" ]; then
  for f in "${PD_FOLDERS[@]}"; do
    upload_one "$f"
  done
else
  upload_one "$1"
fi

echo "done."
