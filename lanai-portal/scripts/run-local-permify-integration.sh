#!/usr/bin/env bash
# Runs the live Permify integration tier against an isolated ephemeral PostgreSQL
# container. No production/staging credential is read or printed.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
portal_dir="$repo_root/lanai-portal"
compose_file="$repo_root/docker-compose.permify-test.yml"
project_name="lanai-permify-integration"
keep_stack="${KEEP_PERMIFY_TEST_STACK:-false}"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 2
  }
}
require docker
require pnpm

cleanup() {
  if [[ "$keep_stack" != "true" ]]; then
    docker compose --project-name "$project_name" -f "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "$repo_root"
docker compose --project-name "$project_name" -f "$compose_file" up --detach --wait

export DATABASE_URL="postgresql://lanai_test:lanai_test_only@127.0.0.1:54329/lanai_permify_test"
export PERMIFY_GRPC_ADDRESS="127.0.0.1:34788"
export PERMIFY_TENANT_ID="lanai-test"
export PERMIFY_INSECURE="true"
export PERMIFY_SCHEMA_FILE="$repo_root/config/permify/schema.perm"
export NODE_ENV="test"

# The bootstrap verifies gRPC reachability, creates the test tenant idempotently,
# and fails if Permify does not issue a schema version.
for attempt in $(seq 1 30); do
  if (cd "$portal_dir" && pnpm exec tsx server/scripts/bootstrapPermify.ts); then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    printf '%s\n' 'Permify bootstrap did not become ready in time.' >&2
    exit 1
  fi
  sleep 2
done

cd "$portal_dir"
pnpm test:integration
pnpm vitest run server/test/gateway-e2e.test.ts --pool=forks --fileParallelism=false --maxWorkers=1
