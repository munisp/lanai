/**
 * Lanai Portal — Production Server Entry Point
 *
 * This file replaces the old static-file-only server. It wires up ALL API
 * routes: tRPC, OAuth callback, Stripe webhook, CRM proxy, Chatwoot proxy,
 * and static asset serving for the SPA frontend.
 */
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import path from "path";
import { fileURLToPath } from "url";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { registerCrmProxy } from "./_core/crmProxy";
import { registerChatwootProxy } from "./_core/chatwootProxy";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerStripeWebhook } from "./stripeRouter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Port availability helper ────────────────────────────────────────────────

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port from ${startPort}`);
}

// ─── Static file serving helper ─────────────────────────────────────────────

function serveStatic(app: express.Express): void {
  const staticPath = path.resolve(__dirname, "public");
  app.use(express.static(staticPath));

  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

// ─── Main server ────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const server = createServer(app);

  // 1. Stripe webhook — MUST be registered with raw body BEFORE express.json()
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
  registerStripeWebhook(app);

  // 2. Body parser (increased limit for file uploads)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // 3. Register middleware & proxy routes
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerCrmProxy(app);
  registerChatwootProxy(app);

  // 4. tRPC API endpoint
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // 5. Serve static frontend (production)
  serveStatic(app);

  // 6. Start listening
  const preferredPort = parseInt(process.env.PORT || "3001", 10);
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.warn(`Port ${preferredPort} in use, using ${port}`);
  }

  server.listen(port, () => {
    console.log(`✅ Lanai server running on http://localhost:${port}/`);
    console.log(`   tRPC  → http://localhost:${port}/api/trpc`);
    console.log(`   Stripe webhook → http://localhost:${port}/api/stripe/webhook`);
    console.log(`   CRM proxy → http://localhost:${port}/crm`);
    console.log(`   Chatwoot proxy → http://localhost:${port}/chatwoot`);
  });
}

startServer().catch(console.error);
