"""
Lanai AI — Pillar 6: The Lanai Intelligence Engine
Morning Briefing, Opportunity Spotting, and Infinite Memory.
Runs daily at 7:30 AM and on-demand via API.
"""
import sys
import os
import json
import logging
from datetime import datetime, timedelta
from flask import Flask, request, jsonify

sys.path.insert(0, '/home/ubuntu/lanai_ai')
from core.ollama_client import ask_json, ask, health_check
from core.crm_connector import (get_people, get_members, get_travel_requests,
                                  get_opportunities, create_note, create_task, gql)
from core.prompts import morning_briefing_prompt, opportunity_spotting_prompt, BRIEFING_SYSTEM

PORT = int(os.getenv("BRIEFING_PORT", 5559))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("/home/ubuntu/lanai_ai/logs/briefing.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("lanai.briefing")

app = Flask(__name__)


# ─── MORNING BRIEFING ────────────────────────────────────────────────────────

@app.route("/api/morning-briefing", methods=["GET", "POST"])
def morning_briefing():
    """
    Generate the Lanai daily morning briefing.
    Aggregates CRM data and produces an actionable digest.
    """
    date_str = datetime.utcnow().strftime("%A, %d %B %Y")
    logger.info(f"Generating morning briefing for {date_str}")

    # ── Fetch CRM data ────────────────────────────────────────────────────────
    people           = get_people(50)
    members          = get_members(50)
    travel_requests  = get_travel_requests(50)
    opportunities    = get_opportunities(50)

    # ── Build context for AI ──────────────────────────────────────────────────
    pending_requests = []
    for tr in travel_requests:
        if tr.get("status") in ["ENQUIRY", "QUALIFICATION", "DISCOVERY", "PROPOSAL"]:
            pending_requests.append({
                "name": tr.get("name", "Unknown"),
                "destination": tr.get("destination", "TBD"),
                "status": tr.get("status"),
                "departure": tr.get("departureDate", "TBD"),
                "budget": tr.get("budgetRange", "Unknown")
            })

    upcoming_trips = []
    cutoff = datetime.utcnow() + timedelta(days=14)
    for tr in travel_requests:
        dep = tr.get("departureDate")
        if dep:
            try:
                dep_dt = datetime.fromisoformat(dep.replace("Z", ""))
                if datetime.utcnow() <= dep_dt <= cutoff:
                    upcoming_trips.append({
                        "client": tr.get("name", "Unknown"),
                        "destination": tr.get("destination", "TBD"),
                        "departure": dep
                    })
            except:
                pass

    renewals_due = []
    renewal_cutoff = datetime.utcnow() + timedelta(days=30)
    for m in members:
        renewal = m.get("renewalDate")
        if renewal:
            try:
                renewal_dt = datetime.fromisoformat(renewal.replace("Z", ""))
                if datetime.utcnow() <= renewal_dt <= renewal_cutoff:
                    renewals_due.append({
                        "member": m.get("name", "Unknown"),
                        "tier": m.get("membershipTier", "Unknown"),
                        "renewal_date": renewal
                    })
            except:
                pass

    # High risk clients (simple heuristic)
    high_risk = []
    for p in people[:20]:
        name = f"{p.get('name', {}).get('firstName', '')} {p.get('name', {}).get('lastName', '')}".strip()
        created = p.get("createdAt", "")
        if created:
            try:
                created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                days_old   = (datetime.now(created_dt.tzinfo) - created_dt).days
                if days_old > 90:
                    high_risk.append({"name": name, "days_inactive": days_old})
            except:
                pass

    # ── Generate AI briefing ──────────────────────────────────────────────────
    briefing = ask_json(
        morning_briefing_prompt(date_str, pending_requests[:10], upcoming_trips[:5],
                                renewals_due[:5], high_risk[:5]),
        system=BRIEFING_SYSTEM
    )

    # Add raw stats
    briefing["stats"] = {
        "total_clients": len(people),
        "total_members": len(members),
        "pending_requests": len(pending_requests),
        "upcoming_departures": len(upcoming_trips),
        "renewals_due_30_days": len(renewals_due),
        "open_opportunities": len([o for o in opportunities if o.get("stage") not in ["WON", "LOST"]])
    }
    briefing["generated_at"] = datetime.utcnow().isoformat()

    # ── Save briefing as CRM note ─────────────────────────────────────────────
    note_title = f"📋 Morning Briefing — {date_str}"
    note_body  = _format_briefing_note(briefing, date_str)
    create_note(note_title, note_body)
    logger.info("Morning briefing generated and saved to CRM")

    return jsonify(briefing), 200


# ─── OPPORTUNITY SCANNER ─────────────────────────────────────────────────────

@app.route("/api/scan-opportunities", methods=["GET"])
def scan_opportunities():
    """
    Scan all clients and identify proactive outreach opportunities.
    """
    people  = get_people(30)
    season  = _current_season()
    results = []

    default_offers = [
        "Private villa in Maldives with butler service",
        "Safari in Kenya — exclusive camp access",
        "Christmas markets river cruise",
        "New Year's Eve in Sydney — private harbour cruise",
        "Cherry blossom season in Japan",
        "Northern Lights expedition — Iceland private lodge",
        "Amalfi Coast yacht charter",
        "Venice Simplon-Orient-Express luxury train journey"
    ]

    # Analyse top 5 clients for opportunities (AI-intensive)
    for person in people[:5]:
        name = f"{person.get('name', {}).get('firstName', '')} {person.get('name', {}).get('lastName', '')}".strip()
        if not name:
            continue

        opp = ask_json(
            opportunity_spotting_prompt(name, "Recent luxury travel", "luxury, exclusivity",
                                        season, default_offers),
            system=BRIEFING_SYSTEM
        )
        if "error" not in opp:
            opp["client_id"]   = person["id"]
            opp["client_name"] = name
            results.append(opp)

    return jsonify({"opportunities": results, "count": len(results), "season": season}), 200


# ─── INFINITE MEMORY ─────────────────────────────────────────────────────────

@app.route("/api/client-memory", methods=["POST"])
def client_memory():
    """
    Build a comprehensive memory profile for a client from all CRM data.
    This is the 'Infinite Memory' feature — the AI remembers everything about a client.
    """
    data        = request.get_json() or {}
    client_name = data.get("client_name", "Client")
    person_id   = data.get("person_id")
    notes       = data.get("notes", [])
    bookings    = data.get("bookings", [])
    preferences = data.get("preferences", [])

    prompt = f"""Build a comprehensive memory profile for Lanai client: {client_name}

All available data:
- Notes/interactions: {json.dumps(notes, default=str)[:1500]}
- Bookings: {json.dumps(bookings, default=str)[:1000]}
- Known preferences: {json.dumps(preferences, default=str)[:500]}

Return a JSON object with:
- "client_name": the client name
- "personality_profile": inferred personality and communication style
- "travel_dna": their unique travel DNA (what makes them tick)
- "dream_trips": list of 3 trips they would love but haven't taken yet
- "do_not_suggest": list of things to never suggest to this client
- "golden_rules": list of 3-5 rules for working with this client
- "relationship_stage": current relationship depth (PROSPECT/ACTIVE/LOYAL/ADVOCATE)
- "memorable_moments": list of key moments in the client relationship
- "next_wow_moment": one idea for a surprise/delight moment Lanai could create

Return ONLY valid JSON."""

    memory = ask_json(prompt, system=BRIEFING_SYSTEM)

    if person_id and "error" not in memory:
        note_title = f"🧠 Infinite Memory — {client_name}"
        note_body  = _format_memory_note(memory, client_name)
        create_note(note_title, note_body, person_id)

    return jsonify(memory), 200


# ─── ADVISOR ASSISTANT ───────────────────────────────────────────────────────

@app.route("/api/ask-lanai", methods=["POST"])
def ask_lanai():
    """
    General-purpose AI assistant for Lanai advisors.
    Ask anything about luxury travel, clients, or concierge services.
    """
    data     = request.get_json() or {}
    question = data.get("question", "")
    context  = data.get("context", "")

    if not question:
        return jsonify({"error": "question is required"}), 400

    system = """You are the Lanai Intelligence Engine — a world-class luxury travel and concierge AI assistant.
You support Lanai advisors with expert knowledge about luxury travel, destinations, suppliers, 
client management, and concierge services. Be concise, professional, and actionable."""

    full_prompt = f"{context}\n\nAdvisor question: {question}" if context else question
    answer = ask(full_prompt, system=system, temperature=0.4, max_tokens=800)

    return jsonify({"answer": answer, "question": question}), 200


# ─── UTILITY ─────────────────────────────────────────────────────────────────

def _current_season() -> str:
    month = datetime.now().month
    if month in [12, 1, 2]:  return "Winter"
    if month in [3, 4, 5]:   return "Spring"
    if month in [6, 7, 8]:   return "Summer"
    return "Autumn"


def _format_briefing_note(briefing: dict, date_str: str) -> str:
    lines = [
        f"# 📋 Lanai Morning Briefing — {date_str}",
        f"\n**Headline:** {briefing.get('headline', '')}",
        "\n## 🎯 Priority Actions Today"
    ]
    for i, action in enumerate(briefing.get("priority_actions", []), 1):
        urgency = action.get("urgency", "")
        emoji   = "🚨" if urgency == "HIGH" else "📌"
        lines.append(f"{emoji} **{i}. {action.get('action', '')}**")
        lines.append(f"   Client: {action.get('client', '')} | Reason: {action.get('reason', '')}")

    stats = briefing.get("stats", {})
    lines.append("\n## 📊 Today's Numbers")
    lines.append(f"• Total Clients: {stats.get('total_clients', 0)}")
    lines.append(f"• Members: {stats.get('total_members', 0)}")
    lines.append(f"• Pending Requests: {stats.get('pending_requests', 0)}")
    lines.append(f"• Upcoming Departures (14 days): {stats.get('upcoming_departures', 0)}")
    lines.append(f"• Renewals Due (30 days): {stats.get('renewals_due_30_days', 0)}")
    lines.append(f"• Open Opportunities: {stats.get('open_opportunities', 0)}")

    lines.append(f"\n## 💡 Opportunity of the Day\n{briefing.get('opportunity_of_the_day', '')}")
    lines.append(f"\n## 💬 Team Note\n{briefing.get('team_note', '')}")
    return "\n".join(lines)


def _format_memory_note(memory: dict, client_name: str) -> str:
    return f"""# 🧠 Infinite Memory — {client_name}

## Travel DNA
{memory.get('travel_dna', '')}

## Personality Profile
{memory.get('personality_profile', '')}

## Dream Trips
{chr(10).join(f'• {t}' for t in memory.get('dream_trips', []))}

## Golden Rules for {client_name}
{chr(10).join(f'{i+1}. {r}' for i, r in enumerate(memory.get('golden_rules', [])))}

## Do NOT Suggest
{chr(10).join(f'• {d}' for d in memory.get('do_not_suggest', []))}

## Relationship Stage: {memory.get('relationship_stage', 'Unknown')}

## Next Wow Moment
{memory.get('next_wow_moment', '')}
"""


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "lanai-intelligence-engine",
        "ollama": "connected" if health_check() else "disconnected"
    }), 200


if __name__ == "__main__":
    logger.info(f"Starting Lanai Intelligence Engine on port {PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
