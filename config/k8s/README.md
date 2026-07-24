# Deploying lanai to the `lanai` namespace on kasi-cluster

This targets the same cluster as tourismpay (`kasi-cluster`, API server on a
private/VPN-only address) — its API isn't reachable from GitHub Actions or
any other cloud runner, only from a machine/session that already has the
`kasi-cluster` kubeconfig context (the same one used for the tourismpay
deployment). Run every command below from there, not from this sandbox.

Manifests live under `config/k8s/` (Kubernetes workloads) and `config/apisix/`
(cluster-ingress-facing CRDs: Certificate/ApisixTls/ApisixRoute), tied
together by `config/kustomization.yaml` and applied as one unit via
`kubectl apply -k config`. Style follows `k8s/tourismpay-kasi/` on this same
cluster: labels, `imagePullSecrets: talentgraph-auth-pull`,
`resources.requests`+`limits`, immutable
`registry.digitalocean.com/talentgraph-auth/<image>:kasi-<timestamp>` tags.

## Quickest path: run the script

Note for zsh users (the default shell here): don't paste commands with a
trailing `# comment` at an interactive prompt — interactive zsh doesn't
treat `#` as a comment character by default, so it gets passed as a literal
argument. Every command block below is comment-free for that reason; run
`deploy.sh` itself is fine either way since it executes as a script, not
interactively.

[deploy.sh](deploy.sh) does everything in steps 0–5 below in one shot. First,
copy the secrets template and fill in real values (see step 3 below):

```bash
cp config/k8s/secrets/.env.secrets.example config/k8s/secrets/.env.secrets
```

Then run it:

```bash
./config/k8s/deploy.sh
```

Check state any time after with:

```bash
./config/k8s/deploy.sh status
```

It also accepts `build`, `push`, or `apply` alone if you want to run those
steps separately, and reads `TAG`/`REGISTRY`/`NAMESPACE`/`PULL_SECRET_SOURCE_NS`
from the environment if you need to override any default. The step-by-step
commands below are what it runs — useful as a reference or if you'd rather
drive it manually.

## 0. Sanity check

Expect `kasi-cluster`:

```bash
kubectl config current-context
```

## 1. Build and push the image this scope needs

Current scope is `lanai-portal` + postgres + keycloak + permify +
`lanai-ai-gateway` (with a self-hosted `ollama` backing it) — `caddy` and
`lakehouse-ingest` aren't part of this deployment (see the scope table
below).

```bash
TAG="kasi-$(date +%Y%m%d-%H%M)"
REGISTRY="registry.digitalocean.com/talentgraph-auth"

docker build -t "$REGISTRY/lanai-portal:$TAG" ./lanai-portal
docker push "$REGISTRY/lanai-portal:$TAG"
docker build -t "$REGISTRY/lanai-ai-gateway:$TAG" ./lanai_ai/gateway
docker push "$REGISTRY/lanai-ai-gateway:$TAG"
```

Note the digests `docker push` prints for each — pin them into
`config/kustomization.yaml`'s `images:` block the same way
`tourismpay-web` is pinned in `k8s/tourismpay-kasi/web.yaml`
(`image:tag@sha256:digest`), or just use the tag; either works with the
`kustomize edit set image` step below.

## 2. Namespace + registry pull secret

```bash
kubectl apply -f config/apisix/namespace.yaml
```

If another namespace on this cluster already has a `talentgraph-auth-pull`
secret (adjust the source namespace name — `payment-switch-demo` was just an
example from the tourismpay handoff, not guaranteed to exist here). Skip
this if you're not sure such a namespace exists — use the fallback below
instead:

```bash
kubectl -n payment-switch-demo get secret talentgraph-auth-pull -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d > /tmp/lanai-dockerconfig.json
kubectl -n lanai create secret generic talentgraph-auth-pull --type=kubernetes.io/dockerconfigjson --from-file=.dockerconfigjson=/tmp/lanai-dockerconfig.json --dry-run=client -o yaml | kubectl apply -f -
rm /tmp/lanai-dockerconfig.json
```

Fallback — if `docker push` already works from this machine, it already has
valid `registry.digitalocean.com` credentials in `~/.docker/config.json`;
reuse those directly instead of hunting for a source namespace:

```bash
kubectl -n lanai create secret generic talentgraph-auth-pull --type=kubernetes.io/dockerconfigjson --from-file=.dockerconfigjson=$HOME/.docker/config.json --dry-run=client -o yaml | kubectl apply -f -
```

`deploy.sh` already tries both of these automatically, in that order.

## 3. Fill in real secret values

```bash
cp config/k8s/secrets/.env.secrets.example config/k8s/secrets/.env.secrets
```

