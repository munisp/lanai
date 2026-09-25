#!/bin/bash
# Deploy the voice/triage/SLA block ON TOP OF a standard deploy_pilot.sh run.
# Run on the host:  ssh newwaveclaw@america 'bash -s' < deploy_voice_block.sh
# Prereq: deploy_pilot.sh has already rolled the branch tip image containing
# the voice/triage/SLA code. This script adds the whisper service and the new
# environment wiring, then verifies.

set -u
cd /opt/lanai || exit 1
K="docker exec newwave-dev-control-plane kubectl -n lanai"

echo "=== PHASE A: whisper (local STT, ClusterIP only, no Ingress) ==="
# kubectl inside the control-plane container cannot see host paths; pipe the
# manifest in on stdin instead of passing a host path.
cat config/k8s/whisper.yaml | docker exec -i newwave-dev-control-plane kubectl -n lanai apply -f - || exit 1
echo "waiting for whisper (first boot downloads the model, can take minutes)..."
$K wait --for=condition=available deployment/whisper --timeout=600s || {
  echo "whisper not ready yet; pod status:"
  $K get pods -l app=whisper
  echo "check model download progress: $K logs deploy/whisper | tail -20"
  exit 1
}

echo "=== PHASE B: portal env wiring ==="
$K set env deployment/lanai-portal \
  TRANSCRIBE_API_URL=http://whisper:8000 \
  TRANSCRIBE_MODEL_HINT=small \
  TRANSCRIBE_TIMEOUT_MS=90000 \
  SLA_SCHEDULER_ENABLED=true \
  BRIEFING_HOUR=6

echo "=== PHASE C: verify ==="
$K rollout status deployment/lanai-portal --timeout=300s || exit 1
$K exec deploy/lanai-portal -- node -e 'fetch("http://whisper:8000/health").then(r=>{console.log("whisper health:",r.status)}).catch(e=>console.log("whisper unreachable:",e.message))' || true
$K exec deploy/lanai-portal -- sh -c 'env | grep -E "TRANSCRIBE|SLA_SCHEDULER|BRIEFING_HOUR" | sed "s/=.*/=<set>/"' || true
echo "=== DONE: whisper deployed, portal env wired, rollout healthy ==="