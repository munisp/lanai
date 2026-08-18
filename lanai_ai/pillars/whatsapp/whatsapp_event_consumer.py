"""Durable, idempotent consumer for accepted WhatsApp provider events.

The public webhook performs only HMAC-authenticated persistence. This worker reads
only outbox events that the dispatcher has published, claims the linked provider
event with a database lease, invokes the bounded WhatsApp triage AI pillar, and
commits all projections plus a follow-up outbox event in one transaction.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import signal
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg

from lanai_ai.core.ollama_client import DEFAULT_MODEL, OllamaInferenceError, ask_json
from lanai_ai.core.prompts import WHATSAPP_TRIAGE_SYSTEM, whatsapp_triage_prompt

PROVIDER = "meta_whatsapp"
DATABASE_URL = os.getenv("DATABASE_URL", "")
POLL_INTERVAL_SECONDS = float(os.getenv("WHATSAPP_CONSUMER_POLL_SECONDS", "1"))
CLAIM_LEASE_SECONDS = int(os.getenv("WHATSAPP_CONSUMER_CLAIM_LEASE_SECONDS", "300"))
MAX_ATTEMPTS = int(os.getenv("WHATSAPP_CONSUMER_MAX_ATTEMPTS", "10"))
CLAIM_RENEWAL_INTERVAL_SECONDS = float(
    os.getenv(
        "WHATSAPP_CONSUMER_CLAIM_RENEWAL_INTERVAL_SECONDS",
        str(max(1, min(60, CLAIM_LEASE_SECONDS // 3))),
    )
)
CLAIM_RENEWAL_RETRY_INITIAL_SECONDS = float(
    os.getenv("WHATSAPP_CONSUMER_CLAIM_RETRY_INITIAL_SECONDS", "1")
)
CLAIM_RENEWAL_RETRY_MAX_SECONDS = float(
    os.getenv(
        "WHATSAPP_CONSUMER_CLAIM_RETRY_MAX_SECONDS",
        str(max(1, min(30, CLAIM_LEASE_SECONDS // 4))),
    )
)
CLAIM_RENEWAL_RETRY_JITTER_RATIO = float(
    os.getenv("WHATSAPP_CONSUMER_CLAIM_RETRY_JITTER_RATIO", "0.20")
)

logger = logging.getLogger("lanai.whatsapp.consumer")
_shutdown_requested = False


@dataclass(frozen=True)
class ClaimedInboundEvent:
    id: int
    provider_event_id: str
    payload: dict[str, Any]
    attempts: int
    claim_token: str


class ConsumerValidationError(ValueError):
    """Raised when a durable event or AI response does not meet the strict contract."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _require_configured(value: str, name: str) -> None:
    if not value:
        logger.error("required WhatsApp consumer configuration is unavailable name=%s", name)
        raise RuntimeError("consumer configuration unavailable")


def _retry_at(attempts: int) -> datetime:
    return _utcnow() + timedelta(seconds=min(15 * 60, 2 ** min(attempts, 10)))


