"""Authenticated Iceberg lakehouse event ingestion over Trino's HTTP protocol."""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any

import requests
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

TRINO_URL = os.getenv("TRINO_URL", "http://trino:8080").rstrip("/")
CATALOG = os.getenv("LAKEHOUSE_CATALOG", "iceberg")
SCHEMA = os.getenv("LAKEHOUSE_SCHEMA", "lanai")
WAREHOUSE = os.getenv("LAKEHOUSE_WAREHOUSE", "s3://lanai-lakehouse/lanai")
TOKEN = os.getenv("LAKEHOUSE_INGEST_TOKEN", "")

app = FastAPI(title="Lanai Lakehouse Ingest", version="1.0.0")
initialized = False


class EventEnvelope(BaseModel):
    eventId: str = Field(min_length=1, max_length=64)
    aggregateType: str = Field(min_length=1, max_length=64)
    aggregateId: str | int
    eventType: str = Field(min_length=1, max_length=128)
    idempotencyKey: str = Field(min_length=1, max_length=128)
    schemaVersion: int = Field(ge=1)
    occurredAt: datetime
    payload: dict[str, Any]


class IngestRequest(BaseModel):
    record: EventEnvelope


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def trino(query: str) -> list[dict[str, Any]]:
    response = requests.post(
        f"{TRINO_URL}/v1/statement",
        data=query.encode("utf-8"),
        headers={"X-Trino-User": "lanai-ingest", "X-Trino-Catalog": CATALOG, "X-Trino-Schema": SCHEMA},
        timeout=30,
    )
    if response.status_code != 200:
        raise HTTPException(status_code=503, detail=f"Trino rejected statement ({response.status_code}): {response.text[:500]}")
    payload = response.json()
    while payload.get("nextUri"):
        response = requests.get(payload["nextUri"], timeout=30)
        if response.status_code != 200:
            raise HTTPException(status_code=503, detail=f"Trino statement polling failed ({response.status_code})")
        payload = response.json()
    if payload.get("error"):
        raise HTTPException(status_code=503, detail=f"Trino statement failed: {payload['error'].get('message', 'unknown error')}")
    return payload.get("data", [])


def ensure_initialized() -> None:
    global initialized
    if initialized:
        return
    trino(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA} WITH (location = {quote(WAREHOUSE)})")
    trino(
        "CREATE TABLE IF NOT EXISTS platform_events ("
        "event_id varchar, aggregate_type varchar, aggregate_id varchar, event_type varchar, "
        "idempotency_key varchar, schema_version integer, occurred_at timestamp(6) with time zone, "
        "ingested_at timestamp(6) with time zone, payload_json varchar"
        ") WITH (format = 'PARQUET', partitioning = ARRAY['day(occurred_at)'])"
    )
    trino("CREATE TABLE IF NOT EXISTS ingested_event_keys (event_id varchar, ingested_at timestamp(6) with time zone) WITH (format = 'PARQUET')")
    initialized = True


def verify_token(authorization: str | None) -> None:
    if not TOKEN:
        raise HTTPException(status_code=503, detail="Lakehouse ingestion token is not configured")
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid lakehouse ingestion credential")


@app.get("/health")
def health() -> dict[str, Any]:
    started = time.monotonic()
    try:
        trino("SELECT 1")
        return {"status": "ok", "catalog": CATALOG, "schema": SCHEMA, "latency_ms": int((time.monotonic() - started) * 1000)}
    except HTTPException as error:
        raise HTTPException(status_code=503, detail=error.detail) from error


@app.post("/v1/ingest/platform_events")
def ingest(request: IngestRequest, authorization: str | None = Header(default=None)) -> dict[str, str]:
    verify_token(authorization)
    ensure_initialized()
    record = request.record
    event_id = quote(record.eventId)
    existing = trino(f"SELECT event_id FROM ingested_event_keys WHERE event_id = {event_id} LIMIT 1")
    if existing:
        return {"status": "duplicate", "event_id": record.eventId}
    occurred_at = record.occurredAt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = json.dumps(record.payload, separators=(",", ":"), sort_keys=True)
    values = ", ".join([
        event_id,
        quote(record.aggregateType),
        quote(str(record.aggregateId)),
        quote(record.eventType),
        quote(record.idempotencyKey),
        str(record.schemaVersion),
        f"from_iso8601_timestamp({quote(occurred_at)})",
        "current_timestamp",
        quote(payload),
    ])
    trino(
        "INSERT INTO platform_events (event_id, aggregate_type, aggregate_id, event_type, idempotency_key, schema_version, occurred_at, ingested_at, payload_json) "
        f"VALUES ({values})"
    )
    trino(f"INSERT INTO ingested_event_keys (event_id, ingested_at) VALUES ({event_id}, current_timestamp)")
    return {"status": "ingested", "event_id": record.eventId}
