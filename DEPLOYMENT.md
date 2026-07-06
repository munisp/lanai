# Lanai Lifestyle — Deployment Guide

## Architecture Overview

```
                                    ┌─────────────────────┐
                                    │  Cloudflare Tunnel   │
                                    │  lanai.newfire.app   │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │   lanai-server       │
                                    │   (port 3001)        │
                                    │                      │
                                    │  ┌────────────────┐ │
                                    │  │ Express + tRPC │ │
                                    │  └────┬───────┬───┘ │
                                    │       │       │     │
                                    │  /crm │ /api  │     │
                                    └──┬────┴──┬────┴─────┘
                                       │         │
              ┌────────────────────────┘         └──────────────────────┐
              │                                                          │
    ┌─────────▼──────────┐      ┌───────────────────────────────────┐   │
    │ Twenty CRM          │      │ Docker Network (app-net)           │   │
    │ (port 3000)         │      │                                    │   │
    │                    │      │ ┌─────────────┐  ┌──────────────┐  │   │
    │ ┌──────────────┐   │      │ │ Keycloak     │  │ PostgreSQL   │  │   │
    │ │ People,       │   │      │ │ (OAuth)      │  │ (farmer-     │  │   │
    │ │ Opportunities │   │      │ │ (port 8080)  │  │ postgres)    │  │   │
    │ └──────────────┘   │      │ └─────────────┘  └──────────────┘  │   │
    └────────────────────┘      │                                    │   │
                                │ ┌─────────────┐  ┌──────────────┐  │   │
                                │ │ Redis        │  │ OpenSearch   │  │   │
                                │ │ (6379)       │  │ (9200)       │  │   │
                                │ └─────────────┘  └──────────────┘  │   │
                                │                                    │   │
                                │ ┌─────────────┐  ┌──────────────┐  │   │
                                │ │ Temporal     │  │ TigerBeetle  │  │   │
                                │ │ (7233)       │  │ (3001)       │  │   │
                                │ └─────────────┘  └──────────────┘  │   │
                                │                                    │   │
                                │ ┌─────────────┐  ┌──────────────┐  │   │
                                │ │ Dapr         │  │ APISIX       │  │   │
                                │ │ (3500)       │  │ (9180)       │  │   │
                                │ └─────────────┘  └──────────────┘  │   │
                                │                                    │   │
                                │ ┌─────────────┐  ┌──────────────┐  │   │
                                │ │ Chatwoot     │  │ Ollama       │  │   │
                                │ │ (3000/3002)  │  │ (11434)      │  │   │
                                │ └─────────────┘  └──────────────┘  │   │
                                │                                    │   │
                                │ ┌─────────────┐  ┌──────────────┐  │   │
                                │ │ Whale AI     │  │ Proposals AI │  │   │
                                │ │ (5555)       │  │ (5556)       │  │   │
                                │ └─────────────┘  └──────────────┘  │   │
                                │                                    │   │
                                │ ┌─────────────┐  ┌──────────────┐  │   │
                                │ │ Intelligence │  │ Briefing AI  │  │   │
                                │ │ AI (5557)    │  │ (5558)       │  │   │
                                │ └─────────────┘  └──────────────┘  │   │
                                │                                    │   │
                                │ ┌─────────────────────────────┐   │   │
                                │ │ Chatwoot AI Bridge (5560)    │   │   │
                                │ └─────────────────────────────┘   │   │
                                └───────────────────────────────────┘   │
                                                                       │
    ┌──────────────────────────────────────────────────────────────────┘
    │ External Services
    │
    ├── Stripe (payments)          → api.stripe.com
    ├── Resend (email)             → api.resend.com
    └── Ollama (local LLM)         → tigerbeetle:11434 (same network)
```

---

## Services Inventory

| # | Service | Port | Role | Required |
|---|---------|------|------|----------|
| 1 | **Lanai Server** | 3001 | Express + tRPC API + SPA | **Yes** |
| 2 | **PostgreSQL** (farmer-postgres) | 5432 | Primary database | **Yes** |
| 3 | **Keycloak** | 8080 | OAuth 2.0 / SSO auth | **Yes** |
| 4 | **Redis** | 6379 | Session/cache layer | Yes |
| 5 | **OpenSearch** | 9200 | Full-text search | Yes |
| 6 | **Temporal** | 7233 | Workflow engine | Yes |
| 7 | **TigerBeetle** | 3001 | Financial ledger | Yes |
| 8 | **APISIX** | 9180 (admin) | API gateway | Optional |
| 9 | **Dapr** | 3500 | Service mesh / AI bridge | Yes |
| 10 | **Twenty CRM** | 3000 | CRM (people, opportunities) | **Yes** |
| 11 | **Chatwoot** | 3000/3002 | Omnichannel messaging | Yes (for Chatwoot inbox) |
| 12 | **Ollama** | 11434 | Local LLM (llama3.2, etc.) | Yes (for AI features) |
| 13 | **Whale AI** | 5555 | WhatsApp bridge microservice | Yes |
| 14 | **Proposals AI** | 5556 | Proposal generation microservice | Yes |
| 15 | **Intelligence AI** | 5557 | Client intelligence microservice | Yes |
| 16 | **Briefing AI** | 5558 | Daily briefing microservice | Yes |
| 17 | **Chatwoot AI Bridge** | 5560 | Chatwoot AI triage microservice | Yes (for Chatwoot inbox) |

