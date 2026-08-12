# Permify gRPC Validation and Dependabot Triage

**Repository:** `munisp/lanai`  
**Author:** Manus AI  
**Scope:** Live fine-grained authorization validation and review of the ten Dependabot pull requests open at the time of review.

## Executive Result

A real **Permify v1.7.2** gRPC service was started against the local PostgreSQL integration database, the Lanai authorization schema was applied, and the sequential integration suite completed with **234 passing tests and 4 intentionally skipped external-provider tests**. The suite exercised real policy checks, including expected denials for Gold access to the Platinum document vault, advisor/senior-advisor access to audit logs, advisor/senior-advisor role changes, and non-admin revenue analytics access.

The first live run uncovered two genuine integration defects. The fixes are included in this change set:

| Defect | Effect | Repair |
|---|---|---|
| Empty runtime schema version | Permify returned `ERROR_CODE_SCHEMA_NOT_FOUND`; the adapter treated it as a denial. | The integration adapter now maintains the schema version returned by a successful `schema.write` and uses that active value for subsequent tuple writes and permission checks. |
| Test reset truncated Permify control-plane tables | Each app-data reset erased `tenants`, `schema_definitions`, and `relation_tuples`, causing all later authorization decisions to deny. | The integration harness now preserves Permify-owned tables while resetting application data. |

> **Policy-enforcement result:** The test suite now proves both **allow** and **deny** decisions against a live gRPC authorization server. It is no longer a mocked Permify assertion.

## Live Permify Test Evidence

| Verification | Result |
|---|---:|
| Permify server | v1.7.2; gRPC on `127.0.0.1:3478`; health endpoint returned `SERVING` |
| Schema bootstrap | `config/permify/schema.perm` written to tenant `lanai-test` |
| Live authorization suite | **2 test files passed** |
| Access-control scenarios | **234 passed**, including positive and negative policy decisions |
| External-provider scenarios | **4 skipped** by design because they require separately configured Stripe/CRM services |
| TypeScript after repair | **0 errors** |

The test harness is deliberately sequential because it resets test data between cases and performs real gRPC policy calls. The local service used PostgreSQL rather than an in-memory authorization backend.

## Dependabot Review Summary

All ten PRs modify only `lanai-portal/package.json` and `pnpm-lock.yaml`. At review time, every branch was based on commit `560476b`, while current `main` includes later security and integration work. None had CI checks reported. They should therefore be **rebased/recreated before merging**, rather than merged as stale branches that would conflict with newer production hardening.

A consolidated, isolated compatibility workspace applied the ten target update families together. It passed TypeScript checking, the deterministic test suite, and the production build. Package-manager resolution selected the latest versions within the requested ranges in several cases, which provides a stronger compatibility signal but is **not** a substitute for a refreshed Dependabot lockfile and CI run on each rebased PR.

| PR | Update | Review decision | Rationale |
|---:|---|---|---|
| #37 | `express-rate-limit` 8.6.0 → 8.6.1; `jose` 6.2.4 → 6.2.5 | **Rebase, then merge first** | Security-oriented patch group; compatible in the consolidated validation. It does not resolve every transitive audit finding. |
| #38 | `@vitejs/plugin-react` 6.0.3 → 6.0.5; `tsx` 4.23.1 → 4.23.10; `vite` 8.1.5 → 8.2.1 | **Rebase, then merge** | Patch-level build-tooling updates; combined build passed. Existing `@builder.io/vite-plugin-jsx-loc` peer-range warning for Vite 8 must remain monitored. |
| #35 | `@types/google.maps` 3.65.2 → 3.65.3 | **Rebase, then merge** | Type-only patch; TypeScript validation passed. |
| #34 | `framer-motion` 12.23.22 → 12.42.2 | **Rebase, then merge with UI smoke check** | Minor update; build and deterministic tests passed. Validate animation-heavy pages visually in staging. |
| #33 | `@tailwindcss/vite` 4.1.14 → 4.3.3 | **Rebase, then merge** | Build passed; review generated CSS and the existing Vite peer warning in CI. |
| #32 | `@aws-sdk/s3-request-presigner` 3.1076.0 → 3.1095.0 | **Rebase, then merge with storage contract test** | Compatible with the candidate build. Validate signed upload/download behavior in a real S3-compatible staging bucket. |
| #31 | `nanoid` 5.1.6 → 6.0.0 | **Rebase, stage before merge** | Major-version update. Lanai directly imports Nanoid in routing, AI, Vite, and outbox paths; type/build tests passed but a staging smoke run is appropriate. It does not fix the remaining transitive Nanoid advisory under Temporal/webpack. |
| #30 | `axios` 1.12.0 → 1.18.1 | **Rebase, then merge or remove after ownership check** | No direct TypeScript import was found in the audited source tree. It is low operational risk, but package ownership should decide whether to retain an unused dependency. |
| #29 | `wouter` 3.7.1 → 3.10.0 | **Rebase, stage before merge** | Core client routing dependency. Type/build validation passed; execute portal navigation smoke checks in staging before production promotion. |
| #26 | 26 Radix UI packages | **Rebase, then merge with UI smoke check** | Coordinated compatible patch/minor group; build passed. Test dialog, select, popover, tabs, and mobile focus behavior in staging. |

## Dependency Audit Context

The consolidated candidate’s production audit reported **0 critical, 8 high, 14 moderate, and 3 low** findings. The reviewed PRs do **not** eliminate all high findings because several are transitive dependencies outside the ten update scopes. Examples include `postcss` under Temporal’s Webpack toolchain, `path-to-regexp` and `ip-address` in transitive chains, `form-data`, `fast-uri`, Lodash, and an older transitive Nanoid version.

Accordingly, approving the ten Dependabot PRs is reasonable after refresh and CI, but it must not be represented as a complete vulnerability remediation. A separate dependency-remediation backlog should upgrade or replace the relevant parent dependencies (`@dapr/dapr`, `@temporalio/worker`, and their affected subtrees) using targeted compatibility testing.

## Recommended Merge Order

1. Recreate/rebase **#37** and run CI; merge the security patch group first.
2. Recreate/rebase **#35**, **#38**, **#33**, and **#32**; merge after CI and the specified contract checks.
3. Recreate/rebase **#34**, **#26**, **#29**, and **#31**; merge only after staging UI/navigation smoke coverage.
4. Resolve ownership of **#30**; either merge it after refresh or remove Axios if it is confirmed unused.

No PR was merged, approved, commented on, or closed during this review. Those operations are deliberately left to the repository owner’s change-control process.

## Deployment Gate

For every deployed environment, bootstrap Permify before accepting authenticated traffic and make the resulting schema version available to the running authorization adapter. The runtime code now captures the version returned by `schema.write`; a deployment that uses a pre-applied schema should configure `PERMIFY_SCHEMA_VERSION` explicitly until its own bootstrap step records the active version.
