#!/bin/bash
# lanai deploy script — kasi-cluster, namespace "lanai".
# Mirrors the tourismpay-kasi handoff sequence (docs/TOURISMPAY_KASI_DEPLOYMENT_HANDOFF.md):
# build -> push -> namespace/pull-secret -> secrets -> kustomize apply -> wait -> rollout.
#
# Run this from a machine/session that already has the kasi-cluster
# kubeconfig context — its API server is private/VPN-only and unreachable
# from anywhere else (that's also why this isn't a CI/CD pipeline).
#
# Usage:
#   ./config/k8s/deploy.sh              # full deploy: build, push, apply, wait, rollout
#   ./config/k8s/deploy.sh build        # just build the image (lanai-portal only, current scope)
#   ./config/k8s/deploy.sh push         # just push (assumes already built)
#   ./config/k8s/deploy.sh apply        # just apply manifests (assumes images already pushed + tag set)
#   ./config/k8s/deploy.sh upgrade      # routine code-only push: build, push, roll the image onto
#                                       # the existing Deployment. Skips kustomize apply (no
#                                       # ConfigMap/Secret/manifest changes picked up) and skips
#                                       # the setup-job wait. Use this for app-code-only changes.
#   ./config/k8s/deploy.sh status       # show current state
#
# Env vars:
#   TAG                    image tag (default: kasi-<timestamp>)
#   REGISTRY                (default: registry.digitalocean.com/talentgraph-auth)
#   NAMESPACE               (default: lanai)
#   PULL_SECRET_SOURCE_NS   namespace to copy talentgraph-auth-pull from (default: payment-switch-demo)

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$CONFIG_DIR")"

TAG="${TAG:-kasi-$(date +%Y%m%d-%H%M)}"
REGISTRY="${REGISTRY:-registry.digitalocean.com/talentgraph-auth}"
NAMESPACE="${NAMESPACE:-lanai}"
PULL_SECRET_SOURCE_NS="${PULL_SECRET_SOURCE_NS:-payment-switch-demo}"
SECRETS_FILE="$SCRIPT_DIR/secrets/.env.secrets"

