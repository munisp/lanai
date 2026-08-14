# Kubernetes Hardening and Complete Local Provider Testing

## Verified Configuration Result

The hardened Kubernetes configuration was scanned with Trivy using the `HIGH,CRITICAL` severity threshold. The scan returned **zero high or critical misconfigurations** across `config/k8s`.

> This result validates manifest structure and declarative controls. It does not replace a staging admission-controller check or a runtime verification that each upstream image can operate under the declared filesystem and UID restrictions.

## Exact Pod and Container Security Contexts

All hardened workloads apply the following container-level controls unless otherwise noted:

```yaml
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
```

Every hardened Pod uses the runtime-default seccomp profile:

```yaml
securityContext:
  runAsNonRoot: true
  seccompProfile:
    type: RuntimeDefault
```

| Workload | Pod identity and shared group | Required writable paths | Container policy |
|---|---|---|---|
| `lanai-portal` | UID/GID/FSGroup `1001` | `emptyDir` mounted at `/tmp` | Drops all capabilities, no privilege escalation, read-only root. |
| PostgreSQL | UID/GID/FSGroup `999` | Existing data PVC plus explicit writable init and temporary mounts | Drops all capabilities, no privilege escalation, read-only root. |
| Keycloak realm renderer | UID/GID `10001`; Pod FSGroup `1000` | Rendered realm `emptyDir`, `/tmp` | Uses `config/k8s/images/realm-render.Dockerfile`; no package installation at runtime. |
| Keycloak | UID/GID `1000`; Pod FSGroup `1000` | Realm `emptyDir`, `/tmp` | Drops all capabilities, no privilege escalation, read-only root. |
| Ollama | UID/GID/FSGroup `1000` | Model PVC and `/tmp` | Drops all capabilities, no privilege escalation, read-only root. |
| AI briefing and proposal services | UID/GID/FSGroup `1000` | Explicit temporary `emptyDir` | Drops all capabilities, no privilege escalation, read-only root. |
| AI gateway | UID/GID/FSGroup `10001` | Explicit temporary `emptyDir` | Drops all capabilities, no privilege escalation, read-only root. |
| Database migration job | UID/GID/FSGroup `1001` | Temporary `emptyDir` | Drops all capabilities, no privilege escalation, read-only root. |
| Permify bootstrap job | UID/GID/FSGroup `1001` | Temporary `emptyDir` | Drops all capabilities, no privilege escalation, read-only root. |
| Temporal namespace bootstrap job | UID/GID/FSGroup `1000` | Temporary `emptyDir` | Drops all capabilities, no privilege escalation, read-only root. |
| One-shot and scheduled smoke tests | `runAsNonRoot: true` with runtime-default seccomp | Explicit `/tmp` `emptyDir` | Drops all capabilities, no privilege escalation, read-only root. |

The complete deployment controls are in `config/k8s/app-tier.yaml`, `data-tier.yaml`, `platform-tier.yaml`, `ai-tier.yaml`, `jobs.yaml`, and `smoke-test.yaml`.

## Deterministic Local Provider Doubles

The test system does **not** enable external sandbox APIs when `RUN_LOCAL_PROVIDER_TESTS=1`. It starts isolated in-process HTTP fixtures and exercises the same SDK or HTTP-client request paths used by the application.

| Provider | Fixture behavior | Application path exercised |
|---|---|---|
| Stripe | Emulates customers, payment-method attachment/listing, subscriptions, Checkout, Billing Portal, and cleanup endpoints. | Real Stripe SDK serialization and `stripeRouter` membership payment handlers. |
| Twenty CRM | Emulates authenticated GraphQL query and schema-introspection responses. | CRM GraphQL transport contract and proxy behavior. |
| AI gateway | Emulates proposal, morning-briefing, and WhatsApp draft endpoints with deterministic JSON. | AI gateway HTTP protocol response shape. |
| Permify | Uses a real isolated gRPC server and bootstrapped policy schema. | Actual policy tuple checks in the API procedures. |

The fixture implementation is `lanai-portal/server/test/localProviderMocks.ts`. Provider fixture tests are explicitly labeled as local contracts; they are not evidence of a third-party sandbox or production service response.

## Complete Local Command

The supported full local command is:

```bash
lanai-portal/scripts/run-local-permify-integration.sh
```

It requires Docker and pnpm. The script starts an isolated PostgreSQL plus Permify stack, creates the test policy schema, supplies test-only Stripe configuration, enables `RUN_LOCAL_PROVIDER_TESTS=1`, runs the full Vitest suite sequentially, and removes all containers and volumes unless `KEEP_PERMIFY_TEST_STACK=true` is explicitly set.

The suite deliberately never sets `RUN_EXTERNAL_STRIPE_TESTS` or `RUN_EXTERNAL_CRM_TESTS`; real third-party sandbox tests remain separately opt-in.

## Runtime Validation Required Before Release

Before production deployment, the platform team must run the hardened manifests through the target cluster's admission policy and start each workload. The release evidence must include pod startup logs, readiness probes, file-system write checks for declared writable mounts, and the production smoke Job's authenticated Keycloak plus Permify call.

## Evidence Summary

| Gate | Result |
|---|---|
| Trivy `HIGH,CRITICAL` manifest scan | 0 findings |
| TypeScript after local-provider additions | Passed |
| Stripe router local fixture suite | 4 passed |
| CRM local fixture suite | 2 passed |
| Stripe SDK local fixture contract | 1 passed |
| AI gateway local fixture contract | 3 passed |
| Complete local regression suite | 286 passed, 0 skipped |

The full suite result requires a reachable local PostgreSQL instance and local Permify gRPC server, both of which were used for the recorded run.
