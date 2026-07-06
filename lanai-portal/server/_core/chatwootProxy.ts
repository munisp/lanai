import express from "express";

/**
 * Chatwoot API Proxy
 * 
 * Proxies requests from the frontend to Chatwoot API, injecting the
 * access token server-side. This prevents exposing API credentials
 * in the browser.
 */

export function registerChatwootProxy(app: express.Express) {
  const CHATWOOT_URL = process.env.CHATWOOT_URL || "http://localhost:3000";
  const CHATWOOT_TOKEN = process.env.CHATWOOT_ACCESS_TOKEN || "";
  const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || "1";
  
  if (!CHATWOOT_TOKEN) {
    console.warn("[Chatwoot] Chatwoot access token not configured. Proxy will not work.");
    return;
  }
  
  // Proxy all /api/chatwoot/* requests to Chatwoot API
  app.use("/api/chatwoot", express.json({ limit: "10mb" }));
  
  app.all("/api/chatwoot/*", async (req, res) => {
    try {
      // Extract the endpoint path after /api/chatwoot/
      const endpoint = req.path.replace(/^\/chatwoot\/?/, "");
      const url = `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/${endpoint}`;
      
      const headers = {
        "Content-Type": "application/json",
        "User-Agent": "Lanai-Portal/1.0",
        "Authorization": `Bearer ${CHATWOOT_TOKEN}`,
      };
      
      let response: { status: number; data: unknown };
      
      if (req.method === "GET") {
        const qs = new URLSearchParams(req.query as any).toString();
        const fullUrl = qs ? `${url}?${qs}` : url;
        const resp = await fetch(fullUrl, { method: "GET", headers });
        response = {
          status: resp.status,
          data: await resp.json(),
        };
      } else if (req.method === "POST") {
        const resp = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(req.body),
        });
        response = {
          status: resp.status,
          data: await resp.json(),
        };
      } else if (req.method === "PUT" || req.method === "PATCH") {
        const resp = await fetch(url, {
          method: req.method,
          headers,
          body: JSON.stringify(req.body),
        });
        response = {
          status: resp.status,
          data: await resp.json(),
        };
      } else if (req.method === "DELETE") {
        const resp = await fetch(url, { method: "DELETE", headers });
        response = {
          status: resp.status,
          data: await resp.json(),
        };
      } else {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }
      
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("[Chatwoot Proxy] Error:", error.message);
      res.status(502).json({
        error: "Chatwoot proxy error",
        details: error.message,
      });
    }
  });
}
