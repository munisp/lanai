#!/bin/bash
# Diagnose the lanai-portal rollout failure. Re-applies the pilot image,
# captures the failing pod's startup logs and the in-pod probe response,
# then restores the July image explicitly. The site stays up throughout:
# the two old replicas keep serving while the new pod is being probed.
# NOTE: uses `set image` for the restore, NOT `rollout undo` — after the
# first rollback, `undo` would roll FORWARD onto the failed pilot revision.
set -u
TAG=kasi-20260922-pilot-565c9d2
IMAGE=registry.digitalocean.com/talentgraph-auth/lanai-portal:$TAG
JULY=registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260725-1441-fix2
K="docker exec newwave-dev-control-plane kubectl -n lanai"

echo "=== [1/6] current image, then re-apply pilot image ==="
$K get deploy lanai-portal -o jsonpath='{.spec.template.spec.containers[0].image}'; echo
$K set image deployment/lanai-portal lanai-portal=$IMAGE

echo "=== [2/6] wait for the new pod, confirm it is the pilot image ==="
sleep 25
NEWPOD=$($K get pods -l app=lanai-portal --sort-by=.metadata.creationTimestamp --no-headers | tail -1 | awk '{print $1}')
PODIMG=$($K get pod $NEWPOD -o jsonpath='{.spec.containers[0].image}')
echo "newest pod: $NEWPOD"
echo "pod image:  $PODIMG"
case "$PODIMG" in
  *$TAG*) ;;
  *) echo "ABORT: newest pod is not the pilot image; state unchanged"; exit 1;;
esac
$K get pod $NEWPOD --no-headers

echo "=== [3/6] pod logs: startup lines + any error stacks ==="
$K logs $NEWPOD -c lanai-portal --tail=120 2>&1 | tail -60
echo "--- previous container logs (if kubelet restarted it) ---"
$K logs $NEWPOD -c lanai-portal --previous --tail=80 2>&1 | tail -40

echo "=== [4/6] health endpoint as seen from INSIDE the pod ==="
$K exec $NEWPOD -c lanai-portal -- node -e "fetch('http://127.0.0.1:3001/api/health').then(async r=>{console.log('STATUS',r.status);console.log('BODY',await r.text());process.exit(0)}).catch(e=>{console.log('FETCH-ERR',e.message);process.exit(0)})" 2>&1 | tail -5
echo "--- dapr sidecar health (127.0.0.1:3500) ---"
$K exec $NEWPOD -c lanai-portal -- node -e "fetch('http://127.0.0.1:3500/v1.0/healthz').then(async r=>{console.log('DAPR STATUS',r.status)}).catch(e=>{console.log('DAPR-ERR',e.message)})" 2>&1 | tail -3

echo "=== [5/6] container statuses + pod events at capture time ==="
$K get pod $NEWPOD -o jsonpath='{range .status.containerStatuses[*]}{.name}{" ready="}{.ready}{" restarts="}{.restartCount}{" state="}{.state}{"\n"}{end}' 2>&1 | head -6
$K describe pod $NEWPOD 2>/dev/null | tail -20

echo "=== [6/6] restore July image explicitly ==="
$K set image deployment/lanai-portal lanai-portal=$JULY
$K rollout status deployment/lanai-portal --timeout=180s && echo "RESTORED: site back on July image"
$K get deploy lanai-portal -o jsonpath='{.spec.template.spec.containers[0].image}'; echo
