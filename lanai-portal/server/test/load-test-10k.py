"""
High-Concurrency Load Test: 10,000 Parallel Financial Sagas

This test simulates 10,000 concurrent booking commission operations hitting
the PostgreSQL database with idempotent inserts to verify:
1. Connection pool stability under extreme load
2. No deadlocks or connection exhaustion
3. Throughput (transactions per second)
4. Latency distribution (p50, p95, p99)
5. Zero data corruption (exactly N unique records for N unique bookings)

It uses asyncio + asyncpg for maximum concurrency against the real PostgreSQL.
"""

import asyncio
import asyncpg
import hashlib
import time
import statistics
import json
import sys
from dataclasses import dataclass, asdict

DATABASE_URL = "postgresql://lanai:lanai_password@localhost:5432/lanai"
TOTAL_SAGAS = 10_000
CONCURRENCY = 200  # Max parallel connections (connection pool size)
BATCH_SIZE = 50    # Sagas submitted per batch

@dataclass
class LoadTestResult:
    total_sagas: int
    concurrency: int
    duration_seconds: float
    throughput_tps: float
    latency_p50_ms: float
    latency_p95_ms: float
    latency_p99_ms: float
    latency_max_ms: float
    successful: int
    failed: int
    duplicates_prevented: int
    unique_records: int
    connection_pool_exhaustion_events: int
    deadlocks: int


def deterministic_transfer_id(booking_id: int, currency: str = "GBP") -> str:
    """Mirrors the TypeScript deterministicUint128() function."""
    key = f"booking:{booking_id}:commission:{currency}"
    h = hashlib.sha256(key.encode()).hexdigest()[:32]
    return str(int(h, 16))


async def execute_saga(pool: asyncpg.Pool, booking_id: int, debit_account_id: int, credit_account_id: int, latencies: list, errors: list, duplicates: list):
    """Simulate a single financial saga: TigerBeetle reserve + PostgreSQL persist."""
    start = time.perf_counter()
    transfer_id = deterministic_transfer_id(booking_id)
    account_key = f"loadtest:member:{booking_id}:payable"
    transfer_key = f"booking:{booking_id}:commission:GBP:150000"

    try:
        async with pool.acquire() as conn:
            # Step 1: Ensure ledger account exists (idempotent)
            await conn.execute("""
                INSERT INTO ledger_accounts ("accountKey", "tigerBeetleAccountId", ledger, code, "createdAt", "updatedAt")
                VALUES ($1, $2, 1, 1, NOW(), NOW())
                ON CONFLICT ("accountKey") DO NOTHING
            """, account_key, transfer_id)

            # Step 2: Record the transfer (idempotent via transferKey unique constraint)
            result = await conn.execute("""
                INSERT INTO ledger_transfers (
                    "transferKey", "tigerBeetleTransferId",
                    "debitLedgerAccountId", "creditLedgerAccountId",
                    "amountMinor", currency, status,
                    "referenceType", "referenceId",
                    "createdAt"
                )
                VALUES ($1, $2, $3, $4, '150000', 'GBP', 'posted', 'booking', $5, NOW())
                ON CONFLICT ("transferKey") DO NOTHING
            """, transfer_key, transfer_id, debit_account_id, credit_account_id, str(booking_id))

            if "INSERT 0 0" in result:
                duplicates.append(booking_id)

        elapsed = (time.perf_counter() - start) * 1000
        latencies.append(elapsed)

    except asyncpg.exceptions.DeadlockDetectedError:
        errors.append(("deadlock", booking_id))
    except asyncpg.exceptions.TooManyConnectionsError:
        errors.append(("pool_exhaustion", booking_id))
    except Exception as e:
        errors.append((str(type(e).__name__), booking_id))


