#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${SERVER_SMOKE_PORT:-3101}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="/tmp/lanai-server-contract-smoke.log"

cd "${ROOT}/lanai-portal"
setsid env \
  NODE_ENV=development \
  PORT="${PORT}" \
  DATABASE_URL="postgres://validation:validation@127.0.0.1:5432/lanai" \
  JWT_SECRET="validation-only-secret" \
  ./node_modules/.bin/tsx server/_core/index.ts >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill -- "-${SERVER_PID}" >/dev/null 2>&1 || true
  wait "${SERVER_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl --fail --silent --show-error "${BASE_URL}/" >/tmp/lanai-server-root.html 2>/dev/null; then
    break
  fi
  sleep 0.25
done

if [[ ! -s /tmp/lanai-server-root.html ]] || ! grep -F 'id="root"' /tmp/lanai-server-root.html >/dev/null; then
  echo "Server did not serve the React application shell" >&2
  tail -n 100 "${LOG_FILE}" >&2
  exit 1
fi

health_status="$(curl --silent --output /tmp/lanai-health.json --write-out '%{http_code}' "${BASE_URL}/api/health")"
if [[ "${health_status}" != "503" ]]; then
  echo "Expected database-unavailable health response 503, got ${health_status}" >&2
  cat /tmp/lanai-health.json >&2
  exit 1
fi
if ! grep -q '"status":"unavailable"' /tmp/lanai-health.json; then
  echo "Health response did not report fail-closed unavailability" >&2
  cat /tmp/lanai-health.json >&2
  exit 1
fi

auth_status="$(curl --silent --output /tmp/lanai-ai-unauthorized.json --write-out '%{http_code}' --request POST "${BASE_URL}/api/proposals/generate-proposal" --header 'content-type: application/json' --data '{}')"
if [[ "${auth_status}" != "401" ]]; then
  echo "Expected unauthenticated AI request to be rejected with 401, got ${auth_status}" >&2
  cat /tmp/lanai-ai-unauthorized.json >&2
  exit 1
fi

trpc_status="$(curl --silent --output /tmp/lanai-trpc-unauthorized.json --write-out '%{http_code}' "${BASE_URL}/api/trpc/members.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D")"
if [[ "${trpc_status}" != "401" ]]; then
  echo "Expected protected tRPC request to be rejected with 401, got ${trpc_status}" >&2
  cat /tmp/lanai-trpc-unauthorized.json >&2
  exit 1
fi

cors_status="$(curl --silent --output /tmp/lanai-cors.txt --write-out '%{http_code}' --request OPTIONS "${BASE_URL}/api/trpc/members.list" --header 'Origin: http://localhost:3001' --header 'Access-Control-Request-Method: GET')"
if [[ "${cors_status}" != "204" ]]; then
  echo "Expected permitted CORS preflight response 204, got ${cors_status}" >&2
  cat /tmp/lanai-cors.txt >&2
  exit 1
fi

webhook_status="$(curl --silent --output /tmp/lanai-webhook.txt --write-out '%{http_code}' --request POST "${BASE_URL}/api/stripe/webhook" --header 'content-type: application/json' --data '{}')"
if [[ "${webhook_status}" != "400" && "${webhook_status}" != "503" ]]; then
  echo "Expected unsigned Stripe webhook rejection, got ${webhook_status}" >&2
  cat /tmp/lanai-webhook.txt >&2
  exit 1
fi

echo "Server contract smoke test passed: React shell, fail-closed health, protected AI/tRPC, CORS, and webhook rejection."
