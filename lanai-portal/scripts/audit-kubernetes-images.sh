#!/usr/bin/env bash
# Verify that Lanai Kubernetes image references are immutable. Template mode
# permits fail-closed REPLACE_WITH_SIGNED_DIGEST placeholders; --release rejects
# them so only actual sha256 digests can enter a production apply bundle.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-template}"
if [[ "$MODE" != "template" && "$MODE" != "--release" ]]; then
  printf 'usage: %s [template|--release]\n' "$0" >&2
  exit 2
fi

status=0
while IFS=: read -r file line image; do
  image="${image#image:}"
  image="${image# }"
  if [[ "$image" == *"REPLACE_WITH_SIGNED_DIGEST"* ]]; then
    if [[ "$MODE" == "--release" ]]; then
      printf 'UNRESOLVED SIGNED IMAGE PLACEHOLDER: %s:%s: %s\n' "$file" "$line" "$image" >&2
      status=1
    fi
    continue
  fi
  if [[ ! "$image" =~ @sha256:[a-f0-9]{64}$ ]]; then
    printf 'MUTABLE OR UNPINNED IMAGE: %s:%s: %s\n' "$file" "$line" "$image" >&2
    status=1
  fi
done < <(
  rg -n --glob '*.yaml' --glob '*.yml' '^[[:space:]]*image:[[:space:]]*[^[:space:]#]+' "$ROOT/config" |
    sed -E 's#^(.+):([0-9]+):[[:space:]]*image:[[:space:]]*(.*)$#\1:\2:image: \3#'
)

if [[ "$status" -ne 0 ]]; then
  printf 'Kubernetes image immutability audit failed (%s mode).\n' "$MODE" >&2
  exit "$status"
fi
printf 'Kubernetes image immutability audit passed (%s mode).\n' "$MODE"
