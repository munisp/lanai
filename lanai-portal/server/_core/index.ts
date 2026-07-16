import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerCrmProxy } from "./crmProxy";
import { registerStripeWebhook } from "../stripeRouter";
import { registerChatwootProxy } from "./chatwootProxy";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── Security headers (helmet) ─────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: ENV.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"], // Vite HMR needs unsafe-inline in dev
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'", "https:"],
              fontSrc: ["'self'", "https:", "data:"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"],
            },
          }
        : false, // Disable CSP in development to allow Vite HMR
      crossOriginEmbedderPolicy: false, // Allow embedding maps, etc.
    })
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = ENV.allowedOrigins.length > 0
    ? ENV.allowedOrigins
    : ENV.isProduction
      ? [] // No wildcard in production — must set ALLOWED_ORIGINS
      : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3001"];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin requests (no origin header)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    })
  );

  // ── Compression ───────────────────────────────────────────────────────────
  app.use(compression());

  // ── Global rate limiting ──────────────────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: ENV.rateLimitWindowMs,
    max: ENV.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
    skip: (req) => req.path === "/api/health", // don't rate-limit health checks
  });
  app.use(globalLimiter);

  // ── Tighter rate limit for auth endpoints ─────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: ENV.rateLimitWindowMs,
    max: ENV.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts, please try again later." },
  });
  app.use("/api/trpc/memberAuth", authLimiter);
  app.use("/api/trpc/auth", authLimiter);
  app.use("/oauth", authLimiter);

  // ── Health check (before auth middleware) ─────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "1.0.0",
      env: ENV.isProduction ? "production" : "development",
    });
  });

  // ── Stripe webhook MUST be registered with raw body BEFORE express.json() ─
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
  registerStripeWebhook(app);

  // ── Body parsers ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ── Proxies (all now require auth — see individual proxy files) ───────────
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerCrmProxy(app);
  registerChatwootProxy(app);

  // ── tRPC API ──────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path }) => {
        // Log internal errors server-side; tRPC already sanitises the client response
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[tRPC] Internal error on ${path}:`, error);
        }
      },
    })
  );

  // ── Global error handler ──────────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Express] Unhandled error:", err);
    res.status(500).json({
      error: ENV.isProduction ? "Internal server error" : err.message,
    });
  });

  // ── Static files / Vite ───────────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ── Port selection ────────────────────────────────────────────────────────
  const preferredPort = ENV.port;
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`🚀 Lanai Portal running on http://localhost:${port}/`);
    console.log(`   Environment: ${ENV.isProduction ? "production" : "development"}`);
    console.log(`   Health check: http://localhost:${port}/api/health`);
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log("[Server] HTTP server closed.");
      process.exit(0);
    });
    // Force exit after 10 seconds
    setTimeout(() => {
      console.error("[Server] Forced shutdown after timeout.");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
  process.exit(1);
});
