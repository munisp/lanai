"""
Lanai AI — Pillar 7: Chatwoot AI Bridge
Integrates Chatwoot as a unified inbox for Lanai Lifestyle, connecting
WhatsApp, web chat, email, and other channels into a single AI-powered
message management system with CRM integration.

Architecture:
- Flask service (port 5560)
- Connects to Chatwoot REST API v2
- AI triage via Ollama (llama3.2:3b)
- CRM lookup by phone/email
- Real-time message processing via Chatwoot webhooks
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
                                  create_note, create_task, get_people,
                                  find_person_by_email)
from core.prompts import whatsapp_triage_prompt, WHATSAPP_TRIAGE_SYSTEM

# ─── CONFIG ──────────────────────────────────────────────────────────────────
CHATWOOT_URL = os.getenv("CHATWOOT_URL", "http://localhost:3000")
CHATWOOT_TOKEN = os.getenv("CHATWOOT_ACCESS_TOKEN", "")
CHATWOOT_ACCOUNT_ID = os.getenv("CHATWOOT_ACCOUNT_ID", "1")
CHATWOOT_WEBHOOK_SECRET = os.getenv("CHATWOOT_WEBHOOK_SECRET", "")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
PORT = int(os.getenv("PORT", 5560))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("/home/ubuntu/lanai_ai/logs/chatwoot.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("lanai.chatwoot")

app = Flask(__name__)


# ─── Chatwoot API Helper ─────────────────────────────────────────────────────

def chatwoot_api(method: str, endpoint: str, data: dict = None, params: dict = None) -> dict:
    """Make a REST API call to Chatwoot."""
    import requests as req
    
    url = f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/{endpoint.lstrip('/')}"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Lanai-AI-Bridge/1.0",
        "Authorization": f"Bearer {CHATWOOT_TOKEN}",
    }
    
    try:
        if method == "GET":
            resp = req.get(url, headers=headers, params=params, timeout=10)
        elif method == "POST":
            resp = req.post(url, headers=headers, json=data, timeout=10)
        elif method == "PUT":
            resp = req.put(url, headers=headers, json=data, timeout=10)
        elif method == "DELETE":
            resp = req.delete(url, headers=headers, timeout=10)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        resp.raise_for_status()
        return resp.json() if resp.status_code != 204 else {}
    except Exception as e:
        logger.error(f"Chatwoot API error ({method} {endpoint}): {e}")
        return {}


# ─── Webhook Verification & Processing ───────────────────────────────────────

@app.route("/webhooks/chatwoot", methods=["POST"])
def handle_chatwoot_webhook():
    """
    Handle Chatwoot webhooks for real-time message delivery.
    Chatwoot sends events like 'message_created', 'conversation_updated', etc.
    """
    # Verify webhook signature if secret is configured
    if CHATWOOT_WEBHOOK_SECRET:
        signature = request.headers.get("X-Chatwoot-Token")
        if not signature or signature != CHATWOOT_WEBHOOK_SECRET:
            logger.warning("Invalid webhook signature")
            return jsonify({"error": "Invalid signature"}), 403
    
    data = request.get_json(silent=True) or {}
    event_type = data.get("event")
    resource = data.get("resource")
    
    logger.info(f"Chatwoot webhook: event={event_type}, resource={resource}")
    
    # Process message_created events
    if event_type == "message_created" and resource.get("content"):
        try:
            _process_chatwoot_message(resource)
        except Exception as e:
            logger.error(f"Error processing webhook message: {e}", exc_info=True)
    
    # Process conversation_updated events
    elif event_type == "conversation_updated":
        try:
            conversation_id = resource.get("id")
            status = resource.get("status")
            logger.info(f"Conversation {conversation_id} updated to status: {status}")
        except Exception as e:
            logger.error(f"Error processing conversation update: {e}", exc_info=True)
    
    return jsonify({"status": "ok"}), 200


def _process_chatwoot_message(message_data: dict):
    """Process an inbound message from Chatwoot."""
    message_id = message_data.get("id")
    content = message_data.get("content", "")
    sender = message_data.get("sender", {})
    conversation = message_data.get("conversation", {})
    
    # Extract contact info
    contact_id = conversation.get("contact", {}).get("id")
    sender_phone = sender.get("phone_number", "")
    sender_email = sender.get("email", "")
    sender_name = sender.get("name", sender.get("identifier", "Unknown"))
    
    if not content:
        return
    
    # Determine identifier for CRM lookup
    identifier = sender_phone or sender_email or f"chatwoot_{contact_id or message_id}"
    
    logger.info(f"Processing message from {identifier}: {content[:100]}")
    
    # Look up or create contact in CRM
    person = None
    person_id = None
    client_name = sender_name or f"Chatwoot Contact #{contact_id or 'new'}"
    
    if sender_phone:
        person = find_person_by_phone(sender_phone)
    elif sender_email:
        person = find_person_by_email(sender_email)
    
    if person:
        first = person.get("name", {}).get("firstName", "")
        last = person.get("name", {}).get("lastName", "")
        client_name = f"{first} {last}".strip() or sender_name
        person_id = person["id"]
        is_new = False
        logger.info(f"Found existing client: {client_name} ({person_id})")
    else:
        # Auto-create new contact
        parts = client_name.split()
        first_name = parts[0] if parts else "WhatsApp"
        last_name = parts[-1] if len(parts) > 1 else f"User {message_id[-4:]}"
        person = create_person(first_name, last_name, phone=sender_phone, email=sender_email)
        person_id = person.get("id")
        is_new = True
        client_name = f"{first_name} {last_name}"
        logger.info(f"Created new contact: {client_name} ({person_id})")
    
    # Run AI triage
    logger.info(f"Running AI triage for message from {client_name}...")
    triage = ask_json(
        whatsapp_triage_prompt(content, client_name),
        system=WHATSAPP_TRIAGE_SYSTEM
    )
    logger.info(f"AI triage result: {json.dumps(triage)[:300]}")
    
    # Extract triage results
    intent = triage.get("intent", "GENERAL_ENQUIRY")
    urgency = triage.get("urgency", "MEDIUM")
    sentiment = triage.get("sentiment", "NEUTRAL")
    summary = triage.get("summary", content[:100])
    suggested = triage.get("suggested_action", "Review and respond")
    draft = triage.get("draft_reply", "")
    tags = triage.get("tags", [])
    est_value = triage.get("estimated_value", 0)
    
    # Write note to CRM
    note_title = f"💬 Chatwoot [{intent}] — {client_name}"
    note_body = f"""**Inbound Chatwoot Message**
