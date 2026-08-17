# Financial Database and Temporal Saga Audit

**Review date:** 2026-08-17 EDT
**Scope:** PostgreSQL ledger-mirror and outbox schema, Drizzle migration history, Temporal financial workflow registration, activity retry policy, and compensation boundaries.

## Executive Conclusion

The financial system uses PostgreSQL as the durable mirror and event-delivery record around authoritative TigerBeetle transfers. The outbox is intentionally durable and independently retryable after settlement. A pending TigerBeetle transfer is voided only when mirror persistence fails before settlement. After a transfer is posted, retries replay deterministic/idempotent local actions and event enqueueing; they do not attempt an economically unsafe reversal.

Migration `0006_ledger_transfer_invariants` adds database-enforced invariants that complement application logic. Fresh-database migration validation passed and proved that the database accepts a valid pending mirror while rejecting same-account, zero-value, invalid-status, and posted-without-settlement records.

## Migration History

| Migration | Financial/outbox effect |
|---|---|
| `0000_nervous_doctor_doom.sql` | Creates `ledger_accounts`, `ledger_transfers`, `outbox_events`, `event_deliveries`, state enums, unique keys, and dispatch/query indexes. |
| `0001_platform_integrity.sql` | Adds `event_deliveries → outbox_events` cascade foreign key and `ledger_transfers → ledger_accounts` restrictive debit/credit foreign keys. |
| `0005_early_paper_doll.sql` | Adds the unique `tigerBeetleSettlementTransferId` field to `ledger_transfers`. |
| `0006_ledger_transfer_invariants.sql` | Adds positive amount, distinct debit/credit account, closed status, and final-state settlement-link constraints. |

## Current Outbox Schema

### `outbox_events`

| Field/control | Definition and purpose |
|---|---|
| Identity | Serial primary key plus unique `eventId` and unique `idempotencyKey`. |
| Business routing | `aggregateType`, `aggregateId`, `eventType`, `schemaVersion`, and JSONB `payload`. |
| Delivery state | `outbox_status`: `pending`, `publishing`, `published`, `failed`, or `dead_letter`. |
| Retry state | `attempts`, `nextAttemptAt`, truncated `lastError`, and `publishedAt`. |
| Dispatch index | B-tree `(status, nextAttemptAt)` supports due-event claims. |
| Investigation indexes | Aggregate/time and event-type/time indexes support selective audit queries. |

### `event_deliveries`

| Field/control | Definition and purpose |
|---|---|
| Per-target identity | Unique `(outboxEventId, target)`. |
| State | `delivery_status`: `pending`, `delivered`, `failed`, or `dead_letter`. |
| Diagnostics | Per-target attempt count, truncated last error, delivered time, create/update timestamps. |
| Referential integrity | `outboxEventId` foreign key cascades on outbox deletion. |
| Operational index | `(status, createdAt)` supports delivery investigation. |

## Current Financial Mirror Schema

### `ledger_accounts`

Each mirror account has a unique internal `accountKey`, unique TigerBeetle account ID, ledger and code, optional member/supplier/advisor links, and foreign keys that set those optional business identities to null rather than deleting an accounting account.

### `ledger_transfers`

| Field/control | Definition and purpose |
|---|---|
| Transfer identity | Unique `transferKey` and unique pending `tigerBeetleTransferId`. |
| Settlement identity | Unique nullable `tigerBeetleSettlementTransferId`; populated for posted or voided final states. |
| Double-entry mapping | Required debit and credit ledger-account IDs, each protected by `ON DELETE RESTRICT`. |
| Monetary value | `numeric(20,0)` `amountMinor`, representing positive integer minor units. |
| Lifecycle | `pending`, `posted`, or `voided`. |
| Business reference | Indexed `referenceType` and `referenceId`. |
| Reconciliation indexes | Debit/time and credit/time indexes. |

Migration `0006_ledger_transfer_invariants.sql` adds these checks:

```sql
CHECK ("debitLedgerAccountId" <> "creditLedgerAccountId")
CHECK ("amountMinor" > 0)
CHECK ("status" IN ('pending', 'posted', 'voided'))
CHECK ("status" = 'pending' OR "tigerBeetleSettlementTransferId" IS NOT NULL)
```

