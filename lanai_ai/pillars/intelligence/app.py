"""
Lanai AI — Pillar 3: Client Intelligence Engine
Runs on port 5557
"""
import json, requests, logging
from flask import Flask, request, jsonify
from flask_cors import CORS

logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
CORS(app)

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL      = "llama3.2:3b"

def ask_ollama(prompt: str, max_tokens: int = 600) -> str:
    try:
        r = requests.post(OLLAMA_URL, json={"model": MODEL, "prompt": prompt, "stream": False, "options": {"num_predict": max_tokens, "temperature": 0.6}}, timeout=120)
        r.raise_for_status()
        return r.json().get("response", "").strip()
    except Exception as e:
        logging.error(f"Ollama error: {e}")
        return ""

def parse_json_response(text: str) -> dict:
    try:
        start = text.find("{"); end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except Exception:
        pass
    return {}

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "client-intelligence"})

@app.route("/api/client-profile", methods=["POST"])
def client_profile():
    data = request.json or {}
    client_name = data.get("client_name", "Valued Client")
    history     = data.get("booking_history", "Multiple luxury trips including Maldives, Japan, and East Africa")
    preferences = data.get("preferences", "Privacy, nature, cultural immersion, fine dining")

    prompt = f"""You are an AI analyst at Lanai Lifestyle, a luxury travel concierge.
Analyse this client and return a detailed intelligence profile.

Client: {client_name}
Booking History: {history}
Known Preferences: {preferences}

Return JSON:
{{
  "preference_profile": {{
    "destinations": "...",
    "travel_style": "...",
    "accommodation_type": "...",
    "dining": "...",
    "activities": "..."
  }},
  "engagement_score": 8,
  "ltv_estimate": "£85,000+",
  "churn_risk": "LOW",
  "next_trip_prediction": "...",
  "opportunity_flags": ["...", "..."],
  "advisor_talking_points": ["...", "...", "..."]
}}

engagement_score is 1-10. churn_risk is LOW/MEDIUM/HIGH/CRITICAL."""

    raw = ask_ollama(prompt, 600)
    result = parse_json_response(raw)
    if not result:
        result = {
            "preference_profile": {"destinations": "Maldives, Japan, East Africa", "travel_style": "Ultra-luxury, private", "accommodation_type": "Private villas", "dining": "Fine dining, local experiences", "activities": "Cultural, nature, wellness"},
            "engagement_score": 8, "ltv_estimate": "£85,000+", "churn_risk": "LOW",
            "next_trip_prediction": "Safari or wellness retreat, likely Q4 2025",
            "opportunity_flags": ["Anniversary approaching", "Has not tried East Africa yet"],
            "advisor_talking_points": ["Ask about upcoming anniversary", "Mention new Aman Kenya property", "Share new Bali wellness retreat"],
        }
    return jsonify(result)

@app.route("/api/churn-risk", methods=["POST"])
def churn_risk():
    data = request.json or {}
    client_name        = data.get("client_name", "Valued Client")
    last_contact_days  = data.get("last_contact_days", 45)
    last_booking_days  = data.get("last_booking_days", 180)
    total_bookings     = data.get("total_bookings", 5)
    total_value        = data.get("total_value", 50000)

    prompt = f"""You are a client retention analyst at Lanai Lifestyle luxury travel concierge.
Assess churn risk for this client.

Client: {client_name}
Days since last contact: {last_contact_days}
Days since last booking: {last_booking_days}
Total bookings: {total_bookings}
Total lifetime value: £{total_value}

Return JSON:
{{
  "risk_level": "MEDIUM",
  "primary_reason": "...",
  "recommended_action": "...",
  "message_suggestion": "...",
  "urgency_score": 6
}}

risk_level: LOW/MEDIUM/HIGH/CRITICAL. urgency_score: 1-10. message_suggestion should be a warm, personal outreach message the advisor can send."""

    raw = ask_ollama(prompt, 400)
    result = parse_json_response(raw)
    if not result:
        risk = "LOW" if last_contact_days < 30 else "MEDIUM" if last_contact_days < 60 else "HIGH" if last_contact_days < 90 else "CRITICAL"
        result = {
            "risk_level": risk, "primary_reason": f"{last_contact_days} days since last contact",
            "recommended_action": "Personal outreach within 48 hours",
            "message_suggestion": f"I was thinking of you this week — I've come across something that feels perfectly you. Would love to share it?",
            "urgency_score": min(10, last_contact_days // 10),
        }
    return jsonify(result)

@app.route("/api/opportunity-spot", methods=["POST"])
def opportunity_spot():
    data = request.json or {}
    client_name  = data.get("client_name", "Valued Client")
    last_trip    = data.get("last_trip", "Maldives 2024")
    preferences  = data.get("preferences", "luxury, privacy, nature")
    budget_range = data.get("budget_range", "£20,000–£40,000")

    prompt = f"""You are a proactive luxury travel advisor at Lanai Lifestyle.
Identify the perfect next travel opportunity for this client.

Client: {client_name}
Last Trip: {last_trip}
Preferences: {preferences}
Budget Range: {budget_range}

Return JSON:
{{
  "opportunity_title": "...",
  "suggested_destination": "...",
  "suggested_timing": "...",
  "estimated_value": 28000,
  "why_perfect_for_client": "...",
  "experience_highlights": ["...", "...", "..."],
  "outreach_message": "..."
}}

estimated_value is a number (no currency symbol). outreach_message should be warm and personal — something the advisor would actually say."""

    raw = ask_ollama(prompt, 500)
    result = parse_json_response(raw)
    if not result:
        result = {
            "opportunity_title": "Private Safari — Kenya Exclusive Camp",
            "suggested_destination": "Kenya, East Africa", "suggested_timing": "October–November 2025",
            "estimated_value": 32000, "why_perfect_for_client": "A natural next chapter after their Maldives experience.",
            "experience_highlights": ["Private camp — 6 tents maximum", "Daily game drives", "Hot air balloon over the Masai Mara"],
            "outreach_message": "I've been holding something back for the right client — a private camp in Kenya that opens in October. I immediately thought of you.",
        }
    return jsonify(result)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5557, debug=False)
