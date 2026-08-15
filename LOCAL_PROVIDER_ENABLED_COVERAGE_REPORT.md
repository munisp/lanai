# Local Provider-Enabled Coverage Report

**Repository:** `munisp/lanai`  
**Scope:** deterministic local Stripe, Twenty CRM, and AI-gateway provider fixtures, exercised alongside a real local PostgreSQL database and a real local Permify gRPC service.  
**Run date:** 2026-08-15 (EDT)  
**Revision under test:** `7a86358` prior to this report-only commit.

## Executive Result

The complete provider-enabled regression command completed successfully. TypeScript compilation completed with **zero errors**; all **16 test files** passed; all **290 tests** passed; and there were **zero failures and zero skipped tests**. The Vitest execution took **355.15 seconds**, with **341.08 seconds** spent in tests. The test run used a newly created PostgreSQL database (`lanai_provider_coverage_final`) and the configured local Permify gRPC instance, rather than an in-memory database or authorization substitute. [1] [2]

| Outcome | Count | Status |
|---|---:|---|
| TypeScript compilation errors | 0 | Passed |
| Test files | 16 / 16 | Passed |
| Tests | 290 / 290 | Passed |
| Failed tests | 0 | Passed |
| Skipped tests | 0 | Passed |
| Test execution duration | 355.15 s | Completed |

> The local fixtures are **test-only loopback HTTP services**. They are enabled only by `RUN_LOCAL_PROVIDER_TESTS=1`; production code continues to require real provider configuration and does not silently fall back to the fixtures. [1]

## Reproducible Command and Test Environment

```bash
sudo -u postgres dropdb --if-exists lanai_provider_coverage_final
sudo -u postgres createdb -O lanai lanai_provider_coverage_final

cd lanai-portal
export DATABASE_URL='postgresql://lanai:lanai_password@localhost:5432/lanai_provider_coverage_final'
export PERMIFY_GRPC_ADDRESS='127.0.0.1:3478'
export PERMIFY_TENANT_ID='lanai-test'
export PERMIFY_INSECURE='true'
export PERMIFY_SCHEMA_FILE='/home/ubuntu/lanai/config/permify/schema.perm'
export RUN_LOCAL_PROVIDER_TESTS=1
export STRIPE_SECRET_KEY='sk_test_local_provider'
export STRIPE_PRICE_ID_PLATINUM='price_local_provider'

pnpm check
pnpm vitest run --pool=forks --fileParallelism=false --maxWorkers=1
```

The controlled environment runs test files serially in isolated forked workers. This avoids accidental cross-test contamination of the fixture’s mutable failure queue and idempotency-response map, while preserving real PostgreSQL and Permify integration coverage.

## Complete Regression Coverage Matrix

| Test file | Tests | Primary coverage |
|---|---:|---|
| `server/smoke.test.ts` | 151 | End-to-end stakeholder scenarios, service integrations, payments, and lifecycle controls |
| `server/smoke.phase2.test.ts` | 87 | Member-profile, invoicing, communications, supplier, celebration, NPS, and AI-concierge workflows |
| `server/stripe.external.test.ts` | 4 | Stripe SDK flows through the local Stripe fixture |
| `server/test/chaos-engineering.test.ts` | 6 | Financial saga recovery, PostgreSQL idempotency, Temporal deduplication, outbox retries |
| `server/test/gateway-e2e.test.ts` | 4 | Keycloak JWT and Permify authorization chain |
| `server/test/localProviderMocks.test.ts` | 4 | Fixture-only auth, idempotency, rate limit, malformed payload, and transient retry behavior |
| `server/crm.provider-contract.test.ts` | 2 | CRM proxy forwarding and explicit unavailable state |
| `server/ai.gateway-fixture.test.ts` | 3 | AI gateway local-provider response contracts |
| `server/crm.external.test.ts` | 2 | CRM GraphQL introspection contract through the local fixture |
| `server/stripe.provider-contract.test.ts` | 4 | Stripe proxy request and unavailable-state contracts |
| `server/twenty.provider-contract.test.ts` | 5 | Twenty CRM HTTP contract and unavailable-state protections |
| `server/stripe.stripe-mock.test.ts` | 1 | Stripe router registration and mock-backed request path |
| `server/silentMockwareRegression.test.ts` | 7 | Guards against plausible-success mock fallbacks in production paths |
| `server/financialAtomicityRegression.test.ts` | 6 | Financial transaction atomicity and compensating-flow regressions |
| `server/auth.logout.test.ts` | 1 | Logout security behavior |
| `server/auth.member.test.ts` | 3 | Member authentication and authorization behavior |
| **Total** | **290** | **Complete provider-enabled regression run** |

## Edge-Case Fixture Coverage

The fixture-specific test file adds four focused behavior contracts. Its tests perform actual HTTP requests against a short-lived loopback server started by `startLocalProviderMocks()`, then close that server after each case. [2]

| Behavior | Test assertion | Result |
|---|---|---|
| Stripe idempotency replay | Two identical `POST /v1/customers` calls using `Idempotency-Key: customer-create-001` both return `200`; the second response has `idempotent-replayed: true` and the same JSON payload. | Passed |
| Stripe rate-limit and retry | A configured one-time `429` on `/v1/customers` includes `Retry-After: 2` and error type `rate_limit_error`; the second request succeeds with `200`. | Passed |
| CRM authorization and malformed body | Missing bearer token returns `401`; valid CRM authentication with invalid JSON returns `400` and a GraphQL error message containing `Malformed`. | Passed |
| CRM transient-failure retry | A configured one-time `503` returns `api_error`; the following valid GraphQL request returns `200` and `data.__typename = Query`. | Passed |

