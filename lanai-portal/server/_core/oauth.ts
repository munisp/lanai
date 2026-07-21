import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { Redis } from "./infrastructure";

const OIDC_STATE_COOKIE = "lanai_oidc_state";
const OIDC_TRANSACTION_PREFIX = "lanai:oidc-transaction:";
const OIDC_TRANSACTION_TTL_SECONDS = 10 * 60;
const ADVISOR_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function queryString(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/login", async (req: Request, res: Response) => {
    try {
      const returnTo = safeReturnTo(queryString(req, "returnTo"));
      const transaction = sdk.createAuthorizationRequest(returnTo);
      await Redis.set(
        `${OIDC_TRANSACTION_PREFIX}${transaction.state}`,
        JSON.stringify({ returnTo, codeVerifier: transaction.codeVerifier }),
        OIDC_TRANSACTION_TTL_SECONDS,
      );
      res.cookie(OIDC_STATE_COOKIE, transaction.state, {
        ...getSessionCookieOptions(req),
        maxAge: OIDC_TRANSACTION_TTL_SECONDS * 1000,
        sameSite: "lax",
      });
      res.redirect(302, transaction.url);
    } catch (error) {
      console.error("[OAuth] Login start failed", error);
      res.status(503).json({ error: "Identity service is unavailable" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = queryString(req, "code");
    const state = queryString(req, "state");
    const stateCookie = req.cookies?.[OIDC_STATE_COOKIE] as string | undefined;
    if (!code || !state || !stateCookie || state !== stateCookie) {
      res.status(400).json({ error: "Invalid OIDC callback state" });
      return;
    }

    try {
      const rawTransaction = await Redis.get(
        `${OIDC_TRANSACTION_PREFIX}${state}`,
      );
      await Redis.del(`${OIDC_TRANSACTION_PREFIX}${state}`);
      res.clearCookie(OIDC_STATE_COOKIE, getSessionCookieOptions(req));
      if (!rawTransaction) {
        res.status(400).json({ error: "OIDC login transaction expired" });
        return;
      }
      const transaction = JSON.parse(rawTransaction) as {
        returnTo: string;
        codeVerifier: string;
      };
      const token = await sdk.exchangeCodeForToken(
        code,
        transaction.codeVerifier,
      );
      const principal = await sdk.getUserInfo(token.access_token);
      const sessionToken = await sdk.createAdvisorSession(token, principal);
      await db.upsertUser({
        openId: principal.subject,
        email: principal.email,
        name: principal.name,
        loginMethod: "keycloak",
        role: principal.roles.includes("admin")
          ? "admin"
          : principal.roles.includes("senior-advisor")
            ? "senior_advisor"
            : "advisor",
        lastSignedIn: new Date(),
      });
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ADVISOR_SESSION_MAX_AGE_MS,
      });
      res.redirect(302, safeReturnTo(transaction.returnTo));
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(401).json({ error: "Keycloak authentication failed" });
    }
  });
}
