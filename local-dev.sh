#!/usr/bin/env bash
# Lanai local development stack manager
# Usage: ./local-dev.sh {up|down|status|logs}
set -euo pipefail

LANAI="$HOME/lanai"
PORTAL="$LANAI/lanai-portal"
AI="$LANAI/lanai_ai"
NODE_BIN="/opt/homebrew/opt/node/bin"
GATEWAY_TOKEN="lanai-dev-gateway-token"

# Docker containers that make up the platform infrastructure
CONTAINERS="lanai-postgres lanai-redis lanai-keycloak lanai-permify lanai-ollama lanai-twenty lanai-chatwoot-postgres lanai-chatwoot"

start_docker() {
  echo "==> Starting Docker infrastructure containers"
  for c in $CONTAINERS; do
    if docker ps -a --format '{{.Names}}' | grep -q "^$c$"; then
      docker start "$c" >/dev/null 2>&1 || true
    fi
  done
  echo "==> Waiting for services..."
  for i in $(seq 1 40); do
    kc=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/realms/lanai/.well-known/openid-configuration 2>/dev/null || true)
    pf=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3476/healthz 2>/dev/null || true)
    ol=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:11434/api/tags 2>/dev/null || true)
    [ "$kc" = "200" ] && [ "$pf" = "200" ] && [ "$ol" = "200" ] && { echo "   all infra ready"; break; }
    sleep 5
  done
}

start_ai() {
  echo "==> Starting AI pillars + gateway"
  cd "$AI"
  export PYTHONPATH="$LANAI:$LANAI/lanai_ai"
  export OLLAMA_BASE_URL="http://localhost:11434"
  export OLLAMA_MODEL="qwen2.5:0.5b"
  nohup .venv/bin/python pillars/whatsapp/whatsapp_ai_bridge.py > /tmp/pillar-whatsapp.log 2>&1 &
  nohup .venv/bin/python pillars/proposals/app.py > /tmp/pillar-proposals.log 2>&1 &
  nohup .venv/bin/python pillars/intelligence/app.py > /tmp/pillar-intelligence.log 2>&1 &
  nohup .venv/bin/python pillars/briefing/app.py > /tmp/pillar-briefing.log 2>&1 &
  # Chatwoot AI bridge needs Chatwoot + Twenty CRM credentials and a shorter
  # Ollama timeout so the 24/7 auto-reply fallback fires quickly on slow hosts.
  TWENTY_CRM_TOKEN="$(grep '^TWENTY_CRM_API_TOKEN=' "$PORTAL/.env" | cut -d= -f2-)"
  nohup env PORT=5560 \
    CHATWOOT_URL="http://localhost:3002" \
    CHATWOOT_ACCESS_TOKEN="51RqBrhbAzejTCSnbxrviTeT" \
    CHATWOOT_ACCOUNT_ID="1" \
    TWENTY_CRM_URL="http://localhost:3000" \
    TWENTY_CRM_API_TOKEN="$TWENTY_CRM_TOKEN" \
    OLLAMA_TIMEOUT_SECONDS="60" \
    .venv/bin/python pillars/chatwoot/app.py > /tmp/pillar-chatwoot.log 2>&1 &
  nohup env AI_GATEWAY_TOKEN="$GATEWAY_TOKEN" .venv/bin/uvicorn gateway.app:app --host 0.0.0.0 --port 8100 > /tmp/gateway.log 2>&1 &
  echo "   AI services launched"
}

start_portal() {
  echo "==> Starting portal (Node 26)"
  cd "$PORTAL"
  nohup env PATH="$NODE_BIN:$PATH" pnpm dev > /tmp/lanai-dev.log 2>&1 &
  echo "   portal launching on http://localhost:3001"
}

stop_all() {
  echo "==> Stopping host services"
  pkill -9 -f "tsx watch server/_core/index.ts" 2>/dev/null || true
  pkill -9 -f "pillars/" 2>/dev/null || true
  pkill -9 -f "uvicorn gateway.app" 2>/dev/null || true
  pkill -9 -f "pnpm dev" 2>/dev/null || true
  echo "==> Stopping Docker containers"
  docker stop $CONTAINERS 2>/dev/null || true
  echo "   stopped"
}

status() {
  echo "==> Docker containers"
  docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null | grep lanai || echo "   (none running)"
  echo "==> Portal"
  curl -s -m 3 http://localhost:3001/api/health 2>/dev/null && echo || echo "   portal not running"
  echo "==> AI services"
  for p in 5555 5556 5557 5558 5560 8100; do
    echo -n "   :$p -> "; curl -s -m 3 http://localhost:$p/health 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('status'))" 2>/dev/null || echo "down"
  done
}

case "${1:-up}" in
  up)     start_docker; start_ai; start_portal; echo "Done. Open http://localhost:3001";;
  down)   stop_all;;
  status) status;;
  logs)   echo "portal:  /tmp/lanai-dev.log"; echo "gateway: /tmp/gateway.log"; echo "pillars: /tmp/pillar-*.log";;
  *)      echo "Usage: $0 {up|down|status|logs}";;
esac
