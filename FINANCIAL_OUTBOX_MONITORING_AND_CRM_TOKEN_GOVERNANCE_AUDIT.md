# Financial Outbox Monitoring and Twenty CRM Token Governance Audit

**Review date:** 2026-08-17 EDT
**Scope:** Persistent CRM delivery failures, outbox retry/dead-letter behavior, financial dead-letter telemetry, alert-rule coverage, and static Twenty CRM token isolation/rotation controls.

## Executive Conclusion

The durable outbox preserves financial facts before downstream delivery and never reverses a posted TigerBeetle transfer merely because CRM is unavailable. Persistent downstream errors are captured per delivery target, retried with capped exponential delay, and moved to a terminal `dead_letter` state after ten dispatcher claims.

This audit identified two repository-controlled gaps: the portal had no financial outbox metric despite Prometheus scraping `/api/metrics`, and the CRM bearer token shared the broad `lanai-secrets` object without a narrow rotation role. The remediation adds a count-only Prometheus metric, a critical dead-letter rule, dedicated CRM secret injection, least-privilege rotation RBAC, and an operator runbook. Alert receiver delivery remains environment-owned and must be configured in Alertmanager; an empty receiver list is not an automatic page.

## Persistent CRM Failure State Machine

| Dispatcher stage | Implementation | Result for persistent CRM error |
|---|---|---|
| Durable enqueue | `outbox_events` insert uses unique idempotency key and `ON CONFLICT DO NOTHING`. | One financial event is retained even if the business request or saga retries. |
| Per-target fan-out | Fluvio, Dapr, Lakehouse, and enabled CRM run through `Promise.allSettled`. | CRM failure does not hide or overwrite the other target outcomes. |
| Delivery record | `event_deliveries` uses unique `(outboxEventId, target)` with attempt increment, status, bounded error, and delivered timestamp. | CRM error remains diagnosable at target level. |
| Event retry | Rows in `pending` or `failed` with due `nextAttemptAt` are atomically claimed as `publishing`. | Concurrent dispatchers cannot both claim a normal due row. |
| Delay | `retryAt(attempts)` uses `min(900, 2 ** min(attempts, 10))` seconds. | Delay sequence is 2, 4, 8, 16, 32, 64, 128, 256, 512, then 900 seconds. |
| Terminal handling | At `attempts >= 10`, event becomes `dead_letter`; otherwise it returns to `failed`. | Dead-letter rows are excluded from automatic due-row selection. |

The generic dispatcher has no automatic dead-letter replay function. This is intentional: replay can repeat previously successful target operations, so recovery requires operator review and idempotent downstream consumers. For CRM projections, `crmSyncRouter` provides administrator-only `resyncLink` and `reconcileLink` controls after the provider credential or remote workspace is repaired. Financial ledger transfers remain posted and are not reversed by CRM delivery status.

## Financial Dead-Letter Monitoring

The portal now exposes only status counts, never event payloads, CRM data, payment identifiers, or credentials:

```text
lanai_financial_outbox_events{status="pending"}
lanai_financial_outbox_events{status="publishing"}
lanai_financial_outbox_events{status="published"}
lanai_financial_outbox_events{status="failed"}
lanai_financial_outbox_events{status="dead_letter"}
```

`financial-outbox-alerts.yml` defines the critical condition:

```promql
lanai_financial_outbox_events{status="dead_letter"} > 0
```

The condition must persist for one minute. Prometheus is configured to load the rule in compose deployments. The severity label is `critical`, and the runbook pointer is `CRM_TOKEN_ROTATION_AND_FINANCIAL_OUTBOX_RUNBOOK.md`.

> Prometheus rule evaluation is not the same as notification delivery. The committed Prometheus configuration intentionally leaves Alertmanager targets empty because the receiver URL, routing policy, escalation recipient, and credentials belong to the environment. Production certification requires an operator to configure and test Alertmanager delivery for this rule.

## Twenty CRM Token Isolation and Rotation

| Control | Current implementation |
|---|---|
| Secret isolation | `TWENTY_CRM_URL` and `TWENTY_CRM_API_TOKEN` are injected only from `lanai-crm-secrets`, not `lanai-secrets`. |
| Application API authority | The portal workload does not mount a Kubernetes service-account token. Kubernetes passes the configured secret values as environment variables only. |
| Rotation identity | `lanai-crm-token-rotator` is the sole repository-declared service account allowed to mount a Kubernetes API token for CRM secret rotation. |
| Least privilege | The Role permits only `get`, `patch`, and `update` on the single resource name `secrets/lanai-crm-secrets`; it cannot list secrets, access other secrets, create/delete secrets, or restart deployments. |
| Separation of duties | A separate approved deployment identity performs the required portal rollout restart after secret update. |
| Rotation template | `.env.crm.secrets.example` supplies only the CRM URL and token keys; no credential is committed. |
| Recovery | Administrator reviews failed/dead-letter CRM links and uses approved `resyncLink`/`reconcileLink` controls after health and token validation. |

The static Twenty client has no OAuth refresh path. A `401` is captured as `TwentyCrmError`, persisted as a failed delivery, retried under the durable outbox policy, and eventually dead-lettered if the credential is not rotated. This is fail-closed behavior; the runbook defines the controlled rotation and post-rotation recovery sequence.

## Validation Evidence

| Validation | Result |
|---|---:|
| TypeScript | Passed — 0 errors |
| Production application build | Passed |
| Prometheus and Kubernetes YAML parsing | Passed |
| Alert expression validation | Passed |
| CRM rotation Role resource/verb restriction | Passed |
| Existing assurance configuration validator | Passed — 38/38 controls |
| Live Prometheus, Alertmanager, Kubernetes RBAC, CRM rotation, and dead-letter notification evidence | Pending environment-owned staging/production execution |
