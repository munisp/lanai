"""Real PostgreSQL multiprocessing coverage for WhatsApp consumer claim concurrency.

Each child is spawned with a clean interpreter and opens its own psycopg
connection. The tests therefore exercise PostgreSQL locking rather than Python
thread scheduling or mocked database behavior.
"""

from __future__ import annotations

import hashlib
import json
import multiprocessing
import os
import queue
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import psycopg
import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPOSITORY_ROOT))

DATABASE_URL = os.environ.get("WHATSAPP_BRIDGE_TEST_DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("WHATSAPP_BRIDGE_TEST_DATABASE_URL is required")


# These functions must stay at module scope for multiprocessing's spawn method.
def _claim_in_child(
    database_url: str,
    ready: multiprocessing.queues.Queue[Any],
    start: multiprocessing.synchronize.Event,
    results: multiprocessing.queues.Queue[Any],
) -> None:
    try:
        os.environ["DATABASE_URL"] = database_url
        os.environ["WHATSAPP_CONSUMER_CLAIM_LEASE_SECONDS"] = "300"
        from lanai_ai.pillars.whatsapp import whatsapp_event_consumer as consumer

        ready.put({"pid": os.getpid(), "state": "ready"})
        if not start.wait(timeout=15):
            results.put({"error": "start barrier timed out"})
            return
        began = time.monotonic()
        claimed = consumer.claim_next_event()
        results.put(
            {
                "claimed_id": claimed.id if claimed else None,
                "claim_token": claimed.claim_token if claimed else None,
                "elapsed_seconds": time.monotonic() - began,
            }
        )
    except Exception as error:  # pragma: no cover - returned to the parent assertion
        results.put({"error": f"{type(error).__name__}: {error}"})


def _hold_row_lock_in_child(
    database_url: str,
    provider_event_id: str,
    locked: multiprocessing.queues.Queue[Any],
    release: multiprocessing.synchronize.Event,
    results: multiprocessing.queues.Queue[Any],
) -> None:
    try:
        with psycopg.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id
                    FROM whatsapp_webhook_events
                    WHERE provider = 'meta_whatsapp' AND provider_event_id = %s
                    FOR UPDATE
                    """,
                    (provider_event_id,),
                )
                if cursor.fetchone() is None:
                    results.put({"error": "holder could not find event"})
                    return
                locked.put({"pid": os.getpid(), "state": "locked"})
                if not release.wait(timeout=15):
                    results.put({"error": "release barrier timed out"})
                    return
        results.put({"state": "released"})
    except Exception as error:  # pragma: no cover - returned to the parent assertion
        results.put({"error": f"{type(error).__name__}: {error}"})


def _get_result(results: multiprocessing.queues.Queue[Any]) -> dict[str, Any]:
    try:
        result = results.get(timeout=15)
    except queue.Empty as error:  # pragma: no cover - timeout makes the failure diagnostic
        raise AssertionError("child process did not report a result") from error
    assert "error" not in result, result.get("error")
    return result


@pytest.fixture(autouse=True)
def _clean_concurrency_rows() -> None:
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM ai_inference_runs WHERE capability = 'whatsapp_triage'")
            # This concurrency suite must be the only eligible consumer workload.
            # Other integration files also create published Meta events; leaving
            # those rows in place would let the losing process claim unrelated work.
            cursor.execute("DELETE FROM whatsapp_webhook_events WHERE provider = 'meta_whatsapp'")
            cursor.execute('DELETE FROM outbox_events WHERE "eventType" = %s', ("whatsapp.triaged",))
            cursor.execute(
                "DELETE FROM whatsapp_webhook_events WHERE provider_event_id LIKE 'concurrency-%'"
            )
            cursor.execute(
                'DELETE FROM outbox_events WHERE "aggregateType" = %s',
                ("whatsapp-concurrency-test",),
            )
    yield
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM ai_inference_runs WHERE capability = 'whatsapp_triage'")
            # This concurrency suite must be the only eligible consumer workload.
            # Other integration files also create published Meta events; leaving
            # those rows in place would let the losing process claim unrelated work.
            cursor.execute("DELETE FROM whatsapp_webhook_events WHERE provider = 'meta_whatsapp'")
            cursor.execute('DELETE FROM outbox_events WHERE "eventType" = %s', ("whatsapp.triaged",))
            cursor.execute(
                "DELETE FROM whatsapp_webhook_events WHERE provider_event_id LIKE 'concurrency-%'"
            )
            cursor.execute(
                'DELETE FROM outbox_events WHERE "aggregateType" = %s',
                ("whatsapp-concurrency-test",),
            )


def _seed_published_event() -> tuple[int, str]:
    suffix = uuid.uuid4().hex
    provider_event_id = f"concurrency-{suffix}"
    payload = {
        "provider": "meta_whatsapp",
        "providerEventId": provider_event_id,
        "sender": "+15551234567",
        "messageText": "Concurrent claim test",
    }
    payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    payload_hash = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO outbox_events
                  ("eventId", "aggregateType", "aggregateId", "eventType", payload, status, "idempotencyKey", "publishedAt")
                VALUES (%s, 'whatsapp-concurrency-test', %s, 'whatsapp.message.received', %s::jsonb, 'published', %s, now())
                RETURNING id
                """,
                (
                    f"concurrency-inbound-{suffix}",
                    provider_event_id,
                    payload_json,
                    f"concurrency:inbound:{suffix}",
                ),
            )
            outbox_event_id = cursor.fetchone()[0]
            cursor.execute(
                """
                INSERT INTO whatsapp_webhook_events
                  (provider, provider_event_id, payload_sha256, payload, outbox_event_id)
                VALUES ('meta_whatsapp', %s, %s, %s::jsonb, %s)
                RETURNING id
                """,
                (provider_event_id, payload_hash, payload_json, outbox_event_id),
            )
            event_id = cursor.fetchone()[0]
    return event_id, provider_event_id


