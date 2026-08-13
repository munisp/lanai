# Isolated Staging Load-Test Workaround

**Author:** Manus AI  
**Purpose:** Launch the guarded 24-hour ledger-mirror soak test without granting broad production-cluster access to an external operator.

## Recommendation

Use a **dedicated load-test namespace and database** with a single-purpose Job, rather than sharing an administrator kubeconfig or a production database credential. The supplied package uses a service account with API-token mounting disabled, a restrictive pod security profile, resource quotas, default-deny networking, and a seven-day post-completion retention window for logs. Kubernetes Jobs are the appropriate primitive for finite batch work, and NetworkPolicy plus restricted pod security controls provide the containment boundary described here.[1] [2] [3]

> **Scope boundary:** The supplied Job validates the PostgreSQL financial mirror, idempotency keys, connection pool behavior, and evidence capture. It does **not** itself invoke TigerBeetle, Temporal, or Fluvio. A subsequent approved financial-workflow runner is required for complete external-ledger compliance evidence.

| Component | File | Purpose |
|---|---|---|
| Dedicated runner image | `lanai-portal/Dockerfile.loadtest` | Contains only the Python soak runner and `asyncpg`. |
| Kubernetes isolation package | `config/k8s/loadtest/isolated-ledger-soak.yaml` | Namespace, quota, security controls, storage, and the 24-hour Job. |
| Launch guard | `lanai-portal/scripts/preflight-ledger-soak.sh` | Refuses an unapproved context, placeholder image, missing secret, placeholder run ID, or duplicate active run. |
| Evidence exporter | `lanai-portal/scripts/export-ledger-soak-evidence.sh` | Retrieves the Job evidence, metadata, logs, and SHA-256 manifest. |
| Soak runner | `lanai-portal/server/test/production-soak-test-24h.py` | Writes 500 TPS to a dedicated database only after explicit acknowledgement. |

## Operator procedure

First, build the runner image from the dedicated Dockerfile in the approved CI/CD system, scan it, and publish it under an immutable signed digest. Replace `REPLACE_WITH_SIGNED_DIGEST` in the manifest only with that approved digest. Do not use a mutable tag for compliance validation.

The platform team should create an isolated PostgreSQL target and label its namespace as eligible for this load test:

```bash
kubectl label namespace <dedicated-postgres-namespace> lanai.io/loadtest-db=true
kubectl apply -f config/k8s/loadtest/isolated-ledger-soak.yaml
```

The database credential must be test-only and limited to the dedicated database. Create it outside source control, then assign an approved unique run identifier:

```bash
kubectl -n lanai-loadtest create secret generic lanai-loadtest-db \
  --from-literal=DATABASE_URL="$STAGING_LOADTEST_DATABASE_URL"

kubectl -n lanai-loadtest patch configmap ledger-soak-settings \
  --type merge \
  -p '{"data":{"RUN_ID":"CHG-12345-2026-08-13T0000Z"}}'
```

Before launch, the operator must explicitly bind the guard to the intended kubeconfig context. This prevents a context switch from silently redirecting writes to a different cluster:

```bash
export ALLOW_LOADTEST_CONTEXT="your-approved-loadtest-context"
export NAMESPACE="lanai-loadtest"
./lanai-portal/scripts/preflight-ledger-soak.sh
kubectl apply -f config/k8s/loadtest/isolated-ledger-soak.yaml
```

Kubernetes will create a Job with a generated name. Monitor it without exposing database credentials:

```bash
kubectl -n lanai-loadtest get jobs -w
kubectl -n lanai-loadtest get pods -l app.kubernetes.io/name=ledger-soak-runner
kubectl -n lanai-loadtest logs -f job/<generated-job-name>
```

After successful completion, export an evidence bundle and upload it to the organisation’s retention-controlled compliance store. The export script writes both per-file and archive SHA-256 checksums so the stored evidence can be verified later.

```bash
OUTPUT_DIR=./soak-evidence \
  ./lanai-portal/scripts/export-ledger-soak-evidence.sh <generated-job-name>
```

## Acceptance criteria

The run is acceptable only if the generated summary reports zero errors, zero deadlocks, exactly one row per business key, exactly one unique TigerBeetle mirror ID per business key, and no unexpected memory or p95/p99 latency trend. A failed Job, incomplete evidence bundle, mutable image reference, unapproved context, or missing checksum invalidates the run.

The isolated namespace is intentionally reusable for reviewed future tests. Delete the Job and PVC only after the compliance bundle has been retained under the applicable policy.

## References

[1] [Kubernetes Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)  
[2] [Kubernetes Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)  
[3] [Kubernetes Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
