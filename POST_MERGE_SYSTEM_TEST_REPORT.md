# Post-Merge System Test Report

**Repository:** `munisp/lanai`
**Validated main revision:** `9f94bfe` — `fix: harden post-merge runtime compatibility`
**Validation date:** 2026-07-21
**Scope:** Post-merge source, build, frontend, server, middleware, AI, schema, and deployment-topology validation.

## Executive Result

The post-merge validation identified and repaired five reproducible runtime regressions introduced or exposed by the merged dependency upgrades. The corrected main branch now passes locked dependency installation, TypeScript checking, production builds, migration consistency checks, focused authentication tests, production frontend route smoke tests, server middleware contract smoke tests, deployment topology validation, and CPU AI gateway contract tests.

A complete live end-to-end run of the 29-service stack could not be executed in this sandbox because no Docker CLI or daemon is available, and there is no reachable PostgreSQL, Keycloak, Redis, Temporal, Fluvio, TigerBeetle, Permify, Dapr, or local Ollama runtime. The platform is configured to fail closed when those dependencies are unavailable; that behavior was explicitly verified. The legacy all-in-one mocked smoke suites remain incompatible with the deliberate removal of null-database and unconfigured-CRM fallbacks, so the broad `pnpm test` command is not a release gate until those suites are replaced with real Compose-backed integration tests.

## Regressions Repaired

| Area | Reproducible failure | Remediation | Validation result |
|---|---|---|---|
| Cookie v2 compatibility | The merged `cookie@2.0.1` package no longer provided the legacy `parse` runtime export, causing server startup failure. | Replaced dependency-specific parsing with a strict local `Cookie` header parser in the advisor session SDK. | Server starts in development mode; protected AI and tRPC routes return `401` without a session. |
| Fluvio runtime loading | `@fluvio/client@0.14.9` publishes a missing JavaScript main entrypoint, causing eager module loading to crash the portal before startup. | Replaced eager package-main loading with a lazy, platform-native Fluvio binding loader that fails explicitly when streaming is invoked on an unsupported or invalid runtime. | Portal starts successfully without a configured Fluvio endpoint; topology and TypeScript checks pass. |
| Express v5 route syntax | Bare `*` paths in Vite/static fallbacks fail under `path-to-regexp@8`, preventing startup. | Replaced wildcard path registrations with all-path middleware registrations compatible with Express v5. | Development server serves the React shell; all tested SPA routes resolve. |
| Divergent server entry points | The alternate `server/index.ts` retained an outdated server implementation with the invalid Express wildcard and omitted canonical platform wiring. | Replaced it with a backward-compatible forwarder to the canonical `_core/index.ts` bootstrap. | The alternate entry point starts and exposes the canonical health behavior. |
| Stripe webhook unconfigured behavior | An unsigned webhook request with Stripe secrets absent produced a `500` internal error. | Added explicit `503` configuration failure and `400` missing-signature rejection before Stripe event construction. | Server contract smoke test passes webhook fail-closed validation. |

## Passed Validation Evidence

| Validation | Result | Evidence |
|---|---:|---|
| Locked dependency install | Pass | `pnpm@10.4.1 install --frozen-lockfile` completed successfully. |
| TypeScript | Pass | `tsc --noEmit` completed successfully after all repairs. |
| Production bundle | Pass | Vite client build and server, Temporal worker, migration, and Permify bootstrap bundles completed successfully. |
| Drizzle migration consistency | Pass | `drizzle-kit check --config=drizzle.config.ts` reported `Everything's fine`. |
| Focused auth tests | Pass | 4/4 tests in `auth.logout.test.ts` and `auth.member.test.ts` passed. |
| Server contract smoke test | Pass | Verified React shell serving, `503` fail-closed health without PostgreSQL, `401` protection for AI and tRPC endpoints, permitted CORS preflight, and webhook rejection behavior. |
| Frontend route smoke test | Pass | 28 representative advisor and member SPA routes returned the application shell from the production frontend preview. |
| Alternate server entry point | Pass | `server/index.ts` forwarded to the canonical bootstrap and exposed the expected fail-closed health response. |
| Deployment topology | Pass | `tools/validate_topology.py` validated 29 declared services, Compose dependencies, Caddy upstreams, and structured gateway/Dapr/WAF configuration. |
| CPU AI gateway contracts | Pass | `lanai_ai/gateway/test_contract.py` passed 3/3 tests. |
| Python service syntax | Pass | AI gateway and lakehouse ingestion Python modules compiled successfully. |
| Production configuration enforcement | Pass | Production startup rejects missing required settings and, once supplied synthetically, refuses startup on unavailable PostgreSQL rather than running degraded. |

## Full Test-Suite Status

The broad `pnpm test` command currently reports **46 passed, 6 skipped, and 192 failed tests** across five test files. The failures are concentrated in `smoke.test.ts` and `smoke.phase2.test.ts`, which retain an old test harness that mocks `getDb()` as `null` and invokes CRM-dependent flows without configuring Twenty CRM. Those tests previously relied on the exact in-memory, null-database, and silent CRM fallback behavior that was intentionally removed from production code.

> This is a test-fixture debt item, not a reason to restore nonpersistent production fallbacks. The correct remediation is to replace the legacy mocks with a disposable PostgreSQL and configured service stack, ideally started through Compose in CI, and to use real seeded data for CRM, identity, authorization, ledger, workflow, streaming, and AI contract tests.

## Environment-Bounded Items

| Item | Status in this sandbox | Required acceptance environment |
|---|---|---|
| Full 29-service Compose run | Not executable | Docker CLI/daemon plus Compose images and non-production environment secrets. |
| PostgreSQL migrations against live database | Static consistency only | PostgreSQL service started from the checked-in topology. |
| Keycloak authorization-code login | Contract and middleware only | Keycloak realm, credentials, redirect URI, and browser callback domain. |
| Permify enforcement | Configuration and middleware only | Permify schema bootstrap and reachable gRPC service. |
| TigerBeetle transfers | Adapter and topology only | Formatted TigerBeetle replica and seeded ledger accounts. |
| Redis/Dapr/Temporal/Fluvio delivery | Adapter and topology only | Running service mesh, workflow worker, cache, and stream broker. |
| Twenty CRM, Chatwoot, Resend, Stripe | Fail-closed contracts only | Test tenants and non-production credentials/webhook signing secrets. |
| CPU model inference | Gateway contracts only | Reachable CPU Ollama runtime with the configured model pulled. |
| Lakehouse ingest | Configuration and Python compilation only | Running MinIO, Nessie, Trino, and ingestion service. |

## Recommended Release Gate

The release gate should require the checks that passed above, followed by a Compose-backed integration stage that runs migrations, boots all declared services, seeds non-production identities and records, executes advisor and member browser journeys, and verifies durable outbox delivery through Fluvio, Dapr, Temporal, and the lakehouse. The legacy mocked smoke suites should be replaced rather than re-enabled with null-database fallback behavior.

## Delivered Changes

The repaired runtime compatibility and reusable smoke harnesses were committed and pushed to `main` in commit [`9f94bfe`](https://github.com/munisp/lanai/commit/9f94bfe). The repository remains configured for fail-closed production dependency behavior and contains the reusable `tools/server_contract_smoke_test.sh` and `tools/frontend_smoke_test.sh` checks for future post-merge validation.