The migration was applied to a fresh PostgreSQL database. A valid `pending` mirror was accepted. Inserts with identical debit/credit accounts, nonpositive amounts, an invalid status, or a `posted` status without settlement ID were each rejected by their named constraints.

> Before applying migration `0006` to an existing production database, operators should first query for rows violating these four predicates. The migration is deliberately fail-closed: existing malformed financial records will block constraint installation rather than being silently normalized.

## Temporal Financial Workflows

The Temporal worker connects to `ENV.temporalAddress`, `ENV.temporalNamespace`, and `ENV.temporalTaskQueue`, and registers the main activities plus all `financialActivities` from the same workflow bundle. `workflows.ts` explicitly exports the three financial saga names, preventing a client from starting a workflow not loaded by a worker.

| Workflow | Order | Pre-settlement compensation | Post-settlement behavior |
|---|---|---|---|
| `bookingCommissionSaga` | Reserve commission → persist mirror → settle → enqueue commission event → mark booking posted. | Void pending commission transfer if mirror persistence fails. | Retry deterministic settlement/event/state work; do not void posted funds. |
| `invoicePaymentSaga` | Reserve payment → persist mirror → settle → mark invoice paid → enqueue payment event. | Void pending payment transfer if mirror persistence fails. | Retry deterministic settlement/state/event work; do not void posted funds. |
| `commissionReconciliationSaga` | Reserve payable → persist mirror → settle → mark commission invoice sent → enqueue reconciliation event. | Void pending reconciliation transfer if mirror persistence fails. | Retry deterministic settlement/state/event work; do not void posted funds. |

## Financial Activity Retry Policy

Ordinary financial activities use:

```ts
{
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 5,
    initialInterval: "1s",
    maximumInterval: "30s",
    backoffCoefficient: 2,
    nonRetryableErrorTypes: ["INVALID_INPUT", "DUPLICATE_TRANSFER", "SAGA_COMPENSATION"],
  },
}
```

Compensation uses a separate Temporal activity proxy with the same 30-second execution timeout, a one-second initial interval, a five-minute maximum interval, backoff coefficient two, and `maximumAttempts: 0` (unlimited retries subject to Temporal execution timeouts). Only `INVALID_INPUT` and `DUPLICATE_TRANSFER` are nonretryable. This prevents a transient TigerBeetle or worker outage from exhausting ordinary business retries while leaving a pending reserve outstanding.

A failed mirror persistence operation first invokes the deterministic pending-transfer void through that compensation proxy, then raises a nonretryable `SAGA_COMPENSATION` `ApplicationFailure`. This prevents a retry from creating or settling a transfer after the required compensation has completed.

Financial reserve, post, void, account creation, local mirror persistence, and outbox enqueue all use deterministic business identities. Existing TigerBeetle accounts/transfers are verified against the original payload. Existing mirror/settlement IDs must also match. Thus a retry after settlement may replay operations but cannot create a second transfer.

## Outbox Boundary

Financial workflows call an activity that durably enqueues a single `financial:<transferKey>:posted` event after settlement. Network delivery is performed separately by the outbox dispatcher. If a publish target fails, the outbox row is retried with exponential backoff; after ten failed batch claims it becomes `dead_letter` for operator remediation. Posted TigerBeetle transfers are not reversed due solely to an event delivery outage.

## Validation Evidence

| Gate | Result |
|---|---:|
| Fresh PostgreSQL migration history, including `0006` | Passed |
| Valid pending mirror insert | Passed |
| Same-account mirror rejection | Passed |
| Nonpositive amount rejection | Passed |
| Invalid status rejection | Passed |
| Posted-without-settlement rejection | Passed |
| TypeScript (`pnpm check`) | Passed — 0 errors |
| Financial chaos regression with migrated PostgreSQL | Passed — 6/6 scenarios, including durable compensation retry guard |
| Live TigerBeetle/Temporal/PostgreSQL evidence | Pending isolated staging execution |
