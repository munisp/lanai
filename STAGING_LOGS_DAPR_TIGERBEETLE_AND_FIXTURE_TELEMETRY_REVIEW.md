# Staging Gate Evidence, Dapr/TigerBeetle Integration, and Fixture Telemetry Review

**Review date:** 2026-08-17 EDT
**Scope:** Current repository configuration, local hermetic release-gate logs, financial-runner manifests, and focused provider-fixture telemetry.
**Live staging outcome:** **Not executed.** No Kubernetes client, kubeconfig/context, approval flag, target namespace values, run ID, or signed runner digest is available in this environment.

## 1. Release-Gate Log Evidence

The available logs are from a hermetic `kubectl` simulator, not a real cluster. The successful simulated path recorded server-side admission validation for all six platform manifest groups, then the authenticated smoke stage and financial evidence stage:

```text
Performing server-side admission dry-run in context=staging-approved namespace=lanai-staging
--- config/k8s/app-tier.yaml ---
--- config/k8s/data-tier.yaml ---
--- config/k8s/platform-tier.yaml ---
--- config/k8s/ai-tier.yaml ---
--- config/k8s/jobs.yaml ---
--- config/k8s/smoke-test.yaml ---
Admission dry-run passed. No Kubernetes objects were persisted.
Running authenticated platform smoke job in lanai-staging.
Running live financial evidence job in lanai-loadtest.
Staging smoke and financial evidence gates completed successfully.
```

The simulated RBAC implementation returned `yes` for every `kubectl auth can-i` request; therefore there are **no simulated namespace or RBAC warnings**. This is evidence that the runner’s branching and fail-closed handling work, not evidence that the staging cluster has the required roles.

| Negative preflight path | Observed output | Exit behavior |
|---|---|---:|
| Invalid financial namespace | `LANAI_FINANCIAL_NAMESPACE must be a valid lowercase Kubernetes namespace.` | 65 |
| Financial and platform namespace co-location | `Financial evidence must use a dedicated namespace, not the platform staging namespace.` | 65 |
| Missing evidence PVC | `Required resource persistentvolumeclaim/ledger-soak-evidence is unavailable in namespace lanai-loadtest.` | 78 |

A real run must still provide the approved context, both environment-labelled namespaces, all RBAC grants, Keycloak secret, financial-service secrets, Dapr secrets/components, retained evidence PVC, and immutable runner digest. The current environment has none of the live inputs and does not contain `kubectl`.

## 2. Dapr Configuration Analysis

The financial Job uses an injected Dapr sidecar with app ID `lanai-financial-workflow-runner`. The main container calls the local sidecar on `127.0.0.1:3500`, while the sidecar itself reaches the Redis backing component through allowed TCP 6379 egress.

| Control | Current configuration | Assessment |
|---|---|---|
| Sidecar injection | `dapr.io/enabled: "true"` and app ID `lanai-financial-workflow-runner`. | The app ID matches component scopes. |
| App-to-sidecar authentication | `dapr.io/api-token-secret: lanai-loadtest-dapr-api-token`; main container mounts the same secret key as `DAPR_API_TOKEN`. | Dapr API token validation is explicitly enabled for the sidecar and client. |
| Tokenless pod posture | Pod has `automountServiceAccountToken: false`; annotation `dapr.io/disable-builtin-k8s-secret-store: "true"` is set. | Preserves the tokenless workload posture while allowing Dapr Operator injection-time resolution of component `secretKeyRef` values. |
| Sidecar hardening | RuntimeDefault sidecar seccomp plus CPU request/limit of 100m/300m and memory request/limit of 250Mi/1000Mi. | Adds explicit production sidecar resource and security settings. |
| Components | `statestore` and `pubsub` are Kubernetes-namespace-scoped (`lanai-loadtest`), Redis TLS-enabled, and scoped only to the runner app ID. | Prevents other Dapr apps from using the financial runner’s components. |
| Component secrets | `lanai-loadtest-dapr-redis` supplies `host` and `password`; API token uses a separate secret. | No Redis credential or Dapr API token is in the manifest. |
| Gate preflight | Verifies Dapr token and Redis keys, component objects, and `get components.dapr.io` permission. | Prevents a Job from starting with missing Dapr prerequisites. |

