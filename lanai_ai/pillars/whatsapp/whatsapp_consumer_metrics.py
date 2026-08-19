"""Private Prometheus exporter for the durable WhatsApp event consumer.

Metrics intentionally contain only aggregate queue state and process counters.
No provider IDs, sender identifiers, message content, AI output, tokens, or
unbounded error strings are emitted as labels or metric values.
"""

from __future__ import annotations

import logging
import os
import threading
from collections import Counter
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Final

import psycopg

logger = logging.getLogger("lanai.whatsapp.consumer.metrics")

_DATABASE_URL = os.getenv("DATABASE_URL", "")
_METRICS_PORT = int(os.getenv("WHATSAPP_CONSUMER_METRICS_PORT", "9465"))

_ALLOWED_COUNTERS: Final = {
    "claims_total",
    "processed_total",
    "failed_total",
    "dead_lettered_total",
    "stale_claim_recoveries_total",
    "lease_renewals_total",
    "lease_renewal_failures_total",
    "lease_ownership_losses_total",
    "manual_replays_total",
}

_lock = threading.Lock()
_counters: Counter[str] = Counter()
_server: ThreadingHTTPServer | None = None


def increment(name: str, value: int = 1) -> None:
    """Increment a fixed-name, bounded-cardinality process counter."""
    if name not in _ALLOWED_COUNTERS:
        raise ValueError("unsupported WhatsApp consumer metric")
    if value < 0:
        raise ValueError("metric increment must be non-negative")
    with _lock:
        _counters[name] += value


def _snapshot_counters() -> dict[str, int]:
    with _lock:
        return {name: _counters[name] for name in sorted(_ALLOWED_COUNTERS)}


def _database_gauges() -> tuple[dict[str, int], float]:
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required for consumer metrics")
    now = datetime.now(timezone.utc)
    with psycopg.connect(_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT status, count(*)
                FROM whatsapp_webhook_events
                WHERE provider = 'meta_whatsapp'
                GROUP BY status
                """
            )
            rows = cursor.fetchall()
            gauges = {str(status): int(count) for status, count in rows}
            cursor.execute(
                """
                SELECT count(*)
                FROM whatsapp_webhook_events
                WHERE provider = 'meta_whatsapp'
                  AND status = 'processing'
                  AND (claim_expires_at IS NULL OR claim_expires_at <= %s)
                """,
                (now,),
            )
            gauges["processing_expired"] = int(cursor.fetchone()[0])
            cursor.execute(
                """
                SELECT EXTRACT(EPOCH FROM (%s - min(created_at)))
                FROM whatsapp_webhook_events
                WHERE provider = 'meta_whatsapp'
                  AND status IN ('received', 'failed')
                  AND next_attempt_at <= %s
                """,
                (now, now),
            )
            oldest = cursor.fetchone()[0]
    return gauges, max(0.0, float(oldest)) if oldest is not None else 0.0


def render_metrics() -> str:
    """Render Prometheus exposition text with aggregate-only values."""
    gauges, oldest_ready_seconds = _database_gauges()
    counters = _snapshot_counters()
    statuses = ("received", "processing", "processed", "failed", "dead_letter")
    lines = [
        "# HELP lanai_whatsapp_consumer_events Number of durable WhatsApp events by consumer status.",
        "# TYPE lanai_whatsapp_consumer_events gauge",
        *(
            f'lanai_whatsapp_consumer_events{{status="{status}"}} {gauges.get(status, 0)}'
            for status in statuses
        ),
        "# HELP lanai_whatsapp_consumer_processing_lease_expired Number of processing events with expired or missing consumer leases.",
        "# TYPE lanai_whatsapp_consumer_processing_lease_expired gauge",
        f"lanai_whatsapp_consumer_processing_lease_expired {gauges.get('processing_expired', 0)}",
        "# HELP lanai_whatsapp_consumer_oldest_ready_seconds Age of the oldest due received or failed WhatsApp event.",
        "# TYPE lanai_whatsapp_consumer_oldest_ready_seconds gauge",
        f"lanai_whatsapp_consumer_oldest_ready_seconds {oldest_ready_seconds:.3f}",
    ]
    for name, value in counters.items():
        metric = f"lanai_whatsapp_consumer_{name}"
        lines.extend(
            [
                f"# HELP {metric} Process-local durable WhatsApp consumer operation count.",
                f"# TYPE {metric} counter",
                f"{metric} {value}",
            ]
        )
    return "\n".join(lines) + "\n"


class _MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - stdlib handler contract
        if self.path != "/metrics":
            self.send_response(HTTPStatus.NOT_FOUND)
            self.end_headers()
            return
        try:
            body = render_metrics().encode("utf-8")
        except (psycopg.Error, RuntimeError) as error:
            logger.error("WhatsApp consumer metrics unavailable type=%s", type(error).__name__)
            body = b"# WhatsApp consumer metrics unavailable\n"
            self.send_response(HTTPStatus.SERVICE_UNAVAILABLE)
        else:
            self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        # Avoid request logging noise and never record request details.
        return


def start_metrics_exporter() -> None:
    """Start one private metrics listener for the lifetime of this worker process."""
    global _server
    if _server is not None:
        return
    if not 1 <= _METRICS_PORT <= 65535:
        raise RuntimeError("WHATSAPP_CONSUMER_METRICS_PORT is invalid")
    _server = ThreadingHTTPServer(("0.0.0.0", _METRICS_PORT), _MetricsHandler)
    thread = threading.Thread(
        target=_server.serve_forever,
        name="whatsapp-consumer-metrics",
        daemon=True,
    )
    thread.start()
    logger.info("WhatsApp consumer metrics listener started port=%s", _METRICS_PORT)
