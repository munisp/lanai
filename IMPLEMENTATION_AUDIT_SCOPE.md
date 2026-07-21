# Lanai Platform Implementation Audit Scope

## Objective

This audit treats a platform capability as **integrated** only when a real application path uses a configured, authenticated client or protocol; failure handling is explicit; its data contract is persisted or versioned where necessary; and automated verification covers the path. A Compose declaration, environment variable, mock, logging shim, or documentation claim alone does not qualify as an integration.

## Required Acceptance Criteria

| Area | Required evidence of completion |
|---|---|
| Keycloak | Browser and API authentication validate issuer, audience, signature, expiry, roles, and tenant claims through OIDC/JWKS; no legacy authentication provider is authoritative for protected production routes. |
| PostgreSQL | All durable domain entities have a normalized, migrated schema, referential constraints, indexes for observed query patterns, and a real repository path with no in-memory fallback. |
| TigerBeetle | Financial mutations use a real TigerBeetle client with idempotent transfer identifiers, account initialization, error mapping, and transaction records reconciled with PostgreSQL. |
| APISIX | Declarative routes match actual upstream ports and paths; authentication, rate limits, security controls, and webhook exceptions are tested against the running gateway configuration. |
| Permify | Authorization checks use a real schema, tenant-aware tuple writes, and checked permissions before sensitive reads or mutations. |
| Dapr | Services use configured state, pub/sub, secrets, and service invocation components through actual sidecars or supported APIs; a placement service alone is insufficient. |
| Open-source requirement | Runtime dependencies are open-source, self-hostable, and cloud-agnostic unless an external business API is explicitly necessary. |
| Temporal | Workflows and workers are registered, started, typed, retry-safe, and invoked by a production application path rather than only declared in infrastructure. |
| Redis | Cache, session, rate-limit, or job semantics are real, namespaced, authenticated, TTL-bound, and invalidate safely. |
| Lakehouse | An open-source ingestion, storage, catalog, and query path receives governed events from operational services and supports analytics/model-training data access. |
| OpenAppSec | WAF attachment is technically valid at the request-processing layer, policy is versioned, and protected-versus-exempt endpoints are tested. |
| Fluvio | Durable event schemas, producers, consumers, topic provisioning, idempotency, and dead-letter/error behavior are implemented and exercised. |
| Schemas | API request/response, event, workflow, authorization, and database contracts are complete, validated at boundaries, and versioned where compatibility matters. |
| Frontend | Every rendered route and interactive action resolves through typed API clients to a real backend path; empty/error/loading states are intentional and no display data is hard-coded. |
| AI | Inference is available through a CPU-capable local runtime with model readiness checks, controlled prompts, schema validation, timeouts, observability, and a real invocation path. |
| Quality | Builds, type checks, schema generation/migrations, unit/integration tests, configuration validation, and smoke tests all pass without reliance on mocks or placeholder behavior. |

## Audit Method

The audit proceeds from source and deployment manifests to runtime interfaces, then from interface callers to persistent contracts. Every placeholder, mock, static fixture, in-memory store, nonfunctional configuration reference, unregistered router, and route mismatch is tracked as a defect. Fixes must remove or isolate development-only behavior behind explicit test adapters; production code must fail safely when a mandatory dependency is unavailable.

## Scope Boundaries

External commercial systems such as payment processors, CRM platforms, or communications providers can remain external integrations when their credentials and remote service availability are necessarily environment-specific. The application code, contract validation, error behavior, and configuration must nevertheless be complete. Actual production credentials, domains, and third-party accounts cannot be fabricated during this audit.