def _as_dict(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ConsumerValidationError(f"{field} must be an object")
    return value


def _bounded_string(value: Any, field: str, maximum: int, *, required: bool = True) -> str:
    if not isinstance(value, str):
        raise ConsumerValidationError(f"{field} must be a string")
    normalized = value.strip()
    if (required and not normalized) or len(normalized) > maximum:
        raise ConsumerValidationError(f"{field} is invalid")
    return normalized


def _validated_triage(value: Any) -> dict[str, Any]:
    """Validate untrusted model output before it is committed to business records."""
    triage = _as_dict(value, "triage")
    intent = _bounded_string(triage.get("intent"), "intent", 32)
    urgency = _bounded_string(triage.get("urgency"), "urgency", 16)
    sentiment = _bounded_string(triage.get("sentiment"), "sentiment", 16)
    if intent not in {
        "TRAVEL_REQUEST",
        "EVENT_REQUEST",
        "LIFESTYLE_REQUEST",
        "MEMBERSHIP_ENQUIRY",
        "GENERAL_ENQUIRY",
        "COMPLAINT",
        "URGENT",
        "FOLLOW_UP",
    }:
        raise ConsumerValidationError("intent is unsupported")
    if urgency not in {"HIGH", "MEDIUM", "LOW"}:
        raise ConsumerValidationError("urgency is unsupported")
    if sentiment not in {"POSITIVE", "NEUTRAL", "NEGATIVE", "FRUSTRATED"}:
        raise ConsumerValidationError("sentiment is unsupported")

    tags = triage.get("tags", [])
    if not isinstance(tags, list) or len(tags) > 16:
        raise ConsumerValidationError("tags are invalid")
    clean_tags = [_bounded_string(tag, "tag", 64) for tag in tags]
    estimated_value = triage.get("estimated_value", 0)
    if isinstance(estimated_value, bool) or not isinstance(estimated_value, int) or not 0 <= estimated_value <= 10_000_000:
        raise ConsumerValidationError("estimated_value is invalid")

    return {
        "intent": intent,
        "urgency": urgency,
        "sentiment": sentiment,
        "summary": _bounded_string(triage.get("summary"), "summary", 1024),
        "suggested_action": _bounded_string(triage.get("suggested_action"), "suggested_action", 1024),
        "draft_reply": _bounded_string(triage.get("draft_reply"), "draft_reply", 2048),
        "tags": clean_tags,
        "estimated_value": estimated_value,
    }


def recover_stale_claims(now: datetime | None = None) -> int:
    """Return expired processing claims to the retry queue before reading work."""
    _require_configured(DATABASE_URL, "DATABASE_URL")
    now = now or _utcnow()
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE whatsapp_webhook_events
                SET status = 'failed',
                    claim_token = NULL,
                    claim_expires_at = NULL,
                    last_error = 'consumer claim lease expired before completion',
                    next_attempt_at = %s,
                    updated_at = %s
                WHERE status = 'processing'
                  AND (claim_expires_at IS NULL OR claim_expires_at <= %s)
                RETURNING id
                """,
                (now, now, now),
            )
            return len(cursor.fetchall())


def claim_next_event(now: datetime | None = None) -> ClaimedInboundEvent | None:
    """Atomically claim one published WhatsApp outbox event without long-held locks."""
    _require_configured(DATABASE_URL, "DATABASE_URL")
    now = now or _utcnow()
    lease_expires_at = now + timedelta(seconds=CLAIM_LEASE_SECONDS)
    claim_token = hashlib.sha256(os.urandom(32)).hexdigest()
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH candidate AS (
                  SELECT event.id
                  FROM whatsapp_webhook_events AS event
                  INNER JOIN outbox_events AS outbox ON outbox.id = event.outbox_event_id
                  WHERE event.status IN ('received', 'failed')
                    AND event.next_attempt_at <= %s
                    AND outbox.status = 'published'
                    AND outbox."eventType" = 'whatsapp.message.received'
                  ORDER BY event.created_at
                  FOR UPDATE OF event SKIP LOCKED
                  LIMIT 1
                )
                UPDATE whatsapp_webhook_events AS event
                SET status = 'processing',
                    attempts = event.attempts + 1,
                    claim_token = %s,
                    claim_expires_at = %s,
                    updated_at = %s
                FROM candidate
                WHERE event.id = candidate.id
                RETURNING event.id, event.provider_event_id, event.payload, event.attempts, event.claim_token
                """,
                (now, claim_token, lease_expires_at, now),
            )
            row = cursor.fetchone()
    if row is None:
        return None
    payload = _as_dict(row[2], "payload")
    return ClaimedInboundEvent(
        id=row[0],
        provider_event_id=row[1],
        payload=payload,
        attempts=row[3],
        claim_token=row[4],
    )


