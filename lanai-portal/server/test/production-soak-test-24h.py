"""
Production 24-Hour Soak Test Script

This script is designed to be run on production infrastructure to verify
long-term stability, memory leak absence, and connection pool health.

It sustains a configurable TPS load for 24 hours, logging metrics to a JSONL
file for ingestion into Prometheus/Grafana or ELK.

Usage:
    python3 production-soak-test-24h.py --tps 500 --hours 24 --db "postgresql://..."
"""

import asyncio
import asyncpg
import hashlib
import time
import json
import argparse
import resource
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("soak-test-24h.log"),
        logging.StreamHandler()
    ]
)

def get_rss_mb():
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024

def deterministic_transfer_id(booking_id: int) -> str:
    key = f"prodsoak:booking:{booking_id}:commission:GBP"
    h = hashlib.sha256(key.encode()).hexdigest()[:32]
    return str(int(h, 16))

async def execute_saga(pool: asyncpg.Pool, booking_id: int, debit_id: int, credit_id: int):
    transfer_id = deterministic_transfer_id(booking_id)
    account_key = f"prodsoak:member:{booking_id}:payable"
    transfer_key = f"prodsoak:booking:{booking_id}:commission:GBP:150000"

    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO ledger_accounts ("accountKey", "tigerBeetleAccountId", ledger, code, "createdAt", "updatedAt")
            VALUES ($1, $2, 1, 1, NOW(), NOW())
            ON CONFLICT ("accountKey") DO NOTHING
        """, account_key, transfer_id)

        await conn.execute("""
            INSERT INTO ledger_transfers (
                "transferKey", "tigerBeetleTransferId",
                "debitLedgerAccountId", "creditLedgerAccountId",
                "amountMinor", currency, status,
                "referenceType", "referenceId", "createdAt"
            )
            VALUES ($1, $2, $3, $4, '150000', 'GBP', 'posted', 'booking', $5, NOW())
            ON CONFLICT ("transferKey") DO NOTHING
        """, transfer_key, transfer_id, debit_id, credit_id, str(booking_id))

async def run_soak_test(args):
    duration_seconds = args.hours * 3600
    total_expected = args.tps * duration_seconds
    
    logging.info(f"Starting 24-hour soak test: {args.tps} TPS for {args.hours} hours")
    logging.info(f"Expected total operations: {total_expected:,}")

    pool = await asyncpg.create_pool(
        args.db,
        min_size=20,
        max_size=args.pool_size,
        command_timeout=30,
    )

    # Setup shared accounts
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO ledger_accounts ("accountKey", "tigerBeetleAccountId", ledger, code, "createdAt", "updatedAt")
            VALUES ('prodsoak:platform:debit', '7777770001', 1, 1, NOW(), NOW())
            ON CONFLICT ("accountKey") DO NOTHING
        """)
        await conn.execute("""
            INSERT INTO ledger_accounts ("accountKey", "tigerBeetleAccountId", ledger, code, "createdAt", "updatedAt")
            VALUES ('prodsoak:platform:credit', '7777770002', 1, 1, NOW(), NOW())
            ON CONFLICT ("accountKey") DO NOTHING
        """)
        debit_id = await conn.fetchval("SELECT id FROM ledger_accounts WHERE \"accountKey\" = 'prodsoak:platform:debit'")
        credit_id = await conn.fetchval("SELECT id FROM ledger_accounts WHERE \"accountKey\" = 'prodsoak:platform:credit'")

    semaphore = asyncio.Semaphore(args.pool_size)
    metrics_file = open("soak-metrics.jsonl", "a")
    
    total_ops = 0
    total_errors = 0
    booking_counter = int(time.time()) # Ensure uniqueness across runs
    
    start_time = time.perf_counter()
    last_sample_time = start_time
    last_ops_count = 0
    window_latencies = []

    async def rate_limited_saga(bid):
        nonlocal total_ops, total_errors
        async with semaphore:
            start = time.perf_counter()
            try:
                await execute_saga(pool, bid, debit_id, credit_id)
                elapsed_ms = (time.perf_counter() - start) * 1000
                window_latencies.append(elapsed_ms)
                total_ops += 1
            except Exception as e:
                total_errors += 1
                logging.error(f"Saga failed: {e}")

    elapsed = 0
    while elapsed < duration_seconds:
        batch_start = time.perf_counter()

        tasks = []
        for _ in range(args.tps):
            booking_counter += 1
            tasks.append(rate_limited_saga(booking_counter))

        await asyncio.gather(*tasks)

        batch_elapsed = time.perf_counter() - batch_start
        if batch_elapsed < 1.0:
            await asyncio.sleep(1.0 - batch_elapsed)

        elapsed = time.perf_counter() - start_time

        # Sample metrics every 60 seconds
        if elapsed - (last_sample_time - start_time) >= 60:
            current_rss = get_rss_mb()
            active_conns = pool.get_size()
            ops_in_window = total_ops - last_ops_count
            actual_tps = ops_in_window / 60

            sorted_lat = sorted(window_latencies) if window_latencies else [0]
            p50 = sorted_lat[len(sorted_lat) // 2]
            p95 = sorted_lat[int(len(sorted_lat) * 0.95)] if len(sorted_lat) > 1 else sorted_lat[0]

            metric = {
                "timestamp": datetime.utcnow().isoformat(),
                "elapsed_seconds": int(elapsed),
                "rss_mb": round(current_rss, 1),
                "active_connections": active_conns,
                "tps_actual": round(actual_tps, 1),
                "latency_p50_ms": round(p50, 2),
                "latency_p95_ms": round(p95, 2),
                "total_operations": total_ops,
                "total_errors": total_errors
            }
            
            metrics_file.write(json.dumps(metric) + "\n")
            metrics_file.flush()
            
            logging.info(f"Elapsed: {int(elapsed/3600)}h {(int(elapsed)%3600)//60}m | TPS: {actual_tps:.0f} | RSS: {current_rss:.1f}MB | p95: {p95:.1f}ms")

            last_sample_time = time.perf_counter()
            last_ops_count = total_ops
            window_latencies = []

    metrics_file.close()
    await pool.close()
    logging.info(f"Soak test complete. Total operations: {total_ops:,}. Errors: {total_errors}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="24-Hour Production Soak Test")
    parser.add_argument("--tps", type=int, default=500, help="Target transactions per second")
    parser.add_argument("--hours", type=float, default=24.0, help="Duration in hours")
    parser.add_argument("--pool-size", type=int, default=100, help="Database connection pool size")
    parser.add_argument("--db", type=str, required=True, help="PostgreSQL connection string")
    
    args = parser.parse_args()
    asyncio.run(run_soak_test(args))
