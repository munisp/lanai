# Permify Authorization and Daily Financial Reconciliation Review

**Author:** Manus AI  
**Scope:** Local live-authorization testing and daily staging financial evidence collection.

## Executive result

The review identified an authorization consistency gap: the generic advisor procedure called Permify, but senior-advisor, administrator, and member procedures previously relied only on local session/role values. This is now corrected. Every production and staging protected procedure uses a live Permify decision; an unavailable or denied decision fails closed with `FORBIDDEN`.

The local test package now includes a reproducible container definition and launcher. A native Permify fallback was used in this sandbox because Docker is not installed, and it validated the live authorization suites against a real gRPC endpoint. The daily audit CronJob was also strengthened so it reconciles more than transfer-ID existence: it checks the exact mirrored debit account, credit account, pending transfer amount, distinct settlement transfer, workflow status, outbox status, and Fluvio delivery state.

| Validation tier | Result |
|---|---:|
| TypeScript | Passed with 0 errors |
| Static local-stack/CronJob policy checks | Passed |
| Deterministic suite | 37 passed |
| Real Permify smoke suites | 234 passed; 4 Stripe tests intentionally skipped because no live Stripe key was supplied |
| Live Keycloak-context/Permify gateway suite | 4 passed |

## Authorization enforcement changes

| Procedure class | Required controls after review |
|---|---|
| `protectedProcedure` | Authenticated advisor session **and** Permify `manage` on `platform:lanai`. |
| `seniorAdvisorProcedure` | Local `senior_advisor` or `admin` role **and** Permify `manage` on `platform:lanai`. |
| `adminProcedure` | Local `admin` role **and** Permify `administer` on `platform:lanai`. |
| `memberProcedure` | Authenticated member session **and** Permify `view` on that member’s own `member_record`. |
| `platinumMemberProcedure` | Member ownership permission **and** Platinum commercial-tier requirement. |

A new member now receives its `member_record` ownership tuple before onboarding is acknowledged. If the relationship write fails, the newly created database record is deleted as compensation and the request fails. The sole exception is a clearly delimited test-only fallback when `NODE_ENV=test` and no Permify endpoint exists; it cannot operate in staging or production.

## Local Permify container test package

The local stack is defined in `docker-compose.permify-test.yml` and runs PostgreSQL 16 plus Permify v1.7.2 on loopback-only ports. It uses an ephemeral database volume, separate test credentials, and disables the optional profiler to avoid host-port conflicts. `lanai-portal/scripts/run-local-permify-integration.sh` starts the stack, waits for it, bootstraps the `lanai-test` tenant and schema, executes `pnpm test:integration`, runs the gateway suite, and removes containers and volumes unless `KEEP_PERMIFY_TEST_STACK=true`.

```bash
cd /path/to/lanai
./lanai-portal/scripts/run-local-permify-integration.sh
```

> The container launcher is ready for a developer or CI runner with Docker. Docker was unavailable in this sandbox, so the same real gRPC tests were validated against an already installed local Permify v1.7.2 server using a fresh isolated PostgreSQL test database.

## Daily CronJob reconciliation detail

The CronJob in `config/k8s/loadtest/daily-financial-audit.yaml` runs at `02:17` and disallows overlap with `concurrencyPolicy: Forbid`. It has a tokenless service account, restricted security context, default-deny networking, and permits egress only to DNS, the labelled load-test PostgreSQL namespace, and the labelled TigerBeetle platform namespace.

The CronJob invokes `collect-staging-financial-audit.ts`. For every `ledger_transfers` row in the selected window, it performs the following reconciliation:

| Control | Verification |
|---|---|
| Pending transfer identity | `tigerBeetleTransferId` must resolve through the native TigerBeetle client. |
| Debit and credit accounts | TigerBeetle IDs must equal the IDs of the PostgreSQL `ledger_accounts` rows referenced by the mirror. |
| Pending amount | TigerBeetle pending amount must equal PostgreSQL `amountMinor`. |
| Settlement chain | Every non-pending row needs a non-null settlement ID distinct from the pending ID; that settlement must resolve with the same mirrored debit/credit accounts. |
| Workflow outcome | Any `failed`, `cancelled`, or `timed_out` workflow record fails the collection. |
| Outbox and Fluvio | Financial events must be `published`; non-delivered Fluvio delivery records fail the collection. |
| Evidence integrity | A JSON summary and companion SHA-256 checksum are written to the retained evidence PVC. |

If any condition fails, the collector exits non-zero. Kubernetes CronJobs provide scheduled Job execution, while `concurrencyPolicy: Forbid` prevents overlapping scheduled runs.[1] The network policies isolate collector egress to the explicitly allowed dependencies.[2]

## References

[1] [Kubernetes CronJobs](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)  
[2] [Kubernetes Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
