# Continued Resilience Validation Report

**Date:** 2026-08-13  
**Author:** Manus AI  
**Scope:** Post-load audit validation, hardened soak-test operations, and an additional sustained 500 TPS staging run.

## Executive Summary

This continuation validates the database after the prior financial-load test, hardens the long-running soak-test runner, and executes an additional sustained staging run. The implementation and evidence support **staging readiness** for the tested PostgreSQL financial-mirror path. A literal 24-hour production run remains a required deployment-environment gate; it was not represented as completed in this sandbox.

The new runner is now deliberately fail-closed. It refuses to write without an explicit flag, blocks production writes unless an additional acknowledgement is supplied, uses a PostgreSQL advisory lock to prevent concurrent runs, records durable JSONL telemetry, handles `SIGINT`/`SIGTERM` cleanly, applies an error budget, and verifies that every committed test operation has exactly one unique business key and one unique TigerBeetle mirror identifier.

## Post-Load Database Audit

The previous 500 TPS soak run was audited directly against PostgreSQL after completion.

| Check | Result | Status |
|---|---:|---|
| PostgreSQL `max_connections` | 500 | Healthy configured ceiling |
| Active PostgreSQL connections after test | 8 | No lingering pool exhaustion |
| Financial mirror rows for prior soak run | 149,000 | Complete |
| Distinct business transfer keys | 149,000 | Exactly-once evidence |
| Distinct TigerBeetle mirror identifiers | 149,000 | Exactly-once evidence |
| Duplicate business transfer keys | 0 | Pass |
| Ledger transfer status | 149,000 `posted` | Pass |
| Dead tuples in `ledger_transfers` | 0 | Healthy for tested run |

> **Interpretation:** The database mirror preserved a one-to-one relationship among the submitted business operation, its deterministic TigerBeetle transfer identifier, and the persisted ledger record.

## Hardened 24-Hour Runner

The production soak-test runner at `lanai-portal/server/test/production-soak-test-24h.py` now includes the following controls.

| Control | Implementation |
|---|---|
| Write safety | Requires `--allow-write`; otherwise it exits before opening the test workload. |
| Production safeguard | Requires `--acknowledge-production-write` when `--environment production` is selected. |
| Run isolation | Requires a unique `--run-id`, which is embedded in every test business key. |
| Concurrency safety | Uses `pg_try_advisory_lock` to reject a concurrent soak test. |
| Stop safety | Handles `SIGINT` and `SIGTERM`, stopping after the active batch and emitting a final integrity summary. |
| Telemetry | Emits durable, fsynced JSONL metrics including TPS, memory, database connections, lock wait count, p50/p95/p99 latency, errors, and deadlocks. |
| Fail-fast behavior | Enforces a configurable error budget (`--max-errors`, default `0`). |
| Integrity assertion | Validates row count, unique business keys, and unique mirror transfer IDs against completed operations. |

## Hardened Runner Canary

A staging-mode canary was run before the extended test.

| Metric | Result |
|---|---:|
| Duration | 36.08 seconds |
| Target / actual TPS | 100 / 99.77 |
| Operations | 3,600 |
| Errors / deadlocks | 0 / 0 |
| Unique rows / transfer keys / mirror IDs | 3,600 / 3,600 / 3,600 |
| Memory growth | 2.54 MB |
| Ungranted locks | 0 |

## Extended Sustained Verification: 500 TPS

The hardened runner then executed a **360-second sustained staging run** at a target of 500 TPS using 100 PostgreSQL connections.

| Metric | Result | Threshold | Status |
|---|---:|---:|---|
| Requested duration | 360 seconds | 360 seconds | Pass |
| Total operations | 179,000 | All submitted operations persisted | Pass |
| Actual average TPS | 496.86 | ≥ 95% of target | Pass |
| Errors | 0 | 0 | Pass |
| Deadlocks | 0 | 0 | Pass |
| Unique persisted rows | 179,000 | 179,000 | Pass |
| Unique business keys | 179,000 | 179,000 | Pass |
| Unique mirror transfer IDs | 179,000 | 179,000 | Pass |
| Active database connections | 100 | ≤ configured pool | Pass |
| Ungranted locks | 0 | 0 | Pass |
| p95 latency | 25–38 ms across samples | No rising trend | Pass |
| Memory plateau | 63.38–64.67 MB after warm-up | No continued rise | Pass |

The initial RSS transition from approximately 35 MB to approximately 63–65 MB is attributable to process warm-up and the 100-connection pool. It plateaued after warm-up and did not display a continuous upward trend over the extended run.

## Required 24-Hour Production Gate

A 24-hour test should run only against a dedicated staging/load-test cluster, not an operational financial ledger. Use a run-specific identifier and retain the generated `JSONL` metrics and summary JSON for compliance review.

```bash
cd lanai-portal
python3 server/test/production-soak-test-24h.py \
  --db "$STAGING_DATABASE_URL" \
  --environment staging \
  --run-id "$(date -u +%Y%m%d)-financial-500tps" \
  --tps 500 --hours 24 --pool-size 100 --sample-seconds 60 \
  --max-errors 0 --allow-write \
  --output-dir /var/log/lanai-soak
```

The execution is successful only if its summary reports `success: true`, zero errors, zero deadlocks, and identical counts for `total_operations`, `integrity_row_count`, `integrity_unique_keys`, and `integrity_unique_transfer_ids`.

## Conclusion

The completed short and extended staging tests show stable memory after warm-up, no latency degradation, no lock contention, no deadlocks, no pool exhaustion, and one-to-one financial-mirror integrity. The hardened test runner is ready for an unattended 24-hour **dedicated staging** execution, where it will produce the remaining long-duration evidence required for final production capacity sign-off.
