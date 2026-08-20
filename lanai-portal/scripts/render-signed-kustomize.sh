#!/usr/bin/env bash
# Render the active Lanai Kustomize stack only from trusted, signed image
# digests. This does not mutate the repository or apply to a cluster.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT="${1:-$ROOT/rendered-lanai-signed.yaml}"
IDENTITY_REGEX="${LANAI_COSIGN_IDENTITY_REGEX:-^https://github\\.com/munisp/lanai/\\.github/workflows/release-images\\.yml@refs/tags/v.+$}"
OIDC_ISSUER="${LANAI_COSIGN_OIDC_ISSUER:-https://token.actions.githubusercontent.com}"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 2
  }
}

require cosign
if command -v kustomize >/dev/null 2>&1; then
  KUSTOMIZE=(kustomize build)
elif command -v kubectl >/dev/null 2>&1; then
  KUSTOMIZE=(kubectl kustomize)
else
  printf 'Missing required command: kustomize or kubectl\n' >&2
  exit 2
fi

for variable in LANAI_PORTAL_IMAGE LANAI_AI_GATEWAY_IMAGE LANAI_REALM_RENDER_IMAGE; do
  value="${!variable:-}"
  if [[ ! "$value" =~ ^ghcr\.io/munisp/lanai-[a-z0-9._-]+@sha256:[a-f0-9]{64}$ ]]; then
    printf '%s must be a lowercase ghcr.io/munisp Lanai image pinned by sha256 digest.\n' "$variable" >&2
    exit 3
  fi
  if ! cosign verify \
    --certificate-identity-regexp "$IDENTITY_REGEX" \
    --certificate-oidc-issuer "$OIDC_ISSUER" \
    "$value" >/dev/null; then
    printf '%s is not signed by the trusted release workflow: %s\n' "$variable" "$value" >&2
    exit 4
  fi
done

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
cp -R "$ROOT/config" "$workdir/config"

python3 - "$workdir/config" <<'PY'
import os
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
replacements = {
    "ghcr.io/munisp/lanai-portal:REPLACE_WITH_SIGNED_DIGEST": os.environ["LANAI_PORTAL_IMAGE"],
    "ghcr.io/munisp/lanai-ai-gateway:REPLACE_WITH_SIGNED_DIGEST": os.environ["LANAI_AI_GATEWAY_IMAGE"],
    "ghcr.io/munisp/lanai-realm-render:REPLACE_WITH_SIGNED_DIGEST": os.environ["LANAI_REALM_RENDER_IMAGE"],
}
for path in root.rglob("*.yaml"):
    text = path.read_text()
    for source, target in replacements.items():
        text = text.replace(source, target)
    path.write_text(text)
PY

"${KUSTOMIZE[@]}" "$workdir/config" > "$OUTPUT"

if grep -Eq '^[[:space:]]*image:[[:space:]]*[^[:space:]@]+(:[^[:space:]@]+)?[[:space:]]*$' "$OUTPUT"; then
  printf 'Rendered manifest contains a mutable or unpinned image reference.\n' >&2
  grep -En '^[[:space:]]*image:' "$OUTPUT" >&2
  exit 5
fi
if grep -q 'REPLACE_WITH_SIGNED_DIGEST' "$OUTPUT"; then
  printf 'Rendered manifest contains an unresolved signed-image placeholder.\n' >&2
  exit 6
fi

printf 'Signed manifest rendered without mutable image references: %s\n' "$OUTPUT"
