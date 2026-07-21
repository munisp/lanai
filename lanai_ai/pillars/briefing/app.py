"""Compatibility API for structured morning briefings using the shared CPU inference client."""
from __future__ import annotations

import json
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

from lanai_ai.core.ollama_client import OllamaInferenceError, ask_json

app = Flask(__name__)
CORS(app)


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "morning-briefing-compatibility-api"})


@app.post("/api/morning-briefing")
def morning_briefing():
    facts = request.get_json(silent=True)
    if not isinstance(facts, dict) or not facts:
        return jsonify({"error": "A non-empty operational facts object is required"}), 400
    prompt = f"""Create an advisor morning briefing from only the supplied operational facts.
Never invent client activity, availability, pricing, market data, or external events.
Return valid JSON only with optional keys date, greeting, summary, urgent_actions, opportunities, follow_ups, renewals, market_insights, todays_focus.
Each urgent action has client, action, priority; each opportunity has client, opportunity, estimated_value; each follow-up has client, last_contact, suggestion; each renewal has member, renewal_date, tier.
Operational facts: {json.dumps(facts, sort_keys=True)}"""
    try:
        return jsonify(ask_json(prompt, system="Use supplied facts only and clearly identify data gaps."))
    except OllamaInferenceError as exception:
        return jsonify({"error": str(exception)}), 503


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5558, debug=False)
