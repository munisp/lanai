"""
Lanai AI — Pillar 3: Client Intelligence Engine
Analyses client data to surface preferences, predict needs,
score churn risk, and identify upsell opportunities.
"""
import sys
import os
import json
import logging
from datetime import datetime, timedelta
from flask import Flask, request, jsonify

sys.path.insert(0, '/home/ubuntu/lanai_ai')
from core.ollama_client import ask_json, health_check
from core.crm_connector import get_people, get_members, get_travel_requests, create_note, create_task, gql
from core.prompts import (client_profile_prompt, churn_risk_prompt,
                           opportunity_spotting_prompt, INTELLIGENCE_SYSTEM, LANAI_SYSTEM)

PORT = int(os.getenv("INTELLIGENCE_PORT", 5557))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("/home/ubuntu/lanai_ai/logs/intelligence.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("lanai.intelligence")

app = Flask(__name__)


# ─── CLIENT PROFILE ANALYSIS ─────────────────────────────────────────────────

@app.route("/api/client-profile", methods=["POST"])
def client_profile():
    """
    Analyse a client's full profile and return intelligence insights.
    """
    data        = request.get_json() or {}
    person_id   = data.get("person_id")
    client_name = data.get("client_name", "Client")

    # Fetch client data from CRM
    bookings     = data.get("bookings", [])
    interactions = data.get("interactions", [])

    if not bookings and not interactions:
        # Try to fetch from CRM
        travel_requests = get_travel_requests(50)
        bookings = [tr for tr in travel_requests if tr.get("name", "").lower() in client_name.lower()]

    logger.info(f"Analysing profile for {client_name}")

    profile = ask_json(
        client_profile_prompt(client_name, interactions, bookings),
        system=INTELLIGENCE_SYSTEM
    )

    if person_id and "error" not in profile:
        note_title = f"🧠 Client Intelligence — {client_name}"
        note_body  = _format_profile_note(profile, client_name)
        create_note(note_title, note_body, person_id)

    return jsonify(profile), 200


@app.route("/api/churn-risk", methods=["POST"])
def churn_risk():
    """
    Assess churn risk for a specific client.
    """
    data = request.get_json() or {}

    client_name        = data.get("client_name", "Client")
    last_contact_days  = data.get("last_contact_days", 90)
    last_booking_days  = data.get("last_booking_days", 365)
    total_bookings     = data.get("total_bookings", 1)
    total_value        = data.get("total_value", 5000)
    person_id          = data.get("person_id")

    logger.info(f"Assessing churn risk for {client_name}")

    risk = ask_json(
        churn_risk_prompt(client_name, last_contact_days, last_booking_days,
                          total_bookings, total_value),
        system=INTELLIGENCE_SYSTEM
    )

    # Create task if high risk
    if person_id and risk.get("risk_level") in ["HIGH", "CRITICAL"]:
        create_task(
            f"⚠️ Churn Risk — Re-engage {client_name}",
            f"Risk Level: {risk.get('risk_level')}\n"
            f"Reason: {risk.get('primary_reason')}\n"
            f"Action: {risk.get('recommended_action')}\n\n"
            f"Suggested message:\n{risk.get('message_suggestion', '')}",
            person_id
        )

    return jsonify(risk), 200


@app.route("/api/opportunity-spot", methods=["POST"])
def opportunity_spot():
    """
    Identify a proactive travel opportunity for a client.
    """
    data = request.get_json() or {}

    client_name       = data.get("client_name", "Client")
    last_trip         = data.get("last_trip", "Unknown")
    preferences       = data.get("preferences", "luxury travel")
    season            = data.get("season", _current_season())
    available_offers  = data.get("available_offers", _default_offers())
    person_id         = data.get("person_id")

    logger.info(f"Spotting opportunity for {client_name}")

    opportunity = ask_json(
        opportunity_spotting_prompt(client_name, last_trip, preferences,
                                    season, available_offers),
        system=INTELLIGENCE_SYSTEM
    )

    if person_id and "error" not in opportunity:
        note_title = f"💡 Opportunity — {opportunity.get('opportunity_title', 'New Trip Idea')} for {client_name}"
        note_body  = _format_opportunity_note(opportunity, client_name)
        create_note(note_title, note_body, person_id)

    return jsonify(opportunity), 200


@app.route("/api/bulk-intelligence", methods=["GET"])
def bulk_intelligence():
    """
    Run intelligence analysis across all clients and return a summary.
    """
    people  = get_people(30)
    members = get_members(30)

    results = {
        "total_clients": len(people),
        "total_members": len(members),
        "high_risk_clients": [],
        "opportunities": [],
        "generated_at": datetime.utcnow().isoformat()
    }

    # Identify high-risk clients (simple heuristic — no AI call for bulk)
    for person in people[:10]:  # Limit to avoid memory pressure
        name = f"{person.get('name', {}).get('firstName', '')} {person.get('name', {}).get('lastName', '')}".strip()
        created = person.get("createdAt", "")
        # Simple heuristic: if created > 180 days ago and no recent update
        if created:
            try:
                created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                days_old   = (datetime.now(created_dt.tzinfo) - created_dt).days
                if days_old > 180:
                    results["high_risk_clients"].append({
                        "name": name,
                        "id": person["id"],
                        "days_since_created": days_old,
                        "risk_note": "No recent activity detected"
                    })
            except:
                pass

    return jsonify(results), 200


# ─── UTILITY ─────────────────────────────────────────────────────────────────

def _current_season() -> str:
    month = datetime.now().month
    if month in [12, 1, 2]:  return "Winter"
    if month in [3, 4, 5]:   return "Spring"
    if month in [6, 7, 8]:   return "Summer"
    return "Autumn"


def _default_offers() -> list:
    return [
        "Private villa in Maldives with butler service",
        "Safari in Kenya — exclusive camp access",
        "Christmas markets river cruise — Vienna to Amsterdam",
        "New Year's Eve in Sydney — private harbour cruise",
        "Cherry blossom season in Japan — private guide",
        "Northern Lights expedition — Iceland private lodge",
        "Amalfi Coast yacht charter — 7 days",
        "Luxury train journey — Venice Simplon-Orient-Express"
    ]


def _format_profile_note(profile: dict, client_name: str) -> str:
    prefs = profile.get("preference_profile", {})
    return f"""# Client Intelligence Profile — {client_name}
Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}

## Preference Profile
• Destinations: {prefs.get('destinations', 'Unknown')}
• Travel Style: {prefs.get('travel_style', 'Unknown')}
• Accommodation: {prefs.get('accommodation_type', 'Unknown')}
• Dining: {prefs.get('dining', 'Unknown')}
• Activities: {prefs.get('activities', 'Unknown')}
• Travel Companions: {prefs.get('travel_companions', 'Unknown')}

## Scores
• Engagement Score: {profile.get('engagement_score', 'N/A')}/10
• LTV Estimate: {profile.get('ltv_estimate', 'N/A')}
• Churn Risk: {profile.get('churn_risk', 'N/A')}

## Next Trip Prediction
{profile.get('next_trip_prediction', 'N/A')}

## Opportunities
{chr(10).join(f'• {o}' for o in profile.get('opportunity_flags', []))}

## Advisor Talking Points
{chr(10).join(f'{i+1}. {t}' for i, t in enumerate(profile.get('advisor_talking_points', [])))}
"""


def _format_opportunity_note(opp: dict, client_name: str) -> str:
    return f"""# 💡 {opp.get('opportunity_title', 'Travel Opportunity')}

**Client:** {client_name}
**Destination:** {opp.get('suggested_destination', 'TBD')}
**Timing:** {opp.get('suggested_timing', 'TBD')}
**Estimated Value:** £{opp.get('estimated_value', 0):,}

## Why Perfect for {client_name}
{opp.get('why_perfect_for_client', '')}

## Experience Highlights
{chr(10).join(f'• {h}' for h in opp.get('experience_highlights', []))}

## Suggested Outreach Message
> {opp.get('outreach_message', '')}
"""


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "lanai-client-intelligence",
        "ollama": "connected" if health_check() else "disconnected"
    }), 200


if __name__ == "__main__":
    logger.info(f"Starting Lanai Client Intelligence Engine on port {PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
