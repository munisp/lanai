# Staging Admission and Provider Fixture Edge Cases

## Staging Admission-Controller Dry-Run

This session has no `kubectl` binary, kubeconfig, Kubernetes context, or namespace permission. A real staging admission-controller result therefore **has not been claimed**.

The repository now provides a non-mutating server-side dry-run command:

```bash
export LANAI_STAGING_CONTEXT='your-approved-staging-context'
export LANAI_STAGING_NAMESPACE='lanai-staging'
export LANAI_STAGING_ENVIRONMENT='staging'
./lanai-portal/scripts/dry-run-staging-admission.sh
```

The script fails closed unless all of the following are true:

| Guard | Purpose |
|---|---|
| `kubectl` is installed | Prevents a local or simulated admission result. |
| Current context exactly matches `LANAI_STAGING_CONTEXT` | Prevents accidental use of a production or developer context. |
| Active identity has `create deployment` permission in the target namespace | Confirms server-side admission can be requested. |
| Target namespace has `environment=staging` | Prevents accidental targeting of another environment. |
| Every manifest is submitted with `--server-side --dry-run=server --validate=strict` | Executes admission, schema, policy, and server validation without persisting an object. |

The command covers the hardened app, data, platform, AI, bootstrap-job, and smoke-test manifests. It never uses `kubectl apply` without `--dry-run=server`.

## Local Stripe Fixture Edge Cases

`server/test/localProviderMocks.ts` provides a deterministic loopback fixture used only when `RUN_LOCAL_PROVIDER_TESTS=1` is set. The fixture does not replace external Stripe sandbox tests; those remain explicitly opt-in.

| Edge case | Fixture behavior | Regression evidence |
|---|---|---|
| Authentication rejection | Requires a Stripe bearer key matching `sk_test_` or `sk_live_`; otherwise responds `401 authentication_error`. | `localProviderMocks.test.ts` |
| Idempotency replay | Replays the original successful `POST` response when the same `Idempotency-Key` is received; adds `idempotent-replayed: true`. | `localProviderMocks.test.ts` |
| Rate limit and retry | `failNext` can return `429 rate_limit_error` with an exact `Retry-After` header before a retry succeeds. | `localProviderMocks.test.ts` |
| Transient upstream failure | `failNext` can return `500` or `503 api_error` a controlled number of times. | `localProviderMocks.test.ts` |
| Subscription normalization | Supplies the timestamps, cancellation flag, currency, recurring interval, and price amount required by the real `stripeRouter` normalization path. | `stripe.external.test.ts` in local-provider mode |
| Checkout and Billing Portal | Returns stable protocol-shape URLs through the real Stripe SDK request path. | `stripe.external.test.ts`, `smoke.test.ts` |

The fixture does **not** simulate Stripe webhook signature generation or independently validate Stripe's upstream retry policy. The application’s signed webhook verification remains covered by its dedicated router and provider-contract tests; a real Stripe test-mode event is still required before a production release.

## Local CRM Fixture Edge Cases

| Edge case | Fixture behavior | Regression evidence |
|---|---|---|
| Authentication rejection | Requires `Authorization: Bearer crm_*`; otherwise responds `401`. | `localProviderMocks.test.ts` |
| Malformed GraphQL JSON | Returns `400` with a GraphQL `errors` array. | `localProviderMocks.test.ts` |
| Missing or empty query | Returns `400` with a GraphQL `errors` array. | `localProviderMocks.test.ts` |
| Introspection transport | Returns a valid `__schema.queryType.name` response. | `crm.external.test.ts` in local-provider mode |
| Transient upstream failure | `failNext` can return `503 api_error` before a subsequent retry succeeds. | `localProviderMocks.test.ts` |

## Verification Completed

| Check | Result |
|---|---:|
| TypeScript | Passed with 0 errors |
| Local fixture edge-case tests | 10 passed |
| Complete local provider-enabled suite | 286 passed, 0 skipped |
| Kubernetes Trivy scan at HIGH/CRITICAL | 0 findings |
| Staging admission-controller execution | Pending dedicated staging credentials and cluster access |
