#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required external-test environment variable: %s\n' "$name" >&2
    exit 64
  fi
}

for name in \
  DATABASE_URL \
  PERMIFY_GRPC_ADDRESS \
  TWENTY_CRM_URL \
  TWENTY_CRM_API_TOKEN \
  STRIPE_SECRET_KEY \
  STRIPE_PRICE_ID_PLATINUM; do
  require_env "$name"
done

export NODE_ENV="test"
export RUN_EXTERNAL_CRM_TESTS="1"
export RUN_EXTERNAL_STRIPE_TESTS="1"
export PERMIFY_TENANT_ID="${PERMIFY_TENANT_ID:-lanai-test}"
export PERMIFY_INSECURE="${PERMIFY_INSECURE:-true}"
export EXTERNAL_TEST_NAMESPACE="${EXTERNAL_TEST_NAMESPACE:-lanai-ci}"
export EXTERNAL_TEST_RUN_ID="${EXTERNAL_TEST_RUN_ID:-local-$(date +%s)}"

# External sandbox coverage must never inherit a local Stripe fixture endpoint.
unset STRIPE_API_BASE_URL

pnpm exec vitest run \
  server/crm.external.test.ts \
  server/stripe.external.test.ts \
  --fileParallelism=false \
  --maxWorkers=1 \
  --reporter=verbose
