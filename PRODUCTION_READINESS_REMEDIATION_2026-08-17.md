# Production-Readiness Remediation — 2026-08-17

**Repository:** `munisp/lanai`
**Assessment scope:** Repository-controlled production hardening and locally reproducible validation.
**Release disposition:** **Not yet production-certified.** All repository-remediable gaps identified in this review have been implemented and locally validated. Certification remains correctly blocked on named external staging, identity, provider, and image-signing evidence that cannot be fabricated from a local environment.

## Executive Summary

This remediation removes the stale package-manager trust downgrade, eliminates the need for the unapproved `resend@6.18.1` exception, enables registry-only transitive dependency enforcement, upgrades the build-script policy for pnpm 11, makes CI/security workflows tracked source, adds a protected external-provider workflow, prevents live Stripe keys from being used by test automation, and adds a fail-closed staging evidence runner.

> Local success is not substituted for external provider or staging evidence. The remaining release gates are deliberately executable, fail closed, and owned by the environment that must provide the credentials, signed images, and cluster authorization.

## Implemented Remediations

| Gap | Implementation | Result |
|---|---|---|
| `pnpm@10.34.5` trust downgrade | Replaced the permissive `^10.15.1` dev dependency and drifted package-manager declarations with exact **`pnpm@11.20.0`**. | The selected version has trusted-publisher/provenance evidence and the fresh lockfile passes `trustPolicy: no-downgrade`. |
| Unapproved Resend exception | Pinned `resend` to **`6.18.0`**, the checked registry version with trusted-publisher evidence. | No `trustPolicyExclude` or other exception is committed. |
| Exotic transitive-source gap | Enabled `blockExoticSubdeps: true`. | Fresh lockfile scan found no git, direct tarball, or other exotic transitive source. |
| pnpm 11 build policy migration | Replaced obsolete `onlyBuiltDependencies` with an explicit `allowBuilds` map. | Only `@swc/core`, `esbuild`, and `protobufjs` may build; `@fluvio/client` and `core-js` are explicitly denied. |
| Inconsistent package-manager bootstrap | Aligned root and portal package-manager fields, portal dev dependency, CI, nightly security, and Docker build bootstrap to 11.20.0. | Frozen install runs with pnpm 11.20.0. |
| Noncanonical Docker lock context | Changed the Docker build context to the workspace root and rewrote the Dockerfile to install from the canonical root manifest, workspace file, and lockfile. | Compose and CI now use `docker build -f lanai-portal/Dockerfile .`; runtime copies the root pnpm store needed by portal symlinks. |
| CI workflows silently excluded from Git | Removed the `.gitignore` rule for `.github/workflows/`; CI and nightly workflow definitions are now tracked. | Workflow code becomes reviewable and deployable rather than local-only. |
| Missing protected live-provider pipeline | Added `external-provider-tests.yml` for main, scheduled, and manual use only. | It is gated by the protected `external-integration` environment and `EXTERNAL_INTEGRATION_ENABLED`; no fork PR has access to provider secrets. |
| Risk of test automation using production billing key | Hardened `scripts/test-external.sh` to reject every `sk_live_` or non-`sk_test_` key before invoking Vitest. | Real-provider test runs cannot make live Stripe mutations through this launcher. |
| Unexecutable external release gates | Added `scripts/run-staging-release-gates.sh`. | It checks exact context/namespace/permissions/secrets, performs server-side admission validation, runs the authenticated smoke Job, and executes the signed-digest financial evidence Job only after explicit approval. |
| Stale documentation and assurance assertions | Updated the test runbook and expanded `validate-assurance-config.py`. | The structural gate now checks 38 controls spanning package policy, Docker context, workflows, provider-test protection, smoke configuration, and transport controls. |

## Local Validation Evidence

