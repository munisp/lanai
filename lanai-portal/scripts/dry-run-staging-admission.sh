#!/usr/bin/env bash
# Server-side admission validation only. This script cannot create, update,
# delete, or patch objects because every kubectl apply uses --dry-run=server.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
context="${LANAI_STAGING_CONTEXT:-}"
namespace="${LANAI_STAGING_NAMESPACE:-lanai-staging}"
expected_environment="${LANAI_STAGING_ENVIRONMENT:-staging}"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 2
  }
}

require kubectl
[[ -n "$context" ]] || {
  printf 'LANAI_STAGING_CONTEXT is required; refusing to use the current kubectl context.\n' >&2
  exit 2
}

actual_context="$(kubectl config current-context 2>/dev/null || true)"
[[ "$actual_context" == "$context" ]] || {
  printf 'Current context %q does not match required staging context %q.\n' "$actual_context" "$context" >&2
  exit 2
}

kubectl auth can-i create deployment -n "$namespace" >/dev/null || {
  printf 'The active identity cannot create deployments in %q; admission dry-run is unavailable.\n' "$namespace" >&2
  exit 3
}

actual_environment="$(kubectl get namespace "$namespace" -o jsonpath='{.metadata.labels.environment}' 2>/dev/null || true)"
[[ "$actual_environment" == "$expected_environment" ]] || {
  printf 'Namespace %q does not have environment=%q; refusing dry-run.\n' "$namespace" "$expected_environment" >&2
  exit 2
}

manifest_files=(
  "$repo_root/config/k8s/app-tier.yaml"
  "$repo_root/config/k8s/data-tier.yaml"
  "$repo_root/config/k8s/platform-tier.yaml"
  "$repo_root/config/k8s/ai-tier.yaml"
  "$repo_root/config/k8s/jobs.yaml"
  "$repo_root/config/k8s/smoke-test.yaml"
)

printf 'Performing server-side admission dry-run in context=%s namespace=%s\n' "$context" "$namespace"
for manifest in "${manifest_files[@]}"; do
  printf '\n--- %s ---\n' "${manifest#$repo_root/}"
  kubectl apply \
    --context "$context" \
    --namespace "$namespace" \
    --server-side \
    --field-manager lanai-admission-dry-run \
    --dry-run=server \
    --validate=strict \
    --filename "$manifest"
done

printf '\nAdmission dry-run passed. No Kubernetes objects were persisted.\n'
