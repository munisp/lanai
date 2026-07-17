# Caddy Integration — Lanai Lifestyle Platform

## What Value Does Caddy Add?

Caddy is the **edge gateway** (Tier 1) in the Lanai two-tier gateway architecture. It is the only service that is directly exposed to the public internet. Every HTTP/HTTPS request flows through Caddy before reaching any other service.

### Core Value Propositions

| Capability | What Caddy Provides | Why It Matters for Lanai |
|---|---|---|
| **Automatic TLS** | Zero-config HTTPS via Let's Encrypt/ZeroSSL ACME. Certificates auto-renew. | Luxury brand requires HTTPS everywhere. No manual cert management. |
| **HTTP/3 (QUIC)** | Multiplexed, low-latency transport over UDP. | Faster page loads for mobile members on high-latency connections. |
| **Security Headers** | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy | Protects against XSS, clickjacking, and data leakage. |
| **Rate Limiting** | Per-IP and per-route rate limits | Prevents brute-force on `/auth/*` and API abuse. |
| **Forward Auth** | Delegates auth decisions to Keycloak via oauth2-proxy | Admin routes (`/admin/*`, `/temporal/*`, `/grafana/*`) require Keycloak SSO. |
| **Reverse Proxy** | Routes traffic to APISIX, Portal, Chatwoot, Keycloak | Single ingress point; internal services never exposed directly. |
| **Compression** | Gzip/Zstd response compression | Reduces bandwidth for JSON-heavy API responses. |
| **Access Logging** | Structured JSON logs with request IDs | Full audit trail for compliance. |

---

