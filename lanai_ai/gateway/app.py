"""Lanai AI Gateway: authenticated CPU inference with a local Ollama backend.

The gateway is the only service that talks to the local model runtime. It returns
an explicit upstream failure when the configured model is unavailable; it never
substitutes fabricated analysis, proposals, or messages.
"""
from __future__ import annotations

import json
import os
import time
from collections.abc import Iterator
from typing import Any, Literal

import requests
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
AI_GATEWAY_TOKEN = os.getenv("AI_GATEWAY_TOKEN", "")
OLLAMA_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "180"))
OLLAMA_NUM_THREADS = int(os.getenv("OLLAMA_NUM_THREADS", "4"))
OLLAMA_CONTEXT_WINDOW = int(os.getenv("OLLAMA_CONTEXT_WINDOW", "4096"))

app = FastAPI(title="Lanai AI Gateway", version="1.0.0")


class InferenceRequest(BaseModel):
    capability: Literal["proposal", "intelligence", "briefing", "whatsapp"]
    prompt: str = Field(min_length=1, max_length=40_000)
    system: str = Field(default="", max_length=10_000)
    temperature: float = Field(default=0.2, ge=0, le=1)
    max_tokens: int = Field(default=1_024, ge=64, le=4_096)
    response_format: Literal["text", "json"] = "text"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProposalRequest(BaseModel):
    client_name: str = Field(min_length=1, max_length=255)
    destination: str = Field(min_length=1, max_length=255)
    dates: str = Field(min_length=1, max_length=255)
    pax: int = Field(ge=1, le=50)
    budget: str | None = Field(default=None, max_length=64)
    preferences: str | None = Field(default=None, max_length=10_000)


class IntelligenceRequest(BaseModel):
    client_name: str = Field(min_length=1, max_length=255)
    client_facts: dict[str, Any] = Field(default_factory=dict)


class WhatsAppDraftRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10_000)
    client_name: str | None = Field(default=None, max_length=255)
    context: str | None = Field(default=None, max_length=10_000)


def require_service_token(authorization: str | None = Header(default=None)) -> None:
    if not AI_GATEWAY_TOKEN:
        raise HTTPException(status_code=503, detail="AI gateway token is not configured")
    expected = f"Bearer {AI_GATEWAY_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid AI gateway credential")


def _ollama_payload(request: InferenceRequest, stream: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": OLLAMA_MODEL,
        "prompt": request.prompt,
        "system": request.system,
        "stream": stream,
        "options": {
            "temperature": request.temperature,
            "num_predict": request.max_tokens,
            "num_thread": OLLAMA_NUM_THREADS,
            "num_ctx": OLLAMA_CONTEXT_WINDOW,
        },
    }
    if request.response_format == "json":
        payload["format"] = "json"
    return payload


def infer(request: InferenceRequest) -> dict[str, Any]:
    started = time.monotonic()
    try:
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=_ollama_payload(request),
            timeout=OLLAMA_TIMEOUT_SECONDS,
        )
    except requests.RequestException as error:
        raise HTTPException(status_code=503, detail=f"Local inference runtime unavailable: {error}") from error
    if response.status_code != 200:
        raise HTTPException(status_code=503, detail=f"Local inference runtime rejected the request ({response.status_code})")
    try:
        body = response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Local inference runtime returned invalid JSON") from error
    output = str(body.get("response", "")).strip()
    if not output:
        raise HTTPException(status_code=502, detail="Local inference runtime returned an empty response")
    return {
        "output": output,
        "model": OLLAMA_MODEL,
        "provider": "ollama",
        "latency_ms": int((time.monotonic() - started) * 1000),
        "done_reason": body.get("done_reason"),
    }


def stream_infer(request: InferenceRequest) -> Iterator[str]:
    try:
        with requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=_ollama_payload(request, stream=True),
            stream=True,
            timeout=OLLAMA_TIMEOUT_SECONDS,
        ) as response:
            if response.status_code != 200:
                raise HTTPException(status_code=503, detail=f"Local inference runtime rejected the request ({response.status_code})")
            emitted = False
            for raw_line in response.iter_lines(decode_unicode=True):
                if not raw_line:
                    continue
                chunk = json.loads(raw_line)
                token = str(chunk.get("response", ""))
                if token:
                    emitted = True
                    yield f"data: {json.dumps({'delta': token})}\n\n"
                if chunk.get("done"):
                    yield f"event: done\ndata: {json.dumps({'model': OLLAMA_MODEL, 'provider': 'ollama'})}\n\n"
            if not emitted:
                yield "event: error\ndata: {\"detail\": \"Local inference runtime returned an empty response\"}\n\n"
    except requests.RequestException as error:
        yield f"event: error\ndata: {json.dumps({'detail': f'Local inference runtime unavailable: {error}'})}\n\n"


def proposal_prompt(data: ProposalRequest) -> InferenceRequest:
    return InferenceRequest(
        capability="proposal",
        system=(
            "You are a luxury travel advisor. Produce a grounded, client-ready travel proposal. "
            "Do not invent confirmed availability, prices, suppliers, or booking references. Clearly label assumptions."
        ),
        prompt=(
            f"Create a proposal for {data.client_name}. Destination: {data.destination}. Dates: {data.dates}. "
            f"Guests: {data.pax}. Budget: {data.budget or 'not supplied'}. Preferences: {data.preferences or 'not supplied'}."
        ),
        temperature=0.2,
        max_tokens=1_500,
    )


