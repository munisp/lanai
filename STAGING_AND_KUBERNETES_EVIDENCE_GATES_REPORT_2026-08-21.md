# Lanai Live Staging and Kubernetes Evidence Gates

**Prepared:** 2026-08-21

**Scope:** Production-readiness evidence required after repository-controlled validation and before a production release decision.

**Status:** **Not yet live-certified.** The codebase has deterministic local evidence, but the live Kubernetes gates have not been executed from this environment because neither `kubectl` nor `cosign` is installed or configured here. This is an explicit evidence boundary, not a code failure.

## Executive assessment

The repository contains a deliberately fail-closed staging-gate runner rather than a deployment script that silently chooses a cluster, namespace, image, or approval setting. It requires an explicit approved context, distinct staging and financial-evidence namespaces, an immutable digest-qualified financial-runner image, and a valid keyless Cosign signature issued by the protected release workflow. It then performs server-side admission checks, runs an authenticated identity-chain smoke Job, and executes a dedicated financial workflow evidence Job. [1]

> **Release conclusion:** The current code and local provider-enabled validation establish that the application can be promoted to live staging. They do **not** establish that a specific cluster, identity provider, ledger allocation, TLS configuration, or external service topology is correct. A production release must remain blocked until the live evidence listed in this report is collected and accepted by the designated change owner.

| Evidence layer | Current state | What constitutes release-quality proof |
|---|---|---|
| Repository controls | Validated locally | Clean commit, protected CI, signed immutable release image, approved change record |
| PostgreSQL + Permify | Validated locally through provider-enabled regression | Live migration completion, schema bootstrap completion, authenticated authorization result in staging |
| Stripe and travel business paths | Validated locally with deterministic provider fixture | Staging secret wiring, signed webhook acceptance, payment/ledger workflow evidence using non-production funds |
| Kubernetes admission | Not executed live | Server-side dry-run output for every required manifest against the approved staging API server |
| Identity chain | Not executed live | Keycloak service-account token successfully reaches APISIX, Portal, and Permify-protected API call |
| Financial durability | Not executed live | Isolated runner evidence proving Temporal, TigerBeetle, PostgreSQL, outbox, Fluvio/Dapr, and Lakehouse behavior reconcile |

## Gate 1 — Explicit approval, target isolation, and release provenance

The release-gate runner requires `LANAI_APPROVE_STAGING_EXECUTION=1` and refuses to default a Kubernetes context, staging namespace, financial namespace, release image, environment label, or financial run identifier. Namespace values must use valid lowercase Kubernetes syntax; the staging and financial namespaces must be distinct; the financial run identifier is constrained to a safe 3–128-character form; and the runner image must use a lower-case `@sha256:` digest rather than a mutable tag. [1]

The image gate must be satisfied before any live workload is created. The runner verifies the image with Cosign, using the GitHub Actions OIDC issuer and an identity regular expression restricted by default to the repository’s tag-driven `release-images.yml` workflow. This prevents use of an unsigned image or an image signed by an unrelated workflow. [1]

| Required input | Required condition | Evidence to retain |
|---|---|---|
| `LANAI_APPROVE_STAGING_EXECUTION` | Exactly `1`, supplied by the accountable change owner | Approved change ticket and terminal transcript with non-secret environment names only |
| `LANAI_STAGING_CONTEXT` | Exact current `kubectl` context | `kubectl config current-context` output and change-record target declaration |
| Staging and financial namespaces | Different names and correct `environment` labels | Namespace YAML/label output and release-gate transcript |
| `LANAI_FINANCIAL_RUNNER_IMAGE` | Immutable SHA-256 digest | Image digest, SBOM/vulnerability evidence, Cosign verification output, release tag |
| Financial run ID | Unique, traceable change-ticket/UTC identifier | Run ID recorded in ConfigMap, Job labels/logs, and evidence archive |

## Gate 2 — Kubernetes identity, RBAC, and prerequisite resources

The runner checks the active identity rather than trusting declared RBAC manifests. In the staging namespace it requires permissions to create deployments, manage and read Jobs and CronJobs, read secrets and pods, and collect pod logs. In the isolated financial namespace it independently requires permission to manage ConfigMaps, NetworkPolicies, Jobs, required secrets, the evidence PVC, the financial service account, and Dapr components. Any denied capability terminates the run before an admission attempt or a live Job is created. [1]

Before smoke and financial execution, the runner also verifies the restricted Keycloak smoke-client secret, financial-service secret keys for PostgreSQL, Temporal, TigerBeetle, Fluvio, Lakehouse, Dapr API access, and Redis-backed Dapr component access. It requires the `ledger-soak-runner` service account, `ledger-soak-evidence` persistent-volume claim, and Dapr `statestore` and `pubsub` components. [1]

The deployment bootstrap Jobs are a separate precondition. `db-migrate` must complete against the real production-style environment; `permify-bootstrap` must load the required schema using TLS-configured Permify; and `temporal-namespace-register` must establish the dedicated `lanai` Temporal namespace rather than relying on the shared `default` namespace. [5]

