#!/usr/bin/env bash
# Fail-closed launch guard for config/k8s/loadtest/isolated-ledger-soak.yaml.
# It never prints secrets and refuses generic/production-looking cluster contexts.
set -euo pipefail

namespace="${NAMESPACE:-lanai-loadtest}"
manifest="${MANIFEST:-config/k8s/loadtest/isolated-ledger-soak.yaml}"
required_context="${ALLOW_LOADTEST_CONTEXT:-}"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 2
  }
}

require kubectl
require grep
require sed
require cosign

if [[ -z "$required_context" ]]; then
  printf '%s\n' 'Refusing launch: set ALLOW_LOADTEST_CONTEXT to the exact approved kubeconfig context.' >&2
  exit 2
fi

actual_context="$(kubectl config current-context)"
if [[ "$actual_context" != "$required_context" ]]; then
  printf 'Refusing launch: current context %q does not equal approved context %q.\n' "$actual_context" "$required_context" >&2
  exit 2
fi

[[ -f "$manifest" ]] || { printf 'Manifest not found: %s\n' "$manifest" >&2; exit 2; }

if grep -q 'REPLACE_WITH_SIGNED_DIGEST' "$manifest"; then
  printf '%s\n' 'Refusing launch: replace the load-test image placeholder with an approved signed digest.' >&2
  exit 2
fi
if ! grep -Eq 'image: .+@sha256:[a-f0-9]{64}$' "$manifest"; then
  printf '%s\n' 'Refusing launch: runner image must be an immutable sha256 digest.' >&2
  exit 2
fi
runner_image="$(grep -E '^[[:space:]]*image: .+@sha256:[a-f0-9]{64}$' "$manifest" | sed -E 's/^[[:space:]]*image:[[:space:]]*//' | head -n 1)"
identity_regex="${LANAI_COSIGN_IDENTITY_REGEX:-^https://github\\.com/munisp/lanai/\\.github/workflows/release-images\\.yml@refs/tags/v.+$}"
issuer="${LANAI_COSIGN_OIDC_ISSUER:-https://token.actions.githubusercontent.com}"
if ! cosign verify \
  --certificate-identity-regexp "$identity_regex" \
  --certificate-oidc-issuer "$issuer" \
  "$runner_image" >/dev/null; then
  printf 'Refusing launch: runner image has no trusted release-workflow Cosign signature: %s\n' "$runner_image" >&2
  exit 2
fi

kubectl get namespace "$namespace" >/dev/null
namespace_environment="$(kubectl get namespace "$namespace" -o jsonpath='{.metadata.labels.lanai\.io/environment}' 2>/dev/null || true)"
if [[ "$namespace_environment" != "loadtest" && "$namespace_environment" != "staging" ]]; then
  printf '%s\n' 'Refusing launch: namespace must have label lanai.io/environment=loadtest or staging.' >&2
  exit 2
fi

for permission in "create jobs.batch" "get jobs.batch" "get pods" "get pods/log"; do
  if ! kubectl auth can-i -n "$namespace" $permission | grep -qx yes; then
    printf 'Refusing launch: current identity lacks the required namespace permission: %s\n' "$permission" >&2
    exit 2
  fi
done

secret_dsn="$(kubectl -n "$namespace" get secret lanai-loadtest-db -o jsonpath='{.data.DATABASE_URL}' 2>/dev/null || true)"
if [[ -z "$secret_dsn" ]]; then
  printf '%s\n' 'Refusing launch: lanai-loadtest-db must contain a DATABASE_URL key.' >&2
  exit 2
fi

run_id="$(kubectl -n "$namespace" get configmap ledger-soak-settings -o jsonpath='{.data.RUN_ID}')"
target_tps="$(kubectl -n "$namespace" get configmap ledger-soak-settings -o jsonpath='{.data.TARGET_TPS}')"
duration_hours="$(kubectl -n "$namespace" get configmap ledger-soak-settings -o jsonpath='{.data.DURATION_HOURS}')"
max_errors="$(kubectl -n "$namespace" get configmap ledger-soak-settings -o jsonpath='{.data.MAX_ERRORS}')"
if [[ -z "$run_id" || "$run_id" == replace-* ]]; then
  printf '%s\n' 'Refusing launch: configure a unique non-placeholder RUN_ID in ledger-soak-settings.' >&2
  exit 2
fi
if [[ "$target_tps" != "500" || "$duration_hours" != "24" || "$max_errors" != "0" ]]; then
  printf '%s\n' 'Refusing launch: compliance profile requires 500 TPS, 24 hours, and zero tolerated errors.' >&2
  exit 2
fi

# Server-side dry run validates the current cluster admission policies without
# creating a Job. The manifest must already have the approved image digest.
kubectl apply --dry-run=server -f "$manifest" >/dev/null

if kubectl -n "$namespace" get jobs -l app.kubernetes.io/name=ledger-soak-runner -o jsonpath='{.items[?(@.status.active==1)].metadata.name}' | grep -q .; then
  printf '%s\n' 'Refusing launch: an active ledger-soak job already exists in the namespace.' >&2
  exit 2
fi

printf 'Preflight passed: context=%s namespace=%s run_id=%s\n' "$actual_context" "$namespace" "$run_id"
