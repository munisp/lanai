"""
Production-safe 24-hour financial-saga soak test.

This runner is deliberately fail-closed. It refuses to write financial test
records to a production database unless the caller explicitly acknowledges the
risk and supplies a unique run identifier. Use a dedicated staging/load-test
cluster whenever possible.

Examples:
  # Recommended: dedicated staging database
  python3 production-soak-test-24h.py \
    --db "$DATABASE_URL" --environment staging --run-id 20260812-a \
    --tps 500 --hours 24 --allow-write

  # Production is intentionally opt-in and requires an explicit acknowledgement.
  python3 production-soak-test-24h.py \
    --db "$DATABASE_URL" --environment production --run-id 20260812-a \
    --tps 500 --hours 24 --allow-write --acknowledge-production-write

Outputs:
  soak-<run-id>.jsonl      Per-minute operational telemetry
  soak-<run-id>-summary.json  Final integrity and stability summary
"""

from __future__ import annotations

import argparse
import asyncio
import asyncpg
import hashlib
import json
import logging
import os
import resource
import signal
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STOP_REQUESTED = asyncio.Event()
ADVISORY_LOCK_KEY = 912_202_608


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def deterministic_transfer_id(run_id: str, booking_id: int) -> str:
    key = f"soak:{run_id}:booking:{booking_id}:commission:GBP"
    return str(int(hashlib.sha256(key.encode()).hexdigest()[:32], 16))


def install_signal_handlers() -> None:
    def request_stop(signum: int, _frame: Any) -> None:
        logging.warning("Received signal %s; stopping after the current batch.", signum)
        STOP_REQUESTED.set()

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)


@dataclass
class Summary:
    run_id: str
    environment: str
    started_at: str
    ended_at: str
    requested_seconds: int
    elapsed_seconds: float
    target_tps: int
    total_operations: int
    total_errors: int
    total_deadlocks: int
    integrity_row_count: int
    integrity_unique_keys: int
    integrity_unique_transfer_ids: int
    avg_tps: float
    memory_start_mb: float
    memory_end_mb: float
    memory_peak_mb: float
    memory_growth_mb: float
    stopped_by_signal: bool
    success: bool


async def sample_database_health(conn: asyncpg.Connection) -> dict[str, int]:
    row = await conn.fetchrow(
        """
        SELECT
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
          (SELECT count(*) FROM pg_locks WHERE NOT granted) AS ungranted_locks
        """
    )
    return dict(row)


async def validate_args(args: argparse.Namespace) -> None:
    if not args.allow_write:
        raise RuntimeError("Refusing to run without --allow-write.")
    if not args.run_id or any(char.isspace() for char in args.run_id):
        raise RuntimeError("--run-id must be a non-empty, whitespace-free identifier.")
    if args.environment == "production" and not args.acknowledge_production_write:
        raise RuntimeError(
            "Refusing production writes. Use a dedicated load-test cluster, or explicitly add "
            "--acknowledge-production-write after formal change approval."
        )
    if args.tps < 1 or args.tps > 5_000:
        raise RuntimeError("--tps must be between 1 and 5000.")
    if args.hours <= 0 or args.hours > 48:
        raise RuntimeError("--hours must be greater than 0 and no more than 48.")
    if args.pool_size < 5 or args.pool_size > 400:
        raise RuntimeError("--pool-size must be between 5 and 400.")


