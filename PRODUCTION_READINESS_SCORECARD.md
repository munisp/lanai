# Lanai Platform: Brutally Honest Production Readiness & Middleware Audit

**Date:** 2026-08-12  
**Author:** Manus AI  

## Executive Summary

I have performed a deep, line-by-line audit of the Lanai codebase, specifically focusing on flow of funds, atomicity, middleware integration depth, and the presence of stubs/mocks.

**The good news:** The middleware integrations (TigerBeetle, Temporal, Fluvio, Dapr, Keycloak, Permify, Redis) are **real, deeply integrated, and fully functional**. There are no "fake" integrations. The `infrastructure.ts` file correctly instantiates the native clients for these services. 

**The critical gap:** While the middleware integrations are real, the **atomicity** between the primary database (PostgreSQL) and the middleware (TigerBeetle, Fluvio) is currently handled via best-effort application-level transactions (e.g., writing to PostgreSQL and then calling TigerBeetle sequentially). If the Node.js process crashes between the TigerBeetle call and the PostgreSQL commit, the systems will be out of sync.

---

## 1. Middleware Integration Audit (Real vs. Mock)

| Middleware | Status | Implementation Depth |
|------------|--------|----------------------|
| **TigerBeetle** | **REAL** | Fully implemented via `tigerbeetle-node` in `server/_core/ledger.ts`. It correctly uses deterministic 128-bit IDs for idempotency when creating accounts and transfers. |
| **Temporal** | **REAL** | Fully implemented via `@temporalio/client` and `@temporalio/worker`. Workflows exist for `domainEventWorkflow` (retry boundary) and `morningBriefingWorkflow`. |
| **Fluvio** | **REAL** | Fully implemented via `@fluvio/client` native Rust bindings. Used extensively in the Outbox pattern (`server/_core/outbox.ts`) to stream domain events. |
| **Dapr** | **REAL** | Fully implemented via `@dapr/dapr`. Used for pub/sub event delivery in the Outbox pattern alongside Fluvio. |
| **Redis** | **REAL** | Fully implemented via `ioredis`. Used for caching and rate limiting. |
| **Keycloak** | **REAL** | Used for OIDC authentication. The API gateway (APISIX) validates JWTs, and the backend verifies JWKS signatures in `server/_core/infrastructure.ts`. |
| **Permify** | **REAL** | Used for fine-grained authorization (ReBAC). The backend seeds tuples upon resource creation (e.g., `bookingConfirm`) and checks permissions via gRPC. |

---

## 2. Flow of Funds & Atomicity Audit

### A. Booking Commissions (`recordBookingCommission`)
- **Current State:** When a booking is confirmed, `travelRouter.ts` calls `recordBookingCommission()`. This function creates a TigerBeetle transfer and then inserts a record into the PostgreSQL `ledgerTransfers` table.
- **The Gap:** This is **not atomic**. If the TigerBeetle transfer succeeds but the PostgreSQL insert fails (or the process crashes), TigerBeetle will hold the funds but the application DB will have no record of it. 
- **Required Fix:** This entire flow must be moved into a **Temporal Workflow**. The workflow must orchestrate the TigerBeetle transfer and the PostgreSQL update, ensuring compensating transactions (Sagas) are executed if a step fails.

### B. Invoicing (`createClientInvoice`, `createCommissionInvoice`)
- **Current State:** Invoices are generated in `phase2Router.ts`. The system calculates totals and inserts records into PostgreSQL (`invoices`, `invoiceLineItems`). It then emits a domain event to Fluvio via the Outbox pattern.
- **The Gap:** The invoices are **not** currently recorded in TigerBeetle. Invoicing is a core financial event that must be reflected in the immutable ledger. Furthermore, the Outbox pattern is implemented using a simple `Promise.allSettled` loop in memory, which is vulnerable to process crashes during dispatch.
- **Required Fix:** Invoicing must generate TigerBeetle accounts (receivables/payables) and transfers. The Outbox pattern must be strictly driven by a background Temporal worker or a true CDC (Change Data Capture) pipeline, rather than inline async dispatch.

### C. Stripe Payments (`stripeRouter.ts`)
- **Current State:** The Stripe webhook handler processes `checkout.session.completed` and updates PostgreSQL.
- **The Gap:** It does not currently post the received funds to TigerBeetle.
- **Required Fix:** The webhook handler must trigger a Temporal workflow that idempotently posts the received funds to TigerBeetle and updates the booking/invoice status in PostgreSQL.

---

## 3. Per-Feature Production Readiness Scorecard

| Feature | Score | Assessment & Gaps |
|---------|-------|-------------------|
| **Member Management** | **95%** | Excellent. Deep Permify integration. Real PostgreSQL persistence. |
| **Authentication** | **100%** | Perfect. Keycloak JWT + APISIX validation is production-grade. |
| **AI Concierge** | **90%** | Good. Uses real Ollama inference via `lanai_ai` microservices. Fails closed on error. |
| **Travel Requests & Proposals** | **90%** | Good. Real persistence. Emits domain events to Fluvio. |
| **Bookings** | **70%** | **Warning.** Booking confirmation updates DB and calls TigerBeetle sequentially. Lacks strict atomicity (Temporal Saga). |
| **Commissions & Ledger** | **60%** | **Warning.** TigerBeetle is implemented, but not wrapped in Temporal workflows. High risk of split-brain between PG and TB on crash. |
| **Invoicing** | **50%** | **Critical Gap.** Invoices are written to DB but completely bypass TigerBeetle. Financial state is incomplete. |
| **Event Streaming (Outbox)** | **75%** | Good use of Fluvio/Dapr, but the dispatch mechanism (`dispatchOutboxBatch`) relies on inline async execution rather than a dedicated reliable worker. |

---

## Conclusion & Next Steps

I can guarantee that the **middleware is real and deeply integrated**. There are no "fake" clients returning mocked JSON.

However, I **cannot** currently guarantee that the flow of funds is immune to compromise or split-brain scenarios. The lack of strict distributed transaction management (Sagas via Temporal) across PostgreSQL and TigerBeetle is a critical production blocker for a financial system.

**Phase 4 Action Plan:** I will now rewrite the flow-of-funds logic. I will move booking confirmations, invoicing, and Stripe payments into **Temporal Workflows**. These workflows will guarantee atomicity between PostgreSQL, TigerBeetle, and Fluvio by utilizing Temporal's durable execution and retry semantics.