def renew_claim(event: ClaimedInboundEvent, now: datetime | None = None) -> bool:
    """Extend an owned processing lease without changing its attempt count.

    A false result means ownership was lost through a recovery/reclaim race. It
    is never safe for this worker to commit projections after that point.
    """
    _require_configured(DATABASE_URL, "DATABASE_URL")
    now = now or _utcnow()
    lease_expires_at = now + timedelta(seconds=CLAIM_LEASE_SECONDS)
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE whatsapp_webhook_events
                SET claim_expires_at = %s,
                    updated_at = %s
                WHERE id = %s
                  AND status = 'processing'
                  AND claim_token = %s
                RETURNING id
                """,
                (lease_expires_at, now, event.id, event.claim_token),
            )
            return cursor.fetchone() is not None


def claim_renewal_retry_delay(failures: int) -> float:
    """Return bounded symmetric-jitter exponential delay after a heartbeat DB failure."""
    if failures <= 0:
        return CLAIM_RENEWAL_INTERVAL_SECONDS
    capped = min(
        CLAIM_RENEWAL_RETRY_MAX_SECONDS,
        CLAIM_RENEWAL_RETRY_INITIAL_SECONDS * (2 ** min(failures - 1, 10)),
    )
    spread = capped * CLAIM_RENEWAL_RETRY_JITTER_RATIO
    return random.uniform(
        max(0.0, capped - spread),
        min(CLAIM_RENEWAL_RETRY_MAX_SECONDS, capped + spread),
    )


class ClaimLeaseRenewer:
    """Cooperatively renew a worker lease while an external AI call is in flight."""

    def __init__(self, event: ClaimedInboundEvent) -> None:
        self._event = event
        self._stop = threading.Event()
        self._terminal_transition = threading.Event()
        self._lost = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            name=f"whatsapp-claim-renewer-{event.id}",
            daemon=True,
        )

    @property
    def lost(self) -> bool:
        return self._lost.is_set()

    def start(self) -> None:
        self._thread.start()

    def begin_terminal_transition(self) -> None:
        """Stop heartbeats before a short, token-fenced final state transition.

        A renewal that races after a successful completion would otherwise see a
        processed row, report an ownership-loss warning, and create misleading
        operational noise. The final transaction retains the authoritative
        token/state fence and reports a genuine loss to the main worker.
        """
        self._terminal_transition.set()
        self._stop.set()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=max(1.0, CLAIM_RENEWAL_INTERVAL_SECONDS + 1.0))

    def _run(self) -> None:
        failures = 0
        delay = CLAIM_RENEWAL_INTERVAL_SECONDS
        while not self._stop.wait(delay):
            try:
                if not renew_claim(self._event):
                    if not self._terminal_transition.is_set():
                        self._lost.set()
                        logger.warning("WhatsApp consumer claim ownership was lost during renewal")
                    return
                failures = 0
                delay = CLAIM_RENEWAL_INTERVAL_SECONDS
            except (psycopg.Error, RuntimeError) as error:
                failures += 1
                delay = claim_renewal_retry_delay(failures)
                # A failed heartbeat does not establish ownership loss. It is
                # retried sooner with full jitter to avoid synchronized retries
                # across replicas while retaining several chances before expiry.
                logger.warning(
                    "WhatsApp consumer claim renewal failed type=%s retry_seconds=%.3f",
                    type(error).__name__,
                    delay,
                )


def _member_context(cursor: psycopg.Cursor[Any], sender: str) -> tuple[int | None, str, str]:
    """Resolve at most one active member; ambiguous or unknown senders stay unlinked."""
    cursor.execute(
        """
        SELECT id, name
        FROM members
        WHERE phone = %s AND active = true
        ORDER BY id
        LIMIT 2
        """,
        (sender,),
    )
    matches = cursor.fetchall()
    if len(matches) != 1:
        return None, "Unknown Client", ""
    member_id, member_name = matches[0]
    cursor.execute(
        """
        SELECT COALESCE(summary, body)
        FROM communication_timeline
        WHERE member_id = %s
        ORDER BY created_at DESC
        LIMIT 5
        """,
        (member_id,),
    )
    history = "\n".join(str(row[0])[:512] for row in cursor.fetchall() if row[0])[:2_000]
    return member_id, str(member_name), history


def _payload_fields(payload: dict[str, Any]) -> tuple[str, str, str]:
    if payload.get("provider") != PROVIDER:
        raise ConsumerValidationError("provider is invalid")
    event_id = _bounded_string(payload.get("providerEventId"), "providerEventId", 256)
    sender = _bounded_string(payload.get("sender"), "sender", 32)
    message_text = _bounded_string(payload.get("messageText"), "messageText", 8192)
    return event_id, sender, message_text


def _sentiment_for_timeline(value: str, urgency: str) -> str:
    if urgency == "HIGH":
        return "urgent"
    return {"POSITIVE": "positive", "NEUTRAL": "neutral", "NEGATIVE": "negative", "FRUSTRATED": "negative"}[value]


def complete_claim(event: ClaimedInboundEvent, triage: dict[str, Any], started_at: datetime) -> bool:
    """Persist all projections and follow-up work atomically while still owning the claim."""
    _require_configured(DATABASE_URL, "DATABASE_URL")
    provider_event_id, sender, message_text = _payload_fields(event.payload)
    if provider_event_id != event.provider_event_id:
        raise ConsumerValidationError("provider event identity mismatch")
    request_id = f"whatsapp-triage-{hashlib.sha256(event.provider_event_id.encode('utf-8')).hexdigest()[:40]}"
    input_digest = hashlib.sha256(
        json.dumps(event.payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    now = _utcnow()
    latency_ms = max(0, int((now - started_at).total_seconds() * 1000))

    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            # Lock and verify ownership before any projection insert. This makes
            # completion mutually exclusive with stale-lease recovery and avoids
            # duplicate timeline/inference projections if an old worker resumes.
            cursor.execute(
                """
                SELECT id
                FROM whatsapp_webhook_events
                WHERE id = %s AND status = 'processing' AND claim_token = %s
                FOR UPDATE
                """,
                (event.id, event.claim_token),
            )
            if cursor.fetchone() is None:
                return False

            member_id, _member_name, _history = _member_context(cursor, sender)
            if member_id is not None:
                cursor.execute(
                    """
                    INSERT INTO communication_timeline
                      ("memberId", "communicationType", channel, direction, subject, body, summary, sentiment, "externalId")
                    VALUES (%s, 'whatsapp', 'whatsapp', 'inbound', 'Inbound WhatsApp', %s, %s, %s, %s)
                    """,
                    (
                        member_id,
                        message_text,
                        triage["summary"],
                        _sentiment_for_timeline(triage["sentiment"], triage["urgency"]),
                        event.provider_event_id,
                    ),
                )

            cursor.execute(
                """
                INSERT INTO ai_inference_runs
                  ("requestId", capability, provider, model, "memberId", "inputDigest", "inputMetadata", "outputMetadata", status, "latencyMs", "completedAt")
                VALUES (%s, 'whatsapp_triage', 'ollama', %s, %s, %s, %s::jsonb, %s::jsonb, 'succeeded', %s, %s)
                ON CONFLICT ("requestId") DO NOTHING
                """,
                (
                    request_id,
                    DEFAULT_MODEL,
                    member_id,
                    input_digest,
                    json.dumps({"providerEventId": event.provider_event_id, "senderHash": hashlib.sha256(sender.encode("utf-8")).hexdigest()}),
                    json.dumps(triage),
                    latency_ms,
                    now,
                ),
            )
            cursor.execute(
                """
                INSERT INTO outbox_events
                  ("eventId", "aggregateType", "aggregateId", "eventType", payload, "idempotencyKey")
                VALUES (%s, 'whatsapp', %s, 'whatsapp.triaged', %s::jsonb, %s)
                ON CONFLICT ("idempotencyKey") DO NOTHING
                """,
                (
                    f"whatsapp-triaged-{hashlib.sha256(event.provider_event_id.encode('utf-8')).hexdigest()[:40]}",
                    event.provider_event_id,
                    json.dumps(
                        {
                            "provider": PROVIDER,
                            "providerEventId": event.provider_event_id,
                            "memberId": member_id,
                            "triage": triage,
                        }
                    ),
                    f"whatsapp:triaged:{hashlib.sha256(event.provider_event_id.encode('utf-8')).hexdigest()[:40]}",
                ),
            )
            cursor.execute(
                """
                UPDATE whatsapp_webhook_events
                SET status = 'processed',
                    processed_at = %s,
                    claim_token = NULL,
                    claim_expires_at = NULL,
                    last_error = NULL,
                    updated_at = %s
                WHERE id = %s
                  AND status = 'processing'
                  AND claim_token = %s
                RETURNING id
                """,
                (now, now, event.id, event.claim_token),
            )
            return cursor.fetchone() is not None


def fail_claim(event: ClaimedInboundEvent, error: Exception) -> bool:
    """Release a claimed event for bounded retry, or dead-letter it after exhaustion."""
    _require_configured(DATABASE_URL, "DATABASE_URL")
    now = _utcnow()
    status = "dead_letter" if event.attempts >= MAX_ATTEMPTS else "failed"
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE whatsapp_webhook_events
                SET status = %s,
                    claim_token = NULL,
                    claim_expires_at = NULL,
                    last_error = %s,
                    next_attempt_at = %s,
                    updated_at = %s
                WHERE id = %s
                  AND status = 'processing'
                  AND claim_token = %s
                RETURNING id
                """,
                (
                    status,
                    str(error)[:4_000],
                    _retry_at(event.attempts),
                    now,
                    event.id,
                    event.claim_token,
                ),
            )
            return cursor.fetchone() is not None


