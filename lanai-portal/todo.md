# Lanai Portal TODO

## Completed
- [x] Live CRM integration (Clients, Travel Requests, Members pages)
- [x] Client-facing portal route (/client) with login, trip view, travel request submission
- [x] Streaming Proposal Co-Pilot (SSE word-by-word output)
- [x] Full-stack upgrade (tRPC + MySQL + Manus OAuth)
- [x] 4 DB tables: members, member_sessions, member_invitations, advisor_users
- [x] Advisor OAuth gate with ProtectedRoute guards
- [x] Member login with bcrypt PIN + signed JWT cookie sessions
- [x] Advisor-initiated invite flow (email → PIN setup → CRM person linkage)
- [x] RBAC middleware: advisor / senior_advisor / admin / member procedures
- [x] Member data isolation: trips scoped to CRM personId
- [x] Tier-gated features: platinum/gold/standard
- [x] CRM proxy moved to Express (port 3000), Twenty CRM on port 3002

## Completed — AI Microservices
- [x] WhatsApp AI triage bridge (port 5555)
- [x] Proposal engine with SSE streaming (port 5556)
- [x] Client intelligence scoring (port 5557)
- [x] Morning briefing generator (port 5558)
- [x] **Chatwoot unified inbox AI bridge (port 5560)**
  - Real-time conversation sync from Chatwoot platform
  - AI-powered triage with intent/sentiment/urgency detection
  - Smart draft reply generation via Ollama
  - Contact lookup and sync to Twenty CRM
  - Webhook handler for real-time message delivery
  - REST API for conversations, messages, contacts, analytics
- [x] Server-side Chatwoot API proxy (prevents credential exposure)
- [x] tRPC routes for Chatwoot integration
- [x] Chatwoot Inbox page with full conversation UI
- [x] Sidebar navigation for Chatwoot Inbox

## Completed — Payments & Billing
- [x] Email delivery for member invitations via Resend API
- [x] Stripe integration: member subscription payments and card-on-file (platinum/gold/silver tiers, card-on-file, billing portal, webhook)
- [x] Promote first advisor to senior_advisor — auto-promoted to admin on first OAuth sign-in via OWNER_OPEN_ID