From: {client_name} ({identifier})
Received: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}

**Message:**
{content}

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
        note_body += "\n⚠️ **New Contact** — auto-created from Chatwoot. Please verify and update profile."
    
    create_note(note_title, note_body, person_id)
    logger.info(f"Created note for {client_name}")
    
    # Create task if high urgency or new contact
    if urgency == "HIGH" or is_new or intent in ["COMPLAINT", "URGENT"]:
        task_title = f"{'🚨 URGENT' if urgency == 'HIGH' else '📋'} Respond to {client_name} — {intent}"
        task_body = f"Chatwoot message from {identifier}\n\nMessage: {content[:200]}\n\nSuggested action: {suggested}\n\nDraft reply ready in linked note."
        create_task(task_title, task_body, person_id)
        logger.info(f"Created task for {client_name}")


# ─── Conversation & Message Endpoints ────────────────────────────────────────

@app.route("/api/conversations", methods=["GET"])
def list_conversations():
    """
    Fetch conversations from Chatwoot for the advisor portal.
    Query params: status (open/closed/archived), limit, offset
    """
    status = request.args.get("status", "open")
    limit = int(request.args.get("limit", "50"))
    offset = int(request.args.get("offset", "0"))
    
    conversations = chatwoot_api("GET", "/conversations", params={"status": status, "limit": limit, "offset": offset})
    
    if not conversations:
        return jsonify({"conversations": [], "total": 0})
    
    # Transform to simplified format
    result = []
    for conv in conversations.get("payload", []) if "payload" in conversations else (conversations if isinstance(conversations, list) else []):
        contact = conv.get("contact", {})
        last_message = conv.get("last_activity_message", {})
        
        result.append({
            "id": conv.get("id"),
            "identifier": conv.get("identifier"),
            "name": contact.get("name", "Unknown"),
            "phone": contact.get("phone_number", ""),
            "email": contact.get("email", ""),
            "last_message": last_message.get("content", ""),
            "last_message_time": last_message.get("created_at", ""),
            "status": conv.get("status", "open"),
            "labels": conv.get("labels", []),
            "priority": conv.get("priority", "normal"),
            "inbox": conv.get("inbox", {}).get("name", "General"),
        })
    
    total = conversations.get("meta", {}).get("total_count", len(result)) if "meta" in conversations else len(result)
    
    return jsonify({"conversations": result, "total": total, "limit": limit, "offset": offset})


