"""
Lanai AI — Pillar 2: LLM Proposal Co-Pilot & Dynamic Itinerary Builder
Generates personalised luxury travel proposal frameworks and day-by-day itineraries.
"""
import sys
import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify

sys.path.insert(0, '/home/ubuntu/lanai_ai')
from core.ollama_client import ask_json, health_check
from core.crm_connector import get_travel_requests, get_people, create_note, gql
from core.prompts import (proposal_prompt, itinerary_prompt,
                           PROPOSAL_SYSTEM, LANAI_SYSTEM)

PORT = int(os.getenv("PROPOSAL_PORT", 5556))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("/home/ubuntu/lanai_ai/logs/proposals.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("lanai.proposals")

app = Flask(__name__)


# ─── PROPOSAL GENERATION ─────────────────────────────────────────────────────

@app.route("/api/generate-proposal", methods=["POST"])
def generate_proposal():
    """
    Generate a luxury travel proposal framework.
    Input: client details + trip requirements
    Output: structured proposal JSON for advisor to personalise
    """
    data = request.get_json() or {}

    client_name          = data.get("client_name", "Valued Client")
    destination          = data.get("destination", "")
    dates                = data.get("dates", "")
    travellers           = data.get("travellers", 2)
    budget               = data.get("budget", "Luxury")
    preferences          = data.get("preferences", "")
    special_requirements = data.get("special_requirements", "")
    person_id            = data.get("person_id")
    travel_request_id    = data.get("travel_request_id")

    if not destination:
        return jsonify({"error": "destination is required"}), 400

    logger.info(f"Generating proposal for {client_name} → {destination}")

    proposal = ask_json(
        proposal_prompt(client_name, destination, dates, travellers, budget,
                        preferences, special_requirements),
        system=PROPOSAL_SYSTEM
    )

    if "error" in proposal:
        return jsonify({"error": "AI generation failed", "details": proposal}), 500

    # Add metadata
    proposal["generated_at"] = datetime.utcnow().isoformat()
    proposal["client_name"]  = client_name
    proposal["destination"]  = destination
    proposal["status"]       = "DRAFT — Awaiting Advisor Review"

    # Save to CRM as a note if person_id provided
    if person_id:
        note_title = f"🗺️ Proposal Draft — {destination} for {client_name}"
        note_body  = _format_proposal_as_note(proposal)
        note = create_note(note_title, note_body, person_id)
        proposal["crm_note_id"] = note.get("id")
        logger.info(f"Saved proposal note to CRM: {note.get('id')}")

    return jsonify(proposal), 200


@app.route("/api/generate-itinerary", methods=["POST"])
def generate_itinerary():
    """
    Generate a day-by-day luxury itinerary.
    """
    data = request.get_json() or {}

    destination   = data.get("destination", "")
    duration_days = data.get("duration_days", 7)
    interests     = data.get("interests", ["luxury", "culture", "relaxation"])
    budget        = data.get("budget", "Ultra-Luxury")
    person_id     = data.get("person_id")
    client_name   = data.get("client_name", "Client")

    if not destination:
        return jsonify({"error": "destination is required"}), 400

    logger.info(f"Generating {duration_days}-day itinerary for {destination}")

    itinerary = ask_json(
        itinerary_prompt(destination, duration_days, interests, budget),
        system=PROPOSAL_SYSTEM
    )

    if "error" in itinerary:
        return jsonify({"error": "AI generation failed", "details": itinerary}), 500

    itinerary["generated_at"] = datetime.utcnow().isoformat()
    itinerary["client_name"]  = client_name

    if person_id:
        note_title = f"📅 Itinerary — {duration_days} Days in {destination} for {client_name}"
        note_body  = _format_itinerary_as_note(itinerary)
        note = create_note(note_title, note_body, person_id)
        itinerary["crm_note_id"] = note.get("id")

    return jsonify(itinerary), 200


@app.route("/api/proposals-from-crm", methods=["GET"])
def proposals_from_crm():
    """
    Fetch all pending travel requests from CRM and generate proposal stubs.
    """
    requests_list = get_travel_requests(20)
    results = []

    for tr in requests_list:
        if tr.get("status") not in ["ENQUIRY", "QUALIFICATION", "DISCOVERY"]:
            continue

        stub = {
            "travel_request_id": tr["id"],
            "client_name": tr.get("name", "Unknown"),
            "destination": tr.get("destination", "TBD"),
            "dates": f"{tr.get('departureDate', 'TBD')} to {tr.get('returnDate', 'TBD')}",
            "travellers": tr.get("numberOfTravellers", 2),
            "budget": tr.get("budgetRange", "Luxury"),
            "status": tr.get("status"),
            "proposal_ready": False
        }
        results.append(stub)

    return jsonify({"pending_proposals": results, "count": len(results)}), 200


# ─── DESTINATION INTELLIGENCE ────────────────────────────────────────────────

@app.route("/api/destination-brief", methods=["POST"])
def destination_brief():
    """
    Generate a destination intelligence brief for an advisor.
    """
    data        = request.get_json() or {}
    destination = data.get("destination", "")
    season      = data.get("season", "any")

    if not destination:
        return jsonify({"error": "destination is required"}), 400

    prompt = f"""Create a luxury destination intelligence brief for {destination} in {season}.

Return a JSON object with:
- "destination": the destination name
- "best_time_to_visit": when to go and why
- "luxury_highlights": list of 5 top luxury experiences
- "insider_tips": list of 5 insider tips only Lanai advisors would know
- "accommodation_tiers": list of top 3 property categories with examples
- "getting_there": best way to arrive in luxury
- "visa_health": key visa and health requirements
- "lanai_advantage": what Lanai can uniquely arrange here
- "avoid": things to avoid or be aware of
- "typical_budget_range": typical Lanai client budget range per person

Return ONLY valid JSON."""

    brief = ask_json(prompt, system=LANAI_SYSTEM)
    return jsonify(brief), 200


# ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────

def _format_proposal_as_note(proposal: dict) -> str:
    lines = [
        f"# {proposal.get('proposal_title', 'Luxury Travel Proposal')}",
        f"\n**Status:** {proposal.get('status', 'DRAFT')}",
        f"**Generated:** {proposal.get('generated_at', '')}",
        f"\n## Executive Summary\n{proposal.get('executive_summary', '')}",
        "\n## Itinerary Highlights"
    ]
    for h in proposal.get("itinerary_highlights", []):
        lines.append(f"**Day {h.get('day', '?')} — {h.get('title', '')}**")
        lines.append(h.get("description", ""))
    lines.append("\n## Accommodation Suggestions")
    for a in proposal.get("accommodation_suggestions", []):
        lines.append(f"• **{a.get('name', '')}** ({a.get('type', '')}): {a.get('why_recommended', '')}")
    lines.append("\n## Unique Experiences")
    for e in proposal.get("unique_experiences", []):
        lines.append(f"• {e}")
    lines.append("\n## Practical Notes")
    for n in proposal.get("practical_notes", []):
        lines.append(f"• {n}")
    lines.append(f"\n## Next Steps\n{proposal.get('next_steps', '')}")
    lines.append(f"\n---\n*Advisor Notes (Private):* {proposal.get('advisor_notes', '')}")
    return "\n".join(lines)


def _format_itinerary_as_note(itinerary: dict) -> str:
    lines = [
        f"# {itinerary.get('theme', 'Luxury Itinerary')} — {itinerary.get('destination', '')}",
        f"\n**Client:** {itinerary.get('client_name', '')}",
        f"**Generated:** {itinerary.get('generated_at', '')}",
        "\n## Day-by-Day Programme"
    ]
    for day in itinerary.get("days", []):
        lines.append(f"\n### {day.get('date_note', f'Day {day.get(\"day\", \"?\")}')}")
        lines.append(f"🌅 **Morning:** {day.get('morning', '')}")
        lines.append(f"☀️ **Afternoon:** {day.get('afternoon', '')}")
        lines.append(f"🌙 **Evening:** {day.get('evening', '')}")
        lines.append(f"🏨 **Accommodation:** {day.get('accommodation', '')}")
        lines.append(f"💡 **Lanai Insider Tip:** {day.get('insider_tip', '')}")
    lines.append(f"\n## Highlights\n" + "\n".join(f"• {h}" for h in itinerary.get("highlights", [])))
    lines.append(f"\n## The Lanai Advantage\n{itinerary.get('lanai_advantage', '')}")
    return "\n".join(lines)


# ─── HEALTH CHECK ────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "lanai-proposal-engine",
        "ollama": "connected" if health_check() else "disconnected",
        "model": "llama3.2:3b"
    }), 200


if __name__ == "__main__":
    logger.info(f"Starting Lanai Proposal Engine on port {PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