check_prerequisites() {
  log_info "Checking prerequisites..."
  local missing=()
  command -v docker >/dev/null || missing+=("docker")
  command -v kubectl >/dev/null || missing+=("kubectl")
  if [ ${#missing[@]} -ne 0 ]; then
    log_error "Missing required tools: ${missing[*]}"
    exit 1
  fi

  local ctx
  ctx="$(kubectl config current-context 2>/dev/null || echo '<none>')"
  if [ "$ctx" != "kasi-cluster" ]; then
    log_warning "Current kubectl context is '$ctx', not 'kasi-cluster'. Continuing anyway — set it explicitly with 'kubectl config use-context kasi-cluster' if that's wrong."
  fi

  if [ ! -f "$SECRETS_FILE" ]; then
    log_error "$SECRETS_FILE does not exist."
    log_error "Copy secrets/.env.secrets.example to secrets/.env.secrets and fill in real values first."
    exit 1
  fi
  if grep -qE '^[A-Z_]+=\s*$' "$SECRETS_FILE"; then
    log_warning "$SECRETS_FILE has blank values for: $(grep -E '^[A-Z_]+=\s*$' "$SECRETS_FILE" | cut -d= -f1 | tr '\n' ' ')"
    log_warning "Optional integrations (Twenty CRM/Chatwoot/Stripe) can stay blank; everything else should be filled in."
  fi

  log_success "Prerequisites OK (tag=$TAG, registry=$REGISTRY, namespace=$NAMESPACE)"
}

build_images() {
  log_info "Building images (current scope: lanai-portal + lanai-ai-gateway — caddy/lakehouse-ingest still out of scope, see config/k8s/README.md)..."
  docker build -t "$REGISTRY/lanai-portal:$TAG" "$REPO_ROOT/lanai-portal"
  docker build -t "$REGISTRY/lanai-ai-gateway:$TAG" "$REPO_ROOT/lanai_ai/gateway"
  log_success "Images built with tag $TAG"
}

push_images() {
  log_info "Pushing images to $REGISTRY..."
  docker push "$REGISTRY/lanai-portal:$TAG"
  docker push "$REGISTRY/lanai-ai-gateway:$TAG"
  log_success "Images pushed"
}

ensure_namespace_and_pull_secret() {
  log_info "Ensuring namespace and registry pull secret..."
  kubectl apply -f "$CONFIG_DIR/apisix/namespace.yaml"

  if kubectl -n "$NAMESPACE" get secret talentgraph-auth-pull >/dev/null 2>&1; then
    log_info "talentgraph-auth-pull already exists in $NAMESPACE, leaving it as-is."
    return
  fi

  if kubectl get namespace "$PULL_SECRET_SOURCE_NS" >/dev/null 2>&1 \
     && kubectl -n "$PULL_SECRET_SOURCE_NS" get secret talentgraph-auth-pull >/dev/null 2>&1; then
    log_info "Copying talentgraph-auth-pull from namespace $PULL_SECRET_SOURCE_NS..."
    local tmpfile
    tmpfile="$(mktemp)"
    kubectl -n "$PULL_SECRET_SOURCE_NS" get secret talentgraph-auth-pull \
      -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d > "$tmpfile"
    kubectl -n "$NAMESPACE" create secret generic talentgraph-auth-pull \
      --type=kubernetes.io/dockerconfigjson \
      --from-file=.dockerconfigjson="$tmpfile" \
      --dry-run=client -o yaml | kubectl apply -f -
    rm -f "$tmpfile"
  elif [ -f "$HOME/.docker/config.json" ] && grep -q "registry.digitalocean.com" "$HOME/.docker/config.json"; then
    log_info "No source namespace with talentgraph-auth-pull found; using local ~/.docker/config.json instead (docker push already proved it has valid registry.digitalocean.com credentials)."
    kubectl -n "$NAMESPACE" create secret generic talentgraph-auth-pull \
      --type=kubernetes.io/dockerconfigjson \
      --from-file=.dockerconfigjson="$HOME/.docker/config.json" \
      --dry-run=client -o yaml | kubectl apply -f -
  else
    log_error "Could not find talentgraph-auth-pull in namespace '$PULL_SECRET_SOURCE_NS' and no local registry.digitalocean.com docker login found."
    log_error "Either: set PULL_SECRET_SOURCE_NS to a namespace that has this secret, or run 'doctl registry login' / 'docker login registry.digitalocean.com' first, or create the secret manually:"
    log_error "  kubectl -n $NAMESPACE create secret docker-registry talentgraph-auth-pull --docker-server=registry.digitalocean.com --docker-username=<DO_TOKEN> --docker-password=<DO_TOKEN>"
    exit 1
  fi
  log_success "Namespace + pull secret ready"
}

apply_manifests() {
  log_info "Setting image tags and applying manifests..."
  if command -v kustomize >/dev/null; then
    (cd "$CONFIG_DIR" && kustomize edit set image \
      "lanai-portal=$REGISTRY/lanai-portal:$TAG" \
      "lanai-ai-gateway=$REGISTRY/lanai-ai-gateway:$TAG")
  else
    log_warning "standalone kustomize not found; falling back to a plain text substitution on config/kustomization.yaml"
    # Rewrites each images[].newTag line by matching on the preceding
    # newName (not a fixed placeholder string like "latest") — the images
    # list always carries real timestamped tags from the last deploy, never
    # a literal "latest", so a fixed-string substitution here silently
    # matches nothing and leaves the manifest pointing at a stale image on
    # every subsequent apply even though a fresh one was just built/pushed.
    python3 - "$CONFIG_DIR/kustomization.yaml" "$TAG" <<'PYEOF'
import sys, re
path, tag = sys.argv[1], sys.argv[2]
text = open(path).read()
text = re.sub(
    r'(newName: registry\.digitalocean\.com/talentgraph-auth/[\w-]+\n\s*newTag: ).*',
    lambda m: m.group(1) + tag,
    text,
)
open(path, 'w').write(text)
PYEOF
  fi

  kubectl apply -k "$CONFIG_DIR"
  log_success "Manifests applied"
}

wait_for_jobs() {
  log_info "Waiting for one-shot setup jobs..."
  # db-migrate is intentionally excluded — it's a one-time schema-migration
  # Job with an immutable pod template; routine app-image upgrades don't
  # touch the schema, and waiting on it here has previously stalled a
  # deploy for no reason. Re-run it explicitly (kubectl delete job/db-migrate
  # -n lanai && kubectl apply -k config) when there's an actual migration to run.
  kubectl -n "$NAMESPACE" wait --for=condition=complete --timeout=600s \
    job/permify-bootstrap job/temporal-namespace-register
  # Separate, longer timeout: first run pulls a ~2GB model over whatever
  # the cluster's egress bandwidth is, which can run past the 600s used for
  # the other (near-instant) setup jobs above. Re-runs are fast no-ops.
  kubectl -n "$NAMESPACE" wait --for=condition=complete --timeout=1200s \
    job/ollama-model-init
  log_success "Setup jobs completed"
}

rollout_status() {
  log_info "Waiting for app rollout..."
  kubectl -n "$NAMESPACE" rollout status deployment/lanai-portal --timeout=300s
  if kubectl -n "$NAMESPACE" get deployment/lanai-ai-gateway >/dev/null 2>&1; then
    kubectl -n "$NAMESPACE" rollout status deployment/lanai-ai-gateway --timeout=300s
  fi
  log_success "Rollout complete"
}

upgrade() {
  # Routine code-only push: build, push, point the existing Deployment at
  # the new tag, roll out. No kustomize apply (so ConfigMap/Secret/manifest
  # edits in git are NOT picked up — use 'apply' or 'deploy' for those), no
  # setup-job wait (nothing schema/bootstrap related runs here).
  check_prerequisites
  build_images
  push_images
  log_info "Setting lanai-portal image to $REGISTRY/lanai-portal:$TAG..."
  kubectl -n "$NAMESPACE" set image deployment/lanai-portal \
    lanai-portal="$REGISTRY/lanai-portal:$TAG"
  rollout_status
  log_success "lanai-portal upgraded to tag $TAG"
}

status() {
  echo ""
  echo "=== Pods ==="
  kubectl -n "$NAMESPACE" get pods -o wide
  echo ""
  echo "=== Services ==="
  kubectl -n "$NAMESPACE" get svc
  echo ""
  echo "=== Jobs ==="
  kubectl -n "$NAMESPACE" get jobs
  echo ""
  echo "=== Certificate / ApisixRoute / ApisixTls ==="
  kubectl -n "$NAMESPACE" get certificate,apisixroute,apisixtls
}

full_deploy() {
  check_prerequisites
  build_images
  push_images
  ensure_namespace_and_pull_secret
  apply_manifests
  wait_for_jobs
  rollout_status
  status
  echo ""
  log_success "lanai deployed to namespace $NAMESPACE with tag $TAG"
  echo "Next: point DNS for lanai.upi.dev (and subdomains) at the cluster's APISIX gateway,"
  echo "then verify per config/k8s/README.md step 6."
}

case "${1:-deploy}" in
  deploy)  full_deploy ;;
  build)   check_prerequisites; build_images ;;
  push)    push_images ;;
  apply)   check_prerequisites; ensure_namespace_and_pull_secret; apply_manifests; wait_for_jobs; rollout_status ;;
  upgrade) upgrade ;;
  status)  status ;;
  *)
    echo "Usage: $0 [deploy|build|push|apply|upgrade|status]"
    exit 1
    ;;
esac
