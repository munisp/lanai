"""Lanai WhatsApp bridge.

Inbound Meta events are authenticated over the exact raw request body and are
persisted transactionally before acknowledgement. The bridge deliberately does
not execute CRM or AI side effects in the webhook request: a separate trusted
consumer must process the durable outbox event idempotently.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import psycopg
from flask import Flask, Response, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

REPOSITORY_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
import sys

if REPOSITORY_ROOT not in sys.path:
    sys.path.insert(0, REPOSITORY_ROOT)

from lanai_ai.core.ollama_client import OllamaInferenceError, ask_json
from lanai_ai.core.prompts import WHATSAPP_TRIAGE_SYSTEM, whatsapp_triage_prompt

PROVIDER = "meta_whatsapp"
MAX_BODY_BYTES = int(os.getenv("WHATSAPP_WEBHOOK_MAX_BYTES", "131072"))
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "")
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET", "")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
BRIDGE_INTERNAL_TOKEN = os.getenv("WHATSAPP_BRIDGE_INTERNAL_TOKEN", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")
PORT = int(os.getenv("PORT", "5555"))
BIND_HOST = os.getenv("BIND_HOST", "127.0.0.1")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("lanai.whatsapp")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_BODY_BYTES


@dataclass(frozen=True)
class InboundMessage:
    provider_event_id: str
    sender: str
    message_type: str
    message_text: str
    received_at: str | None


class WebhookValidationError(ValueError):
    """Raised for a syntactically valid but unsupported provider event."""


def _redacted_id(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def _require_configured(secret: str, name: str) -> None:
    if not secret:
        logger.error("required WhatsApp bridge secret is unavailable name=%s", name)
        raise RuntimeError("bridge configuration unavailable")


def _is_valid_signature(raw_body: bytes, signature: str) -> bool:
    """Verify Meta's sha256 HMAC without parsing or transforming the body."""
    if not WHATSAPP_APP_SECRET or not signature.startswith("sha256="):
        return False
    supplied_digest = signature.removeprefix("sha256=")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", supplied_digest):
        return False
    expected_digest = hmac.new(
        WHATSAPP_APP_SECRET.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(supplied_digest.lower(), expected_digest)


def _parse_messages(payload: Any) -> list[InboundMessage]:
    if not isinstance(payload, dict) or payload.get("object") != "whatsapp_business_account":
        raise WebhookValidationError("unexpected provider object")

    parsed: list[InboundMessage] = []
    entries = payload.get("entry", [])
    if not isinstance(entries, list):
        raise WebhookValidationError("entry must be an array")

    for entry in entries:
        if not isinstance(entry, dict):
            raise WebhookValidationError("entry item must be an object")
        changes = entry.get("changes", [])
        if not isinstance(changes, list):
            raise WebhookValidationError("changes must be an array")
        for change in changes:
            value = change.get("value", {}) if isinstance(change, dict) else {}
            messages = value.get("messages", []) if isinstance(value, dict) else []
            if not isinstance(messages, list):
                raise WebhookValidationError("messages must be an array")
            for message in messages:
                if not isinstance(message, dict):
                    raise WebhookValidationError("message must be an object")
                event_id = message.get("id")
                sender = message.get("from")
                message_type = message.get("type", "text")
                if not isinstance(event_id, str) or not (1 <= len(event_id) <= 256):
                    raise WebhookValidationError("message id is invalid")
                if not isinstance(sender, str) or not re.fullmatch(r"[0-9+]{4,32}", sender):
                    raise WebhookValidationError("message sender is invalid")
                if not isinstance(message_type, str) or len(message_type) > 32:
                    raise WebhookValidationError("message type is invalid")

                if message_type == "text":
                    text = message.get("text", {}).get("body", "")
                    if not isinstance(text, str) or not text.strip() or len(text) > 8192:
                        raise WebhookValidationError("message text is invalid")
                else:
                    # Store a bounded typed marker. Binary media is never downloaded or
                    # reflected into logs from the inbound webhook path.
                    text = f"[{message_type} message received]"

                timestamp = message.get("timestamp")
                parsed.append(
                    InboundMessage(
                        provider_event_id=event_id,
                        sender=sender,
                        message_type=message_type,
                        message_text=text,
                        received_at=timestamp if isinstance(timestamp, str) and len(timestamp) <= 32 else None,
                    )
                )
    return parsed


def _event_payload(message: InboundMessage) -> dict[str, Any]:
    return {
        "provider": PROVIDER,
        "providerEventId": message.provider_event_id,
        "sender": message.sender,
        "messageType": message.message_type,
        "messageText": message.message_text,
        "providerTimestamp": message.received_at,
    }


def _persist_inbound_event(message: InboundMessage) -> str:
    """Atomically persist provider identity and durable outbox work.

    Returns ``accepted`` for a newly stored event, ``duplicate`` for an exact
    provider replay, and raises on a conflicting provider-event payload. No CRM
    or AI work occurs before this transaction commits.
    """
    _require_configured(DATABASE_URL, "DATABASE_URL")
    payload = _event_payload(message)
    canonical_payload = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    payload_sha256 = hashlib.sha256(canonical_payload).hexdigest()
    event_hash = hashlib.sha256(f"{PROVIDER}:{message.provider_event_id}".encode("utf-8")).hexdigest()
    outbox_event_id = f"whatsapp-{event_hash[:48]}"
    idempotency_key = f"whatsapp:{event_hash[:48]}"

    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            # Create the outbox row first because the webhook event has a
            # non-null foreign key to it. The enclosing transaction rolls both
            # writes back if either insert cannot be completed.
            cursor.execute(
                """
                INSERT INTO outbox_events
                  ("eventId", "aggregateType", "aggregateId", "eventType", payload, "idempotencyKey")
                VALUES (%s, 'whatsapp', %s, 'whatsapp.message.received', %s::jsonb, %s)
                ON CONFLICT ("idempotencyKey") DO NOTHING
                RETURNING id
                """,
                (outbox_event_id, message.provider_event_id, json.dumps(payload), idempotency_key),
            )
            outbox_row = cursor.fetchone()
            if outbox_row is None:
                # A replay must have a matching durable provider-event record.
                # If it does not, fail closed: an orphaned outbox identity must
                # be reconciled instead of silently accepting a new event.
                cursor.execute(
                    """
                    SELECT payload_sha256
                    FROM whatsapp_webhook_events
                    WHERE provider = %s AND provider_event_id = %s
                    """,
                    (PROVIDER, message.provider_event_id),
                )
                existing = cursor.fetchone()
                if existing is None:
                    raise RuntimeError("durable outbox conflict without provider event")
                if not hmac.compare_digest(existing[0], payload_sha256):
                    raise WebhookValidationError("provider event ID payload conflict")
                return "duplicate"

            cursor.execute(
                """
                INSERT INTO whatsapp_webhook_events
                  (provider, provider_event_id, payload_sha256, payload, status, outbox_event_id)
                VALUES (%s, %s, %s, %s::jsonb, 'received', %s)
                ON CONFLICT (provider, provider_event_id) DO NOTHING
                RETURNING id
                """,
                (
                    PROVIDER,
                    message.provider_event_id,
                    payload_sha256,
                    json.dumps(payload),
                    outbox_row[0],
                ),
            )
            event_row = cursor.fetchone()
            if event_row is None:
                # This can occur only under a concurrent duplicate race. Abort
                # the transaction so the newly inserted outbox row is rolled
                # back and then let the provider retry against the winner.
                raise RuntimeError("concurrent provider event insert conflict")
    return "accepted"


def _require_internal_authorization() -> Response | None:
    if not BRIDGE_INTERNAL_TOKEN:
        logger.error("bridge internal authorization token is unavailable")
        return Response("Service unavailable", status=503)
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer ") or not hmac.compare_digest(
        header.removeprefix("Bearer "), BRIDGE_INTERNAL_TOKEN
    ):
        return Response("Unauthorized", status=401)
    return None