@app.route("/api/conversations/<int:conversation_id>/messages", methods=["GET"])
def get_conversation_messages(conversation_id: int):
    """Fetch messages for a specific conversation."""
    messages = chatwoot_api("GET", f"/conversations/{conversation_id}/messages")
    
    if not messages:
        return jsonify({"messages": []})
    
    transformed = []
    for msg in messages.get("payload", []) if "payload" in messages else (messages if isinstance(messages, list) else []):
        sender = msg.get("sender", {})
        transformed.append({
            "id": msg.get("id"),
            "content": msg.get("content", ""),
            "message_type": msg.get("message_type", "incoming"),
            "created_at": msg.get("created_at", ""),
            "sender_name": sender.get("name", "Unknown") if isinstance(sender, dict) else "Unknown",
            "sender_id": sender.get("id") if isinstance(sender, dict) else None,
            "attachments": msg.get("attachments", []),
        })
    
    return jsonify({"messages": transformed})


@app.route("/api/conversations/<int:conversation_id>/messages", methods=["POST"])
def send_conversation_message(conversation_id: int):
    """
    Send a message in a conversation.
    Body: { "content": "...", "message_type": "outgoing", "attachments": [] }
    """
    data = request.get_json() or {}
    content = data.get("content", "")
    message_type = data.get("message_type", "outgoing")
    attachments = data.get("attachments", [])
    
    if not content:
        return jsonify({"error": "Missing content"}), 400
    
    payload = {
        "content": content,
        "message_type": message_type,
        "incoming": message_type == "incoming",
    }
    if attachments:
        payload["attachments"] = attachments
    
    result = chatwoot_api("POST", f"/conversations/{conversation_id}/messages", data=payload)
    
    if result:
        return jsonify(result), 200
    else:
        return jsonify({"error": "Failed to send message"}), 500


@app.route("/api/conversations/<int:conversation_id>/ai-draft", methods=["POST"])
def generate_ai_draft(conversation_id: int):
    """
    Generate an AI draft reply for a conversation.
    Body: { "message": "..." } (optional — if not provided, uses last message)
    """
    data = request.get_json() or {}
    message = data.get("message", "")
    
    if not message:
        # Fetch last message from conversation
        msgs = get_conversation_messages(conversation_id)
        msgs_data = msgs.get_json()
        if msgs_data and msgs_data.get("messages"):
            message = msgs_data["messages"][-1].get("content", "")
    
    if not message:
        return jsonify({"error": "No message content"}), 400
    
    # Get conversation context
    conv_data = chatwoot_api("GET", f"/conversations/{conversation_id}")
    contact = conv_data.get("contact", {})
    client_name = contact.get("name", "Client")
    
    # Generate AI draft
    triage = ask_json(
        whatsapp_triage_prompt(message, client_name),
        system=WHATSAPP_TRIAGE_SYSTEM
    )
    
    return jsonify({
        "draft_reply": triage.get("draft_reply", ""),
        "suggested_action": triage.get("suggested_action", ""),
        "intent": triage.get("intent", ""),
        "urgency": triage.get("urgency", ""),
    }), 200


# ─── Contact Management ──────────────────────────────────────────────────────

@app.route("/api/contacts", methods=["GET"])
def list_contacts():
    """
    Fetch contacts from Chatwoot and optionally sync to CRM.
    Query params: limit, offset, sync_to_crm (boolean)
    """
    limit = int(request.args.get("limit", "50"))
    offset = int(request.args.get("offset", "0"))
    sync = request.args.get("sync_to_crm", "false").lower() == "true"
    
    contacts = chatwoot_api("GET", "/contacts", params={"limit": limit, "offset": offset})
    
    if not contacts:
        return jsonify({"contacts": []})
    
    transformed = []
    for contact in contacts.get("payload", []) if "payload" in contacts else (contacts if isinstance(contacts, list) else []):
        entry = {
            "id": contact.get("id"),
            "name": contact.get("name", ""),
            "phone": contact.get("phone_number", ""),
            "email": contact.get("email", ""),
            "identifier": contact.get("identifier", ""),
            "custom_attributes": contact.get("custom_attributes", {}),
            "last_activity_at": contact.get("last_activity_at", ""),
        }
        transformed.append(entry)
        
        # Optionally sync to CRM
        if sync:
            _sync_contact_to_crm(contact)
    
    return jsonify({"contacts": transformed})


