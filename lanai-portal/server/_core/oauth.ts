import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // ── Dev login (bypass real OAuth while testing the full stack) ───────────────
  // Only active when DEV_LOGIN=true. Creates an admin advisor session so the
  // dashboard can be explored without a live identity provider.
  if (ENV.devLogin) {
    app.get("/api/oauth/dev-login", async (_req: Request, res: Response) => {
      const openId = "dev-admin@lanai.local";
      await db.upsertUser({
        openId,
        name: "Dev Admin",
        email: "dev-admin@lanai.local",
        loginMethod: "dev",
        role: "admin",
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name: "Dev Admin",
      });
      const cookieOptions = getSessionCookieOptions(_req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/");
    });
  }

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      let userInfo;
      if (sdk.isKeycloak()) {
        // Keycloak OIDC: exchange code against the configured realm. The
        // state param is an opaque CSRF token; use the registered callback URL.
        const redirectUri = `${req.protocol}://${req.get("host")}/api/oauth/callback`;
        const { accessToken } = await sdk.exchangeKeycloakCode(code, redirectUri);
        userInfo = await sdk.getKeycloakUserInfo(accessToken);
      } else {
        const tokenResponse = await sdk.exchangeCodeForToken(code, state);
        userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      }

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? `${userInfo.openId}@placeholder.lanai`,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
