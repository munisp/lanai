# Assurance Control Matrix and Staging Release-Gate Review

**Reviewed revision:** `8bbc040` on `main`
**Review date:** 2026-08-17 EDT
**Validator result:** **38/38 controls passed**
**Staging-gate result:** Static syntax and hermetic validation passed; no live Kubernetes operation was attempted or claimed.

## 1. Assurance Configuration Control Matrix

The table below reproduces the exact control labels emitted by `python3 assurance/validate-assurance-config.py` at the reviewed revision. Every entry returned `PASS`.

| # | Control | Status | Enforced source / meaning |
|---:|---|---|---|
| 1 | CI pins trusted pnpm 11.20.0 | PASS | `.github/workflows/ci.yml` fixes `pnpm/action-setup` at 11.20.0. |
| 2 | CI pins supported Node 22.14.0 | PASS | CI uses the Node version selected for the pnpm 11 workflow. |
| 3 | CI uses root workspace lockfile | PASS | CI cache points to canonical `pnpm-lock.yaml`. |
| 4 | CI starts isolated Permify stack | PASS | CI starts `docker-compose.permify-test.yml` with readiness waiting. |
| 5 | CI supplies live Permify endpoint | PASS | CI tests use the isolated real gRPC address `127.0.0.1:34788`. |
| 6 | CI enables deterministic local provider fixtures | PASS | CI enables `RUN_LOCAL_PROVIDER_TESTS=1` rather than silently skipping fixture contracts. |
| 7 | CI builds from workspace-root Docker context | PASS | CI uses `docker build -f lanai-portal/Dockerfile .`. |
| 8 | Nightly audit pins trusted pnpm 11.20.0 | PASS | Nightly audit uses pnpm 11.20.0. |
| 9 | Nightly audit pins supported Node 22.14.0 | PASS | Nightly audit uses Node 22.14.0. |
| 10 | Nightly audit uses root workspace lockfile | PASS | The canonical lockfile is cached and frozen-installed. |
| 11 | Nightly uses pnpm 11-compatible root production audit | PASS | Uses `pnpm audit --prod --audit-level=high`, avoiding pnpm 11 filtered-audit incompatibility. |
| 12 | Nightly image scan uses workspace-root Docker context | PASS | Image scan builds through the canonical Dockerfile and root context. |
| 13 | Nightly Python safety fails closed | PASS | No `|| true` suppression remains on Python safety checks. |
| 14 | External provider workflow is environment protected | PASS | `.github/workflows/external-provider-tests.yml` declares `external-integration`. |
| 15 | External provider workflow is opt-in | PASS | It requires `EXTERNAL_INTEGRATION_ENABLED=true`. |
| 16 | External provider workflow does not run on pull requests | PASS | No `pull_request` trigger exposes provider secrets to forks. |
| 17 | External provider workflow uses sandbox secret mapping | PASS | Maps the protected `STRIPE_TEST_SECRET_KEY` only inside the protected job. |
| 18 | External provider workflow runs the guarded launcher | PASS | Executes `test:external`, not an ad hoc provider command. |
| 19 | Workspace enforces seven-day dependency maturity | PASS | `minimumReleaseAge: 10080`. |
| 20 | Workspace blocks exotic transitive dependencies | PASS | `blockExoticSubdeps: true`. |
| 21 | Workspace rejects trust downgrades | PASS | `trustPolicy: no-downgrade`. |
| 22 | Workspace uses explicit pnpm 11 build allowlist | PASS | `allowBuilds` replaces obsolete pnpm 10 build settings. |
| 23 | Workspace denies Fluvio package-level builds | PASS | `@fluvio/client: false` is explicit. |
| 24 | Root package-manager pin is pnpm 11.20.0 | PASS | Root `package.json` matches CI/tooling policy. |
| 25 | Portal package-manager pin is pnpm 11.20.0 | PASS | `lanai-portal/package.json` matches the workspace. |
| 26 | Portal development pnpm pin is exact 11.20.0 | PASS | No caret range can resolve the rejected 10.34.5 version. |
| 27 | Portal Resend pin preserves trusted publisher version | PASS | Portal pins `resend@6.18.0`; no exception is committed. |
| 28 | Production Dockerfile installs pnpm 11.20.0 | PASS | Build stage uses `ARG PNPM_VERSION=11.20.0`. |
| 29 | Production Dockerfile copies root workspace lock controls | PASS | Dockerfile copies root manifest, lockfile, and workspace policy. |
| 30 | Production Dockerfile installs frozen lockfile | PASS | Dockerfile uses `pnpm install --frozen-lockfile`. |
| 31 | External launcher rejects live Stripe keys | PASS | `test-external.sh` rejects `sk_live_*` before test execution. |
| 32 | External launcher requires Stripe sandbox keys | PASS | `test-external.sh` accepts only `sk_test_*`. |
| 33 | GitHub Actions workflows are not ignored | PASS | `.gitignore` no longer excludes `.github/workflows/`. |
| 34 | `app-tier.yaml` does not force plaintext Permify | PASS | Manifest does not set `PERMIFY_INSECURE=true`. |
| 35 | `jobs.yaml` does not force plaintext Permify | PASS | Bootstrap/migration jobs do not set plaintext Permify transport. |
| 36 | Smoke test has no placeholder client secret | PASS | No placeholder secret string is accepted by the smoke job. |
| 37 | Smoke test injects a dedicated secret | PASS | Uses `lanai-secrets/KEYCLOAK_SMOKE_CLIENT_SECRET`. |
| 38 | Smoke test fails on protected-call denial | PASS | A denied protected API call produces a failed smoke job rather than a skip. |