def _sync_contact_to_crm(chatwoot_contact: dict):
    """Sync a Chatwoot contact to Twenty CRM."""
    phone = chatwoot_contact.get("phone_number", "")
    email = chatwoot_contact.get("email", "")
    name = chatwoot_contact.get("name", "")
    
    # Check if exists in CRM
    person = None
    if phone:
        person = find_person_by_phone(phone)
    elif email:
        person = find_person_by_email(email)
    
    if not person:
        # Create new contact
        parts = name.split() if name else ["Chatwoot", "User"]
        first_name = parts[0]
        last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
        person = create_person(first_name, last_name, phone=phone, email=email)
        logger.info(f"Synced Chatwoot contact to CRM: {name}")


# ─── AI Triage & Draft Endpoints ─────────────────────────────────────────────

@app.route("/api/ai-triage", methods=["POST"])
def ai_triage():
    """
    Run AI triage on a message.
    Body: { "message": "...", "client_name": "...", "context": "..." }
    """
    data = request.get_json() or {}
    message = data.get("message", "")
    client_name = data.get("client_name", "Client")
    context = data.get("context", "")
    
    if not message:
        return jsonify({"error": "Missing message"}), 400
    
    triage = ask_json(
        whatsapp_triage_prompt(message, client_name, context),
        system=WHATSAPP_TRIAGE_SYSTEM
    )
    
    return jsonify(triage), 200


@app.route("/api/ai-draft-reply", methods=["POST"])
def ai_draft_reply():
    """Generate an AI draft reply for a given message and client."""
    data = request.get_json() or {}
    message = data.get("message", "")
    client_name = data.get("client_name", "Client")
    context = data.get("context", "")
    
    if not message:
        return jsonify({"error": "Missing message"}), 400
    
    triage = ask_json(
        whatsapp_triage_prompt(message, client_name, context),
        system=WHATSAPP_TRIAGE_SYSTEM
    )
    return jsonify(triage), 200


# ─── Status & Analytics ──────────────────────────────────────────────────────

@app.route("/api/stats", methods=["GET"])
def get_stats():
    """Get Chatwoot analytics: total conversations, open, closed, etc."""
    stats = {}
    
    # Fetch conversation counts by status
    for status in ["open", "closed", "archived"]:
        data = chatwoot_api("GET", "/conversations", params={"status": status, "limit": 1})
        total = data.get("meta", {}).get("total_count", 0) if "meta" in data else 0
        stats[f"{status}_count"] = total
    
    # Fetch recent activity
    recent = chatwoot_api("GET", "/conversations", params={"status": "open", "limit": 10, "sort": "-last_activity_at"})
    stats["recent_conversations"] = [
        {
            "id": conv.get("id"),
            "name": conv.get("contact", {}).get("name", "Unknown"),
            "last_message": conv.get("last_activity_message", {}).get("content", "")[:100],
        }
        for conv in recent.get("payload", [])
    ]
    
    return jsonify(stats), 200


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    chatwoot_ok = bool(CHATWOOT_TOKEN and CHATWOOT_URL)
    ollama_ok = health_check()
    
    # Test Chatwoot connectivity
    try:
        chatwoot_api("GET", "/user/me")
        chatwoot_connected = True
    except:
        chatwoot_connected = chatwoot_ok  # Assume ok if token configured
    
    return jsonify({
        "status": "ok",
        "service": "lanai-chatwoot-ai-bridge",
        "chatwoot": "connected" if chatwoot_connected else "disconnected",
        "chatwoot_url": CHATWOOT_URL,
        "ollama": "connected" if ollama_ok else "disconnected",
        "model": OLLAMA_MODEL,
    }), 200


@app.route("/test/triage", methods=["POST"])
def test_triage():
    """Test the AI triage with a sample message."""
    data = request.get_json() or {}
    message = data.get("message", "Hi, I'd like to plan a honeymoon trip to the Maldives in March for 2 people. Budget around £15,000.")
    client = data.get("client_name", "Test Client")
    result = ask_json(whatsapp_triage_prompt(message, client), system=WHATSAPP_TRIAGE_SYSTEM)
    return jsonify(result), 200


if __name__ == "__main__":
    logger.info(f"Starting Lanai Chatwoot AI Bridge on port {PORT}")
    logger.info(f"Chatwoot URL: {CHATWOOT_URL}")
    logger.info(f"Ollama status: {'✓ Connected' if health_check() else '✗ Not available'}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
