#!/usr/bin/env bash
# Print an immutable registry digest for a public Docker Hub image reference.
# Usage: resolve-container-digest.sh library/postgres:16.6-bookworm
set -euo pipefail

image="${1:?usage: $0 <repository:tag>}"
repository="${image%:*}"
tag="${image##*:}"
if [[ "$repository" == "$tag" ]]; then
  printf 'Image reference must include an explicit tag.\n' >&2
  exit 2
fi

scope="repository:${repository}:pull"
token="$(curl --fail --silent --show-error \
  --get 'https://auth.docker.io/token' \
  --data-urlencode 'service=registry.docker.io' \
  --data-urlencode "scope=${scope}" | \
  sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
if [[ -z "$token" ]]; then
  printf 'Unable to obtain Docker Hub pull token for %s.\n' "$repository" >&2
  exit 3
fi

digest="$(curl --fail --silent --show-error --head \
  -H "Authorization: Bearer ${token}" \
  -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json' \
  "https://registry-1.docker.io/v2/${repository}/manifests/${tag}" | \
  tr -d '\r' | sed -n 's/^docker-content-digest: \(sha256:[a-f0-9]\{64\}\)$/\1/pI')"
if [[ -z "$digest" ]]; then
  printf 'Registry did not return a digest for %s.\n' "$image" >&2
  exit 4
fi
printf '%s@%s\n' "$image" "$digest"
