"""Compatibility API for proposal and itinerary generation using the shared CPU Ollama client."""
from __future__ import annotations

import json
from typing import Any

from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS

from lanai_ai.core.ollama_client import OllamaInferenceError, ask, ask_json

app = Flask(__name__)
CORS(app)


def error(message: str, status: int = 502):
    return jsonify({"error": message}), status


def required(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} is required")
    return value.strip()


def proposal_prompt(data: dict[str, Any], structured: bool) -> str:
    client_name = required(data, "client_name")
    destination = required(data, "destination")
    travel_type = str(data.get("travel_type") or "bespoke luxury travel")
    budget = str(data.get("budget") or "not supplied")
    dates = str(data.get("dates") or "not supplied")
    preferences = str(data.get("preferences") or "not supplied")
    special_requirements = str(data.get("special_requirements") or "not supplied")
    format_instruction = (
        "Return valid JSON only with proposal_title, executive_summary, why_this_destination, accommodation, day_by_day, included_experiences, estimated_investment, next_steps, and advisor_note."
        if structured
        else "Write a client-ready markdown proposal. Do not state that availability, prices, or suppliers are confirmed unless supplied."
    )
    return f"""You are a luxury travel advisor. Use only the supplied client facts and label assumptions.
Client: {client_name}
Destination: {destination}
Travel type: {travel_type}
Budget: {budget}
Dates: {dates}
Preferences: {preferences}
Special requirements: {special_requirements}
{format_instruction}"""


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "proposal-engine-compatibility-api"})


@app.post("/api/generate-proposal")
def generate_proposal():
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(ask_json(proposal_prompt(data, structured=True), system="Never fabricate confirmed travel inventory."))
    except ValueError as exception:
        return error(str(exception), 400)
    except OllamaInferenceError as exception:
        return error(str(exception), 503)


@app.post("/api/generate-proposal-stream")
def generate_proposal_stream():
    data = request.get_json(silent=True) or {}
    try:
        prompt = proposal_prompt(data, structured=False)
    except ValueError as exception:
        return error(str(exception), 400)

    def generate():
        try:
            output = ask(prompt, system="Never fabricate confirmed travel inventory.", max_tokens=1_500)
            yield f"data: {json.dumps({'delta': output})}\n\n"
            yield "event: done\ndata: {}\n\n"
        except OllamaInferenceError as exception:
            yield f"event: error\ndata: {json.dumps({'detail': str(exception)})}\n\n"

    return Response(stream_with_context(generate()), mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/generate-itinerary")
def generate_itinerary():
    data = request.get_json(silent=True) or {}
    try:
        client_name = required(data, "client_name")
        destination = required(data, "destination")
        duration = int(data.get("duration_days", 0))
        if duration < 1 or duration > 60:
            raise ValueError("duration_days must be between 1 and 60")
        style = str(data.get("style") or "not supplied")
        prompt = f"""Create a {duration}-day travel itinerary for {client_name} in {destination}. Style: {style}.
Use only supplied facts and label assumptions. Return valid JSON only with itinerary_title, overview, days, packing_suggestions, and lanai_insider_notes."""
        return jsonify(ask_json(prompt, system="Never invent confirmed inventory, prices, or reservations."))
    except ValueError as exception:
        return error(str(exception), 400)
    except OllamaInferenceError as exception:
        return error(str(exception), 503)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5556, debug=False)
