"""Security and replay regression tests for the WhatsApp webhook bridge.

Run against an isolated PostgreSQL database after the Drizzle migration history.
"""

from __future__ import annotations

import hashlib
import hmac
import importlib
import json
import os
import sys
import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPOSITORY_ROOT))

DATABASE_URL = os.environ.get("WHATSAPP_BRIDGE_TEST_DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("WHATSAPP_BRIDGE_TEST_DATABASE_URL is required")

os.environ["DATABASE_URL"] = DATABASE_URL
os.environ["WHATSAPP_VERIFY_TOKEN"] = "test-verify-token"
os.environ["WHATSAPP_APP_SECRET"] = "test-app-secret"
os.environ["WHATSAPP_BRIDGE_INTERNAL_TOKEN"] = "test-internal-token"

from lanai_ai.pillars.whatsapp import whatsapp_ai_bridge as bridge

bridge = importlib.reload(bridge)


def signed_payload(message_id: str = "wamid.test.001", text: str = "Hello Lanai") -> tuple[bytes, dict[str, str]]:
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": message_id,
                                    "from": "+447700900123",
                                    "timestamp": "1710000000",
                                    "type": "text",
                                    "text": {"body": text},
                                }
                            ]
                        }
                    }
                ]
            }
        ],
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    digest = hmac.new(b"test-app-secret", raw, hashlib.sha256).hexdigest()
    return raw, {"Content-Type": "application/json", "X-Hub-Signature-256": f"sha256={digest}"}


class WhatsAppBridgeSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = bridge.app.test_client()

    def setUp(self) -> None:
        import psycopg

        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM "whatsapp_webhook_events"')
                cursor.execute('DELETE FROM "outbox_events" WHERE "aggregateType" = %s', ("whatsapp",))

    def _counts(self) -> tuple[int, int]:
        import psycopg

        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute('SELECT count(*) FROM "whatsapp_webhook_events"')
                events = cursor.fetchone()[0]
                cursor.execute('SELECT count(*) FROM "outbox_events" WHERE "aggregateType" = %s', ("whatsapp",))
                outbox = cursor.fetchone()[0]
        return events, outbox

    def test_valid_signed_message_is_persisted_once_with_one_outbox_event(self) -> None:
        raw, headers = signed_payload()
        response = self.client.post("/webhook/whatsapp", data=raw, headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "accepted", "accepted": 1, "duplicates": 0})
        self.assertEqual(self._counts(), (1, 1))

    def test_exact_signed_replay_is_acknowledged_without_second_outbox_event(self) -> None:
        raw, headers = signed_payload()
        first = self.client.post("/webhook/whatsapp", data=raw, headers=headers)
        second = self.client.post("/webhook/whatsapp", data=raw, headers=headers)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.get_json(), {"status": "accepted", "accepted": 0, "duplicates": 1})
        self.assertEqual(self._counts(), (1, 1))

    def test_same_provider_event_id_with_different_signed_payload_is_rejected(self) -> None:
        original, original_headers = signed_payload(message_id="wamid.conflict", text="Original")
        conflicting, conflicting_headers = signed_payload(message_id="wamid.conflict", text="Changed")
        self.assertEqual(self.client.post("/webhook/whatsapp", data=original, headers=original_headers).status_code, 200)
        response = self.client.post("/webhook/whatsapp", data=conflicting, headers=conflicting_headers)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self._counts(), (1, 1))

    def test_invalid_signature_has_no_database_side_effect(self) -> None:
        raw, headers = signed_payload()
        headers["X-Hub-Signature-256"] = "sha256:" + "0" * 64
        response = self.client.post("/webhook/whatsapp", data=raw, headers=headers)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self._counts(), (0, 0))

    def test_subscription_verification_requires_constant_time_token_match(self) -> None:
        allowed = self.client.get(
            "/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=challenge-value"
        )
        denied = self.client.get(
            "/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-value"
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.get_data(as_text=True), "challenge-value")
        self.assertEqual(denied.status_code, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
