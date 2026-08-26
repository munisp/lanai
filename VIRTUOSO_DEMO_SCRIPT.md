# Lanai Virtuoso Demo Script

A demo of Bolanle's three service areas built on the latest working tree: (A) AI Virtuoso recommendations with manager approval of the top 3, (B) supplier-confirmation re-branding, and (C) a read-only client trip view.

## Prerequisites

- Node 22+, pnpm, Python 3.11+, Postgres, and Ollama with `qwen2.5:3b` (or `llama3.2:3b`).
- A `.env` with at least `DATABASE_URL`, `JWT_SECRET`, `AI_GATEWAY_URL`, `AI_GATEWAY_TOKEN`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`.
- If Ollama is not running, the recommendation engine falls back to rating-ranked results so the demo still works.

## One-time setup (run once)

```bash
cd lanai-portal
pnpm install

# Apply all migrations (0001 through 0008)
DATABASE_URL="postgres://lanai:lanai_password@localhost:5432/lanai" npx drizzle-kit migrate

# Seed the Virtuoso demo data (Paris hotels + rates + amenities + Aisha + requests)
psql "postgres://lanai:lanai_password@localhost:5432/lanai" -f seed_virtuoso_demo.sql

# Start the AI gateway (separate terminal)
cd lanai_ai/gateway && AI_GATEWAY_TOKEN=dev-token OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=qwen2.5:3b python3 app.py
```

## Run the portal

```bash
cd lanai-portal
pnpm dev    # portal on http://localhost:3001
```

Sign in as an advisor via Keycloak (or the local dev bypass if configured).

## Demo flow A: Virtuoso Recommendations (the headline)

1. Go to `http://localhost:3001/recommendations`.
2. Pick member **Aisha Okoye**, destination **Paris**, property type **Hotel**.
3. Click **Generate shortlist**.
   - You see 3 to 5 Virtuoso Paris hotels ranked by the AI, each with room tiers (baseline rates) and Virtuoso amenities, plus the AI's rationale for the rank.
   - The shortlist is grounded in Aisha's memory (preferences: Deluxe King, pescatarian; favourite destinations include Paris).
4. Click up to **3** cards to select them, then **Approve top 3**.
   - The shortlist is persisted as `approved`; this is Bolanle picking the top 3 to present to the client.

If Ollama is down, you still get a top-5 by rating with a clear "AI gateway unavailable" rationale.

## Demo flow B: Confirmation Re-brander

1. Go to `http://localhost:3001/rebrander`.
2. Pick member **Aisha Okoye**. A sample Four Seasons confirmation email is pre-filled (edit or paste your own).
3. Click **Extract and re-brand**.
   - The AI extracts: property, room, dates, booking reference, amount, and Virtuoso perks from the supplier email.
   - The right panel shows a clean **Lanai-branded confirmation** (dark green/gold, addressed to the client) and an editable **draft message**.
4. **Copy for WhatsApp** (puts the draft on the clipboard for Bolanle to send), or **Send email** (sends the branded confirmation via Resend to the member's email).

This is the "strip supplier branding, re-brand as Lanai, draft for one-click review-and-send" workflow. (Live inbound email receiving is a follow-up; the demo uses paste/import.)

## Demo flow C: Read-only Client Trip View

1. Go to `http://localhost:3001/client` and sign in as Aisha (member PIN).
2. The portal now shows only **My Trips** and **Documents** (read-only). The New Request, Messages, and Billing self-service tabs have been removed.
3. **My Trips** shows Aisha's trips (the upcoming Paris request + the past Amalfi trip) without her having to ask Bolanle for reminders.

This is the "digitize the back office, not the relationship" surface: clients view trips independently; Bolanle still owns all requests and communication.

## What is demo-ready vs. follow-up

- Demo-ready: A (recommendations + approve top 3 + catalog UI server-side), B (extract + re-brand + email/copy), C (read-only portal curtail).
- Follow-up (not in this demo): live inbound email webhook (B currently uses paste/import), auto-deriving `tripTimeline` from bookings and the local `memberPortal.myTrips` fix (C2), the curation UI on SuppliersPage (catalog is seeded for the demo), and a live Virtuoso/Little Emperors rate API.
- Reminder: this work is on `bionic/deployment-fixes`, uncommitted, and the branch should be rebased onto the latest `origin/main` before merging.
