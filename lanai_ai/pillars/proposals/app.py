"""
Lanai AI — Pillar 2: Proposal Engine & Itinerary Builder
Runs on port 5556
Endpoints:
  POST /api/generate-proposal        → JSON (non-streaming, structured)
  POST /api/generate-proposal-stream → SSE streaming text (word-by-word)
  POST /api/generate-itinerary       → JSON (non-streaming, structured)
"""
import json, requests, logging
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS

logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
CORS(app)

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL      = "llama3.2:3b"

def ask_ollama(prompt: str, max_tokens: int = 800) -> str:
    try:
        r = requests.post(OLLAMA_URL, json={"model": MODEL, "prompt": prompt, "stream": False, "options": {"num_predict": max_tokens, "temperature": 0.7}}, timeout=120)
        r.raise_for_status()
        return r.json().get("response", "").strip()
    except Exception as e:
        logging.error(f"Ollama error: {e}")
        return ""

def stream_ollama(prompt: str, max_tokens: int = 1200):
    """Generator that yields SSE-formatted chunks from Ollama streaming API."""
    try:
        with requests.post(
            OLLAMA_URL,
            json={"model": MODEL, "prompt": prompt, "stream": True, "options": {"num_predict": max_tokens, "temperature": 0.7}},
            stream=True,
            timeout=300
        ) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if line:
                    try:
                        chunk = json.loads(line)
                        token = chunk.get("response", "")
                        if token:
                            # SSE format: data: <token>\n\n
                            yield f"data: {json.dumps({'token': token})}\n\n"
                        if chunk.get("done"):
                            yield "data: [DONE]\n\n"
                            return
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        logging.error(f"Ollama streaming error: {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

def parse_json_response(text: str) -> dict:
    try:
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except Exception:
        pass
    return {}

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "proposal-engine"})

@app.route("/api/generate-proposal", methods=["POST"])
def generate_proposal():
    data = request.json or {}
    client_name  = data.get("client_name", "Valued Client")
    destination  = data.get("destination", "")
    travel_type  = data.get("travel_type", "luxury travel")
    budget       = data.get("budget", "")
    dates        = data.get("dates", "")
    preferences  = data.get("preferences", "")
    special_req  = data.get("special_requirements", "")

    prompt = f"""You are a luxury travel advisor at Lanai Lifestyle, a world-class concierge and travel company.
Generate a professional, personalised travel proposal for the following client.

Client: {client_name}
Destination: {destination}
Travel Type: {travel_type}
Budget: {budget}
Dates: {dates}
Preferences: {preferences}
Special Requirements: {special_req}

Return a JSON object with these exact fields:
{{
  "proposal_title": "...",
  "executive_summary": "...",
  "why_this_destination": "...",
  "accommodation": {{"name": "...", "description": "...", "why_chosen": "..."}},
  "day_by_day": [
    {{"day": 1, "title": "...", "description": "..."}},
    {{"day": 2, "title": "...", "description": "..."}},
    {{"day": 3, "title": "...", "description": "..."}}
  ],
  "included_experiences": ["...", "...", "..."],
  "estimated_investment": "...",
  "next_steps": "...",
  "advisor_note": "..."
}}

Write in a warm, sophisticated tone befitting a luxury concierge. Be specific and evocative."""

    raw = ask_ollama(prompt, 1000)
    result = parse_json_response(raw)
    if not result:
        result = {
            "proposal_title": f"A Private {destination} Experience — {client_name}",
            "executive_summary": f"We have curated an exceptional {travel_type} experience to {destination} tailored exclusively for you.",
            "why_this_destination": f"{destination} offers an unparalleled combination of luxury, culture, and natural beauty.",
            "accommodation": {"name": "Private Villa / Boutique Resort", "description": "Handpicked for privacy and exceptional service.", "why_chosen": "Matches your preference for intimate, exclusive settings."},
            "day_by_day": [
                {"day": 1, "title": "Arrival & Welcome", "description": "Private transfer, welcome dinner."},
                {"day": 2, "title": "Exploration", "description": "Guided private experiences."},
                {"day": 3, "title": "Leisure & Departure", "description": "Relaxation and farewell."},
            ],
            "included_experiences": ["Private transfers", "Daily breakfast", "Curated excursions"],
            "estimated_investment": budget or "To be confirmed",
            "next_steps": "Please review and let us know if you'd like to adjust any element.",
            "advisor_note": f"This proposal has been personally curated for you, {client_name}.",
        }
    return jsonify(result)


