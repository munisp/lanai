#!/bin/bash
# Deploy the pilot branch to the newwave-dev KIND cluster on the Minisforum.
# Runs on the host via: ssh newwaveclaw@america 'bash -s' < deploy_pilot.sh
# Gate requirement: the backup restore rehearsal must have PASSED first.
# Phases are gated: if build fails, nothing rolls; if rollout fails, no migration.

set -u
K="docker exec newwave-dev-control-plane kubectl -n lanai"
CLUSTER=newwave-dev
BRANCH=pilot/requirements-baseline-2026-09

echo "=== PHASE 1: sync to origin tip of the pilot branch ==="
cd /opt/lanai || exit 1
git fetch origin || exit 1
if [ -n "$(git status --porcelain | head -1)" ]; then
  echo "Host checkout has uncommitted work; archiving it first (nothing is discarded)"
  git checkout -b archive/host-wip-20260922 2>/dev/null || git checkout archive/host-wip-20260922
  git add -A
  git commit -m "Preserve uncommitted host state before pilot deploy (2026-09-23)" || echo "nothing to commit"
  git push origin archive/host-wip-20260922 || echo "NOTE: push of archive branch failed (no push creds on host); commit is preserved locally"
fi
git checkout $BRANCH || exit 1
git reset --hard origin/$BRANCH || exit 1
TIP=$(git rev-parse --short HEAD)
echo "tip: $TIP (origin tip of $BRANCH)"
if [ -z "$TIP" ]; then echo "ABORT: could not read tip"; exit 1; fi

echo "=== PHASE 2: docker build from repo root (5-10 min) ==="
TAG=kasi-20260923-$(git rev-parse --short HEAD)
IMAGE=registry.digitalocean.com/talentgraph-auth/lanai-portal:$TAG
echo "image: $IMAGE"
docker build -f lanai-portal/Dockerfile -t $IMAGE . > /tmp/lanai_build.log 2>&1
if [ $? -ne 0 ]; then
  echo "BUILD FAILED. Last lines:"
  tail -25 /tmp/lanai_build.log
  exit 1
fi
echo "build ok: $(docker images -q $IMAGE | head -1)"

echo "=== PHASE 3: load image into the kind cluster ==="
if command -v kind >/dev/null; then
  kind load docker-image $IMAGE --name $CLUSTER || { echo "ABORT: kind load failed"; exit 1; }
else
  echo "kind CLI missing, using ctr import fallback"
  docker save $IMAGE | docker exec -i newwave-dev-control-plane ctr -n k8s.io images import -
fi

echo "=== PHASE 4: roll the deployment ==="
$K set image deployment/lanai-portal lanai-portal=$IMAGE
if ! $K rollout status deployment/lanai-portal --timeout=300s; then
  echo "ROLLOUT FAILED. New pod logs:"
  NEWPOD=$($K get pods -l app=lanai-portal --sort-by=.metadata.creationTimestamp --no-headers | tail -1 | awk '{print $1}')
  $K logs $NEWPOD -c lanai-portal --tail=60 2>&1 | tail -40
  echo "Restoring July image (set image, not rollout undo):"
  $K set image deployment/lanai-portal lanai-portal=registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260725-1441-fix2
  $K rollout status deployment/lanai-portal --timeout=180s
  exit 1
fi
$K get pods -l app=lanai-portal --no-headers

echo "=== PHASE 5: run migration 0011 ==="
$K exec deploy/lanai-portal -c lanai-portal -- node dist/migrate.js 2>&1 | tail -20

echo "=== PHASE 6: verify the three new tables ==="
PGPOD=$($K get pods --no-headers 2>/dev/null | grep "^postgres-" | grep -v exporter | awk '{print $1}' | head -1)
$K exec $PGPOD -- psql -U lanai -d lanai -tAc "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('client_memory','sla_timers','proposal_versions') ORDER BY 1"

echo "=== DEPLOY COMPLETE. Verify https://lanai.newfire.app from a browser ==="
echo "clients.list unauthenticated should flip from 404 to 401 UNAUTHORIZED."