| Verification | Release criterion | Failure interpretation |
|---|---|---|
| RBAC `can-i` checks | Every gate permission returns `yes` only in the approved namespace | Missing least-privilege grant or a wrong kubeconfig identity; do not broaden permissions blindly |
| Required secrets | Required keys exist; values are never printed | Incomplete secret provisioning or secret rotation error |
| Stateful evidence resources | PVC and Dapr components exist and are ready | Financial proof cannot be retained or outbox/state behavior cannot be tested |
| Bootstrap Jobs | Database migrations, Permify schema, and Temporal namespace Jobs complete successfully | Application may start against incomplete persistence, authorization, or workflow tenancy |

## Gate 3 — Server-side Kubernetes admission

The staging runner invokes a non-persistent admission helper before it creates the authenticated smoke Job. The helper requires the exact configured staging context, checks that the namespace has the expected `environment` label, confirms the caller can create a Deployment, and applies the application, data, platform, AI, jobs, and smoke manifests with `--server-side --dry-run=server --validate=strict`. This makes policy controllers, schema validation, and admission webhooks evaluate the actual manifests without persisting objects. [2]

Admission success alone is necessary but insufficient. It proves that the Kubernetes API and active policies accept the manifests, not that dependent services are reachable, secrets are semantically valid, or identity and ledger flows work at runtime.

> **Required artifact:** Preserve the complete admission transcript, admission-controller warnings, rendered manifest digests, effective namespace labels, and the exact commit/image digest pair. A client-side validation result is not a replacement for this server-side result.

## Gate 4 — Authenticated platform smoke evidence

The live smoke Job is hardened as a non-root, read-only, capability-dropped workload with no Kubernetes service-account token mount. It has a five-minute deadline and fetches its dedicated Keycloak smoke-client secret at runtime. [3]

The Job proves the following runtime chain in the deployed namespace:

| Smoke assertion | Required result | Why it matters |
|---|---|---|
| Portal `/api/health` | HTTP 200, with minimal public response | Confirms portal readiness without turning database status into a public information leak |
| Keycloak management readiness | HTTP 200 | Confirms identity service readiness separately from portal health |
| Permify and AI gateway health | HTTP 200 | Confirms authorization and AI dependency reachability |
| Unauthenticated protected tRPC request | HTTP 401 from Portal and through APISIX | Detects an accidental unauthenticated bypass |
| Permify schema listing | A schema version is present | Detects missing/failed policy bootstrap |
| APISIX health and host-routed request | HTTP 200 for APISIX status, HTTP 401 for no-JWT protected call | Confirms gateway path and protected-route behavior |
| Keycloak client-credential issuance | An access token is returned | Proves smoke-client secret and realm/client wiring |
| Keycloak → APISIX → Portal → Permify protected call | HTTP 200 for `members.list` with that access token | Proves end-to-end JWT validation and ReBAC authorization rather than merely health endpoints |

The smoke Job deletes any prior `lanai-smoke-test`, creates the current manifest, waits up to 300 seconds for completion, and emits all container logs. Any failed assertion exits non-zero and blocks the staging-gate runner. [1] [3]

## Gate 5 — Isolated financial workflow evidence

Financial validation is intentionally run in a dedicated namespace rather than the platform staging namespace. The rendered Job records a unique run ID, uses a signed digest-qualified financial-runner image, runs non-root with a read-only root filesystem and dropped capabilities, disables automatic service-account token mounting, persists evidence to a dedicated PVC, and has no retries (`backoffLimit: 0`). It has narrowly scoped egress rules to TigerBeetle, Temporal, Fluvio, Lakehouse, the Redis-backed Dapr services, PostgreSQL, and DNS. [4]

The live gate substitutes the approved namespace, run ID, and immutable runner image into the manifest, rejects unresolved placeholders and retained default namespace values, applies it, waits up to three hours for the generated Job to complete, and retrieves all container logs. [1]

The runner’s evidence package must be reviewed for the actual financial invariants, not just an exit code. The release reviewer should require, at minimum, the following artifacts for the exact run ID:

| Financial proof | Acceptance criterion |
|---|---|
| Temporal workflow trace | Every submitted workflow reaches a terminal success/compensation state with the expected idempotency key |
| TigerBeetle double-entry records | Deterministic transfer identifiers, debit/credit consistency, and no unmatched pending transfer |
| PostgreSQL mirror and outbox records | One business record and durable event per accepted workflow, with no duplicate idempotency key conflict being silently accepted |
| Fluvio/Dapr delivery evidence | Events are published or intentionally retried/dead-lettered with a visible causal record |
| Lakehouse ingestion evidence | Test-only aggregate/event record accepted where the feature path invokes Lakehouse |
| Reconciliation output | TigerBeetle balances and PostgreSQL mirror entries match for the run ID; discrepancies have documented remediation |
| Failure/compensation evidence | Any injected or real transient failure is either compensated or marked for durable retry, never represented as a completed payment without ledger proof |

## Mandatory live configuration confirmations

