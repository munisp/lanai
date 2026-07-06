#!/bin/bash
# ==============================================================================
# Lanai Portal — Redeploy Script
# ==============================================================================
# Run this script on the lanai-server host to rebuild and redeploy the fixed code.
# ==============================================================================

set -e

echo "=========================================="
echo "  Lanai Portal Redeployment Script"
echo "=========================================="
echo ""

# Check if running as root/sudo
if [ "$EUID" -ne 0 ]; then
  echo "ERROR: This script must be run as root (use sudo)"
  exit 1
fi

# Configuration
REPO_DIR="/opt/lanai"
BUILD_DIR="/opt/lanai/lanai-portal"
IMAGE_NAME="lanai-server"
CONTAINER_NAME="lanai-server"

echo "[1/6] Checking prerequisites..."
if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker is not installed"
  exit 1
fi

if ! command -v git &> /dev/null; then
  echo "ERROR: Git is not installed"
  exit 1
fi

echo "  ✓ Docker installed"
echo "  ✓ Git installed"
echo ""

echo "[2/6] Pulling latest code from GitHub..."
if [ -d "$REPO_DIR/.git" ]; then
  cd "$REPO_DIR"
  git fetch origin
  git reset --hard origin/main
  echo "  ✓ Repository updated"
else
  echo "  Cloning repository..."
  git clone https://berylm1@github.com/berylm1/lanai.git "$REPO_DIR"
  cd "$REPO_DIR"
  echo "  ✓ Repository cloned"
fi
echo ""

echo "[3/6] Building Docker image with VITE_ environment variables..."
cd "$BUILD_DIR"

# Pass VITE_ env vars at build time (CRITICAL - frontend needs these)
sudo docker build \
  --build-arg VITE_OAUTH_PORTAL_URL=http://keycloak:8080 \
  --build-arg VITE_APP_ID=lanai-portal \
  --build-arg VITE_FRONTEND_FORGE_API_URL=http://dapr:3500 \
  --build-arg VITE_FRONTEND_FORGE_API_KEY="${BUILT_IN_FORGE_API_KEY:-CHANGE_ME}" \
  -t "${IMAGE_NAME}:latest" \
  .

echo "  ✓ Docker image built successfully"
echo ""

echo "[4/6] Stopping old container..."
sudo docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
echo "  ✓ Old container removed"
echo ""

echo "[5/6] Starting new container..."
sudo docker run -d \
  --name "$CONTAINER_NAME" \
  --network app-net \
  --restart unless-stopped \
  -p 3001:3001 \
  -v "$REPO_DIR/lanai-portal/.env:/app/.env:ro" \
  --label "com.lanai.version=1.0.0" \
  --health-cmd="wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1" \
  --health-interval=30s \
  --health-timeout=5s \
  --health-retries=3 \
  "${IMAGE_NAME}:latest"

echo "  ✓ New container started"
echo ""

echo "[6/6] Verifying deployment..."
sleep 5

echo "  Checking container status..."
sudo docker ps | grep "$CONTAINER_NAME"

echo ""
echo "  Testing endpoints..."

# Test SPA load
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/)
echo "    SPA load: HTTP $HTTP_CODE"

# Test tRPC health endpoint
RESPONSE=$(curl -s http://localhost:3001/api/trpc/system.health?input=%7B%7D 2>&1 | head -1)
echo "    tRPC health: $RESPONSE"

echo ""
echo "=========================================="
echo "  ✓ Deployment Complete!"
echo "=========================================="
echo ""
echo "Access the portal at: https://lanai.newfire.app"
echo "View logs: sudo docker logs -f $CONTAINER_NAME"
echo "Revert: sudo docker restart $CONTAINER_NAME"
echo ""
