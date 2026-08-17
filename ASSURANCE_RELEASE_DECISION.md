# Mission-Critical Code Assurance Release Decision

**Assessment date:** 2026-08-17 EDT
**Disposition:** **NOT RELEASEABLE — external evidence pending.**
**Scope:** The current `main` remediation candidate and its repository-controlled validation evidence.

> This decision distinguishes code and control implementation from live-environment certification. A passing local build, deterministic fixture suite, or configuration scan does not substitute for real staging, identity-provider, financial-ledger, or provider-sandbox evidence.

## Current Gate Summary

| Gate | Result | Current evidence | Decision |
|---|---|---|---|
| Supply-chain resolution | Pass | Fresh 952-entry lock resolution under seven-day maturity, no-downgrade trust, and exotic-source blocking controls | Repository control closed |
| Frozen installation | Pass | pnpm 11.20.0 install with explicit build allowlist | Repository control closed |
| TypeScript and production build | Pass | 0 TypeScript errors; portal/server/worker/migration artifacts emitted | Repository control closed |
| Full local provider-enabled regression | Pass | 16 files, 290 tests, 0 failed, 0 skipped; fresh PostgreSQL and live local Permify | Local implementation evidence complete |
| Production dependency audit | Pass | No known production vulnerabilities at HIGH threshold | Repository control closed |
| Kubernetes configuration scan | Pass | Trivy configuration scan: 0 HIGH/CRITICAL findings | Repository control closed |
| CI, nightly, and protected external test automation | Implemented | Tracked workflow definitions and structural validation exist | Requires GitHub environment activation and successful remote runs |
| Docker image build and image scan | Pending external runner | Local validator has no Docker CLI; CI/nightly workflow is configured for workspace-root build and scan | Requires remote CI evidence |
| Keycloak → APISIX → Permify live smoke | Pending staging | Fail-closed smoke Job and staging gate script are committed | Requires cluster, secret, role, and TLS evidence |
| Live Stripe and Twenty test workspace | Pending protected environment | Test launcher rejects live Stripe keys and protected workflow is committed | Requires test-only credentials and a reviewed environment |
| Real financial workflow / reconciliation / soak | Pending staging | Signed-digest, fail-closed runner and evidence controls are committed | Requires isolated service endpoints and retained evidence |

## Closed Repository Findings

The current remediation resolved package-manager drift and the `pnpm@10.34.5` trust downgrade by moving to trusted `pnpm@11.20.0`. It removes the need for an unapproved Resend exception by pinning the trusted-publisher `resend@6.18.0` release, enables `blockExoticSubdeps`, and replaces pnpm 10 build settings with an explicit pnpm 11 `allowBuilds` policy. The Docker image now builds from the workspace root and canonical lockfile, avoiding the previous subdirectory-lock ambiguity.

GitHub Actions definitions are no longer ignored by Git. The tracked CI uses deterministic local provider fixtures plus PostgreSQL and live local Permify; the separate protected external workflow runs only from `main`, schedule, or manual dispatch when a protected environment explicitly enables it. The external launcher fails before any provider call if it sees a live or malformed Stripe key.

## Critical External Closure Conditions

1. A platform operator must provide a restricted staging kubeconfig, correct namespace labels, and permission for server-side admission, smoke Job, and isolated financial evidence Job execution.
2. The staging Keycloak service account must be provisioned in `lanai-secrets` with `KEYCLOAK_SMOKE_CLIENT_SECRET`, a restricted Keycloak role, and the matching Permify relationship. Permify must present a trusted TLS endpoint.
3. The GitHub `external-integration` environment must be protected for `main`, maintainer-approved, and supplied only with test-only Twenty and Stripe credentials plus a sandbox price identifier.
4. A signed immutable financial-runner image and isolated TigerBeetle, Temporal, PostgreSQL, Fluvio, Dapr, and Lakehouse endpoints must be supplied before the live funds-flow evidence runner and 24-hour soak may execute.
5. Remote CI must retain successful Docker build, image scan, external-provider, staging smoke, and financial-reconciliation artifacts for the exact release revision.

## Certification Statement

The repository is **implementation-ready and locally validated** for the controls described in `PRODUCTION_READINESS_REMEDIATION_2026-08-17.md`. It is **not yet production-certified** because the external evidence conditions above are deliberately unresolved rather than mocked or skipped. Once those conditions are executed successfully on an immutable release revision, this decision may be reissued as releaseable.
