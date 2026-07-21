import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { ForbiddenError } from "@shared/_core/errors";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import {
  Keycloak,
  Permify,
  Redis,
  type KeycloakPrincipal,
} from "./infrastructure";

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_PREFIX = "lanai:advisor-session:";

export type KeycloakTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
  token_type: string;
};

type AdvisorSession = {
  subject: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  principal: KeycloakPrincipal;
};

type SessionCookie = {
  sessionId: string;
  subject: string;
};

export type AuthenticatedUser = User & {
  keycloakSubject?: string;
  keycloakRoles?: string[];
};

function toBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function sessionSecret(): Uint8Array {
  if (!ENV.cookieSecret)
    throw new Error("JWT_SECRET is required for advisor session signing");
  return new TextEncoder().encode(ENV.cookieSecret);
}

function deriveAdvisorRole(
  principal: KeycloakPrincipal,
): "advisor" | "senior_advisor" | "admin" | null {
  const roles = new Set(principal.roles);
  if (roles.has("admin")) return "admin";
  if (roles.has("senior-advisor") || roles.has("senior_advisor"))
    return "senior_advisor";
  if (roles.has("advisor")) return "advisor";
  return null;
}

function parseCookies(req: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const segment of (req.headers.cookie ?? "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const encodedValue = segment.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies.set(name, decodeURIComponent(encodedValue));
    } catch {
      cookies.set(name, encodedValue);
    }
  }
  return cookies;
}