| Gate | Result | Evidence |
|---|---:|---|
| Fresh policy-constrained lock resolution | Pass | `pnpm clean --lockfile` and `pnpm install --lockfile-only` resolved 952 entries under seven-day maturity, trust-downgrade, and exotic-source controls. |
| Frozen install | Pass | pnpm 11.20.0 verified the lockfile policies and installed 806 packages. |
| Build-script policy | Pass | No automatically ignored builds; only the intentional denials for `@fluvio/client` and `core-js` remain. |
| TypeScript | Pass | `pnpm check` completed with 0 errors. |
| Production build | Pass | Portal/server/workflow/worker/migration/Permify/Twenty artifacts emitted. |
| Full provider-enabled regression | Pass | **16/16 test files; 290/290 tests; 0 failed; 0 skipped; 332.84 s.** Fresh PostgreSQL and real local Permify gRPC were used with deterministic Stripe/CRM/AI loopback fixtures. |
| Assurance structural gate | Pass | **38/38** checks passed. |
| Production dependency audit | Pass | `pnpm audit --prod --audit-level=high`: **No known vulnerabilities found**. |
| Python source syntax | Pass | `python3 -m compileall -q lanai_ai`. |
| Kubernetes configuration scan | Pass | Trivy configuration scan found **0 HIGH/CRITICAL findings** across the hardened Kubernetes manifests. |
| YAML and shell syntax | Pass | All tracked workflow/compose YAML and guarded shell scripts parsed successfully. |
| Live Stripe-key rejection | Pass | The external test launcher exits with code 65 before provider calls when given `sk_live_*`. |
| Local container build | Not executed | The current validation host has no `docker` CLI. CI has a tracked workspace-root Docker build and nightly image scan; those results must be retained from a GitHub run. |

## External Release Gates Still Required

These requirements are not code gaps. They require real infrastructure ownership, restricted credentials, and evidence from the environment that will host the platform.

| Gate | Required owner-provided input | Closure command / evidence |
|---|---|---|
| GitHub workflow activation | Permission to push workflow files, protected `external-integration` environment, main-only deployment rule, maintainer approval, and listed test secrets/variable. | GitHub Actions CI, nightly security, and protected external-provider workflow results. |
| Real Stripe and Twenty validation | Dedicated Twenty workspace/token, `sk_test_` Stripe key, pre-provisioned test price, and an isolated database/Permify endpoint. | `pnpm test:external` through the protected environment. |
| Staging admission and deployment | Restricted staging kubeconfig, exact context/namespace labels, and create/get permissions. | `LANAI_APPROVE_STAGING_EXECUTION=1 ./scripts/run-staging-release-gates.sh`. |
| Keycloak and Permify authorization chain | `lanai-secrets/KEYCLOAK_SMOKE_CLIENT_SECRET`, restricted service-account role, matching Permify tuple, and trusted Permify TLS endpoint. | Authenticated smoke Job output showing token issuance and protected `members.list` success. |
| Funds-flow certification | Isolated TigerBeetle, Temporal, PostgreSQL, Fluvio, Dapr, and Lakehouse endpoints; test-only secret; signed immutable financial-runner digest. | Staging runner logs, transfer/mirror reconciliation bundle, and approved 24-hour soak evidence. |
| Container artifact evidence | Runner with Docker/BuildKit and registry signing/attestation access. | CI Docker build, Trivy image scan, immutable image digest, SBOM, and signature/provenance record. |

## Release Rule

The platform must remain **not certified for production release** until every external gate in the previous table has a current, reviewable evidence artifact linked to the exact immutable release revision. Do not disable supply-chain controls, inject fallback credentials, convert these gates into skips, or treat local fixtures as live-provider proof.

## References

[1]: https://pnpm.io/migration "pnpm: Migrating from v10 to v11"
[2]: https://pnpm.io/supply-chain-security "pnpm: Mitigating supply chain attacks"
[3]: https://pnpm.io/cli/approve-builds "pnpm: Approve dependency build scripts"
[4]: https://docs.npmjs.com/trusted-publishers/ "npm: Trusted publishing and provenance"
