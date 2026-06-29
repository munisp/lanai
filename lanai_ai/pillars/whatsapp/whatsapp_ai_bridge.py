"""
Lanai AI — Pillar 1: WhatsApp AI Intelligence Bridge
Receives inbound WhatsApp messages, runs AI triage via Ollama,
and writes structured notes + tasks back to the Twenty CRM.
"""
import sys
import os
import json
import logging
import hashlib
import hmac
from datetime import datetime
from flask import Flask, request, jsonify

sys.path.insert(0, '/home/ubuntu/lanai_ai')
from core.ollama_client import ask_json, health_check
from core.crm_connector import (find_person_by_phone, create_person,
                                  create_note, create_task, get_people)
from core.prompts import whatsapp_triage_prompt, WHATSAPP_TRIAGE_SYSTEM

# ─── CONFIG ──────────────────────────────────────────────────────────────────
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "lanai_verify_2024")
WHATSAPP_APP_SECRET   = os.getenv("WHATSAPP_APP_SECRET", "")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_ID     = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
PORT = int(os.getenv("PORT", 5555))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("/home/ubuntu/lanai_ai/logs/whatsapp.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("lanai.whatsapp")

app = Flask(__name__)


# ─── WEBHOOK VERIFICATION ────────────────────────────────────────────────────

@app.route("/webhook/whatsapp", methods=["GET"])
def verify_webhook():
    mode      = request.args.get("hub.mode")
    token     = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")
    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        logger.info("WhatsApp webhook verified successfully")
        return challenge, 200
    return "Forbidden", 403


# ─── INBOUND MESSAGE HANDLER ─────────────────────────────────────────────────

@app.route("/webhook/whatsapp", methods=["POST"])
def receive_message():
    data = request.get_json(silent=True) or {}
    logger.info(f"Inbound webhook: {json.dumps(data)[:500]}")

    try:
        entry = data.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])

        for msg in messages:
            _process_message(msg, value)

    except Exception as e:
        logger.error(f"Error processing webhook: {e}", exc_info=True)

    return jsonify({"status": "ok"}), 200


def _process_message(msg: dict, value: dict):
    """Process a single inbound WhatsApp message."""
    phone     = msg.get("from", "")
    msg_id    = msg.get("id", "")
    timestamp = msg.get("timestamp", "")
    msg_type  = msg.get("type", "text")

    # Extract message text
    if msg_type == "text":
        text = msg.get("text", {}).get("body", "")
    elif msg_type == "image":
        text = "[Image received]"
    elif msg_type == "document":
        text = f"[Document received: {msg.get('document', {}).get('filename', 'unknown')}]"
    elif msg_type == "audio":
        text = "[Voice message received]"
    else:
        text = f"[{msg_type} message received]"

    if not text:
        return

    logger.info(f"Processing message from {phone}: {text[:100]}")

    # ── 1. Look up client in CRM ──────────────────────────────────────────────
    person = find_person_by_phone(phone)
    if person:
        first = person.get("name", {}).get("firstName", "")
        last  = person.get("name", {}).get("lastName", "")
        client_name = f"{first} {last}".strip() or "Unknown Client"
        person_id   = person["id"]
        is_new      = False
        logger.info(f"Found existing client: {client_name} ({person_id})")
    else:
        # Auto-create new contact
        client_name = f"WhatsApp {phone[-4:]}"
        person      = create_person("WhatsApp", phone[-4:], phone=phone)
        person_id   = person.get("id")
        is_new      = True
        logger.info(f"Created new contact: {client_name} ({person_id})")

    # ── 2. Run AI triage ──────────────────────────────────────────────────────
    logger.info(f"Running AI triage for message from {client_name}...")
    triage = ask_json(
        whatsapp_triage_prompt(text, client_name),
        system=WHATSAPP_TRIAGE_SYSTEM
    )
    logger.info(f"AI triage result: {json.dumps(triage)[:300]}")

    # ── 3. Write note to CRM ──────────────────────────────────────────────────
    intent    = triage.get("intent", "GENERAL_ENQUIRY")
    urgency   = triage.get("urgency", "MEDIUM")
    sentiment = triage.get("sentiment", "NEUTRAL")
    summary   = triage.get("summary", text[:100])
    suggested = triage.get("suggested_action", "Review and respond")
    draft     = triage.get("draft_reply", "")
    tags      = triage.get("tags", [])
    est_value = triage.get("estimated_value", 0)

    note_title = f"📱 WhatsApp [{intent}] — {client_name}"
    note_body  = f"""**Inbound WhatsApp Message**
From: {phone}
Received: {datetime.utcfromtimestamp(int(timestamp)).strftime('%Y-%m-%d %H:%M UTC') if timestamp else 'now'}

**Message:**
{text}

---
**🤖 AI Triage**
• Intent: {intent}
• Urgency: {urgency}
• Sentiment: {sentiment}
• Summary: {summary}
• Tags: {', '.join(tags) if tags else 'none'}
• Estimated Value: £{est_value:,}

**Suggested Action:** {suggested}

**Draft Reply:**
> {draft}
"""
    if is_new:
        note_body += "\n⚠️ **New Contact** — auto-created from WhatsApp. Please verify and update profile."

    note = create_note(note_title, note_body, person_id)
    logger.info(f"Created note: {note.get('id')}")

    # ── 4. Create task if high urgency or new contact ─────────────────────────
    if urgency == "HIGH" or is_new or intent in ["COMPLAINT", "URGENT"]:
        task_title = f"{'🚨 URGENT' if urgency == 'HIGH' else '📋'} Respond to {client_name} — {intent}"
        task_body  = f"WhatsApp from {phone}\n\nMessage: {text[:200]}\n\nSuggested action: {suggested}\n\nDraft reply ready in linked note."
        task = create_task(task_title, task_body, person_id)
        logger.info(f"Created task: {task.get('id')}")

    return triage


