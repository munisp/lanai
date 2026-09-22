#!/usr/bin/env bash
# Lanai Lifestyle Platform — Health Check Script
# Checks all services and reports status

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TOTAL=0
PASSED=0
FAILED=0

check_service() {
  local name="$1"
  local url="$2"
  TOTAL=$((TOTAL + 1))
  if curl -s -f --max-time 5 "$url" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} $name (healthy)"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗${NC} $name (unhealthy)"
    FAILED=$((FAILED + 1))
  fi
}

check_docker() {
  local name="$1"
  local container="$2"
  TOTAL=$((TOTAL + 1))
  if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    echo -e "${GREEN}✓${NC} $name (running)"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗${NC} $name (not running)"
    FAILED=$((FAILED + 1))
  fi
}

echo "====================================="
echo " Lanai Platform Health Check"
echo " $(date)"
echo "====================================="
echo ""

# Check infrastructure services
echo "--- Infrastructure ---"
check_service "MySQL" "http://localhost:3306" 2>/dev/null || check_docker "MySQL" "lanai-mysql"
check_service "Redis" "http://localhost:6379" 2>/dev/null || check_docker "Redis" "lanai-redis"
check_service "MinIO" "http://localhost:9000/minio/health/live" 2>/dev/null || check_docker "MinIO" "lanai-minio"
echo ""

# Check core services
echo "--- Core Services ---"
check_service "Twenty CRM" "http://localhost:3000"
check_service "Ollama" "http://localhost:11434"
check_service "Server" "http://localhost:3001/api/health"
echo ""

# Check AI microservices
echo "--- AI Microservices ---"
check_service "Proposals Engine" "http://localhost:5556"
check_service "Intelligence Engine" "http://localhost:5557"
check_service "Briefing Service" "http://localhost:5558"
check_service "WhatsApp Bridge" "http://localhost:5555"
echo ""

# Summary
echo "====================================="
echo " Results: $PASSED/$TOTAL passed"
if [ $FAILED -gt 0 ]; then
  echo -e " ${RED}$FAILED service(s) unhealthy${NC}"
  exit 1
else
  echo -e " ${GREEN}All services healthy!${NC}"
  exit 0
fi
