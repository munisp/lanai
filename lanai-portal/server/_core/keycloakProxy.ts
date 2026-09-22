import type { Express } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

/**
 * Proxy Keycloak through the existing portal tunnel at the `/auth` path so the
 * identity provider is reachable by external clients without a separate DNS
 * record. Keycloak runs with `KC_HTTP_RELATIVE_PATH=/auth`, so requests to
 * `/auth/*` map directly to `http://localhost:8080/auth/*` (no path rewrite).
 *
 * We forward the original Host as X-Forwarded-Host so Keycloak generates
 * cookies and redirects for the public-facing URL (lanai.newfire.app).
 */
export function registerKeycloakProxy(app: Express, target: string) {
  app.use(
    "/auth",
    (req, _res, next) => {
      // Inject forwarded headers before the proxy sees the request
      req.headers["x-forwarded-proto"] = "https";
      req.headers["x-forwarded-port"] = "443";
      req.headers["x-forwarded-host"] = req.headers["host"] ?? "lanai.newfire.app";
      req.headers["x-forwarded-for"] = req.ip ?? req.socket.remoteAddress ?? "127.0.0.1";
      next();
    },
    createProxyMiddleware({
      target,
      changeOrigin: false,
      secure: false,
      ws: false,
      xfwd: false,
      proxyTimeout: 30000,
    })
  );
}
