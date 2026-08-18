"""Durable WhatsApp bridge and consumer regression tests.

Run against an isolated PostgreSQL database after all Drizzle migrations. These
cover signed exact replay, changed-payload identity conflicts, consumer
idempotency, and consumer stale-claim recovery.
"""

from __future__ import annotations

import importlib
import os
import sys
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPOSITORY_ROOT))

DATABASE_URL = os.environ.get("WHATSAPP_BRIDGE_TEST_DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("WHATSAPP_BRIDGE_TEST_DATABASE_URL is required")

os.environ["DATABASE_URL"] = DATABASE_URL
os.environ["WHATSAPP_VERIFY_TOKEN"] = "test-verify-token"
os.environ["WHATSAPP_APP_SECRET"] = "test-app-secret"
os.environ["WHATSAPP_BRIDGE_INTERNAL_TOKEN"] = "test-internal-token"
os.environ["WHATSAPP_CONSUMER_CLAIM_LEASE_SECONDS"] = "300"
os.environ["WHATSAPP_CONSUMER_MAX_ATTEMPTS"] = "10"

from lanai_ai.pillars.whatsapp import whatsapp_ai_bridge as bridge
from lanai_ai.pillars.whatsapp import whatsapp_event_consumer as consumer
from lanai_ai.pillars.whatsapp.test_whatsapp_ai_bridge import signed_payload

bridge = importlib.reload(bridge)
consumer = importlib.reload(consumer)

TRIAGE = {
    "intent": "TRAVEL_REQUEST",
    "urgency": "MEDIUM",
    "sentiment": "NEUTRAL",
    "summary": "Client is requesting a luxury beach holiday.",
    "suggested_action": "Ask the advisor to confirm preferred travel dates.",
    "draft_reply": "Thank you for your message. I will prepare tailored beach options for you.",
    "tags": ["beach", "luxury"],
    "estimated_value": 25000,
}


class WhatsAppBridgeAndConsumerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = bridge.app.test_client()

    def setUp(self) -> None:
        import psycopg

        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM "communication_timeline"')
                cursor.execute('DELETE FROM "ai_inference_runs"')
                cursor.execute('DELETE FROM "whatsapp_webhook_events"')
                cursor.execute('DELETE FROM "outbox_events" WHERE "aggregateType" = %s', ("whatsapp",))

    def _publish_inbound_event(self) -> None:
        import psycopg

        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE outbox_events
                    SET status = 'published', "publishedAt" = now(), "claimToken" = NULL, "claimExpiresAt" = NULL
                    WHERE "aggregateType" = 'whatsapp'
                      AND "eventType" = 'whatsapp.message.received'
                    """
                )

    def _count(self, table: str, where: str = "") -> int:
        import psycopg

        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"SELECT count(*) FROM {table} {where}")
                return int(cursor.fetchone()[0])

    def test_exact_signed_replay_preserves_one_event_hash_and_one_outbox_identity(self) -> None:
        raw, headers = signed_payload(message_id="wamid.replay.hash", text="Please arrange a villa")
        self.assertEqual(self.client.post("/webhook/whatsapp", data=raw, headers=headers).status_code, 200)
        replay = self.client.post("/webhook/whatsapp", data=raw, headers=headers)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.get_json(), {"status": "accepted", "accepted": 0, "duplicates": 1})

        import psycopg

        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT event.payload_sha256, event.outbox_event_id, outbox."idempotencyKey"
                    FROM whatsapp_webhook_events AS event
                    INNER JOIN outbox_events AS outbox ON outbox.id = event.outbox_event_id
                    WHERE event.provider = 'meta_whatsapp' AND event.provider_event_id = 'wamid.replay.hash'
                    """
                )
                rows = cursor.fetchall()
        self.assertEqual(len(rows), 1)
        payload_hash, outbox_id, idempotency_key = rows[0]
        self.assertRegex(payload_hash, r"^[a-f0-9]{64}$")
        self.assertIsInstance(outbox_id, int)
        self.assertTrue(idempotency_key.startswith("whatsapp:"))
        self.assertEqual(self._count('"whatsapp_webhook_events"'), 1)
        self.assertEqual(self._count('"outbox_events"', 'WHERE "aggregateType" = \'whatsapp\''), 1)

    def test_changed_signed_payload_for_same_provider_identity_never_overwrites_saved_hash(self) -> None:
        original, original_headers = signed_payload(message_id="wamid.hash.conflict", text="Original travel request")
        changed, changed_headers = signed_payload(message_id="wamid.hash.conflict", text="Changed travel request")
        self.assertEqual(self.client.post("/webhook/whatsapp", data=original, headers=original_headers).status_code, 200)

        import psycopg

        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT payload_sha256 FROM whatsapp_webhook_events WHERE provider_event_id = %s",
                    ("wamid.hash.conflict",),
                )
                original_hash = cursor.fetchone()[0]

        conflict = self.client.post("/webhook/whatsapp", data=changed, headers=changed_headers)
        self.assertEqual(conflict.status_code, 409)
        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT payload_sha256, payload ->> 'messageText' FROM whatsapp_webhook_events WHERE provider_event_id = %s",
                    ("wamid.hash.conflict",),
                )
                persisted_hash, persisted_text = cursor.fetchone()
        self.assertEqual(persisted_hash, original_hash)
        self.assertEqual(persisted_text, "Original travel request")
        self.assertEqual(self._count('"outbox_events"', 'WHERE "aggregateType" = \'whatsapp\''), 1)

    def test_published_event_is_triaged_once_and_emits_one_follow_up_outbox_event(self) -> None:
        raw, headers = signed_payload(message_id="wamid.consumer.once", text="I would like a Maldives escape")
        self.assertEqual(self.client.post("/webhook/whatsapp", data=raw, headers=headers).status_code, 200)
        self._publish_inbound_event()

        with patch.object(consumer, "ask_json", return_value=TRIAGE) as inference:
            self.assertTrue(consumer.process_next_event())
            self.assertFalse(consumer.process_next_event())
        self.assertEqual(inference.call_count, 1)
        self.assertEqual(
            self._count('"whatsapp_webhook_events"', "WHERE status = 'processed'"),
            1,
        )
        self.assertEqual(
            self._count('"ai_inference_runs"', "WHERE capability = 'whatsapp_triage' AND status = 'succeeded'"),
            1,
        )
        self.assertEqual(
            self._count('"outbox_events"', "WHERE \"eventType\" = 'whatsapp.triaged'"),
            1,
        )

    def test_invalid_ai_output_is_retried_without_a_triage_projection(self) -> None:
        raw, headers = signed_payload(message_id="wamid.consumer.invalid-ai", text="Plan something special")
        self.assertEqual(self.client.post("/webhook/whatsapp", data=raw, headers=headers).status_code, 200)
        self._publish_inbound_event()

        with patch.object(consumer, "ask_json", return_value={"intent": "UNKNOWN"}):
            self.assertTrue(consumer.process_next_event())
        self.assertEqual(
            self._count('"whatsapp_webhook_events"', "WHERE status = 'failed' AND attempts = 1"),
            1,
        )
        self.assertEqual(
            self._count('"ai_inference_runs"', "WHERE capability = 'whatsapp_triage'"),
            0,
        )
        self.assertEqual(
            self._count('"outbox_events"', "WHERE \"eventType\" = 'whatsapp.triaged'"),
            0,
        )

    def test_expired_consumer_claim_is_recovered_and_can_be_processed_once(self) -> None:
        raw, headers = signed_payload(message_id="wamid.consumer.stale", text="Please book a restaurant")
        self.assertEqual(self.client.post("/webhook/whatsapp", data=raw, headers=headers).status_code, 200)
        self._publish_inbound_event()
        claimed = consumer.claim_next_event()
        self.assertIsNotNone(claimed)

        import psycopg

        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE whatsapp_webhook_events
                    SET claim_expires_at = %s
                    WHERE provider_event_id = %s
                    """,
                    (consumer._utcnow() - timedelta(seconds=1), "wamid.consumer.stale"),
                )
        self.assertEqual(consumer.recover_stale_claims(), 1)
        with patch.object(consumer, "ask_json", return_value=TRIAGE) as inference:
            self.assertTrue(consumer.process_next_event())
        self.assertEqual(inference.call_count, 1)
        self.assertEqual(
            self._count('"whatsapp_webhook_events"', "WHERE status = 'processed'"),
            1,
        )
        self.assertEqual(self._count('"outbox_events"', "WHERE \"eventType\" = 'whatsapp.triaged'"), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