## Two-Tier Gateway Architecture

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  TIER 1: CADDY EDGE GATEWAY                             │
│  • Automatic TLS (Let's Encrypt)                        │
│  • HTTP/3 (QUIC)                                        │
│  • Security headers (CSP, HSTS, X-Frame-Options)        │
│  • Rate limiting (global + per-route)                   │
│  • forward_auth → oauth2-proxy → Keycloak (admin routes)│
│  • Gzip/Zstd compression                               │
│  • Structured access logging                            │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  TIER 2: APISIX API GATEWAY + OpenAppSec WAF            │
│  • ML-based WAF (OpenAppSec) — blocks OWASP Top 10      │
│  • JWT validation (Keycloak public key)                 │
│  • Per-route rate limiting                              │
│  • Permify authorization checks                         │
│  • Request/response transformation                      │
│  • Prometheus metrics                                   │
│  • Zipkin distributed tracing                           │
└──────────────┬──────────────────────────────────────────┘
               │
    ┌──────────┼──────────────┬──────────────┐
    ▼          ▼              ▼              ▼
Lanai       Chatwoot      Temporal UI    Grafana
Portal      Inbox         (admin only)   (admin only)
```

---

## How Caddy Integrates with Each Component

### 1. Caddy ↔ Keycloak (via oauth2-proxy)

Caddy uses the `forward_auth` directive to protect admin routes. Every request to `/admin/*`, `/temporal/*`, `/grafana/*`, and `/apisix/*` is first sent to `oauth2-proxy`, which validates the user's Keycloak session.

**Flow:**
```
Browser → Caddy → forward_auth → oauth2-proxy → Keycloak OIDC
                                      │
                         Valid? → Pass headers (X-Auth-User, X-Auth-Email, X-Auth-Groups)
                         Invalid? → Redirect to Keycloak login
```

**Caddyfile snippet:**
```caddyfile
forward_auth oauth2-proxy:4180 {
    uri /oauth2/auth
    copy_headers X-Auth-Request-User X-Auth-Request-Email X-Auth-Request-Groups
}
```

**oauth2-proxy** is configured to:
- Use Keycloak as the OIDC provider
- Store sessions in Redis (shared with the portal)
- Only allow users with the `lanai-admin` or `lanai-advisor` Keycloak group

---

### 2. Caddy ↔ APISIX

Caddy routes all `/api/*` requests to APISIX. APISIX then applies the ML WAF (OpenAppSec), validates JWTs, checks Permify authorization, and routes to the correct upstream service.

**Why two gateways?**
- **Caddy** handles TLS, HTTP/3, and browser-facing concerns (CORS, security headers, forward_auth for SSO)
- **APISIX** handles API-specific concerns (JWT auth, per-route rate limiting, WAF, tracing, transformations)
- This separation means the WAF and API gateway can be scaled independently

**Routing:**
```
https://lanai.example.com/api/* → Caddy → APISIX:9080 → lanai-portal:3001
https://lanai.example.com/      → Caddy → lanai-portal:3001 (direct, for HTML/assets)
```

---

### 3. Caddy ↔ OpenAppSec

OpenAppSec runs as an APISIX plugin (not a separate proxy). Caddy does not call OpenAppSec directly. The integration is:

```
Caddy → APISIX → [OpenAppSec WAF plugin] → upstream service
```

OpenAppSec inspects every request that passes through APISIX and blocks:
- SQL injection
- XSS
- Path traversal
- Malicious file uploads
- Bot traffic

The `policy.yaml` file configures which assets are protected and the enforcement mode (prevent vs. detect).

---

### 4. Caddy ↔ Chatwoot

The Chatwoot inbox is exposed at `https://inbox.lanai.example.com`. Caddy proxies to the Chatwoot container and adds:
- Automatic TLS for the `inbox.` subdomain
- Security headers
- Rate limiting on the Chatwoot API endpoints

**Caddyfile snippet:**
```caddyfile
inbox.{$LANAI_DOMAIN} {
    reverse_proxy chatwoot:3000
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    }
}
```

---

### 5. Caddy ↔ Temporal UI / Grafana / APISIX Dashboard

These admin tools are protected by Caddy's `forward_auth` directive. They are only accessible to authenticated Keycloak users with the `lanai-admin` group.

```
https://admin.lanai.example.com/temporal/* → forward_auth → temporal-ui:8080
https://admin.lanai.example.com/grafana/*  → forward_auth → grafana:3000
https://admin.lanai.example.com/apisix/*   → forward_auth → apisix-dashboard:9000
```

---

## Domain Routing Summary

| Domain | Routes To | Auth |
|---|---|---|
| `lanai.example.com` | lanai-portal:3001 | Session (portal handles its own auth) |
| `lanai.example.com/api/*` | APISIX:9080 | JWT (Keycloak) via APISIX |
| `auth.lanai.example.com` | keycloak:8080 | None (Keycloak handles it) |
| `inbox.lanai.example.com` | chatwoot:3000 | Chatwoot session |
| `admin.lanai.example.com` | lanai-portal:3001 (admin UI) | Keycloak SSO (forward_auth) |
| `admin.lanai.example.com/temporal/*` | temporal-ui:8080 | Keycloak SSO (forward_auth) |
| `admin.lanai.example.com/grafana/*` | grafana:3000 | Keycloak SSO (forward_auth) |
| `admin.lanai.example.com/apisix/*` | apisix-dashboard:9000 | Keycloak SSO (forward_auth) |
| `member.lanai.example.com` | lanai-portal:3001 (member portal) | Session (portal handles its own auth) |

---

## Environment Variables Required

```bash
# Domain
LANAI_DOMAIN=lanai.example.com
CADDY_ACME_EMAIL=admin@lanai.example.com

# Keycloak OIDC (for oauth2-proxy)
KEYCLOAK_CLIENT_ID=lanai-portal
KEYCLOAK_CLIENT_SECRET=<from Keycloak admin console>

# oauth2-proxy
OAUTH2_PROXY_CLIENT_SECRET=<same as KEYCLOAK_CLIENT_SECRET>
OAUTH2_PROXY_COOKIE_SECRET=<32+ random bytes, base64 encoded>
```

---

## Production Deployment Notes

1. **DNS**: Create A records for `lanai.example.com`, `auth.lanai.example.com`, `inbox.lanai.example.com`, `admin.lanai.example.com`, `member.lanai.example.com` all pointing to the server's public IP.

2. **Ports**: Only ports 80 and 443 need to be open on the firewall. Caddy handles everything else internally.

3. **TLS**: Caddy automatically obtains and renews certificates from Let's Encrypt. The `caddy_data` volume persists certificates across container restarts.

4. **HTTP/3**: Port 443/UDP must be open for HTTP/3 (QUIC) to work. This is optional but recommended for performance.

5. **Scaling**: In a multi-node deployment, use `caddy_data` on shared storage (NFS/S3) so all Caddy instances share the same TLS certificates.
