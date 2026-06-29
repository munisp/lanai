"""
Lanai AI — Pillar 6: Lanai Intelligence Engine — Morning Briefing
Runs on port 5558
"""
import json, requests, logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
CORS(app)

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL      = "llama3.2:3b"

def ask_ollama(prompt: str, max_tokens: int = 1000) -> str:
    try:
        r = requests.post(OLLAMA_URL, json={"model": MODEL, "prompt": prompt, "stream": False, "options": {"num_predict": max_tokens, "temperature": 0.7}}, timeout=180)
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

# Simulated CRM snapshot (in production this would query Twenty CRM via GraphQL)
CRM_SNAPSHOT = {
    "clients": [
        {"name": "James Whitfield",       "last_contact_days": 0,  "last_booking_days": 45,  "tier": "Gold",     "open_enquiry": "Maldives villa — October 2025"},
        {"name": "Emma Thompson",         "last_contact_days": 92, "last_booking_days": 280, "tier": "Silver",   "open_enquiry": None},
        {"name": "Oliver Bennett",        "last_contact_days": 14, "last_booking_days": 120, "tier": "Gold",     "open_enquiry": None, "renewal_days": 14},
        {"name": "The Harrington Family", "last_contact_days": 7,  "last_booking_days": 30,  "tier": "Platinum", "open_enquiry": "Tuscany villa — September 2025"},
        {"name": "Sarah Chen",            "last_contact_days": 3,  "last_booking_days": 15,  "tier": "Platinum", "open_enquiry": "Japan — April 2026"},
        {"name": "Priya Sharma",          "last_contact_days": 10, "last_booking_days": 90,  "tier": "Silver",   "open_enquiry": "New York Fashion Week"},
    ],
    "pipeline_value": "£248,000",
    "bookings_this_month": 3,
    "new_enquiries_today": 2,
}

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "morning-briefing"})

@app.route("/api/morning-briefing", methods=["POST"])
def morning_briefing():
    today = datetime.now().strftime("%A, %d %B %Y")

    # Build urgent actions from CRM snapshot
    urgent_actions = []
    for c in CRM_SNAPSHOT["clients"]:
        if c.get("open_enquiry") and c["last_contact_days"] == 0:
            urgent_actions.append({"client": c["name"], "action": f"Respond to enquiry: {c['open_enquiry']}", "priority": "HIGH"})
        elif c["last_contact_days"] > 60:
            urgent_actions.append({"client": c["name"], "action": f"{c['last_contact_days']} days since last contact — personal outreach required", "priority": "HIGH"})
        elif c.get("renewal_days") and c["renewal_days"] <= 30:
            urgent_actions.append({"client": c["name"], "action": f"Membership renewal in {c['renewal_days']} days — schedule renewal call", "priority": "MEDIUM"})

    renewals = [{"member": c["name"], "renewal_date": f"{c['renewal_days']} days", "tier": c["tier"]} for c in CRM_SNAPSHOT["clients"] if c.get("renewal_days")]

    prompt = f"""You are the Lanai Intelligence Engine — an AI briefing system for a luxury travel and lifestyle concierge.
Today is {today}.

CRM Snapshot:
- Pipeline value: {CRM_SNAPSHOT['pipeline_value']}
- Bookings this month: {CRM_SNAPSHOT['bookings_this_month']}
- New enquiries today: {CRM_SNAPSHOT['new_enquiries_today']}
- Urgent client actions: {len(urgent_actions)}

Generate a morning briefing for the Lanai advisor team. Return JSON:
{{
  "date": "{today}",
  "greeting": "...",
  "summary": "...",
  "opportunities": [
    {{"client": "...", "opportunity": "...", "estimated_value": "£..."}}
  ],
  "follow_ups": [
    {{"client": "...", "last_contact": "...", "suggestion": "..."}}
  ],
  "market_insights": ["...", "...", "..."],
  "todays_focus": "..."
}}

Be warm, professional, and actionable. Focus on what will drive the most value today."""

    raw = ask_ollama(prompt, 800)
    result = parse_json_response(raw)

    if not result:
        result = {
            "date": today,
            "greeting": "Good morning. Here is your Lanai Intelligence briefing.",
            "summary": f"You have {len(urgent_actions)} urgent client actions today. Pipeline value stands at {CRM_SNAPSHOT['pipeline_value']}. Focus on the highest-value enquiries first.",
            "opportunities": [
                {"client": "The Harrington Family", "opportunity": "Anniversary trip — Tuscany private villa, September 2025", "estimated_value": "£28,000"},
                {"client": "Priya Sharma", "opportunity": "New York Fashion Week package — September 2025", "estimated_value": "£15,000"},
            ],
            "follow_ups": [
                {"client": "Sarah Chen", "last_contact": "3 days ago", "suggestion": "Send Japan pre-departure pack and check visa status"},
                {"client": "Priya Sharma", "last_contact": "10 days ago", "suggestion": "Confirm New York Fashion Week ticket allocation"},
            ],
            "market_insights": [
                "Japan cherry blossom season bookings are 40% up year-on-year — ideal upsell opportunity",
                "Aman Kenya opens October 2025 — exclusive pre-launch rates available through Lanai network",
                "Maldives peak season (Nov–Apr) booking window now open — several preferred villas already 60% reserved",
            ],
            "todays_focus": "Prioritise James Whitfield's Maldives enquiry — high-value client, fast response expected. Then reach out to Emma Thompson with a curated destination suggestion.",
        }

    result["urgent_actions"] = urgent_actions
    result["renewals"] = renewals
    return jsonify(result)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5558, debug=False)
