# Lanai Platform — Kubernetes Deployment Guide

**Author:** Manus AI  
**Date:** 2026-08-12  

---

## Architecture Overview

The Lanai platform deploys as a multi-tier Kubernetes application with the following components:

| Tier | Services | Manifest |
|------|----------|----------|
| **Gateway** | Ingress (nginx), HPA, PDB, NetworkPolicy | `config/k8s/gateway.yaml` |
| **Application** | lanai-portal, Keycloak, Permify | `config/k8s/app-tier.yaml` |
| **Platform** | APISIX, Temporal, Redis, Fluvio | `config/k8s/platform-tier.yaml` |
| **Data** | PostgreSQL, TigerBeetle | `config/k8s/data-tier.yaml` |
| **AI** | Ollama, lanai-ai-gateway | `config/k8s/ai-tier.yaml` |
| **Jobs** | DB migration, Permify bootstrap, Temporal namespace | `config/k8s/jobs.yaml` |
| **Testing** | Smoke test Job + CronJob | `config/k8s/smoke-test.yaml` |

---

## Prerequisites

Before deploying, ensure the following are available on the target cluster:

1. **cert-manager** — for automatic TLS certificate provisioning
2. **nginx-ingress-controller** — or equivalent ingress class
3. **Dapr control plane** — installed in `dapr-system` namespace
4. **StorageClass** — default storage class for PVCs (10Gi+ available)
5. **Secrets** — create the `lanai-secrets` Secret (see below)

---

## Step 1: Create Secrets

```bash
kubectl create secret generic lanai-secrets \
  --from-literal=POSTGRES_PASSWORD='<strong-password>' \
  --from-literal=KEYCLOAK_DB_PASSWORD='<strong-password>' \
  --from-literal=TEMPORAL_DB_PASSWORD='<strong-password>' \
  --from-literal=CHATWOOT_DB_PASSWORD='<strong-password>' \
  --from-literal=PERMIFY_DB_PASSWORD='<strong-password>' \
  --from-literal=KEYCLOAK_CLIENT_SECRET='<keycloak-client-secret>' \
  --from-literal=KEYCLOAK_ADMIN_CLIENT_SECRET='<keycloak-admin-secret>' \
  --from-literal=JWT_SECRET='<64-char-random-string>' \
  --from-literal=STRIPE_SECRET_KEY='sk_live_...' \
  --from-literal=STRIPE_WEBHOOK_SECRET='whsec_...' \
  --from-literal=RESEND_API_KEY='re_...' \
  --from-literal=TWENTY_CRM_API_TOKEN='<twenty-crm-token>' \
  --from-literal=DAPR_API_TOKEN='<dapr-token>' \
  --from-literal=AI_GATEWAY_TOKEN='<ai-gateway-token>' \
  --from-literal=LAKEHOUSE_INGEST_TOKEN='<lakehouse-token>' \
  --from-literal=APISIX_ADMIN_KEY='<apisix-admin-key>'
```

---

## Step 2: Create ConfigMap

```bash
kubectl create configmap lanai-env \
  --from-literal=LANAI_DOMAIN='lanai.com' \
  --from-literal=OLLAMA_MODEL='llama3.1:8b'
```

---

## Step 3: Deploy in Order

```bash
# 1. Data tier (PostgreSQL, PVCs)
kubectl apply -f config/k8s/data-tier.yaml

# 2. Wait for PostgreSQL to be ready
kubectl wait --for=condition=ready pod -l app=postgres --timeout=120s

# 3. Platform tier (Redis, Temporal, APISIX, Fluvio)
kubectl apply -f config/k8s/platform-tier.yaml

# 4. Application tier (Portal, Keycloak, Permify)
kubectl apply -f config/k8s/app-tier.yaml

# 5. AI tier (Ollama, AI Gateway)
kubectl apply -f config/k8s/ai-tier.yaml

# 6. Run initialization jobs (DB migration, Permify bootstrap)
kubectl apply -f config/k8s/jobs.yaml

# 7. Wait for jobs to complete
kubectl wait --for=condition=complete job/db-migrate --timeout=120s
kubectl wait --for=condition=complete job/permify-bootstrap --timeout=60s

# 8. Gateway (Ingress, HPA, PDB, NetworkPolicy)
kubectl apply -f config/k8s/gateway.yaml

# 9. Dapr components
kubectl apply -f config/k8s/dapr-components.yaml
```

---

## Step 4: Run Live Smoke Test

```bash
# Deploy the smoke test job
kubectl apply -f config/k8s/smoke-test.yaml

# Wait for completion
kubectl wait --for=condition=complete job/lanai-smoke-test --timeout=300s

# View results
kubectl logs job/lanai-smoke-test
```

Expected output:

```
╔══════════════════════════════════════════════════╗
║       LANAI PLATFORM LIVE SMOKE TEST            ║
╚══════════════════════════════════════════════════╝

━━━ 1. Core Services Health ━━━━━━━━━━━━━━━━━━━━━━
  Portal /api/health                      ✅ PASS (200)
  Keycloak /health/ready                  ✅ PASS (200)
  Permify /healthz                        ✅ PASS (200)
  AI Gateway /health                      ✅ PASS (200)

  RESULTS: X passed, 0 failed, Y skipped

  ✅ SMOKE TEST PASSED
```

---

## Step 5: Enable Continuous Monitoring (Optional)

The smoke test CronJob runs every 5 minutes but is suspended by default:

```bash
kubectl patch cronjob lanai-smoke-test-cron -p '{"spec":{"suspend":false}}'
```

---

## Automated Security Scans

The repository includes two GitHub Actions workflows:

| Workflow | Schedule | Checks |
|----------|----------|--------|
| `ci.yml` | Every push/PR | TypeScript, tests, build, Docker |
| `nightly-security.yml` | 02:00 UTC daily | Semgrep SAST, Trivy image scan, pnpm audit, Python safety |

Both workflows upload SARIF results to GitHub Security tab for centralized vulnerability tracking.

---

## Scaling & Production Hardening

The `gateway.yaml` includes:

- **HorizontalPodAutoscaler** — scales portal from 2 to 10 replicas based on CPU/memory
- **PodDisruptionBudget** — ensures at least 1 pod is always available during rolling updates
- **NetworkPolicy** — restricts portal ingress to only the nginx controller and same-namespace pods
- **TLS** — automatic certificate provisioning via cert-manager + Let's Encrypt

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Portal CrashLoopBackOff | DB migration not complete | Wait for `db-migrate` job |
| Keycloak 500 on login | Realm not imported | Check `realm-render` initContainer logs |
| Permify FORBIDDEN | Schema not bootstrapped | Re-run `permify-bootstrap` job |
| APISIX 503 | Upstream not registered | Check APISIX admin API routes |
| Smoke test FAIL on auth | Client secret mismatch | Update `lanai-secrets` with correct Keycloak secret |