# ─── OUTBOUND MESSAGE SENDER ─────────────────────────────────────────────────

@app.route("/api/send-whatsapp", methods=["POST"])
def send_whatsapp():
    """Send a WhatsApp message (used by advisors from the portal)."""
    data = request.get_json() or {}
    to      = data.get("to")
    message = data.get("message")

    if not to or not message:
        return jsonify({"error": "Missing 'to' or 'message'"}), 400

    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_ID:
        # Demo mode — log only
        logger.info(f"[DEMO] Would send WhatsApp to {to}: {message}")
        return jsonify({"status": "demo", "message": "WhatsApp credentials not configured. Message logged."}), 200

    import requests as req
    resp = req.post(
        f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_ID}/messages",
        headers={"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}", "Content-Type": "application/json"},
        json={"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": message}}
    )
    return jsonify(resp.json()), resp.status_code


# ─── AI DRAFT REPLY ENDPOINT ─────────────────────────────────────────────────

@app.route("/api/ai-draft-reply", methods=["POST"])
def ai_draft_reply():
    """Generate an AI draft reply for a given message and client."""
    data        = request.get_json() or {}
    message     = data.get("message", "")
    client_name = data.get("client_name", "Client")
    context     = data.get("context", "")

    if not message:
        return jsonify({"error": "Missing message"}), 400

    triage = ask_json(
        whatsapp_triage_prompt(message, client_name, context),
        system=WHATSAPP_TRIAGE_SYSTEM
    )
    return jsonify(triage), 200


# ─── HEALTH CHECK ────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    ollama_ok = health_check()
    return jsonify({
        "status": "ok",
        "service": "lanai-whatsapp-ai-bridge",
        "ollama": "connected" if ollama_ok else "disconnected",
        "model": "llama3.2:3b"
    }), 200


# ─── TEST ENDPOINT ───────────────────────────────────────────────────────────

@app.route("/test/triage", methods=["POST"])
def test_triage():
    """Test the AI triage with a sample message."""
    data    = request.get_json() or {}
    message = data.get("message", "Hi, I'd like to plan a honeymoon trip to the Maldives in March for 2 people. Budget around £15,000.")
    client  = data.get("client_name", "Test Client")
    result  = ask_json(whatsapp_triage_prompt(message, client), system=WHATSAPP_TRIAGE_SYSTEM)
    return jsonify(result), 200


if __name__ == "__main__":
    logger.info(f"Starting Lanai WhatsApp AI Bridge on port {PORT}")
    logger.info(f"Ollama status: {'✓ Connected' if health_check() else '✗ Not available'}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
