# Financial Runner, Network Isolation, and Provider Resilience Audit

**Review date:** 2026-08-17 EDT
**Scope:** `config/k8s/loadtest/live-financial-workflow-runner.yaml`, its isolated-loadtest prerequisite, the hardened staging release gate, and `server/test/localProviderMocks.test.ts`.
**Disposition:** **Template controls pass local review and static scans. Live financial evidence remains a staging-only gate.**

## Executive Summary

The financial workflow runner is a dedicated, short-lived Kubernetes Job intended to prove the Temporal → TigerBeetle → PostgreSQL → outbox → Fluvio/Dapr/Lakehouse path in a separate load-test namespace. Its template uses a signed-digest placeholder that the release gate replaces only after validating explicit approval, target context, separate namespace labels, RBAC, secrets, run ID, and the immutable image format.

The isolated ledger template establishes a namespace-scoped default-deny policy. The runner adds only DNS, dedicated PostgreSQL, and labelled platform-service egress. The Job cannot use a Kubernetes API token, runs non-root, has a read-only filesystem, drops all capabilities, applies a `RuntimeDefault` seccomp profile, and writes evidence only to a retained PVC.

A review discovered that the prior release runner required the platform staging environment label for the financial load-test namespace, even though the isolated namespace declares itself as `loadtest`. The runner now requires a separately supplied `LANAI_FINANCIAL_ENVIRONMENT`, rejects co-location with the platform staging namespace, and the isolated namespace now explicitly carries `environment: loadtest`. The runbook and hermetic validation were updated accordingly.

## Financial Runner Template Audit

| Template resource | Purpose | Security / correctness finding |
|---|---|---|
| `financial-workflow-settings` ConfigMap | Supplies run ID, workload count, concurrency, amount, currency, Temporal namespace/task queue, and Dapr localhost settings. | Contains no credentials. The release gate replaces the run-ID placeholder only after safe-format validation. |
| `allow-financial-workflow-services` NetworkPolicy | Allows egress to namespaces labelled `lanai.io/platform-services=true` on TCP 3000, 7233, 9003, 8200, and 6379. | Restricts TigerBeetle, Temporal, Fluvio, Lakehouse, and Dapr Redis state/pubsub reachability to an explicitly labelled namespace and fixed ports. |
| Financial workflow Job | Runs one generated evidence Job with bounded concurrency and 10,800-second deadline. | No retries (`backoffLimit: 0`), immutable digest supplied by release gate, service-account token disabled, evidence retained seven days. |
| `allow-financial-workflow-dns` NetworkPolicy | Allows UDP/TCP 53 only to the `kube-system` namespace. | Supports DNS resolution without allowing general internet egress. |
| `allow-financial-workflow-postgres` NetworkPolicy | Allows TCP 5432 only to namespaces labelled `lanai.io/loadtest-db=true`. | Restricts PostgreSQL connectivity to a deliberately designated database namespace. |
| `default-deny` prerequisite | Selects all `lanai-loadtest` pods for ingress and egress default denial. | Required before the runner template; the three runner policies form the only allowed egress union. |

## Egress Isolation Detail

NetworkPolicy egress rules are additive: because the runner pod matches the default-deny policy and all three allow policies, its permitted egress is the union below.

| Destination selector | Ports | Intended dependency |
|---|---|---|
| `kubernetes.io/metadata.name=kube-system` | UDP/TCP 53 | DNS |
| `lanai.io/loadtest-db=true` | TCP 5432 | Dedicated PostgreSQL mirror/reconciliation database |
| `lanai.io/platform-services=true` | TCP 3000 | TigerBeetle |
| `lanai.io/platform-services=true` | TCP 7233 | Temporal gRPC |
| `lanai.io/platform-services=true` | TCP 9003 | Fluvio |
| `lanai.io/platform-services=true` | TCP 8200 | Lakehouse ingest |
| `lanai.io/platform-services=true` | TCP 6379 | Dapr state/pubsub backing component |

Dapr itself is injected into the same pod and is addressed at `127.0.0.1:3500`; this loopback path does not require cross-pod egress. The policy intentionally does not allow arbitrary HTTPS, internet, Kubernetes API, or unrestricted namespace access.

The destination controls are namespace- and port-scoped rather than destination-pod-scoped. Before live execution, the platform operator must confirm that only approved service workloads inhabit namespaces with `lanai.io/platform-services=true` or `lanai.io/loadtest-db=true`. Adding destination `podSelector` constraints is a recommended future defense-in-depth improvement once the authoritative labels for TigerBeetle, Temporal, Fluvio, Lakehouse, Redis, and PostgreSQL service pods are fixed.

## Job Hardening and Evidence Controls

| Control | Implementation |
|---|---|
| Namespace isolation | `lanai-loadtest` has restricted Pod Security labels, a resource quota, limit range, and default deny policy. |
| Dedicated execution identity | Uses `ledger-soak-runner` with `automountServiceAccountToken: false`. |
| Container privilege | UID/GID 10001, non-root, no privilege escalation, all capabilities dropped, read-only root filesystem, and RuntimeDefault seccomp. |
| Resource bounds | Requests 1 CPU / 1 GiB and limits 2 CPU / 2 GiB. |
| Time and retry bounds | `backoffLimit: 0`, `activeDeadlineSeconds: 10800`, and seven-day Job TTL. |
| Evidence retention | `/evidence` is a retained `ledger-soak-evidence` PVC. |
| Secrets | Database, Temporal, TigerBeetle, Fluvio, and Lakehouse addresses/tokens are sourced only from `lanai-loadtest-financial-services`; Dapr API and Redis values use dedicated load-test secrets. |
| Dapr component isolation | Namespace-scoped `statestore` and `pubsub` Redis components are TLS-enabled and scoped only to `lanai-financial-workflow-runner`; their Kubernetes `secretKeyRef` values are resolved at injection time. |
| Workload prerequisites | Before applying the Job, the release gate verifies `ledger-soak-runner`, `ledger-soak-evidence`, Dapr token/Redis keys, and the `statestore`/`pubsub` components exist and that the caller can read the required resource types. |
| Artifact integrity | The release runner accepts only lowercase `@sha256:` image digests and rejects unresolved image/run-ID placeholders. |