Dapr documentation states that Kubernetes components are namespace-scoped, component `scopes` restrict access to listed app IDs, and application-to-sidecar API authentication uses `dapr.io/api-token-secret` plus the app token. It also documents that component `secretKeyRef` values can be resolved by the Dapr Operator at injection time while the sidecar’s built-in Kubernetes secret store is disabled for tokenless pods. [1] [2] [3]

## 3. TigerBeetle Integration Analysis

The Job reads `TIGERBEETLE_ADDRESS` only from `lanai-loadtest-financial-services`; no endpoint is embedded in the YAML. The egress policy permits TCP 3000 only to namespaces labelled `lanai.io/platform-services=true`.

The live runner rejects an empty TigerBeetle endpoint before writing test fixtures. It starts the deployed `bookingCommissionSaga` through Temporal, then verifies every completed workflow by looking up both deterministic TigerBeetle pending and settlement transfer IDs. For each result it verifies that pending and settlement debit/credit account IDs equal the mirrored PostgreSQL ledger accounts. It also requires one posted ledger mirror and one published outbox event per workflow.

| Evidence check | Failure condition |
|---|---|
| Required endpoint | Empty `TIGERBEETLE_ADDRESS` stops the runner before workflow writes. |
| Workflow result | A failed or duplicate Temporal workflow fails the run. |
| PostgreSQL mirror | Mirror count must equal workflow count and status must be `posted`. |
| Transfer identity | Settlement transfer ID in each mirror must equal saga output. |
| Dual-entry validation | TigerBeetle pending and settlement debit/credit accounts must match PostgreSQL mirror accounts. |
| Outbox delivery | One financial `posted` event per mirror must be in `published` state. |

## 4. Provider Fixture Test Output and Telemetry

Current focused Vitest output:

```text
Test Files  1 passed (1)
Tests       4 passed (4)
Duration    383ms
```

Scenario-level timings were 52 ms for Stripe idempotency replay, 13 ms for Stripe rate-limit/retry, 8 ms for CRM authentication/malformed input, and 7 ms for CRM transient failure/retry.

| Scenario | Status sequence | Request telemetry | Protocol evidence |
|---|---|---:|---|
| Stripe idempotency replay | 200 → 200 | 2 `POST /v1/customers`, identical idempotency key | Second response has `idempotent-replayed: true`; no error type. |
| Stripe rate limit then retry | 429 → 200 | 2 `POST /v1/customers`, identical idempotency key | First response has `retry-after: 2` and `rate_limit_error`. |
| CRM transient failure then retry | 503 → 200 | 2 `POST /graphql` | First response has `api_error`; second reaches normal Query data. |

Request telemetry deliberately records only provider, HTTP method, path, and Stripe idempotency key. It does not retain authorization headers, bodies, API tokens, payment credentials, or CRM content.

## 5. Validation Summary

| Gate | Result |
|---|---:|
| YAML parse: Dapr component, runner, isolated manifest | Pass |
| Release-gate shell syntax | Pass |
| Load-test Trivy configuration scan | 0 HIGH/CRITICAL findings |
| Assurance configuration checks | 38/38 pass |
| Focused fixture suite | 4/4 pass |
| Live cluster execution | Not executed; prerequisites absent |

## References

[1]: https://docs.dapr.io/operations/components/component-scopes/ "Dapr component namespaces and scopes"
[2]: https://docs.dapr.io/operations/security/api-token/ "Dapr API token authentication"
[3]: https://docs.dapr.io/operations/hosting/kubernetes/kubernetes-production/ "Dapr production guidelines on Kubernetes"
