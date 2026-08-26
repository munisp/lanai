"""PostgreSQL-backed regression tests for the private WhatsApp Prometheus exporter."""

from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path

import psycopg
import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPOSITORY_ROOT))

DATABASE_URL = os.environ.get("WHATSAPP_BRIDGE_TEST_DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("WHATSAPP_BRIDGE_TEST_DATABASE_URL is required")
os.environ["DATABASE_URL"] = DATABASE_URL

from lanai_ai.pillars.whatsapp import whatsapp_consumer_metrics as metrics  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_metric_events() -> None:
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM whatsapp_webhook_events WHERE provider_event_id LIKE 'metrics-%'"
            )
            cursor.execute(
                'DELETE FROM outbox_events WHERE "aggregateType" = %s',
                ("whatsapp-metrics-test",),
            )
    yield
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM whatsapp_webhook_events WHERE provider_event_id LIKE 'metrics-%'"
            )
            cursor.execute(
                'DELETE FROM outbox_events WHERE "aggregateType" = %s',
                ("whatsapp-metrics-test",),
            )


def _seed_event(status: str, *, expired: bool = False) -> None:
    suffix = uuid.uuid4().hex
    provider_event_id = f"metrics-{suffix}"
    payload = {
        "provider": "meta_whatsapp",
        "providerEventId": provider_event_id,
        "sender": "+15559876543",
        "messageText": "Private metric fixture content must never enter Prometheus.",
    }
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO outbox_events
                  ("eventId", "aggregateType", "aggregateId", "eventType", payload, status, "idempotencyKey", "publishedAt")
                VALUES (%s, 'whatsapp-metrics-test', %s, 'whatsapp.message.received', %s::jsonb, 'published', %s, now())
                RETURNING id
                """,
                (
                    f"metrics-source-{suffix}",
                    provider_event_id,
                    json.dumps(payload),
                    f"metrics:source:{suffix}",
                ),
            )
            outbox_id = cursor.fetchone()[0]
            cursor.execute(
                """
                INSERT INTO whatsapp_webhook_events
                  (provider, provider_event_id, payload_sha256, payload, status, attempts, next_attempt_at, claim_token, claim_expires_at, outbox_event_id)
                VALUES ('meta_whatsapp', %s, %s, %s::jsonb, %s, 1, now() - interval '10 minutes', %s, %s, %s)
                """,
                (
                    provider_event_id,
                    "b" * 64,
                    json.dumps(payload),
                    status,
                    "metric-claim" if expired else None,
                    "2000-01-01T00:00:00Z" if expired else None,
                    outbox_id,
                ),
            )


def test_metrics_exporter_emits_aggregate_queue_health_without_message_data() -> None:
    _seed_event("failed")
    _seed_event("dead_letter")
    _seed_event("processing", expired=True)
    metrics.increment("processed_total")
    metrics.increment("lease_renewal_failures_total", 2)

    body = metrics.render_metrics()

    assert 'lanai_whatsapp_consumer_events{status="failed"} 1' in body
    assert 'lanai_whatsapp_consumer_events{status="dead_letter"} 1' in body
    assert "lanai_whatsapp_consumer_processing_lease_expired 1" in body
    assert "lanai_whatsapp_consumer_processed_total" in body
    assert "lanai_whatsapp_consumer_lease_renewal_failures_total 2" in body
    assert "Private metric fixture content" not in body
    assert "+15559876543" not in body
    assert "metrics-" not in body


def test_metrics_exporter_rejects_unbounded_counter_names() -> None:
    with pytest.raises(ValueError, match="unsupported WhatsApp consumer metric"):
        metrics.increment("untrusted-provider-event-id")