### External Services (no Docker container needed)

| Service | Usage | Config |
|---------|-------|--------|
| Stripe | Payments & subscriptions | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Resend | Transactional email | `RESEND_API_KEY` |
| Cloudflare Tunnel | HTTPS reverse proxy | Tunnel ID: `d0f9998f-73ee-4c64-a259-0f09a65d9856` |

---

## Prerequisites

- Docker & Docker Compose v2+
- Cloudflare account with domain `newfire.app`
- Cloudflare Tunnel configured (Tunnel ID: `d0f9998f-73ee-4c64-a259-0f09a65d9856`)
- Ollama installed on the host (for local LLM features)

---

## Quick Start (Remote Server)

### Step 1: Deploy lanai-server container

The server is deployed as `lanai-server` on the `app-net` Docker network.

```bash
# Rebuild and redeploy the fixed server
sudo docker compose -f lanai-portal/docker-compose.server.yml up -d --build lanai-server
```

Or manually:

```bash
cd /home/newwaveclaw/projects/lanai-code/lanai-portal

# Build the Docker image
sudo docker build -t lanai-server:latest .

# Restart the container with correct env vars
sudo docker rm -f lanai-server 2>/dev/null
sudo docker run -d \
  --name lanai-server \
  --network app-net \
  -p 3001:3001 \
  -e PORT=3001 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://openhands:PASSWORD@farmer-postgres:5432/openhands \
  -e OAUTH_SERVER_URL=http://keycloak:8080 \
  -e VITE_APP_ID=lanai-portal \
  -e JWT_SECRET=YOUR_JWT_SECRET \
  -e OWNER_OPEN_ID=YOUR_OWNER_OPEN_ID \
  -e BUILT_IN_FORGE_API_URL=http://dapr:3500 \
  -e BUILT_IN_FORGE_API_KEY=YOUR_FORGE_API_KEY \
  -e REDIS_URL=redis://redis:6379/0 \
  -e OPENSEARCH_URL=http://opensearch:9200 \
  -e TEMPORAL_URL=temporal:7233 \
  -e TIGERBEETLE_ADDRESS=tigerbeetle:3001 \
  -e APISIX_ADMIN_URL=http://apisix:9180 \
  -e TWENTY_CRM_URL=http://twenty:3000 \
  -e TWENTY_CRM_API_TOKEN=YOUR_CRM_TOKEN \
  -e CHATWOOT_URL=http://chatwoot:3000 \
  -e CHATWOOT_ACCESS_TOKEN=YOUR_CHATWOOT_TOKEN \
  -e CHATWOOT_ACCOUNT_ID=1 \
  -e CHATWOOT_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET \
  -e CHATWOOT_AI_BRIDGE_URL=http://localhost:5560 \
  -e RESEND_API_KEY=YOUR_RESEND_KEY \
  -e FROM_EMAIL="Lanai Lifestyle <noreply@lanai.newfire.app>" \
  -e STRIPE_SECRET_KEY=YOUR_STRIPE_KEY \
  -e STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET \
  lanai-server:latest
```

### Step 2: Verify the server

```bash
# Check it's running
curl -s https://lanai.newfire.app/api/trpc/system.health?input=%7B%22timestamp%22%3A0%7D

# Should return: {"result":{"data":{"ok":true},"jsonApi":{"status":200}}}

# Check the SPA loads
curl -sI https://lanai.newfire.app | head -5
# Should return: HTTP/2 200, content-type: text/html
```

### Step 3: Start AI microservices

```bash
# Start Ollama (if not already running)
sudo docker run -d --name ollama --network app-net -p 11434:11434 ollama/ollama

# Pull the model
docker exec -it ollama ollama pull llama3.2:3b

# Start AI microservices (one per container)
sudo docker run -d --name whale-ai --network app-net -p 5555:5555 lanai-ai:whale
sudo docker run -d --name proposals-ai --network app-net -p 5556:5556 lanai-ai:proposals
sudo docker run -d --name intelligence-ai --network app-net -p 5557:5557 lanai-ai:intelligence
sudo docker run -d --name briefing-ai --network app-net -p 5558:5558 lanai-ai:briefing
sudo docker run -d --name chatwoot-ai --network app-net -p 5560:5560 lanai-ai:chatwoot
```

