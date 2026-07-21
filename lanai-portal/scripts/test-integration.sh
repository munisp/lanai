#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required integration-test environment variable: %s\n' "$name" >&2
    exit 64
  fi
}

require_env DATABASE_URL
require_env PERMIFY_GRPC_ADDRESS

export NODE_ENV="test"
export PERMIFY_TENANT_ID="${PERMIFY_TENANT_ID:-lanai-test}"
export PERMIFY_INSECURE="${PERMIFY_INSECURE:-true}"

# The smoke suites reset a shared database before every test case, so they must
# run sequentially. They exercise PostgreSQL persistence and real Permify policy
# checks while mocking only unrelated external side effects.
pnpm exec vitest run \
  server/smoke.test.ts \
  server/smoke.phase2.test.ts \
  --fileParallelism=false \
  --reporter=verbose