def process_next_event() -> bool:
    """Process at most one event; returns whether work was claimed."""
    recover_stale_claims()
    event = claim_next_event()
    if event is None:
        return False
    started_at = _utcnow()
    renewer = ClaimLeaseRenewer(event)
    renewer.start()
    try:
        _provider_event_id, sender, message_text = _payload_fields(event.payload)
        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                _member_id, member_name, history = _member_context(cursor, sender)
        triage = _validated_triage(
            ask_json(
                whatsapp_triage_prompt(message_text, member_name, history),
                system=WHATSAPP_TRIAGE_SYSTEM,
            )
        )
        if renewer.lost:
            logger.warning("WhatsApp consumer claim lost before persistence")
        else:
            renewer.begin_terminal_transition()
            if not complete_claim(event, triage, started_at):
                logger.warning("WhatsApp consumer claim lost before persistence")
            else:
                logger.info("WhatsApp event triaged and persisted")
    except (ConsumerValidationError, OllamaInferenceError, psycopg.Error, RuntimeError) as error:
        logger.error("WhatsApp consumer processing failed type=%s", type(error).__name__)
        try:
            renewer.begin_terminal_transition()
            fail_claim(event, error)
        except (psycopg.Error, RuntimeError):
            # The active lease will make this safe to recover after the database is available.
            logger.error("WhatsApp consumer could not record failure; lease recovery required")
    finally:
        renewer.stop()
    return True


