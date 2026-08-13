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

kubectl get namespace "$namespace" >/dev/null
namespace_environment="$(kubectl get namespace "$namespace" -o jsonpath='{.metadata.labels.lanai\.io/environment}' 2>/dev/null || true)"
if [[ "$namespace_environment" != "loadtest" && "$namespace_environment" != "staging" ]]; then
  printf '%s\n' 'Refusing launch: namespace must have label lanai.io/environment=loadtest or staging.' >&2
  exit 2
fi

kubectl -n "$namespace" get secret lanai-loadtest-db >/dev/null
run_id="$(kubectl -n "$namespace" get configmap ledger-soak-settings -o jsonpath='{.data.RUN_ID}')"
if [[ -z "$run_id" || "$run_id" == replace-* ]]; then
  printf '%s\n' 'Refusing launch: configure a unique non-placeholder RUN_ID in ledger-soak-settings.' >&2
  exit 2
fi

if kubectl -n "$namespace" get jobs -l app.kubernetes.io/name=ledger-soak-runner -o jsonpath='{.items[?(@.status.active==1)].metadata.name}' | grep -q .; then
  printf '%s\n' 'Refusing launch: an active ledger-soak job already exists in the namespace.' >&2
  exit 2
fi

printf 'Preflight passed: context=%s namespace=%s run_id=%s\n' "$actual_context" "$namespace" "$run_id"
