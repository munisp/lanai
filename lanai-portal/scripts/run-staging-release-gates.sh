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

require_namespace() {
  local name="$1" value="$2"
  if [[ ! "$value" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
    printf '%s must be a valid lowercase Kubernetes namespace.\n' "$name" >&2
    exit 65
  fi
}

require_can_i() {
  local namespace="$1" verb="$2" resource="$3"
  if [[ "$(kubectl auth can-i "$verb" "$resource" -n "$namespace")" != "yes" ]]; then
    printf 'Active identity cannot %s %s in namespace %s.\n' \
      "$verb" "$resource" "$namespace" >&2
    exit 77
  fi
}

require_namespace_label() {
  local namespace="$1" expected_environment="$2"
  if [[ "$(kubectl get namespace "$namespace" -o jsonpath='{.metadata.labels.environment}' 2>/dev/null)" != "$expected_environment" ]]; then
    printf 'Namespace %q does not carry environment=%q.\n' \
      "$namespace" "$expected_environment" >&2
    exit 65
  fi
}

require_secret_key() {
  local namespace="$1" secret="$2" key="$3"
  if ! kubectl get secret "$secret" -n "$namespace" \
    -o "jsonpath={.data.${key}}" 2>/dev/null | grep -q .; then
    printf 'Secret %s/%s is missing required key %s.\n' \
      "$namespace" "$secret" "$key" >&2
    exit 78
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

require_namespace LANAI_STAGING_NAMESPACE "$LANAI_STAGING_NAMESPACE"
require_namespace LANAI_FINANCIAL_NAMESPACE "$LANAI_FINANCIAL_NAMESPACE"
if [[ ! "$LANAI_FINANCIAL_RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$ ]]; then
  printf 'LANAI_FINANCIAL_RUN_ID must be 3–128 safe identifier characters.\n' >&2
  exit 65
fi
if [[ ! "$LANAI_FINANCIAL_RUNNER_IMAGE" =~ ^[a-z0-9][a-z0-9./_-]*@sha256:[a-f0-9]{64}$ ]]; then
  printf 'LANAI_FINANCIAL_RUNNER_IMAGE must be a lowercase immutable sha256 image digest.\n' >&2
  exit 65
fi

current_context="$(kubectl config current-context)"
if [[ "$current_context" != "$LANAI_STAGING_CONTEXT" ]]; then
  printf 'Current context %q does not match approved staging context %q.\n' \
    "$current_context" "$LANAI_STAGING_CONTEXT" >&2
  exit 65
fi

# Namespace reads are cluster-scoped; subsequent operations are constrained to
# the explicitly approved staging and isolated financial namespaces.
if [[ "$(kubectl auth can-i get namespaces)" != "yes" ]]; then
  printf 'Active identity cannot read namespaces for environment-label validation.\n' >&2
  exit 77
fi
require_namespace_label "$LANAI_STAGING_NAMESPACE" "$LANAI_STAGING_ENVIRONMENT"
require_namespace_label "$LANAI_FINANCIAL_NAMESPACE" "$LANAI_STAGING_ENVIRONMENT"

# The admission helper performs server-side dry-runs of the platform manifests.
# The smoke application itself persists a Job and a suspended CronJob.
for permission in \
  "create deployment" \
  "create job" "get job" "patch job" "delete job" \
  "create cronjob" "get cronjob" "patch cronjob" \
  "get secret" "get pod" "get pods/log"; do
  read -r verb resource <<<"$permission"
  require_can_i "$LANAI_STAGING_NAMESPACE" "$verb" "$resource"
done

# The financial evidence manifest persists a ConfigMap, NetworkPolicy, and a
# generated Job in a separate isolated namespace.
for permission in \
  "create configmap" "get configmap" "patch configmap" \
  "create networkpolicy" "get networkpolicy" "patch networkpolicy" \
  "create job" "get job" "patch job" \
  "get secret" "get pod" "get pods/log"; do
  read -r verb resource <<<"$permission"
  require_can_i "$LANAI_FINANCIAL_NAMESPACE" "$verb" "$resource"
done

require_secret_key "$LANAI_STAGING_NAMESPACE" lanai-secrets KEYCLOAK_SMOKE_CLIENT_SECRET
for key in \
  DATABASE_URL TEMPORAL_ADDRESS TIGERBEETLE_ADDRESS FLUVIO_ENDPOINT \
  DAPR_API_TOKEN LAKEHOUSE_INGEST_URL LAKEHOUSE_INGEST_TOKEN; do
  require_secret_key "$LANAI_FINANCIAL_NAMESPACE" lanai-loadtest-financial-services "$key"
done

# First execute the server-side admission gate. Its own exact-context and
# namespace checks prevent persistence and accidental production targeting.
export LANAI_STAGING_CONTEXT LANAI_STAGING_NAMESPACE LANAI_STAGING_ENVIRONMENT
"$ROOT/lanai-portal/scripts/dry-run-staging-admission.sh"

printf 'Running authenticated platform smoke job in %s.\n' "$LANAI_STAGING_NAMESPACE"
kubectl delete job lanai-smoke-test -n "$LANAI_STAGING_NAMESPACE" --ignore-not-found
kubectl apply -n "$LANAI_STAGING_NAMESPACE" -f "$ROOT/config/k8s/smoke-test.yaml"
kubectl wait --for=condition=complete job/lanai-smoke-test \
  -n "$LANAI_STAGING_NAMESPACE" --timeout=300s
kubectl logs job/lanai-smoke-test -n "$LANAI_STAGING_NAMESPACE" --all-containers=true

# Render only validated release-evidence values. All financial manifest objects
# are rewritten into the independently label-checked financial namespace.
tmp_manifest="$(mktemp)"
trap 'rm -f "$tmp_manifest"' EXIT
sed \
  -e "s|namespace: lanai-loadtest|namespace: ${LANAI_FINANCIAL_NAMESPACE}|g" \
  -e "s|replace-with-change-ticket-and-utc-run-id|${LANAI_FINANCIAL_RUN_ID}|g" \
  -e "s|ghcr.io/munisp/lanai-financial-loadtest:REPLACE_WITH_SIGNED_DIGEST|${LANAI_FINANCIAL_RUNNER_IMAGE}|g" \
  "$ROOT/config/k8s/loadtest/live-financial-workflow-runner.yaml" > "$tmp_manifest"
if grep -qE 'REPLACE_WITH_SIGNED_DIGEST|replace-with-change-ticket-and-utc-run-id' "$tmp_manifest"; then
  printf 'Financial evidence manifest retained an unresolved image or run-ID placeholder.\n' >&2
  exit 70
fi
if [[ "$LANAI_FINANCIAL_NAMESPACE" != "lanai-loadtest" ]] \
  && grep -q 'namespace: lanai-loadtest' "$tmp_manifest"; then
  printf 'Financial evidence manifest retained the default financial namespace.\n' >&2
  exit 70
fi

printf 'Running live financial evidence job in %s.\n' "$LANAI_FINANCIAL_NAMESPACE"
apply_output="$(kubectl apply -n "$LANAI_FINANCIAL_NAMESPACE" -f "$tmp_manifest" -o name)"
job_name="$(printf '%s\n' "$apply_output" | awk '/^job\.batch\// { sub(/^job\.batch\//, ""); print; exit }')"
if [[ -z "$job_name" ]]; then
  printf 'Financial evidence Job was not created by the rendered manifest.\n' >&2
  exit 70
fi
kubectl wait --for=condition=complete "job/${job_name}" \
  -n "$LANAI_FINANCIAL_NAMESPACE" --timeout=10800s
kubectl logs "job/${job_name}" -n "$LANAI_FINANCIAL_NAMESPACE" --all-containers=true

printf 'Staging smoke and financial evidence gates completed successfully.\n'