def _request_shutdown(_signum: int, _frame: Any) -> None:
    global _shutdown_requested
    _shutdown_requested = True


def run_forever() -> None:
    _require_configured(DATABASE_URL, "DATABASE_URL")
    if (
        POLL_INTERVAL_SECONDS <= 0
        or CLAIM_LEASE_SECONDS <= 1
        or MAX_ATTEMPTS <= 0
        or CLAIM_RENEWAL_INTERVAL_SECONDS <= 0
        or CLAIM_RENEWAL_INTERVAL_SECONDS >= CLAIM_LEASE_SECONDS
        or CLAIM_RENEWAL_RETRY_INITIAL_SECONDS <= 0
        or CLAIM_RENEWAL_RETRY_MAX_SECONDS < CLAIM_RENEWAL_RETRY_INITIAL_SECONDS
        or CLAIM_RENEWAL_RETRY_MAX_SECONDS >= CLAIM_LEASE_SECONDS
        or not 0 <= CLAIM_RENEWAL_RETRY_JITTER_RATIO < 1
    ):
        raise RuntimeError("consumer timing configuration is invalid")
    signal.signal(signal.SIGTERM, _request_shutdown)
    signal.signal(signal.SIGINT, _request_shutdown)
    logger.info("Starting durable WhatsApp event consumer")
    while not _shutdown_requested:
        try:
            if not process_next_event():
                time.sleep(POLL_INTERVAL_SECONDS)
        except (psycopg.Error, RuntimeError) as error:
            logger.error("WhatsApp consumer cycle unavailable type=%s", type(error).__name__)
            time.sleep(min(30.0, POLL_INTERVAL_SECONDS * 5))


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    run_forever()