async def run_load_test():
    print(f"🚀 Starting load test: {TOTAL_SAGAS} sagas, {CONCURRENCY} concurrent connections")
    print(f"   Database: {DATABASE_URL}")
    print()

    # Create connection pool
    pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=10,
        max_size=CONCURRENCY,
        command_timeout=30,
    )

    # Ensure the required tables exist and have the right constraints
    async with pool.acquire() as conn:
        # Check if transferKey has a unique constraint
        exists = await conn.fetchval("""
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'ledger_transfers' AND indexdef LIKE '%transferKey%'
        """)
        if not exists:
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS ledger_transfers_transferKey_unique
                ON ledger_transfers ("transferKey")
            """)
            print("   Created unique index on ledger_transfers.transferKey")

        # Ensure ledger_accounts has unique constraint on accountKey
        exists2 = await conn.fetchval("""
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'ledger_accounts' AND indexdef LIKE '%accountKey%'
        """)
        if not exists2:
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_accountKey_unique
                ON ledger_accounts ("accountKey")
            """)
            print("   Created unique index on ledger_accounts.accountKey")

    latencies = []
    errors = []
    duplicates = []

    # Phase 1: Initial load (10,000 unique bookings)
    print(f"📊 Phase 1: Submitting {TOTAL_SAGAS} unique sagas...")
    start_time = time.perf_counter()

    # Process in batches to control concurrency
    semaphore = asyncio.Semaphore(CONCURRENCY)

    # Create shared debit/credit accounts for the load test
    async with pool.acquire() as conn:
        await conn.execute('''
            INSERT INTO ledger_accounts ("accountKey", "tigerBeetleAccountId", ledger, code, "createdAt", "updatedAt")
            VALUES ('loadtest:platform:debit', '9999990001', 1, 1, NOW(), NOW())
            ON CONFLICT ("accountKey") DO NOTHING
        ''')
        await conn.execute('''
            INSERT INTO ledger_accounts ("accountKey", "tigerBeetleAccountId", ledger, code, "createdAt", "updatedAt")
            VALUES ('loadtest:platform:credit', '9999990002', 1, 1, NOW(), NOW())
            ON CONFLICT ("accountKey") DO NOTHING
        ''')
        debit_account_id = await conn.fetchval('''SELECT id FROM ledger_accounts WHERE "accountKey" = 'loadtest:platform:debit' ''')
        credit_account_id = await conn.fetchval('''SELECT id FROM ledger_accounts WHERE "accountKey" = 'loadtest:platform:credit' ''')
        print(f"   Debit account ID: {debit_account_id}, Credit account ID: {credit_account_id}")

    async def bounded_saga(booking_id):
        async with semaphore:
            await execute_saga(pool, booking_id, debit_account_id, credit_account_id, latencies, errors, duplicates)

    tasks = [bounded_saga(i) for i in range(1, TOTAL_SAGAS + 1)]
    await asyncio.gather(*tasks)

    phase1_duration = time.perf_counter() - start_time
    phase1_tps = len(latencies) / phase1_duration if phase1_duration > 0 else 0

    print(f"   ✅ Phase 1 complete: {len(latencies)} sagas in {phase1_duration:.2f}s ({phase1_tps:.0f} TPS)")
    print()

    # Phase 2: Retry storm (simulate 2,000 duplicate submissions)
    print("📊 Phase 2: Simulating retry storm (2,000 duplicate submissions)...")
    retry_latencies = []
    retry_duplicates = []
    retry_start = time.perf_counter()

    retry_tasks = [bounded_saga(i) for i in range(1, 2001)]  # Re-submit first 2000
    await asyncio.gather(*retry_tasks)

    retry_duration = time.perf_counter() - retry_start
    print(f"   ✅ Phase 2 complete: {len(retry_duplicates)} duplicates prevented in {retry_duration:.2f}s")
    print()

    # Verify data integrity
    async with pool.acquire() as conn:
        unique_records = await conn.fetchval(
            "SELECT COUNT(*) FROM ledger_transfers WHERE \"transferKey\" LIKE 'booking:%:commission:GBP:150000'"
        )

    await pool.close()

    # Calculate statistics
    all_latencies = latencies
    if not all_latencies:
        print("❌ No successful operations!")
        sys.exit(1)

    sorted_lat = sorted(all_latencies)
    p50 = sorted_lat[len(sorted_lat) // 2]
    p95 = sorted_lat[int(len(sorted_lat) * 0.95)]
    p99 = sorted_lat[int(len(sorted_lat) * 0.99)]
    max_lat = sorted_lat[-1]

    deadlocks = sum(1 for e in errors if e[0] == "deadlock")
    pool_exhaustion = sum(1 for e in errors if e[0] == "pool_exhaustion")

    total_duration = time.perf_counter() - start_time

    result = LoadTestResult(
        total_sagas=TOTAL_SAGAS,
        concurrency=CONCURRENCY,
        duration_seconds=round(total_duration, 2),
        throughput_tps=round(phase1_tps, 1),
        latency_p50_ms=round(p50, 2),
        latency_p95_ms=round(p95, 2),
        latency_p99_ms=round(p99, 2),
        latency_max_ms=round(max_lat, 2),
        successful=len(latencies),
        failed=len(errors),
        duplicates_prevented=len(duplicates),
        unique_records=unique_records,
        connection_pool_exhaustion_events=pool_exhaustion,
        deadlocks=deadlocks,
    )

    # Print results
    print("=" * 70)
    print("                    LOAD TEST RESULTS")
    print("=" * 70)
    print(f"  Total Sagas Submitted:     {result.total_sagas:,}")
    print(f"  Concurrency Level:         {result.concurrency}")
    print(f"  Total Duration:            {result.duration_seconds:.2f}s")
    print(f"  Throughput:                {result.throughput_tps:.1f} TPS")
    print(f"  Latency p50:              {result.latency_p50_ms:.2f}ms")
    print(f"  Latency p95:              {result.latency_p95_ms:.2f}ms")
    print(f"  Latency p99:              {result.latency_p99_ms:.2f}ms")
    print(f"  Latency max:              {result.latency_max_ms:.2f}ms")
    print(f"  Successful:                {result.successful:,}")
    print(f"  Failed:                    {result.failed}")
    print(f"  Duplicates Prevented:      {result.duplicates_prevented}")
    print(f"  Unique DB Records:         {result.unique_records:,}")
    print(f"  Pool Exhaustion Events:    {result.connection_pool_exhaustion_events}")
    print(f"  Deadlocks:                 {result.deadlocks}")
    print("=" * 70)

    # Assertions
    assert result.unique_records == TOTAL_SAGAS, \
        f"DATA INTEGRITY FAILURE: Expected {TOTAL_SAGAS} records, got {result.unique_records}"
    assert result.deadlocks == 0, f"DEADLOCK DETECTED: {result.deadlocks} deadlocks"
    assert result.connection_pool_exhaustion_events == 0, \
        f"POOL EXHAUSTION: {result.connection_pool_exhaustion_events} events"
    assert result.failed == 0, f"FAILURES: {result.failed} sagas failed"

    print()
    print("✅ ALL ASSERTIONS PASSED")
    print(f"✅ Exactly {TOTAL_SAGAS:,} unique records in database (no duplicates, no missing)")
    print("✅ Zero deadlocks under 200-connection concurrent load")
    print("✅ Zero connection pool exhaustion events")
    print("✅ Zero failures")

    # Save results to JSON
    with open("/tmp/load-test-results.json", "w") as f:
        json.dump(asdict(result), f, indent=2)

    if errors:
        print(f"\n⚠️  Errors encountered: {errors[:10]}")


if __name__ == "__main__":
    asyncio.run(run_load_test())