Edit `config/k8s/secrets/.env.secrets` (gitignored, never commit it) and
fill in every blank key. Generate strong random values for the
`*_PASSWORD` keys with `openssl rand -base64 32 | tr -d '\n'`, and for the
`*_SECRET` / `*_TOKEN` keys with `openssl rand -hex 32`.

## 4. Point manifests at the images you just pushed, then apply

The kustomization root is `config/` (not `config/k8s/`) — kustomize refuses
to load resources from outside its root, and this set spans
`config/k8s/`, `config/apisix/`, `config/postgres/`, `config/keycloak/`, etc.

```bash
cd config
kustomize edit set image lanai-portal="$REGISTRY/lanai-portal:$TAG"
cd ..

kubectl apply -k config
```

(`kubectl` v1.21+ has kustomize built in — no separate `kustomize` binary
needed if `kustomize edit` isn't available; in that case hand-edit the
`images:` block in `config/kustomization.yaml` instead. Validate with
`kubectl kustomize config` before applying if you want to eyeball the
rendered output first.)

## 5. Wait for one-shot setup jobs, then the app

```bash
kubectl -n lanai wait --for=condition=complete --timeout=600s \
  job/db-migrate job/permify-bootstrap job/temporal-namespace-register

kubectl -n lanai rollout status deployment/lanai-portal --timeout=300s
```

First rollout: `lanai-portal` may CrashLoopBackOff a few times until
`db-migrate`/`permify-bootstrap` finish — expected, it self-heals once its
dependencies are ready.

## 6. Verify publicly

Find the cluster's APISIX gateway address (same one tourismpay uses, likely
`appsec-apisix-prod`, but confirm):

```bash
kubectl -n appsec-apisix-prod get svc -o wide
```

Then, once DNS for `lanai.upi.dev` (and its subdomains) points at that
address:

```bash
kubectl -n lanai get pods,svc,job,certificate,apisixroute,apisixtls -o wide
curl -I https://lanai.upi.dev/
curl https://lanai.upi.dev/api/health
curl https://auth.lanai.upi.dev/realms/lanai
```

Or against the gateway IP directly before DNS is cut over, with
`--resolve lanai.upi.dev:443:<gateway-ip>` (same trick used for
tourismpay.servers.upi.dev).

## What's actually in the namespace

**Current scope: `lanai-portal` + postgres + keycloak + permify +
lanai-ai-gateway (self-hosted `ollama` backing it)** (matching what got
verified working end-to-end in local dev — see the local-dev session for
how each dependency was discovered). Not a 1:1 port of docker-compose, and
not the full lakehouse stack either — temporal-worker, minio, nessie,
trino, lakehouse-ingest are still out of scope; see git history to bring
any of it back.

This cluster already runs shared, cluster-wide instances of several
services compose self-hosts, so lanai connects to those instead of running
its own copy:

| compose service | in `lanai` namespace? | what's used instead |
|---|---|---|
| postgres, keycloak | yes, self-hosted | — |
| redis | no | `redis-master.redis.svc.cluster.local:6379` |
| temporal | no | `temporal-frontend.temporal.svc.cluster.local:7233`, namespace `lanai` (registered by `jobs.yaml`) — lanai-portal needs `TEMPORAL_ADDRESS` present to boot even without temporal-worker deployed |
| permify | no | `permify.permify.svc.cluster.local:3478`, tenant `lanai` — **a hard runtime dependency**, not optional: every authenticated request calls `Permify.writeTuple`, confirmed in local dev |
| tigerbeetle | no | shared 3-node cluster in namespace `tigerbeetle` — **cluster ID/ledger/code unverified, see Known gaps** |
| dapr (placement etc.) | no | shared control plane in `dapr-system`, via sidecar-injector annotations |
| apisix + openappsec (WAF) | no | shared `appsec-apisix-prod` ingress already has openappsec attached |
| caddy | no | superseded by the cluster ingress + cert-manager entirely |
| ollama, lanai-ai-gateway | yes, self-hosted (`ai-tier.yaml`) | — CPU inference via Ollama, model pulled by the `ollama-model-init` Job |
| minio, nessie, trino, lakehouse-ingest | no | out of current scope — not deployed, not wired to a shared instance either |

Layout:
- `env-configmap.yaml` — non-secret shared values (domain, Ollama model)
- `data-tier.yaml` — postgres only
- `jobs.yaml` — one-shot setup (db-migrate, permify-bootstrap,
  temporal-namespace-register)
- `platform-tier.yaml` — keycloak only
- `ai-tier.yaml` — ollama (PVC-backed) + ollama-model-init Job (pulls
  `OLLAMA_MODEL`) + lanai-ai-gateway, the FastAPI service lanai-portal calls
  for morning briefings, proposals, client intelligence, WhatsApp drafting
