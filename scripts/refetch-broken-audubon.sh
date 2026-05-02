#!/usr/bin/env bash
# Re-download Audubon "Birds of America" originals flagged by
# scripts/find-broken-audubon.mjs as having a uniform-gray padding strip
# at the bottom (or right) edge — i.e., the original curl truncated.
#
# Reads metadata/audubon-broken.json and fetches each entry's fileUrl
# (taken from metadata/audubon-birds.json) directly, so we hit the same
# Wikimedia URL the rest of the catalogue uses.
#
# After it finishes, re-run:
#   node scripts/find-broken-audubon.mjs
# Anything still flagged is likely a Wikimedia source-side artefact.
#
# Usage:
#   bash scripts/refetch-broken-audubon.sh
#   bash scripts/refetch-broken-audubon.sh --dry-run     # list, don't download

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT="$( dirname "$SCRIPT_DIR" )"
OUT_DIR="$ROOT/assets/audubon-birds"
META="$ROOT/metadata/audubon-broken.json"

DELAY=3        # seconds between downloads (Wikimedia courtesy)
RATE=2M
RETRIES=3
RETRY_DELAY=10

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

if [ ! -f "$META" ]; then
  echo "$META not found. Run: node scripts/find-broken-audubon.mjs" >&2
  exit 1
fi

if [ ! -d "$OUT_DIR" ]; then
  echo "$OUT_DIR not found." >&2
  exit 1
fi

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

# Pull (filename<TAB>url) pairs out of the JSON via node — keeps the
# repo dep-free of jq. macOS bash 3.2 has no `mapfile`, so loop with read.
entries=()
while IFS= read -r line; do
  entries+=("$line")
done < <(node -e '
  const fs = require("node:fs");
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  for (const b of data.broken) {
    if (!b.fileUrl) continue;
    process.stdout.write(b.filename + "\t" + b.fileUrl + "\n");
  }
' "$META")

total=${#entries[@]}
if [ "$total" -eq 0 ]; then
  echo "No entries flagged in $META — nothing to do."
  exit 0
fi

echo "========================================="
echo "Audubon's Birds of America Re-fetch"
echo "========================================="
echo "Output directory: $OUT_DIR"
echo "Files to refetch: $total"
[ $DRY_RUN -eq 1 ] && echo "(dry run)"
echo ""

ok=0
fail=0
failed_files=()

for i in "${!entries[@]}"; do
  line="${entries[$i]}"
  filename="${line%%$'\t'*}"
  url="${line##*$'\t'}"
  out="$OUT_DIR/$filename"
  index=$((i + 1))

  if [ $DRY_RUN -eq 1 ]; then
    echo "[$index/$total] would refetch $filename"
    echo "    from: $url"
    continue
  fi

  echo -e "[$index/$total] ${YELLOW}refetching${NC} $filename"

  rm -f "$out"

  retry=0
  status=1
  while [ $retry -le $RETRIES ]; do
    if curl -L -fS --limit-rate "$RATE" \
            --retry 3 --retry-delay 5 \
            -H "User-Agent: Mozilla/5.0 (compatible; EducationalProject/1.0)" \
            -o "$out" "$url"; then
      status=0
      break
    fi
    retry=$((retry + 1))
    if [ $retry -le $RETRIES ]; then
      wait_time=$((RETRY_DELAY * retry))
      echo -e "    ${YELLOW}retry $retry/$RETRIES in ${wait_time}s${NC}"
      sleep $wait_time
    fi
  done

  if [ $status -eq 0 ]; then
    ok=$((ok + 1))
    size=$(stat -f%z "$out" 2>/dev/null || stat -c%s "$out" 2>/dev/null || echo "?")
    echo -e "    ${GREEN}✓${NC} $size bytes"
  else
    fail=$((fail + 1))
    failed_files+=("$filename")
    echo -e "    ${RED}✗ failed${NC}"
  fi

  if [ $index -lt $total ]; then
    sleep $DELAY
  fi
done

echo ""
echo "========================================="
echo "Re-fetch complete"
echo "========================================="
echo -e "${GREEN}Successful:${NC} $ok"
echo -e "${RED}Failed:${NC} $fail"
echo "Total: $total"

if [ ${#failed_files[@]} -gt 0 ]; then
  echo ""
  echo "Failed files:"
  for f in "${failed_files[@]}"; do echo "  - $f"; done
fi

echo ""
echo "Next: rerun 'node scripts/find-broken-audubon.mjs' to verify, then"
echo "      'pnpm shrink --folder=audubon-birds' to refresh assets-web/."
