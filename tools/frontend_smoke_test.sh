#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${FRONTEND_SMOKE_PORT:-4173}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="/tmp/lanai-frontend-preview.log"

cd "${ROOT}/lanai-portal"
setsid ./node_modules/.bin/vite preview --host 127.0.0.1 --port "${PORT}" >"${LOG_FILE}" 2>&1 &
PREVIEW_PID=$!
cleanup() {
  kill -- "-${PREVIEW_PID}" >/dev/null 2>&1 || true
  wait "${PREVIEW_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl --fail --silent "${BASE_URL}/" >/tmp/lanai-frontend-root.html 2>/dev/null; then
    break
  fi
  sleep 0.25
done

if ! grep -Fq 'id="root"' /tmp/lanai-frontend-root.html; then
  echo "Root document did not contain the React mount point" >&2
  exit 1
fi

routes=(
  "/"
  "/client"
  "/client/onboard"
  "/client/dashboard"
  "/client/billing"
  "/client/profile"
  "/clients"
  "/travel-requests"
  "/members"
  "/member-management"
  "/proposals"
  "/intelligence"
  "/briefing"
  "/suppliers"
  "/supplier-services"
  "/whatsapp"
  "/inbox"
  "/chatwoot"
  "/communication-hub"
  "/analytics"
  "/invoicing"
  "/nps"
  "/task-templates"
  "/member/1"
  "/member/1/celebrations"
  "/member/1/trip-timeline"
  "/member/1/ai-concierge"
  "/settings"
)

for route in "${routes[@]}"; do
  response="$(curl --fail --silent --show-error "${BASE_URL}${route}")"
  if [[ "${response}" != *'<div id="root"></div>'* ]]; then
    echo "SPA fallback failed for ${route}" >&2
    exit 1
  fi
  echo "PASS ${route}"
done

echo "Frontend smoke test passed for ${#routes[@]} routes."
