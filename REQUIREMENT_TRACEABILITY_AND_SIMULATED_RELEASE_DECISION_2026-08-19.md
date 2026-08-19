# Lanai Requirement Traceability and Simulated Release Decision

**Assessment date:** 2026-08-19 EDT  
**Revision assessed:** Working-tree candidate after durable Chatwoot inbound webhook completion  
**Decision:** **Implementation-complete under the stated infrastructure assumption; not production-certified until real staged evidence is retained.**

## Decision in plain terms

All requirements retained in the initial handoff, portal TODO, stakeholder feedback implementation, technical audit scope, and version-controlled feature claims have a repository implementation path, data contract, and automated local or simulated evidence. The final repository-controlled communication gap—a signed, replay-safe Chatwoot inbound receiver—has now been implemented with migration `0010_chatwoot_webhook_events.sql` and automated raw-body HMAC/replay tests.

The conclusion is deliberately conditional. Assuming the named external services are provisioned correctly in another environment, the code can be deployed and its release procedures can be executed. That assumption cannot convert simulated local tests into proof that a real Keycloak realm, APISIX route, TigerBeetle cluster, external CRM, Stripe test workspace, Chatwoot account, or Kubernetes CNI policy behaves correctly. Therefore the release candidate is **code-complete and simulation-validated**, but not yet **production-certified**.

## Business and stakeholder requirement traceability

| Requirement group | Implementation and durable contract | Simulated evidence | Status |
|---|---|---|---|
| Luxury membership and 5-layer member profiles | PostgreSQL member, preference, family, contact, tier, privacy, and history tables; typed tRPC procedures; member isolation | `smoke.test.ts`, `smoke.phase2.test.ts` | Implemented |
| Membership, travel, events, and lifestyle requests | Normalized request, booking, supplier, proposal, task, document, and communication models with role-aware workflows | Full lifecycle smoke tests | Implemented |
| Supplier visibility and pricing enquiries | Supplier and partner records, services, pricing/request paths, proposal items, and commission associations | Phase-2 supplier and proposal scenarios | Implemented |
| Client and supplier commission invoicing | Distinct invoice streams, invoice lines, payment states, commission entries, Stripe webhook-to-payment path, and financial workflow triggers | Invoice/payment and financial atomicity regressions | Implemented |
| Operational dashboard and revenue analytics | Daily revenue snapshots, category analysis, membership-fee aggregation, booking values, and typed dashboard queries | Dashboard smoke scenarios | Implemented |
| Premium proposals and tiered commercial visibility | Proposal, proposal-item, pricing-tier, approval, itinerary, margin, and commission models with advisor workflows | Proposal and booking lifecycle smoke scenarios | Implemented |
| Concierge task templates | Airport, villa, yacht, restaurant, celebration, visa, and booking-stage task models with automation keys | Phase-2 task/experience smoke scenarios | Implemented |
| Unified communications | Local durable communication timeline, Chatwoot mirror, secure Meta/WhatsApp bridge, advisor/member authorization, and auditable AI draft-only assistance | Chatwoot, WhatsApp bridge, consumer, and webhook regressions | Implemented in code |
| Personalisation and AI concierge | Local AI gateway/pillars, bounded prompts, structured outputs, preference/history-aware routes, inference audit records, and fail-explicit adapters | Gateway contract, fixture, and AI smoke scenarios | Implemented in code |
| Experience management | Celebration and anniversary tracking, welcome gifts, VIP amenities, post-trip follow-up, feedback/NPS, and campaign data/workflows | Phase-2 experience-management smoke scenarios | Implemented |
| Chatwoot concierge use cases | Server-side credential custody, contacts, inboxes, full message mirror, advisor/member access, AI drafts, signed inbound delivery, and a twenty-use-case activation matrix | `chatwootWebhook.test.ts`; Chatwoot service/router coverage | Implemented in code; channel activation external |

## Technical and middleware traceability