- `app-tier.yaml` — lanai-portal, pointed at the shared services above.
  Gets its Dapr sidecar from the cluster's real sidecar-injector
  (`dapr.io/enabled` annotations) rather than a hand-rolled `daprd`
  container — an earlier version of this file had a leftover manual daprd
  container pointed at a self-hosted `dapr-placement` service that no
  longer exists; removed
- `dapr-components.yaml` — statestore/pubsub Components pointed at the
  shared Redis, using Kubernetes `secretKeyRef` (k8s-mode Dapr) instead of
  compose's `{env:REDIS_PASSWORD}` (self-hosted-mode Dapr)

`lanai-portal`'s own `server/_core/env.ts` refuses to boot in production
without `TEMPORAL_ADDRESS`, `TIGERBEETLE_ADDRESS`, `FLUVIO_ENDPOINT`,
`DAPR_API_TOKEN`, `APISIX_ADMIN_URL`/`KEY`, and `LAKEHOUSE_INGEST_URL`/
`TOKEN` all present (non-empty) — even though several of those services
aren't deployed or reachable in this scope. That's fine: those env vars
just need to exist, not actually resolve to something live, since they're
only called if a feature that uses them is invoked. Don't remove them from
`app-tier.yaml` even though it looks redundant.

Every generated ConfigMap/Secret has a stable, unhashed name
(`generatorOptions.disableNameSuffixHash: true` in `kustomization.yaml`),
matching how they're referenced elsewhere (including inside the Dapr
Component CRD, which kustomize's automatic name-reference rewriting can't
reach). Trade-off: editing a mounted config/secret file doesn't
auto-restart the pods using it — after editing one, run
`kubectl -n lanai rollout restart deployment/<name>`.

## Known gaps — confirm these before relying on this for real traffic/money

- **TigerBeetle cluster ID, node addresses, and ledger/transfer-code
  numbers are unverified.** `app-tier.yaml` uses
  `tigerbeetle-0/1/2.tigerbeetle-headless.tigerbeetle.svc.cluster.local:3000`
  and cluster ID `233240165285264747596733200182526600436`, both copied
  from a value you pasted that looked like it came from a different app's
  config, not lanai's own. Confirm with
  `kubectl get configmap tigerbeetle-config -n tigerbeetle -o yaml`. More
  importantly: TigerBeetle only has one `cluster_id` for the whole shared
  deployment — tenants are separated by ledger (`1`) and transfer-code (`1`)
  numbers instead, and I have no way to know if those are already used by
  another app on this cluster. Find out before this touches real money.
- **The shared Redis password location is unknown.** `REDIS_PASSWORD` in
  `secrets/.env.secrets` needs to be the real shared-cluster value — find
  it with `kubectl get secret -n redis` (Bitnami's chart typically names it
  `redis` or `<release>-redis`, key `redis-password`).
- **Permify tenant `lanai` may need explicit creation** before
  `permify-bootstrap` can write the schema — Permify's multi-tenancy isn't
  always auto-create-on-write depending on version/config. If that Job
  fails, check whether the tenant needs a manual
  `permify tenant create lanai` first.
- **Dapr sidecar auth enforcement is unconfirmed.** `DAPR_API_TOKEN` is set
  (a self-generated value, since `env.ts` requires it present to boot) but
  whether the shared `dapr-system` control plane actually *enforces* it for
  app<->sidecar calls is unverified — if it does and expects a specific
  value, `lanai-portal` will fail to reach its Dapr sidecar. Check
  `kubectl -n dapr-system get configuration` and the sidecar's logs
  (`kubectl -n lanai logs deploy/lanai-portal -c daprd`) after first
  deploy.
- **Permify tenant `lanai` on the shared cluster instance may not be the
  same one bootstrapped in local dev.** `jobs.yaml`'s `permify-bootstrap`
  writes the schema to the shared cluster Permify — if that tenant already
  exists with a different schema (from another app, or a stale prior
  attempt), the write may conflict. Check
  `permify-bootstrap`'s pod logs after first deploy.
- **`APISIX_ADMIN_KEY` now needs to be the shared cluster's real APISIX
  admin key** (for `appsec-apisix-prod`), not a self-generated one — ask
  whoever administers it.
- The per-route rate-limiting/request-id plugins that used to live in
  `config/apisix/routes/lanai-routes.yaml` (30/15min on oauth, 100/min on
  the Stripe webhook, etc.) aren't ported to `apisixroute.yaml` — only a
  basic `request-id` plugin is applied. Add them back as ApisixRoute-level
  `plugins:` if you need them.
- PVC sizes and CPU/memory requests/limits are conservative starting points,
  not tuned for real load.
