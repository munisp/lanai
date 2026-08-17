# Financial Runner RBAC and Double-Entry Reconciliation Audit

**Review date:** 2026-08-17 EDT
**Scope:** Isolated financial runner workload identity, repository-declared Kubernetes RBAC, release-gate caller preflights, and TigerBeetle/PostgreSQL reconciliation in `live-financial-workflow-runner.ts`.

## Executive Conclusion

The isolated financial workload uses a dedicated service account with no Kubernetes API token and no repository-declared Role or RoleBinding. It therefore has no intended application-side Kubernetes API authority. The separately executed staging release-gate identity must hold a narrow, explicit namespace-scoped permission matrix to create and observe the smoke and financial evidence resources; the runner verifies that matrix with `kubectl auth can-i` before mutation.

The live financial runner now verifies the full authoritative linkage among Temporal workflow output, PostgreSQL mirror identity, TigerBeetle pending transfer identity and amount, TigerBeetle settlement-to-pending linkage, debit/credit account identity, and published outbox state. The newly added checks close two audit blind spots: pending-transfer identity was not explicitly compared to the mirror, and the settlement’s `pending_id` link was not exposed by the infrastructure wrapper.

## Workload Service Account and Pod Authority

| Control | Declared configuration | Assessment |
|---|---|---|
| Service account | `ledger-soak-runner` in `lanai-loadtest`. | Dedicated workload identity. |
| Pod token | Both ServiceAccount and Job pod set `automountServiceAccountToken: false`. | The application and Dapr sidecar receive no Kubernetes API token. |
| Repository RBAC resources | Repository scan found no `Role`, `RoleBinding`, `ClusterRole`, or `ClusterRoleBinding` manifest for `ledger-soak-runner`. | Correct least-privilege posture for a workload that does not call Kubernetes APIs. |
| Dapr components | Dapr built-in Kubernetes secret store is disabled for the tokenless pod; component secret references are resolved at injection time. | Does not require application pod API credentials. |
| Runtime privilege | UID/GID 10001, non-root, read-only root filesystem, privilege escalation disabled, all Linux capabilities dropped, RuntimeDefault seccomp. | Limits OS-level authority independently of Kubernetes RBAC. |
| Network authority | Namespace default deny; DNS plus fixed dependency ports only. | Reduces reachable attack surface. |

> The repository can prove its declared service-account posture, but it cannot prove the effective RBAC of a live cluster. Cluster operators must verify that no external RoleBinding or ClusterRoleBinding grants `system:serviceaccount:lanai-loadtest:ledger-soak-runner` additional privileges.

## Release-Gate Caller RBAC

The release-gate identity is intentionally distinct from the workload service account. It is the human or CI identity identified by the approved kubeconfig and exact context. Before persistence, the script requires the following permissions.

| Namespace | Permission groups | Protected action |
|---|---|---|
| Cluster scope | `get namespaces` | Verifies platform and financial namespace environment labels. |
| Platform staging | Deployment dry-run; `create/get/patch/delete` Jobs; `create/get/patch` CronJobs; `get` secrets/pods/pod logs. | Server-side admission, smoke Job lifecycle, smoke logs, and Keycloak secret preflight. |
| Financial load-test | `create/get/patch` ConfigMaps, NetworkPolicies, and Jobs; `get` secrets, PVCs, service accounts, Dapr components, pods, and pod logs. | Renders/applies financial settings and egress policy, verifies prerequisites, creates/observes the generated evidence Job, and collects logs. |

The runner exits `77` on a denied `kubectl auth can-i` response, `78` on missing secret/resource prerequisites, and `65` on unsafe target inputs. It never grants RBAC; it fails before use if the externally managed role is insufficient.

## TigerBeetle Funds-Flow Integration

The commission saga uses a deterministic business key containing the original idempotency key and minor amount. That identity derives stable TigerBeetle account and transfer IDs, PostgreSQL transfer keys, Temporal workflow IDs, and outbox idempotency keys.

| Stage | TigerBeetle operation | PostgreSQL / event action | Idempotency and failure behavior |
|---|---|---|---|
| Account preparation | `createAccount` with deterministic account ID. | Stores matching account identity. | Existing account must match ledger/code or execution fails. |
| Reserve | `createPendingTransfer` with `TransferFlags.pending`. | Inserts a `pending` ledger mirror with the pending transfer ID. | Existing transfer/mirror must match debit, credit, amount, ledger, code, and currency. |
| Settle | `postPendingTransfer` with the pending ID and `TransferFlags.post_pending_transfer`. | Sets mirror to `posted` and stores settlement transfer ID. | Settlement ID is deterministic; a conflicting stored settlement ID fails. |
| Publish | No new funds transfer. | Enqueues `financial:<transferKey>:posted`; dispatches via outbox. | One event per transfer key; delivery must become `published`. |
| Compensate | `voidPendingTransfer` with the pending ID. | Marks mirror `voided`. | Cannot void an already posted mirror. |

## Post-Run Double-Entry Assertions

The load runner invokes deployed Temporal `bookingCommissionSaga` workflows, then performs the following checks for **every** returned booking result.

| Assertion | Current implementation | Failure condition |
|---|---|---|
| Mirror cardinality | `mirrors.length === options.count`. | Missing or extra booking mirror. |
| Mirror state | Mirror status is `posted`. | Settlement did not reconcile locally. |
| Pending mirror identity | `mirror.tigerBeetleTransferId === result.pendingTransferId`. | PostgreSQL mirror points to a different pending transfer. |
| Settlement mirror identity | `mirror.tigerBeetleSettlementTransferId === result.settlementTransferId`. | PostgreSQL mirror points to a different settlement transfer. |
| Ledger account presence | Both mirror ledger account rows exist. | Missing account mapping. |
| Pending double-entry accounts | TigerBeetle pending debit/credit IDs equal the mirrored debit/credit accounts’ TigerBeetle IDs. | Debit or credit account drift. |
| Pending monetary value | TigerBeetle pending `amount` equals PostgreSQL mirror `amountMinor`. | Amount drift between authoritative ledger and mirror. |
| Settlement account continuity | TigerBeetle settlement debit/credit IDs equal the same mirror accounts. | Settlement posts against different accounts. |
| Settlement linkage | TigerBeetle settlement `pendingId` equals the workflow pending transfer ID. | Settlement does not post the intended reserve. |
| Delivery cardinality/state | Exactly one expected financial event per mirror exists and all are `published`. | Lost, duplicate, or undelivered financial event. |

## Newly Added Reconciliation Coverage

`TigerBeetle.lookupTransfer()` now returns `pendingId` in addition to transfer ID, debit account, credit account, amount, and flags. The runner now rejects:

```ts
mirror.tigerBeetleTransferId !== result.pendingTransferId
pending.amount !== BigInt(mirror.amountMinor)
settlement.pendingId !== BigInt(result.pendingTransferId)
```

These checks are source- and type-validated locally. They require a real staging TigerBeetle/Temporal/PostgreSQL/outbox topology to execute end to end; no local fixture result is represented as live ledger evidence.

## Validation

| Gate | Result |
|---|---:|
| TypeScript (`pnpm check`) | Passed |
| Focused provider fixture suite | 4/4 passed |
| Repository diff whitespace check | Passed |
| Live cluster RBAC review | Pending external kubeconfig and cluster access |
| Live financial reconciliation | Pending isolated staging services and signed runner image |
