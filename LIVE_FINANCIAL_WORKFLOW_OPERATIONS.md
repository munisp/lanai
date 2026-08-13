# Live Financial Workflow Staging Operations

**Author:** Manus AI  
**Scope:** Controlled staging validation of the live **Temporal → TigerBeetle → PostgreSQL → outbox → Fluvio** financial path, plus daily compliance-evidence collection.

## Review outcome

The original ledger-mirror soak package was appropriate for PostgreSQL load and idempotency validation, but it could not prove that a real Temporal worker executed a financial Saga or that TigerBeetle and Fluvio accepted its resulting operations. The package is now split into two controlled workloads.

| Workload | Purpose | Trigger |
|---|---|---|
| Ledger-mirror soak Job | Sustained 24-hour PostgreSQL mirror and connection-pool validation. | Manual, with a 24-hour approval. |
| Live financial-workflow Job | Runs a bounded set of real `bookingCommissionSaga` workflows and verifies each Temporal completion, TigerBeetle pending/settlement pair, PostgreSQL ledger mirror, and published financial outbox event. | Manual, per approved test window. |
| Daily financial-audit CronJob | Reconciles the last 24 hours of staging financial mirrors, workflow records, outbox delivery, audit logs, and TigerBeetle transfer presence. | Daily at 02:17 cluster time. |

The namespace still uses restricted pod security, default-deny egress, a tokenless service account, CPU/memory/PVC quotas, fixed resource limits, and immutable image-digest enforcement in the preflight guard. Kubernetes Jobs and CronJobs are designed for bounded and scheduled batch work; NetworkPolicy provides the workload isolation boundary.[1] [2] [3]

## New artifacts

| File | Operational role |
|---|---|
| `Dockerfile.financial-loadtest` | Node runner image that contains the Temporal client, TigerBeetle client, Fluvio/Dapr outbox client, and the live runner scripts. |
| `server/test/live-financial-workflow-runner.ts` | Starts real `bookingCommissionSaga` workflows; writes workflow lifecycle records; confirms local mirrors; looks up the real TigerBeetle pending and settlement transfers; and requires successful outbox delivery. |
| `config/k8s/loadtest/live-financial-workflow-runner.yaml` | Isolated Job with Dapr sidecar, test-only secrets, scoped platform-service egress, bounded concurrency, and evidence volume. |
| `server/test/collect-staging-financial-audit.ts` | Daily collector that validates ledger transfer state, settlement IDs, TigerBeetle lookup, Fluvio delivery records, workflow failures, and audit-log counts. |
| `config/k8s/loadtest/daily-financial-audit.yaml` | `CronJob` that runs the collector daily and writes a JSON summary plus SHA-256 sidecar to retained evidence storage. |

## Build and release prerequisites

The platform team must build both images from the repository root, scan them, sign them, and use immutable digests in the manifests. The repository deliberately contains `REPLACE_WITH_SIGNED_DIGEST` placeholders because a source repository cannot safely invent a registry digest.

```bash
# Examples only: use the organization’s approved registry, scanner, and signer.
docker build -f Dockerfile.financial-loadtest -t registry.example/lanai-financial-loadtest:CHG-123 .
docker push registry.example/lanai-financial-loadtest:CHG-123
# Scan and sign here, then obtain registry.example/lanai-financial-loadtest@sha256:...
```

Create the test-only services secret outside source control. It must contain a database URL for the isolated load-test database, and only the staging endpoints/tokens required by the runner.

```bash
kubectl -n lanai-loadtest create secret generic lanai-loadtest-financial-services \
  --from-literal=DATABASE_URL="$STAGING_LOADTEST_DATABASE_URL" \
  --from-literal=TEMPORAL_ADDRESS="$STAGING_TEMPORAL_ADDRESS" \
  --from-literal=TIGERBEETLE_ADDRESS="$STAGING_TIGERBEETLE_ADDRESS" \
  --from-literal=FLUVIO_ENDPOINT="$STAGING_FLUVIO_ENDPOINT" \
  --from-literal=DAPR_API_TOKEN="$STAGING_DAPR_API_TOKEN" \
  --from-literal=LAKEHOUSE_INGEST_URL="$STAGING_LAKEHOUSE_INGEST_URL" \
  --from-literal=LAKEHOUSE_INGEST_TOKEN="$STAGING_LAKEHOUSE_INGEST_TOKEN" \
  --from-literal=TIGERBEETLE_CLUSTER_ID="0" \
  --from-literal=TIGERBEETLE_LEDGER="1" \
  --from-literal=TIGERBEETLE_TRANSFER_CODE="1"
```

## Manual live workflow run

Patch both the image digest and a unique change-controlled run ID. The runner refuses to start unless `LANAI_LOADTEST_APPROVED=true`, the database DSN clearly indicates staging/loadtest, and all required service endpoints are present.

```bash
kubectl -n lanai-loadtest patch configmap financial-workflow-settings \
  --type merge \
  -p '{"data":{"RUN_ID":"CHG-12345-2026-08-13T0000Z"}}'

# Replace the image placeholder only with an approved signed digest.
kubectl apply -f config/k8s/loadtest/live-financial-workflow-runner.yaml
kubectl -n lanai-loadtest get jobs -w
kubectl -n lanai-loadtest logs -f job/<generated-job-name>
```

A successful run produces a summary containing the number of completed workflows, matched TigerBeetle transfer pairs, PostgreSQL ledger mirrors, and published financial outbox events. Any missing mirror, mismatched debit/credit account, missing settlement ID, failed workflow, or failed outbox delivery makes the Job fail.

## Daily evidence collection

After replacing the image digest in `daily-financial-audit.yaml`, apply the CronJob. It is intentionally non-concurrent: an overlapping daily collection indicates a degraded staging environment and should be investigated rather than hidden.

```bash
kubectl apply -f config/k8s/loadtest/daily-financial-audit.yaml
kubectl -n lanai-loadtest get cronjob lanai-daily-financial-audit
kubectl -n lanai-loadtest create job --from=cronjob/lanai-daily-financial-audit \
  lanai-financial-audit-manual-$(date +%Y%m%d)
```

Each collection writes `staging-financial-audit-*.json` and a matching `.sha256` sidecar. The compliance team should export the evidence PVC, verify the SHA-256 manifest, and store the archive in the organization’s approved retention-controlled evidence system.

## Acceptance criteria

| Control | Required result |
|---|---|
| Temporal | All test workflow lifecycle records complete without failures. |
| TigerBeetle | Each posted local mirror has a real pending transfer and a distinct settlement transfer with matching debit/credit accounts. |
| PostgreSQL | One ledger mirror per workflow, a `posted` status, and non-null settlement ID. |
| Fluvio/outbox | Each run-owned financial outbox event is `published`; no failed Fluvio delivery remains. |
| Compliance evidence | Daily JSON and SHA-256 sidecar are retained and match after export. |

## References

[1] [Kubernetes Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)  
[2] [Kubernetes CronJobs](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)  
[3] [Kubernetes Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