## TypeScript Implementation Inspection

### Authentication Gate

Every request first determines the fixture provider from its path and records redacted request metadata. It then performs a provider-specific bearer-token check before failure injection or response handling. Stripe accepts only `Bearer sk_test_…` or `Bearer sk_live_…`; CRM accepts only `Bearer crm_…`; the AI fixture requires its dedicated local token. A failed check ends the request with `401` and `authentication_error`. This ordering prevents unauthenticated callers from consuming an injected failure or receiving a plausible success response. [1]

```ts
function authorize(request: http.IncomingMessage, provider: ProviderName): boolean {
  const authorization = request.headers.authorization ?? "";
  if (provider === "stripe") return /^Bearer sk_(test|live)_/.test(authorization);
  if (provider === "crm") return /^Bearer crm_/.test(authorization);
  return authorization === "Bearer ai_local_provider_token";
}
```

### Rate Limiting and `Retry-After`

Failure injection is controlled by `LocalProviderFailure`, which requires a provider, optional exact path, remaining invocation count, status (`429`, `500`, or `503`), and optional retry interval. `takeFailure()` finds the first matching entry whose count remains positive, decrements it exactly once, and returns it. Thus `count: 1` creates one deterministic failure and makes the next matching request eligible for normal handling. [1]

For status `429`, the response sets the standard HTTP `retry-after` response header to `retryAfterSeconds`, defaulting to **one second** when no value is configured. The header is produced only for a rate-limit failure; `500` and `503` response paths deliberately carry no retry header. The fixture itself does **not** sleep, back off, or automatically resend a request—the calling client owns retry policy. This separation lets tests assert a server contract without introducing timing-dependent tests. [1]

```ts
const injectedFailure = takeFailure(provider, url.pathname);
if (injectedFailure) {
  const headers: Record<string, string> = injectedFailure.status === 429
    ? { "retry-after": String(injectedFailure.retryAfterSeconds ?? 1) }
    : {};
  sendJson(
    response,
    injectedFailure.status,
    {
      error: {
        type: injectedFailure.status === 429 ? "rate_limit_error" : "api_error",
        message: "Injected transient fixture failure",
      },
    },
    headers,
  );
  return;
}
```

Because Node normalizes inbound and outbound header names to lower case, the regression assertion reads `response.headers.get("retry-after")`. It verified the exact configured value, `"2"`, rather than only asserting header presence. [2]

### Stripe Idempotency Semantics

The fixture maintains `Map<string, unknown>` for only successful Stripe `POST` responses. Its key concatenates the method, route, and `Idempotency-Key`; consequently, identical keys on different endpoint paths cannot collide. Before invoking the deterministic route handler, the fixture returns the previously stored successful payload and adds `idempotent-replayed: true`. It caches only `200` responses, so a temporary failure is not incorrectly replayed as a permanently failed request. [1]

```ts
const idempotencyMapKey = idempotencyKey && method === "POST"
  ? `${method}:${url.pathname}:${idempotencyKey}`
  : undefined;

if (idempotencyMapKey && idempotentResponses.has(idempotencyMapKey)) {
  sendJson(response, 200, idempotentResponses.get(idempotencyMapKey), {
    "idempotent-replayed": "true",
  });
  return;
}

const payload = stripeResponse(url.pathname, method, body);
const status = "error" in (payload as Record<string, unknown>) ? 400 : 200;
if (status === 200 && idempotencyMapKey) idempotentResponses.set(idempotencyMapKey, payload);
```

The failure-injection branch executes **before** the idempotency replay branch. A one-time `429` therefore remains observable even when the retried request uses the same idempotency key; once the failure count is consumed, the successful retry creates or retrieves the stable cached payload. The focused regression test covers this sequence. [1] [2]

### CRM Validation and Transient Retry Semantics

After authorization and any configured failure, CRM handling parses the request body as JSON and requires a nonempty string in `query`. Invalid JSON returns a GraphQL-shaped `400` response with `errors: [{ message: "Malformed GraphQL JSON" }]`; a missing or blank query produces a similarly shaped `400` response. This prevents an invalid request from producing a healthy-looking provider payload. [1]

A CRM retry scenario is configured with `failures: [{ provider: "crm", path: "/graphql", count: 1, status: 503 }]`. The first authorized request returns `503` with `error.type = "api_error"`; `takeFailure()` decrements the counter; a second valid request reaches normal GraphQL response handling and returns `200`. No `Retry-After` header is emitted for `503`, accurately distinguishing transient unavailability from explicit rate limiting. [1] [2]

## Boundary of This Evidence

This report proves deterministic request/response behavior in local tests and confirms that the complete local provider-enabled regression suite is green. It does not replace external-provider release evidence. In particular, a production release still requires a real Stripe test-mode signed webhook event, real CRM sandbox credentials and transport validation, real AI-gateway validation, and staging infrastructure admission evidence. These are intentionally not fabricated by local fixtures.

## References

[1]: ./lanai-portal/server/test/localProviderMocks.ts "Deterministic local provider fixture implementation"
[2]: ./lanai-portal/server/test/localProviderMocks.test.ts "Fixture edge-case regression tests"
[3]: ./STAGING_ADMISSION_AND_PROVIDER_EDGE_CASES.md "Provider fixture boundary and staging-admission evidence"
