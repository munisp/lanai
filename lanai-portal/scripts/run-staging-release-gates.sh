#!/usr/bin/env bash
# Execute only after a change owner has approved testing against an isolated
# staging environment. This script never defaults a context, namespace, image,
# or approval flag.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required release-gate environment variable: %s\n' "$name" >&2
    exit 64
  fi
}

for name in \
  LANAI_APPROVE_STAGING_EXECUTION \
  LANAI_STAGING_CONTEXT \
  LANAI_STAGING_NAMESPACE \
  LANAI_STAGING_ENVIRONMENT \
  LANAI_FINANCIAL_NAMESPACE \
  LANAI_FINANCIAL_RUN_ID \
  LANAI_FINANCIAL_RUNNER_IMAGE; do
  require_env "$name"
done

if [[ "$LANAI_APPROVE_STAGING_EXECUTION" != "1" ]]; then
  printf 'Refusing to execute staging release gates without LANAI_APPROVE_STAGING_EXECUTION=1.\n' >&2
  exit 65
fi

if ! command -v kubectl >/dev/null 2>&1; then
  printf 'kubectl is required for live staging release gates.\n' >&2
  exit 69
fi

current_context="$(kubectl config current-context)"
if [[ "$current_context" != "$LANAI_STAGING_CONTEXT" ]]; then
  printf 'Current context %q does not match approved staging context %q.\n' \
    "$current_context" "$LANAI_STAGING_CONTEXT" >&2
  exit 65
fi

if [[ "$(kubectl get namespace "$LANAI_STAGING_NAMESPACE" -o jsonpath='{.metadata.labels.environment}' 2>/dev/null)" != "$LANAI_STAGING_ENVIRONMENT" ]]; then
  printf 'Target namespace %q does not carry environment=%q.\n' \
    "$LANAI_STAGING_NAMESPACE" "$LANAI_STAGING_ENVIRONMENT" >&2
  exit 65
fi

for permission in \
  "create deployment" \
  "create job" \
  "delete job" \
  "get secret"; do
  read -r verb resource <<<"$permission"
  if [[ "$(kubectl auth can-i "$verb" "$resource" -n "$LANAI_STAGING_NAMESPACE")" != "yes" ]]; then
    printf 'Active identity cannot %s %s in %s.\n' "$verb" "$resource" "$LANAI_STAGING_NAMESPACE" >&2
    exit 77
  fi
done

for key in KEYCLOAK_SMOKE_CLIENT_SECRET; do
  if ! kubectl get secret lanai-secrets -n "$LANAI_STAGING_NAMESPACE" \
    -o "jsonpath={.data.${key}}" 2>/dev/null | grep -q .; then
    printf 'lanai-secrets/%s is missing required key %s.\n' \
      "$LANAI_STAGING_NAMESPACE" "$key" >&2
    exit 78
  fi
done

for key in \
  DATABASE_URL TEMPORAL_ADDRESS TIGERBEETLE_ADDRESS FLUVIO_ENDPOINT \
  DAPR_API_TOKEN LAKEHOUSE_INGEST_URL LAKEHOUSE_INGEST_TOKEN; do
  if ! kubectl get secret lanai-loadtest-financial-services -n "$LANAI_FINANCIAL_NAMESPACE" \
    -o "jsonpath={.data.${key}}" 2>/dev/null | grep -q .; then
    printf 'lanai-loadtest-financial-services/%s is missing required key %s.\n' \
      "$LANAI_FINANCIAL_NAMESPACE" "$key" >&2
    exit 78
  fi
done

# First execute the server-side admission gate. Its own context and namespace
# validation prevents a production cluster from being targeted accidentally.
export LANAI_STAGING_CONTEXT LANAI_STAGING_NAMESPACE LANAI_STAGING_ENVIRONMENT
"$ROOT/lanai-portal/scripts/dry-run-staging-admission.sh"

printf 'Running authenticated platform smoke job in %s.\n' "$LANAI_STAGING_NAMESPACE"
kubectl delete job lanai-smoke-test -n "$LANAI_STAGING_NAMESPACE" --ignore-not-found
kubectl apply -n "$LANAI_STAGING_NAMESPACE" -f "$ROOT/config/k8s/smoke-test.yaml"
kubectl wait --for=condition=complete job/lanai-smoke-test \
  -n "$LANAI_STAGING_NAMESPACE" --timeout=300s
kubectl logs job/lanai-smoke-test -n "$LANAI_STAGING_NAMESPACE" --all-containers=true

# Render only the deliberate evidence values; the runner image must already be
# a signed immutable digest approved by the release process.
if [[ "$LANAI_FINANCIAL_RUNNER_IMAGE" != *@sha256:* ]]; then
  printf 'LANAI_FINANCIAL_RUNNER_IMAGE must be an immutable image digest.\n' >&2
  exit 65
fi

tmp_manifest="$(mktemp)"
trap 'rm -f "$tmp_manifest"' EXIT
sed \
  -e "s|replace-with-change-ticket-and-utc-run-id|${LANAI_FINANCIAL_RUN_ID}|g" \
  -e "s|ghcr.io/munisp/lanai-financial-loadtest:REPLACE_WITH_SIGNED_DIGEST|${LANAI_FINANCIAL_RUNNER_IMAGE}|g" \
  "$ROOT/config/k8s/loadtest/live-financial-workflow-runner.yaml" > "$tmp_manifest"

printf 'Running live financial evidence job in %s.\n' "$LANAI_FINANCIAL_NAMESPACE"
kubectl apply -f "$tmp_manifest"
job_name="$(kubectl get jobs -n "$LANAI_FINANCIAL_NAMESPACE" \
  -l app.kubernetes.io/name=financial-workflow-runner \
  --sort-by=.metadata.creationTimestamp \
  -o jsonpath='{.items[-1:].metadata.name}')"
if [[ -z "$job_name" ]]; then
  printf 'Financial evidence Job was not created.\n' >&2
  exit 70
fi
kubectl wait --for=condition=complete "job/${job_name}" \
  -n "$LANAI_FINANCIAL_NAMESPACE" --timeout=10800s
kubectl logs "job/${job_name}" -n "$LANAI_FINANCIAL_NAMESPACE" --all-containers=true

printf 'Staging smoke and financial evidence gates completed successfully.\n'