## 2. Staging Release-Gate Script Review

The reviewed script is `lanai-portal/scripts/run-staging-release-gates.sh`. It is intentionally a **live-operation gate**, so its happy path is not executed without an approved cluster. It has, however, been syntax checked and exercised with a hermetic `kubectl` simulator.

### 2.1 Entry and Target Validation

| Validation | Implementation | Assessment |
|---|---|---|
| Explicit approval | Requires `LANAI_APPROVE_STAGING_EXECUTION=1`. | PASS — prevents accidental execution from a copied command. |
| Required inputs | Requires exact context, two namespaces, expected environment, financial run ID, and runner image. | PASS — no implicit defaults for live target values. |
| Namespace syntax | Both namespaces must match Kubernetes lowercase DNS-label syntax. | PASS — rejects malformed/injection-prone namespace strings before a command executes. |
| Run-ID syntax | Run ID is limited to 3–128 safe identifier characters. | PASS — prevents unsafe interpolation into the rendered manifest. |
| Image reference | Image must be lowercase and include a 64-hex-character `@sha256:` digest. | PASS — forbids mutable tag-only financial runner images. |
| Context equality | `kubectl config current-context` must exactly equal `LANAI_STAGING_CONTEXT`. | PASS — prevents a command aimed at the wrong cluster. |
| Environment labels | Both the platform namespace and financial namespace must carry the requested `environment` label. | PASS — prevents using an unlabelled or non-staging load-test namespace. |

### 2.2 RBAC and Secret Validation

| Boundary | Implementation | Assessment |
|---|---|---|
| Cluster namespace visibility | Requires `kubectl auth can-i get namespaces` before label checks. | PASS — avoids treating an unreadable namespace as a valid staging namespace. |
| Platform admission/smoke permissions | Preflights deployment dry-run, Job create/get/patch/delete, CronJob create/get/patch, secret read, pod read, and pod-log read in the staging namespace. | PASS — aligns preflight with the actual server-side dry-run and persisted smoke workload operations. |
| Financial evidence permissions | Preflights ConfigMap, NetworkPolicy, Job, secret, pod, and pod-log actions in the separate financial namespace. | PASS — fixes the earlier gap where only staging-namespace RBAC had been checked. |
| Keycloak secret | Requires nonempty `lanai-secrets/KEYCLOAK_SMOKE_CLIENT_SECRET` in the staging namespace. | PASS — smoke test cannot silently run without the service-account credential. |
| Financial service secret | Requires all seven named test-only service values in `lanai-loadtest-financial-services`. | PASS — blocks a partial financial runner configuration before any job is created. |

### 2.3 Admission, Workload, and Evidence Flow

| Stage | Implementation | Assessment |
|---|---|---|
| Admission validation | Invokes `dry-run-staging-admission.sh`, which applies app/data/platform/AI/jobs/smoke manifests with `--server-side --dry-run=server --validate=strict`. | PASS — validates API schema, admission policy, and server-side field processing without persisting those objects. |
| Smoke workload | Deletes prior `lanai-smoke-test`, applies the smoke manifest, waits up to 300 seconds, and retrieves logs. | PASS — fails closed if Keycloak token issuance, Permify authorization, or protected call fails. |
| Financial rendering | Replaces only the reviewed default namespace, run-ID placeholder, and image placeholder in a temporary file. | PASS — production source manifest is not modified. |
| Placeholder protection | Refuses unresolved image/run-ID placeholders; if the selected namespace is not the default, also refuses a remaining default namespace. | PASS — the default `lanai-loadtest` namespace is accepted when it is explicitly selected. |
| Job identification | Uses `kubectl apply -o name` and parses the generated Job name from that exact apply output. | PASS — fixes the earlier race-prone strategy of selecting the newest labelled Job. |
| Evidence completion | Waits up to 10,800 seconds for the exact generated Job and retrieves all container logs. | PASS — links the collected evidence to the job created by this run. |

## 3. Hermetic Validation Results

The following non-cluster checks were executed successfully at revision `8bbc040`:

| Check | Result |
|---|---|
| `bash -n lanai-portal/scripts/run-staging-release-gates.sh` | PASS |
| Hermetic approved-context, correct-label, complete-RBAC, complete-secret, immutable-image path | PASS |
| Hermetic malformed financial-namespace rejection | PASS — exits 65 before any simulated cluster mutation |
| Assurance validator after script hardening | PASS — 38/38 existing configuration controls |
| Git diff whitespace gate | PASS |

## 4. Remaining Live Boundary

The review confirms that the script’s local guard logic is correct and fails closed. It does **not** establish that a real cluster will admit all workloads, that every required RBAC role exists, that the Keycloak service account has the correct role/Permify tuple, that the Permify certificate chain is trusted, or that financial services reconcile correctly. Those are the intended results of running this exact script with an approved restricted kubeconfig and test-only staging services.