@app.route("/api/generate-proposal-stream", methods=["POST"])
def generate_proposal_stream():
    """
    Streaming SSE endpoint — returns proposal as flowing text (markdown).
    Frontend consumes via fetch() + ReadableStream.
    """
    data = request.json or {}
    client_name  = data.get("client_name", "Valued Client")
    destination  = data.get("destination", "")
    travel_type  = data.get("travel_type", "luxury travel")
    budget       = data.get("budget", "")
    dates        = data.get("dates", "")
    preferences  = data.get("preferences", "")
    special_req  = data.get("special_requirements", "")

    prompt = f"""You are a luxury travel advisor at Lanai Lifestyle, a world-class concierge and travel company.
Write a beautiful, personalised travel proposal in rich Markdown format for the following client.

**Client:** {client_name}
**Destination:** {destination}
**Travel Type:** {travel_type}
**Budget:** {budget}
**Dates:** {dates}
**Preferences:** {preferences}
**Special Requirements:** {special_req}

Structure your proposal with these sections:
# [Proposal Title]

## Executive Summary
[Warm, personalised opening paragraph]

## Why {destination}
[Evocative description of why this destination is perfect]

## Accommodation
[Specific property recommendation with why it was chosen]

## Your Itinerary
[Day-by-day breakdown with specific experiences]

## What's Included
[Bullet list of key inclusions]

## Investment
[Budget summary]

## Your Advisor's Note
[Personal closing message]

Write in a warm, sophisticated tone. Be specific, evocative, and luxurious. Use real place names and experiences."""

    def generate():
        yield f"data: {json.dumps({'token': ''})}\n\n"  # Initial ping
        yield from stream_ollama(prompt, 1200)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


@app.route("/api/generate-itinerary", methods=["POST"])
def generate_itinerary():
    data = request.json or {}
    client_name = data.get("client_name", "Valued Client")
    destination = data.get("destination", "")
    duration    = data.get("duration_days", 7)
    style       = data.get("style", "luxury, cultural, relaxed")

    prompt = f"""You are a luxury travel expert at Lanai Lifestyle.
Create a detailed {duration}-day itinerary for {client_name} visiting {destination}.
Style: {style}

Return JSON:
{{
  "itinerary_title": "...",
  "overview": "...",
  "days": [
    {{
      "day": 1,
      "date_label": "Day 1",
      "title": "...",
      "morning": "...",
      "afternoon": "...",
      "evening": "...",
      "accommodation": "...",
      "insider_tip": "..."
    }}
  ],
  "packing_suggestions": ["...", "..."],
  "lanai_insider_notes": "..."
}}

Create {duration} days. Be specific, evocative, and luxurious."""

    raw = ask_ollama(prompt, 1200)
    result = parse_json_response(raw)
    if not result:
        result = {
            "itinerary_title": f"{duration}-Day {destination} Experience",
            "overview": f"A curated {duration}-day journey through {destination}.",
            "days": [{"day": i+1, "date_label": f"Day {i+1}", "title": f"Day {i+1} in {destination}", "morning": "Breakfast and exploration.", "afternoon": "Private guided experience.", "evening": "Fine dining.", "accommodation": "Luxury property.", "insider_tip": "Ask your guide for local recommendations."} for i in range(min(duration, 7))],
            "packing_suggestions": ["Light layers", "Smart casual evening wear", "Comfortable walking shoes"],
            "lanai_insider_notes": f"Our team has curated this itinerary with exclusive access and insider knowledge of {destination}.",
        }
    return jsonify(result)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5556, debug=False)
