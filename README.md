# Lanai Lifestyle — Intelligence Platform

A full-stack advisor portal and client-facing portal for Lanai Lifestyle, a luxury travel concierge company. Built with React + Vite (frontend), Twenty CRM (backend CRM), and a suite of Python/Flask AI microservices powered by Ollama (local LLM).

---

## Repository Structure

```
lanai/
├── lanai-portal/                  # React + Vite advisor & client portal
│   ├── client/src/
│   │   ├── pages/                 # All portal pages
│   │   │   ├── Dashboard.tsx      # Live CRM dashboard
│   │   │   ├── ClientsPage.tsx    # 1,200 CRM contacts (live GraphQL)
│   │   │   ├── TravelRequestsPage.tsx  # Pipeline opportunities (live)
│   │   │   ├── MembersPage.tsx    # Active members (live)
│   │   │   ├── ProposalEnginePage.tsx  # Streaming AI proposal co-pilot
│   │   │   ├── ClientPortalLogin.tsx   # Member-facing login (/client)
│   │   │   └── ClientPortalDashboard.tsx  # Member trip dashboard
│   │   └── components/            # Shared UI components
│   └── vite.config.ts             # Proxy config for CRM + AI services
│
├── lanai_ai/                      # Python/Flask AI microservices
│   └── pillars/
│       ├── whatsapp/app.py        # Port 5555 — WhatsApp AI triage
│       ├── proposals/app.py       # Port 5556 — Proposal engine (SSE streaming)
│       ├── intelligence/app.py    # Port 5557 — Client intelligence
│       └── briefing/app.py        # Port 5558 — Morning briefing
│
├── lanai_recommendations_presentation/  # Slide deck (HTML slides)
├── Lanai_Lifestyle_CRM_Handoff.md       # Technical handoff document
└── lanai_recommendations_outline.md     # Strategy recommendations
```

---

## Features

### Advisor Portal (`/`)
- **Dashboard** — Live CRM stats: 1,200 clients, 129 open requests, 21 members, £106M pipeline
- **Clients** — Searchable table of all CRM contacts (live Twenty CRM GraphQL)
- **Travel Requests** — Pipeline view with stage filters (Enquiry → Booking)
- **Members** — Membership dashboard with Platinum/Gold/Silver tiers
- **Proposal Co-Pilot** — AI-powered proposal generator with:
  - **Streaming mode**: word-by-word SSE output from Ollama
  - **Structured mode**: expandable JSON sections
- **Client Intelligence** — AI scoring and insights per client
- **Morning Briefing** — Daily AI-generated digest
- **WhatsApp Inbox** — AI-triaged message management

### Client Portal (`/client`)
- Secure PIN login (email + 4-digit PIN)
- Trip dashboard with itinerary view
- Travel request submission form
- WhatsApp quick-connect to advisor

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS 4, shadcn/ui |
| CRM | Twenty CRM (self-hosted, GraphQL API) |
| AI / LLM | Ollama (llama3.2:3b), Flask, SSE streaming |
| Routing | Wouter |
| Styling | Tailwind CSS 4, Playfair Display + Inter fonts |

---

## Local Development

### Prerequisites
- Node.js 22+, pnpm
- Python 3.11+
- Twenty CRM running on port 3000
- Ollama running on port 11434 with `llama3.2:3b` model

### Start the frontend
```bash
cd lanai-portal
pnpm install
pnpm dev
# Portal available at http://localhost:3001
```

### Start AI microservices
```bash
cd lanai_ai/pillars/proposals && python3 app.py   # Port 5556
cd lanai_ai/pillars/intelligence && python3 app.py # Port 5557
cd lanai_ai/pillars/briefing && python3 app.py     # Port 5558
cd lanai_ai/pillars/whatsapp && python3 app.py     # Port 5555
```

### CRM Proxy
The Vite dev server proxies `/crm/*` to Twenty CRM on port 3000, injecting the API JWT token server-side. No token is exposed to the browser.

---

## API Endpoints

### Proposal Engine (port 5556)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/generate-proposal` | Structured JSON proposal |
| POST | `/api/generate-proposal-stream` | SSE streaming markdown proposal |
| POST | `/api/generate-itinerary` | Day-by-day itinerary JSON |

### SSE Streaming Format
```
data: {"token": "word "}
data: {"token": "by "}
data: {"token": "word"}
data: [DONE]
```

---

## Presentation Deck

The `lanai_recommendations_presentation/` directory contains 14 HTML slides covering:
1. Title — The Intelligence Layer
2. Executive framing
3. Six-pillar framework
4. Pillars 1–6 (WhatsApp, Proposals, Intelligence, Client Portal, Suppliers, AI Advisor)
5. Implementation roadmap
6. **NEW**: Live CRM Integration (implemented)
7. **NEW**: Client Portal (implemented)
8. **NEW**: Streaming Proposal Co-Pilot (implemented)
9. Closing

---

## Environment Variables

The portal uses Vite's proxy to inject the Twenty CRM JWT token. For production deployment, set:

```env
VITE_CRM_TOKEN=<twenty_api_key>
VITE_CRM_URL=http://localhost:3000
```

---

*Built by Manus AI for Lanai Lifestyle — June 2026*