def _assert_clean_exit(*processes: multiprocessing.Process) -> None:
    for process in processes:
        process.join(timeout=15)
        assert not process.is_alive(), f"child {process.pid} did not exit"
        assert process.exitcode == 0, f"child {process.pid} exited with {process.exitcode}"


def test_two_spawned_consumers_claim_one_event_once() -> None:
    """Two independent consumers race for one published event; only one obtains it."""
    event_id, _provider_event_id = _seed_published_event()
    context = multiprocessing.get_context("spawn")
    ready = context.Queue()
    start = context.Event()
    results = context.Queue()
    workers = [
        context.Process(target=_claim_in_child, args=(DATABASE_URL, ready, start, results))
        for _ in range(2)
    ]
    for worker in workers:
        worker.start()
    for _ in workers:
        assert _get_result(ready)["state"] == "ready"
    start.set()
    claims = [_get_result(results) for _ in workers]
    _assert_clean_exit(*workers)

    claimed_ids = [claim["claimed_id"] for claim in claims]
    assert claimed_ids.count(event_id) == 1
    assert claimed_ids.count(None) == 1
    assert len({claim["claim_token"] for claim in claims if claim["claim_token"]}) == 1

    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT status, attempts, claim_token, claim_expires_at
                FROM whatsapp_webhook_events
                WHERE id = %s
                """,
                (event_id,),
            )
            status, attempts, claim_token, claim_expires_at = cursor.fetchone()
    assert status == "processing"
    assert attempts == 1
    assert claim_token
    assert claim_expires_at is not None


def test_active_worker_renews_its_claim_without_creating_another_attempt(monkeypatch: pytest.MonkeyPatch) -> None:
    """A live heartbeat extends the existing lease before recovery can reclaim it."""
    event_id, _provider_event_id = _seed_published_event()
    os.environ["DATABASE_URL"] = DATABASE_URL
    from lanai_ai.pillars.whatsapp import whatsapp_event_consumer as consumer

    monkeypatch.setattr(consumer, "CLAIM_LEASE_SECONDS", 2)
    monkeypatch.setattr(consumer, "CLAIM_RENEWAL_INTERVAL_SECONDS", 0.05)
    claimed = consumer.claim_next_event()
    assert claimed is not None
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT claim_expires_at FROM whatsapp_webhook_events WHERE id = %s",
                (event_id,),
            )
            initial_expiry = cursor.fetchone()[0]

    renewer = consumer.ClaimLeaseRenewer(claimed)
    renewer.start()
    try:
        time.sleep(0.15)
    finally:
        renewer.stop()

    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT status, attempts, claim_token, claim_expires_at
                FROM whatsapp_webhook_events
                WHERE id = %s
                """,
                (event_id,),
            )
            status, attempts, claim_token, renewed_expiry = cursor.fetchone()
    assert not renewer.lost
    assert status == "processing"
    assert attempts == 1
    assert claim_token == claimed.claim_token
    assert renewed_expiry > initial_expiry


