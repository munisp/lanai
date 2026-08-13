# Financial Atomicity and Idempotency Audit

**Author:** Manus AI  
**Scope:** Source review and deterministic regression validation of Lanai financial flows.  
**Status:** **Code remediation complete; live staging execution blocked pending dedicated-stack credentials.**

## Executive conclusion

The prior implementation had three material flow-of-funds gaps: it posted booking transfers immediately rather than using TigerBeetle two-phase transfers, its compensation activity only logged a reversal requirement, and several invoice/payment paths could update PostgreSQL without entering the durable financial workflow. These were real defects; they were not treated as production-ready behavior.

The repaired implementation uses a single business idempotency key to derive the Temporal workflow identity, deterministic TigerBeetle pending/post/void transfer identifiers, PostgreSQL ledger-mirror identity, and financial outbox event identity. A reconciliation or payment cannot now be marked paid or sent through the normal API route without the corresponding workflow path.

> **Evidence boundary:** A dedicated staging Kubernetes/TigerBeetle/Temporal stack is not accessible in the current session. Therefore no claim is made that a live 24-hour staging soak test has started or completed. The code and its local regression suite are validated; a real external-service run remains required.

## Defects found and corrected

| Area | Previous behavior | Remediation | Verification |
|---|---|---|---|
| TigerBeetle commission posting | Created an immediately posted transfer. | Creates a deterministic **pending** transfer, persists the PostgreSQL mirror, then posts that exact transfer. | Financial guardrail tests require `pending`, `post_pending_transfer`, and mirror settlement tracking. |
| Compensation | Only emitted a log statement and a commented example. | Performs a deterministic `void_pending_transfer` and marks the local mirror `voided`. | Chaos regression checks the real compensation activity. |
| Transfer replay | Treated `exists` as success without checking the existing payload. | Looks up an existing account/transfer and compares ledger, code, debit account, credit account, amount, and flags. | Static regression guard verifies native lookup and mismatch failure. |
| Ledger audit mirror | Did not distinguish a primary movement from settlement. | Stores pending transfer ID, settlement transfer ID, and `pending`/`posted`/`voided` state. | Schema migration `0005_early_paper_doll.sql`. |
| Downstream events | Financial activities published directly to Fluvio. | Uses the PostgreSQL-backed durable outbox with an idempotency key derived from the business transaction. | Existing outbox retry regression plus financial guardrail suite. |
| Manual invoice payment state | `updateStatus(paid)` could mark an invoice paid without a Stripe/TigerBeetle workflow. | Rejects manual paid status; signed Stripe `payment_intent.succeeded` must start `invoicePaymentSaga`. | Financial guardrail suite. |
| Supplier commission settlement | Sending a commission invoice was a direct PostgreSQL status change. | Starts `commissionReconciliationSaga` with a deterministic workflow ID. | Financial guardrail suite. |
| Forecast commission ledger | Created a direct TigerBeetle transfer using hard-coded account IDs. | Records only a forecast/outbox event. Actual funds move only through a financial saga. | Financial guardrail suite. |

## Canonical idempotency chain

For a financial command, the supplied immutable business key is validated and becomes the source for all downstream identities.

| Layer | Identity |
|---|---|
| Temporal | Deterministic workflow ID at the command boundary, for example `financial-stripe-payment-{paymentIntentId}`. |
| TigerBeetle reserve | `SHA-256("pending:" + financialTransferKey)` truncated to a non-zero 128-bit ID. |
| PostgreSQL ledger mirror | Unique `ledger_transfers.transferKey`. |
| TigerBeetle settlement | `SHA-256("post:" + financialTransferKey)` truncated to a non-zero 128-bit ID. |
| TigerBeetle compensation | `SHA-256("void:" + financialTransferKey)` truncated to a non-zero 128-bit ID. |
| Outbox | Unique `financial:{financialTransferKey}:posted` event key. |

The amount is incorporated into `financialTransferKey`. Reusing an idempotency key with a different amount is rejected rather than silently matching an older monetary operation.

## Required staging validation

Run the guarded soak test only with a dedicated load-test database, a real TigerBeetle cluster, Temporal workers, Fluvio, and valid test-only Stripe webhook fixtures. The runner requires explicit acknowledgement flags and a staging database-name check before it will issue writes.

```bash
cd lanai-portal
python3 server/test/production-soak-test-24h.py \
  --db-url "$STAGING_DATABASE_URL" \
  --confirm-write --confirm-production-soak \
  --duration-hours 24 --target-tps 500
```

The staging test must also invoke financial workflow commands—not only PostgreSQL mirror writes—and reconcile each TigerBeetle pending/post/void identifier against `ledger_transfers` and the outbox before compliance sign-off.

## Local verification performed

| Command | Result |
|---|---:|
| `pnpm check` | Passed with 0 TypeScript errors. |
| `DATABASE_URL=... pnpm test` | 8 test files passed; 1 external Permify suite skipped because no endpoint was configured; 33 tests passed and 4 skipped. |
| Financial atomicity regression | 6 passed. |
| Chaos regression | 6 passed. |

## Remaining non-code gate

The session has no `KUBECONFIG`, `kubectl`, staging environment variables, reachable TigerBeetle service, or reachable Temporal service. Provide a restricted staging kubeconfig or a temporary load-test runner endpoint and test-only service credentials to execute the 24-hour live run and publish real external-service evidence.
