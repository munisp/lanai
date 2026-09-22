/**
 * AI Pillar Proxy
 *
 * Forwards advisor-portal requests to the local Lanai AI microservices so the
 * UI can call them same-origin (cookies/CSRF-friendly) without CORS issues:
 *   /api/proposals/*    → http://localhost:5556/api/*
 *   /api/intelligence/* → http://localhost:5557/api/*
 *   /api/briefing/*     → http://localhost:5558/api/*
 *
 * The WhatsApp and Chatwoot bridges are reached via their own integrations and
 * are not proxied here.
 */
import type { Express, Request, Response } from "express";
import { requireAnyAuth } from "./authMiddleware";

const PILLARS: Record<string, string> = {
  proposals: process.env.AI_PROPOSALS_URL ?? "http://localhost:5556",
  intelligence: process.env.AI_INTELLIGENCE_URL ?? "http://localhost:5557",
  briefing: process.env.AI_BRIEFING_URL ?? "http://localhost:5558",
};

function proxyPillar(prefix: string, targetBase: string, app: Express) {
  app.use(`/api/${prefix}`, requireAnyAuth, async (req: Request, res: Response) => {
    // /api/proposals/generate-proposal -> {targetBase}/api/generate-proposal
    const upstreamPath = req.path.replace(/^\/?/, "/api/");
    const target = `${targetBase}${upstreamPath}`;
    try {
      const controller = new AbortController();
      req.on("close", () => controller.abort());
      const upstream = await fetch(target, {
        method: req.method,
        headers: { "Content-Type": req.headers["content-type"] ?? "application/json" },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
        signal: controller.signal,
      });
      const contentType = upstream.headers.get("content-type") ?? "application/json";
      res.status(upstream.status);
      res.setHeader("content-type", contentType);
      if (contentType.includes("application/json")) {
        const data = await upstream.json();
        res.json(data);
      } else {
        const text = await upstream.text();
        res.send(text);
      }
    } catch (err) {
      res.status(502).json({ error: `AI pillar "${prefix}" unreachable`, detail: String(err) });
    }
  });
}

export function registerAiProxy(app: Express) {
  for (const [prefix, base] of Object.entries(PILLARS)) {
    proxyPillar(prefix, base, app);
  }
}