| Required component | Production code path | Safety/contract controls | Simulated evidence |
|---|---|---|---|
| PostgreSQL and Drizzle | Versioned migrations `0000`–`0010`, typed schema, transactional routers and workers | Constraints, unique identities, checks, foreign keys, locks, indexes | Fresh migration and full suite |
| Keycloak | OIDC/JWKS verification and identity synchronization | Issuer, audience, expiry, role, and tenant claim validation | Gateway and authentication tests with local controls |
| Permify | Schema, tuple and checked-permission client paths | Deny-by-default protected procedures | Live local Permify regression coverage |
| APISIX and Caddy | Declarative gateway configuration, service routes, public-path controls | No public AI route; webhook routes remain activation-gated | Configuration and route-security validation |
| Dapr, Fluvio, Redis, Lakehouse | Native client adapters and durable outbox dispatch paths | Idempotency, retries, dead-letter controls, namespaced service contracts | Provider fixture and outbox regressions |
| Temporal and TigerBeetle | Financial saga workers/activities and native ledger transfer client | Deterministic transfer identities, pending/post/void compensation, PostgreSQL mirrors | Financial atomicity and chaos regression scenarios |
| OpenAppSec | Versioned deployment/health and protected gateway topology | Policy attachment and restricted request paths | Configuration validation; real WAF evidence pending |
| Chatwoot and Meta webhooks | Raw-body HMAC receivers and durable deduplicated event records | Constant-time signature checks, timestamp windows, replay uniqueness, no direct sensitive side effect on intake | Bridge and Chatwoot webhook regressions |
| Prometheus and Grafana | Dedicated metrics services, alerts, dashboards, and operational replay API | Payload-free labels/series, monitoring-only network access, audited replay | Metrics and operations-router regressions |

## Final repository-controlled completion work

The following gap was found during this reconciliation and closed in this revision.

| Gap | Implemented remediation |
|---|---|
| Chatwoot inbound delivery was pull-only and did not provide signed real-time synchronization | Added `server/chatwootWebhook.ts`, raw-body timestamped HMAC verification, constant-time comparison, five-minute replay window, durable delivery record, local conversation/message projection, migration `0010_chatwoot_webhook_events.sql`, typed schema, environment contract, and raw signature/replay/conflicting-delivery tests. |

The receiver persists one delivery fingerprint before projection. Exact retries are acknowledged without duplicate records; invalid signatures and stale timestamps are rejected before any database write. It remains unexposed through APISIX until a Chatwoot staging account, secret, narrow route, raw-body preservation proof, and CNI controls are available.

## Simulated release evidence

| Validation | Result |
|---|---:|
| Fresh PostgreSQL migration history through `0010` | Passed |
| TypeScript compilation | 0 errors |
| Provider-enabled TypeScript regression | 296/296 tests passed across 19 files |
| Python AI, WhatsApp bridge, consumer, multiprocess, metrics, and gateway contracts | 21/21 tests passed |
| Supply-chain/configuration assurance | 38/38 controls passed |
| Feature-claim structural validation | 7/7 claims passed |
| New Chatwoot raw-body HMAC, exact-replay, and conflicting-delivery regression | 3/3 tests passed |
| Diff and configuration hygiene | Passed |

Local provider fixtures simulate Stripe, CRM, and AI gateway behavior, including authenticated requests, idempotency, rate limits, and transient errors. They are test-only adapters. Production paths fail explicitly if their required provider configuration is unavailable.

## Remaining production certification gates

| Gate | Why simulation cannot replace it |
|---|---|
| Kubernetes admission and CNI enforcement | Requires an operator-provided cluster, real namespace labels, RBAC, policy engine, and network implementation. |
| Keycloak → APISIX → Permify smoke | Requires real TLS, issuer/JWKS, service account, client secret, and policy tuples. |
| TigerBeetle/Temporal/Fluvio financial evidence | Requires isolated real services, immutable images, retained reconciliation artifacts, and the approved soak runner. |
| External provider workspaces | Requires test-only Stripe, Twenty CRM, Resend, Meta/WhatsApp, and Chatwoot credentials plus registered webhook destinations. |
| Container image build and vulnerability evidence | Requires a remote CI image build, signed digest, image scan, and retained artifacts for the exact revision. |
| Public webhook route activation | Requires secret-manager provisioning, raw-body preservation proof through APISIX/OpenAppSec, replay/security results, consumer health, and approval. |

> **Certification rule:** Do not label this platform production-certified merely because infrastructure is assumed to exist. Mark it production-certified only after the listed gates are run successfully against the immutable release revision and their evidence is retained.

## Release recommendation

Under the requested assumption that all services are available and correctly configured in another environment, this revision is ready to enter the staging deployment and evidence-collection process. There are no known unimplemented repository-controlled requirements in the identified initial business, technical, stakeholder, communication, finance, or operational scope. The remaining work is environment provisioning, deployment, provider onboarding, and empirical release evidence—not further feature coding.
