# Silent Mockware Audit and Remediation

**Repository:** `munisp/lanai`  
**Audit scope:** Production-reachable code paths that could return plausible-looking success, empty data, or a benign status without performing or verifying the intended persistence, provider call, payment action, AI generation, or synchronization.  
**Author:** Manus AI

> **Definition.** “Silent mockware” is any runtime behavior that makes an unavailable, failed, unimplemented, or local-only operation appear to have completed successfully. It is distinct from explicit test doubles that are confined to test files and named as such.

## Synchronization Baseline

The local checkout was recreated directly from the current `origin/main` branch before remediation. The resulting checkout had no local/remote divergence at the start of this audit. A preserved, non-Git restored workspace was retained separately and was **not** overlaid onto the fresh GitHub checkout, preventing stale local code from accidentally replacing newer remote work.

## Findings and Repairs

| Area | Dangerous previous behavior | Production-safe repair | Verification |
|---|---|---|---|
| Member document vault | The Platinum member route always returned an empty document array despite a persisted `documents` table. | The route now queries the database using both the authenticated member ID and `isVisibleToMember = true`, and returns persisted metadata only. Database failures propagate rather than being rendered as an empty vault. | Static regression test; deterministic suite |
| Chatwoot configuration | Configuration initialization/persistence errors were swallowed while the mutation returned `success: true`. | Configuration writes now require a persisted record. When enabled, a real Chatwoot API test must succeed before the mutation reports success. | Static regression test |
| Chatwoot synchronization | The “sync” mutation returned the count of locally stored rows without contacting Chatwoot. | The route now invokes the remote synchronization routine and returns the actual number of remote conversations mirrored. | Static regression test |
| Chatwoot AI drafting | The route returned a polished hard-coded reply labeled as an AI draft. | The route now calls the configured AI gateway with conversation context and fails explicitly when the gateway is unavailable or invalid. It never auto-sends the generated text. | Static regression test |
| Chatwoot message mirroring | Remote create/send responses could omit identifiers; local helpers returned `0`, creating plausible but invalid records. | Remote conversation/message IDs are validated as positive integers. Database helpers throw if PostgreSQL does not return a persisted ID. A unique index prevents duplicate mirrored Chatwoot message IDs. | Regression test; migration applied locally |
| Chatwoot access token exposure | The configuration query returned the stored Chatwoot access token to authenticated advisors and rendered it in the UI. | The API now returns only `hasAccessToken`; the UI preserves an existing secret when its input is blank and only rotates it when a new value is supplied. | Static regression test; TypeScript check |
| Stripe catalog pricing | Production could dynamically create Stripe catalog prices from embedded plan values when a configured price ID was absent. | Production checkout now rejects the request unless the approved `STRIPE_PRICE_ID_<TIER>` exists. Dynamic catalog creation is limited to non-production environments. | Static regression test; provider contract suite |
| Stripe subscription lookup | Any Stripe retrieval failure was reported as an inactive/no-subscription state. | Provider failures now propagate as explicit lookup errors; only a member with no stored subscription ID receives the legitimate inactive result. | Static regression test |
| Stripe webhooks | The HTTP handler acknowledged signed events before asynchronous persistence completed; handler failures were logged and swallowed. | The handler now awaits durable processing and returns HTTP 500 on a persistence failure so Stripe retries. Member updates verify exactly one affected row. | Static regression test; provider contract suite |
| Member CRM request | A CRM response without an opportunity ID was returned as `{ opportunityId: undefined }`; a missing CRM URL used a localhost default. | The handler now requires both CRM URL and token, and rejects a response that omits the remote identifier. | Deterministic suite |
| Settings UI | Static `localhost` cards displayed several services as “online” without performing health checks. | Static health claims were removed. The page now states that only verified integration responses may be presented as live status. | Static regression test; production build |

## Database Migration

Migration `lanai-portal/drizzle/0004_ambitious_luckman.sql` creates:

```sql
CREATE UNIQUE INDEX "chatwoot_msg_chatwootId_uq"
ON "chatwoot_messages" USING btree ("chatwootId");
```

The migration was applied to the local PostgreSQL validation database and the expected index was verified.

## Test Interpretation

The repository intentionally contains mocks in test files, including the legacy smoke suite. Those test doubles are not production runtime code. They remain appropriate for isolated unit coverage, but they must not be treated as proof that external providers are live.

| Verification tier | Result | Scope |
|---|---:|---|
| TypeScript static check | **Pass** | `tsc --noEmit` |
| Production build | **Pass** | Client bundle and server/workflow artifacts |
| Deterministic tests | **21 passed** | Unit, auth, provider-contract, and anti-silent-mock regression coverage |
| Provider-contract tests | **10 passed, 1 skipped** | CRM, Twenty CRM, Stripe request/response contracts; Stripe mock-server test requires its opt-in fixture |
| New anti-silent-mock regression tests | **7 passed** | Guards for document stub removal, Chatwoot config/sync/AI/mirroring/token safety, Stripe failure semantics, and settings claims |
| Schema migration validation | **Pass** | PostgreSQL migration plus index verification |

The optional end-to-end integration suite requires a running Permify gRPC service and is intentionally configured to fail early when that dependency is absent. It was not misrepresented as a pass in this audit. Before deployment, run `pnpm test:integration` from the deployment environment after the compose or Kubernetes stack is healthy.

## Remaining Operational Requirements

The repaired code now fails closed, but production readiness still depends on real credentials and reachable providers. The deployment must supply and health-check PostgreSQL, Keycloak, Redis, Permify, TigerBeetle, Temporal, Fluvio, Dapr, APISIX/OpenAppSec, the lakehouse ingestion endpoint, Chatwoot, the AI gateway, and Stripe as applicable. Missing or unavailable services should produce explicit errors or durable retry state; they must not be represented as successful user actions.

> **Deployment gate:** Apply the new migration, configure approved Stripe Price IDs for each enabled membership tier, configure Chatwoot with a verified HTTPS endpoint and access token, and run the live integration suite before enabling public traffic.

## Guardrail Policy

1. Runtime adapters must validate provider response identifiers before local state is updated.
2. Database mutations that create externally referenced records must return and validate persisted IDs.
3. A disabled or unconfigured integration must return an explicit unavailable/error state, not a placeholder result.
4. Test mocks must remain confined to `*.test.ts`/`*.spec.ts` files and must not be described as live-provider validation.
5. External webhooks must acknowledge only after their durable local effect succeeds, or return a retryable failure.
6. User interfaces must not show static assumptions, hostnames, or saved configuration as verified service health.

## Files Changed

- `lanai-portal/server/routers.ts`
- `lanai-portal/server/chatwootRouter.ts`
- `lanai-portal/server/chatwootService.ts`
- `lanai-portal/server/db.ts`
- `lanai-portal/server/stripeRouter.ts`
- `lanai-portal/server/stripeProducts.ts`
- `lanai-portal/client/src/pages/SettingsPage.tsx`
- `lanai-portal/client/src/pages/ChatwootInboxPage.tsx`
- `lanai-portal/drizzle/schema.ts`
- `lanai-portal/drizzle/0004_ambitious_luckman.sql`
- `lanai-portal/drizzle/meta/0004_snapshot.json`
- `lanai-portal/server/silentMockwareRegression.test.ts`

This document is a remediation record, not a substitute for the deployment gate above.
