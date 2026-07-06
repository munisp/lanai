## Summary

This PR adds the Chatwoot unified inbox system AND fixes a critical deployment bug that prevented ALL API endpoints from working.

## 🚨 Deployment Fix (Critical)

**ROOT CAUSE:** The deployed `lanai-server` container was running the broken `server/index.ts` (static files only) instead of the full server. Every request — including `/api/trpc/*`, `/api/oauth/*`, `/api/stripe/webhook`, `/crm`, `/api/chatwoot/*` — returned `index.html`.

**FIX:** Rewrote `server/index.ts` to wire up all API routes:
- tRPC API (`/api/trpc/*`)
- OAuth callback (`/api/oauth/*`)
- Stripe webhook (`/api/stripe/webhook`)
- CRM proxy (`/crm`)
- Chatwoot proxy (`/api/chatwoot`)
- Storage proxy (`/manus-storage/*`)
- Static SPA serving with fallback

Also added:
- Multi-stage `Dockerfile` for lanai-server
- `.env.example` with all 30+ environment variables
- `DEPLOYMENT.md` with full architecture diagram, services inventory, port reference, and troubleshooting guide

See **DEPLOYMENT.md** for complete instructions.

---

## Chatwoot Integration

This PR completes the Chatwoot integration for Lanai Lifestyle, adding a comprehensive unified inbox system that connects WhatsApp, web chat, email, and other channels into a single AI-powered interface.

## What's Included

### Backend (lanai_ai/pillars/chatwoot/app.py)
- **Flask microservice** (port 5560) - Chatwoot AI Bridge
- Real-time conversation sync from Chatwoot platform
- **AI-powered triage** using Ollama (llama3.2:3b):
  - Intent detection (TRAVEL_ENQUIRY, BOOKING_FOLLOW_UP, COMPLAINT, etc.)
  - Sentiment analysis (POSITIVE, NEUTRAL, NEGATIVE)
  - Urgency scoring (HIGH, MEDIUM, LOW)
  - Estimated value calculation
- Smart draft reply generation via Ollama
- Contact lookup and sync to Twenty CRM
- Webhook handler for real-time message delivery
- REST API for conversations, messages, contacts, and analytics

### Server-Side Integration (lanai-portal/server/)
- **Chatwoot API proxy** - Prevents credential exposure in browser
- **tRPC routes** for type-safe API access:
  - List/filter conversations by status
  - Fetch conversation details with messages
  - Send messages (outgoing/incoming)
  - Generate AI draft replies
  - List and search contacts
  - Analytics and statistics

### Frontend (lanai-portal/client/src/)
- **Chatwoot Inbox page** (`/chatwoot`) with:
  - Real-time conversation list with search and filter
  - Full message thread view
  - AI-powered draft reply generation
  - Intent/sentiment/urgency display
  - Contact information (phone, email)
  - Status badges and labels
- **Sidebar navigation** integration

### Documentation
- Updated README with Chatwoot API endpoints
- Environment variables documentation
- Comprehensive todo.md

## API Endpoints

### Chatwoot AI Bridge (port 5560)
| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /api/stats | Conversation statistics |
| GET | /api/conversations | List conversations |
| GET | /api/conversations/<id>/messages | Get messages |
| POST | /api/conversations/<id>/messages | Send message |
| POST | /api/conversations/<id>/ai-draft | Generate AI draft |
| POST | /webhooks/chatwoot | Webhook handler |

## Configuration

Set these environment variables:
```env
CHATWOOT_URL=http://localhost:3000
CHATWOOT_ACCESS_TOKEN=<token>
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_WEBHOOK_SECRET=<secret>
CHATWOOT_AI_BRIDGE_URL=http://localhost:5560
```

## Testing

Start the Chatwoot AI Bridge:
```bash
cd lanai_ai/pillars/chatwoot && python3 app.py
```

Access the Chatwoot Inbox at: `/chatwoot`

## Files Changed
- `lanai_ai/pillars/chatwoot/__init__.py` - Package init
- `lanai_ai/pillars/chatwoot/app.py` - Main Chatwoot AI Bridge service
- `lanai-portal/server/_core/chatwootProxy.ts` - API proxy
- `lanai-portal/server/chatwootRouter.ts` - tRPC routes
- `lanai-portal/client/src/lib/chatwoot.ts` - tRPC client
- `lanai-portal/client/src/pages/ChatwootPage.tsx` - Inbox UI
- `lanai-portal/client/src/App.tsx` - Route registration
- `lanai-portal/client/src/components/DashboardLayout.tsx` - Sidebar nav
- `README.md` - Documentation
- `lanai-portal/todo.md` - Project tracker

## Deployment Fix Files

- `DEPLOYMENT.md` - Complete deployment guide with architecture diagram
- `lanai-portal/Dockerfile` - Multi-stage Docker build
- `lanai-portal/.env.example` - All environment variables documented
- `lanai-portal/server/index.ts` - Fixed server (was static-only, now full API)