The portal manifest contains a candid live-evidence boundary: the current deployment scope states that the Temporal worker and lakehouse stack are not deployed in that scope, while `LAKEHOUSE_INGEST_URL` may be present but not reachable until a feature invokes it. It also marks the TigerBeetle cluster ID, address, ledger, and transfer-code values as unverified and requires confirmation against the real cluster’s TigerBeetle configuration and its ledger/code allocation owner before real money movement. [6]

Accordingly, the following are **blocking confirmations**, not optional operational polish:

| Confirmation | Required owner/evidence |
|---|---|
| Temporal worker deployment and queue consumption | Platform owner: running worker pods, task queue poller visibility, workflow execution evidence in the `lanai` namespace |
| Lakehouse ingestion reachability | Data-platform owner: deployed endpoint, TLS/auth validation, ingestion receipt for a test event |
| TigerBeetle allocation | Ledger owner: cluster ID, endpoint list, ledger number, transfer code, account setup, and test-only reconciliation evidence |
| Permify transport security | Security/platform owner: trusted TLS path with `PERMIFY_INSECURE=false`, certificate validation, schema version evidence |
| Keycloak client and service-account authorization | Identity owner: smoke client, realm roles, audience/issuer alignment, and required Permify relationship tuple |
| APISIX/Caddy/OpenAppSec routing | Edge owner: production host routing, JWT enforcement, WAF policy, rate-limit evidence, and no public metrics exposure |
| External integration secrets | Service owner: non-placeholder Stripe, Chatwoot, CRM, Dapr, and AI credentials; rotation/rollback records where applicable |

## Recommended execution record

The following sequence should be executed only by the change owner in the approved staging environment. It is intentionally not executed from this sandbox because live cluster access and release approval are unavailable.

```bash
export LANAI_APPROVE_STAGING_EXECUTION=1
export LANAI_STAGING_CONTEXT='approved-staging-context'
export LANAI_STAGING_NAMESPACE='lanai-staging'
export LANAI_STAGING_ENVIRONMENT='staging'
export LANAI_FINANCIAL_NAMESPACE='lanai-financial-evidence'
export LANAI_FINANCIAL_ENVIRONMENT='staging-financial'
export LANAI_FINANCIAL_RUN_ID='CHG-<ticket>-<utc-timestamp>'
export LANAI_FINANCIAL_RUNNER_IMAGE='ghcr.io/munisp/lanai-financial-workflow-runner@sha256:<64-hex-digest>'

./lanai-portal/scripts/run-staging-release-gates.sh \
  |& tee "staging-release-gates-${LANAI_FINANCIAL_RUN_ID}.log"
```

The reviewer should archive the shell transcript, signed image verification, server-side admission output, smoke Job logs, financial Job logs, evidence PVC contents, reconciliation artifacts, and the deployment’s resolved image digests. The release decision should name the exact Git commit, container digests, kube context, namespaces, run ID, approver, start/end times, and any observed warnings.

## Evidence decision matrix

| Decision | Conditions |
|---|---|
| **Ready for controlled staging validation** | Repository CI/type/assurance checks are green; manifest admission prerequisites are prepared; named change owner has approved the run |
| **Staging validated** | All five gates complete successfully, required artifacts are retained, and live configuration confirmations are accepted |
| **Production eligible** | Staging validated plus formal review of financial reconciliation, security admission results, observability/alert routing, backup/rollback readiness, and release-owner sign-off |
| **Release blocked** | Any missing environment label, RBAC permission, secret key, signed digest, bootstrap Job, smoke assertion, financial reconciliation artifact, or live configuration confirmation |

## Current environmental boundary

A non-mutating inspection in this execution environment found both `kubectl` and `cosign` unavailable. Therefore, no staging cluster query, Cosign verification, server-side admission check, smoke Job, or financial evidence Job was attempted. The local provider-enabled test evidence must not be described as a substitute for these live gates.

## References

[1]: https://github.com/munisp/lanai/blob/fddf160ef2df20f547dc1b9160017170a6f15e34/lanai-portal/scripts/run-staging-release-gates.sh "Staging release-gate runner"
[2]: https://github.com/munisp/lanai/blob/fddf160ef2df20f547dc1b9160017170a6f15e34/lanai-portal/scripts/dry-run-staging-admission.sh "Server-side staging admission validation"
[3]: https://github.com/munisp/lanai/blob/fddf160ef2df20f547dc1b9160017170a6f15e34/config/k8s/smoke-test.yaml "Authenticated platform smoke Job"
[4]: https://github.com/munisp/lanai/blob/fddf160ef2df20f547dc1b9160017170a6f15e34/config/k8s/loadtest/live-financial-workflow-runner.yaml "Isolated financial workflow evidence Job"
[5]: https://github.com/munisp/lanai/blob/fddf160ef2df20f547dc1b9160017170a6f15e34/config/k8s/jobs.yaml "Database, Permify, and Temporal bootstrap Jobs"
[6]: https://github.com/munisp/lanai/blob/fddf160ef2df20f547dc1b9160017170a6f15e34/config/k8s/app-tier.yaml "Portal deployment and live configuration caveats"