class KeycloakSdk {
  createAuthorizationRequest(returnTo: string): {
    url: string;
    state: string;
    codeVerifier: string;
  } {
    const issuer = ENV.keycloakIssuerUrl;
    const clientId = ENV.keycloakClientId;
    const redirectUri = ENV.keycloakRedirectUri;
    if (!issuer || !clientId || !redirectUri)
      throw new Error("Keycloak OIDC settings are incomplete");
    const state = toBase64Url(crypto.randomBytes(32));
    const codeVerifier = toBase64Url(crypto.randomBytes(48));
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    const url = new URL(
      `${issuer.replace(/\/$/, "")}/protocol/openid-connect/auth`,
    );
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile email groups");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("redirect_to", returnTo);
    return { url: url.toString(), state, codeVerifier };
  }

  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
  ): Promise<KeycloakTokenResponse> {
    const issuer = ENV.keycloakInternalIssuerUrl;
    if (
      !issuer ||
      !ENV.keycloakClientId ||
      !ENV.keycloakClientSecret ||
      !ENV.keycloakRedirectUri
    ) {
      throw new Error("Keycloak OIDC token exchange settings are incomplete");
    }
    const response = await fetch(
      `${issuer.replace(/\/$/, "")}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: ENV.keycloakRedirectUri,
          client_id: ENV.keycloakClientId,
          client_secret: ENV.keycloakClientSecret,
          code_verifier: codeVerifier,
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Keycloak authorization-code exchange failed (${response.status})`,
      );
    const token = (await response.json()) as KeycloakTokenResponse;
    if (!token.access_token || !token.expires_in)
      throw new Error("Keycloak response did not contain an access token");
    return token;
  }

  async getUserInfo(accessToken: string): Promise<KeycloakPrincipal> {
    return Keycloak.verifyToken(accessToken);
  }

  private async refreshSession(
    session: AdvisorSession,
  ): Promise<AdvisorSession> {
    if (!session.refreshToken) throw ForbiddenError("Advisor session expired");
    const response = await fetch(
      `${ENV.keycloakInternalIssuerUrl.replace(/\/$/, "")}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: session.refreshToken,
          client_id: ENV.keycloakClientId,
          client_secret: ENV.keycloakClientSecret,
        }),
      },
    );
    if (!response.ok) throw ForbiddenError("Advisor session refresh failed");
    const token = (await response.json()) as KeycloakTokenResponse;
    const principal = await Keycloak.verifyToken(token.access_token);
    return {
      subject: principal.subject,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
      principal,
    };
  }

  async createAdvisorSession(
    token: KeycloakTokenResponse,
    principal: KeycloakPrincipal,
  ): Promise<string> {
    const role = deriveAdvisorRole(principal);
    if (!role)
      throw ForbiddenError("Keycloak account is not assigned an advisor role");
    const sessionId = crypto.randomUUID();
    const session: AdvisorSession = {
      subject: principal.subject,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      principal,
    };
    await Redis.set(
      `${SESSION_PREFIX}${sessionId}`,
      JSON.stringify(session),
      SESSION_TTL_SECONDS,
    );
    return new SignJWT({ sessionId, subject: principal.subject })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(sessionSecret());
  }

  async destroyAdvisorSession(cookieValue: string | undefined): Promise<void> {
    if (!cookieValue) return;
    try {
      const { payload } = await jwtVerify(cookieValue, sessionSecret(), {
        algorithms: ["HS256"],
      });
      if (typeof payload.sessionId === "string")
        await Redis.del(`${SESSION_PREFIX}${payload.sessionId}`);
    } catch {
      // Deliberately treat an invalid or expired local cookie as already logged out.
    }
  }

  private async resolveSession(cookieValue: string): Promise<AdvisorSession> {
    let payload: SessionCookie;
    try {
      const verified = await jwtVerify(cookieValue, sessionSecret(), {
        algorithms: ["HS256"],
      });
      if (
        typeof verified.payload.sessionId !== "string" ||
        typeof verified.payload.subject !== "string"
      ) {
        throw ForbiddenError("Invalid advisor session");
      }
      payload = {
        sessionId: verified.payload.sessionId,
        subject: verified.payload.subject,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Invalid advisor session")
      )
        throw error;
      throw ForbiddenError("Invalid advisor session");
    }
    const raw = await Redis.get(`${SESSION_PREFIX}${payload.sessionId}`);
    if (!raw) throw ForbiddenError("Advisor session is not available");
    let session: AdvisorSession;
    try {
      session = JSON.parse(raw) as AdvisorSession;
    } catch {
      await Redis.del(`${SESSION_PREFIX}${payload.sessionId}`);
      throw ForbiddenError("Advisor session is invalid");
    }
    if (session.subject !== payload.subject)
      throw ForbiddenError("Advisor session subject mismatch");
    if (session.expiresAt <= Date.now() + 30_000)
      session = await this.refreshSession(session);
    await Redis.set(
      `${SESSION_PREFIX}${payload.sessionId}`,
      JSON.stringify(session),
      SESSION_TTL_SECONDS,
    );
    return session;
  }

  private async synchronizeAdvisor(
    principal: KeycloakPrincipal,
  ): Promise<AuthenticatedUser> {
    const role = deriveAdvisorRole(principal);
    if (!role)
      throw ForbiddenError("Keycloak account is not authorized as an advisor");
    await db.upsertUser({
      openId: principal.subject,
      email: principal.email,
      name: principal.name,
      loginMethod: "keycloak",
      role,
      lastSignedIn: new Date(),
    });
    const user = await db.getUserByOpenId(principal.subject);
    if (!user || !user.isActive)
      throw ForbiddenError("Advisor account is unavailable");
    const relation = role === "admin" ? "admin" : "advisor";
    await Permify.writeTuple(`user:${user.id}`, relation, "platform:lanai");
    return {
      ...user,
      keycloakSubject: principal.subject,
      keycloakRoles: principal.roles,
    };
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const authorization = req.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      const principal = await Keycloak.verifyToken(authorization.slice(7));
      return this.synchronizeAdvisor(principal);
    }
    const cookie = parseCookies(req).get(COOKIE_NAME);
    if (!cookie) throw ForbiddenError("Advisor authentication is required");
    const session = await this.resolveSession(cookie);
    return this.synchronizeAdvisor(session.principal);
  }
}

export const sdk = new KeycloakSdk();
