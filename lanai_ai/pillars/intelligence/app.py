"""Compatibility API for client intelligence using strict shared CPU inference."""
from __future__ import annotations

import json
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

from lanai_ai.core.ollama_client import OllamaInferenceError, ask_json

app = Flask(__name__)
CORS(app)


def facts(data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    client_name = data.get("client_name")
    client_facts = data.get("client_facts")
    if not isinstance(client_name, str) or not client_name.strip():
        raise ValueError("client_name is required")
    if not isinstance(client_facts, dict) or not client_facts:
        raise ValueError("client_facts must be a non-empty persisted facts object")
    return client_name.strip(), client_facts


def structured_response(prompt: str):
    try:
        return jsonify(ask_json(prompt, system="Use only supplied facts. Never invent bookings, pricing, outreach history, or client preferences."))
    except OllamaInferenceError as exception:
        return jsonify({"error": str(exception)}), 503


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "client-intelligence-compatibility-api"})


@app.post("/api/client-profile")
def client_profile():
    try:
        client_name, client_facts = facts(request.get_json(silent=True) or {})
    except ValueError as exception:
        return jsonify({"error": str(exception)}), 400
    return structured_response(
        f"""Analyze the persisted client facts for {client_name}. Return valid JSON only with summary, preferences, opportunities, risks, and missing_data.\nFacts: {json.dumps(client_facts, sort_keys=True)}"""
    )


@app.post("/api/churn-risk")
def churn_risk():
    try:
        client_name, client_facts = facts(request.get_json(silent=True) or {})
    except ValueError as exception:
        return jsonify({"error": str(exception)}), 400
    return structured_response(
        f"""Assess churn risk for {client_name} from the persisted facts only. Return valid JSON only with risk_level, rationale, evidence, recommended_actions, and missing_data.\nFacts: {json.dumps(client_facts, sort_keys=True)}"""
    )


@app.post("/api/opportunity-spot")
def opportunity_spot():
    try:
        client_name, client_facts = facts(request.get_json(silent=True) or {})
    except ValueError as exception:
        return jsonify({"error": str(exception)}), 400
    return structured_response(
        f"""Identify travel-service opportunities for {client_name} from the persisted facts only. Return valid JSON only with opportunities, evidence, recommended_actions, and missing_data.\nFacts: {json.dumps(client_facts, sort_keys=True)}"""
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5557, debug=False)
