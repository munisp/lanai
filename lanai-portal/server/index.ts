/**
 * Lanai Portal — Production Server Entry Point
 *
 * Security hardening:
 *  - helmet (HTTP security headers)
 *  - CORS (configurable allowed origins)
 *  - express-rate-limit (global + auth-specific)
 *  - compression (gzip responses)
 *  - Strict body-size limits
 *  - Graceful shutdown on SIGTERM/SIGINT
 */
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import compression from "compression";
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
import { ENV } from "./_core/env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Port availability helper ────────────────────────────────────────────────

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => { server.close(() => resolve(true)); });
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
  app.use(express.static(staticPath, {
    maxAge: ENV.isProduction ? "1y" : 0,
    etag: true,
  }));
  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

// ─── Main server ────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── 0. Security headers (helmet) ─────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: ENV.isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://www.chatwoot.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", ENV.chatwootUrl].filter(Boolean),
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    } : false,
    crossOriginEmbedderPolicy: false, // required for some OAuth flows
  }));

  // ── 0b. Compression ───────────────────────────────────────────────────────
  app.use(compression());

  // ── 0c. CORS ──────────────────────────────────────────────────────────────
  const allowedOrigins = ENV.allowedOrigins.length > 0
    ? ENV.allowedOrigins
    : ENV.isProduction
      ? [] // must be explicitly set in production
      : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3001"];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return callback(null, true);
      if (!ENV.isProduction || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }));

  // ── 0d. Global rate limiter ───────────────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: ENV.rateLimitWindowMs,
    max: ENV.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
    skip: (req) => req.path === "/api/health",
  });

  // Stricter limiter for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: ENV.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts, please try again later." },
  });

  app.use(globalLimiter);
  app.use("/api/trpc/auth", authLimiter);
  app.use("/api/trpc/memberAuth", authLimiter);

  // ── 1. Stripe webhook — raw body BEFORE express.json() ───────────────────
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
  registerStripeWebhook(app);

  // ── 2. Body parsers ───────────────────────────────────────────────────────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // ── 3. Health check (before auth middleware) ──────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
      env: ENV.isProduction ? "production" : "development",
    });
  });

  // ── 4. Proxy routes ───────────────────────────────────────────────────────
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerCrmProxy(app);
  registerChatwootProxy(app);

  // ── 5. tRPC API endpoint ──────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path: rpcPath }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[tRPC] Internal error on ${rpcPath}:`, error);
        }
      },
    }),
  );

  // ── 6. Global error handler ───────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[server] Unhandled error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  });

  // ── 7. Serve static frontend (production) ─────────────────────────────────
  serveStatic(app);

  // ── 8. Start listening ────────────────────────────────────────────────────
  const preferredPort = ENV.port;
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.warn(`[server] Port ${preferredPort} in use, using ${port}`);
  }

  server.listen(port, () => {
    console.log(`✅ Lanai server running on http://localhost:${port}/`);
    console.log(`   tRPC         → http://localhost:${port}/api/trpc`);
    console.log(`   Health       → http://localhost:${port}/api/health`);
    console.log(`   Stripe hook  → http://localhost:${port}/api/stripe/webhook`);
    console.log(`   CRM proxy    → http://localhost:${port}/crm`);
    console.log(`   Chatwoot     → http://localhost:${port}/chatwoot`);
    console.log(`   Mode: ${ENV.isProduction ? "production" : "development"}`);
  });

  // ── 9. Graceful shutdown ──────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`[server] Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      console.log("[server] HTTP server closed.");
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => {
      console.error("[server] Forced shutdown after timeout.");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