@app.get("/health")
def health() -> dict[str, Any]:
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        response.raise_for_status()
        models = [model.get("name", "") for model in response.json().get("models", [])]
        ready = any(model == OLLAMA_MODEL or model.startswith(f"{OLLAMA_MODEL}:") for model in models)
        return {"status": "ok" if ready else "degraded", "provider": "ollama", "model": OLLAMA_MODEL, "model_ready": ready}
    except requests.RequestException as error:
        return JSONResponse(status_code=503, content={"status": "unavailable", "provider": "ollama", "model": OLLAMA_MODEL, "detail": str(error)})


@app.post("/infer", dependencies=[Depends(require_service_token)])
def generic_infer(request: InferenceRequest) -> dict[str, Any]:
    return infer(request)


@app.post("/proposals/generate-proposal", dependencies=[Depends(require_service_token)])
def generate_proposal(request: ProposalRequest) -> dict[str, Any]:
    return infer(proposal_prompt(request))


@app.post("/proposals/generate-proposal-stream", dependencies=[Depends(require_service_token)])
def generate_proposal_stream(request: ProposalRequest) -> StreamingResponse:
    return StreamingResponse(stream_infer(proposal_prompt(request)), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/intelligence/client-profile", dependencies=[Depends(require_service_token)])
def client_profile(request: IntelligenceRequest) -> dict[str, Any]:
    prompt = InferenceRequest(
        capability="intelligence",
        response_format="json",
        system="Analyze only supplied client facts. Return valid JSON with keys summary, preferences, opportunities, risks, and missing_data.",
        prompt=f"Client: {request.client_name}\nFacts: {json.dumps(request.client_facts, sort_keys=True)}",
        temperature=0.1,
        max_tokens=1_200,
    )
    result = infer(prompt)
    try:
        result["structured"] = json.loads(result["output"])
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Local model did not return valid structured intelligence") from error
    return result


@app.post("/intelligence/churn-risk", dependencies=[Depends(require_service_token)])
def churn_risk(request: IntelligenceRequest) -> dict[str, Any]:
    prompt = InferenceRequest(
        capability="intelligence",
        response_format="json",
        system="Assess churn risk only from supplied facts. Return valid JSON with risk_level, rationale, evidence, and recommended_actions. Never invent facts.",
        prompt=f"Client: {request.client_name}\nFacts: {json.dumps(request.client_facts, sort_keys=True)}",
        temperature=0.1,
        max_tokens=800,
    )
    result = infer(prompt)
    try:
        result["structured"] = json.loads(result["output"])
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Local model did not return valid structured churn analysis") from error
    return result


@app.post("/intelligence/opportunity-spot", dependencies=[Depends(require_service_token)])
def opportunity_spot(request: IntelligenceRequest) -> dict[str, Any]:
    prompt = InferenceRequest(
        capability="intelligence",
        response_format="json",
        system="Identify service opportunities only from supplied facts. Return valid JSON with opportunities, evidence, and missing_data.",
        prompt=f"Client: {request.client_name}\nFacts: {json.dumps(request.client_facts, sort_keys=True)}",
        temperature=0.1,
        max_tokens=800,
    )
    result = infer(prompt)
    try:
        result["structured"] = json.loads(result["output"])
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Local model did not return valid structured opportunity analysis") from error
    return result


@app.post("/briefing/morning-briefing", dependencies=[Depends(require_service_token)])
def morning_briefing(payload: dict[str, Any]) -> dict[str, Any]:
    prompt = InferenceRequest(
        capability="briefing",
        response_format="json",
        system=(
            "Create a concise advisor morning briefing from supplied operational facts only. Do not invent events. "
            "Return valid JSON with optional keys date, greeting, summary, urgent_actions, opportunities, follow_ups, renewals, market_insights, todays_focus. "
            "Each urgent_actions item must have client, action, priority; opportunities item client, opportunity, estimated_value; "
            "follow_ups item client, last_contact, suggestion; renewals item member, renewal_date, tier."
        ),
        prompt=f"Operational facts: {json.dumps(payload, sort_keys=True)}",
        temperature=0.1,
        max_tokens=1_200,
    )
    result = infer(prompt)
    try:
        result["structured"] = json.loads(result["output"])
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Local model did not return a valid structured morning briefing") from error
    return result


@app.post("/whatsapp/draft-reply", dependencies=[Depends(require_service_token)])
def draft_reply(request: WhatsAppDraftRequest) -> dict[str, Any]:
    prompt = InferenceRequest(
        capability="whatsapp",
        system="Draft a warm, concise, professional client reply. Do not make promises or invent booking facts. Return text only.",
        prompt=f"Client: {request.client_name or 'not supplied'}\nContext: {request.context or 'not supplied'}\nInbound message: {request.message}",
        temperature=0.3,
        max_tokens=400,
    )
    return infer(prompt)