@app.errorhandler(RequestEntityTooLarge)
def _request_too_large(_error: RequestEntityTooLarge) -> Response:
    return Response("Payload too large", status=413)


@app.after_request
def _security_headers(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.route("/webhook/whatsapp", methods=["GET"])
def verify_webhook() -> Response:
    try:
        _require_configured(WHATSAPP_VERIFY_TOKEN, "WHATSAPP_VERIFY_TOKEN")
    except RuntimeError:
        return Response("Service unavailable", status=503)

    mode = request.args.get("hub.mode", "")
    token = request.args.get("hub.verify_token", "")
    challenge = request.args.get("hub.challenge", "")
    if (
        mode == "subscribe"
        and challenge
        and len(challenge) <= 1024
        and hmac.compare_digest(token, WHATSAPP_VERIFY_TOKEN)
    ):
        logger.info("WhatsApp webhook subscription verified")
        return Response(challenge, status=200, mimetype="text/plain")
    return Response("Forbidden", status=403)


@app.route("/webhook/whatsapp", methods=["POST"])
def receive_message() -> Response:
    raw_body = request.get_data(cache=True, as_text=False)
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not _is_valid_signature(raw_body, signature):
        logger.warning("WhatsApp webhook signature rejected")
        return Response("Unauthorized", status=401)

    try:
        payload = json.loads(raw_body)
        messages = _parse_messages(payload)
    except (json.JSONDecodeError, WebhookValidationError):
        logger.warning("WhatsApp webhook payload rejected after signature validation")
        return Response("Bad request", status=400)

    accepted = 0
    duplicates = 0
    try:
        for message in messages:
            result = _persist_inbound_event(message)
            if result == "accepted":
                accepted += 1
            else:
                duplicates += 1
    except WebhookValidationError:
        logger.error("WhatsApp webhook provider event identity conflict")
        return Response("Conflict", status=409)
    except (psycopg.Error, RuntimeError):
        logger.error("WhatsApp webhook durable persistence failed")
        return Response("Service unavailable", status=503)

    logger.info("WhatsApp webhook accepted events=%d duplicates=%d", accepted, duplicates)
    return jsonify({"status": "accepted", "accepted": accepted, "duplicates": duplicates}), 200


@app.route("/api/send-whatsapp", methods=["POST"])
def send_whatsapp() -> Response:
    authorization_error = _require_internal_authorization()
    if authorization_error:
        return authorization_error
    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_ID:
        return Response("Service unavailable", status=503)

    data = request.get_json(silent=True) or {}
    recipient = data.get("to")
    message = data.get("message")
    if not isinstance(recipient, str) or not re.fullmatch(r"[0-9+]{4,32}", recipient):
        return Response("Bad request", status=400)
    if not isinstance(message, str) or not message.strip() or len(message) > 4096:
        return Response("Bad request", status=400)

    import requests

    try:
        response = requests.post(
            f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_ID}/messages",
            headers={"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}", "Content-Type": "application/json"},
            json={"messaging_product": "whatsapp", "to": recipient, "type": "text", "text": {"body": message}},
            timeout=(3.05, 15),
        )
    except requests.RequestException:
        logger.error("WhatsApp outbound provider request failed")
        return Response("Upstream unavailable", status=502)
    if response.status_code >= 400:
        logger.warning("WhatsApp outbound provider rejected request status=%d", response.status_code)
        return Response("Upstream rejected request", status=502)
    return jsonify({"status": "accepted"}), 202


@app.route("/api/ai-draft-reply", methods=["POST"])
def ai_draft_reply() -> Response:
    authorization_error = _require_internal_authorization()
    if authorization_error:
        return authorization_error
    data = request.get_json(silent=True) or {}
    message = data.get("message", "")
    client_name = data.get("client_name", "")
    context = data.get("context", "")
    if (
        not isinstance(message, str)
        or not message.strip()
        or len(message) > 8192
        or not isinstance(client_name, str)
        or not client_name.strip()
        or len(client_name) > 256
        or not isinstance(context, str)
        or len(context) > 4096
    ):
        return Response("Bad request", status=400)
    try:
        triage = ask_json(
            whatsapp_triage_prompt(message, client_name, context),
            system=WHATSAPP_TRIAGE_SYSTEM,
        )
    except OllamaInferenceError:
        logger.error("WhatsApp draft inference unavailable")
        return Response("Service unavailable", status=503)
    return jsonify(triage), 200


@app.route("/health", methods=["GET"])
def health() -> Response:
    # Deliberately minimal; detailed component health belongs to authenticated
    # internal monitoring, not a bridge endpoint.
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    logger.info("Starting secure Lanai WhatsApp bridge")
    app.run(host=BIND_HOST, port=PORT, debug=False)