def test_renewal_retry_delay_uses_bounded_exponential_backoff_with_jitter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    os.environ["DATABASE_URL"] = DATABASE_URL
    from lanai_ai.pillars.whatsapp import whatsapp_event_consumer as consumer

    monkeypatch.setattr(consumer, "CLAIM_RENEWAL_INTERVAL_SECONDS", 60.0)
    monkeypatch.setattr(consumer, "CLAIM_RENEWAL_RETRY_INITIAL_SECONDS", 1.0)
    monkeypatch.setattr(consumer, "CLAIM_RENEWAL_RETRY_MAX_SECONDS", 8.0)
    monkeypatch.setattr(consumer, "CLAIM_RENEWAL_RETRY_JITTER_RATIO", 0.20)
    ranges: list[tuple[float, float]] = []

    def choose_upper(lower: float, upper: float) -> float:
        ranges.append((lower, upper))
        return upper

    monkeypatch.setattr(consumer.random, "uniform", choose_upper)
    assert consumer.claim_renewal_retry_delay(0) == 60.0
    assert consumer.claim_renewal_retry_delay(1) == 1.2
    assert consumer.claim_renewal_retry_delay(2) == 2.4
    assert consumer.claim_renewal_retry_delay(3) == 4.8
    assert consumer.claim_renewal_retry_delay(4) == 8.0
    assert consumer.claim_renewal_retry_delay(10) == 8.0
    assert ranges == [(0.8, 1.2), (1.6, 2.4), (3.2, 4.8), (6.4, 8.0), (6.4, 8.0)]


def test_terminal_transition_suppresses_benign_lost_claim_warning(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    os.environ["DATABASE_URL"] = DATABASE_URL
    from lanai_ai.pillars.whatsapp import whatsapp_event_consumer as consumer

    monkeypatch.setattr(consumer, "CLAIM_RENEWAL_INTERVAL_SECONDS", 0.01)
    entered = threading.Event()
    release = threading.Event()

    def complete_after_terminal_transition(_event: Any) -> bool:
        entered.set()
        assert release.wait(timeout=5)
        return False

    monkeypatch.setattr(consumer, "renew_claim", complete_after_terminal_transition)
    renewer = consumer.ClaimLeaseRenewer(
        consumer.ClaimedInboundEvent(
            id=999_001,
            provider_event_id="concurrency-terminal-transition",
            payload={},
            attempts=1,
            claim_token="test-token",
        )
    )
    with caplog.at_level("WARNING", logger="lanai.whatsapp.consumer"):
        renewer.start()
        assert entered.wait(timeout=5)
        renewer.begin_terminal_transition()
        release.set()
        renewer.stop()
    assert not renewer.lost
    assert not any("ownership was lost during renewal" in record.message for record in caplog.records)


def test_complete_claim_rejects_a_stale_token_before_any_projection() -> None:
    event_id, _provider_event_id = _seed_published_event()
    os.environ["DATABASE_URL"] = DATABASE_URL
    from lanai_ai.pillars.whatsapp import whatsapp_event_consumer as consumer

    claimed = consumer.claim_next_event()
    assert claimed is not None
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE whatsapp_webhook_events
                SET status = 'failed', claim_token = NULL, claim_expires_at = NULL
                WHERE id = %s
                """,
                (event_id,),
            )

    triage = {
        "intent": "TRAVEL_REQUEST",
        "urgency": "MEDIUM",
        "sentiment": "NEUTRAL",
        "summary": "Client is requesting a luxury beach holiday.",
        "suggested_action": "Ask the advisor to confirm dates.",
        "draft_reply": "I will prepare tailored options.",
        "tags": ["beach"],
        "estimated_value": 25000,
    }
    assert not consumer.complete_claim(claimed, triage, consumer._utcnow())
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM ai_inference_runs WHERE capability = 'whatsapp_triage'")
            assert cursor.fetchone()[0] == 0
            cursor.execute("SELECT count(*) FROM outbox_events WHERE \"eventType\" = 'whatsapp.triaged'")
            assert cursor.fetchone()[0] == 0


def test_claim_skips_a_row_locked_by_another_process_without_waiting() -> None:
    """Verify the actual SKIP LOCKED behavior while another database session holds the row lock."""
    _event_id, provider_event_id = _seed_published_event()
    context = multiprocessing.get_context("spawn")
    locked = context.Queue()
    release = context.Event()
    holder_results = context.Queue()
    contender_ready = context.Queue()
    contender_start = context.Event()
    contender_results = context.Queue()
    holder = context.Process(
        target=_hold_row_lock_in_child,
        args=(DATABASE_URL, provider_event_id, locked, release, holder_results),
    )
    contender = context.Process(
        target=_claim_in_child,
        args=(DATABASE_URL, contender_ready, contender_start, contender_results),
    )
    holder.start()
    assert _get_result(locked)["state"] == "locked"
    contender.start()
    assert _get_result(contender_ready)["state"] == "ready"
    contender_start.set()
    contender_result = _get_result(contender_results)
    release.set()
    holder_result = _get_result(holder_results)
    _assert_clean_exit(holder, contender)

    assert contender_result["claimed_id"] is None
    # A missing SKIP LOCKED clause would wait for the holder's 15-second release barrier.
    assert contender_result["elapsed_seconds"] < 2.0
    assert holder_result == {"state": "released"}
