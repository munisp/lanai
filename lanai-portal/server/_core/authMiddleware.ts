/**
 * Express authentication middleware for proxy routes.
 *
 * These guards protect raw Express routes (Chatwoot proxy, CRM proxy, storage
 * proxy) that sit outside the tRPC layer and therefore bypass the tRPC
 * procedure-level auth middleware.
 */
import type { Request, Response, NextFunction } from "express";
import { sdk, type AuthenticatedUser } from "./sdk";
import { getMemberSessionByToken, getMemberById } from "../db";
import type { Member } from "../../drizzle/schema";

const MEMBER_COOKIE = "lanai_member_session";

/**
 * Request with the resolved principal attached. `requireAnyAuth` populates
 * exactly one of `member` or `user` so downstream proxy handlers (storage,
 * Chatwoot, CRM) can enforce object ownership without re-deriving the session.
 */
export type AuthedRequest = Request & {
  member?: Member;
  user?: AuthenticatedUser;
};

/**
 * Require an authenticated advisor (Keycloak OAuth session).
 * Returns 401 if the caller is not a signed-in advisor.
 */
export async function requireAdvisorAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await sdk.authenticateRequest(req);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized: advisor session required" });
  }
}

/**
 * Require an authenticated advisor OR member.
 * Returns 401 if the caller has no valid session of either type.
 */
export async function requireAnyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // 1. Try advisor OAuth. authenticateRequest returns the resolved advisor
  // and throws if the caller is not a valid advisor. On success we attach it
  // to req so downstream proxy handlers can enforce ownership.
  try {
    (req as AuthedRequest).user = await sdk.authenticateRequest(req);
    return next();
  } catch {
    // not an advisor: try member session
  }

  // 2. Try member session cookie. Attach the resolved member to req so the
  // storage proxy can verify object ownership for downloads.
  try {
    const cookieHeader = req.headers.cookie ?? "";
    const match = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${MEMBER_COOKIE}=`));

    if (match) {
      const token = match.slice(MEMBER_COOKIE.length + 1);
      const session = await getMemberSessionByToken(token);
      if (session) {
        const m = await getMemberById(session.memberId);
        if (m && m.active) {
          (req as AuthedRequest).member = m;
          return next();
        }
      }
    }
  } catch {
    // fall through
  }

  res.status(401).json({ error: "Unauthorized: valid session required" });
}