## Release-Gate Alignment Remediation

| Issue found | Remediation | Validation |
|---|---|---|
| Financial namespace was checked against `LANAI_STAGING_ENVIRONMENT`, conflicting with `lanai-loadtest`’s `lanai.io/environment: loadtest` label. | Added mandatory `LANAI_FINANCIAL_ENVIRONMENT`; financial namespace is checked against it, and `environment: loadtest` is now declared in the isolated namespace. | Hermetic approved path passed with staging=`staging` and financial=`loadtest`. |
| Financial runner could theoretically share the platform staging namespace. | Release gate rejects equal staging and financial namespace names before Kubernetes interaction. | Hermetic co-location attempt exits 65. |
| Runbook lacked the dedicated financial environment input. | Added `LANAI_FINANCIAL_ENVIRONMENT='loadtest'` to `lanai-portal/TESTING.md`. | Runbook matches runner requirements. |
| Financial Job referenced a service account and evidence PVC without explicit release-gate existence checks. | Added read RBAC and existence preflights for `ledger-soak-runner` and `ledger-soak-evidence`. | Hermetic missing-PVC path exits 78 before any admission or workload mutation. |
| Dapr client token was mounted without sidecar API-token enforcement, and no dedicated namespace-scoped components were included. | Added `dapr.io/api-token-secret`, a matching app token mount, TLS Redis `statestore`/`pubsub` components scoped to the runner app-id, explicit sidecar resource/seccomp settings, and secret/component preflights. | Static manifest validation and hermetic release-gate paths verify the declared prerequisites; live Dapr control-plane evidence remains required. |

## Provider Failure-Injection Assertions

### Stripe idempotency

The test makes two authenticated `POST /v1/customers` calls with the same `Idempotency-Key: customer-create-001`. The fixture builds a `POST:path:key` cache key, stores only the first successful `200` response, and returns that stored payload for the second call with `idempotent-replayed: true`.

| Test assertion | Verified behavior |
|---|---|
| First response is `200` | The initial Stripe fixture request completed normally. |
| Second response is `200` | A duplicate idempotent request is accepted rather than rejected. |
| `idempotent-replayed=true` | The replay branch, not fresh response construction, handled the duplicate. |
| JSON bodies are equal | Caller receives an identical response for the duplicate key. |
| Two Stripe customer requests are captured | Request telemetry preserves both caller attempts without retaining authorization secrets. |

### CRM transient failure

The test initializes one exact injected failure: `{ provider: "crm", path: "/graphql", count: 1, status: 503 }`. After authentication, the queue matches provider/path, decrements the count, and returns `503` with `error.type=api_error`. The second authenticated request sees no remaining failure, passes GraphQL JSON/query validation, and returns deterministic `200` Query data.

| Test assertion | Verified behavior |
|---|---|
| First response is `503` | Exact CRM path-scoped transient failure injection works. |
| First error type is `api_error` | Availability errors are distinct from rate limits and authentication failures. |
| Second response is `200` | Queue count is consumed once and normal service behavior resumes. |
| `data.__typename=Query` | Retry path reaches normal GraphQL processing rather than a synthetic placeholder. |

The focused fixture suite passed **4/4 tests** in **343 ms**. It tests caller-visible retry conditions; the explicit second request represents the caller retry and does not assert that the CRM client library itself has an automatic retry loop.

## Executive Assurance Configuration Summary

| Control group | Checks | Result |
|---|---:|---:|
| CI reproducibility, local provider fixtures, and Permify topology | 7 | 7 PASS |
| Nightly security automation | 6 | 6 PASS |
| Protected external-provider boundary | 5 | 5 PASS |
| Supply-chain policy | 5 | 5 PASS |
| Package-manager and Resend provenance | 4 | 4 PASS |
| Production Docker lock discipline | 3 | 3 PASS |
| Live-provider test safety | 2 | 2 PASS |
| Workflow source governance | 1 | 1 PASS |
| Kubernetes Permify transport | 2 | 2 PASS |
| Authenticated smoke-job controls | 3 | 3 PASS |
| **Total** | **38** | **38 PASS** |

`trivy config --severity HIGH,CRITICAL --exit-code 1 config/k8s/loadtest` reported **0** high/critical configuration findings across the daily audit, isolated ledger soak, and live financial workflow runner manifests. The 38-control assurance validator also passed after this review.

## Remaining Evidence Boundary

The template audit, static scans, and hermetic release-gate tests do not establish live service reachability, real policy enforcement, ledger reconciliation, Dapr control-plane injection, or a production certification decision. Those require the committed staging gate to run with a restricted kubeconfig, correctly labelled namespaces, an approved immutable runner digest, Keycloak/Permify smoke credentials, and isolated real financial-service endpoints.