async def run_soak_test(args: argparse.Namespace) -> Summary:
    await validate_args(args)
    install_signal_handlers()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = output_dir / f"soak-{args.run_id}.jsonl"
    summary_path = output_dir / f"soak-{args.run_id}-summary.json"

    logging.info(
        "Starting run=%s env=%s target=%s TPS duration=%s hours pool=%s",
        args.run_id, args.environment, args.tps, args.hours, args.pool_size,
    )

    pool = await asyncpg.create_pool(
        args.db, min_size=min(20, args.pool_size), max_size=args.pool_size, command_timeout=30
    )
    lock_conn = await pool.acquire()
    lock_held = False
    started_at = utc_now()
    start_monotonic = time.perf_counter()
    total_operations = total_errors = total_deadlocks = 0
    memory_start = get_rss_mb()
    memory_peak = memory_start
    metric_file = metrics_path.open("a", encoding="utf-8")

    try:
        lock_held = await lock_conn.fetchval("SELECT pg_try_advisory_lock($1)", ADVISORY_LOCK_KEY)
        if not lock_held:
            raise RuntimeError("Another soak test is already running (PostgreSQL advisory lock held).")

        async with pool.acquire() as conn:
            # The two fixed accounts are load-test-only accounts. The run ID is encoded
            # in every mutable business key so production data can be independently audited.
            await conn.execute(
                """
                INSERT INTO ledger_accounts ("accountKey", "tigerBeetleAccountId", ledger, code, "createdAt", "updatedAt")
                VALUES ('soak:platform:debit', '8888880001', 1, 1, NOW(), NOW())
                ON CONFLICT ("accountKey") DO NOTHING
                """
            )
            await conn.execute(
                """
                INSERT INTO ledger_accounts ("accountKey", "tigerBeetleAccountId", ledger, code, "createdAt", "updatedAt")
                VALUES ('soak:platform:credit', '8888880002', 1, 1, NOW(), NOW())
                ON CONFLICT ("accountKey") DO NOTHING
                """
            )
            debit_id = await conn.fetchval("SELECT id FROM ledger_accounts WHERE \"accountKey\"='soak:platform:debit'")
            credit_id = await conn.fetchval("SELECT id FROM ledger_accounts WHERE \"accountKey\"='soak:platform:credit'")

        semaphore = asyncio.Semaphore(args.pool_size)
        duration_seconds = int(args.hours * 3600)
        deadline = start_monotonic + duration_seconds
        booking_id = int(time.time() * 1_000)
        last_sample = start_monotonic
        last_sample_operations = 0
        latencies: list[float] = []

        async def execute_saga(current_booking_id: int) -> None:
            nonlocal total_operations, total_errors, total_deadlocks
            async with semaphore:
                started = time.perf_counter()
                try:
                    transfer_id = deterministic_transfer_id(args.run_id, current_booking_id)
                    transfer_key = f"soak:{args.run_id}:booking:{current_booking_id}:commission:GBP:150000"
                    account_key = f"soak:{args.run_id}:member:{current_booking_id}:payable"
                    async with pool.acquire() as conn:
                        await conn.execute(
                            """
                            INSERT INTO ledger_accounts ("accountKey", "tigerBeetleAccountId", ledger, code, "createdAt", "updatedAt")
                            VALUES ($1, $2, 1, 1, NOW(), NOW())
                            ON CONFLICT ("accountKey") DO NOTHING
                            """, account_key, transfer_id,
                        )
                        await conn.execute(
                            """
                            INSERT INTO ledger_transfers
                              ("transferKey", "tigerBeetleTransferId", "debitLedgerAccountId", "creditLedgerAccountId",
                               "amountMinor", currency, status, "referenceType", "referenceId", "createdAt")
                            VALUES ($1, $2, $3, $4, '150000', 'GBP', 'posted', 'soak_test', $5, NOW())
                            ON CONFLICT ("transferKey") DO NOTHING
                            """, transfer_key, transfer_id, debit_id, credit_id, str(current_booking_id),
                        )
                    total_operations += 1
                    latencies.append((time.perf_counter() - started) * 1_000)
                except asyncpg.exceptions.DeadlockDetectedError:
                    total_deadlocks += 1
                    total_errors += 1
                except Exception as exc:  # Count and continue until error threshold triggers.
                    total_errors += 1
                    logging.exception("Saga failure: %s", exc)

        while time.perf_counter() < deadline and not STOP_REQUESTED.is_set():
            second_started = time.perf_counter()
            tasks = []
            for _ in range(args.tps):
                booking_id += 1
                tasks.append(execute_saga(booking_id))
            await asyncio.gather(*tasks)

            elapsed_this_second = time.perf_counter() - second_started
            if elapsed_this_second < 1:
                await asyncio.sleep(1 - elapsed_this_second)

            if total_errors > args.max_errors:
                raise RuntimeError(f"Error budget exceeded: {total_errors}>{args.max_errors}")

            now = time.perf_counter()
            if now - last_sample >= args.sample_seconds:
                async with pool.acquire() as conn:
                    db_health = await sample_database_health(conn)
                window_ops = total_operations - last_sample_operations
                ordered = sorted(latencies) or [0.0]
                metric = {
                    "timestamp": utc_now(), "run_id": args.run_id,
                    "elapsed_seconds": round(now - start_monotonic, 2),
                    "tps_actual": round(window_ops / (now - last_sample), 2),
                    "rss_mb": round(get_rss_mb(), 2),
                    "pool_size": pool.get_size(),
                    "active_db_connections": db_health["active_connections"],
                    "ungranted_locks": db_health["ungranted_locks"],
                    "p50_ms": round(ordered[len(ordered)//2], 2),
                    "p95_ms": round(ordered[min(len(ordered)-1, int(len(ordered)*.95))], 2),
                    "p99_ms": round(ordered[min(len(ordered)-1, int(len(ordered)*.99))], 2),
                    "total_operations": total_operations, "total_errors": total_errors,
                    "total_deadlocks": total_deadlocks,
                }
                metric_file.write(json.dumps(metric) + "\n")
                metric_file.flush()
                os.fsync(metric_file.fileno())
                logging.info("metric=%s", json.dumps(metric, separators=(",", ":")))
                memory_peak = max(memory_peak, metric["rss_mb"])
                last_sample, last_sample_operations, latencies = now, total_operations, []

        elapsed = time.perf_counter() - start_monotonic
        run_prefix = f"soak:{args.run_id}:booking:%"
        async with pool.acquire() as conn:
            integrity = await conn.fetchrow(
                """
                SELECT count(*) AS rows, count(DISTINCT "transferKey") AS keys,
                       count(DISTINCT "tigerBeetleTransferId") AS transfers
                FROM ledger_transfers WHERE "transferKey" LIKE $1
                """, run_prefix,
            )

        success = (
            total_errors == 0 and total_deadlocks == 0
            and integrity["rows"] == total_operations
            and integrity["keys"] == total_operations
            and integrity["transfers"] == total_operations
        )
        summary = Summary(
            run_id=args.run_id, environment=args.environment, started_at=started_at,
            ended_at=utc_now(), requested_seconds=duration_seconds, elapsed_seconds=round(elapsed, 2),
            target_tps=args.tps, total_operations=total_operations, total_errors=total_errors,
            total_deadlocks=total_deadlocks, integrity_row_count=integrity["rows"],
            integrity_unique_keys=integrity["keys"], integrity_unique_transfer_ids=integrity["transfers"],
            avg_tps=round(total_operations / elapsed, 2) if elapsed else 0.0,
            memory_start_mb=round(memory_start, 2), memory_end_mb=round(get_rss_mb(), 2),
            memory_peak_mb=round(memory_peak, 2), memory_growth_mb=round(get_rss_mb()-memory_start, 2),
            stopped_by_signal=STOP_REQUESTED.is_set(), success=success,
        )
        summary_path.write_text(json.dumps(asdict(summary), indent=2) + "\n", encoding="utf-8")
        logging.info("Summary written to %s; success=%s", summary_path, success)
        if not success:
            raise RuntimeError(f"Soak integrity assertion failed; inspect {summary_path}")
        return summary
    finally:
        metric_file.close()
        if lock_held:
            await lock_conn.execute("SELECT pg_advisory_unlock($1)", ADVISORY_LOCK_KEY)
        await pool.release(lock_conn)
        await pool.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Production-safe 24-hour financial-saga soak test")
    parser.add_argument("--db", required=True, help="PostgreSQL DSN for a dedicated staging/load-test database")
    parser.add_argument("--run-id", required=True, help="Unique test run identifier; appears in all business keys")
    parser.add_argument("--environment", choices=("staging", "loadtest", "production"), required=True)
    parser.add_argument("--tps", type=int, default=500)
    parser.add_argument("--hours", type=float, default=24.0)
    parser.add_argument("--pool-size", type=int, default=100)
    parser.add_argument("--sample-seconds", type=int, default=60)
    parser.add_argument("--max-errors", type=int, default=0, help="Abort after this many activity errors")
    parser.add_argument("--output-dir", default="./soak-output")
    parser.add_argument("--allow-write", action="store_true")
    parser.add_argument("--acknowledge-production-write", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        completed = asyncio.run(run_soak_test(parse_args()))
        print(json.dumps(asdict(completed), indent=2))
    except Exception as error:
        logging.error("Soak test failed: %s", error)
        sys.exit(1)
