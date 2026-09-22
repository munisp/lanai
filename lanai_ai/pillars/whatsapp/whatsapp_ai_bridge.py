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

sys.path.insert(0, '/opt/lanai/lanai_ai')
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
        logging.FileHandler("/opt/lanai/lanai_ai/logs/whatsapp.log"),
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

    # ── 1. Look up client in CRM (best-effort; degrade gracefully) ────────────
    person = None
    try:
        person = find_person_by_phone(phone)
    except Exception as e:
        logger.warning(f"CRM lookup failed (continuing without it): {e}")
    if person:
        first = person.get("name", {}).get("firstName", "")
        last  = person.get("name", {}).get("lastName", "")
        client_name = f"{first} {last}".strip() or "Unknown Client"
        person_id   = person["id"]
        is_new      = False
        logger.info(f"Found existing client: {client_name} ({person_id})")
    else:
        # No external CRM match — treat as new inbound contact.
        client_name = f"WhatsApp {phone[-4:]}"
        person_id   = None
        is_new      = True
        logger.info(f"New inbound contact from {phone}")

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

    note = None
    try:
        note = create_note(note_title, note_body, person_id)
        logger.info(f"Created note: {note.get('id')}")
    except Exception as e:
        logger.warning(f"CRM note creation skipped (external CRM unavailable): {e}")

    # ── 4. Create task if high urgency or new contact ─────────────────────────
    if urgency == "HIGH" or is_new or intent in ["COMPLAINT", "URGENT"]:
        task_title = f"{'🚨 URGENT' if urgency == 'HIGH' else '📋'} Respond to {client_name} — {intent}"
        task_body  = f"WhatsApp from {phone}\n\nMessage: {text[:200]}\n\nSuggested action: {suggested}\n\nDraft reply ready in linked note."
        try:
            task = create_task(task_title, task_body, person_id)
            logger.info(f"Created task: {task.get('id')}")
        except Exception as e:
            logger.warning(f"CRM task creation skipped (external CRM unavailable): {e}")

    # ── 5. Persist to the Lanai platform DB (replaces external CRM writes) ────
    try:
        import requests as req
        portal = os.getenv("LANAI_PORTAL_URL", "http://localhost:3001")
        resp = req.post(
            f"{portal}/api/whatsapp/inbound",
            headers={"Content-Type": "application/json"},
            json={
                "phone": phone,
                "client_name": client_name,
                "intent": intent,
                "urgency": urgency,
                "sentiment": sentiment,
                "summary": summary,
                "suggested_action": suggested,
                "draft_reply": draft,
                "tags": tags,
                "estimated_value": est_value,
                "message": text,
                "is_new": is_new,
            },
            timeout=10,
        )
        logger.info(f"Persisted inbound to portal: {resp.status_code} {resp.text[:120]}")
    except Exception as e:
        logger.error(f"Failed to persist inbound to portal: {e}")

    # ── 6. Store the raw message in the portal inbox (for the agent UI) ───────
    try:
        import requests as req
        portal = os.getenv("LANAI_PORTAL_URL", "http://localhost:3001")
        resp2 = req.post(
            f"{portal}/api/whatsapp/messages",
            headers={"Content-Type": "application/json"},
            json={
                "phone": phone,
                "body": text,
                "contact_name": client_name,
                "triage": {
                    "intent": intent,
                    "urgency": urgency,
                    "sentiment": sentiment,
                    "summary": summary,
                    "suggested_action": suggested,
                    "draft_reply": draft,
                },
            },
            timeout=10,
        )
        logger.info(f"Stored inbox message: {resp2.status_code} {resp2.text[:120]}")
    except Exception as e:
        logger.error(f"Failed to store inbox message: {e}")

    # ── 7. Auto-acknowledge: send an immediate WhatsApp reply to the client ──
    _auto_reply(phone, client_name, text, draft, intent, urgency)

    return triage


def _auto_reply(phone: str, client_name: str, text: str, draft: str, intent: str, urgency: str):
    """Send an immediate acknowledgement WhatsApp to the client who messaged us.

    Uses the AI-generated draft reply when available, otherwise a friendly
    acknowledgement. Inbound messages always open a 24h free-form window.
    """
    if not phone:
        return

    if draft and draft.strip():
        reply = draft.strip()
    else:
        first = client_name.split()[-1] if client_name else "there"
        reply = (
            f"Thank you for messaging Lanai, {first}. We've received your note "
            f"and a dedicated advisor will be in touch shortly. If this is urgent, "
            f"please reply URGENT and we'll prioritise it."
        )

    # Safety cap to respect WhatsApp text limits.
    reply = reply[:4000]

    try:
        import requests as req
        resp = req.post(
            "http://localhost:5555/api/send-whatsapp",
            headers={"Content-Type": "application/json"},
            json={"to": phone, "message": reply},
            timeout=15,
        )
        logger.info(f"Auto-reply sent to {phone}: {resp.status_code} {resp.text[:120]}")
    except Exception as e:
        logger.error(f"Failed to send auto-reply to {phone}: {e}")


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
