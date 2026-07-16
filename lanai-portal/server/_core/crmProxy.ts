/**
 * CRM Proxy — forwards /crm/* requests to the Twenty CRM server.
 *
 * Security:
 *  - All routes require an authenticated advisor session.
 *  - The server-side CRM API token is injected and never exposed to the client.
 *
 * Because Express body-parser runs before this middleware and consumes the
 * request stream, we cannot pipe req directly. Instead we re-serialize
 * req.body (already parsed JSON) and write it to the upstream request.
 */
import type { Express, Request, Response } from "express";
import http from "http";
import https from "https";
import { URL } from "url";
import { requireAdvisorAuth } from "./authMiddleware";

export function registerCrmProxy(app: Express): void {
  const crmUrl = process.env.TWENTY_CRM_URL ?? "http://localhost:3002";
  const crmToken = process.env.TWENTY_CRM_API_TOKEN ?? "";

  if (!crmToken) {
    console.warn("[CRM Proxy] TWENTY_CRM_API_TOKEN not set — CRM proxy disabled.");
    app.use("/crm", (_req: Request, res: Response) => {
      res.status(503).json({ error: "CRM not configured" });
    });
    return;
  }

  // ── Auth guard: only authenticated advisors may access the CRM ───────────
  app.use("/crm", requireAdvisorAuth);

  app.use(
    "/crm",
    (req: Request, res: Response, next: () => void) => {
      const targetPath = req.url || "/";
      const targetUrl = new URL(targetPath, crmUrl);

      // Build the body to forward
      let bodyBuffer: Buffer | null = null;
      if (req.body !== undefined && req.body !== null) {
        try {
          bodyBuffer = Buffer.from(JSON.stringify(req.body), "utf-8");
        } catch {
          bodyBuffer = null;
        }
      }

      const headers: Record<string, string | string[]> = {
        "content-type": "application/json",
        authorization: `Bearer ${crmToken}`,
        accept: (req.headers.accept as string) || "*/*",
      };

      if (bodyBuffer) {
        headers["content-length"] = String(bodyBuffer.length);
      }

      const options: http.RequestOptions = {
        hostname: targetUrl.hostname,
        port: targetUrl.port
          ? parseInt(targetUrl.port, 10)
          : targetUrl.protocol === "https:"
            ? 443
            : 80,
        path: targetUrl.pathname + (targetUrl.search || ""),
        method: req.method,
        headers,
      };

      const transport = targetUrl.protocol === "https:" ? https : http;

      const proxyReq = transport.request(options, (proxyRes) => {
        const responseHeaders: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value !== undefined) {
            responseHeaders[key] = value as string | string[];
          }
        }
        res.writeHead(proxyRes.statusCode ?? 200, responseHeaders);
        proxyRes.pipe(res, { end: true });
      });

      proxyReq.on("error", (err) => {
        console.error("[CRM Proxy] Error:", err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: "CRM proxy error", detail: err.message });
        }
      });

      if (bodyBuffer) {
        proxyReq.write(bodyBuffer);
      }
      proxyReq.end();

      void next; // suppress unused warning — we handle the response ourselves
    }
  );

  console.log(`[CRM Proxy] Registered — forwarding /crm/* → ${crmUrl}`);
}
