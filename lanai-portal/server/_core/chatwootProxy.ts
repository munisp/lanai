/**
 * Chatwoot API Proxy
 *
 * Proxies requests from the frontend to Chatwoot API, injecting the
 * access token server-side. This prevents exposing API credentials
 * in the browser.
 *
 * Security:
 *  - All routes require an authenticated advisor or member session.
 *  - Only an explicit allowlist of Chatwoot endpoints may be accessed.
 *  - Dangerous admin endpoints (agents, teams, account settings) are blocked.
 */
import express from "express";
import { requireAdvisorAuth } from "./authMiddleware";

/** Allowlisted Chatwoot endpoint prefixes that the portal may access. */
const ALLOWED_ENDPOINTS = [
  "conversations",
  "contacts",
  "reports",
  "inboxes",
];

/** Blocked endpoint substrings — even if they match an allowed prefix. */
const BLOCKED_PATTERNS = [
  "/agents",
  "/teams",
  "/account",
  "/integrations",
  "/webhooks",
  "/billing",
  "/notifications/unsubscribe",
];

function isAllowed(endpoint: string): boolean {
  const lower = endpoint.toLowerCase();
  // Check blocklist first
  if (BLOCKED_PATTERNS.some((p) => lower.includes(p))) return false;
  // Must start with an allowed prefix
  return ALLOWED_ENDPOINTS.some((prefix) => lower.startsWith(prefix));
}

export function registerChatwootProxy(app: express.Express) {
  const CHATWOOT_URL = process.env.CHATWOOT_URL || "http://localhost:3000";
  const CHATWOOT_TOKEN = process.env.CHATWOOT_ACCESS_TOKEN || process.env.CHATWOOT_TOKEN || "";
  const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || "1";

  if (!CHATWOOT_TOKEN) {
    app.use("/api/chatwoot", (_req, res) => {
      res.status(503).json({ error: "Chatwoot not configured" });
    });
    return;
  }

  // Parse JSON bodies for this route group
  app.use("/api/chatwoot", express.json({ limit: "10mb" }));

  // ── Auth guard: only authenticated advisors may access Chatwoot ──────────
  app.use("/api/chatwoot", requireAdvisorAuth);

  app.all("/api/chatwoot/*", async (req, res) => {
    try {
      // Extract the endpoint path after /api/chatwoot/
      const endpoint = req.path.replace(/^\//, "");

      // Enforce allowlist
      if (!isAllowed(endpoint)) {
        res.status(403).json({ error: "Forbidden: endpoint not permitted" });
        return;
      }

      const url = `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/${endpoint}`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Lanai-Portal/1.0",
        "api_access_token": CHATWOOT_TOKEN,
      };

      let response: { status: number; data: unknown };

      if (req.method === "GET") {
        const qs = new URLSearchParams(req.query as Record<string, string>).toString();
        const fullUrl = qs ? `${url}?${qs}` : url;
        const resp = await fetch(fullUrl, { method: "GET", headers });
        response = { status: resp.status, data: await resp.json().catch(() => ({})) };
      } else if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        const resp = await fetch(url, {
          method: req.method,
          headers,
          body: req.method !== "DELETE" ? JSON.stringify(req.body) : undefined,
        });
        response = { status: resp.status, data: await resp.json().catch(() => ({})) };
      } else {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      res.status(response.status).json(response.data);
    } catch {
      res.status(502).json({ error: "Chatwoot proxy error" });
    }
  });
}