---

## Cloudflare Tunnel

Tunnel ID: `d0f9998f-73ee-4c64-a259-0f09a65d9856`

Config files:
- `/home/newwaveclaw/.cloudflared/config.yml`
- `/etc/cloudflared/config.yml`

The tunnel forwards `lanai.newfire.app` → `localhost:3001`.

To restart the tunnel:
```bash
sudo systemctl restart cloudflared
```

---

## Port Reference

| Port | Service | External? |
|------|---------|-----------|
| 3001 | lanai-server (Express + SPA) | Yes (via Cloudflare) |
| 3000 | Twenty CRM | No (internal only) |
| 3002 | Twenty CRM (alternate) | No (internal only) |
| 5555 | Whale AI (WhatsApp) | No (internal only) |
| 5556 | Proposals AI | No (internal only) |
| 5557 | Intelligence AI | No (internal only) |
| 5558 | Briefing AI | No (internal only) |
| 5560 | Chatwoot AI Bridge | No (internal only) |

---

## Environment Variable Checklist

### Critical (must be set for the app to work)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@host:5432/db` |
| `OAUTH_SERVER_URL` | Keycloak URL | `http://keycloak:8080` |
| `VITE_APP_ID` | OAuth client ID | `lanai-portal` |
| `JWT_SECRET` | Session signing key | (random 64-char string) |
| `BUILT_IN_FORGE_API_URL` | Dapr / AI service URL | `http://dapr:3500` |
| `BUILT_IN_FORGE_API_KEY` | AI API key | (your key) |
| `TWENTY_CRM_URL` | Twenty CRM URL | `http://twenty:3000` |
| `TWENTY_CRM_API_TOKEN` | CRM API token | (your token) |

### Required for specific features

| Variable | Feature |
|----------|---------|
| `CHATWOOT_URL` + `CHATWOOT_ACCESS_TOKEN` | Chatwoot inbox |
| `RESEND_API_KEY` | Invitation emails |
| `STRIPE_SECRET_KEY` | Payment subscriptions |
| `REDIS_URL` | Caching/sessions |
| `OPENSEARCH_URL` | Search functionality |

---

## Troubleshooting

### "Cannot connect to database"
```bash
sudo docker exec -it lanai-server sh -c "echo $DATABASE_URL"
# Verify the connection string is correct and farmer-postgres is reachable
```

### "OAuth callback fails"
- Check Keycloak is running: `sudo docker ps | grep keycloak`
- Verify `OAUTH_SERVER_URL` points to the correct Keycloak host
- Check Keycloak realm and client configuration matches `VITE_APP_ID`

### "CRM returns 502"
```bash
# Check Twenty CRM is running
sudo docker ps | grep twenty
# Check the CRM proxy is configured
curl -s http://localhost:3001/crm/api/health
```

### "Chatwoot inbox is empty / errors"
```bash
# Verify Chatwoot is running
sudo docker ps | grep chatwoot
# Test the AI bridge
curl -s http://localhost:5560/health
# Check Chatwoot access token is valid
```

### Server not responding on port 3001
```bash
# Check if container is running
sudo docker ps | grep lanai-server

# Check container logs
sudo docker logs lanai-server --tail 50

# Check if port is bound
sudo docker port lanai-server
```

### tRPC API returns HTML instead of JSON
**This was the bug fixed in this deployment.** The old `server/index.ts` only served static files. The new version wires up all API routes including tRPC (`/api/trpc/*`), OAuth (`/api/oauth/*`), Stripe webhook (`/api/stripe/webhook`), CRM proxy (`/crm`), and Chatwoot proxy (`/api/chatwoot`).

---

## What Changed in This Deployment Fix

1. **`server/index.ts`** — Replaced broken static-file-only server with the full Express server that wires up:
   - tRPC API at `/api/trpc/*`
   - OAuth callback at `/api/oauth/*`
   - Stripe webhook at `/api/stripe/webhook`
   - CRM proxy at `/crm`
   - Chatwoot proxy at `/api/chatwoot`
   - Storage proxy at `/manus-storage/*`

2. **`lanai-portal/Dockerfile`** — New multi-stage Docker build (build + runtime)

3. **`lanai-portal/.env.example`** — Complete environment variable reference

4. **`DEPLOYMENT.md`** — This comprehensive deployment guide
